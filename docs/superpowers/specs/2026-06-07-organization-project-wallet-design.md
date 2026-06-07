# 组织、项目与组织钱包 — 设计文档

> 日期：2026-06-07
> 范围：Go 后端、旧 `web/` 管理端、新 `web-worker/` 客户端
> 目标：在兼容现有个人用户的前提下，引入团队/企业能力的基础模型

## 1. 背景

当前系统以个人用户为唯一资源与账单主体：

- `users` 直接持有 `quota`、`used_quota`、`request_count`、`group`、`role`。
- `tokens` 直接按 `user_id` 归属。
- `logs` 直接按 `user_id` 记录消费。
- relay 计费链路从 `relayInfo.UserId` 扣个人钱包或个人订阅。
- 前端控制台默认只有“我的 token / 我的账单 / 我的订阅”。

这适合个人使用，但不适合团队和企业：企业需要共享余额、共享订阅、成员权限、项目级 token、项目级统计，以及成员离职后生产 token 不失效。

## 2. 设计目标

采用 OpenAI-lite 的多租户模型：

```
User
  可以属于多个 Organization

Organization
  是账单、钱包、订阅、成员、发票主体

Project
  是 token、日志、模型限制、用量统计的隔离单元

Token
  属于 Project
  调用时消耗 Project 所在 Organization 的钱包或订阅

Log / Usage
  同时记录 organization、project、token、actor user，支持多维归因
```

关键原则：

- **User 是人**：用于登录、操作审计、成员身份。
- **Organization 是账单主体**：个人空间也是一种 `personal` organization。
- **Project 是资源隔离单元**：项目不直接持有真实余额。
- **Token 是项目访问凭证**：团队 token 不随创建者离职失效。
- **Log 是账本**：必须能按组织、项目、用户、token、模型聚合。

## 3. 非目标

第一版不做以下内容：

- 完整自定义 RBAC。
- 企业 SSO / SCIM。
- 项目独立充值或项目独立余额。
- 多租户级别的渠道、价格、品牌、独立域名隔离。
- 复杂审批流、采购单、合同账期。

这些可以在组织/项目/钱包基础模型稳定后扩展。

## 4. 方案选择

评估过三种路线：

- **方案 A — 只给用户加 team_id**：改动最少，但会把个人身份、团队归属、账单主体混在一起。用户加入多个团队、成员离职、团队 token 归属都会变复杂。
- **方案 B — 组织 + 默认项目（采纳）**：每个个人用户自动拥有 personal organization 和 default project；企业是另一种 organization。个人与企业走同一套模型，兼容性和扩展性最好。
- **方案 C — 完整企业多租户平台**：一次性做组织、项目、服务账号、审计、预算、SSO、独立计价等。功能完整，但改动面过大，不适合作为第一阶段。

采纳方案 B。

## 5. 数据模型

### 5.1 新增 `organizations`

组织是钱包、订阅、成员、账单的归属主体。

字段：

```
id
name
type                  personal | team | enterprise
owner_user_id
quota
used_quota
request_count
group
status                enabled | disabled
billing_preference
created_at
updated_at
deleted_at
```

说明：

- `personal` organization 自动随用户注册创建。
- 存量个人用户迁移时，`users.quota`、`users.used_quota`、`users.request_count`、`users.group` 复制到个人 organization。
- 过渡期可以保留 `users.quota` 作为兼容字段，但新计费逻辑应逐步以 `organizations.quota` 为准。

### 5.2 新增 `organization_members`

成员表表达用户与组织的关系。

字段：

```
id
organization_id
user_id
role                  owner | admin | developer | billing | viewer
status                active | invited | removed
created_at
updated_at
```

约束：

- 同一 `organization_id + user_id` 只允许一个当前成员关系。
- `personal` organization 默认只有一个 `owner`。
- 平台管理员角色仍使用现有 `users.role`，不等于组织角色。

角色含义：

```
owner      管理组织、成员、项目、token、账单、订阅
admin      管理项目、成员、token、查看组织用量
developer  创建/管理项目 token、查看项目用量
billing    充值、订阅、发票、账单导出
viewer     只读查看项目和用量
```

第一版权限可以用固定角色判断，不引入自定义权限点。

### 5.3 新增 `projects`

项目是 token、日志、模型限制和用量统计的隔离单元。

