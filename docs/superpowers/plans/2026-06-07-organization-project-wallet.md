# 组织项目钱包任务文档

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不破坏现有个人用户体验的前提下，逐步加入组织、项目、团队 token、组织钱包/订阅和组织用量统计能力。

**Architecture:** 采用 `Organization -> Project -> Token/Usage` 模型。个人用户自动拥有 `personal organization + default project`；企业组织复用同一套模型。实现顺序先落数据骨架和兼容迁移，再逐步切 token、计费、充值订阅、日志统计和前端体验。

**Tech Stack:** Go 1.22+, Gin, GORM v2, SQLite/MySQL/PostgreSQL, Redis cache, React 18 + Vite + TanStack Query in `web-worker/`, Bun for frontend scripts.

**关联文档:** `docs/superpowers/specs/2026-06-07-organization-project-wallet-design.md`

---

## 执行边界

这份文档只拆任务，不执行代码。后续实现时按阶段推进，每个阶段单独提交，保证旧个人用户流程持续可用。

核心约束：

- 所有 JSON 编解码遵守项目规则，使用 `common.Marshal` / `common.Unmarshal` 等封装。
- 所有迁移兼容 SQLite、MySQL 5.7.8+、PostgreSQL 9.6+。
- `web-worker/` 是嵌套 git 仓库，修改它时用 `git -C web-worker ...`。
- 第一阶段不改变老 token key、不改变老充值/订阅入口、不强制用户切换组织。
- 旧 `web/` 只做平台管理员兜底，新 `web-worker/` 承载客户侧组织体验。

## 阶段总览

- [ ] Phase 1: 数据骨架与个人组织兼容迁移。
- [ ] Phase 2: token 增加组织/项目归属，保留个人 token 兼容。
- [ ] Phase 3: token-auth 请求链路加入 organization/project context。
- [ ] Phase 4: 组织钱包扣费链路。
- [ ] Phase 5: 充值、订阅、发票归属 organization。
- [ ] Phase 6: 日志和用量按 organization/project/token/user/model 归因。
- [ ] Phase 7: 组织、项目、成员、项目 token API。
- [ ] Phase 8: `web-worker` 组织/项目切换和团队控制台。
- [ ] Phase 9: 旧 `web/` 平台管理员组织兜底视图。
- [ ] Phase 10: 全链路兼容验证和灰度清理。

---

## Phase 1: 数据骨架与个人组织兼容迁移

**目标:** 建立组织/项目/成员/钱包流水/审计日志模型，并为存量用户创建 personal organization/default project。

**Files:**

- Create `model/organization.go`
- Create `model/organization_test.go`
- Modify `model/main.go`
- Modify `controller/user.go`

**任务:**

- [ ] 新增 `Organization` 模型，字段覆盖 `name/type/owner_user_id/quota/used_quota/request_count/group/status/billing_preference`。
- [ ] 新增 `OrganizationMember` 模型，字段覆盖 `organization_id/user_id/role/status`。
- [ ] 新增 `Project` 模型，字段覆盖 `organization_id/name/default_project/status/model_limits/monthly_budget_quota/budget_enforcement/metadata_json`。
- [ ] 新增 `OrganizationInvite` 模型，字段覆盖 `organization_id/email/role/token_hash/inviter_user_id/status/expired_at`。
- [ ] 新增 `OrganizationWalletTransaction` 模型，字段覆盖 `organization_id/actor_user_id/type/amount/balance_after/request_id/order_id/description/metadata_json`。
- [ ] 新增 `OrganizationAuditLog` 模型，字段覆盖 `organization_id/project_id/actor_user_id/action/target_type/target_id/ip/metadata_json`。
- [ ] 实现 `EnsurePersonalOrganizationForUser(userId int)`：创建 personal organization、owner member、default project；重复调用必须幂等。
- [ ] 实现 `EnsureDefaultProjectForOrganization(organizationId int)`：缺省项目不存在时创建，存在时返回。
- [ ] 实现 `BackfillPersonalOrganizations(batchSize int)`：为没有 personal organization 的用户分批补齐。
- [ ] 在 `model/main.go:migrateDB()` 的 `AutoMigrate` 列表加入新增模型。
- [ ] 在迁移流程中调用 `BackfillPersonalOrganizations(1000)`，失败时阻止迁移完成。
- [ ] 在 `controller/user.go:Register` 成功创建用户后调用 `EnsurePersonalOrganizationForUser(user.Id)`，该错误只记录系统日志，不阻断注册响应。

