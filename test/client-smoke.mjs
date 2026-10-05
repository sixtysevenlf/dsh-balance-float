// client-smoke.mjs — 无浏览器冒烟测试（不依赖 DSH / 浏览器）
//   用最小 React/DOM shim 跑一遍 lib/client.js 的渲染路径：注入 apply → 点各标签（rail 按钮）→
//   断言六个标签与 OpenCode Go / 阶跃星辰 StepFun / 阿里云百炼 Token Plan 面板渲染正确。
// 用法：
//   node test/client-smoke.mjs                # 正常载荷（StepPlan Credit 月池 + 百炼窗口/月额度）
//   SMOKE_CASE=degraded node test/client-smoke.mjs   # StepFun 无控制台令牌 + 百炼无额度字段：显示 -- + 提示，不崩
//   SMOKE_CASE=legacy   node test/client-smoke.mjs   # StepFun 旧套餐（plan_family=1）：改显 5 小时 / 每周窗口
//   SMOKE_CASE=error    node test/client-smoke.mjs   # StepFun / 百炼接口报错（应显示错误态，不崩）
const CASE = process.env.SMOKE_CASE || 'ok';
const NOW = Date.now();
const routes = {
  '/api/deepseek/balance': { ok: true, balance: 2.77, currency: 'CNY', estTokens: 25366300, pricePerMillion: 0.1092, pricePeriod: 'peak', model: 'deepseek-v4.1-flash', fetchedAt: NOW },
  '/api/commandcode-goat/balance': { ok: true, fetchedAt: NOW, fiveHour: { percent: 10, resetsAt: NOW + 3600000 }, weekly: { percent: 20, resetsAt: NOW + 86400000 }, monthly: { present: true, remaining: 12.5 } },
  '/api/opencode-go/balance': { ok: true, fetchedAt: NOW, rolling: { status: 'ok', percent: 6, resetsAt: '2026-09-14T13:08:46.329Z' }, weekly: { status: 'ok', percent: 2, resetsAt: '2026-09-21T00:00:00.329Z' }, monthly: { status: 'ok', percent: 1, resetsAt: '2026-10-14T08:02:19.329Z' }, source: 'DSH 凭据 OPENCODE_GO_API_KEY' },
  '/api/hypercharm/balance': { ok: true, balance: 247, unit: 'hc', priceUsd: null, fetchedAt: NOW },
  '/api/stepfun/balance': {
    ok: true, balance: 13.77, cashBalance: 0, voucherBalance: 13.77, accountType: 'prepaid', currency: 'CNY', fetchedAt: NOW,
    // Step Plan 订阅额度（控制台 GetStepPlanStatus + QueryStepPlanRateLimit 归一化后的形状）
    plan: {
      ok: true, source: 'STEPFUN_CONSOLE_COOKIE', family: 2, kind: 'credit', name: 'Flash Plus',
      // host 侧已把控制台的 epoch 秒归一成毫秒（见 lib/index.js sfEpochMs）
      status: 1, planType: 2, activatedAt: NOW - 86400 * 3 * 1000, expiredAt: NOW + 86400 * 27 * 1000, autoRenew: true,
      credit: {
        leftRate: 0.99994034, resetTime: NOW + 86400 * 10 * 1000, topupLeftRate: 0,
        // type 1 = SUBSCRIPTION（月池），type 2 = TOPUP（加油包）—— 与官方枚举一致
        buckets: [
          { type: 1, total: 1600000000, residual: 1599904510, expireAt: NOW + 86400 * 10 * 1000 },
          { type: 2, total: 400000000, residual: 900000000, expireAt: NOW + 86400 * 20 * 1000 },
        ],
      },
      window: { fiveHourLeftRate: null, fiveHourResetTime: null, weeklyLeftRate: null, weeklyResetTime: null },
      fetchedAt: NOW,
    },
  },
  // 阿里云百炼 Token Plan（host /api/bailian/plan 归一化后的形状）：
  // usedPercent = 已用 %（client 用 100 - usedPercent 算剩余）；caps = 档位窗口上限；
  // 默认载荷 = 2026-09-23 真凭据实测形态（Essential 档、个人版只有月窗口、BSS 汇总全 0 → 月额度用窗口折算）
  '/api/bailian/plan': {
    ok: true, source: 'BAILIAN_CONSOLE_COOKIE', planCode: 'essential', planName: 'Essential',
    windows: {
      fiveHour: { usedPercent: null, resetsAt: null, totalQuota: 1800 },
      monthly: { usedPercent: 5.05, resetsAt: NOW + 86400 * 30 * 1000, totalQuota: 25500, kind: 'month' },
    },
    caps: { fiveHour: 1800, month: 25500, addon: 20000 },
    credit: { total: 25500, remaining: 24212, used: 1288, resetsAt: NOW + 86400 * 30 * 1000, count: null, source: 'window' },
    sub: { status: 'VALID', instanceCode: 'sfm_tokenplansolo_public_cn-fwz4z02qs08', startTime: NOW - 86400 * 1000, endTime: NOW + 86400 * 30 * 1000, remainingDays: 30, autoRenew: false },
    errors: {}, fetchedAt: NOW,
  },
  // DeepSeek 官网用量页（host /api/deepseek/usage 归一化后的形状）：
  // 口径 = platform.deepseek.com「用量」页背后的同源接口（/api/v0/usage/amount + /cost），
  // 就是网页上显示的那个数；不是本地统计、也不是余额折算。
  '/api/deepseek/usage': {
    ok: true, month: 9, year: 2026,
    totalTokens: 12703701, totalCost: 12.34, currency: 'CNY',
    requestCount: 1234, topModel: 'deepseek-v4-flash', activeDays: 12,
    category: { cacheHit: 12345678, cacheMiss: 123456, response: 234567 },
    models: [{ model: 'deepseek-v4-flash', tokens: 12703701, requests: 1234, cacheHit: 12345678, cacheMiss: 123456, response: 234567 }],
    dailyAvgTokens: 1058642, dailyAvgCost: 1.03,
    source: 'platform.deepseek.com', tokenSource: 'DSH 凭据 DEEPSEEK_PLATFORM_TOKEN', fetchedAt: NOW,
    days: [{ date: '2026-09-01', tokens: 1058642, cost: 1.03, requests: 100 }],
  },
};
// StepFun 降级/错误载荷（同一套渲染路径，只换数据源）
// degraded：有按量账户余额但没有控制台令牌 → plan=null + planError（订阅额度显示 --，不臆造数字）
if (CASE === 'degraded') {
  routes['/api/stepfun/balance'] = { ok: true, balance: 5, accountType: 'postpaid', currency: 'CNY', fetchedAt: NOW, plan: null, planError: '未配置 STEPFUN_CONSOLE_COOKIE / STEPFUN_CONSOLE_TOKEN（阶跃控制台登录凭据）' };
  // 百炼：网关只回 Success 空载荷 / 没解析出任何额度字段（窗口与月额度都给 null，前端显示 --）
  routes['/api/bailian/plan'] = {
    ok: true, source: 'BAILIAN_CONSOLE_COOKIE', planCode: null, planName: null,
    windows: {
      fiveHour: { usedPercent: null, resetsAt: null, totalQuota: null },
      monthly: { usedPercent: null, resetsAt: null, totalQuota: null, kind: null },
    },
    caps: null, credit: null, sub: null, errors: { usage: 'Token Plan usage 网关返回空载荷' }, fetchedAt: NOW,
  };
}
// windows：账号/套餐同时有 5 小时与月窗口（真凭据实测的个人版只有月窗口，这条守住双窗口路径）
if (CASE === 'windows') routes['/api/bailian/plan'] = {
  ok: true, source: 'BAILIAN_CONSOLE_COOKIE', planCode: 'tokenplan_solo_pro_cn', planName: 'Pro',
  windows: {
    fiveHour: { usedPercent: 25, resetsAt: NOW + 3600 * 1000, totalQuota: 12000 },
    monthly: { usedPercent: 50, resetsAt: NOW + 86400 * 20 * 1000, totalQuota: 180000, kind: 'month' },
  },
  caps: { fiveHour: 12000, month: 180000, addon: null },
  credit: { total: 180000, remaining: 90000, used: 90000, resetsAt: NOW + 86400 * 20 * 1000, count: null, source: 'window' },
  sub: null, errors: {}, fetchedAt: NOW,
};
// legacy：旧套餐（CODING family=1）→ 走 5 小时 / 每周窗口
if (CASE === 'legacy') routes['/api/stepfun/balance'] = {
  ok: true, balance: 13.77, cashBalance: 0, voucherBalance: 13.77, accountType: 'prepaid', currency: 'CNY', fetchedAt: NOW,
  plan: {
    ok: true, family: 1, kind: 'window', name: 'Flash (旧套餐)', status: 3, activatedAt: null, expiredAt: null, autoRenew: false,
    credit: { leftRate: null, resetTime: null, topupLeftRate: null, buckets: [] },
    window: { fiveHourLeftRate: 0.8, fiveHourResetTime: NOW + 3600 * 1000, weeklyLeftRate: 0.5, weeklyResetTime: NOW + 86400 * 1000 },
    fetchedAt: NOW,
  },
};
if (CASE === 'error') {
  routes['/api/stepfun/balance'] = { ok: false, error: '余额接口 HTTP 401: unauthorized' };
  routes['/api/bailian/plan'] = { ok: false, error: '控制台 HTTP 401（登录已失效，重贴 BAILIAN_CONSOLE_COOKIE）' };
}
// nousage：DeepSeek 官网用量页取不到（token 未配置 / 已失效）→ 该行显示 -- + 「官网 · 未取到」，不拿本地数顶上
if (CASE === 'nousage') {
  routes['/api/deepseek/usage'] = { ok: false, error: '未取到官网用量页 token：请在 DSH 凭据配置 DEEPSEEK_PLATFORM_TOKEN' };
}
// gozero：Command Code 在窗口**无用量**时把 resetAt 回成 0（实测）→ 面板显示「空闲」+ 原因，不显示 '--'
if (CASE === 'gozero') {
  routes['/api/commandcode-goat/balance'] = {
    ok: true, fetchedAt: NOW,
    fiveHour: { status: null, percent: 0, resetsAt: null },
    weekly: { status: null, percent: 0, resetsAt: null },
    monthly: { present: true, remaining: 34.99 },
  };
}
globalThis.window = { innerWidth: 1280, innerHeight: 800, addEventListener: () => {}, removeEventListener: () => {}, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, __ModuleLoader__: { load(cfg) { globalThis.__CFG = cfg; } } };
globalThis.document = { querySelector: () => null, createElement: () => ({ setAttribute() {}, style: {}, appendChild() {} }), head: { appendChild() {} } };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.fetch = async (url) => ({ json: async () => routes[url] || { ok: false, error: 'no route ' + url } });

