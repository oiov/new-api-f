# fish-new-api 升级到官方最新版 new-api 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 fish-new-api（分叉于 2026-03-23 官方 `9ae9040b3`，自研 552 提交）升级到官方最新 main（`4e570389d`），保留全部自研功能，web-worker 保持兼容，数据停机迁移到 NEW_SQL_DSN 新库。

**Architecture:** 方案 C 混合迁移——在 fish-new-api 仓库内整体 `git merge quantumnous/main`；web/ 全取官方；订阅/支付重叠区 10 个文件先取官方、再按功能组精细嫁接我方 ~7000 行增量；其余 99 个后端冲突逐文件手解（官方骨架+我方增量）；最后官方新前端重写自研管理页、web-worker 46 接口回归、停机数据迁移。

**Tech Stack:** Go 1.22+/Gin/GORM v2、React（官方新前端 rsbuild workspace）、Vite+Cloudflare Workers（web-worker）、MySQL/PostgreSQL/SQLite/Redis

**Spec:** `docs/superpowers/specs/2026-07-10-upstream-sync-migration-design.md`

**关键事实（动手前必读）：**
- **执行约束（2026-07-10 用户确认）：**
  - 旧数据库在线上使用中，**开发全程不得触碰生产库**；所有开发/测试连本地或测试库；数据迁移（阶段 5）放到最后执行
  - Task 0.2 的生产备份与校验值记录**推迟到阶段 5 开始前**执行，不作为前置
  - web-worker 是独立部署的 git 仓库；迁移适配后的新版 web-worker 推送到新仓库 `https://github.com/oiov/nbility-client`
  - 迁移完成的新版主项目推送到新仓库 `https://github.com/oiov/nbility`
- 仓库：`/Users/songjunxi/Desktop/repos/new-api/fish-new-api`，**起始分支 `fishxcode`**（所有冲突数字均基于该分支 HEAD 实测），remote `quantumnous` = 官方，已 fetch 到 `4e570389d`
- 对照参考：`/Users/songjunxi/Desktop/repos/new-api/new-api-latest`（官方最新的干净克隆，含 .env 可直接跑，作为"官方行为基准"）
- merge 冲突实测（`git merge-tree quantumnous/main HEAD`）：240 文件 = web/ 131 + 订阅支付区 10 + 其余后端 99
- 每完成一个 Task 都要 commit；整个迁移在分支 `upgrade/sync-upstream` 上进行

---

## 阶段 0 — 基线与安全网

### Task 0.1: 打基线 tag 并推送

**Files:** 无代码改动

- [ ] **Step 1: 确认工作区干净**

Run: `cd /Users/songjunxi/Desktop/repos/new-api/fish-new-api && git status --porcelain | grep -v '^??' | wc -l`
Expected: `0`（有未提交改动则先提交或 stash）

- [ ] **Step 2: 打 tag 并推送**

```bash
git tag pre-upstream-sync-20260710
git push origin pre-upstream-sync-20260710
```

- [ ] **Step 3: 记录基线构建状态**

Run: `go build ./... && go test ./... 2>&1 | tail -5`
Expected: 构建通过。若有既有失败测试，记录到 `docs/superpowers/plans/migration-notes.md`（新建）作为"迁移前已知失败清单"，迁移后不要求修复这些。

- [ ] **Step 4: Commit notes**

```bash
git add docs/superpowers/plans/migration-notes.md && git commit -m "docs(migration): 迁移前基线测试状态记录"
```

### Task 0.2: 生产数据校验值记录（**推迟到阶段 5 开始前执行**——生产库在线使用中，开发期间不碰）

- [ ] **Step 1:** （阶段 5 前）提醒用户执行：生产库全量备份（`scripts/backup_postgres.sh` 或对应引擎的 dump）
- [ ] **Step 2:** （阶段 5 前）提醒用户确认：`NEW_SQL_DSN` 新库与旧库是**同一引擎**
- [ ] **Step 3:** 在 `migration-notes.md` 记录校验值 SQL（用户数 `SELECT COUNT(*) FROM users`、令牌数、订阅订单数、近 7 天日志 quota 合计），执行结果由用户在停机迁移当天填入

---

## 阶段 1 — 主体 merge

### Task 1.1: 创建分支并发起 merge

