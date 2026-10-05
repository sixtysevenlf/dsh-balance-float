// host-integration.mjs — host 半接线 + 真实请求路径集成测试（本地 mock 网关，不出网）
//   覆盖：路由注册 · 网关 URL/表单/请求头（Cookie、x-xsrf-token、cornerstoneParam）
//        · sec_token 三通道（Cookie 自铸 /tool/user/info.json → 粘贴值 → 抓 HTML）
//        · 鉴权失败自动重铸重试 · 失败分类（loginInfo.loginStatus = NOT_LOGINED vs Cookie 仍有效）
//        · 双层信封展开 · 归一化（真凭据实测载荷）· 60s 缓存 · 未配置凭据
//        · DeepSeek 官网用量页同源接口（mock）：Bearer userToken / 载荷归一化 / 缓存 / token 失效与未配置
// 用法：node test/host-integration.mjs
import { createServer } from 'node:http'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'

const requests = []
let scrapeHtml = '<html><head><script>window.ALIYUN_CONSOLE_CONFIG = {"SEC_TOKEN":"SEC_FROM_HTML"}</script></head></html>'
let mintMode = 'ok'             // ok（返回 secToken）| dead（ConsoleNeedLogin）
let loginInfoStatus = 'LOGINED' // loginInfo 返回的 loginStatus
let usageFailuresLeft = 0       // 让前 N 次 usage 调用回 NotLogined（测自动重铸重试）
let gatewayMode = 'ok'          // ok | error（所有个人版网关调用回鉴权错误帧）
let bssMode = 'zero'            // zero（个人版实测恒为 0）| usable | error
let platformMode = 'ok'         // ok | invalid（官网用量页 token 失效：HTTP 200 + code 40003，实测如此）

const MINTED = 'MINTED_TOKEN_FROM_USERINFO'

