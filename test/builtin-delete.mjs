// builtin-delete.mjs — 「永久删除内置标签页」的 host 侧测试
//   这是本插件唯一会**改写自己源码**的功能，所以测得分外仔细：
//     ① 括号配对取值（跳字符串/注释/嵌套）
//     ② 源码外科删除只动 TAB_DEFS 与 DATA_SOURCES 两处，且改完仍是合法 JS
//     ③ 真实 client.js 副本上做一次真删除：文件真的改了、备份真的在、语法仍合法
//     ④ 幂等（已删过再删不炸）、白名单（非内置 id 一律拒绝）、最后一个不许删
//     ⑤ 源码里定位不到取数源时**中止且不改文件**（绝不留下半个改动）
// 用法：node test/builtin-delete.mjs
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { __test } = await import('../lib/index.js')
const { extractDelimited, removeBuiltinTab, deleteBuiltinTabPermanently, resolveClientSource, BUILTIN_TAB_IDS } = __test

let failed = 0
const ok = (cond, msg) => { if (!cond) failed++; console.log((cond ? 'PASS ' : 'FAIL ') + msg) }
const eq = (a, b, msg) => ok(Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b), msg + '（实际 ' + JSON.stringify(a) + '）')

const REAL_CLIENT = resolveClientSource()
ok(typeof REAL_CLIENT === 'string' && existsSync(REAL_CLIENT), '① resolveClientSource 找到 client.js（' + REAL_CLIENT + '）')

// ═══ ① 括号配对取值 ═══════════════════════════════════════════════════════════
{
  eq(extractDelimited('const a = [1, 2];', 10), '[1, 2]', '① 简单数组')
  eq(extractDelimited('const a = [1, [2, 3], 4];', 10), '[1, [2, 3], 4]', '① 嵌套数组')
  eq(extractDelimited("const a = ['}', [1], 2];", 10), "['}', [1], 2]", '① 字符串里的 } 不误判')
  eq(extractDelimited('const a = [1, /* ] */ 2];', 10), '[1, /* ] */ 2]', '① 注释里的 ] 不误判')
  eq(extractDelimited('const a = { x: [1, { y: 2 }] };', 10), '{ x: [1, { y: 2 }] }', '① 对象里的数组')
  eq(extractDelimited('const a = [1, 2;', 10), null, '① 不闭合 → null（调用方据此中止）')
  eq(extractDelimited("const a = ['it\\'s', 1];", 10), "['it\\'s', 1]", '① 转义引号')
}

// ═══ ② 纯函数层面的源码删除 ═══════════════════════════════════════════════════
const SAMPLE = [
  'const TAB_DEFS = [',
  "  { id: 'ds', short: 'DeepSeek', full: 'DeepSeek', theme: '#3b82f6', tip: 'a' },",
  "  { id: 'go', short: 'GOAT', full: 'GOAT', theme: '#f59e0b', tip: 'b' },",
  "  { id: 'oc', short: 'OC', full: 'OC', theme: '#8b5cf6', tip: 'c' },",
  '];',
  'const DATA_SOURCES = {',
  "  ds: { path: '/api/deepseek/balance', every: 30000 },",
  "  go: { path: '/api/goat/balance', every: 60000 },",
  "  oc: { path: '/api/oc/balance', every: 60000 },",
  '};',
].join('\n')

{
  // 删中间一条（两侧都有逗号）
  const r = removeBuiltinTab(SAMPLE, 'go')
  ok(r.removed.def && r.removed.def.indexOf("id: 'go'") >= 0, '② 取到被删的定义行（' + r.removed.def + '）')
  ok(r.removed.source && r.removed.source.indexOf('/api/goat/balance') >= 0, '② 取到被删的取数源')
  ok(r.code.indexOf("'go'") < 0 && r.code.indexOf('goat') < 0, '② 两处都被删掉了')
  ok(r.code.indexOf("id: 'ds'") >= 0 && r.code.indexOf("id: 'oc'") >= 0, '② 相邻的两条没被误伤')
  ok(r.code.indexOf('deepseek/balance') >= 0 && r.code.indexOf('/api/oc/balance') >= 0, '② 相邻取数源没被误伤')
  ok(!/,\s*,/.test(r.code), '② 没留下连续逗号')
  // 改完必须仍是合法 JS
  let syntaxOk = true
  try { new Function(r.code) } catch (e) { syntaxOk = false; console.log('   语法错：' + e.message) }
  ok(syntaxOk, '② 删除后仍是合法 JS')
  ok(r.removed.dataSourcesEmptied === false, '② 未清空 DATA_SOURCES')

  // 删最后一条（后面没有逗号）
  const r2 = removeBuiltinTab(SAMPLE, 'oc')
  ok(r2.code.indexOf("id: 'oc'") < 0 && r2.code.indexOf('/api/oc/balance') < 0, '② 删最后一条也干净')
  let ok2 = true
  try { new Function(r2.code) } catch (e) { ok2 = false; console.log('   语法错：' + e.message) }
  ok(ok2, '② 删最后一条后仍是合法 JS')
  ok(!/,\s*\]/.test(r2.code), '② 删最后一条后没留下「,]」')

  // 删不存在 / 非法 id
  const r3 = removeBuiltinTab(SAMPLE, 'zz')
  eq(r3.code, SAMPLE, '② 删不存在的 id → 源码原样不动')
  eq(r3.removed.def, null, '② 删不存在的 id → removed.def 为 null')
}