- [ ] **Step 1: 建分支（从 fishxcode 出发）**

```bash
git checkout fishxcode
git checkout -b upgrade/sync-upstream
```

- [ ] **Step 2: 发起 merge（不提交）**

Run: `git merge quantumnous/main --no-commit 2>&1 | tail -3`
Expected: `Automatic merge failed; fix conflicts...`

- [ ] **Step 3: 确认冲突规模符合预期**

Run: `git diff --name-only --diff-filter=U | wc -l`
Expected: ~240（偏差大则停下重新评估）

### Task 1.2: web/ 全取官方（131 个冲突）

- [ ] **Step 1: 整个 web/ 目录替换为官方版本**

```bash
git rm -rf --ignore-unmatch web/
git clean -fdx web/    # 清掉 node_modules/dist 等未跟踪产物，避免干扰后续 bun install
git checkout quantumnous/main -- web/
git add -A web/
```

注意：必须先 `git rm -rf web/` 再 checkout。只用 `git checkout <ref> -- web/` 不会删除官方已删的旧文件——旧前端的 `web/vite.config.js`、我方新增的 `web/api/_utils/subscription-seo.js` 等都会残留在官方 rsbuild 工作区里。旧前端我方改动全部放弃，自研管理页阶段 4 重写。

- [ ] **Step 2: 验证 web/ 与官方完全一致且无残留冲突**

```bash
git diff --name-only --diff-filter=U -- web/ | wc -l          # Expected: 0
diff <(git ls-files web/ | sort) <(git ls-tree -r --name-only quantumnous/main web/ | sort) | wc -l   # Expected: 0
```

### Task 1.3: 订阅/支付区 10 文件先取官方

**Files（先取官方，阶段 2 嫁接我方增量）:**
`controller/subscription.go`、`controller/subscription_payment_creem.go`、`controller/subscription_payment_epay.go`、`controller/subscription_payment_stripe.go`、`controller/topup.go`、`controller/topup_creem.go`、`controller/topup_stripe.go`、`controller/topup_waffo.go`、`model/subscription.go`、`model/topup.go`

- [ ] **Step 1: 取官方版本**

```bash
git checkout quantumnous/main -- controller/subscription.go controller/subscription_payment_creem.go controller/subscription_payment_epay.go controller/subscription_payment_stripe.go controller/topup.go controller/topup_creem.go controller/topup_stripe.go controller/topup_waffo.go model/subscription.go model/topup.go
git add controller/subscription*.go controller/topup*.go model/subscription.go model/topup.go
```

- [ ] **Step 2: 在 migration-notes.md 登记**："订阅区 10 文件已整体取官方，我方增量在阶段 2 嫁接，diff 基准 = `git diff quantumnous/main pre-upstream-sync-20260710 -- <这10个文件>`"

### Task 1.4: go.mod/go.sum 解决

- [ ] **Step 1:** 取官方 `git checkout quantumnous/main -- go.mod go.sum`
- [ ] **Step 2:** 对照我方独有依赖：`git show pre-upstream-sync-20260710:go.mod | diff - go.mod | grep '^<'`，把我方独有的 require 手工加回 go.mod
- [ ] **Step 3:** `go mod tidy`（此时可能因代码未解完而报错——没关系，阶段 3 结束前会再跑一次；先 `git add go.mod go.sum`）

### Task 1.5: 其余后端冲突手解 — 按模块分批（99 个文件）

**总原则：官方结构为骨架 + 我方增量嫁接。每批解完 `git add` 该批文件并在 migration-notes.md 勾记。对拿不准的冲突，比对三方：`git show :1:<file>`（base）/`:2:`（我方）/`:3:`（官方）。**

分批清单（每批一个 checkbox，建议按此顺序，依赖少的先解）：