**测试:**

- [ ] `go test ./model -run 'TestEnsurePersonalOrganization|TestBackfillPersonalOrganizations|TestOrganizationRole|TestRecordOrganizationWallet'`
- [ ] `go test ./controller -run 'TestRegister|TestUser'`

**验收:**

- 存量用户启动后都有 personal organization 和 default project。
- 新注册用户自动拥有 personal organization 和 default project。
- 个人用户现有登录、token、充值、订阅页面不需要感知组织概念。

**Commit:**

```bash
git add model/organization.go model/organization_test.go model/main.go controller/user.go
git commit -m "feat: add organization project foundation"
```

---

## Phase 2: 现有记录增加组织/项目兼容字段

**目标:** 先给核心表补归属字段，但不切换业务行为。

**Files:**

- Modify `model/token.go`
- Modify `model/log.go`
- Modify `model/topup.go`
- Modify `model/subscription.go`
- Modify `model/invoice.go`
- Modify related model tests

**任务:**

- [ ] `Token` 增加 `organization_id/project_id/owner_type/owner_user_id/created_by_user_id`，默认值保持兼容。
- [ ] 新增 token owner 常量：`user`、`service_account`。
- [ ] 实现 `ResolveTokenOrganizationProject(token *Token)`：旧 token 缺字段时解析到用户 personal organization/default project 并回写。
- [ ] `Log` 增加 `organization_id/project_id/actor_user_id`。
- [ ] `TopUp` 增加 `organization_id/payer_user_id`。
- [ ] `SubscriptionOrder` 增加 `organization_id/purchaser_user_id`。
- [ ] `UserSubscription` 增加 `organization_id`。
- [ ] `Invoice` 增加 `organization_id/actor_user_id`，发票仍按旧用户维度可查。
- [ ] 编写 backfill 任务：补齐 token/topup/subscription/invoice 的 organization/project 字段。
- [ ] 历史 logs 第一阶段允许空字段，查询层使用 fallback；补历史 logs 放到 Phase 6。

**测试:**

- [ ] `go test ./model -run 'TestTokenResolveProject|TestTopUp|TestSubscription|TestInvoice'`
- [ ] `go test ./model`

**验收:**

- 老 token key 不变。
- 老 token 可以被解析到 personal organization/default project。
- 老充值、订阅、发票记录可查。
- AutoMigrate 在 SQLite/MySQL/PostgreSQL 兼容字段新增。

**Commit:**

```bash
git add model
git commit -m "feat: add organization ownership columns"
```

---

## Phase 3: 请求上下文加入组织/项目语义

**目标:** 在不改变扣费逻辑的前提下，让 token-auth 请求能解析出 organization/project。

**Files:**

- Create `service/organization_context.go`
- Create `service/organization_context_test.go`
- Modify `constant/context_key.go`
- Modify `middleware/auth.go`
- Modify `relay/common/relay_info.go`

**任务:**

- [ ] 新增 context keys：`actor_user_id`、`organization_id`、`project_id`、`billing_organization_id`、`organization_role`。
- [ ] 实现 `ResolveTokenOrganizationContext(token *model.Token)`，基于 token 归属得到 organization/project/billing organization。
- [ ] 在 `TokenAuth` 成功验证 token 后写入 context keys。
- [ ] `RelayInfo` 增加 `OrganizationId/ProjectId/BillingOrganizationId/ActorUserId`。
- [ ] `GenRelayInfo` 从 context keys 填充上述字段。
- [ ] 保留现有 `c.Set("id", token.UserId)` 和 `relayInfo.UserId`，避免旧逻辑断裂。

**测试:**

- [ ] `go test ./service -run TestResolveTokenOrganizationContext`
- [ ] `go test ./middleware ./relay/...`

**验收:**

- 新 token-auth 请求能在 relayInfo 中看到 org/project。
- 旧 token 会 fallback 到 personal organization/default project。
- 此阶段不改变钱包扣费对象。

**Commit:**

