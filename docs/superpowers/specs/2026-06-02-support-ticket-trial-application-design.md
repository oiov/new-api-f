# Support Ticket Trial Application And Email Design

> Status: Approved for implementation planning
> Date: 2026-06-02
> Scope: 修复工单回复邮件通知对象，优化工单邮件 HTML 模板，新增用户通过工单申请 $5 试用额度并由管理员审核发放兑换码
> Out of scope: 自动给用户余额直接加额度、独立客服后台、风控黑名单系统、旧版 `web/` 工单 UI

## 1. Goals

本次改动围绕现有后端工单模块和 `web-worker` 控制台工单页面做优化。

目标：

1. 管理员回复用户工单时，只通知工单用户，不再通知管理员账号或 `support@nbility.dev` 兜底邮箱。
2. 用户回复工单时，仍通知管理员账号和兜底邮箱。
3. 工单邮件不再使用简陋的纯内容片段，改为与注册/重置邮件风格一致的 HTML 卡片模板。
4. 用户可以在自己的工单里提交一次 $5 试用额度申请。
5. 后端强制限制：同一用户只能提交一次试用申请，同一申请 IP 也只能提交一次试用申请；任一命中都拒绝。
6. 管理员可以在工单详情中拒绝或通过申请。
7. 通过申请后，系统自动创建一个 $5 额度兑换码，并通过工单消息告知用户去 `https://nbility.dev/console/topup` 使用。
8. 完成模板优化后，尽力向 `3224266014@qq.com` 发送一封测试邮件验证效果；如果本地邮件配置或网络不允许，需要明确记录阻塞原因。

## 2. Current Context

现有工单功能已经具备：

- 后端模型：`SupportTicket`、`SupportTicketMessage`。
- 后端路由：`/api/support/tickets` 下的列表、创建、详情、回复、附件、状态更新。
- 通知服务：`service/support_ticket_notification.go`。
- 站内信与邮件发送：`service.SendSiteNotificationToUser` 和 `common.SendEmail`。
- 兑换码模型：`model.Redemption` 和 `model.BuildRedemptionKey`。
- `web-worker` 页面：`/console/tickets`、工单表格、创建弹窗、详情抽屉。

已定位到通知异常的根因：`notifySupportTicketMessageAdded` 当前总是先调用 `notifySupportTicketAdmins`，然后在发送者不是工单用户时通知用户。测试 `TestSupportTicketAdminReplyNotifiesTicketOwnerAndOtherAdmins` 也固化了“管理员回复还通知其他管理员和兜底邮箱”的旧行为。因此修复需要先改测试期望，再改实现。

当前注册/重置邮件在 `controller/misc.go` 中已有 `buildAuthEmailContent` 风格的 HTML 卡片模板。工单通知当前只拼接短 HTML 内容交给 `common.SendEmail`，视觉层次不足，也无法稳定复用按钮、摘要和元信息布局。

## 3. Product Decisions

### 3.1 Trial Application Entry

在 `web-worker` 工单详情抽屉里，把“申请 $5 试用额度”作为回复框上方的一条轻量申请区，而不是要求用户手动输入固定文本。

普通用户看到：

- 未申请过且工单未关闭：显示申请说明和申请按钮。
- 已申请：显示申请状态。
- 后端拒绝申请时：弹出错误提示，并刷新工单详情。

管理员看到：

- 工单有试用申请时，在详情顶部的状态/优先级管理区域下方显示申请卡片。
- 待审核申请显示“通过”和“拒绝”按钮。
- 已审核申请显示审核结果、审核时间、申请 IP；通过时显示兑换码。

### 3.2 Anti-Abuse Rule

后端强制执行两条唯一性限制：

- `user_id` 只能出现一次试用申请。
- `request_ip` 只能出现一次试用申请。

只要用户或 IP 任一已有申请记录，就拒绝新的申请。拒绝发生在创建申请的后端事务中，前端只负责展示错误。管理员审核不再重新判断 IP 限制，因为申请记录已经在创建时固定。

### 3.3 Review Outcome Messages

审核动作通过工单消息反馈用户：

- 通过：创建兑换码后追加管理员消息，包含兑换码和 `https://nbility.dev/console/topup`。
- 拒绝：追加管理员消息，告知申请未通过。

这些系统追加的工单消息仍走正常工单消息通知逻辑：审核者是管理员，因此只通知工单用户。

## 4. Backend Design

### 4.1 Model

新增 `SupportTicketTrialApplication`，放在 `model/support_ticket.go` 或独立 `model/support_ticket_trial_application.go`。

字段：

- `Id int`
- `TicketId int`
- `UserId int`
- `RequestIP string`
- `Status string`
- `ReviewerUserId int`
- `RedemptionId int`
- `RedemptionKey string`
- `CreatedAt int64`
- `ReviewedAt int64`
- `UpdatedAt int64`

