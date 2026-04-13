package service

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

func SendSiteNotificationToUser(user *model.User, senderUserId int, title string, content string, level string, sendEmail bool) (*model.SiteNotification, error) {
	if user == nil {
		return nil, nil
	}
	notification := &model.SiteNotification{
		UserId:       user.Id,
		SenderUserId: senderUserId,
		Title:        strings.TrimSpace(title),
		Content:      strings.TrimSpace(content),
		Level:        level,
	}
	if err := model.CreateSiteNotification(notification); err != nil {
		return nil, err
	}

	if sendEmail && strings.TrimSpace(user.Email) != "" {
		if err := common.SendEmail(notification.Title, user.Email, notification.Content); err == nil {
			notification.EmailSent = true
			notification.EmailSentAt = common.GetTimestamp()
			_ = model.DB.Model(notification).
				Where("id = ?", notification.Id).
				Updates(map[string]any{
					"email_sent":    true,
					"email_sent_at": notification.EmailSentAt,
				}).Error
		}
	}
	return notification, nil
}
