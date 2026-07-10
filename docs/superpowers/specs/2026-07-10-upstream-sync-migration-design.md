# fish-new-api 全面升级到最新版 new-api 迁移设计

日期：2026-07-10
状态：已获用户确认（方案 C：混合迁移）

## 1. 背景与目标

fish-new-api 基于官方 QuantumNous/new-api 的 2026-03-23 版本（分叉点 `9ae9040b3`）深度定制：

- 落后官方 main **623 个提交**（官方最新 `4e570389d`，v1.0.0-rc.20 之后）
- 领先（自研）**552 个提交**，后端改/增约 430 个文件，其中 **246 个纯新增**，自研路由约 239 条
- 自研功能包括：抽奖（activity_lottery）、返利（affiliate）、签到（checkin 扩展）、工单（support_ticket）、财务/发票（finance/invoice）、绘图任务（image_task）、邮件助手（mail_assistant）、分档计费（tiered_expr/billingexpr）、订阅体系深度魔改（交付、折扣、天卡、退款、转换）、gpt-image-2 异步模式等散点增强
- `web/`：官方旧前端 + 我方 334 个文件的修改（自研管理页），官方新版已整体重写前端
- `web-worker/`：完全自研的用户端前端（Vite + Cloudflare Workers，独立构建），依赖后端约 46 个接口

**目标**：升级到官方最新 main，保留全部自研功能，"能用官方就用官方"以降低后续同步成本，web-worker 保持可用（允许改 web-worker 适配新接口），数据停机迁移到 `.env` 中 `NEW_SQL_DSN` 指向的新库。

**参考代码**：最新官方代码已克隆到 `/Users/songjunxi/Desktop/repos/new-api/new-api-latest`（仅作对照，实际迁移在 fish-new-api 仓库内进行）。

## 2. 关键调研结论

### 2.1 试合并结果（git merge-tree 实测）

`git merge-tree quantumnous/main HEAD`：约 2600 个变更文件中仅 **240 个冲突**：

- `web/` 131 个 → 全取官方（旧 web 退役）
- 后端 109 个 → 人工解决，分布：controller 22、model 20、relay 17、service 11、common 8、其余 31

自研新增的 246 个文件无冲突，merge 自动保留。

### 2.2 最大风险区：订阅/支付重叠

官方最新版已自带 creem / waffo / waffo-pancake / stripe / epay 支付与 subscription 模块，与我方从旧版继承后深度魔改的是**同一套代码的两个演化分支**。我方 `model/subscription.go` 相对官方多约 7000 行。此区域不在 merge 中硬解，单独作为嫁接子项目（阶段 2）。

### 2.3 数据库字段差异（无改名/类型冲突，全部为单边新增）

| 表 | 我方独有字段 | 官方新增字段 | 处理 |
|---|---|---|---|
| subscription 系列 | 117 个（交付、折扣、天卡、专属 token 等） | 9 个（AllowBalancePay、DowngradeGroup、WaffoPancakeProductId 等） | 阶段 2 嫁接时保证官方新逻辑不绕过我方交付/折扣逻辑 |
| log | 92 个（地理、分析、聚合） | UpstreamRequestId | 机械合并 |
| token | 27 个（周期配额、绑定、计划） | 无 | 直接保留 |
| user | 8 个 | AdminPermissions、LastLoginAt | **注意**：我方 `PermissionsJSON` 与官方 `AdminPermissions` 语义可能重叠，阶段 2 决策是否迁到官方字段 |
| channel/checkin/topup/redemption/task | 各 2~21 个 | 几乎无 | 直接保留 |

AutoMigrate 对纯新增字段安全；接口返回只增不减，web-worker 解析不会因字段差异损坏。

### 2.4 web-worker 接口依赖（46 个）

官方已有同路径接口：subscription 支付系列、topup 支付系列、passkey login、user/login、pricing、status、models 等。
仅存在于自研代码的接口（随自研移植自然恢复）：`/api/user/checkin*`、`/api/support/tickets*`、`/api/activity/lottery*`、`/api/log/self/export`、`/api/user/amount`、`/api/subscription/self/preference` 等。

## 3. 方案选择

| 方案 | 描述 | 结论 |
|---|---|---|
| A 纯 merge | 109 个后端冲突全部在 merge 中手解 | 订阅区风险高 |
| B 逐功能移植 | 在干净最新版上重新移植 552 个提交 | 周期最长，易漏散点改动 |
| **C 混合（选定）** | 整体 merge + 订阅/支付区先取官方再精细嫁接 | 效率与严谨兼顾 |

## 4. 实施设计（5 阶段）

### 阶段 0 — 基线与安全网

1. fish-new-api 打 tag（如 `pre-upstream-sync-20260710`）并推送备份
2. 生产库全量快照（mysqldump / 物理备份）
3. 记录当前生产关键校验值：用户数、总额度、订阅订单数、近 7 天日志计费合计（用于阶段 5 校验）

### 阶段 1 — 主体 merge

新分支 `upgrade/sync-upstream`，执行 `git merge quantumnous/main`。

冲突解决策略：

