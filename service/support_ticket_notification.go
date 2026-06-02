package service

import (
	"fmt"
	"html"
	"os"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/bytedance/gopkg/util/gopool"
)

const supportTicketAdminEmail = "support@nbility.dev"

const (
	SupportTicketEmailLanguageEn = "en"
	SupportTicketEmailLanguageZh = "zh"
)

var runSupportTicketNotification = func(fn func()) {
	if isGoTestProcess() {
		fn()
		return
	}
	gopool.Go(fn)
}

func isGoTestProcess() bool {
	return strings.HasSuffix(os.Args[0], ".test")
}

func SupportTicketStatusText(status string) string {
	switch strings.TrimSpace(status) {
	case model.SupportTicketStatusPending:
		return "待处理"
	case model.SupportTicketStatusInProgress:
		return "处理中"
	case model.SupportTicketStatusResolved:
		return "已解决"
	case model.SupportTicketStatusClosed:
		return "已关闭"
	default:
		return strings.TrimSpace(status)
	}
}

func SupportTicketTypeText(ticketType string) string {
	switch strings.TrimSpace(ticketType) {
	case model.SupportTicketTypeRefund:
		return "退款工单"
	case model.SupportTicketTypeInvoice:
		return "发票申请"
	default:
		return "普通工单"
	}
}

func SupportTicketPriorityText(priority string) string {
	switch strings.TrimSpace(priority) {
	case model.SupportTicketPriorityLow:
		return "低"
	case model.SupportTicketPriorityHigh:
		return "高"
	case model.SupportTicketPriorityUrgent:
		return "紧急"
	default:
		return "普通"
	}
}

func NotifySupportTicketCreatedAsync(ticket *model.SupportTicket) {
	if ticket == nil || ticket.UserId <= 0 {
		return
	}
	runSupportTicketNotification(func() {
		user, err := model.GetUserById(ticket.UserId, false)
		if err != nil || user == nil {
			common.SysLog(fmt.Sprintf("failed to query support ticket user %d for created notification: %v", ticket.UserId, err))
			return
		}
		notifySupportTicketCreated(user, ticket)
	})
}

func NotifySupportTicketStatusUpdatedAsync(ticket *model.SupportTicket, senderUserId int, previousStatus string) {
	if ticket == nil || ticket.UserId <= 0 {
		return
	}
	if strings.TrimSpace(previousStatus) == strings.TrimSpace(ticket.Status) {
		return
	}
	runSupportTicketNotification(func() {
		user, err := model.GetUserById(ticket.UserId, false)
		if err != nil || user == nil {
			common.SysLog(fmt.Sprintf("failed to query support ticket user %d for status notification: %v", ticket.UserId, err))
			return
		}
		notifySupportTicketStatusUpdated(user, senderUserId, ticket, previousStatus)
	})
}

func NotifySupportTicketMessageAddedAsync(senderUserId int, ticket *model.SupportTicket, message *model.SupportTicketMessage, language ...string) {
	if ticket == nil || message == nil || ticket.UserId <= 0 {
		return
	}
	emailLanguage := SupportTicketEmailLanguageEn
	if len(language) > 0 {
		emailLanguage = language[0]
	}
	runSupportTicketNotification(func() {
		notifySupportTicketMessageAdded(senderUserId, ticket, message, emailLanguage)
	})
}

