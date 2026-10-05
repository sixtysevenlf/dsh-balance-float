/**
 * 余额悬浮窗（精简版：仅余额显示）—— host 半
 * 提供七个同源路由：
 *   GET /api/commandcode-goat/balance — Command Code GOAT 官方额度（https://api.commandcode.ai/alpha/billing/credits），60s 缓存
 *   GET /api/deepseek/balance         — DeepSeek 官方余额（https://api.deepseek.com/user/balance），5s 缓存
 *   GET /api/opencode-go/balance      — OpenCode Go 额度（https://opencode.ai/zen/go/v1/usage：滚动/每周/每月三窗口），60s 缓存
 *   GET /api/hypercharm/balance       — Charm Hyper 余额（https://hyper.charm.land/v1/credits，单位 hypercredits），30s 缓存
 *   GET /api/stepfun/balance          — 阶跃星辰 StepFun：Step Plan 订阅额度（控制台 RPC）+ 按量账户余额
 *                                       （https://api.stepfun.com/v1/accounts），30s 缓存
 *   GET /api/bailian/plan             — 阿里云百炼 Token Plan 个人版：5 小时 / 每周窗口比例 + 月度 Credits
 *                                       （控制台网关 /data/api.json，action=BroadScopeAspnGateway），60s 缓存
 *   GET /api/deepseek/usage           — DeepSeek **官网用量页**（platform.deepseek.com 同源接口）：
 *                                       当月 token（命中/未命中/输出）/ 金额 / 请求数 / 日均，
 *                                       需控制台 userToken（DEEPSEEK_PLATFORM_TOKEN），60s 缓存
 *
 * key 来源：
 *   Command Code GOAT：DSH 凭据 COMMAND_CODE_API_KEY → 环境变量 COMMAND_CODE_API_KEY
 *                      → 尽力而为：~/.commandcode/auth.json（Command Code CLI 登录凭据）
 *   DeepSeek          ：DSH 凭据 DEEPSEEK_API_KEY
 *   OpenCode Go       ：DSH 凭据 OPENCODE_GO_API_KEY → OPENCODE_API_KEY → 同名环境变量
 *                      → 尽力而为：opencode 登录凭据 auth.json（provider opencode-go；WSL 下会自动
 *                        探测 Windows 用户目录 /mnt/c/Users/<用户>/.local/share/opencode/auth.json）
 *   Charm Hyper       ：DSH 凭据 HYPER_API_KEY → 环境变量 HYPER_API_KEY（兼容 HYPERCHARM_API_KEY）
 *   阶跃星辰 StepFun  ：DSH 凭据 STEPFUN_API_KEY → 环境变量 STEPFUN_API_KEY（兼容 STEP_API_KEY）—— 按量账户余额
 *                       Step Plan 订阅额度另需控制台会话：STEPFUN_CONSOLE_COOKIE（控制台 Cookie 头，可自动续期）
 *                       或 STEPFUN_CONSOLE_TOKEN（控制台 oasis-token，约 30 分钟）
 *   阿里云百炼 Token Plan：DSH 凭据 BAILIAN_CONSOLE_COOKIE（控制台 Cookie 头 / 整段 cURL，可含 sec_token）
 *                       兼容 BAILIAN_CONSOLE_COOKIES / BAILIAN_CONSOLE_CURL + 同名环境变量
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { zstdDecompressSync } from 'node:zlib'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
export const name = 'dsh-opencode-go-monitor'

export const inject = ['credentials', 'webServer']

// ---------- Command Code GOAT ----------
// 官方余额接口（Bearer API key，key 在 https://commandcode.ai/settings 创建，user_ 开头）：
//   GET /alpha/whoami             → 可选，取 team orgId（个人账户可省略）
//   GET /alpha/billing/credits    → { data: { credits: { monthlyCredits, purchasedCredits, freeCredits },
//                                            windowLimits: { fiveHour: {cap,used,resetAt}, weekly: {...} } } }
const COMMAND_CODE_BASE_URL = 'https://api.commandcode.ai'
const COMMAND_CODE_WHOAMI_URL = `${COMMAND_CODE_BASE_URL}/alpha/whoami`
const COMMAND_CODE_CREDITS_URL = `${COMMAND_CODE_BASE_URL}/alpha/billing/credits`
const BALANCE_CACHE_MS = 60000

async function resolveCommandCodeKey(ctx) {
  // 兼容两种命名：DSH 凭据 COMMANDCODE_API_KEY（现有凭据名）→ COMMAND_CODE_API_KEY → 环境变量
  for (const name of ['COMMANDCODE_API_KEY', 'COMMAND_CODE_API_KEY']) {
    try {
      const cred = await ctx.credentials.resolve(name)
      if (cred && cred.value) return cred.value
    } catch { /* fallthrough */ }
  }
  if (process.env.COMMAND_CODE_API_KEY) return process.env.COMMAND_CODE_API_KEY
  // 尽力而为：Command Code CLI 登录凭据 ~/.commandcode/auth.json（只读 token，不落盘不外发）
  try {
    const home = process.env.HOME || process.env.USERPROFILE || ''
    const authPath = `${home}/.commandcode/auth.json`
    if (existsSync(authPath)) {
      const obj = JSON.parse(readFileSync(authPath, 'utf8'))
      const pick = (o) => {
        if (!o || typeof o !== 'object') return null
        for (const k of ['token', 'accessToken', 'apiKey', 'bearer']) {
          if (typeof o[k] === 'string' && o[k]) return o[k]
          const v = pick(o[k])
          if (v) return v
        }
        return null
      }
      const t = pick(obj)
      if (t && t.length > 8) return t
    }
  } catch { /* 可选项 */ }
  throw new Error('未配置 COMMAND_CODE_API_KEY 凭据（DSH 设置 → 凭据，或环境变量 COMMAND_CODE_API_KEY）')
}

async function queryCommandCodeBalance(ctx) {
  const key = await resolveCommandCodeKey(ctx)
  const headers = {
    Accept: 'application/json',
    // 要明确未压缩的响应：宿主进程里这条 fetch 拿到的压缩体（br/gzip）不会自动解压，
    // resp.json() 会直接抛 JSON 解析错误，三个额度页就一起显示「读取失败」。
    'Accept-Encoding': 'identity',
    Authorization: `Bearer ${key}`,
    'User-Agent': 'dsh-opencode-go-monitor/1.0',
  }
  // 可选：whoami 拿 team orgId（个人账户无需 orgId；失败则用无参查询）
  let orgQuery = ''
  try {
    const who = await fetch(COMMAND_CODE_WHOAMI_URL, { headers, signal: AbortSignal.timeout(8000) })
    if (who.ok) {
      const w = await who.json().catch(() => null)
      const wd = (w && w.data) || w || {}
      const orgId = (wd.org && typeof wd.org.id === 'string' && wd.org.id) ? wd.org.id : null
      if (orgId) orgQuery = `?orgId=${encodeURIComponent(orgId)}`
    }
  } catch { /* whoami 失败则不带 orgId */ }
  const resp = await fetch(`${COMMAND_CODE_CREDITS_URL}${orgQuery}`, { headers, signal: AbortSignal.timeout(12000) })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`余额接口 HTTP ${resp.status}: ${String(text).slice(0, 120)}`)
  }
  const raw = await resp.json()
  const body = (raw && raw.data) || raw || {}
  const credits = (body && body.credits) || {}
  const limits = (body && body.windowLimits) || {}
  // percent = 已用 %（client quotaRow 用 100-percent 算剩余）
  const normWindow = (w) => {
    if (!w || typeof w !== 'object') return { status: null, percent: null, resetsAt: null }
    const cap = Number(w.cap)
    const used = Number(w.used)
    if (!(cap > 0) || !Number.isFinite(used) || used < 0) {
      return { status: w.status ?? null, percent: null, resetsAt: w.resetAt || null }
    }
    return {
      status: w.status ?? null,
      percent: Math.round((used / cap) * 10000) / 100,
      resetsAt: w.resetAt || null,
    }
  }
  // 月度剩余（美元）：monthly + purchased + free 三池合计；字段存在（哪怕全 0）才算有效余额
  const monthlyRemaining = [credits.monthlyCredits, credits.purchasedCredits, credits.freeCredits]
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v))
    .reduce((s, v) => s + Math.max(0, v), 0)
  return {
    ok: true,
    fetchedAt: Date.now(),
    fiveHour: normWindow(limits.fiveHour),
    weekly: normWindow(limits.weekly),
    monthly: {
      present: !!(credits && Object.keys(credits).length),
      remaining: Number.isFinite(monthlyRemaining) ? Math.round(monthlyRemaining * 100) / 100 : null,
    },
  }
}

// ---------- DeepSeek ----------
const DS_BALANCE_URL = 'https://api.deepseek.com/user/balance'
const DS_CACHE_MS = 5000

// 官方现行价（2026-09 调价后，官网「模型 & 价格」页；¥/百万 tokens，空闲时段价，高峰 = 空闲 × 2）
//   deepseek-flash   输入 缓存命中 0.02 / 缓存未命中 1  / 输出 4
//                    （旧模型名 deepseek-v4-flash、deepseek-v4-flash-vision-exp 现由 DeepSeek-V4.1-Flash
//                      提供服务，按 Flash 价计费；2026-09 调价前为 0.05 / 1.5 / 4.5）
//   deepseek-v4-pro  输入 缓存命中 0.15 / 缓存未命中 4.5 / 输出 13.5（本次未变）
// 高峰时段：北京时间周一至周五 09:00-12:00、14:00-18:00；其余（含周末全天）为空闲时段
const DS_PRICE_OFFPEAK = {
  flash: { hit: 0.02, miss: 1, out: 4, label: 'deepseek-flash' },
  pro: { hit: 0.15, miss: 4.5, out: 13.5, label: 'deepseek-v4-pro' },
}
// 本账户实测用量结构（2026-08 官网平台月报：缓存命中 721.98M / 未命中 6.84M / 输出 4.69M）
const DS_USAGE_SAMPLE = { cacheHit: 721.98e6, cacheMiss: 6.84e6, output: 4.69e6 }
const DS_CACHE_HIT_RATE = DS_USAGE_SAMPLE.cacheHit / (DS_USAGE_SAMPLE.cacheHit + DS_USAGE_SAMPLE.cacheMiss) // 输入侧命中率
const DS_OUTPUT_SHARE = DS_USAGE_SAMPLE.output
  / (DS_USAGE_SAMPLE.cacheHit + DS_USAGE_SAMPLE.cacheMiss + DS_USAGE_SAMPLE.output) // 输出 token 占比

const dsRound4 = (n) => Math.round(n * 1e4) / 1e4

// 模型名 → 价目族：Pro 系（含旧名 deepseek-reasoner）用 Pro 价，其余（flash / v4-flash / vision-exp / chat）按 Flash 价
function dsPriceFamily(modelKey) {
  const m = String(modelKey || '').toLowerCase()
  return (m.includes('pro') || m.includes('reasoner')) ? 'pro' : 'flash'
}

// 北京时间星期几（0=周日…6=周六）与小时
function bjDayHour(now) {
  const d = new Date(now + 8 * 3600000)
  return { day: d.getUTCDay(), hour: d.getUTCHours() }
}

// 当前是否高峰时段（北京时间周一至周五 09-12 / 14-18；周末全天空闲）
function inPeakNow(now = Date.now()) {
  const { day, hour } = bjDayHour(now)
  if (day === 0 || day === 6) return false
  return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18)
}

// 有效单价（¥/百万 tokens）：
//   输入侧 = 命中率×命中价 + (1-命中率)×未命中价；再按输入/输出 token 占比加权；高峰时段整体 ×2
function dsEffectivePrice(modelKey, peak) {
  const family = dsPriceFamily(modelKey)
  const base = DS_PRICE_OFFPEAK[family]
  const factor = peak ? 2 : 1
  const hit = base.hit * factor
  const miss = base.miss * factor
  const out = base.out * factor
  const inputPerM = DS_CACHE_HIT_RATE * hit + (1 - DS_CACHE_HIT_RATE) * miss
  const perM = (1 - DS_OUTPUT_SHARE) * inputPerM + DS_OUTPUT_SHARE * out
  return { family, label: base.label, peak, hit, miss, out, inputPerM, perM }
}

async function queryDeepseekBalance(ctx) {
  const cred = await ctx.credentials.resolve('DEEPSEEK_API_KEY')
  if (!cred || !cred.value) throw new Error('未配置 DEEPSEEK_API_KEY 凭据')
  const resp = await fetch(DS_BALANCE_URL, {
    headers: { Authorization: `Bearer ${cred.value}` },
    signal: AbortSignal.timeout(15000),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`余额接口 HTTP ${resp.status}: ${String(text).slice(0, 120)}`)
  }
  const data = await resp.json()
  const info = (data.balance_infos || [])[0] || {}
  const balance = Number.parseFloat(info.total_balance)
  if (!Number.isFinite(balance)) throw new Error('余额响应格式异常')
  let model = null
  try {
    const sel = ctx.get('agentDefaultModel')?.currentSelection()
    model = (sel && sel.model) || null
  } catch { /* 模型展示为可选项 */ }
  // 单价先四舍五入到 4 位小数，再据此算 token —— 面板显示的价格、预计剩余两行永远自洽
  const est = (perM) => Math.floor(balance / (perM / 1e6))
  const peak = inPeakNow()
  const offPerM = dsRound4(dsEffectivePrice(model, false).perM)
  const peakPerM = dsRound4(dsEffectivePrice(model, true).perM)
  const cur = dsEffectivePrice(model, peak)
  const curPerM = dsRound4(cur.perM)
  return {
    ok: true,
    balance,
    currency: info.currency || 'CNY',
    isAvailable: data.is_available !== false,
    estTokens: est(curPerM),
    estTokensOffPeak: est(offPerM),
    estTokensPeak: est(peakPerM),
    pricePerMillion: curPerM,
    offPeakPerMillion: offPerM,
    peakPerMillion: peakPerM,
    pricePeriod: peak ? 'peak' : 'offpeak',
    priceFamily: cur.family,
    priceLabel: cur.label,
    // 当前时段官方单价（¥/百万 tokens），供面板悬浮说明展示
    priceTable: { hit: cur.hit, miss: cur.miss, out: cur.out },
    cacheHitRate: dsRound4(DS_CACHE_HIT_RATE),
    outputShare: dsRound4(DS_OUTPUT_SHARE),
    model,
    fetchedAt: Date.now(),
  }
}

// ---------- Charm Hyper（hyper.charm.land）----------
// 官方余额接口（Bearer API key，key 在用户环境 settings.yaml → hyper.apiKeyEnv=HYPER_API_KEY）：
//   GET /v1/credits → { balance?: number (hypercredits), balance_usd?: number (USD) }
// 观测汇率：20 hypercredits = $1（USD 记账账户只返回 balance_usd，统一乘 20 折算）
const HYPER_CREDITS_URL = 'https://hyper.charm.land/v1/credits'
const HYPER_CACHE_MS = 30000

async function resolveHyperKey(ctx) {
  for (const name of ['HYPER_API_KEY', 'HYPERCHARM_API_KEY']) {
    try {
      const cred = await ctx.credentials.resolve(name)
      if (cred && cred.value) return cred.value
    } catch { /* fallthrough */ }
  }
  if (process.env.HYPER_API_KEY) return process.env.HYPER_API_KEY
  if (process.env.HYPERCHARM_API_KEY) return process.env.HYPERCHARM_API_KEY
  throw new Error('未配置 HYPER_API_KEY 凭据（Charm Hyper；DSH 设置 → 凭据，或环境变量 HYPER_API_KEY）')
}

