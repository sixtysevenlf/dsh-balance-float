/**
 * 余额悬浮窗 —— client 半
 * v3 重新设计 —— Side Rail Instrument：左侧纵向品牌侧栏（状态点 + 五服务商全名按钮 +
 * 主题色指示条 + 底部收起键）；主区 = 大写厂牌名 + Hero 主指标大读数 + 明细行。
 * 标签切换保留方向滑动 + 淡入动画；主题色贯穿指示条 / 厂牌名 / 胶囊名。
 * 操控：点空白刷新 · 拖动移动（贴边吸附）· 右下角缩放（双击复位）· Ctrl/⌘+滚轮等比缩放 · 收起为迷你胶囊；
 * 键盘 ←→ 切标签 / R 刷新 / C 收起展开 / Esc 展开 / + − 缩放 / 0 复位；内容字号随窗口尺寸流式缩放（cqw）。
 * 毛玻璃外观跟随 DSH 深色主题。
 * 同源接口：
 *   /api/deepseek/balance          — DeepSeek 余额（30s 轮询）
 *   /api/commandcode-goat/balance  — Command Code GOAT 额度（60s 轮询）
 *   /api/opencode-go/balance       — OpenCode Go 额度（60s 轮询，滚动/每周/每月三窗口）
 *   /api/hypercharm/balance        — Charm Hyper 余额（30s 轮询，单位 hypercredits）
 *   /api/stepfun/balance           — 阶跃星辰 StepFun：Step Plan 订阅额度（Credit 月池）+ 按量账户余额（60s 轮询）
 */