func notifySupportTicketCreated(user *model.User, ticket *model.SupportTicket) {
	if user == nil || ticket == nil {
		return
	}
	escapedSubject := html.EscapeString(strings.TrimSpace(ticket.Subject))
	userTitle := fmt.Sprintf("工单已提交：#%d", ticket.Id)
	userContent := fmt.Sprintf(
		"你的工单已提交，我们会尽快处理。<br/>工单 ID：<strong>#%d</strong><br/>主题：<strong>%s</strong><br/>当前状态：<strong>%s</strong>",
		ticket.Id,
		escapedSubject,
		SupportTicketStatusText(ticket.Status),
	)
	userEmail := buildSupportTicketCreatedEmailContent(SupportTicketEmailLanguageEn, userTitle, "We have received your support ticket.", ticket)
	if _, err := createSupportTicketSiteNotificationWithEmail(
		user,
		user.Id,
		userTitle,
		userContent,
		"info",
		userEmail,
	); err != nil {
		common.SysLog(fmt.Sprintf("failed to create support ticket created site notification for user %d: %s", user.Id, err.Error()))
	}

	adminTitle := fmt.Sprintf("新工单：#%d", ticket.Id)
	adminContent := fmt.Sprintf(
		"用户提交了新工单。<br/>工单 ID：<strong>#%d</strong><br/>用户：<strong>%s</strong><br/>类型：<strong>%s</strong><br/>优先级：<strong>%s</strong><br/>主题：<strong>%s</strong><br/>当前状态：<strong>%s</strong>",
		ticket.Id,
		html.EscapeString(strings.TrimSpace(user.Username)),
		SupportTicketTypeText(ticket.Type),
		SupportTicketPriorityText(ticket.Priority),
		escapedSubject,
		SupportTicketStatusText(ticket.Status),
	)
	adminEmail := buildSupportTicketEmailContent(
		SupportTicketEmailLanguageEn,
		adminTitle,
		"A user submitted a new support ticket.",
		ticket,
		fmt.Sprintf(
			`<p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:22px;">User: <strong>%s</strong></p><p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:24px;">%s</p>`,
			html.EscapeString(strings.TrimSpace(user.Username)),
			supportTicketEmailLabels(SupportTicketEmailLanguageEn).CreatedBody,
		),
	)
	notifySupportTicketAdmins(user.Id, adminTitle, adminContent, adminEmail)
}

func notifySupportTicketMessageAdded(senderUserId int, ticket *model.SupportTicket, message *model.SupportTicketMessage, language ...string) {
	if ticket == nil || message == nil {
		return
	}

	if message.IsAdmin {
		notifySupportTicketOwnerOfMessage(senderUserId, ticket, message, normalizeSupportTicketEmailLanguage(firstSupportTicketEmailLanguage(language)))
		return
	}

	adminTitle := fmt.Sprintf("工单有新回复：#%d", ticket.Id)
	adminContent := buildSupportTicketMessageNotificationContent("工单有新回复。", ticket, message)
	adminEmail := buildSupportTicketMessageEmailContent(SupportTicketEmailLanguageEn, adminTitle, "A user added a reply to a support ticket.", ticket, message)
	notifySupportTicketAdmins(senderUserId, adminTitle, adminContent, adminEmail)
}

func notifySupportTicketOwnerOfMessage(senderUserId int, ticket *model.SupportTicket, message *model.SupportTicketMessage, language string) {
	user, err := model.GetUserById(ticket.UserId, false)
	if err != nil || user == nil {
		common.SysLog(fmt.Sprintf("failed to query support ticket user %d for message notification: %v", ticket.UserId, err))
		return
	}
	userTitle := fmt.Sprintf("工单收到回复：#%d", ticket.Id)
	userContent := buildSupportTicketMessageNotificationContent("你的工单收到新回复。", ticket, message)
	userIntro := "Your ticket received a new reply."
	if normalizeSupportTicketEmailLanguage(language) == SupportTicketEmailLanguageZh {
		userIntro = "你的工单收到新回复。"
	}
	userEmail := buildSupportTicketMessageEmailContent(language, userTitle, userIntro, ticket, message)
	notification, err := createSupportTicketSiteNotificationWithEmail(user, senderUserId, userTitle, userContent, "info", userEmail)
	if err != nil {
		common.SysLog(fmt.Sprintf("failed to send support ticket message notification to user %d: %s", user.Id, err.Error()))
		return
	}
	if notification != nil && strings.TrimSpace(user.Email) != "" && !notification.EmailSent {
		common.SysLog(fmt.Sprintf("support ticket message notification email not sent to user %d", user.Id))
	}
}

func firstSupportTicketEmailLanguage(language []string) string {
	if len(language) == 0 {
		return SupportTicketEmailLanguageEn
	}
	return language[0]
}

func normalizeSupportTicketEmailLanguage(language string) string {
	switch strings.ToLower(strings.TrimSpace(language)) {
	case SupportTicketEmailLanguageZh:
		return SupportTicketEmailLanguageZh
	default:
		return SupportTicketEmailLanguageEn
	}
}