```bash
git add service/organization_context.go service/organization_context_test.go constant/context_key.go middleware/auth.go relay/common/relay_info.go
git commit -m "feat: resolve organization context for token auth"
```

---

## Phase 4: 组织钱包扣费链路

**目标:** 团队/project token 支持扣 organization 钱包；个人 token 扣 personal organization 钱包，旧 user quota 进入兼容期。

**Files:**

- Create `service/organization_billing.go`
- Create `service/organization_billing_test.go`
- Modify `service/billing_session.go`
- Modify `service/quota.go`
- Modify `service/text_quota.go`
- Modify `service/violation_fee.go`
- Modify batch update/cache paths if they still assume user quota only

**任务:**

- [ ] 实现 `GetOrganizationQuota`、`IncreaseOrganizationQuota`、`DecreaseOrganizationQuota`。
- [ ] `DecreaseOrganizationQuota` 使用条件更新，避免并发扣成负数。
- [ ] 实现 `UpdateOrganizationUsedQuotaAndRequestCount`。
- [ ] 实现 `OrganizationWalletFunding`，接口语义与现有 `WalletFunding` 一致。
- [ ] `NewBillingSession` 优先使用 `relayInfo.BillingOrganizationId` 创建组织钱包 funding。
- [ ] personal organization 路径保持旧错误码和用户提示兼容。
- [ ] 所有消费完成后的 used quota/request count 更新写入 organization。
- [ ] 保留 `users.quota` 兼容展示策略，明确它不再作为新扣费事实来源。

**测试:**

- [ ] `go test ./service -run 'TestDecreaseOrganizationQuota|TestOrganizationWalletFunding|TestBillingSession'`
- [ ] `go test ./model ./service ./relay/...`

**验收:**

- 团队 token 不扣创建者个人余额。
- organization quota 不会被并发扣成负数。
- 钱包不足错误仍按现有 API 语义返回。

**Commit:**

```bash
git add service model relay
git commit -m "feat: bill requests to organization wallet"
```

---

## Phase 5: 充值、订阅、发票归属 organization

**目标:** 充值和订阅进入 organization，不进入 user 或 project。

**Files:**

- Modify `model/topup.go`
- Modify `model/subscription.go`
- Modify `model/invoice.go`
- Modify `controller/topup.go`
- Modify `controller/topup_stripe.go`
- Modify `controller/topup_creem.go`
- Modify `controller/topup_waffo.go`
- Modify `controller/subscription*.go`
- Modify `controller/invoice.go`

**任务:**

- [ ] top-up 创建时设置 `organization_id/payer_user_id`。
- [ ] 旧个人充值入口默认使用当前用户 personal organization。
- [ ] 企业充值入口校验当前成员角色为 owner 或 billing。
- [ ] 支付成功后增加 organization quota。
- [ ] 支付成功后写 `organization_wallet_transactions(type=topup)`。
- [ ] 订阅订单创建时设置 `organization_id/purchaser_user_id`。
- [ ] 用户订阅创建时设置 `organization_id`。
- [ ] organization subscription 不允许被团队 token fallback 到成员个人订阅。
- [ ] 发票记录归属 organization，旧个人发票查询映射到 personal organization。

**测试:**

- [ ] `go test ./model -run 'TestTopUp|TestSubscription|TestInvoice'`
- [ ] `go test ./controller -run 'Test.*TopUp|TestPayment|Test.*Subscription|Test.*Invoice'`

**验收:**

- 付款人不是余额所有者，余额属于 organization。
- 成员离开企业后，企业余额、订阅、发票仍属于企业。
- 个人用户充值体验保持不变。

**Commit:**

```bash
git add model controller service
git commit -m "feat: attach payments to organizations"
```

---

## Phase 6: 日志、用量统计和审计日志

**目标:** 新消费日志写入 org/project/token/actor 维度，支持企业用量统计和管理审计。

**Files:**

- Modify `model/log.go`
- Create `model/organization_log_test.go`
- Modify `service/quota.go`
- Modify `service/text_quota.go`
- Modify `service/violation_fee.go`
- Modify relay/image/task logging call sites
- Modify `controller/log.go`
- Create or modify organization audit helpers in `model/organization.go`

**任务:**

