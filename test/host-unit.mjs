// host-unit.mjs — host 半纯函数单测（不需要 DSH / 网络）
//   覆盖：凭据解析（整段 cURL / Cookie 头 / 裸 JWT）、JWT 解析、epoch 秒→毫秒、
//         GetStepPlanStatus + QueryStepPlanRateLimit 归一化（Credit 月池 / 旧套餐窗口 / 缺字段不臆造）、
//         DeepSeek 官网用量页载荷归一化 + 浏览器 Local Storage token 读取
// 用法：node test/host-unit.mjs
import { __test } from '../lib/index.js'

const {
  sfParseCredential, sfJwtPayload, sfEpochMs, sfNormalizePlan, sfRate, sfCookieMap,
  normalizePlatformUsage, parseLogEntries, parseLdbEntries, extractTokenCandidates, joinP, cleanPlatformToken,
} = __test
let failed = 0
const ok = (cond, msg) => { if (!cond) failed++; console.log((cond ? 'PASS ' : 'FAIL ') + msg) }
const eq = (a, b, msg) => ok(Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b), msg + '（实际 ' + JSON.stringify(a) + '）')

// 造两个结构真实的 JWT（payload 与线上一致；签名是假的，单测只解析不验签）
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (payload) => ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', b64(payload), 'x'.repeat(43)].join('.')
const ACCESS = jwt({ activated: true, age: 2, mode: 2, oasis_id: 412807990200561664, exp: 1789883290, version: 3 })
const REFRESH = jwt({ app_id: 10300, device_id: 'ceffcd1b584f0ff7cf1110ed1a5b093f1ae0bf34', exp: 1792470730, oasis_id: 412807990200561664, oasis_r_at: 1789874404, platform: 'web', version: 3 })

// ---- 1. 凭据解析 ----
const curl = [
  "curl 'https://platform.stepfun.com/api/step.openapi.devcenter.Dashboard/GetStepPlanStatus' \\",
  "  -H 'oasis-token: " + ACCESS + "' \\",
  "  -H 'oasis-webid: ceffcd1b584f0ff7cf1110ed1a5b093f1ae0bf34' \\",
  "  -H 'cookie: Oasis-Token=" + ACCESS + "; Oasis-refresh-token=" + REFRESH + "; other=1' \\",
  "  --data-raw '{}'",
].join('\n')
const p1 = sfParseCredential(curl)
eq(p1.token, ACCESS, '整段 cURL → 解析出 oasis-token')
eq(p1.webid, 'ceffcd1b584f0ff7cf1110ed1a5b093f1ae0bf34', '整段 cURL → 解析出 oasis-webid')
ok(typeof p1.cookie === 'string' && p1.cookie.includes('Oasis-refresh-token='), '整段 cURL → 解析出 cookie（含刷新令牌）')

const p2 = sfParseCredential('Oasis-Token=' + ACCESS + '; Oasis-refresh-token=' + REFRESH)
ok(p2.cookie && p2.cookie.includes('Oasis-Token=') && !p2.token, '裸 Cookie 头 → 整串当 cookie')
eq(sfParseCredential(ACCESS).token, ACCESS, '裸 JWT → 当 access token')
eq(sfCookieMap('a=1; b=2; ').b, '2', 'cookie 串解析成 map')

// ---- 2. JWT / 时间戳 ----
eq(sfJwtPayload(ACCESS).oasis_id, 412807990200561664, 'JWT payload 解析（oasis_id）')
eq(sfEpochMs(1789883290), 1789883290000, 'epoch 秒 → 毫秒')
eq(sfEpochMs(1789883290000), 1789883290000, '已是毫秒则原样')
eq(sfEpochMs(null), null, '空值 → null')
eq(sfEpochMs(0), null, '0 → null（proto 默认值不当时间用）')
eq(sfRate(0.625), 0.625, '比例原样保留')
eq(sfRate('0.123456'), 0.1235, '比例收敛到 4 位')