const st = [], refs = [], ranEffects = new Set();
let hookIndex = 0, rerender = null, renders = 0;
const React = {
  useState: (v) => { const i = hookIndex++; if (!(i in st)) st[i] = typeof v === 'function' ? v() : v;
    return [st[i], (nv) => { st[i] = typeof nv === 'function' ? nv(st[i]) : nv; if (rerender) rerender(); }]; },
  useEffect: (f) => { const i = hookIndex++; if (ranEffects.has(i)) return; ranEffects.add(i); const c = f(); if (typeof c === 'function') ranEffects.add('cleanup' + i); },
  useCallback: (f) => { hookIndex++; return f; },
  useRef: (v) => { const i = hookIndex++; if (!(i in refs)) refs[i] = { current: v }; return refs[i]; },
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
};
const requireShim = (m) => { if (m === 'react') return React; throw new Error('unexpected require: ' + m) };

await import(new URL('../lib/client.js', import.meta.url).href);
const mod = globalThis.__CFG.factory(requireShim);
let renderFn = null;
mod.apply({
  effect: (f) => f(),
  interval: () => () => {},
  slots: { inject: (n, cb) => cb(), register: (meta, render) => { if (meta.name === 'shell.overlay') renderFn = render; return () => {}; } },
  get: () => undefined,
});
let tree = null;
const render = () => { hookIndex = 0; renders++; tree = renderFn({}); return tree; };
rerender = render;
tree = render();
await new Promise((r) => setTimeout(r, 400)); // 等六个接口的异步 setState

