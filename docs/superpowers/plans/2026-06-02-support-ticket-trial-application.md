# Support Ticket Trial Application Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix support-ticket reply email recipients, add bilingual polished support-ticket email templates with admin-selected reply language, and let users request a one-time $5 trial credit through a ticket with admin review and redemption-code delivery.

**Architecture:** Keep support-ticket business rules in the Go model/service/controller layers that already own tickets. Add a focused trial-application model associated with tickets, use backend transactions for user/IP uniqueness and redemption creation, and keep `web-worker` as a typed API/UI consumer. Ticket emails get a support-specific bilingual template sender so generic site notifications are not changed globally; email language defaults to English, and admin replies can pass `email_language` as `en` or `zh`.

**Tech Stack:** Go 1.22+, Gin, GORM, SQLite/MySQL/PostgreSQL-compatible schema, `common.SendEmail`, React 19, TanStack Query, `web-worker` TypeScript, shadcn-style UI, Tabler icons, i18next.

---

## File Structure

- Modify `service/support_ticket_notification_test.go`: update recipient tests and add bilingual HTML template escaping/default-language coverage.
- Modify `service/support_ticket_notification.go`: add bilingual support-ticket email template helpers, send templated emails while preserving site notifications, and route reply notifications by sender role/language.
- Modify `model/support_ticket_test.go`: add trial-application create/review tests and migrate the new tables in test setup.
- Create `model/support_ticket_trial_application.go`: define `SupportTicketTrialApplication`, constants, duplicate checks, create/review transaction helpers, and redemption creation.
- Modify `model/main.go`: include `SupportTicketTrialApplication` in AutoMigrate.
- Modify `controller/support_ticket_test.go`: add detail/creation/review API coverage and migrate the new tables in test setup.
- Modify `controller/support_ticket.go`: add `trial_application` to detail responses and add create/review handlers.
- Modify `router/api-router.go`: mount the two new trial-application routes under `/api/support/tickets`.
- Modify `web-worker/src/api-client/types.ts`: add trial application request/response types, detail field, and optional reply `email_language`.
- Modify `web-worker/src/api-client/tickets.ts`: add trial-application API calls.
- Modify `web-worker/src/api-client/tickets.test.ts`: cover the new endpoints.
- Modify `web-worker/src/hooks/use-tickets.ts`: add React Query mutations.
- Create `web-worker/src/lib/ticket-trial-application.ts`: small UI state helpers for application/review visibility.
- Create `web-worker/src/lib/ticket-trial-application.test.ts`: unit tests for those helpers.
- Modify `web-worker/src/components/ticket/ticket-detail-panel.tsx`: render user application controls, admin review controls, and admin reply email-language selector.
- Modify `web-worker/src/i18n/locales/*/ticket.json`: add translated strings for trial applications.

## Task 1: Fix Reply Notification Direction And Add Email Template Helpers

**Files:**
- Modify: `service/support_ticket_notification_test.go`
- Modify: `service/support_ticket_notification.go`

- [ ] **Step 1: Write failing notification and template tests**

Append or replace the admin-reply test in `service/support_ticket_notification_test.go` with this behavior, and add the template escaping/default-language tests:

```go
func TestSupportTicketAdminReplyNotifiesOnlyTicketOwner(t *testing.T) {
	withSupportTicketNotificationTestDB(t, func() {
		emails := withSupportTicketEmailCapture(t)
		user := &model.User{Id: 7, Username: "alice", Email: "alice@example.com", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AffCode: "alice"}
		admin := &model.User{Id: 1, Username: "admin", Email: "admin@example.com", Role: common.RoleAdminUser, Status: common.UserStatusEnabled, AffCode: "admin"}
		otherAdmin := &model.User{Id: 2, Username: "root", Email: "root@example.com", Role: common.RoleRootUser, Status: common.UserStatusEnabled, AffCode: "root"}
		require.NoError(t, model.DB.Create(user).Error)
		require.NoError(t, model.DB.Create(admin).Error)
		require.NoError(t, model.DB.Create(otherAdmin).Error)
		ticket, err := model.CreateSupportTicket(user.Id, model.SupportTicketTypeNormal, "模型异常", "返回 500")
		require.NoError(t, err)
		message, _, err := model.AddSupportTicketMessage(ticket.Id, admin.Id, true, "已处理，请重试")
		require.NoError(t, err)

		notifySupportTicketMessageAdded(admin.Id, ticket, message, SupportTicketEmailLanguageZh)

		var notifications []model.SiteNotification
		require.NoError(t, model.DB.Order("id asc").Find(&notifications).Error)
		require.Len(t, notifications, 1)
		require.Equal(t, user.Id, notifications[0].UserId)
		require.Equal(t, admin.Id, notifications[0].SenderUserId)
		require.True(t, notifications[0].EmailSent)

		require.Len(t, *emails, 1)
		require.Equal(t, "alice@example.com", (*emails)[0].To.Address)
		require.Contains(t, (*emails)[0].Subject, "工单收到回复")
		require.Contains(t, (*emails)[0].HTML, "你的工单收到新回复")
		require.Contains(t, (*emails)[0].HTML, "查看工单")
		require.Contains(t, (*emails)[0].HTML, "已处理，请重试")
		require.NotContains(t, (*emails)[0].HTML, "<script>")
	})
}

func TestSupportTicketEmailTemplateEscapesUserContent(t *testing.T) {
	ticket := &model.SupportTicket{
		Id:       42,
		Subject:  `模型<script>alert("x")</script>异常`,
		Status:   model.SupportTicketStatusInProgress,
		Priority: model.SupportTicketPriorityHigh,
	}
	message := &model.SupportTicketMessage{
		Content: `<script>alert("x")</script>请处理`,
	}

	html := buildSupportTicketMessageEmailContent(SupportTicketEmailLanguageZh, "工单收到回复：#42", "你的工单收到新回复。", ticket, message)

	require.Contains(t, html, "工单 #42")
	require.Contains(t, html, "模型&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;异常")
	require.Contains(t, html, "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;请处理")
	require.NotContains(t, html, "<script>")
	require.Contains(t, html, "/console/tickets")
}

func TestSupportTicketEmailTemplateDefaultsToEnglish(t *testing.T) {
	ticket := &model.SupportTicket{
		Id:       42,
		Subject:  "Model issue",
		Status:   model.SupportTicketStatusInProgress,
		Priority: model.SupportTicketPriorityNormal,
	}
	message := &model.SupportTicketMessage{Content: "Please try again"}

	html := buildSupportTicketMessageEmailContent("invalid", "Ticket reply: #42", "Your ticket received a new reply.", ticket, message)

	require.Contains(t, html, "Your ticket received a new reply.")
	require.Contains(t, html, "Status")
	require.Contains(t, html, "Priority")
	require.Contains(t, html, "In progress")
	require.Contains(t, html, "Normal")
	require.Contains(t, html, "View ticket")
	require.NotContains(t, html, "查看工单")
}
```

- [ ] **Step 2: Run tests and confirm they fail for the old behavior**

Run:

```bash
go test ./service -run 'TestSupportTicket(AdminReplyNotifiesOnlyTicketOwner|EmailTemplateEscapesUserContent|EmailTemplateDefaultsToEnglish)' -count=1
```

Expected: FAIL. The admin-reply test should see extra admin/fallback emails or notifications, and the template tests should fail because the bilingual template helpers and language constants do not exist.

- [ ] **Step 3: Add the support-ticket email sender helpers**

In `service/support_ticket_notification.go`, add helpers near `buildSupportTicketMessageNotificationContent`:

