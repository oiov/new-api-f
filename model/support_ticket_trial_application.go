package model

import (
	"errors"
	"fmt"

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
	RequestIP      string `json:"request_ip" gorm:"type:varchar(64);not null;default:''"`
	Status         string `json:"status" gorm:"type:varchar(20);not null;default:pending;index"`
	ReviewerUserId int    `json:"reviewer_user_id" gorm:"not null;default:0"`
	RedemptionId   int    `json:"redemption_id" gorm:"not null;default:0"`
	RedemptionKey  string `json:"redemption_key" gorm:"type:varchar(64);not null;default:''"`
	CreatedAt      int64  `json:"created_at" gorm:"bigint;index;autoCreateTime"`
	ReviewedAt     int64  `json:"reviewed_at" gorm:"bigint;not null;default:0"`
	UpdatedAt      int64  `json:"updated_at" gorm:"bigint;autoUpdateTime"`
}

func migrateSupportTicketTrialApplicationRequestIPCompatibility() error {
	if !DB.Migrator().HasTable(&SupportTicketTrialApplication{}) {
		return nil
	}
	for _, indexName := range []string{"RequestIP", "idx_support_ticket_trial_applications_request_ip"} {
		if DB.Migrator().HasIndex(&SupportTicketTrialApplication{}, indexName) {
			if err := DB.Migrator().DropIndex(&SupportTicketTrialApplication{}, indexName); err != nil {
				return err
			}
		}
	}
	// Fallback: raw SQL drop for PostgreSQL where GORM HasIndex may not match
	if common.UsingPostgreSQL {
		DB.Exec("DROP INDEX IF EXISTS idx_support_ticket_trial_applications_request_ip")
	}
	return nil
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
	var application *SupportTicketTrialApplication
	var message *SupportTicketMessage
	var ticket SupportTicket
	err := DB.Transaction(func(tx *gorm.DB) error {
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

		if requestIP != "" {
			err = tx.Where("request_ip = ?", requestIP).First(&existing).Error
			if err == nil {
				return errors.New("该 IP 地址已提交过试用额度申请")
			}
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
		}

		application = &SupportTicketTrialApplication{
			TicketId:  ticket.Id,
			UserId:    userId,
			RequestIP: requestIP,
			Status:    SupportTicketTrialApplicationStatusPending,
		}
		if err := tx.Create(application).Error; err != nil {
			return err
		}

		message = &SupportTicketMessage{
			TicketId:     ticket.Id,
			SenderUserId: userId,
			IsAdmin:      false,
			Content:      "$5 trial quota application submitted. Pending admin review.",
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
		content := "Your $5 trial quota application was not approved."
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
			content = fmt.Sprintf("Your $5 trial quota application was approved. Redemption code: %s\n\nPlease redeem this code at https://nbility.dev/console/topup.", key)
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