const find = (n, pred, out = []) => {
  if (n == null || typeof n === 'string' || typeof n === 'number') return out;
  if (Array.isArray(n)) { n.forEach((x) => find(x, pred, out)); return out; }
  if (pred(n)) out.push(n);
  find(n.children, pred, out);
  return out;
};
const collectText = (n, out = []) => {
  if (n == null) return out;
  if (typeof n === 'string' || typeof n === 'number') { out.push(String(n)); return out; }
  if (Array.isArray(n)) { n.forEach((x) => collectText(x, out)); return out; }
  collectText(n.children, out);
  return out;
};
// rail 品牌按钮（v3 起标签即纵向 rail 按钮，class = ocg-rail-btn）
const tabBtns = find(tree, (n) => n.type === 'button' && String((n.props || {}).className || '').includes('ocg-rail-btn'));
const activeLabel = () => {
  const act = find(tree, (n) => String((n.props || {}).className || '').includes('ocg-rail-btn active'));
  return collectText(act[0] || []).join('');
};
const clickTab = (label) => {
  const btn = tabBtns.find((b) => collectText(b).join('') === label);
  if (!btn) throw new Error('找不到标签按钮: ' + label);
  btn.props.onClick();
};

let failed = 0;
const ok = (cond, msg) => { if (!cond) failed++; console.log((cond ? 'PASS ' : 'FAIL ') + msg); };