const server = createServer((req, res) => {
  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', () => {
    const u = new URL(req.url, 'http://local')
    const q = Object.fromEntries(u.searchParams)
    requests.push({ method: req.method, path: u.pathname, q, headers: req.headers, body })
    const json = (obj) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)) }
    const wrap = (data) => ({ code: '200', data: { success: true, httpStatus: 200, data: JSON.stringify(data) }, successResponse: true })

    // 控制台文档导航（抓 SEC_TOKEN）
    if (u.pathname === '/cn-beijing') {
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.end(scrapeHtml)
      return
    }
    // 登录态网关：用 Cookie 换 sec_token
    if (u.pathname === '/tool/user/info.json') {
      if (mintMode === 'dead') return json({ code: 'ConsoleNeedLogin', message: '请登录', requestId: 'r1', successResponse: false })
      return json({ code: 200, data: { secToken: MINTED, loginName: 'aliyun765806' }, successResponse: true })
    }
    // 个人版网关：product=sfm_bailian，api 决定取哪份数据
    if (q.product === 'sfm_bailian') {
      const api = q.api || ''
      if (api.includes('loginInfo')) return json(wrap({ loginStatus: loginInfoStatus, spaceInited: false }))
      if (gatewayMode === 'error') {
        return json({ code: '200', data: { success: false, httpStatus: 200, errorCode: 'BailianGateway.Login.NotLogined', errorMsg: 'BailianGateway.Login.NotLogined' }, successResponse: true })
      }
      if (api.endsWith('/usage')) {
        if (usageFailuresLeft > 0) {
          usageFailuresLeft--
          return json({ code: '200', data: { success: false, httpStatus: 200, errorCode: 'BailianGateway.Login.NotLogined', errorMsg: 'BailianGateway.Login.NotLogined' }, successResponse: true })
        }
        // 真凭据实测（2026-09-23）：个人版只返回月窗口
        return json(wrap({ per1MonthPercentage: 0.05083596392156863, per1MonthResetTime: 1792771200000 }))
      }
      if (api.endsWith('/subscription')) {
        return json(wrap({ instanceCode: 'sfm_tokenplansolo_public_cn-fwz4z02qs08', specCode: 'essential', remainingDays: 30, startTime: 1790162066000, endTime: 1792771200000, autoRenewFlag: false, status: 'VALID' }))
      }
      if (api.endsWith('/quota-config')) {
        // 本机 2026-09-23 实测真实形状：{ <档位>: { five_hour, monthly } } + addon_quota.extrabundle
        return json(wrap({
          ret: ['SUCCESS::接口调用成功'],
          data: {
            msg: 'Success.', code: 'SUCCESS',
            data: {
              standard: { five_hour: 3000, monthly: 45000 },
              addon_quota: { extrabundle: 20000 },
              lite: { five_hour: 700, monthly: 11500 },
              pro: { five_hour: 12000, monthly: 180000 },
              essential: { five_hour: 1800, monthly: 25500 },
            },
            success: true,
          },
        }))
      }
      return json({ code: '200', data: { success: false, errorCode: 'Bad Request', errorMsg: 'Bad Request' }, successResponse: true })
    }
    // BSS 月额度汇总
    if (q.action === 'GetSubscriptionSummary') {
      if (bssMode === 'error') {
        return json({ code: '200', data: { success: false, httpStatus: 200, errorCode: 'ConsoleNeedLogin', errorMsg: '请登录' }, successResponse: true })
      }
      if (bssMode === 'usable') {
        return json(wrap({ TotalCount: 1, EquityList: [{ TotalValue: '45000', TotalSurplusValue: '33000', CycleEndTime: 1790500000000 }] }))
      }
      // 真凭据实测：个人版 BSS 汇总恒为 0（TotalCount 0 / TotalValue "0"）→ 插件应判定「无数据」并走窗口折算
      return json(wrap({ RequestId: 'x', Message: 'Successful!', Data: { Uid: 1817996999251428, TotalSurplusValue: '0', TotalCount: 0, TotalValue: '0' } }))
    }
    // DeepSeek 官网用量页（platform.deepseek.com 同源接口；由 OGM_PLATFORM_*_URL 指到这里）
    if (u.pathname === '/api/v0/usage/amount' || u.pathname === '/api/v0/usage/cost') {
      if (platformMode === 'invalid') return json({ code: 40003, msg: 'Authorization Failed (invalid token)', data: null })
      if (u.pathname === '/api/v0/usage/amount') {
        return json({ code: 0, msg: '', data: { biz_data: {
          total: [
            { model: 'deepseek-v4-flash', usage: [{ type: 'PROMPT_CACHE_HIT_TOKEN', amount: 12345678 }, { type: 'PROMPT_CACHE_MISS_TOKEN', amount: 123456 }, { type: 'RESPONSE_TOKEN', amount: 234567 }, { type: 'REQUEST', amount: 1234 }] },
          ],
          days: [{ date: '2026-09-01', data: [{ model: 'deepseek-v4-flash', usage: [{ type: 'PROMPT_CACHE_HIT_TOKEN', amount: 12345678 }, { type: 'RESPONSE_TOKEN', amount: 234567 }, { type: 'REQUEST', amount: 1234 }] }] }],
        } } })
      }
      return json({ code: 0, msg: '', data: { biz_data: [{
        currency: 'CNY',
        total: [{ model: 'deepseek-v4-flash', usage: [{ type: 'PROMPT_CACHE_HIT_TOKEN', amount: 2.47 }, { type: 'PROMPT_CACHE_MISS_TOKEN', amount: 1.23 }, { type: 'RESPONSE_TOKEN', amount: 8.64 }] }],
        days: [{ date: '2026-09-01', data: [{ model: 'deepseek-v4-flash', usage: [{ type: 'RESPONSE_TOKEN', amount: 8.64 }] }] }],
      }] } })
    }
    res.statusCode = 404
    res.end('{}')
  })
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const PORT = server.address().port
process.env.BP_BASE = 'http://127.0.0.1:' + PORT
process.env.BP_DASHBOARD = 'http://127.0.0.1:' + PORT

let failed = 0
const ok = (cond, msg) => { if (!cond) failed++; console.log((cond ? 'PASS ' : 'FAIL ') + msg) }
const eq = (a, b, msg) => ok(Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b), msg + '（实际 ' + JSON.stringify(a) + '）')

const BASE_COOKIE = 'login_aliyunid_ticket=TICKET; login_aliyunid_csrf=CSRF1; cna=anon1'
const COOKIE_WITH_TOKEN = BASE_COOKIE + '; sec_token=SEC_FROM_COOKIE'

async function mount(cookieValue, tag) {
  const { apply } = await import('../lib/index.js?' + tag)
  const routes = {}
  const ctx = {
    credentials: { resolve: async (name) => (name === 'BAILIAN_CONSOLE_COOKIE' ? { value: cookieValue } : null) },
    webServer: { register: ({ path, handler }) => { routes[path] = handler; return () => {} } },
    effect: (fn) => fn(),
  }
  apply(ctx)
  return routes
}

async function callRoute(handler) {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v }, end(body) { this.body = body } }
  await handler({}, res)
  return JSON.parse(res.body)
}

