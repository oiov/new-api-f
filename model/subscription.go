package model

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/cachex"
	"github.com/samber/hot"
	"gorm.io/gorm"
)

// Subscription duration units
const (
	SubscriptionDurationYear   = "year"
	SubscriptionDurationMonth  = "month"
	SubscriptionDurationWeek   = "week"
	SubscriptionDurationDay    = "day"
	SubscriptionDurationHour   = "hour"
	SubscriptionDurationCustom = "custom"
)

// Subscription resource types
const (
	SubscriptionResourceQuota        = "quota"
	SubscriptionResourceRequestCount = "request_count"
)

// Subscription quota reset period
const (
	SubscriptionResetNever   = "never"
	SubscriptionResetDaily   = "daily"
	SubscriptionResetWeekly  = "weekly"
	SubscriptionResetMonthly = "monthly"
	SubscriptionResetCustom  = "custom"
)

var (
	ErrSubscriptionOrderNotFound      = errors.New("subscription order not found")
	ErrSubscriptionOrderStatusInvalid = errors.New("subscription order status invalid")
)

const (
	subscriptionPlanCacheNamespace     = "new-api:subscription_plan:v1"
	subscriptionPlanInfoCacheNamespace = "new-api:subscription_plan_info:v1"
)

var (
	subscriptionPlanCacheOnce     sync.Once
	subscriptionPlanInfoCacheOnce sync.Once

	subscriptionPlanCache     *cachex.HybridCache[SubscriptionPlan]
	subscriptionPlanInfoCache *cachex.HybridCache[SubscriptionPlanInfo]
)

func subscriptionPlanCacheTTL() time.Duration {
	ttlSeconds := common.GetEnvOrDefault("SUBSCRIPTION_PLAN_CACHE_TTL", 300)
	if ttlSeconds <= 0 {
		ttlSeconds = 300
	}
	return time.Duration(ttlSeconds) * time.Second
}

func subscriptionPlanInfoCacheTTL() time.Duration {
	ttlSeconds := common.GetEnvOrDefault("SUBSCRIPTION_PLAN_INFO_CACHE_TTL", 120)
	if ttlSeconds <= 0 {
		ttlSeconds = 120
	}
	return time.Duration(ttlSeconds) * time.Second
}

func subscriptionPlanCacheCapacity() int {
	capacity := common.GetEnvOrDefault("SUBSCRIPTION_PLAN_CACHE_CAP", 5000)
	if capacity <= 0 {
		capacity = 5000
	}
	return capacity
}

func subscriptionPlanInfoCacheCapacity() int {
	capacity := common.GetEnvOrDefault("SUBSCRIPTION_PLAN_INFO_CACHE_CAP", 10000)
	if capacity <= 0 {
		capacity = 10000
	}
	return capacity
}

func getSubscriptionPlanCache() *cachex.HybridCache[SubscriptionPlan] {
	subscriptionPlanCacheOnce.Do(func() {
		ttl := subscriptionPlanCacheTTL()
		subscriptionPlanCache = cachex.NewHybridCache[SubscriptionPlan](cachex.HybridCacheConfig[SubscriptionPlan]{
			Namespace: cachex.Namespace(subscriptionPlanCacheNamespace),
			Redis:     common.RDB,
			RedisEnabled: func() bool {
				return common.RedisEnabled && common.RDB != nil
			},
			RedisCodec: cachex.JSONCodec[SubscriptionPlan]{},
			Memory: func() *hot.HotCache[string, SubscriptionPlan] {
				return hot.NewHotCache[string, SubscriptionPlan](hot.LRU, subscriptionPlanCacheCapacity()).
					WithTTL(ttl).
					WithJanitor().
					Build()
			},
		})
	})
	return subscriptionPlanCache
}

func getSubscriptionPlanInfoCache() *cachex.HybridCache[SubscriptionPlanInfo] {
	subscriptionPlanInfoCacheOnce.Do(func() {
		ttl := subscriptionPlanInfoCacheTTL()
		subscriptionPlanInfoCache = cachex.NewHybridCache[SubscriptionPlanInfo](cachex.HybridCacheConfig[SubscriptionPlanInfo]{
			Namespace: cachex.Namespace(subscriptionPlanInfoCacheNamespace),
			Redis:     common.RDB,
			RedisEnabled: func() bool {
				return common.RedisEnabled && common.RDB != nil
			},
			RedisCodec: cachex.JSONCodec[SubscriptionPlanInfo]{},
			Memory: func() *hot.HotCache[string, SubscriptionPlanInfo] {
				return hot.NewHotCache[string, SubscriptionPlanInfo](hot.LRU, subscriptionPlanInfoCacheCapacity()).
					WithTTL(ttl).
					WithJanitor().
					Build()
			},
		})
	})
	return subscriptionPlanInfoCache
}

func subscriptionPlanCacheKey(id int) string {
	if id <= 0 {
		return ""
	}
	return strconv.Itoa(id)
}

func InvalidateSubscriptionPlanCache(planId int) {
	if planId <= 0 {
		return
	}
	cache := getSubscriptionPlanCache()
	_, _ = cache.DeleteMany([]string{subscriptionPlanCacheKey(planId)})
	infoCache := getSubscriptionPlanInfoCache()
	_ = infoCache.Purge()
}

// Subscription plan
type SubscriptionPlan struct {
	Id int `json:"id"`

	Title    string `json:"title" gorm:"type:varchar(128);not null"`
	Subtitle string `json:"subtitle" gorm:"type:varchar(255);default:''"`

	// Display money amount (follow existing code style: float64 for money)
	PriceAmount float64 `json:"price_amount" gorm:"type:decimal(10,6);not null;default:0"`
	Currency    string  `json:"currency" gorm:"type:varchar(8);not null;default:'USD'"`

	DurationUnit  string `json:"duration_unit" gorm:"type:varchar(16);not null;default:'month'"`
	DurationValue int    `json:"duration_value" gorm:"type:int;not null;default:1"`
	CustomSeconds int64  `json:"custom_seconds" gorm:"type:bigint;not null;default:0"`

	Enabled   bool `json:"enabled" gorm:"default:true"`
	SortOrder int  `json:"sort_order" gorm:"type:int;default:0"`

	StripePriceId  string `json:"stripe_price_id" gorm:"type:varchar(128);default:''"`
	CreemProductId string `json:"creem_product_id" gorm:"type:varchar(128);default:''"`

	// Max purchases per user (0 = unlimited)
	MaxPurchasePerUser int `json:"max_purchase_per_user" gorm:"type:int;default:0"`

	// Upgrade user group after purchase (empty = no change)
	UpgradeGroup string `json:"upgrade_group" gorm:"type:varchar(64);default:''"`

	// Total quota (amount in quota units, 0 = unlimited)
	TotalAmount int64 `json:"total_amount" gorm:"type:bigint;not null;default:0"`

	// ResourceType controls whether this plan is billed by quota or successful request count.
	ResourceType string `json:"resource_type" gorm:"type:varchar(32);not null;default:'quota'"`
	// RequestCountTotal is the total successful request count for request_count plans (0 = unlimited).
	RequestCountTotal int64 `json:"request_count_total" gorm:"type:bigint;not null;default:0"`

	// Quota reset period for plan
	QuotaResetPeriod        string `json:"quota_reset_period" gorm:"type:varchar(16);default:'never'"`
	QuotaResetCustomSeconds int64  `json:"quota_reset_custom_seconds" gorm:"type:bigint;default:0"`

	CreatedAt int64 `json:"created_at" gorm:"bigint"`
	UpdatedAt int64 `json:"updated_at" gorm:"bigint"`
}

func (p *SubscriptionPlan) BeforeCreate(tx *gorm.DB) error {
	now := common.GetTimestamp()
	p.CreatedAt = now
	p.UpdatedAt = now
	return nil
}

func (p *SubscriptionPlan) BeforeUpdate(tx *gorm.DB) error {
	p.UpdatedAt = common.GetTimestamp()
	return nil
}

// Subscription order (payment -> webhook -> create UserSubscription)
type SubscriptionOrder struct {
	Id     int     `json:"id"`
	UserId int     `json:"user_id" gorm:"index"`
	PlanId int     `json:"plan_id" gorm:"index"`
	Money  float64 `json:"money"`

	TradeNo       string `json:"trade_no" gorm:"unique;type:varchar(255);index"`
	PaymentMethod string `json:"payment_method" gorm:"type:varchar(50)"`
	Status        string `json:"status"`
	CreateTime    int64  `json:"create_time"`
	CompleteTime  int64  `json:"complete_time"`

	ProviderPayload string `json:"provider_payload" gorm:"type:text"`
}

func (o *SubscriptionOrder) Insert() error {
	if o.CreateTime == 0 {
		o.CreateTime = common.GetTimestamp()
	}
	return DB.Create(o).Error
}

func (o *SubscriptionOrder) Update() error {
	return DB.Save(o).Error
}

func GetSubscriptionOrderByTradeNo(tradeNo string) *SubscriptionOrder {
	if tradeNo == "" {
		return nil
	}
	var order SubscriptionOrder
	if err := DB.Where("trade_no = ?", tradeNo).First(&order).Error; err != nil {
		return nil
	}
	return &order
}