// 标签页集合是**用户可裁剪的**（设置页能永久删除内置页），所以这里不写死「六个」：
// 只要求「剩下的这些」按声明顺序排列，并且一个都不少地被测到。
const tabLabels = tabBtns.map((b) => collectText(b).join(''));
const hasTab = (label) => tabLabels.includes(label);
const DECLARED = ['DeepSeek', 'GOAT', 'OpenCode', 'Hyper', 'StepFun', '百炼'];
const missing = DECLARED.filter((l) => !tabLabels.includes(l));
const present = DECLARED.filter((l) => tabLabels.includes(l));
ok(tabLabels.length === present.length, '品牌轨按钮数与当前保留的内置页数一致（' + tabLabels.join('/') + '）');
ok(JSON.stringify(tabLabels) === JSON.stringify(present), '保留的标签按声明顺序排列（' + tabLabels.join(' / ') + '）');
if (missing.length) console.log('INFO 已永久删除的内置页（跳过其断言）：' + missing.join(' / '));
ok(tabBtns.every((b) => b.props.title), '每个标签都有 title 悬浮说明（短标签不丢全名）');

const ocBtn = tabBtns.find((b) => collectText(b).join('') === 'OpenCode');
if (ocBtn) {
  ocBtn.props.onClick();
  const txt = collectText(tree).join(' | ');
  ok(txt.includes('滚动') && txt.includes('每周') && txt.includes('每月'), 'OC 面板三窗口行（滚动/每周/每月）');
  ok(txt.includes('94%') && txt.includes('98%') && txt.includes('99%'), '剩余 %（100-已用）：94% / 98% / 99%');
  ok(txt.includes('已用 6%') && txt.includes('已用 2%') && txt.includes('已用 1%'), '已用 % 文案');
  ok(txt.includes('额度刷新'), '额度刷新倒计时行');
  ok(activeLabel() === 'OpenCode', 'OpenCode 为激活标签');
  const root = find(tree, (n) => String((n.props || {}).className || '').startsWith('opencg'))[0];
  ok(String(root.props.title).startsWith('OpenCode Go 额度'), '面板 tip：' + root.props.title);
  // 该页 tip 仍只讲该 plan 自己的额度窗口（用量来自 OpenCode 官方 /usage，不是本地统计）
  ok(String(root.props.title).includes('OpenCode Go 额度'), 'OpenCode 页 tip 仍是该 plan 的额度窗口');
} else console.log('SKIP OpenCode 页已被删除');

