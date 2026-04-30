package model

import (
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type MailAssistantAccount struct {
	Id            int    `json:"id"`
	UserId        int    `json:"user_id" gorm:"not null;uniqueIndex:uk_mail_assistant_user_email,priority:1;index"`
	Email         string `json:"email" gorm:"type:varchar(255);not null;uniqueIndex:uk_mail_assistant_user_email,priority:2"`
	Password      string `json:"password" gorm:"type:text;not null;default:''"`
	ClientIP      string `json:"client_ip" gorm:"type:varchar(128);not null;default:''"`
	RefreshToken  string `json:"refresh_token" gorm:"type:text;not null"`
	Status        string `json:"status" gorm:"type:varchar(64);not null;default:'等待收件'"`
	LastError     string `json:"last_error" gorm:"type:text;not null;default:''"`
	LastSyncAt    int64  `json:"last_sync_at" gorm:"bigint;not null;default:0"`
	AutoReceiving bool   `json:"auto_receiving" gorm:"not null;default:true;index"`
	CreatedAt     int64  `json:"created_at" gorm:"bigint;index"`
	UpdatedAt     int64  `json:"updated_at" gorm:"bigint;index"`
}

type MailAssistantStoredMessage struct {
	Id         int    `json:"id"`
	UserId     int    `json:"user_id" gorm:"not null;index:idx_mail_assistant_message_user_account,priority:1"`
	AccountId  int    `json:"account_id" gorm:"not null;index:idx_mail_assistant_message_user_account,priority:2;uniqueIndex:uk_mail_assistant_account_folder_uid,priority:1"`
	Folder     string `json:"folder" gorm:"type:varchar(64);not null;uniqueIndex:uk_mail_assistant_account_folder_uid,priority:2;index"`
	UID        int64  `json:"uid" gorm:"bigint;not null;uniqueIndex:uk_mail_assistant_account_folder_uid,priority:3"`
	Subject    string `json:"subject" gorm:"type:text;not null;default:''"`
	From       string `json:"from" gorm:"type:text;not null;default:''"`
	Date       string `json:"date" gorm:"type:text;not null;default:''"`
	Preview    string `json:"preview" gorm:"type:text;not null;default:''"`
	ReceivedAt int64  `json:"received_at" gorm:"bigint;not null;default:0;index"`
	CreatedAt  int64  `json:"created_at" gorm:"bigint;index"`
	UpdatedAt  int64  `json:"updated_at" gorm:"bigint;index"`
}

type MailAssistantAccountInput struct {
	Email        string
	ClientIP     string
	RefreshToken string
}

func (a *MailAssistantAccount) Prepare() {
	a.Email = strings.TrimSpace(strings.ToLower(a.Email))
	a.Password = strings.TrimSpace(a.Password)
	a.ClientIP = strings.TrimSpace(a.ClientIP)
	a.RefreshToken = strings.TrimSpace(a.RefreshToken)
	a.Status = strings.TrimSpace(a.Status)
	a.LastError = strings.TrimSpace(a.LastError)
	if a.Status == "" {
		a.Status = "等待收件"
	}
}

func (a *MailAssistantAccount) BeforeCreate(tx *gorm.DB) error {
	a.Prepare()
	now := common.GetTimestamp()
	if a.CreatedAt <= 0 {
		a.CreatedAt = now
	}
	a.UpdatedAt = now
	return nil
}

func (a *MailAssistantAccount) BeforeUpdate(tx *gorm.DB) error {
	a.Prepare()
	a.UpdatedAt = common.GetTimestamp()
	return nil
}

func (m *MailAssistantStoredMessage) BeforeCreate(tx *gorm.DB) error {
	now := common.GetTimestamp()
	if m.CreatedAt <= 0 {
		m.CreatedAt = now
	}
	m.UpdatedAt = now
	return nil
}

func (m *MailAssistantStoredMessage) BeforeUpdate(tx *gorm.DB) error {
	m.UpdatedAt = common.GetTimestamp()
	return nil
}

func ReplaceUserMailAssistantAccounts(userId int, inputs []MailAssistantAccountInput) ([]*MailAssistantAccount, error) {
	if userId <= 0 {
		return nil, errors.New("userId 无效")
	}
	now := common.GetTimestamp()
	normalized := make([]MailAssistantAccountInput, 0, len(inputs))
	seen := make(map[string]struct{})
	for _, input := range inputs {
		email := strings.TrimSpace(strings.ToLower(input.Email))
		if email == "" || strings.TrimSpace(input.RefreshToken) == "" {
			continue
		}
		if _, ok := seen[email]; ok {
			continue
		}
		seen[email] = struct{}{}
		normalized = append(normalized, MailAssistantAccountInput{
			Email:        email,
			ClientIP:     strings.TrimSpace(input.ClientIP),
			RefreshToken: strings.TrimSpace(input.RefreshToken),
		})
	}
	if len(normalized) == 0 {
		return nil, errors.New("至少需要一条有效邮箱记录")
	}

	err := DB.Transaction(func(tx *gorm.DB) error {
		existing := make([]*MailAssistantAccount, 0)
		if err := tx.Where("user_id = ?", userId).Find(&existing).Error; err != nil {
			return err
		}
		existingByEmail := make(map[string]*MailAssistantAccount, len(existing))
		for _, item := range existing {
			existingByEmail[strings.TrimSpace(strings.ToLower(item.Email))] = item
		}

		keepIDs := make([]int, 0, len(normalized))
		for _, input := range normalized {
			if current, ok := existingByEmail[input.Email]; ok {
				current.Password = ""
				current.ClientIP = input.ClientIP
				current.RefreshToken = input.RefreshToken
				current.Status = "等待收件"
				current.LastError = ""
				current.AutoReceiving = true
				current.UpdatedAt = now
				if err := tx.Save(current).Error; err != nil {
					return err
				}
				keepIDs = append(keepIDs, current.Id)
				continue
			}

			account := &MailAssistantAccount{
				UserId:        userId,
				Email:         input.Email,
				Password:      "",
				ClientIP:      input.ClientIP,
				RefreshToken:  input.RefreshToken,
				Status:        "等待收件",
				LastError:     "",
				LastSyncAt:    0,
				AutoReceiving: true,
				CreatedAt:     now,
				UpdatedAt:     now,
			}
			if err := tx.Create(account).Error; err != nil {
				return err
			}
			keepIDs = append(keepIDs, account.Id)
		}

		removeAccountQuery := tx.Where("user_id = ?", userId)
		if len(keepIDs) > 0 {
			removeAccountQuery = removeAccountQuery.Where("id NOT IN ?", keepIDs)
		}
		removeIDs := make([]int, 0)
		if err := removeAccountQuery.Model(&MailAssistantAccount{}).Pluck("id", &removeIDs).Error; err != nil {
			return err
		}
		if len(removeIDs) > 0 {
			if err := tx.Where("account_id IN ?", removeIDs).Delete(&MailAssistantStoredMessage{}).Error; err != nil {
				return err
			}
			if err := tx.Where("id IN ?", removeIDs).Delete(&MailAssistantAccount{}).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return ListUserMailAssistantAccounts(userId)
}

func ListUserMailAssistantAccounts(userId int) ([]*MailAssistantAccount, error) {
	accounts := make([]*MailAssistantAccount, 0)
	err := DB.Where("user_id = ?", userId).
		Order("id ASC").
		Find(&accounts).Error
	return accounts, err
}

func ListUserAutoReceivingMailAssistantAccounts(userId int) ([]*MailAssistantAccount, error) {
	accounts := make([]*MailAssistantAccount, 0)
	err := DB.Where("user_id = ? AND auto_receiving = ?", userId, true).
		Order("id ASC").
		Find(&accounts).Error
	return accounts, err
}

func GetMailAssistantAccountByID(userId int, accountId int) (*MailAssistantAccount, error) {
	account := &MailAssistantAccount{}
	err := DB.Where("id = ? AND user_id = ?", accountId, userId).First(account).Error
	return account, err
}

func UpdateMailAssistantAccountState(accountId int, userId int, updates map[string]any) error {
	if accountId <= 0 || userId <= 0 {
		return errors.New("accountId 或 userId 无效")
	}
	if updates == nil {
		updates = make(map[string]any)
	}
	updates["updated_at"] = common.GetTimestamp()
	return DB.Model(&MailAssistantAccount{}).
		Where("id = ? AND user_id = ?", accountId, userId).
		Updates(updates).Error
}

func GetMailAssistantMaxUIDByFolder(accountId int, folder string) (int64, error) {
	var maxUID int64
	err := DB.Model(&MailAssistantStoredMessage{}).
		Where("account_id = ? AND folder = ?", accountId, folder).
		Select("COALESCE(MAX(uid), 0)").
		Scan(&maxUID).Error
	return maxUID, err
}

func UpsertMailAssistantMessages(messages []*MailAssistantStoredMessage) error {
	if len(messages) == 0 {
		return nil
	}
	now := common.GetTimestamp()
	for _, item := range messages {
		item.CreatedAt = now
		item.UpdatedAt = now
	}
	return DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "account_id"},
			{Name: "folder"},
			{Name: "uid"},
		},
		DoUpdates: clause.Assignments(map[string]any{
			"subject":     clause.Column{Name: "subject"},
			"from":        clause.Column{Name: "from"},
			"date":        clause.Column{Name: "date"},
			"preview":     clause.Column{Name: "preview"},
			"received_at": clause.Column{Name: "received_at"},
			"updated_at":  now,
		}),
	}).Create(&messages).Error
}