字段：

```
id
organization_id
name
default_project
status                enabled | disabled
model_limits_enabled
model_limits
monthly_budget_quota
budget_enforcement    disabled | soft | hard
metadata_json
created_at
updated_at
deleted_at
```

说明：

- 每个 organization 必须有一个 default project。
- 第一版可以只暴露默认项目，数据模型预留多项目。
- 项目预算不是余额。真实余额仍在 organization 钱包。
- `soft` 预算只提醒或标记；`hard` 预算请求前拦截。

### 5.4 新增 `organization_invites`

组织邀请用于企业成员加入。

字段：

```
id
organization_id
email
role
token_hash
inviter_user_id
status                pending | accepted | expired | revoked
expired_at
created_at
updated_at
```

邀请接受后创建或激活 `organization_members`。

### 5.5 新增 `organization_wallet_transactions`

组织钱包流水是充值、消费、退款、手工调额的审计账本。

字段：

```
id
organization_id
actor_user_id
type                  topup | consume | refund | admin_adjust | subscription_grant
amount
balance_after
request_id
order_id
description
metadata_json
created_at
```

要求：

- 所有余额变动必须写流水。
- 平台管理员手动加减额度也必须写 `admin_adjust`。
- 消费流水可以按请求同步写，也可以先由 logs 作为消费事实，再异步汇总；但充值、退款、调额必须同步写。

### 5.6 新增 `organization_audit_logs`

组织审计日志记录管理动作，不和消费日志混用。

字段：

```
id
organization_id
project_id
actor_user_id
action
target_type
target_id
ip
metadata_json
created_at
```

说明：

- `logs` 继续作为 API 消费、系统日志和账单归因来源。
- `organization_audit_logs` 只记录成员、项目、token、钱包、订阅等管理动作。
- 平台管理员代操作时，`actor_user_id` 记录平台管理员用户 id，`metadata_json` 记录代操作来源。

### 5.7 改造 `tokens`

新增字段：

```
organization_id
project_id
owner_type            user | service_account
owner_user_id
created_by_user_id
```

说明：

- 个人 token 属于 personal organization 的 default project。
- 团队 token 属于 team/enterprise organization 的 project。
- `created_by_user_id` 只记录谁创建；不决定 token 生命周期。
- 第一版可以不实现 service account UI，但 `owner_type` 预留。

兼容规则：

- 旧 token 没有 `organization_id/project_id` 时，查询用户 personal organization/default project 作为 fallback。
- 迁移完成后，新建 token 必须写入 `organization_id/project_id`。

### 5.8 改造 `logs`

新增字段：

```
organization_id
project_id
actor_user_id
```

说明：

- `user_id` 过渡期保留，含义逐步调整为兼容字段或请求归因用户。
- `actor_user_id` 表示发起操作的自然人；API token 调用中可能为空，或使用 token 的 `owner_user_id`。
- `organization_id/project_id/token_id` 是企业用量统计的核心维度。

历史日志：

- 第一阶段允许为空。
- 查询时若为空，按 `user_id` 映射到 personal organization/default project。
- 后续通过后台任务分批补齐。

### 5.9 改造充值、订单、订阅、发票

充值订单新增：

```
organization_id
payer_user_id
```

订阅订单和用户订阅新增：

```
organization_id
purchaser_user_id
```

发票或财务记录新增：

```
organization_id
actor_user_id
```

说明：

- 个人充值进入 personal organization。
- 企业充值进入 company organization。
- 付款人离开组织后，余额仍属于组织。
- 订阅也归属 organization。个人订阅只是 personal organization 的订阅。

## 6. 请求与计费链路

### 6.1 Context 语义

后端 Gin context 增加组织/项目语义：

```
actor_user_id
organization_id
project_id
billing_organization_id
organization_role
```

保留现有 `id` 作为兼容登录用户 id，但新组织接口应显式使用 `actor_user_id`。

### 6.2 API token 调用

请求链路：

```
Authorization token
  -> tokens
  -> project
  -> organization
  -> 检查 token / project / organization 状态
  -> 检查模型限制、项目预算
  -> 选择渠道
  -> 价格计算
  -> 扣 organization 订阅或钱包
  -> 记录 log: org_id/project_id/token_id/actor_user_id
```

