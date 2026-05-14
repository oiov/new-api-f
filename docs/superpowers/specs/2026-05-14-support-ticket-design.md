# Support Ticket Feature Design

> Status: Approved for implementation planning
> Date: 2026-05-14
> Scope: 新增用户/管理员共用的工单功能，包含后端工单与消息接口、数据库模型、`web-worker` 工单页面、`web-worker` 站内信页面、工单邮件/站内信通知
> Out of scope: 自动创建退款单、自动创建发票申请、文件附件、SLA 规则、管理员独立后台页面

---

## 1. Goals

新增一个独立工单功能，让用户可以在 `web-worker` 控制台提交问题、查看处理进度，并与管理员继续沟通。管理员使用同一个页面入口查看所有工单，直接回复、调整状态和优先级。

本次目标：

1. 用户可以创建普通工单、退款工单、发票申请三类工单。
2. 用户可以查看自己的工单列表、详情和沟通记录。
3. 管理员可以在同一页面查看全部工单，筛选、回复并更新状态和优先级。
4. 工单列表项固定包含：ID、主题、状态、优先级、更新时间、操作。
5. 状态包含：待处理、处理中、已解决、已关闭。
6. 退款工单和发票申请只作为工单分类处理，不自动打通现有退款或发票业务流程。
7. 用户创建工单后，向用户绑定邮箱发送创建确认邮件；发送失败记录日志，不回滚工单创建。
8. 工单状态更新后，向用户发送站内信，并在用户绑定邮箱时发送邮件；发送失败记录日志，不回滚状态更新。
9. `web-worker` 补齐站内信页面，用户可以查看站内信、筛选未读、标记已读和全部已读。

## 2. Current Context

当前项目已有相关但不等价的能力：

- 后端已有发票申请接口和管理接口，位于 `/api/user/invoice` 和 `/api/invoice/admin`。
- 订阅退款已有部分自助退款/转换申请逻辑，但它是订阅业务流程的一部分。
- `web-worker` 已有 `/console/tasks`、`/console/log`、`/console/billing` 等控制台页面，使用 TanStack Router、React Query、`apiFetch` 和 shadcn-style UI 组件。
- 后端已有站内信模型、用户自查接口和管理员发送接口：`/api/user/self/notifications`、`/api/user/self/notifications/unread_count`、`/api/user/self/notifications/:id/read`、`/api/user/self/notifications/read_all`。
- 未发现独立的工单、支持会话或用户-管理员持续沟通模块。
- `web-worker` 目前没有完整的站内信列表页面，本次与工单页面一起补齐。

因此本功能应新增独立 support ticket 模块，不复用发票或订阅退款表，以避免把人工支持沟通和已有业务审批流程耦合。

## 3. Product Decisions

### 3.1 Scope

采用“用户侧 + 管理员侧共用一个页面”的方案：

- 普通用户进入 `/console/tickets` 时看到“我的工单”。
- 管理员进入同一路由时看到“全部工单”。
- 页面根据当前用户角色切换数据范围和可见操作。

### 3.2 Ticket Types

支持三类工单：

- `normal`: 普通工单
- `refund`: 退款工单
- `invoice`: 发票申请

退款和发票类型只用于分类、筛选和默认优先级，不自动创建退款单或发票申请。

### 3.3 Statuses

状态枚举：

- `pending`: 待处理
- `in_progress`: 处理中
- `resolved`: 已解决
- `closed`: 已关闭

初始状态为 `pending`。管理员回复工单时，如果当前仍是 `pending`，可以由后端自动推进为 `in_progress`，减少管理员重复操作。用户追加消息不自动改变状态。

### 3.4 Priority

优先级枚举：

- `low`: 低
- `normal`: 普通
- `high`: 高
- `urgent`: 紧急

默认优先级按工单类型设置：

- 普通工单：`normal`
- 退款工单：`high`
- 发票申请：`high`

用户创建时不选择优先级，管理员可以在详情面板中调整。

### 3.5 Notifications

通知规则：

- 创建工单后，后端向工单用户的绑定邮箱发送确认邮件。
- 工单状态发生变化后，后端向工单用户发送站内信，并在用户绑定邮箱时同步发送邮件。
- 通知发送异步执行，失败只记录系统日志，不回滚工单创建、回复或状态更新。
- 管理员回复待处理工单并自动推进到 `in_progress` 时，也视为状态变化，需要触发状态更新通知。
- 仅状态变化触发站内信；普通追加消息不单独发站内信。

## 4. Backend Design

### 4.1 Models

新增 `model/support_ticket.go`，定义两张表。

`SupportTicket`:

- `Id int`
- `UserId int`
- `Username string` with `gorm:"-"`
- `Type string`
- `Subject string`
- `Status string`
- `Priority string`
- `LastMessageAt int64`
- `CreatedAt int64`
- `UpdatedAt int64`