- [ ] **批1 杂项（11个）**: `.gitignore` `.github/workflows/docker-build.yml` `.github/workflows/docker-image-alpha.yml` `Dockerfile` `AGENTS.md` `CLAUDE.md` `README*.md`(5个冲突；官方另新增 README.en.md 会自动进来) — README/AGENTS/CLAUDE 直接取官方（迁移后重新生成定制版）；`docker-image-alpha.yml` 是 modify/delete（官方已删该 workflow）：若我方仍需 alpha 镜像构建则保留我方版，否则 `git rm`；Dockerfile/.gitignore/docker-build.yml 官方骨架+我方增量。（`.env.example` 无冲突、自动合并，我方新增变量在 Task 3.4 统一核对）
- [ ] **批2 constant+common（8个）**: `constant/api_type.go` `constant/channel.go` `common/api_type.go` `common/init.go` `common/request_body_limit.go` `common/ssrf_protection.go` `common/str.go` + 测试文件 — 常量/枚举合并注意我方新增渠道类型编号不与官方新增的撞号，若撞号以官方为准、我方顺延并全局替换
- [ ] **批3 model（16个）**: `model/ability.go` `model/channel.go` `model/db_time.go` `model/errors.go` `model/locking.go` `model/log.go` `model/main.go` `model/model_meta.go` `model/option.go` `model/redemption.go` `model/task.go` `model/token.go` `model/user.go` `model/user_cache.go` + 测试 — 字段差异已确认全部为单边新增（见 spec §2.3），合并是机械的；`model/user.go` 注意保留官方 `AdminPermissions`/`LastLoginAt` 与我方 8 字段共存（语义归并在阶段 2 决策）；`model/main.go` 的 AutoMigrate 注册表要包含双方所有 model
- [ ] **批4 dto（4个）**: `dto/claude.go` `dto/gemini.go` `dto/gemini_isstream_test.go` `dto/openai_image.go` — 注意 `dto/openai_image.go` 承载 gpt-image-2 异步模式字段，我方增量必须保留
- [ ] **批5 relay（15个）**: `relay/channel/aws/constants.go` `relay/channel/claude/relay-claude.go` `relay/channel/dify/relay-dify.go` `relay/channel/gemini/relay-gemini.go` `relay/channel/openai/adaptor.go` `relay/channel/openai/chat_via_responses.go` `relay/channel/openai/relay-openai.go` `relay/channel/vertex/adaptor.go` `relay/claude_handler.go` `relay/compatible_handler.go` `relay/helper/price.go` `relay/helper/stream_scanner.go` `relay/image_handler.go` `relay/relay_adaptor.go` + 测试 — 我方散点增强最密集区，逐 hunk 精读
- [ ] **批6 service+计费（12个）**: `service/billing_session.go` `service/convert.go` `service/openaicompat/responses_to_chat.go` `service/quota.go` `service/task_billing.go` `service/task_polling.go` `service/text_quota.go` `service/tiered_settle.go` `pkg/billingexpr/settle.go` `setting/billing_setting/tiered_billing.go` + 测试 — 分档计费（tiered_expr）是我方核心自研，凡 add/add 冲突以我方为主体、审视官方同名文件意图。**特别处理 `service/openaicompat/`**：这是 modify/delete 冲突——官方已删除该包并迁到 `service/relayconvert/`（含同形的 responses_to_chat.go 等）。正确做法：把我方在 openaicompat 里的增量移植进 `service/relayconvert/`，然后 `git rm -r service/openaicompat/`，并更新所有调用点；不要让两个包并存。
- [ ] **批7 controller（14个）**: `controller/channel-test.go` `controller/channel.go` `controller/log.go` `controller/misc.go` `controller/model.go` `controller/oauth.go` `controller/option.go` `controller/pricing.go` `controller/redemption.go` `controller/relay.go` `controller/task.go` `controller/token.go` `controller/user.go` + 测试
- [ ] **批8 middleware+router+setting+main（9个）**: `middleware/auth.go` `middleware/distributor.go` `middleware/request_body_limit.go` `router/api-router.go` `router/main.go` `setting/config/config.go` `setting/ratio_setting/cache_ratio.go` `setting/ratio_setting/model_ratio.go` `main.go` — `router/api-router.go` 是我方 239 条自研路由所在，官方结构+逐条补回；`middleware/auth.go` 涉及 web-worker 鉴权，改动逐行核

- [ ] **收尾: 确认零残留冲突并提交 merge**

Run: `git diff --name-only --diff-filter=U | wc -l`
Expected: `0`

```bash
git commit -m "merge: sync upstream quantumnous/main 4e570389d (方案C: web取官方/订阅区取官方待嫁接/其余手解)"
```

