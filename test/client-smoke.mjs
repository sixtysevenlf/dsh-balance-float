// client-smoke.mjs — 无浏览器冒烟测试（不依赖 DSH / 浏览器）
//   用最小 React/DOM shim 跑一遍 lib/client.js 的渲染路径：注入 apply → 点击各标签 →
//   断言五个标签与 OpenCode Go / 阶跃星辰 StepFun（Step Plan 订阅额度 + 按量余额）面板渲染正确。
// 用法：
//   node test/client-smoke.mjs                # 正常载荷（Step Plan Credit 月池 + 加油包 + 按量余额）
//   SMOKE_CASE=degraded node test/client-smoke.mjs   # 无控制台令牌：订阅额度缺失（显示 -- + 未配置提示），按量余额仍在
//   SMOKE_CASE=legacy   node test/client-smoke.mjs   # 旧套餐（plan_family=1）：改显 5 小时 / 每周窗口
//   SMOKE_CASE=error    node test/client-smoke.mjs   # StepFun 接口报错（应显示错误态，不崩）
const CASE = process.env.SMOKE_CASE || 'ok';
const routes = {
  '/api/deepseek/balance': { ok: true, balance: 2.77, currency: 'CNY', estTokens: 25366300, pricePerMillion: 0.1092, pricePeriod: 'peak', model: 'deepseek-v4.1-flash', fetchedAt: Date.now() },
  '/api/commandcode-goat/balance': { ok: true, fetchedAt: Date.now(), fiveHour: { percent: 10, resetsAt: Date.now() + 3600000 }, weekly: { percent: 20, resetsAt: Date.now() + 86400000 }, monthly: { present: true, remaining: 12.5 } },
  '/api/opencode-go/balance': { ok: true, fetchedAt: Date.now(), rolling: { status: 'ok', percent: 6, resetsAt: '2026-09-14T13:08:46.329Z' }, weekly: { status: 'ok', percent: 2, resetsAt: '2026-09-21T00:00:00.329Z' }, monthly: { status: 'ok', percent: 1, resetsAt: '2026-10-14T08:02:19.329Z' }, source: 'DSH 凭据 OPENCODE_GO_API_KEY' },
  '/api/hypercharm/balance': { ok: true, balance: 247, unit: 'hc', priceUsd: null, fetchedAt: Date.now() },
  '/api/stepfun/balance': {
    ok: true, balance: 13.77, cashBalance: 0, voucherBalance: 13.77, accountType: 'prepaid', currency: 'CNY', fetchedAt: Date.now(),
    // Step Plan 订阅额度（控制台 GetStepPlanStatus + QueryStepPlanRateLimit 归一化后的形状）
    plan: {
      ok: true, source: 'STEPFUN_CONSOLE_COOKIE', family: 2, kind: 'credit', name: 'Flash Plus',
      // host 侧已把控制台的 epoch 秒归一成毫秒（见 lib/index.js sfEpochMs）
      status: 1, planType: 2, activatedAt: Date.now() - 86400 * 3 * 1000, expiredAt: Date.now() + 86400 * 27 * 1000, autoRenew: true,
      credit: {
        leftRate: 0.99994034, resetTime: Date.now() + 86400 * 10 * 1000, topupLeftRate: 0,
        // type 1 = SUBSCRIPTION（月池），type 2 = TOPUP（加油包）—— 与官方枚举一致
        buckets: [
          { type: 1, total: 1600000000, residual: 1599904510, expireAt: Date.now() + 86400 * 10 * 1000 },
          { type: 2, total: 400000000, residual: 900000000, expireAt: Date.now() + 86400 * 20 * 1000 },
        ],
      },
      window: { fiveHourLeftRate: null, fiveHourResetTime: null, weeklyLeftRate: null, weeklyResetTime: null },
      fetchedAt: Date.now(),
    },
  },
};
// StepFun 降级/错误载荷（同一套渲染路径，只换数据源）
// degraded：有按量账户余额但没有控制台令牌 → plan=null + planError（订阅额度显示 --，不臆造数字）
if (CASE === 'degraded') routes['/api/stepfun/balance'] = { ok: true, balance: 5, accountType: 'postpaid', currency: 'CNY', fetchedAt: Date.now(), plan: null, planError: '未配置 STEPFUN_CONSOLE_COOKIE / STEPFUN_CONSOLE_TOKEN（阶跃控制台登录凭据）' };
// legacy：旧套餐（CODING family=1）→ 走 5 小时 / 每周窗口
if (CASE === 'legacy') routes['/api/stepfun/balance'] = {
  ok: true, balance: 13.77, cashBalance: 0, voucherBalance: 13.77, accountType: 'prepaid', currency: 'CNY', fetchedAt: Date.now(),
  plan: {
    ok: true, family: 1, kind: 'window', name: 'Flash (旧套餐)', status: 3, activatedAt: null, expiredAt: null, autoRenew: false,
    credit: { leftRate: null, resetTime: null, topupLeftRate: null, buckets: [] },
    window: { fiveHourLeftRate: 0.8, fiveHourResetTime: Date.now() + 3600 * 1000, weeklyLeftRate: 0.5, weeklyResetTime: Date.now() + 86400 * 1000 },
    fetchedAt: Date.now(),
  },
};
if (CASE === 'error') routes['/api/stepfun/balance'] = { ok: false, error: '余额接口 HTTP 401: unauthorized' };
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
await new Promise((r) => setTimeout(r, 400)); // 等四个接口的异步 setState

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