// ---- 3. 归一化：Credit 月池（plan_family=2 TOKEN）----
const statusResp = {
  status: 1,
  subscription: { plan_type: 2, name: 'Flash Plus', status: 1, activated_at: 1789000000, expired_at: 1792000000, auto_renew: true, plan_family: 2 },
  plan_definition: { type: 2, price: 9900, duration_days: 30, billing_cycle: 1, zh_display: { description: 'Flash Plus 月付' } },
}
const rateResp = {
  status: 1,
  plan_family: 2,
  five_hour_usage_left_rate: 1,
  five_hour_usage_reset_time: 0,
  weekly_usage_left_rate: 1,
  weekly_usage_reset_time: 0,
  plan_credit_rate_limit: {
    subscription_credit_left_rate: 0.625,
    subscription_credit_reset_time: 1789999999,
    topup_credit_left_rate: 0.5625,
    // int64 走字符串（protojson 口径）——必须能解析
    credit_buckets: [
      { type: 2, credit_total: '1600000000', credit_residual: '900000000', expire_at: 1790500000 },
      { type: 1, credit_total: '400000000', credit_residual: '400000000', expire_at: 1791000000 },
    ],
  },
}
const plan = sfNormalizePlan(statusResp, rateResp, 1789883290000, 'STEPFUN_CONSOLE_COOKIE')
eq(plan.kind, 'credit', 'plan_family=2 → Credit 月池')
eq(plan.name, 'Flash Plus', '套餐名取 subscription.name')
eq(plan.credit.leftRate, 0.625, '月池剩余比例')
eq(plan.credit.resetTime, 1789999999000, '月池重置时间已归一成毫秒')
eq(plan.credit.buckets.length, 2, 'credit_buckets 全部保留')
eq(plan.credit.buckets[0].residual, 900000000, 'int64 字符串 → 数字（900M）')
eq(plan.credit.buckets[0].expireAt, 1790500000000, 'bucket 到期时间归一成毫秒')
eq(plan.expiredAt, 1792000000000, '套餐到期时间归一成毫秒')
eq(plan.autoRenew, true, '自动续费标记透传')

// ---- 4. 归一化：旧套餐（plan_family=1 CODING）+ 缺字段 ----
const legacy = sfNormalizePlan(
  { status: 1, subscription: { plan_type: 3, name: null, status: 3, plan_family: 1 } },
  { status: 1, plan_family: 1, five_hour_usage_left_rate: 0.8, five_hour_usage_reset_time: 1789900000, weekly_usage_left_rate: 0.5, weekly_usage_reset_time: 1790000000 },
  1789883290000, 'STEPFUN_CONSOLE_TOKEN',
)
eq(legacy.kind, 'window', 'plan_family=1 → 旧套餐窗口')
eq(legacy.name, null, '没有名字时给 null（不臆造）')
eq(legacy.window.fiveHourLeftRate, 0.8, '5 小时窗口剩余')
eq(legacy.window.weeklyResetTime, 1790000000000, '每周窗口重置时间归一成毫秒')
eq(legacy.credit.buckets, [], '旧套餐无 credit_buckets → 空数组')
eq(legacy.credit.leftRate, null, '旧套餐月池比例 → null')

const empty = sfNormalizePlan({}, {}, 1, 'x')
eq(empty.kind, 'window', 'plan_family 缺失 → 不当 Credit 家族展示')
eq(empty.credit.leftRate, null, '字段全缺 → null（不臆造 0）')
eq(empty.credit.resetTime, null, '重置时间缺失 → null')

// ---- 5. 阿里云百炼 Token Plan（控制台网关）：凭据解析 / 信封展开 / 归一化 ----
const {
  bpParseCredential, bpExpandEmbeddedJSON, bpFindObjectDeep, bpRatioPct, bpDateMs,
  bpTierName, bpEnvelopeError, bpNormalizePlan, bpTierKey, bpQuotaObjectFor,
} = __test

