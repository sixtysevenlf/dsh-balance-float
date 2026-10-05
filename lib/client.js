/**
 * 余额悬浮窗 —— client 半
 * v3 重新设计 —— Side Rail Instrument：左侧纵向品牌侧栏（状态点 + 六服务商全名按钮 +
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
 *   /api/bailian/plan              — 阿里云百炼 Token Plan：5 小时 / 每周窗口 + 月度 Credits（60s 轮询）
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
  /* 六个品牌按钮 + 状态点 + 收起键在最小窗高下可能放不下：轨内滚动，绝不裁掉底部的收起键 */
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
}
.ocg-rail::-webkit-scrollbar { width: 0; height: 0; }
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
/* ═══ 设置页「余额悬浮窗 · 标签页管理」 ═══
   增删标签页的唯一入口：面板里不放增删控件（悬浮窗窄，且 API key 该在设置页填）。 */
.ocg-addform {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 7px 8px;
  margin-top: 6px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.22));
  border-radius: 9px;
  background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.06));
  cursor: default;
}
.ocg-addform-grid { display: flex; gap: 4px; }
.ocg-addform-grid .ocg-in.sm { flex: 1 1 0; min-width: 0; }
.ocg-in {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.26));
  border-radius: 6px;
  background: var(--dsw-alias-bg-overlay, #fff);
  color: var(--dsw-alias-label-primary, #222);
  font: inherit;
  font-size: 11px;
  padding: 4px 6px;
  min-width: 0;
}
.ocg-in:focus { outline: 2px solid rgba(0,122,255,.5); outline-offset: 0; }
.ocg-addform-err {
  font-size: 10px;
  line-height: 1.4;
  color: var(--dsw-alias-state-error-primary, #e03131);
  word-break: break-all;
}
.ocg-addform-actions { display: flex; gap: 5px; justify-content: flex-end; }
.ocg-btn {
  border: none;
  border-radius: 6px;
  background: var(--opencg-accent, #3b82f6);
  color: #fff;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 11px;
  cursor: pointer;
  transition: filter .15s ease;
}
.ocg-btn:hover { filter: brightness(1.08); }
.ocg-btn:disabled { opacity: .55; cursor: default; }
.ocg-btn.ghost {
  background: transparent;
  color: var(--dsw-alias-label-secondary, #888);
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.26));
}
/* 设置页：标签页管理块 */
.ocg-set-block { padding: 12px 0; min-width: 0; }
.ocg-set-block .ocg-set-title { margin-bottom: 2px; }
.ocg-set-block .ocg-set-desc { margin-bottom: 10px; }
.ocg-tablist {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
  max-height: 340px;
  overflow-y: auto;
}
.ocg-tabrow {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 6px 8px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18));
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.05));
  min-width: 0;
}
.ocg-tabrow-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.ocg-tabrow-copy { flex: 1 1 auto; min-width: 0; }
.ocg-tabrow-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #222);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ocg-tabrow-kind {
  font-size: 10px;
  font-weight: 400;
  color: var(--dsw-alias-label-secondary, #888);
  margin-left: 6px;
}
.ocg-tabrow-sub {
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary, #888));
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ocg-tabrow-actions { display: flex; gap: 4px; flex: none; }
.ocg-btn.sm { font-size: 10.5px; padding: 3px 9px; }
.ocg-btn.danger {
  background: transparent;
  color: var(--dsw-alias-state-error-primary, #e03131);
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary, #e03131) 40%, transparent);
}
.ocg-btn.danger:hover { background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #e03131) 12%, transparent); filter: none; }
.ocg-set-msg { font-size: 11px; line-height: 1.5; margin-bottom: 8px; color: var(--dsw-alias-state-success-primary, #2f9e44); }
.ocg-set-msg.err { color: var(--dsw-alias-state-error-primary, #e03131); }
.ocg-addform.wide { margin: 10px 0 0; max-width: 560px; }
.ocg-addform.wide .ocg-in { font-size: 12px; padding: 5px 7px; }
.ocg-addform.wide .ocg-addform-grid .ocg-in.sm { flex: 1 1 0; }
/* ── 懒人化：贴官网链接自动识别 ── */
.ocg-quickadd {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  margin-bottom: 12px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.22));
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.06));
  max-width: 640px;
}
.ocg-quickadd-row { display: flex; gap: 6px; align-items: center; }
.ocg-quickadd-row .ocg-in { flex: 1 1 auto; font-size: 12px; padding: 5px 8px; }
.ocg-quickadd-row .ocg-btn { flex: none; white-space: nowrap; }
.ocg-found {
  margin-top: 4px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-overlay, #fff);
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18));
}
.ocg-found-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 11.5px;
  color: var(--dsw-alias-label-secondary, #888);
}
.ocg-found-badge {
  font-size: 10.5px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid currentColor;
}
.ocg-found-badge.high { color: var(--dsw-alias-state-success-primary, #2f9e44); }
.ocg-found-badge.mid { color: var(--dsw-alias-state-warn-primary, #f08c00); }
.ocg-found-badge.low { color: var(--dsw-alias-label-secondary, #888); }
.ocg-found-mode { font-weight: 600; color: var(--dsw-alias-label-primary, #222); }
.ocg-found-notes {
  margin: 6px 0 0;
  padding-left: 18px;
  font-size: 10.5px;
  line-height: 1.55;
  color: var(--dsw-alias-label-secondary, #888);
}
.ocg-btn.danger.sm.confirm { background: var(--dsw-alias-state-error-primary, #e03131); color: #fff; }
.ocg-fld { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.ocg-fld-label { font-size: 10.5px; color: var(--dsw-alias-label-secondary, #888); }
.ocg-fld-hint { font-size: 10px; line-height: 1.4; color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary, #888)); }
/* 行头：名称 + 状态徽标同一行 */
.ocg-tabrow-head { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
.ocg-tabrow-head .ocg-tabrow-name { flex: 0 1 auto; }
.ocg-set-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 2px;
}
.ocg-set-file {
  font-size: 10.5px;
  line-height: 1.4;
  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary, #888));
  word-break: break-all;
}
/* 品牌轨依次入场（仅在挂载时跑一次）。
   第 1 个孩子是墨条、第 2 个是状态点，所以标签按钮从 :nth-child(3) 起；这里只写到前 8 个，
   更多标签页只是不再有错峰延迟，不影响功能。 */
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
    // 被隐藏的标签页 id 列表（内置页与自定义页都适用）
    const KEY_HIDDEN = 'dsh-opencode-go-monitor-hidden-tabs';
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
    // ════════════════════════════════════════════════════════════════════════════
    // 标签页注册表 —— 加/删标签页的唯一入口
    // ════════════════════════════════════════════════════════════════════════════
    // 下面这张表是六个内置标签页的**唯一事实源**。floating 面板的顺序、rail 按钮、
    // 切换动画方向、主题色、胶囊短名、标题栏全名、键盘环绕顺序、持久化白名单、
    // 以及「墨条下标」全部由它派生——想删一个页就把对应的一整块注释掉；
    // 想加一个内置页就复制一份改 5 个字段，然后把它的 render 分支接上（见 README
    // 「加一个内置标签页」）。
    //
    // 运行时新增的第三方接口页（自定义页）不在这张表里：它们由 host 半持久化、
    // 由 client 半在运行时追加进来（见 CUSTOM 段）。
    //
    // 字段：
    //   id     标签键（也用作 localStorage 记忆值，别用中文/空格）
    //   short  rail 上的按钮文字 + 收起态胶囊名
    //   full   标题栏全名 + 悬浮说明兜底
    //   theme  服务商主题色（激活底色/描边/墨条/进度条共用）
    //   tip    rail 按钮 title（悬浮说明，短标签不丢全名）
    const TAB_DEFS = [
      { id: 'ds', short: 'DeepSeek', full: 'DeepSeek', theme: '#3b82f6', tip: 'DeepSeek 余额' },
      { id: 'go', short: 'GOAT', full: 'Command Code GOAT', theme: '#f59e0b', tip: 'Command Code GOAT 额度' },
      { id: 'oc', short: 'OpenCode', full: 'OpenCode Go', theme: '#8b5cf6', tip: 'OpenCode Go 额度（滚动 / 每周 / 每月）' },
      { id: 'sf', short: 'StepFun', full: 'StepFun', theme: '#10b981', tip: '阶跃星辰 StepFun：Step Plan 订阅额度（Credit 月池）+ 按量账户余额（元）' }
    ];

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

    const FALLBACK_THEME = '#6b7280';

    // ════════════════════════════════════════════════════════════════════════════
    // 标签页注册表（可运行时增删）—— 内置六个 + 自定义第三方接口页
    // ════════════════════════════════════════════════════════════════════════════
    const customTabs = [];            // [{ id, name, short, theme, custom:true, balance:{...}, windows:[...] }]
    const tabListeners = new Set();
    const subscribeTabs = (l) => { tabListeners.add(l); return () => { tabListeners.delete(l); }; };

    // ── 删掉 / 恢复内置标签页 ────────────────────────────────────────────────
    // 内置页的「删除」不改代码（改了要重新装插件），而是把 id 记进 KEY_HIDDEN：
    // 该页从此不出现在品牌轨与轮询里，但随时可以在设置页把它恢复回来。
    // 同一个列表也用于自定义页（删掉 = 不再显示，配置仍留在 host 侧，可再启用）。
    // 没有 host 参与，纯前端、可逆——这一点刻意如此：删错了不该丢配置。
    const hiddenIds = (() => {
      try {
        const raw = localStorage.getItem(KEY_HIDDEN);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
      } catch (e) { return []; }
    })();
    const isHidden = (id) => hiddenIds.indexOf(id) >= 0;

    /**
     * 删掉（hide=true）或恢复（hide=false）一个标签页。
     * 防呆：不允许删到「一个都不剩」——悬浮窗会变成一个没有任何页的空壳，
     * 而用户此时已经看不到品牌轨（也就无从点回来）。返回 false 表示被拦下。
     */
    const setHidden = (id, hide) => {
      const at = hiddenIds.indexOf(id);
      if (hide && at < 0) {
        // 试算删除后的剩余页数，为 0 则拒绝
        const remain = tabRegistry().filter((t) => t.id !== id).length;
        if (remain <= 0) return false;
        hiddenIds.push(id);
      } else if (!hide && at >= 0) {
        hiddenIds.splice(at, 1);
      } else {
        return true;   // 状态本来就对，无需改动
      }
      try { localStorage.setItem(KEY_HIDDEN, JSON.stringify(hiddenIds)); } catch (e) { /* 可选项 */ }
      for (const l of [...tabListeners]) l();
      return true;
    };
    // 自定义页的「停用」走得是 host 配置（disabled），与隐藏区分开：
    //   停用 = 保留配置与 key，只是不再出现（可随时启用）
    //   删除 = 连配置与 key 一起从磁盘删掉
    const customEnabled = (t) => !t.disabled;

    /** 当前生效的标签页列表（全部注册表条目的唯一入口）。 */
    const tabRegistry = () => {
      const out = [];
      for (const d of TAB_DEFS) if (!isHidden(d.id)) out.push(d);
      for (const t of customTabs) if (!isHidden(t.id) && customEnabled(t)) out.push(t);
      return out;
    };
    const tabIndex = (id) => { const list = tabRegistry(); for (let i = 0; i < list.length; i++) if (list[i].id === id) return i; return -1; };
    const tabById = (id) => { const i = tabIndex(id); return i >= 0 ? tabRegistry()[i] : null; };
    const tabShort = (id) => { const d = tabById(id); return d ? (d.short || d.name || id) : (id || ''); };
    const tabFull = (id) => { const d = tabById(id); return d ? (d.name || d.short || id) : (id || ''); };
    const tabTheme = (id) => { const d = tabById(id); return (d && d.theme) ? d.theme : FALLBACK_THEME; };
    const tabOrder = (id) => { const i = tabIndex(id); return i < 0 ? 0 : i; };
    const tabKeys = () => tabRegistry().map((t) => t.id);
    const isCustomTab = (id) => customTabs.some((t) => t.id === id);

    // 自定义页状态刷新（列表变化即通知面板重渲染）
    const applyCustomTabs = (list) => {
      customTabs.length = 0;
      for (const t of list || []) if (t && t.id) customTabs.push(t);
      for (const l of [...tabListeners]) l();
    };
    // 配置文件绝对路径由 host 在 GET /api/monitor/tabs 里回传，这里缓存一份给设置页显示：
    // 用户能直接看到「API key 明文存在哪个文件」，而不是只被告知「存在 host」。
    let configFileHint = null;
    /** 从 host 拉取自定义页列表（host 未重启时该端点 404 → 静默降级为空表）。 */
    const loadCustomTabs = async () => {
      try {
        const res = await fetch('/api/monitor/tabs');
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.ok && Array.isArray(data.tabs)) {
          if (typeof data.file === 'string' && data.file) configFileHint = data.file;
          applyCustomTabs(data.tabs);
        }
      } catch (e) { /* host 半未更新/未重启：自定义页功能静默不可用 */ }
    };

    /**
     * 调 host 的任意 JSON 端点，并把失败原因整成一句能给人看的话。
     * 为什么不能直接 `.then(r => r.json())`：host 半没更新时该路径是 404 且响应体不是 JSON，
     * 那样会把 `Unexpected token` 之类的解析异常原文当成「保存失败原因」显示给用户。
     */
    const customTabsApiRaw = async (path, payload) => {
      let res;
      try {
        res = await fetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload || {}),
        });
      } catch (e) {
        return { ok: false, error: '无法连接本地服务：' + String((e && e.message) || e) };
      }
      let data = null;
      try { data = await res.json(); } catch (e) { /* 非 JSON（多为 host 半未更新）→ 走下面的兜底 */ }
      if (data && data.ok) return data;
      if (data && data.error) return { ok: false, error: data.error };
      return {
        ok: false,
        error: res.ok
          ? '本地服务返回了无法解析的响应'
          : '本地服务不可用（HTTP ' + res.status + '）——host 半是否还没重启？改完 lib/index.js 需要重启 DSH',
      };
    };

    /** 自定义标签页的增删改查（固定走 /api/monitor/tabs）。 */
    const customTabsApi = (payload) => customTabsApiRaw('/api/monitor/tabs', payload);

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
        if (v && tabKeys().indexOf(v) >= 0) return v;
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
    // 精确计数（悬浮说明用）：千分位，不缩写成亿/万，便于核对
    const fmtExact = (n) => {
      const v = Number(n);
      return Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : '--';
    };
    const fmtMoney = (n) => {
      const v = Number(n);
      return Number.isFinite(v) ? v.toFixed(2) : '--';
    };
    // DeepSeek「本月已用」悬浮说明：官网用量页同源接口（host /api/deepseek/usage）
    const dsUsageTip = (u) => {
      const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
      const cat = (u && u.category) || {};
      const cur = (u && u.currency) === 'CNY' ? '¥' : ((u && u.currency) ? u.currency + ' ' : '¥');
      const lines = [
        'DeepSeek 官网用量（platform.deepseek.com · ' + n(u && u.year) + ' 年 ' + n(u && u.month) + ' 月）',
        '· 口径：官网「用量」页背后的同源接口（/api/v0/usage/amount + /cost），就是网页上显示的那个数',
        '· 不是本地统计、也不是余额折算',
        '· 输入·缓存命中 ' + fmtExact(cat.cacheHit),
        '· 输入·缓存未命中 ' + fmtExact(cat.cacheMiss),
        '· 输出 ' + fmtExact(cat.response),
        '· 合计 ' + fmtExact(u && u.totalTokens) + ' tok',
        '· 请求 ' + fmtExact(u && u.requestCount) + ' 次 · 有量 ' + n(u && u.activeDays) + ' 天 · 日均 ' + fmtExact(u && u.dailyAvgTokens) + ' tok',
        '· 花费 ' + cur + fmtMoney(u && u.totalCost) + ' · 日均 ' + cur + fmtMoney(u && u.dailyAvgCost),
      ];
      if (u && u.topModel) lines.push('· 用量最大模型 ' + u.topModel);
      if (u && u.tokenSource) lines.push('· 凭据来源 ' + u.tokenSource);
      if (u && Number.isFinite(u.fetchedAt)) lines.push('· 统计于 ' + fmtTime(u.fetchedAt) + ' · 每 60s 刷新');
      if (u && u.stale) lines.push('· 数据过期' + (u.error ? '：' + u.error : ''));
      return lines.join('\n');
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
                  ? '悬浮窗已开启 · DeepSeek / Command Code GOAT / OpenCode Go / Charm Hyper / 阶跃星辰 StepFun / 阿里云百炼 Token Plan 余额实时显示'
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

      // ══════════════════════════════════════════════════════════════════════════
      // 设置页「通用」区：标签页管理（增 / 删 / 隐藏 / 停用）
      // ══════════════════════════════════════════════════════════════════════════
      // 这是「增删标签页」的主界面：悬浮窗窄，放不下完整列表，所以管理动作都收在这里。
      //   · 懒人化入口：贴一个官网链接 → host 自动识别接口与「钱包/套餐/两者」，填好表单
      //   · 内置页 → 隐藏 / **永久删除**（改源码，不可撤销但自动备份）
      //   · 自定义页 → 隐藏 / 停用（保留配置与 key）/ 删除（连配置一并删）
      ctx.effect(() => ctx.slots.inject('settings.general.item', () => ctx.slots.register(
        { name: 'settings.general.item', id: 'balance-window-tabs', order: 101, label: '余额悬浮窗标签页' },
        () => {
          const [tick, setTick] = React.useState(0);
          const [busy, setBusy] = React.useState(false);
          const [msg, setMsg] = React.useState(null);
          const [showAdd, setShowAdd] = React.useState(false);
          const [draft, setDraft] = React.useState({ name: '', url: '', bearer: '', balPath: 'balance', unit: '' });
          const patch = (p) => setDraft((d) => ({ ...d, ...p }));
          // 懒人化：贴链接自动识别
          const [siteUrl, setSiteUrl] = React.useState('');
          const [finding, setFinding] = React.useState(false);
          const [found, setFound] = React.useState(null);   // { mode, confidence, notes, draft, credential }
          // 永久删除：两击确认（第一次只进入待确认）
          const [permPending, setPermPending] = React.useState(null);
          React.useEffect(() => {
            loadCustomTabs();
            return subscribeTabs(() => setTick((v) => v + 1));
          }, []);

          // 写操作统一收口：host 返回的 error 原样显示，不做「假装成功」
          const call = (payload, okMsg) => {
            setBusy(true);
            setMsg(null);
            return customTabsApi(payload).then((data) => {
              if (!data || !data.ok) { setMsg({ err: true, text: (data && data.error) || '操作失败' }); return; }
              return loadCustomTabs().then(() => setMsg({ err: false, text: okMsg }));
            }).catch((e) => setMsg({ err: true, text: String((e && e.message) || e) }))
              .then(() => setBusy(false));
          };

          // ── 懒人化：贴官网链接 → 让 host 去认接口 ──
          const detect = () => {
            const url = String(siteUrl || '').trim();
            if (!url) { setMsg({ err: true, text: '请先贴一个官网链接，例如 platform.deepseek.com' }); return; }
            setFinding(true);
            setMsg(null);
            setFound(null);
            fetch('/api/monitor/discover', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url, key: draft.bearer || '' }),
            }).then((r) => r.json()).then((data) => {
              if (!data || !data.ok) { setMsg({ err: true, text: (data && data.error) || '识别失败' }); return; }
              setFound(data);
              const d = data.draft || {};
              // 把识别结果灌进表单，用户只需（可选）补 key + 保存
              setShowAdd(true);
              setDraft({
                name: d.name || '',
                url: d.url || '',
                bearer: draft.bearer || '',
                balPath: (d.balance && d.balance.path) || 'balance',
                unit: (d.balance && d.balance.unit) || '',
              });
              setMsg({ err: false, text: '已识别：' + (data.mode === 'both' ? '余额 + 套餐额度都显示' : (data.mode === 'plan' ? '按套餐剩余额度显示' : '按钱包余额显示')) + '（可改完再保存）' });
            }).catch((e) => setMsg({ err: true, text: String((e && e.message) || e) }))
              .then(() => setFinding(false));
          };

          // ── 永久删除内置页：改写插件源码（host 侧会先备份） ──
          const permanentDelete = (t) => {
            setBusy(true);
            setMsg(null);
            customTabsApiRaw('/api/monitor/builtin-tabs/delete', { id: t.id, confirm: true }).then((data) => {
              if (!data || !data.ok) { setMsg({ err: true, text: (data && data.error) || '永久删除失败' }); return; }
              setPermPending(null);
              setMsg({ err: false, text: data.hint || ('已永久删除「' + t.name + '」') });
            }).catch((e) => setMsg({ err: true, text: String((e && e.message) || e) }))
              .then(() => setBusy(false));
          };

          const addTab = () => {
            const name = String(draft.name || '').trim();
            const url = String(draft.url || '').trim();
            if (!name) { setMsg({ err: true, text: '请填标签页名称' }); return; }
            if (!/^https?:\/\//i.test(url)) { setMsg({ err: true, text: '请填完整的 http(s):// 接口地址' }); return; }
            const id = 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
            call({ action: 'add', id, tab: {
              id, name, short: name.slice(0, 10), url,
              auth: draft.bearer ? { kind: 'bearer', value: String(draft.bearer).trim() } : { kind: 'none' },
              balance: {
                path: String(draft.balPath || 'balance').trim() || 'balance',
                label: '余额', unit: String(draft.unit || '').trim(), decimals: 2, format: 'number',
              },
              windows: [],
            } }, '已新增「' + name + '」').then(() => {
              setDraft({ name: '', url: '', bearer: '', balPath: 'balance', unit: '' });
              setShowAdd(false);
            });
          };

          // 列表：内置页在前、自定义页在后；含已删除/已停用的（否则无法恢复）
          const all = [];
          for (const d of TAB_DEFS) {
            all.push({ id: d.id, name: d.full, short: d.short, theme: d.theme, custom: false, hidden: isHidden(d.id) });
          }
          for (const t of customTabs) {
            all.push({
              id: t.id, name: t.name, short: t.short, theme: t.theme, custom: true,
              hidden: isHidden(t.id), disabled: !!t.disabled, source: t.source,
              intervalMs: t.intervalMs, balPath: t.balance && t.balance.path, url: t.url,
            });
          }
          const visibleCount = all.filter((t) => !t.hidden && !t.disabled).length;

          const row = (t) => {
            const state = t.disabled ? '已停用' : (t.hidden ? '已删除' : '显示中');
            const kind = (t.custom ? '自定义' : '内置') + ' · ' + state;
            // 副行：自定义页尽量给出「多久刷一次 + 取哪个字段 + 哪个接口」，方便自查配置。
            // 注意 t.source 来自 host 的 sanitize（说明鉴权方式），t.balance.path 是取值字段；
            // 两者都没有时至少把接口地址显示出来。
            const bits = [];
            if (t.custom) {
              if (Number.isFinite(t.intervalMs)) bits.push('每 ' + Math.round(t.intervalMs / 1000) + 's');
              if (t.balPath) bits.push('字段 ' + t.balPath);
              if (t.url) bits.push(t.url);
              else if (t.source) bits.push(t.source);
            }
            const sub = bits.length ? bits.join(' · ') : null;

            const head = React.createElement('div', { className: 'ocg-tabrow-head' },
              React.createElement('span', { className: 'ocg-tabrow-name' }, t.name),
              React.createElement('span', { className: 'ocg-tabrow-kind' }, kind));
            const copyCell = React.createElement('div', { className: 'ocg-tabrow-copy' },
              head,
              sub ? React.createElement('div', { className: 'ocg-tabrow-sub' }, sub) : null);

            // 内置页：显示/删除 二选一（可逆）
            const hideBtn = React.createElement('button', {
              type: 'button',
              className: 'ocg-btn ghost sm',
              disabled: busy,
              title: t.hidden ? '把它恢复回品牌轨' : '从品牌轨里移除这个标签页（可随时恢复）',
              onClick: () => {
                setTick((v) => v + 1);
                const done = setHidden(t.id, !t.hidden);
                // 被防呆拦下时给出原因（不允许把品牌轨清空），而不是静默无效
                setMsg(done
                  ? null
                  : { err: true, text: '至少要保留一个标签页，无法隐藏「' + t.name + '」' });
              },
            }, t.hidden ? '恢复' : '隐藏');

            // 内置页的「永久删除」：真正从源码里删掉这个页（host 侧会先备份）。
            // 两击确认——第一次只把按钮变成「确认永久删除」，避免误点毁掉源码。
            let delBuiltinBtn = null;
            if (!t.custom) {
              const confirming = permPending === t.id;
              delBuiltinBtn = React.createElement('button', {
                type: 'button',
                className: confirming ? 'ocg-btn danger sm confirm' : 'ocg-btn danger sm',
                disabled: busy,
                title: confirming
                  ? '再点一次就真的从源码里删掉「' + t.name + '」（host 会先把 client.js 备份到 backups/）'
                  : '永久删除：从插件源码里移除这个页（不可撤销，但会自动备份）',
                onClick: () => {
                  if (confirming) permanentDelete(t);
                  else { setPermPending(t.id); setMsg({ err: true, text: '再点一次「确认永久删除」才会从源码里删掉「' + t.name + '」（会先自动备份）' }); }
                },
              }, confirming ? '确认永久删除' : '永久删除');
            }

            // 自定义页才有的两个动作：停用（保留配置与 key）/ 删除（连 key 一起删）
            let toggleBtn = null;
            if (t.custom) {
              toggleBtn = React.createElement('button', {
                type: 'button',
                className: 'ocg-btn ghost sm',
                disabled: busy,
                title: t.disabled ? '重新启用（配置与 key 都还在）' : '停用（保留配置与 key，只是不再显示）',
                onClick: () => call({ action: 'toggle', id: t.id, disabled: !t.disabled }, t.disabled ? '已启用' : '已停用'),
              }, t.disabled ? '启用' : '停用');
            }
            let delBtn = null;
            if (t.custom) {
              delBtn = React.createElement('button', {
                type: 'button',
                className: 'ocg-btn danger sm',
                disabled: busy,
                title: '删除这个标签页，并把它保存的 API key 一并从磁盘删掉',
                onClick: () => call({ action: 'delete', id: t.id }, '已删除'),
              }, '删除');
            }

            const actions = React.createElement('div', { className: 'ocg-tabrow-actions' },
              hideBtn, delBuiltinBtn, toggleBtn, delBtn);
            const dot = React.createElement('span', { className: 'ocg-tabrow-dot', style: { background: t.theme || '#6b7280' } });
            return React.createElement('div', { className: 'ocg-tabrow', key: t.id }, dot, copyCell, actions);
          };

          // ── 新增表单（显式分段声明，避免深层嵌套括号写错）──
          const field = (label, hint, input) => React.createElement('div', { className: 'ocg-fld' },
            React.createElement('div', { className: 'ocg-fld-label' }, label),
            input,
            hint ? React.createElement('div', { className: 'ocg-fld-hint' }, hint) : null);

          const addForm = !showAdd ? null : React.createElement('div', { className: 'ocg-addform wide' },
            field('标签页名称', '显示在品牌轨上（轨上取前 10 字）',
              React.createElement('input', {
                className: 'ocg-in', placeholder: '如 OpenRouter',
                value: draft.name, onChange: (e) => patch({ name: e.target.value }),
              })),
            field('接口地址', '必须 http(s):// 开头，且返回 JSON',
              React.createElement('input', {
                className: 'ocg-in', placeholder: 'https://…（余额接口）',
                value: draft.url, onChange: (e) => patch({ url: e.target.value }),
              })),
            field('API key', '留空 = 无需鉴权。只保存在 host 侧配置文件里，不会下发到浏览器',
              React.createElement('input', {
                className: 'ocg-in', type: 'password', placeholder: 'sk-…（可留空）',
                value: draft.bearer, onChange: (e) => patch({ bearer: e.target.value }),
              })),
            React.createElement('div', { className: 'ocg-addform-grid' },
              field('余额字段路径', '点路径，如 data.total_credits（支持数组下标 items.0.v）',
                React.createElement('input', {
                  className: 'ocg-in sm', placeholder: 'balance',
                  value: draft.balPath, onChange: (e) => patch({ balPath: e.target.value }),
                })),
              field('单位', '可空；填 USD / CNY 会自动加 $ / ¥',
                React.createElement('input', {
                  className: 'ocg-in sm', placeholder: '如 USD',
                  value: draft.unit, onChange: (e) => patch({ unit: e.target.value }),
                }))),
            React.createElement('div', { className: 'ocg-fld-hint' },
              '想显示「剩余 % + 进度条」，需要在配置文件里给该页补 windows（每项 label / path / resetPath / mode）。'),
            React.createElement('div', { className: 'ocg-addform-actions' },
              React.createElement('button', {
                type: 'button', className: 'ocg-btn', disabled: busy, onClick: addTab,
              }, busy ? '保存中…' : '保存'),
              React.createElement('button', {
                type: 'button', className: 'ocg-btn ghost', style: { marginLeft: 6 },
                onClick: () => { setShowAdd(false); setMsg(null); },
              }, '取消')));

          // ── 懒人化：贴一个官网链接就自动建标签页 ──
          // host 会去认域名 + 实测官方余额接口，并判断该显示「钱包余额 / 套餐额度 / 两者」。
          // 识别结果直接灌进下面的表单，用户最多补一个 API key 就点保存。
          const quickInput = React.createElement('input', {
            className: 'ocg-in', placeholder: '例如 platform.deepseek.com 或 openrouter.ai',
            value: siteUrl,
            onChange: (e) => setSiteUrl(e.target.value),
            onKeyDown: (e) => { if (e.key === 'Enter') detect(); },
          });
          const quickBtn = React.createElement('button', {
            type: 'button',
            className: 'ocg-btn sm',
            disabled: finding || busy,
            onClick: detect,
          }, finding ? '识别中…' : '自动识别');
          const quickRow = React.createElement('div', { className: 'ocg-quickadd-row' }, quickInput, quickBtn);
          const quickHint = React.createElement('div', { className: 'ocg-fld-hint' },
            '会先试已知服务商的官方余额接口，再探测常见端点，并判断该按「钱包余额 / 套餐剩余额度 / 两者都显示」呈现；'
            + '识别到的东西一律填进下面表单，保存前你可以改。');
          const confText = !found ? ''
            : (found.confidence === 'high' ? '已实测通过' : (found.confidence === 'medium' ? '按公开口径推测' : '未能识别，需手填'));
          const modeText = !found ? ''
            : (found.mode === 'both' ? '余额 + 套餐额度都显示' : (found.mode === 'plan' ? '只显示套餐剩余额度' : '只显示钱包余额'));
          const foundBox = !found ? null : React.createElement('div', { className: 'ocg-found' },
            React.createElement('div', { className: 'ocg-found-head' },
              '识别结果：',
              React.createElement('span', {
                className: 'ocg-found-badge ' + (found.confidence === 'high' ? 'high' : (found.confidence === 'medium' ? 'mid' : 'low')),
              }, confText),
              React.createElement('span', { className: 'ocg-found-mode' }, modeText)),
            React.createElement('ul', { className: 'ocg-found-notes' },
              (found.notes || []).map((n, i) => React.createElement('li', { key: 'n' + i }, n))),
            found.credential ? React.createElement('div', { className: 'ocg-fld-hint' },
              '这个服务商用的是 DSH 凭据「' + found.credential + '」——若还没配，去「设置 → 凭据」添加后即可取数。') : null);
          const quickAdd = React.createElement('div', { className: 'ocg-quickadd' },
            React.createElement('div', { className: 'ocg-fld-label' }, '① 贴一个官网链接，自动识别余额接口'),
            quickRow, quickHint, foundBox);

          return React.createElement('div', { className: 'ocg-set-block' },
            React.createElement('div', { className: 'ocg-set-title' }, '余额悬浮窗 · 标签页管理'),
            React.createElement('div', { className: 'ocg-set-desc' },
              '共 ' + all.length + ' 个标签页，当前显示 ' + visibleCount + ' 个。'
              + '「隐藏」只是不显示；「永久删除」会把内置页从源码里删掉（不可撤销，但 host 会先备份 client.js）；'
              + '自定义页「删除」会连它保存的 API key 一起清掉。悬浮窗上的品牌轨只负责切换显示。'),
            quickAdd,
            React.createElement('div', { className: 'ocg-tablist' }, all.map(row)),
            msg ? React.createElement('div', {
              className: msg.err ? 'ocg-set-msg err' : 'ocg-set-msg',
            }, msg.text) : null,
            React.createElement('div', { className: 'ocg-set-actions' },
              React.createElement('button', {
                type: 'button',
                className: 'ocg-btn sm',
                disabled: busy,
                onClick: () => { setMsg(null); setShowAdd((v) => !v); },
              }, showAdd ? '收起新增表单' : '+ 新增标签页'),
              configFileHint ? React.createElement('span', { className: 'ocg-set-file' },
                '配置文件 ' + configFileHint + '（自定义页的 API key 明文存在这里）') : null),
            addForm);
        },
      )), 'opencode-go-monitor: settings tabs manager');

      ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register(
        { name: 'shell.overlay', id: 'opencode-go-monitor', order: 0, label: '余额悬浮窗' },
        (props) => {
          // ═══ 取数层：全部由 TAB_DEFS 驱动 ═════════════════════════════════════
          // 每个标签页的取数状态放进一个 map（按标签键取），而不是七个独立的
          // useState —— 加/删标签页只动 TAB_DEFS 与下面的 DATA_SOURCES 一处。
          // slices: { <tabKey>: { data, err } }；主数据源用标签键本身，附加数据源
          // 用 '<tabKey>Usage' 这种带后缀的键（如 DeepSeek 官网用量）。
          const [slices, setSlices] = React.useState({});
          const setSlice = React.useCallback((key, data, err) => {
            setSlices((prev) => (prev[key] && prev[key].data === data && prev[key].err === err)
              ? prev
              : { ...prev, [key]: { data: data, err: err } });
          }, []);
          // 统一取数：同源 JSON 接口；{ok|stale} 视为有效数据，否则记错误原因。
          // errKey 用 `key + 'Err'` 保持与旧代码的命名习惯一致（便于排错时对照）。
          const fetchSlice = React.useCallback(async (key, path) => {
            try {
              const res = await fetch(path);
              const data = await res.json();
              if (data && (data.ok || data.stale)) setSlice(key, data, null);
              else setSlice(key, null, data && data.error ? data.error : '获取失败');
            } catch (e) { setSlice(key, null, String((e && e.message) || e)); }
          }, [setSlice]);

          const [tab, setTab] = React.useState(loadTab);
          // 标签页注册表计数器：自定义页拉回/隐藏切换后自增，用来触发重渲染
          const [tabsTick, setTabsTick] = React.useState(0);
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

          // ═══ 取数源表：标签键 → { path, every } ═══════════════════════════════
          // 加一个内置标签页：在这里补一行（path 是 host 半的同源路由，every 是轮询间隔）。
          // 删一个标签页：把这行连同 TAB_DEFS 里的那块一起删掉即可。
          // extras 是「不占标签槽、只给某个页面供数」的附加源（DeepSeek 官网用量）。
          const DATA_SOURCES = {
            ds: { path: '/api/deepseek/balance', every: 30000 },
            go: { path: '/api/commandcode-goat/balance', every: 60000 },
            oc: { path: '/api/opencode-go/balance', every: 60000 },
            sf: { path: '/api/stepfun/balance', every: 60000 }
          };
          const EXTRA_SOURCES = {
            dsUsage: { path: '/api/deepseek/usage', every: 60000 },
          };
          // 自定义页的取数也进同一张表（走 host 代理，浏览器拿不到 key）；
          // 内置源在前、自定义源在后，便于排错时一眼看出哪个是内置的。
          const customSources = {};
          for (const t of tabRegistry()) {
            if (t.custom) customSources[t.id] = { path: '/api/monitor/custom-balance?id=' + encodeURIComponent(t.id), every: t.intervalMs || 60000 };
          }
          const ALL_SOURCES = { ...DATA_SOURCES, ...EXTRA_SOURCES, ...customSources };

          // 每个源的取数回调（useCallback 逐个声明，保持 hook 调用顺序恒定）。
          // 依赖只放 fetchSlice（稳定）→ 回调身份不随每次渲染变化，
          // 避免 setSlices 触发渲染后把下面的 useEffect 反复重建。
          const refreshers = {};
          for (const key of Object.keys(ALL_SOURCES)) {
            refreshers[key] = React.useCallback(() => fetchSlice(key, ALL_SOURCES[key].path), [fetchSlice]);
          }
          const refresh = React.useCallback(() => {
            setLoading(true);
            return Promise.allSettled(Object.keys(ALL_SOURCES).map((k) => refreshers[k]()))
              .then(() => { setLoading(false); });
            // 依赖故意列为「源键集合」：新增/删除标签页时取数集合变了才重建
          }, [fetchSlice, Object.keys(ALL_SOURCES).join(',')]);

          const ALL_KEYS = Object.keys(ALL_SOURCES).join(',');
          React.useEffect(() => {
            refresh();
            // 轮询注册表化：每个源按自己的间隔注册；自定义页的间隔来自它自己的配置
            const stops = Object.keys(ALL_SOURCES).map((k) => ctx.interval(refreshers[k], ALL_SOURCES[k].every));
            // 1s 时钟驱动 Charm Hyper 积分刷新倒计时：跨过刷新时刻自动翻到下一天
            const stopClock = ctx.interval(() => {
              const now = Date.now();
              if (hcRefreshAtRef.current <= now) hcRefreshAtRef.current = nextHcRefreshAt(now);
              setHcNow(now);
            }, 1000);
            return () => { for (const s of stops) s(); stopClock(); };
          }, [ALL_KEYS]);

          // 页面内取数的简写（模板里高频使用）
          const ds = slices.ds ? slices.ds.data : null;
          const dsErr = slices.ds ? slices.ds.err : null;
          const go = slices.go ? slices.go.data : null;
          const goErr = slices.go ? slices.go.err : null;
          const oc = slices.oc ? slices.oc.data : null;
          const ocErr = slices.oc ? slices.oc.err : null;
          const hc = slices.hc ? slices.hc.data : null;
          const hcErr = slices.hc ? slices.hc.err : null;
          const sf = slices.sf ? slices.sf.data : null;
          const sfErr = slices.sf ? slices.sf.err : null;
          const bl = slices.bl ? slices.bl.data : null;
          const blErr = slices.bl ? slices.bl.err : null;
          const dsUsage = slices.dsUsage ? slices.dsUsage.data : null;
          const dsUsageErr = slices.dsUsage ? slices.dsUsage.err : null;

          // 设置页开关：关闭悬浮窗时本组件保持挂载（轮询继续、数据保鲜），仅不渲染
          const [enabled, setEnabledState] = React.useState(getEnabled());
          React.useEffect(() => subscribeEnabled(setEnabledState), []);

          // 标签顺序与主题色都派生自 TAB_DEFS（唯一的标签页事实源），此处不再手写第二份。
          // 切换方向：往右切（下标变大）面板从右滑入，往左切从左滑入。
          const switchTab = (next) => {
            setTab((prev) => {
              if (prev === next) return prev;
              setDir(tabOrder(next) > tabOrder(prev) ? 'right' : 'left');
              try { localStorage.setItem(KEY_TAB, next); } catch (e) { /* 可选项 */ }
              return next;
            });
          }
          // Provider 主题色：标签激活底色/描边、标题栏细线、胶囊名、进度条共用
          const curTheme = tabTheme(tab);

          // ---- 标签页注册表联动：启动拉一次自定义页；列表变化由 subscribeTabs 触发重渲染 ----
          // 自定义页由 host 半持久化（见 lib/index.js 的 /api/monitor/tabs）。
          // 这里刻意不引入额外 state：applyCustomTabs 会通知订阅者，而订阅者本身
          // 就是本组件的 setState，列表变化自然带来一次渲染。
          React.useEffect(() => {
            loadCustomTabs();
            return subscribeTabs(() => setTabsTick((v) => v + 1));
          }, []);
          // 当前标签页被删/被隐藏时回落到第一个可用页，绝不停在一个已不存在的页上
          React.useEffect(() => {
            if (tabKeys().indexOf(tab) >= 0) return;
            const first = tabKeys()[0];
            if (first) setTab(first);
          }, [tab, tabsTick]);

          // 注：标签页的增 / 删 / 隐藏全部在「设置 → 通用 → 余额悬浮窗 · 标签页管理」里，
          // 面板只负责显示与切换。写操作走 host 的 /api/monitor/tabs：
          //   · 定义与 API key 落盘在 host（$DSH_HOME/dsh-opencode-go-monitor.json）
          //   · 浏览器只拿到不含凭据的列表（sanitizeCustomTab 摘掉了 auth.value）

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
              const keys = tabKeys();
              if (keys.length === 0) return;
              const i = keys.indexOf(tab);
              const n = keys[(i + (e.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length];
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
          // 取数状态一律走 slices（内置页与自定义页同一条通路）
          const slice = (key) => slices[key] || null;
          const curErr = slice(tab) ? slice(tab).err : null;
          const curData = slice(tab) ? slice(tab).data : null;
          const dotClass = curErr ? 'opencg-dot err' : (curData ? 'opencg-dot ok' : 'opencg-dot idle');

          // ---- 自定义标签页面板（第三方接口，字段路径由用户配置，数值由 host 代理取回） ----
          const customChildren = (t, data, err) => {
            const kids = [];
            const dec = (data && Number.isFinite(data.decimals)) ? data.decimals : 2;
            const unit = (data && typeof data.unit === 'string' && data.unit) ? data.unit : '';
            const withUnit = (s) => {
              if (!unit) return s;
              if (unit === 'USD') return '$' + s;
              if (unit === 'CNY') return '¥' + s;
              return s + ' ' + unit;
            };
            const fmtNum = (v) => Number.isFinite(v) ? v.toFixed(dec) : '--';
            // 余额行：format=percent 时按百分比展示（有些接口直接给剩余比例）
            const balLabel = (data && data.balanceLabel) || (t.balance && t.balance.label) || '余额';
            const balFmt = (data && data.balanceFormat) || (t.balance && t.balance.format) || 'number';
            let balText = '--';
            if (data && Number.isFinite(data.balance)) {
              balText = balFmt === 'percent' ? Math.round(data.balance) + '%'
                : balFmt === 'raw' ? String(data.balance)
                  : withUnit(fmtNum(data.balance));
            }
            kids.push(React.createElement('div', { className: 'opencg-row simple', key: 'cb' },
              React.createElement('span', { className: 'opencg-name' }, balLabel),
              React.createElement('span', { className: 'opencg-value' }, balText)));
            // 窗口行：与内置页同款的「剩余 % + 进度条 + 已用 % + 重置倒计时」
            const nowMs = Date.now();
            for (let i = 0; i < ((data && data.windows) || []).length; i++) {
              const w = data.windows[i];
              const remPct = w.usedIsRemaining ? w.usedPercent : Math.max(0, Math.min(100, 100 - w.usedPercent));
              const color = quotaColor(remPct);
              kids.push(React.createElement('div', { className: 'opencg-q', key: 'cw' + i },
                React.createElement('div', { className: 'opencg-q-top' },
                  React.createElement('span', { className: 'opencg-q-name' }, w.label),
                  React.createElement('span', { className: 'opencg-rem', style: color ? { color: color } : undefined }, Math.round(remPct) + '%'),
                  React.createElement('span', { className: 'opencg-reset' }, w.resetsAt ? fmtLeft(w.resetsAt - nowMs) : '--')),
                React.createElement('div', { className: 'opencg-q-bot' },
                  React.createElement('div', {
                    className: 'opencg-bar',
                    role: 'progressbar',
                    'aria-valuenow': String(Math.round(Math.max(0, Math.min(100, w.usedPercent)))),
                    'aria-valuemin': '0',
                    'aria-valuemax': '100',
                  }, React.createElement('i', {
                    style: { width: Math.max(0, Math.min(100, w.usedPercent)) + '%', background: color || 'var(--dsw-alias-base-gray-400,#b3b8c0)' },
                  })),
                  React.createElement('span', { className: 'opencg-used' },
                    w.usedIsRemaining ? '剩余 ' + Math.round(w.usedPercent) + '%' : '已用 ' + Math.round(w.usedPercent) + '%'))));
            }
            if (!data || (!Number.isFinite(data.balance) && ((data.windows || []).length === 0))) {
              kids.push(React.createElement('div', { className: 'opencg-meta', key: 'cn' },
                err ? '取数失败，鼠标悬浮看原因' : '正在从该接口取数…'));
            } else if (t.balance && t.balance.path) {
              kids.push(React.createElement('div', { className: 'opencg-meta', key: 'cs' },
                '字段 ' + t.balance.path + ((t.windows || []).length ? ' · ' + t.windows.length + ' 个窗口' : '')));
            }
            const errAll = err || (data && data.ok === false ? data.error : null);
            kids.push(React.createElement('div', {
              className: errAll ? 'opencg-status err' : 'opencg-status',
              key: 'st',
              title: errAll ? (data && data.source ? data.source + '：' : '') + errAll : ((data && data.source) || ''),
            }, errAll ? '获取失败' : (data ? '余额 ' + fmtTime(data.fetchedAt) + ' · 每 ' + Math.round((t.intervalMs || 60000) / 1000) + 's 刷新' : '余额 --')));
            return kids;
          };

          // ---- DeepSeek 面板 ----
          const dsChildren = [];
          const dsBalanceText = ds ? (ds.currency === 'CNY' ? '¥' + ds.balance.toFixed(2) : ds.currency + ' ' + ds.balance.toFixed(2)) : '--';
          const dsTokenText = ds ? '≈' + fmtTokens(ds.estTokens) + ' tok' : '--';
          dsChildren.push(React.createElement('div', { className: 'opencg-row simple', key: 'd1' },
            React.createElement('span', { className: 'opencg-name' }, '余额'),
            React.createElement('span', { className: 'opencg-value', key: 'bv' + dsBalanceText }, dsBalanceText)));
          // 本月已用：**官网用量页**的数字（platform.deepseek.com 同源接口），不是本地统计
          const dsUsageText = dsUsage ? '≈' + fmtTokens(dsUsage.totalTokens) + ' tok' : '--';
          const dsUsageCur = dsUsage && dsUsage.currency && dsUsage.currency !== 'CNY' ? dsUsage.currency + ' ' : '¥';
          const dsUsageCaption = dsUsage ? '官网' : (dsUsageErr ? '官网 · 未取到' : '官网');
          const dsUsageTitle = dsUsage
            ? dsUsageTip(dsUsage)
            : (dsUsageErr ? 'DeepSeek 官网用量未取到：' + dsUsageErr : '');
          dsChildren.push(React.createElement('div', {
            className: 'opencg-row simple',
            key: 'du',
            title: dsUsageTitle,
          },
            React.createElement('span', { className: 'opencg-name' }, '本月已用'),
            React.createElement('span', { className: 'opencg-value', key: 'uv' + dsUsageText, style: { fontSize: 13 } },
              dsUsageText,
              React.createElement('span', {
                style: {
                  fontSize: 10,
                  fontWeight: 400,
                  marginLeft: 4,
                  color: dsUsageErr
                    ? 'var(--dsw-alias-state-warn-primary,#f08c00)'
                    : 'var(--dsw-alias-label-secondary,#888)',
                },
              }, dsUsageCaption))));
          if (dsUsage) {
            dsChildren.push(React.createElement('div', {
              className: 'opencg-row simple',
              key: 'dc',
              title: dsUsageTip(dsUsage),
            },
              React.createElement('span', { className: 'opencg-name' }, '本月花费'),
              React.createElement('span', { className: 'opencg-value', style: { fontSize: 13 } },
                dsUsageCur + fmtMoney(dsUsage.totalCost),
                React.createElement('span', {
                  style: {
                    fontSize: 10,
                    fontWeight: 400,
                    marginLeft: 4,
                    color: 'var(--dsw-alias-label-secondary,#888)',
                  },
                }, '日均 ' + dsUsageCur + fmtMoney(dsUsage.dailyAvgCost)))));
          }
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
          // 重置倒计时：resetsAt（接口实测为数字 epoch 毫秒）→ 分钟为主格式。
          // 缺重置时间不写 '--'：Command Code 在窗口**没有用量**时把 resetAt 回成 0（实测），
          // 那种情况是「窗口空闲」，写 '--' 会让人以为倒计时坏了 → 直接写明空闲。
          const fmtReset = (resetsAt, nowMs) => {
            const t = parseTs(resetsAt);
            if (!Number.isFinite(t)) return '空闲';
            return fmtLeft(t - nowMs);
          };
          const NO_RESET_TIP = '该窗口暂无用量，官方未返回重置时间（Command Code 在窗口无用量时把 resetAt 回成 0）';
          // 滚动窗口行：剩余 %（按档位配色）+ 进度条（已用 %）+ 已用 % + 重置倒计时（分钟为主）
          // 配额档位两行结构：上行「名称 + 剩余% + 重置倒计时」，下行「进度条 + 已用%」
          // 无数据时不渲染空进度条（只留占位），避免报错态出现「空进度条 + 已用 0%」的误导视觉
          const goQuotaRow = (key, label, w, nowMs) => {
            const usedPct = w && Number.isFinite(w.percent) ? w.percent : null;
            const remPct = usedPct != null ? Math.max(0, Math.min(100, 100 - usedPct)) : null;
            const color = quotaColor(remPct);
            const resetTs = w && w.resetsAt ? parseTs(w.resetsAt) : NaN;
            const hasReset = Number.isFinite(resetTs);
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
              title: hasReset
                ? label + ' 重置 ' + fmtDateMin(resetTs) + '（' + fmtLeft(resetTs - nowMs) + ' 后）'
                : (usedPct == null ? undefined : NO_RESET_TIP),
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
          const goHasReset = goRefreshAt && Number.isFinite(goRefreshAt.ts);
          const goRefreshMs = goHasReset ? goRefreshAt.ts : NaN;
          // 窗口无用量时官方不给 resetAt：显示「空闲」而不是 '--'，并说明原因（不编造重置时刻）
          const goRefreshText = goHasReset ? fmtLeft(goRefreshMs - goNow) : '空闲';
          goChildren.push(React.createElement('div', {
            className: 'opencg-row simple',
            key: 'g4',
            title: goHasReset
              ? goRefreshAt.label + ' 重置 ' + fmtDateMin(goRefreshMs) + '（' + goRefreshText + ' 后）'
              : '额度刷新：' + NO_RESET_TIP,
          },
            React.createElement('span', { className: 'opencg-name' }, '额度刷新'),
            React.createElement('span', { className: 'opencg-value', style: { fontSize: 12, fontWeight: 600 } },
              goRefreshText,
              goHasReset
                ? React.createElement('span', { style: { fontSize: 10, fontWeight: 400, color: 'var(--dsw-alias-label-secondary,#888)' } }, ' 后')
                : null)));
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

          // ---- 阿里云百炼 Token Plan 面板 ----
          // 数据源：百炼控制台内部网关（/data/api.json?action=BroadScopeAspnGateway&product=sfm_bailian），
          // 鉴权 = 控制台 Cookie（BAILIAN_CONSOLE_COOKIE）+ sec_token。
          //   窗口：per5HourPercentage / per1WeekPercentage（0..1 比例，host 已 ×100 成 usedPercent）
          //   月额度：BSS GetSubscriptionSummary 的总量 / 剩余（尽力而为，取不到显示 -- ）
          //   档位：subscription.specCode（lite / essential / standard / pro）
          const blChildren = [];
          const blPlan = bl && typeof bl === 'object' ? bl : null;
          const blWinOf = (w) => (w ? {
            percent: Number.isFinite(w.usedPercent) ? w.usedPercent : null,
            resetsAt: w.resetsAt,
          } : null);
          const bpWinTotal = (plan, key) => {
            const w = plan && plan.windows ? plan.windows[key] : null;
            return w && Number.isFinite(w.totalQuota) ? w.totalQuota : null;
          };
          // Credits 计数：千分位 + 最多两位小数（11,500 / 45,000 / 180,000）
          const blCr = (n) => (Number.isFinite(n) ? (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 }) : '--');
          const blNow = Date.now();
          const blMonthWin = (blPlan && blPlan.windows && blPlan.windows.monthly) ? blPlan.windows.monthly : null;
          const blFiveWin = (blPlan && blPlan.windows) ? blPlan.windows.fiveHour : null;
          // 网关回来的月窗口字段可能是 week 类（历史口径）→ 面板据 kind 换标签，不硬写「月度」
          const blMonthLabel = (blMonthWin && blMonthWin.kind === 'week') ? '每周' : '月度';
          // 5 小时窗口：个人版实测只有月窗口（对照官方「月限额、无周额度限制」）→ 没百分比就不渲染这一行，
          // 避免一排永远 -- 的空行；有该窗口的账号/套餐照常显示
          if (blFiveWin && Number.isFinite(blFiveWin.usedPercent)) {
            blChildren.push(goQuotaRow('b1', '5小时', blWinOf(blFiveWin), blNow));
          }
          blChildren.push(goQuotaRow('b2', blMonthLabel, blWinOf(blMonthWin), blNow));
          // 额度重置倒计时：优先月窗口（个人版实测只有这个），其次 5 小时窗口，最后月额度到期
          const blResetCand = [
            { k: blMonthLabel + '窗口', ts: parseTs(blMonthWin && blMonthWin.resetsAt) },
            { k: '5小时窗口', ts: parseTs(blFiveWin && blFiveWin.resetsAt) },
            { k: '月度额度', ts: parseTs(blPlan && blPlan.credit && blPlan.credit.resetsAt) },
          ].filter((x) => Number.isFinite(x.ts));
          const blReset = blResetCand[0] || null;
          blChildren.push(React.createElement('div', {
            className: 'opencg-row simple',
            key: 'b3',
            title: blReset
              ? blReset.k + ' 重置 ' + fmtDateMin(blReset.ts) + '（' + fmtLeft(blReset.ts - blNow) + ' 后）'
              : '接口未返回重置时间（控制台网关偶发只回 Success 空载荷，60s 后自动重试）',
          },
            React.createElement('span', { className: 'opencg-name' }, '额度重置'),
            React.createElement('span', { className: 'opencg-value', style: { fontSize: 12, fontWeight: 600 } },
              blReset ? fmtLeft(blReset.ts - blNow) : '--',
              blReset ? React.createElement('span', { style: { fontSize: 10, fontWeight: 400, color: 'var(--dsw-alias-label-secondary,#888)' } }, ' 后') : null)));
          // 月度 Credits（BSS 汇总）：剩 / 总；总量与剩余都缺失时显示 --（不臆造 0）
          const blCredit = blPlan && blPlan.credit ? blPlan.credit : null;
          const blCreditText = (() => {
            if (!blCredit) return '--';
            const rem = Number.isFinite(blCredit.remaining) ? blCredit.remaining : null;
            const tot = Number.isFinite(blCredit.total) ? blCredit.total : null;
            if (rem === null && tot === null) return '--';
            if (rem !== null && tot !== null) return blCr(rem) + ' / ' + blCr(tot);
            return blCr(rem !== null ? rem : tot);
          })();
          const blUsedPct = (blCredit && Number.isFinite(blCredit.total) && blCredit.total > 0 && Number.isFinite(blCredit.used))
            ? Math.round((blCredit.used / blCredit.total) * 100) : null;
          blChildren.push(React.createElement('div', {
            className: 'opencg-row simple',
            key: 'b4',
            title: '月度 Credits（'
              + (blCredit && blCredit.source === 'window'
                ? '档位月上限 × 月窗口已用 % 折算（控制台 subscription/quota-config + usage）'
                : '控制台 BSS GetSubscriptionSummary，尽力而为')
              + '）\n'
              + (blCredit
                ? '· 总量 ' + (Number.isFinite(blCredit.total) ? blCr(blCredit.total) : '--')
                  + ' · 剩余 ' + (Number.isFinite(blCredit.remaining) ? blCr(blCredit.remaining) : '--')
                  + ' · 已用 ' + (Number.isFinite(blCredit.used) ? blCr(blCredit.used) : '--')
                  + (blUsedPct === null ? '' : '（' + blUsedPct + '%）')
                  + (Number.isFinite(parseTs(blCredit.resetsAt)) ? '\n· 到期 ' + fmtDateMin(parseTs(blCredit.resetsAt)) : '')
                : '控制台未返回汇总（个人版套餐额度可能只在窗口接口里）'),
          },
            React.createElement('span', { className: 'opencg-name' }, '月额度'),
            React.createElement('span', { className: 'opencg-value', style: { fontSize: 13 } },
              blCreditText,
              blCreditText !== '--' ? React.createElement('span', {
                style: { fontSize: 10, fontWeight: 400, color: 'var(--dsw-alias-label-secondary,#888)' },
              }, ' Credits') : null)));
          // 套餐：档位名（specCode → Essential/…）+ 订阅剩余天数/到期；窗口上限与用量包放在悬浮说明
          const blTier = (blPlan && blPlan.planName) ? blPlan.planName : null;
          const blSub = (blPlan && blPlan.sub) ? blPlan.sub : null;
          const blFiveTotal = bpWinTotal(blPlan, 'fiveHour');
          const blMonthTotal = bpWinTotal(blPlan, 'monthly');
          const blAddon = (blPlan && blPlan.caps && Number.isFinite(blPlan.caps.addon)) ? blPlan.caps.addon : null;
          const blSubStatus = blSub && blSub.status
            ? ({ VALID: '生效中', EXPIRED: '已过期', INVALID: '已失效' }[blSub.status] || blSub.status)
            : null;
          if (blTier || blFiveTotal !== null || blMonthTotal !== null || blAddon !== null || blSubStatus) {
            const blSubTail = blSub && Number.isFinite(blSub.remainingDays) ? ' · 剩 ' + blSub.remainingDays + ' 天'
              : (blSub && Number.isFinite(parseTs(blSub.endTime)) ? ' · 至 ' + fmtDateMin(parseTs(blSub.endTime)) : '');
            const blCapsTail = (blMonthTotal !== null || blFiveTotal !== null)
              ? '月上限 ' + blCr(blMonthTotal !== null ? blMonthTotal : blFiveTotal) : '';
            blChildren.push(React.createElement('div', {
              className: 'opencg-row simple',
              key: 'b5',
              title: '控制台 subscription → 套餐档位'
                + (blPlan && blPlan.planCode ? '（' + blPlan.planCode + '）' : '')
                + (blSubStatus ? '\n· 状态 ' + blSubStatus : '')
                + (blSub && Number.isFinite(parseTs(blSub.endTime)) ? '，到期 ' + fmtDateMin(parseTs(blSub.endTime)) : '')
                + (blSub && blSub.autoRenew !== null && blSub.autoRenew !== undefined ? '，' + (blSub.autoRenew ? '自动续费' : '不自动续费') : '')
                + (blSub && blSub.instanceCode ? '\n· 实例 ' + blSub.instanceCode : '')
                + '\n官方月限额：Lite 11,500 / Essential 25,500 / Standard 45,000 / Pro 180,000 Credits'
                + (blFiveTotal !== null ? '\n· 5 小时窗口上限 ' + blCr(blFiveTotal) + ' Credits' : '')
                + (blMonthTotal !== null ? '\n· 月窗口上限 ' + blCr(blMonthTotal) + ' Credits' : '')
                + (blAddon !== null ? '\n· 已购用量包 ' + blCr(blAddon) + ' Credits（不占套餐月额度，先月池后用量包）' : ''),
            },
              React.createElement('span', { className: 'opencg-name' }, '套餐'),
              React.createElement('span', { className: 'opencg-value', style: { fontSize: 12, fontWeight: 600 } },
                blTier || blSubStatus || '--',
                (blSubTail || blCapsTail) ? React.createElement('span', {
                  style: { fontSize: 10, fontWeight: 400, marginLeft: 4, color: 'var(--dsw-alias-label-secondary,#888)' },
                }, blSubTail || blCapsTail) : null)));
          }
          const blErrAll = blErr || (bl && !bl.ok ? (bl.error || '获取失败') : null);
          const blSubErrors = (bl && bl.errors)
            ? Object.keys(bl.errors).filter((k) => bl.errors[k]).map((k) => k + ': ' + bl.errors[k])
            : [];
          const blStatus = blErrAll ? '获取失败' : (bl ? '套餐额度 ' + fmtTime(bl.fetchedAt) + ' · 每 60s 刷新' : '额度 --');
          blChildren.push(React.createElement('div', {
            className: blErrAll ? 'opencg-status err' : 'opencg-status',
            key: 'st',
            title: blErrAll
              ? '阿里云百炼: ' + blErrAll
              : '阿里云百炼 Token Plan 个人版 · 额度来自控制台网关（/data/api.json?action=BroadScopeAspnGateway），'
                + '凭据 BAILIAN_CONSOLE_COOKIE（控制台 Cookie / 整段 cURL）'
                + (blSubErrors.length ? '\n控制台未取到的项：' + blSubErrors.join(' / ') : '')
                + (bl && bl.secTokenError ? '\nsec_token 未取到：' + bl.secTokenError : ''),
          }, blStatus));

          // 面板内容分发：内置页各有一条渲染分支；自定义页走统一渲染器。
          // 「删一个内置页」时若忘了删它的分支也没关系（该 id 已不在注册表里，不会被选中）。
          const curEntry = tabById(tab);
          const paneChildren = (curEntry && curEntry.custom)
            ? customChildren(curEntry, curData, curErr)
            : (tab === 'go' ? goChildren : (tab === 'oc' ? ocChildren : (tab === 'hc' ? hcChildren : (tab === 'sf' ? sfChildren : (tab === 'bl' ? blChildren : dsChildren)))));
          const pane = React.createElement('div', {
            key: tab,
            className: 'opencg-pane ' + dir + (((curEntry && curEntry.custom) || tab === 'sf' || tab === 'bl') ? ' compact' : ''),
          }, paneChildren);

          const body = React.createElement('div', { className: 'opencg-body', key: 'body' }, pane);

          // ---- 收起态胶囊：当前标签的关键数值一眼可读 ----
          let pillVal = '--';
          // 自定义页：优先窗口剩余 %，否则余额（与内置页的胶囊口径一致）
          if (curEntry && curEntry.custom) {
            const cw = curData && curData.windows && curData.windows[0];
            if (cw && Number.isFinite(cw.usedPercent)) {
              const r = cw.usedIsRemaining ? cw.usedPercent : 100 - cw.usedPercent;
              pillVal = '剩' + Math.max(0, Math.round(r)) + '%';
            } else if (curData && Number.isFinite(curData.balance)) {
              const d = Number.isFinite(curData.decimals) ? curData.decimals : 2;
              const u = curData.unit === 'USD' ? '$' : (curData.unit === 'CNY' ? '¥' : '');
              pillVal = u + curData.balance.toFixed(d);
            } else pillVal = curErr ? '获取失败' : '--';
          }
          else if (tab === 'ds') pillVal = ds ? dsBalanceText : (dsErr ? '获取失败' : '--');
          else if (tab === 'go') pillVal = (go && go.fiveHour && Number.isFinite(go.fiveHour.percent)) ? '剩' + Math.max(0, Math.round(100 - go.fiveHour.percent)) + '%' : (goErr ? '获取失败' : '--');
          else if (tab === 'oc') pillVal = (oc && oc.rolling && Number.isFinite(oc.rolling.percent)) ? '剩' + Math.max(0, Math.round(100 - oc.rolling.percent)) + '%' : (ocErr ? '获取失败' : '--');
          else if (tab === 'hc') pillVal = hc ? fmtHc(hc.balance) + ' hc' : (hcErr ? '获取失败' : '--');
          else if (tab === 'sf') pillVal = sfPlan ? (sfPlan.kind === 'credit' ? sfPct(sfPlan.credit && sfPlan.credit.leftRate) : sfPct(sfPlan.window && sfPlan.window.fiveHourLeftRate)) : ((sf && Number.isFinite(sf.balance)) ? sfBalanceText : (sfErr ? '获取失败' : '--'));
          else if (tab === 'bl') {
            const w5 = bl && bl.windows ? bl.windows.fiveHour : null;
            const wm = bl && bl.windows ? bl.windows.monthly : null;
            const wpick = (w5 && Number.isFinite(w5.usedPercent)) ? w5 : ((wm && Number.isFinite(wm.usedPercent)) ? wm : null);
            if (wpick) pillVal = '剩' + Math.max(0, Math.round(100 - wpick.usedPercent)) + '%';
            else if (bl && bl.credit && Number.isFinite(bl.credit.remaining)) pillVal = (Math.round(bl.credit.remaining * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' Cr';
            else pillVal = blErr ? '获取失败' : '--';
          }

          // 品牌轨：纵向服务商标，激活项带主题色底 + 轨左缘指示条；状态点置顶、收起键置底
          const rail = React.createElement('div', { className: 'ocg-rail', key: 'rail', role: 'tablist', 'aria-label': '余额服务商' },
            React.createElement('span', { className: 'ocg-rail-ink' }),
            React.createElement('span', { className: dotClass }),
            // 纯导航：只放标签按钮。增删标签页全部收在「设置 → 通用 → 余额悬浮窗 · 标签页管理」，
            // 面板里不再堆 +/× 与表单（悬浮窗本来就窄，而且 API key 该在设置页填）。
            tabRegistry().map((d) => React.createElement('button', {
              type: 'button',
              role: 'tab',
              key: d.id,
              'aria-selected': tab === d.id,
              className: tab === d.id ? 'ocg-rail-btn active' : 'ocg-rail-btn',
              title: d.tip || d.name || d.id,
              onClick: () => switchTab(d.id),
              onPointerDown: (e) => e.stopPropagation(),
            }, d.short || d.name || d.id)),
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
            React.createElement('span', { className: 'opencg-pill-name' }, tabShort(tab)),
            React.createElement('span', { className: 'opencg-pill-val', key: 'pv' + pillVal }, pillVal));
          const expandBtn = React.createElement('button', {
            type: 'button',
            className: 'opencg-pill-btn',
            title: '展开面板（双击 / C / Esc）',
            'aria-label': '展开面板',
            onPointerDown: (e) => e.stopPropagation(),
            onClick: (e) => { e.stopPropagation(); setCollapsed(false); },
          }, '⤢');
          const header = React.createElement('div', {
            className: 'opencg-header', key: 'h',
            onDoubleClick: (e) => {
              const t = e.target;
              if (t && typeof t.closest === 'function' && t.closest('button')) return;
              toggleCollapse();
            },
          },
            collapsed ? pill : React.createElement('span', { className: 'ocg-prod-name', key: tab }, tabFull(tab)),
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
          if (curEntry && curEntry.custom) {
            // 自定义页：把接口来源与取数状态讲清楚（失败原因也给全，便于用户改字段路径）
            const segs = [];
            if (curData && Number.isFinite(curData.balance)) segs.push('余额 ' + curData.balance.toFixed(Number.isFinite(curData.decimals) ? curData.decimals : 2) + (curData.unit ? ' ' + curData.unit : ''));
            for (const w of ((curData && curData.windows) || [])) {
              const r = w.usedIsRemaining ? w.usedPercent : 100 - w.usedPercent;
              segs.push(w.label + ' 剩 ' + Math.round(r) + '%');
            }
            tip = (curEntry.name || '自定义标签页') + (segs.length ? ' · ' + segs.join(' · ') : '')
              + (curData && curData.source ? ' · ' + curData.source : '');
            if (curErr) tip += ' · 获取失败：' + curErr + '（点 ↻ 重试；可检查接口地址与字段路径）';
            else if (curData && curData.stale) tip += ' · 数据过期';
          } else if (tab === 'hc') {
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
          } else if (tab === 'bl') {
            if (bl) {
              const remOfWin = (w) => (w && Number.isFinite(w.usedPercent)) ? Math.max(0, Math.round(100 - w.usedPercent)) + '%' : '--';
              const mLabel = (bl.windows && bl.windows.monthly && bl.windows.monthly.kind === 'week') ? '每周' : '月度';
              const fiveSeg = (bl.windows && bl.windows.fiveHour && Number.isFinite(bl.windows.fiveHour.usedPercent))
                ? ' · 5小时 ' + remOfWin(bl.windows.fiveHour) : '';
              tip = '阿里云百炼 Token Plan' + (bl.planName ? ' · ' + bl.planName : '')
                + (bl.sub && Number.isFinite(bl.sub.remainingDays) ? '（剩 ' + bl.sub.remainingDays + ' 天）' : '')
                + fiveSeg
                + ' · ' + mLabel + ' ' + remOfWin(bl.windows && bl.windows.monthly)
                + (bl.credit && (Number.isFinite(bl.credit.remaining) || Number.isFinite(bl.credit.total))
                  ? ' · 月额度 ' + (Number.isFinite(bl.credit.remaining) ? blCr(bl.credit.remaining) : '--')
                    + (Number.isFinite(bl.credit.total) ? '/' + blCr(bl.credit.total) : '') + ' Credits'
                  : '');
              if (bl.stale) tip += ' · 数据过期';
              if (bl.secTokenError) tip += ' · sec_token 未取到';
            } else if (blErr) tip = '阿里云百炼 Token Plan 获取失败：' + blErr + '（点击重试）';
          } else {
            if (ds) {
              tip = 'DeepSeek 余额 ' + dsBalanceText + (ds.model ? ' · ' + ds.model : '')
                + ' · 预计剩余 ' + fmtTokens(ds.estTokens) + ' tokens（' + dsPeriodText(ds) + ' ¥' + fmtPerM(ds.pricePerMillion) + '/百万估算）';
              if (ds.stale) tip += ' · 数据过期';
            } else if (dsErr) tip = 'DeepSeek 余额获取失败：' + dsErr + '（点击重试）';
          }
          // DeepSeek 页的窗口悬浮说明带上官网用量页的数字（其余页的 tip 已是该 plan 自己的额度窗口）
          if (tab === 'ds') {
            tip += dsUsage
              ? ' · 官网本月已用 ≈' + fmtTokens(dsUsage.totalTokens) + ' tok（' + dsUsageCur + fmtMoney(dsUsage.totalCost) + '）'
              : ' · 官网本月已用 --';
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
              ['--opencg-ink']: String(tabOrder(tab)),
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