// ---- 阶跃星辰 StepFun 标签页 ----
const sfBtn = tabBtns.find((b) => collectText(b).join('') === 'StepFun');
if (sfBtn) {
  sfBtn.props.onClick();
  const txt = collectText(tree).join(' | ');
  const root = find(tree, (n) => String((n.props || {}).className || '').startsWith('opencg'))[0];
  ok(activeLabel() === 'StepFun', 'StepFun 为激活标签（case=' + CASE + '）');
  if (CASE === 'error') {
    ok(txt.includes('获取失败'), '错误态：状态行显示「获取失败」');
    ok(txt.includes('订阅额度') && txt.includes('按量余额'), '错误态：行结构保留（订阅额度 / 按量余额）');
    ok(!txt.includes('¥13'), '错误态：不残留旧金额');
    ok(String(root.props.title).includes('获取失败'), '错误态 tip：' + root.props.title);
  } else if (CASE === 'degraded') {
    ok(txt.includes('订阅额度') && txt.includes('未配置控制台令牌'), '降级态：订阅额度缺失时提示未配置控制台令牌');
    ok(txt.includes('¥5.00'), '降级态：按量余额仍显示 ¥5.00');
    ok(txt.includes('后付费'), '降级态：postpaid → 后付费');
    ok(!txt.includes('¥0.00') && !txt.includes('¥13.77'), '降级态：缺失字段显示 -- 而非臆造 0');
    ok(txt.includes('按量余额') && txt.includes('每 60s 刷新'), '降级态：状态行按「按量余额」标注');
    ok(!txt.includes('获取失败'), '降级态无错误态');
    ok(String(root.props.title).includes('订阅额度未取到'), '降级态 tip 说明订阅额度未取到：' + root.props.title);
  } else if (CASE === 'legacy') {
    ok(txt.includes('5小时额度') && txt.includes('80.0%'), '旧套餐：5 小时窗口剩余 80.0%');
    ok(txt.includes('每周额度') && txt.includes('50.0%'), '旧套餐：每周窗口剩余 50.0%');
    ok(txt.includes('取消待生效'), '旧套餐：状态 3 → 取消待生效');
    ok(!txt.includes('加油包'), '旧套餐：不显示 Credit 月池相关行');
    ok(String(root.props.title).includes('旧套餐窗口'), '旧套餐 tip：' + root.props.title);
  } else {
    ok(txt.includes('订阅额度') && txt.includes('99.99%'), 'StepFun 面板显示订阅额度剩余比例 99.99%');
    ok(txt.includes('Flash Plus'), 'StepFun 面板显示套餐名（subscription.name）');
    ok(txt.includes('月池重置'), 'StepFun 面板显示月池重置行');
    ok(txt.includes('月池余额') && txt.includes('1599.9M'), 'StepFun 面板显示月池余额 1599.9M Credit（SUBSCRIPTION bucket）');
    ok(txt.includes('加油包') && txt.includes('900M'), 'StepFun 面板显示加油包剩余 900M Credit（TOPUP bucket）');
    ok(txt.includes('生效中'), 'StepFun 面板显示订阅状态（1 → 生效中）');
    ok(txt.includes('按量余额') && txt.includes('¥13.77'), 'StepFun 面板同时显示按量账户余额 ¥13.77');
    ok(txt.includes('预付费'), 'StepFun 面板显示账户类型（prepaid → 预付费）');
    ok(txt.includes('每 60s 刷新'), 'StepFun 状态行标注 60s 轮询');
    ok(String(root.props.title).includes('阶跃星辰 Step Plan 订阅额度 剩余 99.99%'), 'StepFun 面板 tip：' + root.props.title);
    ok(!txt.includes('获取失败') && !txt.includes('未配置控制台令牌'), 'StepFun 面板无错误态');
    const planTip = find(tree, (n) => String((n.props || {}).title || '').includes('subscription_credit_left_rate'));
    ok(planTip.length === 1, '订阅额度行悬浮说明写明官方字段名');
  }
}

// ---- 阿里云百炼 Token Plan 标签页 ----
const blBtn = tabBtns.find((b) => collectText(b).join('') === '百炼');
if (blBtn) {
  blBtn.props.onClick();
  const txt = collectText(tree).join(' | ');
  const root = find(tree, (n) => String((n.props || {}).className || '').startsWith('opencg'))[0];
  ok(activeLabel() === '百炼', '百炼为激活标签（case=' + CASE + '）');
  ok(txt.includes('月度') || txt.includes('每周'), '百炼面板必有月/周窗口行（case=' + CASE + '）');
  if (CASE === 'error') {
    ok(txt.includes('获取失败'), '百炼错误态：状态行显示「获取失败」');
    ok(!txt.includes('Essential') && !txt.includes('24,212'), '百炼错误态：不残留旧额度');
    ok(String(root.props.title).includes('获取失败'), '百炼错误态 tip：' + root.props.title);
  } else if (CASE === 'degraded') {
    ok(String(root.props.title).includes('阿里云百炼 Token Plan'), '百炼降级态 tip 仍标明服务：' + root.props.title);
    // 窗口/月额度都缺失 → 显示 --（不臆造 0），且不进入错误态
    ok(txt.includes('--'), '百炼降级态：额度字段缺失时显示 --');
    ok(!txt.includes('获取失败'), '百炼降级态无错误态（网关 Success 空载荷不算失败）');
    ok(txt.includes('0%') === false, '百炼降级态：不臆造 0%');
    ok(txt.includes('套餐额度') && txt.includes('每 60s 刷新'), '百炼降级态：状态行仍标注 60s 轮询');
    const usageTip = find(tree, (n) => String((n.props || {}).title || '').includes('Token Plan usage 网关返回空载荷'));
    ok(usageTip.length >= 1, '百炼状态行/hover 带出解析诊断');
  } else if (CASE === 'windows') {
    ok(txt.includes('5小时') && txt.includes('月度'), '百炼双窗口：有 5 小时百分比时才渲染 5 小时行');
    ok(txt.includes('75%') && txt.includes('50%'), '百炼双窗口剩余 %（5小时 75%、月度 50%）');
    ok(txt.includes('90,000 / 180,000'), '百炼双窗口月额度（剩余 / 总量）');
    ok(txt.includes('Pro'), '百炼双窗口档位 Pro');
  } else {
    // 2026-09-23 真凭据实测形态：个人版只有月窗口 → 不渲染 5 小时行（不留永远 -- 的空行）
    ok(!txt.includes('5小时'), '百炼实测形态：个人版无 5 小时字段 → 不渲染 5 小时行');
    ok(txt.includes('月度'), '百炼实测形态：按 month 口径显示「月度」窗口');
    ok(txt.includes('95%'), '百炼实测形态：月度剩余 95%（100 - 已用 5.05%，四舍五入）');
    ok(txt.includes('已用 5%'), '百炼实测形态：已用 5% 文案');
    ok(txt.includes('Essential'), '百炼实测形态：specCode essential → 档位 Essential');
    ok(txt.includes('24,212 / 25,500'), '百炼实测形态：月额度 = 档位月上限 × 窗口比例折算（24,212 / 25,500）');
    ok(txt.includes('剩 30 天'), '百炼实测形态：套餐行显示订阅剩余天数（subscription.remainingDays）');
    ok(String(root.props.title).includes('阿里云百炼 Token Plan · Essential（剩 30 天）'), '百炼实测形态 tip：' + root.props.title);
    ok(txt.includes('每 60s 刷新'), '百炼状态行标注 60s 轮询');
    const secTip = find(tree, (n) => String((n.props || {}).title || '').includes('BroadScopeAspnGateway'));
    ok(secTip.length >= 1, '百炼状态行悬浮说明写明控制台网关 action');
    const capTip = find(tree, (n) => String((n.props || {}).title || '').includes('已购用量包 20,000'));
    ok(capTip.length >= 1, '百炼套餐行 hover 带用量包（addon_quota.extrabundle）');
    const creditTip = find(tree, (n) => String((n.props || {}).title || '').includes('档位月上限 × 月窗口已用 % 折算'));
    ok(creditTip.length >= 1, '百炼月额度 hover 写明「窗口折算」来源（BSS 全 0 不冒充数据）');
    const subTip = find(tree, (n) => String((n.props || {}).title || '').includes('状态 生效中'));
    ok(subTip.length >= 1, '百炼套餐行 hover 带订阅状态/到期/自动续费');
  }
}

