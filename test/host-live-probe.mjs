// host-live-probe.mjs — 用真实控制台凭据跑一次 live 探针（会访问阿里云，需联网）
//   凭据来源优先级：环境变量 BAILIAN_CONSOLE_COOKIE → ~/.dsh/.credentials.yaml 的
//   BAILIAN_CONSOLE_COOKIE / BAILIAN_CONSOLE_COOKIES / BAILIAN_CONSOLE_CURL。
//   没配凭据时只打印配置指引并以 0 退出（跳过），不会失败。
// 用法：
//   node test/host-live-probe.mjs                  # 用已有凭据
//   COOKIE='login_aliyunid_ticket=...' node test/host-live-probe.mjs   # 临时指定（不落盘）
import { existsSync, readFileSync } from 'node:fs'

function fromCredentialStore() {
  const file = (process.env.HOME || '') + '/.dsh/.credentials.yaml'
  if (!existsSync(file)) return null
  const text = readFileSync(file, 'utf8')
  for (const name of ['BAILIAN_CONSOLE_COOKIE', 'BAILIAN_CONSOLE_COOKIES', 'BAILIAN_CONSOLE_CURL']) {
    const m = text.match(new RegExp('^\\s{2}' + name + ':\\s*(.+)$', 'm'))
    if (m && m[1].trim()) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return null
}

const cookie = process.env.BAILIAN_CONSOLE_COOKIE || process.env.COOKIE || fromCredentialStore()
if (!cookie) {
  console.log('SKIP: 未配置百炼控制台凭据 —— 先在 DSH 设置 → 凭据 添加 BAILIAN_CONSOLE_COOKIE（控制台 Cookie 头 / 整段 cURL），')
  console.log('      取法：登录 bailian.console.aliyun.com/cn-beijing/subscription/token-plan/personal →')
  console.log('            F12 → Network → 筛 data/api.json → 右键任一请求 → 以 cURL 格式复制 → 整串粘贴')
  process.exit(0)
}

const { apply } = await import('../lib/index.js?probe=' + Date.now())
const routes = {}
apply({
  credentials: { resolve: async (name) => (name === 'BAILIAN_CONSOLE_COOKIE' ? { value: cookie } : null) },
  webServer: { register: ({ path, handler }) => { routes[path] = handler; return () => {} } },
  effect: (fn) => fn(),
})

const res = { setHeader() {}, end(body) { this.body = body } }
await routes['/api/bailian/plan']({}, res)
const payload = JSON.parse(res.body)
console.log(JSON.stringify(payload, null, 2))
if (!payload.ok) {
  console.log('\nLIVE_PROBE_NOT_OK: ' + payload.error)
  process.exit(2)
}
console.log('\nLIVE_PROBE_OK')