// 5.1 凭据：整段 cURL（含 cookie + sec_token 头）/ 裸 Cookie 头
const bpCurl = [
  "curl 'https://bailian-cs.console.aliyun.com/data/api.json?action=BroadScopeAspnGateway&product=sfm_bailian' \\",
  "  -H 'cookie: login_aliyunid_ticket=TICKET; login_aliyunid_csrf=CSRF; cna=abc' \\",
  "  -H 'sec_token: SEC_TOKEN_VALUE' \\",
  "  --data-raw 'product=sfm_bailian'",
].join('\n')
const bpc1 = bpParseCredential(bpCurl)
ok(typeof bpc1.cookie === 'string' && bpc1.cookie.includes('login_aliyunid_ticket='), '百炼：整段 cURL → 解析出 cookie')
eq(bpc1.secToken, 'SEC_TOKEN_VALUE', '百炼：整段 cURL → 解析出 sec_token 头')
eq(bpc1.csrf, 'CSRF', '百炼：cookie 里解析出 login_aliyunid_csrf（作 x-xsrf-token）')
const bpc2 = bpParseCredential('login_aliyunid_ticket=T; sec_token=FROMCOOKIE')
eq(bpc2.cookie, 'login_aliyunid_ticket=T; sec_token=FROMCOOKIE', '百炼：裸 Cookie 头 → 整串当 cookie')
eq(bpc2.secToken, 'FROMCOOKIE', '百炼：sec_token 也可从 cookie 里取')
eq(bpParseCredential('').cookie, null, '百炼：空凭据 → cookie 为 null')

// 5.1b Chromium/Edge「Copy as cURL」真实形态：-b '...' 带 Cookie + sec_token 在 --data-raw 表单里
const bpChromeCurl = [
  "curl --url 'https://bailian-cs.console.aliyun.com/data/api.json?action=BroadScopeAspnGateway&product=sfm_bailian&_v=' \\",
  "  -H 'content-type: application/x-www-form-urlencoded' \\",
  "  -b 'login_aliyunid_ticket=TICKET; login_aliyunid_csrf=_csrf_tk_123; cna=anon; currentRegionId=cn-hangzhou' \\",
  "  -H 'referer: https://bailian.console.aliyun.com/cn-beijing/subscription/token-plan/personal' \\",
  "  --data-raw 'params=%7B%22Api%22%3A%22x%22%7D&sec_token=SECTK123&region=cn-beijing'",
].join('\n')
const bpc3 = bpParseCredential(bpChromeCurl)
ok(typeof bpc3.cookie === 'string' && bpc3.cookie.includes('login_aliyunid_ticket='), '百炼：Copy as cURL 的 -b 形式 → 解析出 cookie')
eq(bpc3.secToken, 'SECTK123', '百炼：Copy as cURL → 从 --data-raw 里解析出 sec_token')
eq(bpc3.csrf, '_csrf_tk_123', '百炼：Copy as cURL → 从 cookie 解析出 login_aliyunid_csrf')
eq(bpParseCredential("-H 'cookie: a=1; login_aliyunid_csrf=C'\n-H 'sec_token: S'").secToken, 'S', '百炼：-H 头形式仍可用（sec_token 优先于 cookie）')

// 5.2 双层信封 / JSON 字符串包袱 / 失败帧
const bpWrap = (data) => ({ code: '200', data: { success: true, httpStatus: 200, data: JSON.stringify(data) }, successResponse: true })
const bpInner = bpExpandEmbeddedJSON(bpWrap({ per5HourPercentage: 0.25 }))
eq(bpInner.data.data.per5HourPercentage, 0.25, '百炼：内嵌 JSON 字符串被递归展开')
eq(bpFindObjectDeep(bpInner, ['per5HourPercentage']).per5HourPercentage, 0.25, '百炼：深度搜索找得到窗口对象')
const bpFail = bpEnvelopeError({ code: '200', data: { success: false, httpStatus: 200, errorCode: 'Bad Request', errorMsg: 'Bad Request' }, successResponse: true })
eq(bpFail.code, 'Bad Request', '百炼：内层 success:false 被识别为错误帧')
eq(bpEnvelopeError(bpWrap({ ok: 1 })), null, '百炼：成功信封不误报错误')