// ---- Command Code GOAT 页「额度刷新」：官方没给 resetAt 时说清「空闲」，不显示 -- ----
if (CASE === 'gozero') {
  clickTab('GOAT');
  const txt = collectText(tree).join(' | ');
  ok(txt.includes('额度刷新') && txt.includes('空闲'), 'gozero：额度刷新行显示「空闲」而不是 --');
  ok(!txt.includes('额度刷新 --'), 'gozero：不再出现「额度刷新 --」');
  ok(txt.includes('5小时') && txt.includes('每周'), 'gozero：两档窗口行仍在');
  const tips = find(tree, (n) => String((n.props || {}).title || '').includes('官方未返回重置时间'));
  ok(tips.length >= 3, 'gozero：刷新行与两档窗口行都给出原因（实测 ' + tips.length + ' 处）');
  ok(tips.every((n) => String(n.props.title).includes('窗口暂无用量')), 'gozero：说明写的是「窗口暂无用量」而非含糊措辞');
  const root = find(tree, (n) => /^opencg(\s|$)/.test(String((n.props || {}).className || '')))[0];
  ok(String(root.props.title).startsWith('Command Code GOAT 额度'), 'gozero：窗口 tip 正常：' + root.props.title);
}

// ---- DeepSeek 页「本月已用」：数字来自官网用量页（platform.deepseek.com 同源接口）----
{
  clickTab('DeepSeek');
  const txt = collectText(tree).join(' | ');
  const root = find(tree, (n) => /^opencg(\s|$)/.test(String((n.props || {}).className || '')))[0];
  if (CASE === 'nousage') {
    ok(txt.includes('本月已用') && txt.includes('--'), 'nousage：官网用量取不到 → 本月已用显示 --');
    ok(txt.includes('官网 · 未取到'), 'nousage：小字标明官网用量未取到（不拿本地数顶上）');
    ok(!txt.includes('本月花费'), 'nousage：没有数据就不渲染「本月花费」行');
    const row = find(tree, (n) => String((n.props || {}).title || '').includes('官网用量未取到'));
    ok(row.length === 1, 'nousage：悬浮说明给失败原因与修法');
    ok(String(root.props.title).includes('官网本月已用 --'), 'nousage：窗口 tip 标明官网用量为 --');
  } else {
    ok(txt.includes('本月已用') && txt.includes('≈1270.4万 tok'), 'DeepSeek 页显示官网本月已用 token（12,703,701 → ≈1270.4万 tok）');
    ok(txt.includes('官网'), '本月已用小字标注「官网」（来源是 plan 网页，不是本地统计）');
    ok(txt.includes('本月花费') && txt.includes('¥12.34'), 'DeepSeek 页显示官网本月花费 ¥12.34');
    ok(txt.includes('日均 ¥1.03'), '本月花费尾注官网日均 ¥1.03');
    const row = find(tree, (n) => String((n.props || {}).title || '').includes('DeepSeek 官网用量'));
    ok(row.length >= 1, '本月已用行有悬浮说明');
    if (row.length) {
      const tip = String(row[0].props.title);
      ok(tip.includes('platform.deepseek.com · 2026 年 9 月'), '悬浮说明写明是官网用量页的口径与月份');
      ok(tip.includes('/api/v0/usage/amount'), '悬浮说明写明同源接口');
      ok(tip.includes('12,345,678') && tip.includes('123,456') && tip.includes('234,567'), '悬浮说明给命中/未命中/输出三桶');
      ok(tip.includes('合计 12,703,701 tok'), '悬浮说明给官网合计');
      ok(tip.includes('请求 1,234 次') && tip.includes('有量 12 天'), '悬浮说明给请求数与有量天数');
      ok(tip.includes('日均 1,058,642 tok'), '悬浮说明给官网日均 token');
      ok(tip.includes('花费 ¥12.34'), '悬浮说明给官网花费');
      ok(tip.includes('用量最大模型 deepseek-v4-flash'), '悬浮说明给用量最大模型');
      ok(tip.includes('凭据来源 DSH 凭据 DEEPSEEK_PLATFORM_TOKEN'), '悬浮说明给凭据来源');
    }
    ok(String(root.props.title).includes('官网本月已用 ≈1270.4万 tok（¥12.34）'), 'DeepSeek 窗口 tip 带官网用量：' + root.props.title);
  }
  // 官网用量只属于 DeepSeek 页：其它页不得出现（分标签页各管各的）
  for (const other of ['OpenCode', 'Hyper', 'GOAT', 'StepFun', '百炼'].filter(hasTab)) {
    clickTab(other);
    const t2 = collectText(tree).join(' | ');
    ok(!t2.includes('本月已用'), other + ' 页不出现 DeepSeek 官网用量行');
  }
}

