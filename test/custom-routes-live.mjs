// custom-routes-live.mjs — 用真 HTTP 服务器跑自定义标签页的 3 条路由
//   custom-routes.mjs 用的是假 req/res；这里换成 node:http 真监听一个端口，
//   再用 fetch 从「网络」这一侧打过去，确认与 Node HTTP 栈的接线没问题
//   （webServer 传的就是原生 req/res，路由里自己收 body 的那段最需要这样验）。
//   全程 localhost，不出网。
// 用法：node test/custom-routes-live.mjs
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'ogm-live-'))
process.env.OGM_CONFIG = join(dir, 'tabs.json')

// 上游也用一个真服务器（而不是 stub fetch），这样「host 代发请求」整条链路都是真的
const upstream = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({
    data: { total_credits: 55.5, weekly: { used: 40, resetAt: Math.floor((Date.now() + 7200000) / 1000) } },
  }))
})
await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
const upstreamUrl = 'http://127.0.0.1:' + upstream.address().port + '/credits'

const { apply } = await import('../lib/index.js')

const routes = {}
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname
  const handler = routes[path]
  if (!handler) { res.statusCode = 404; res.end('nf'); return }
  await handler(req, res)
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = 'http://127.0.0.1:' + server.address().port

apply({
  credentials: { resolve: async () => null },
  webServer: { register: ({ path, handler }) => { routes[path] = handler; return () => {} } },
  effect: (fn) => fn(),
})

let failed = 0
const ok = (cond, msg) => { if (!cond) failed++; console.log((cond ? 'PASS ' : 'FAIL ') + msg) }
const eq = (a, b, msg) => ok(Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b), msg + '（实际 ' + JSON.stringify(a) + '）')
const post = async (path, payload, query = '') => {
  const res = await fetch(base + path + query, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
  return { status: res.status, body: await res.json() }
}
const get = async (path, query = '') => {
  const res = await fetch(base + path + query)
  return { status: res.status, body: await res.json() }
}

const spec = {
  id: 'c_live', name: 'LiveAPI', short: 'Live', theme: '#14b8a6',
  url: upstreamUrl,
  auth: { kind: 'bearer', value: 'sk-live-KEY' },
  balance: { path: 'data.total_credits', label: '额度', unit: 'USD', decimals: 2, format: 'number' },
  windows: [{ label: '每周', path: 'data.weekly.used', resetPath: 'data.weekly.resetAt', mode: 'used' }],
}

{
  const g0 = await get('/api/monitor/tabs')
  eq(g0.status, 200, '真 HTTP：GET /api/monitor/tabs → 200')
  eq(g0.body.ok, true, '真 HTTP：返回 ok:true')
  eq(g0.body.tabs.length, 0, '真 HTTP：初始为空表')

  const a = await post('/api/monitor/tabs', { action: 'add', id: 'c_live', tab: spec })
  eq(a.status, 200, '真 HTTP：POST add → 200（说明自己收 body 的那段在真 Node req 上可用）')
  eq(a.body.ok, true, '真 HTTP：add ok:true')
  ok(JSON.stringify(a.body).indexOf('sk-live-KEY') < 0, '真 HTTP：add 响应不含 key')

  const g1 = await get('/api/monitor/tabs')
  eq(g1.body.tabs.length, 1, '真 HTTP：GET 看到刚加的页')
  ok(JSON.stringify(g1.body.tabs).indexOf('sk-live-KEY') < 0, '真 HTTP：GET 不含 key')

  const b = await get('/api/monitor/custom-balance', '?id=c_live')
  eq(b.status, 200, '真 HTTP：custom-balance → 200')
  eq(b.body.ok, true, '真 HTTP：代取成功（host 真的发到了上游服务器）')
  eq(b.body.balance, 55.5, '真 HTTP：余额取对')
  eq(b.body.windows[0].usedPercent, 40, '真 HTTP：窗口已用 40%')

  const bad = await post('/api/monitor/tabs', { action: 'add', id: 'c_bad', tab: { id: 'c_bad', url: 'ftp://nope' } })
  eq(bad.status, 400, '真 HTTP：非 http 地址 → 400')

  const d = await post('/api/monitor/tabs', { action: 'delete', id: 'c_live' })
  eq(d.body.removed, 1, '真 HTTP：删除 1 条')
  const g2 = await get('/api/monitor/tabs')
  eq(g2.body.tabs.length, 0, '真 HTTP：删完为空')
}

server.close()
upstream.close()
rmSync(dir, { recursive: true, force: true })
console.log(failed === 0 ? 'CUSTOM_ROUTES_LIVE_OK' : 'CUSTOM_ROUTES_LIVE_FAILED: ' + failed)
process.exit(failed === 0 ? 0 : 1)