状态枚举：

- `pending`
- `approved`
- `rejected`

索引与约束：

- `ticket_id` 普通索引。
- `user_id` 唯一索引，保证同一用户只能申请一次。
- `request_ip` 唯一索引，保证同一 IP 只能申请一次。
- `status` 普通索引。

使用 GORM AutoMigrate，字段类型选择 `varchar`、`text`、`bigint` 等跨 SQLite、MySQL、PostgreSQL 可用类型，不写数据库专用 DDL。

### 4.2 Model Functions

新增模型函数：

- `CreateSupportTicketTrialApplication(ticketId int, userId int, requestIP string) (*SupportTicketTrialApplication, *SupportTicketMessage, *SupportTicket, error)`
- `GetSupportTicketTrialApplicationByTicketId(ticketId int) (*SupportTicketTrialApplication, error)`
- `ReviewSupportTicketTrialApplication(ticketId int, reviewerUserId int, approve bool) (*SupportTicketTrialApplication, *SupportTicketMessage, *SupportTicket, error)`

创建申请的事务：

1. 加载工单，确认工单存在、属于当前用户、未关闭。
2. 标准化申请 IP，空 IP 直接拒绝。
3. 查询是否存在相同 `user_id` 或 `request_ip` 的申请。
4. 创建 `pending` 申请。
5. 追加一条用户消息，例如“已提交 $5 试用额度申请，等待管理员审核。”
6. 更新工单 `last_message_at`。

审核通过的事务：

1. 加载申请并确认状态为 `pending`。
2. 生成额度兑换码，额度为 `int(5 * common.QuotaPerUnit)`。
3. 创建 `model.Redemption`，`UserId` 使用审核管理员 ID 或 0 均可；推荐使用审核管理员 ID 便于追踪，`Name` 使用短名称如 `Trial $5`。
4. 更新申请为 `approved`，保存 `reviewer_user_id`、`redemption_id`、`redemption_key`、`reviewed_at`。
5. 追加管理员消息，包含兑换码和充值地址。
6. 如果工单仍是 `pending`，可推进为 `in_progress`。

审核拒绝的事务：

1. 加载申请并确认状态为 `pending`。
2. 更新申请为 `rejected`，保存审核人和审核时间。
3. 追加管理员消息，告知申请未通过。
4. 如果工单仍是 `pending`，可推进为 `in_progress`。

错误消息需要区分：

- 同一用户已申请过：`你已经提交过试用额度申请`
- 同一 IP 已申请过：`当前网络环境已提交过试用额度申请`
- 无待审核申请：`没有待审核的试用额度申请`
- 已审核：`该试用额度申请已审核`

### 4.3 Controller And Routes

在现有 `supportTicketRoute` 下新增：

```text
POST /api/support/tickets/:id/trial_application
POST /api/support/tickets/:id/trial_application/review
```

创建申请：

- 需要普通登录用户。
- 只能对自己的工单申请。
- 使用 `c.ClientIP()` 记录申请 IP。
- 请求体可以为空。
- 返回最新申请、消息和工单，便于前端刷新。

审核申请：

- 需要管理员角色。
- 请求体：

```json
{
  "approved": true
}
```

- 返回最新申请、消息和工单。

`GET /api/support/tickets/:id` 的详情响应需要增加可选字段：

```json
{
  "ticket": {},
  "messages": [],
  "trial_application": null
}
```

普通用户也可以看到自己申请的状态；管理员可以看到申请 IP、审核人、兑换码等完整字段。

### 4.4 Notification Behavior

修复 `notifySupportTicketMessageAdded`：

- 当 `senderUserId == ticket.UserId`：通知管理员和兜底邮箱，不通知用户本人。
- 当 `senderUserId != ticket.UserId`：只通知工单用户，不通知管理员和兜底邮箱。

管理员回复待处理工单导致状态自动变为 `in_progress` 时，不再额外发送状态更新邮件。否则用户会同时收到“收到回复”和“状态已更新”两封邮件。显式修改状态的 `PUT /api/support/tickets/:id` 仍发送状态更新通知。

### 4.5 Email Template

新增工单邮件模板构建器，推荐放在 `service/support_ticket_notification.go`：

- `buildSupportTicketEmailContent(title, intro string, ticket *model.SupportTicket, bodyHTML string) string`
- `buildSupportTicketMessageEmailContent(...)`
- `buildSupportTicketStatusEmailContent(...)`
- `buildSupportTicketCreatedEmailContent(...)`

模板风格参考 `buildAuthEmailContent`：