扣费偏好沿用当前 `wallet_first / subscription_first / wallet_only / subscription_only`，但对象从 user 迁移到 organization。

### 6.3 客户端会话请求

前端客户控制台请求必须带当前 organization/project 上下文。可以采用：

```
X-Organization-Id
X-Project-Id
```

或在 REST 路径中表达：

```
/api/organizations/:org_id/projects/:project_id/tokens
```

建议新接口优先采用路径参数，避免隐式 header 导致误操作；旧接口在过渡期继续走 personal organization fallback。

### 6.4 并发扣费

组织钱包扣费必须保证并发安全：

- 数据库更新使用条件扣减：`quota >= amount`。
- Redis/批量扣费逻辑必须以 organization 为 key，不能继续只按 user 缓存。
- 失败回滚要同时处理 token quota、organization quota、subscription pre-consume。
- 日志与钱包流水的最终一致性要有补偿任务或对账能力。

## 7. 充值设计

充值进入 organization 钱包，不进入 user 或 project。

个人空间：

```
当前 organization = personal organization
创建 topup order
organization_id = personal organization id
payer_user_id = 当前用户
支付成功
增加 organizations.quota
写 organization_wallet_transactions(type=topup)
```

企业空间：

```
当前 organization = company organization
校验当前成员有 owner 或 billing 权限
创建 topup order
organization_id = company organization id
payer_user_id = 当前用户
支付成功
增加 company organization quota
写 organization_wallet_transactions(type=topup)
```

项目预算不影响充值入账。项目预算只在消费前检查。

## 8. 订阅设计

订阅归属 organization。

```
个人购买订阅 -> personal organization subscription
企业购买订阅 -> company organization subscription
```

API 请求时：

```
token -> project -> organization
按 organization 的 billing_preference 决定先扣订阅还是钱包
```

当前订阅模型中大量函数以 `userId` 为入参。迁移时新增 organization 版本函数，例如：

```
HasUsableOrganizationSubscription
PreConsumeOrganizationSubscription
GetAllActiveOrganizationSubscriptions
```

旧 user 版本在过渡期委托到用户 personal organization。

## 9. 成员生命周期

成员被移除后：

- 不能再进入该 organization。
- 不能查看该 organization 的项目、token、日志、账单。
- 其创建的团队 token 不自动失效，因为 token 属于 project。
- 审计日志保留其历史操作记录。

如需停用某成员创建的 token，应由 owner/admin 在项目 token 页显式禁用。

## 10. 前端设计

### 10.1 `web-worker`

新客户控制台负责组织体验：

- 组织切换器：个人空间、企业组织。
- 项目切换器：默认项目，后续多项目。
- 成员管理：邀请、移除、改角色。
- 项目 token：创建、禁用、旋转、模型限制、IP 限制。
- 组织充值/订阅：根据当前 organization 展示。
- 组织/项目用量统计：按 project、token、user、model 聚合。

只有当用户属于多个 organization 或当前 organization 非 personal 时，才强调团队 UI；个人用户默认体验应尽量保持现状。

### 10.2 旧 `web/`

旧管理端只做平台管理员视角：

- 查看组织、项目、成员。
- 给组织手动加减额度。
- 查看组织 token 和用量。
- 处理退款、发票、订阅兜底。

不要在旧 `web/` 里实现客户侧团队工作流。

## 11. 迁移策略

### 11.1 第一阶段：结构迁移

新增表和 nullable 字段：

```
organizations
organization_members
projects
organization_invites
organization_wallet_transactions
organization_audit_logs

tokens.organization_id/project_id/owner_type/owner_user_id/created_by_user_id
logs.organization_id/project_id/actor_user_id
topups.organization_id/payer_user_id
subscription_orders.organization_id/purchaser_user_id
user_subscriptions.organization_id
```

所有迁移必须兼容 SQLite、MySQL 5.7.8+、PostgreSQL 9.6+。

### 11.2 第二阶段：存量用户 backfill

对每个现有 user：

```
创建 personal organization
创建 default project
创建 organization_members(owner)
复制 user quota / used_quota / request_count / group 到 organization
补 tokens.organization_id/project_id
补 topups/subscription_orders/user_subscriptions.organization_id
```

历史 logs 可以分批补齐，不阻塞上线。

### 11.3 第三阶段：新逻辑写入