- `web/`（131 个）：`git checkout --theirs web/` 整体取官方，旧 web 我方改动放弃（自研管理页在阶段 4 重写）
- 订阅/支付重叠文件（约 15 个：controller/subscription.go、controller/subscription_payment_*.go、controller/topup_*.go、model/subscription.go、model/topup.go 相关部分等）：**先整体取官方**，我方增量留待阶段 2
- 其余后端冲突（约 94 个）：逐文件手解，原则"官方结构为骨架 + 我方增量嫁接"
- `go.mod` / `go.sum`：取官方后补回我方独有依赖，`go mod tidy`
- 路由文件（router/*.go）：官方结构 + 我方 239 条自研路由补回

阶段完成标准：merge 提交完成，`go build ./...` 可通过或仅剩阶段 2/3 范围内的已知错误清单。

### 阶段 2 — 订阅/支付嫁接子项目

1. 产出差异清单：`git diff quantumnous/main pre-upstream-sync-20260710 -- <订阅支付文件>`，按功能分组：
   - 交付系统（DeliveryMode/DeliveryPayload/DeliveredBy…）
   - 折扣（ActiveDiscount/DiscountDeadline/EffectivePriceAmount…）
   - 天卡（DayPass/subscription_day_pass_plan）
   - 退款（subscription_refund_setting）
   - 转换请求（subscription_conversion_request）
   - 旧版迁移（subscription_legacy_migration）
   - 聚合/专属 token（AggregateAccessToken/DedicatedAccessToken）
   - 支付渠道定制（creem/waffo/stripe/epay 各自的我方增量）
2. 以官方新代码为基底，逐组重新实现，每组一个提交
3. 语义重叠决策点（逐个与用户确认或在实现时评估）：
   - user.PermissionsJSON vs 官方 AdminPermissions
   - 官方 AllowBalancePay / DowngradeGroup / AdvanceResetTime 与我方订阅生命周期逻辑的交互
   - 官方 WaffoPancake 新渠道与我方 waffo 定制的关系
4. 保证官方新入口（如余额支付订阅）走到我方交付逻辑，不留绕过路径

阶段完成标准：订阅/支付全部测试通过；官方新功能与我方功能在同一数据模型上共存。

### 阶段 3 — 自研功能编译修复与散点核对

1. 修复 246 个自研文件因官方内部 API 变化（函数签名、包路径、dto 结构）导致的编译错误，直到 `go build ./...` 通过
2. 全量跑测试：`go test ./...`（我方自研测试文件众多，是防回归主力）
3. **散点改动防遗漏**：生成我方 552 个提交对 179 个共改文件的 diff 清单，逐文件核对我方修改是否在 merge 后仍生效（重点：relay/ 下的模型适配，如 gpt-image-2 异步模式、渠道细节增强）
4. i18n、Dockerfile、docker-compose、makefile、.env.example 等杂项对齐

阶段完成标准：构建通过、全部测试通过、552 提交 diff 清单逐项核对完毕。

### 阶段 4 — 前端

1. `web/`：官方新前端（default 工作区）为基础，重写自研管理页：
   - 分档计费可视化编辑器
   - 工单管理、抽奖配置、财务/发票、站点通知、邮件助手、注册邀请、电商代理账号等
   - 具体页面清单在动手前从旧 web 我方 334 个改动文件中提取
2. `web-worker/`：代码原样保留在仓库中（独立构建，不受根目录影响）
   - 对 46 个依赖接口逐一回归（登录/鉴权 → 用户信息 → 订阅购买全链路 → 各支付渠道 → 签到/抽奖/工单 → 日志导出 → playground 转发）
   - 接口行为有变的（鉴权头、错误码格式、分页结构、字段语义）改 web-worker 适配
   - 重点回归项：passkey 登录 finish 流程、epay/stripe/creem webhook 与 notify 路径、`/api/chat*` 转发

阶段完成标准：管理后台核心操作可用；web-worker 46 接口回归通过。

### 阶段 5 — 数据停机迁移

1. 停机窗口开始，旧服务停写
2. 旧库全量导出 → 导入 `NEW_SQL_DSN` 新库
3. 新版程序对新库启动，AutoMigrate 自动补官方新字段/新表
4. 校验：行数逐表对比；阶段 0 记录的校验值（用户数、总额度、订单数、计费合计）一致
5. 切流量到新版；旧库转只读保留，作为回滚点
6. 回滚预案：新版异常时切回旧版 + 旧库（停机窗口内数据无写入，可直接回切）

## 5. 验证标准（总）

- `go build ./...` 与 `go test ./...` 全部通过
- web-worker 46 个接口回归全部通过（含支付 webhook 沙箱验证）
- 管理后台（官方新前端 + 重写的自研管理页）核心操作可用
- 计费金额抽样与旧版一致（含分档计费 tiered_expr 用例）
- 数据迁移校验值全部一致

## 6. 风险表

| 风险 | 等级 | 缓解 |
|---|---|---|
| 订阅区嫁接遗漏官方新逻辑或我方旧逻辑 | 高 | 阶段 2 差异清单逐组实现 + 双向核对；测试全跑 |
| 散点小改动（如 gpt-image-2 异步）在 merge 中被官方版本覆盖 | 中 | 阶段 3 的 552 提交 diff 清单逐项核对 |
| web-worker 依赖的接口行为被官方悄改（鉴权/错误码/分页） | 中 | 46 接口逐一回归；允许改 web-worker 适配 |
| AutoMigrate 对大表（log）加列慢导致停机超时 | 中 | 停机前在新库副本上演练迁移，测量耗时 |
| PermissionsJSON vs AdminPermissions 语义合并出错 | 中 | 阶段 2 单独决策点，迁移前后权限矩阵对比 |
| 官方持续快速迭代，迁移期间又落后 | 低 | 迁移分支定期 re-merge 官方 main；本设计的策略可重复执行 |

## 7. 后续同步机制

本次迁移完成后，与官方的差异回到"增量可控"状态。后续跟进官方：定期 `git merge quantumnous/main`，因自研代码尽量放在独立文件、重叠区已按官方结构重构，预期冲突面显著小于本次。