let failed = 0;
const ok = (cond, msg) => { if (!cond) failed++; console.log((cond ? 'PASS ' : 'FAIL ') + msg); };

const tabBtns = find(tree, (n) => n.type === 'button' && n.props.className && String(n.props.className).includes('opencg-tab'));
ok(tabBtns.map((b) => collectText(b).join('')).join('/') === 'DeepSeek/GOAT/OpenCode/Hyper/StepFun', '五个标签按钮顺序：' + tabBtns.map((b) => collectText(b).join('')).join(' / '));
ok(find(tree, (n) => String((n.props || {}).className || '') === 'opencg-tabs five').length === 1, '标签条使用 .opencg-tabs.five 五标签布局');
ok(tabBtns.every((b) => b.props.title), '每个标签都有 title 悬浮说明（短标签不丢全名）');

const ocBtn = tabBtns.find((b) => collectText(b).join('') === 'OpenCode');
ok(!!ocBtn, '存在 OpenCode 标签按钮');
if (ocBtn) {
  ocBtn.props.onClick();
  const txt = collectText(tree).join(' | ');
  ok(txt.includes('滚动') && txt.includes('每周') && txt.includes('每月'), 'OC 面板三窗口行（滚动/每周/每月）');
  ok(txt.includes('94%') && txt.includes('98%') && txt.includes('99%'), '剩余 %（100-已用）：94% / 98% / 99%');
  ok(txt.includes('已用 6%') && txt.includes('已用 2%') && txt.includes('已用 1%'), '已用 % 文案');
  ok(txt.includes('额度刷新'), '额度刷新倒计时行');
  const active = find(tree, (n) => String((n.props || {}).className || '').includes('opencg-tab active'));
  ok(collectText(active[0] || []).join('') === 'OpenCode', 'OpenCode 为激活标签');
  const root = find(tree, (n) => String((n.props || {}).className || '').startsWith('opencg'))[0];
  ok(String(root.props.title).startsWith('OpenCode Go 额度'), '面板 tip：' + root.props.title);
}