- [ ] `RecordConsumeLog` 参数增加 `OrganizationId/ProjectId/ActorUserId`。
- [ ] relay 消费日志写入 `relayInfo.OrganizationId/ProjectId/ActorUserId`。
- [ ] 图像、任务、MJ 等异步日志补齐 org/project 字段。
- [ ] 新增 `GetOrganizationLogs`，支持 organization/project/time/token/model 过滤。
- [ ] 新增 organization usage summary，支持按 project/token/user/model 聚合。
- [ ] 新增 `RecordOrganizationAuditLog`。
- [ ] 成员、项目、token、充值、订阅管理动作写 audit log。
- [ ] 历史 log 查询 fallback：`organization_id = 0` 时映射用户 personal organization。

**测试:**

- [ ] `go test ./model -run 'TestGetOrganizationLogs|TestOrganizationUsage|TestOrganizationAudit'`
- [ ] `go test ./service ./controller -run 'Test.*Log|Test.*Usage|Test.*Quota'`

**验收:**

- 新消费日志带 organization/project/token。
- 企业能按组织、项目、token、模型统计用量。
- 管理动作与消费日志分离。

**Commit:**

```bash
git add model service controller relay
git commit -m "feat: attribute usage to organizations"
```

---

## Phase 7: 组织、项目、成员、项目 token API

**目标:** 提供客户侧组织能力 API，同时旧个人 token API 保持可用。

**Files:**

- Create `controller/organization.go`
- Create `controller/organization_test.go`
- Modify `controller/token.go`
- Modify `router/api-router.go`
- Modify `model/organization.go`
- Modify `model/token.go`

**任务:**

- [ ] `GET /api/organizations` 返回当前用户加入的组织列表。
- [ ] `POST /api/organizations` 创建 team organization，并创建 creator owner member 和 default project。
- [ ] `GET /api/organizations/:org_id/projects` 返回项目列表。
- [ ] `POST /api/organizations/:org_id/projects` 创建项目，校验 owner/admin。
- [ ] `GET /api/organizations/:org_id/members` 返回成员列表。
- [ ] `POST /api/organizations/:org_id/invites` 创建邀请，校验 owner/admin。
- [ ] `PATCH /api/organizations/:org_id/members/:user_id` 修改角色，校验 owner/admin。
- [ ] `DELETE /api/organizations/:org_id/members/:user_id` 移除成员。
- [ ] `GET /api/organizations/:org_id/projects/:project_id/tokens` 返回项目 token。
- [ ] `POST /api/organizations/:org_id/projects/:project_id/tokens` 创建项目 token，校验 owner/admin/developer。
- [ ] 项目 token update/delete 均校验 token 属于 path 中的 org/project。
- [ ] 旧 `/api/token` 继续映射到 personal organization/default project。

**测试:**

- [ ] `go test ./controller -run 'TestOrganization|TestCreateProjectToken|TestAddToken|TestUpdateToken'`
- [ ] `go test ./model ./controller ./middleware`

**验收:**

- 用户可在多个组织之间查询资源。
- 成员权限限制生效。
- 团队 token 不绑定创建者生命周期。

**Commit:**

```bash
git add controller model router/api-router.go
git commit -m "feat: add organization project api"
```

---

## Phase 8: web-worker 客户侧组织体验

**目标:** 新前端支持组织/项目切换、成员管理、项目 token、组织充值/账单和组织用量。

**Files in nested repo `web-worker/`:**

- Create `src/api-client/organizations.ts`
- Create `src/hooks/use-organizations.ts`
- Create `src/components/organization/organization-switcher.tsx`
- Create `src/components/organization/project-switcher.tsx`
- Create `src/routes/console/organization.tsx`
- Modify `src/components/layout/sidebar-layout.tsx`
- Modify `src/routes/console/token.tsx`
- Modify `src/routes/console/topup.tsx`
- Modify `src/routes/console/billing.tsx`
- Modify `src/routes/console/log.tsx`
- Modify `src/i18n/locales/*`

**任务:**

- [ ] 新增 organization API client。
- [ ] 新增 organization/project TanStack Query hooks。
- [ ] 新增组织切换器，单 personal organization 用户不强行展示复杂 UI。
- [ ] 新增项目切换器，多项目可见，单默认项目弱化展示。
- [ ] token 页根据当前 org/project 调用项目 token API。
- [ ] topup 页根据当前 organization 显示个人充值或组织充值。
- [ ] billing 页按 organization/project 聚合。
- [ ] log 页按 organization/project 查询。
- [ ] organization 页支持成员列表、邀请入口、项目列表。
- [ ] 根据角色隐藏充值、成员管理、组织设置入口。
- [ ] 补齐 zh/en/fr/ru/ja/vi 翻译。

