package model

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const ecomAgentPlaceholderEmailDomain = "placeholder.ecomagent.local"

const ecomAgentAccountStatusDeleted = "deleted"

type EcomAgentAccount struct {
	Id                          int    `json:"id"`
	Email                       string `json:"email" gorm:"size:255;not null;uniqueIndex"`
	Password                    string `json:"password" gorm:"type:text;not null"`
	BaseURL                     string `json:"base_url" gorm:"size:255;not null;default:''"`
	Proxy                       string `json:"proxy" gorm:"type:text"`
	SupabaseAuthURL             string `json:"supabase_auth_url" gorm:"size:255;not null;default:''"`
	SupabaseAnonKey             string `json:"supabase_anon_key" gorm:"type:text;not null"`
	ConfirmURL                  string `json:"confirm_url" gorm:"type:text"`
	AccountID                   string `json:"account_id" gorm:"size:128;index"`
	RefreshToken                string `json:"refresh_token" gorm:"type:text"`
	AccessToken                 string `json:"access_token" gorm:"type:text"`
	AccessTokenExpiresAt        int64  `json:"access_token_expires_at" gorm:"bigint;default:0"`
	APIKey                      string `json:"api_key" gorm:"type:text"`
	APIKeyCreatedAt             int64  `json:"api_key_created_at" gorm:"bigint;default:0"`
	APIKeyExpiresAt             int64  `json:"api_key_expires_at" gorm:"bigint;default:0"`
	Plan                        string `json:"plan" gorm:"size:128;default:''"`
	RequestLimit                int64  `json:"request_limit" gorm:"bigint;default:0"`
	TokenLimit                  int64  `json:"token_limit" gorm:"bigint;default:0"`
	UsageRequests               int64  `json:"usage_requests" gorm:"bigint;default:0"`
	UsageTokens                 int64  `json:"usage_tokens" gorm:"bigint;default:0"`
	UsageUpdatedAt              int64  `json:"usage_updated_at" gorm:"bigint;default:0"`
	RequiresEmailConfirmation   bool   `json:"requires_email_confirmation" gorm:"default:false"`
	SignupAt                    int64  `json:"signup_at" gorm:"bigint;default:0"`
	ConfirmedAt                 int64  `json:"confirmed_at" gorm:"bigint;default:0"`
	ConfirmationStatusCode      int    `json:"confirmation_status_code" gorm:"default:0"`
	ConfirmationFinalURL        string `json:"confirmation_final_url" gorm:"type:text"`
	AssignmentStatus            string `json:"assignment_status" gorm:"size:64;index;default:'unassigned'"`
	AssignedPlan                string `json:"assigned_plan" gorm:"size:128;default:''"`
	AssignedSubscriptionOrderID int    `json:"assigned_subscription_order_id" gorm:"default:0"`
	AssignedChannelID           int    `json:"assigned_channel_id" gorm:"default:0"`
	AssignedChannelKeyIndex     int    `json:"assigned_channel_key_index" gorm:"default:-1"`
	AssignedUserSubscriptionID  int    `json:"assigned_user_subscription_id" gorm:"default:0"`
	AssignedAt                  int64  `json:"assigned_at" gorm:"bigint;default:0"`
	Tags                        string `json:"tags" gorm:"type:text"`
	Remark                      string `json:"remark" gorm:"type:text"`
	LoginAt                     int64  `json:"login_at" gorm:"bigint;default:0"`
	LastSyncAt                  int64  `json:"last_sync_at" gorm:"bigint;default:0"`
	Status                      string `json:"status" gorm:"size:64;index;default:'initialized'"`
	LastError                   string `json:"last_error" gorm:"type:text"`
	SignupRaw                   string `json:"signup_raw" gorm:"type:text"`
	KeyRaw                      string `json:"key_raw" gorm:"type:text"`
	SubscriptionRaw             string `json:"subscription_raw" gorm:"type:text"`
	UsageRaw                    string `json:"usage_raw" gorm:"type:text"`
	CreatedTime                 int64  `json:"created_time" gorm:"bigint"`
	UpdatedTime                 int64  `json:"updated_time" gorm:"bigint"`
}

