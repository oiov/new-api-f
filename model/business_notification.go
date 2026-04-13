package model

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/bytedance/gopkg/util/gopool"
)

func notifySiteToUser(user *User, title string, content string, level string, sendEmail bool) {
	if user == nil {
		return
	}

	notification := &SiteNotification{
		UserId:       user.Id,
		SenderUserId: 0,
		Title:        strings.TrimSpace(title),
		Content:      strings.TrimSpace(content),
		Level:        level,
	}
	if err := CreateSiteNotification(notification); err != nil {
		return
	}

	if sendEmail && strings.TrimSpace(user.Email) != "" {
		if err := common.SendEmail(notification.Title, user.Email, notification.Content); err == nil {
			notification.EmailSent = true
			notification.EmailSentAt = common.GetTimestamp()
			_ = DB.Model(notification).
				Where("id = ?", notification.Id).
				Updates(map[string]any{
					"email_sent":    true,
					"email_sent_at": notification.EmailSentAt,
				}).Error
		}
	}
}

func NotifyTopUpSuccessToUserAsync(userId int, paymentMethod string, money float64, quota string) {
	if userId <= 0 {
		return
	}
	gopool.Go(func() {
		user, err := GetUserById(userId, false)
		if err != nil || user == nil {
			return
		}
		title := "充值成功通知"
		content := fmt.Sprintf(
			"你的充值订单已支付成功。<br/>支付金额：<strong>%.2f</strong><br/>到账额度：<strong>%s</strong><br/>支付方式：<strong>%s</strong>",
			money,
			strings.TrimSpace(quota),
			strings.TrimSpace(paymentMethod),
		)
		notifySiteToUser(user, title, content, "success", true)
	})
}

func NotifySubscriptionPurchaseSuccessToUserAsync(userId int, planTitle string, money float64, paymentMethod string) {
	if userId <= 0 {
		return
	}
	gopool.Go(func() {
		user, err := GetUserById(userId, false)
		if err != nil || user == nil {
			return
		}
		title := "订阅购买成功通知"
		content := fmt.Sprintf(
			"你的订阅订单已支付成功。<br/>套餐：<strong>%s</strong><br/>支付金额：<strong>%.2f</strong><br/>支付方式：<strong>%s</strong><br/>你现在可以前往订阅页面查看交付内容。",
			strings.TrimSpace(planTitle),
			money,
			strings.TrimSpace(paymentMethod),
		)
		notifySiteToUser(user, title, content, "success", true)
	})
}

func NotifyInvoiceApplicationCreatedAsync(invoice *Invoice) {
	if invoice == nil || invoice.UserId <= 0 {
		return
	}
	gopool.Go(func() {
		rootUser := GetRootUser()
		if rootUser == nil {
			return
		}

		applicant, err := GetUserById(invoice.UserId, false)
		if err != nil || applicant == nil {
			return
		}

		title := "新的开票申请"
		content := fmt.Sprintf(
			"用户提交了新的开票申请。<br/>用户：<strong>%s</strong>（ID: %d）<br/>发票抬头：<strong>%s</strong><br/>申请金额：<strong>%.2f</strong><br/>接收邮箱：<strong>%s</strong><br/>申请ID：<strong>%d</strong>",
			strings.TrimSpace(applicant.Username),
			applicant.Id,
			strings.TrimSpace(invoice.Title),
			invoice.Amount,
			strings.TrimSpace(invoice.Email),
			invoice.Id,
		)
		notifySiteToUser(rootUser, title, content, "warning", true)
	})
}