```go
func createSupportTicketSiteNotificationWithEmail(user *model.User, senderUserId int, title string, siteContent string, emailContent string) (*model.SiteNotification, error) {
	notification, err := SendSiteNotificationToUser(user, senderUserId, title, siteContent, "info", false)
	if err != nil || notification == nil {
		return notification, err
	}
	if strings.TrimSpace(user.Email) == "" {
		return notification, nil
	}
	if err := common.SendEmail(title, user.Email, emailContent); err != nil {
		return notification, nil
	}
	notification.EmailSent = true
	notification.EmailSentAt = common.GetTimestamp()
	_ = model.DB.Model(notification).Where("id = ?", notification.Id).Updates(map[string]any{
		"email_sent":    true,
		"email_sent_at": notification.EmailSentAt,
	}).Error
	return notification, nil
}

const (
	SupportTicketEmailLanguageEn = "en"
	SupportTicketEmailLanguageZh = "zh"
)

type supportTicketEmailCopy struct {
	Status       string
	Priority     string
	ViewTicket   string
	Attachment   string
	Footer       string
	CreatedBody  string
	OldStatus    string
	CurrentStatus string
	TicketLabel  string
}

func normalizeSupportTicketEmailLanguage(language string) string {
	switch strings.ToLower(strings.TrimSpace(language)) {
	case SupportTicketEmailLanguageZh:
		return SupportTicketEmailLanguageZh
	default:
		return SupportTicketEmailLanguageEn
	}
}

func supportTicketEmailCopyFor(language string) supportTicketEmailCopy {
	if normalizeSupportTicketEmailLanguage(language) == SupportTicketEmailLanguageZh {
		return supportTicketEmailCopy{
			Status:        "状态",
			Priority:      "优先级",
			ViewTicket:    "查看工单",
			Attachment:    "图片附件",
			Footer:        "此邮件由系统自动发送，请勿直接回复。",
			CreatedBody:   "我们已收到你的工单，会尽快处理。后续进展会通过站内信和邮件通知你。",
			OldStatus:     "原状态",
			CurrentStatus: "当前状态",
			TicketLabel:   "工单",
		}
	}
	return supportTicketEmailCopy{
		Status:        "Status",
		Priority:      "Priority",
		ViewTicket:    "View ticket",
		Attachment:    "Image attachment",
		Footer:        "This email was sent automatically. Please do not reply directly.",
		CreatedBody:   "We have received your ticket and will review it as soon as possible. Updates will be sent by site notification and email.",
		OldStatus:     "Previous status",
		CurrentStatus: "Current status",
		TicketLabel:   "Ticket",
	}
}

func supportTicketEmailStatusText(language string, status string) string {
	if normalizeSupportTicketEmailLanguage(language) == SupportTicketEmailLanguageZh {
		return SupportTicketStatusText(status)
	}
	switch strings.TrimSpace(status) {
	case model.SupportTicketStatusPending:
		return "Pending"
	case model.SupportTicketStatusInProgress:
		return "In progress"
	case model.SupportTicketStatusResolved:
		return "Resolved"
	case model.SupportTicketStatusClosed:
		return "Closed"
	default:
		return strings.TrimSpace(status)
	}
}

func supportTicketEmailPriorityText(language string, priority string) string {
	if normalizeSupportTicketEmailLanguage(language) == SupportTicketEmailLanguageZh {
		return SupportTicketPriorityText(priority)
	}
	switch strings.TrimSpace(priority) {
	case model.SupportTicketPriorityLow:
		return "Low"
	case model.SupportTicketPriorityHigh:
		return "High"
	case model.SupportTicketPriorityUrgent:
		return "Urgent"
	default:
		return "Normal"
	}
}

func buildSupportTicketMessageEmailContent(language string, title string, intro string, ticket *model.SupportTicket, message *model.SupportTicketMessage) string {
	copy := supportTicketEmailCopyFor(language)
	contentPreview := truncateSupportTicketNotificationText(message.Content, 600)
	body := fmt.Sprintf(`<div style="margin:18px 0 0;padding:14px 16px;border-radius:8px;background:#f9fafb;border:1px solid #e5e7eb;color:#374151;font-size:14px;line-height:1.7;white-space:pre-wrap;">%s</div>`, html.EscapeString(contentPreview))
	if strings.TrimSpace(message.ImageURL) != "" {
		imageURL := html.EscapeString(strings.TrimSpace(message.ImageURL))
		body += fmt.Sprintf(`<p style="margin:14px 0 0;color:#4b5563;font-size:13px;line-height:1.7;">%s：<a href="%s" style="color:#2563eb;text-decoration:none;">%s</a></p>`, copy.Attachment, imageURL, copy.Attachment)
	}
	return buildSupportTicketEmailContent(language, title, intro, ticket, body, "/console/tickets")
}

func buildSupportTicketStatusEmailContent(language string, title string, intro string, ticket *model.SupportTicket, previousStatus string) string {
	copy := supportTicketEmailCopyFor(language)
	body := fmt.Sprintf(`<table style="width:100%%;border-collapse:collapse;margin:18px 0 0;font-size:14px;color:#374151;"><tr><td style="padding:8px 0;color:#6b7280;">%s</td><td style="padding:8px 0;text-align:right;font-weight:600;">%s</td></tr><tr><td style="padding:8px 0;color:#6b7280;border-top:1px solid #e5e7eb;">%s</td><td style="padding:8px 0;text-align:right;font-weight:600;border-top:1px solid #e5e7eb;">%s</td></tr></table>`, copy.OldStatus, supportTicketEmailStatusText(language, previousStatus), copy.CurrentStatus, supportTicketEmailStatusText(language, ticket.Status))
	return buildSupportTicketEmailContent(language, title, intro, ticket, body, "/console/tickets")
}

func buildSupportTicketCreatedEmailContent(language string, title string, intro string, ticket *model.SupportTicket) string {
	copy := supportTicketEmailCopyFor(language)
	body := fmt.Sprintf(`<p style="margin:18px 0 0;color:#374151;font-size:14px;line-height:1.7;">%s</p>`, copy.CreatedBody)
	return buildSupportTicketEmailContent(language, title, intro, ticket, body, "/console/tickets")
}

func buildSupportTicketEmailContent(language string, title string, intro string, ticket *model.SupportTicket, bodyHTML string, actionPath string) string {
	copy := supportTicketEmailCopyFor(language)
	actionURL := strings.TrimRight(system_setting.ServerAddress, "/") + actionPath
	if strings.TrimSpace(system_setting.ServerAddress) == "" {
		actionURL = actionPath
	}
	return fmt.Sprintf(`<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:28px 16px;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:28px;">
      <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">%s</p>
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.35;color:#111827;">%s</h1>
      <p style="margin:0 0 18px;color:#374151;font-size:15px;line-height:1.7;">%s</p>
      <div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <div style="padding:12px 14px;background:#f9fafb;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;">%s #%d</div>
        <div style="padding:14px;">
          <p style="margin:0 0 10px;font-weight:700;color:#111827;font-size:16px;line-height:1.5;">%s</p>
          <p style="margin:0;color:#4b5563;font-size:13px;line-height:1.7;">%s：<strong>%s</strong> · %s：<strong>%s</strong></p>
        </div>
      </div>
      %s
      <p style="margin:22px 0 0;"><a href="%s" style="display:inline-block;padding:10px 18px;border-radius:6px;background:#111827;color:#ffffff;text-decoration:none;font-weight:600;">%s</a></p>
      <p style="margin:18px 0 0;color:#6b7280;font-size:12px;line-height:1.7;">%s</p>
    </div>
  </div>
</body>
</html>`,
		html.EscapeString(common.SystemName),
		html.EscapeString(title),
		html.EscapeString(intro),
		copy.TicketLabel,
		ticket.Id,
		html.EscapeString(strings.TrimSpace(ticket.Subject)),
		copy.Status,
		supportTicketEmailStatusText(language, ticket.Status),
		copy.Priority,
		supportTicketEmailPriorityText(language, ticket.Priority),
		bodyHTML,
		html.EscapeString(actionURL),
		copy.ViewTicket,
		copy.Footer,
	)
}
```

