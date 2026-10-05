// custom-tabs.mjs — 自定义标签页（运行时增删的第三方接口页）单测
//   覆盖：凭据不出 host（sanitize）、点路径取值、时间戳归一化、
//         代取余额的完整路径（含鉴权头 / 两种窗口口径 / 空结果报错 / 非 http 拒绝 / HTTP 失败）、
//         配置读写与损坏容错
// 用法：node test/custom-tabs.mjs
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  sanitizeCustomTab, extractPath, normalizeResetValue, queryCustomTab, readCustomTabs, customTabsPath,
} from '../lib/index.js'

let failed = 0
const ok = (cond, msg) => { if (!cond) failed++; console.log((cond ? 'PASS ' : 'FAIL ') + msg) }
const eq = (a, b, msg) => ok(Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b), msg + '（实际 ' + JSON.stringify(a) + '）')

// ═══ 1. 凭据绝不下发浏览器 ════════════════════════════════════════════════════
// 这是整个自定义页功能的安全底线：sanitize 的输出会原样进浏览器。
const SECRET = 'sk-live-DO-NOT-LEAK-0123456789'
const full = {
  id: 'c_openrouter', name: 'OpenRouter', short: 'OR', theme: '#8b5cf6', intervalMs: 45000,
  url: 'https://openrouter.ai/api/v1/credits',
  auth: { kind: 'bearer', value: SECRET },
  balance: { path: 'data.total_credits', label: '额度', unit: 'USD', decimals: 4, format: 'credits' },
  windows: [{ label: '每周', path: 'data.weekly.used', resetPath: 'data.weekly.resetAt', mode: 'used' }],
}
const spec = sanitizeCustomTab(full)
eq(spec.id, 'c_openrouter', 'sanitize：保留 id')
eq(spec.name, 'OpenRouter', 'sanitize：保留名称')
eq(spec.theme, '#8b5cf6', 'sanitize：保留合法主题色')
eq(spec.intervalMs, 45000, 'sanitize：保留轮询间隔')
eq(spec.balance.path, 'data.total_credits', 'sanitize：保留余额字段路径')
eq(spec.balance.format, 'credits', 'sanitize：保留格式化方式')
eq(spec.windows.length, 1, 'sanitize：保留窗口定义')
eq(spec.custom, true, 'sanitize：标记为自定义页')
// 泄露面检查：序列化后不得出现 key 本身，也不得残留 auth 字段
const serialized = JSON.stringify(spec)
ok(serialized.indexOf(SECRET) < 0, 'sanitize：密钥不出现在下发对象里')
ok(serialized.indexOf('"auth"') < 0, 'sanitize：不下发 auth 字段')
ok(typeof spec.source === 'string' && spec.source.length > 0, 'sanitize：给出数据来源说明（' + spec.source + '）')

// 非法输入 → null（不让坏配置把面板搞崩）
eq(sanitizeCustomTab(null), null, 'sanitize：null → null')
eq(sanitizeCustomTab({ name: '缺 id', url: 'https://x/y' }), null, 'sanitize：缺 id → null')
eq(sanitizeCustomTab({ id: 'c_x', url: 'ftp://x/y' }), null, 'sanitize：非 http(s) 地址 → null')

// 字段缺省与夹取
const bare = sanitizeCustomTab({ id: 'c_bare', url: 'https://x/y' })
eq(bare.name, 'c_bare', 'sanitize：无名称时用 id 兜底')
eq(bare.short, 'c_bare', 'sanitize：无短名时用 id 兜底')
eq(bare.theme, '#64748b', 'sanitize：非法主题色 → 默认灰')
eq(bare.intervalMs, 60000, 'sanitize：默认轮询 60s')
eq(bare.balance.path, 'balance', 'sanitize：默认余额字段路径 balance')
eq(bare.balance.decimals, 2, 'sanitize：默认 2 位小数')
eq(bare.windows.length, 0, 'sanitize：无窗口')
eq(sanitizeCustomTab({ id: 'c_t', url: 'https://x/y', intervalMs: 1 }).intervalMs, 5000, 'sanitize：间隔下限夹到 5s')
eq(sanitizeCustomTab({ id: 'c_t', url: 'https://x/y', intervalMs: 9e9 }).intervalMs, 3600000, 'sanitize：间隔上限夹到 1h')
eq(sanitizeCustomTab({ id: 'c_t', url: 'https://x/y', balance: { format: 'nonsense' } }).balance.format, 'number', 'sanitize：未知格式 → number')

