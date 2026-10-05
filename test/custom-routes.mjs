// custom-routes.mjs — 自定义标签页的 3 条 host 路由「真跑一遍」
//   与 host-integration.mjs 同样用假 ctx 把 apply() 挂起来，但不只断言注册：
//   这里会真的调用 handler，跑完 add → toggle → GET → delete 的完整生命周期，
//   并检查落盘文件内容与下发对象里有没有凭据。
//   覆盖：
//     ① 三条路由都注册了
//     ② add 写盘：配置文件里有明文 key（host 侧），GET 下发对象里没有 key
//     ③ add 拒绝非 http 地址、拒绝重复 id、拒绝非法 id
//     ④ update 不传 auth.value 时保持原 key 不变（避免编辑时把 key 清空）
//     ⑤ toggle 停用/启用；disabled 时下发对象 disabled=true
//     ⑥ delete 连配置一起删；对不存在的 id 报 404
//     ⑦ custom-balance 用配置里的 key 代取上游（注入 fetch），返回归一化窗口
//     ⑧ custom-balance 对不存在的 id 报 404
//   用环境变量 OGM_CONFIG 指向临时文件，绝不碰用户真实配置。
// 用法：node test/custom-routes.mjs
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'ogm-routes-'))
const configFile = join(dir, 'tabs.json')
process.env.OGM_CONFIG = configFile

// 注入的上游 fetch：记录收到的请求，按路径回固定载荷
const upstreamCalls = []
const realFetch = globalThis.fetch
globalThis.fetch = async (url, init) => {
  upstreamCalls.push({ url: String(url), headers: (init && init.headers) || {} })
  const body = {
    data: { total_credits: 99.25, weekly: { used: 12, resetAt: Math.floor((Date.now() + 3600000) / 1000) } },
  }
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }
}

const { apply } = await import('../lib/index.js')

let failed = 0
const ok = (cond, msg) => { if (!cond) failed++; console.log((cond ? 'PASS ' : 'FAIL ') + msg) }
const eq = (a, b, msg) => ok(Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b), msg + '（实际 ' + JSON.stringify(a) + '）')

const routes = {}
apply({
  credentials: { resolve: async () => null },
  webServer: { register: ({ path, handler }) => { routes[path] = handler; return () => {} } },
  effect: (fn) => fn(),
})

// 请求/响应替身：把 body 变成可读流，模拟 Node 原生 req
const call = async (path, { method = 'GET', body, query = '' } = {}) => {
  const handler = routes[path]
  if (!handler) throw new Error('路由未注册: ' + path)
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body), 'utf8')]
  const req = {
    method,
    url: path + query,
    on(evt, cb) {
      if (evt === 'data') chunks.forEach((c) => cb(c))
      if (evt === 'end') cb()
      if (evt === 'error') { /* 不触发 */ }
      return req
    },
    destroy() {},
  }
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v }, end(b) { this.body = b } }
  await handler(req, res)
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null }
}

// ① 路由注册
ok(typeof routes['/api/monitor/tabs'] === 'function', '① 注册了 /api/monitor/tabs')
ok(typeof routes['/api/monitor/custom-balance'] === 'function', '① 注册了 /api/monitor/custom-balance')

const spec = {
  id: 'c_demo', name: 'DemoAPI', short: 'Demo', theme: '#0ea5e9',
  url: 'https://api.demo.example/credits',
  auth: { kind: 'bearer', value: 'sk-demo-SECRET' },
  balance: { path: 'data.total_credits', label: '额度', unit: 'USD', decimals: 2, format: 'number' },
  windows: [{ label: '每周', path: 'data.weekly.used', resetPath: 'data.weekly.resetAt', mode: 'used' }],
}

// ② add
{
  const r = await call('/api/monitor/tabs', { method: 'POST', body: { action: 'add', id: 'c_demo', tab: spec } })
  eq(r.status, 200, '② add 返回 200')
  eq(r.body.ok, true, '② add ok:true')
  eq(r.body.tab.name, 'DemoAPI', '② 返回下发的标签页描述')
  ok(JSON.stringify(r.body.tab).indexOf('sk-demo-SECRET') < 0, '② 响应里不含 API key')

  // 落盘文件里**应该有** key（host 侧凭据），且是合法 JSON
  const onDisk = JSON.parse(readFileSync(configFile, 'utf8'))
  eq(onDisk.tabs.length, 1, '② 配置文件落盘 1 条')
  eq(onDisk.tabs[0].auth.value, 'sk-demo-SECRET', '② 配置里保留凭据（host 侧，仅此一处）')
  eq(onDisk.tabs[0].id, 'c_demo', '② 配置里保留 id')

  // GET 下发对象里**不能有** key
  const g = await call('/api/monitor/tabs')
  eq(g.body.ok, true, '② GET ok:true')
  eq(g.body.tabs.length, 1, '② GET 返回 1 条')
  ok(JSON.stringify(g.body.tabs).indexOf('sk-demo-SECRET') < 0, '② GET 下发对象不含 API key')
  ok(g.body.hasSecrets === true, '② GET 标明「存在已保存的凭据」但不给内容')
}