type EcomAgentAssignedUserInfo struct {
	UserID   int    `json:"user_id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	OrderID  int    `json:"order_id"`
	SubID    int    `json:"subscription_id"`
}

type EcomAgentChannelKeyBindingDetail struct {
	AccountID      int    `json:"account_id"`
	Email          string `json:"email"`
	Status         string `json:"status"`
	Plan           string `json:"plan"`
	RequestLimit   int64  `json:"request_limit"`
	UsageRequests  int64  `json:"usage_requests"`
	AssignedAt     int64  `json:"assigned_at"`
	UserID         int    `json:"user_id"`
	Username       string `json:"username"`
	UserEmail      string `json:"user_email"`
	OrderID        int    `json:"order_id"`
	SubscriptionID int    `json:"subscription_id"`
}

func (a *EcomAgentAccount) PrepareDefaults() {
	a.Email = strings.TrimSpace(strings.ToLower(a.Email))
	a.Password = strings.TrimSpace(a.Password)
	a.AccountID = strings.TrimSpace(a.AccountID)
	a.RefreshToken = strings.TrimSpace(a.RefreshToken)
	a.AccessToken = strings.TrimSpace(a.AccessToken)
	a.BaseURL = strings.TrimRight(strings.TrimSpace(a.BaseURL), "/")
	a.Proxy = strings.TrimSpace(a.Proxy)
	a.SupabaseAuthURL = strings.TrimRight(strings.TrimSpace(a.SupabaseAuthURL), "/")
	a.SupabaseAnonKey = strings.TrimSpace(a.SupabaseAnonKey)
	a.ConfirmURL = strings.TrimSpace(a.ConfirmURL)
	a.AssignmentStatus = strings.TrimSpace(strings.ToLower(a.AssignmentStatus))
	a.AssignedPlan = strings.TrimSpace(a.AssignedPlan)
	a.Tags = strings.TrimSpace(a.Tags)
	a.Remark = strings.TrimSpace(a.Remark)
	if a.Status == "" {
		a.Status = "initialized"
	}
	if a.AssignmentStatus == "" {
		a.AssignmentStatus = "unassigned"
	}
	if a.AssignedChannelKeyIndex < -1 {
		a.AssignedChannelKeyIndex = -1
	}
	if a.AssignedSubscriptionOrderID < 0 {
		a.AssignedSubscriptionOrderID = 0
	}
}

func IsEcomAgentPlaceholderEmail(email string) bool {
	email = strings.TrimSpace(strings.ToLower(email))
	return strings.HasSuffix(email, "@"+ecomAgentPlaceholderEmailDomain)
}

func (a *EcomAgentAccount) HasRealEmail() bool {
	if a == nil {
		return false
	}
	email := strings.TrimSpace(strings.ToLower(a.Email))
	return email != "" && !IsEcomAgentPlaceholderEmail(email)
}

func (a *EcomAgentAccount) GetDisplayEmail() string {
	if a == nil || !a.HasRealEmail() {
		return ""
	}
	return strings.TrimSpace(strings.ToLower(a.Email))
}

func (a *EcomAgentAccount) ensureStorageEmail() error {
	if a == nil {
		return errors.New("账号不能为空")
	}
	if strings.TrimSpace(a.Email) != "" {
		return nil
	}
	if strings.TrimSpace(a.AccessToken) == "" &&
		strings.TrimSpace(a.RefreshToken) == "" &&
		strings.TrimSpace(a.AccountID) == "" {
		return nil
	}
	localPart := sanitizeEcomAgentPlaceholderLocalPart(a.AccountID)
	if localPart == "" {
		randomPart, err := common.GenerateRandomCharsKey(16)
		if err != nil {
			return err
		}
		localPart = "pending-" + strings.ToLower(randomPart)
	}
	a.Email = fmt.Sprintf("ecomagent+%s@%s", localPart, ecomAgentPlaceholderEmailDomain)
	return nil
}

func sanitizeEcomAgentPlaceholderLocalPart(accountID string) string {
	accountID = strings.TrimSpace(strings.ToLower(accountID))
	if accountID == "" {
		return ""
	}
	var builder strings.Builder
	for _, ch := range accountID {
		switch {
		case ch >= 'a' && ch <= 'z':
			builder.WriteRune(ch)
		case ch >= '0' && ch <= '9':
			builder.WriteRune(ch)
		case ch == '-' || ch == '_':
			builder.WriteRune('-')
		}
		if builder.Len() >= 40 {
			break
		}
	}
	return strings.Trim(builder.String(), "-")
}

func (a *EcomAgentAccount) Validate() error {
	if a.Email == "" && strings.TrimSpace(a.AccessToken) == "" && strings.TrimSpace(a.RefreshToken) == "" {
		return errors.New("邮箱不能为空")
	}
	if a.Password == "" && strings.TrimSpace(a.AccessToken) == "" && strings.TrimSpace(a.RefreshToken) == "" {
		return errors.New("密码或登录态至少填写一种")
	}
	if a.BaseURL == "" {
		return errors.New("base_url 不能为空")
	}
	if a.SupabaseAuthURL == "" {
		return errors.New("supabase_auth_url 不能为空")
	}
	if a.SupabaseAnonKey == "" {
		return errors.New("supabase_anon_key 不能为空")
	}
	return nil
}

func (a *EcomAgentAccount) Insert() error {
	a.PrepareDefaults()
	if err := a.ensureStorageEmail(); err != nil {
		return err
	}
	if err := a.Validate(); err != nil {
		return err
	}
	now := common.GetTimestamp()
	a.CreatedTime = now
	a.UpdatedTime = now
	originalAssignedChannelKeyIndex := a.AssignedChannelKeyIndex
	if err := DB.Create(a).Error; err != nil {
		return err
	}
	return DB.Model(&EcomAgentAccount{}).
		Where("id = ?", a.Id).
		Update("assigned_channel_key_index", originalAssignedChannelKeyIndex).Error
}

func (a *EcomAgentAccount) Update() error {
	a.PrepareDefaults()
	if err := a.ensureStorageEmail(); err != nil {
		return err
	}
	if err := a.Validate(); err != nil {
		return err
	}
	a.UpdatedTime = common.GetTimestamp()
	return DB.Save(a).Error
}

func GetAllEcomAgentAccounts() ([]*EcomAgentAccount, error) {
	accounts := make([]*EcomAgentAccount, 0)
	err := DB.Where("status <> ?", ecomAgentAccountStatusDeleted).
		Order("updated_time DESC").
		Find(&accounts).Error
	return accounts, err
}

func GetEcomAgentAccountByID(id int) (*EcomAgentAccount, error) {
	account := &EcomAgentAccount{}
	err := DB.Where("id = ? AND status <> ?", id, ecomAgentAccountStatusDeleted).First(account).Error
	return account, err
}

func GetEcomAgentAccountByEmail(email string) (*EcomAgentAccount, error) {
	account := &EcomAgentAccount{}
	err := DB.Where("email = ? AND status <> ?", strings.TrimSpace(strings.ToLower(email)), ecomAgentAccountStatusDeleted).
		First(account).Error
	return account, err
}

func GetEcomAgentAssignedUserInfoMap(accounts []*EcomAgentAccount) (map[int]*EcomAgentAssignedUserInfo, error) {
	result := make(map[int]*EcomAgentAssignedUserInfo, len(accounts))
	if len(accounts) == 0 {
		return result, nil
	}

	subscriptionIDSet := make(map[int]struct{})
	orderIDSet := make(map[int]struct{})
	for _, account := range accounts {
		if account == nil {
			continue
		}
		if account.AssignedUserSubscriptionID > 0 {
			subscriptionIDSet[account.AssignedUserSubscriptionID] = struct{}{}
		}
		if account.AssignedSubscriptionOrderID > 0 {
			orderIDSet[account.AssignedSubscriptionOrderID] = struct{}{}
		}
	}

	subscriptionIDs := make([]int, 0, len(subscriptionIDSet))
	for id := range subscriptionIDSet {
		subscriptionIDs = append(subscriptionIDs, id)
	}
	orderIDs := make([]int, 0, len(orderIDSet))
	for id := range orderIDSet {
		orderIDs = append(orderIDs, id)
	}

	subscriptions := make([]UserSubscription, 0, len(subscriptionIDs))
	if len(subscriptionIDs) > 0 {
		if err := DB.Where("id IN ?", subscriptionIDs).Find(&subscriptions).Error; err != nil {
			return nil, err
		}
	}
	subscriptionMap := make(map[int]*UserSubscription, len(subscriptions))
	for i := range subscriptions {
		subscription := subscriptions[i]
		subscriptionMap[subscription.Id] = &subscription
		if subscription.SourceOrderId > 0 {
			orderIDSet[subscription.SourceOrderId] = struct{}{}
		}
	}

	orderIDs = orderIDs[:0]
	for id := range orderIDSet {
		orderIDs = append(orderIDs, id)
	}
	orders := make([]SubscriptionOrder, 0, len(orderIDs))
	if len(orderIDs) > 0 {
		if err := DB.Where("id IN ?", orderIDs).Find(&orders).Error; err != nil {
			return nil, err
		}
	}
	orderMap := make(map[int]*SubscriptionOrder, len(orders))
	for i := range orders {
		order := orders[i]
		orderMap[order.Id] = &order
	}

	userIDSet := make(map[int]struct{})
	for _, subscription := range subscriptions {
		if subscription.UserId > 0 {
			userIDSet[subscription.UserId] = struct{}{}
		}
	}
	for _, order := range orders {
		if order.UserId > 0 {
			userIDSet[order.UserId] = struct{}{}
		}
	}

	userIDs := make([]int, 0, len(userIDSet))
	for id := range userIDSet {
		userIDs = append(userIDs, id)
	}
	users := make([]User, 0, len(userIDs))
	if len(userIDs) > 0 {
		if err := DB.Select("id", "username", "display_name", "email").Where("id IN ?", userIDs).Find(&users).Error; err != nil {
			return nil, err
		}
	}
	userMap := make(map[int]*User, len(users))
	for i := range users {
		user := users[i]
		userMap[user.Id] = &user
	}

	for _, account := range accounts {
		if account == nil {
			continue
		}
		info := &EcomAgentAssignedUserInfo{
			OrderID: account.AssignedSubscriptionOrderID,
			SubID:   account.AssignedUserSubscriptionID,
		}
		subscription := subscriptionMap[account.AssignedUserSubscriptionID]
		order := orderMap[account.AssignedSubscriptionOrderID]
		if order == nil && subscription != nil && subscription.SourceOrderId > 0 {
			order = orderMap[subscription.SourceOrderId]
			if info.OrderID == 0 {
				info.OrderID = subscription.SourceOrderId
			}
		}
		userID := 0
		if subscription != nil && subscription.UserId > 0 {
			userID = subscription.UserId
		} else if order != nil && order.UserId > 0 {
			userID = order.UserId
		}
		if userID <= 0 {
			continue
		}
		info.UserID = userID
		if user := userMap[userID]; user != nil {
			info.Username = strings.TrimSpace(user.DisplayName)
			if info.Username == "" {
				info.Username = strings.TrimSpace(user.Username)
			}
			info.Email = strings.TrimSpace(user.Email)
		}
		result[account.Id] = info
	}

	return result, nil
}

func GetEcomAgentChannelKeyBindingMap(channelId int) (map[int][]EcomAgentChannelKeyBindingDetail, error) {
	if channelId <= 0 {
		return map[int][]EcomAgentChannelKeyBindingDetail{}, nil
	}
	accounts := make([]*EcomAgentAccount, 0)
	if err := DB.
		Where("assigned_channel_id = ? AND assigned_channel_key_index >= 0 AND assignment_status = ?", channelId, "assigned").
		Order("assigned_channel_key_index asc, id asc").
		Find(&accounts).Error; err != nil {
		return nil, err
	}
	result := make(map[int][]EcomAgentChannelKeyBindingDetail)
	if len(accounts) == 0 {
		return result, nil
	}
	assignedUserMap, err := GetEcomAgentAssignedUserInfoMap(accounts)
	if err != nil {
		return nil, err
	}
	for _, account := range accounts {
		if account == nil || account.AssignedChannelKeyIndex < 0 {
			continue
		}
		assignedUser := assignedUserMap[account.Id]
		item := EcomAgentChannelKeyBindingDetail{
			AccountID:      account.Id,
			Email:          account.GetDisplayEmail(),
			Status:         strings.TrimSpace(account.Status),
			Plan:           strings.TrimSpace(account.Plan),
			RequestLimit:   account.RequestLimit,
			UsageRequests:  account.UsageRequests,
			AssignedAt:     account.AssignedAt,
			OrderID:        account.AssignedSubscriptionOrderID,
			SubscriptionID: account.AssignedUserSubscriptionID,
		}
		if assignedUser != nil {
			item.UserID = assignedUser.UserID
			item.Username = strings.TrimSpace(assignedUser.Username)
			item.UserEmail = strings.TrimSpace(assignedUser.Email)
			if item.OrderID <= 0 {
				item.OrderID = assignedUser.OrderID
			}
			if item.SubscriptionID <= 0 {
				item.SubscriptionID = assignedUser.SubID
			}
		}
		result[account.AssignedChannelKeyIndex] = append(result[account.AssignedChannelKeyIndex], item)
	}
	return result, nil
}

func IsEcomAgentAccountEmailDuplicated(id int, email string) (bool, error) {
	var count int64
	err := DB.Model(&EcomAgentAccount{}).
		Where("email = ? AND id <> ?", strings.TrimSpace(strings.ToLower(email)), id).
		Count(&count).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil
	}
	return count > 0, err
}

func DeleteEcomAgentAccountByID(id int) error {
	now := common.GetTimestamp()
	updates := map[string]any{
		"status":                         ecomAgentAccountStatusDeleted,
		"assignment_status":              "unassigned",
		"assigned_plan":                  "",
		"assigned_subscription_order_id": 0,
		"assigned_channel_id":            0,
		"assigned_channel_key_index":     -1,
		"assigned_user_subscription_id":  0,
		"assigned_at":                    0,
		"updated_time":                   now,
	}
	tx := DB.Model(&EcomAgentAccount{}).
		Where("id = ? AND status <> ?", id, ecomAgentAccountStatusDeleted).
		Updates(updates)
	if tx.Error != nil {
		return tx.Error
	}
	if tx.RowsAffected > 0 {
		return nil
	}

	// Idempotent delete: if already deleted, return nil; otherwise bubble "not found".
	// This keeps semantics predictable for batch deletes and avoids "delete succeeded" on non-existing ids.
	existing := &EcomAgentAccount{}
	err := DB.Select("id", "status").Where("id = ?", id).Take(existing).Error
	if err != nil {
		return err
	}
	if strings.EqualFold(strings.TrimSpace(existing.Status), ecomAgentAccountStatusDeleted) {
		return nil
	}
	return gorm.ErrRecordNotFound
}