// ---- 六个标签逐个点开：每页都要有本页关键行（防止改标签条时压坏既有面板）----
const EXPECT = {
  DeepSeek: CASE === 'nousage'
    ? ['余额', '¥2.77', '本月已用', '--', '官网 · 未取到', '预计剩余', 'tok', '模型', 'deepseek-v4.1-flash']
    : ['余额', '¥2.77', '本月已用', '≈1270.4万 tok', '官网', '本月花费', '¥12.34', '预计剩余', 'tok', '模型', 'deepseek-v4.1-flash'],
  GOAT: CASE === 'gozero'
    ? ['5小时', '每周', '月度余额', '$34.99', '额度刷新', '空闲']
    : ['5小时', '每周', '月度余额', '$12.50', '额度刷新'],
  OpenCode: ['滚动', '每周', '每月', '额度刷新'],
  Hyper: ['余额', '247', 'hc', '约合', '积分刷新'],
  StepFun: CASE === 'error' ? ['订阅额度', '按量余额', '获取失败']
    : (CASE === 'degraded' ? ['订阅额度', '按量余额', '¥5.00']
      : (CASE === 'legacy' ? ['5小时额度', '每周额度', '按量余额', '¥13.77'] : ['订阅额度', '月池余额', '月池重置', '加油包', '按量余额', '¥13.77'])),
  百炼: CASE === 'error' ? ['月度', '月额度', '获取失败']
    : (CASE === 'degraded' ? ['月度', '额度重置', '月额度', '--']
      : (CASE === 'windows' ? ['5小时', '月度', '额度重置', '月额度', '套餐', 'Pro']
        : ['月度', '额度重置', '月额度', '套餐', 'Essential'])),
};
for (const [label, needles] of Object.entries(EXPECT)) {
  if (!hasTab(label)) { console.log('SKIP ' + label + ' 面板已被删除'); continue; }
  clickTab(label);
  const txt = collectText(tree).join(' | ');
  const miss = needles.filter((n) => !txt.includes(n));
  ok(miss.length === 0, label + ' 面板关键行齐全' + (miss.length ? '（缺：' + miss.join(', ') + '）' : ''));
  ok(activeLabel() === label, label + ' 点击后成为激活标签');
}