// ---- 场景 ①：Cookie 能换 sec_token —— 优先用自铸值，不抓 HTML，其余字段全部按实测载荷 ----
{
  requests.length = 0
  const routes = await mount(COOKIE_WITH_TOKEN, 's1')
  ok(typeof routes['/api/bailian/plan'] === 'function', '① apply() 注册了 /api/bailian/plan 路由')
  const payload = await callRoute(routes['/api/bailian/plan'])
  eq(payload.ok, true, '① 路由返回 ok:true')
  eq(payload.source, 'BAILIAN_CONSOLE_COOKIE', '① 标明凭据来源')
  eq(payload.secTokenSource, 'user-info', '① sec_token 来源 = user/info.json 自铸')
  eq(payload.planName, 'Essential', '① specCode essential → 档位 Essential')
  eq(payload.windows.monthly.usedPercent, 5.0836, '① 月窗口已用 5.0836%（per1MonthPercentage × 100）')
  eq(payload.windows.monthly.kind, 'month', '① per1MonthPercentage → kind=month')
  eq(payload.windows.fiveHour.usedPercent, null, '① 个人版没有 5 小时字段 → null（面板不渲染该行）')
  eq(payload.windows.monthly.totalQuota, 25500, '① quota-config → 月窗口上限 25500（Essential 档）')
  eq(payload.caps.addon, 20000, '① quota-config → 用量包 20000（addon_quota.extrabundle）')
  eq(payload.sub.status, 'VALID', '① subscription.status 透传')
  eq(payload.sub.remainingDays, 30, '① subscription.remainingDays 透传')
  eq(payload.credit.source, 'window', '① 月额度走窗口折算（BSS 汇总对个人版恒为 0，不算数据）')
  eq(payload.credit.remaining, 24204, '① 折算剩余 = 24204')

  const mint = requests.filter((r) => r.path === '/tool/user/info.json')
  eq(mint.length, 1, '① 只铸一次 sec_token（同一凭据内缓存）')
  eq(mint[0].headers.cookie, COOKIE_WITH_TOKEN, '① 铸 token 用同一 Cookie')
  ok(requests.every((r) => r.path !== '/cn-beijing'), '① 自铸成功 → 不抓控制台 HTML')
  const gw = requests.filter((r) => r.q.product === 'sfm_bailian' && !String(r.q.api || '').includes('loginInfo'))
  eq(gw.length, 3, '① 个人版网关打了 3 次（usage / subscription / quota-config）')
  const usage = gw.find((r) => String(r.q.api).endsWith('/usage'))
  eq(usage.q.action, 'BroadScopeAspnGateway', '① 网关 action 正确')
  eq(usage.q._v, 'undefined', '① 网关 _v=undefined')
  eq(usage.headers.cookie, COOKIE_WITH_TOKEN, '① 控制台 Cookie 原样透传')
  eq(usage.headers['x-xsrf-token'], 'CSRF1', '① login_aliyunid_csrf → x-xsrf-token')
  const form = new URLSearchParams(usage.body)
  eq(form.get('sec_token'), MINTED, '① 网关请求用的是自铸 sec_token（不是粘贴的那个）')
  eq(form.get('region'), 'cn-beijing', '① region=cn-beijing')
  const params = JSON.parse(form.get('params'))
  eq(params.Api, 'zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage', '① params.Api = usage 网关路径')
  ok(!!params.Data.cornerstoneParam, '① params.Data.cornerstoneParam 已带')
  eq(params.Data.cornerstoneParam.consoleSite, 'BAILIAN_ALIYUN', '① cornerstoneParam.consoleSite 正确')
  ok(!('switchAgent' in params.Data.cornerstoneParam), '① cornerstoneParam 不写死 switchAgent（换账号不会被判 NotAuthorised）')
  const bss = requests.find((r) => r.q.action === 'GetSubscriptionSummary')
  eq(bss.q.product, 'BssOpenAPI-V3', '① BSS 汇总走 BssOpenAPI-V3')

  const before = requests.length
  const again = await callRoute(routes['/api/bailian/plan'])
  eq(again.credit.remaining, 24204, '① 二次调用返回同一载荷')
  eq(requests.length, before, '① 60s 缓存生效：二次调用不打网关')
}