`SupportTicketMessage`:

- `Id int`
- `TicketId int`
- `SenderUserId int`
- `SenderUsername string` with `gorm:"-"`
- `IsAdmin bool`
- `Content string`
- `CreatedAt int64`

GORM should create portable schemas for SQLite, MySQL, and PostgreSQL. Text content uses `type:text`; enum values are stored as short strings rather than database-specific enum types.

### 4.2 Migration

Add both models to `migrateDB()` AutoMigrate. No raw SQL should be needed.

Expected indexes:

- `SupportTicket.UserId`
- `SupportTicket.Status`
- `SupportTicket.Type`
- `SupportTicket.Priority`
- `SupportTicket.LastMessageAt`
- `SupportTicketMessage.TicketId`

Index tags should use GORM abstractions so all supported databases remain compatible.

### 4.3 Model Functions

Add model-level functions that keep permissions and state transitions explicit:

- `CreateSupportTicket(userId int, ticketType, subject, content string) (*SupportTicket, error)`
- `ListSupportTickets(userId int, isAdmin bool, pageInfo *common.PageInfo, filters SupportTicketFilters) ([]*SupportTicket, int64, error)`
- `GetSupportTicketById(id int) (*SupportTicket, error)`
- `GetSupportTicketMessages(ticketId int) ([]*SupportTicketMessage, error)`
- `AddSupportTicketMessage(ticketId int, senderUserId int, isAdmin bool, content string) (*SupportTicketMessage, *SupportTicket, error)`
- `UpdateSupportTicketByAdmin(id int, status, priority string) (*SupportTicket, error)`
- `CloseSupportTicketByUser(id int, userId int) (*SupportTicket, error)`

Creation and message append should run in transactions:

1. Validate type/status/priority/content.
2. Create or load the ticket.
3. Create message.
4. Update `last_message_at` and `updated_at`.
5. If an admin replies to a `pending` ticket, update status to `in_progress`.

Closed tickets reject new user or admin messages until an administrator reopens them by setting status back to `in_progress` or `pending`.

### 4.4 Controller And Routes

Add `controller/support_ticket.go`.

Routes should be mounted under authenticated API routes:

```text
GET  /api/support/tickets
POST /api/support/tickets
GET  /api/support/tickets/:id
POST /api/support/tickets/:id/messages
PUT  /api/support/tickets/:id
```

All routes require `middleware.UserAuth()`. Admin capability is derived from the current user's role. For this feature, `role >= common.RoleAdminUser` can access all tickets and admin-only updates, matching existing role-based console behavior. If the project later adds granular support permissions, the route can be wrapped with permission middleware without changing the frontend contract.

### 4.5 Request And Response Shapes

Create ticket request:

```json
{
  "type": "normal",
  "subject": "模型返回异常",
  "content": "问题描述"
}
```

List response uses existing paginated `PageInfo` shape:

```json
{
  "items": [
    {
      "id": 128,
      "user_id": 7,
      "username": "alice",
      "type": "normal",
      "subject": "模型返回异常",
      "status": "in_progress",
      "priority": "normal",
      "last_message_at": 1778746567,
      "created_at": 1778746000,
      "updated_at": 1778746567
    }
  ],
  "page": 1,
  "page_size": 10,
  "total": 1
}
```

Detail response:

```json
{
  "ticket": {
    "id": 128,
    "user_id": 7,
    "username": "alice",
    "type": "normal",
    "subject": "模型返回异常",
    "status": "in_progress",
    "priority": "normal",
    "last_message_at": 1778746567,
    "created_at": 1778746000,
    "updated_at": 1778746567
  },
  "messages": [
    {
      "id": 1,
      "ticket_id": 128,
      "sender_user_id": 7,
      "sender_username": "alice",
      "is_admin": false,
      "content": "问题描述",
      "created_at": 1778746000
    }
  ]
}
```

Update request:

```json
{
  "status": "resolved",
  "priority": "high"
}
```

For user close action, the frontend can call the same `PUT` route with `{ "status": "closed" }`; the controller only allows non-admin users to close tickets they own.

### 4.6 Filters

`GET /api/support/tickets` supports:

- `p`
- `page_size`
- `status`
- `type`
- `priority`
- `keyword`

For administrators, `keyword` should search subject and username. For normal users, it searches only their own ticket subject. Message content search is out of scope for the first version because it adds more expensive joins and unclear privacy behavior.

### 4.7 Error Handling

Backend returns existing API envelope errors through `common.ApiErrorMsg`.

Important errors:

- Invalid type/status/priority.
- Empty subject or content.
- Subject too long.
- Ticket not found.
- User attempts to access another user's ticket.
- User attempts admin-only update.
- Reply attempted on closed ticket.