// ---- 操控增强：迷你胶囊 / 键盘 / 主题色 / 刷新反馈 ----
{
  const findRoot = () => find(tree, (n) => /^opencg(\s|$)/.test(String((n.props || {}).className || '')))[0];
  const root0 = findRoot();
  // 这些断言原本写死「百炼（末位）」；标签页可被永久删除，所以改成跟随**实际最后一个**标签
  const lastLabel = tabLabels[tabLabels.length - 1];
  const themeOf = { DeepSeek: '#3b82f6', GOAT: '#f59e0b', OpenCode: '#8b5cf6', Hyper: '#ec4899', StepFun: '#10b981', 百炼: '#ff6a00' };
  clickTab(lastLabel);
  ok(typeof root0.props.onKeyDown === 'function', '根节点挂键盘处理（←→/R/C/Esc）');
  ok(root0.props.tabIndex === 0, '根节点可聚焦（tabIndex=0）');
  ok(root0.props.style && root0.props.style['--opencg-accent'], '服务商主题色 CSS 变量已下发');
  ok(root0.props.style['--opencg-ink'] === String(tabLabels.length - 1), lastLabel + ' 的 rail 墨条下标 = ' + (tabLabels.length - 1) + '（--opencg-ink）');
  const refreshBtn = find(tree, (n) => String((n.props || {}).className || '').includes('opencg-refresh'))[0];
  ok(!!refreshBtn && String(refreshBtn.props.title || '').includes('R'), '刷新按钮标题提示 R 快捷键');
  const actTab = find(tree, (n) => String((n.props || {}).className || '').includes('ocg-rail-btn active'))[0];
  ok(!!actTab && collectText(actTab).join('') === lastLabel, '激活标签按钮 = ' + lastLabel);
  // v3 起主题色走 CSS 变量（.ocg-rail-btn.active 用 var(--opencg-accent)），不再内联 background
  ok(root0.props.style['--opencg-accent'] === themeOf[lastLabel], lastLabel + ' 主题色已下发：' + root0.props.style['--opencg-accent']);
  const collapseBtn = find(tree, (n) => String((n.props || {}).className || '') === 'opencg-collapse')[0];
  ok(!!collapseBtn, '品牌轨有「−」收起按钮');
  collapseBtn.props.onClick({ stopPropagation: () => {} });
  ok(String(findRoot().props.className).includes('collapsed'), '点「−」后进入收起态');
  const pillEl = find(tree, (n) => String((n.props || {}).className || '') === 'opencg-pill')[0];
  const pillTxt = pillEl ? collectText(pillEl).join('') : '';
  ok(!!pillEl && pillTxt.includes(lastLabel) && pillTxt.length > lastLabel.length, '收起态胶囊=标签名+关键数值：' + pillTxt);
  const expandBtn = find(tree, (n) => String((n.props || {}).className || '') === 'opencg-pill-btn')[0];
  ok(!!expandBtn, '收起态有展开按钮');
  expandBtn.props.onClick({ stopPropagation: () => {} });
  ok(!String(findRoot().props.className).includes('collapsed'), '点展开后回到完整面板');
  findRoot().props.onKeyDown({ key: 'ArrowRight', preventDefault: () => {} });
  ok(activeLabel() === tabLabels[0], '→ 键从末位环绕切到首位（实为 ' + activeLabel() + '）');
  findRoot().props.onKeyDown({ key: 'ArrowLeft', preventDefault: () => {} });
  ok(activeLabel() === lastLabel, '← 键切回末位（实为 ' + activeLabel() + '）');
  findRoot().props.onKeyDown({ key: 'c', preventDefault: () => {} });
  ok(String(findRoot().props.className).includes('collapsed'), 'C 键进入收起态');
  findRoot().props.onKeyDown({ key: 'Escape', preventDefault: () => {} });
  ok(!String(findRoot().props.className).includes('collapsed'), 'Esc 键展开');
  const headerEl = find(tree, (n) => String((n.props || {}).className || '') === 'opencg-header')[0];
  ok(typeof headerEl.props.onDoubleClick === 'function', '标题栏挂了双击处理');
  headerEl.props.onDoubleClick({ target: { closest: () => null } });
  ok(String(findRoot().props.className).includes('collapsed'), '双击标题栏进入收起态');
  const expandBtn2 = find(tree, (n) => String((n.props || {}).className || '') === 'opencg-pill-btn')[0];
  expandBtn2.props.onClick({ stopPropagation: () => {} });
  ok(!String(findRoot().props.className).includes('collapsed'), '收起态点胶囊展开按钮恢复');
}

console.log(failed === 0 ? 'SMOKE_OK (' + renders + ' renders)' : 'SMOKE_FAILED: ' + failed);
process.exit(failed === 0 ? 0 : 1);