注意：此时**不要求能编译**——自研 246 文件对官方新内部 API 的适配在阶段 3。

---

## 阶段 2 — 订阅/支付嫁接子项目

### Task 2.1: 产出差异分组清单（后续任务的输入，必须先做）

- [ ] **Step 1: 生成完整 diff**

```bash
git diff quantumnous/main pre-upstream-sync-20260710 -- controller/subscription.go controller/subscription_payment_creem.go controller/subscription_payment_epay.go controller/subscription_payment_stripe.go controller/topup.go controller/topup_creem.go controller/topup_stripe.go controller/topup_waffo.go model/subscription.go model/topup.go > /tmp/subscription_increment.diff
wc -l /tmp/subscription_increment.diff
```

- [ ] **Step 2:** 通读 diff，把我方增量按以下 8 组归类，写入 `docs/superpowers/plans/subscription-graft-inventory.md`，每组列出：涉及函数/字段清单、依赖的自研表、对应 web-worker 接口：
  1. 交付系统（DeliveryMode/DeliveryPayload/DeliveredBy/DeliveryFieldSchema…）
  2. 折扣（ActiveDiscount/DiscountDeadline/EffectivePriceAmount…）
  3. 天卡（DayPass + model/subscription_day_pass_plan.go）
  4. 退款（model/subscription_refund_setting.go）
  5. 转换请求（model/subscription_conversion_request.go）
  6. 旧版迁移（model/subscription_legacy_migration.go）
  7. 聚合/专属 token（AggregateAccessToken/DedicatedAccessToken）
  8. 支付渠道定制（creem/waffo/stripe/epay 我方增量 + topup 的 Invoiced 等）
- [ ] **Step 3:** 清单中同时记录**语义重叠决策点**（呈给用户确认）：user.PermissionsJSON vs 官方 AdminPermissions；官方 AllowBalancePay/DowngradeGroup/AdvanceResetTime 与我方订阅生命周期的交互；官方 WaffoPancake 与我方 waffo 定制的关系
- [ ] **Step 4:** `git add docs/superpowers/plans/subscription-graft-inventory.md && git commit -m "docs(migration): 订阅嫁接差异分组清单"`

### Task 2.2 ~ 2.9: 逐组嫁接（8 组，每组同一模式）

每组执行同一循环（以组 1 交付系统为例）：

- [ ] **Step 1:** 从 inventory 读该组的函数/字段清单
- [ ] **Step 2:** 先跑该组相关的我方既有测试（从 `pre-upstream-sync-20260710` 恢复对应 `*_test.go` 到工作区）：`go test ./controller/ ./model/ -run <该组测试> -v`，Expected: FAIL（增量还没嫁接）
- [ ] **Step 3:** 以官方新代码为基底实现该组增量；**关键约束：官方新入口（如余额支付订阅 SubscriptionRequestBalancePay）必须走到我方交付/折扣逻辑，不留绕过路径**
- [ ] **Step 4:** `go test ./controller/ ./model/ -run <该组测试> -v`，Expected: PASS
- [ ] **Step 5:** `git commit -m "feat(subscription-graft): 嫁接<组名>到官方新订阅体系"`

分组任务勾记：
- [ ] Task 2.2 组1 交付系统
- [ ] Task 2.3 组2 折扣
- [ ] Task 2.4 组3 天卡
- [ ] Task 2.5 组4 退款
- [ ] Task 2.6 组5 转换请求
- [ ] Task 2.7 组6 旧版迁移
- [ ] Task 2.8 组7 聚合/专属 token
- [ ] Task 2.9 组8 支付渠道定制

### Task 2.10: 语义重叠决策落地

- [ ] **Step 1:** 把 Task 2.1 Step 3 的决策点呈给用户，逐个确认取舍
- [ ] **Step 2:** 按决策实现（如权限体系迁到官方 AdminPermissions 则写数据转换逻辑并保留 PermissionsJSON 读兼容）
- [ ] **Step 3:** 若权限体系有迁移：做**迁移前后权限矩阵对比**——对每个角色/用户抽样，列出迁移前 PermissionsJSON 展开的权限集合 vs 迁移后生效的权限集合，diff 必须为空，结果记入 migration-notes.md
- [ ] **Step 4:** 订阅全量测试：`go test ./... -run 'Subscription|Topup|Payment' -v` Expected: PASS，commit