Add `github.com/QuantumNous/new-api/setting/system_setting` to the import list.

- [ ] **Step 4: Route reply notifications by sender**

Replace `notifySupportTicketMessageAdded` with:

```go
func notifySupportTicketMessageAdded(senderUserId int, ticket *model.SupportTicket, message *model.SupportTicketMessage, emailLanguage string) {
	if ticket == nil || message == nil {
		return
	}
	emailLanguage = normalizeSupportTicketEmailLanguage(emailLanguage)

	if senderUserId == ticket.UserId {
		adminTitle := fmt.Sprintf("工单有新回复：#%d", ticket.Id)
		adminContent := buildSupportTicketMessageNotificationContent("工单有新回复。", ticket, message)
		adminEmail := buildSupportTicketMessageEmailContent(SupportTicketEmailLanguageEn, adminTitle, "A user added a reply to a ticket.", ticket, message)
		notifySupportTicketAdmins(senderUserId, adminTitle, adminContent, adminEmail)
		return
	}

	user, err := model.GetUserById(ticket.UserId, false)
	if err != nil || user == nil {
		common.SysLog(fmt.Sprintf("failed to query support ticket user %d for message notification: %v", ticket.UserId, err))
		return
	}
	userTitle := fmt.Sprintf("工单收到回复：#%d", ticket.Id)
	userContent := buildSupportTicketMessageNotificationContent("你的工单收到新回复。", ticket, message)
	userIntro := "Your ticket received a new reply."
	if emailLanguage == SupportTicketEmailLanguageZh {
		userIntro = "你的工单收到新回复。"
	}
	userEmail := buildSupportTicketMessageEmailContent(emailLanguage, userTitle, userIntro, ticket, message)
	notification, err := createSupportTicketSiteNotificationWithEmail(user, senderUserId, userTitle, userContent, userEmail)
	if err != nil {
		common.SysLog(fmt.Sprintf("failed to send support ticket message notification to user %d: %s", user.Id, err.Error()))
		return
	}
	if notification != nil && strings.TrimSpace(user.Email) != "" && !notification.EmailSent {
		common.SysLog(fmt.Sprintf("support ticket message notification email not sent to user %d", user.Id))
	}
}
```

Change `notifySupportTicketAdmins` signature to:

```go
func notifySupportTicketAdmins(senderUserId int, title string, content string, emailContent string)
```

Inside it, call `createSupportTicketSiteNotificationWithEmail(admin, senderUserId, title, content, emailContent)` for admin users, and use `common.SendEmail(title, supportTicketAdminEmail, emailContent)` for the fallback email.

Update `NotifySupportTicketMessageAddedAsync` to accept an `emailLanguage string` parameter and pass it through to `notifySupportTicketMessageAdded`.

Update `notifySupportTicketCreated` to pass an English created-ticket email template into `notifySupportTicketAdmins`, and update user created/status notifications to use `createSupportTicketSiteNotificationWithEmail` with English template helpers by default.

- [ ] **Step 5: Run service tests**

Run:

```bash
go test ./service -run 'TestSupportTicket' -count=1
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add service/support_ticket_notification.go service/support_ticket_notification_test.go
git commit -m "fix: route support ticket reply notifications"
```

## Task 2: Add Trial Application Model And Redemption Review Logic

**Files:**
- Modify: `model/support_ticket_test.go`
- Create: `model/support_ticket_trial_application.go`
- Modify: `model/main.go`

- [ ] **Step 1: Write failing model tests**

In `model/support_ticket_test.go`, update the test AutoMigrate call to include `Redemption` and `SupportTicketTrialApplication`:

```go
require.NoError(t, db.AutoMigrate(&User{}, &SupportTicket{}, &SupportTicketMessage{}, &Redemption{}, &SupportTicketTrialApplication{}))
```

Append these tests:

```go
func TestCreateSupportTicketTrialApplicationEnforcesUserAndIP(t *testing.T) {
	withSupportTicketTestDB(t, func() {
		require.NoError(t, DB.Create(&User{Id: 7, Username: "alice", AffCode: "alice"}).Error)
		require.NoError(t, DB.Create(&User{Id: 8, Username: "bob", AffCode: "bob"}).Error)
		first, err := CreateSupportTicket(7, SupportTicketTypeNormal, "试用", "想申请试用")
		require.NoError(t, err)
		second, err := CreateSupportTicket(8, SupportTicketTypeNormal, "试用", "也想申请")
		require.NoError(t, err)

		application, message, updated, err := CreateSupportTicketTrialApplication(first.Id, 7, "203.0.113.10")
		require.NoError(t, err)
		require.Equal(t, SupportTicketTrialApplicationStatusPending, application.Status)
		require.Equal(t, "203.0.113.10", application.RequestIP)
		require.Contains(t, message.Content, "$5")
		require.Equal(t, first.Id, updated.Id)

		_, _, _, err = CreateSupportTicketTrialApplication(first.Id, 7, "203.0.113.11")
		require.EqualError(t, err, "你已经提交过试用额度申请")

		_, _, _, err = CreateSupportTicketTrialApplication(second.Id, 8, "203.0.113.10")
		require.EqualError(t, err, "当前网络环境已提交过试用额度申请")

		_, _, _, err = CreateSupportTicketTrialApplication(second.Id, 8, "")
		require.EqualError(t, err, "无法获取申请 IP")
	})
}

func TestReviewSupportTicketTrialApplicationApprovesWithRedemption(t *testing.T) {
	withSupportTicketTestDB(t, func() {
		oldQuotaPerUnit := common.QuotaPerUnit
		common.QuotaPerUnit = 100
		t.Cleanup(func() {
			common.QuotaPerUnit = oldQuotaPerUnit
		})
		require.NoError(t, DB.Create(&User{Id: 7, Username: "alice", AffCode: "alice"}).Error)
		ticket, err := CreateSupportTicket(7, SupportTicketTypeNormal, "试用", "想申请试用")
		require.NoError(t, err)
		_, _, _, err = CreateSupportTicketTrialApplication(ticket.Id, 7, "203.0.113.10")
		require.NoError(t, err)

		application, message, updated, err := ReviewSupportTicketTrialApplication(ticket.Id, 1, true)
		require.NoError(t, err)
		require.Equal(t, SupportTicketTrialApplicationStatusApproved, application.Status)
		require.Equal(t, 1, application.ReviewerUserId)
		require.NotZero(t, application.RedemptionId)
		require.NotEmpty(t, application.RedemptionKey)
		require.Contains(t, message.Content, application.RedemptionKey)
		require.Contains(t, message.Content, "https://nbility.dev/console/topup")
		require.Equal(t, SupportTicketStatusInProgress, updated.Status)

		var redemption Redemption
		require.NoError(t, DB.First(&redemption, "id = ?", application.RedemptionId).Error)
		require.Equal(t, 500, redemption.Quota)
		require.Equal(t, RedemptionTypeQuota, redemption.RedemptionType)
		require.Equal(t, common.RedemptionCodeStatusEnabled, redemption.Status)
	})
}

func TestReviewSupportTicketTrialApplicationRejectsWithoutRedemption(t *testing.T) {
	withSupportTicketTestDB(t, func() {
		require.NoError(t, DB.Create(&User{Id: 7, Username: "alice", AffCode: "alice"}).Error)
		ticket, err := CreateSupportTicket(7, SupportTicketTypeNormal, "试用", "想申请试用")
		require.NoError(t, err)
		_, _, _, err = CreateSupportTicketTrialApplication(ticket.Id, 7, "203.0.113.10")
		require.NoError(t, err)

		application, message, _, err := ReviewSupportTicketTrialApplication(ticket.Id, 1, false)
		require.NoError(t, err)
		require.Equal(t, SupportTicketTrialApplicationStatusRejected, application.Status)
		require.Zero(t, application.RedemptionId)
		require.Empty(t, application.RedemptionKey)
		require.Contains(t, message.Content, "未通过")

		var count int64
		require.NoError(t, DB.Model(&Redemption{}).Count(&count).Error)
		require.EqualValues(t, 0, count)
	})
}
```