// 5.3 比例 / 时间戳 / 档位名
eq(bpRatioPct(0.25), 25, '百炼：0..1 比例 → 百分比')
eq(bpRatioPct(2), 100, '百炼：比例 >1 夹到 100')
eq(bpRatioPct(-1), 0, '百炼：比例 <0 夹到 0')
eq(bpRatioPct(null), null, '百炼：比例缺失 → null（不臆造 0）')
eq(bpDateMs(1700003600000), 1700003600000, '百炼：毫秒时间戳原样')
eq(bpDateMs(1700003600), 1700003600000, '百炼：秒时间戳 → 毫秒')
eq(bpDateMs('2026-09-23T00:00:00Z'), Date.parse('2026-09-23T00:00:00Z'), '百炼：ISO 字符串 → 毫秒')
eq(bpDateMs(0), null, '百炼：0 不当时间')
eq(bpTierName('tokenplan_solo_pro_cn'), 'Pro', '百炼：specCode → 档位展示名 Pro')
eq(bpTierName('ESSENTIAL'), 'Essential', '百炼：大写 specCode → Essential')
eq(bpTierName(null), null, '百炼：没有 specCode → null')

// 5.4 归一化：真凭据实测载荷（2026-09-23）
//     usage        → { per1MonthPercentage: 0.0508, per1MonthResetTime }（个人版只有月窗口）
//     subscription → { instanceCode, specCode:'essential', remainingDays:30, startTime, endTime, autoRenewFlag, status:'VALID' }
//     quota-config → { <档位>:{five_hour, monthly}, addon_quota:{extrabundle} }
//     bss-summary  → Data 全 0（TotalCount 0 / TotalValue "0"）→ 不算数据，走窗口折算
const bpQuotaReal = bpWrap({
  ret: ['SUCCESS::接口调用成功'],
  data: { data: { lite: { five_hour: 700, monthly: 11500 }, essential: { five_hour: 1800, monthly: 25500 }, addon_quota: { extrabundle: 20000 } } },
})
eq(bpTierKey('tokenplan_solo_pro_cn'), 'pro', '百炼：specCode → 档位键 pro')
eq(bpQuotaObjectFor(bpExpandEmbeddedJSON(bpQuotaReal), 'essential').monthly, 25500, '百炼：quota-config 按档位键取到 Essential 月上限')

const bpPlan = bpNormalizePlan({
  usage: bpWrap({ per1MonthPercentage: 0.05083596392156863, per1MonthResetTime: 1792771200000 }),
  subscription: bpWrap({ instanceCode: 'sfm_tokenplansolo_public_cn-fwz4z02qs08', specCode: 'essential', remainingDays: 30, startTime: 1790162066000, endTime: 1792771200000, autoRenewFlag: false, status: 'VALID' }),
  quotaConfig: bpQuotaReal,
  summary: bpWrap({ RequestId: 'x', Message: 'Successful!', Data: { Uid: 1817996999251428, TotalSurplusValue: '0', TotalCount: 0, TotalValue: '0' } }),
  errors: {},
}, 1790166071755, 'BAILIAN_CONSOLE_COOKIE')
eq(bpPlan.planName, 'Essential', '百炼：specCode essential → 档位 Essential')
eq(bpPlan.windows.monthly.usedPercent, 5.0836, '百炼：per1MonthPercentage → 月窗口已用 %（保留 4 位）')
eq(bpPlan.windows.monthly.kind, 'month', '百炼：月窗口 kind=month')
eq(bpPlan.windows.monthly.resetsAt, 1792771200000, '百炼：月窗口重置时间')
eq(bpPlan.windows.fiveHour.usedPercent, null, '百炼：个人版没有 5 小时百分比 → null（面板据此不渲染该行）')
eq(bpPlan.caps.fiveHour, 1800, '百炼：caps.fiveHour = Essential 档 5 小时上限')
eq(bpPlan.caps.month, 25500, '百炼：caps.month = Essential 档月上限')
eq(bpPlan.caps.addon, 20000, '百炼：caps.addon = 用量包（addon_quota.extrabundle）')
eq(bpPlan.credit.source, 'window', '百炼：BSS 全 0 → 不算数据，月额度改走窗口折算')
eq(bpPlan.credit.total, 25500, '百炼：折算月额度总量 = 档位月上限')
eq(bpPlan.credit.used, 1296, '百炼：折算已用 = round(25500 × 5.0836%) = 1296（Credits 取整）')
eq(bpPlan.credit.remaining, 24204, '百炼：折算剩余 = 25500 - 1296')
eq(bpPlan.sub.status, 'VALID', '百炼：subscription.status 透传')
eq(bpPlan.sub.remainingDays, 30, '百炼：subscription.remainingDays 透传')
eq(bpPlan.sub.endTime, 1792771200000, '百炼：subscription.endTime → 毫秒')
eq(bpPlan.sub.autoRenew, false, '百炼：autoRenewFlag → autoRenew')
eq(bpPlan.sub.instanceCode, 'sfm_tokenplansolo_public_cn-fwz4z02qs08', '百炼：实例码透传')
ok(!bpPlan.debug, '百炼：解析成功时不带 debug 样本')