// User subscription instance
type UserSubscription struct {
	Id     int `json:"id"`
	UserId int `json:"user_id" gorm:"index;index:idx_user_sub_active,priority:1"`
	PlanId int `json:"plan_id" gorm:"index"`

	AmountTotal int64 `json:"amount_total" gorm:"type:bigint;not null;default:0"`
	AmountUsed  int64 `json:"amount_used" gorm:"type:bigint;not null;default:0"`

	ResourceType       string `json:"resource_type" gorm:"type:varchar(32);not null;default:'quota'"`
	RequestCountTotal  int64  `json:"request_count_total" gorm:"type:bigint;not null;default:0"`
	RequestCountUsed   int64  `json:"request_count_used" gorm:"type:bigint;not null;default:0"`
	ResetPeriod        string `json:"reset_period" gorm:"type:varchar(16);not null;default:'never'"`
	ResetCustomSeconds int64  `json:"reset_custom_seconds" gorm:"type:bigint;not null;default:0"`
	DurationUnit       string `json:"duration_unit" gorm:"type:varchar(16);not null;default:'month'"`
	DurationValue      int    `json:"duration_value" gorm:"type:int;not null;default:1"`
	CustomSeconds      int64  `json:"custom_seconds" gorm:"type:bigint;not null;default:0"`

	StartTime int64  `json:"start_time" gorm:"bigint"`
	EndTime   int64  `json:"end_time" gorm:"bigint;index;index:idx_user_sub_active,priority:3"`
	Status    string `json:"status" gorm:"type:varchar(32);index;index:idx_user_sub_active,priority:2"` // active/expired/cancelled

	Source string `json:"source" gorm:"type:varchar(32);default:'order'"` // order/admin

	LastResetTime int64 `json:"last_reset_time" gorm:"type:bigint;default:0"`
	NextResetTime int64 `json:"next_reset_time" gorm:"type:bigint;default:0;index"`

	UpgradeGroup  string `json:"upgrade_group" gorm:"type:varchar(64);default:''"`
	PrevUserGroup string `json:"prev_user_group" gorm:"type:varchar(64);default:''"`

	CreatedAt int64 `json:"created_at" gorm:"bigint"`
	UpdatedAt int64 `json:"updated_at" gorm:"bigint"`
}

func (s *UserSubscription) BeforeCreate(tx *gorm.DB) error {
	now := common.GetTimestamp()
	s.CreatedAt = now
	s.UpdatedAt = now
	return nil
}

func (s *UserSubscription) BeforeUpdate(tx *gorm.DB) error {
	s.UpdatedAt = common.GetTimestamp()
	return nil
}

type SubscriptionSummary struct {
	Subscription *UserSubscription `json:"subscription"`
}

type AdminUserSubscriptionSummary struct {
	Subscription *UserSubscription `json:"subscription"`
	Username     string            `json:"username"`
	UserGroup    string            `json:"user_group"`
}

type SubscriptionMigrationFilter struct {
	TargetPlanId        int
	UserGroup           string
	SourceGroup         string
	SourceResourceType  string
	ExcludeDurationUnit string
	SourcePlanIds       []int
}

type SubscriptionMigrationPreviewItem struct {
	UserSubscriptionId   int               `json:"user_subscription_id"`
	UserId               int               `json:"user_id"`
	Username             string            `json:"username"`
	UserGroup            string            `json:"user_group"`
	OldPlanId            int               `json:"old_plan_id"`
	OldPlanTitle         string            `json:"old_plan_title"`
	OldDurationUnit      string            `json:"old_duration_unit"`
	OldResourceType      string            `json:"old_resource_type"`
	OldUpgradeGroup      string            `json:"old_upgrade_group"`
	OldStartTime         int64             `json:"old_start_time"`
	OldEndTime           int64             `json:"old_end_time"`
	OldAmountTotal       int64             `json:"old_amount_total"`
	OldAmountUsed        int64             `json:"old_amount_used"`
	OldRequestCountTotal int64             `json:"old_request_count_total"`
	OldRequestCountUsed  int64             `json:"old_request_count_used"`
	TargetPlanId         int               `json:"target_plan_id"`
	TargetPlanTitle      string            `json:"target_plan_title"`
	TargetResourceType   string            `json:"target_resource_type"`
	TargetUpgradeGroup   string            `json:"target_upgrade_group"`
	TargetPlan           *SubscriptionPlan `json:"target_plan,omitempty"`
}

type SubscriptionMigrationExecutionItem struct {
	UserSubscriptionId    int    `json:"user_subscription_id"`
	NewUserSubscriptionId int    `json:"new_user_subscription_id"`
	UserId                int    `json:"user_id"`
	Username              string `json:"username"`
	Status                string `json:"status"`
	Message               string `json:"message"`
}

type SubscriptionMigrationExecutionResult struct {
	TargetPlanId int                                  `json:"target_plan_id"`
	Total        int                                  `json:"total"`
	Migrated     int                                  `json:"migrated"`
	Failed       int                                  `json:"failed"`
	Items        []SubscriptionMigrationExecutionItem `json:"items"`
}

func calcPlanEndTime(start time.Time, plan *SubscriptionPlan) (int64, error) {
	if plan == nil {
		return 0, errors.New("plan is nil")
	}
	if plan.DurationValue <= 0 && plan.DurationUnit != SubscriptionDurationCustom {
		return 0, errors.New("duration_value must be > 0")
	}
	switch plan.DurationUnit {
	case SubscriptionDurationYear:
		return start.AddDate(plan.DurationValue, 0, 0).Unix(), nil
	case SubscriptionDurationMonth:
		return start.AddDate(0, plan.DurationValue, 0).Unix(), nil
	case SubscriptionDurationWeek:
		return start.AddDate(0, 0, 7*plan.DurationValue).Unix(), nil
	case SubscriptionDurationDay:
		return start.Add(time.Duration(plan.DurationValue) * 24 * time.Hour).Unix(), nil
	case SubscriptionDurationHour:
		return start.Add(time.Duration(plan.DurationValue) * time.Hour).Unix(), nil
	case SubscriptionDurationCustom:
		if plan.CustomSeconds <= 0 {
			return 0, errors.New("custom_seconds must be > 0")
		}
		return start.Add(time.Duration(plan.CustomSeconds) * time.Second).Unix(), nil
	default:
		return 0, fmt.Errorf("invalid duration_unit: %s", plan.DurationUnit)
	}
}

func NormalizeResetPeriod(period string) string {
	switch strings.TrimSpace(period) {
	case SubscriptionResetDaily, SubscriptionResetWeekly, SubscriptionResetMonthly, SubscriptionResetCustom:
		return strings.TrimSpace(period)
	default:
		return SubscriptionResetNever
	}
}

func NormalizeSubscriptionResourceType(resourceType string) string {
	switch strings.TrimSpace(resourceType) {
	case SubscriptionResourceRequestCount:
		return SubscriptionResourceRequestCount
	default:
		return SubscriptionResourceQuota
	}
}

func calcNextResetTime(base time.Time, plan *SubscriptionPlan, endUnix int64) int64 {
	if plan == nil {
		return 0
	}
	period := NormalizeResetPeriod(plan.QuotaResetPeriod)
	if period == SubscriptionResetNever {
		return 0
	}
	var next time.Time
	switch period {
	case SubscriptionResetDaily:
		next = time.Date(base.Year(), base.Month(), base.Day(), 0, 0, 0, 0, base.Location()).
			AddDate(0, 0, 1)
	case SubscriptionResetWeekly:
		// Align to next Monday 00:00
		weekday := int(base.Weekday()) // Sunday=0
		// Convert to Monday=1..Sunday=7
		if weekday == 0 {
			weekday = 7
		}
		daysUntil := 8 - weekday
		next = time.Date(base.Year(), base.Month(), base.Day(), 0, 0, 0, 0, base.Location()).
			AddDate(0, 0, daysUntil)
	case SubscriptionResetMonthly:
		// Align to first day of next month 00:00
		next = time.Date(base.Year(), base.Month(), 1, 0, 0, 0, 0, base.Location()).
			AddDate(0, 1, 0)
	case SubscriptionResetCustom:
		if plan.QuotaResetCustomSeconds <= 0 {
			return 0
		}
		next = base.Add(time.Duration(plan.QuotaResetCustomSeconds) * time.Second)
	default:
		return 0
	}
	if endUnix > 0 && next.Unix() > endUnix {
		return 0
	}
	return next.Unix()
}

func GetSubscriptionPlanById(id int) (*SubscriptionPlan, error) {
	return getSubscriptionPlanByIdTx(nil, id)
}

func getSubscriptionPlanByIdTx(tx *gorm.DB, id int) (*SubscriptionPlan, error) {
	if id <= 0 {
		return nil, errors.New("invalid plan id")
	}
	key := subscriptionPlanCacheKey(id)
	if key != "" {
		if cached, found, err := getSubscriptionPlanCache().Get(key); err == nil && found {
			return &cached, nil
		}
	}
	var plan SubscriptionPlan
	query := DB
	if tx != nil {
		query = tx
	}
	if err := query.Where("id = ?", id).First(&plan).Error; err != nil {
		return nil, err
	}
	_ = getSubscriptionPlanCache().SetWithTTL(key, plan, subscriptionPlanCacheTTL())
	return &plan, nil
}