// ---- 阶跃星辰 StepFun 标签页 ----
const sfBtn = tabBtns.find((b) => collectText(b).join('') === 'StepFun');
ok(!!sfBtn, '存在 StepFun 标签按钮');
if (sfBtn) {
  sfBtn.props.onClick();
  const txt = collectText(tree).join(' | ');
  const root = find(tree, (n) => String((n.props || {}).className || '').startsWith('opencg'))[0];
  const active = find(tree, (n) => String((n.props || {}).className || '').includes('opencg-tab active'));
  ok(collectText(active[0] || []).join('') === 'StepFun', 'StepFun 为激活标签（case=' + CASE + '）');
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
// ---- 五个标签逐个点开：每页都要有本页关键行（防止改标签条时压坏既有面板）----
const EXPECT = {
  DeepSeek: ['余额', '¥2.77', '预计剩余', 'tok', '模型', 'deepseek-v4.1-flash'],
  GOAT: ['5小时', '每周', '月度余额', '$12.50', '额度刷新'],
  OpenCode: ['滚动', '每周', '每月', '额度刷新'],
  Hyper: ['余额', '247', 'hc', '约合', '积分刷新'],
  StepFun: CASE === 'error' ? ['订阅额度', '按量余额', '获取失败']
    : (CASE === 'degraded' ? ['订阅额度', '按量余额', '¥5.00']
      : (CASE === 'legacy' ? ['5小时额度', '每周额度', '按量余额', '¥13.77'] : ['订阅额度', '月池余额', '月池重置', '加油包', '按量余额', '¥13.77'])),
};
for (const [label, needles] of Object.entries(EXPECT)) {
  const btn = tabBtns.find((b) => collectText(b).join('') === label);
  btn.props.onClick();
  const txt = collectText(tree).join(' | ');
  const miss = needles.filter((n) => !txt.includes(n));
  ok(miss.length === 0, label + ' 面板关键行齐全' + (miss.length ? '（缺：' + miss.join(', ') + '）' : ''));
  const act = find(tree, (n) => String((n.props || {}).className || '').includes('opencg-tab active'));
  ok(collectText(act[0] || []).join('') === label, label + ' 点击后成为激活标签');
}

// ---- 操控增强：迷你胶囊 / 键盘 / 主题色 / 刷新反馈 ----
{
  const findRoot = () => find(tree, (n) => String((n.props || {}).className || '').startsWith('opencg '))[0];
  const root0 = findRoot();
  ok(typeof root0.props.onKeyDown === 'function', '根节点挂键盘处理（←→/R/C/Esc）');
  ok(root0.props.tabIndex === 0, '根节点可聚焦（tabIndex=0）');
  ok(root0.props.style && root0.props.style['--opencg-accent'], '服务商主题色 CSS 变量已下发');
  ok(find(tree, (n) => String((n.props || {}).className || '') === 'opencg-accent').length === 1, '标题栏下有主题色细线');
  const refreshBtn = find(tree, (n) => String((n.props || {}).className || '').includes('opencg-refresh'))[0];
  ok(!!refreshBtn && String(refreshBtn.props.title || '').includes('R'), '刷新按钮标题提示 R 快捷键');
  const actTab = find(tree, (n) => String((n.props || {}).className || '').includes('opencg-tab active'))[0];
  ok(!!(actTab.props.style && String(actTab.props.style.background || '').startsWith('#')), '激活标签带服务商主题色背景');
  const collapseBtn = find(tree, (n) => String((n.props || {}).className || '') === 'opencg-collapse')[0];
  ok(!!collapseBtn, '标题栏有「−」收起按钮');
  collapseBtn.props.onClick({ stopPropagation: () => {} });
  ok(String(findRoot().props.className).includes('collapsed'), '点「−」后进入收起态');
  const pillEl = find(tree, (n) => String((n.props || {}).className || '') === 'opencg-pill')[0];
  const pillTxt = pillEl ? collectText(pillEl).join('') : '';
  ok(!!pillEl && pillTxt.includes('StepFun') && pillTxt.length > 'StepFun'.length, '收起态胶囊=标签名+关键数值：' + pillTxt);
  const expandBtn = find(tree, (n) => String((n.props || {}).className || '') === 'opencg-pill-btn')[0];
  ok(!!expandBtn, '收起态有展开按钮');
  expandBtn.props.onClick({ stopPropagation: () => {} });
  ok(!String(findRoot().props.className).includes('collapsed'), '点展开后回到完整面板');
  findRoot().props.onKeyDown({ key: 'ArrowRight', preventDefault: () => {} });
  const act2 = collectText(find(tree, (n) => String((n.props || {}).className || '').includes('opencg-tab active'))[0] || []).join('');
  ok(act2 === 'DeepSeek', '→ 键从 StepFun 环绕切到 DeepSeek（实为 ' + act2 + '）');
  findRoot().props.onKeyDown({ key: 'ArrowLeft', preventDefault: () => {} });
  const act3 = collectText(find(tree, (n) => String((n.props || {}).className || '').includes('opencg-tab active'))[0] || []).join('');
  ok(act3 === 'StepFun', '← 键切回 StepFun（实为 ' + act3 + '）');
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