func supportTicketEmailStatusText(language string, status string) string {
	normalizedLanguage := normalizeSupportTicketEmailLanguage(language)
	switch strings.TrimSpace(status) {
	case model.SupportTicketStatusPending:
		if normalizedLanguage == SupportTicketEmailLanguageZh {
			return "待处理"
		}
		return "Pending"
	case model.SupportTicketStatusInProgress:
		if normalizedLanguage == SupportTicketEmailLanguageZh {
			return "处理中"
		}
		return "In progress"
	case model.SupportTicketStatusResolved:
		if normalizedLanguage == SupportTicketEmailLanguageZh {
			return "已解决"
		}
		return "Resolved"
	case model.SupportTicketStatusClosed:
		if normalizedLanguage == SupportTicketEmailLanguageZh {
			return "已关闭"
		}
		return "Closed"
	default:
		return strings.TrimSpace(status)
	}
}

func supportTicketEmailPriorityText(language string, priority string) string {
	normalizedLanguage := normalizeSupportTicketEmailLanguage(language)
	switch strings.TrimSpace(priority) {
	case model.SupportTicketPriorityLow:
		if normalizedLanguage == SupportTicketEmailLanguageZh {
			return "低"
		}
		return "Low"
	case model.SupportTicketPriorityHigh:
		if normalizedLanguage == SupportTicketEmailLanguageZh {
			return "高"
		}
		return "High"
	case model.SupportTicketPriorityUrgent:
		if normalizedLanguage == SupportTicketEmailLanguageZh {
			return "紧急"
		}
		return "Urgent"
	default:
		if normalizedLanguage == SupportTicketEmailLanguageZh {
			return "普通"
		}
		return "Normal"
	}
}

func buildSupportTicketMessageEmailContent(language string, title string, intro string, ticket *model.SupportTicket, message *model.SupportTicketMessage) string {
	if ticket == nil || message == nil {
		return ""
	}
	contentPreview := html.EscapeString(truncateSupportTicketNotificationText(message.Content, 1200))
	body := fmt.Sprintf(`<div style="margin:4px 0 20px;padding:16px;border-left:4px solid #2563eb;background:#f8fafc;color:#334155;font-size:14px;line-height:22px;white-space:pre-wrap;">%s</div>`, contentPreview)
	if strings.TrimSpace(message.ImageURL) != "" {
		escapedURL := html.EscapeString(strings.TrimSpace(message.ImageURL))
		labels := supportTicketEmailLabels(language)
		body += fmt.Sprintf(
			`<p style="margin:16px 0 0;color:#475569;font-size:14px;line-height:22px;">%s <a href="%s" style="color:#2563eb;text-decoration:none;font-weight:600;">%s</a></p>`,
			labels.Attachment,
			escapedURL,
			labels.ViewAttachment,
		)
	}
	return buildSupportTicketEmailContent(language, title, intro, ticket, body)
}

func buildSupportTicketCreatedEmailContent(language string, title string, intro string, ticket *model.SupportTicket) string {
	labels := supportTicketEmailLabels(language)
	body := fmt.Sprintf(`<p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:24px;">%s</p>`, labels.CreatedBody)
	return buildSupportTicketEmailContent(language, title, intro, ticket, body)
}

func buildSupportTicketStatusEmailContent(language string, title string, intro string, ticket *model.SupportTicket, previousStatus string) string {
	labels := supportTicketEmailLabels(language)
	body := fmt.Sprintf(
		`<div style="margin:4px 0 20px;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;"><div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:10px;color:#334155;font-size:14px;"><span>%s</span><strong>%s</strong></div><div style="display:flex;justify-content:space-between;gap:12px;color:#334155;font-size:14px;"><span>%s</span><strong>%s</strong></div></div>`,
		labels.PreviousStatus,
		supportTicketEmailStatusText(language, previousStatus),
		labels.CurrentStatus,
		supportTicketEmailStatusText(language, ticket.Status),
	)
	return buildSupportTicketEmailContent(language, title, intro, ticket, body)
}

