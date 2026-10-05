// custom-tab-ui.mjs — 自定义/内置标签页的 client 侧端到端测试
//   设计约定（本测试同时在守这条约定）：
//     · 悬浮面板 = 只负责显示与切换，**不放任何增删控件**
//     · 设置页「余额悬浮窗 · 标签页管理」= 新增 / 隐藏 / 删除 / 停用 的唯一入口
//     · 内置页「永久删除」要两击确认；且**不允许删到一个都不剩**
//
//   ⚠️ 这份测试**不依赖本机 lib/client.js 里还剩几个内置页**：本插件的「永久删除」功能
//   就是用来裁掉内置页的，若测试写死「六个内置页」，任何裁过页的机器上都会红。
//   所以这里先拷一份母本，并**补齐被裁掉的内置页定义**，得到一份稳定的「6 内置页」基线。
//
//   每个场景都用 `import(<母本>?case=N)` 取一份**全新的模块实例**：
//   client.js 的模块级状态（hiddenIds / customTabs / 禁用集）是闭包私有的，若所有场景共用
//   一份实例，前面场景写下的 localStorage 与内存状态会互相污染，断言就不可信。
//   （同理，hook 状态按渲染函数隔离 —— overlay 与 settings 是两个独立组件。）
//
// 用法：node test/custom-tab-ui.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NOW = Date.now();

// 用真实 host 的 sanitizeCustomTab 造「host 会下发的形状」，而不是手搓近似对象：
// 手搓容易漏字段（url / balance.path），测试就会与线上行为脱节。
const { sanitizeCustomTab } = await import('../lib/index.js');
const hostTab = (raw) => sanitizeCustomTab({
  auth: { kind: 'bearer', value: 'sk-x' },
  balance: { path: 'balance', label: '余额', unit: 'USD', decimals: 2, format: 'number' },
  windows: [],
  ...raw,
});