async function queryHypercharmBalance(ctx) {
  const key = await resolveHyperKey(ctx)
  const resp = await fetch(HYPER_CREDITS_URL, {
    headers: { Accept: 'application/json', 'Accept-Encoding': 'identity', Authorization: 'Bearer ' + key, 'User-Agent': 'dsh-opencode-go-monitor/1.0' },
    signal: AbortSignal.timeout(15000),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error('余额接口 HTTP ' + resp.status + ': ' + String(text).slice(0, 120))
  }
  const data = await resp.json()
  let balance = null
  let unit = 'hc'
  if (typeof data.balance === 'number' && Number.isFinite(data.balance)) {
    balance = data.balance
  } else if (typeof data.balance_usd === 'number' && Number.isFinite(data.balance_usd)) {
    balance = data.balance_usd * 20
    unit = 'usd'
  }
  if (balance === null) throw new Error('余额响应格式异常')
  return {
    ok: true,
    balance: Math.round(balance * 100) / 100,
    unit,
    priceUsd: (typeof data.balance_usd === 'number' && Number.isFinite(data.balance_usd))
      ? Math.round(data.balance_usd * 100) / 100 : null,
    fetchedAt: Date.now(),
  }
}

// ---------- OpenCode Go（opencode.ai/zen/go）----------
// 官方额度接口（Bearer 订阅 API key，sk- 开头；opencode 登录后写入 ~/.local/share/opencode/auth.json）：
//   GET {base}/usage → { usage: { rolling: {status, percent, resetsAt},
//                                weekly:  {status, percent, resetsAt},
//                                monthly: {status, percent, resetsAt} } }
//   percent   = 该窗口「已用」百分比（余额 = 100 - percent），与 GOAT 的 percent 同口径
//   resetsAt  = 窗口重置时刻（ISO 字符串；client 走 parseTs 兼容数字）
// 环境变量覆盖：OGM_BASE（基址）/ OGM_PROVIDER（auth.json 里的 provider 名）/ OPENCODE_AUTH（auth.json 路径）
const OG_BASE_URL = (process.env.OGM_BASE || 'https://opencode.ai/zen/go/v1').replace(/\/+$/, '')
const OG_USAGE_URL = OG_BASE_URL + '/usage'
const OG_PROVIDER = process.env.OGM_PROVIDER || 'opencode-go'
const OG_CACHE_MS = 60000

// auth.json 候选路径：显式覆盖 → Linux/XDG → WSL 下的 Windows 用户目录（opencode 常跑在 Windows 侧）
function ogAuthCandidates() {
  const out = []
  const push = (p) => { if (p && !out.includes(p)) out.push(p) }
  push(process.env.OPENCODE_AUTH)
  push(process.env.OGM_AUTH)
  const home = process.env.HOME || process.env.USERPROFILE || ''
  const dataHome = process.env.XDG_DATA_HOME || (home ? home + '/.local/share' : '')
  if (dataHome) push(dataHome + '/opencode/auth.json')
  const winUser = process.env.USER || process.env.LOGNAME || process.env.USERNAME
  if (winUser) push('/mnt/c/Users/' + winUser + '/.local/share/opencode/auth.json')
  try {
    for (const entry of readdirSync('/mnt/c/Users')) {
      if (entry === 'Public' || entry === 'Default' || entry === 'Default User' || entry === 'All Users') continue
      push('/mnt/c/Users/' + entry + '/.local/share/opencode/auth.json')
    }
  } catch { /* 非 WSL 环境没有 /mnt/c */ }
  return out
}

// 从 auth.json 里取 opencode 系 provider 的 key（provider 名含 opencode；绝不拿其它服务商的凭据去请求）
function ogKeyFromAuthFile(file) {
  let obj
  try {
    if (!existsSync(file)) return null
    obj = JSON.parse(readFileSync(file, 'utf8'))
  } catch { return null }
  if (!obj || typeof obj !== 'object') return null
  for (const n of [OG_PROVIDER, 'opencode-go', 'opencode', 'opencode-zen']) {
    const v = obj[n]
    if (v && typeof v.key === 'string' && v.key) return { key: v.key, provider: n }
  }
  for (const n of Object.keys(obj)) {
    const v = obj[n]
    if (/opencode/i.test(n) && v && typeof v.key === 'string' && v.key) return { key: v.key, provider: n }
  }
  return null
}

async function resolveOpencodeGoKey(ctx) {
  for (const name of ['OPENCODE_GO_API_KEY', 'OPENCODE_API_KEY']) {
    try {
      const cred = await ctx.credentials.resolve(name)
      if (cred && cred.value) return { key: cred.value, source: 'DSH 凭据 ' + name }
    } catch { /* fallthrough */ }
  }
  for (const name of ['OPENCODE_GO_API_KEY', 'OPENCODE_API_KEY']) {
    if (process.env[name]) return { key: process.env[name], source: '环境变量 ' + name }
  }
  const files = ogAuthCandidates()
  for (const file of files) {
    const hit = ogKeyFromAuthFile(file)
    if (hit) return { key: hit.key, source: 'auth.json（provider ' + hit.provider + '）' }
  }
  throw new Error('未配置 OpenCode Go 凭据：DSH 设置 → 凭据加 OPENCODE_GO_API_KEY，或先 opencode 登录（auth.json 候选：'
    + files.slice(0, 3).join(' / ') + '）')
}

async function queryOpencodeGoBalance(ctx) {
  const { key, source } = await resolveOpencodeGoKey(ctx)
  const resp = await fetch(OG_USAGE_URL, {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'identity',
      Authorization: 'Bearer ' + key,
      'User-Agent': 'dsh-opencode-go-monitor/1.0',
    },
    signal: AbortSignal.timeout(12000),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error('额度接口 HTTP ' + resp.status + ': ' + String(text).slice(0, 120))
  }
  const raw = await resp.json()
  const usage = (raw && raw.usage) || raw || {}
  // percent = 已用 %（client 的 quotaRow 用 100 - percent 算剩余）
  const norm = (w) => {
    if (!w || typeof w !== 'object') return { status: null, percent: null, resetsAt: null }
    const p = Number(w.percent)
    return {
      status: w.status ?? null,
      percent: Number.isFinite(p) ? Math.round(p * 100) / 100 : null,
      resetsAt: w.resetsAt || w.resetAt || null,
    }
  }
  return {
    ok: true,
    fetchedAt: Date.now(),
    rolling: norm(usage.rolling),
    weekly: norm(usage.weekly),
    monthly: norm(usage.monthly),
    source,
  }
}

// ---------- 阶跃星辰 StepFun（api.stepfun.com）----------
// 官方账户接口（Bearer API key，key 在 https://platform.stepfun.com 控制台创建）：
//   GET /v1/accounts → { object: 'account',
//                        type: 'prepaid' | 'postpaid',
//                        balance: 13.77,                 // 当前账户可用余额（元）
//                        total_cash_balance: 0.00,        // 当前账户总充值金额
//                        total_voucher_balance: 13.77 }   // 当前账户总赠送金额
// 文档：https://platform.stepfun.com/docs/zh/api-reference/accounts/get
// 计费口径：1 元 = 1,000,000 Credit（单价 × 1e6 即 Credit 消耗量），故余额单位为元（CNY）。
const STEPFUN_ACCOUNTS_URL = 'https://api.stepfun.com/v1/accounts'

async function resolveStepfunKey(ctx) {
  for (const name of ['STEPFUN_API_KEY', 'STEP_API_KEY']) {
    try {
      const cred = await ctx.credentials.resolve(name)
      if (cred && cred.value) return cred.value
    } catch { /* fallthrough */ }
  }
  for (const name of ['STEPFUN_API_KEY', 'STEP_API_KEY']) {
    if (process.env[name]) return process.env[name]
  }
  throw new Error('未配置 STEPFUN_API_KEY 凭据（DSH 设置 → 凭据，或环境变量 STEPFUN_API_KEY）')
}

// 金额一律按 4 位小数收敛后再展示（面板再按需 toFixed(2)），避免浮点尾巴
const stepfunAmount = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 1e4) / 1e4 : null)

async function queryStepfunBalance(ctx) {
  const key = await resolveStepfunKey(ctx)
  const resp = await fetch(STEPFUN_ACCOUNTS_URL, {
    headers: {
      Accept: 'application/json',
      Authorization: 'Bearer ' + key,
      'User-Agent': 'dsh-opencode-go-monitor/1.0',
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error('余额接口 HTTP ' + resp.status + ': ' + String(text).slice(0, 120))
  }
  const data = await resp.json()
  const balance = stepfunAmount(data && data.balance)
  if (balance === null) throw new Error('余额响应格式异常')
  return {
    ok: true,
    balance,
    // 官方两池金额（字段缺失时给 null，面板显示 --，不臆造 0）
    cashBalance: stepfunAmount(data.total_cash_balance),
    voucherBalance: stepfunAmount(data.total_voucher_balance),
    accountType: (typeof data.type === 'string' && data.type) ? data.type : null,
    currency: 'CNY',
    fetchedAt: Date.now(),
  }
}

// ---------- 阶跃星辰 Step Plan 订阅额度（platform.stepfun.com 控制台内部 RPC）----------
// 公开 API 没有订阅额度端点：GET /v1/accounts 只给按量账户余额（元），/step_plan/v1/* 下的
// accounts / credit / usage 全部 404，调用响应头里也没有额度字段（2026-09-20 实测）。
// 订阅的「Credit 月池」只在控制台内部 RPC 里（connect 协议 + Oasis 会话鉴权，API key 一律 403）：
//   POST /api/step.openapi.devcenter.Dashboard/GetStepPlanStatus
//        → subscription{plan_type,name,status,activated_at,expired_at,auto_renew,plan_family}
//          + plan_definition{zh_display{description},billing_cycle}
//   POST /api/step.openapi.devcenter.Dashboard/QueryStepPlanRateLimit
//        → plan_family（1=CODING 旧套餐：5 小时 / 每周窗口；2=TOKEN：Credit 月池）
//          plan_credit_rate_limit{ subscription_credit_left_rate(0..1 比例)
//                                  subscription_credit_reset_time(秒) topup_credit_left_rate
//                                  credit_buckets[{type,credit_total,credit_residual,expire_at}] }
//          five_hour_usage_left_rate / weekly_usage_left_rate（旧套餐）
//   POST /passport/proto.api.passport.v1.PassportService/RefreshToken
//        → 带会话 Cookie 换新访问令牌（accessToken.raw；同时轮换 refreshToken，写回 journal）
// 鉴权形态（2026-09-20 实测）：控制台真正发的是 Cookie 里的 Oasis-Token，值是复合 journal
//   「<访问令牌JWT>...<刷新令牌JWT>」（字面三个点，对应 passport 的 journal_b64），
//   用 API key / 拆开的单个 JWT 调用一律 401 token is illegal；整条 journal 原样发就 200。
//   面板因此**原样透传** journal（不主动续期），只有真收到 401 才走一次 RefreshToken 续期。
// 鉴权来源（DSH 设置 → 凭据）：
//   STEPFUN_CONSOLE_COOKIE —— 控制台「以 cURL 格式复制」里的 Cookie 头（含刷新令牌 → 自动续期，推荐）
//   STEPFUN_CONSOLE_TOKEN  —— 控制台请求头 oasis-token 的值（约 30 分钟，过期需重贴）
// 两个凭据都接受直接粘整段 cURL / 整段请求头（自动解析 cookie 与 oasis-token）。
const SF_PLAN_BASE = 'https://platform.stepfun.com'
const SF_PLAN_APP_ID = '10300'
const SF_PLAN_CACHE_MS = 60000
const SF_PLAN_DASHBOARD = SF_PLAN_BASE + '/api/step.openapi.devcenter.Dashboard/'
const SF_PLAN_REFRESH_URL = SF_PLAN_BASE + '/passport/proto.api.passport.v1.PassportService/RefreshToken'

const sfNum = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
// 比例字段（0..1）：收敛到 4 位小数，避免浮点尾巴
const sfRate = (v) => { const n = sfNum(v); return n === null ? null : Math.round(n * 1e4) / 1e4 }
// 控制台 RPC 的时间戳是 epoch 秒（int64，protojson 可能给字符串）→ 统一归一成毫秒交给面板
const sfEpochMs = (v) => {
  const n = sfNum(v)
  if (n === null || n <= 0) return null
  return n > 1e11 ? n : n * 1000
}

const sfJwtPayload = (token) => {
  try {
    const parts = String(token || '').split('.')
    if (parts.length < 2) return null
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(Buffer.from(b64 + '='.repeat((4 - (b64.length % 4)) % 4), 'base64').toString('utf8'))
  } catch { return null }
}

const sfJwtExpMs = (token) => {
  const p = sfJwtPayload(token)
  return (p && Number.isFinite(Number(p.exp))) ? Number(p.exp) * 1000 : 0
}

// 从任意粘贴物里解析出 cookie / oasis-token / webid：
// 支持整段 cURL（-H 'cookie: ...' / -H 'oasis-token: ...'）、裸 Cookie 头、裸 JWT
function sfParseCredential(raw) {
  const text = String(raw || '').trim()
  const out = { cookie: null, token: null, webid: null }
  if (!text) return out
  const grab = (names) => {
    for (const n of names) {
      const m = text.match(new RegExp(n + '\\s*:\\s*([^"\'\\r\\n]+)', 'i'))
      if (m && m[1]) return m[1].trim().replace(/^["']|["']$/g, '')
    }
    return null
  }
  out.cookie = grab(['cookie'])
  out.token = grab(['oasis-token'])
  out.webid = grab(['oasis-webid', 'oasis-did'])
  if (!out.cookie && /[A-Za-z0-9_.-]+=[^;\s]/.test(text) && !/(^|\s)(curl|--header|-H)\s/.test(text)) out.cookie = text
  if (!out.token && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(text)) out.token = text
  return out
}

const sfCookieMap = (cookie) => {
  const out = {}
  for (const part of String(cookie || '').split(';')) {
    const i = part.indexOf('=')
    if (i <= 0) continue
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim()
  }
  return out
}
const sfCookieString = (map) => Object.entries(map).map(([k, v]) => k + '=' + v).join('; ')

async function resolveStepfunConsoleCred(ctx) {
  const read = async (names) => {
    for (const n of names) {
      try {
        const c = await ctx.credentials.resolve(n)
        if (c && c.value) return { name: n, value: String(c.value) }
      } catch { /* fallthrough */ }
    }
    for (const n of names) if (process.env[n]) return { name: n, value: String(process.env[n]) }
    return null
  }
  const cookie = await read(['STEPFUN_CONSOLE_COOKIE', 'STEPFUN_CONSOLE_COOKIES'])
  if (cookie) return { ...cookie, kind: 'cookie' }
  const token = await read(['STEPFUN_CONSOLE_TOKEN', 'STEPFUN_OASIS_TOKEN'])
  if (token) return { ...token, kind: 'token' }
  return null
}

// 把 GetStepPlanStatus + QueryStepPlanRateLimit 归一成面板要的形状（字段缺失一律 null，不臆造 0）
function sfNormalizePlan(status, rate, fetchedAt, source) {
  const sub = (status && status.subscription) || {}
  const def = (status && status.plan_definition) || {}
  const zh = (def && def.zh_display) || {}
  const limit = (rate && rate.plan_credit_rate_limit) || {}
  const family = sfNum(rate && rate.plan_family) ?? sfNum(sub.plan_family)
  const buckets = Array.isArray(limit.credit_buckets)
    ? limit.credit_buckets.slice(0, 12).map((b) => ({
      type: sfNum(b && b.type),
      total: sfNum(b && b.credit_total),
      residual: sfNum(b && b.credit_residual),
      expireAt: sfEpochMs(b && b.expire_at),
    }))
    : []
  const name = (typeof sub.name === 'string' && sub.name) ? sub.name
    : ((typeof zh.description === 'string' && zh.description) ? zh.description : null)
  return {
    ok: true,
    source,
    family,
    // family=2 → TOKEN 家族，走 Credit 月池；其余（含未知）按旧套餐的 5 小时/每周窗口展示
    kind: family === 2 ? 'credit' : 'window',
    name,
    status: sfNum(sub.status),
    planType: sfNum(sub.plan_type),
    activatedAt: sfEpochMs(sub.activated_at),
    expiredAt: sfEpochMs(sub.expired_at),
    autoRenew: typeof sub.auto_renew === 'boolean' ? sub.auto_renew : null,
    credit: {
      leftRate: sfRate(limit.subscription_credit_left_rate),
      resetTime: sfEpochMs(limit.subscription_credit_reset_time),
      topupLeftRate: sfRate(limit.topup_credit_left_rate),
      buckets,
    },
    window: {
      fiveHourLeftRate: sfRate(rate && rate.five_hour_usage_left_rate),
      fiveHourResetTime: sfEpochMs(rate && rate.five_hour_usage_reset_time),
      weeklyLeftRate: sfRate(rate && rate.weekly_usage_left_rate),
      weeklyResetTime: sfEpochMs(rate && rate.weekly_usage_reset_time),
    },
    fetchedAt,
  }
}

// 控制台会话源：把凭据原样透传成请求头（journal / cookie），只在真 401 时续期一次
function createStepfunPlanSource(ctx) {
  let credTag = null
  let jar = null          // Cookie 名 → 值（原样透传，含 INGRESSCOOKIE / _wafdytokenv1 等）
  let journal = null      // Oasis-Token 的值：<访问令牌>...<刷新令牌> 或单个访问令牌
  let webid = null
  let renewing = null     // 续期去重（两个 RPC 并发撞 401 时只续一次）

  function ingest(cred) {
    const parsed = sfParseCredential(cred.value)
    jar = parsed.cookie ? sfCookieMap(parsed.cookie) : null
    const jarToken = jar && (jar['Oasis-Token'] || jar['oasis-token'])
    journal = jarToken || parsed.token || null
    webid = parsed.webid || (jar && jar['Oasis-Webid']) || null
    if (journal) {
      for (const part of String(journal).split('...')) {
        const p = sfJwtPayload(part)
        if (p && !webid && typeof p.device_id === 'string' && p.device_id) webid = p.device_id
      }
    }
  }

  function baseHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      // 同 GOAT/Hyper/OpenCode 三处：Electron 宿主 fetch 对压缩响应不解码
      // （electron#51694，Windows/38+）。控制台小响应不压缩所以能解，续期响应 1~3KB 会被压，
      // 于是 JSON.parse 崩成「控制台令牌续期响应异常」。明确要未压缩的。
      'Accept-Encoding': 'identity',
      'Oasis-Platform': 'web',
      'Oasis-appID': SF_PLAN_APP_ID,
      'User-Agent': 'dsh-opencode-go-monitor/1.0',
    }
    if (webid) { headers['Oasis-Webid'] = webid; headers['Oasis-Did'] = webid }
    return headers
  }

  // 真 401 才走：RefreshToken 用同一条 journal 换新访问令牌（响应里会轮换刷新令牌）
  async function renew() {
    if (renewing) return renewing
    renewing = (async () => {
      const cookie = jar ? sfCookieString(jar) : ('Oasis-Token=' + journal)
      const resp = await fetch(SF_PLAN_REFRESH_URL, {
        method: 'POST',
        headers: { ...baseHeaders(), Cookie: cookie },
        body: '{}',
        signal: AbortSignal.timeout(15000),
      })
      const text = await resp.text().catch(() => '')
      if (!resp.ok) throw new Error('控制台令牌续期 HTTP ' + resp.status + ': ' + String(text).slice(0, 140))
      let data = null
      try { data = JSON.parse(text) } catch {
        // 自证式报错：状态码 + content-encoding + 字节数 + 开头 16 字节 hex。
        // hex 足以认出压缩魔术数（1f8b/28b5/…）与 HTML（3c68746d6c="<html"），且不泄露令牌。
        const ce = resp.headers.get('content-encoding') || 'none'
        const hex = Buffer.from(String(text).slice(0, 16), 'utf8').toString('hex')
        throw new Error('控制台令牌续期响应异常（HTTP ' + resp.status + '，content-encoding=' + ce
          + '，字节数=' + String(text).length + '，开头hex=' + hex + '）')
      }
      const access = data && data.accessToken && data.accessToken.raw
      if (!access) throw new Error('控制台令牌续期未返回访问令牌')
      const refresh = data.refreshToken && data.refreshToken.raw
      // 续期后的 journal 只留在内存里（凭据文件不写回），进程重启后需要用原凭据再试
      journal = refresh ? access + '...' + refresh : access
      if (jar) jar['Oasis-Token'] = journal
      return journal
    })().finally(() => { renewing = null })
    return renewing
  }

  async function rpc(method, body = {}) {
    const call = () => fetch(SF_PLAN_DASHBOARD + method, {
      method: 'POST',
      headers: jar ? { ...baseHeaders(), 'Oasis-Token': journal, Cookie: sfCookieString(jar) } : { ...baseHeaders(), 'Oasis-Token': journal },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })
    let resp = await call()
    if (resp.status === 401 && (jar || journal)) {
      await renew()
      resp = await call()
    }
    const text = await resp.text().catch(() => '')
    if (!resp.ok) {
      let msg = String(text).slice(0, 160)
      try { const j = JSON.parse(text); if (j && j.message) msg = j.message } catch { /* 原文 */ }
      if (resp.status === 401) msg += '（控制台凭据失效，请在 DSH 设置 → 凭据重贴 STEPFUN_CONSOLE_COOKIE）'
      throw new Error('控制台 ' + method + ' HTTP ' + resp.status + ': ' + msg)
    }
    try { return JSON.parse(text) } catch { throw new Error('控制台 ' + method + ' 响应不是 JSON') }
  }

  return {
    async query() {
      const cred = await resolveStepfunConsoleCred(ctx)
      if (!cred) throw new Error('未配置 STEPFUN_CONSOLE_COOKIE / STEPFUN_CONSOLE_TOKEN（阶跃控制台登录凭据）')
      const tag = cred.name + ':' + cred.value.length + ':' + cred.value.slice(0, 12)
      if (tag !== credTag) { credTag = tag; ingest(cred) }
      if (!journal) throw new Error(cred.name + ' 里没解析出 Oasis-Token / oasis-token')
      const [status, rate] = await Promise.all([
        rpc('GetStepPlanStatus'),
        rpc('QueryStepPlanRateLimit'),
      ])
      return sfNormalizePlan(status, rate, Date.now(), cred.name)
    },
  }
}

// 按量账户余额 + Step Plan 订阅额度并行取，任一失败不影响另一个
async function queryStepfunAll(ctx, planSource) {
  const [account, plan] = await Promise.allSettled([queryStepfunBalance(ctx), planSource.query()])
  const payload = {
    ok: account.status === 'fulfilled' || plan.status === 'fulfilled',
    fetchedAt: Date.now(),
    balance: null,
    cashBalance: null,
    voucherBalance: null,
    accountType: null,
    currency: 'CNY',
    plan: null,
  }
  if (account.status === 'fulfilled') Object.assign(payload, account.value)
  else payload.accountError = String((account.reason && account.reason.message) || account.reason).slice(0, 200)
  if (plan.status === 'fulfilled') payload.plan = plan.value
  else payload.planError = String((plan.reason && plan.reason.message) || plan.reason).slice(0, 200)
  if (!payload.ok) payload.error = payload.planError || payload.accountError
  return payload
}

// 内部工具导出：供 test/host-unit.mjs 做纯函数单测（DSH 装载只认 name / inject / apply）

// ---------- 阿里云百炼 Token Plan（个人版 · 控制台内部网关）----------
// 公开通道只有推理（套餐 Key sk-sp- + https://token-plan.cn-beijing.maas.aliyuncs.com），
// 套餐 Credits 额度只在百炼控制台内部网关里（2026-09-23 依据 CodexBar 公开实现 + 官网文档复原，
// 本机实测：无 Cookie 时网关 200 → { code:"200", data:{ success:false, errorCode:"Bad Request" } }）：
//   网关：POST https://bailian-cs.console.aliyun.com/data/api.json
//         ?action=BroadScopeAspnGateway&product=sfm_bailian
//         &api=zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/{usage|subscription|quota-config}
//   表单：product / action / region=cn-beijing / language / params（嵌套 JSON）/ sec_token(强烈建议)
//   params.Data.cornerstoneParam 描述控制台上下文；不要写死 switchAgent（会绑定到别人的 workspace）
//   鉴权：控制台 Cookie（bailian-cs.console.aliyun.com 域）+ sec_token
//         +（有的话）x-xsrf-token = cookie 里的 login_aliyunid_csrf
//   sec_token 缺了会回 BailianGateway.Workspace.NotAuthorised / NotAuthorised，因此：
//     ① 优先从粘贴的 cURL 里取（-H 'sec_token: ...' 或 Cookie 里的 sec_token）
//     sec_token 三条来路（按优先级）：
//       ① 用 Cookie 找登录态网关 GET /tool/user/info.json 换新 sec_token（**主通道**：只要 Cookie
//          还有效就能持续续期，实测真控制台 HTML 并不下发 SEC_TOKEN，抓 HTML 只是最后兜底）
//       ② 凭据里粘贴的 sec_token（页面级短时效值，可能一贴就已接近过期）
//       ③ 抓控制台 HTML 的 window.ALIYUN_CONSOLE_CONFIG.SEC_TOKEN（必须带 Sec-Fetch-* / Referer 导航头）
//     网关回鉴权错误时：丢掉当前 token → 重铸（失败再抓一次 HTML）→ 同一请求重试一次（每轮 query 仅一次）。
//     仍然失败则调 loginInfo 读 loginStatus，把错误分类成「Cookie/会话失效」或「Cookie 有效但缺新鲜
//     sec_token」，避免一句笼统的「登录失效」让人不知道是该重登还是重贴。
// 响应是双层信封（{code, data:{success,errorCode,...}, successResponse}），额度对象还可能被塞进
// JSON 字符串里（OneConsole 习惯）→ 递归展开 + 深度搜索，字段缺失一律 null（不臆造 0）。
// 个人版窗口字段（2026-09-23 真凭据实测）：usage 只回 per1MonthPercentage / per1MonthResetTime
// （个人版无周限额、无 5 小时窗口百分比）；档位来自 subscription.specCode（附 status/endTime/
// remainingDays/autoRenewFlag/instanceCode）；quota-config 给 { <档位>: { five_hour, monthly },
// addon_quota: { extrabundle } }。BSS GetSubscriptionSummary（product=BssOpenAPI-V3，
// ProductCode=sfm_tokenplansolo_public_cn）对个人版**恒为全 0** → 判定为无数据，月额度改用
// 「档位月上限 × 月窗口已用 %」折算。
const BP_BASE = (process.env.BP_BASE || 'https://bailian-cs.console.aliyun.com').replace(/\/+$/, '')
const BP_DASHBOARD_BASE = (process.env.BP_DASHBOARD || 'https://bailian.console.aliyun.com').replace(/\/+$/, '')
const BP_DASHBOARD_URL = BP_DASHBOARD_BASE + '/cn-beijing?tab=plan#/efm/subscription/token-plan/personal'
const BP_REGION = 'cn-beijing'
const BP_PRODUCT = 'sfm_bailian'
const BP_ACTION = 'BroadScopeAspnGateway'
const BP_API_PREFIX = 'zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/'
const BP_PRODUCT_CODE = 'sfm_tokenplansolo_public_cn'
const BP_CACHE_MS = 60000
const BP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'

// 月额度汇总（BSS GetSubscriptionSummary）字段名候选——与 CodexBar 的解析口径一致
const BP_SUMMARY_TOTAL_KEYS = ['totalQuota', 'total_quota', 'totalCredits', 'totalCredit', 'quota', 'totalValue', 'TotalValue', 'cycleTotalValue', 'CycleTotalValue', 'creditLimit']
const BP_SUMMARY_REMAIN_KEYS = ['remainingQuota', 'remainQuota', 'remainingCredits', 'remainingCredit', 'availableCredits', 'remainAmount', 'availableAmount', 'totalSurplusValue', 'TotalSurplusValue', 'surplusValue', 'SurplusValue', 'cycleSurplusValue', 'CycleSurplusValue']
const BP_SUMMARY_USED_KEYS = ['usedQuota', 'used_quota', 'usedCredits', 'consumedCredits', 'consumeAmount', 'usedValue', 'UsedValue', 'consumedValue', 'ConsumedValue']
const BP_SUMMARY_RESET_KEYS = ['nextRefreshTime', 'resetTime', 'periodEndTime', 'billingCycleEnd', 'billCycleEndTime', 'expireTime', 'expirationTime', 'endTime', 'validEndTime', 'cycleEndTime', 'CycleEndTime', 'nearestExpireDate', 'NearestExpireDate']
const BP_SUMMARY_COUNT_KEYS = ['totalCount', 'TotalCount', 'subscriptionTotalNumber', 'SubscriptionTotalNumber']
const BP_TIER_DISPLAY = { lite: 'Lite', essential: 'Essential', standard: 'Standard', pro: 'Pro', max: 'Max' }

// 个人版额度窗口字段候选（本机 2026-09-23 实测：quota-config 返回
//   { <档位>: { five_hour, monthly } } + addon_quota.extrabundle；
// 窗口百分比字段名以 CodexBar 的实现为基线，month 类排在前、week 类兜底）
const BP_USAGE_FIVE_PCT = ['per5HourPercentage', 'perFiveHourPercentage']
const BP_USAGE_MONTH_PCT = ['per1MonthPercentage', 'perMonthPercentage', 'per30DayPercentage', 'per1WeekPercentage', 'perWeekPercentage']
const BP_USAGE_FIVE_RESET = ['per5HourResetTime', 'perFiveHourResetTime']
const BP_USAGE_MONTH_RESET = ['per1MonthResetTime', 'perMonthResetTime', 'per30DayResetTime', 'per1WeekResetTime', 'perWeekResetTime']

const bpNum = (v) => {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const bpStr = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
// 0..1 比例 → 0..100 百分比（夹到区间内；非有限值 → null）
const bpRatioPct = (v) => {
  const n = bpNum(v)
  if (n === null) return null
  return Math.round(Math.min(Math.max(n, 0), 1) * 1e6) / 1e4
}
// epoch 秒/毫秒 或 ISO / "YYYY-MM-DD HH:mm:ss" → 毫秒（不可解析 → null）
const bpDateMs = (v) => {
  const n = bpNum(v)
  if (n !== null) return n > 0 ? (n >= 1e12 ? Math.round(n) : Math.round(n * 1000)) : null
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  const iso = Date.parse(s)
  if (Number.isFinite(iso)) return iso
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/)
  if (!m) return null
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0) - 480, Number(m[6] || 0))
  return Number.isFinite(t) ? t : null
}

