/**
 * 余额悬浮窗（精简版：仅余额显示）—— host 半
 * 提供四个同源路由：
 *   GET /api/commandcode-goat/balance — Command Code GOAT 官方额度（https://api.commandcode.ai/alpha/billing/credits），60s 缓存
 *   GET /api/deepseek/balance         — DeepSeek 官方余额（https://api.deepseek.com/user/balance），5s 缓存
 *   GET /api/opencode-go/balance      — OpenCode Go 额度（https://opencode.ai/zen/go/v1/usage：滚动/每周/每月三窗口），60s 缓存
 *   GET /api/hypercharm/balance       — Charm Hyper 余额（https://hyper.charm.land/v1/credits，单位 hypercredits），30s 缓存
 *   GET /api/stepfun/balance          — 阶跃星辰 StepFun：Step Plan 订阅额度（控制台 RPC）+ 按量账户余额
 *                                       （https://api.stepfun.com/v1/accounts），30s 缓存
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
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
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
    headers: { Authorization: 'Bearer ' + key, 'User-Agent': 'dsh-opencode-go-monitor/1.0' },
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
      try { data = JSON.parse(text) } catch { throw new Error('控制台令牌续期响应异常') }
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
export const __test = { sfNum, sfRate, sfEpochMs, sfJwtPayload, sfJwtExpMs, sfParseCredential, sfCookieMap, sfCookieString, sfNormalizePlan }

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
  const sfPlanSource = createStepfunPlanSource(ctx)

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

  function json(res, payload, code = 200) {
    res.statusCode = code
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(payload))
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
    return () => { for (const d of disposeRoutes) try { d() } catch {} }
  }, 'balance-window: /api routes')
}