- [ ] **Step 2: Run tests and confirm they fail**

Run:

```bash
go test ./model -run 'Test(CreateSupportTicketTrialApplication|ReviewSupportTicketTrialApplication)' -count=1
```

Expected: FAIL because `SupportTicketTrialApplication` and its functions do not exist.

- [ ] **Step 3: Create the model implementation**

Create `model/support_ticket_trial_application.go` with:

```go
package model

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const (
	SupportTicketTrialApplicationStatusPending  = "pending"
	SupportTicketTrialApplicationStatusApproved = "approved"
	SupportTicketTrialApplicationStatusRejected = "rejected"
)

type SupportTicketTrialApplication struct {
	Id             int    `json:"id" gorm:"primaryKey;autoIncrement"`
	TicketId       int    `json:"ticket_id" gorm:"index;not null"`
	UserId         int    `json:"user_id" gorm:"uniqueIndex;not null"`
	RequestIP      string `json:"request_ip" gorm:"type:varchar(64);uniqueIndex;not null"`
	Status         string `json:"status" gorm:"type:varchar(20);not null;default:pending;index"`
	ReviewerUserId int    `json:"reviewer_user_id" gorm:"not null;default:0"`
	RedemptionId   int    `json:"redemption_id" gorm:"not null;default:0"`
	RedemptionKey  string `json:"redemption_key" gorm:"type:varchar(64);not null;default:''"`
	CreatedAt      int64  `json:"created_at" gorm:"bigint;index;autoCreateTime"`
	ReviewedAt     int64  `json:"reviewed_at" gorm:"bigint;not null;default:0"`
	UpdatedAt      int64  `json:"updated_at" gorm:"bigint;autoUpdateTime"`
}

func normalizeSupportTicketTrialApplicationIP(requestIP string) (string, error) {
	requestIP = strings.TrimSpace(requestIP)
	if requestIP == "" {
		return "", errors.New("无法获取申请 IP")
	}
	if len([]rune(requestIP)) > 64 {
		return "", errors.New("申请 IP 过长")
	}
	return requestIP, nil
}

func supportTicketTrialApplicationQuota() int {
	return int(5 * common.QuotaPerUnit)
}

func GetSupportTicketTrialApplicationByTicketId(ticketId int) (*SupportTicketTrialApplication, error) {
	var application SupportTicketTrialApplication
	err := DB.Where("ticket_id = ?", ticketId).First(&application).Error
	if err != nil {
		return nil, err
	}
	return &application, nil
}

func CreateSupportTicketTrialApplication(ticketId int, userId int, requestIP string) (*SupportTicketTrialApplication, *SupportTicketMessage, *SupportTicket, error) {
	normalizedIP, err := normalizeSupportTicketTrialApplicationIP(requestIP)
	if err != nil {
		return nil, nil, nil, err
	}
	var application *SupportTicketTrialApplication
	var message *SupportTicketMessage
	var ticket SupportTicket
	err = DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("id = ? AND user_id = ?", ticketId, userId).First(&ticket).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return errors.New("工单不存在")
			}
			return err
		}
		if ticket.Status == SupportTicketStatusClosed {
			return errors.New("已关闭的工单不能提交试用额度申请")
		}
		var existing SupportTicketTrialApplication
		err := tx.Where("user_id = ?", userId).First(&existing).Error
		if err == nil {
			return errors.New("你已经提交过试用额度申请")
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		err = tx.Where("request_ip = ?", normalizedIP).First(&existing).Error
		if err == nil {
			return errors.New("当前网络环境已提交过试用额度申请")
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		application = &SupportTicketTrialApplication{
			TicketId:  ticket.Id,
			UserId:    userId,
			RequestIP: normalizedIP,
			Status:    SupportTicketTrialApplicationStatusPending,
		}
		if err := tx.Create(application).Error; err != nil {
			return err
		}
		message = &SupportTicketMessage{
			TicketId:     ticket.Id,
			SenderUserId: userId,
			IsAdmin:      false,
			Content:      "已提交 $5 试用额度申请，等待管理员审核。",
		}
		if err := tx.Create(message).Error; err != nil {
			return err
		}
		if err := tx.Model(&SupportTicket{}).Where("id = ?", ticket.Id).Updates(map[string]any{
			"last_message_at": common.GetTimestamp(),
		}).Error; err != nil {
			return err
		}
		return tx.Where("id = ?", ticket.Id).First(&ticket).Error
	})
	if err != nil {
		return nil, nil, nil, err
	}
	return application, message, &ticket, nil
}

func ReviewSupportTicketTrialApplication(ticketId int, reviewerUserId int, approve bool) (*SupportTicketTrialApplication, *SupportTicketMessage, *SupportTicket, error) {
	var application SupportTicketTrialApplication
	var message *SupportTicketMessage
	var ticket SupportTicket
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("ticket_id = ?", ticketId).First(&application).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return errors.New("没有待审核的试用额度申请")
			}
			return err
		}
		if application.Status != SupportTicketTrialApplicationStatusPending {
			return errors.New("该试用额度申请已审核")
		}
		if err := tx.Where("id = ?", ticketId).First(&ticket).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return errors.New("工单不存在")
			}
			return err
		}
		now := common.GetTimestamp()
		updates := map[string]any{
			"reviewer_user_id": reviewerUserId,
			"reviewed_at":      now,
		}
		content := "你的 $5 试用额度申请未通过。"
		if approve {
			key, err := BuildRedemptionKey(RedemptionTypeQuota)
			if err != nil {
				return err
			}
			redemption := &Redemption{
				UserId:         reviewerUserId,
				Name:           "Trial $5",
				Key:            key,
				Quota:          supportTicketTrialApplicationQuota(),
				RedemptionType: RedemptionTypeQuota,
				Status:         common.RedemptionCodeStatusEnabled,
				CreatedTime:    now,
				ExpiredTime:    0,
			}
			if err := tx.Create(redemption).Error; err != nil {
				return err
			}
			updates["status"] = SupportTicketTrialApplicationStatusApproved
			updates["redemption_id"] = redemption.Id
			updates["redemption_key"] = key
			content = fmt.Sprintf("你的 $5 试用额度申请已通过。兑换码：%s\n\n请前往 https://nbility.dev/console/topup 使用此兑换码。", key)
		} else {
			updates["status"] = SupportTicketTrialApplicationStatusRejected
		}
		message = &SupportTicketMessage{
			TicketId:     ticket.Id,
			SenderUserId: reviewerUserId,
			IsAdmin:      true,
			Content:      content,
		}
		if err := tx.Create(message).Error; err != nil {
			return err
		}
		if err := tx.Model(&SupportTicketTrialApplication{}).Where("id = ?", application.Id).Updates(updates).Error; err != nil {
			return err
		}
		ticketUpdates := map[string]any{"last_message_at": now}
		if ticket.Status == SupportTicketStatusPending {
			ticketUpdates["status"] = SupportTicketStatusInProgress
		}
		if err := tx.Model(&SupportTicket{}).Where("id = ?", ticket.Id).Updates(ticketUpdates).Error; err != nil {
			return err
		}
		if err := tx.Where("id = ?", application.Id).First(&application).Error; err != nil {
			return err
		}
		return tx.Where("id = ?", ticket.Id).First(&ticket).Error
	})
	if err != nil {
		return nil, nil, nil, err
	}
	return &application, message, &ticket, nil
}
```

- [ ] **Step 4: Add the model to AutoMigrate**

In `model/main.go`, add `&SupportTicketTrialApplication{},` immediately after `&SupportTicketMessage{},` in `migrateDB()`.