// 递归展开「值是 JSON 字符串」的包袱（OneConsole 网关习惯），其余原样
function bpExpandEmbeddedJSON(value) {
  if (typeof value === 'string') {
    const s = value.trim()
    if (!s.startsWith('{') && !s.startsWith('[')) return value
    try { return bpExpandEmbeddedJSON(JSON.parse(s)) } catch { return value }
  }
  if (Array.isArray(value)) return value.map(bpExpandEmbeddedJSON)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = bpExpandEmbeddedJSON(v)
    return out
  }
  return value
}

const bpOwnValue = (obj, names) => {
  if (!obj || typeof obj !== 'object') return null
  const want = names.map((n) => String(n).toLowerCase())
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue
    if (want.includes(String(k).toLowerCase())) return v
  }
  return null
}

// 深度优先找第一个「含任一指定键」的对象（字典先于后代，保插入序——与 OneConsole 解析口径一致）
function bpFindObjectDeep(value, keys) {
  const want = new Set(keys.map((k) => String(k).toLowerCase()))
  const own = (dict) => {
    for (const k of Object.keys(dict)) if (want.has(String(k).toLowerCase()) && dict[k] !== null && dict[k] !== undefined) return dict
    return null
  }
  const walk = (node) => {
    if (Array.isArray(node)) {
      for (const v of node) { const r = walk(v); if (r) return r }
      return null
    }
    if (node && typeof node === 'object') {
      const hit = own(node)
      if (hit) return hit
      for (const v of Object.values(node)) { const r = walk(v); if (r) return r }
    }
    return null
  }
  return walk(value)
}

// 深度优先找「键名匹配」的值（按调用方给的键序优先）
function bpFindValueDeep(value, keys) {
  const want = keys.map((k) => String(k).toLowerCase())
  const walk = (node) => {
    if (Array.isArray(node)) {
      for (const v of node) { const r = walk(v); if (r !== null) return r }
      return null
    }
    if (node && typeof node === 'object') {
      for (const k of want) {
        for (const [dk, dv] of Object.entries(node)) {
          if (String(dk).toLowerCase() === k && dv !== null && dv !== undefined) return dv
        }
      }
      for (const v of Object.values(node)) { const r = walk(v); if (r !== null) return r }
    }
    return null
  }
  return walk(value)
}

const bpFirstNum = (root, keys) => bpNum(bpFindValueDeep(root, keys))
const bpFirstDate = (root, keys) => bpDateMs(bpFindValueDeep(root, keys))

// quota-config：找 { <档位>: {five_hour, weekly} } 里对应档位的那个对象
function bpFindKeyedObject(value, key) {
  const want = String(key || '').toLowerCase()
  if (!want) return null
  const walk = (node) => {
    if (Array.isArray(node)) {
      for (const v of node) { const r = walk(v); if (r) return r }
      return null
    }
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (String(k).toLowerCase() === want && v && typeof v === 'object' && !Array.isArray(v)) return v
      }
      for (const v of Object.values(node)) { const r = walk(v); if (r) return r }
    }
    return null
  }
  return walk(value)
}

// 用量包 Credit：实测形状 addon_quota.extrabundle；兼容 addon_quota 直接是数字 / 包一层 value/quota
function bpAddonQuotaFrom(root) {
  if (!root) return null
  const raw = bpFindValueDeep(root, ['extrabundle', 'addonQuota', 'addon_quota'])
  const direct = bpNum(raw)
  if (direct !== null) return direct
  if (raw && typeof raw === 'object') {
    for (const k of ['extrabundle', 'value', 'quota', 'amount', 'credits', 'credit']) {
      const n = bpNum(bpOwnValue(raw, [k]))
      if (n !== null) return n
    }
  }
  return null
}

// 套餐档位 → 展示名（specCode 形如 tokenplan_solo_pro_cn 也能认出来）
function bpTierName(code) {
  const c = String(code || '').trim().toLowerCase()
  if (!c) return null
  for (const tier of ['essential', 'standard', 'lite', 'pro', 'max']) {
    if (c.includes(tier)) return BP_TIER_DISPLAY[tier]
  }
  return c
}

// specCode → 档位键（lite / essential / standard / pro / max）；认不出给 null
function bpTierKey(code) {
  const c = String(code || '').trim().toLowerCase()
  if (!c) return null
  for (const tier of ['essential', 'standard', 'lite', 'pro', 'max']) {
    if (c.includes(tier)) return tier
  }
  return null
}

// quota-config 里取本套餐的窗口上限对象：先按 specCode 全名，再按档位键；
// 兜底只在「全树只有一个带 five_hour/monthly 的对象」时才用（避免认错档位——档位上限各不相同）
function bpQuotaObjectFor(root, planCode) {
  if (!root) return null
  const code = String(planCode || '').trim().toLowerCase()
  const tier = bpTierKey(code)
  for (const key of [code, tier]) {
    if (!key) continue
    const hit = bpFindKeyedObject(root, key)
    if (hit) return hit
  }
  const dicts = []
  const walk = (node) => {
    if (Array.isArray(node)) { for (const v of node) walk(v); return }
    if (node && typeof node === 'object') {
      if (bpOwnValue(node, ['five_hour', 'fiveHour', 'monthly', 'weekly']) !== null) dicts.push(node)
      for (const v of Object.values(node)) walk(v)
    }
  }
  walk(root)
  return dicts.length === 1 ? dicts[0] : null
}

// 取 `-b` / `--cookie` 这种命令行 flag 形式的值（Chromium「Copy as cURL」用它带 Cookie）
function bpGrabFlag(text, flags) {
  for (const f of flags) {
    const esc = f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const m = text.match(new RegExp('(?:^|\\s)' + esc + "\\s+(?:'([^']*)'|\"([^\"]*)\"|(\\S+))", 'm'))
    if (m) {
      const v = m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3])
      if (v && v.trim()) return v.trim()
    }
  }
  return null
}

