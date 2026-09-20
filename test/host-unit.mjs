// host-unit.mjs — host 半纯函数单测（不需要 DSH / 网络）
//   覆盖：凭据解析（整段 cURL / Cookie 头 / 裸 JWT）、JWT 解析、epoch 秒→毫秒、
//         GetStepPlanStatus + QueryStepPlanRateLimit 归一化（Credit 月池 / 旧套餐窗口 / 缺字段不臆造）
// 用法：node test/host-unit.mjs
import { __test } from '../lib/index.js'

const { sfParseCredential, sfJwtPayload, sfEpochMs, sfNormalizePlan, sfRate, sfCookieMap } = __test
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

console.log(failed === 0 ? 'HOST_UNIT_OK' : 'HOST_UNIT_FAILED: ' + failed)
process.exit(failed === 0 ? 0 : 1)