// ═══ 2. 点路径取值 ═════════════════════════════════════════════════════════════
const doc = { data: { credits: { balance: 12.5 }, items: [{ v: 1 }, { v: 2 }] }, top: 7 }
eq(extractPath(doc, 'data.credits.balance'), 12.5, 'extractPath：嵌套对象')
eq(extractPath(doc, 'data.items.1.v'), 2, 'extractPath：数组下标')
eq(extractPath(doc, 'top'), 7, 'extractPath：顶层字段')
eq(extractPath(doc, 'data.nope.deep'), undefined, 'extractPath：中途缺失 → undefined')
eq(extractPath(doc, ''), undefined, 'extractPath：空路径 → undefined')
eq(extractPath(null, 'a.b'), undefined, 'extractPath：null 对象不抛')

// ═══ 3. 重置时间归一化 ═════════════════════════════════════════════════════════
eq(normalizeResetValue(1792771200), 1792771200000, 'normalizeResetValue：epoch 秒 → 毫秒')
eq(normalizeResetValue(1792771200000), 1792771200000, 'normalizeResetValue：epoch 毫秒 → 原样')
eq(normalizeResetValue('2026-10-14T08:00:00Z'), Date.parse('2026-10-14T08:00:00Z'), 'normalizeResetValue：ISO 字符串')
eq(normalizeResetValue(null), null, 'normalizeResetValue：null → null')
eq(normalizeResetValue(0), null, 'normalizeResetValue：0 → null（不编造时刻）')
eq(normalizeResetValue('不是时间'), null, 'normalizeResetValue：无法识别 → null')

// ═══ 4. host 代取余额（注入 fetch，不出网） ════════════════════════════════════
const now = Date.now()
const makeFetch = (payload, status = 200) => {
  const calls = []
  const fn = async (url, init) => {
    calls.push({ url, init })
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    }
  }
  fn.calls = calls
  return fn
}

// 4a. Bearer 鉴权 + 余额 + 两种窗口口径
const upstream = {
  data: {
    total_credits: 42.5,
    weekly: { used: 25, resetAt: Math.floor((now + 86400000) / 1000) },
    monthly: { remaining: 0.8, resetAt: '2026-12-01T00:00:00Z' },
  },
}
const f1 = makeFetch(upstream)
const res1 = await queryCustomTab({
  ...full,
  balance: { path: 'data.total_credits', label: '额度', unit: 'USD', decimals: 2, format: 'number' },
  windows: [
    { label: '每周', path: 'data.weekly.used', resetPath: 'data.weekly.resetAt', mode: 'used' },
    { label: '月度', path: 'data.monthly.remaining', resetPath: 'data.monthly.resetAt', mode: 'remaining' },
  ],
}, f1)
eq(f1.calls.length, 1, 'queryCustomTab：只发一次上游请求')
eq(f1.calls[0].url, full.url, 'queryCustomTab：请求用户配置的地址')
eq(f1.calls[0].init.headers.Authorization, 'Bearer ' + SECRET, 'queryCustomTab：bearer 鉴权头来自 host 侧凭据')
ok(f1.calls[0].init.signal, 'queryCustomTab：带超时 signal')
eq(res1.ok, true, 'queryCustomTab：成功返回 ok:true')
eq(res1.balance, 42.5, 'queryCustomTab：按路径取出余额')
eq(res1.decimals, 2, 'queryCustomTab：带回小数位配置')
eq(res1.windows.length, 2, 'queryCustomTab：两个窗口都解析出来')
eq(res1.windows[0].usedPercent, 25, 'queryCustomTab：窗口 0 已用 25%')
eq(res1.windows[0].usedIsRemaining, false, 'queryCustomTab：窗口 0 口径 = 已用')
ok(res1.windows[0].resetsAt >= now, 'queryCustomTab：窗口 0 重置时间归一成毫秒')
eq(res1.windows[1].usedIsRemaining, true, 'queryCustomTab：窗口 1 口径 = 剩余')
eq(res1.windows[1].usedPercent, 80, 'queryCustomTab：0.8 比例 → 80%')

