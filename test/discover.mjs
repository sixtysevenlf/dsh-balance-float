// discover.mjs — 「贴官网链接自动识别余额接口」的测试
//   这是个"猜"的功能，所以重点测：
//     ① 域名匹配（含子域、大小写、带路径）
//     ② 「像余额」打分：余额 vs 已用量 vs token 计数，不能把 used 当余额
//     ③ 已知服务商：实测命中 → high；实测失败 → 仍给 medium 草稿并说明
//     ④ 未知站点：探测命中 → 按字段名判断「钱包」还是「套餐额度」
//     ⑤ 全都失败 → low 草稿 + 明确指引（不假装成功）
//   全程注入 fetch，不出网。
// 用法：node test/discover.mjs
import { __test } from '../lib/index.js'

const { hostOf, matchProvider, guessBalanceField, discoverFromUrl, PROBE_PATHS, PROVIDER_CATALOG } = __test

let failed = 0
const ok = (cond, msg) => { if (!cond) failed++; console.log((cond ? 'PASS ' : 'FAIL ') + msg) }
const eq = (a, b, msg) => ok(Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b), msg + '（实际 ' + JSON.stringify(a) + '）')

// 造一个可控的假网络：按 **URL 路径** 匹配（因为探测会把候选路径拼在不同主机上）；
// 未映射的一律 404（和真实站点对未知路径的行为一致）
const mkFetch = (table) => {
  const calls = []
  const fn = async (url, init) => {
    const u = String(url)
    calls.push(u)
    let path = ''
    try { path = new URL(u).pathname } catch { path = u }
    const hit = table[u] !== undefined ? table[u] : table[path]
    if (hit === undefined) {
      return { ok: false, status: 404, headers: { get: () => 'text/html' }, text: async () => '<html>404</html>' }
    }
    const body = typeof hit === 'string' ? hit : JSON.stringify(hit)
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => body }
  }
  fn.calls = calls
  return fn
}

// ═══ ① 域名解析与匹配 ═════════════════════════════════════════════════════════
eq(hostOf('https://platform.deepseek.com/usage?x=1'), 'platform.deepseek.com', '① 从带路径/参数的链接取主机名')
eq(hostOf('http://WWW.OpenRouter.AI/keys'), 'openrouter.ai', '① 去 www、统一小写')
eq(hostOf('not a url'), '', '① 非法链接 → 空主机名')
eq(matchProvider('https://platform.deepseek.com').provider.name, 'DeepSeek', '① 命中 DeepSeek')
eq(matchProvider('https://api.deepseek.com/user/balance').provider.name, 'DeepSeek', '① 子域也算命中（同一服务商多域名）')
eq(matchProvider('https://openrouter.ai/keys').provider.name, 'OpenRouter', '① 命中 OpenRouter')
eq(matchProvider('https://www.siliconflow.cn/account/ak').provider.name, 'SiliconFlow', '① 命中 SiliconFlow')
eq(matchProvider('https://example.com'), null, '① 未知域名 → null')
ok(PROVIDER_CATALOG.length >= 6, '① 目录里至少 6 个服务商（' + PROVIDER_CATALOG.length + '）')

// ═══ ② 「像余额」打分 ═════════════════════════════════════════════════════════
{
  const g1 = guessBalanceField({ data: { total_credits: 12.5, used: 99 } })
  eq(g1.path, 'data.total_credits', '② 余额字段胜过 used')

  const g2 = guessBalanceField({ balance: 3, balance_used: 88 })
  eq(g2.path, 'balance', '② 精确的 balance 胜出')

  const g3 = guessBalanceField({ data: { available_balance: '7.25' } })
  eq(g3.path, 'data.available_balance', '② 字符串数字也能识别')
  eq(g3.value, 7.25, '② 字符串数字转成数值')

  const g4 = guessBalanceField({ usage: { percent: 42 }, requests: 1000 })
  ok(g4 === null || g4.score < 20, '② 只有用量/计数时不给高置信候选（实际 ' + JSON.stringify(g4 && g4.path) + '）')

  eq(guessBalanceField({ hello: 'world' }), null, '② 没有数值字段 → null')
  eq(guessBalanceField(null), null, '② null 不抛')

  const deep = guessBalanceField({ a: { b: { c: { d: { balance: 1.5 } } } } })
  eq(deep.path, 'a.b.c.d.balance', '② 深层字段也能挖到')
}

// ═══ ③ 已知服务商：接口实测命中 → high ═══════════════════════════════════════
{
  const fetchImpl = mkFetch({
    'https://api.deepseek.com/user/balance': { balance_infos: [{ currency: 'CNY', total_balance: '2.77' }], is_available: true },
  })
  const r = await discoverFromUrl('https://platform.deepseek.com/usage', { fetchImpl })
  eq(r.ok, true, '③ 返回 ok')
  eq(r.confidence, 'high', '③ 实测命中 → 高置信')
  eq(r.mode, 'wallet', '③ DeepSeek 只有充值余额 → wallet 模式')
  eq(r.draft.name, 'DeepSeek', '③ 草稿带服务商名')
  eq(r.draft.balance.path, 'balance_infos.0.total_balance', '③ 草稿的直接取值路径可供 host 按路径取')
  ok(r.notes.join(' ').includes('命中已知服务商'), '③ 说明了命中依据')
  ok(r.notes.some((n) => /取到|实测/.test(n)), '③ 说明了实测结果')
  ok(fetchImpl.calls.length >= 1, '③ 真的发了探测请求')
}