// ---- 场景 ②：换 token 通道也挂了 —— 依次退回「粘贴的 sec_token」→「抓 HTML」----
{
  mintMode = 'dead'
  requests.length = 0
  const routes = await mount(COOKIE_WITH_TOKEN, 's2')
  const payload = await callRoute(routes['/api/bailian/plan'])
  eq(payload.ok, true, '② 铸 token 失败但凭据里有 sec_token → 仍能取到载荷')
  eq(payload.secTokenSource, 'credential', '② sec_token 来源 = 凭据里粘贴的值')
  const usage = requests.find((r) => String(r.q.api).endsWith('/usage'))
  eq(new URLSearchParams(usage.body).get('sec_token'), 'SEC_FROM_COOKIE', '② 网关请求用的是粘贴的 sec_token')
  ok(requests.every((r) => r.path !== '/cn-beijing'), '② 有粘贴值就不抓 HTML')

  requests.length = 0
  const routes2 = await mount(BASE_COOKIE, 's2b')   // 凭据里没有 sec_token
  const payload2 = await callRoute(routes2['/api/bailian/plan'])
  eq(payload2.ok, true, '②b 铸 token 失败且无粘贴值 → 退回抓 HTML，仍能取到载荷')
  eq(payload2.secTokenSource, 'html', '②b sec_token 来源 = 控制台 HTML')
  const dash = requests.filter((r) => r.path === '/cn-beijing')
  eq(dash.length, 1, '②b 抓了一次控制台 HTML')
  eq(dash[0].headers['sec-fetch-mode'], 'navigate', '②b 抓 HTML 带真·导航请求头（否则控制台不下发 SEC_TOKEN）')
  const usage2 = requests.find((r) => String(r.q.api).endsWith('/usage'))
  eq(new URLSearchParams(usage2.body).get('sec_token'), 'SEC_FROM_HTML', '②b 用 HTML 里的 SEC_TOKEN')
  mintMode = 'ok'
}

// ---- 场景 ③：鉴权失败自动重铸重试 ----
{
  requests.length = 0
  const routes = await mount(COOKIE_WITH_TOKEN, 's3')
  usageFailuresLeft = 1   // 第一次 usage 回 NotLogined
  const payload = await callRoute(routes['/api/bailian/plan'])
  const usageCalls = requests.filter((r) => String(r.q.api).endsWith('/usage')).length
  ok(usageCalls >= 2, '③ 首次鉴权失败后重试了 usage（实际 ' + usageCalls + ' 次）')
  eq(payload.ok, true, '③ 重铸 token 后成功取到数据')
  ok(requests.filter((r) => r.path === '/tool/user/info.json').length >= 2, '③ 重试前重新铸了 sec_token')
}

// ---- 场景 ④：真·失效 —— 分类成人话，不崩 ----
{
  gatewayMode = 'error'
  mintMode = 'dead'
  bssMode = 'error'
  loginInfoStatus = 'NOT_LOGINED'
  scrapeHtml = '<html><body>login</body></html>'
  requests.length = 0
  const routes = await mount(COOKIE_WITH_TOKEN, 's4')
  const payload = await callRoute(routes['/api/bailian/plan'])
  eq(payload.ok, false, '④ 全部失败 → ok:false')
  eq(payload.loginStatus, 'NOT_LOGINED', '④ 带上 loginInfo 的 loginStatus')
  ok(String(payload.error).includes('控制台会话已失效'), '④ 分类为「Cookie/会话失效」：' + payload.error)
  ok(String(payload.error).includes('NOT_LOGINED'), '④ 错误里带 loginStatus 证据')
  eq(payload.source, 'BAILIAN_CONSOLE_COOKIE', '④ 错误态也标明凭据来源')
  ok(payload.errors && payload.errors.usage, '④ 保留分项错误（usage）')

  // ④b Cookie 有效但 token 拿不到 → 提示换一条带 sec_token 的 cURL，而不是说「会话失效」
  gatewayMode = 'error'
  loginInfoStatus = 'LOGINED'
  const routes2 = await mount(COOKIE_WITH_TOKEN, 's4b')
  const payload2 = await callRoute(routes2['/api/bailian/plan'])
  eq(payload2.loginStatus, 'LOGINED', '④b loginStatus 透传 LOGINED')
  ok(String(payload2.error).includes('Cookie 仍有效'), '④b 提示 Cookie 有效、需带新鲜 sec_token：' + payload2.error)

  // ④c 完全没配凭据
  gatewayMode = 'ok'
  bssMode = 'zero'
  const routes3 = await mount('', 's4c')
  const payload3 = await callRoute(routes3['/api/bailian/plan'])
  eq(payload3.ok, false, '④c 空凭据 → ok:false')
  ok(String(payload3.error).includes('BAILIAN_CONSOLE_COOKIE'), '④c 提示要配哪个凭据：' + payload3.error)
}