- 新注册用户自动创建 personal organization/default project。
- 新 token 必须绑定 organization/project。
- 新充值、订阅、消费日志必须写 organization/project。
- relay 新计费路径优先使用 organization。

### 11.4 第四阶段：兼容字段收敛

当 organization 计费稳定后：

- `users.quota` 可变为展示缓存或兼容字段。
- 旧 user-based 查询委托到 personal organization。
- 对外 API 保持兼容，不强制老用户更换 token。

## 12. API 边界

新增组织接口：

```
GET    /api/organizations
POST   /api/organizations
GET    /api/organizations/:org_id
PATCH  /api/organizations/:org_id

GET    /api/organizations/:org_id/members
POST   /api/organizations/:org_id/invites
PATCH  /api/organizations/:org_id/members/:user_id
DELETE /api/organizations/:org_id/members/:user_id

GET    /api/organizations/:org_id/projects
POST   /api/organizations/:org_id/projects
PATCH  /api/organizations/:org_id/projects/:project_id

GET    /api/organizations/:org_id/projects/:project_id/tokens
POST   /api/organizations/:org_id/projects/:project_id/tokens
PATCH  /api/organizations/:org_id/projects/:project_id/tokens/:token_id
DELETE /api/organizations/:org_id/projects/:project_id/tokens/:token_id

GET    /api/organizations/:org_id/usage
GET    /api/organizations/:org_id/wallet/transactions
POST   /api/organizations/:org_id/topups
POST   /api/organizations/:org_id/subscription/orders
```

旧个人接口继续保留，默认映射到当前用户 personal organization/default project。

## 13. 审计日志

新增组织审计事件，至少覆盖：

```
organization.created
organization.updated
member.invited
member.accepted
member.role_updated
member.removed
project.created
project.updated
token.created
token.rotated
token.deleted
wallet.topup
wallet.admin_adjust
subscription.created
subscription.cancelled
```

第一版可以先只落表，UI 后续补。

## 14. 测试

后端测试：

- 存量用户迁移生成 personal organization/default project。
- 新注册用户自动创建 personal organization/default project。
- 个人 token fallback 不改变原有调用行为。
- 团队 token 扣 organization quota，不扣创建者个人 quota。
- 成员移除后不能管理团队 token，但团队 token 仍可调用。
- billing 角色可充值，developer/viewer 不可充值。
- 项目 hard budget 超限时拦截请求。
- 组织订阅优先/钱包优先策略与现有语义一致。
- 并发扣费不会把 organization quota 扣成负数。

前端测试：

- 个人用户默认仍看到个人 token/账单体验。
- 多组织用户能切换 organization。
- 组织切换后 token、账单、用量查询使用当前 organization/project。
- 无权限成员看不到充值、成员管理、组织设置入口。

迁移测试：

- SQLite、MySQL、PostgreSQL 都能完成迁移。
- 老 token key 不变。
- 老余额、订阅、充值记录可查。
- 历史 log 在未 backfill 时仍可通过 fallback 查询。

## 15. 高危走查点

1. **扣费主体**：团队 token 必须扣 organization，不得扣创建者个人余额。
2. **权限主体**：平台 admin 与组织 admin 必须分开。
3. **成员离职**：团队 token 不随创建者离职自动失效。
4. **历史兼容**：老 API key 不变，老用户默认体验不变。
5. **并发扣费**：组织余额不能因高并发扣成负数。
6. **日志归因**：新消费日志必须带 `organization_id/project_id/token_id`。
7. **充值归属**：付款人不是余额所有者，余额属于 organization。
8. **订阅归属**：企业成员使用团队 token 时消耗企业订阅。
9. **项目预算**：预算不是余额，不允许项目独立充值。
10. **跨 DB 迁移**：所有新增字段和 backfill 必须同时兼容 SQLite、MySQL、PostgreSQL。

## 16. 分阶段实施建议

第一阶段：数据骨架与兼容迁移，包含组织审计日志表预留。

第二阶段：新注册 personal organization/default project，旧个人接口 fallback。

第三阶段：项目 token 与 organization 计费链路。

第四阶段：web-worker 组织切换、成员管理、项目 token。

第五阶段：组织充值、订阅、钱包流水、用量统计。

第六阶段：审计日志 UI、service account、项目预算、企业增强。