window.__ModuleLoader__.load({
  id: 'dsh-opencode-go-monitor',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    let React = require('react');

    //#region styles
    const CSS = `/* ════════════════════════════════════════
   v3.0 — Side Rail Instrument · 纵向品牌轨 · Hero 主指标 · 流式缩放(cqw) · 深色主题
   ════════════════════════════════════════ */

/* --- 容器：左右结构（品牌轨 | 主区） --- */
.opencg {
  position: fixed;
  pointer-events: auto;
  z-index: 40;
  display: flex;
  flex-direction: row;
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,.16);
  font: inherit;
  color: var(--dsw-alias-label-primary, #222);
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  -webkit-touch-callout: none;
  cursor: default;
  min-width: 240px;
  overflow: hidden;
  opacity: .92;
  container-type: size;
  /* 位置/尺寸动画独立成组：松手贴边、滚轮缩放、收起展开都有平滑补间 */
  transition:
    left .3s cubic-bezier(.22,.61,.36,1),
    bottom .3s cubic-bezier(.22,.61,.36,1),
    width .3s cubic-bezier(.22,.61,.36,1),
    height .3s cubic-bezier(.22,.61,.36,1),
    border-radius .3s cubic-bezier(.22,.61,.36,1),
    transform .28s cubic-bezier(.22,.61,.36,1),
    box-shadow .28s ease,
    opacity .2s ease,
    background .3s ease;
  animation: opencg-enter .38s cubic-bezier(.22,.61,.36,1) both;
  background:
    linear-gradient(160deg, var(--opencg-accent-soft, rgba(107,114,128,.07)) 0%, rgba(255,255,255,0) 52%),
    linear-gradient(135deg, rgba(255,255,255,.80) 0%, rgba(255,255,255,.58) 100%);
  backdrop-filter: blur(26px) saturate(1.85) brightness(1.05);
  -webkit-backdrop-filter: blur(26px) saturate(1.85) brightness(1.05);
  box-shadow:
    0 1px 2px rgba(0,0,0,.045),
    0 2px 8px rgba(0,0,0,.06),
    0 16px 40px rgba(0,0,0,.10),
    inset 0 1px 0 rgba(255,255,255,.55);
}
@keyframes opencg-enter {
  from { opacity: 0; transform: translateY(10px) scale(.94); }
  to { opacity: .92; transform: none; }
}
.opencg:hover, .opencg:focus-within, .opencg.dragging { opacity: 1; }
.opencg:focus-visible { outline: 2px solid rgba(0,122,255,.55); outline-offset: 2px; }
.opencg:hover {
  transform: translateY(-1px);
  box-shadow:
    0 4px 12px rgba(0,0,0,.08),
    0 16px 40px rgba(0,0,0,.12),
    inset 0 1px 0 rgba(255,255,255,.6);
}
.opencg.dragging {
  cursor: grabbing;
  transform: translateY(0);
  box-shadow:
    0 8px 24px rgba(0,0,0,.16),
    0 24px 56px rgba(0,0,0,.18),
    inset 0 1px 0 rgba(255,255,255,.4);
}
/* 手势进行中：宽高/位置过渡会变成橡皮筋，只留阴影/透明度过渡 */
.opencg.dragging, .opencg.resizing { transition: box-shadow .18s ease, opacity .18s ease; }
.opencg.resizing { cursor: nwse-resize; }


/* ── 纵向品牌轨 ── */
.ocg-rail {
  width: 104px;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 3px;
  padding: 10px 8px 8px;
  background: rgba(128,128,128,.07);
  border-right: 1px solid rgba(128,128,128,.10);
  position: relative;
  cursor: grab;
}
.ocg-rail .opencg-dot { align-self: flex-start; margin: 2px 0 7px 4px; }
.ocg-rail-spacer { flex: 1 1 auto; min-height: 2px; }
.ocg-rail-btn {
  height: 26px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(128,128,128,.8);
  font: inherit;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: .01em;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 0 8px 0 10px;
  position: relative;
  flex: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: all .18s cubic-bezier(.22,.61,.36,1);
}
.ocg-rail-btn:hover {
  background: rgba(128,128,128,.10);
  color: var(--dsw-alias-label-primary, #222);
}
.ocg-rail-btn.active {
  background: var(--opencg-accent-soft, rgba(107,114,128,.14));
  color: var(--opencg-accent, #6b7280);
  box-shadow: inset 0 0 0 1px var(--opencg-accent-ring, rgba(107,114,128,.3));
}
/* 激活指示墨条：单块随激活按钮上下滑动（位置由 JS 的 --opencg-ink 下标驱动） */
.ocg-rail-ink {
  position: absolute;
  left: 2px;
  top: calc(var(--rail-top, 34px) + var(--opencg-ink, 0) * var(--rail-step, 29px));
  width: 3px;
  height: 16px;
  border-radius: 999px;
  background: var(--opencg-accent, #6b7280);
  box-shadow: 0 0 6px var(--opencg-accent-ring, rgba(107,114,128,.4));
  transition: top .32s cubic-bezier(.22,.61,.36,1), background .2s ease;
  pointer-events: none;
}
.ocg-rail-btn:focus-visible { outline: 2px solid rgba(0,122,255,.6); outline-offset: 1px; }
/* 品牌轨依次入场（仅在挂载时跑一次） */
.ocg-rail-btn, .ocg-rail .opencg-collapse { animation: opencg-fade-in .3s cubic-bezier(.22,.61,.36,1) both; }
.ocg-rail .ocg-rail-btn:nth-child(4) { animation-delay: .03s; }
.ocg-rail .ocg-rail-btn:nth-child(5) { animation-delay: .06s; }
.ocg-rail .ocg-rail-btn:nth-child(6) { animation-delay: .09s; }
.ocg-rail .ocg-rail-btn:nth-child(7) { animation-delay: .12s; }
.ocg-rail .ocg-rail-btn:nth-child(8) { animation-delay: .15s; }
.ocg-rail .opencg-collapse { animation-delay: .18s; }

/* ── 状态点主题色 ── */
.opencg-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: none;
  position: relative;
  transition: background .2s ease;
}
.opencg-dot.ok {
  background: #34c759;
  box-shadow: 0 0 0 3px rgba(52,199,89,.18);
  animation: opencg-pulse-sm 2s ease-in-out infinite;
}
.opencg-dot.err {
  background: #ff3b30;
  box-shadow: 0 0 0 3px rgba(255,59,48,.18);
  animation: none;
}
.opencg-dot.idle {
  background: #aeaeb2;
  box-shadow: 0 0 0 3px rgba(174,174,178,.14);
  animation: none;
}
@keyframes opencg-pulse-sm {
  0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 3px rgba(52,199,89,.20); }
  50% { opacity: .55; transform: scale(.78); box-shadow: 0 0 0 5px rgba(52,199,89,.07); }
}

/* ── 主区 ── */
.ocg-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* ── Header：厂牌名 + 刷新 ── */
.opencg-header {
  display: flex;
  align-items: center;
  cursor: grab;
  gap: 8px;
  padding: 10px 12px 0;
  font-size: 12px;
  white-space: nowrap;
}
.ocg-prod-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: clamp(10px, 3.9cqw, 11px);
  font-weight: 800;
  letter-spacing: .09em;
  text-transform: uppercase;
  color: var(--opencg-accent, var(--dsw-alias-label-secondary, #888));
  animation: opencg-fade-in .18s ease both;
}

/* ── 刷新按钮 --- */
.opencg-refresh {
  margin-left: auto;
  border: none;
  background: transparent;
  color: rgba(128,128,128,.6);
  cursor: pointer;
  border-radius: 8px;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  flex: none;
  transition: all .2s cubic-bezier(.22,.61,.36,1);
}
.opencg-refresh:hover {
  background: rgba(128,128,128,.10);
  color: var(--dsw-alias-label-primary, #222);
  transform: rotate(90deg);
}
.opencg-refresh:active { transform: rotate(90deg) scale(.85); }
.opencg-refresh.loading {
  animation: opencg-spin-loop .9s linear infinite;
  color: var(--dsw-alias-label-primary, #222);
}
@keyframes opencg-spin-loop { to { transform: rotate(360deg); } }

/* ── 收起按钮（品牌轨底部 −） ── */
.opencg-collapse {
  border: none;
  background: transparent;
  color: rgba(128,128,128,.55);
  cursor: pointer;
  border-radius: 8px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 0 8px 0 10px;
  font-size: 13px;
  line-height: 1;
  flex: none;
  transition: all .2s cubic-bezier(.22,.61,.36,1);
}
.opencg-collapse:hover {
  background: rgba(128,128,128,.10);
  color: var(--dsw-alias-label-primary, #222);
}
.opencg-collapse:active { transform: scale(.85); }
.opencg-collapse:focus-visible { outline: 2px solid rgba(0,122,255,.6); outline-offset: 1px; }

/* ── 可折叠迷你胶囊（收起态：品牌轨隐藏，只留主区一行胶囊） ── */
.opencg.collapsed {
  /* container-type:size 的 size containment 会让 width:auto 忽略内容（胶囊被压扁裁字），收起态必须关掉 */
  container-type: normal;
  width: auto !important;
  min-width: 80px !important;
  height: 34px !important;
  min-height: 34px !important;
  border-radius: 17px;
  opacity: .92;
  box-shadow:
    0 2px 8px rgba(0,0,0,.10),
    0 8px 20px rgba(0,0,0,.12),
    inset 0 1px 0 rgba(255,255,255,.5);
}
.opencg.collapsed:hover { opacity: 1; }
.opencg.collapsed .ocg-rail,
.opencg.collapsed .ocg-prod-name,
.opencg.collapsed .opencg-refresh,
.opencg.collapsed .opencg-body,
.opencg.collapsed .opencg-hint-text,
.opencg.collapsed .opencg-resize { display: none !important; }
.opencg.collapsed .ocg-main { flex: 0 0 auto; }
.opencg.collapsed .opencg-header {
  border-radius: 17px;
  padding: 0 6px 0 11px;
  height: 34px;
  gap: 7px;
}

/* ── 迷你胶囊内容 ── */
.opencg-pill {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  font-size: 11.5px;
  white-space: nowrap;
  min-width: 0;
  animation: opencg-fade-in .15s ease both;
}
.opencg-pill-name {
  font-weight: 600;
  font-size: 10.5px;
  color: var(--opencg-accent, var(--dsw-alias-label-secondary, #888));
}
.opencg-pill-val {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  font-size: 12.5px;
  color: var(--dsw-alias-label-primary, #222);
}
.opencg-pill-btn {
  align-self: center;
  border: none;
  background: rgba(128,128,128,.08);
  color: rgba(128,128,128,.75);
  border-radius: 999px;
  width: 20px;
  height: 20px;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  margin-left: 1px;
  transition: all .15s ease;
}
.opencg-pill-btn:hover { background: rgba(128,128,128,.16); color: var(--dsw-alias-label-primary, #222); }
.opencg-pill-btn:focus-visible { outline: 2px solid rgba(0,122,255,.6); outline-offset: 1px; }
@keyframes opencg-fade-in {
  from { opacity: 0; transform: translateY(-4px) scale(.96); }
  to { opacity: 1; transform: none; }
}

/* ── 主体区域 --- */
.opencg-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: clamp(7px, 3.8cqw, 11px);
  overflow-y: auto;
  overflow-x: hidden;
  margin-top: 6px;
  padding: 0 clamp(10px, 4.4cqw, 13px) 10px;
  min-height: 0;
}
.opencg-body::-webkit-scrollbar { width: 5px; }
.opencg-body::-webkit-scrollbar-track { background: transparent; }
.opencg-body::-webkit-scrollbar-thumb {
  background: rgba(128,128,128,.20);
  border-radius: 3px;
}
.opencg-body::-webkit-scrollbar-thumb:hover {
  background: rgba(128,128,128,.32);
}

/* ── 面板淡入动画（左右方向滑动） ── */
.opencg-pane {
  display: flex;
  flex-direction: column;
  gap: 10px;
  animation: opencg-tab-in .22s cubic-bezier(.22,.61,.36,1) both;
}
.opencg-pane.left { animation-name: opencg-tab-in-left; }
.opencg-pane.right { animation-name: opencg-tab-in-right; }
@keyframes opencg-tab-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}
@keyframes opencg-tab-in-left {
  from { opacity: 0; transform: translateX(-14px) scale(.985); filter: blur(3px); }
  to { opacity: 1; transform: none; filter: none; }
}
@keyframes opencg-tab-in-right {
  from { opacity: 0; transform: translateX(14px) scale(.985); filter: blur(3px); }
  to { opacity: 1; transform: none; filter: none; }
}
.opencg-pane.compact { gap: 6px; }

/* ── Hero 主指标：每个面板第一行升格为仪表大读数 ── */
.opencg-pane > .opencg-row.simple:first-child {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}
.opencg-pane > .opencg-row.simple:first-child .opencg-name {
  font-size: 10px;
  letter-spacing: .06em;
  color: rgba(128,128,128,.6);
}
.opencg-pane > .opencg-row.simple:first-child .opencg-value {
  font-size: clamp(19px, 8.4cqw, 27px);
  font-weight: 800;
  letter-spacing: -.02em;
  line-height: 1.15;
}

/* ── 配额进度条 ── */
.opencg-q { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.opencg-q-top {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  line-height: 1.35;
}
.opencg-q-name {
  color: rgba(128,128,128,.7);
  font-size: clamp(9.5px, 4cqw, 11px);
  flex: none;
}
.opencg-q-bot { display: flex; align-items: center; gap: 8px; min-width: 0; }
.opencg-q.nodata .opencg-q-bot { justify-content: flex-start; }
.opencg-rem {
  margin-left: auto;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  font-size: clamp(13px, 5.2cqw, 15.5px);
  letter-spacing: -.01em;
  flex: none;
}
.opencg-reset {
  font-size: 10.5px;
  color: rgba(128,128,128,.6);
  font-variant-numeric: tabular-nums;
  text-align: right;
  flex: none;
  min-width: 50px;
}
.opencg-bar {
  flex: 1;
  min-width: 0;
  height: 7px;
  border-radius: 999px;
  background: rgba(128,128,128,.13);
  box-shadow: inset 0 1px 2px rgba(0,0,0,.07);
  overflow: hidden;
  position: relative;
}
.opencg-bar i {
  display: block;
  height: 100%;
  border-radius: 999px;
  transition: width .6s cubic-bezier(.4,0,.2,1);
  box-shadow: 0 0 8px rgba(0,0,0,.10);
  position: relative;
}
.opencg-bar i::after {
  content: '';
  position: absolute;
  top: 0; bottom: 0;
  width: 42%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.38), transparent);
  animation: opencg-sweep 2.8s cubic-bezier(.4,0,.2,1) infinite;
}
@keyframes opencg-sweep {
  0% { left: -45%; opacity: 0; }
  12% { opacity: 1; }
  55% { left: 105%; opacity: 1; }
  56% { opacity: 0; }
  100% { left: 105%; opacity: 0; }
}
.opencg-used {
  font-size: 10px;
  color: rgba(128,128,128,.6);
  font-variant-numeric: tabular-nums;
  text-align: right;
  flex: none;
  min-width: 46px;
}

/* ── 配额面板 Hero：首个配额行的剩余% 升格为大读数 ── */
.opencg-pane > .opencg-q:first-child .opencg-rem {
  font-size: clamp(17px, 7.2cqw, 23px);
  font-weight: 800;
  letter-spacing: -.02em;
}
/* 数值更新淡入（JS 在数值变化时换 key 重挂载触发） */
.opencg-pane > .opencg-row.simple:first-child .opencg-value,
.opencg-q .opencg-rem,
.opencg-pill-val {
  animation: opencg-val-in .3s cubic-bezier(.22,.61,.36,1) both;
}
@keyframes opencg-val-in {
  from { opacity: 0; transform: translateY(4px); filter: blur(2px); }
  to { opacity: 1; transform: none; filter: none; }
}

/* ── 键值信息行 ── */
.opencg-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  line-height: 1.4;
}
.opencg-row.simple {
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: 8px;
  align-items: baseline;
  line-height: 1.45;
}
.opencg-name {
  color: rgba(128,128,128,.65);
  font-size: clamp(10px, 4.1cqw, 11.5px);
  flex: none;
}
.opencg-value {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  font-size: clamp(13.5px, 5.6cqw, 17px);
  letter-spacing: -.01em;
  line-height: 1.2;
}
.opencg-value.flash { animation: opencg-flash .4s ease; }
@keyframes opencg-flash {
  0% { filter: brightness(1); }
  50% { filter: brightness(1.3); }
  100% { filter: brightness(1); }
}
.opencg-meta {
  font-size: 10px;
  line-height: 1.45;
  color: rgba(128,128,128,.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.opencg-status {
  font-size: 10px;
  line-height: 1.45;
  color: rgba(128,128,128,.5);
  margin-top: auto;
  padding-top: 6px;
  border-top: 1px solid rgba(128,128,128,.08);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.opencg-status.err { color: #e8590c; font-weight: 600; }

/* ── 提示文字 --- */
.opencg-hint-text {
  font-size: 9.5px;
  line-height: 1.4;
  color: rgba(128,128,128,.45);
  padding: 6px 0 2px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Resize 手柄：24px 大触控区 + 双角抓手 ── */
.opencg-resize {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 24px;
  height: 24px;
  border-radius: 6px 0 18px 0;
  cursor: nwse-resize;
  z-index: 1;
  transition: background .15s ease;
  opacity: .75;
  touch-action: none;
}
.opencg-resize:hover { background: rgba(128,128,128,.10); opacity: 1; }
.opencg-resize::after {
  content: '';
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 7px;
  height: 7px;
  border-right: 2px solid rgba(128,128,128,.4);
  border-bottom: 2px solid rgba(128,128,128,.4);
  border-radius: 0 0 2px 0;
}
.opencg-resize::before {
  content: '';
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 13px;
  height: 13px;
  border-right: 2px solid rgba(128,128,128,.22);
  border-bottom: 2px solid rgba(128,128,128,.22);
  border-radius: 0 0 4px 0;
}

/* ── 设置页开关 --- */
.opencg-set-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 0;
  min-width: 0;
}
.opencg-set-copy { min-width: 0; }
.opencg-set-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #222);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.opencg-set-desc {
  font-size: 11px;
  line-height: 1.5;
  color: rgba(128,128,128,.6);
  margin-top: 3px;
}
.opencg-set-switch {
  position: relative;
  flex: none;
  width: 42px;
  height: 24px;
  border-radius: 999px;
  padding: 0;
  border: 1px solid rgba(128,128,128,.24);
  background: rgba(128,128,128,.14);
  cursor: pointer;
  transition: background .2s ease, border-color .2s ease;
}
.opencg-set-switch.on {
  background: #34c759;
  border-color: transparent;
}
.opencg-set-switch .opencg-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0,0,0,.18);
  transition: left .2s cubic-bezier(.22,.61,.36,1);
}
.opencg-set-switch.on .opencg-knob { left: 21px; }

/* ── 焦点可见样式 --- */
.opencg-refresh:focus-visible,
.opencg-set-switch:focus-visible,
.opencg-action-btn:focus-visible {
  outline: 2px solid rgba(0,122,255,.6);
  outline-offset: 1px;
}

/* ═══ 容器查询自适应（宽度不够时品牌轨收窄） ═══ */
@container (max-width: 280px) {
  .ocg-rail { width: 88px; padding: 8px 6px 7px; gap: 2px; }
  .ocg-rail-btn { height: 24px; font-size: 9.5px; padding: 0 6px 0 8px; }
  .ocg-rail { --rail-top: 31px; --rail-step: 26px; }
  .opencg-header { gap: 6px; padding: 8px 10px 0; }
  .opencg-refresh { width: 22px; height: 22px; font-size: 12px; }
  .opencg-hint-text { display: none; }
  .opencg-body { gap: 7px; margin-top: 5px; padding: 0 10px 8px; }
  .opencg-pane { gap: 7px; }
}

/* ── 深色主题：跟随 DSH ui-theme 的 body[data-ds-dark-theme] ── */
body[data-ds-dark-theme] .opencg {
  background:
    linear-gradient(160deg, var(--opencg-accent-soft, rgba(128,128,128,.08)) 0%, rgba(255,255,255,0) 52%),
    linear-gradient(135deg, rgba(40,42,48,.78) 0%, rgba(24,26,30,.66) 100%);
  border-color: rgba(255,255,255,.12);
  box-shadow:
    0 2px 8px rgba(0,0,0,.30),
    0 12px 32px rgba(0,0,0,.45),
    inset 0 1px 0 rgba(255,255,255,.07);
}
body[data-ds-dark-theme] .opencg:hover {
  box-shadow:
    0 4px 12px rgba(0,0,0,.35),
    0 16px 40px rgba(0,0,0,.5),
    inset 0 1px 0 rgba(255,255,255,.09);
}
body[data-ds-dark-theme] .opencg.dragging {
  box-shadow:
    0 8px 24px rgba(0,0,0,.45),
    0 24px 56px rgba(0,0,0,.55),
    inset 0 1px 0 rgba(255,255,255,.06);
}
body[data-ds-dark-theme] .ocg-rail {
  background: rgba(255,255,255,.045);
  border-right-color: rgba(255,255,255,.08);
}
body[data-ds-dark-theme] .ocg-rail-btn { color: rgba(228,228,231,.55); }
body[data-ds-dark-theme] .ocg-rail-btn:hover { color: #f4f4f5; background: rgba(255,255,255,.08); }
body[data-ds-dark-theme] .ocg-rail-btn.active { color: var(--opencg-accent, #f4f4f5); }
body[data-ds-dark-theme] .opencg-bar { background: rgba(255,255,255,.10); }
body[data-ds-dark-theme] .opencg-resize { background: transparent; }
body[data-ds-dark-theme] .opencg-resize:hover { background: rgba(255,255,255,.08); }
body[data-ds-dark-theme] .opencg-resize::after {
  border-right-color: rgba(255,255,255,.32);
  border-bottom-color: rgba(255,255,255,.32);
}
body[data-ds-dark-theme] .opencg-resize::before {
  border-right-color: rgba(255,255,255,.16);
  border-bottom-color: rgba(255,255,255,.16);
}

/* ── 尊重系统减动效偏好 ── */
@media (prefers-reduced-motion: reduce) {
  .opencg, .opencg * {
    animation-duration: .01ms !important;
    transition-duration: .01ms !important;
  }
}`;
    // 幂等注入等注入：样式表常驻 DOM，内容每次实时同步。
    // 不能写成「标签已存在就跳过」——热重载后旧标签仍在，新规则（touch-action 等）永远不会进浏览器。
    if (typeof document !== 'undefined') {
      let tag = document.querySelector('style[data-plugin-css="dsh-opencode-go-monitor"]');
      if (!tag) {
        tag = document.createElement('style');
        tag.setAttribute('data-plugin-css', 'dsh-opencode-go-monitor');
        document.head.appendChild(tag);
      }
      if (tag.textContent !== CSS) tag.textContent = CSS;
    }
    //#endregion

    const inject = ['slots', 'timer'];

    const KEY_POS = 'dsh-opencode-go-monitor-pos';
    const KEY_SIZE = 'dsh-opencode-go-monitor-size';
    const KEY_ENABLED = 'dsh-opencode-go-monitor-enabled';
    const KEY_COLLAPSED = 'dsh-opencode-go-monitor-collapsed';
    const KEY_TAB = 'dsh-opencode-go-monitor-tab';
    const DEFAULT_SIZE = { w: 312, h: 238 };
    // 尺寸夹取：下限保证品牌侧栏全名可读，上限跟随视口（窗口缩小时悬浮窗不会比屏幕还大）
    const MIN_W = 264, MIN_H = 220, MAX_W = 660, MAX_H = 760;
    function clampSize(w, h) {
      const vw = window.innerWidth || 1280;
      const vh = window.innerHeight || 800;
      return {
        w: Math.round(Math.max(MIN_W, Math.min(Math.min(MAX_W, Math.max(160, vw - 16)), w))),
        h: Math.round(Math.max(MIN_H, Math.min(Math.min(MAX_H, Math.max(120, vh - 16)), h))),
      };
    }
    const TAB_KEYS = ['ds', 'go', 'oc', 'hc', 'sf'];
    const TAB_SHORT = { ds: 'DeepSeek', go: 'GOAT', oc: 'OpenCode', hc: 'Hyper', sf: 'StepFun' };

    // ---- 悬浮窗开关（设置页「通用」区开关行 + 悬浮窗本体共享的模块级状态）----
    // 默认开启：键不存在视为开启，老用户升级后悬浮窗行为不变。
    let enabledValue = (() => {
      try {
        const raw = localStorage.getItem(KEY_ENABLED);
        if (raw !== null) return raw === '1';
      } catch (e) { /* 可选项 */ }
      return true;
    })();
    const enabledListeners = new Set();
    const getEnabled = () => enabledValue;
    const setEnabled = (v) => {
      enabledValue = !!v;
      try { localStorage.setItem(KEY_ENABLED, enabledValue ? '1' : '0'); } catch (e) { /* 可选项 */ }
      for (const l of [...enabledListeners]) l(enabledValue);
    };
    const subscribeEnabled = (l) => {
      enabledListeners.add(l);
      return () => { enabledListeners.delete(l); };
    };

    // Charm Hyper 积分（hypercredits）每日刷新时刻，UTC 时。
    // 默认 20:00 UTC = 北京时间次日 04:00（由用户观测「Next refresh in 5 hours」反推，
    // 官网标订阅为「250 Hypercredits, refreshing daily」）。
    // 若控制台显示的刷新时刻不是这个，只改此常量，client 热重载立即生效。
    const HC_DAILY_REFRESH_HOUR_UTC = 20;

    // 下次积分刷新的绝对时刻（ms）：每日 HC_DAILY_REFRESH_HOUR_UTC 点（UTC），跨时区/夏令时安全
    const nextHcRefreshAt = (now) => {
      const d = new Date(now);
      const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), HC_DAILY_REFRESH_HOUR_UTC, 0, 0, 0);
      return base <= now ? base + 86400000 : base;
    };

    // 防呆：把窗口坐标夹回视口内（旧/越界位置不会再把悬浮窗挤到屏幕外）。
    function clampPos(x, y, w, h) {
      const vw = window.innerWidth || 1280;
      const vh = window.innerHeight || 800;
      const ww = Math.min(w || 220, Math.max(80, vw - 16));
      const wh = Math.min(h || 160, Math.max(80, vh - 16));
      return {
        x: Math.max(8, Math.min(x, Math.max(8, vw - ww))),
        y: Math.max(8, Math.min(y, Math.max(8, vh - wh))),
      };
    }

    function loadPos() {
      try {
        const raw = localStorage.getItem(KEY_POS);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (typeof parsed.x === 'number' && typeof parsed.y === 'number') return parsed;
        }
      } catch (e) { /* 可选项 */ }
      return null;
    }
    function loadSize() {
      try {
        const raw = localStorage.getItem(KEY_SIZE);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (typeof parsed.w === 'number' && typeof parsed.h === 'number') {
            return clampSize(parsed.w, parsed.h);
          }
        }
      } catch (e) { /* 可选项 */ }
      return { w: DEFAULT_SIZE.w, h: DEFAULT_SIZE.h };
    }
    const loadBool = (key) => { try { return localStorage.getItem(key) === '1'; } catch (e) { return false; } };
    const loadTab = () => {
      try {
        const v = localStorage.getItem(KEY_TAB);
        if (v && TAB_KEYS.indexOf(v) >= 0) return v;
      } catch (e) { /* 可选项 */ }
      return 'ds';
    };
    // 贴边吸附：拖动释放时距视口边缘 ≤22px → 自动贴齐 8px 安全边距
    function snapToEdge(x, y, w, h) {
      const vw = window.innerWidth || 1280;
      const vh = window.innerHeight || 800;
      const SN = 22;
      let nx = x, ny = y;
      if (nx - 8 <= SN) nx = 8;
      else if (vw - (nx + w) - 8 <= SN) nx = Math.max(8, vw - w - 8);
      if (ny - 8 <= SN) ny = 8;
      else if (vh - (ny + h) - 8 <= SN) ny = Math.max(8, vh - h - 8);
      return { x: nx, y: ny };
    }
    const fmtTokens = (n) => {
      if (n == null || !Number.isFinite(n)) return '--';
      if (n >= 1e8) return (n / 1e8).toFixed(2) + '亿';
      if (n >= 1e4) return (n / 1e4).toFixed(1) + '万';
      return String(Math.round(n));
    };
    const fmtTime = (ms) => {
      try {
        const d = new Date(ms);
        const p = (n) => String(n).padStart(2, '0');
        return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
      } catch (e) { return '--:--:--'; }
    };
    const fmtHc = (n) => {
      if (n == null || !Number.isFinite(n)) return '--';
      if (n >= 1e8) return (n / 1e8).toFixed(2) + '亿';
      if (n >= 1e4) return (n / 1e4).toFixed(2) + '万';
      if (n >= 1000) return String(Math.round(n));
      return String(Math.round(n * 100) / 100);
    };
    // 倒计时 HH:MM:SS（每日刷新最多 23:59:59）
    const fmtCountdown = (ms) => {
      if (!Number.isFinite(ms) || ms < 0) return '--:--:--';
      const s = Math.floor(ms / 1000);
      const p = (n) => String(n).padStart(2, '0');
      return p(Math.floor(s / 3600)) + ':' + p(Math.floor(s % 3600 / 60)) + ':' + p(s % 60);
    };
    // 接口时间戳解析：兼容 ISO 字符串 / 数字 epoch 毫秒（接口实测返回 13 位数字）/ 数字 epoch 秒
    const parseTs = (v) => {
      if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
      if (typeof v === 'string') {
        const n = Number(v);
        if (Number.isFinite(n)) return n > 1e12 ? n : n * 1000;
        return Date.parse(v);
      }
      return NaN;
    };
    // 距额度重置的倒计时（分钟为主）：X天Xh / Xh Ym / Xm Ys / Xs / 已重置
    const fmtLeft = (ms) => {
      if (!Number.isFinite(ms)) return '--';
      if (ms <= 0) return '已重置';
      const s = Math.floor(ms / 1000);
      const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
      if (d > 0) return d + '天' + h + 'h';
      if (h > 0) return h + 'h' + (m > 0 ? m + 'm' : '');
      if (m > 0) return m + 'm' + (s % 60 > 0 ? s % 60 + 's' : '');
      return s + 's';
    };
    // 绝对时刻 MM-DD HH:MM（本地时区）
    const fmtDateMin = (ms) => {
      if (!Number.isFinite(ms)) return '--';
      const d = new Date(ms);
      if (Number.isNaN(d.getTime())) return '--';
      const p = (n) => String(n).padStart(2, '0');
      return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    };
    // DeepSeek 估算口径显示（host /api/deepseek/balance 携带 pricePeriod / priceTable / cacheHitRate 等）
    const dsPeriodText = (ds) => (ds && ds.pricePeriod === 'peak' ? '高峰' : '空闲');
    const fmtPerM = (n) => {
      const v = Number(n);
      return Number.isFinite(v) ? String(Math.round(v * 1e4) / 1e4) : '--';
    };
    const fmtPct1 = (n) => {
      const v = Number(n);
      return Number.isFinite(v) ? (v * 100).toFixed(1) + '%' : '--';
    };
    // 「预计剩余」估算悬浮说明：官方现行价 + 本账户用量结构折算（2026-09 官方调价后）
    const dsEstimateTip = (ds) => {
      const t = ds.priceTable || {};
      const peak = ds.pricePeriod === 'peak';
      const alt = peak
        ? '空闲时段（半价）¥' + fmtPerM(ds.offPeakPerMillion) + '/百万 → ≈' + fmtTokens(ds.estTokensOffPeak) + ' tok'
        : '高峰时段（2 倍价）¥' + fmtPerM(ds.peakPerMillion) + '/百万 → ≈' + fmtTokens(ds.estTokensPeak) + ' tok';
      return '预计剩余估算（2026-09 官方调价后）\n'
        + '· 当前' + (peak ? '高峰时段（北京时间周一至周五 09-12 / 14-18）' : '空闲时段（上述高峰时段以外，含周末全天）')
        + '：¥' + fmtPerM(ds.pricePerMillion) + '/百万 tokens\n'
        + '· 官方现价（' + (ds.priceLabel || ds.priceFamily || 'deepseek-flash') + '，¥/百万）：输入命中 ¥' + fmtPerM(t.hit)
        + ' · 输入未命中 ¥' + fmtPerM(t.miss) + ' · 输出 ¥' + fmtPerM(t.out) + '\n'
        + '· 按本账户实测结构折算：缓存命中率 ' + fmtPct1(ds.cacheHitRate) + ' · 输出占比 ' + fmtPct1(ds.outputShare) + '\n'
        + '· ' + alt + '\n'
        + '· 预计剩余 = 余额 ÷ 有效单价';
    };

    function apply(ctx) {
      // 跨标签页同步开关（storage 事件）
      ctx.effect(() => {
        const onStorage = (e) => {
          if (e.key !== KEY_ENABLED) return;
          enabledValue = e.newValue === '1';
          for (const l of [...enabledListeners]) l(enabledValue);
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
      }, 'opencode-go-monitor: 跨标签页开关同步');

      // 设置页「通用」区：余额悬浮窗开关行
      ctx.effect(() => ctx.slots.inject('settings.general.item', () => ctx.slots.register(
        { name: 'settings.general.item', id: 'balance-window', order: 100, label: '余额悬浮窗' },
        () => {
          const [enabled, setEnabledState] = React.useState(getEnabled());
          React.useEffect(() => subscribeEnabled(setEnabledState), []);
          const onToggle = () => setEnabled(!enabled);
          return React.createElement('div', { className: 'opencg-set-row' },
            React.createElement('div', { className: 'opencg-set-copy' },
              React.createElement('div', { className: 'opencg-set-title' }, '余额悬浮窗'),
              React.createElement('div', { className: 'opencg-set-desc' },
                enabled
                  ? '悬浮窗已开启 · DeepSeek / Command Code GOAT / OpenCode Go / Charm Hyper / 阶跃星辰 StepFun 余额实时显示'
                  : '悬浮窗已关闭 · 切换后立即生效（可拖动、可调整大小）')),
            React.createElement('button', {
              type: 'button',
              role: 'switch',
              'aria-checked': enabled,
              'aria-label': enabled ? '关闭余额悬浮窗' : '开启余额悬浮窗',
              title: enabled ? '关闭悬浮窗' : '开启悬浮窗',
              className: 'opencg-set-switch' + (enabled ? ' on' : ''),
              onClick: onToggle,
            }, React.createElement('span', { className: 'opencg-knob' })));
        },
      )), 'opencode-go-monitor: settings row');

      ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register(
        { name: 'shell.overlay', id: 'opencode-go-monitor', order: 0, label: '余额悬浮窗' },
        (props) => {
          const [ds, setDs] = React.useState(null);
          const [dsErr, setDsErr] = React.useState(null);
          const [hc, setHc] = React.useState(null);
          const [hcErr, setHcErr] = React.useState(null);
          const [go, setGo] = React.useState(null);
          const [goErr, setGoErr] = React.useState(null);
          const [oc, setOc] = React.useState(null);
          const [ocErr, setOcErr] = React.useState(null);
          const [sf, setSf] = React.useState(null);
          const [sfErr, setSfErr] = React.useState(null);
          const [tab, setTab] = React.useState(loadTab);
          const [dir, setDir] = React.useState('right');
          const [pos, setPos] = React.useState(loadPos);
          const [size, setSize] = React.useState(loadSize);
          // 折叠状态：标题栏「−」/双击标题栏/C 键收起为迷你胶囊；点胶囊或 Esc 展开（状态记忆）
          const [collapsed, setCollapsedState] = React.useState(() => loadBool(KEY_COLLAPSED));
          const collapsedRef = React.useRef(collapsed);
          const setCollapsed = (v) => {
            const next = typeof v === 'function' ? !!v(collapsedRef.current) : !!v;
            collapsedRef.current = next;
            setCollapsedState(next);
            try { localStorage.setItem(KEY_COLLAPSED, next ? '1' : '0'); } catch (e) { /* 可选项 */ }
          };
          // 手动刷新进行中（驱动 ↻ 按钮转圈；轮询不点亮，避免长期闪烁）
          const [loading, setLoading] = React.useState(false);

          const [dragging, setDragging] = React.useState(false);
          const [resizing, setResizing] = React.useState(false);
          const dragRef = React.useRef(null);
          const resizeRef = React.useRef(null);
          const sizeRef = React.useRef(size);
          const rootRef = React.useRef(null);
          // 手势 move 合帧器：触摸/触控笔事件频率可远高于绘制帧，rAF 合并后只在帧内提交位置/尺寸
          const fxRafRef = React.useRef(0);
          const pendingFxRef = React.useRef(null);
          // Charm Hyper 积分刷新倒计时：deadline 为下一次每日刷新时刻，1s 时钟驱动剩余时间
          const hcRefreshAtRef = React.useRef(nextHcRefreshAt(Date.now()));
          const [hcNow, setHcNow] = React.useState(Date.now());

          const applySize = (next) => { sizeRef.current = next; setSize(next); };
          // 缩放（滚轮/键盘/双击复位）共用通道：夹取 → 应用 → 记忆 → 位置回夹（变大后可能越界）
          const applySizePersist = (next) => {
            const clamped = clampSize(next.w, next.h);
            applySize(clamped);
            try { localStorage.setItem(KEY_SIZE, JSON.stringify(clamped)); } catch (e) { /* 可选项 */ }
            setPos((p) => (p ? clampPos(p.x, p.y, clamped.w, clamped.h) : p));
          };

          const refreshDs = React.useCallback(async () => {
            try {
              const res = await fetch('/api/deepseek/balance');
              const data = await res.json();
              if (data && (data.ok || data.stale)) { setDs(data); setDsErr(null); }
              else { setDs(null); setDsErr(data && data.error ? data.error : '获取失败'); }
            } catch (e) { setDs(null); setDsErr(String((e && e.message) || e)); }
          }, []);

          const refreshHc = React.useCallback(async () => {
            try {
              const res = await fetch('/api/hypercharm/balance');
              const data = await res.json();
              if (data && (data.ok || data.stale)) { setHc(data); setHcErr(null); }
              else { setHc(null); setHcErr(data && data.error ? data.error : '获取失败'); }
            } catch (e) { setHc(null); setHcErr(String((e && e.message) || e)); }
          }, []);

          const refreshGo = React.useCallback(async () => {
            try {
              const res = await fetch('/api/commandcode-goat/balance');
              const data = await res.json();
              if (data && (data.ok || data.stale)) { setGo(data); setGoErr(null); }
              else { setGo(null); setGoErr(data && data.error ? data.error : '获取失败'); }
            } catch (e) { setGo(null); setGoErr(String((e && e.message) || e)); }
          }, []);

          // OpenCode Go（opencode.ai/zen/go）：滚动 / 每周 / 每月 三窗口额度
          const refreshOc = React.useCallback(async () => {
            try {
              const res = await fetch('/api/opencode-go/balance');
              const data = await res.json();
              if (data && (data.ok || data.stale)) { setOc(data); setOcErr(null); }
              else { setOc(null); setOcErr(data && data.error ? data.error : '获取失败'); }
            } catch (e) { setOc(null); setOcErr(String((e && e.message) || e)); }
          }, []);

          // 阶跃星辰 StepFun（api.stepfun.com/v1/accounts）：可用余额 + 充值/赠送两池
          const refreshSf = React.useCallback(async () => {
            try {
              const res = await fetch('/api/stepfun/balance');
              const data = await res.json();
              if (data && (data.ok || data.stale)) { setSf(data); setSfErr(null); }
              else { setSf(null); setSfErr(data && data.error ? data.error : '获取失败'); }
            } catch (e) { setSf(null); setSfErr(String((e && e.message) || e)); }
          }, []);

          const refresh = React.useCallback(() => {
            setLoading(true);
            return Promise.allSettled([refreshDs(), refreshGo(), refreshOc(), refreshHc(), refreshSf()])
              .then(() => { setLoading(false); });
          }, [refreshDs, refreshGo, refreshOc, refreshHc, refreshSf]);

          React.useEffect(() => {
            refresh();
            const stop2 = ctx.interval(refreshDs, 30000);
            const stop3 = ctx.interval(refreshHc, 30000);
            const stop4 = ctx.interval(refreshGo, 60000);
            const stop5 = ctx.interval(refreshOc, 60000);
            const stop6 = ctx.interval(refreshSf, 60000);
            // 1s 时钟驱动 Charm Hyper 积分刷新倒计时：跨过刷新时刻自动翻到下一天
            const stop1 = ctx.interval(() => {
              const now = Date.now();
              if (hcRefreshAtRef.current <= now) hcRefreshAtRef.current = nextHcRefreshAt(now);
              setHcNow(now);
            }, 1000);
            return () => { stop2(); stop3(); stop4(); stop5(); stop6(); stop1(); };
          }, [refresh, refreshDs, refreshGo, refreshOc, refreshHc, refreshSf]);

          // 设置页开关：关闭悬浮窗时本组件保持挂载（轮询继续、数据保鲜），仅不渲染
          const [enabled, setEnabledState] = React.useState(getEnabled());
          React.useEffect(() => subscribeEnabled(setEnabledState), []);

          // 五标签顺序（与 header 显示一致）：ds → go → oc → hc → sf；往右切面板从右滑入
          const TAB_ORDER = { ds: 0, go: 1, oc: 2, hc: 3, sf: 4 };
          const switchTab = (next) => {
            setTab((prev) => {
              if (prev === next) return prev;
              setDir((TAB_ORDER[next] || 1) > (TAB_ORDER[prev] || 1) ? 'right' : 'left');
              try { localStorage.setItem(KEY_TAB, next); } catch (e) { /* 可选项 */ }
              return next;
            });
          }
          // Provider 主题色：标签激活底色/描边、标题栏细线、胶囊名、进度条共用
          const TAB_THEME = { ds: '#3b82f6', go: '#f59e0b', oc: '#8b5cf6', hc: '#ec4899', sf: '#10b981' };
          const curTheme = TAB_THEME[tab] || '#6b7280';

          // ---- 拖动/调整大小（鼠标 / 触摸 / 触控笔通用，Pointer Events）----
          // 合帧：同帧内多次 move 只提交最后一次；收尾时冲刷掉未提交的帧
          const scheduleFx = React.useCallback((fn) => {
            pendingFxRef.current = fn;
            if (fxRafRef.current) return;
            fxRafRef.current = requestAnimationFrame(() => {
              fxRafRef.current = 0;
              const f = pendingFxRef.current;
              pendingFxRef.current = null;
              if (f) f();
            });
          }, []);
          const flushFx = React.useCallback(() => {
            if (fxRafRef.current) { cancelAnimationFrame(fxRafRef.current); fxRafRef.current = 0; }
            if (pendingFxRef.current) {
              const f = pendingFxRef.current;
              pendingFxRef.current = null;
              f();
            }
          }, []);

          // 以下处理器只读 ref，不读组件 state，可以稳定挂到 window 上做兜底：
          // 即使 setPointerCapture 失败 / 事件逃逸出悬浮窗，移动和抬手也能被接住（触摸设备关键）。
          const onPointerMove = React.useCallback((e) => {
            const d = dragRef.current;
            if (!d || d.pid !== e.pointerId) return;
            scheduleFx(() => setPos(clampPos(
              d.bx + (e.clientX - d.sx), d.by - (e.clientY - d.sy),
              sizeRef.current.w, sizeRef.current.h)));
          }, [scheduleFx])

          const finishDrag = React.useCallback((e) => {
            const d = dragRef.current;
            dragRef.current = null;
            setDragging(false);
            if (!d) { flushFx(); return; }
            const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
            flushFx();
            // 触摸点击抖动比鼠标大：位移 8px 内视为点击 —— 展开态点空白=刷新；
            // 收起态点击不再展开（拖胶囊很容易落入 8px 阈值造成误展开），展开只用 ⤢ / 双击 / C / Esc
            if (Math.abs(dx) + Math.abs(dy) < 8) {
              if (!collapsedRef.current) refresh();
              return;
            }
            const clamped = clampPos(d.bx + dx, d.by - dy, sizeRef.current.w, sizeRef.current.h);
            const next = snapToEdge(clamped.x, clamped.y, sizeRef.current.w, collapsedRef.current ? 34 : sizeRef.current.h);
            setPos(next);
            try { localStorage.setItem(KEY_POS, JSON.stringify(next)); } catch (e2) { /* 可选项 */ }
          }, [refresh, flushFx]);
          const onPointerUp = finishDrag;

          // ---- 折叠/展开切换 ----
          const toggleCollapse = () => setCollapsed((p) => !p);

          // 触摸被浏览器接管（页面滚动/双指缩放等）时结束拖动，绝不把拖拽状态卡死
          const onPointerCancel = React.useCallback(() => {
            if (!dragRef.current) return;
            dragRef.current = null;
            setDragging(false);
            flushFx();
          }, [flushFx]);

          const onResizeMove = React.useCallback((e) => {
            const d = resizeRef.current;
            if (!d || d.pid !== e.pointerId) return;
            scheduleFx(() => applySize(clampSize(
              d.sw + (e.clientX - d.sx),
              d.sh - (e.clientY - d.sy))));
          }, [scheduleFx]);

          const finishResize = React.useCallback(() => {
            const d = resizeRef.current;
            resizeRef.current = null;
            setResizing(false);
            flushFx();
            if (d) { try { localStorage.setItem(KEY_SIZE, JSON.stringify(sizeRef.current)); } catch (e2) { /* 可选项 */ } }
          }, [flushFx]);
          const onResizeUp = finishResize;

          const onResizeCancel = React.useCallback(() => {
            if (!resizeRef.current) return;
            resizeRef.current = null;
            setResizing(false);
            flushFx();
          }, [flushFx]);

          // 窗口级兜底：拖动/缩放过程中把 move/up/cancel 也挂到 window，
          // 捕获丢失或指针滑出悬浮窗时拖动不中断（元素自身监听照常保留，二者互不冲突）。
          React.useEffect(() => {
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
            window.addEventListener('pointercancel', onPointerCancel);
            window.addEventListener('pointermove', onResizeMove);
            window.addEventListener('pointerup', onResizeUp);
            window.addEventListener('pointercancel', onResizeCancel);
            return () => {
              window.removeEventListener('pointermove', onPointerMove);
              window.removeEventListener('pointerup', onPointerUp);
              window.removeEventListener('pointercancel', onPointerCancel);
              window.removeEventListener('pointermove', onResizeMove);
              window.removeEventListener('pointerup', onResizeUp);
              window.removeEventListener('pointercancel', onResizeCancel);
            };
          }, [onPointerMove, onPointerUp, onPointerCancel, onResizeMove, onResizeUp, onResizeCancel]);

          // 兜底：不识别 touch-action 的老 WebView（部分国产浏览器内核）靠
          // non-passive touchmove preventDefault 阻止浏览器接管手势；不影响内部按钮的点击。
          React.useEffect(() => {
            const el = rootRef.current;
            if (!el) return;
            const guard = (e) => { if (dragRef.current || resizeRef.current) e.preventDefault(); };
            el.addEventListener('touchmove', guard, { passive: false });
            return () => el.removeEventListener('touchmove', guard);
          }, []);

          // Ctrl/⌘ + 滚轮：以 1.07 倍步进等比缩放（夹取 + 记忆 + 位置回夹由 applySizePersist 包办）。
          // React 根节点上的 wheel 是 passive 监听，preventDefault 必须走原生监听。
          React.useEffect(() => {
            const el = rootRef.current;
            if (!el) return;
            const onWheelNative = (e) => {
              if (!e.ctrlKey && !e.metaKey) return;
              e.preventDefault();
              const k = e.deltaY < 0 ? 1.07 : 1 / 1.07;
              applySizePersist({ w: sizeRef.current.w * k, h: sizeRef.current.h * k });
            };
            el.addEventListener('wheel', onWheelNative, { passive: false });
            return () => el.removeEventListener('wheel', onWheelNative);
          }, []);

          // 浏览器窗口尺寸变化时把悬浮窗尺寸/位置重新夹回视口（防小窗口下被挤出屏幕）
          React.useEffect(() => {
            const onWinResize = () => {
              const next = clampSize(sizeRef.current.w, sizeRef.current.h);
              if (next.w !== sizeRef.current.w || next.h !== sizeRef.current.h) applySize(next);
              setPos((p) => (p ? clampPos(p.x, p.y, sizeRef.current.w, sizeRef.current.h) : p));
            };
            window.addEventListener('resize', onWinResize);
            return () => window.removeEventListener('resize', onWinResize);
          }, []);

          // 关闭开关时本组件保持挂载（轮询继续、数据保鲜），仅不渲染。
          // 守卫必须放在所有 hooks 之后（useCallback/useEffect 都已声明完），保证 hook 顺序恒定。
          if (!enabled) return null;

          // ---- 拖动起点（读当前 pos，保持每渲染新闭包）----
          const onPointerDown = (e) => {
            // 多指防串扰：已有拖动/调整手势时忽略新触点
            if (dragRef.current || resizeRef.current) return;
            // 按在按钮/链接等可交互元素上时让 onClick 处理，不启动拖动
            const t = e.target;
            if (!t || typeof t.closest !== 'function') return;
            if (t.closest('button, a, input, select, textarea, [role="switch"]')) return;
            e.preventDefault();
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* 捕获失败由 window 兜底监听接住 */ }
            dragRef.current = {
              pid: e.pointerId,
              sx: e.clientX, sy: e.clientY,
              bx: pos ? pos.x : 16, by: pos ? pos.y : 168,
            };
            setDragging(true);
          };
          // 触摸长按不弹系统菜单（iOS callout / Android 上下文菜单）
          const suppressContextMenu = (e) => e.preventDefault();

          // ---- 键盘操控（点一下悬浮窗聚焦后生效）----
          const onRootKeyDown = (e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              e.preventDefault();
              const i = TAB_KEYS.indexOf(tab);
              const n = TAB_KEYS[(i + (e.key === 'ArrowRight' ? 1 : TAB_KEYS.length - 1)) % TAB_KEYS.length];
              switchTab(n);
            } else if (e.key === 'r' || e.key === 'R') {
              e.preventDefault();
              refresh();
            } else if (e.key === 'c' || e.key === 'C') {
              e.preventDefault();
              toggleCollapse();
            } else if (e.key === 'Escape' && collapsed) {
              setCollapsed(false);
            } else if (e.key === '+' || e.key === '=') {
              e.preventDefault();
              applySizePersist({ w: sizeRef.current.w * 1.07, h: sizeRef.current.h * 1.07 });
            } else if (e.key === '-' || e.key === '_') {
              e.preventDefault();
              applySizePersist({ w: sizeRef.current.w / 1.07, h: sizeRef.current.h / 1.07 });
            } else if (e.key === '0') {
              e.preventDefault();
              applySizePersist({ w: DEFAULT_SIZE.w, h: DEFAULT_SIZE.h });
            }
          };

          // ---- 调整大小起点 ----
          const onResizeDown = (e) => {
            if (dragRef.current || resizeRef.current) return;
            e.preventDefault();
            e.stopPropagation();
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* 捕获失败由 window 兜底监听接住 */ }
            resizeRef.current = { pid: e.pointerId, sx: e.clientX, sy: e.clientY, sw: sizeRef.current.w, sh: sizeRef.current.h };
            setResizing(true);
          };

          // 元素级收尾补丁：捕获被系统释放时同样重置状态
          const onLostPointerCapture = () => {
            if (!dragRef.current) return;
            dragRef.current = null;
            setDragging(false);
            flushFx();
          };
          const onResizeLostCapture = () => {
            if (!resizeRef.current) return;
            resizeRef.current = null;
            setResizing(false);
            flushFx();
          };

          // ---- 渲染 ----
          const curErr = tab === 'go' ? goErr : (tab === 'oc' ? ocErr : (tab === 'hc' ? hcErr : (tab === 'sf' ? sfErr : dsErr)));
          const curData = tab === 'go' ? go : (tab === 'oc' ? oc : (tab === 'hc' ? hc : (tab === 'sf' ? sf : ds)));
          const dotClass = curErr ? 'opencg-dot err' : (curData ? 'opencg-dot ok' : 'opencg-dot idle');

          // ---- DeepSeek 面板 ----
          const dsChildren = [];
          const dsBalanceText = ds ? (ds.currency === 'CNY' ? '¥' + ds.balance.toFixed(2) : ds.currency + ' ' + ds.balance.toFixed(2)) : '--';
          const dsTokenText = ds ? '≈' + fmtTokens(ds.estTokens) + ' tok' : '--';
          dsChildren.push(React.createElement('div', { className: 'opencg-row simple', key: 'd1' },
            React.createElement('span', { className: 'opencg-name' }, '余额'),
            React.createElement('span', { className: 'opencg-value', key: 'bv' + dsBalanceText }, dsBalanceText)));
          // 预计剩余：按官方现行价折算的有效单价 ÷ 余额；尾注当前时段 + 有效单价（高峰橙字提示）
          dsChildren.push(React.createElement('div', {
            className: 'opencg-row simple',
            key: 'd2',
            title: ds ? dsEstimateTip(ds) : '',
          },
            React.createElement('span', { className: 'opencg-name' }, '预计剩余'),
            React.createElement('span', { className: 'opencg-value', style: { fontSize: 13 } },
              dsTokenText,
              ds ? React.createElement('span', {
                style: {
                  fontSize: 10,
                  fontWeight: 400,
                  marginLeft: 4,
                  color: ds.pricePeriod === 'peak'
                    ? 'var(--dsw-alias-state-warn-primary,#f08c00)'
                    : 'var(--dsw-alias-label-secondary,#888)',
                },
              }, dsPeriodText(ds) + ' ¥' + fmtPerM(ds.pricePerMillion) + '/百万') : null)));
          if (ds && ds.model) {
            dsChildren.push(React.createElement('div', {
              className: 'opencg-row simple',
              key: 'd3',
              title: '当前默认模型；本估算按 DeepSeek 官方同族价目换算（'
                + (ds.priceLabel || ds.priceFamily || 'deepseek-flash') + '）+ 本账户用量结构折算',
            },
              React.createElement('span', { className: 'opencg-name' }, '模型'),
              React.createElement('span', { className: 'opencg-value', style: { fontSize: 12, fontWeight: 600 } }, ds.model)));
          }
          const dsStatus = dsErr ? '余额获取失败' : (ds ? '余额 ' + fmtTime(ds.fetchedAt) + ' · 每 30s 刷新' : '余额 --');
          dsChildren.push(React.createElement('div', {
            className: dsErr ? 'opencg-status err' : 'opencg-status',
            key: 'st',
            title: dsErr ? '余额: ' + dsErr : (ds ? dsEstimateTip(ds) : ''),
          }, dsStatus));

          // ---- Charm Hyper 面板 ----
          const hcChildren = [];
          const hcBalanceText = hc ? fmtHc(hc.balance) : '--';
          hcChildren.push(React.createElement('div', { className: 'opencg-row simple', key: 'h1' },
            React.createElement('span', { className: 'opencg-name' }, '余额'),
            React.createElement('span', { className: 'opencg-value', key: 'hv' + hcBalanceText },
              hcBalanceText + ' ',
              React.createElement('span', { style: { fontSize: 11, fontWeight: 600, color: 'var(--dsw-alias-label-secondary,#888)' } }, 'hc'))));
          // 折算美元口径：优先官方 balance_usd，否则按观测汇率 20 hc = $1
          const hcUsd = hc ? (hc.priceUsd != null ? hc.priceUsd : (Number.isFinite(hc.balance) ? hc.balance / 20 : null)) : null;
          hcChildren.push(React.createElement('div', { className: 'opencg-row simple', key: 'h2' },
            React.createElement('span', { className: 'opencg-name' }, '约合'),
            React.createElement('span', { className: 'opencg-value', style: { fontSize: 13 } },
              hcUsd != null ? '$' + hcUsd.toFixed(2) : '--',
              React.createElement('span', { style: { fontSize: 10, fontWeight: 400, color: 'var(--dsw-alias-label-secondary,#888)' } }, hc && hc.priceUsd == null ? '（20 hc ≈ $1）' : ''))));
          hcChildren.push(React.createElement('div', { className: 'opencg-meta', key: 'h3' },
            'Charm Hyper · 每日 ' + fmtTime(hcRefreshAtRef.current) + ' 刷新积分 · 每 30s 查余额'));
          // 积分（hypercredits）每日刷新倒计时：HH:MM:SS 递减，≤1h 变橙提示即将到点
          const hcRemainMs = Math.max(0, hcRefreshAtRef.current - hcNow);
          const hcCdText = fmtCountdown(hcRemainMs);
          hcChildren.push(React.createElement('div', {
            className: 'opencg-row simple',
            key: 'h4',
            title: '下次积分刷新 ' + fmtTime(hcRefreshAtRef.current) + '（' + hcCdText + ' 后）',
          },
            React.createElement('span', { className: 'opencg-name' }, '积分刷新'),
            React.createElement('span', {
              className: 'opencg-value',
              style: {
                fontSize: 12,
                color: hcRemainMs > 0 && hcRemainMs <= 3600000 ? 'var(--dsw-alias-state-warn-primary,#f08c00)' : undefined,
              },
            }, hcCdText,
              React.createElement('span', { style: { fontSize: 10, fontWeight: 400, color: 'var(--dsw-alias-label-secondary,#888)' } }, ' 后'))));
          const hcStatus = hcErr ? '余额获取失败' : (hc ? '余额 ' + fmtTime(hc.fetchedAt) : '余额 --');
          hcChildren.push(React.createElement('div', {
            className: hcErr ? 'opencg-status err' : 'opencg-status',
            key: 'st',
            title: hcErr ? '余额: ' + hcErr : '',
          }, hcStatus));

          // ---- Command Code GOAT 面板 ----
          const goChildren = [];
          // 剩余 % 档位配色：绿≥50% / 橙≥25% / 红<25%
          const quotaColor = (remPct) => {
            if (remPct == null) return undefined;
            if (remPct >= 50) return 'var(--dsw-alias-state-success-primary,#2f9e44)';
            if (remPct >= 25) return 'var(--dsw-alias-state-warn-primary,#f08c00)';
            return 'var(--dsw-alias-state-error-primary,#e03131)';
          };
          // 重置倒计时：resetsAt（接口实测为数字 epoch 毫秒）→ 分钟为主格式；无/已过显示 --
          const fmtReset = (resetsAt, nowMs) => {
            const t = parseTs(resetsAt);
            if (!Number.isFinite(t)) return '--';
            return fmtLeft(t - nowMs);
          };
          // 滚动窗口行：剩余 %（按档位配色）+ 进度条（已用 %）+ 已用 % + 重置倒计时（分钟为主）
          // 配额档位两行结构：上行「名称 + 剩余% + 重置倒计时」，下行「进度条 + 已用%」
          // 无数据时不渲染空进度条（只留占位），避免报错态出现「空进度条 + 已用 0%」的误导视觉
          const goQuotaRow = (key, label, w, nowMs) => {
            const usedPct = w && Number.isFinite(w.percent) ? w.percent : null;
            const remPct = usedPct != null ? Math.max(0, Math.min(100, 100 - usedPct)) : null;
            const color = quotaColor(remPct);
            const resetTs = w && w.resetsAt ? parseTs(w.resetsAt) : NaN;
            const top = React.createElement('div', { className: 'opencg-q-top' },
              React.createElement('span', { className: 'opencg-q-name' }, label),
              React.createElement('span', {
                className: 'opencg-rem',
                key: 'rp' + (remPct != null ? Math.round(remPct) : 'x'),
                style: (color && usedPct != null) ? { color: color } : undefined,
              }, remPct != null ? Math.round(remPct) + '%' : '--'),
              React.createElement('span', { className: 'opencg-reset' }, fmtReset(w && w.resetsAt, nowMs)));
            const bot = React.createElement('div', { className: 'opencg-q-bot' },
              usedPct == null ? null : React.createElement('div', {
                className: 'opencg-bar',
                role: 'progressbar',
                'aria-valuenow': String(Math.round(Math.max(0, Math.min(100, usedPct)))),
                'aria-valuemin': '0',
                'aria-valuemax': '100',
              }, React.createElement('i', { style: {
                width: Math.max(0, Math.min(100, usedPct)) + '%',
                background: color || 'var(--dsw-alias-bg-layer-2,rgba(128,128,128,.18))',
              } })),
              React.createElement('span', { className: 'opencg-used' },
                usedPct != null ? '已用 ' + Math.round(usedPct) + '%' : '--'));
            return React.createElement('div', {
              className: usedPct == null ? 'opencg-q nodata' : 'opencg-q',
              key: key,
              title: (w && w.resetsAt && Number.isFinite(resetTs))
                ? label + ' 重置 ' + fmtDateMin(resetTs) + '（' + fmtLeft(resetTs - nowMs) + ' 后）' : undefined,
            }, top, bot);
          };
          const goNow = Date.now();
          goChildren.push(goQuotaRow('g1', '5小时', go && go.fiveHour, goNow));
          goChildren.push(goQuotaRow('g2', '每周', go && go.weekly, goNow));
          // 额度刷新倒计时（分钟为主，与 Charm Hyper 页「积分刷新」行对称）：
          // 优先 5 小时滚动窗口，缺失时退回每周窗口
          const goRefreshAt = go && go.fiveHour && go.fiveHour.resetsAt
            ? { ts: parseTs(go.fiveHour.resetsAt), label: '5小时窗口' }
            : (go && go.weekly && go.weekly.resetsAt
              ? { ts: parseTs(go.weekly.resetsAt), label: '每周窗口' } : null);
          const goRefreshMs = goRefreshAt && Number.isFinite(goRefreshAt.ts) ? goRefreshAt.ts : NaN;
          const goRefreshText = Number.isFinite(goRefreshMs) ? fmtLeft(goRefreshMs - goNow) : '--';
          goChildren.push(React.createElement('div', {
            className: 'opencg-row simple',
            key: 'g4',
            title: Number.isFinite(goRefreshMs)
              ? goRefreshAt.label + ' 重置 ' + fmtDateMin(goRefreshMs) + '（' + goRefreshText + ' 后）'
              : '额度窗口未返回重置时间',
          },
            React.createElement('span', { className: 'opencg-name' }, '额度刷新'),
            React.createElement('span', { className: 'opencg-value', style: { fontSize: 12, fontWeight: 600 } },
              goRefreshText,
              React.createElement('span', { style: { fontSize: 10, fontWeight: 400, color: 'var(--dsw-alias-label-secondary,#888)' } }, ' 后'))));
          // 月度余额（美元：月度+已购+免费三池合计；字段存在哪怕全 0 也算有效）
          const goMonthlyText = go && go.monthly && go.monthly.present && Number.isFinite(go.monthly.remaining)
            ? '$' + go.monthly.remaining.toFixed(2) : '--';
          goChildren.push(React.createElement('div', { className: 'opencg-row simple', key: 'g3' },
            React.createElement('span', { className: 'opencg-name' }, '月度余额'),
            React.createElement('span', { className: 'opencg-value', style: { fontSize: 13 } }, goMonthlyText)));
          const goStatus = goErr ? '余额获取失败' : (go ? '额度 ' + fmtTime(go.fetchedAt) + ' · 每 60s 刷新' : '额度 --');
          goChildren.push(React.createElement('div', {
            className: goErr ? 'opencg-status err' : 'opencg-status',
            key: 'st',
            title: goErr ? '额度: ' + goErr : '',
          }, goStatus));

          // ---- OpenCode Go 面板 ----
          // 官方 /usage 返回 rolling / weekly / monthly 三窗口（percent = 已用 %），
          // 行结构与 GOAT 页同构，直接复用 goQuotaRow
          const ocChildren = [];
          ocChildren.push(goQuotaRow('o1', '滚动', oc && oc.rolling, goNow));
          ocChildren.push(goQuotaRow('o2', '每周', oc && oc.weekly, goNow));
          ocChildren.push(goQuotaRow('o3', '每月', oc && oc.monthly, goNow));
          // 最近一次窗口重置倒计时（滚动 → 每周 → 每月，取第一个带 resetsAt 的窗口）
          const ocWinList = [
            { k: '滚动', w: oc && oc.rolling },
            { k: '每周', w: oc && oc.weekly },
            { k: '每月', w: oc && oc.monthly },
          ];
          const ocWin = ocWinList.find((x) => x.w && Number.isFinite(parseTs(x.w.resetsAt)));
          const ocResetMs = ocWin ? parseTs(ocWin.w.resetsAt) : NaN;
          const ocResetText = Number.isFinite(ocResetMs) ? fmtLeft(ocResetMs - goNow) : '--';
          ocChildren.push(React.createElement('div', {
            className: 'opencg-row simple',
            key: 'o4',
            title: Number.isFinite(ocResetMs)
              ? ocWin.k + '窗口重置 ' + fmtDateMin(ocResetMs) + '（' + ocResetText + ' 后）'
              : '额度窗口未返回重置时间',
          },
            React.createElement('span', { className: 'opencg-name' }, '额度刷新'),
            React.createElement('span', { className: 'opencg-value', style: { fontSize: 12, fontWeight: 600 } },
              ocResetText,
              React.createElement('span', { style: { fontSize: 10, fontWeight: 400, color: 'var(--dsw-alias-label-secondary,#888)' } }, ' 后'))));
          const ocStatus = ocErr ? '额度获取失败' : (oc ? '额度 ' + fmtTime(oc.fetchedAt) + ' · 每 60s 刷新' : '额度 --');
          ocChildren.push(React.createElement('div', {
            className: ocErr ? 'opencg-status err' : 'opencg-status',
            key: 'st',
            title: ocErr ? '额度: ' + ocErr : (oc && oc.source ? '凭据来源：' + oc.source : ''),
          }, ocStatus));

          // ---- 阶跃星辰 StepFun 面板 ----
          // 主：Step Plan 订阅额度（控制台内部 RPC，见 host 注释）
          //   plan_family=2（TOKEN）→ plan_credit_rate_limit：subscription_credit_left_rate（0..1 月池剩余比例）
          //                            + subscription_credit_reset_time + credit_buckets（加油包 int64 Credit）
          //   plan_family=1（CODING，旧套餐）→ five_hour / weekly 两个窗口的剩余比例
          //   套餐名 / 状态 / 到期来自 GetStepPlanStatus.subscription（+ plan_definition.zh_display）
          // 附：按量账户余额（官方 GET /v1/accounts，元 · 充值/赠送两池）——没有控制台令牌时仍可用
          const sfPlan = sf && sf.plan ? sf.plan : null;
          const sfChildren = [];
          // 0..1 比例 → 百分比（官方左值就是比例，控制台自己也是 ×100 展示）
          const sfPct = (r) => {
            if (!Number.isFinite(r)) return '--';
            const p = r * 100;
            // 接近满额时保留两位小数（99.994% 不能被四舍五入成 100.0%，否则看不出用了多少）
            return p.toFixed((p >= 99.995 || (p > 99 && p < 100)) ? 2 : 1) + '%';
          };
          // Credit 数量：1M Credit = ¥1（官方口径），≥1e6 用 M 记
          const sfCredit = (n) => {
            if (!Number.isFinite(n)) return '--';
            const m = n / 1e6;
            if (m >= 1000) return (Math.round(m * 10) / 10).toFixed(1) + 'M';
            if (m >= 10) return (Math.round(m * 10) / 10) + 'M';
            return (Math.round(m * 100) / 100) + 'M';
          };
          const sfPlanName = sfPlan && sfPlan.name ? sfPlan.name : null;
          const sfPlanSub = sfPlan ? ((sfPlan.status === 1 ? '生效中' : (sfPlan.status === 3 ? '取消待生效' : (sfPlan.status === 2 ? '已取消' : null)))) : null;
          // 第 1 行：订阅额度（月池剩余比例；旧套餐则显示 5 小时窗口）
          if (sfPlan && sfPlan.kind === 'credit') {
            sfChildren.push(React.createElement('div', {
              className: 'opencg-row simple',
              key: 'f1',
              title: 'Step Plan 订阅额度（Credit 月池）\n控制台 QueryStepPlanRateLimit → plan_credit_rate_limit.subscription_credit_left_rate = 当月剩余比例\n当月额度月末清零、不结转；1M Credit = ¥1',
            },
              React.createElement('span', { className: 'opencg-name' }, '订阅额度'),
              React.createElement('span', { className: 'opencg-value', key: 'fp' + sfPct(sfPlan.credit && sfPlan.credit.leftRate) },
                sfPct(sfPlan.credit && sfPlan.credit.leftRate),
                sfPlanName ? React.createElement('span', {
                  style: { fontSize: 10, fontWeight: 400, marginLeft: 4, color: 'var(--dsw-alias-label-secondary,#888)' },
                }, sfPlanName) : null)));
          } else if (sfPlan) {
            sfChildren.push(React.createElement('div', {
              className: 'opencg-row simple',
              key: 'f1',
              title: 'Step Plan 订阅额度（旧套餐窗口）\nplan_family=' + String(sfPlan.family) + '，按 5 小时 / 每周窗口限流',
            },
              React.createElement('span', { className: 'opencg-name' }, '5小时额度'),
              React.createElement('span', { className: 'opencg-value' }, sfPct(sfPlan.window && sfPlan.window.fiveHourLeftRate))));
            sfChildren.push(React.createElement('div', {
              className: 'opencg-row simple', key: 'f1b',
              title: '每周窗口剩余比例',
            },
              React.createElement('span', { className: 'opencg-name' }, '每周额度'),
              React.createElement('span', { className: 'opencg-value' }, sfPct(sfPlan.window && sfPlan.window.weeklyLeftRate))));
          } else {
            sfChildren.push(React.createElement('div', {
              className: 'opencg-row simple',
              key: 'f1',
              title: sf && sf.planError ? 'Step Plan 订阅额度未取到：' + sf.planError : 'Step Plan 订阅额度未取到',
            },
              React.createElement('span', { className: 'opencg-name' }, '订阅额度'),
              React.createElement('span', { className: 'opencg-value', style: { fontSize: 12, fontWeight: 500 } },
                '--',
                React.createElement('span', {
                  style: { fontSize: 10, fontWeight: 400, marginLeft: 4, color: 'var(--dsw-alias-label-secondary,#888)' },
                }, '未配置控制台令牌'))));
          }
          // 第 2 行：月池重置时间（Credit 家族）或窗口重置
          const sfResetTs = sfPlan
            ? parseTs(sfPlan.kind === 'credit'
              ? (sfPlan.credit && sfPlan.credit.resetTime)
              : (sfPlan.window && (sfPlan.window.fiveHourResetTime || sfPlan.window.weeklyResetTime)))
            : NaN;
          if (sfPlan) {
            sfChildren.push(React.createElement('div', {
              className: 'opencg-row simple',
              key: 'f2',
              title: Number.isFinite(sfResetTs)
                ? (sfPlan.kind === 'credit' ? '订阅月池重置时间：' : '额度窗口重置时间：') + fmtDateMin(sfResetTs) + '（' + fmtLeft(sfResetTs - Date.now()) + ' 后）'
                : '接口未返回重置时间',
            },
              React.createElement('span', { className: 'opencg-name' }, sfPlan.kind === 'credit' ? '月池重置' : '窗口重置'),
              React.createElement('span', { className: 'opencg-value', style: { fontSize: 12, fontWeight: 600 } },
                Number.isFinite(sfResetTs) ? fmtDateMin(sfResetTs) : '--',
                Number.isFinite(sfResetTs) ? React.createElement('span', {
                  style: { fontSize: 10, fontWeight: 400, color: 'var(--dsw-alias-label-secondary,#888)' },
                }, '（' + fmtLeft(sfResetTs - Date.now()) + '）') : null)));
          }
          // 第 3 行：月池余额（credit_buckets 里 type=SUBSCRIPTION(1) 的剩余 Credit，1M Credit = ¥1）
          if (sfPlan && sfPlan.kind === 'credit') {
            const bks = (sfPlan.credit && sfPlan.credit.buckets) ? sfPlan.credit.buckets : [];
            const subs = bks.filter((b) => b && b.type === 1 && Number.isFinite(b.residual));
            const subResidual = subs.reduce((s, b) => s + b.residual, 0);
            const subTotal = subs.reduce((s, b) => (Number.isFinite(b.total) ? s + b.total : s), 0);
            const usedCredit = (subTotal > 0 && subResidual >= 0) ? subTotal - subResidual : null;
            sfChildren.push(React.createElement('div', {
              className: 'opencg-row simple',
              key: 'f3a',
              title: subs.length
                ? '当月 Credit 月池余额（credit_buckets type=SUBSCRIPTION）\n'
                  + '· 剩余 ' + sfCredit(subResidual) + ' Credit ≈ ¥' + Math.round(subResidual / 1e6) + '（1M Credit = ¥1）\n'
                  + '· 月池共 ' + sfCredit(subTotal) + ' Credit'
                  + (usedCredit === null ? '' : '，已用 ' + sfCredit(usedCredit) + ' Credit ≈ ¥' + (Math.round(usedCredit / 1e3) / 1e3).toFixed(3))
                  + '\n· 月末清零不结转，加油包按各自 30 天到期扣减'
                : '接口未返回 type=SUBSCRIPTION 的 credit_buckets',
            },
              React.createElement('span', { className: 'opencg-name' }, '月池余额'),
              React.createElement('span', { className: 'opencg-value', style: { fontSize: 13 } },
                sfCredit(subResidual),
                Number.isFinite(subResidual) ? React.createElement('span', {
                  style: { fontSize: 10, fontWeight: 400, color: 'var(--dsw-alias-label-secondary,#888)' },
                }, ' ≈¥' + Math.round(subResidual / 1e6)) : null)));
          }
          // 第 4 行：加油包（credit_buckets 里 type=TOPUP(2) 的剩余 Credit 合计）
          if (sfPlan && sfPlan.kind === 'credit') {
            const topups = (sfPlan.credit && sfPlan.credit.buckets ? sfPlan.credit.buckets : []).filter((b) => b && b.type === 2 && Number.isFinite(b.residual));
            const topupSum = topups.reduce((s, b) => s + b.residual, 0);
            sfChildren.push(React.createElement('div', {
              className: 'opencg-row simple',
              key: 'f3',
              title: topups.length
                ? '加油包剩余 Credit（credit_buckets type=TOPUP，共 ' + topups.length + ' 包）\n' + topups.map((b) => '· 剩余 ' + sfCredit(b.residual) + ' / 共 ' + sfCredit(b.total) + (Number.isFinite(parseTs(b.expireAt)) ? '，' + fmtDateMin(parseTs(b.expireAt)) + ' 到期' : '')).join('\n')
                : '当前没有加油包（当月月池用尽后可加购）',
            },
              React.createElement('span', { className: 'opencg-name' }, '加油包'),
              React.createElement('span', { className: 'opencg-value', style: { fontSize: 12, fontWeight: 600 } },
                topups.length ? sfCredit(topupSum) : '--',
                topups.length ? React.createElement('span', {
                  style: { fontSize: 10, fontWeight: 400, color: 'var(--dsw-alias-label-secondary,#888)' },
                }, ' ≈¥' + Math.round(topupSum / 1e6)) : null)));
          }
          // 第 5 行：套餐（名称已在订阅额度行尾注，这里给状态 / 到期）
          if (sfPlan && (sfPlanSub || Number.isFinite(parseTs(sfPlan.expiredAt)))) {
            const expTs = parseTs(sfPlan.expiredAt);
            sfChildren.push(React.createElement('div', {
              className: 'opencg-row simple',
              key: 'f4',
              title: 'GetStepPlanStatus.subscription：'
                + (sfPlanSub ? '状态 ' + sfPlanSub : '状态 --')
                + '，到期 ' + (Number.isFinite(expTs) ? fmtDateMin(expTs) : '--')
                + (sfPlan.autoRenew === null ? '' : '，' + (sfPlan.autoRenew ? '自动续费' : '不自动续费')),
            },
              React.createElement('span', { className: 'opencg-name' }, '套餐'),
              React.createElement('span', { className: 'opencg-value', style: { fontSize: 12 } },
                sfPlanSub || '--',
                Number.isFinite(expTs) ? React.createElement('span', {
                  style: { fontSize: 10, fontWeight: 400, color: 'var(--dsw-alias-label-secondary,#888)' },
                }, ' 至 ' + fmtDateMin(expTs)) : null)));
          }
          // 第 6 行：按量账户余额（官方 GET /v1/accounts）
          const sfType = (t) => (t === 'prepaid' ? '预付费' : (t === 'postpaid' ? '后付费' : (t || null)));
          const sfAmount = (v) => (Number.isFinite(v) ? '¥' + v.toFixed(2) : '--');
          const sfBalanceText = (sf && Number.isFinite(sf.balance)) ? '¥' + sf.balance.toFixed(2) : '--';
          sfChildren.push(React.createElement('div', {
            className: 'opencg-row simple',
            key: 'f5',
            title: '按量计费账户余额（官方 GET api.stepfun.com/v1/accounts）\n'
              + 'balance = 当前账户可用余额（元）· 总充值 ' + sfAmount(sf && sf.cashBalance)
              + ' · 总赠送 ' + sfAmount(sf && sf.voucherBalance)
              + (sf && sf.accountError ? '\n账户余额未取到：' + sf.accountError : ''),
          },
            React.createElement('span', { className: 'opencg-name' }, '按量余额'),
            React.createElement('span', { className: 'opencg-value', style: { fontSize: 13 } },
              sfBalanceText,
              sf && sfType(sf.accountType) ? React.createElement('span', {
                style: { fontSize: 10, fontWeight: 400, marginLeft: 4, color: 'var(--dsw-alias-label-secondary,#888)' },
              }, sfType(sf.accountType)) : null)));
          const sfErrAll = sfErr || (sf && !sf.ok ? (sf.error || '获取失败') : null);
          const sfStatus = sfErrAll ? '获取失败' : (sf ? (sf.plan ? '订阅额度 ' : '按量余额 ') + fmtTime(sf.plan && sf.plan.fetchedAt ? sf.plan.fetchedAt : sf.fetchedAt) + ' · 每 60s 刷新' : '额度 --');
          sfChildren.push(React.createElement('div', {
            className: sfErrAll ? 'opencg-status err' : 'opencg-status',
            key: 'st',
            title: sfErrAll
              ? '阶跃星辰: ' + sfErrAll
              : '阶跃星辰 Step Plan 订阅额度来自控制台 RPC（GetStepPlanStatus / QueryStepPlanRateLimit），'
                + '按量余额来自官方 GET /v1/accounts · 计费 1 元 = 100 万 Credit',
          }, sfStatus));

          const paneChildren = tab === 'go' ? goChildren : (tab === 'oc' ? ocChildren : (tab === 'hc' ? hcChildren : (tab === 'sf' ? sfChildren : dsChildren)));
          const pane = React.createElement('div', {
            key: tab,
            className: 'opencg-pane ' + dir + (tab === 'sf' ? ' compact' : ''),
          }, paneChildren);

          const body = React.createElement('div', { className: 'opencg-body', key: 'body' }, pane);

          // ---- 收起态胶囊：当前标签的关键数值一眼可读 ----
          let pillVal = '--';
          if (tab === 'ds') pillVal = ds ? dsBalanceText : (dsErr ? '获取失败' : '--');
          else if (tab === 'go') pillVal = (go && go.fiveHour && Number.isFinite(go.fiveHour.percent)) ? '剩' + Math.max(0, Math.round(100 - go.fiveHour.percent)) + '%' : (goErr ? '获取失败' : '--');
          else if (tab === 'oc') pillVal = (oc && oc.rolling && Number.isFinite(oc.rolling.percent)) ? '剩' + Math.max(0, Math.round(100 - oc.rolling.percent)) + '%' : (ocErr ? '获取失败' : '--');
          else if (tab === 'hc') pillVal = hc ? fmtHc(hc.balance) + ' hc' : (hcErr ? '获取失败' : '--');
          else if (tab === 'sf') pillVal = sfPlan ? (sfPlan.kind === 'credit' ? sfPct(sfPlan.credit && sfPlan.credit.leftRate) : sfPct(sfPlan.window && sfPlan.window.fiveHourLeftRate)) : ((sf && Number.isFinite(sf.balance)) ? sfBalanceText : (sfErr ? '获取失败' : '--'));

          // 品牌轨：纵向服务商字母标，激活项带主题色底 + 轨左缘指示条；状态点置顶、收起键置底
          const mkTab = (key, mono, tabTip) => React.createElement('button', {
            type: 'button',
            role: 'tab',
            'aria-selected': tab === key,
            className: tab === key ? 'ocg-rail-btn active' : 'ocg-rail-btn',
            title: tabTip,
            onClick: () => switchTab(key),
            onPointerDown: (e) => e.stopPropagation(),
          }, mono);
          const rail = React.createElement('div', { className: 'ocg-rail', key: 'rail', role: 'tablist', 'aria-label': '余额服务商' },
            React.createElement('span', { className: 'ocg-rail-ink' }),
            React.createElement('span', { className: dotClass }),
            mkTab('ds', 'DeepSeek', 'DeepSeek 余额'),
            mkTab('go', 'GOAT', 'Command Code GOAT 额度'),
            mkTab('oc', 'OpenCode', 'OpenCode Go 额度（滚动 / 每周 / 每月）'),
            mkTab('hc', 'Hyper', 'Charm Hyper 余额（hypercredits）'),
            mkTab('sf', 'StepFun', '阶跃星辰 StepFun：Step Plan 订阅额度（Credit 月池）+ 按量账户余额（元）'),
            React.createElement('span', { className: 'ocg-rail-spacer' }),
            React.createElement('button', {
              type: 'button',
              className: 'opencg-collapse',
              title: '收起为迷你胶囊（双击标题栏 / C 亦可）',
              'aria-label': '收起悬浮窗',
              onPointerDown: (e) => e.stopPropagation(),
              onClick: (e) => { e.stopPropagation(); toggleCollapse(); },
            }, '−'),
          );
          const pill = React.createElement('span', { className: 'opencg-pill' },
            React.createElement('span', { className: 'opencg-pill-name' }, TAB_SHORT[tab]),
            React.createElement('span', { className: 'opencg-pill-val', key: 'pv' + pillVal }, pillVal));
          const expandBtn = React.createElement('button', {
            type: 'button',
            className: 'opencg-pill-btn',
            title: '展开面板（双击 / C / Esc）',
            'aria-label': '展开面板',
            onPointerDown: (e) => e.stopPropagation(),
            onClick: (e) => { e.stopPropagation(); setCollapsed(false); },
          }, '⤢');
          const TAB_FULL = { ds: 'DeepSeek', go: 'Command Code GOAT', oc: 'OpenCode Go', hc: 'Charm Hyper', sf: 'StepFun' };
          const header = React.createElement('div', {
            className: 'opencg-header', key: 'h',
            onDoubleClick: (e) => {
              const t = e.target;
              if (t && typeof t.closest === 'function' && t.closest('button')) return;
              toggleCollapse();
            },
          },
            collapsed ? pill : React.createElement('span', { className: 'ocg-prod-name', key: tab }, TAB_FULL[tab] || tab),
            collapsed ? expandBtn : React.createElement('button', {
              type: 'button',
              className: 'opencg-refresh' + (loading ? ' loading' : ''),
              title: '立即刷新（R）',
              'aria-label': '立即刷新',
              'aria-busy': loading,
              onPointerDown: (e) => e.stopPropagation(),
              onClick: (e) => { e.stopPropagation(); refresh(); },
            }, '↻'),
          );

          const hint = React.createElement('div', { className: 'opencg-hint-text', key: 'tip' },
            '拖动移动 · 双击标题栏收起 · Ctrl+滚轮缩放 · ←→ 切换 · R 刷新 · 0 复位');

          let tip = '余额悬浮窗';
          if (tab === 'hc') {
            if (hc) {
              tip = 'Charm Hyper 余额 ' + fmtHc(hc.balance) + ' hc'
                + (hcUsd != null ? '（约 $' + hcUsd.toFixed(2) + '）' : '')
                + ' · 下次积分刷新 ' + fmtTime(hcRefreshAtRef.current) + '（' + hcCdText + ' 后）';
              if (hc.stale) tip += ' · 数据过期';
            } else if (hcErr) tip = 'Charm Hyper 余额获取失败：' + hcErr + '（点击重试）';
          } else if (tab === 'go') {
            if (go) {
              const remOf = (w) => (w && Number.isFinite(w.percent)) ? Math.round(100 - w.percent) + '%' : '--';
              tip = 'Command Code GOAT 额度 · 5小时 ' + remOf(go.fiveHour)
                + ' · 每周 ' + remOf(go.weekly)
                + (go.monthly && go.monthly.present && Number.isFinite(go.monthly.remaining)
                  ? ' · 月度余额 $' + go.monthly.remaining.toFixed(2) : '');
              if (go.stale) tip += ' · 数据过期';
            } else if (goErr) tip = 'Command Code GOAT 额度获取失败：' + goErr + '（点击重试）';
          } else if (tab === 'oc') {
            if (oc) {
              const remOf = (w) => (w && Number.isFinite(w.percent)) ? Math.round(100 - w.percent) + '%' : '--';
              tip = 'OpenCode Go 额度 · 滚动 ' + remOf(oc.rolling)
                + ' · 每周 ' + remOf(oc.weekly)
                + ' · 每月 ' + remOf(oc.monthly);
              if (oc.stale) tip += ' · 数据过期';
            } else if (ocErr) tip = 'OpenCode Go 额度获取失败：' + ocErr + '（点击重试）';
          } else if (tab === 'sf') {
            if (sf) {
              if (sfPlan && sfPlan.kind === 'credit') {
                tip = '阶跃星辰 Step Plan 订阅额度 剩余 ' + sfPct(sfPlan.credit && sfPlan.credit.leftRate)
                  + (sfPlanName ? ' · ' + sfPlanName : '')
                  + (Number.isFinite(sfResetTs) ? ' · 月池重置 ' + fmtDateMin(sfResetTs) + '（' + fmtLeft(sfResetTs - Date.now()) + ' 后）' : '')
                  + ' · 按量余额 ' + sfBalanceText;
              } else if (sfPlan) {
                tip = '阶跃星辰 Step Plan 旧套餐窗口 · 5 小时 ' + sfPct(sfPlan.window && sfPlan.window.fiveHourLeftRate)
                  + ' · 每周 ' + sfPct(sfPlan.window && sfPlan.window.weeklyLeftRate)
                  + ' · 按量余额 ' + sfBalanceText;
              } else {
                tip = '阶跃星辰按量余额 ' + sfBalanceText
                  + (sf.planError ? ' · 订阅额度未取到：' + sf.planError : '');
              }
              if (sf.stale) tip += ' · 数据过期';
            } else if (sfErr) tip = '阶跃星辰 StepFun 获取失败：' + sfErr + '（点击重试）';
          } else {
            if (ds) {
              tip = 'DeepSeek 余额 ' + dsBalanceText + (ds.model ? ' · ' + ds.model : '')
                + ' · 预计剩余 ' + fmtTokens(ds.estTokens) + ' tokens（' + dsPeriodText(ds) + ' ¥' + fmtPerM(ds.pricePerMillion) + '/百万估算）';
              if (ds.stale) tip += ' · 数据过期';
            } else if (dsErr) tip = 'DeepSeek 余额获取失败：' + dsErr + '（点击重试）';
          }

          const resizeHandle = React.createElement('div', {
            key: 'rz',
            className: 'opencg-resize',
            title: '拖动调整大小（Ctrl+滚轮亦可）· 双击恢复默认',
            'aria-label': '调整大小',
            onDoubleClick: () => applySizePersist({ w: DEFAULT_SIZE.w, h: DEFAULT_SIZE.h }),
            onPointerDown: onResizeDown,
            onPointerMove: onResizeMove,
            onPointerUp: onResizeUp,
            onPointerCancel: onResizeCancel,
            onLostPointerCapture: onResizeLostCapture,
            onContextMenu: suppressContextMenu,
          });

          // 防呆：渲染位置实时夹进视口，任何越界旧坐标都会被拉回来，不会整窗隐形。
          const p = pos === null ? null : clampPos(pos.x, pos.y, size.w, size.h);
          const main = React.createElement('div', { className: 'ocg-main', key: 'main' }, header, body, hint);
          return React.createElement('div', {
            ref: rootRef,
            // collapsed 与 dragging/resizing 独立叠加 —— 之前拖动会丢掉 collapsed 类，胶囊一拖就在半路上展开
            className: (collapsed ? 'opencg collapsed' : 'opencg') + (dragging ? ' dragging' : '') + (resizing && !collapsed ? ' resizing' : ''),
            style: {
              left: (p ? p.x : 16) + 'px',
              bottom: (p ? p.y : 168) + 'px',
              width: size.w + 'px',
              height: size.h + 'px',
              ['--opencg-accent']: curTheme,
              ['--opencg-accent-soft']: curTheme + '12',
              ['--opencg-accent-ring']: curTheme + '40',
              ['--opencg-ink']: String(TAB_ORDER[tab] || 0),
              // 内联兜底：即使样式表未及时注入，触摸手势也绝不交给浏览器滚动/缩放
              touchAction: 'none',
              WebkitUserSelect: 'none',
            },
            title: tip,
            'aria-label': tip,
            tabIndex: 0,
            onKeyDown: onRootKeyDown,
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerCancel,
            onLostPointerCapture,
            onContextMenu: suppressContextMenu,
          }, rail, main, resizeHandle);
        },
      )), 'opencode-go-monitor: overlay slot');
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});