func buildSupportTicketEmailContent(language string, title string, intro string, ticket *model.SupportTicket, body string) string {
	if ticket == nil {
		return ""
	}
	normalizedLanguage := normalizeSupportTicketEmailLanguage(language)
	labels := supportTicketEmailLabels(normalizedLanguage)
	viewTicketURL := buildSupportTicketActionURL("/console/tickets")
	return fmt.Sprintf(
		`<div style="background:#f8fafc;padding:28px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;"><div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;"><div style="background:#0f172a;padding:24px 28px;"><h1 style="margin:0;color:#ffffff;font-size:20px;line-height:28px;font-weight:700;">%s</h1><p style="margin:8px 0 0;color:#cbd5e1;font-size:14px;line-height:22px;">%s #%d</p></div><div style="padding:28px;"><p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:24px;">%s</p><div style="margin:0 0 20px;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;"><p style="margin:0 0 10px;color:#64748b;font-size:13px;line-height:20px;">%s</p><p style="margin:0;color:#0f172a;font-size:16px;line-height:24px;font-weight:700;">%s</p></div><div style="display:inline-block;margin:0 8px 16px 0;padding:6px 10px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-size:13px;font-weight:700;">%s: %s</div><div style="display:inline-block;margin:0 0 16px 0;padding:6px 10px;border-radius:999px;background:#fee2e2;color:#b91c1c;font-size:13px;font-weight:700;">%s: %s</div>%s<a href="%s" style="display:inline-block;margin-top:8px;padding:11px 16px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:700;">%s</a><p style="margin:18px 0 0;color:#64748b;font-size:12px;line-height:18px;">%s</p></div></div></div>`,
		html.EscapeString(strings.TrimSpace(title)),
		labels.Ticket,
		ticket.Id,
		html.EscapeString(strings.TrimSpace(intro)),
		labels.Subject,
		html.EscapeString(strings.TrimSpace(ticket.Subject)),
		labels.Status,
		supportTicketEmailStatusText(normalizedLanguage, ticket.Status),
		labels.Priority,
		supportTicketEmailPriorityText(normalizedLanguage, ticket.Priority),
		body,
		html.EscapeString(viewTicketURL),
		labels.ViewTicket,
		labels.Footer,
	)
}

func buildSupportTicketActionURL(path string) string {
	base := strings.TrimRight(strings.TrimSpace(system_setting.ServerAddress), "/")
	if base == "" {
		return path
	}
	return base + path
}

type supportTicketEmailLabelSet struct {
	Ticket         string
	Subject        string
	Status         string
	Priority       string
	Attachment     string
	ViewAttachment string
	ViewTicket     string
	CreatedBody    string
	PreviousStatus string
	CurrentStatus  string
	Footer         string
}

func supportTicketEmailLabels(language string) supportTicketEmailLabelSet {
	if normalizeSupportTicketEmailLanguage(language) == SupportTicketEmailLanguageZh {
		return supportTicketEmailLabelSet{
			Ticket:         "工单",
			Subject:        "主题",
			Status:         "状态",
			Priority:       "优先级",
			Attachment:     "附件：",
			ViewAttachment: "查看附件",
			ViewTicket:     "查看工单",
			CreatedBody:    "我们已收到你的工单，会尽快处理。后续进展会通过站内信和邮件通知你。",
			PreviousStatus: "原状态",
			CurrentStatus:  "当前状态",
			Footer:         "此邮件由系统自动发送，请勿直接回复。",
		}
	}
	return supportTicketEmailLabelSet{
		Ticket:         "Ticket",
		Subject:        "Subject",
		Status:         "Status",
		Priority:       "Priority",
		Attachment:     "Attachment:",
		ViewAttachment: "View attachment",
		ViewTicket:     "View ticket",
		CreatedBody:    "We will review it as soon as possible. Updates will be sent by site notification and email.",
		PreviousStatus: "Previous status",
		CurrentStatus:  "Current status",
		Footer:         "This email was sent automatically. Please do not reply directly.",
	}
}

func createSupportTicketSiteNotificationWithEmail(user *model.User, senderUserId int, title string, content string, level string, emailContent string) (*model.SiteNotification, error) {
	notification, err := SendSiteNotificationToUser(user, senderUserId, title, content, level, false)
	if err != nil || notification == nil {
		return notification, err
	}
	if strings.TrimSpace(user.Email) == "" || strings.TrimSpace(emailContent) == "" {
		return notification, nil
	}
	if err := common.SendEmail(title, user.Email, emailContent); err != nil {
		return notification, nil
	}
	notification.EmailSent = true
	notification.EmailSentAt = common.GetTimestamp()
	_ = model.DB.Model(notification).
		Where("id = ?", notification.Id).
		Updates(map[string]any{
			"email_sent":    true,
			"email_sent_at": notification.EmailSentAt,
		}).Error
	return notification, nil
}