---

## 阶段 3 — 自研功能编译修复与散点核对

### Task 3.1: 编译修复到 go build 通过

- [ ] **Step 1:** `go build ./... 2>&1 | head -50`，把错误按包分组记入 migration-notes.md
- [ ] **Step 2:** 逐包修复（自研 246 文件调用官方内部 API 的签名/包路径变化）。每修完一个包 commit 一次：`fix(migration): 适配官方新API - <包名>`
- [ ] **Step 3:** `go mod tidy && go build ./...` Expected: 零错误

### Task 3.2: 全量测试通过

- [ ] **Step 1:** `go test ./... 2>&1 | grep -E '^(FAIL|ok)' | sort | uniq -c`
- [ ] **Step 2:** 逐个修复失败（对照 Task 0.1 的"迁移前已知失败清单"，既有失败不算回归）
- [ ] **Step 3:** Expected: 除已知清单外全部 PASS，commit

### Task 3.3: 552 提交散点核对（防遗漏关键步骤）

- [ ] **Step 1: 生成核对清单**

```bash
git log --oneline pre-upstream-sync-20260710 --not 9ae9040b3 --no-merges > /tmp/our_commits.txt
wc -l /tmp/our_commits.txt   # Expected: 535（不含 merge 提交；含 merge 为 552）
```

- [ ] **Step 2:** 逐提交核对：对每个 commit，`git show <sha> --stat` 看其触碰的文件，确认该改动在当前 HEAD 上仍然生效（改动在自研独有文件的可跳过——merge 必然保留；重点是触碰 179 个共改文件的提交，尤其 relay/ 下如 gpt-image-2 异步模式）。核对结果记入 `docs/superpowers/plans/commit-audit.md`：每条 `sha | 状态(保留/已被官方等价实现/需补/不再需要) | 备注`
- [ ] **Step 3:** 对标记"需补"的逐个补回，各自 commit
- [ ] **Step 4:** `git add docs/superpowers/plans/commit-audit.md && git commit -m "docs(migration): 552提交散点核对清单"`

### Task 3.4: 杂项对齐

- [ ] i18n 目录合并核对；`electron/`、`makefile`、`docker-compose.yml` 我方定制核对；`.env.example` 补我方新增变量（NEW_SQL_DSN 等）；commit

---

## 阶段 4 — 前端

### Task 4.1: 自研管理页清单提取（阶段 4 的输入，必须先做）

- [ ] **Step 1: 从旧 web 改动提取页面清单**

```bash
git diff --name-only 9ae9040b3 pre-upstream-sync-20260710 -- web/ > /tmp/web_changes.txt
wc -l /tmp/web_changes.txt   # ~334
```

- [ ] **Step 2:** 按目录归组，识别哪些是**自研管理页**（分档计费编辑器、工单、抽奖、财务/发票、站点通知、邮件助手、注册邀请、电商代理账号等）vs 对官方旧页的小改（后者放弃）。写入 `docs/superpowers/plans/admin-pages-inventory.md`，每页记录：旧页路径、调用的后端接口、优先级（P0=运营必需 / P1=可后补）
- [ ] **Step 3:** 呈给用户确认优先级，commit

### Task 4.2: 官方新前端跑通 + 自研管理页重写（按 P0 优先）

- [ ] **Step 1:** 新前端本地跑通：`cd web && bun install && bun run dev`（以官方 web/package.json 实际脚本为准），确认登录、渠道、令牌等官方页面可用
- [ ] **Step 2:** 逐页重写 P0 管理页：在 `web/default/` 工作区内按官方新前端的组件/路由模式实现，每页一个 commit（页面开发遵循官方新前端的目录约定，先读 2-3 个官方页面源码再动手）
- [ ] **Step 3:** P1 页面同模式续写或明确延后，记录到 inventory

### Task 4.3: web-worker 46 接口回归

- [ ] **Step 1: 起后端与官方基准**

迁移后版本（本仓库）：`cd fish-new-api && SQL_DSN=<测试库DSN> PORT=3001 go run main.go`（不连生产）。
官方基准：`cd ../new-api-latest && SQL_DSN=<另一测试库DSN> PORT=3002 go run main.go`（其 .env 已复制好，注意覆盖 PORT 与 DSN 避免冲突）。
用途：对比接口行为差异是"官方本来就改了"还是"我们合错了"。