// 从任意粘贴物（整段 cURL / 裸 Cookie 头 / 控制台 URL）解析出 cookie / sec_token / csrf
// 真实形态覆盖：① -H 'cookie: ...' + -H 'sec_token: ...'（StepFun 式手抄）
//              ② Chromium/Edge「Copy as cURL」：-b '...' + sec_token 在 --data-raw 表单里
//              ③ 裸 Cookie 串
function bpParseCredential(raw) {
  const text = String(raw || '').trim()
  const out = { cookie: null, secToken: null, csrf: null }
  if (!text) return out
  const grab = (names) => {
    for (const n of names) {
      const m = text.match(new RegExp(n + '\\s*:\\s*([^"\'\\r\\n]+)', 'i'))
      if (m && m[1]) return m[1].trim().replace(/^["']|["']$/g, '')
    }
    return null
  }
  out.cookie = grab(['cookie']) || bpGrabFlag(text, ['-b', '--cookie'])
  out.secToken = grab(['sec_token', 'secToken', 'x-sec-token'])
  if (!out.cookie && /[A-Za-z0-9_.\-]+=[^;\s]/.test(text) && !/(^|\s)(curl|--header|-H|-b|--cookie)\s/.test(text)) out.cookie = text
  if (out.cookie) {
    const m = sfCookieMap(out.cookie)
    out.secToken = out.secToken || m.sec_token || m.secToken || null
    out.csrf = m.login_aliyunid_csrf || m.csrf || null
  }
  // --data-raw / URL 查询串里的 sec_token（Copy as cURL 的常见位置）
  if (!out.secToken) {
    const m = text.match(/[?&]sec_token=([^&\s'"]+)/) || text.match(/(?:^|[&\s])sec_token=([^&\s'"]+)/)
    if (m && m[1]) {
      try { out.secToken = decodeURIComponent(m[1]) } catch { out.secToken = m[1] }
    }
  }
  return out
}

// 双层信封里的失败帧 → 人类可读错误
function bpEnvelopeError(payload) {
  const found = []
  const walk = (node, depth) => {
    if (depth > 5 || node === null || typeof node !== 'object') return
    if (Array.isArray(node)) { for (const v of node) walk(v, depth + 1); return }
    if (node.success === false || node.Success === false || node.successResponse === false) found.push(node)
    for (const v of Object.values(node)) walk(v, depth + 1)
  }
  walk(payload, 0)
  if (!found.length) return null
  const f = found[0]
  const code = typeof f.errorCode === 'string' ? f.errorCode : (typeof f.code === 'string' ? f.code : '')
  const msg = typeof f.errorMsg === 'string' ? f.errorMsg : (typeof f.message === 'string' ? f.message : (typeof f.msg === 'string' ? f.msg : ''))
  return { code, message: msg || '请求未成功' }
}

// 登录类错误（要提示用户重贴 Cookie）vs 其它网关错误
function bpAuthError(code, message) {
  const t = (String(code || '') + ' ' + String(message || '')).toLowerCase()
  return /needlogin|notlogin|not login|login required|unauthorized|forbidden|notauthorised|notauthorized|invalid.*(token|cookie|session)|token is illegal|expired|no permission|accessdenied/.test(t)
}

function bpErrorText(err) {
  const code = err && err.code ? String(err.code) : ''
  const msg = err && err.message ? String(err.message) : ''
  const head = !code ? (msg || '请求未成功')
    : (!msg || msg.includes(code) ? code : code + ': ' + msg)
  return bpAuthError(code, msg)
    ? head + '（控制台登录已失效，请在 DSH 设置 → 凭据重贴 BAILIAN_CONSOLE_COOKIE）'
    : head
}

// 归一化：只用「深度搜索 + 字段候选」，字段缺失一律 null
function bpNormalizePlan(input, fetchedAt, source) {
  const errors = input.errors || {}
  const usageRoot = input.usage ? bpExpandEmbeddedJSON(input.usage) : null
  const usageObj = usageRoot ? bpFindObjectDeep(usageRoot, [...BP_USAGE_FIVE_PCT, ...BP_USAGE_MONTH_PCT]) : null
  const subRoot = input.subscription ? bpExpandEmbeddedJSON(input.subscription) : null
  const subObj = subRoot ? bpFindObjectDeep(subRoot, ['specCode', 'spec_code', 'planName', 'plan_name']) : null
  const planCode = subObj
    ? (String(bpOwnValue(subObj, ['specCode', 'spec_code', 'planName', 'plan_name']) || '').trim().toLowerCase() || null)
    : null
  // 订阅信息（本机实测载荷：{instanceCode, specCode, remainingDays, startTime, endTime, autoRenewFlag, status}）
  const sub = subObj ? (() => {
    const autoRenewRaw = bpOwnValue(subObj, ['autoRenewFlag', 'autoRenew'])
    return {
      status: bpStr(bpOwnValue(subObj, ['status'])),
      instanceCode: bpStr(bpOwnValue(subObj, ['instanceCode'])),
      startTime: bpDateMs(bpOwnValue(subObj, ['startTime'])),
      endTime: bpDateMs(bpOwnValue(subObj, ['endTime', 'expireTime', 'expirationTime'])),
      remainingDays: bpNum(bpOwnValue(subObj, ['remainingDays'])),
      autoRenew: typeof autoRenewRaw === 'boolean' ? autoRenewRaw : null,
    }
  })() : null

  // quota-config：档位 → { five_hour, monthly }（老口径可能叫 weekly）+ addon_quota.extrabundle（用量包）
  const quotaRoot = input.quotaConfig ? bpExpandEmbeddedJSON(input.quotaConfig) : null
  let caps = null
  if (quotaRoot) {
    const keyed = bpQuotaObjectFor(quotaRoot, planCode)
    if (keyed) {
      caps = {
        fiveHour: bpNum(bpOwnValue(keyed, ['five_hour', 'fiveHour'])),
        month: bpNum(bpOwnValue(keyed, ['monthly', 'month', 'weekly'])),
        addon: bpAddonQuotaFrom(quotaRoot),
      }
    }
  }

  // 窗口百分比：month 类字段优先，命中 week 类时把 kind 标出来（面板据此换标签）
  const monthKeyHit = usageObj ? BP_USAGE_MONTH_PCT.find((k) => bpOwnValue(usageObj, [k]) !== null) || null : null
  const monthKind = monthKeyHit ? (/week/i.test(monthKeyHit) ? 'week' : 'month') : null

  const sumRoot = input.summary ? bpExpandEmbeddedJSON(input.summary) : null
  let credit = null
  if (sumRoot) {
    const total = bpFirstNum(sumRoot, BP_SUMMARY_TOTAL_KEYS)
    const remaining = bpFirstNum(sumRoot, BP_SUMMARY_REMAIN_KEYS)
    const usedDirect = bpFirstNum(sumRoot, BP_SUMMARY_USED_KEYS)
    const used = usedDirect !== null ? usedDirect : (total !== null && remaining !== null ? Math.max(0, total - remaining) : null)
    const count = bpFirstNum(sumRoot, BP_SUMMARY_COUNT_KEYS)
    const resetsAt = bpFirstDate(sumRoot, BP_SUMMARY_RESET_KEYS)
    // 个人版实测：BSS 汇总恒为 0（Uid/TotalCount 0 / TotalValue "0"），这种「全 0」不算有数据，
    // 否则面板会显示 0/0 盖掉窗口折算出来的真实月额度
    const usable = (total !== null && total > 0) || (remaining !== null && remaining > 0)
      || (used !== null && used > 0) || (count !== null && count > 0)
    if (usable) credit = { total, remaining, used, resetsAt, count, source: 'bss' }
  }

  const fiveUsed = usageObj ? bpRatioPct(bpOwnValue(usageObj, BP_USAGE_FIVE_PCT)) : null
  const monthUsed = usageObj ? bpRatioPct(bpOwnValue(usageObj, BP_USAGE_MONTH_PCT)) : null
  const windows = {
    fiveHour: {
      usedPercent: fiveUsed,
      resetsAt: usageObj ? bpDateMs(bpOwnValue(usageObj, BP_USAGE_FIVE_RESET)) : null,
      totalQuota: caps ? caps.fiveHour : null,
    },
    monthly: {
      usedPercent: monthUsed,
      resetsAt: usageObj ? bpDateMs(bpOwnValue(usageObj, BP_USAGE_MONTH_RESET)) : null,
      totalQuota: caps ? caps.month : null,
      kind: monthKind,
    },
  }
  // 没有可用 BSS 汇总时，用「档位月上限 × 月窗口已用 %」折算月额度（来源标注清楚，不混两种口径）
  if (!credit && caps && caps.month !== null && monthUsed !== null) {
    const used = Math.round((caps.month * monthUsed) / 100)
    credit = { total: caps.month, used, remaining: Math.max(0, caps.month - used), resetsAt: windows.monthly.resetsAt, count: null, source: 'window' }
  }

  const out = { planCode, planName: bpTierName(planCode), windows, caps, credit, sub, errors, source, fetchedAt }
  // 有响应但一个额度字段都没解析出来时，留一小段原始样本，方便下次对着真实载荷改解析
  if (!usageObj && !credit) {
    const sample = (v) => (v ? JSON.stringify(v).slice(0, 600) : null)
    out.debug = { usage: sample(input.usage), subscription: sample(input.subscription), quotaConfig: sample(input.quotaConfig), summary: sample(input.summary) }
  }
  return out
}

// 抓控制台 HTML 专用 GET：Node 的 fetch 会把 Sec-Fetch-Mode 固定成 cors/same-origin，
// 无法伪装成「真·文档导航」，而控制台只在导航请求下才下发 SEC_TOKEN —— 所以这里走 node:https
// 逐字节控制请求头（可显式发 Sec-Fetch-Mode: navigate），并自己跟 3 次重定向。
function bpHttpGet(urlStr, headers, timeoutMs = 15000, redirects = 3) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr)
    const send = u.protocol === 'https:' ? httpsRequest : httpRequest
    const req = send({
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: 'GET',
      headers,
    }, (res) => {
      const status = res.statusCode || 0
      if ([301, 302, 303, 307, 308].includes(status) && res.headers.location && redirects > 0) {
        res.resume()
        let next = res.headers.location
        try { next = new URL(next, urlStr).href } catch { /* 相对地址按原样 */ }
        bpHttpGet(next, headers, timeoutMs, redirects - 1).then(resolve, reject)
        return
      }
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (c) => { body += c })
      res.on('end', () => resolve({ status, headers: res.headers, body }))
    })
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('控制台 HTML 请求超时')) })
    req.on('error', reject)
    req.end()
  })
}

async function resolveBailianConsoleCred(ctx) {
  const names = ['BAILIAN_CONSOLE_COOKIE', 'BAILIAN_CONSOLE_COOKIES', 'BAILIAN_CONSOLE_CURL']
  for (const n of names) {
    try {
      const c = await ctx.credentials.resolve(n)
      if (c && c.value) return { name: n, value: String(c.value) }
    } catch { /* fallthrough */ }
  }
  for (const n of names) if (process.env[n]) return { name: n, value: String(process.env[n]) }
  return null
}

// 控制台会话源：Cookie 原样透传，sec_token 先取粘贴值、再用同一 Cookie 抓控制台 HTML
function createBailianPlanSource(ctx) {
  let credTag = null
  let jar = null
  let csrf = null              // cookie 里的 login_aliyunid_csrf（作 x-xsrf-token）
  let secToken = null          // 当前使用的 sec_token（自铸优先，其次粘贴/抓取）
  let pastedSecToken = null    // 凭据里粘贴的 sec_token（短时效，仅作兜底）
  let secTokenSource = null    // 'user-info' | 'credential' | 'html'
  let mintError = null
  let scraped = false
  let scrapeError = null
  let authRetried = false      // 每次 query 只允许「重铸 token 再试一次」

  function ingest(cred) {
    const parsed = bpParseCredential(cred.value)
    jar = parsed.cookie ? sfCookieMap(parsed.cookie) : null
    csrf = parsed.csrf || null
    pastedSecToken = parsed.secToken || null
    secToken = null
    secTokenSource = null
    mintError = null
    scraped = false
    scrapeError = null
    authRetried = false
  }

  const cookieHeader = () => (jar ? sfCookieString(jar) : null)

  function headers() {
    const h = {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': BP_UA,
      Origin: BP_DASHBOARD_BASE,
      Referer: BP_DASHBOARD_URL,
    }
    const ck = cookieHeader()
    if (ck) h.Cookie = ck
    const token = csrf || (jar && (jar.login_aliyunid_csrf || jar.csrf)) || null
    if (token) { h['x-xsrf-token'] = token; h['x-csrf-token'] = token }
    return h
  }

  // 用 Cookie 换新 sec_token：登录态网关 GET /tool/user/info.json（参考实现的正规通道）
  // —— 粘贴的 sec_token 是页面级短时效值，用一会儿就过期；这条通道只要 Cookie 还活着就能续。
  async function mintSecToken() {
    mintError = null
    const ck = cookieHeader()
    if (!ck) { mintError = '没有 Cookie'; return null }
    try {
      const resp = await fetch(BP_DASHBOARD_BASE + '/tool/user/info.json', {
        headers: {
          Accept: 'application/json, text/plain, */*',
          Cookie: ck,
          'User-Agent': BP_UA,
          Referer: BP_DASHBOARD_BASE + '/',
        },
        signal: AbortSignal.timeout(12000),
      })
      const text = await resp.text().catch(() => '')
      if (!resp.ok) { mintError = 'user/info HTTP ' + resp.status; return null }
      let data = null
      try { data = JSON.parse(text) } catch { mintError = 'user/info 响应不是 JSON'; return null }
      const expanded = bpExpandEmbeddedJSON(data)
      const token = bpFindValueDeep(expanded, ['secToken', 'sec_token'])
      if (typeof token === 'string' && token.trim()) {
        secToken = token.trim()
        secTokenSource = 'user-info'
        return secToken
      }
      mintError = bpStr(bpFindValueDeep(expanded, ['message', 'code'])) || 'user/info 里没有 sec_token'
    } catch (e) { mintError = String((e && e.message) || e) }
    return null
  }

  // 兜底：抓控制台 HTML 里的 window.ALIYUN_CONSOLE_CONFIG.SEC_TOKEN（实测真实控制台不一定下发）
  async function scrapeSecToken(force) {
    if (scraped && !force) return null
    scraped = true
    scrapeError = null
    const ck = cookieHeader()
    if (!ck) return null
    try {
      const resp = await bpHttpGet(BP_DASHBOARD_URL, {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Cookie: ck,
        'User-Agent': BP_UA,
        Referer: BP_DASHBOARD_BASE + '/',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Dest': 'document',
        Connection: 'close',
      }, 15000)
      if (resp.status < 200 || resp.status >= 300) { scrapeError = '控制台 HTML HTTP ' + resp.status; return null }
      const html = resp.body
      const m = html.match(/SEC_TOKEN['"]?\s*[:=]\s*['"]([^'"]+)['"]/)
        || html.match(/"sec_?[Tt]oken"\s*:\s*"([^"]+)"/)
      if (m && m[1]) { secToken = m[1]; secTokenSource = 'html'; return secToken }
      scrapeError = '控制台 HTML 里没找到 SEC_TOKEN（登录可能已过期）'
    } catch (e) { scrapeError = String((e && e.message) || e) }
    return null
  }

  // 取 sec_token：Cookie 自铸 → 粘贴值兜底 → 抓 HTML
  async function resolveSecToken() {
    if (secToken) return secToken
    if (await mintSecToken()) return secToken
    if (pastedSecToken) { secToken = pastedSecToken; secTokenSource = 'credential'; return secToken }
    return await scrapeSecToken(false)
  }

  // 网关回鉴权错误时丢开当前 sec_token，重铸（失败再抓一次 HTML）
  async function refreshSecToken() {
    secToken = null
    secTokenSource = null
    if (await mintSecToken()) return secToken
    return await scrapeSecToken(true)
  }

  // 鉴权错误 → 重铸一次 sec_token 再重试（每次 query 最多一次）
  async function authed(fn) {
    try {
      return await fn()
    } catch (e) {
      if (!e || !e.auth || authRetried) throw e
      authRetried = true
      await refreshSecToken()
      return await fn()
    }
  }

  function cornerstone() {
    return {
      feTraceId: (globalThis.crypto && globalThis.crypto.randomUUID) ? globalThis.crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2),
      feURL: BP_DASHBOARD_URL,
      protocol: 'V2',
      console: 'ONE_CONSOLE',
      productCode: 'p_efm',
      switchUserType: 3,
      domain: BP_DASHBOARD_BASE.replace(/^https?:\/\//, ''),
      consoleSite: 'BAILIAN_ALIYUN',
      userNickName: '',
      userPrincipalName: '',
      xsp_lang: 'en-US',
    }
  }

  async function callGateway(base, query, fields) {
    const body = new URLSearchParams()
    for (const [k, v] of Object.entries(fields)) {
      if (v === null || v === undefined || v === '') continue
      body.set(k, String(v))
    }
    const resp = await fetch(base + '/data/api.json?' + query, {
      method: 'POST',
      headers: headers(),
      body: body.toString(),
      signal: AbortSignal.timeout(20000),
    })
    const text = await resp.text().catch(() => '')
    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) {
        const err = new Error('控制台 HTTP ' + resp.status + '（登录已失效，重贴 BAILIAN_CONSOLE_COOKIE）')
        err.auth = true
        throw err
      }
      throw new Error('控制台 HTTP ' + resp.status + ': ' + String(text).slice(0, 140))
    }
    let data = null
    try { data = JSON.parse(text) } catch { throw new Error('控制台响应不是 JSON（可能被重定向到登录页）') }
    const envErr = bpEnvelopeError(data)
    if (envErr) {
      const err = new Error(bpErrorText(envErr))
      if (bpAuthError(envErr.code, envErr.message)) err.auth = true
      throw err
    }
    return data
  }

  // 个人版滚动窗口 API（同一个 apikeyMgr 网关，api 参数决定取哪份数据）
  async function personalRpc(api, dataParams) {
    return authed(async () => {
      const token = await resolveSecToken()
      const params = { Api: api, V: '1.0', Data: { ...(dataParams || {}), cornerstoneParam: cornerstone() } }
      const query = 'action=' + BP_ACTION + '&product=' + BP_PRODUCT + '&api=' + encodeURIComponent(api) + '&_v=undefined'
      return callGateway(BP_BASE, query, {
        product: BP_PRODUCT,
        action: BP_ACTION,
        region: BP_REGION,
        language: 'en-US',
        params: JSON.stringify(params),
        sec_token: token || '',
      })
    })
  }

  // BSS 月额度汇总（尽力而为；堵不住也不影响窗口）
  async function bssSummary() {
    return authed(async () => {
      const token = await resolveSecToken()
      return callGateway(BP_DASHBOARD_BASE, 'action=GetSubscriptionSummary&product=BssOpenAPI-V3&_tag=', {
        product: 'BssOpenAPI-V3',
        action: 'GetSubscriptionSummary',
        params: JSON.stringify({ ProductCode: BP_PRODUCT_CODE }),
        region: BP_REGION,
        sec_token: token || '',
      })
    })
  }

  // 登录态探针（只在失败路径调用）：区分「Cookie 失效」还是「sec_token 失效」
  async function probeLoginStatus() {
    try {
      return await personalRpc('zeldaEasy.cornerstone-portal.cs-console.loginInfo', {})
    } catch { return null }
  }

  // 控制台实测会偶发「200 Success 但窗口字段为空」，立刻重试可拿到（与 CodexBar 同口径）
  async function personalUsageWithRetry() {
    const pctKeys = [...BP_USAGE_FIVE_PCT, ...BP_USAGE_MONTH_PCT]
    let last = null
    for (let i = 0; i < 3; i++) {
      if (i) await new Promise((r) => setTimeout(r, 400))
      const payload = await personalRpc(BP_API_PREFIX + 'usage', {})
      last = payload
      if (bpFindObjectDeep(bpExpandEmbeddedJSON(payload), pctKeys)) return payload
    }
    return last
  }

  return {
    async query() {
      const cred = await resolveBailianConsoleCred(ctx)
      if (!cred) throw new Error('未配置 BAILIAN_CONSOLE_COOKIE（百炼控制台登录凭据；DSH 设置 → 凭据，或环境变量）')
      const tag = cred.name + ':' + cred.value.length + ':' + cred.value.slice(0, 16)
      if (tag !== credTag) { credTag = tag; ingest(cred) }
      if (!jar) throw new Error(cred.name + ' 里没解析出 Cookie（请粘贴控制台请求的 Cookie 头或整段 cURL）')
      authRetried = false   // 每轮 query 允许一次「重铸 sec_token 再试」
      await resolveSecToken()   // 预热：先铸一次 token，再并发打 4 个接口

      const [usageR, subR, quotaR, sumR] = await Promise.allSettled([
        personalUsageWithRetry(),
        personalRpc(BP_API_PREFIX + 'subscription', { commodityCode: BP_PRODUCT_CODE }),
        personalRpc(BP_API_PREFIX + 'quota-config', {}),
        bssSummary(),
      ])
      const errors = {}
      const pick = (r, key) => {
        if (r.status === 'fulfilled') return r.value
        errors[key] = String((r.reason && r.reason.message) || r.reason).slice(0, 200)
        return null
      }
      const input = {
        usage: pick(usageR, 'usage'),
        subscription: pick(subR, 'subscription'),
        quotaConfig: pick(quotaR, 'quotaConfig'),
        summary: pick(sumR, 'summary'),
        errors,
      }
      const plan = bpNormalizePlan(input, Date.now(), cred.name)
      plan.secTokenSource = secTokenSource
      if (!secToken && scrapeError) plan.secTokenError = scrapeError
      const hasData = !!(input.usage || input.summary || plan.credit
        || (plan.caps && (plan.caps.fiveHour !== null || plan.caps.month !== null)))
      if (!hasData) {
        const baseErr = errors.usage || errors.summary || errors.subscription || '未取到百炼套餐额度'
        // 失败分类：先看这些错误像不像鉴权问题，再问一次 loginInfo 拿准确状态
        const authish = Object.keys(errors).some((k) => /NotLogined|ConsoleNeedLogin|请登录|登录已失效|not.?login/i.test(String(errors[k] || '')))
        let loginStatus = null
        let hint = null
        if (authish) {
          const info = await probeLoginStatus()
          const status = info ? bpStr(bpFindValueDeep(bpExpandEmbeddedJSON(info), ['loginStatus'])) : null
          loginStatus = status
          if (status && /NOT_LOGINED|NOT.?LOGIN|未登录/i.test(status)) {
            hint = '控制台会话已失效（loginStatus=' + status + '）：请重新登录 bailian.console.aliyun.com 后重贴 BAILIAN_CONSOLE_COOKIE'
          } else if (status) {
            hint = 'Cookie 仍有效（loginStatus=' + status + '），但网关拒绝了：请重贴带新鲜 sec_token 的 cURL'
          } else if (mintError) {
            hint = '无法用 Cookie 换 sec_token：' + mintError
          }
        }
        return {
          ok: false,
          error: hint || baseErr,
          errors,
          debug: plan.debug || null,
          secTokenSource,
          mintError,
          loginStatus,
          source: cred.name,
          fetchedAt: Date.now(),
        }
      }
      return { ok: true, ...plan }
    },
  }
}