// ═══ ③ 在「完整六页基线」上做一次真删除 ═══════════════════════════════════════
// ⚠️ 不能直接拿本机 lib/client.js 当基线：这个功能就是用来裁内置页的，用户删过 hc/bl 之后
//    「基线里有 6 页」就不成立了。所以这里给一份**合成的完整源码**（含六个内置页的定义与取数源），
//    真删除、真落盘、真备份，只在临时目录里进行。
const FULL_BASELINE = `const TAB_DEFS = [
      { id: 'ds', short: 'DeepSeek', full: 'DeepSeek', theme: '#3b82f6', tip: 'ds' },
      { id: 'go', short: 'GOAT', full: 'GOAT', theme: '#f59e0b', tip: 'go' },
      { id: 'oc', short: 'OpenCode', full: 'OpenCode', theme: '#8b5cf6', tip: 'oc' },
      { id: 'hc', short: 'Hyper', full: 'Charm Hyper', theme: '#ec4899', tip: 'hc' },
      { id: 'sf', short: 'StepFun', full: 'StepFun', theme: '#10b981', tip: 'sf' },
      { id: 'bl', short: '百炼', full: 'Bailian', theme: '#ff6a00', tip: 'bl' },
    ];
    const DATA_SOURCES = {
      ds: { path: '/api/deepseek/balance', every: 30000 },
      go: { path: '/api/commandcode-goat/balance', every: 60000 },
      oc: { path: '/api/opencode-go/balance', every: 60000 },
      hc: { path: '/api/hypercharm/balance', every: 30000 },
      sf: { path: '/api/stepfun/balance', every: 60000 },
      bl: { path: '/api/bailian/plan', every: 60000 },
    };
    // 渲染分支（永久删除会**故意保留**它们：已不可达的死代码，删它风险更大）
    const hcChildren = [];
    const blChildren = [];
`
const dir = mkdtempSync(join(tmpdir(), 'ogm-del-'))
{
  const file = join(dir, 'client.js')
  writeFileSync(file, FULL_BASELINE, 'utf8')
  const before = readFileSync(file, 'utf8')
  const backupDir = join(dir, 'backups')

  // 先确认要删的页确实存在
  const defBlock = extractDelimited(before, before.indexOf('[', before.indexOf('const TAB_DEFS')))
  ok(defBlock.indexOf("id: 'hc'") >= 0, '③ 起点：基线里有 hc（Charm Hyper）')
  const countBefore = (defBlock.match(/^[ \t]*\{[^\n]*\bid:\s*['"][^'"]+['"]/gm) || []).length
  ok(countBefore === 6, '③ 起点：TAB_DEFS 里有 6 条内置页（' + countBefore + '）')
  ok(existsSync(REAL_CLIENT), '③ 本机确实能找到 lib/client.js（resolveClientSource 可用）')

  const res = await deleteBuiltinTabPermanently('hc', { file, backupDir })
  eq(res.ok, true, '③ 删除返回成功')
  eq(res.id, 'hc', '③ 返回被删的 id')
  ok(existsSync(res.backup), '③ 生成了备份文件（' + res.backup + '）')
  eq(readFileSync(res.backup, 'utf8'), before, '③ 备份内容 = 改动前的原文（可完整还原）')

  const after = readFileSync(file, 'utf8')
  ok(after !== before, '③ 源文件真的被改写了')
  ok(after.indexOf("id: 'hc'") < 0, '③ TAB_DEFS 里 hc 那一行没了')
  ok(after.indexOf('const hcChildren') >= 0, '③ 该页的渲染分支保留（故意留着，是死代码，删它风险更大）')
  ok(after.indexOf("path: '/api/deepseek/balance'") >= 0, '③ 别的页取数源没被误伤')

  const afterBlock = extractDelimited(after, after.indexOf('[', after.indexOf('const TAB_DEFS')))
  const countAfter = (afterBlock.match(/^[ \t]*\{[^\n]*\bid:\s*['"][^'"]+['"]/gm) || []).length
  eq(countAfter, 5, '③ TAB_DEFS 从 6 条变 5 条')

  // 关键：改写后的 client.js 必须仍是合法 JS（否则插件下次加载直接崩）
  let syntaxOk = true
  try { new Function(after) } catch (e) { syntaxOk = false; console.log('   语法错：' + e.message) }
  ok(syntaxOk, '③ 改写后的 client.js 仍是合法 JS')

  // DATA_SOURCES 也少了一条（hc 的取数源）
  const dsBlock = extractDelimited(after, after.indexOf('{', after.indexOf('const DATA_SOURCES')))
  ok(dsBlock.indexOf('hc:') < 0, '③ DATA_SOURCES 里 hc 的取数源也没了')
  ok(dsBlock.indexOf('ds:') >= 0 && dsBlock.indexOf('bl:') >= 0, '③ DATA_SOURCES 其余源完好')

  // ④ 幂等：已经删过再删不炸，且不再改文件
  const res2 = await deleteBuiltinTabPermanently('hc', { file, backupDir })
  eq(res2.alreadyGone, true, '④ 重复删除 → alreadyGone:true（幂等，不报错）')
  eq(readFileSync(file, 'utf8'), after, '④ 重复删除不再改动文件')

  // ④ 白名单：非内置 id 一律拒绝
  let err = null
  try { await deleteBuiltinTabPermanently('c_custom', { file, backupDir }) } catch (e) { err = e.message }
  ok(err && err.indexOf('只能永久删除内置页') >= 0, '④ 拒绝非内置 id（' + err + '）')
  let err2 = null
  try { await deleteBuiltinTabPermanently("x'; process.exit(1); //", { file, backupDir }) } catch (e) { err2 = e.message }
  ok(err2 && err2.indexOf('只能永久删除内置页') >= 0, '④ 拒绝注入式 id（白名单先于任何字符串操作）')

  // ④ 最后一个不许删：删到只剩 1 条时应被拦下
  for (const id of ['ds', 'go', 'oc', 'sf']) {
    await deleteBuiltinTabPermanently(id, { file, backupDir })
  }
  const left = extractDelimited(readFileSync(file, 'utf8'), readFileSync(file, 'utf8').indexOf('[', readFileSync(file, 'utf8').indexOf('const TAB_DEFS')))
  const leftCount = (left.match(/^[ \t]*\{[^\n]*\bid:\s*['"][^'"]+['"]/gm) || []).length
  eq(leftCount, 1, '④ 删到只剩 1 条')
  let err3 = null
  try { await deleteBuiltinTabPermanently('bl', { file, backupDir }) } catch (e) { err3 = e.message }
  ok(err3 && err3.indexOf('至少要保留一个内置标签页') >= 0, '④ 拒绝删最后一个（' + err3 + '）')
  const stillLeft = extractDelimited(readFileSync(file, 'utf8'), readFileSync(file, 'utf8').indexOf('[', readFileSync(file, 'utf8').indexOf('const TAB_DEFS')))
  ok(stillLeft.indexOf("id: 'bl'") >= 0, '④ 被拒后文件未被改动（bl 还在）')
}

// ═══ ⑤ 定位不到取数源 → 中止且不改文件 ═══════════════════════════════════════
{
  const file = join(dir, 'half.js')
  // 有 TAB_DEFS 但没有对应的 DATA_SOURCES 条目
  writeFileSync(file, [
    'const TAB_DEFS = [',
    "  { id: 'ds', short: 'DeepSeek', full: 'DeepSeek', theme: '#3b82f6', tip: 'a' },",
    "  { id: 'go', short: 'GOAT', full: 'GOAT', theme: '#f59e0b', tip: 'b' },",
    '];',
    'const DATA_SOURCES = {',
    "  ds: { path: '/api/deepseek/balance', every: 30000 },",
    '};',
  ].join('\n'), 'utf8')
  const before = readFileSync(file, 'utf8')
  let err = null
  try { await deleteBuiltinTabPermanently('go', { file, backupDir: join(dir, 'backups') }) } catch (e) { err = e.message }
  ok(err && err.indexOf('没找到它的取数源') >= 0, '⑤ 缺取数源时报错中止（' + err + '）')
  eq(readFileSync(file, 'utf8'), before, '⑤ 中止时**原文件一字未改**（不留半个改动）')
}

rmSync(dir, { recursive: true, force: true })
console.log(failed === 0 ? 'BUILTIN_DELETE_OK' : 'BUILTIN_DELETE_FAILED: ' + failed)
process.exit(failed === 0 ? 0 : 1)