// ── 可控的假 host：内存里维护自定义页表，并记录所有写请求 ──
function makeHost(initialTabs, opts = {}) {
  const state = { tabs: initialTabs.map((t) => ({ ...t })) };
  const posts = [];
  const ok = (body, status = 200) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  const basic = {
    '/api/deepseek/balance': () => ok({ ok: true, balance: 1, currency: 'CNY', estTokens: 1, fetchedAt: NOW }),
    '/api/commandcode-goat/balance': () => ok({ ok: true, fetchedAt: NOW }),
    '/api/opencode-go/balance': () => ok({ ok: true, fetchedAt: NOW }),
    '/api/hypercharm/balance': () => ok({ ok: true, balance: 1, fetchedAt: NOW }),
    '/api/stepfun/balance': () => ok({ ok: true, balance: 1, fetchedAt: NOW }),
    '/api/bailian/plan': () => ok({ ok: true, fetchedAt: NOW }),
    '/api/deepseek/usage': () => ok({ ok: true, totalTokens: 1, totalCost: 1, fetchedAt: NOW }),
  };
  const fetchImpl = async (url, init) => {
    const u = String(url);
    if (u.indexOf('/api/monitor/custom-balance') === 0) {
      const m = /id=([^&]+)/.exec(u);
      const t = state.tabs.find((x) => x.id === decodeURIComponent((m && m[1]) || ''));
      if (!t) return ok({ ok: false, error: '找不到自定义标签页' }, 404);
      return ok({
        ok: true, custom: true, fetchedAt: NOW,
        balance: t.__balance === undefined ? 7.5 : t.__balance,
        decimals: 2, unit: t.__unit || 'USD', balanceFormat: 'number', balanceLabel: '余额',
        windows: t.__windows || [{ label: '月度', usedPercent: 30, usedIsRemaining: false, resetsAt: NOW + 86400000 }],
        source: '自填 key（host 代理）',
      });
    }
    if (u.indexOf('/api/monitor/tabs') === 0) {
      // 真实情况：host 半没更新时这个路径根本没注册，DSH 的兜底路由回的是 HTML/纯文本，
      // 不是 JSON —— 这正是要覆盖的「非 JSON 响应」分支。
      if (opts.noHostHalf) return { ok: false, status: 404, json: async () => { throw new SyntaxError('Unexpected token <'); }, text: async () => '<!doctype html><h1>404</h1>' };
      const method = (init && init.method) || 'GET';
      if (method === 'GET') return ok({ ok: true, tabs: state.tabs, file: 'X:/fake-config.json' });
      const body = JSON.parse((init && init.body) || '{}');
      body.path = '/api/monitor/tabs';
      posts.push(body);
      if (body.action === 'add') { state.tabs.push({ ...body.tab, custom: true }); return ok({ ok: true, tab: { id: body.id } }); }
      if (body.action === 'delete') { state.tabs = state.tabs.filter((t) => t.id !== body.id); return ok({ ok: true, removed: 1 }); }
      if (body.action === 'toggle') { const t = state.tabs.find((x) => x.id === body.id); if (t) t.disabled = !!body.disabled; return ok({ ok: true }); }
      return ok({ ok: false, error: '未知 action' }, 400);
    }
    // 永久删除内置页（host 会改写源码）
    if (u.indexOf('/api/monitor/builtin-tabs/delete') === 0) {
      const body = JSON.parse((init && init.body) || '{}');
      body.path = '/api/monitor/builtin-tabs/delete';
      posts.push(body);
      return ok({ ok: true, id: body.id, file: 'X:/lib/client.js', backup: 'X:/backups/client.before.js', hint: '已从源码删除该标签页', removed: { def: '{ id: \'' + body.id + '\' }', source: 'x: { }' } });
    }
    // 懒人化：贴链接自动识别
    if (u.indexOf('/api/monitor/discover') === 0) {
      const body = JSON.parse((init && init.body) || '{}');
      body.path = '/api/monitor/discover';
      posts.push(body);
      return ok({
        ok: true, confidence: 'high', host: 'openrouter.ai', mode: 'both',
        notes: ['域名 openrouter.ai 命中已知服务商「OpenRouter」', '该服务商同时提供余额与套餐窗口 → 两者都显示'],
        credential: 'OPENROUTER_API_KEY',
        draft: {
          id: 'c_openrouter_x', name: 'OpenRouter', short: 'OpenRouter', theme: '#8b5cf6',
          url: 'https://openrouter.ai/api/v1/credits',
          auth: { kind: 'bearer' },
          balance: { path: 'data.total_credits', label: '额度', unit: 'USD', decimals: 2, format: 'number' },
          windows: [{ label: '额度', path: 'data.limit_remaining', resetPath: '', mode: 'remaining' }],
        },
      });
    }
    const r = basic[u];
    return r ? r() : ok({ ok: false, error: 'no route ' + u });
  };
  return { fetchImpl, posts, state };
}

let failed = 0;
const ok = (cond, msg) => { if (!cond) failed++; console.log((cond ? 'PASS ' : 'FAIL ') + msg); };
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

// ── 最小 React/DOM shim ──
// hook 状态按**渲染函数**隔离：overlay 与 settings 是两个独立组件，各有自己的 hook 列表；
// 若共用一套数组，两边相同下标的 state 会互相污染，测试就会得出假结论。
const hookStore = new WeakMap();
let hookIndex = 0, currentHooks = null, rerender = null, renders = 0;

/**
 * 起一个干净的场景：全新的 localStorage + 全新的 client.js 模块实例。
 * 返回该场景自己的渲染器与查询工具。
 */
