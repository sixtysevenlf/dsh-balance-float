# 余额悬浮窗（dsh-opencode-go-monitor）

DSH（DeepSeek Harness）Web UI 悬浮面板插件：**六标签页** 实时显示 **DeepSeek / Command Code GOAT / OpenCode Go / Charm Hyper / 阶跃星辰 StepFun / 阿里云百炼 Token Plan** 的余额与套餐额度（左侧纵向品牌轨切换，带滑动+淡入动画）。

## 功能

- **六标签页（v3 纵向品牌轨）**：DeepSeek 余额 / Command Code GOAT 额度 / OpenCode Go 额度 / Charm Hyper 余额 / 阶跃星辰 StepFun 额度 / 阿里云百炼 Token Plan 额度；点击左侧轨上的厂牌按钮切换，激活项按服务商主题色高亮（DeepSeek 蓝 / GOAT 橙 / OpenCode 紫 / Hyper 粉 / StepFun 绿 / 百炼阿里橙 `#ff6a00`），轨左缘有一条随激活项滑动的主题色墨条；轨内可滚动，最小窗高下也不会挤掉底部收起键
- **OpenCode Go 页**：官方订阅额度三窗口（**滚动 / 每周 / 每月**）：剩余 %（绿≥50% / 橙≥25% / 红<25%）+ 进度条 + 已用 % + 重置倒计时，外加最近一次窗口重置倒计时
- **Command Code GOAT 页**：5 小时 / 每周 两档滚动窗口：剩余 %（绿≥50% / 橙≥25% / 红<25%）+ 进度条 + 已用 % + 重置倒计时，外加 **月度余额**（美元：月度+已购+免费三池合计）。**窗口无用量时** Command Code 会把 `resetAt` 回成 `0`（实测）——此时倒计时显示「空闲」并在悬浮说明里写清原因，不显示含义不明的 `--`、也不编造重置时刻
- **用量一律取该 plan 自己的用量页/接口**（不本地统计）：DeepSeek 页显示**官网用量页**的本月 token / 花费，其余页显示各自 plan 的额度窗口（见下）
- **DeepSeek 页**：余额、**本月已用**（platform.deepseek.com 用量页口径的当月 token，尾注「官网」）、**本月花费**（当月金额 + 官网日均）、预计剩余 tokens（按官方现行价 + 本账户用量结构折算的有效单价估算，尾注当前空闲/高峰时段与单价）、当前模型
- **Charm Hyper 页**：余额（hypercredits）+ 约合美元（官方 balance_usd，或按 20 hc ≈ $1 折算）
- **阶跃星辰 StepFun 页**：主显示 **Step Plan 订阅额度**（当月 Credit 月池剩余比例 + 月池重置时间 + 加油包剩余 Credit + 套餐状态/到期），附 **按量账户余额**（元，尾注 预付费/后付费；充值/赠送两池在悬浮说明里）。订阅额度取自控制台内部 RPC（见下），API key 拿不到；字段缺失一律显示 `--`，不臆造 0
- **阿里云百炼 Token Plan 页**：主显示 **月度额度窗口**（剩余 % + 进度条 + 已用 % + 重置倒计时）+ **月度 Credits**（剩余 / 总量，由档位月上限 × 窗口比例折算）+ **套餐**（Essential / Standard / Pro…，订阅剩余天数；状态/到期/自动续费/实例码/用量包在悬浮说明里）。额度取自百炼控制台内部网关（见下），套餐 API key（`sk-sp-`）拿不到；字段缺失一律显示 `--`，不臆造 0
- **操控**：空白处按下即可**拖动**（位置记忆，释放时靠近屏幕边缘自动吸附贴齐）· 点击空白 / ↻ 按钮**立即刷新**（刷新期间按钮转圈）· 右下角**调整大小**（尺寸记忆，**双击手柄恢复默认尺寸**）
- **标签页增删全在设置里**：**设置 → 通用 → 余额悬浮窗 · 标签页管理**——新增第三方接口页、**删除内置页**（不改代码、可逆）、停用/删除自定义页。悬浮窗上的品牌轨只负责切换显示，**不放任何增删控件**（窗本来就窄，且 API key 该在设置页填）。详见下方[增删标签页](#增删标签页)
- **收起/展开**：点品牌轨底部「−」、双击标题栏或按 `C` 收起为**迷你胶囊**（只显示当前服务商的 1 个关键数值，状态记忆）；点胶囊或按 `Esc` 展开
- **键盘**（点一下悬浮窗获得焦点）：`←` / `→` 切换标签（环绕）· `R` 刷新 · `C` 收起/展开 · `Esc` 展开
- **外观**：毛玻璃质感空闲时轻度半透明、悬浮/聚焦恢复；深色模式下自动切换为暗玻璃配色（跟随 DSH `body[data-ds-dark-theme]`，切主题即时生效）；尊重系统「减少动态效果」偏好
- 轮询：DeepSeek 余额每 30s、DeepSeek 官网用量每 60s、Command Code GOAT 每 60s、OpenCode Go 每 60s、Charm Hyper 每 30s、阶跃星辰 StepFun 每 60s、阿里云百炼 Token Plan 每 60s

> 已移除原「省钱」功能：限额、超限断点截断、低耗压缩、官网用量分析、语音提醒、时段建议等。

## 用量口径：只读各 plan 自己的用量（不本地统计）

面板上的用量**一律来自对应 plan 自己的用量页/接口**，本插件不做本地统计、也不用余额折算：

| 标签页 | 用量来源（就是该 plan 网页上的那个数） | 面板显示 | 凭据 |
| --- | --- | --- | --- |
| DeepSeek | **官网用量页** platform.deepseek.com 同源接口：`/api/v0/usage/amount` + `/api/v0/usage/cost`（当月 token / 金额 / 请求数 / 日均 / 按模型） | 本月已用、本月花费（悬浮看三桶与日均） | `DEEPSEEK_PLATFORM_TOKEN`（控制台 userToken，**不是 API key**） |
| Command Code GOAT | 官方 `/alpha/billing/credits` 的 `windowLimits`（5 小时 / 每周窗口 `used`/`cap`） | 5小时 / 每周：剩余 % + 进度条 + 已用 % | `COMMANDCODE_API_KEY` |
| OpenCode Go | 官方 `/usage`（滚动 / 每周 / 每月窗口百分比） | 三窗口：剩余 % + 进度条 + 已用 % | `OPENCODE_GO_API_KEY` |
| Charm Hyper | **官网没有用量接口**（实测 `/v1/usage`、`/v1/subscription`、`/v1/me`、`/v1/account`、`/v1/billing/usage`、`/v1/credits/history` 全部 404，只有 `/v1/credits` 余额） | 只有余额，不编造用量 | `HYPER_API_KEY` |
| 阶跃星辰 StepFun | 控制台内部 RPC `QueryStepPlanRateLimit`（Credit 月池剩余比例 + 加油包 + 重置时间） | 订阅额度剩余 % + 月池重置 + 月池/加油包余额 | `STEPFUN_CONSOLE_COOKIE` |
| 阿里云百炼 Token Plan | 控制台网关 `/data/api.json?...tokenplan/personal/api/v2/usage` + `quota-config`（月度窗口已用 % + 档位额度） | 月度窗口剩余 % + 进度条 + 月额度（剩余/总量） | `BAILIAN_CONSOLE_COOKIE` |

### DeepSeek 官网用量（本月已用 / 本月花费）

- **口径**：platform.deepseek.com 用量页背后的同源 JSON 接口，即网页上显示的当月数据；`REQUEST` 单独计请求数，不计入 token；三桶 = 输入·缓存命中 / 输入·缓存未命中 / 输出
- **凭据**：控制台会话 `userToken`（Bearer）。取值顺序：DSH 凭据 `DEEPSEEK_PLATFORM_TOKEN` → 环境变量 `OGM_PLATFORM_TOKEN` → 尽力而为从浏览器 Local Storage 自动读取（Chrome / Edge / 360 / Brave；WSL 下会扫 `/mnt/c/Users/*/AppData/...`）。`OGM_PLATFORM_AUTO_TOKEN=0` 可关掉浏览器扫描
- **失效表现**：官网鉴权失败是 **HTTP 200 + `code` 40002/40003**（实测），此时该行显示 `--` + 橙色小字「官网 · 未取到」，悬浮说明给出 code 与修法；**不会拿本地数据顶上**
- **刷新**：60s 缓存；刷新按钮 / `R` 会一起刷新
- 取数地址可用 `OGM_PLATFORM_AMOUNT_URL` / `OGM_PLATFORM_COST_URL` 覆盖（集成测试指向本地 mock）

> 为什么不是「本地统计」：会话日志/投影缓存里只有 provider 归属的 token 总量，**没有 plan 的额度口径**（百分比、Credit、窗口 cap/used），
> 也没法还原 plan 网页的请求数与金额；按用户要求，面板一律以 plan 自己的用量为准，取不到就显示取不到。
## 预计剩余估算口径（2026-09 官方调价后）

官方现行价（¥/百万 tokens，**空闲时段价**；高峰时段 = 空闲 × 2）：

| 模型 | 输入·缓存命中 | 输入·缓存未命中 | 输出 |
| --- | --- | --- | --- |
| deepseek-flash（旧名 `deepseek-v4-flash` / `deepseek-v4-flash-vision-exp` 现由 V4.1-Flash 提供服务，按 Flash 计费） | 0.02 | 1 | 4 |
| deepseek-v4-pro | 0.15 | 4.5 | 13.5 |

- **高峰时段**：北京时间周一至周五 09:00-12:00、14:00-18:00；其余时间（含周末全天）为空闲时段
- **有效单价**＝输入侧（缓存命中率加权）× 输入占比 ＋ 输出价 × 输出占比；命中率与占比取本账户 2026-08 官网平台实测（命中 721.98M / 未命中 6.84M / 输出 4.69M → 命中率 99.1%、输出占比 0.6%）
- 推算结果：Flash 空闲 ≈ **¥0.0546/百万**、高峰 ≈ **¥0.1092/百万**；Pro 空闲 ≈ ¥0.2759/百万、高峰 ≈ ¥0.5518/百万
- 面板「预计剩余」＝ 余额 ÷ 当前时段有效单价，行尾标注「空闲/高峰 + 单价」；鼠标悬浮可看完整口径（官方三档价、命中率、另一时段估算）
- 对照 2026-09 调价前（Flash 命中 0.05 / 未命中 1.5 / 输出 4.5）：同余额下预计剩余约为调价前的 **2.2 倍**
- 价格来源：[DeepSeek 官方「模型 & 价格」页](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)

> 估算仅为参考：实际花费取决于缓存命中率、输出占比与所用模型；切换模型（Flash ↔ Pro）后按对应价目重算。命中率与占比是**本账户实测常数**（其他部署请按自己账号的平台月报改 `DS_USAGE_SAMPLE`），改价只改 `DS_PRICE_OFFPEAK` 一处即可。
>
> 未建模：法定节假日（官方公告里也按空闲计价，影响 <1%）；若 V4 Pro 后续改由 Flash 提供服务，按模型名仍走 Pro 价目（估算偏保守）。

## Step Plan 订阅额度取数口径（2026-09-20 实测）

阶跃星辰**没有任何公开的订阅额度端点**：`GET /v1/accounts` 只给按量计费账户余额（元），
`/step_plan/v1/*` 下的 `accounts` / `credit` / `usage` 全部 404，plan 通道调用响应头里也没有额度字段。
订阅的「Credit 月池」只在**控制台内部 RPC**里（connect 协议 + Oasis 会话鉴权，用 API key 调用一律
`403 api key not permitted for this method`）：

| RPC | 提供的字段 |
| --- | --- |
| `POST /api/step.openapi.devcenter.Dashboard/GetStepPlanStatus` | `subscription{name,status,plan_type,activated_at,expired_at,auto_renew,plan_family}`、`plan_definition{zh_display,price,billing_cycle}` |
| `POST /api/step.openapi.devcenter.Dashboard/QueryStepPlanRateLimit` | `plan_family`（1=CODING 旧套餐窗口；2=TOKEN Credit 月池）、`plan_credit_rate_limit{subscription_credit_left_rate(0..1),subscription_credit_reset_time,topup_credit_left_rate,credit_buckets[{type,credit_total,credit_residual,expire_at}]}`、旧套餐的 `five_hour_usage_left_rate` / `weekly_usage_left_rate` |
| `POST /passport/proto.api.passport.v1.PassportService/RefreshToken` | 带会话 Cookie 换新访问令牌（`accessToken.raw`；同时轮换 refresh token） |

- **鉴权形态（实测）**：控制台请求头里**没有** `oasis-token`，鉴权全在 Cookie 的 `Oasis-Token` 上，其值是
  **复合 journal**：`<访问令牌JWT>...<刷新令牌JWT>`（中间是字面三个点，对应 passport 的 `journal_b64`）。
  用 API key、或把两段拆开的单个 JWT 去调用，一律 `401 token is illegal`；**整条 journal 原样发就 200**。
  因此面板对凭据是「原样透传」（请求头 + Cookie 都带），**不主动续期**；只有真收到 401 才走一次
  `RefreshToken` 续期并在内存里换新 journal（不写回凭据文件）。实测 journal 内嵌的访问令牌过期后
  仍然可用（服务端按 journal 判定），所以正常情况下配一次即可长期使用
- 其余请求头：`Oasis-appID: 10300`、`Oasis-Platform: web`、`Oasis-Webid`/`Oasis-Did`（设备 id，从 journal 的 `device_id` 声明或粘贴内容里取）
- 时间戳是 **epoch 秒**（host 侧统一归一成毫秒再交给面板）；`credit_*` 是 int64，protojson 可能给字符串
- 额度口径：**1M Credit = ¥1**，月池月末清零不结转；面板「加油包」行只统计 `credit_buckets` 里 `type=TOPUP` 的剩余合计

## 阿里云百炼 Token Plan 取数口径（2026-09-23 真凭据实测）

百炼的**套餐专属通道**（`sk-sp-` Key + `https://token-plan.cn-beijing.maas.aliyuncs.com`）只提供推理，
`/compatible-mode/v1/models`、chat completions 的响应头里**没有任何额度字段**；配额只在**控制台内部网关**里：

| 网关 | 实测载荷 |
| --- | --- |
| `POST https://bailian-cs.console.aliyun.com/data/api.json?action=BroadScopeAspnGateway&product=sfm_bailian&api=zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage` | `{ per1MonthPercentage: 0.0659, per1MonthResetTime: 1792771200000 }` —— **个人版只有月窗口**（对照官方「月限额、无周额度限制」）；历史/其它口径的 `per1WeekPercentage`、`per5HourPercentage` 保留为多候选，命中 week 字段时面板会改显「每周」 |
| 同上 `.../api/v2/subscription`（`Data.commodityCode=sfm_tokenplansolo_public_cn`） | `{ instanceCode, specCode: 'essential', remainingDays: 30, startTime, endTime, autoRenewFlag, status: 'VALID' }` —— 档位 + 订阅状态/到期/剩余天数 |
| 同上 `.../api/v2/quota-config` | `{ <档位>: { five_hour, monthly }, addon_quota: { extrabundle } }`，实测：标准 3000/45000、Lite 700/11500、Pro 12000/180000、Essential 1800/25500，用量包 20000（**即使未登录也返回**，但不含"你是哪档"，故仍要登录态） |
| `POST https://bailian.console.aliyun.com/data/api.json?action=GetSubscriptionSummary&product=BssOpenAPI-V3`（`params={"ProductCode":"sfm_tokenplansolo_public_cn"}`） | 个人版恒为 0（`TotalCount 0 / TotalValue "0"`）→ 插件判定「无数据」，月额度改用 **档位月上限 × 月窗口已用 %** 折算并在悬浮说明里标注来源（团队版若返回真数则优先用汇总） |

- **鉴权**：控制台 Cookie（`bailian-cs.console.aliyun.com` 域 + 全部 Cookie 原样透传）+ `sec_token`
  +（有则）`x-xsrf-token` = cookie 里的 `login_aliyunid_csrf`。`params.Data.cornerstoneParam` 描述控制台上下文，
  **不写死 `switchAgent`**（那会绑定到某账号的 workspace，换账号会 `BailianGateway.Workspace.NotAuthorised`）
- **凭据形态**：两种「Copy as cURL」都吃得下 —— ① `-H 'cookie: ...'` + `-H 'sec_token: ...'`；
  ② Chromium/Edge 的 `-b '...'` + `sec_token` 在 `--data-raw` 表单里（自动解析 cookie / sec_token / csrf）
- **sec_token 三条来路**（按优先级，2026-09-23 实测修正）：
  ① **主通道**：用 Cookie 调登录态网关 `GET /tool/user/info.json` 换新 `sec_token` —— 只要 Cookie 还有效就能持续续期，
  配一次即可长期使用（同一凭据内缓存，鉴权失败才重铸）；
  ② 凭据里粘贴的 `sec_token`（页面级短时效值，兜底）；
  ③ 抓控制台 HTML 的 `window.ALIYUN_CONSOLE_CONFIG.SEC_TOKEN`（**实测真控制台并不下发**，最后兜底；Node 的 `fetch`
  会把 `Sec-Fetch-Mode` 固定成 `cors`，故这一步走 `node:https` 精确控制导航头）
- **鉴权失败自动恢复**：网关回鉴权错误 → 丢掉当前 token → 重铸（失败再抓一次 HTML）→ 同一请求重试一次
- **失败分类**（不再只说「登录失效」）：仍失败时调 `loginInfo` 读 `loginStatus`，区分
  「控制台会话已失效（`loginStatus=NOT_LOGINED`）→ 重新登录后重贴 Cookie」与
  「Cookie 仍有效但缺新鲜 `sec_token` → 重贴一条带 `sec_token` 的 cURL」；`/api/bailian/plan` 会带
  `loginStatus` / `mintError` / `secTokenSource` 三个诊断字段
- **错误帧**：网关是双层信封 `{code, data:{success,errorCode,errorMsg}, successResponse}`，失败时内层
  `success:false`（实测：无 Cookie → `BailianGateway.Login.NotLogined`；BSS → `ConsoleNeedLogin: 请登录`）；
  额度对象可能被塞进 JSON 字符串里，host 侧做递归展开 + 深度搜索
- **面板口径**：窗口百分比是「已用」比例（面板显示 `100 - usedPercent`）；个人版没有 5 小时百分比时
  **不渲染 5 小时行**（不留永远 `--` 的空行），有该窗口的账号照常显示；字段缺失一律 `--`，不臆造 0
- 参考实现：[CodexBar 的 Alibaba Token Plan provider](https://github.com/steipete/CodexBar/blob/main/docs/alibaba-token-plan.md)（字段名基线）

## 前置条件

| 依赖 | 说明 |
| --- | --- |
| DeepSeek Harness（web 或桌面端） | 插件运行在 DSH 内 |
| DeepSeek API key | DSH **设置 → 凭据** 添加 `DEEPSEEK_API_KEY`（DeepSeek 余额标签页用） |
| DeepSeek 官网用量页 token | DSH **设置 → 凭据** 添加 `DEEPSEEK_PLATFORM_TOKEN`（DeepSeek 页「本月已用 / 本月花费」用）。取法：登录 [platform.deepseek.com](https://platform.deepseek.com) → F12 → Application → Local Storage → `https://platform.deepseek.com` → 复制 `userToken` 的值。**这是控制台会话 token，不是 API key**，会过期；未配置时插件会尽力从浏览器（Chrome / Edge / 360，WSL 下扫 `/mnt/c`）自动读取 |
| Command Code GOAT 订阅 + API key | DSH **设置 → 凭据** 添加 `COMMANDCODE_API_KEY`（在 [commandcode.ai/settings](https://commandcode.ai/settings) 创建，`user_` 开头；也兼容 `COMMAND_CODE_API_KEY` 命名或环境变量 `COMMAND_CODE_API_KEY`，未配置时尽力而为读取 Command Code CLI 登录凭据 `~/.commandcode/auth.json`） |
| Charm Hyper 订阅 + API key | DSH **设置 → 凭据** 添加 `HYPER_API_KEY`（兼容 `HYPERCHARM_API_KEY` 命名或环境变量） |
| OpenCode Go 订阅 | DSH **设置 → 凭据** 添加 `OPENCODE_GO_API_KEY`（兼容 `OPENCODE_API_KEY` / 同名环境变量）；未配置时自动读 opencode 登录凭据 `~/.local/share/opencode/auth.json` 的 `opencode-go` 条目，WSL 下还会探测 Windows 用户目录 `/mnt/c/Users/<用户>/.local/share/opencode/auth.json` |
| 阶跃星辰 StepFun 账户（按量余额） | DSH **设置 → 凭据** 添加 `STEPFUN_API_KEY`（[platform.stepfun.com](https://platform.stepfun.com) 控制台创建；兼容 `STEP_API_KEY` 命名或同名环境变量）。走国内站 `https://api.stepfun.com/v1/accounts` —— 国际站 `api.stepfun.ai` 的 key 与国内站不通用 |
| 阶跃星辰 Step Plan 订阅额度 | DSH **设置 → 凭据** 添加 `STEPFUN_CONSOLE_COOKIE`（推荐）或 `STEPFUN_CONSOLE_TOKEN`。取法：登录 [platform.stepfun.com](https://platform.stepfun.com) → F12 → Network → 筛 `Dashboard` → 右键任一 `Dashboard/...` 请求 → **以 cURL 格式复制** → 整串粘进凭据（会自动解析出 Cookie 与 oasis-token）。带 Cookie 时插件用刷新令牌自动续期，只需配一次；只配 `STEPFUN_CONSOLE_TOKEN`（oasis-token 头）则约 30 分钟过期需重贴。未配置时该页只显示按量账户余额，订阅额度行显示 `--` + 「未配置控制台令牌」 |
| 阿里云百炼 Token Plan 额度 | DSH **设置 → 凭据** 添加 `BAILIAN_CONSOLE_COOKIE`（兼容 `BAILIAN_CONSOLE_COOKIES` / `BAILIAN_CONSOLE_CURL` 或同名环境变量）。取法：登录 [bailian.console.aliyun.com](https://bailian.console.aliyun.com/cn-beijing/subscription/token-plan/personal) → F12 → Network → 筛 `data/api.json` → 右键任一请求 → **以 cURL 格式复制** → 整串粘进凭据（会自动解析出 Cookie、sec_token、csrf）。未配置时该页窗口与额度都显示 `--`，状态行给「未配置 BAILIAN_CONSOLE_COOKIE」 |

## 隐私说明

- API key 只在进程内存中使用，用于调用官方余额接口，**不落盘、不写日志、不发给任何第三方**
- 控制台凭据（`STEPFUN_CONSOLE_COOKIE` / `STEPFUN_CONSOLE_TOKEN` / `BAILIAN_CONSOLE_COOKIE`）同样只在进程内存中使用：
  StepFun 凭据只发给 `platform.stepfun.com`，百炼凭据只发给 `bailian-cs.console.aliyun.com` 与 `bailian.console.aliyun.com`
  （取额度 + 抓 sec_token），请求体里不携带凭据，出错信息里也不打印凭据
- 仓库内不含任何密钥 —— 每个部署者在自己的机器上配置自己的凭据，看到的是自己的余额

## 安装

### 方式一：标准流程（热加载）

1. 把插件文件夹（含 `package.json` 和 `lib/`）整个复制到 `$DSH_HOME/profiles/node_modules/dsh-opencode-go-monitor/`
2. 编辑 `$DSH_HOME/profiles/web/cordis.patch.yml`（没有则新建，内容为 `[]`），追加：

   ```yaml
   # 余额悬浮窗
   - insert:
       - id: opencode-go-monitor
         name: 'dsh-opencode-go-monitor'
   ```

3. `cordis.patch.yml` 修改会**热加载**，无需重启；刷新浏览器页面（Ctrl+Shift+R）即可看到面板
4. 配置凭据：DSH **设置 → 凭据** → 添加 `DEEPSEEK_API_KEY`、`COMMANDCODE_API_KEY`、`HYPER_API_KEY`、
   `OPENCODE_GO_API_KEY`、`STEPFUN_API_KEY`（+ `STEPFUN_CONSOLE_COOKIE` 看订阅额度）、`BAILIAN_CONSOLE_COOKIE`（看百炼套餐额度）

### 方式二：super-injector（如果装有）

```text
dev_install_package dir=<本文件夹绝对路径>
```

## 排错

| 现象 | 处理 |
| --- | --- |
| 状态行「余额失败：未配置 COMMAND_CODE_API_KEY 凭据」 | DSH 设置 → 凭据 添加 `COMMANDCODE_API_KEY`，或设置环境变量 `COMMAND_CODE_API_KEY`，或确认已 `cmd login`（自动读取 `~/.commandcode/auth.json`） |
| 状态行「余额失败：HTTP 401」 | key 无效/过期，到对应服务商控制台重新生成 |
| DeepSeek 余额显示为负 | 账户余额已用超，注意在 [platform.deepseek.com](https://platform.deepseek.com) 充值 |
| 百炼页状态行「控制台登录已失效」/ `BailianGateway.Login.NotLogined` | 控制台 Cookie 过期：重新登录 bailian.console.aliyun.com → F12 复制任一 `data/api.json` 的 cURL → 重贴 `BAILIAN_CONSOLE_COOKIE` |
| 百炼页额度显示 `--` 但状态行不报错 | 网关偶发「200 Success 空载荷」（插件已自动重试 3 次）；仍未出数时把状态行 hover 的 debug 样本发出来对着改解析 |
| 百炼页 `sec_token 未取到` | 控制台 HTML 抓不到 `SEC_TOKEN`：请在复制 cURL 时**带上** `sec_token` 请求头（F12 里该请求的 header 就有），插件会直接用粘贴值 |
| 面板完全不显示 | 确认 `cordis.patch.yml` 注册行格式、`profiles/node_modules/dsh-opencode-go-monitor` 路径；浏览器硬刷新（Ctrl+Shift+R）；F12 控制台看红色报错 |

## 卸载

1. 从 `cordis.patch.yml` 删除注册行（热加载立即移除）
2. 删除 `profiles/node_modules/dsh-opencode-go-monitor/` 文件夹

## 增删标签页

标签页元数据只在**一个地方**声明：`lib/client.js` 顶部的 `TAB_DEFS`。面板顺序、rail 按钮、
切换动画方向、主题色、胶囊短名、标题栏全名、键盘 `←→` 环绕、以及「墨条下标」全部由它派生
（以前这些散在 12 处，改一个标签页要动十几行）。

### 删一个内置标签页（两步）

1. `lib/client.js` 的 `TAB_DEFS` 里注释掉那一行
2. 同文件 `DATA_SOURCES` 里注释掉同 id 的取数行

它的渲染分支留着无害（该 id 已不在注册表，永远不会被选中）。想删干净就连渲染分支和 host 侧
路由一起删。

### 加一个内置标签页（三步）

1. `TAB_DEFS` 加一行：`{ id, short, full, theme, tip }`
2. `DATA_SOURCES` 加一行：`{ path: '/api/<你的服务>/balance', every: 60000 }`
3. `lib/index.js` 加一条同源路由（照抄任一现有 provider 的取数函数），再在 `paneChildren`
   的分发里接上它的渲染分支

### 加/删第三方接口标签页（懒人化：贴个官网链接就行）

**设置 → 通用 → 余额悬浮窗 · 标签页管理 → ① 贴一个官网链接，自动识别余额接口**

最省事的用法就是贴主站链接（`platform.deepseek.com`、`openrouter.ai`、`api.moonshot.cn`…）再点「自动识别」：

1. **先认域名**：在内置的已知服务商目录里匹配（DeepSeek / OpenRouter / Moonshot / SiliconFlow /
   Command Code GOAT / Charm Hyper / StepFun / 百炼），命中就用它们的**官方余额接口**
2. **再实测**：真的去打那个接口，取到「像余额」的字段才算通过（置信度 `high`）
3. **自动判断该显示什么**：
   | mode | 含义 | 例子 |
   | --- | --- | --- |
   | `wallet` | 只显示**钱包余额** | DeepSeek 只有充值余额、Charm Hyper 只有 credits |
   | `plan` | 只显示**套餐剩余额度** | 百炼个人版只有月窗口百分比 |
   | `both` | **两者都显示** | Command Code GOAT 既有月度余额又有 5 小时/每周窗口 |
4. **认不出来就降级，不假装成功**：不在目录里 → 用你的域名探测 26 个常见端点
   （`/v1/balance`、`/v1/credits`、`/v1/user/info`、`/v1/usage`…）：命中「百分比型」按套餐额度显示、
   命中「数值型」按钱包余额显示；全都失败 → 给可编辑草稿 + 「去 F12 找接口」的指引（置信度 `low`）

识别结果**直接填进下面的表单**（名称 / 接口地址 / 余额字段路径 / 单位），并列出判断依据
（命中哪个服务商、实测到什么、为什么判成钱包或套餐）与要配的 DSH 凭据名。保存前你都能改。

也可以手工填：

| 字段 | 说明 |
| --- | --- |
| 标签页名称 | 显示用（rail 上取前 10 字） |
| 接口地址 | 必须 `http(s)://` 开头且返回 JSON |
| API key | 可空。**只保存在 host**，`Authorization: Bearer <key>` 由 host 代发；绝不下发浏览器 |
| 余额字段路径 | 点路径，如 `data.total_credits`（支持数组下标 `items.0.v`），默认 `balance` |
| 单位 | 可空；填 `USD` / `CNY` 会自动加 `$` / `¥` |

列表里每一页都会显示状态（显示中 / 已隐藏 / 已停用），自定义页还会显示**轮询间隔 · 取值字段 · 接口地址**，
方便自查配置；页尾给出配置文件绝对路径，你能直接看到 API key 明文存在哪个文件。

| 动作 | 适用 | 行为 |
| --- | --- | --- |
| **隐藏 / 恢复** | 全部页 | 纯前端，`localStorage` 记忆，不碰 host 配置与源码 |
| **永久删除** | **内置页** | **真的改插件源码**把它移掉（`TAB_DEFS` + `DATA_SOURCES` 两处），改前自动备份；**两击确认** |
| **停用 / 启用** | 自定义页 | 保留配置与 key，只是不显示（写 host 的 `disabled`） |
| **删除** | 自定义页 | 连它保存的 API key 一起从磁盘删掉（配置需重填） |
| **+ 新增标签页** | — | 展开表单手工填 |

- **防呆：不允许删到「一个都不剩」**——隐藏/删除最后一个时提示「至少要保留一个标签页」并**不执行**。
  否则悬浮窗会变成没有任何页的空壳，而你已经看不到品牌轨、也就无从点回来。
- 内置页的「永久删除」细节：只动 `TAB_DEFS` 与该页 `DATA_SOURCES` 那一行 → 语法自检（不通过就中止、
  原文件一字不改）→ 先把 `client.js` 备份到 `backups/client.before-delete-<id>-<时间>.js` 再原子写回。
  想还原就用备份覆盖回 `lib/client.js`。该页的渲染分支会被保留（已不可达的死代码，删它风险更大）。
- 配置文件：`$DSH_HOME/dsh-opencode-go-monitor.json`（可用 `OGM_CONFIG` 覆盖），原子写
- 取数链路：浏览器 → `/api/monitor/custom-balance?id=<tabId>` → host 代发上游。
  查询串里只有 tab id，**浏览器无法借这个端点探测任意主机**
- host 半没重启（端点 404）时：内置页的**隐藏照样可用**（不依赖 host）；**永久删除**、自定义页增删与
  自动识别会明确报「本地服务不可用（HTTP 404）——host 半是否还没重启？」；已配置的自定义页仍照常显示

> ⚠️ 自定义页的 API key 以明文存在上面那个 JSON 文件里（权限交给操作系统）。介意明文的话，
> 就别用「自填 key」这条路，改成内置页并走 DSH 凭据（设置 → 凭据）。

## 结构

```
├── package.json      # 插件清单（dsh.client 双半声明）
└── lib/
    ├── index.js      # host 半：/api/commandcode-goat/balance（GOAT 官方接口，60s 缓存）
    │                 #       /api/deepseek/balance（DeepSeek 官方接口，5s 缓存）
    │                 #       /api/opencode-go/balance（OpenCode Go 官方 /usage 接口，60s 缓存）
    │                 #       /api/hypercharm/balance（Charm Hyper 官方接口，30s 缓存）
    │                 #       /api/stepfun/balance（Step Plan 订阅额度 + 按量余额，60s 缓存）
    │                 #       /api/stepfun/plan（只取订阅额度，调试用）
    │                 #       /api/bailian/plan（百炼 Token Plan 窗口 + 月额度，60s 缓存）
    │                 #       /api/deepseek/usage（DeepSeek 官网用量页同源接口：当月 token/金额/请求数，60s 缓存）
    │                 #       /api/monitor/tabs（自定义标签页增删改查；下发对象不含 API key）
    │                 #       /api/monitor/custom-balance?id=（代取自定义页余额，凭据不出 host）
    │                 #       /api/monitor/discover（贴官网链接 → 自动识别余额接口与呈现口径）
    │                 #       /api/monitor/builtin-tabs/delete（永久删除内置页：改源码 + 备份 + 语法自检）
    └── client.js     # client 半：shell.overlay 悬浮面板（品牌轨/拖动/缩放/位置记忆）
                      #          settings.general.item 里的「标签页管理」+ 新增表单
└── test/
    ├── client-smoke.mjs      # 无浏览器冒烟测试（最小 React/DOM shim 跑渲染路径并断言六标签页）
    ├── custom-tabs.mjs       # 自定义标签页 host 侧单测（凭据不泄露 / 点路径 / 归一化 / 代取余额）
    ├── discover.mjs          # 贴官网链接自动识别（域名匹配 / 余额打分 / 钱包-套餐-两者判定 / 降级）
    ├── builtin-delete.mjs    # 永久删除内置页（真 client.js 副本上跑：备份 + 语法自检 + 幂等 + 白名单）
    ├── custom-routes.mjs     # 自定义标签页 3 条路由的生命周期（add→toggle→GET→delete，验落盘与下发）
    ├── custom-routes-live.mjs # 同上但走**真 HTTP 服务器**（验原生 req 自收 body 与 host 代发上游）
    ├── custom-tab-ui.mjs     # 自定义标签页 client 侧端到端（增 / 删 / 隐藏 + 请求载荷断言）
    ├── host-unit.mjs         # host 纯函数单测（凭据解析 / epoch 归一 / 额度归一化 / 日志分通道 token 归集）
    ├── host-integration.mjs  # host 接线 + 真实请求路径集成测试（本地 mock 网关，不出网）
    └── host-live-probe.mjs   # 用真实控制台凭据跑一次 live 探针（需联网；没配凭据则跳过）
```

## 自测

```bash
node test/client-smoke.mjs                        # 不依赖 DSH / 浏览器，全 PASS 则六标签页（含 StepFun / 百炼面板）渲染正常
node test/custom-tabs.mjs                         # 自定义页 host 侧：凭据不下发、字段路径取值、代取余额、配置损坏容错
node test/discover.mjs                            # 贴链接自动识别：域名匹配、余额打分、钱包/套餐/两者判定、失败降级
node test/builtin-delete.mjs                      # 永久删除内置页：源码改写正确性 + 备份 + 语法自检 + 幂等 + 白名单
node test/custom-routes.mjs                       # 自定义页 3 条路由的完整生命周期 + 落盘内容
node test/custom-routes-live.mjs                  # 同上但用真 HTTP 服务器与真上游（localhost，不出网）
node test/custom-tab-ui.mjs                       # 自定义页 client 侧：增/删/隐藏点一遍，断言 POST 载荷与失败提示
node test/host-unit.mjs                           # host 侧纯函数单测（凭据解析 / 时间戳归一 / 额度归一化 / 官网用量载荷归一化 + 浏览器 token 解析）
node test/host-integration.mjs                    # 本地 mock 网关：验路由注册、网关 URL/表单/请求头、信封展开、缓存、错误态
node test/host-live-probe.mjs                     # 真实凭据 live 探针（没配 BAILIAN_CONSOLE_COOKIE 时打印配置指引并跳过）
SMOKE_CASE=degraded node test/client-smoke.mjs    # 没配控制台令牌/网关空载荷 → 额度显示 -- + 提示，不崩
SMOKE_CASE=legacy   node test/client-smoke.mjs    # StepFun 旧套餐（plan_family=1）→ 改显 5 小时 / 每周窗口
SMOKE_CASE=error    node test/client-smoke.mjs    # StepFun / 百炼接口报错 → 应显示错误态且不崩
SMOKE_CASE=nousage  node test/client-smoke.mjs    # DeepSeek 官网用量取不到 → 该行显示 -- + 「官网 · 未取到」，不拿本地数顶上
SMOKE_CASE=gozero   node test/client-smoke.mjs    # Command Code 窗口无用量（resetAt=0）→ 额度刷新显示「空闲」+ 原因，不显示 --
```

> ⚠️ **改 `lib/index.js`（host 半）必须重启 DSH 才生效**：host 代码不是热加载的。
> 只改 `lib/client.js`（client 半）刷新浏览器页面即可。host 半没重启时，自定义页功能会
> 静默不可用，面板会明确提示「本地服务不可用（HTTP 404）——host 半是否还没重启？」。