func CountUserSubscriptionsByPlan(userId int, planId int) (int64, error) {
	if userId <= 0 || planId <= 0 {
		return 0, errors.New("invalid userId or planId")
	}
	var count int64
	if err := DB.Model(&UserSubscription{}).
		Where("user_id = ? AND plan_id = ?", userId, planId).
		Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func getUserGroupByIdTx(tx *gorm.DB, userId int) (string, error) {
	if userId <= 0 {
		return "", errors.New("invalid userId")
	}
	if tx == nil {
		tx = DB
	}
	var group string
	if err := tx.Model(&User{}).Where("id = ?", userId).Select(commonGroupCol).Find(&group).Error; err != nil {
		return "", err
	}
	return group, nil
}

func downgradeUserGroupForSubscriptionTx(tx *gorm.DB, sub *UserSubscription, now int64) (string, error) {
	if tx == nil || sub == nil {
		return "", errors.New("invalid downgrade args")
	}
	upgradeGroup := strings.TrimSpace(sub.UpgradeGroup)
	if upgradeGroup == "" {
		return "", nil
	}
	currentGroup, err := getUserGroupByIdTx(tx, sub.UserId)
	if err != nil {
		return "", err
	}
	if currentGroup != upgradeGroup {
		return "", nil
	}
	var activeSub UserSubscription
	activeQuery := tx.Where("user_id = ? AND status = ? AND end_time > ? AND id <> ? AND upgrade_group <> ''",
		sub.UserId, "active", now, sub.Id).
		Order("end_time desc, id desc").
		Limit(1).
		Find(&activeSub)
	if activeQuery.Error == nil && activeQuery.RowsAffected > 0 {
		return "", nil
	}
	prevGroup := strings.TrimSpace(sub.PrevUserGroup)
	if prevGroup == "" || prevGroup == currentGroup {
		return "", nil
	}
	if err := tx.Model(&User{}).Where("id = ?", sub.UserId).
		Update("group", prevGroup).Error; err != nil {
		return "", err
	}
	return prevGroup, nil
}

func CreateUserSubscriptionFromPlanTx(tx *gorm.DB, userId int, plan *SubscriptionPlan, source string) (*UserSubscription, error) {
	if tx == nil {
		return nil, errors.New("tx is nil")
	}
	if plan == nil || plan.Id == 0 {
		return nil, errors.New("invalid plan")
	}
	if userId <= 0 {
		return nil, errors.New("invalid user id")
	}
	if plan.MaxPurchasePerUser > 0 {
		var count int64
		if err := tx.Model(&UserSubscription{}).
			Where("user_id = ? AND plan_id = ?", userId, plan.Id).
			Count(&count).Error; err != nil {
			return nil, err
		}
		if count >= int64(plan.MaxPurchasePerUser) {
			return nil, errors.New("已达到该套餐购买上限")
		}
	}
	nowUnix := GetDBTimestamp()
	now := time.Unix(nowUnix, 0)
	endUnix, err := calcPlanEndTime(now, plan)
	if err != nil {
		return nil, err
	}
	resetBase := now
	nextReset := calcNextResetTime(resetBase, plan, endUnix)
	lastReset := int64(0)
	if nextReset > 0 {
		lastReset = now.Unix()
	}
	upgradeGroup := strings.TrimSpace(plan.UpgradeGroup)
	prevGroup := ""
	if upgradeGroup != "" {
		currentGroup, err := getUserGroupByIdTx(tx, userId)
		if err != nil {
			return nil, err
		}
		if currentGroup != upgradeGroup {
			prevGroup = currentGroup
			if err := tx.Model(&User{}).Where("id = ?", userId).
				Update("group", upgradeGroup).Error; err != nil {
				return nil, err
			}
		}
	}
	sub := &UserSubscription{
		UserId:             userId,
		PlanId:             plan.Id,
		AmountTotal:        plan.TotalAmount,
		AmountUsed:         0,
		ResourceType:       NormalizeSubscriptionResourceType(plan.ResourceType),
		RequestCountTotal:  plan.RequestCountTotal,
		RequestCountUsed:   0,
		ResetPeriod:        NormalizeResetPeriod(plan.QuotaResetPeriod),
		ResetCustomSeconds: plan.QuotaResetCustomSeconds,
		DurationUnit:       plan.DurationUnit,
		DurationValue:      plan.DurationValue,
		CustomSeconds:      plan.CustomSeconds,
		StartTime:          now.Unix(),
		EndTime:            endUnix,
		Status:             "active",
		Source:             source,
		LastResetTime:      lastReset,
		NextResetTime:      nextReset,
		UpgradeGroup:       upgradeGroup,
		PrevUserGroup:      prevGroup,
		CreatedAt:          common.GetTimestamp(),
		UpdatedAt:          common.GetTimestamp(),
	}
	if err := tx.Create(sub).Error; err != nil {
		return nil, err
	}
	return sub, nil
}

// Complete a subscription order (idempotent). Creates a UserSubscription snapshot from the plan.
func CompleteSubscriptionOrder(tradeNo string, providerPayload string) error {
	if tradeNo == "" {
		return errors.New("tradeNo is empty")
	}
	refCol := "`trade_no`"
	if common.UsingPostgreSQL {
		refCol = `"trade_no"`
	}
	var logUserId int
	var logPlanTitle string
	var logMoney float64
	var logPaymentMethod string
	var upgradeGroup string
	err := DB.Transaction(func(tx *gorm.DB) error {
		var order SubscriptionOrder
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where(refCol+" = ?", tradeNo).First(&order).Error; err != nil {
			return ErrSubscriptionOrderNotFound
		}
		if order.Status == common.TopUpStatusSuccess {
			return nil
		}
		if order.Status != common.TopUpStatusPending {
			return ErrSubscriptionOrderStatusInvalid
		}
		plan, err := GetSubscriptionPlanById(order.PlanId)
		if err != nil {
			return err
		}
		if !plan.Enabled {
			// still allow completion for already purchased orders
		}
		upgradeGroup = strings.TrimSpace(plan.UpgradeGroup)
		_, err = CreateUserSubscriptionFromPlanTx(tx, order.UserId, plan, "order")
		if err != nil {
			return err
		}
		if err := upsertSubscriptionTopUpTx(tx, &order); err != nil {
			return err
		}
		order.Status = common.TopUpStatusSuccess
		order.CompleteTime = common.GetTimestamp()
		if providerPayload != "" {
			order.ProviderPayload = providerPayload
		}
		if err := tx.Save(&order).Error; err != nil {
			return err
		}
		logUserId = order.UserId
		logPlanTitle = plan.Title
		logMoney = order.Money
		logPaymentMethod = order.PaymentMethod
		return nil
	})
	if err != nil {
		return err
	}
	if upgradeGroup != "" && logUserId > 0 {
		_ = UpdateUserGroupCache(logUserId, upgradeGroup)
	}
	if logUserId > 0 {
		msg := fmt.Sprintf("订阅购买成功，套餐: %s，支付金额: %.2f，支付方式: %s", logPlanTitle, logMoney, logPaymentMethod)
		RecordLog(logUserId, LogTypeTopup, msg)
	}
	return nil
}

func upsertSubscriptionTopUpTx(tx *gorm.DB, order *SubscriptionOrder) error {
	if tx == nil || order == nil {
		return errors.New("invalid subscription order")
	}
	now := common.GetTimestamp()
	var topup TopUp
	if err := tx.Where("trade_no = ?", order.TradeNo).First(&topup).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			topup = TopUp{
				UserId:        order.UserId,
				Amount:        0,
				Money:         order.Money,
				TradeNo:       order.TradeNo,
				PaymentMethod: order.PaymentMethod,
				CreateTime:    order.CreateTime,
				CompleteTime:  now,
				Status:        common.TopUpStatusSuccess,
			}
			return tx.Create(&topup).Error
		}
		return err
	}
	topup.Money = order.Money
	if topup.PaymentMethod == "" {
		topup.PaymentMethod = order.PaymentMethod
	}
	if topup.CreateTime == 0 {
		topup.CreateTime = order.CreateTime
	}
	topup.CompleteTime = now
	topup.Status = common.TopUpStatusSuccess
	return tx.Save(&topup).Error
}

func ExpireSubscriptionOrder(tradeNo string) error {
	if tradeNo == "" {
		return errors.New("tradeNo is empty")
	}
	refCol := "`trade_no`"
	if common.UsingPostgreSQL {
		refCol = `"trade_no"`
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var order SubscriptionOrder
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where(refCol+" = ?", tradeNo).First(&order).Error; err != nil {
			return ErrSubscriptionOrderNotFound
		}
		if order.Status != common.TopUpStatusPending {
			return nil
		}
		order.Status = common.TopUpStatusExpired
		order.CompleteTime = common.GetTimestamp()
		return tx.Save(&order).Error
	})
}

// Admin bind (no payment). Creates a UserSubscription from a plan.
func AdminBindSubscription(userId int, planId int, sourceNote string) (string, error) {
	if userId <= 0 || planId <= 0 {
		return "", errors.New("invalid userId or planId")
	}
	plan, err := GetSubscriptionPlanById(planId)
	if err != nil {
		return "", err
	}
	err = DB.Transaction(func(tx *gorm.DB) error {
		_, err := CreateUserSubscriptionFromPlanTx(tx, userId, plan, "admin")
		return err
	})
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(plan.UpgradeGroup) != "" {
		_ = UpdateUserGroupCache(userId, plan.UpgradeGroup)
		return fmt.Sprintf("用户分组将升级到 %s", plan.UpgradeGroup), nil
	}
	return "", nil
}

// GetAllActiveUserSubscriptions returns all active subscriptions for a user.
func GetAllActiveUserSubscriptions(userId int) ([]SubscriptionSummary, error) {
	if userId <= 0 {
		return nil, errors.New("invalid userId")
	}
	now := common.GetTimestamp()
	var subs []UserSubscription
	err := DB.Where("user_id = ? AND status = ? AND end_time > ?", userId, "active", now).
		Order("end_time desc, id desc").
		Find(&subs).Error
	if err != nil {
		return nil, err
	}
	return buildSubscriptionSummaries(subs), nil
}