async function bootScene(clientFile, tag) {
  const store = {};
  globalThis.window = {
    innerWidth: 1280, innerHeight: 800, addEventListener: () => {}, removeEventListener: () => {},
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    __ModuleLoader__: { load(cfg) { globalThis.__CFG = cfg; } },
  };
  globalThis.document = { querySelector: () => null, createElement: () => ({ setAttribute() {}, style: {}, appendChild() {} }), head: { appendChild() {} } };
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };

  let latest = null;
  const React = {
    useState: (v) => { const i = hookIndex++; if (!(i in currentHooks.st)) currentHooks.st[i] = typeof v === 'function' ? v() : v;
      return [currentHooks.st[i], (nv) => { currentHooks.st[i] = typeof nv === 'function' ? nv(currentHooks.st[i]) : nv; if (rerender) rerender(); }]; },
    useEffect: (f) => { const i = hookIndex++; if (currentHooks.ran.has(i)) return; currentHooks.ran.add(i); const c = f(); if (typeof c === 'function') currentHooks.ran.add('cleanup' + i); },
    useCallback: (f) => { hookIndex++; return f; },
    useRef: (v) => { const i = hookIndex++; if (!(i in currentHooks.refs)) currentHooks.refs[i] = { current: v }; return currentHooks.refs[i]; },
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  };
  const requireShim = (m) => { if (m === 'react') return React; throw new Error('unexpected require: ' + m) };

  await import(clientFile + '?' + tag);   // 『?tag』= 拿一份全新的模块实例（全新闭包状态）
  const mod = globalThis.__CFG.factory(requireShim);

  const mkRenderer = (fn) => (props) => {
    let bucket = hookStore.get(fn);
    if (!bucket) { bucket = { st: [], refs: [], ran: new Set() }; hookStore.set(fn, bucket); }
    hookIndex = 0; currentHooks = bucket; renders++;
    latest = fn(props || {});
    return latest;
  };

  return {
    mod, store, mkRenderer,
    get latest() { return latest; },
    setLatest(v) { latest = v; },
    get renders() { return renders; },
    setRerender(fn) { rerender = fn; },
    railBtns: () => find(latest, (n) => n.type === 'button' && String((n.props || {}).className || '').includes('ocg-rail-btn')),
    railLabels() { return this.railBtns().map((b) => collectText(b).join('')); },
    buttons: () => find(latest, (n) => n.type === 'button'),
    btnByText(t) { return find(latest, (n) => n.type === 'button' && collectText(n).join('') === t); },
    click(t, which = 0) { const b = this.btnByText(t)[which]; if (!b) throw new Error('找不到按钮: ' + t); b.props.onClick({ stopPropagation() {} }); return b; },
    // 内置页与自定义页都有同名动作（如「删除」），必须按行定位
    rowOf(name) { return find(latest, (n) => String((n.props || {}).className || '') === 'ocg-tabrow').find((r) => collectText(r).join(' ').indexOf(name) >= 0); },
    clickInRow(name, btnText) {
      const row = this.rowOf(name);
      if (!row) throw new Error('找不到标签页行: ' + name);
      const btn = find(row, (n) => n.type === 'button' && collectText(n).join('') === btnText)[0];
      if (!btn) throw new Error('行 ' + name + ' 里找不到按钮: ' + btnText);
      btn.props.onClick({ stopPropagation() {} });
      return btn;
    },
    text() { return collectText(latest).join(' | '); },
  };
}

/**
 * 造一份「稳妥基线」的 client.js 母本：把被永久删掉的内置页定义补回去。
 * 目的只有一个 —— 让这份测试的结果与「本机裁过哪些内置页」无关。
 * （母本是从 test/ 上一级拿的 lib/client.js，只做**插入**，不倒退回旧版本。）
 */
