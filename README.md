# 余额悬浮窗（dsh-opencode-go-monitor）

DSH（DeepSeek Harness）Web UI 悬浮面板插件：**五标签页** 实时显示 **DeepSeek / Command Code GOAT / OpenCode Go / Charm Hyper / 阶跃星辰 StepFun** 的余额（标签切换带滑动+淡入动画）。

## 功能

- **五标签页**：DeepSeek 余额 / Command Code GOAT 余额 / OpenCode Go 额度 / Charm Hyper 余额 / 阶跃星辰 StepFun 余额，点击切换，带方向滑动 + 淡入动画，激活标签按服务商主题色高亮（DeepSeek 蓝 / GOAT 橙 / OpenCode 紫 / Hyper 粉 / StepFun 绿），标题栏下方同步一条主题色细线（标签条在 220–270px 窄窗下自动收字距/字号，始终保持一行，刷新按钮不被挤掉）
- **OpenCode Go 页**：官方订阅额度三窗口（**滚动 / 每周 / 每月**）：剩余 %（绿≥50% / 橙≥25% / 红<25%）+ 进度条 + 已用 % + 重置倒计时，外加最近一次窗口重置倒计时
- **Command Code GOAT 页**：5 小时 / 每周 两档滚动窗口：剩余 %（绿≥50% / 橙≥25% / 红<25%）+ 进度条 + 已用 % + 重置倒计时，外加 **月度余额**（美元：月度+已购+免费三池合计）
- **DeepSeek 页**：余额、预计剩余 tokens（按官方现行价 + 本账户用量结构折算的有效单价估算，尾注当前空闲/高峰时段与单价）、当前模型
- **Charm Hyper 页**：余额（hypercredits）+ 约合美元（官方 balance_usd，或按 20 hc ≈ $1 折算）
- **阶跃星辰 StepFun 页**：主显示 **Step Plan 订阅额度**（当月 Credit 月池剩余比例 + 月池重置时间 + 加油包剩余 Credit + 套餐状态/到期），附 **按量账户余额**（元，尾注 预付费/后付费；充值/赠送两池在悬浮说明里）。订阅额度取自控制台内部 RPC（见下），API key 拿不到；字段缺失一律显示 `--`，不臆造 0
- **操控**：空白处按下即可**拖动**（位置记忆，释放时靠近屏幕边缘自动吸附贴齐）· 点击空白 / ↻ 按钮**立即刷新**（刷新期间按钮转圈）· 右下角**调整大小**（尺寸记忆，**双击手柄恢复默认尺寸**）
- **收起/展开**：点标题栏「−」、双击标题栏或按 `C` 收起为**迷你胶囊**（只显示当前服务商的 1 个关键数值，状态记忆）；点胶囊或按 `Esc` 展开
- **键盘**（点一下悬浮窗获得焦点）：`←` / `→` 切换标签（环绕）· `R` 刷新 · `C` 收起/展开 · `Esc` 展开
- **外观**：毛玻璃质感空闲时轻度半透明、悬浮/聚焦恢复；深色模式下自动切换为暗玻璃配色（跟随 DSH `body[data-ds-dark-theme]`，切主题即时生效）；尊重系统「减少动态效果」偏好
- 轮询：DeepSeek 每 30s、Command Code GOAT 每 60s、OpenCode Go 每 60s、Charm Hyper 每 30s、阶跃星辰 StepFun 每 60s

> 已移除原「省钱」功能：限额、超限断点截断、低耗压缩、官网用量分析、语音提醒、时段建议等。

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

## 前置条件