**测试:**

- [ ] `git -C web-worker status --short`
- [ ] `cd web-worker && bun run build`
- [ ] `cd web-worker && bunx tsx --test src/lib/*.test.ts src/hooks/*.test.ts src/components/**/*.test.tsx`

**验收:**

- 个人用户默认体验接近当前控制台。
- 多组织用户能切换组织和项目。
- 无权限成员看不到不应操作的入口。

**Commit:**

```bash
git -C web-worker add src
git -C web-worker commit -m "feat: add organization console"
```

---

## Phase 9: 旧 web 平台管理员兜底

**目标:** 旧管理端提供平台管理员排障和运营兜底能力，不承载客户侧团队工作流。

**Files:**

- Modify `web/src` admin routes/components
- Modify admin controller endpoints in `controller/organization.go`

**任务:**

- [ ] 平台管理员可查看组织列表。
- [ ] 平台管理员可查看组织成员。
- [ ] 平台管理员可查看组织项目和项目 token。
- [ ] 平台管理员可给组织手动加减额度。
- [ ] 手动加减额度写 `organization_wallet_transactions(type=admin_adjust)`。
- [ ] 手动操作写 `organization_audit_logs`。
- [ ] 页面文案明确这是平台管理视角。

**测试:**

- [ ] `cd web && bun run build`
- [ ] `go test ./controller -run 'Test.*Organization.*Admin|Test.*Wallet.*Admin'`

**验收:**

- 平台 admin 不被误认为组织 owner。
- 平台手工操作有流水和审计记录。

**Commit:**

```bash
git add web controller model
git commit -m "feat: add organization admin fallback"
```

---

## Phase 10: 全链路兼容验证和灰度清理

**目标:** 确认个人用户和企业组织路径都稳定，再逐步收敛旧 user quota 兼容逻辑。

**任务:**

- [ ] 老 token 不换 key，仍可调用。
- [ ] 老 token 首次调用时能解析并回写 personal organization/default project。
- [ ] 老充值记录能在个人账单里查到。
- [ ] 老订阅能继续消耗。
- [ ] 老日志能在个人日志页查到。
- [ ] 新团队 token 扣组织钱包。
- [ ] 新团队 token 消耗组织订阅。
- [ ] 成员离职后不能进组织控制台。
- [ ] 成员离职后其创建的团队 token 不自动失效。
- [ ] 组织钱包并发扣费不会出现负数。
- [ ] 组织充值、退款、手工调额都有流水。
- [ ] 管理动作都有审计日志。
- [ ] 统计导出能按 org/project/token/model 聚合。

**测试:**

- [ ] `go test ./model ./service ./middleware ./controller ./relay/...`
- [ ] `cd web-worker && bun run build`
- [ ] `cd web && bun run build`

**验收:**

- 个人用户无感迁移。
- 团队/企业最小闭环可用：成员、项目 token、组织充值/订阅、组织用量。
- 旧 `users.quota` 的后续角色被明确为兼容字段或展示缓存。

**Commit:**

```bash
git add model service middleware controller relay router/api-router.go web
git commit -m "test: harden organization migration"
```

---

## 最终验收清单

- [ ] 数据模型包含 organizations、organization_members、projects、organization_invites、organization_wallet_transactions、organization_audit_logs。
- [ ] 存量用户都有 personal organization/default project。
- [ ] 新注册用户自动拥有 personal organization/default project。
- [ ] token、log、topup、subscription、invoice 都有组织归属字段。
- [ ] 团队 token 扣 organization，不扣创建者个人余额。
- [ ] 充值进入 organization 钱包。
- [ ] 订阅归属 organization。
- [ ] 项目预算不是余额，项目不可独立充值。
- [ ] organization usage 可按 project/token/user/model 聚合。
- [ ] 平台 admin 与组织 admin 权限分离。
- [ ] `web-worker` 支持组织/项目切换。
- [ ] 旧个人用户主流程无感兼容。