// ③ 校验
{
  const bad1 = await call('/api/monitor/tabs', { method: 'POST', body: { action: 'add', id: 'c_ftp', tab: { id: 'c_ftp', url: 'ftp://x/y' } } })
  eq(bad1.status, 400, '③ 非 http(s) 地址 → 400')
  ok(bad1.body.error.indexOf('http') >= 0, '③ 报错说明协议要求（' + bad1.body.error + '）')
  const bad2 = await call('/api/monitor/tabs', { method: 'POST', body: { action: 'add', id: 'c_demo', tab: spec } })
  eq(bad2.status, 409, '③ 重复 id → 409')
  const bad3 = await call('/api/monitor/tabs', { method: 'POST', body: { action: 'add', id: 'no-prefix', tab: { ...spec, id: 'no-prefix' } } })
  eq(bad3.status, 400, '③ id 不以 c_ 开头 → 400')
  const bad4 = await call('/api/monitor/tabs', { method: 'POST', body: { action: 'nope' } })
  eq(bad4.status, 400, '③ 未知 action → 400')
}

// ④ update 保留原 key
{
  const r = await call('/api/monitor/tabs', {
    method: 'POST',
    body: { action: 'update', id: 'c_demo', tab: { ...spec, auth: { kind: 'bearer' }, name: 'DemoAPI 改名' } },
  })
  eq(r.status, 200, '④ update 返回 200')
  const onDisk = JSON.parse(readFileSync(configFile, 'utf8'))
  eq(onDisk.tabs[0].auth.value, 'sk-demo-SECRET', '④ 编辑时不传 key → 原 key 保持不变（不被清空）')
  eq(onDisk.tabs[0].name, 'DemoAPI 改名', '④ 其余字段已更新')
}

// ⑤ toggle 停用/启用
{
  const off = await call('/api/monitor/tabs', { method: 'POST', body: { action: 'toggle', id: 'c_demo', disabled: true } })
  eq(off.body.disabled, true, '⑤ 停用成功')
  const g = await call('/api/monitor/tabs')
  eq(g.body.tabs[0].disabled, true, '⑤ 下发对象带 disabled=true（前端据此不显示该页）')
  const on = await call('/api/monitor/tabs', { method: 'POST', body: { action: 'toggle', id: 'c_demo', disabled: false } })
  eq(on.body.disabled, false, '⑤ 重新启用成功')
}

// ⑦ custom-balance 代取上游
{
  upstreamCalls.length = 0
  const r = await call('/api/monitor/custom-balance', { query: '?id=c_demo' })
  eq(r.body.ok, true, '⑦ 代取成功')
  eq(r.body.balance, 99.25, '⑦ 按配置的字段路径取出余额')
  eq(r.body.balanceLabel, '额度', '⑦ 带回用户配置的标签')
  eq(r.body.windows.length, 1, '⑦ 解析出 1 个窗口')
  eq(r.body.windows[0].usedPercent, 12, '⑦ 窗口已用 12%')
  ok(r.body.windows[0].resetsAt > Date.now(), '⑦ 窗口重置时间归一成毫秒')
  eq(upstreamCalls.length, 1, '⑦ 只发一次上游请求')
  eq(upstreamCalls[0].url, 'https://api.demo.example/credits', '⑦ 请求用户配置的地址')
  eq(upstreamCalls[0].headers.Authorization, 'Bearer sk-demo-SECRET', '⑦ 用配置里的 key 组装 Bearer 头')
}

// ⑧ 不存在的 id
{
  const r = await call('/api/monitor/custom-balance', { query: '?id=c_nope' })
  eq(r.status, 404, '⑧ 未知 id → 404')
  const r2 = await call('/api/monitor/custom-balance')
  eq(r2.status, 400, '⑧ 缺 id → 400')
}

// ⑥ delete
{
  const r = await call('/api/monitor/tabs', { method: 'POST', body: { action: 'delete', id: 'c_demo' } })
  eq(r.body.ok, true, '⑥ 删除成功')
  eq(r.body.removed, 1, '⑥ 报告删了 1 条')
  const onDisk = JSON.parse(readFileSync(configFile, 'utf8'))
  eq(onDisk.tabs.length, 0, '⑥ 配置文件里也删掉了（连 key 一起）')
  const g = await call('/api/monitor/tabs')
  eq(g.body.tabs.length, 0, '⑥ 下发列表为空')
  const d2 = await call('/api/monitor/tabs', { method: 'POST', body: { action: 'delete', id: 'c_demo' } })
  eq(d2.body.removed, 0, '⑥ 重复删除不报错（removed 0）')
}

globalThis.fetch = realFetch
rmSync(dir, { recursive: true, force: true })
console.log(failed === 0 ? 'CUSTOM_ROUTES_OK' : 'CUSTOM_ROUTES_FAILED: ' + failed)
process.exit(failed === 0 ? 0 : 1)