| 依赖 | 说明 |
| --- | --- |
| DeepSeek Harness（web 或桌面端） | 插件运行在 DSH 内 |
| DeepSeek API key | DSH **设置 → 凭据** 添加 `DEEPSEEK_API_KEY`（DeepSeek 余额标签页用） |
| Command Code GOAT 订阅 + API key | DSH **设置 → 凭据** 添加 `COMMANDCODE_API_KEY`（在 [commandcode.ai/settings](https://commandcode.ai/settings) 创建，`user_` 开头；也兼容 `COMMAND_CODE_API_KEY` 命名或环境变量 `COMMAND_CODE_API_KEY`，未配置时尽力而为读取 Command Code CLI 登录凭据 `~/.commandcode/auth.json`） |
| Charm Hyper 订阅 + API key | DSH **设置 → 凭据** 添加 `HYPER_API_KEY`（兼容 `HYPERCHARM_API_KEY` 命名或环境变量） |
| OpenCode Go 订阅 | DSH **设置 → 凭据** 添加 `OPENCODE_GO_API_KEY`（兼容 `OPENCODE_API_KEY` / 同名环境变量）；未配置时自动读 opencode 登录凭据 `~/.local/share/opencode/auth.json` 的 `opencode-go` 条目，WSL 下还会探测 Windows 用户目录 `/mnt/c/Users/<用户>/.local/share/opencode/auth.json` |
| 阶跃星辰 StepFun 账户（按量余额） | DSH **设置 → 凭据** 添加 `STEPFUN_API_KEY`（[platform.stepfun.com](https://platform.stepfun.com) 控制台创建；兼容 `STEP_API_KEY` 命名或同名环境变量）。走国内站 `https://api.stepfun.com/v1/accounts` —— 国际站 `api.stepfun.ai` 的 key 与国内站不通用 |
| 阶跃星辰 Step Plan 订阅额度 | DSH **设置 → 凭据** 添加 `STEPFUN_CONSOLE_COOKIE`（推荐）或 `STEPFUN_CONSOLE_TOKEN`。取法：登录 [platform.stepfun.com](https://platform.stepfun.com) → F12 → Network → 筛 `Dashboard` → 右键任一 `Dashboard/...` 请求 → **以 cURL 格式复制** → 整串粘进凭据（会自动解析出 Cookie 与 oasis-token）。带 Cookie 时插件用刷新令牌自动续期，只需配一次；只配 `STEPFUN_CONSOLE_TOKEN`（oasis-token 头）则约 30 分钟过期需重贴。未配置时该页只显示按量账户余额，订阅额度行显示 `--` + 「未配置控制台令牌」 |

## 隐私说明

- API key 只在进程内存中使用，用于调用官方余额接口，**不落盘、不写日志、不发给任何第三方**
- 控制台凭据（`STEPFUN_CONSOLE_COOKIE` / `STEPFUN_CONSOLE_TOKEN`）同样只在进程内存中使用，
  只发给 `platform.stepfun.com`（取订阅额度 + 续期），请求体里不携带凭据，出错信息里也不打印凭据
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
4. 配置凭据：DSH **设置 → 凭据** → 添加 `DEEPSEEK_API_KEY`、`COMMANDCODE_API_KEY`、`HYPER_API_KEY`

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
| 面板完全不显示 | 确认 `cordis.patch.yml` 注册行格式、`profiles/node_modules/dsh-opencode-go-monitor` 路径；浏览器硬刷新（Ctrl+Shift+R）；F12 控制台看红色报错 |

## 卸载

1. 从 `cordis.patch.yml` 删除注册行（热加载立即移除）
2. 删除 `profiles/node_modules/dsh-opencode-go-monitor/` 文件夹

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
    └── client.js     # client 半：shell.overlay 悬浮面板（拖动/缩放/位置记忆）
└── test/
    ├── client-smoke.mjs  # 无浏览器冒烟测试（最小 React/DOM shim 跑渲染路径并断言五标签页）
    └── host-unit.mjs     # host 纯函数单测（凭据解析 / epoch 归一 / Step Plan 额度归一化）
```

## 自测

```bash
node test/client-smoke.mjs                        # 不依赖 DSH / 浏览器，全 PASS 则五标签页（含 StepFun 面板）渲染正常
node test/host-unit.mjs                           # host 侧纯函数单测（凭据解析 / 时间戳归一 / 额度归一化）
SMOKE_CASE=degraded node test/client-smoke.mjs    # 没配控制台令牌 → 订阅额度显示 -- + 提示，按量余额仍在
SMOKE_CASE=legacy   node test/client-smoke.mjs    # 旧套餐（plan_family=1）→ 改显 5 小时 / 每周窗口
SMOKE_CASE=error    node test/client-smoke.mjs    # StepFun 接口报错 → 应显示错误态且不崩
```