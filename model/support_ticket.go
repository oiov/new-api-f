package model

import (
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const (
	SupportTicketTypeNormal  = "normal"
	SupportTicketTypeRefund  = "refund"
	SupportTicketTypeInvoice = "invoice"

	SupportTicketStatusPending    = "pending"
	SupportTicketStatusInProgress = "in_progress"
	SupportTicketStatusResolved   = "resolved"
	SupportTicketStatusClosed     = "closed"

	SupportTicketPriorityLow    = "low"
	SupportTicketPriorityNormal = "normal"
	SupportTicketPriorityHigh   = "high"
	SupportTicketPriorityUrgent = "urgent"

	SupportTicketMaxSubjectRunes = 200
	SupportTicketMaxContentRunes = 8000
)

type SupportTicket struct {
	Id            int    `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId        int    `json:"user_id" gorm:"index;not null"`
	Username      string `json:"username,omitempty" gorm:"column:username;->;-:migration"`
	Type          string `json:"type" gorm:"type:varchar(20);not null;index"`
	Subject       string `json:"subject" gorm:"type:varchar(200);not null"`
	Status        string `json:"status" gorm:"type:varchar(20);not null;default:pending;index"`
	Priority      string `json:"priority" gorm:"type:varchar(20);not null;default:normal;index"`
	LastMessageAt int64  `json:"last_message_at" gorm:"index"`
	CreatedAt     int64  `json:"created_at" gorm:"bigint;index;autoCreateTime"`
	UpdatedAt     int64  `json:"updated_at" gorm:"bigint;autoUpdateTime"`
}

type SupportTicketMessage struct {
	Id             int    `json:"id" gorm:"primaryKey;autoIncrement"`
	TicketId       int    `json:"ticket_id" gorm:"index;not null"`
	SenderUserId   int    `json:"sender_user_id" gorm:"index;not null"`
	SenderUsername string `json:"sender_username,omitempty" gorm:"column:sender_username;->;-:migration"`
	IsAdmin        bool   `json:"is_admin" gorm:"not null;default:false"`
	Content        string `json:"content" gorm:"type:text;not null"`
	CreatedAt      int64  `json:"created_at" gorm:"bigint;index;autoCreateTime"`
}

type SupportTicketFilters struct {
	UserId   int
	Type     string
	Status   string
	Priority string
	Keyword  string
}

func normalizeSupportTicketType(ticketType string) string {
	switch strings.TrimSpace(ticketType) {
	case SupportTicketTypeRefund:
		return SupportTicketTypeRefund
	case SupportTicketTypeInvoice:
		return SupportTicketTypeInvoice
	default:
		return SupportTicketTypeNormal
	}
}

func normalizeSupportTicketStatus(status string) string {
	switch strings.TrimSpace(status) {
	case SupportTicketStatusInProgress:
		return SupportTicketStatusInProgress
	case SupportTicketStatusResolved:
		return SupportTicketStatusResolved
	case SupportTicketStatusClosed:
		return SupportTicketStatusClosed
	default:
		return SupportTicketStatusPending
	}
}

func normalizeSupportTicketPriority(priority string) string {
	switch strings.TrimSpace(priority) {
	case SupportTicketPriorityLow:
		return SupportTicketPriorityLow
	case SupportTicketPriorityHigh:
		return SupportTicketPriorityHigh
	case SupportTicketPriorityUrgent:
		return SupportTicketPriorityUrgent
	default:
		return SupportTicketPriorityNormal
	}
}

func defaultSupportTicketPriority(ticketType string) string {
	switch normalizeSupportTicketType(ticketType) {
	case SupportTicketTypeRefund, SupportTicketTypeInvoice:
		return SupportTicketPriorityHigh
	default:
		return SupportTicketPriorityNormal
	}
}

func normalizeSupportTicketSubject(subject string) (string, error) {
	subject = strings.TrimSpace(subject)
	if subject == "" {
		return "", errors.New("工单标题不能为空")
	}
	if len([]rune(subject)) > SupportTicketMaxSubjectRunes {
		return "", errors.New("工单标题过长")
	}
	return subject, nil
}

func normalizeSupportTicketContent(content string) (string, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return "", errors.New("工单内容不能为空")
	}
	if len([]rune(content)) > SupportTicketMaxContentRunes {
		return "", errors.New("工单内容过长")
	}
	return content, nil
}

func CreateSupportTicket(userId int, ticketType string, subject string, content string) (*SupportTicket, error) {
	normalizedType := normalizeSupportTicketType(ticketType)
	normalizedSubject, err := normalizeSupportTicketSubject(subject)
	if err != nil {
		return nil, err
	}
	normalizedContent, err := normalizeSupportTicketContent(content)
	if err != nil {
		return nil, err
	}

	var ticket *SupportTicket
	err = DB.Transaction(func(tx *gorm.DB) error {
		now := common.GetTimestamp()
		ticket = &SupportTicket{
			UserId:        userId,
			Type:          normalizedType,
			Subject:       normalizedSubject,
			Status:        SupportTicketStatusPending,
			Priority:      defaultSupportTicketPriority(normalizedType),
			LastMessageAt: now,
		}
		if err := tx.Create(ticket).Error; err != nil {
			return err
		}

		message := &SupportTicketMessage{
			TicketId:     ticket.Id,
			SenderUserId: userId,
			IsAdmin:      false,
			Content:      normalizedContent,
		}
		return tx.Create(message).Error
	})
	if err != nil {
		return nil, err
	}
	return ticket, nil
}

func ListSupportTickets(userId int, isAdmin bool, pageInfo *common.PageInfo, filters SupportTicketFilters) ([]*SupportTicket, int64, error) {
	var tickets []*SupportTicket
	var total int64

	query := DB.Table("support_tickets").
		Select("support_tickets.*, users.username").
		Joins("LEFT JOIN users ON support_tickets.user_id = users.id")
	query = applySupportTicketFilters(query, userId, isAdmin, filters)

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := query.Order("support_tickets.last_message_at desc").
		Order("support_tickets.id desc").
		Limit(pageInfo.GetPageSize()).
		Offset(pageInfo.GetStartIdx()).
		Find(&tickets).Error
	return tickets, total, err
}

func GetSupportTicketById(id int) (*SupportTicket, error) {
	var ticket SupportTicket
	err := DB.Table("support_tickets").
		Select("support_tickets.*, users.username").
		Joins("LEFT JOIN users ON support_tickets.user_id = users.id").
		Where("support_tickets.id = ?", id).
		First(&ticket).Error
	if err != nil {
		return nil, err
	}
	return &ticket, nil
}

func GetSupportTicketMessages(ticketId int) ([]*SupportTicketMessage, error) {
	var messages []*SupportTicketMessage
	err := DB.Table("support_ticket_messages").
		Select("support_ticket_messages.*, users.username as sender_username").
		Joins("LEFT JOIN users ON support_ticket_messages.sender_user_id = users.id").
		Where("support_ticket_messages.ticket_id = ?", ticketId).
		Order("support_ticket_messages.id asc").
		Find(&messages).Error
	return messages, err
}

func AddSupportTicketMessage(ticketId int, senderUserId int, isAdmin bool, content string) (*SupportTicketMessage, *SupportTicket, error) {
	normalizedContent, err := normalizeSupportTicketContent(content)
	if err != nil {
		return nil, nil, err
	}

	var message *SupportTicketMessage
	var ticket SupportTicket
	err = DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("id = ?", ticketId).First(&ticket).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return errors.New("工单不存在")
			}
			return err
		}
		if ticket.Status == SupportTicketStatusClosed {
			return errors.New("已关闭的工单不能继续回复")
		}

		message = &SupportTicketMessage{
			TicketId:     ticket.Id,
			SenderUserId: senderUserId,
			IsAdmin:      isAdmin,
			Content:      normalizedContent,
		}
		if err := tx.Create(message).Error; err != nil {
			return err
		}

		ticket.LastMessageAt = common.GetTimestamp()
		if isAdmin && ticket.Status == SupportTicketStatusPending {
			ticket.Status = SupportTicketStatusInProgress
		}
		return tx.Save(&ticket).Error
	})
	if err != nil {
		return nil, nil, err
	}
	return message, &ticket, nil
}

func UpdateSupportTicketByAdmin(id int, status string, priority string) (*SupportTicket, error) {
	var ticket SupportTicket
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("id = ?", id).First(&ticket).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return errors.New("工单不存在")
			}
			return err
		}

		updates := map[string]interface{}{}
		if strings.TrimSpace(status) != "" {
			updates["status"] = normalizeSupportTicketStatus(status)
		}
		if strings.TrimSpace(priority) != "" {
			updates["priority"] = normalizeSupportTicketPriority(priority)
		}
		if len(updates) == 0 {
			return nil
		}
		if err := tx.Model(&ticket).Updates(updates).Error; err != nil {
			return err
		}
		return tx.Where("id = ?", id).First(&ticket).Error
	})
	if err != nil {
		return nil, err
	}
	return &ticket, nil
}

func CloseSupportTicketByUser(id int, userId int) (*SupportTicket, error) {
	var ticket SupportTicket
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("id = ? AND user_id = ?", id, userId).First(&ticket).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return errors.New("工单不存在")
			}
			return err
		}
		ticket.Status = SupportTicketStatusClosed
		return tx.Save(&ticket).Error
	})
	if err != nil {
		return nil, err
	}
	return &ticket, nil
}

func applySupportTicketFilters(query *gorm.DB, userId int, isAdmin bool, filters SupportTicketFilters) *gorm.DB {
	if !isAdmin {
		query = query.Where("support_tickets.user_id = ?", userId)
	} else if filters.UserId > 0 {
		query = query.Where("support_tickets.user_id = ?", filters.UserId)
	}
	if ticketType := strings.TrimSpace(filters.Type); ticketType != "" {
		query = query.Where("support_tickets.type = ?", normalizeSupportTicketType(ticketType))
	}
	if status := strings.TrimSpace(filters.Status); status != "" {
		query = query.Where("support_tickets.status = ?", normalizeSupportTicketStatus(status))
	}
	if priority := strings.TrimSpace(filters.Priority); priority != "" {
		query = query.Where("support_tickets.priority = ?", normalizeSupportTicketPriority(priority))
	}
	if keyword := strings.TrimSpace(filters.Keyword); keyword != "" {
		like := "%%" + keyword + "%%"
		query = query.Where("support_tickets.subject LIKE ? OR users.username LIKE ?", like, like)
	}
	return query
}