// ═══ ③b 已知服务商但接口取不到 → 仍给 medium 草稿，且如实说明 ═══════════════
{
  const fetchImpl = mkFetch({})   // 全部 404
  const r = await discoverFromUrl('https://openrouter.ai/keys', { fetchImpl })
  eq(r.ok, true, '③b 仍然返回草稿（不因为取不到就让功能不可用）')
  eq(r.confidence, 'medium', '③b 未实测通过 → 降到 medium')
  eq(r.draft.name, 'OpenRouter', '③b 用目录里的官方口径')
  ok(/未取到|没能实测/.test(r.notes.join(' ')), '③b 如实说明没实测通过')
}

// ═══ ③c 「两者都显示」的服务商 → mode=both ═══════════════════════════════════
{
  const fetchImpl = mkFetch({
    'https://api.commandcode.ai/alpha/billing/credits': { data: { credits: { monthlyCredits: 12.5 }, windowLimits: { fiveHour: { cap: 100, used: 10 } } } },
  })
  const r = await discoverFromUrl('https://commandcode.ai/settings', { fetchImpl })
  eq(r.mode, 'both', '③c GOAT 同时有余额与窗口 → both')
  ok(r.draft.windows.length >= 2, '③c 草稿带套餐窗口（' + r.draft.windows.length + ' 个）')
  ok(r.draft.balance && r.draft.balance.path, '③c 草稿带余额取值路径')
  ok(r.notes.join(' ').includes('两者都显示'), '③c 说明会两者都显示')
}

// ═══ ③d 内部网关类：给草稿并说明需要 Cookie ══════════════════════════════════
{
  const fetchImpl = mkFetch({})
  const r = await discoverFromUrl('https://bailian.console.aliyun.com/', { fetchImpl })
  eq(r.ok, true, '③d 内部网关类也能给草稿')
  ok(/内部网关|Cookie/.test(r.notes.join(' ')), '③d 说明额度只在控制台内部网关')
  eq(r.authKind, 'cookie', '③d 标明需要 Cookie 凭据')
}

// ═══ ④ 未知站点：探测命中 ═════════════════════════════════════════════════════
{
  const fetchImpl = mkFetch({
    'https://api.acme.dev/api/v1/balance': { balance: 42.5 },
  })
  const r = await discoverFromUrl('https://api.acme.dev/dashboard', { fetchImpl })
  eq(r.confidence, 'medium', '④ 未知站点探测命中 → medium')
  eq(r.mode, 'wallet', '④ 数值型余额字段 → wallet 模式')
  eq(r.draft.url, 'https://api.acme.dev/api/v1/balance', '④ 草稿填的就是探测到的端点')
  eq(r.draft.balance.path, 'balance', '④ 草稿带探测到的字段路径')
  ok(r.notes.join(' ').includes('探测命中'), '④ 说明是探测命中')
}

// ═══ ④b 探测命中「已用百分比」→ 判为套餐额度 ═════════════════════════════════
{
  const fetchImpl = mkFetch({
    'https://plan.acme.dev/v1/usage': { data: { used_percent: 35 } },
  })
  const r = await discoverFromUrl('https://plan.acme.dev/', { fetchImpl })
  eq(r.mode, 'plan', '④b 字段名含 used/percent → plan 模式')
  ok(r.draft.windows.length === 1, '④b 草稿把它填成窗口')
  ok(r.notes.join(' ').includes('套餐'), '④b 说明按套餐额度显示')
}

// ═══ ⑤ 全失败 → low 草稿 + 指引 ══════════════════════════════════════════════
{
  const fetchImpl = mkFetch({})
  const r = await discoverFromUrl('https://nobody.example/', { fetchImpl })
  eq(r.confidence, 'low', '⑤ 探测全失败 → low')
  ok(r.notes.join(' ').includes('F12'), '⑤ 给出下一步指引（F12 找接口）')
  ok(fetchImpl.calls.length >= PROBE_PATHS.length, '⑤ 确实把候选路径都试了一遍（' + fetchImpl.calls.length + ' 次）')
  ok(!!r.draft && !!r.draft.name, '⑤ 仍然给一个可编辑草稿')
}

// ═══ ⑤b 非法链接 ══════════════════════════════════════════════════════════════
{
  let err = null
  try { await discoverFromUrl('随便写点什么', { fetchImpl: mkFetch({}) }) } catch (e) { err = e.message }
  ok(err && err.includes('主站链接'), '⑤b 非法链接给出可操作的报错（' + err + '）')
}

console.log(failed === 0 ? 'DISCOVER_OK' : 'DISCOVER_FAILED: ' + failed)
process.exit(failed === 0 ? 0 : 1)