Subject should be trimmed and capped at a conservative length such as 200 characters. Content should be trimmed and capped at a conservative length such as 8000 characters to prevent accidental oversized records.

## 5. Frontend Design

### 5.1 Route And Navigation

Add route:

```text
/console/tickets
```

Add sidebar item to `web-worker/src/config/sidebar-config.ts` in the account section, after billing and before personal. This keeps support, billing, and account management together. The label should be:

- Chinese: `工单`
- English: `Tickets`

### 5.2 Page Layout

Use the selected “列表 + 右侧详情抽屉/面板” design.

Desktop:

- Page header with breadcrumb, title, description.
- Top actions: refresh, filter toggle, new ticket.
- Filter panel for status/type/priority/keyword.
- Main table with required columns: ID, subject, status, priority, updated time, action.
- Selecting a row or clicking action opens a right-side details panel.

Mobile:

- Keep the same list and filters.
- Details panel opens as a sheet/drawer.
- Table may use compact row cards if the existing responsive table becomes too cramped.

### 5.3 User And Admin Behavior

Normal user:

- Sees only own tickets.
- Can create tickets.
- Can view details and messages.
- Can add messages unless the ticket is closed.
- Can close own ticket.
- Cannot edit priority.
- Cannot reopen closed tickets.

Admin:

- Sees all tickets.
- Sees username in filters or table metadata where space allows.
- Can view all ticket details and messages.
- Can reply.
- Can change status and priority.
- Can reopen closed tickets by changing status.

### 5.4 Components And Client Modules

Likely new files:

- `web-worker/src/routes/console/tickets.tsx`
- `web-worker/src/components/ticket/ticket-table.tsx`
- `web-worker/src/components/ticket/ticket-detail-panel.tsx`
- `web-worker/src/components/ticket/new-ticket-dialog.tsx`
- `web-worker/src/api-client/tickets.ts`
- `web-worker/src/hooks/use-tickets.ts`
- `web-worker/src/lib/tickets.ts`
- `web-worker/src/lib/tickets.test.ts`

Likely modified files:

- `web-worker/src/config/sidebar-config.ts`
- `web-worker/src/api-client/types.ts`
- `web-worker/src/i18n/locales/zh/console.json`
- `web-worker/src/i18n/locales/en/console.json`
- Add a new `ticket` namespace under each active locale if the page has enough strings to avoid crowding `console.json`.

### 5.5 i18n

`web-worker` currently supports zh, en, fr, ru, ja, vi. The first implementation should add keys for all active locale files. zh and en should receive native strings; fr, ru, ja, and vi can use English fallback strings in this iteration to avoid missing-key noise.

Core labels:

- Ticket / 工单
- My tickets / 我的工单
- All tickets / 全部工单
- New ticket / 新建工单
- Type / 类型
- Subject / 主题
- Status / 状态
- Priority / 优先级
- Updated at / 更新时间
- Actions / 操作
- Pending / 待处理
- In progress / 处理中
- Resolved / 已解决
- Closed / 已关闭
- Normal ticket / 普通工单
- Refund ticket / 退款工单
- Invoice request / 发票申请

## 6. Data Flow

Create flow:

1. User opens `/console/tickets`.
2. User clicks new ticket.
3. Dialog submits type, subject, and content to `POST /api/support/tickets`.
4. Backend creates ticket and first message in one transaction.
5. Frontend invalidates the ticket list query and opens the created ticket detail.

Reply flow:

1. User or admin opens ticket detail.
2. Reply form submits content to `POST /api/support/tickets/:id/messages`.
3. Backend validates access, rejects closed tickets, creates message, updates timestamps, and may move `pending` to `in_progress` for admin replies.
4. Frontend invalidates detail and list queries so status and updated time refresh.

Admin update flow:

1. Admin changes status or priority in detail panel.
2. Frontend sends `PUT /api/support/tickets/:id`.
3. Backend validates enum values and role.
4. Frontend refreshes detail and list.

## 7. Security And Permissions

The controller must enforce data permissions even if frontend hides controls:

- Non-admin list queries must always scope `user_id` to the current user.
- Non-admin detail and message routes must verify ownership.
- Non-admin update route only allows setting their own ticket to `closed`.
- Admin list/detail/reply/update routes can access all tickets.
- Request bodies should be trimmed and length-limited.
- All JSON marshal/unmarshal in Go business code must use `common.DecodeJson`, `common.Unmarshal`, or related wrappers instead of direct `encoding/json` calls.

## 8. Testing Plan

### 8.1 Backend Tests

Add focused tests for model/controller behavior:

- Creating a normal ticket sets priority to `normal` and status to `pending`.
- Creating refund and invoice tickets sets priority to `high`.
- Creating a ticket also creates the first message.
- User list returns only that user's tickets.
- Admin list returns all tickets.
- User cannot read or reply to another user's ticket.
- Admin reply to `pending` ticket changes status to `in_progress`.
- Closed ticket rejects new messages.
- User can close own ticket but cannot change priority or reopen.
- Admin can change status and priority.