// 5.4b BSS 有真数（团队版/其它账户）→ 优先用 BSS；没有 BSS 但有窗口比例 → 折算
const bpBss = bpNormalizePlan({
  usage: bpWrap({ per1MonthPercentage: 0.5 }),
  subscription: bpWrap({ specCode: 'pro' }),
  quotaConfig: bpQuotaReal,
  summary: bpWrap({ TotalCount: 1, EquityList: [{ TotalValue: '180000', TotalSurplusValue: '90000' }] }),
  errors: {},
}, 1, 'x')
eq(bpBss.credit.source, 'bss', '百炼：BSS 有真数时优先用汇总')
eq(bpBss.credit.remaining, 90000, '百炼：BSS 剩余透传')

// 5.4c 只有 per1WeekPercentage（历史口径）→ kind=week
const bpWeek = bpNormalizePlan({
  usage: bpWrap({ per1WeekPercentage: 0.25, per1WeekResetTime: 1700007200000 }),
  subscription: bpWrap({ specCode: 'essential' }),
  quotaConfig: bpQuotaReal,
  summary: null,
  errors: {},
}, 1, 'x')
eq(bpWeek.windows.monthly.kind, 'week', '百炼：per1WeekPercentage → kind=week（面板显示「每周」）')
eq(bpWeek.credit.source, 'window', '百炼：无 BSS 汇总 → 月额度按窗口比例折算')
eq(bpWeek.credit.total, 25500, '百炼：折算月额度总量取档位月上限')
eq(bpWeek.credit.used, 6375, '百炼：折算已用 = 25500 × 25%')
eq(bpWeek.credit.remaining, 19125, '百炼：折算剩余 = 总量 - 已用')
// 认不出档位时不做「随便挑一个档位」的兜底（档位上限各不相同，认错比留空更糟）
const bpNoTier = bpNormalizePlan({ usage: bpWrap({ per1MonthPercentage: 0.5 }), subscription: bpWrap({ specCode: 'pro' }), quotaConfig: bpQuotaReal, summary: null, errors: {} }, 1, 'x')
eq(bpNoTier.caps, null, '百炼：quota-config 里没有本档位时不猜（caps 为 null）')

// 5.5 缺字段 / 网关空载荷：一律 null，不臆造 0（且给 debug 样本便于对着真实载荷改解析）
const bpEmpty = bpNormalizePlan({ usage: bpWrap({}), subscription: null, quotaConfig: null, summary: null, errors: {} }, 1, 'BAILIAN_CONSOLE_COOKIE')
eq(bpEmpty.windows.fiveHour.usedPercent, null, '百炼：窗口比例缺失 → null')
eq(bpEmpty.windows.monthly.resetsAt, null, '百炼：窗口重置缺失 → null')
eq(bpEmpty.caps, null, '百炼：没有 quota-config → caps 为 null')
eq(bpEmpty.credit, null, '百炼：没有汇总也没有上限 → credit 为 null')
eq(bpEmpty.sub, null, '百炼：没有 subscription → sub 为 null')
eq(bpEmpty.planName, null, '百炼：没有 specCode → 档位 null')
ok(!!bpEmpty.debug && typeof bpEmpty.debug.usage === 'string', '百炼：解析不出额度时留 debug 原始样本')