- [ ] **Step 2: 逐接口回归**，按链路分 6 批，每批核对请求/响应结构、鉴权、错误码，结果记入 `docs/superpowers/plans/web-worker-regression.md`：
  - 批1 认证：`/api/user/login`、`/api/user/logout`、`/api/user/passkey/login/finish`、`/api/oauth/*`、`/api/authentication`
  - 批2 用户面板：`/api/user/self`、`/api/user/amount`、`/api/status`、`/api/models`、`/api/pricing`、`/api/user/checkin*`
  - 批3 订阅购买全链路：`/api/subscription/{creem,epay,stripe}/pay`、`/api/subscription/self/preference`、`/api/subscription/epay/notify`
  - 批4 充值支付：`/api/user/{pay,epay/notify,creem/pay,stripe/pay,stripe/amount}`、各 webhook（`/api/{creem,stripe,waffo}/webhook`）——需支付沙箱，凭据不可用则记录为"待生产前验证"
  - 批5 自研功能：`/api/support/tickets*`、`/api/activity/lottery/*`、`/api/log/self/export`、`/api/user/checkin/leaderboard`
  - 批6 转发面：`/api/chat*`、`/api/compatibility/{claude,gemini}`、`/api/images`、`/api/videos/seedance`、playground 系列
- [ ] **Step 3:** 行为有变且属官方主动改的 → 改 web-worker 适配（web-worker 内改动跑 `pnpm check` + 相关 vitest）；属我们合错的 → 回后端修，commit
- [ ] **Step 4:** 46/46 通过后 commit 回归记录

### Task 4.4: 计费金额抽样对比（spec §5 验证标准）

- [ ] **Step 1:** 构造抽样请求集（≥20 条，覆盖：普通按 token 计费、分档计费 tiered_expr 用例、图片/视频任务计费、订阅额度扣减），写入 `docs/superpowers/plans/billing-samples.md`
- [ ] **Step 2:** 同一请求集分别打到迁移前构建与迁移后构建，各自连独立测试库、相同倍率配置。迁移前构建：`git worktree add /tmp/pre-sync pre-upstream-sync-20260710 && cd /tmp/pre-sync && SQL_DSN=<第三个测试库DSN> PORT=3003 go run main.go`（用其自带旧 go.mod 构建）
- [ ] **Step 3:** 逐条对比扣费 quota / 结算金额，diff 必须为零（官方计费口径主动变更的除外——逐条说明并让用户确认）；结果记入 billing-samples.md，commit

---

## 阶段 5 — 数据停机迁移（runbook，用户主导执行）

### Task 5.1: 迁移演练（停机前必做）

- [ ] **Step 1:** 在新库副本上演练：旧库 dump → 导入 → 迁移后程序以 `SQL_DSN=<NEW_SQL_DSN值>` 启动跑 AutoMigrate → 记录总耗时（重点：log 大表加列耗时决定停机窗口长度）
- [ ] **Step 2:** 演练环境跑 Task 4.3 的批 2/3/5 快速回归
- [ ] **Step 3:** 演练结果与最终停机步骤写入 `docs/superpowers/plans/cutover-runbook.md`，commit

### Task 5.2: 正式停机迁移（runbook 摘要）

- [ ] 停写 → dump 旧库 → 导入 NEW_SQL_DSN 新库 → 新版启动 AutoMigrate → 校验（逐表行数 + Task 0.2 校验值）→ 切流量 → 旧库转只读保留
- [ ] 回滚预案：停机窗口内无新写入，异常直接切回旧版+旧库

---

## 收尾

- [ ] merge 分支合回主分支，打 tag `post-upstream-sync`
- [ ] 主项目推送到新仓库：`git remote add nbility https://github.com/oiov/nbility.git && git push nbility upgrade/sync-upstream:main`
- [ ] web-worker 推送到新仓库：适配完成后的 web-worker 以独立 git 仓库推送到 `https://github.com/oiov/nbility-client`（main 分支）
- [ ] 基于新代码重新生成 CLAUDE.md/AGENTS.md
- [ ] 清理：`new-api-latest` 对照目录按需保留或删除