// ---------- DeepSeek 官网平台用量（platform.deepseek.com 控制台同源接口）----------
// 这里显示的「已用」就是 platform.deepseek.com 用量页上的那个数：当月 token / 金额 / 请求数，
// 直接读该页背后的同源 JSON 接口，**不做本地统计、也不由余额折算**。
//   GET /api/v0/usage/amount?month=&year=  → data.biz_data = { total: [{model, usage: [{type, amount}]}], days: [{date, data: [...]}] }
//   GET /api/v0/usage/cost?month=&year=    → data.biz_data[0] = { total: [...], days: [...], currency }
//   type: PROMPT_CACHE_HIT_TOKEN / PROMPT_CACHE_MISS_TOKEN / RESPONSE_TOKEN / REQUEST
// 鉴权是**控制台会话 userToken**（Bearer），不是 API key：API key 只能拿余额，拿不到用量页。
// 取值顺序：DSH 凭据 DEEPSEEK_PLATFORM_TOKEN → 环境变量 OGM_PLATFORM_TOKEN → 尽力而为读浏览器 Local Storage。
// 两个接口地址可用 OGM_PLATFORM_AMOUNT_URL / OGM_PLATFORM_COST_URL 覆盖（集成测试指向本地 mock）。
const PLATFORM_AMOUNT_URL = process.env.OGM_PLATFORM_AMOUNT_URL || 'https://platform.deepseek.com/api/v0/usage/amount'
const PLATFORM_COST_URL = process.env.OGM_PLATFORM_COST_URL || 'https://platform.deepseek.com/api/v0/usage/cost'
const PLATFORM_USAGE_CACHE_MS = 60000

// ---------- 自动读取浏览器里的 userToken（尽力而为；.log 全解析 + .ldb 未压缩块）----------
// 命中后用官网实体验证，有效才采用；读不到时由 DSH 凭据 / 环境变量兜底。
const autoTokenCache = { token: null, at: 0, tried: false }
const AUTO_TOKEN_CACHE_MS = 60 * 60 * 1000

