package service

import (
	"fmt"
	"html"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/bytedance/gopkg/util/gopool"
)

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

func NotifySupportTicketCreatedAsync(ticket *model.SupportTicket) {
	if ticket == nil || ticket.UserId <= 0 {
		return
	}
	gopool.Go(func() {
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
	gopool.Go(func() {
		user, err := model.GetUserById(ticket.UserId, false)
		if err != nil || user == nil {
			common.SysLog(fmt.Sprintf("failed to query support ticket user %d for status notification: %v", ticket.UserId, err))
			return
		}
		notifySupportTicketStatusUpdated(user, senderUserId, ticket, previousStatus)
	})
}

func notifySupportTicketCreated(user *model.User, ticket *model.SupportTicket) {
	if user == nil || ticket == nil || strings.TrimSpace(user.Email) == "" {
		return
	}
	subject := fmt.Sprintf("工单已提交：#%d %s", ticket.Id, strings.TrimSpace(ticket.Subject))
	content := fmt.Sprintf(
		"你的工单已提交，我们会尽快处理。<br/>工单 ID：<strong>#%d</strong><br/>主题：<strong>%s</strong><br/>当前状态：<strong>%s</strong>",
		ticket.Id,
		html.EscapeString(strings.TrimSpace(ticket.Subject)),
		SupportTicketStatusText(ticket.Status),
	)
	if err := common.SendEmail(subject, user.Email, content); err != nil {
		common.SysLog(fmt.Sprintf("failed to send support ticket created email to user %d: %s", user.Id, err.Error()))
	}
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