// ---- 6. DeepSeek 官网用量页：载荷归一化 + 浏览器 Local Storage 读取 ----
{
  // 6a. 归一化：官网 amount/cost 两份载荷 → 当月 token/金额/请求数/日均/按模型
  const amount = { code: 0, data: { biz_data: {
    total: [
      { model: 'deepseek-v4-flash', usage: [
        { type: 'PROMPT_CACHE_HIT_TOKEN', amount: 1000 },
        { type: 'PROMPT_CACHE_MISS_TOKEN', amount: 100 },
        { type: 'RESPONSE_TOKEN', amount: 50 },
        { type: 'REQUEST', amount: 3 },
      ] },
      { model: 'deepseek-v4-pro', usage: [
        { type: 'PROMPT_CACHE_HIT_TOKEN', amount: 400 },
        { type: 'RESPONSE_TOKEN', amount: 20 },
        { type: 'REQUEST', amount: 1 },
      ] },
    ],
    days: [
      { date: '2026-09-01', data: [{ model: 'deepseek-v4-flash', usage: [{ type: 'PROMPT_CACHE_HIT_TOKEN', amount: 600 }, { type: 'RESPONSE_TOKEN', amount: 30 }, { type: 'REQUEST', amount: 2 }] }] },
      { date: '2026-09-02', data: [{ model: 'deepseek-v4-pro', usage: [{ type: 'PROMPT_CACHE_HIT_TOKEN', amount: 400 }, { type: 'REQUEST', amount: 1 }] }] },
    ],
  } } }
  const cost = { code: 0, data: { biz_data: [{
    currency: 'CNY',
    total: [
      { model: 'deepseek-v4-flash', usage: [{ type: 'PROMPT_CACHE_HIT_TOKEN', amount: 0.02 }, { type: 'PROMPT_CACHE_MISS_TOKEN', amount: 0.1 }, { type: 'RESPONSE_TOKEN', amount: 0.2 }] },
      { model: 'deepseek-v4-pro', usage: [{ type: 'RESPONSE_TOKEN', amount: 0.5 }] },
    ],
    days: [
      { date: '2026-09-01', data: [{ model: 'deepseek-v4-flash', usage: [{ type: 'RESPONSE_TOKEN', amount: 0.2 }] }] },
      { date: '2026-09-02', data: [{ model: 'deepseek-v4-pro', usage: [{ type: 'RESPONSE_TOKEN', amount: 0.5 }] }] },
    ],
  }] } }
  const n = normalizePlatformUsage(amount, cost, 9, 2026)
  eq(n.ok, true, '官网用量：正常载荷 → ok:true')
  eq(n.totalTokens, 1570, '官网用量：token = 命中 1400 + 未命中 100 + 输出 70（REQUEST 不算 token）')
  eq(n.requestCount, 4, '官网用量：REQUEST 单独计请求数')
  eq(n.category, { cacheHit: 1400, cacheMiss: 100, response: 70 }, '官网用量：命中/未命中/输出三桶')
  eq(n.totalCost, 0.82, '官网用量：金额累加（REQUEST 不计金额）')
  eq(n.currency, 'CNY', '官网用量：币种透传')
  eq(n.topModel, 'deepseek-v4-flash', '官网用量：用量最大模型')
  eq(n.models[0].model, 'deepseek-v4-flash', '官网用量：按模型排序（最大在前）')
  eq(n.activeDays, 2, '官网用量：有量天数 = 2')
  eq(n.dailyAvgTokens, 785, '官网用量：日均 token = 1570 / 2')
  eq(n.dailyAvgCost, 0.41, '官网用量：日均金额 = 0.82 / 2')
  eq(n.days.length, 2, '官网用量：逐日明细（amount × cost 合并）')
  eq(n.days[0], { date: '2026-09-01', tokens: 630, cost: 0.2, requests: 2 }, '官网用量：逐日 tokens/cost/requests')

  // 6b. 缺字段 / 空载荷 / 脏值 → 不臆造、不 NaN
  eq(normalizePlatformUsage(null, null, 9, 2026).ok, false, '官网用量：缺 biz_data → ok:false')
  const empty = normalizePlatformUsage({ data: { biz_data: {} } }, { data: { biz_data: [{}] } }, 9, 2026)
  eq(empty.ok, true, '官网用量：空 total/days 仍 ok:true')
  eq(empty.totalTokens, 0, '官网用量：空载荷 → 0（不是 NaN）')
  eq(empty.activeDays, 0, '官网用量：没有有量天数')
  eq(empty.dailyAvgTokens, 0, '官网用量：日均不除零')
  eq(empty.currency, 'CNY', '官网用量：缺币种 → 默认 CNY')
  const weird = normalizePlatformUsage(
    { data: { biz_data: { total: [{ model: 'm', usage: [{ type: 'RESPONSE_TOKEN', amount: 'abc' }, { type: 'RESPONSE_TOKEN', amount: -5 }] }] } } },
    { data: { biz_data: [{ total: [] }] } }, 9, 2026)
  eq(weird.totalTokens, 0, '官网用量：非数字 / 负值不进合计')

  // 6c. 浏览器 Local Storage 解析：.log FULL 记录 → put 条目 → token 候选
  const varint = (n) => { const out = []; let v = n; do { let b = v & 0x7f; v >>>= 7; if (v) b |= 0x80; out.push(b) } while (v); return Buffer.from(out) }
  const buildLogRecord = (keyStr, valStr) => {
    const key = Buffer.concat([Buffer.from('_https://platform.deepseek.com\u0000' + keyStr), Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])])
    const val = Buffer.from(valStr)
    const count = Buffer.alloc(4); count.writeUInt32LE(1, 0)
    const body = Buffer.concat([Buffer.alloc(8), count, Buffer.from([1]), varint(key.length), varint(val.length), key, val])
    const head = Buffer.alloc(7); head.writeUInt16LE(body.length, 4); head[6] = 1
    return Buffer.concat([head, body])
  }
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + 'A'.repeat(60) + '.sig'
  const entries = parseLogEntries(buildLogRecord('userToken', jwt))
  eq(entries.length, 1, '浏览器 token：.log FULL 记录解析出 1 条 put 条目')
  ok(entries[0].key.includes('platform.deepseek.com') && entries[0].key.endsWith('userToken'), '浏览器 token：key 去掉 8 字节 seq 后是 userToken')
  eq(extractTokenCandidates(entries), [jwt], '浏览器 token：从 userToken 值里提取出 JWT 候选')
  eq(extractTokenCandidates(parseLogEntries(buildLogRecord('theme', jwt))), [], '浏览器 token：非 token 键不算候选')
  eq(parseLogEntries(Buffer.alloc(0)), [], '浏览器 token：空文件不抛')
  eq(parseLdbEntries(Buffer.alloc(10)), [], '浏览器 token：过短的 .ldb 不抛')
  ok(joinP('a', 'b') === 'a/b', '浏览器 token：路径拼接')

  // 6d. 粘贴容错：裸值 / Bearer 前缀 / 引号 / 直接粘 localStorage 的 JSON 记录
  eq(cleanPlatformToken(jwt), jwt, '粘贴容错：裸值原样')
  eq(cleanPlatformToken('Bearer ' + jwt), jwt, '粘贴容错：去掉 Bearer 前缀')
  eq(cleanPlatformToken('"' + jwt + '"'), jwt, '粘贴容错：去掉双引号')
  eq(cleanPlatformToken("'" + jwt + "'"), jwt, '粘贴容错：去掉单引号')
  eq(cleanPlatformToken(JSON.stringify({ value: jwt, __version: '0' })), jwt, '粘贴容错：解开 localStorage 的 {value,__version} 记录')
  eq(cleanPlatformToken('  ' + jwt + '  '), jwt, '粘贴容错：去掉首尾空白')
  eq(cleanPlatformToken(''), '', '粘贴容错：空串 → 空')
  eq(cleanPlatformToken(null), '', '粘贴容错：null → 空')
}

console.log(failed === 0 ? 'HOST_UNIT_OK' : 'HOST_UNIT_FAILED: ' + failed)
process.exit(failed === 0 ? 0 : 1)