func ListMailAssistantMessagesByAccount(accountId int, limit int) ([]*MailAssistantStoredMessage, error) {
	if limit <= 0 {
		limit = 100
	}
	items := make([]*MailAssistantStoredMessage, 0, limit)
	err := DB.Where("account_id = ?", accountId).
		Order("received_at DESC, id DESC").
		Limit(limit).
		Find(&items).Error
	return items, err
}

func CountMailAssistantMessagesByAccount(accountId int) (int64, error) {
	var count int64
	err := DB.Model(&MailAssistantStoredMessage{}).
		Where("account_id = ?", accountId).
		Count(&count).Error
	return count, err
}

func TrimMailAssistantMessagesByAccount(accountId int, limit int) error {
	if accountId <= 0 || limit <= 0 {
		return nil
	}
	removeIDs := make([]int, 0)
	err := DB.Model(&MailAssistantStoredMessage{}).
		Where("account_id = ?", accountId).
		Order("received_at DESC, id DESC").
		Offset(limit).
		Pluck("id", &removeIDs).Error
	if err != nil || len(removeIDs) == 0 {
		return err
	}
	return DB.Where("id IN ?", removeIDs).Delete(&MailAssistantStoredMessage{}).Error
}

func ClearMailAssistantPasswords() error {
	return DB.Model(&MailAssistantAccount{}).
		Where("password <> ?", "").
		Update("password", "").Error
}

func ListMailAssistantAutoReceivingUserIDs() ([]int, error) {
	userIDs := make([]int, 0)
	err := DB.Model(&MailAssistantAccount{}).
		Where("auto_receiving = ?", true).
		Distinct().
		Order("user_id ASC").
		Pluck("user_id", &userIDs).Error
	return userIDs, err
}