- [ ] **Step 5: Run model tests**

Run:

```bash
go test ./model -run 'TestSupportTicket|TestCreateSupportTicketTrialApplication|TestReviewSupportTicketTrialApplication|TestBuildRedemptionKey' -count=1
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add model/support_ticket_trial_application.go model/support_ticket_test.go model/main.go
git commit -m "feat: add support ticket trial applications"
```

## Task 3: Add Trial Application API And Avoid Duplicate Status Emails On Admin Replies

**Files:**
- Modify: `controller/support_ticket_test.go`
- Modify: `controller/support_ticket.go`
- Modify: `router/api-router.go`

- [ ] **Step 1: Write failing controller tests**

In `controller/support_ticket_test.go`, update AutoMigrate to include `model.Redemption` and `model.SupportTicketTrialApplication`:

```go
require.NoError(t, db.AutoMigrate(&model.User{}, &model.SupportTicket{}, &model.SupportTicketMessage{}, &model.SupportTicketTrialApplication{}, &model.Redemption{}, &model.SiteNotification{}))
```

Append:

```go
func TestSupportTicketDetailIncludesTrialApplication(t *testing.T) {
	db := setupSupportTicketControllerTestDB(t)
	user := seedUser(t, db, 7, "alice", common.RoleCommonUser)
	ticket, err := model.CreateSupportTicket(user.Id, model.SupportTicketTypeNormal, "试用", "想申请")
	require.NoError(t, err)
	_, _, _, err = model.CreateSupportTicketTrialApplication(ticket.Id, user.Id, "203.0.113.10")
	require.NoError(t, err)

	ctx, recorder := newAuthenticatedContext(t, http.MethodGet, "/api/support/tickets/1", nil, user.Id)
	ctx.Params = append(ctx.Params, ginParam("id", strconv.Itoa(ticket.Id)))
	ctx.Set("role", user.Role)

	GetSupportTicketDetail(ctx)

	response := decodeAPIResponse(t, recorder)
	require.True(t, response.Success, response.Message)
	var detail SupportTicketDetailResponse
	require.NoError(t, common.Unmarshal(response.Data, &detail))
	require.NotNil(t, detail.TrialApplication)
	require.Equal(t, "203.0.113.10", detail.TrialApplication.RequestIP)
}

func TestSupportTicketCreateTrialApplicationUsesClientIP(t *testing.T) {
	db := setupSupportTicketControllerTestDB(t)
	user := seedUser(t, db, 7, "alice", common.RoleCommonUser)
	ticket, err := model.CreateSupportTicket(user.Id, model.SupportTicketTypeNormal, "试用", "想申请")
	require.NoError(t, err)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/support/tickets/1/trial_application", nil, user.Id)
	ctx.Params = append(ctx.Params, ginParam("id", strconv.Itoa(ticket.Id)))
	ctx.Request.RemoteAddr = "203.0.113.10:12345"
	ctx.Set("role", user.Role)

	CreateSupportTicketTrialApplication(ctx)

	response := decodeAPIResponse(t, recorder)
	require.True(t, response.Success, response.Message)
	var data SupportTicketTrialApplicationResponse
	require.NoError(t, common.Unmarshal(response.Data, &data))
	require.Equal(t, model.SupportTicketTrialApplicationStatusPending, data.TrialApplication.Status)
	require.Equal(t, "203.0.113.10", data.TrialApplication.RequestIP)
	require.Contains(t, data.Message.Content, "$5")
}

func TestSupportTicketAdminReviewsTrialApplication(t *testing.T) {
	db := setupSupportTicketControllerTestDB(t)
	admin := seedUser(t, db, 1, "admin", common.RoleAdminUser)
	user := seedUser(t, db, 7, "alice", common.RoleCommonUser)
	ticket, err := model.CreateSupportTicket(user.Id, model.SupportTicketTypeNormal, "试用", "想申请")
	require.NoError(t, err)
	_, _, _, err = model.CreateSupportTicketTrialApplication(ticket.Id, user.Id, "203.0.113.10")
	require.NoError(t, err)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/support/tickets/1/trial_application/review", map[string]any{
		"approved": true,
	}, admin.Id)
	ctx.Params = append(ctx.Params, ginParam("id", strconv.Itoa(ticket.Id)))
	ctx.Set("role", admin.Role)

	ReviewSupportTicketTrialApplication(ctx)

	response := decodeAPIResponse(t, recorder)
	require.True(t, response.Success, response.Message)
	var data SupportTicketTrialApplicationResponse
	require.NoError(t, common.Unmarshal(response.Data, &data))
	require.Equal(t, model.SupportTicketTrialApplicationStatusApproved, data.TrialApplication.Status)
	require.NotEmpty(t, data.TrialApplication.RedemptionKey)
	require.Contains(t, data.Message.Content, "https://nbility.dev/console/topup")
}
```

- [ ] **Step 2: Run controller tests and confirm they fail**

Run:

```bash
go test ./controller -run 'TestSupportTicket(DetailIncludesTrialApplication|CreateTrialApplicationUsesClientIP|AdminReviewsTrialApplication)' -count=1
```

Expected: FAIL because response fields and handlers do not exist.

- [ ] **Step 3: Add controller response types and extend the message request**

In `controller/support_ticket.go`, update `SupportTicketDetailResponse` and add the new types:

```go
type SupportTicketDetailResponse struct {
	Ticket           *model.SupportTicket                 `json:"ticket"`
	Messages         []*model.SupportTicketMessage        `json:"messages"`
	TrialApplication *model.SupportTicketTrialApplication `json:"trial_application,omitempty"`
}

type SupportTicketTrialApplicationReviewRequest struct {
	Approved bool `json:"approved"`
}

type SupportTicketTrialApplicationResponse struct {
	TrialApplication *model.SupportTicketTrialApplication `json:"trial_application"`
	Ticket           *model.SupportTicket                 `json:"ticket"`
	Message          *model.SupportTicketMessage          `json:"message"`
}
```

Update the existing `SupportTicketMessageRequest` type in the same file:

```go
type SupportTicketMessageRequest struct {
	Content       string `json:"content"`
	ImageURL      string `json:"image_url"`
	EmailLanguage string `json:"email_language"`
}
```

- [ ] **Step 4: Include trial application in detail responses**

In `GetSupportTicketDetail`, fetch and include the application:

```go
trialApplication, err := model.GetSupportTicketTrialApplicationByTicketId(ticket.Id)
if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
	common.ApiError(c, err)
	return
}
common.ApiSuccess(c, SupportTicketDetailResponse{
	Ticket:           ticket,
	Messages:         messages,
	TrialApplication: trialApplication,
})
```

- [ ] **Step 5: Add create and review handlers**

Add these functions to `controller/support_ticket.go`:

```go
func CreateSupportTicketTrialApplication(c *gin.Context) {
	ticketId, ok := parseSupportTicketId(c)
	if !ok {
		return
	}
	ticket, ok := loadSupportTicketForRequest(c, ticketId)
	if !ok {
		return
	}
	if isSupportTicketAdmin(c) || ticket.UserId != c.GetInt("id") {
		common.ApiErrorMsg(c, "只能为自己的工单提交试用额度申请")
		return
	}
	application, message, updated, err := model.CreateSupportTicketTrialApplication(ticket.Id, c.GetInt("id"), c.ClientIP())
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	service.NotifySupportTicketMessageAddedAsync(c.GetInt("id"), updated, message, service.SupportTicketEmailLanguageEn)
	common.ApiSuccess(c, SupportTicketTrialApplicationResponse{
		TrialApplication: application,
		Ticket:           updated,
		Message:          message,
	})
}

func ReviewSupportTicketTrialApplication(c *gin.Context) {
	if !isSupportTicketAdmin(c) {
		common.ApiErrorMsg(c, "无权审核试用额度申请")
		return
	}
	ticketId, ok := parseSupportTicketId(c)
	if !ok {
		return
	}
	ticket, ok := loadSupportTicketForRequest(c, ticketId)
	if !ok {
		return
	}
	var req SupportTicketTrialApplicationReviewRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "无效的请求参数")
		return
	}
	application, message, updated, err := model.ReviewSupportTicketTrialApplication(ticket.Id, c.GetInt("id"), req.Approved)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	service.NotifySupportTicketMessageAddedAsync(c.GetInt("id"), updated, message, service.SupportTicketEmailLanguageEn)
	common.ApiSuccess(c, SupportTicketTrialApplicationResponse{
		TrialApplication: application,
		Ticket:           updated,
		Message:          message,
	})
}
```

