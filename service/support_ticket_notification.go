package service

import (
	"fmt"
	"html"
	"os"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/bytedance/gopkg/util/gopool"
)

const supportTicketAdminEmail = "support@nbility.dev"

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

func NotifySupportTicketMessageAddedAsync(senderUserId int, ticket *model.SupportTicket, message *model.SupportTicketMessage) {
	if ticket == nil || message == nil || ticket.UserId <= 0 {
		return
	}
	runSupportTicketNotification(func() {
		notifySupportTicketMessageAdded(senderUserId, ticket, message)
	})
}

func notifySupportTicketCreated(user *model.User, ticket *model.SupportTicket) {
	if user == nil || ticket == nil {
		return
	}
	escapedSubject := html.EscapeString(strings.TrimSpace(ticket.Subject))
	if _, err := SendSiteNotificationToUser(
		user,
		user.Id,
		fmt.Sprintf("工单已提交：#%d", ticket.Id),
		fmt.Sprintf(
			"你的工单已提交，我们会尽快处理。<br/>工单 ID：<strong>#%d</strong><br/>主题：<strong>%s</strong><br/>当前状态：<strong>%s</strong>",
			ticket.Id,
			escapedSubject,
			SupportTicketStatusText(ticket.Status),
		),
		"info",
		true,
	); err != nil {
		common.SysLog(fmt.Sprintf("failed to create support ticket created site notification for user %d: %s", user.Id, err.Error()))
	}

	adminContent := fmt.Sprintf(
		"用户提交了新工单。<br/>工单 ID：<strong>#%d</strong><br/>用户：<strong>%s</strong><br/>类型：<strong>%s</strong><br/>优先级：<strong>%s</strong><br/>主题：<strong>%s</strong><br/>当前状态：<strong>%s</strong>",
		ticket.Id,
		html.EscapeString(strings.TrimSpace(user.Username)),
		SupportTicketTypeText(ticket.Type),
		SupportTicketPriorityText(ticket.Priority),
		escapedSubject,
		SupportTicketStatusText(ticket.Status),
	)
	notifySupportTicketAdmins(user.Id, fmt.Sprintf("新工单：#%d", ticket.Id), adminContent)
}

func notifySupportTicketMessageAdded(senderUserId int, ticket *model.SupportTicket, message *model.SupportTicketMessage) {
	if ticket == nil || message == nil {
		return
	}

	adminTitle := fmt.Sprintf("工单有新回复：#%d", ticket.Id)
	adminContent := buildSupportTicketMessageNotificationContent("工单有新回复。", ticket, message)
	notifySupportTicketAdmins(senderUserId, adminTitle, adminContent)

	if senderUserId == ticket.UserId {
		return
	}

	user, err := model.GetUserById(ticket.UserId, false)
	if err != nil || user == nil {
		common.SysLog(fmt.Sprintf("failed to query support ticket user %d for message notification: %v", ticket.UserId, err))
		return
	}
	userTitle := fmt.Sprintf("工单收到回复：#%d", ticket.Id)
	userContent := buildSupportTicketMessageNotificationContent("你的工单收到新回复。", ticket, message)
	notification, err := SendSiteNotificationToUser(user, senderUserId, userTitle, userContent, "info", true)
	if err != nil {
		common.SysLog(fmt.Sprintf("failed to send support ticket message notification to user %d: %s", user.Id, err.Error()))
		return
	}
	if notification != nil && strings.TrimSpace(user.Email) != "" && !notification.EmailSent {
		common.SysLog(fmt.Sprintf("support ticket message notification email not sent to user %d", user.Id))
	}
}

func notifySupportTicketAdmins(senderUserId int, title string, content string) {
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
		notification, err := SendSiteNotificationToUser(admin, senderUserId, title, content, "info", true)
		if err != nil {
			common.SysLog(fmt.Sprintf("failed to send support ticket notification to admin %d: %s", admin.Id, err.Error()))
			continue
		}
		if strings.EqualFold(strings.TrimSpace(admin.Email), supportTicketAdminEmail) && notification != nil && notification.EmailSent {
			fallbackEmailSent = true
		}
	}

	if !fallbackEmailSent {
		if err := common.SendEmail(title, supportTicketAdminEmail, content); err != nil {
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
	notification, err := SendSiteNotificationToUser(user, senderUserId, title, content, "info", true)
	if err != nil {
		common.SysLog(fmt.Sprintf("failed to send support ticket status notification to user %d: %s", user.Id, err.Error()))
		return
	}
	if notification != nil && strings.TrimSpace(user.Email) != "" && !notification.EmailSent {
		common.SysLog(fmt.Sprintf("support ticket status notification email not sent to user %d", user.Id))
	}
}