// ---- 场景 ⑤：DeepSeek 官网用量页（platform.deepseek.com 同源接口；本地 mock，不出网）----
{
  process.env.OGM_PLATFORM_AMOUNT_URL = 'http://127.0.0.1:' + PORT + '/api/v0/usage/amount'
  process.env.OGM_PLATFORM_COST_URL = 'http://127.0.0.1:' + PORT + '/api/v0/usage/cost'
  process.env.OGM_PLATFORM_TOKEN = 'TEST_PLATFORM_TOKEN'
  process.env.OGM_PLATFORM_AUTO_TOKEN = '0'   // 不扫浏览器目录（测试环境）
  platformMode = 'ok'
  requests.length = 0

  const routes = await mount('', 's5')
  ok(typeof routes['/api/deepseek/usage'] === 'function', '⑤ apply() 注册了 /api/deepseek/usage 路由')
  const payload = await callRoute(routes['/api/deepseek/usage'])
  eq(payload.ok, true, '⑤ 官网用量 → ok:true')
  eq(payload.totalTokens, 12703701, '⑤ 合计 = 命中 12345678 + 未命中 123456 + 输出 234567（REQUEST 不算 token）')
  eq(payload.requestCount, 1234, '⑤ 请求数 = 1234')
  eq(payload.totalCost, 12.34, '⑤ 花费 = 2.47 + 1.23 + 8.64')
  eq(payload.currency, 'CNY', '⑤ 币种透传')
  eq(payload.activeDays, 1, '⑤ 有量天数 = 1')
  eq(payload.dailyAvgTokens, 12703701, '⑤ 日均 token')
  eq(payload.dailyAvgCost, 12.34, '⑤ 日均金额')
  eq(payload.category.cacheMiss, 123456, '⑤ 三桶拆分透传')
  eq(payload.topModel, 'deepseek-v4-flash', '⑤ 用量最大模型')
  eq(payload.tokenSource, '环境变量 OGM_PLATFORM_TOKEN', '⑤ 标明 token 来源')
  eq(payload.source, 'platform.deepseek.com', '⑤ 标明数据源是官网')
  const gw = requests.filter((r) => r.path.startsWith('/api/v0/usage/'))
  eq(gw.length, 2, '⑤ 同时打了 amount + cost 两个端点')
  ok(gw.every((r) => r.headers.authorization === 'Bearer TEST_PLATFORM_TOKEN'), '⑤ 用控制台 userToken 作 Bearer（不是 API key）')
  ok(gw.every((r) => /^\d+$/.test(String(r.q.month)) && /^\d{4}$/.test(String(r.q.year))), '⑤ 带上 month / year 查询参数')

  // 60s 缓存
  const before = requests.length
  const again = await callRoute(routes['/api/deepseek/usage'])
  eq(again.totalTokens, 12703701, '⑤ 二次调用返回同一载荷')
  eq(requests.length, before, '⑤ 60s 缓存生效：二次调用不打官网')

  // token 失效（官网实测：HTTP 200 + code 40003）→ ok:false，不拿本地数顶上
  platformMode = 'invalid'
  const routes2 = await mount('', 's5b')
  const payload2 = await callRoute(routes2['/api/deepseek/usage'])
  eq(payload2.ok, false, '⑤ token 失效 → ok:false')
  ok(String(payload2.error).includes('40003'), '⑤ 失效错误里带官网 code：' + payload2.error)
  ok(String(payload2.error).includes('DEEPSEEK_PLATFORM_TOKEN'), '⑤ 失效错误里给出修法')

  // 完全没配 token → ok:false + 配置指引
  delete process.env.OGM_PLATFORM_TOKEN
  platformMode = 'ok'
  const routes3 = await mount('', 's5c')
  const payload3 = await callRoute(routes3['/api/deepseek/usage'])
  eq(payload3.ok, false, '⑤ 未配 token → ok:false')
  ok(String(payload3.error).includes('DEEPSEEK_PLATFORM_TOKEN'), '⑤ 未配 token 时提示配哪个凭据')

  delete process.env.OGM_PLATFORM_AMOUNT_URL
  delete process.env.OGM_PLATFORM_COST_URL
  delete process.env.OGM_PLATFORM_AUTO_TOKEN
}

server.close()
console.log(failed === 0 ? 'HOST_INTEGRATION_OK' : 'HOST_INTEGRATION_FAILED: ' + failed)
process.exit(failed === 0 ? 0 : 1)