- 浅灰背景。
- 白色 8px 圆角卡片。
- 顶部显示 `common.SystemName`。
- 主标题。
- 工单元信息区：工单 ID、主题、状态、优先级。
- 内容摘要区。
- 可选按钮：进入工单或充值页。
- 页脚提示“此邮件由系统自动发送”。

内容必须使用 `html.EscapeString` 处理用户输入。兑换码和链接由系统生成，也应按 HTML 上下文转义。

`service.SendSiteNotificationToUser` 当前会直接把站内信内容作为邮件内容发送。为避免影响其他站内信，本次工单通知不通过该函数发送邮件模板；工单通知需要先创建站内信，再单独调用 `common.SendEmail` 发送模板邮件并回写 `email_sent`。

## 5. Frontend Design (`web-worker`)

`web-worker/` 是嵌套 git 仓库。修改和检查时使用：

- `git -C web-worker status`
- `git -C web-worker diff`
- `pnpm` 脚本

### 5.1 API Client And Types

更新 `web-worker/src/api-client/types.ts`：

- `SupportTicketTrialApplication`
- `SupportTicketDetail.trial_application`
- `CreateTrialApplicationResponse`
- `ReviewTrialApplicationRequest`
- `ReviewTrialApplicationResponse`

更新 `web-worker/src/api-client/tickets.ts`：

- `createSupportTicketTrialApplication(ticketId)`
- `reviewSupportTicketTrialApplication(ticketId, req)`

更新 `web-worker/src/hooks/use-tickets.ts`：

- 创建申请 mutation，成功后刷新工单列表和详情。
- 审核申请 mutation，成功后刷新工单列表、详情、站内信未读数。

### 5.2 Ticket Detail UI

普通用户：

- 在回复框上方显示试用申请区。
- 按钮文案：`申请 $5 试用额度`。
- 说明文案保持简短，提示每个用户和 IP 只能申请一次。
- 已申请时显示状态徽标，不再显示申请按钮。

管理员：

- 在详情顶部状态控制区域下方显示试用申请卡片。
- 显示申请状态、申请 IP、申请时间。
- 待审核时显示“通过”和“拒绝”按钮。
- 已通过时显示兑换码；已拒绝时显示拒绝状态。

UI 使用现有 shadcn-style 组件和 `@tabler/icons-react`，避免新增组件库。

### 5.3 i18n

更新 `web-worker/src/i18n/locales/*/ticket.json`：

- 中文、英文完整翻译。
- 法语、俄语、日语、越南语、繁中补齐对应文案。
- 保持 `ticket-locales.test.ts` 对非中文 locale 无中文泄漏。

## 6. Testing And Verification

后端测试：

- 通知测试：管理员回复只给用户发邮件；用户回复仍给管理员和兜底邮箱发邮件。
- 详情测试：返回 `trial_application`。
- 创建申请测试：同用户重复申请失败；同 IP 不同用户申请失败；不同用户不同 IP 可以按规则走到待审核。
- 审核通过测试：创建 `$5` 额度兑换码，更新申请，追加工单消息。
- 审核拒绝测试：更新申请，追加工单消息，不创建兑换码。
- 邮件模板测试：包含工单 ID、主题、状态、摘要、按钮链接，且转义用户输入。

前端测试：

- API client 测试：申请和审核 endpoint、请求体、响应解析。
- locale 测试：非中文 locale 不包含中文。
- 可选组件测试或静态检查：申请按钮在已有申请时隐藏，管理员审核按钮只在 `pending` 时显示。

验证命令：

```bash
go test ./model ./service ./controller
pnpm -C web-worker check
pnpm -C web-worker build
```

如果需要单独跑 `web-worker` node 测试，可用项目已有 `tsx --test` 方式执行相关测试文件。

## 7. Test Email

实现邮件模板后，新增或复用一个小的本地测试入口，向 `3224266014@qq.com` 发送工单模板测试邮件。测试邮件应使用正式的 `common.SendEmail` 配置路径，不绕过发送器。

若发送失败，记录：

- 使用的发送类型：SMTP 或 Cloudflare Worker。
- 失败错误。
- 是否因为本地配置缺失、网络受限或远端接口失败。

## 8. Risks

- `request_ip` 唯一索引会让空 IP 也互相冲突，所以创建申请时必须拒绝空 IP，而不是写入空字符串。
- 某些代理环境下多个真实用户可能共享同一个出口 IP；这是用户明确要求的防刷策略，本次按强限制执行。
- `service.SendSiteNotificationToUser` 的通用邮件行为不适合模板化工单邮件，本次只针对工单通知增加专用发送路径，避免影响其他业务通知。
- 兑换码创建和申请审核必须在同一事务中完成，避免出现审核通过但没有兑换码，或兑换码创建后申请仍待审核的状态不一致。