// 4b. 0..1 的比例也当百分比（不少接口给比例）
const f2 = makeFetch({ used: 0.0659 })
const res2 = await queryCustomTab({
  id: 'c_ratio', url: 'https://x/y', auth: { kind: 'none' },
  balance: { path: 'used', decimals: 2 },
  windows: [{ label: '月', path: 'used', mode: 'used' }],
}, f2)
ok(Math.abs(res2.windows[0].usedPercent - 6.59) < 1e-9, 'queryCustomTab：0.0659 比例 → 6.59%（实际 ' + res2.windows[0].usedPercent + '）')

// 4c. 自定义头鉴权
const f3 = makeFetch({ bal: 1 })
await queryCustomTab({ id: 'c_h', url: 'https://x/y', auth: { kind: 'header', name: 'X-Api-Key', value: 'abc123' }, balance: { path: 'bal' } }, f3)
eq(f3.calls[0].init.headers['X-Api-Key'], 'abc123', 'queryCustomTab：自定义头鉴权')
ok(!f3.calls[0].init.headers.Authorization, 'queryCustomTab：非 bearer 时不带 Authorization')

// 4d. 一个数都没取到 → 明确报错，不编造 0
let err4 = null
try { await queryCustomTab({ id: 'c_e', url: 'https://x/y', balance: { path: 'nope.deeper' } }, makeFetch({ something: 'else' })) } catch (e) { err4 = e.message }
ok(err4 && err4.indexOf('没取到数值') >= 0, 'queryCustomTab：取不到数值时报错而不是编造 0（' + err4 + '）')
ok(err4 && err4.indexOf('nope.deeper') >= 0, 'queryCustomTab：错误信息里带上用户填的字段路径，便于自查')

// 4e. HTTP 失败要带状态码
let err5 = null
try { await queryCustomTab({ id: 'c_f', url: 'https://x/y', balance: { path: 'bal' } }, makeFetch({ error: 'unauthorized' }, 401)) } catch (e) { err5 = e.message }
ok(err5 && err5.indexOf('401') >= 0, 'queryCustomTab：HTTP 401 报错含状态码（' + err5 + '）')

// 4f. 非 http(s) 一律拒绝（防 file:// 之类的意外协议）
let err6 = null
try { await queryCustomTab({ id: 'c_p', url: 'file:///etc/passwd', balance: { path: 'x' } }, makeFetch({ x: 1 })) } catch (e) { err6 = e.message }
ok(err6 && err6.indexOf('http') >= 0, 'queryCustomTab：拒绝非 http(s) 地址（' + err6 + '）')

// 4g. 没有余额字段但有窗口 → 仍算成功（有些接口只给百分比）
const res7 = await queryCustomTab({
  id: 'c_w', url: 'https://x/y', balance: { path: 'no.such' },
  windows: [{ label: '月', path: 'pct', mode: 'used' }],
}, makeFetch({ pct: 30 }))
eq(res7.ok, true, 'queryCustomTab：只有窗口也能成功')
eq(res7.balance, null, 'queryCustomTab：无余额字段时余额为 null（不是 0）')

// ═══ 5. 配置文件读写与容错 ════════════════════════════════════════════════════
const dir = mkdtempSync(join(tmpdir(), 'ogm-tabs-'))
const store = join(dir, 'dsh-opencode-go-monitor.json')
try {
  eq(readCustomTabs(store).tabs.length, 0, 'readCustomTabs：文件不存在 → 空表（不抛）')
  writeFileSync(store, JSON.stringify({ version: 1, tabs: [{ id: 'c_a', url: 'https://x/y' }] }), 'utf8')
  eq(readCustomTabs(store).tabs.length, 1, 'readCustomTabs：读回一条')
  writeFileSync(store, '{ 这不是 JSON', 'utf8')
  eq(readCustomTabs(store).tabs.length, 0, 'readCustomTabs：文件损坏 → 退化成空表（不让配置坏了导致插件装不上）')
  writeFileSync(store, JSON.stringify({ version: 1, tabs: 'not-an-array' }), 'utf8')
  eq(readCustomTabs(store).tabs.length, 0, 'readCustomTabs：tabs 不是数组 → 空表')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
ok(customTabsPath().indexOf('dsh-opencode-go-monitor.json') >= 0, 'customTabsPath：指向配置文件（' + customTabsPath() + '）')

console.log(failed === 0 ? 'CUSTOM_TABS_OK' : 'CUSTOM_TABS_FAILED: ' + failed)
process.exit(failed === 0 ? 0 : 1)