func notifySupportTicketAdmins(senderUserId int, title string, content string, emailContent string) {
	admins, err := listSupportTicketNotificationAdmins()
	if err != nil {
		common.SysLog(fmt.Sprintf("failed to query support ticket admins for notification: %s", err.Error()))
		return
	}

	fallbackEmailSent := false
	for _, admin := range admins {
		if admin == nil || admin.Id == senderUserId {
			continue
		}
		notification, err := createSupportTicketSiteNotificationWithEmail(admin, senderUserId, title, content, "info", emailContent)
		if err != nil {
			common.SysLog(fmt.Sprintf("failed to send support ticket notification to admin %d: %s", admin.Id, err.Error()))
			continue
		}
		if strings.EqualFold(strings.TrimSpace(admin.Email), supportTicketAdminEmail) && notification != nil && notification.EmailSent {
			fallbackEmailSent = true
		}
	}

	if !fallbackEmailSent {
		if err := common.SendEmail(title, supportTicketAdminEmail, emailContent); err != nil {
			common.SysLog(fmt.Sprintf("failed to send support ticket fallback email to admin: %s", err.Error()))
		}
	}
}

func listSupportTicketNotificationAdmins() ([]*model.User, error) {
	var users []*model.User
	err := model.DB.
		Select("id", "username", "email", "role", "status").
		Where("status = ? AND role >= ?", common.UserStatusEnabled, common.RoleAdminUser).
		Order("id asc").
		Find(&users).Error
	return users, err
}

func buildSupportTicketMessageNotificationContent(prefix string, ticket *model.SupportTicket, message *model.SupportTicketMessage) string {
	contentPreview := truncateSupportTicketNotificationText(message.Content, 600)
	imageLine := ""
	if strings.TrimSpace(message.ImageURL) != "" {
		imageLine = fmt.Sprintf("<br/>图片：<a href=\"%s\">查看附件</a>", html.EscapeString(strings.TrimSpace(message.ImageURL)))
	}
	return fmt.Sprintf(
		"%s<br/>工单 ID：<strong>#%d</strong><br/>主题：<strong>%s</strong><br/>当前状态：<strong>%s</strong><br/>回复内容：<br/><blockquote>%s</blockquote>%s",
		html.EscapeString(strings.TrimSpace(prefix)),
		ticket.Id,
		html.EscapeString(strings.TrimSpace(ticket.Subject)),
		SupportTicketStatusText(ticket.Status),
		html.EscapeString(contentPreview),
		imageLine,
	)
}

func truncateSupportTicketNotificationText(content string, maxRunes int) string {
	content = strings.TrimSpace(content)
	runes := []rune(content)
	if len(runes) <= maxRunes {
		return content
	}
	return string(runes[:maxRunes]) + "..."
}

func notifySupportTicketStatusUpdated(user *model.User, senderUserId int, ticket *model.SupportTicket, previousStatus string) {
	if user == nil || ticket == nil {
		return
	}
	title := fmt.Sprintf("工单状态已更新：#%d", ticket.Id)
	content := fmt.Sprintf(
		"你的工单状态已更新。<br/>工单 ID：<strong>#%d</strong><br/>主题：<strong>%s</strong><br/>原状态：<strong>%s</strong><br/>当前状态：<strong>%s</strong>",
		ticket.Id,
		html.EscapeString(strings.TrimSpace(ticket.Subject)),
		SupportTicketStatusText(previousStatus),
		SupportTicketStatusText(ticket.Status),
	)
	emailContent := buildSupportTicketStatusEmailContent(SupportTicketEmailLanguageEn, title, "Your support ticket status was updated.", ticket, previousStatus)
	notification, err := createSupportTicketSiteNotificationWithEmail(user, senderUserId, title, content, "info", emailContent)
	if err != nil {
		common.SysLog(fmt.Sprintf("failed to send support ticket status notification to user %d: %s", user.Id, err.Error()))
		return
	}
	if notification != nil && strings.TrimSpace(user.Email) != "" && !notification.EmailSent {
		common.SysLog(fmt.Sprintf("support ticket status notification email not sent to user %d", user.Id))
	}
}