Tests should use existing test setup patterns in `controller/*_test.go` and `model/*_test.go`. Avoid database-specific SQL so the behavior remains cross-database compatible.

### 8.2 Frontend Tests

Add lightweight tests around pure logic:

- Ticket status label and badge variant mapping.
- Type label and default filter option mapping.
- Priority label and sort/display mapping.
- API query string builder omits empty filters.

Full component tests are optional in the first pass if the current `web-worker` setup makes UI tests expensive. Build validation is required.

### 8.3 Verification Commands

Backend:

```bash
go test ./model ./controller -count=1
```

Frontend:

```bash
cd web-worker
bunx tsx --test src/lib/tickets.test.ts
pnpm build
```

If package manager availability differs in the local environment, use the existing project-approved frontend command that matches `web-worker/package.json`.

### 8.4 Manual Verification

Use a local server and browser to verify:

- Normal user sees only own tickets.
- Admin sees all tickets.
- New ticket creates a row with the correct default priority.
- Detail panel shows the message timeline.
- Replies update the message list and table updated time.
- Admin can set status to resolved/closed and adjust priority.
- Closed ticket hides or disables the reply box for normal users.
- Mobile layout uses a usable sheet/detail flow.

## 9. Current Serial Task Board

当前执行方式：串行任务模式，不再派发子任务。

- [x] 合并 `support-ticket` worktree 后端基线到当前 `fishxcode` 工作区。
  - 已包含工单模型、枚举校验、并发更新修正、控制器/路由、通知服务。
- [x] 将新增通知范围纳入设计。
  - 创建工单后给用户发送邮件确认。
  - 工单状态更新后给用户发送站内信，并在用户已绑定邮箱时发送邮件。
  - 通知失败只记录日志，不回滚工单创建或状态更新。
- [x] 验证后端合并结果。
  - `go test ./model ./controller ./service -run 'TestSupportTicket' -count=1`
  - 可选扩大验证：`go test ./controller ./router ./model ./service -count=1`
- [x] 验证并提交 `web-worker` 工单 API、hooks、纯工具函数。
  - 包含 ticket API、站内信 API、React Query hooks、状态/类型/优先级展示 helper。
- [x] 验证并提交 `web-worker` i18n 与侧边栏。
  - 工单和站内信入口需要出现在控制台导航中。
  - `ticket` 命名空间覆盖 zh、zh-TW、en、fr、ru、ja、vi。
- [x] 验证并提交 `/console/tickets` 页面。
  - 普通用户只看自己的工单；管理员 `role >= 10` 查看全部工单。
  - 列表列包含 ID、主题、状态、优先级、更新时间、操作。
  - 详情面板支持继续沟通、用户关闭工单、管理员更新状态和优先级。
- [x] 验证并提交 `/console/notifications` 页面。
  - 用户可查看站内信、筛选未读、单条标记已读、全部标记已读。
  - 站内信内容以前端文本形式展示，不直接渲染原始 HTML。
- [x] 最终验证。
  - `web-worker`: `bunx tsx --test src/api-client/tickets.test.ts src/lib/tickets.test.ts src/api-client/site-notifications.test.ts`
  - `web-worker`: `pnpm build`
  - 可选：`pnpm check` 全仓库因既有格式问题失败；本次 touched 文件已通过局部 `pnpm exec biome check --write ...`

注意：父仓库中的 `web-worker/` 是嵌套前端 worktree，父仓库不要添加该路径；前端变更应在 `web-worker` 仓库内独立提交。

## 10. Risks And Mitigations

Risk: The shared user/admin page could become cluttered.
Mitigation: Keep admin-only controls inside the detail panel and only show username/admin filters when the current user is admin.

Risk: Refund and invoice labels may imply automated processing.
Mitigation: UI text should describe them as ticket types, not as direct refund or invoice submission flows. The spec explicitly keeps business integration out of scope.

Risk: Message content search could be useful but expensive.
Mitigation: First version searches subject and admin username only. Message search can be added later with a deliberate indexing strategy.

Risk: Role thresholds may differ from future granular permissions.
Mitigation: Keep role checks isolated in controller helper logic so permission middleware can replace it later.

## 11. Implementation Boundaries

Do not modify protected project identity, metadata, README branding, module paths, package names, or author attributions.

Do not alter existing invoice or subscription refund behavior. This feature may link users to submit a support ticket of type `invoice` or `refund`, but it does not call invoice/refund creation functions.

Keep changes focused to:

- New support ticket model/controller/routes.
- `migrateDB()` registration.
- `web-worker` ticket route, API client, hook, UI components, i18n, and sidebar entry.
- Focused tests for new behavior.