function makeBaselineClient() {
  const srcPath = fileURLToPath(new URL('../lib/client.js', import.meta.url));
  let code = readFileSync(srcPath, 'utf8');
  const has = (line) => code.includes(line.trim());
  /** 在某个「块」的闭合括号之前插入几行（块的起点用 anchor 定位）。
   *  插入时保证**前一个元素有行尾逗号**：被永久删除过的数组/对象，最后一个元素后面是没有逗号的。 */
  const insertBeforeClose = (anchor, open, close, lines) => {
    const from = code.indexOf(anchor);
    const openAt = code.indexOf(open, from);
    if (openAt < 0) return;
    const closeAt = code.indexOf(close, openAt);
    if (closeAt < 0) return;
    const lineStart = code.lastIndexOf('\n', closeAt) + 1;
    // 找闭合括号之前最后一个非空行的缩进，用它来对齐插入行
    const prevLines = code.slice(0, lineStart).split('\n');
    let lastIdx = prevLines.length - 2;
    while (lastIdx >= 0 && prevLines[lastIdx].trim() === '') lastIdx--;
    const prevLine = prevLines[lastIdx] || '';
    const indent = (/^[ \t]*/.exec(prevLine) || [''])[0];
    // 前一个元素若没有行尾逗号，补一个（否则插入的第一行会紧跟其后，语法就坏了）
    if (prevLine.trim() && !/,[ \t]*$/.test(prevLine) && !/[{\[]$/.test(prevLine.trim())) {
      prevLines[lastIdx] = prevLine + ',';
      code = prevLines.join('\n') + code.slice(lineStart);
    }
    code = code.slice(0, lineStart) + lines.map((l) => indent + l).join('\n') + '\n' + code.slice(lineStart);
  };
  // ① 补齐 TAB_DEFS
  const defs = [
    "{ id: 'hc', short: 'Hyper', full: 'Charm Hyper', theme: '#ec4899', tip: 'Charm Hyper 余额（hypercredits）' },",
    "{ id: 'bl', short: '百炼', full: '阿里云百炼 Token Plan', theme: '#ff6a00', tip: '阿里云百炼 Token Plan：5 小时 / 每周窗口额度 + 月度 Credits' },",
  ].filter((d) => !has(d));
  if (defs.length) insertBeforeClose('const TAB_DEFS', '[', ']', defs);
  // ② 补齐 DATA_SOURCES
  const sources = [
    "hc: { path: '/api/hypercharm/balance', every: 30000 },",
    "bl: { path: '/api/bailian/plan', every: 60000 },",
  ].filter((s) => !has(s));
  if (sources.length) insertBeforeClose('const DATA_SOURCES', '{', '}', sources);
  const dir = join(tmpdir(), 'ogm-ui-test');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'client-baseline.js');
  writeFileSync(file, code, 'utf8');
  return new URL('file:///' + file.replace(/\\/g, '/')).href;
}
const CLIENT = makeBaselineClient();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ══════════════════════════════════════════════════════════════════════════════
// 场景 1：host 已有一个自定义页 → 面板只读、设置页是唯一增删入口
// ══════════════════════════════════════════════════════════════════════════════
{
  const host = makeHost([
    { ...hostTab({ id: 'c_a', name: 'OpenRouter', short: 'OR', theme: '#8b5cf6', intervalMs: 60000, url: 'https://api.demo.example/credits' }), __balance: 7.5, __unit: 'USD' },
  ]);
  globalThis.fetch = host.fetchImpl;
  const S = await bootScene(CLIENT, 's1');
  let overlayFn = null, settingsFn = null;
  S.mod.apply({
    effect: (f) => f(),
    interval: () => () => {},
    slots: { inject: (n, cb) => cb(), register: (meta, render) => {
      if (meta.name === 'shell.overlay') overlayFn = render;
      if (meta.name === 'settings.general.item' && meta.id === 'balance-window-tabs') settingsFn = render;
      return () => {};
    } },
    get: () => undefined,
  });
  const showPanel = S.mkRenderer(overlayFn);
  const showSettings = S.mkRenderer(settingsFn);
  S.setRerender(showPanel);
  showPanel();
  await sleep(80);

  // ① 自定义页出现在 rail 且面板渲染正确
  // 基线母本 = 本机保留的内置页 + 测试补回的被删页（补回的按插入顺序排在末尾），故这里只断言
  // 「六个内置页都在」且自定义页排在末尾，不写死内置页的先后（那是母本生成细节）。
  ok(S.railLabels().length === 7 && S.railLabels()[6] === 'OR', '自定义页排在品牌轨末尾（' + S.railLabels().join('/') + '）');
  for (const need of ['DeepSeek', 'GOAT', 'OpenCode', 'StepFun', 'Hyper', '百炼']) {
    ok(S.railLabels().includes(need), '基线里有内置页 ' + need);
  }
  const orBtn = S.railBtns().find((b) => collectText(b).join('') === 'OR');
  ok(!!orBtn && !!orBtn.props.title, '① 自定义页按钮可按短名找到，且有 title 悬浮说明');
  orBtn.props.onClick();
  const txt = S.text();
  ok(txt.includes('$7.50'), '① 自定义页面板显示余额（$7.50）');
  ok(txt.includes('月度') && txt.includes('70%'), '① 自定义页面板显示窗口剩余 70%');
  ok(txt.includes('已用 30%'), '① 自定义页面板显示已用 30%');
  ok(txt.includes('每 60s 刷新'), '① 自定义页面板按自己的间隔标注刷新频率');

  // ② 面板里没有任何增删控件（这正是「面板太挤」要修掉的）
  ok(S.railBtns().length === S.railLabels().length, '② rail 里的按钮全都是标签按钮（没有混进 + / ×）');
  ok(find(S.latest, (n) => String((n.props || {}).className || '').indexOf('ocg-rail-add') === 0).length === 0, '② 面板里没有「+ 新增」按钮');
  ok(find(S.latest, (n) => String((n.props || {}).className || '').indexOf('ocg-rail-del') === 0).length === 0, '② 面板里没有「×」删除键');
  ok(find(S.latest, (n) => String((n.props || {}).className || '').indexOf('ocg-addform') === 0).length === 0, '② 面板里没有新增表单');
  ok(find(S.latest, (n) => n.type === 'input').length === 0, '② 面板里一个输入框都没有');
  ok(find(S.latest, (n) => /设置|标签页管理/.test(collectText(n).join('')) && n.type === 'button').length === 0, '② 面板里也不塞「去设置」按钮（保持干净）');

  // ③ 设置页列出全部页 + 动作齐备
  rerender = showSettings;
  showSettings();
  await sleep(40);
  const sTxt = S.text();
  ok(sTxt.includes('标签页管理'), '③ 设置页有「标签页管理」标题');
  ok(sTxt.includes('共 7 个标签页') && sTxt.includes('当前显示 7 个'), '③ 显示总数与当前生效数');
  ok(sTxt.includes('显示中') && sTxt.includes('自定义') && sTxt.includes('内置'), '③ 每条都有状态与类别标记');
  ok(sTxt.includes('每 60s') && sTxt.includes('字段 balance') && sTxt.includes('https://api.demo.example/credits'), '③ 自定义页副行给出轮询间隔 / 取值字段 / 接口地址');
  ok(sTxt.includes('API key'), '③ 表单说明提到 API key 的去向');
  ok(S.btnByText('隐藏').length === 7, '③ 每页都有「隐藏」按钮（' + S.btnByText('隐藏').length + '）');
  ok(S.btnByText('停用').length === 1, '③ 只有自定义页有「停用」');
  ok(S.btnByText('永久删除').length === 6, '③ 六个内置页都有「永久删除」（' + S.btnByText('永久删除').length + '）');
  ok(S.btnByText('删除').length === 1, '③ 自定义页的「删除」只有 1 个（会连 key 一起清）');
  ok(S.btnByText('恢复').length === 0, '③ 还没隐藏任何页时没有「恢复」按钮');
  ok(S.btnByText('自动识别').length === 1, '③ 有懒人入口「自动识别」按钮');
  ok(!!S.btnByText('+ 新增标签页').length, '③ 设置页有「+ 新增标签页」按钮');

  // ③e 永久删除：两击确认，第二击才发请求（绝不误点毁源码）
  const beforePerm = host.posts.filter((p) => p.path === '/api/monitor/builtin-tabs/delete').length;
  S.clickInRow('Charm Hyper', '永久删除');
  await sleep(30);
  ok(host.posts.filter((p) => p.path === '/api/monitor/builtin-tabs/delete').length === beforePerm, '③e 第一次点「永久删除」不发请求（只进入确认态）');
  ok(S.btnByText('确认永久删除').length === 1, '③e 按钮变成「确认永久删除」');
  ok(S.text().includes('再点一次'), '③e 提示再点一次才会真的删');
  S.clickInRow('Charm Hyper', '确认永久删除');
  await sleep(40);
  const permPosts = host.posts.filter((p) => p.path === '/api/monitor/builtin-tabs/delete');
  ok(permPosts.length === beforePerm + 1, '③e 第二次点才发出永久删除请求');
  ok(permPosts[permPosts.length - 1].id === 'hc' && permPosts[permPosts.length - 1].confirm === true, '③e 请求带 id 与 confirm:true');

  // ③b 隐藏（可逆）一个内置页 —— 与「永久删除」区分：隐藏只是不显示
  S.clickInRow('Charm Hyper', '隐藏');
  await sleep(40);
  ok(S.text().includes('已删除') === false || S.btnByText('恢复').length === 1, '③b 隐藏后出现「恢复」按钮');
  ok(JSON.parse(S.store['dsh-opencode-go-monitor-hidden-tabs']).indexOf('hc') >= 0, '③b 隐藏状态记进 localStorage（' + S.store['dsh-opencode-go-monitor-hidden-tabs'] + '）');
  ok(S.btnByText('恢复').length === 1, '③b 被隐藏的页出现「恢复」按钮');
  rerender = showPanel;
  showPanel();
  ok(S.railLabels().indexOf('Hyper') < 0 && S.railLabels().length === 6, '③b 品牌轨不再有 Charm Hyper 且少一个（' + S.railLabels().join('/') + '）');
  rerender = showSettings;
  showSettings();
  S.clickInRow('Charm Hyper', '恢复');
  await sleep(40);
  rerender = showPanel;
  showPanel();
  ok(S.railLabels().indexOf('Hyper') >= 0, '③b 点「恢复」后回到品牌轨（' + S.railLabels().join('/') + '）');

  // ④b 懒人化：贴一个链接 → 自动识别 → 表单被填好
  rerender = showSettings;
  showSettings();
  await sleep(30);
  const allIn = () => find(S.latest, (n) => n.type === 'input' && String((n.props || {}).className || '').includes('ocg-in'));
  allIn()[0].props.onChange({ target: { value: 'https://openrouter.ai/keys' } });
  find(S.latest, (n) => n.type === 'button' && collectText(n).join('') === '自动识别')[0].props.onClick({ stopPropagation() {} });
  await sleep(60);
  const disc = host.posts.find((p) => p.path === '/api/monitor/discover');
  ok(!!disc, '④b 点「自动识别」→ POST /api/monitor/discover');
  ok(disc && disc.url === 'https://openrouter.ai/keys', '④b 把用户贴的链接发给 host');
  ok(S.text().includes('已实测通过'), '④b 显示识别置信度');
  ok(S.text().includes('余额 + 套餐额度都显示'), '④b 显示该按哪种口径呈现（两者）');
  ok(S.text().includes('OPENROUTER_API_KEY'), '④b 提示该配哪个凭据');
  ok(S.text().includes('命中已知服务商'), '④b 列出判断依据');
  ok(!!S.btnByText('保存').length, '④b 自动展开新增表单，直接可保存');
  const filled = allIn();
  ok(filled[1].props.value === 'OpenRouter', '④b 表单名称被自动填好（' + filled[1].props.value + '）');
  ok(filled[2].props.value === 'https://openrouter.ai/api/v1/credits', '④b 表单接口地址被自动填好（' + filled[2].props.value + '）');

  // ④ 设置页新增：填表 → POST action=add
  rerender = showSettings;
  // ④ 设置页新增：懒人识别已经把表单填好并展开，这里直接改字段后保存
  ok(!!S.btnByText('保存').length, '④ 懒人识别后表单已展开，可直接保存');
  const inputs = () => find(S.latest, (n) => n.type === 'input' && String((n.props || {}).className || '').includes('ocg-in')).filter((n, i) => i > 0);
  inputs()[0].props.onChange({ target: { value: 'MyAPI' } });
  inputs()[1].props.onChange({ target: { value: 'https://api.example.com/credits' } });
  inputs()[2].props.onChange({ target: { value: 'sk-secret-xyz' } });
  S.click('保存');
  await sleep(80);
  const addPost = host.posts.find((p) => p.action === 'add');
  ok(!!addPost, '④ 点了保存 → POST action=add');
  if (addPost) {
    ok(addPost.tab.url === 'https://api.example.com/credits', '④ 载荷带用户填的接口地址');
    ok(addPost.tab.auth && addPost.tab.auth.value === 'sk-secret-xyz', '④ 载荷带 API key（只发给 host，不下发浏览器）');
    ok(/^c_/.test(addPost.id), '④ 自动生成的 id 以 c_ 开头（' + addPost.id + '）');
  }
  ok(S.text().includes('已新增') && S.text().includes('X:/fake-config.json'), '④ 成功后给出回执，并显示配置文件路径');

  // ⑥ 自定义页停用 / 启用
  const beforeToggle = host.posts.filter((p) => p.action === 'toggle').length;
  S.clickInRow('OpenRouter', '停用');
  await sleep(60);
  const togglePost = host.posts.filter((p) => p.action === 'toggle');
  ok(togglePost.length === beforeToggle + 1 && togglePost[0].disabled === true, '⑥ 点「停用」→ POST action=toggle（disabled=true）');
  ok(S.text().includes('已停用'), '⑥ 列表里该页状态变成「已停用」');

  // ⑦ 删除自定义页：与内置页不同，会连它保存的 API key 一起从磁盘删掉
  const beforeDel = host.posts.filter((p) => p.action === 'delete').length;
  S.clickInRow('OpenRouter', '删除');
  await sleep(60);
  const delPosts = host.posts.filter((p) => p.action === 'delete');
  ok(delPosts.length === beforeDel + 1 && delPosts[delPosts.length - 1].id === 'c_a', '⑦ 自定义页「删除」→ POST action=delete（带 id）');
  ok(S.text().includes('已删除'), '⑦ 给出删除回执');
}

// ══════════════════════════════════════════════════════════════════════════════
// 场景 2：防呆 —— 不允许删到一个都不剩（干净实例，便于精确断言）
// ══════════════════════════════════════════════════════════════════════════════
{
  const host = makeHost([]);
  globalThis.fetch = host.fetchImpl;
  const S = await bootScene(CLIENT, 's2');
  let overlayFn = null, settingsFn = null;
  S.mod.apply({
    effect: (f) => f(),
    interval: () => () => {},
    slots: { inject: (n, cb) => cb(), register: (meta, render) => {
      if (meta.name === 'shell.overlay') overlayFn = render;
      if (meta.name === 'settings.general.item' && meta.id === 'balance-window-tabs') settingsFn = render;
      return () => {};
    } },
    get: () => undefined,
  });
  const showPanel = S.mkRenderer(overlayFn);
  const showSettings = S.mkRenderer(settingsFn);
  S.setRerender(showSettings);
  showSettings();
  await sleep(60);
  // 注意：量 rail 要渲染面板，量行/按钮要渲染设置页——两者都会改 S.latest，
  // 所以每次「先量 rail、再找行」之后必须重新渲染设置页。
  const railCount = () => { const prev = rerender; rerender = showPanel; showPanel(); const n = S.railLabels().length; rerender = prev; return n; };
  ok(railCount() === 6, '⑧ 起初是内置六页（' + railCount() + '）');

  // 逐个隐藏内置页，只剩一个（防呆与「永久删除」无关：它保护的是"品牌轨一个都不剩"）
  const builtins = ['DeepSeek', 'Command Code GOAT', 'OpenCode Go', 'Charm Hyper', 'StepFun'];
  for (const nm of builtins) {
    rerender = showSettings;
    showSettings();
    await sleep(20);
    if (S.rowOf(nm)) S.clickInRow(nm, '隐藏');
    await sleep(20);
  }
  const afterDeletes = railCount();
  rerender = showSettings;
  showSettings();
  await sleep(30);
  ok(afterDeletes === 1, '⑧ 隐藏 5 个后品牌轨只剩 1 个（' + afterDeletes + '）');
  ok(!!S.rowOf('阿里云百炼 Token Plan'), '⑧ 最后一个内置页仍在列表里（可见以便恢复）');

  // 隐藏最后一个 → 必须被拦下
  S.clickInRow('阿里云百炼 Token Plan', '隐藏');
  await sleep(40);
  ok(S.text().includes('至少要保留一个标签页'), '⑧ 隐藏最后一个时被拦下并说明原因（' + (/至少要保留[^，）。]*/.exec(S.text()) || ['未命中'])[0] + '）');
  ok(JSON.parse(S.store['dsh-opencode-go-monitor-hidden-tabs'] || '[]').indexOf('bl') < 0, '⑧ 被拦下后该页没有被真的隐藏');
  ok(railCount() === 1, '⑧ 品牌轨仍有最后那个页（' + railCount() + '）');

  // 恢复能力：删掉的 5 个都能找回来
  for (const nm of builtins) {
    rerender = showSettings;
    showSettings();
    await sleep(20);
    if (S.rowOf(nm) && S.btnByText('恢复').length) {
      const btn = find(S.rowOf(nm), (n) => n.type === 'button' && collectText(n).join('') === '恢复')[0];
      if (btn) btn.props.onClick({ stopPropagation() {} });
    }
    await sleep(20);
  }
  rerender = showSettings;
  showSettings();
  await sleep(30);
  ok(railCount() === 6, '⑧ 全部恢复后回到六页（' + railCount() + '）');
}

// ══════════════════════════════════════════════════════════════════════════════
// 场景 3：host 半未更新（非 JSON 的 404）→ 面板照常、设置页给出可操作原因
// ══════════════════════════════════════════════════════════════════════════════
{
  const host = makeHost([], { noHostHalf: true });
  globalThis.fetch = host.fetchImpl;
  const S = await bootScene(CLIENT, 's3');
  let overlayFn = null, settingsFn = null;
  S.mod.apply({
    effect: (f) => f(),
    interval: () => () => {},
    slots: { inject: (n, cb) => cb(), register: (meta, render) => {
      if (meta.name === 'shell.overlay') overlayFn = render;
      if (meta.name === 'settings.general.item' && meta.id === 'balance-window-tabs') settingsFn = render;
      return () => {};
    } },
    get: () => undefined,
  });
  const showPanel = S.mkRenderer(overlayFn);
  const showSettings = S.mkRenderer(settingsFn);
  S.setRerender(showPanel);
  showPanel();
  await sleep(80);
  const labels9 = S.railLabels();
  ok(labels9.length === 6, '⑨ host 不可达时六个内置页照常（' + labels9.join('/') + '）');
  for (const need of ['DeepSeek', 'GOAT', 'OpenCode', 'StepFun', 'Hyper', '百炼']) {
    ok(labels9.includes(need), '⑨ 内置页 ' + need + ' 仍在');
  }
  rerender = showSettings;
  showSettings();
  await sleep(40);
  ok(S.btnByText('永久删除').length === 6, '⑨ 内置页的「永久删除」键照样显示（点了才需要 host）');  S.click('+ 新增标签页');
  // 第 0 个是顶部懒人入口的输入框，新增表单从第 1 个开始（名称 / 地址 / key / …）
  const inputs = find(S.latest, (n) => n.type === 'input' && String((n.props || {}).className || '').includes('ocg-in'));
  inputs[1].props.onChange({ target: { value: 'X' } });
  inputs[2].props.onChange({ target: { value: 'https://x.example/bal' } });
  S.click('保存');
  await sleep(60);
  const errText = find(S.latest, (n) => String((n.props || {}).className || '').indexOf('ocg-set-msg') === 0).map((n) => collectText(n).join('')).join('');
  ok(errText.includes('HTTP 404') && errText.includes('重启'), '⑨ 新增失败时给出可操作原因，而不是 json 解析异常原文（实际：' + JSON.stringify(errText) + '）');
}

console.log(failed === 0 ? 'CUSTOM_TAB_UI_OK (' + renders + ' renders)' : 'CUSTOM_TAB_UI_FAILED: ' + failed);
process.exit(failed === 0 ? 0 : 1);