- [ ] **Step 6: Pass reply email language and avoid duplicate status email on admin reply**

In `AddSupportTicketMessage`, keep decoding `SupportTicketMessageRequest`, pass `req.EmailLanguage` to the message notification call, and change the status notification condition:

```go
if previousStatus != updated.Status && !message.IsAdmin {
	service.NotifySupportTicketStatusUpdatedAsync(updated, c.GetInt("id"), previousStatus)
}
service.NotifySupportTicketMessageAddedAsync(c.GetInt("id"), updated, message, req.EmailLanguage)
```

Explicit `PUT /api/support/tickets/:id` status updates keep their existing notification behavior.

In `CreateSupportTicketTrialApplication` and `ReviewSupportTicketTrialApplication`, pass English explicitly:

```go
service.NotifySupportTicketMessageAddedAsync(c.GetInt("id"), updated, message, service.SupportTicketEmailLanguageEn)
```

- [ ] **Step 7: Add routes**

In `router/api-router.go`, add routes inside `supportTicketRoute`:

```go
supportTicketRoute.POST("/:id/trial_application", controller.CreateSupportTicketTrialApplication)
supportTicketRoute.POST("/:id/trial_application/review", controller.ReviewSupportTicketTrialApplication)
```

Place them before `supportTicketRoute.GET("/:id", ...)` so Gin does not treat `trial_application` as an ID segment.

- [ ] **Step 8: Run controller tests**

Run:

```bash
go test ./controller -run 'TestSupportTicket' -count=1
```

Expected: PASS.

- [ ] **Step 9: Commit Task 3**

```bash
git add controller/support_ticket.go controller/support_ticket_test.go router/api-router.go
git commit -m "feat: add support ticket trial application api"
```

## Task 4: Add Web-Worker API Types, Client Calls, And Hooks

**Files:**
- Modify: `web-worker/src/api-client/types.ts`
- Modify: `web-worker/src/api-client/tickets.ts`
- Modify: `web-worker/src/api-client/tickets.test.ts`
- Modify: `web-worker/src/hooks/use-tickets.ts`

- [ ] **Step 1: Write failing API client tests**

In `web-worker/src/api-client/tickets.test.ts`, add imports:

```ts
import {
  createSupportTicketTrialApplication,
  reviewSupportTicketTrialApplication,
} from './tickets';
```

Append:

```ts
test('creates and reviews ticket trial applications', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return jsonResponse({
      success: true,
      message: '',
      data: {
        trial_application: {
          id: 3,
          ticket_id: 1,
          user_id: 7,
          request_ip: '203.0.113.10',
          status: 'approved',
          reviewer_user_id: 1,
          redemption_id: 9,
          redemption_key: 'nbredemptionQ123456789012345',
          created_at: 1,
          reviewed_at: 2,
          updated_at: 2,
        },
        ticket: {
          id: 1,
          user_id: 7,
          type: 'normal',
          subject: '试用',
          status: 'in_progress',
          priority: 'normal',
          last_message_at: 2,
          created_at: 1,
          updated_at: 2,
        },
        message: {
          id: 4,
          ticket_id: 1,
          sender_user_id: 1,
          is_admin: true,
          content: 'approved',
          created_at: 2,
        },
      },
    });
  };

  await createSupportTicketTrialApplication(1);
  await reviewSupportTicketTrialApplication(1, { approved: true });

  assert.equal(requests[0].url, '/api/support/tickets/1/trial_application');
  assert.equal(requests[0].init?.method, 'POST');
  assert.equal(requests[0].init?.body, undefined);
  assert.equal(
    requests[1].url,
    '/api/support/tickets/1/trial_application/review'
  );
  assert.equal(requests[1].init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(requests[1].init?.body)), {
    approved: true,
  });
});

test('includes optional email_language when replying to tickets', async () => {
  const requestBodies: unknown[] = [];

  globalThis.fetch = async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)));
    return jsonResponse({
      success: true,
      message: '',
      data: {
        ticket: {
          id: 1,
          user_id: 7,
          type: 'normal',
          subject: 'Question',
          status: 'in_progress',
          priority: 'normal',
          last_message_at: 1,
          created_at: 1,
          updated_at: 1,
        },
        message: {
          id: 2,
          ticket_id: 1,
          sender_user_id: 1,
          is_admin: true,
          content: 'Please retry',
          created_at: 1,
        },
      },
    });
  };

  await addSupportTicketMessage(1, {
    content: 'Please retry',
    email_language: 'zh',
  });

  assert.deepEqual(requestBodies, [
    {
      content: 'Please retry',
      email_language: 'zh',
    },
  ]);
});
```

- [ ] **Step 2: Run the API client test and confirm it fails**

Run from the root:

```bash
pnpm -C web-worker exec tsx --test src/api-client/tickets.test.ts
```

Expected: FAIL because the new exported functions do not exist.

- [ ] **Step 3: Add TypeScript types**

In `web-worker/src/api-client/types.ts`, after support-ticket message types, add:

```ts
export type SupportTicketTrialApplicationStatus =
  | 'pending'
  | 'approved'
  | 'rejected';

export interface SupportTicketTrialApplication {
  id: number;
  ticket_id: number;
  user_id: number;
  request_ip: string;
  status: SupportTicketTrialApplicationStatus | string;
  reviewer_user_id: number;
  redemption_id: number;
  redemption_key: string;
  created_at: number;
  reviewed_at: number;
  updated_at: number;
}
```

Update `SupportTicketDetail`:

```ts
export interface SupportTicketDetail {
  ticket: SupportTicketItem;
  messages: SupportTicketMessage[];
  trial_application?: SupportTicketTrialApplication | null;
}
```

Add request/response types:

```ts
export interface ReviewSupportTicketTrialApplicationRequest {
  approved: boolean;
}

export interface SupportTicketTrialApplicationResponse {
  trial_application: SupportTicketTrialApplication;
  ticket: SupportTicketItem;
  message: SupportTicketMessage;
}
```

Update `AddSupportTicketMessageRequest`:

```ts
export interface AddSupportTicketMessageRequest {
  content: string;
  image_url?: string;
  email_language?: 'en' | 'zh';
}
```

- [ ] **Step 4: Add API client functions**

In `web-worker/src/api-client/tickets.ts`, import the new types and add:

```ts
export function createSupportTicketTrialApplication(
  id: number
): Promise<SupportTicketTrialApplicationResponse> {
  return apiFetch<SupportTicketTrialApplicationResponse>(
    `/support/tickets/${id}/trial_application`,
    {
      method: 'POST',
    }
  );
}

export function reviewSupportTicketTrialApplication(
  id: number,
  req: ReviewSupportTicketTrialApplicationRequest
): Promise<SupportTicketTrialApplicationResponse> {
  return apiFetch<SupportTicketTrialApplicationResponse>(
    `/support/tickets/${id}/trial_application/review`,
    {
      method: 'POST',
      body: JSON.stringify(req),
    }
  );
}
```

- [ ] **Step 5: Add React Query hooks**

In `web-worker/src/hooks/use-tickets.ts`, import the new API functions and type, then add:

```ts
export function useCreateSupportTicketTrialApplication(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => createSupportTicketTrialApplication(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      await queryClient.invalidateQueries({ queryKey: ['support-ticket', id] });
    },
  });
}

export function useReviewSupportTicketTrialApplication(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: ReviewSupportTicketTrialApplicationRequest) =>
      reviewSupportTicketTrialApplication(id, req),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      await queryClient.invalidateQueries({ queryKey: ['support-ticket', id] });
      await queryClient.invalidateQueries({
        queryKey: ['site-notification-unread-count'],
      });
    },
  });
}
```

- [ ] **Step 6: Run the API client test**

Run:

```bash
pnpm -C web-worker exec tsx --test src/api-client/tickets.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git -C web-worker add src/api-client/types.ts src/api-client/tickets.ts src/api-client/tickets.test.ts src/hooks/use-tickets.ts
git -C web-worker commit -m "feat: add ticket trial application api client"
```

## Task 5: Add Web-Worker Trial Application UI And i18n

**Files:**
- Create: `web-worker/src/lib/ticket-trial-application.ts`
- Create: `web-worker/src/lib/ticket-trial-application.test.ts`
- Modify: `web-worker/src/components/ticket/ticket-detail-panel.tsx`
- Modify: `web-worker/src/i18n/locales/en/ticket.json`
- Modify: `web-worker/src/i18n/locales/zh/ticket.json`
- Modify: `web-worker/src/i18n/locales/zh-TW/ticket.json`
- Modify: `web-worker/src/i18n/locales/fr/ticket.json`
- Modify: `web-worker/src/i18n/locales/ru/ticket.json`
- Modify: `web-worker/src/i18n/locales/ja/ticket.json`
- Modify: `web-worker/src/i18n/locales/vi/ticket.json`

- [ ] **Step 1: Write failing UI helper tests**

Create `web-worker/src/lib/ticket-trial-application.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { SupportTicketTrialApplication } from '@/api-client/types';
import {
  canRequestTicketTrialApplication,
  canReviewTicketTrialApplication,
  getTicketTrialApplicationStatusKey,
} from './ticket-trial-application';

const pendingApplication: SupportTicketTrialApplication = {
  id: 1,
  ticket_id: 2,
  user_id: 7,
  request_ip: '203.0.113.10',
  status: 'pending',
  reviewer_user_id: 0,
  redemption_id: 0,
  redemption_key: '',
  created_at: 1,
  reviewed_at: 0,
  updated_at: 1,
};

describe('ticket trial application helpers', () => {
  test('users can request only when no application exists and ticket is open', () => {
    assert.equal(
      canRequestTicketTrialApplication({
        isAdmin: false,
        isClosed: false,
        application: null,
      }),
      true
    );
    assert.equal(
      canRequestTicketTrialApplication({
        isAdmin: false,
        isClosed: true,
        application: null,
      }),
      false
    );
    assert.equal(
      canRequestTicketTrialApplication({
        isAdmin: true,
        isClosed: false,
        application: null,
      }),
      false
    );
    assert.equal(
      canRequestTicketTrialApplication({
        isAdmin: false,
        isClosed: false,
        application: pendingApplication,
      }),
      false
    );
  });

  test('admins can review pending applications only', () => {
    assert.equal(
      canReviewTicketTrialApplication({
        isAdmin: true,
        application: pendingApplication,
      }),
      true
    );
    assert.equal(
      canReviewTicketTrialApplication({
        isAdmin: true,
        application: { ...pendingApplication, status: 'approved' },
      }),
      false
    );
    assert.equal(
      canReviewTicketTrialApplication({
        isAdmin: false,
        application: pendingApplication,
      }),
      false
    );
  });

  test('maps unknown statuses to pending copy', () => {
    assert.equal(getTicketTrialApplicationStatusKey('approved'), 'approved');
    assert.equal(getTicketTrialApplicationStatusKey('rejected'), 'rejected');
    assert.equal(getTicketTrialApplicationStatusKey('unexpected'), 'pending');
  });
});
```

- [ ] **Step 2: Run helper tests and confirm they fail**

Run:

```bash
pnpm -C web-worker exec tsx --test src/lib/ticket-trial-application.test.ts
```

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Add helper module**

Create `web-worker/src/lib/ticket-trial-application.ts`:

```ts
import type { SupportTicketTrialApplication } from '@/api-client/types';

export function canRequestTicketTrialApplication({
  isAdmin,
  isClosed,
  application,
}: {
  isAdmin: boolean;
  isClosed: boolean;
  application?: SupportTicketTrialApplication | null;
}): boolean {
  return !isAdmin && !isClosed && !application;
}

export function canReviewTicketTrialApplication({
  isAdmin,
  application,
}: {
  isAdmin: boolean;
  application?: SupportTicketTrialApplication | null;
}): boolean {
  return Boolean(isAdmin && application?.status === 'pending');
}

export function getTicketTrialApplicationStatusKey(
  status: string
): 'approved' | 'pending' | 'rejected' {
  if (status === 'approved' || status === 'rejected') {
    return status;
  }
  return 'pending';
}
```

- [ ] **Step 4: Add ticket detail UI**

In `web-worker/src/components/ticket/ticket-detail-panel.tsx`, import `IconGift`, `IconCheck`, `IconX`, helper functions, and hooks:

```ts
import { IconCheck, IconGift, IconPaperclip, IconPhoto, IconX } from '@tabler/icons-react';
import {
  useAddSupportTicketMessage,
  useCreateSupportTicketTrialApplication,
  useReviewSupportTicketTrialApplication,
  useSupportTicketDetail,
  useUpdateSupportTicket,
  useUploadSupportTicketAttachment,
} from '@/hooks/use-tickets';
import {
  canRequestTicketTrialApplication,
  canReviewTicketTrialApplication,
  getTicketTrialApplicationStatusKey,
} from '@/lib/ticket-trial-application';
```

Inside `TicketDetailContent`, read the application and hooks:

```ts
const trialApplication = detailQuery.data?.trial_application ?? null;
const createTrialApplication = useCreateSupportTicketTrialApplication(ticket.id);
const reviewTrialApplication = useReviewSupportTicketTrialApplication(ticket.id);
const [replyEmailLanguage, setReplyEmailLanguage] = useState<'en' | 'zh'>('en');
```

When submitting an admin reply, include the selected language:

```ts
await addMessage.mutateAsync({
  content: reply.trim(),
  image_url: uploaded?.url,
  email_language: isAdmin ? replyEmailLanguage : undefined,
});
```

Add handlers:

```ts
async function handleCreateTrialApplication() {
  try {
    await createTrialApplication.mutateAsync();
    toast.success(t('trial.requested'));
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : t('trial.requestFailed')
    );
  }
}

async function handleReviewTrialApplication(approved: boolean) {
  try {
    await reviewTrialApplication.mutateAsync({ approved });
    toast.success(
      approved ? t('trial.approvedToast') : t('trial.rejectedToast')
    );
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : t('trial.reviewFailed')
    );
  }
}
```

Render below the admin status controls or close button:

```tsx
<TicketTrialApplicationPanel
  application={trialApplication}
  closed={closed}
  isAdmin={isAdmin}
  isRequesting={createTrialApplication.isPending}
  isReviewing={reviewTrialApplication.isPending}
  onRequest={() => void handleCreateTrialApplication()}
  onReview={(approved) => void handleReviewTrialApplication(approved)}
/>
```

Render the administrator-only language selector near the reply image input:

```tsx
{isAdmin ? (
  <div className="space-y-2">
    <Label>{t('replyEmailLanguage.label')}</Label>
    <Select
      value={replyEmailLanguage}
      onValueChange={(value) => setReplyEmailLanguage(value as 'en' | 'zh')}
    >
      <SelectTrigger className="w-full sm:w-48">
        <SelectValue>{t(`replyEmailLanguage.${replyEmailLanguage}`)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="en">{t('replyEmailLanguage.en')}</SelectItem>
        <SelectItem value="zh">{t('replyEmailLanguage.zh')}</SelectItem>
      </SelectContent>
    </Select>
  </div>
) : null}
```