// HasActiveUserSubscription returns whether the user has any active subscription.
// This is a lightweight existence check to avoid heavy pre-consume transactions.
func HasActiveUserSubscription(userId int) (bool, error) {
	if userId <= 0 {
		return false, errors.New("invalid userId")
	}
	now := common.GetTimestamp()
	var count int64
	if err := DB.Model(&UserSubscription{}).
		Where("user_id = ? AND status = ? AND end_time > ?", userId, "active", now).
		Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

// GetAllUserSubscriptions returns all subscriptions (active and expired) for a user.
func GetAllUserSubscriptions(userId int) ([]SubscriptionSummary, error) {
	if userId <= 0 {
		return nil, errors.New("invalid userId")
	}
	var subs []UserSubscription
	err := DB.Where("user_id = ?", userId).
		Order("end_time desc, id desc").
		Find(&subs).Error
	if err != nil {
		return nil, err
	}
	return buildSubscriptionSummaries(subs), nil
}

func GetUserSubscriptionById(userSubscriptionId int) (*UserSubscription, error) {
	if userSubscriptionId <= 0 {
		return nil, errors.New("invalid userSubscriptionId")
	}
	var sub UserSubscription
	if err := DB.Where("id = ?", userSubscriptionId).First(&sub).Error; err != nil {
		return nil, err
	}
	return &sub, nil
}

func buildSubscriptionSummaries(subs []UserSubscription) []SubscriptionSummary {
	if len(subs) == 0 {
		return []SubscriptionSummary{}
	}
	result := make([]SubscriptionSummary, 0, len(subs))
	for _, sub := range subs {
		subCopy := sub
		result = append(result, SubscriptionSummary{
			Subscription: &subCopy,
		})
	}
	return result
}

type adminUserSubscriptionListRow struct {
	UserSubscription
	Username  string `gorm:"column:username"`
	UserGroup string `gorm:"column:user_group"`
}

func GetAdminUserSubscriptions(pageInfo *common.PageInfo, username string, userGroup string, status string) ([]AdminUserSubscriptionSummary, int64, error) {
	if pageInfo == nil {
		pageInfo = &common.PageInfo{Page: 1, PageSize: common.ItemsPerPage}
	}
	username = strings.TrimSpace(username)
	userGroup = strings.TrimSpace(userGroup)
	status = strings.TrimSpace(status)
	now := common.GetTimestamp()

	baseQuery := DB.Table("user_subscriptions").
		Select("user_subscriptions.*, users.username as username, users." + commonGroupCol + " as user_group").
		Joins("left join users on users.id = user_subscriptions.user_id")

	if username != "" {
		if keywordInt, err := strconv.Atoi(username); err == nil {
			baseQuery = baseQuery.Where("users.id = ? OR users.username LIKE ?", keywordInt, "%"+username+"%")
		} else {
			baseQuery = baseQuery.Where("users.username LIKE ?", "%"+username+"%")
		}
	}
	if userGroup != "" {
		baseQuery = baseQuery.Where("users."+commonGroupCol+" = ?", userGroup)
	}
	switch status {
	case "active":
		baseQuery = baseQuery.Where("user_subscriptions.status = ? AND user_subscriptions.end_time > ?", "active", now)
	case "expired":
		baseQuery = baseQuery.Where("(user_subscriptions.status = ? OR (user_subscriptions.status = ? AND user_subscriptions.end_time <= ?))", "expired", "active", now)
	case "cancelled":
		baseQuery = baseQuery.Where("user_subscriptions.status = ?", "cancelled")
	}

	var total int64
	if err := baseQuery.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var rows []adminUserSubscriptionListRow
	if err := baseQuery.
		Order("user_subscriptions.id desc").
		Limit(pageInfo.GetPageSize()).
		Offset(pageInfo.GetStartIdx()).
		Find(&rows).Error; err != nil {
		return nil, 0, err
	}

	items := make([]AdminUserSubscriptionSummary, 0, len(rows))
	for _, row := range rows {
		subCopy := row.UserSubscription
		items = append(items, AdminUserSubscriptionSummary{
			Subscription: &subCopy,
			Username:     row.Username,
			UserGroup:    row.UserGroup,
		})
	}
	return items, total, nil
}

func normalizeSubscriptionMigrationFilter(filter SubscriptionMigrationFilter) SubscriptionMigrationFilter {
	filter.TargetPlanId = max(filter.TargetPlanId, 0)
	filter.UserGroup = strings.TrimSpace(filter.UserGroup)
	filter.SourceGroup = strings.TrimSpace(filter.SourceGroup)
	filter.SourceResourceType = NormalizeSubscriptionResourceType(filter.SourceResourceType)
	filter.ExcludeDurationUnit = strings.TrimSpace(filter.ExcludeDurationUnit)
	if filter.SourceResourceType == "" {
		filter.SourceResourceType = SubscriptionResourceQuota
	}
	return filter
}

func subscriptionMatchesMigrationFilter(sub *UserSubscription, user *User, oldPlan *SubscriptionPlan, filter SubscriptionMigrationFilter) bool {
	if sub == nil || user == nil || oldPlan == nil {
		return false
	}
	if sub.Status != "active" {
		return false
	}
	now := common.GetTimestamp()
	if sub.EndTime <= now {
		return false
	}
	if filter.UserGroup != "" && strings.TrimSpace(user.Group) != filter.UserGroup {
		return false
	}
	if filter.SourceGroup != "" && strings.TrimSpace(sub.UpgradeGroup) != filter.SourceGroup {
		return false
	}
	if filter.SourceResourceType != "" && NormalizeSubscriptionResourceType(sub.ResourceType) != filter.SourceResourceType {
		return false
	}
	if filter.ExcludeDurationUnit != "" && strings.TrimSpace(oldPlan.DurationUnit) == filter.ExcludeDurationUnit {
		return false
	}
	if len(filter.SourcePlanIds) > 0 {
		matched := false
		for _, planId := range filter.SourcePlanIds {
			if planId == sub.PlanId {
				matched = true
				break
			}
		}
		if !matched {
			return false
		}
	}
	return true
}

func ListSubscriptionMigrationCandidates(filter SubscriptionMigrationFilter) ([]SubscriptionMigrationPreviewItem, *SubscriptionPlan, error) {
	filter = normalizeSubscriptionMigrationFilter(filter)
	if filter.TargetPlanId <= 0 {
		return nil, nil, errors.New("invalid target plan id")
	}
	targetPlan, err := GetSubscriptionPlanById(filter.TargetPlanId)
	if err != nil {
		return nil, nil, err
	}
	targetResourceType := NormalizeSubscriptionResourceType(targetPlan.ResourceType)
	if filter.SourceResourceType != "" && targetResourceType != filter.SourceResourceType {
		return nil, nil, fmt.Errorf("target plan resource type mismatch: target=%s source=%s", targetResourceType, filter.SourceResourceType)
	}
	now := common.GetTimestamp()
	var subs []UserSubscription
	query := DB.Where("status = ? AND end_time > ?", "active", now)
	if filter.SourceGroup != "" {
		query = query.Where("upgrade_group = ?", filter.SourceGroup)
	}
	if filter.SourceResourceType != "" {
		query = query.Where("resource_type = ?", filter.SourceResourceType)
	}
	if len(filter.SourcePlanIds) > 0 {
		query = query.Where("plan_id IN ?", filter.SourcePlanIds)
	}
	if err := query.Order("end_time asc, id asc").Find(&subs).Error; err != nil {
		return nil, nil, err
	}
	items := make([]SubscriptionMigrationPreviewItem, 0, len(subs))
	for _, sub := range subs {
		user, err := GetUserById(sub.UserId, false)
		if err != nil || user == nil {
			return nil, nil, err
		}
		oldPlan, err := GetSubscriptionPlanById(sub.PlanId)
		if err != nil {
			return nil, nil, err
		}
		if !subscriptionMatchesMigrationFilter(&sub, user, oldPlan, filter) {
			continue
		}
		item := SubscriptionMigrationPreviewItem{
			UserSubscriptionId:   sub.Id,
			UserId:               sub.UserId,
			Username:             user.Username,
			UserGroup:            user.Group,
			OldPlanId:            sub.PlanId,
			OldPlanTitle:         oldPlan.Title,
			OldDurationUnit:      oldPlan.DurationUnit,
			OldResourceType:      NormalizeSubscriptionResourceType(sub.ResourceType),
			OldUpgradeGroup:      strings.TrimSpace(sub.UpgradeGroup),
			OldStartTime:         sub.StartTime,
			OldEndTime:           sub.EndTime,
			OldAmountTotal:       sub.AmountTotal,
			OldAmountUsed:        sub.AmountUsed,
			OldRequestCountTotal: sub.RequestCountTotal,
			OldRequestCountUsed:  sub.RequestCountUsed,
			TargetPlanId:         targetPlan.Id,
			TargetPlanTitle:      targetPlan.Title,
			TargetResourceType:   NormalizeSubscriptionResourceType(targetPlan.ResourceType),
			TargetUpgradeGroup:   strings.TrimSpace(targetPlan.UpgradeGroup),
			TargetPlan:           targetPlan,
		}
		items = append(items, item)
	}
	return items, targetPlan, nil
}

func alignMigratedSubscriptionResetWindow(sub *UserSubscription, plan *SubscriptionPlan, now int64) (int64, int64) {
	if sub == nil || plan == nil {
		return 0, 0
	}
	period := NormalizeResetPeriod(plan.QuotaResetPeriod)
	if period == SubscriptionResetNever {
		return 0, 0
	}
	baseUnix := sub.LastResetTime
	if baseUnix <= 0 {
		baseUnix = sub.StartTime
	}
	base := time.Unix(baseUnix, 0)
	snapshotPlan := &SubscriptionPlan{
		QuotaResetPeriod:        period,
		QuotaResetCustomSeconds: plan.QuotaResetCustomSeconds,
	}
	next := calcNextResetTime(base, snapshotPlan, sub.EndTime)
	for next > 0 && next <= now {
		base = time.Unix(next, 0)
		next = calcNextResetTime(base, snapshotPlan, sub.EndTime)
	}
	return base.Unix(), next
}

func preserveQuotaSubscriptionEntitlement(source *UserSubscription, targetPlan *SubscriptionPlan) (int64, int64) {
	if source == nil || targetPlan == nil {
		return 0, 0
	}
	if source.AmountTotal <= 0 || targetPlan.TotalAmount <= 0 {
		return targetPlan.TotalAmount, 0
	}
	remaining := source.AmountTotal - source.AmountUsed
	if remaining < 0 {
		remaining = 0
	}
	total := targetPlan.TotalAmount
	if total < remaining {
		total = remaining
	}
	used := total - remaining
	if used < 0 {
		used = 0
	}
	return total, used
}

func preserveRequestCountSubscriptionEntitlement(source *UserSubscription, targetPlan *SubscriptionPlan) (int64, int64) {
	if source == nil || targetPlan == nil {
		return 0, 0
	}
	if source.RequestCountTotal <= 0 || targetPlan.RequestCountTotal <= 0 {
		return targetPlan.RequestCountTotal, 0
	}
	remaining := source.RequestCountTotal - source.RequestCountUsed
	if remaining < 0 {
		remaining = 0
	}
	total := targetPlan.RequestCountTotal
	if total < remaining {
		total = remaining
	}
	used := total - remaining
	if used < 0 {
		used = 0
	}
	return total, used
}

func createMigratedUserSubscriptionTx(tx *gorm.DB, source *UserSubscription, targetPlan *SubscriptionPlan, now int64) (*UserSubscription, string, error) {
	if tx == nil || source == nil || targetPlan == nil {
		return nil, "", errors.New("invalid migration args")
	}
	sourceResourceType := NormalizeSubscriptionResourceType(source.ResourceType)
	targetResourceType := NormalizeSubscriptionResourceType(targetPlan.ResourceType)
	if sourceResourceType != targetResourceType {
		return nil, "", fmt.Errorf("resource type mismatch: source=%s target=%s", sourceResourceType, targetResourceType)
	}
	targetGroup := strings.TrimSpace(targetPlan.UpgradeGroup)
	sourceGroup := strings.TrimSpace(source.UpgradeGroup)
	if targetGroup != "" && sourceGroup != "" && targetGroup != sourceGroup {
		return nil, "", fmt.Errorf("target plan group mismatch: target=%s source=%s", targetGroup, sourceGroup)
	}
	if targetGroup == "" {
		targetGroup = sourceGroup
	}
	prevGroup := strings.TrimSpace(source.PrevUserGroup)
	finalGroup := ""
	if targetGroup != "" {
		currentGroup, err := getUserGroupByIdTx(tx, source.UserId)
		if err != nil {
			return nil, "", err
		}
		if currentGroup != targetGroup {
			if prevGroup == "" {
				prevGroup = currentGroup
			}
			if err := tx.Model(&User{}).Where("id = ?", source.UserId).
				Update("group", targetGroup).Error; err != nil {
				return nil, "", err
			}
			finalGroup = targetGroup
		} else {
			finalGroup = currentGroup
		}
	}
	lastReset, nextReset := alignMigratedSubscriptionResetWindow(source, targetPlan, now)
	amountTotal := targetPlan.TotalAmount
	amountUsed := int64(0)
	requestCountTotal := targetPlan.RequestCountTotal
	requestCountUsed := int64(0)
	if targetResourceType == SubscriptionResourceRequestCount {
		requestCountTotal, requestCountUsed = preserveRequestCountSubscriptionEntitlement(source, targetPlan)
		amountTotal = 0
	} else {
		amountTotal, amountUsed = preserveQuotaSubscriptionEntitlement(source, targetPlan)
		requestCountTotal = 0
	}
	newSub := &UserSubscription{
		UserId:             source.UserId,
		PlanId:             targetPlan.Id,
		AmountTotal:        amountTotal,
		AmountUsed:         amountUsed,
		ResourceType:       targetResourceType,
		RequestCountTotal:  requestCountTotal,
		RequestCountUsed:   requestCountUsed,
		ResetPeriod:        NormalizeResetPeriod(targetPlan.QuotaResetPeriod),
		ResetCustomSeconds: targetPlan.QuotaResetCustomSeconds,
		DurationUnit:       targetPlan.DurationUnit,
		DurationValue:      targetPlan.DurationValue,
		CustomSeconds:      targetPlan.CustomSeconds,
		StartTime:          source.StartTime,
		EndTime:            source.EndTime,
		Status:             "active",
		Source:             "migration",
		LastResetTime:      lastReset,
		NextResetTime:      nextReset,
		UpgradeGroup:       targetGroup,
		PrevUserGroup:      prevGroup,
		CreatedAt:          common.GetTimestamp(),
		UpdatedAt:          common.GetTimestamp(),
	}
	if err := tx.Create(newSub).Error; err != nil {
		return nil, "", err
	}
	if finalGroup == "" {
		currentGroup, err := getUserGroupByIdTx(tx, source.UserId)
		if err != nil {
			return nil, "", err
		}
		finalGroup = currentGroup
	}
	return newSub, finalGroup, nil
}

func ExecuteSubscriptionMigration(filter SubscriptionMigrationFilter) (*SubscriptionMigrationExecutionResult, error) {
	items, targetPlan, err := ListSubscriptionMigrationCandidates(filter)
	if err != nil {
		return nil, err
	}
	result := &SubscriptionMigrationExecutionResult{
		TargetPlanId: targetPlan.Id,
		Total:        len(items),
		Items:        make([]SubscriptionMigrationExecutionItem, 0, len(items)),
	}
	for _, item := range items {
		execItem := SubscriptionMigrationExecutionItem{
			UserSubscriptionId: item.UserSubscriptionId,
			UserId:             item.UserId,
			Username:           item.Username,
			Status:             "failed",
		}
		cacheGroup := ""
		err := DB.Transaction(func(tx *gorm.DB) error {
			var source UserSubscription
			if err := tx.Set("gorm:query_option", "FOR UPDATE").
				Where("id = ?", item.UserSubscriptionId).
				First(&source).Error; err != nil {
				return err
			}
			if source.Status != "active" || source.EndTime <= common.GetTimestamp() {
				return errors.New("subscription is no longer active")
			}
			newSub, newGroup, err := createMigratedUserSubscriptionTx(tx, &source, targetPlan, GetDBTimestamp())
			if err != nil {
				return err
			}
			if err := tx.Where("id = ?", source.Id).Delete(&UserSubscription{}).Error; err != nil {
				return err
			}
			execItem.NewUserSubscriptionId = newSub.Id
			cacheGroup = newGroup
			return nil
		})
		if err != nil {
			execItem.Message = err.Error()
			result.Failed++
			result.Items = append(result.Items, execItem)
			continue
		}
		if cacheGroup != "" {
			_ = UpdateUserGroupCache(execItem.UserId, cacheGroup)
		}
		execItem.Status = "migrated"
		execItem.Message = "ok"
		result.Migrated++
		result.Items = append(result.Items, execItem)
	}
	return result, nil
}

// AdminInvalidateUserSubscription marks a user subscription as cancelled and ends it immediately.
func AdminInvalidateUserSubscription(userSubscriptionId int) (string, error) {
	if userSubscriptionId <= 0 {
		return "", errors.New("invalid userSubscriptionId")
	}
	now := common.GetTimestamp()
	cacheGroup := ""
	downgradeGroup := ""
	var userId int
	err := DB.Transaction(func(tx *gorm.DB) error {
		var sub UserSubscription
		if err := tx.Set("gorm:query_option", "FOR UPDATE").
			Where("id = ?", userSubscriptionId).First(&sub).Error; err != nil {
			return err
		}
		userId = sub.UserId
		if err := tx.Model(&sub).Updates(map[string]interface{}{
			"status":     "cancelled",
			"end_time":   now,
			"updated_at": now,
		}).Error; err != nil {
			return err
		}
		target, err := downgradeUserGroupForSubscriptionTx(tx, &sub, now)
		if err != nil {
			return err
		}
		if target != "" {
			cacheGroup = target
			downgradeGroup = target
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	if cacheGroup != "" && userId > 0 {
		_ = UpdateUserGroupCache(userId, cacheGroup)
	}
	if downgradeGroup != "" {
		return fmt.Sprintf("用户分组将回退到 %s", downgradeGroup), nil
	}
	return "", nil
}

// AdminDeleteUserSubscription hard-deletes a user subscription.
func AdminDeleteUserSubscription(userSubscriptionId int) (string, error) {
	if userSubscriptionId <= 0 {
		return "", errors.New("invalid userSubscriptionId")
	}
	now := common.GetTimestamp()
	cacheGroup := ""
	downgradeGroup := ""
	var userId int
	err := DB.Transaction(func(tx *gorm.DB) error {
		var sub UserSubscription
		if err := tx.Set("gorm:query_option", "FOR UPDATE").
			Where("id = ?", userSubscriptionId).First(&sub).Error; err != nil {
			return err
		}
		userId = sub.UserId
		target, err := downgradeUserGroupForSubscriptionTx(tx, &sub, now)
		if err != nil {
			return err
		}
		if target != "" {
			cacheGroup = target
			downgradeGroup = target
		}
		if err := tx.Where("id = ?", userSubscriptionId).Delete(&UserSubscription{}).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	if cacheGroup != "" && userId > 0 {
		_ = UpdateUserGroupCache(userId, cacheGroup)
	}
	if downgradeGroup != "" {
		return fmt.Sprintf("用户分组将回退到 %s", downgradeGroup), nil
	}
	return "", nil
}

const (
	AdminSubscriptionActionExtendPeriod = "extend_period"
	AdminSubscriptionActionReducePeriod = "reduce_period"
	AdminSubscriptionActionExtendDays   = "extend_days"
	AdminSubscriptionActionReduceDays   = "reduce_days"
	AdminSubscriptionActionResetUsage   = "reset_usage_now"
)

func NormalizeAdminSubscriptionAction(action string) string {
	switch strings.TrimSpace(action) {
	case AdminSubscriptionActionExtendPeriod:
		return AdminSubscriptionActionExtendPeriod
	case AdminSubscriptionActionReducePeriod:
		return AdminSubscriptionActionReducePeriod
	case AdminSubscriptionActionExtendDays:
		return AdminSubscriptionActionExtendPeriod
	case AdminSubscriptionActionReduceDays:
		return AdminSubscriptionActionReducePeriod
	case AdminSubscriptionActionResetUsage:
		return AdminSubscriptionActionResetUsage
	default:
		return ""
	}
}

func normalizePlanDurationForAdmin(plan *SubscriptionPlan) *SubscriptionPlan {
	if plan == nil {
		return nil
	}
	copied := *plan
	if copied.DurationUnit == "" {
		copied.DurationUnit = SubscriptionDurationMonth
	}
	if copied.DurationValue <= 0 && copied.DurationUnit != SubscriptionDurationCustom {
		copied.DurationValue = 1
	}
	if copied.DurationUnit == SubscriptionDurationCustom && copied.CustomSeconds <= 0 {
		copied.CustomSeconds = 86400
	}
	return &copied
}

func subscriptionDurationSnapshotToPlan(sub *UserSubscription) *SubscriptionPlan {
	if sub == nil {
		return nil
	}
	return &SubscriptionPlan{
		DurationUnit:  sub.DurationUnit,
		DurationValue: sub.DurationValue,
		CustomSeconds: sub.CustomSeconds,
	}
}

func effectiveSubscriptionDurationPlan(sub *UserSubscription, fallbackPlan *SubscriptionPlan) *SubscriptionPlan {
	if sub == nil {
		return normalizePlanDurationForAdmin(fallbackPlan)
	}
	snapshot := normalizePlanDurationForAdmin(subscriptionDurationSnapshotToPlan(sub))
	if snapshot != nil && strings.TrimSpace(snapshot.DurationUnit) != "" {
		if snapshot.DurationUnit != SubscriptionDurationCustom || snapshot.CustomSeconds > 0 {
			return snapshot
		}
	}
	return normalizePlanDurationForAdmin(fallbackPlan)
}

func applyPlanDurationToUnix(baseUnix int64, plan *SubscriptionPlan, direction int, multiplier int64) (int64, error) {
	plan = normalizePlanDurationForAdmin(plan)
	if plan == nil {
		return 0, errors.New("plan is nil")
	}
	if multiplier <= 0 {
		multiplier = 1
	}
	base := time.Unix(baseUnix, 0)
	step := int(multiplier)
	switch plan.DurationUnit {
	case SubscriptionDurationYear:
		return base.AddDate(direction*plan.DurationValue*step, 0, 0).Unix(), nil
	case SubscriptionDurationMonth:
		return base.AddDate(0, direction*plan.DurationValue*step, 0).Unix(), nil
	case SubscriptionDurationWeek:
		return base.AddDate(0, 0, direction*7*plan.DurationValue*step).Unix(), nil
	case SubscriptionDurationDay:
		return base.Add(time.Duration(direction*plan.DurationValue*step) * 24 * time.Hour).Unix(), nil
	case SubscriptionDurationHour:
		return base.Add(time.Duration(direction*plan.DurationValue*step) * time.Hour).Unix(), nil
	case SubscriptionDurationCustom:
		return base.Add(time.Duration(direction) * time.Duration(multiplier) * time.Duration(plan.CustomSeconds) * time.Second).Unix(), nil
	default:
		return 0, fmt.Errorf("invalid duration_unit: %s", plan.DurationUnit)
	}
}

func formatPlanDurationLabel(plan *SubscriptionPlan) string {
	plan = normalizePlanDurationForAdmin(plan)
	if plan == nil {
		return "1个月"
	}
	switch plan.DurationUnit {
	case SubscriptionDurationYear:
		return fmt.Sprintf("%d年", plan.DurationValue)
	case SubscriptionDurationMonth:
		return fmt.Sprintf("%d个月", plan.DurationValue)
	case SubscriptionDurationWeek:
		return fmt.Sprintf("%d周", plan.DurationValue)
	case SubscriptionDurationDay:
		return fmt.Sprintf("%d天", plan.DurationValue)
	case SubscriptionDurationHour:
		return fmt.Sprintf("%d小时", plan.DurationValue)
	case SubscriptionDurationCustom:
		if plan.CustomSeconds%86400 == 0 {
			return fmt.Sprintf("%d天", plan.CustomSeconds/86400)
		}
		if plan.CustomSeconds%3600 == 0 {
			return fmt.Sprintf("%d小时", plan.CustomSeconds/3600)
		}
		if plan.CustomSeconds%60 == 0 {
			return fmt.Sprintf("%d分钟", plan.CustomSeconds/60)
		}
		return fmt.Sprintf("%d秒", plan.CustomSeconds)
	default:
		return "1个月"
	}
}

func calcSubscriptionNextResetFromNow(sub *UserSubscription, now int64) int64 {
	if sub == nil {
		return 0
	}
	snapshotPlan := &SubscriptionPlan{
		QuotaResetPeriod:        NormalizeResetPeriod(sub.ResetPeriod),
		QuotaResetCustomSeconds: sub.ResetCustomSeconds,
	}
	if snapshotPlan.QuotaResetPeriod == SubscriptionResetNever {
		return 0
	}
	return calcNextResetTime(time.Unix(now, 0), snapshotPlan, sub.EndTime)
}

func AdminOperateUserSubscription(userSubscriptionId int, action string, value int64) (string, error) {
	if userSubscriptionId <= 0 {
		return "", errors.New("invalid userSubscriptionId")
	}
	action = NormalizeAdminSubscriptionAction(action)
	if action == "" {
		return "", errors.New("invalid subscription action")
	}
	if action != AdminSubscriptionActionResetUsage && value <= 0 {
		value = 1
	}
	now := GetDBTimestamp()
	message := ""
	err := DB.Transaction(func(tx *gorm.DB) error {
		var sub UserSubscription
		if err := tx.Set("gorm:query_option", "FOR UPDATE").
			Where("id = ?", userSubscriptionId).
			First(&sub).Error; err != nil {
			return err
		}
		if sub.Status == "cancelled" {
			return errors.New("subscription has been cancelled")
		}
		plan, err := getSubscriptionPlanByIdTx(tx, sub.PlanId)
		if err != nil {
			return err
		}
		durationPlan := effectiveSubscriptionDurationPlan(&sub, plan)
		durationLabel := formatPlanDurationLabel(durationPlan)
		switch action {
		case AdminSubscriptionActionExtendPeriod:
			nextEndTime, err := applyPlanDurationToUnix(sub.EndTime, durationPlan, 1, value)
			if err != nil {
				return err
			}
			sub.EndTime = nextEndTime
			if sub.EndTime > now {
				sub.Status = "active"
			}
			if value > 1 {
				message = fmt.Sprintf("已延长 %d 个周期（%s/周期）", value, durationLabel)
			} else {
				message = fmt.Sprintf("已延长 %s", durationLabel)
			}
		case AdminSubscriptionActionReducePeriod:
			nextEndTime, err := applyPlanDurationToUnix(sub.EndTime, durationPlan, -1, value)
			if err != nil {
				return err
			}
			if nextEndTime <= sub.StartTime {
				return errors.New("end time must be later than start time")
			}
			sub.EndTime = nextEndTime
			if sub.EndTime <= now {
				sub.Status = "expired"
			} else {
				sub.Status = "active"
			}
			if sub.NextResetTime > sub.EndTime {
				sub.NextResetTime = 0
			}
			if value > 1 {
				message = fmt.Sprintf("已减少 %d 个周期（%s/周期）", value, durationLabel)
			} else {
				message = fmt.Sprintf("已减少 %s", durationLabel)
			}
		case AdminSubscriptionActionResetUsage:
			if sub.Status != "active" || sub.EndTime <= now {
				return errors.New("subscription is not active")
			}
			sub.AmountUsed = 0
			sub.RequestCountUsed = 0
			if NormalizeResetPeriod(sub.ResetPeriod) == SubscriptionResetNever {
				sub.LastResetTime = 0
				sub.NextResetTime = 0
			} else {
				sub.LastResetTime = now
				sub.NextResetTime = calcSubscriptionNextResetFromNow(&sub, now)
			}
			message = "已提前重置当前周期用量"
		}
		return tx.Save(&sub).Error
	})
	if err != nil {
		return "", err
	}
	return message, nil
}

type SubscriptionPreConsumeResult struct {
	UserSubscriptionId int
	PreConsumed        int64
	AmountTotal        int64
	AmountUsedBefore   int64
	AmountUsedAfter    int64
	ResourceType       string
	RequestCountTotal  int64
	RequestCountBefore int64
	RequestCountAfter  int64
}

// ExpireDueSubscriptions marks expired subscriptions and handles group downgrade.
func ExpireDueSubscriptions(limit int) (int, error) {
	if limit <= 0 {
		limit = 200
	}
	now := GetDBTimestamp()
	var subs []UserSubscription
	if err := DB.Where("status = ? AND end_time > 0 AND end_time <= ?", "active", now).
		Order("end_time asc, id asc").
		Limit(limit).
		Find(&subs).Error; err != nil {
		return 0, err
	}
	if len(subs) == 0 {
		return 0, nil
	}
	expiredCount := 0
	userIds := make(map[int]struct{}, len(subs))
	for _, sub := range subs {
		if sub.UserId > 0 {
			userIds[sub.UserId] = struct{}{}
		}
	}
	for userId := range userIds {
		cacheGroup := ""
		err := DB.Transaction(func(tx *gorm.DB) error {
			res := tx.Model(&UserSubscription{}).
				Where("user_id = ? AND status = ? AND end_time > 0 AND end_time <= ?", userId, "active", now).
				Updates(map[string]interface{}{
					"status":     "expired",
					"updated_at": common.GetTimestamp(),
				})
			if res.Error != nil {
				return res.Error
			}
			expiredCount += int(res.RowsAffected)

			// If there's an active upgraded subscription, keep current group.
			var activeSub UserSubscription
			activeQuery := tx.Where("user_id = ? AND status = ? AND end_time > ? AND upgrade_group <> ''",
				userId, "active", now).
				Order("end_time desc, id desc").
				Limit(1).
				Find(&activeSub)
			if activeQuery.Error == nil && activeQuery.RowsAffected > 0 {
				return nil
			}

			// No active upgraded subscription, downgrade to previous group if needed.
			var lastExpired UserSubscription
			expiredQuery := tx.Where("user_id = ? AND status = ? AND upgrade_group <> ''",
				userId, "expired").
				Order("end_time desc, id desc").
				Limit(1).
				Find(&lastExpired)
			if expiredQuery.Error != nil || expiredQuery.RowsAffected == 0 {
				return nil
			}
			upgradeGroup := strings.TrimSpace(lastExpired.UpgradeGroup)
			prevGroup := strings.TrimSpace(lastExpired.PrevUserGroup)
			if upgradeGroup == "" || prevGroup == "" {
				return nil
			}
			currentGroup, err := getUserGroupByIdTx(tx, userId)
			if err != nil {
				return err
			}
			if currentGroup != upgradeGroup || currentGroup == prevGroup {
				return nil
			}
			if err := tx.Model(&User{}).Where("id = ?", userId).
				Update("group", prevGroup).Error; err != nil {
				return err
			}
			cacheGroup = prevGroup
			return nil
		})
		if err != nil {
			return expiredCount, err
		}
		if cacheGroup != "" {
			_ = UpdateUserGroupCache(userId, cacheGroup)
		}
	}
	return expiredCount, nil
}

// SubscriptionPreConsumeRecord stores idempotent pre-consume operations per request.
type SubscriptionPreConsumeRecord struct {
	Id                 int    `json:"id"`
	RequestId          string `json:"request_id" gorm:"type:varchar(64);uniqueIndex"`
	UserId             int    `json:"user_id" gorm:"index"`
	UserSubscriptionId int    `json:"user_subscription_id" gorm:"index"`
	PreConsumed        int64  `json:"pre_consumed" gorm:"type:bigint;not null;default:0"`
	Status             string `json:"status" gorm:"type:varchar(32);index"` // consumed/refunded
	CreatedAt          int64  `json:"created_at" gorm:"bigint"`
	UpdatedAt          int64  `json:"updated_at" gorm:"bigint;index"`
}

func (r *SubscriptionPreConsumeRecord) BeforeCreate(tx *gorm.DB) error {
	now := common.GetTimestamp()
	r.CreatedAt = now
	r.UpdatedAt = now
	return nil
}

func (r *SubscriptionPreConsumeRecord) BeforeUpdate(tx *gorm.DB) error {
	r.UpdatedAt = common.GetTimestamp()
	return nil
}

func maybeResetUserSubscriptionWithPlanTx(tx *gorm.DB, sub *UserSubscription, _ *SubscriptionPlan, now int64) error {
	if tx == nil || sub == nil {
		return errors.New("invalid reset args")
	}
	if sub.NextResetTime > 0 && sub.NextResetTime > now {
		return nil
	}
	snapshotPlan := &SubscriptionPlan{
		QuotaResetPeriod:        NormalizeResetPeriod(sub.ResetPeriod),
		QuotaResetCustomSeconds: sub.ResetCustomSeconds,
	}
	if snapshotPlan.QuotaResetPeriod == SubscriptionResetNever {
		return nil
	}
	baseUnix := sub.LastResetTime
	if baseUnix <= 0 {
		baseUnix = sub.StartTime
	}
	base := time.Unix(baseUnix, 0)
	next := calcNextResetTime(base, snapshotPlan, sub.EndTime)
	advanced := false
	for next > 0 && next <= now {
		advanced = true
		base = time.Unix(next, 0)
		next = calcNextResetTime(base, snapshotPlan, sub.EndTime)
	}
	if !advanced {
		if sub.NextResetTime == 0 && next > 0 {
			sub.NextResetTime = next
			sub.LastResetTime = base.Unix()
			return tx.Save(sub).Error
		}
		return nil
	}
	sub.AmountUsed = 0
	sub.RequestCountUsed = 0
	sub.LastResetTime = base.Unix()
	sub.NextResetTime = next
	return tx.Save(sub).Error
}

func isUserSubscriptionEligibleForPreConsume(sub *UserSubscription, amount int64) (bool, int64, string) {
	if sub == nil {
		return false, 0, SubscriptionResourceQuota
	}
	resourceType := NormalizeSubscriptionResourceType(sub.ResourceType)
	required := amount
	if resourceType == SubscriptionResourceRequestCount {
		required = 1
		if sub.RequestCountTotal > 0 {
			remain := sub.RequestCountTotal - sub.RequestCountUsed
			if remain < required {
				return false, required, resourceType
			}
		}
		return true, required, resourceType
	}
	if sub.AmountTotal > 0 {
		remain := sub.AmountTotal - sub.AmountUsed
		if remain < required {
			return false, required, resourceType
		}
	}
	return true, required, resourceType
}

func doesUserSubscriptionMatchGroup(sub *UserSubscription, usingGroup string) bool {
	if sub == nil {
		return false
	}
	subGroup := strings.TrimSpace(sub.UpgradeGroup)
	usingGroup = strings.TrimSpace(usingGroup)
	if subGroup == "" || usingGroup == "" {
		return true
	}
	return subGroup == usingGroup
}

func applyUserSubscriptionPreConsumeTx(tx *gorm.DB, requestId string, userId int, sub *UserSubscription, required int64, resourceType string, returnValue *SubscriptionPreConsumeResult) error {
	if tx == nil || sub == nil || returnValue == nil {
		return errors.New("invalid pre-consume args")
	}
	usedBefore := sub.AmountUsed
	requestCountBefore := sub.RequestCountUsed
	record := &SubscriptionPreConsumeRecord{
		RequestId:          requestId,
		UserId:             userId,
		UserSubscriptionId: sub.Id,
		PreConsumed:        required,
		Status:             "consumed",
	}
	if err := tx.Create(record).Error; err != nil {
		var dup SubscriptionPreConsumeRecord
		if err2 := tx.Where("request_id = ?", requestId).First(&dup).Error; err2 == nil {
			if dup.Status == "refunded" {
				return errors.New("subscription pre-consume already refunded")
			}
			returnValue.UserSubscriptionId = sub.Id
			returnValue.PreConsumed = dup.PreConsumed
			returnValue.AmountTotal = sub.AmountTotal
			returnValue.AmountUsedBefore = sub.AmountUsed
			returnValue.AmountUsedAfter = sub.AmountUsed
			returnValue.ResourceType = resourceType
			returnValue.RequestCountTotal = sub.RequestCountTotal
			returnValue.RequestCountBefore = sub.RequestCountUsed
			returnValue.RequestCountAfter = sub.RequestCountUsed
			return nil
		}
		return err
	}
	if resourceType == SubscriptionResourceRequestCount {
		sub.RequestCountUsed += required
	} else {
		sub.AmountUsed += required
	}
	if err := tx.Save(sub).Error; err != nil {
		return err
	}
	returnValue.UserSubscriptionId = sub.Id
	returnValue.PreConsumed = required
	returnValue.AmountTotal = sub.AmountTotal
	returnValue.AmountUsedBefore = usedBefore
	returnValue.AmountUsedAfter = sub.AmountUsed
	returnValue.ResourceType = resourceType
	returnValue.RequestCountTotal = sub.RequestCountTotal
	returnValue.RequestCountBefore = requestCountBefore
	returnValue.RequestCountAfter = sub.RequestCountUsed
	return nil
}

// PreConsumeUserSubscription pre-consumes from any active subscription total quota.
func PreConsumeUserSubscription(requestId string, userId int, modelName string, usingGroup string, quotaType int, amount int64) (*SubscriptionPreConsumeResult, error) {
	if userId <= 0 {
		return nil, errors.New("invalid userId")
	}
	if strings.TrimSpace(requestId) == "" {
		return nil, errors.New("requestId is empty")
	}
	if amount <= 0 {
		return nil, errors.New("amount must be > 0")
	}
	now := GetDBTimestamp()

	returnValue := &SubscriptionPreConsumeResult{}

	err := DB.Transaction(func(tx *gorm.DB) error {
		var existing SubscriptionPreConsumeRecord
		query := tx.Where("request_id = ?", requestId).Limit(1).Find(&existing)
		if query.Error != nil {
			return query.Error
		}
		if query.RowsAffected > 0 {
			if existing.Status == "refunded" {
				return errors.New("subscription pre-consume already refunded")
			}
			var sub UserSubscription
			if err := tx.Where("id = ?", existing.UserSubscriptionId).First(&sub).Error; err != nil {
				return err
			}
			returnValue.UserSubscriptionId = sub.Id
			returnValue.PreConsumed = existing.PreConsumed
			returnValue.AmountTotal = sub.AmountTotal
			returnValue.AmountUsedBefore = sub.AmountUsed
			returnValue.AmountUsedAfter = sub.AmountUsed
			returnValue.ResourceType = NormalizeSubscriptionResourceType(sub.ResourceType)
			returnValue.RequestCountTotal = sub.RequestCountTotal
			returnValue.RequestCountBefore = sub.RequestCountUsed
			returnValue.RequestCountAfter = sub.RequestCountUsed
			return nil
		}

		var subs []UserSubscription
		if err := tx.Set("gorm:query_option", "FOR UPDATE").
			Where("user_id = ? AND status = ? AND end_time > ?", userId, "active", now).
			Order("end_time asc, id asc").
			Find(&subs).Error; err != nil {
			return errors.New("no active subscription")
		}
		if len(subs) == 0 {
			return errors.New("no active subscription")
		}
		requestCountCandidates := make([]UserSubscription, 0, len(subs))
		quotaCandidates := make([]UserSubscription, 0, len(subs))
		for _, candidate := range subs {
			sub := candidate
			if !doesUserSubscriptionMatchGroup(&sub, usingGroup) {
				continue
			}
			plan, err := getSubscriptionPlanByIdTx(tx, sub.PlanId)
			if err != nil {
				return err
			}
			if err := maybeResetUserSubscriptionWithPlanTx(tx, &sub, plan, now); err != nil {
				return err
			}
			eligible, _, resourceType := isUserSubscriptionEligibleForPreConsume(&sub, amount)
			if !eligible {
				continue
			}
			if resourceType == SubscriptionResourceRequestCount {
				requestCountCandidates = append(requestCountCandidates, sub)
			} else {
				quotaCandidates = append(quotaCandidates, sub)
			}
		}
		if len(requestCountCandidates) > 0 {
			selected := requestCountCandidates[0]
			return applyUserSubscriptionPreConsumeTx(tx, requestId, userId, &selected, 1, SubscriptionResourceRequestCount, returnValue)
		}
		if len(quotaCandidates) > 0 {
			selected := quotaCandidates[0]
			return applyUserSubscriptionPreConsumeTx(tx, requestId, userId, &selected, amount, SubscriptionResourceQuota, returnValue)
		}
		return fmt.Errorf("subscription quota insufficient, need=%d", amount)
	})
	if err != nil {
		return nil, err
	}
	return returnValue, nil
}

// RefundSubscriptionPreConsume is idempotent and refunds pre-consumed subscription quota by requestId.
func RefundSubscriptionPreConsume(requestId string) error {
	if strings.TrimSpace(requestId) == "" {
		return errors.New("requestId is empty")
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var record SubscriptionPreConsumeRecord
		if err := tx.Set("gorm:query_option", "FOR UPDATE").
			Where("request_id = ?", requestId).First(&record).Error; err != nil {
			return err
		}
		if record.Status == "refunded" {
			return nil
		}
		if record.PreConsumed <= 0 {
			record.Status = "refunded"
			return tx.Save(&record).Error
		}
		if err := postConsumeUserSubscriptionDeltaTx(tx, record.UserSubscriptionId, -record.PreConsumed); err != nil {
			return err
		}
		record.Status = "refunded"
		return tx.Save(&record).Error
	})
}

// ResetDueSubscriptions resets subscriptions whose next_reset_time has passed.
func ResetDueSubscriptions(limit int) (int, error) {
	if limit <= 0 {
		limit = 200
	}
	now := GetDBTimestamp()
	var subs []UserSubscription
	if err := DB.Where("next_reset_time > 0 AND next_reset_time <= ? AND status = ?", now, "active").
		Order("next_reset_time asc").
		Limit(limit).
		Find(&subs).Error; err != nil {
		return 0, err
	}
	if len(subs) == 0 {
		return 0, nil
	}
	resetCount := 0
	for _, sub := range subs {
		subCopy := sub
		plan, err := getSubscriptionPlanByIdTx(nil, sub.PlanId)
		if err != nil || plan == nil {
			continue
		}
		err = DB.Transaction(func(tx *gorm.DB) error {
			var locked UserSubscription
			if err := tx.Set("gorm:query_option", "FOR UPDATE").
				Where("id = ? AND next_reset_time > 0 AND next_reset_time <= ?", subCopy.Id, now).
				First(&locked).Error; err != nil {
				return nil
			}
			if err := maybeResetUserSubscriptionWithPlanTx(tx, &locked, plan, now); err != nil {
				return err
			}
			resetCount++
			return nil
		})
		if err != nil {
			return resetCount, err
		}
	}
	return resetCount, nil
}

// CleanupSubscriptionPreConsumeRecords removes old idempotency records to keep table small.
func CleanupSubscriptionPreConsumeRecords(olderThanSeconds int64) (int64, error) {
	if olderThanSeconds <= 0 {
		olderThanSeconds = 7 * 24 * 3600
	}
	cutoff := GetDBTimestamp() - olderThanSeconds
	res := DB.Where("updated_at < ?", cutoff).Delete(&SubscriptionPreConsumeRecord{})
	return res.RowsAffected, res.Error
}

type SubscriptionPlanInfo struct {
	PlanId    int
	PlanTitle string
}

func GetSubscriptionPlanInfoByUserSubscriptionId(userSubscriptionId int) (*SubscriptionPlanInfo, error) {
	if userSubscriptionId <= 0 {
		return nil, errors.New("invalid userSubscriptionId")
	}
	cacheKey := fmt.Sprintf("sub:%d", userSubscriptionId)
	if cached, found, err := getSubscriptionPlanInfoCache().Get(cacheKey); err == nil && found {
		return &cached, nil
	}
	var sub UserSubscription
	if err := DB.Where("id = ?", userSubscriptionId).First(&sub).Error; err != nil {
		return nil, err
	}
	plan, err := getSubscriptionPlanByIdTx(nil, sub.PlanId)
	if err != nil {
		return nil, err
	}
	info := &SubscriptionPlanInfo{
		PlanId:    sub.PlanId,
		PlanTitle: plan.Title,
	}
	_ = getSubscriptionPlanInfoCache().SetWithTTL(cacheKey, *info, subscriptionPlanInfoCacheTTL())
	return info, nil
}

// Update subscription used amount by delta (positive consume more, negative refund).
func PostConsumeUserSubscriptionDelta(userSubscriptionId int, delta int64) error {
	if userSubscriptionId <= 0 {
		return errors.New("invalid userSubscriptionId")
	}
	if delta == 0 {
		return nil
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		return postConsumeUserSubscriptionDeltaTx(tx, userSubscriptionId, delta)
	})
}

func postConsumeUserSubscriptionDeltaTx(tx *gorm.DB, userSubscriptionId int, delta int64) error {
	if tx == nil {
		return errors.New("tx is nil")
	}
	if userSubscriptionId <= 0 {
		return errors.New("invalid userSubscriptionId")
	}
	if delta == 0 {
		return nil
	}
	var sub UserSubscription
	if err := tx.Set("gorm:query_option", "FOR UPDATE").
		Where("id = ?", userSubscriptionId).
		First(&sub).Error; err != nil {
		return err
	}
	resourceType := NormalizeSubscriptionResourceType(sub.ResourceType)
	if resourceType == SubscriptionResourceRequestCount {
		newUsed := sub.RequestCountUsed + delta
		if newUsed < 0 {
			newUsed = 0
		}
		if sub.RequestCountTotal > 0 && newUsed > sub.RequestCountTotal {
			return fmt.Errorf("subscription request count exceeds total, used=%d total=%d", newUsed, sub.RequestCountTotal)
		}
		sub.RequestCountUsed = newUsed
	} else {
		newUsed := sub.AmountUsed + delta
		if newUsed < 0 {
			newUsed = 0
		}
		if sub.AmountTotal > 0 && newUsed > sub.AmountTotal {
			return fmt.Errorf("subscription used exceeds total, used=%d total=%d", newUsed, sub.AmountTotal)
		}
		sub.AmountUsed = newUsed
	}
	return tx.Save(&sub).Error
}
