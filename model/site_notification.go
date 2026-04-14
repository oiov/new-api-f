package model

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

type SiteNotification struct {
	Id           int    `json:"id"`
	UserId       int    `json:"user_id" gorm:"index;not null"`
	SenderUserId int    `json:"sender_user_id" gorm:"index;not null;default:0"`
	Title        string `json:"title" gorm:"type:varchar(255);not null;default:''"`
	Content      string `json:"content" gorm:"type:text;not null"`
	Level        string `json:"level" gorm:"type:varchar(32);not null;default:'info'"`
	IsRead       bool   `json:"is_read" gorm:"not null;default:false;index"`
	ReadAt       int64  `json:"read_at" gorm:"not null;default:0"`
	EmailSent    bool   `json:"email_sent" gorm:"not null;default:false"`
	EmailSentAt  int64  `json:"email_sent_at" gorm:"not null;default:0"`
	CreatedAt    int64  `json:"created_at" gorm:"autoCreateTime:milli"`
	UpdatedAt    int64  `json:"updated_at" gorm:"autoUpdateTime:milli"`
}

func normalizeSiteNotificationLevel(level string) string {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "success":
		return "success"
	case "warning":
		return "warning"
	case "danger", "error":
		return "danger"
	default:
		return "info"
	}
}

func (n *SiteNotification) BeforeCreate(tx *gorm.DB) error {
	n.Level = normalizeSiteNotificationLevel(n.Level)
	return nil
}

func (n *SiteNotification) BeforeUpdate(tx *gorm.DB) error {
	n.Level = normalizeSiteNotificationLevel(n.Level)
	return nil
}

func CreateSiteNotification(notification *SiteNotification) error {
	if notification == nil {
		return nil
	}
	notification.Title = strings.TrimSpace(notification.Title)
	notification.Content = strings.TrimSpace(notification.Content)
	notification.Level = normalizeSiteNotificationLevel(notification.Level)
	return DB.Create(notification).Error
}

func CreateSiteNotificationTx(tx *gorm.DB, notification *SiteNotification) error {
	if notification == nil {
		return nil
	}
	if tx == nil {
		return CreateSiteNotification(notification)
	}
	notification.Title = strings.TrimSpace(notification.Title)
	notification.Content = strings.TrimSpace(notification.Content)
	notification.Level = normalizeSiteNotificationLevel(notification.Level)
	return tx.Create(notification).Error
}

func GetUserSiteNotifications(userId int, pageInfo *common.PageInfo, unreadOnly bool) ([]*SiteNotification, int64, error) {
	var notifications []*SiteNotification
	var total int64
	db := DB.Model(&SiteNotification{}).Where("user_id = ?", userId)
	if unreadOnly {
		db = db.Where("is_read = ?", false)
	}
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if err := db.Order("id DESC").Offset(pageInfo.GetStartIdx()).Limit(pageInfo.GetPageSize()).Find(&notifications).Error; err != nil {
		return nil, 0, err
	}
	return notifications, total, nil
}

func CountUnreadSiteNotifications(userId int) (int64, error) {
	var total int64
	err := DB.Model(&SiteNotification{}).
		Where("user_id = ? AND is_read = ?", userId, false).
		Count(&total).Error
	return total, err
}

func MarkSiteNotificationRead(userId int, notificationId int) error {
	now := common.GetTimestamp()
	return DB.Model(&SiteNotification{}).
		Where("id = ? AND user_id = ?", notificationId, userId).
		Updates(map[string]any{
			"is_read": true,
			"read_at": now,
		}).Error
}

func MarkAllSiteNotificationsRead(userId int) error {
	now := common.GetTimestamp()
	return DB.Model(&SiteNotification{}).
		Where("user_id = ? AND is_read = ?", userId, false).
		Updates(map[string]any{
			"is_read": true,
			"read_at": now,
		}).Error
}