Add the component in the same file below `TicketMessageMarkdown`:

```tsx
function TicketTrialApplicationPanel({
  application,
  closed,
  isAdmin,
  isRequesting,
  isReviewing,
  onRequest,
  onReview,
}: {
  application?: import('@/api-client/types').SupportTicketTrialApplication | null;
  closed: boolean;
  isAdmin: boolean;
  isRequesting: boolean;
  isReviewing: boolean;
  onRequest: () => void;
  onReview: (approved: boolean) => void;
}) {
  const { t } = useTranslation('ticket');
  const statusKey = getTicketTrialApplicationStatusKey(
    application?.status ?? 'pending'
  );
  const canRequest = canRequestTicketTrialApplication({
    isAdmin,
    isClosed: closed,
    application,
  });
  const canReview = canReviewTicketTrialApplication({ isAdmin, application });

  if (!canRequest && !application) {
    return null;
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 font-medium text-sm">
            <IconGift className="size-4 text-primary" />
            {t('trial.title')}
          </div>
          <p className="text-muted-foreground text-xs leading-5">
            {application ? t('trial.statusDescription') : t('trial.description')}
          </p>
          {application ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant={statusKey === 'approved' ? 'success' : statusKey === 'rejected' ? 'destructive' : 'secondary'}>
                {t(`trial.status.${statusKey}`)}
              </Badge>
              {isAdmin ? (
                <span className="text-muted-foreground">
                  {t('trial.requestIp')}: {application.request_ip}
                </span>
              ) : null}
              {application.redemption_key ? (
                <span className="font-mono text-muted-foreground">
                  {application.redemption_key}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {canRequest ? (
          <Button
            type="button"
            size="sm"
            disabled={isRequesting}
            onClick={onRequest}
          >
            <IconGift className="size-4" />
            {t('trial.request')}
          </Button>
        ) : null}
        {canReview ? (
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isReviewing}
              onClick={() => onReview(true)}
            >
              <IconCheck className="size-4" />
              {t('trial.approve')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isReviewing}
              onClick={() => onReview(false)}
            >
              <IconX className="size-4" />
              {t('trial.reject')}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

If the inline `import()` type makes Biome unhappy, import `SupportTicketTrialApplication` as a named type at the top and use that type directly.

- [ ] **Step 5: Add i18n strings**

Add this `trial` object and `replyEmailLanguage` object to each `ticket.json`. Use these exact English and Chinese strings:

English:

```json
"trial": {
  "title": "$5 trial credit",
  "description": "Each user and each IP can submit one trial credit request.",
  "statusDescription": "Trial credit request status",
  "request": "Request $5 trial",
  "requested": "Trial request submitted",
  "requestFailed": "Failed to submit trial request",
  "approve": "Approve",
  "reject": "Reject",
  "approvedToast": "Trial request approved",
  "rejectedToast": "Trial request rejected",
  "reviewFailed": "Failed to review trial request",
  "requestIp": "Request IP",
  "status": {
    "pending": "Pending review",
    "approved": "Approved",
    "rejected": "Rejected"
  }
},
"replyEmailLanguage": {
  "label": "Email language",
  "en": "English",
  "zh": "Chinese"
}
```

Chinese:

```json
"trial": {
  "title": "$5 试用额度",
  "description": "每个用户和每个 IP 只能提交一次试用额度申请。",
  "statusDescription": "试用额度申请状态",
  "request": "申请 $5 试用额度",
  "requested": "试用额度申请已提交",
  "requestFailed": "试用额度申请提交失败",
  "approve": "通过",
  "reject": "拒绝",
  "approvedToast": "试用额度申请已通过",
  "rejectedToast": "试用额度申请已拒绝",
  "reviewFailed": "试用额度申请审核失败",
  "requestIp": "申请 IP",
  "status": {
    "pending": "待审核",
    "approved": "已通过",
    "rejected": "已拒绝"
  }
},
"replyEmailLanguage": {
  "label": "邮件语言",
  "en": "英文",
  "zh": "中文"
}
```

For `zh-TW`, use Traditional Chinese. For `fr`, `ru`, `ja`, and `vi`, translate every string into that locale and do not leave Chinese characters.

- [ ] **Step 6: Run web-worker tests**

Run:

```bash
pnpm -C web-worker exec tsx --test src/lib/ticket-trial-application.test.ts src/i18n/ticket-locales.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run web-worker check**

Run:

```bash
pnpm -C web-worker check
```

Expected: PASS.

- [ ] **Step 8: Commit Task 5**

```bash
git -C web-worker add src/lib/ticket-trial-application.ts src/lib/ticket-trial-application.test.ts src/components/ticket/ticket-detail-panel.tsx src/i18n/locales/en/ticket.json src/i18n/locales/zh/ticket.json src/i18n/locales/zh-TW/ticket.json src/i18n/locales/fr/ticket.json src/i18n/locales/ru/ticket.json src/i18n/locales/ja/ticket.json src/i18n/locales/vi/ticket.json
git -C web-worker commit -m "feat: add ticket trial application ui"
```

## Task 6: Full Verification And Test Email

**Files:**
- No permanent repo files are required for the test email.

- [ ] **Step 1: Run backend package tests**

Run:

```bash
go test ./model ./service ./controller
```

Expected: PASS.

- [ ] **Step 2: Run web-worker build**

Run:

```bash
pnpm -C web-worker build
```

Expected: PASS.

- [ ] **Step 3: Send a template test email**

Create a temporary file at `/private/tmp/send_support_ticket_test_email.go` with a small `main` package that imports the project, initializes options the same way the app normally does, builds representative support-ticket HTML using the exported or package-accessible function created during implementation, and calls `common.SendEmail("Support ticket email template test", "3224266014@qq.com", html)`.

Use the English/default template for the actual test email unless the user asks for a Chinese sample. If implementation exposes a preview helper, build one English sample and one Chinese sample in tests, but send only one real email to avoid unnecessary duplicate messages.

Run:

```bash
go run /private/tmp/send_support_ticket_test_email.go
```

Expected: either a successful send confirmation, or a concrete error such as missing SMTP configuration, missing Cloudflare Worker URL/token, DNS failure, or remote API error. Record the exact result in the final response.

- [ ] **Step 4: Inspect git status**

Run:

```bash
git status --short
git -C web-worker status --short
```

Expected: root status may still show `?? web-worker/` because it is an intentional nested repository; `web-worker` status should be clean after its commits.

- [ ] **Step 5: Commit any verification-only helper changes if a permanent helper was added**

If implementation added a permanent exported preview helper for the test email, commit it with:

```bash
git add service/support_ticket_notification.go service/support_ticket_notification_test.go
git commit -m "test: add support ticket email preview coverage"
```

If no permanent repo file was added for the test email, skip this commit.

## Self-Review

- Spec coverage: notification direction is Task 1 and Task 3 Step 6; bilingual email templates and default-English/admin-selected language are Tasks 1, 3, 4, 5, and 6; backend trial model, IP/user uniqueness, review, and redemption are Task 2; controller/routes/detail response are Task 3; `web-worker` API, hooks, UI, and i18n are Tasks 4 and 5; test email is Task 6.
- Placeholder scan: the plan contains no TBD markers, no deferred requirements, and every code-changing step includes concrete code or exact insertion content.
- Type consistency: backend uses `SupportTicketTrialApplication` and JSON field `trial_application`; frontend uses matching `SupportTicketTrialApplication`, `ReviewSupportTicketTrialApplicationRequest`, and `SupportTicketTrialApplicationResponse`; status strings match `pending`, `approved`, and `rejected`; reply email language uses `email_language` with `en`/`zh`.