function platformBrowserDirs() {
  const home = process.env.HOME || process.env.USERPROFILE || ''
  const loc = process.env.LOCALAPPDATA
  const roam = process.env.APPDATA
  const roots = []
  if (process.platform === 'win32') {
    if (loc) roots.push(joinWin(loc, 'Google', 'Chrome', 'User Data'), joinWin(loc, 'Microsoft', 'Edge', 'User Data'), joinWin(loc, 'Chromium', 'User Data'))
    if (roam) roots.push(joinWin(roam, '360se6', 'User Data'), joinWin(roam, '360ChromeX', 'User Data'), joinWin(roam, '360Chrome', 'User Data'), joinWin(roam, '360se9', 'User Data'), joinWin(roam, 'BraveSoftware', 'Brave-Browser', 'User Data'))
  } else if (process.platform === 'darwin') {
    if (home) roots.push(joinP(home, 'Library', 'Application Support', 'Google', 'Chrome'), joinP(home, 'Library', 'Application Support', 'Microsoft Edge'), joinP(home, 'Library', 'Application Support', 'Chromium'), joinP(home, 'Library', 'Application Support', '360Chrome'), joinP(home, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser'))
  } else {
    if (home) roots.push(joinP(home, '.config', 'google-chrome'), joinP(home, '.config', 'microsoft-edge'), joinP(home, '.config', 'chromium'), joinP(home, '.config', '360chrome'), joinP(home, '.config', 'BraveSoftware', 'Brave-Browser'))
    // WSL：浏览器跑在 Windows 侧，Local Storage 在 /mnt/c（只读挂载，读没问题）
    try {
      for (const user of readdirSync('/mnt/c/Users')) {
        if (/^(Public|Default|Default User|All Users)$/i.test(user)) continue
        const base = '/mnt/c/Users/' + user
        roots.push(
          base + '/AppData/Local/Google/Chrome/User Data',
          base + '/AppData/Local/Microsoft/Edge/User Data',
          base + '/AppData/Local/Chromium/User Data',
          base + '/AppData/Roaming/360se6/User Data',
          base + '/AppData/Roaming/360Chrome/User Data',
          base + '/AppData/Roaming/360ChromeX/User Data',
          base + '/AppData/Local/BraveSoftware/Brave-Browser/User Data',
        )
      }
    } catch { /* 非 WSL 环境没有 /mnt/c */ }
  }
  const dirs = []
  for (const root of roots) {
    try {
      for (const ent of readdirSync(root, { withFileTypes: true })) {
        if (!ent.isDirectory()) continue
        const ls = joinP(root, ent.name, 'Local Storage', 'leveldb')
        if (existsSync(ls)) dirs.push(ls)
      }
      const ls0 = joinP(root, 'Local Storage', 'leveldb')
      if (existsSync(ls0)) dirs.push(ls0)
    } catch { /* 目录不可读则跳过 */ }
  }
  return dirs
}
function joinWin(...parts) { return parts.join('\\') }
function joinP(...parts) { return parts.join('/') }

const rv32 = (buf, pos) => { let r = 0, s = 0, b; do { b = buf[pos++]; r |= (b & 0x7f) << s; s += 7 } while (b & 0x80); return { v: r >>> 0, n: pos } }
// .log 写前日志：FULL 记录 → put 条目（key 为 userKey，去掉 8 字节 seq）
function parseLogEntries(buf) {
  const out = []; let pos = 0
  while (pos + 7 <= buf.length) {
    const len = buf.readUInt16LE(pos + 4), type = buf[pos + 6]; pos += 7
    if (len === 0 || pos + len > buf.length) break
    if (type === 1) {
      const d = buf.slice(pos, pos + len); let p = 8
      if (p + 4 > d.length) { pos += len; continue }
      const count = d.readUInt32LE(p); p += 4
      for (let e = 0; e < count && p < d.length; e++) {
        const kt = d[p++]
        const kl = rv32(d, p); p = kl.n
        const vl = rv32(d, p); p = vl.n
        if (p + kl.v + vl.v > d.length) break
        const key = d.slice(p, p + kl.v); p += kl.v
        const val = d.slice(p, p + vl.v); p += vl.v
        if (kt === 1) out.push({ key: key.slice(0, Math.max(0, key.length - 8)).toString('latin1'), val: val.toString('latin1') })
      }
    }
    pos += len
  }
  return out
}
// .ldb sstable：footer→index→data blocks（仅解析未压缩块 type 0；snappy 块跳过）
function parseLdbEntries(buf) {
  if (buf.length < 48) return []
  const foot = buf.slice(buf.length - 48)
  if (foot.readBigUInt64LE(40) !== 0xdb4775248b80fb57n) return []
  const h1 = rv32(foot, 0), h2 = rv32(foot, h1.n)
  const ib = readBlockRaw(buf, h1.v, h2.v)
  if (!ib) return []
  const idx = parseBlockEntries(ib)
  const out = []
  for (const ie of idx) {
    const h = rv32(ie.val, 0)
    const db = readBlockRaw(buf, h.v, rv32(ie.val, h.n).v)
    if (!db) continue
    for (const en of parseBlockEntries(db)) if (en.key.includes('platform.deepseek.com')) out.push(en)
  }
  return out
}
function readBlockRaw(buf, offset, size) {
  if (offset + size + 5 > buf.length) return null
  if (buf[offset + size] !== 0x00) return null // type 1 = snappy，跳过
  return buf.slice(offset, offset + size)
}
function parseBlockEntries(data) {
  if (!data || data.length < 8) return []
  const end = data.length - 4
  const out = []; let pos = 0; let prev = Buffer.alloc(0)
  while (pos < end) {
    const sc = rv32(data, pos); pos = sc.n
    if (pos >= end) break
    const nsc = rv32(data, pos); pos = nsc.n
    if (pos >= end) break
    const vl = rv32(data, pos); pos = vl.n
    if (pos + sc.v + nsc.v + vl.v > data.length) break
    const key = Buffer.concat([prev.slice(0, sc.v), data.slice(pos, pos + nsc.v)])
    pos += nsc.v
    const val = data.slice(pos, pos + vl.v); pos += vl.v
    prev = key
    out.push({ key: key.toString('latin1'), val })
  }
  return out
}
// 从 localStorage 值中提取候选 token（JWT 或长串）
function extractTokenCandidates(entries) {
  const cands = []
  for (const en of entries) {
    if (!/token|passport|session|jwt|auth/i.test(en.key)) continue
    const s = String(en.val || '')
    const m = s.match(/eyJ[A-Za-z0-9_.-]{30,}|[A-Za-z0-9_-]{40,}/g)
    if (m) for (const t of m) if (t.length >= 40 && !cands.includes(t)) cands.push(t)
  }
  return cands
}
async function validatePlatformToken(token) {
  try {
    const now = new Date()
    const res = await fetch(`${PLATFORM_COST_URL}?month=${now.getMonth() + 1}&year=${now.getFullYear()}`, {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return false
    const data = await res.json().catch(() => null)
    return !!(data && data.code === 0)
  } catch { return false }
}
async function autoPlatformToken() {
  // OGM_PLATFORM_AUTO_TOKEN=0 关掉浏览器扫描（测试 / 不想让插件翻浏览器数据时用）
  if (process.env.OGM_PLATFORM_AUTO_TOKEN === '0') return null
  if (autoTokenCache.tried && Date.now() - autoTokenCache.at < AUTO_TOKEN_CACHE_MS) return autoTokenCache.token
  autoTokenCache.tried = true
  autoTokenCache.at = Date.now()
  autoTokenCache.token = null
  try {
    for (const dir of platformBrowserDirs()) {
      let files
      try { files = readdirSync(dir) } catch { continue }
      // 最近改动的文件优先（新登录态写在最新的 .log 里）
      try { files = files.slice().sort((a, b) => statSync(dir + '/' + b).mtimeMs - statSync(dir + '/' + a).mtimeMs) } catch { /* 保持原序 */ }
      for (const f of files.slice(0, 40)) {
        if (!/\.(log|ldb)$/.test(f)) continue
        let buf
        try {
          const st = statSync(dir + '/' + f)
          if (st.size > 64 * 1024 * 1024) continue
          buf = readFileSync(dir + '/' + f)
        } catch { continue }
        let entries = []
        try { entries = f.endsWith('.ldb') ? parseLdbEntries(buf) : parseLogEntries(buf) } catch { continue }
        for (const c of extractTokenCandidates(entries)) {
          if (await validatePlatformToken(c)) { autoTokenCache.token = c; return c }
        }
      }
    }
  } catch { /* 自动读取失败静默 */ }
  return null
}

// 兼容整段粘贴：裸值 / 带引号 / 带 `Bearer ` 前缀 / 直接粘 localStorage 的 JSON 记录
// （{"value":"…","__version":"0"}）—— 用户从 DevTools 复制时经常带上这些壳。
function cleanPlatformToken(raw) {
  const stripQuotes = (s) => s.trim().replace(/^["']|["']$/g, '').trim()
  let v = stripQuotes(String(raw == null ? '' : raw))
  if (v.startsWith('{')) {
    try {
      const o = JSON.parse(v)
      if (o && typeof o.value === 'string') v = stripQuotes(o.value)
    } catch { /* 不是 JSON 就按原样用 */ }
  }
  return stripQuotes(v).replace(/^Bearer\s+/i, '').trim()
}

async function resolvePlatformToken(ctx) {
  const candidates = []
  try {
    const cred = await ctx.credentials.resolve('DEEPSEEK_PLATFORM_TOKEN')
    if (cred && cred.value) candidates.push({ raw: cred.value, source: 'DSH 凭据 DEEPSEEK_PLATFORM_TOKEN' })
  } catch { /* fallthrough */ }
  if (process.env.OGM_PLATFORM_TOKEN) candidates.push({ raw: process.env.OGM_PLATFORM_TOKEN, source: '环境变量 OGM_PLATFORM_TOKEN' })
  for (const c of candidates) {
    const token = cleanPlatformToken(c.raw)
    if (token) return { token, source: c.source }
  }
  const auto = await autoPlatformToken()
  return auto ? { token: cleanPlatformToken(auto), source: '浏览器 Local Storage（自动读取）' } : null
}

// 纯函数：官网两份载荷 → 面板要的当月用量（单测直接喂固定载荷，不联网）
function normalizePlatformUsage(amountPayload, costPayload, month, year) {
  const ab = amountPayload && amountPayload.data && amountPayload.data.biz_data
  const cb = costPayload && costPayload.data && (costPayload.data.biz_data || [])[0]
  if (!ab || !cb) return { ok: false, error: '官网用量响应格式异常（缺 biz_data）' }
  // 非数字 / 负值一律不进合计（官网偶尔给脏值，宁可少算也不把负数带进面板）
  const amtOf = (it) => {
    const n = Number(it && it.amount)
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  const sumUsage = (items) => {
    let tokens = 0, requests = 0
    for (const it of items || []) {
      const amt = amtOf(it)
      if (it && it.type === 'REQUEST') requests += amt
      else tokens += amt
    }
    return { tokens, requests }
  }
  const sumModels = (models) => {
    let tokens = 0, requests = 0
    for (const m of models || []) {
      const r = sumUsage(m && m.usage)
      tokens += r.tokens
      requests += r.requests
    }
    return { tokens, requests }
  }
  const sumCost = (items) => {
    let cost = 0
    for (const it of items || []) {
      if (it && it.type === 'REQUEST') continue
      cost += amtOf(it)
    }
    return cost
  }
  let totalTokens = 0, totalRequests = 0
  let topModel = null, topModelTokens = 0
  const category = { cacheHit: 0, cacheMiss: 0, response: 0 }
  const models = []
  for (const m of ab.total || []) {
    const { tokens, requests } = sumUsage(m && m.usage)
    totalTokens += tokens
    totalRequests += requests
    let h = 0, ms = 0, resp = 0
    for (const it of (m && m.usage) || []) {
      const amt = amtOf(it)
      if (it.type === 'PROMPT_CACHE_HIT_TOKEN') { category.cacheHit += amt; h += amt }
      else if (it.type === 'PROMPT_CACHE_MISS_TOKEN') { category.cacheMiss += amt; ms += amt }
      else if (it.type === 'RESPONSE_TOKEN') { category.response += amt; resp += amt }
    }
    if (tokens > topModelTokens) { topModelTokens = tokens; topModel = (m && m.model) || null }
    models.push({ model: (m && m.model) || null, tokens, requests, cacheHit: h, cacheMiss: ms, response: resp })
  }
  let totalCost = 0
  for (const m of cb.total || []) totalCost += sumCost(m && m.usage)

  const dayMap = new Map()
  const touch = (date) => {
    let e = dayMap.get(date)
    if (!e) { e = { date, tokens: 0, cost: 0, requests: 0 }; dayMap.set(date, e) }
    return e
  }
  for (const d of ab.days || []) {
    const { tokens, requests } = sumModels(d && d.data)
    const e = touch(d && d.date)
    e.tokens += tokens
    e.requests += requests
  }
  for (const d of cb.days || []) {
    let cost = 0
    for (const m of ((d && d.data) || [])) cost += sumCost(m && m.usage)
    touch(d && d.date).cost += cost
  }
  const days = [...dayMap.values()].sort((x, y) => (x.date < y.date ? -1 : 1))
  const activeDays = days.filter((d) => d.tokens > 0 || d.requests > 0).length
  return {
    ok: true,
    month, year,
    totalTokens,
    totalCost: Math.round(totalCost * 10000) / 10000,
    currency: cb.currency || 'CNY',
    requestCount: totalRequests,
    topModel,
    activeDays,
    category,
    models: models.sort((a, b) => b.tokens - a.tokens),
    dailyAvgTokens: activeDays ? Math.round(totalTokens / activeDays) : 0,
    dailyAvgCost: activeDays ? Math.round((totalCost / activeDays) * 10000) / 10000 : 0,
    days,
  }
}

async function queryDeepseekPlatformUsage(ctx) {
  const resolved = await resolvePlatformToken(ctx)
  if (!resolved) {
    return {
      ok: false,
      error: '未取到官网用量页 token：请在 DSH 凭据配置 DEEPSEEK_PLATFORM_TOKEN'
        + '（platform.deepseek.com 登录后，浏览器 DevTools → Application → Local Storage → userToken），'
        + '或确认 Chrome / Edge / 360 已登录过该站（插件会尽力从浏览器 Local Storage 自动读取）',
    }
  }
  const token = resolved.token
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const q = 'month=' + month + '&year=' + year
  const [amountRes, costRes] = await Promise.all([
    fetch(PLATFORM_AMOUNT_URL + '?' + q, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) }),
    fetch(PLATFORM_COST_URL + '?' + q, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) }),
  ])
  const [a, c] = await Promise.all([amountRes.json().catch(() => null), costRes.json().catch(() => null)])
  // 官网的鉴权失败是 HTTP 200 + code 40002/40003（实测），不能只看 HTTP 状态码
  const code = (a && a.code) || (c && c.code)
  if (code && code !== 0) {
    return {
      ok: false,
      error: '官网用量页 token 已失效（code ' + code + (a && a.msg ? ' ' + a.msg : '') + '）：'
        + '请登录 platform.deepseek.com 打开「用量」页 → F12 → Network → 找 usage/amount 或 usage/cost 请求 → '
        + 'Request Headers 里复制整条 authorization 的值（形如 Bearer …，可直接整段粘贴）填到 DSH 凭据 DEEPSEEK_PLATFORM_TOKEN'
        + '（当前来源：' + resolved.source + '。注意 localStorage 里的 userToken 可能是过期副本）',
      tokenSource: resolved.source,
    }
  }
  if (!amountRes.ok || !costRes.ok) {
    return { ok: false, error: '官网用量接口 HTTP ' + amountRes.status + '/' + costRes.status, tokenSource: resolved.source }
  }
  const norm = normalizePlatformUsage(a, c, month, year)
  if (!norm.ok) return { ...norm, tokenSource: resolved.source }
  return { ...norm, source: 'platform.deepseek.com', tokenSource: resolved.source, fetchedAt: Date.now() }
}

// ══════════════════════════════════════════════════════════════════════════════
// 自定义标签页（运行时增删的第三方余额接口）
// ══════════════════════════════════════════════════════════════════════════════
// 内置六个页的取数与凭据都写死在 host 里。若用户想加一个**任意**第三方余额接口，
// 不可能要求他改插件代码——于是提供这条通路：
//   · 标签页定义（名称 / 接口地址 / 取值字段…）持久化在下面的 JSON 文件里
//   · API key **只在 host 内存与这个文件里**，绝不下发到浏览器（sanitizeCustomTab 摘掉）
//   · 浏览器只调 /api/monitor/custom-balance?id=<tabId>，由 host 代发上游请求
//   · 这样浏览器侧永远看不到明文 key，也不会因为 CORS 而取不到数
//
// 配置文件位置：$DSH_HOME/dsh-opencode-go-monitor.json（可用 OGM_CONFIG 覆盖）
const CUSTOM_TABS_BASENAME = 'dsh-opencode-go-monitor.json'

function resolveDshHome() {
  return process.env.DSH_HOME || process.env.OGM_DSH_HOME
    || `${process.env.HOME || process.env.USERPROFILE || ''}/.dsh`
}

/** 自定义标签页配置文件路径（导出供单测与排错用）。 */
export function customTabsPath() {
  return process.env.OGM_CONFIG || `${resolveDshHome()}/${CUSTOM_TABS_BASENAME}`
}

// ══════════════════════════════════════════════════════════════════════════════
// 永久删除「内置」标签页（改插件自己的源码，不是前端隐藏）
// ══════════════════════════════════════════════════════════════════════════════
// 内置六个页写死在 client.js 的 TAB_DEFS 里，光靠前端隐藏只是「不显示」——
// 用户要的是**永久删除**，所以这里做外科式改写：把该页从 TAB_DEFS 与 DATA_SOURCES
// 两处删掉，并先把原文件备份到 backups/（删错了能手工还原）。
//
// 安全边界（都很重要）：
//   · 只能删内置页（BUILTIN_TAB_IDS 白名单），不接受任意标识符 → 无法借它做代码注入
//   · 只在两处**精确文本**上操作，不 eval、不动态 import 用户输入
//   · 改前必备份；改后用 node 的语法检查（new Function）确认没写坏，坏了就回滚
//   · 不允许把内置页删到一个都不剩（否则 DATA_SOURCES 全空，面板没有可显示的页）
const BUILTIN_TAB_IDS = ['ds', 'go', 'oc', 'hc', 'sf', 'bl']

/** client.js 的绝对路径：优先按本模块所在目录推导，推导不到再找常见部署位置。 */
export function resolveClientSource(moduleUrl = import.meta.url) {
  if (typeof moduleUrl === 'string' && moduleUrl.startsWith('file:')) {
    try {
      // fileURLToPath 是顶部已 import 的 ESM 工具；client.js 与 index.js 同目录
      const here = fileURLToPath(moduleUrl)
      const dir = here.slice(0, Math.max(here.lastIndexOf('/'), here.lastIndexOf('\\')))
      const cand = `${dir}/client.js`
      if (existsSync(cand)) return cand
    } catch { /* 落到下面的兜底 */ }
  }
  const home = process.env.DSH_HOME || process.env.OGM_DSH_HOME
    || `${process.env.HOME || process.env.USERPROFILE || ''}/.dsh`
  for (const cand of [
    `${home}/plugin-src/dsh-opencode-go-monitor/lib/client.js`,
    `${home}/profiles/node_modules/dsh-opencode-go-monitor/lib/client.js`,
  ]) {
    if (existsSync(cand)) return cand
  }
  return null
}

/** 用括号配对取出一段代码里的数组/对象字面量（跳过字符串与注释，容忍嵌套）。 */
export function extractDelimited(src, openIdx) {
  const open = src[openIdx]
  const close = open === '[' ? ']' : '}'
  let depth = 0, i = openIdx, mode = 'code'
  let quote = null
  while (i < src.length) {
    const c = src[i], n = src[i + 1]
    if (mode === 'line') { if (c === '\n') mode = 'code'; i++; continue }
    if (mode === 'block') { if (c === '*' && n === '/') { mode = 'code'; i += 2; continue } i++; continue }
    if (quote) { if (c === '\\') { i += 2; continue } if (c === quote) quote = null; i++; continue }
    if (c === '/' && n === '/') { mode = 'line'; i += 2; continue }
    if (c === '/' && n === '*') { mode = 'block'; i += 2; continue }
    if (c === "'" || c === '"') { quote = c; i++; continue }
    if (c === open) depth++
    else if (c === close) { depth--; if (depth === 0) return src.slice(openIdx, i + 1) }
    i++
  }
  return null
}

// 匹配 TAB_DEFS 里的一条：整行以 { id: 'xx' 开头（deleteBuiltinTabPermanently 用它做幂等判断）
const defEntryRe = (id) => new RegExp(`^[ \\t]*\\{[^\\n]*\\bid:\\s*['"]${id}['"][^\\n]*\\}[,]?[ \\t]*$`, 'm')

/**
 * 从 client.js 源码里永久删除一个内置页（纯字符串处理，便于单测）。
 * 只动 TAB_DEFS 与 DATA_SOURCES 两处；该页的渲染分支留着不选（是死代码，删它风险更大）。
 * @returns {{ code: string, removed: { def: string|null, source: string|null, dataSourcesEmptied: boolean } }}
 */
export function removeBuiltinTab(code, id) {
  const removed = { def: null, source: null, dataSourcesEmptied: false }

  // ══════════════════════════════════════════════════════════════════════════
  // 基于**行**的算法，而不是字符下标算术。
  // 这里踩过一串坑，根因都是「坐标串味」：extractDelimited 返回的是**子串**，
  // 而它的长度又受「闭合括号算不算在内」影响，于是 arrStart + arrBlock.length
  // 这类混算会把 `];` 切成 `;`，直接把源码改坏。
  // 本插件的 TAB_DEFS / DATA_SOURCES 都是**一条一行**的规范排版，按行增删最稳；
  // 改完另有语法自检兜底（见 deleteBuiltinTabPermanently，不合法就回滚）。
  // ══════════════════════════════════════════════════════════════════════════
  const lines = code.split('\n')

  /** 从 fromLine 起，找第 0 层闭合括号所在的行号（只看行内字符，够用且简单）。 */
  const findCloseLine = (fromLine, open, close) => {
    let depth = 0
    let started = false
    for (let i = fromLine; i < lines.length; i++) {
      const line = lines[i]
      for (let j = 0; j < line.length; j++) {
        const c = line[j]
        if (c === open) { depth++; started = true }
        else if (c === close) { depth--; if (started && depth === 0) return i }
      }
    }
    return -1
  }

  /** 去掉「新数组/对象里最后一条」的行尾逗号，避免留下悬空逗号。 */
  const dropTrailingComma = (openLine, closeLine, open, close) => {
    let last = closeLine - 1
    while (last > openLine && lines[last].trim() === '') last--
    if (last > openLine && /,[ \t]*$/.test(lines[last])) {
      lines[last] = lines[last].replace(/,[ \t]*$/, '')
    }
  }

  // ① TAB_DEFS 里那条定义
  {
    const declLine = lines.findIndex((l) => l.indexOf('const TAB_DEFS') >= 0)
    const openLine = declLine >= 0 ? lines.findIndex((l, i) => i >= declLine && l.indexOf('[') >= 0) : -1
    const closeLine = openLine >= 0 ? findCloseLine(openLine, '[', ']') : -1
    if (openLine >= 0 && closeLine >= 0) {
      const re = new RegExp(`^[ \t]*\\{[^\\n]*\\bid:\\s*['"]${id}['"][^\\n]*\\}[,]?[ \t]*$`)
      const target = lines.findIndex((l, i) => i >= openLine && i < closeLine && re.test(l))
      if (target >= 0) {
        removed.def = lines[target].trim()
        lines.splice(target, 1)
        const nc = findCloseLine(openLine, '[', ']')
        if (nc >= 0) dropTrailingComma(openLine, nc, '[', ']')
      }
    }
  }

  // ② DATA_SOURCES 里那条取数源
  {
    const dsLine = lines.findIndex((l) => l.indexOf('const DATA_SOURCES') >= 0)
    const openLine = dsLine >= 0 ? lines.findIndex((l, i) => i >= dsLine && l.indexOf('{') >= 0) : -1
    const closeLine = openLine >= 0 ? findCloseLine(openLine, '{', '}') : -1
    if (openLine >= 0 && closeLine >= 0) {
      const re = new RegExp(`^[ \t]*${id}:\\s*\\{`)
      const target = lines.findIndex((l, i) => i >= openLine && i < closeLine && re.test(l))
      if (target >= 0) {
        removed.source = lines[target].trim()
        // 单行条目（本行就含 }）只删一行；多行块一路删到它的闭合行
        const isBlock = !/\}/.test(lines[target])
        const endLine = isBlock ? findCloseLine(target, '{', '}') : target
        lines.splice(target, (endLine >= target ? endLine : target) - target + 1)
        const nc = findCloseLine(openLine, '{', '}')
        if (nc >= 0) {
          const body = lines.slice(openLine + 1, nc).join('').replace(/[\s{},]/g, '')
          removed.dataSourcesEmptied = body === ''
          dropTrailingComma(openLine, nc, '{', '}')
        }
      }
    }
  }

  return { code: lines.join('\n'), removed }
}

/**
 * 永久删除一个内置标签页：备份 → 改写 → 语法自检（坏了回滚）。
 * @returns 成功时给出备份路径与被删内容；失败抛错（调用方转成 HTTP 错误）。
 */
export async function deleteBuiltinTabPermanently(id, opts = {}) {
  const { readFile: rf, writeFile, mkdir, copyFile, rename } = await import('node:fs/promises')
  const { dirname, join } = await import('node:path')
  const file = opts.file || resolveClientSource()
  if (!file) throw new Error('找不到 client.js（插件源码路径无法解析）')
  if (BUILTIN_TAB_IDS.indexOf(id) < 0) throw new Error(`只能永久删除内置页（${BUILTIN_TAB_IDS.join(' / ')}），收到：${id}`)

  const code = await rf(file, 'utf8')
  // 先看它是不是已经被删过了（幂等）
  const defIdx = code.indexOf('const TAB_DEFS')
  const arrStart = code.indexOf('[', defIdx)
  const block = arrStart >= 0 ? extractDelimited(code, arrStart) : null
  if (!block || block.search(defEntryRe(id)) < 0) {
    return { ok: true, alreadyGone: true, id, file }
  }

  // 不允许删到一个都不剩：数一下 TAB_DEFS 里还剩几条
  const count = (block.match(/^[ \t]*\{[^\n]*\bid:\s*['"][^'"]+['"]/gm) || []).length
  if (count <= 1) throw new Error('至少要保留一个内置标签页，无法永久删除（否则面板没有可显示的页）')

  const { code: next, removed } = removeBuiltinTab(code, id)
  if (!removed.def) throw new Error('没有在 TAB_DEFS 里定位到该标签页（源码可能已被改动）')
  if (!removed.source) throw new Error(`定位到标签页定义但没找到它的取数源（DATA_SOURCES.${id}），为避免留下半个改动，已中止`)
  if (removed.dataSourcesEmptied) throw new Error('这次删除会让 DATA_SOURCES 变空，已中止')

  // 语法自检：坏代码绝不落盘
  try {
    // 用 Function 构造做纯语法检查（不执行）
    // eslint-disable-next-line no-new-func
    new Function(next)
  } catch (e) {
    throw new Error('改写后的源码语法检查未通过，已中止（原文件未改动）：' + String((e && e.message) || e))
  }

  // 备份（保留时间戳，可手工还原）
  const backupDir = opts.backupDir || join(dirname(file), '..', 'backups')
  await mkdir(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backup = join(backupDir, `client.before-delete-${id}-${stamp}.js`)
  await copyFile(file, backup)

  // 原子写回
  const tmp = `${file}.tmp`
  await writeFile(tmp, next, 'utf8')
  await rename(tmp, file)

  return { ok: true, id, file, backup, removed }
}

// ══════════════════════════════════════════════════════════════════════════════
// 「贴一个官网链接就自动建标签页」（懒人化的核心）
// ══════════════════════════════════════════════════════════════════════════════
// 目标：用户只输入 `https://platform.deepseek.com` 这种主站链接，就得到一个能用的标签页，
// 并自动判断该显示「钱包余额」「套餐剩余额度」还是「两者都显示」。
//
// 分三层，逐层降级，并把每层判断的依据（notes）如实交给用户，不假装成功：
//   ① 已知服务商目录：域名匹配 → 用官方余额接口 + 本插件已有的凭据，开箱即用
//   ② 常见余额端点探测：把候选路径打在域名上，挑「像余额」的那个（取到数才算命中）
//   ③ 都失败 → 返回可编辑的草稿（只填好名称与域名），让用户手工补接口地址
//
// 凭据：只引用「凭据名」，不碰值。DSH 凭据在 host 侧由 credentials 服务解析。
const PROVIDER_CATALOG = [
  {
    domains: ['platform.deepseek.com', 'deepseek.com', 'api.deepseek.com'],
    name: 'DeepSeek', short: 'DeepSeek', theme: '#3b82f6',
    // 官方余额接口给「充值余额」，查不到套餐窗口 → 钱包
    endpoints: [{ url: 'https://api.deepseek.com/user/balance' }],
    credential: 'DEEPSEEK_API_KEY',
    authKind: 'bearer',
    balance: { path: 'balance_infos.0.total_balance', label: '余额', unit: 'CNY', decimals: 2, format: 'number' },
    mode: 'wallet',
    note: '官方 /user/balance 只有充值余额（无套餐窗口），因此按「钱包余额」显示',
  },
  {
    domains: ['openrouter.ai', 'openrouter.com'],
    name: 'OpenRouter', short: 'OpenRouter', theme: '#8b5cf6',
    endpoints: [
      { url: 'https://openrouter.ai/api/v1/credits', auth: false, balancePath: 'data.total_credits' },
      { url: 'https://openrouter.ai/api/v1/key', auth: true, balancePath: 'data.limit_remaining' },
    ],
    credential: 'OPENROUTER_API_KEY',
    authKind: 'bearer',
    balance: { path: 'data.total_credits', label: '额度', unit: 'USD', decimals: 2, format: 'number' },
    mode: 'wallet',
    note: '顺带取 /api/v1/key 的 limit_remaining（如有），作为额度窗口显示',
    windows: [{ label: '额度', path: 'data.limit_remaining', resetPath: 'data.limit_reset', mode: 'remaining' }],
  },
  {
    domains: ['api.moonshot.cn', 'platform.moonshot.cn', 'moonshot.cn', 'kimi.com', 'platform.moonshot.com'],
    name: 'Moonshot (Kimi)', short: 'Moonshot', theme: '#0ea5e9',
    endpoints: [{ url: 'https://api.moonshot.cn/v1/users/me/balance' }],
    credential: 'MOONSHOT_API_KEY',
    authKind: 'bearer',
    balance: { path: 'data.available_balance', label: '可用余额', unit: 'CNY', decimals: 2, format: 'number' },
    mode: 'wallet',
    note: '官方 /v1/users/me/balance 同时给 available_balance 与 voucher_balance（钱包口径）',
  },
  {
    domains: ['siliconflow.cn', 'siliconflow.com', 'cloud.siliconflow.cn'],
    name: 'SiliconFlow', short: '硅基流动', theme: '#14b8a6',
    endpoints: [{ url: 'https://api.siliconflow.cn/v1/user/info' }],
    credential: 'SILICONFLOW_API_KEY',
    authKind: 'bearer',
    balance: { path: 'data.totalBalance', label: '余额', unit: 'CNY', decimals: 2, format: 'number' },
    mode: 'wallet',
    note: '官方 /v1/user/info 的 totalBalance / balance 是账户余额（钱包口径）',
  },
  {
    domains: ['api.commandcode.ai', 'commandcode.ai'],
    name: 'Command Code GOAT', short: 'GOAT', theme: '#f59e0b',
    // 与内置 GOAT 页同一接口：既有月额度（钱包式余额）又有 5 小时/每周窗口（套餐额度）
    endpoints: [{ url: 'https://api.commandcode.ai/alpha/billing/credits' }],
    credential: 'COMMANDCODE_API_KEY',
    authKind: 'bearer',
    balance: { path: 'data.credits.monthlyCredits', label: '月度余额', unit: 'USD', decimals: 2, format: 'number' },
    windows: [
      { label: '5小时', path: 'data.windowLimits.fiveHour.used', resetPath: 'data.windowLimits.fiveHour.resetAt', mode: 'used', capPath: 'data.windowLimits.fiveHour.cap' },
      { label: '每周', path: 'data.windowLimits.weekly.used', resetPath: 'data.windowLimits.weekly.resetAt', mode: 'used', capPath: 'data.windowLimits.weekly.cap' },
    ],
    mode: 'both',
    note: '同时有月度余额与 5 小时/每周滚动窗口 → 钱包 + 套餐额度都显示',
  },
  {
    domains: ['hyper.charm.land', 'charm.land'],
    name: 'Charm Hyper', short: 'Hyper', theme: '#ec4899',
    endpoints: [{ url: 'https://hyper.charm.land/v1/credits' }],
    credential: 'HYPER_API_KEY',
    authKind: 'bearer',
    balance: { path: 'balance', label: '余额', unit: 'hc', decimals: 2, format: 'number' },
    mode: 'wallet',
    note: '官方只有 /v1/credits 余额（实测无用量接口），按「钱包余额」显示',
  },
  {
    domains: ['platform.stepfun.com', 'stepfun.com', 'api.stepfun.com'],
    name: '阶跃星辰 StepFun', short: 'StepFun', theme: '#10b981',
    endpoints: [{ url: 'https://api.stepfun.com/v1/accounts', balancePath: 'balance' }],
    credential: 'STEPFUN_API_KEY',
    authKind: 'bearer',
    balance: { path: 'balance', label: '余额', unit: 'CNY', decimals: 2, format: 'number' },
    mode: 'wallet',
    note: '按量账户余额是钱包口径；订阅额度只在控制台内部 RPC 里（需 STEPFUN_CONSOLE_COOKIE），这里不假装能拿到',
  },
  {
    domains: ['bailian.console.aliyun.com', 'bailian.aliyun.com', 'aliyun.com'],
    name: '阿里云百炼 Token Plan', short: '百炼', theme: '#ff6a00',
    endpoints: [{ url: '', note: '控制台内部网关，需 BAILIAN_CONSOLE_COOKIE' }],
    credential: 'BAILIAN_CONSOLE_COOKIE',
    authKind: 'cookie',
    balance: { path: 'credit.remaining', label: '月额度', unit: 'Credits', decimals: 0, format: 'number' },
    mode: 'plan',
    internal: true,
    note: '额度只在控制台内部网关（需 Cookie），且个人版只有月窗口 → 按「套餐剩余额度」显示',
  },
]

/** 从任意链接里取出主机名（小写、去掉 www.）。 */
export function hostOf(url) {
  try {
    const u = new URL(String(url).trim())
    return (u.hostname || '').toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** 目录匹配：返回命中的服务商定义（含命中依据），没命中返回 null。 */
export function matchProvider(url) {
  const host = hostOf(url)
  if (!host) return null
  for (const p of PROVIDER_CATALOG) {
    for (const d of p.domains) {
      if (host === d || host.endsWith('.' + d)) {
        return { provider: p, host, matched: d }
      }
    }
  }
  return null
}

/**
 * 「像余额吗」判定：挑出数值型叶子字段，给它们打分，返回最像余额的那个。
 * 计分：字段名含 balance/credit/remaining/quota/available 加分；单位/货币名加分；负数与超大值扣分。
 */
export function guessBalanceField(json) {
  const hits = []
  const walk = (node, path, depth) => {
    if (depth > 6 || node === null || node === undefined) return
    if (typeof node === 'number' && Number.isFinite(node)) { hits.push({ path, value: node }); return }
    if (typeof node === 'string' && /^-?\d+(\.\d+)?$/.test(node)) { hits.push({ path, value: Number(node) }); return }
    if (typeof node !== 'object') return
    const keys = Array.isArray(node) ? node.map((_, i) => String(i)) : Object.keys(node)
    for (const k of keys) walk(node[k], path ? path + '.' + k : k, depth + 1)
  }
  walk(json, '', 0)
  if (hits.length === 0) return null
  const score = (h) => {
    const p = h.path.toLowerCase()
    let s = 0
    if (/balance/.test(p)) s += 40
    if (/credit/.test(p)) s += 30
    if (/remaining|available|left/.test(p)) s += 25
    if (/quota|limit/.test(p)) s += 15
    if (/total|amount|money|cash|fund/.test(p)) s += 12
    // 「已用/使用量」这类是消耗量，不是余额 → 明确减分
    if (/used|usage|consumed|spent|percent|rate|ratio/.test(p)) s -= 35
    if (/count|requests|tokens/.test(p)) s -= 25
    if (h.value < 0) s -= 20
    if (Math.abs(h.value) > 1e12) s -= 15
    // 越浅越可能是主字段
    s -= (h.path.split('.').length - 1) * 2
    return s
  }
  hits.sort((a, b) => score(b) - score(a))
  return { ...hits[0], score: score(hits[0]), candidates: hits.slice(0, 8) }
}

// 常见余额/额度端点候选（用于未知站点探测；要求返回 JSON，且字段「像余额」或「像套餐百分比」）
const PROBE_PATHS = [
  '/api/v1/credits', '/v1/credits', '/api/credits', '/credits',
  '/api/v1/balance', '/v1/balance', '/api/balance', '/balance',
  '/api/v1/user/info', '/v1/user/info', '/api/user/info', '/user/info',
  '/api/v1/me', '/v1/me',
  '/api/v1/users/me/balance', '/v1/users/me/balance',
  '/api/v1/usages', '/v1/usage', '/api/v1/usage', '/api/usage',
  '/api/v1/quota', '/v1/quota', '/api/quota',
  '/api/v1/subscription', '/v1/subscription',
  '/api/v1/key', '/v1/key',
]

/** 探测一个候选端点：能取到 JSON，且字段「像余额」或「像套餐百分比」才算命中。 */
async function probeEndpoint(base, path, headers, fetchImpl) {
  const url = base.replace(/\/+$/, '') + path
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 6000)
  try {
    const res = await fetchImpl(url, { headers, signal: ac.signal })
    if (!res.ok) return null
    const ct = String(res.headers && res.headers.get ? (res.headers.get('content-type') || '') : '')
    const text = await res.text()
    // 明确不是 JSON 就跳过，避免把整页 HTML 当数据
    if (ct && !/json/i.test(ct) && text.trim().slice(0, 1) !== '{') return null
    let json = null
    try { json = JSON.parse(text) } catch { return null }
    const guess = guessBalanceField(json)
    if (guess && guess.score >= 20) {
      return { url, path, field: guess.path, value: guess.value, score: guess.score, json, planLike: false }
    }
    // 只有百分比/已用量字段时，guessBalanceField 会因「不是余额」而给低分——
    // 但这类接口恰恰是「套餐剩余额度」的典型形态（如 { per1MonthPercentage: 0.06 }），
    // 所以要单独认一次，否则套餐类站点永远探测不到。
    const pct = findPercentField(json)
    if (pct) return { url, path, field: pct.path, value: pct.value, score: pct.score, json, planLike: true }
    return null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 找「百分比 / 已用量」型字段（套餐额度接口的典型形态）。 */
export function findPercentField(json) {
  const hits = []
  const walk = (node, path, depth) => {
    if (depth > 6 || node === null || node === undefined) return
    if (typeof node === 'number' && Number.isFinite(node)) { hits.push({ path, value: node }); return }
    if (typeof node === 'string' && /^-?\d+(\.\d+)?$/.test(node)) { hits.push({ path, value: Number(node) }); return }
    if (typeof node !== 'object') return
    const keys = Array.isArray(node) ? node.map((_, i) => String(i)) : Object.keys(node)
    for (const k of keys) walk(node[k], path ? path + '.' + k : k, depth + 1)
  }
  walk(json, '', 0)
  const score = (h) => {
    const p = h.path.toLowerCase()
    let s = 0
    if (/percent|percentage|pct|ratio|rate/.test(p)) s += 40
    if (/used|usage|consumed|spent/.test(p)) s += 20
    if (/remaining|left|available|quota|limit/.test(p)) s += 25
    if (h.value < 0 || h.value > 1e9) s -= 20
    s -= (h.path.split('.').length - 1) * 2
    return s
  }
  if (hits.length === 0) return null
  hits.sort((a, b) => score(b) - score(a))
  return score(hits[0]) >= 25 ? { ...hits[0], score: score(hits[0]) } : null
}

/**
 * 从任意链接识别出「该建一个怎样的标签页」。
 * @param inputUrl 用户贴的主站链接（可带路径）
 * @param opts.fetchImpl 可注入（单测用）；opts.headers 探测时带的头
 * @returns 可直接用于新建标签页的草稿 + 判断依据（notes）+ 置信度
 */
export async function discoverFromUrl(inputUrl, opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch
  const raw = String(inputUrl || '').trim()
  const host = hostOf(raw)
  const notes = []
  if (!host) throw new Error('请填完整的主站链接，例如 https://platform.deepseek.com')

  const newId = () => 'c_' + host.replace(/[^a-z0-9]/g, '').slice(0, 14) + '_' + Math.random().toString(36).slice(2, 6)

  // ── ① 已知服务商 ──
  const hit = matchProvider(raw)
  if (hit) {
    const p = hit.provider
    notes.push(`域名 ${host} 命中已知服务商「${p.name}」（匹配 ${hit.matched}）`)
    notes.push(p.mode === 'both'
      ? '该服务商同时提供余额与套餐窗口 → 两者都显示'
      : (p.mode === 'plan' ? '该服务商只有套餐/额度窗口 → 按套餐剩余额度显示' : '该服务商只有账户余额 → 按钱包余额显示'))
    if (p.note) notes.push(p.note)
    if (p.internal || !p.endpoints[0] || !p.endpoints[0].url) {
      // 内部网关类：没法直接探测，给出可编辑草稿 + 说明
      notes.push('该服务商的额度只在控制台内部网关（需 Cookie 凭据），已生成草稿但需要你确认接口地址')
      return {
        ok: true, confidence: 'medium', host, mode: p.mode, notes,
        authKind: p.authKind, credential: p.credential,
        draft: {
          id: newId(), name: p.name, short: p.short, theme: p.theme,
          url: raw, auth: { kind: p.authKind === 'cookie' ? 'header' : 'bearer' },
          balance: p.balance, windows: p.windows || [],
        },
      }
    }
    // 逐个候选端点实测，取第一个能取到「像余额」的
    for (const ep of p.endpoints) {
      if (!ep.url) continue
      const got = await probeEndpoint('', ep.url, {}, fetchImpl)
      if (got) {
        notes.push(`实测 ${ep.url} 取到 ${got.field} = ${got.value}（判定为钱包余额）`)
        const balance = ep.balancePath
          ? { ...p.balance, path: ep.balancePath }
          : p.balance
        return {
          ok: true, confidence: 'high', host, mode: p.mode, notes,
          authKind: p.authKind, credential: p.credential,
          sample: { field: got.field, value: got.value },
          draft: {
            id: newId(), name: p.name, short: p.short, theme: p.theme,
            url: ep.url, auth: { kind: p.authKind },
            balance, windows: p.windows || [],
          },
        }
      }
      notes.push(`候选端点 ${ep.url} 未取到可识别的余额字段（可能需要 API key 或接口已变）`)
    }
    notes.push('没能实测通过：已按该服务商的公开口径生成草稿，请填好 API key 后保存')
    return {
      ok: true, confidence: 'medium', host, mode: p.mode, notes,
      authKind: p.authKind, credential: p.credential,
      draft: {
        id: newId(), name: p.name, short: p.short, theme: p.theme,
        url: p.endpoints[0].url, auth: { kind: p.authKind },
        balance: p.balance, windows: p.windows || [],
      },
    }
  }

  // ── ② 未知站点：探测常见余额端点 ──
  notes.push(`域名 ${host} 不在已知服务商目录里，尝试探测常见余额端点`)
  const base = /^https?:\/\//i.test(raw) ? new URL(raw).origin : 'https://' + host
  const attempted = []
  for (const path of PROBE_PATHS) {
    const got = await probeEndpoint(base, path, opts.headers || {}, fetchImpl)
    attempted.push(path)
    if (got) {
      notes.push(`探测命中：${got.url} → 字段 ${got.field} = ${got.value}`)
      // 是「已用百分比」还是余额？已用/比例类 → 套餐额度；否则钱包
      const looksPlan = got.planLike || /percent|rate|ratio|used|usage/i.test(got.field)
      const mode = looksPlan ? 'plan' : 'wallet'
      if (looksPlan) {
        notes.push('命中字段名含 percent/used → 判定为套餐用量，按「套餐剩余额度」显示')
        return {
          ok: true, confidence: 'medium', host, mode, notes,
          authKind: 'none',
          draft: {
            id: newId(), name: host, short: host.split('.')[0].slice(0, 10), theme: '#64748b',
            url: got.url, auth: { kind: 'none' },
            balance: { path: 'balance', label: '余额', unit: '', decimals: 2, format: 'number' },
            windows: [{ label: '额度', path: got.field.replace(/^\./, ''), resetPath: '', mode: 'used' }],
          },
        }
      }
      return {
        ok: true, confidence: 'medium', host, mode, notes,
        authKind: 'none',
        draft: {
          id: newId(), name: host, short: host.split('.')[0].slice(0, 10), theme: '#64748b',
          url: got.url, auth: { kind: 'none' },
          balance: { path: got.field.replace(/^\./, ''), label: '余额', unit: '', decimals: 2, format: 'number' },
          windows: [],
        },
      }
    }
  }
  notes.push(`探测了 ${attempted.length} 个常见端点都没命中（可能：需登录 Cookie / 接口不是这些路径 / 返回的不是 JSON）`)

  // ── ③ 兜底：可编辑草稿 ──
  notes.push('已生成草稿：请到该网站 F12 → Network 里找返回余额的那个请求，把地址填进来')
  return {
    ok: true, confidence: 'low', host, mode: 'both', notes,
    authKind: 'none',
    draft: {
      id: newId(), name: host, short: host.split('.')[0].slice(0, 10), theme: '#64748b',
      url: base + '/', auth: { kind: 'none' },
      balance: { path: 'balance', label: '余额', unit: '', decimals: 2, format: 'number' },
      windows: [],
    },
  }
}

/** 读取自定义标签页存储；文件缺失/损坏一律退化成空表（绝不因配置坏了导致插件装不上）。 */
export function readCustomTabs(file = customTabsPath()) {
  try {
    if (!existsSync(file)) return { version: 1, tabs: [] }
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    const tabs = parsed && Array.isArray(parsed.tabs) ? parsed.tabs : []
    return { version: 1, tabs }
  } catch {
    return { version: 1, tabs: [] }
  }
}

/** 原子写：先写 .tmp 再 rename，避免写到一半断电留下半个 JSON。 */
async function writeCustomTabs(store, file = customTabsPath()) {
  const { writeFile, rename, mkdir } = await import('node:fs/promises')
  const { dirname } = await import('node:path')
  await mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await writeFile(tmp, JSON.stringify(store, null, 2), 'utf8')
  await rename(tmp, file)
}

const numOrNull = (v) => (Number.isFinite(Number(v)) ? Number(v) : null)

/**
 * 把存储里的一条自定义标签页，整理成「下发给浏览器」的形状。
 * **auth.value 必须在这里摘掉** —— 它是唯一的凭据泄露面。
 * @param raw - 配置文件里的一条记录。
 * @returns 不含凭据的标签页描述；非法记录返回 null。
 */
export function sanitizeCustomTab(raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  const url = typeof raw.url === 'string' ? raw.url.trim() : ''
  if (!id || !url) return null
  // 协议白名单放在这里（而不是只放在取数处）：坏地址在保存时就该被挡住，
  // 免得进了配置文件才在面板上表现为「取数失败」
  if (!/^https?:\/\//i.test(url)) return null
  const fmt = (raw.balance && raw.balance.format) || 'number'
  const source = (raw.auth && raw.auth.kind) === 'bearer' ? '自填 key（host 代理）' : '无鉴权（host 代理）'
  return {
    id,
    // url 不是凭据（用户自己填的接口地址），下发它便于设置页显示「这个页在取哪个接口」；
    // 真正的秘密是 auth.value，它绝不出现在这个对象里（见 test/custom-tabs.mjs 的泄露检查）。
    url,
    name: (typeof raw.name === 'string' && raw.name.trim()) || id,
    short: (typeof raw.short === 'string' && raw.short.trim()) || (typeof raw.name === 'string' && raw.name.trim()) || id,
    theme: (typeof raw.theme === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(raw.theme.trim())) ? raw.theme.trim() : '#64748b',
    intervalMs: Math.min(3600000, Math.max(5000, numOrNull(raw.intervalMs) ?? 60000)),
    custom: true,
    disabled: !!raw.disabled,
    source,
    balance: {
      path: (raw.balance && typeof raw.balance.path === 'string' && raw.balance.path.trim()) || 'balance',
      label: (raw.balance && typeof raw.balance.label === 'string' && raw.balance.label.trim()) || '余额',
      unit: (raw.balance && typeof raw.balance.unit === 'string') ? raw.balance.unit : '',
      decimals: Math.min(6, Math.max(0, numOrNull(raw.balance && raw.balance.decimals) ?? 2)),
      format: (fmt === 'credits' || fmt === 'percent' || fmt === 'raw') ? fmt : 'number',
    },
    windows: (Array.isArray(raw.windows) ? raw.windows : []).slice(0, 6).map((w) => ({
      label: (w && typeof w.label === 'string' && w.label.trim()) || '窗口',
      path: (w && typeof w.path === 'string' && w.path.trim()) || '',
      resetPath: (w && typeof w.resetPath === 'string' && w.resetPath.trim()) || '',
      mode: (w && w.mode === 'remaining') ? 'remaining' : 'used',
    })).filter((w) => w.path),
    note: (typeof raw.note === 'string' && raw.note.trim()) || '',
  }
}

/**
 * 按点路径从 JSON 里取字段：'data.credits.balance' → obj.data.credits.balance。
 * 支持数组下标（'items.0.value'）。取不到返回 undefined。
 */
export function extractPath(obj, path) {
  if (typeof path !== 'string' || path === '') return undefined
  let cur = obj
  for (const seg of path.split('.')) {
    if (cur === null || cur === undefined) return undefined
    cur = Array.isArray(cur) ? cur[Number(seg)] : cur[seg]
  }
  return cur
}

/** 归一化「重置时间」：epoch 秒 / epoch 毫秒 / ISO 字符串 → 毫秒；不识别返回 null。 */
export function normalizeResetValue(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  // 注意 0：Command Code 实测会在「窗口无用量」时把 resetAt 回成 0。
  // 0 必须当「没有重置时间」，绝不能让 Date.parse(String(0)) 变成 1970-01-01。
  if (Number.isFinite(n)) {
    if (n <= 0) return null
    // < 1e11 视为秒（1e11 ms ≈ 1973 年，真实毫秒时间戳远大于它）
    return n < 1e11 ? n * 1000 : n
  }
  const t = Date.parse(String(v))
  return Number.isFinite(t) ? t : null
}

/** 给自定义接口补默认请求头：Accept + User-Agent（不覆盖用户显式配置的）。 */
function resolveCustomHeaders(tab) {
  const h = { Accept: 'application/json', 'User-Agent': 'dsh-opencode-go-monitor/2.6' }
  const auth = (tab && tab.auth) || {}
  if (auth.kind === 'bearer') {
    const v = String(auth.value || '').trim()
    if (v) h.Authorization = /^bearer\s/i.test(v) ? v : `Bearer ${v}`
  } else if (auth.kind === 'header') {
    const name = String(auth.name || '').trim()
    const v = String(auth.value || '').trim()
    if (name && v) h[name] = v
  }
  return h
}

/**
 * 取一条自定义标签页的余额：host 代发上游请求 → 按字段路径取值 → 归一化给面板。
 * 用 tabId 而不是把 URL/凭据放进查询串，浏览器无法借这个端点探测别的主机。
 * @param raw - 配置文件里的原始记录（含凭据）。
 * @param fetchImpl - 可注入（单测用）；默认全局 fetch。
 */
export async function queryCustomTab(raw, fetchImpl = fetch) {
  const url = typeof raw.url === 'string' ? raw.url.trim() : ''
  if (!/^https?:\/\//i.test(url)) throw new Error('接口地址必须是 http(s):// 开头的完整地址')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  let resp
  try {
    resp = await fetchImpl(url, { headers: resolveCustomHeaders(raw), signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`接口 HTTP ${resp.status}: ${String(text).slice(0, 120)}`)
  }
  const body = await resp.json()
  const spec = sanitizeCustomTab(raw)
  const balanceRaw = extractPath(body, spec.balance.path)
  const balance = Number.isFinite(Number(balanceRaw)) ? Number(balanceRaw) : null
  // 配额窗口：只保留能算出百分比的（无字段就不渲染空进度条）
  const windows = spec.windows.map((w) => {
    const v = Number(extractPath(body, w.path))
    const pct = Number.isFinite(v) ? Math.max(0, Math.min(100, v <= 1 && v >= 0 ? v * 100 : v)) : null
    const resetRaw = w.resetPath ? extractPath(body, w.resetPath) : null
    return { label: w.label, usedPercent: pct, usedIsRemaining: w.mode === 'remaining', resetsAt: normalizeResetValue(resetRaw) }
  }).filter((w) => w.usedPercent !== null)
  // 一个数都没取到 → 明确报错（而不是编造 0）；并提示该填哪个字段路径
  if (balance === null && windows.length === 0) {
    throw new Error(`按字段路径没取到数值（余额路径「${spec.balance.path}」）。请检查该接口的响应结构，或改用返回 JSON 的地址`)
  }
  return {
    ok: true,
    custom: true,
    fetchedAt: Date.now(),
    balance,
    balanceFormat: spec.balance.format,
    unit: spec.balance.unit,
    decimals: spec.balance.decimals,
    balanceLabel: spec.balance.label,
    windows,
    source: spec.source,
    note: spec.note,
  }
}

// 内部工具导出：供 test/host-unit.mjs 做纯函数单测（DSH 装载只认 name / inject / apply）
// 放在各定义之后，避免模块加载期 TDZ 报错
export const __test = {
  sanitizeCustomTab, extractPath, normalizeResetValue, customTabsPath, queryCustomTab,
  BUILTIN_TAB_IDS, resolveClientSource, extractDelimited, removeBuiltinTab, deleteBuiltinTabPermanently,
  hostOf, matchProvider, guessBalanceField, findPercentField, discoverFromUrl, PROVIDER_CATALOG, PROBE_PATHS,
  normalizePlatformUsage, platformBrowserDirs, parseLogEntries, parseLdbEntries, extractTokenCandidates, joinP, cleanPlatformToken,
  sfNum, sfRate, sfEpochMs, sfJwtPayload, sfJwtExpMs, sfParseCredential, sfCookieMap, sfCookieString, sfNormalizePlan,
  bpNum, bpStr, bpRatioPct, bpDateMs, bpExpandEmbeddedJSON, bpFindObjectDeep, bpFindValueDeep, bpFindKeyedObject,
  bpTierName, bpTierKey, bpQuotaObjectFor, bpAddonQuotaFrom, bpParseCredential, bpEnvelopeError, bpNormalizePlan,
}

// ---------- 应用 ----------
export function apply(ctx) {
  let goCache = null
  let goAt = 0
  let dsCache = null
  let dsAt = 0
  let hyperCache = null
  let hyperAt = 0
  let ogCache = null
  let ogAt = 0
  let sfCache = null
  let sfAt = 0
  let bpCache = null
  let bpAt = 0
  let puCache = null
  let puAt = 0
  const sfPlanSource = createStepfunPlanSource(ctx)
  const bpPlanSource = createBailianPlanSource(ctx)

  async function statusCommandCode() {
    const now = Date.now()
    if (goCache && now - goAt < BALANCE_CACHE_MS) return goCache
    try {
      const payload = await queryCommandCodeBalance(ctx)
      goCache = payload
      goAt = now
      return payload
    } catch (e1) {
      try {
        const payload = await queryCommandCodeBalance(ctx)
        goCache = payload
        goAt = Date.now()
        return payload
      } catch (e2) {
        const msg = String((e2 && e2.message) || e2).slice(0, 200)
        if (goCache) return { ...goCache, stale: true, error: msg }
        return { ok: false, error: msg }
      }
    }
  }

  async function statusDeepseek() {
    const now = Date.now()
    if (dsCache && now - dsAt < DS_CACHE_MS) return dsCache
    try {
      const payload = await queryDeepseekBalance(ctx)
      dsCache = payload
      dsAt = now
      return payload
    } catch (e1) {
      try {
        const payload = await queryDeepseekBalance(ctx)
        dsCache = payload
        dsAt = Date.now()
        return payload
      } catch (e2) {
        const msg = String((e2 && e2.message) || e2).slice(0, 200)
        if (dsCache) return { ...dsCache, stale: true, error: msg }
        return { ok: false, error: msg }
      }
    }
  }

  async function statusHypercharm() {
    const now = Date.now()
    if (hyperCache && now - hyperAt < HYPER_CACHE_MS) return hyperCache
    try {
      const payload = await queryHypercharmBalance(ctx)
      hyperCache = payload
      hyperAt = now
      return payload
    } catch (e1) {
      try {
        const payload = await queryHypercharmBalance(ctx)
        hyperCache = payload
        hyperAt = Date.now()
        return payload
      } catch (e2) {
        const msg = String((e2 && e2.message) || e2).slice(0, 200)
        if (hyperCache) return { ...hyperCache, stale: true, error: msg }
        return { ok: false, error: msg }
      }
    }
  }

  async function statusOpencodeGo() {
    const now = Date.now()
    if (ogCache && now - ogAt < OG_CACHE_MS) return ogCache
    try {
      const payload = await queryOpencodeGoBalance(ctx)
      ogCache = payload
      ogAt = now
      return payload
    } catch (e1) {
      try {
        const payload = await queryOpencodeGoBalance(ctx)
        ogCache = payload
        ogAt = Date.now()
        return payload
      } catch (e2) {
        const msg = String((e2 && e2.message) || e2).slice(0, 200)
        if (ogCache) return { ...ogCache, stale: true, error: msg }
        return { ok: false, error: msg }
      }
    }
  }

  async function statusStepfun() {
    const now = Date.now()
    if (sfCache && now - sfAt < SF_PLAN_CACHE_MS) return sfCache
    try {
      const payload = await queryStepfunAll(ctx, sfPlanSource)
      sfCache = payload
      sfAt = now
      return payload
    } catch (e1) {
      try {
        const payload = await queryStepfunAll(ctx, sfPlanSource)
        sfCache = payload
        sfAt = Date.now()
        return payload
      } catch (e2) {
        const msg = String((e2 && e2.message) || e2).slice(0, 200)
        if (sfCache) return { ...sfCache, stale: true, error: msg }
        return { ok: false, error: msg }
      }
    }
  }

  async function statusBailianPlan() {
    const now = Date.now()
    if (bpCache && now - bpAt < BP_CACHE_MS) return bpCache
    try {
      const payload = await bpPlanSource.query()
      bpCache = payload
      bpAt = now
      return payload
    } catch (e1) {
      try {
        const payload = await bpPlanSource.query()
        bpCache = payload
        bpAt = Date.now()
        return payload
      } catch (e2) {
        const msg = String((e2 && e2.message) || e2).slice(0, 200)
        if (bpCache) return { ...bpCache, stale: true, error: msg }
        return { ok: false, error: msg }
      }
    }
  }

  // DeepSeek 官网用量（platform.deepseek.com 同源接口）：60s 内复用；失败时保留上一次结果并标 stale
  async function statusPlatformUsage() {
    const now = Date.now()
    if (puCache && now - puAt < PLATFORM_USAGE_CACHE_MS) return puCache
    try {
      const payload = await queryDeepseekPlatformUsage(ctx)
      if (!payload.ok) return puCache ? { ...puCache, stale: true, error: payload.error } : payload
      puCache = payload
      puAt = now
      return payload
    } catch (e) {
      const msg = String((e && e.message) || e).slice(0, 200)
      return puCache ? { ...puCache, stale: true, error: msg } : { ok: false, error: msg }
    }
  }

  function json(res, payload, code = 200) {
    res.statusCode = code
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(payload))
  }

  // DSH 的 webServer 不做 body 解析（路由拿到的是 Node 原生 req），所以自己收。
  // 上限 256 KB：防止别人往这个端点灌大数据。
  function readJsonBody(req) {
    return new Promise((resolve) => {
      let size = 0
      const chunks = []
      req.on('data', (c) => {
        size += c.length
        if (size > 262144) { req.destroy(); resolve(null); return }
        chunks.push(c)
      })
      req.on('end', () => {
        if (chunks.length === 0) { resolve({}); return }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch { resolve(null) }
      })
      req.on('error', () => resolve(null))
    })
  }

  const queryParam = (req, key) => {
    try { return new URL(req.url ?? '/', 'http://x').searchParams.get(key) } catch { return null }
  }

  ctx.effect(() => {
    const disposeRoutes = []
    disposeRoutes.push(ctx.webServer.register({
      kind: 'exact',
      path: '/api/commandcode-goat/balance',
      handler: async (_req, res) => {
        try { json(res, await statusCommandCode()) } catch (e) { json(res, { ok: false, error: String((e && e.message) || e).slice(0, 200) }, 500) }
      },
    }))
    disposeRoutes.push(ctx.webServer.register({
      kind: 'exact',
      path: '/api/deepseek/balance',
      handler: async (_req, res) => {
        try { json(res, await statusDeepseek()) } catch (e) { json(res, { ok: false, error: String((e && e.message) || e).slice(0, 200) }, 500) }
      },
    }))
    disposeRoutes.push(ctx.webServer.register({
      kind: 'exact',
      path: '/api/opencode-go/balance',
      handler: async (_req, res) => {
        try { json(res, await statusOpencodeGo()) } catch (e) { json(res, { ok: false, error: String((e && e.message) || e).slice(0, 200) }, 500) }
      },
    }))
    disposeRoutes.push(ctx.webServer.register({
      kind: 'exact',
      path: '/api/hypercharm/balance',
      handler: async (_req, res) => {
        try { json(res, await statusHypercharm()) } catch (e) { json(res, { ok: false, error: String((e && e.message) || e).slice(0, 200) }, 500) }
      },
    }))
    disposeRoutes.push(ctx.webServer.register({
      kind: 'exact',
      path: '/api/stepfun/balance',
      handler: async (_req, res) => {
        try { json(res, await statusStepfun()) } catch (e) { json(res, { ok: false, error: String((e && e.message) || e).slice(0, 200) }, 500) }
      },
    }))
    // 只取 Step Plan 订阅额度（调试/独立取数用，不依赖 STEPFUN_API_KEY）
    disposeRoutes.push(ctx.webServer.register({
      kind: 'exact',
      path: '/api/stepfun/plan',
      handler: async (_req, res) => {
        try { json(res, await sfPlanSource.query()) } catch (e) { json(res, { ok: false, error: String((e && e.message) || e).slice(0, 200) }, 500) }
      },
    }))
    // 阿里云百炼 Token Plan 个人版套餐额度（控制台网关；凭据 BAILIAN_CONSOLE_COOKIE）
    disposeRoutes.push(ctx.webServer.register({
      kind: 'exact',
      path: '/api/bailian/plan',
      handler: async (_req, res) => {
        try { json(res, await statusBailianPlan()) } catch (e) { json(res, { ok: false, error: String((e && e.message) || e).slice(0, 200) }, 500) }
      },
    }))
    // DeepSeek 官网用量页（platform.deepseek.com 同源接口；需 DEEPSEEK_PLATFORM_TOKEN 或浏览器登录态）
    disposeRoutes.push(ctx.webServer.register({
      kind: 'exact',
      path: '/api/deepseek/usage',
      handler: async (_req, res) => {
        try { json(res, await statusPlatformUsage()) } catch (e) { json(res, { ok: false, error: String((e && e.message) || e).slice(0, 200) }, 500) }
      },
    }))

    // ── 自定义标签页：增删改查（凭据只留在 host；列表不含 auth.value） ──
    disposeRoutes.push(ctx.webServer.register({
      kind: 'exact',
      path: '/api/monitor/tabs',
      handler: async (req, res) => {
        try {
          const store = readCustomTabs()
          if ((req.method || 'GET').toUpperCase() === 'GET') {
            const tabs = store.tabs.map(sanitizeCustomTab).filter(Boolean)
            json(res, { ok: true, tabs, file: customTabsPath(), hasSecrets: store.tabs.some((t) => t && t.auth && t.auth.value) })
            return
          }
          // 写操作：DSH 的 webServer 不解析 body，脚本/测试也可用 ?action= 免发包
          const body = await readJsonBody(req)
          const action = String((body && body.action) || queryParam(req, 'action') || '')
          const id = String((body && body.id) || queryParam(req, 'id') || '').trim()
          if (action === 'add' || action === 'update') {
            const spec = (body && body.tab) || (body && body.spec)
            if (!spec || typeof spec !== 'object') { json(res, { ok: false, error: '缺少 tab 定义' }, 400); return }
            if (!id) { json(res, { ok: false, error: '缺少 id' }, 400); return }
            if (!/^c_[A-Za-z0-9_-]{1,48}$/.test(id)) { json(res, { ok: false, error: 'id 必须以 c_ 开头且只含字母数字下划线中划线' }, 400); return }
            if (action === 'add' && store.tabs.some((t) => t && t.id === id)) { json(res, { ok: false, error: '同名标签页已存在：' + id }, 409); return }
            // 保留原有 id/url 时序：update 时不传 auth.value 表示「保持原凭据不变」
            const prev = store.tabs.find((t) => t && t.id === id) || null
            const next = { ...(spec || {}), id }
            if (prev && prev.auth && prev.auth.value && (!next.auth || next.auth.value === undefined || next.auth.value === null || next.auth.value === '')) {
              next.auth = { ...(next.auth || prev.auth), value: prev.auth.value }
            }
            const clean = sanitizeCustomTab(next)
            if (!clean) {
              json(res, {
                ok: false,
                error: /^\w+:\/\//.test(String(next.url || '').trim())
                  ? '接口地址必须以 http:// 或 https:// 开头（不支持其它协议）'
                  : '标签页定义不完整（至少需要 id 与 http(s) 接口地址）',
              }, 400)
              return
            }
            const rest = store.tabs.filter((t) => !t || t.id !== id)
            // 落盘的是原始定义（含 auth），列表下发的是 sanitize 后的（不含 auth）
            store.tabs = [...rest, { ...next, id, disabled: !!(next.disabled) }]
            await writeCustomTabs(store)
            json(res, { ok: true, tab: clean, file: customTabsPath() })
            return
          }
          if (action === 'delete') {
            if (!id) { json(res, { ok: false, error: '缺少 id' }, 400); return }
            const before = store.tabs.length
            store.tabs = store.tabs.filter((t) => !t || t.id !== id)
            await writeCustomTabs(store)
            json(res, { ok: true, removed: before - store.tabs.length, file: customTabsPath() })
            return
          }
          if (action === 'toggle') {
            const hit = store.tabs.find((t) => t && t.id === id)
            if (!hit) { json(res, { ok: false, error: '找不到标签页：' + id }, 404); return }
            const wantDisabled = (body && typeof body.disabled === 'boolean') ? body.disabled : !hit.disabled
            hit.disabled = !!wantDisabled
            await writeCustomTabs(store)
            json(res, { ok: true, id, disabled: !!hit.disabled })
            return
          }
          json(res, { ok: false, error: '未知 action（add / update / delete / toggle）' }, 400)
        } catch (e) {
          json(res, { ok: false, error: String((e && e.message) || e).slice(0, 300) }, 500)
        }
      },
    }))
    // ── 自定义标签页：代取余额（凭据不出 host；浏览器无法借它探测任意 URL） ──
    disposeRoutes.push(ctx.webServer.register({
      kind: 'exact',
      path: '/api/monitor/custom-balance',
      handler: async (req, res) => {
        try {
          const id = String(queryParam(req, 'id') || '').trim()
          if (!id) { json(res, { ok: false, error: '缺少 id' }, 400); return }
          const hit = readCustomTabs().tabs.find((t) => t && t.id === id)
          if (!hit) { json(res, { ok: false, error: '找不到自定义标签页：' + id }, 404); return }
          json(res, await queryCustomTab(hit))
        } catch (e) {
          json(res, { ok: false, error: String((e && e.message) || e).slice(0, 300) })
        }
      },
    }))

    // ── 内置标签页：**永久删除**（改插件自己的源码；改前备份，改后语法自检） ──
    // 这是唯一会写 lib/client.js 的接口，所以要求显式 confirm，且只认白名单里的内置 id。
    disposeRoutes.push(ctx.webServer.register({
      kind: 'exact',
      path: '/api/monitor/builtin-tabs/delete',
      handler: async (req, res) => {
        try {
          const body = await readJsonBody(req)
          const id = String((body && body.id) || '').trim()
          if (!id) { json(res, { ok: false, error: '缺少 id' }, 400); return }
          if (!(body && body.confirm === true)) {
            json(res, { ok: false, error: '永久删除需要确认（confirm:true）：它会改写插件源码' }, 400)
            return
          }
          const result = await deleteBuiltinTabPermanently(id)
          json(res, {
            ...result,
            hint: result.alreadyGone
              ? '该页此前已被永久删除（源码里已无此定义）'
              : '已从源码删除该标签页。刷新浏览器页面即可看到效果；备份在 ' + result.backup + '，需要还原就把备份覆盖回 lib/client.js。',
          })
        } catch (e) {
          json(res, { ok: false, error: String((e && e.message) || e).slice(0, 400) }, 400)
        }
      },
    }))

    // ── 贴一个官网链接 → 自动识别该建怎样的标签页（懒人化的入口） ──
    disposeRoutes.push(ctx.webServer.register({
      kind: 'exact',
      path: '/api/monitor/discover',
      handler: async (req, res) => {
        try {
          const body = await readJsonBody(req)
          const url = String((body && body.url) || queryParam(req, 'url') || '').trim()
          if (!url) { json(res, { ok: false, error: '缺少 url（贴主站链接，如 https://platform.deepseek.com）' }, 400); return }
          // 用户在表单里填的 key 一并带上：有些服务商必须带 key 才给余额
          const key = String((body && body.key) || '').trim()
          const headers = key ? { Authorization: /^bearer\s/i.test(key) ? key : `Bearer ${key}` } : {}
          json(res, await discoverFromUrl(url, { headers }))
        } catch (e) {
          json(res, { ok: false, error: String((e && e.message) || e).slice(0, 300) }, 400)
        }
      },
    }))

    return () => { for (const d of disposeRoutes) try { d() } catch {} }
  }, 'balance-window: /api routes')
}