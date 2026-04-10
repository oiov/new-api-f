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
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/bytedance/gopkg/util/gopool"
	"github.com/samber/hot"
	"gorm.io/gorm"
)

var subscriptionResetLocation = loadSubscriptionResetLocation()

func loadSubscriptionResetLocation() *time.Location {
	tz := strings.TrimSpace(common.GetEnvOrDefaultString("SUBSCRIPTION_RESET_TIMEZONE", "Asia/Shanghai"))
	if tz == "" {
		tz = "Asia/Shanghai"
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		return time.FixedZone("UTC+8", 8*3600)
	}
	return loc
}

func subscriptionResetTime(t time.Time) time.Time {
	if subscriptionResetLocation == nil {
		return t
	}
	return t.In(subscriptionResetLocation)
}

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
	SubscriptionResetYearly  = "yearly"
	SubscriptionResetCustom  = "custom"
)

const (
	SubscriptionDeliveryModeAutoActivate   = "auto_activate"
	SubscriptionDeliveryModeManualDelivery = "manual_delivery"
)

const (
	SubscriptionFulfillmentNotRequired = "not_required"
	SubscriptionFulfillmentPending     = "pending_delivery"
	SubscriptionFulfillmentDelivered   = "delivered"
	SubscriptionFulfillmentRejected    = "rejected"
)

var (
	ErrSubscriptionOrderNotFound      = errors.New("subscription order not found")
	ErrSubscriptionOrderStatusInvalid = errors.New("subscription order status invalid")
)

type SubscriptionDeliveryField struct {
	Key          string `json:"key"`
	Label        string `json:"label"`
	Type         string `json:"type"`
	Required     bool   `json:"required"`
	Masked       bool   `json:"masked"`
	Copyable     bool   `json:"copyable"`
	SortOrder    int    `json:"sort_order"`
	Placeholder  string `json:"placeholder"`
	DefaultValue string `json:"default_value,omitempty"`
}

type SubscriptionDeliveryPayloadItem struct {
	Key      string `json:"key"`
	Label    string `json:"label"`
	Type     string `json:"type"`
	Value    string `json:"value"`
	Masked   bool   `json:"masked"`
	Copyable bool   `json:"copyable"`
}

type SubscriptionManualDeliverySummary struct {
	Order       *SubscriptionOrder              `json:"order"`
	Plan        *SubscriptionPlan               `json:"plan,omitempty"`
	RefundOrder *SubscriptionRefundOrderSummary `json:"refund_order,omitempty"`
}

type AdminSubscriptionManualDeliverySummary struct {
	Order       *SubscriptionOrder              `json:"order"`
	Plan        *SubscriptionPlan               `json:"plan,omitempty"`
	Username    string                          `json:"username"`
	UserGroup   string                          `json:"user_group"`
	RefundOrder *SubscriptionRefundOrderSummary `json:"refund_order,omitempty"`
}

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
	// DiscountPriceAmount is the limited-time promo price. 0 means no discount.
	DiscountPriceAmount float64 `json:"discount_price_amount" gorm:"type:decimal(10,6);not null;default:0"`
	// DiscountDeadline is the unix timestamp in seconds when promo ends. 0 means no deadline / inactive.
	DiscountDeadline     int64   `json:"discount_deadline" gorm:"bigint;not null;default:0"`
	Currency             string  `json:"currency" gorm:"type:varchar(8);not null;default:'USD'"`
	EffectivePriceAmount float64 `json:"effective_price_amount" gorm:"-"`
	ActiveDiscount       bool    `json:"has_active_discount" gorm:"-"`

	DurationUnit  string `json:"duration_unit" gorm:"type:varchar(16);not null;default:'month'"`
	DurationValue int    `json:"duration_value" gorm:"type:int;not null;default:1"`
	CustomSeconds int64  `json:"custom_seconds" gorm:"type:bigint;not null;default:0"`

	Enabled   bool `json:"enabled" gorm:"default:true"`
	SortOrder int  `json:"sort_order" gorm:"type:int;default:0"`

	StripePriceId  string `json:"stripe_price_id" gorm:"type:varchar(128);default:''"`
	CreemProductId string `json:"creem_product_id" gorm:"type:varchar(128);default:''"`

	// Max purchases per user (0 = unlimited)
	MaxPurchasePerUser int `json:"max_purchase_per_user" gorm:"type:int;default:0"`

	// SaleLimitCount is the total number of subscriptions that can be sold/issued (0 = unlimited).
	SaleLimitCount int64 `json:"sale_limit_count" gorm:"type:bigint;not null;default:0"`
	// SoldCount is the number of subscriptions already sold/issued for this plan.
	SoldCount int64 `json:"sold_count" gorm:"type:bigint;not null;default:0"`

	RemainingSaleCount int64 `json:"remaining_sale_count" gorm:"-"`
	SoldOut            bool  `json:"sold_out" gorm:"-"`

	// Upgrade user group after purchase (empty = no change)
	UpgradeGroup string `json:"upgrade_group" gorm:"type:varchar(64);default:''"`

	// Total quota (amount in quota units, 0 = unlimited)
	TotalAmount int64 `json:"total_amount" gorm:"type:bigint;not null;default:0"`

	// ResourceType controls whether this plan is billed by quota or successful request count.
	ResourceType string `json:"resource_type" gorm:"type:varchar(32);not null;default:'quota'"`
	// RequestCountTotal is the total successful request count allowed across the whole subscription lifetime (0 = unlimited).
	RequestCountTotal int64 `json:"request_count_total" gorm:"type:bigint;not null;default:0"`
	// RequestCountPeriodTotal is the successful request count allowed within each reset period (0 = unlimited).
	RequestCountPeriodTotal int64 `json:"request_count_period_total" gorm:"type:bigint;not null;default:0"`

	// Quota reset period for plan
	QuotaResetPeriod        string `json:"quota_reset_period" gorm:"type:varchar(16);default:'never'"`
	QuotaResetCustomSeconds int64  `json:"quota_reset_custom_seconds" gorm:"type:bigint;default:0"`
	QuotaResetUseFixedClock bool   `json:"quota_reset_use_fixed_clock" gorm:"not null;default:false"`
	QuotaResetFixedSeconds  int64  `json:"quota_reset_fixed_seconds" gorm:"type:bigint;not null;default:0"`

	AllowedGroupsJSON       string `json:"-" gorm:"type:text;default:'';column:allowed_groups_json"`
	AllowedModelsJSON       string `json:"-" gorm:"type:text;default:'';column:allowed_models_json"`
	AllowedVendorIDsJSON    string `json:"-" gorm:"type:text;default:'';column:allowed_vendor_ids_json"`
	DeliveryMode            string `json:"delivery_mode" gorm:"type:varchar(32);not null;default:'auto_activate'"`
	DeliveryFieldSchemaJSON string `json:"-" gorm:"type:text;default:'';column:delivery_field_schema_json"`

	AllowedGroups       []string                    `json:"allowed_groups,omitempty" gorm:"-"`
	AllowedModels       []string                    `json:"allowed_models,omitempty" gorm:"-"`
	AllowedVendorIDs    []int                       `json:"allowed_vendor_ids,omitempty" gorm:"-"`
	AllowedVendorNames  []string                    `json:"allowed_vendor_names,omitempty" gorm:"-"`
	DeliveryFieldSchema []SubscriptionDeliveryField `json:"delivery_field_schema,omitempty" gorm:"-"`

	CreatedAt int64 `json:"created_at" gorm:"bigint"`
	UpdatedAt int64 `json:"updated_at" gorm:"bigint"`
}

func (p *SubscriptionPlan) HasActiveDiscount(now int64) bool {
	if p == nil {
		return false
	}
	if now <= 0 {
		now = common.GetTimestamp()
	}
	return p.DiscountPriceAmount > 0 &&
		p.PriceAmount > 0 &&
		p.DiscountPriceAmount < p.PriceAmount &&
		p.DiscountDeadline > now
}

func (p *SubscriptionPlan) GetEffectivePriceAmount(now int64) float64 {
	if p == nil {
		return 0
	}
	if p.HasActiveDiscount(now) {
		return p.DiscountPriceAmount
	}
	return p.PriceAmount
}

func (p *SubscriptionPlan) ApplyDisplayPrice(now int64) {
	if p == nil {
		return
	}
	p.ActiveDiscount = p.HasActiveDiscount(now)
	p.EffectivePriceAmount = p.PriceAmount
	if p.ActiveDiscount {
		p.EffectivePriceAmount = p.DiscountPriceAmount
	}
}

func (p *SubscriptionPlan) HasSaleLimit() bool {
	if p == nil {
		return false
	}
	return p.SaleLimitCount > 0
}

func (p *SubscriptionPlan) GetRemainingSaleCount() int64 {
	if p == nil {
		return 0
	}
	if p.SaleLimitCount <= 0 {
		return 0
	}
	return max(p.SaleLimitCount-p.SoldCount, 0)
}

func (p *SubscriptionPlan) IsSoldOut() bool {
	if p == nil {
		return false
	}
	return p.SaleLimitCount > 0 && p.SoldCount >= p.SaleLimitCount
}

func (p *SubscriptionPlan) ApplyDisplayInventory() {
	if p == nil {
		return
	}
	p.RemainingSaleCount = p.GetRemainingSaleCount()
	p.SoldOut = p.IsSoldOut()
}

func (p *SubscriptionPlan) BeforeCreate(tx *gorm.DB) error {
	now := common.GetTimestamp()
	p.DeliveryMode = normalizeSubscriptionDeliveryMode(p.DeliveryMode)
	p.CreatedAt = now
	p.UpdatedAt = now
	return nil
}

func (p *SubscriptionPlan) BeforeUpdate(tx *gorm.DB) error {
	p.DeliveryMode = normalizeSubscriptionDeliveryMode(p.DeliveryMode)
	p.UpdatedAt = common.GetTimestamp()
	return nil
}

// Subscription order (payment -> webhook -> create UserSubscription)
type SubscriptionOrder struct {
	Id     int     `json:"id"`
	UserId int     `json:"user_id" gorm:"index"`
	PlanId int     `json:"plan_id" gorm:"index"`
	Money  float64 `json:"money"`

	PlanTitle                   string `json:"plan_title" gorm:"type:varchar(255);default:''"`
	PlanDurationUnit            string `json:"plan_duration_unit" gorm:"type:varchar(16);default:''"`
	PlanDurationValue           int    `json:"plan_duration_value" gorm:"type:int;not null;default:0"`
	PlanCustomSeconds           int64  `json:"plan_custom_seconds" gorm:"type:bigint;not null;default:0"`
	PlanUpgradeGroup            string `json:"plan_upgrade_group" gorm:"type:varchar(64);default:''"`
	PlanTotalAmount             int64  `json:"plan_total_amount" gorm:"type:bigint;not null;default:0"`
	PlanResourceType            string `json:"plan_resource_type" gorm:"type:varchar(32);default:''"`
	PlanRequestCountTotal       int64  `json:"plan_request_count_total" gorm:"type:bigint;not null;default:0"`
	PlanRequestCountPeriodTotal int64  `json:"plan_request_count_period_total" gorm:"type:bigint;not null;default:0"`
	PlanQuotaResetPeriod        string `json:"plan_quota_reset_period" gorm:"type:varchar(16);default:''"`
	PlanQuotaResetCustomSec     int64  `json:"plan_quota_reset_custom_sec" gorm:"type:bigint;not null;default:0"`
	PlanQuotaResetUseFixedClock bool   `json:"plan_quota_reset_use_fixed_clock" gorm:"not null;default:false"`
	PlanQuotaResetFixedSeconds  int64  `json:"plan_quota_reset_fixed_seconds" gorm:"type:bigint;not null;default:0"`
	PlanAllowedGroupsJSON       string `json:"-" gorm:"type:text;default:'';column:plan_allowed_groups_json"`
	PlanAllowedModelsJSON       string `json:"-" gorm:"type:text;default:'';column:plan_allowed_models_json"`
	PlanAllowedVendorIDsJSON    string `json:"-" gorm:"type:text;default:'';column:plan_allowed_vendor_ids_json"`
	PlanDeliveryMode            string `json:"plan_delivery_mode" gorm:"type:varchar(32);default:'auto_activate'"`
	PlanDeliveryFieldSchemaJSON string `json:"-" gorm:"type:text;default:'';column:plan_delivery_field_schema_json"`

	TradeNo       string `json:"trade_no" gorm:"unique;type:varchar(255);index"`
	PaymentMethod string `json:"payment_method" gorm:"type:varchar(50)"`
	Status        string `json:"status"`
	CreateTime    int64  `json:"create_time"`
	CompleteTime  int64  `json:"complete_time"`

	ProviderPayload     string `json:"provider_payload" gorm:"type:text"`
	FulfillmentStatus   string `json:"fulfillment_status" gorm:"type:varchar(32);not null;default:'not_required';index"`
	DeliveryPayloadJSON string `json:"-" gorm:"type:text;default:'';column:delivery_payload_json"`
	DeliveryAdminRemark string `json:"delivery_admin_remark" gorm:"type:text;default:''"`
	DeliveredBy         int    `json:"delivered_by" gorm:"type:int;not null;default:0"`
	DeliveredAt         int64  `json:"delivered_at" gorm:"type:bigint;not null;default:0"`

	PlanDeliveryFieldSchema []SubscriptionDeliveryField       `json:"plan_delivery_field_schema,omitempty" gorm:"-"`
	DeliveryPayload         []SubscriptionDeliveryPayloadItem `json:"delivery_payload,omitempty" gorm:"-"`
}

func (o *SubscriptionOrder) Insert() error {
	if o.CreateTime == 0 {
		o.CreateTime = common.GetTimestamp()
	}
	o.PlanDeliveryMode = normalizeSubscriptionDeliveryMode(o.PlanDeliveryMode)
	o.FulfillmentStatus = normalizeSubscriptionFulfillmentStatus(o.FulfillmentStatus)
	return DB.Create(o).Error
}

func (o *SubscriptionOrder) Update() error {
	o.PlanDeliveryMode = normalizeSubscriptionDeliveryMode(o.PlanDeliveryMode)
	o.FulfillmentStatus = normalizeSubscriptionFulfillmentStatus(o.FulfillmentStatus)
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
	ApplySubscriptionOrderDeliveryFields(&order)
	return &order
}

func (o *SubscriptionOrder) ApplyPlanSnapshot(plan *SubscriptionPlan) {
	if o == nil || plan == nil {
		return
	}
	o.PlanTitle = strings.TrimSpace(plan.Title)
	o.PlanDurationUnit = strings.TrimSpace(plan.DurationUnit)
	o.PlanDurationValue = plan.DurationValue
	o.PlanCustomSeconds = plan.CustomSeconds
	o.PlanUpgradeGroup = strings.TrimSpace(plan.UpgradeGroup)
	o.PlanTotalAmount = plan.TotalAmount
	o.PlanResourceType = NormalizeSubscriptionResourceType(plan.ResourceType)
	o.PlanRequestCountTotal = plan.RequestCountTotal
	o.PlanRequestCountPeriodTotal = plan.RequestCountPeriodTotal
	o.PlanQuotaResetPeriod = NormalizeResetPeriod(plan.QuotaResetPeriod)
	o.PlanQuotaResetCustomSec = plan.QuotaResetCustomSeconds
	o.PlanQuotaResetUseFixedClock = plan.QuotaResetUseFixedClock
	o.PlanQuotaResetFixedSeconds = plan.QuotaResetFixedSeconds
	o.PlanAllowedGroupsJSON = strings.TrimSpace(plan.AllowedGroupsJSON)
	o.PlanAllowedModelsJSON = strings.TrimSpace(plan.AllowedModelsJSON)
	o.PlanAllowedVendorIDsJSON = strings.TrimSpace(plan.AllowedVendorIDsJSON)
	o.PlanDeliveryMode = normalizeSubscriptionDeliveryMode(plan.DeliveryMode)
	o.PlanDeliveryFieldSchemaJSON = strings.TrimSpace(plan.DeliveryFieldSchemaJSON)
	o.FulfillmentStatus = SubscriptionFulfillmentNotRequired
	if o.PlanDeliveryMode == SubscriptionDeliveryModeManualDelivery {
		o.FulfillmentStatus = SubscriptionFulfillmentPending
	}
}

func (o *SubscriptionOrder) SnapshotPlan() *SubscriptionPlan {
	if o == nil || strings.TrimSpace(o.PlanDurationUnit) == "" {
		return nil
	}
	return &SubscriptionPlan{
		Id:                      o.PlanId,
		Title:                   strings.TrimSpace(o.PlanTitle),
		DurationUnit:            strings.TrimSpace(o.PlanDurationUnit),
		DurationValue:           o.PlanDurationValue,
		CustomSeconds:           o.PlanCustomSeconds,
		UpgradeGroup:            strings.TrimSpace(o.PlanUpgradeGroup),
		TotalAmount:             o.PlanTotalAmount,
		ResourceType:            NormalizeSubscriptionResourceType(o.PlanResourceType),
		RequestCountTotal:       o.PlanRequestCountTotal,
		RequestCountPeriodTotal: o.PlanRequestCountPeriodTotal,
		QuotaResetPeriod:        NormalizeResetPeriod(o.PlanQuotaResetPeriod),
		QuotaResetCustomSeconds: o.PlanQuotaResetCustomSec,
		QuotaResetUseFixedClock: o.PlanQuotaResetUseFixedClock,
		QuotaResetFixedSeconds:  o.PlanQuotaResetFixedSeconds,
		AllowedGroupsJSON:       strings.TrimSpace(o.PlanAllowedGroupsJSON),
		AllowedModelsJSON:       strings.TrimSpace(o.PlanAllowedModelsJSON),
		AllowedVendorIDsJSON:    strings.TrimSpace(o.PlanAllowedVendorIDsJSON),
		DeliveryMode:            normalizeSubscriptionDeliveryMode(o.PlanDeliveryMode),
		DeliveryFieldSchemaJSON: strings.TrimSpace(o.PlanDeliveryFieldSchemaJSON),
	}
}

func buildSubscriptionPlanSnapshot(plan *SubscriptionPlan, planId int) *SubscriptionPlan {
	if plan == nil || planId <= 0 || strings.TrimSpace(plan.DurationUnit) == "" {
		return nil
	}
	return &SubscriptionPlan{
		Id:                      planId,
		Title:                   strings.TrimSpace(plan.Title),
		DurationUnit:            strings.TrimSpace(plan.DurationUnit),
		DurationValue:           plan.DurationValue,
		CustomSeconds:           plan.CustomSeconds,
		UpgradeGroup:            strings.TrimSpace(plan.UpgradeGroup),
		TotalAmount:             plan.TotalAmount,
		ResourceType:            NormalizeSubscriptionResourceType(plan.ResourceType),
		RequestCountTotal:       plan.RequestCountTotal,
		RequestCountPeriodTotal: plan.RequestCountPeriodTotal,
		QuotaResetPeriod:        NormalizeResetPeriod(plan.QuotaResetPeriod),
		QuotaResetCustomSeconds: plan.QuotaResetCustomSeconds,
		QuotaResetUseFixedClock: plan.QuotaResetUseFixedClock,
		QuotaResetFixedSeconds:  plan.QuotaResetFixedSeconds,
		AllowedGroupsJSON:       strings.TrimSpace(plan.AllowedGroupsJSON),
		AllowedModelsJSON:       strings.TrimSpace(plan.AllowedModelsJSON),
		AllowedVendorIDsJSON:    strings.TrimSpace(plan.AllowedVendorIDsJSON),
		DeliveryMode:            normalizeSubscriptionDeliveryMode(plan.DeliveryMode),
		DeliveryFieldSchemaJSON: strings.TrimSpace(plan.DeliveryFieldSchemaJSON),
	}
}

func buildManualDeliveryTradeNo(prefix string) (string, error) {
	prefix = strings.TrimSpace(prefix)
	if prefix == "" {
		prefix = "manual"
	}
	nonce, err := common.GenerateRandomCharsKey(24)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%s-%d-%s", prefix, common.GetTimestamp(), nonce), nil
}

// User subscription instance
type UserSubscription struct {
	Id     int `json:"id"`
	UserId int `json:"user_id" gorm:"index;index:idx_user_sub_active,priority:1"`
	PlanId int `json:"plan_id" gorm:"index"`

	AmountTotal int64 `json:"amount_total" gorm:"type:bigint;not null;default:0"`
	AmountUsed  int64 `json:"amount_used" gorm:"type:bigint;not null;default:0"`

	ResourceType            string `json:"resource_type" gorm:"type:varchar(32);not null;default:'quota'"`
	RequestCountTotal       int64  `json:"request_count_total" gorm:"type:bigint;not null;default:0"`
	RequestCountUsed        int64  `json:"request_count_used" gorm:"type:bigint;not null;default:0"`
	RequestCountPeriodTotal int64  `json:"request_count_period_total" gorm:"type:bigint;not null;default:0"`
	RequestCountPeriodUsed  int64  `json:"request_count_period_used" gorm:"type:bigint;not null;default:0"`
	ResetPeriod             string `json:"reset_period" gorm:"type:varchar(16);not null;default:'never'"`
	ResetCustomSeconds      int64  `json:"reset_custom_seconds" gorm:"type:bigint;not null;default:0"`
	ResetUseFixedClock      bool   `json:"reset_use_fixed_clock" gorm:"not null;default:false"`
	ResetFixedSeconds       int64  `json:"reset_fixed_seconds" gorm:"type:bigint;not null;default:0"`
	AllowedGroupsJSON       string `json:"-" gorm:"type:text;default:'';column:allowed_groups_json"`
	AllowedModelsJSON       string `json:"-" gorm:"type:text;default:'';column:allowed_models_json"`
	AllowedVendorIDsJSON    string `json:"-" gorm:"type:text;default:'';column:allowed_vendor_ids_json"`
	DurationUnit            string `json:"duration_unit" gorm:"type:varchar(16);not null;default:'month'"`
	DurationValue           int    `json:"duration_value" gorm:"type:int;not null;default:1"`
	CustomSeconds           int64  `json:"custom_seconds" gorm:"type:bigint;not null;default:0"`

	StartTime int64  `json:"start_time" gorm:"bigint"`
	EndTime   int64  `json:"end_time" gorm:"bigint;index;index:idx_user_sub_active,priority:3"`
	Status    string `json:"status" gorm:"type:varchar(32);index;index:idx_user_sub_active,priority:2"` // active/expired/cancelled

	Source string `json:"source" gorm:"type:varchar(32);default:'order'"` // order/admin

	SourceOrderId            int     `json:"source_order_id" gorm:"type:int;not null;default:0"`
	SourceOrderTradeNo       string  `json:"source_order_trade_no" gorm:"type:varchar(255);default:'';index"`
	SourceOrderPaymentMethod string  `json:"source_order_payment_method" gorm:"type:varchar(50);default:''"`
	SourceOrderMoney         float64 `json:"source_order_money" gorm:"type:decimal(12,2);not null;default:0"`

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
	Subscription *UserSubscription               `json:"subscription"`
	RefundOrder  *SubscriptionRefundOrderSummary `json:"refund_order,omitempty"`
}

type SubscriptionRefundOrderSummary struct {
	OrderId       int     `json:"order_id"`
	TradeNo       string  `json:"trade_no"`
	TopUpId       int     `json:"topup_id"`
	PaymentMethod string  `json:"payment_method"`
	Money         float64 `json:"money"`
	CompleteTime  int64   `json:"complete_time"`
}

type AdminUserSubscriptionSummary struct {
	Subscription *UserSubscription               `json:"subscription"`
	Username     string                          `json:"username"`
	UserGroup    string                          `json:"user_group"`
	RefundOrder  *SubscriptionRefundOrderSummary `json:"refund_order,omitempty"`
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
	case SubscriptionResetDaily, SubscriptionResetWeekly, SubscriptionResetMonthly, SubscriptionResetYearly, SubscriptionResetCustom:
		return strings.TrimSpace(period)
	default:
		return SubscriptionResetNever
	}
}

func resetPeriodSupportsFixedClock(period string) bool {
	switch NormalizeResetPeriod(period) {
	case SubscriptionResetDaily, SubscriptionResetWeekly, SubscriptionResetMonthly, SubscriptionResetYearly:
		return true
	default:
		return false
	}
}

func normalizeResetFixedClock(useFixed bool, fixedSeconds int64, period string) (bool, int64) {
	if !useFixed || !resetPeriodSupportsFixedClock(period) {
		return false, 0
	}
	if fixedSeconds < 0 {
		return false, 0
	}
	if fixedSeconds >= 24*3600 {
		return true, 24*3600 - 1
	}
	return true, fixedSeconds
}

func applyFixedClockToResetTime(base time.Time, next time.Time, period string, fixedSeconds int64) time.Time {
	useFixed, normalizedFixedSeconds := normalizeResetFixedClock(true, fixedSeconds, period)
	if !useFixed {
		return next
	}
	localNext := subscriptionResetTime(next)
	hour := int(normalizedFixedSeconds / 3600)
	minute := int((normalizedFixedSeconds % 3600) / 60)
	second := int(normalizedFixedSeconds % 60)
	candidate := time.Date(
		localNext.Year(),
		localNext.Month(),
		localNext.Day(),
		hour,
		minute,
		second,
		0,
		localNext.Location(),
	)
	if candidate.After(subscriptionResetTime(base)) {
		return candidate
	}
	switch NormalizeResetPeriod(period) {
	case SubscriptionResetDaily:
		return candidate.AddDate(0, 0, 1)
	case SubscriptionResetWeekly:
		return candidate.AddDate(0, 0, 7)
	case SubscriptionResetMonthly:
		return candidate.AddDate(0, 1, 0)
	case SubscriptionResetYearly:
		return candidate.AddDate(1, 0, 0)
	default:
		return candidate
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

func normalizeSubscriptionStringList(items []string) []string {
	if len(items) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(items))
	result := make([]string, 0, len(items))
	for _, item := range items {
		trimmed := strings.TrimSpace(item)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		result = append(result, trimmed)
	}
	if len(result) == 0 {
		return nil
	}
	return result
}

func normalizeSubscriptionIntList(items []int) []int {
	if len(items) == 0 {
		return nil
	}
	seen := make(map[int]struct{}, len(items))
	result := make([]int, 0, len(items))
	for _, item := range items {
		if item <= 0 {
			continue
		}
		if _, ok := seen[item]; ok {
			continue
		}
		seen[item] = struct{}{}
		result = append(result, item)
	}
	if len(result) == 0 {
		return nil
	}
	return result
}

func encodeSubscriptionStringList(items []string) (string, error) {
	normalized := normalizeSubscriptionStringList(items)
	if len(normalized) == 0 {
		return "", nil
	}
	data, err := common.Marshal(normalized)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func encodeSubscriptionIntList(items []int) (string, error) {
	normalized := normalizeSubscriptionIntList(items)
	if len(normalized) == 0 {
		return "", nil
	}
	data, err := common.Marshal(normalized)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func normalizeSubscriptionDeliveryMode(mode string) string {
	switch strings.TrimSpace(mode) {
	case SubscriptionDeliveryModeManualDelivery:
		return SubscriptionDeliveryModeManualDelivery
	default:
		return SubscriptionDeliveryModeAutoActivate
	}
}

func normalizeSubscriptionFulfillmentStatus(status string) string {
	switch strings.TrimSpace(status) {
	case SubscriptionFulfillmentPending:
		return SubscriptionFulfillmentPending
	case SubscriptionFulfillmentDelivered:
		return SubscriptionFulfillmentDelivered
	case SubscriptionFulfillmentRejected:
		return SubscriptionFulfillmentRejected
	default:
		return SubscriptionFulfillmentNotRequired
	}
}

func normalizeDeliveryFieldType(fieldType string) string {
	switch strings.TrimSpace(fieldType) {
	case "url", "textarea", "email", "password":
		return strings.TrimSpace(fieldType)
	default:
		return "text"
	}
}

func decodeSubscriptionStringList(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var items []string
	if err := common.UnmarshalJsonStr(raw, &items); err != nil {
		return nil
	}
	return normalizeSubscriptionStringList(items)
}

func decodeSubscriptionIntList(raw string) []int {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var items []int
	if err := common.UnmarshalJsonStr(raw, &items); err != nil {
		return nil
	}
	return normalizeSubscriptionIntList(items)
}

func normalizeSubscriptionDeliveryFields(fields []SubscriptionDeliveryField) []SubscriptionDeliveryField {
	if len(fields) == 0 {
		return nil
	}
	result := make([]SubscriptionDeliveryField, 0, len(fields))
	keySet := make(map[string]struct{}, len(fields))
	for index, field := range fields {
		key := strings.TrimSpace(field.Key)
		label := strings.TrimSpace(field.Label)
		if key == "" || label == "" {
			continue
		}
		if _, exists := keySet[key]; exists {
			continue
		}
		keySet[key] = struct{}{}
		result = append(result, SubscriptionDeliveryField{
			Key:          key,
			Label:        label,
			Type:         normalizeDeliveryFieldType(field.Type),
			Required:     field.Required,
			Masked:       field.Masked,
			Copyable:     field.Copyable,
			SortOrder:    field.SortOrder,
			Placeholder:  strings.TrimSpace(field.Placeholder),
			DefaultValue: strings.TrimSpace(field.DefaultValue),
		})
		if result[len(result)-1].SortOrder == 0 {
			result[len(result)-1].SortOrder = index + 1
		}
	}
	if len(result) == 0 {
		return nil
	}
	return result
}

func normalizeSubscriptionDeliveryPayload(items []SubscriptionDeliveryPayloadItem) []SubscriptionDeliveryPayloadItem {
	if len(items) == 0 {
		return nil
	}
	result := make([]SubscriptionDeliveryPayloadItem, 0, len(items))
	for _, item := range items {
		key := strings.TrimSpace(item.Key)
		label := strings.TrimSpace(item.Label)
		value := strings.TrimSpace(item.Value)
		if key == "" || label == "" || value == "" {
			continue
		}
		result = append(result, SubscriptionDeliveryPayloadItem{
			Key:      key,
			Label:    label,
			Type:     normalizeDeliveryFieldType(item.Type),
			Value:    value,
			Masked:   item.Masked,
			Copyable: item.Copyable,
		})
	}
	if len(result) == 0 {
		return nil
	}
	return result
}

func encodeSubscriptionDeliveryFields(fields []SubscriptionDeliveryField) (string, error) {
	normalized := normalizeSubscriptionDeliveryFields(fields)
	if len(normalized) == 0 {
		return "", nil
	}
	data, err := common.Marshal(normalized)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func decodeSubscriptionDeliveryFields(raw string) []SubscriptionDeliveryField {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var items []SubscriptionDeliveryField
	if err := common.UnmarshalJsonStr(raw, &items); err != nil {
		return nil
	}
	return normalizeSubscriptionDeliveryFields(items)
}

func encodeSubscriptionDeliveryPayload(items []SubscriptionDeliveryPayloadItem) (string, error) {
	normalized := normalizeSubscriptionDeliveryPayload(items)
	if len(normalized) == 0 {
		return "", nil
	}
	data, err := common.Marshal(normalized)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func decodeSubscriptionDeliveryPayload(raw string) []SubscriptionDeliveryPayloadItem {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var items []SubscriptionDeliveryPayloadItem
	if err := common.UnmarshalJsonStr(raw, &items); err != nil {
		return nil
	}
	return normalizeSubscriptionDeliveryPayload(items)
}

func PrepareSubscriptionPlanRestrictionFields(plan *SubscriptionPlan) error {
	if plan == nil {
		return nil
	}
	allowedGroups, err := encodeSubscriptionStringList(plan.AllowedGroups)
	if err != nil {
		return err
	}
	allowedModels, err := encodeSubscriptionStringList(plan.AllowedModels)
	if err != nil {
		return err
	}
	allowedVendorIDs, err := encodeSubscriptionIntList(plan.AllowedVendorIDs)
	if err != nil {
		return err
	}
	plan.AllowedGroups = normalizeSubscriptionStringList(plan.AllowedGroups)
	plan.AllowedModels = normalizeSubscriptionStringList(plan.AllowedModels)
	plan.AllowedVendorIDs = normalizeSubscriptionIntList(plan.AllowedVendorIDs)
	plan.AllowedGroupsJSON = allowedGroups
	plan.AllowedModelsJSON = allowedModels
	plan.AllowedVendorIDsJSON = allowedVendorIDs
	plan.DeliveryMode = normalizeSubscriptionDeliveryMode(plan.DeliveryMode)
	deliveryFieldSchema, err := encodeSubscriptionDeliveryFields(plan.DeliveryFieldSchema)
	if err != nil {
		return err
	}
	plan.DeliveryFieldSchema = normalizeSubscriptionDeliveryFields(plan.DeliveryFieldSchema)
	plan.DeliveryFieldSchemaJSON = deliveryFieldSchema
	return nil
}

func applySubscriptionPlanRestrictionFields(plan *SubscriptionPlan, vendorNamesByID map[int]string) {
	if plan == nil {
		return
	}
	plan.AllowedGroups = decodeSubscriptionStringList(plan.AllowedGroupsJSON)
	plan.AllowedModels = decodeSubscriptionStringList(plan.AllowedModelsJSON)
	plan.AllowedVendorIDs = decodeSubscriptionIntList(plan.AllowedVendorIDsJSON)
	plan.DeliveryMode = normalizeSubscriptionDeliveryMode(plan.DeliveryMode)
	plan.DeliveryFieldSchema = decodeSubscriptionDeliveryFields(plan.DeliveryFieldSchemaJSON)
	if len(plan.AllowedVendorIDs) == 0 {
		plan.AllowedVendorNames = nil
		return
	}
	names := make([]string, 0, len(plan.AllowedVendorIDs))
	for _, vendorID := range plan.AllowedVendorIDs {
		name := strings.TrimSpace(vendorNamesByID[vendorID])
		if name == "" {
			name = strconv.Itoa(vendorID)
		}
		names = append(names, name)
	}
	plan.AllowedVendorNames = names
}

func ApplySubscriptionPlanRestrictionFields(plans []*SubscriptionPlan) {
	if len(plans) == 0 {
		return
	}
	vendorIDs := make([]int, 0)
	vendorIDSet := make(map[int]struct{})
	for _, plan := range plans {
		if plan == nil {
			continue
		}
		for _, vendorID := range decodeSubscriptionIntList(plan.AllowedVendorIDsJSON) {
			if _, ok := vendorIDSet[vendorID]; ok {
				continue
			}
			vendorIDSet[vendorID] = struct{}{}
			vendorIDs = append(vendorIDs, vendorID)
		}
	}
	vendorNamesByID := make(map[int]string, len(vendorIDs))
	if len(vendorIDs) > 0 {
		var vendors []Vendor
		if err := DB.Select("id", "name").Where("id IN ?", vendorIDs).Find(&vendors).Error; err == nil {
			for _, vendor := range vendors {
				vendorNamesByID[vendor.Id] = vendor.Name
			}
		}
	}
	for _, plan := range plans {
		applySubscriptionPlanRestrictionFields(plan, vendorNamesByID)
	}
}

func ApplySubscriptionOrderDeliveryFields(order *SubscriptionOrder) {
	if order == nil {
		return
	}
	order.PlanDeliveryMode = normalizeSubscriptionDeliveryMode(order.PlanDeliveryMode)
	order.FulfillmentStatus = normalizeSubscriptionFulfillmentStatus(order.FulfillmentStatus)
	order.PlanDeliveryFieldSchema = decodeSubscriptionDeliveryFields(order.PlanDeliveryFieldSchemaJSON)
	order.DeliveryPayload = decodeSubscriptionDeliveryPayload(order.DeliveryPayloadJSON)
}

func decodeUserSubscriptionAllowedGroups(sub *UserSubscription) []string {
	if sub == nil {
		return nil
	}
	return decodeSubscriptionStringList(sub.AllowedGroupsJSON)
}

func decodeUserSubscriptionAllowedModels(sub *UserSubscription) []string {
	if sub == nil {
		return nil
	}
	return decodeSubscriptionStringList(sub.AllowedModelsJSON)
}

func decodeUserSubscriptionAllowedVendorIDs(sub *UserSubscription) []int {
	if sub == nil {
		return nil
	}
	return decodeSubscriptionIntList(sub.AllowedVendorIDsJSON)
}

func getVendorIDByModelNameTx(tx *gorm.DB, modelName string) int {
	modelName = strings.TrimSpace(modelName)
	if modelName == "" {
		return 0
	}
	query := tx
	if query == nil {
		query = DB
	}
	var exact Model
	if err := query.Select("vendor_id").Where("model_name = ? AND deleted_at IS NULL", modelName).First(&exact).Error; err == nil {
		return exact.VendorID
	}
	var rules []Model
	if err := query.Select("vendor_id", "model_name", "name_rule").
		Where("name_rule <> ? AND deleted_at IS NULL", NameRuleExact).
		Find(&rules).Error; err != nil {
		return 0
	}
	for _, rule := range rules {
		switch rule.NameRule {
		case NameRulePrefix:
			if strings.HasPrefix(modelName, rule.ModelName) {
				return rule.VendorID
			}
		case NameRuleSuffix:
			if strings.HasSuffix(modelName, rule.ModelName) {
				return rule.VendorID
			}
		case NameRuleContains:
			if strings.Contains(modelName, rule.ModelName) {
				return rule.VendorID
			}
		}
	}
	modelLower := strings.ToLower(modelName)
	for pattern, vendorName := range defaultVendorRules {
		if !strings.Contains(modelLower, pattern) {
			continue
		}
		var vendor Vendor
		if err := query.Select("id").Where("name = ? AND deleted_at IS NULL", vendorName).First(&vendor).Error; err == nil {
			return vendor.Id
		}
		break
	}
	return 0
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
		next = base.Add(24 * time.Hour)
	case SubscriptionResetWeekly:
		next = base.AddDate(0, 0, 7)
	case SubscriptionResetMonthly:
		next = base.AddDate(0, 1, 0)
	case SubscriptionResetYearly:
		next = base.AddDate(1, 0, 0)
	case SubscriptionResetCustom:
		if plan.QuotaResetCustomSeconds <= 0 {
			return 0
		}
		next = base.Add(time.Duration(plan.QuotaResetCustomSeconds) * time.Second)
	default:
		return 0
	}
	if plan.QuotaResetUseFixedClock {
		next = applyFixedClockToResetTime(base, next, period, plan.QuotaResetFixedSeconds)
	}
	if endUnix > 0 && next.Unix() > endUnix {
		return 0
	}
	return next.Unix()
}

func syncSubscriptionPlanSnapshotFields(sub *UserSubscription, plan *SubscriptionPlan, now int64) bool {
	if sub == nil || plan == nil {
		return false
	}
	changed := false
	resourceType := NormalizeSubscriptionResourceType(plan.ResourceType)
	resetPeriod := NormalizeResetPeriod(plan.QuotaResetPeriod)

	if sub.ResourceType != resourceType {
		sub.ResourceType = resourceType
		changed = true
	}
	if sub.RequestCountTotal != plan.RequestCountTotal {
		sub.RequestCountTotal = plan.RequestCountTotal
		changed = true
	}
	if sub.RequestCountPeriodTotal != plan.RequestCountPeriodTotal {
		sub.RequestCountPeriodTotal = plan.RequestCountPeriodTotal
		changed = true
	}
	if sub.ResetPeriod != resetPeriod {
		sub.ResetPeriod = resetPeriod
		changed = true
	}
	if sub.ResetCustomSeconds != plan.QuotaResetCustomSeconds {
		sub.ResetCustomSeconds = plan.QuotaResetCustomSeconds
		changed = true
	}
	if sub.ResetUseFixedClock != plan.QuotaResetUseFixedClock {
		sub.ResetUseFixedClock = plan.QuotaResetUseFixedClock
		changed = true
	}
	if sub.ResetFixedSeconds != plan.QuotaResetFixedSeconds {
		sub.ResetFixedSeconds = plan.QuotaResetFixedSeconds
		changed = true
	}

	if recalculateSubscriptionResetWindow(sub, now) {
		changed = true
	}
	return changed
}

func recalculateSubscriptionResetWindow(sub *UserSubscription, now int64) bool {
	if sub == nil {
		return false
	}
	oldLastResetTime := sub.LastResetTime
	oldNextResetTime := sub.NextResetTime
	resetPeriod := NormalizeResetPeriod(sub.ResetPeriod)
	if resetPeriod == SubscriptionResetNever {
		sub.LastResetTime = 0
		sub.NextResetTime = 0
		return sub.LastResetTime != oldLastResetTime || sub.NextResetTime != oldNextResetTime
	}
	baseUnix := sub.LastResetTime
	if baseUnix <= 0 {
		baseUnix = sub.StartTime
	}
	base := time.Unix(baseUnix, 0)
	snapshotPlan := &SubscriptionPlan{
		QuotaResetPeriod:        resetPeriod,
		QuotaResetCustomSeconds: sub.ResetCustomSeconds,
		QuotaResetUseFixedClock: sub.ResetUseFixedClock,
		QuotaResetFixedSeconds:  sub.ResetFixedSeconds,
	}
	next := calcNextResetTime(base, snapshotPlan, sub.EndTime)
	for next > 0 && next <= now {
		base = time.Unix(next, 0)
		next = calcNextResetTime(base, snapshotPlan, sub.EndTime)
	}
	sub.LastResetTime = base.Unix()
	sub.NextResetTime = next
	return sub.LastResetTime != oldLastResetTime || sub.NextResetTime != oldNextResetTime
}

func getSubscriptionUsageWindowStart(sub *UserSubscription) int64 {
	if sub == nil {
		return 0
	}
	if NormalizeResetPeriod(sub.ResetPeriod) == SubscriptionResetNever {
		return sub.StartTime
	}
	if sub.LastResetTime > 0 {
		return sub.LastResetTime
	}
	return sub.StartTime
}

func getSubscriptionRequestCountPeriodLimit(sub *UserSubscription) int64 {
	if sub == nil {
		return 0
	}
	if NormalizeSubscriptionResourceType(sub.ResourceType) != SubscriptionResourceRequestCount {
		return 0
	}
	if NormalizeResetPeriod(sub.ResetPeriod) == SubscriptionResetNever {
		return 0
	}
	if sub.RequestCountPeriodTotal <= 0 {
		return sub.RequestCountTotal
	}
	return sub.RequestCountPeriodTotal
}

func hasSeparatePeriodRequestCounter(sub *UserSubscription) bool {
	if sub == nil {
		return false
	}
	return NormalizeResetPeriod(sub.ResetPeriod) != SubscriptionResetNever && sub.RequestCountPeriodTotal > 0
}

func hasLifetimeRequestCountLimit(sub *UserSubscription) bool {
	if sub == nil {
		return false
	}
	if NormalizeSubscriptionResourceType(sub.ResourceType) != SubscriptionResourceRequestCount {
		return false
	}
	if NormalizeResetPeriod(sub.ResetPeriod) != SubscriptionResetNever && !hasSeparatePeriodRequestCounter(sub) {
		return false
	}
	return sub.RequestCountTotal > 0
}

func getCurrentRequestCountUsed(sub *UserSubscription) int64 {
	if sub == nil {
		return 0
	}
	if hasSeparatePeriodRequestCounter(sub) {
		return sub.RequestCountPeriodUsed
	}
	return sub.RequestCountUsed
}

func hasUserSubscriptionRemainingEntitlement(sub *UserSubscription) bool {
	if sub == nil {
		return false
	}
	if NormalizeSubscriptionResourceType(sub.ResourceType) == SubscriptionResourceRequestCount {
		if hasLifetimeRequestCountLimit(sub) && sub.RequestCountUsed >= sub.RequestCountTotal {
			return false
		}
		periodLimit := getSubscriptionRequestCountPeriodLimit(sub)
		if periodLimit > 0 && getCurrentRequestCountUsed(sub) >= periodLimit {
			return false
		}
		return true
	}
	if sub.AmountTotal <= 0 {
		return true
	}
	return sub.AmountUsed < sub.AmountTotal
}

func isUserSubscriptionUsableNow(sub *UserSubscription, now int64) bool {
	if sub == nil {
		return false
	}
	if sub.Status != "active" {
		return false
	}
	if sub.EndTime > 0 && sub.EndTime <= now {
		return false
	}
	return hasUserSubscriptionRemainingEntitlement(sub)
}

func deriveUserSubscriptionStatus(sub *UserSubscription, now int64) string {
	if sub == nil {
		return "expired"
	}
	if sub.Status == "cancelled" {
		return "cancelled"
	}
	if sub.EndTime > 0 && sub.EndTime <= now {
		return "expired"
	}
	if NormalizeResetPeriod(sub.ResetPeriod) == SubscriptionResetNever && !hasUserSubscriptionRemainingEntitlement(sub) {
		return "expired"
	}
	return "active"
}

func reconcileUserSubscriptionUsageFromLogs(sub *UserSubscription, now int64) (bool, error) {
	if sub == nil {
		return false, nil
	}
	windowStart := getSubscriptionUsageWindowStart(sub)
	if windowStart <= 0 {
		windowStart = sub.StartTime
	}
	if windowStart <= 0 {
		windowStart = now
	}
	expectedAmountUsed, expectedPeriodCountUsed, preConsumeRequestIDs, err := summarizeUserSubscriptionUsageFromPreConsumeRecords(sub, windowStart, now)
	if err != nil {
		return false, err
	}
	summary, err := summarizeSubscriptionConsumeLogsWithExcludedRequestIDs(0, sub.Id, 0, sub.UserId, windowStart, now, preConsumeRequestIDs)
	if err != nil {
		return false, err
	}
	expectedAmountUsed += summary.TotalQuotaConsumed
	expectedPeriodCountUsed += summary.TotalRequestConsumed
	if sub.AmountTotal > 0 && expectedAmountUsed > sub.AmountTotal {
		expectedAmountUsed = sub.AmountTotal
	}
	if periodLimit := getSubscriptionRequestCountPeriodLimit(sub); periodLimit > 0 && expectedPeriodCountUsed > periodLimit {
		expectedPeriodCountUsed = periodLimit
	}
	changed := false
	if sub.AmountUsed != expectedAmountUsed {
		sub.AmountUsed = expectedAmountUsed
		changed = true
	}
	if hasSeparatePeriodRequestCounter(sub) {
		expectedTotalCountUsed, _, totalPreConsumeRequestIDs, err := summarizeUserSubscriptionUsageFromPreConsumeRecords(sub, sub.StartTime, now)
		if err != nil {
			return false, err
		}
		totalSummary, err := summarizeSubscriptionConsumeLogsWithExcludedRequestIDs(0, sub.Id, 0, sub.UserId, sub.StartTime, now, totalPreConsumeRequestIDs)
		if err != nil {
			return false, err
		}
		expectedTotalCountUsed += totalSummary.TotalRequestConsumed
		if sub.RequestCountTotal > 0 && expectedTotalCountUsed > sub.RequestCountTotal {
			expectedTotalCountUsed = sub.RequestCountTotal
		}
		if sub.RequestCountUsed != expectedTotalCountUsed {
			sub.RequestCountUsed = expectedTotalCountUsed
			changed = true
		}
		if sub.RequestCountPeriodUsed != expectedPeriodCountUsed {
			sub.RequestCountPeriodUsed = expectedPeriodCountUsed
			changed = true
		}
	} else {
		if sub.RequestCountUsed != expectedPeriodCountUsed {
			sub.RequestCountUsed = expectedPeriodCountUsed
			changed = true
		}
		if sub.RequestCountPeriodUsed != 0 {
			sub.RequestCountPeriodUsed = 0
			changed = true
		}
	}
	return changed, nil
}

func summarizeUserSubscriptionUsageFromPreConsumeRecords(sub *UserSubscription, startTimestamp int64, endTimestamp int64) (int64, int64, map[string]struct{}, error) {
	if sub == nil {
		return 0, 0, nil, nil
	}
	if DB == nil || !DB.Migrator().HasTable(&SubscriptionPreConsumeRecord{}) {
		return 0, 0, nil, nil
	}
	type usageRecord struct {
		RequestId string `gorm:"column:request_id"`
		Count     int64  `gorm:"column:pre_consumed_count"`
		Amount    int64  `gorm:"column:pre_consumed_amount"`
	}
	records := make([]usageRecord, 0)
	err := DB.Model(&SubscriptionPreConsumeRecord{}).
		Select("request_id, pre_consumed_count, pre_consumed_amount").
		Where("user_subscription_id = ? AND user_id = ? AND status = ?", sub.Id, sub.UserId, "consumed").
		Where("created_at >= ? AND created_at <= ?", startTimestamp, endTimestamp).
		Find(&records).Error
	if err != nil {
		return 0, 0, nil, err
	}
	requestIDs := make(map[string]struct{}, len(records))
	var amountUsed int64
	var countUsed int64
	for _, record := range records {
		amountUsed += record.Amount
		countUsed += record.Count
		if record.RequestId != "" {
			requestIDs[record.RequestId] = struct{}{}
		}
	}
	return amountUsed, countUsed, requestIDs, nil
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

func getSubscriptionPlanByIdForUpdateTx(tx *gorm.DB, id int) (*SubscriptionPlan, error) {
	if tx == nil {
		return nil, errors.New("tx is nil")
	}
	if id <= 0 {
		return nil, errors.New("invalid plan id")
	}
	var plan SubscriptionPlan
	query := tx
	if !common.UsingSQLite {
		query = query.Set("gorm:query_option", "FOR UPDATE")
	}
	if err := query.Where("id = ?", id).First(&plan).Error; err != nil {
		return nil, err
	}
	return &plan, nil
}

func validatePlanSaleFields(plan *SubscriptionPlan) error {
	if plan == nil {
		return nil
	}
	if plan.SaleLimitCount < 0 {
		return errors.New("可购买总数不能为负数")
	}
	if plan.SoldCount < 0 {
		return errors.New("已售数量不能为负数")
	}
	if plan.SaleLimitCount > 0 && plan.SoldCount > plan.SaleLimitCount {
		return errors.New("已售数量不能大于可购买总数")
	}
	return nil
}

func CountUserPlanPurchases(userId int, planId int) (int64, error) {
	if userId <= 0 || planId <= 0 {
		return 0, errors.New("invalid userId or planId")
	}
	var subscriptionCount int64
	if err := DB.Model(&UserSubscription{}).
		Where("user_id = ? AND plan_id = ?", userId, planId).
		Count(&subscriptionCount).Error; err != nil {
		return 0, err
	}
	var manualOrderCount int64
	if err := DB.Model(&SubscriptionOrder{}).
		Where("user_id = ? AND plan_id = ? AND status = ? AND plan_delivery_mode = ? AND fulfillment_status <> ?",
			userId, planId, common.TopUpStatusSuccess, SubscriptionDeliveryModeManualDelivery, SubscriptionFulfillmentRejected).
		Count(&manualOrderCount).Error; err != nil {
		return 0, err
	}
	return subscriptionCount + manualOrderCount, nil
}

func getUserGroupByIdTx(tx *gorm.DB, userId int) (string, error) {
	if userId <= 0 {
		return "", errors.New("invalid userId")
	}
	if tx == nil {
		tx = DB
	}
	groupCol := commonGroupCol
	if strings.TrimSpace(groupCol) == "" {
		groupCol = "`group`"
		if common.UsingPostgreSQL {
			groupCol = `"group"`
		}
	}
	var group string
	if err := tx.Model(&User{}).Where("id = ?", userId).Select(groupCol).Find(&group).Error; err != nil {
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
	lockedPlan, err := getSubscriptionPlanByIdForUpdateTx(tx, plan.Id)
	if err != nil {
		return nil, err
	}
	effectivePlan := lockedPlan
	skipPlanGuard := false
	if source == "order" {
		if snapshotPlan := buildSubscriptionPlanSnapshot(plan, lockedPlan.Id); snapshotPlan != nil {
			effectivePlan = snapshotPlan
			skipPlanGuard = true
		}
	}
	if !skipPlanGuard && lockedPlan.MaxPurchasePerUser > 0 {
		var count int64
		if err := tx.Model(&UserSubscription{}).
			Where("user_id = ? AND plan_id = ?", userId, lockedPlan.Id).
			Count(&count).Error; err != nil {
			return nil, err
		}
		if count >= int64(lockedPlan.MaxPurchasePerUser) {
			return nil, errors.New("已达到该套餐购买上限")
		}
	}
	// Redemption codes represent an entitlement that has already been issued.
	// They should remain redeemable even if the plan is later marked sold out.
	if !skipPlanGuard && source != "redemption" && lockedPlan.IsSoldOut() {
		return nil, errors.New("该套餐已售罄")
	}
	nowUnix := GetDBTimestampWithTx(tx)
	now := time.Unix(nowUnix, 0)
	endUnix, err := calcPlanEndTime(now, effectivePlan)
	if err != nil {
		return nil, err
	}
	resetBase := now
	nextReset := calcNextResetTime(resetBase, effectivePlan, endUnix)
	lastReset := int64(0)
	if nextReset > 0 {
		lastReset = now.Unix()
	}
	upgradeGroup := strings.TrimSpace(effectivePlan.UpgradeGroup)
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
		UserId:                  userId,
		PlanId:                  lockedPlan.Id,
		AmountTotal:             effectivePlan.TotalAmount,
		AmountUsed:              0,
		ResourceType:            NormalizeSubscriptionResourceType(effectivePlan.ResourceType),
		RequestCountTotal:       effectivePlan.RequestCountTotal,
		RequestCountUsed:        0,
		RequestCountPeriodTotal: effectivePlan.RequestCountPeriodTotal,
		RequestCountPeriodUsed:  0,
		ResetPeriod:             NormalizeResetPeriod(effectivePlan.QuotaResetPeriod),
		ResetCustomSeconds:      effectivePlan.QuotaResetCustomSeconds,
		ResetUseFixedClock:      effectivePlan.QuotaResetUseFixedClock,
		ResetFixedSeconds:       effectivePlan.QuotaResetFixedSeconds,
		AllowedGroupsJSON:       strings.TrimSpace(effectivePlan.AllowedGroupsJSON),
		AllowedModelsJSON:       strings.TrimSpace(effectivePlan.AllowedModelsJSON),
		AllowedVendorIDsJSON:    strings.TrimSpace(effectivePlan.AllowedVendorIDsJSON),
		DurationUnit:            effectivePlan.DurationUnit,
		DurationValue:           effectivePlan.DurationValue,
		CustomSeconds:           effectivePlan.CustomSeconds,
		StartTime:               now.Unix(),
		EndTime:                 endUnix,
		Status:                  "active",
		Source:                  source,
		LastResetTime:           lastReset,
		NextResetTime:           nextReset,
		UpgradeGroup:            upgradeGroup,
		PrevUserGroup:           prevGroup,
		CreatedAt:               common.GetTimestamp(),
		UpdatedAt:               common.GetTimestamp(),
	}
	if err := tx.Create(sub).Error; err != nil {
		return nil, err
	}
	if err := tx.Model(&SubscriptionPlan{}).
		Where("id = ?", lockedPlan.Id).
		Update("sold_count", gorm.Expr("sold_count + ?", 1)).Error; err != nil {
		return nil, err
	}
	lockedPlan.SoldCount++
	InvalidateSubscriptionPlanCache(lockedPlan.Id)
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
		plan := order.SnapshotPlan()
		var planErr error
		if plan == nil {
			plan, planErr = GetSubscriptionPlanById(order.PlanId)
			if planErr != nil {
				return planErr
			}
			if !plan.Enabled {
				// still allow completion for already purchased orders
			}
		}
		upgradeGroup = strings.TrimSpace(plan.UpgradeGroup)
		order.Status = common.TopUpStatusSuccess
		order.CompleteTime = common.GetTimestamp()
		order.PlanDeliveryMode = normalizeSubscriptionDeliveryMode(plan.DeliveryMode)
		order.FulfillmentStatus = SubscriptionFulfillmentNotRequired
		if order.PlanDeliveryMode == SubscriptionDeliveryModeManualDelivery {
			order.FulfillmentStatus = SubscriptionFulfillmentPending
		}
		if providerPayload != "" {
			order.ProviderPayload = providerPayload
		}
		if order.PlanDeliveryMode == SubscriptionDeliveryModeManualDelivery {
			if err := tx.Save(&order).Error; err != nil {
				return err
			}
			logUserId = order.UserId
			logPlanTitle = plan.Title
			logMoney = order.Money
			logPaymentMethod = order.PaymentMethod
			return nil
		}
		sub, planErr := CreateUserSubscriptionFromPlanTx(tx, order.UserId, plan, "order")
		if planErr != nil {
			return planErr
		}
		if err := tx.Model(sub).Updates(map[string]any{
			"source_order_id":             order.Id,
			"source_order_trade_no":       order.TradeNo,
			"source_order_payment_method": order.PaymentMethod,
			"source_order_money":          order.Money,
			"updated_at":                  common.GetTimestamp(),
		}).Error; err != nil {
			return err
		}
		sub.SourceOrderId = order.Id
		sub.SourceOrderTradeNo = order.TradeNo
		sub.SourceOrderPaymentMethod = order.PaymentMethod
		sub.SourceOrderMoney = order.Money
		if err := upsertSubscriptionTopUpTx(tx, &order); err != nil {
			return err
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

func SyncActiveSubscriptionsForPlanTx(tx *gorm.DB, planId int) error {
	if tx == nil {
		return errors.New("tx is nil")
	}
	if planId <= 0 {
		return errors.New("invalid planId")
	}
	plan, err := getSubscriptionPlanByIdForUpdateTx(tx, planId)
	if err != nil {
		return err
	}
	now := GetDBTimestampWithTx(tx)
	var subs []UserSubscription
	if err := tx.Where("plan_id = ? AND status = ? AND end_time > ?", planId, "active", now).
		Find(&subs).Error; err != nil {
		return err
	}
	for i := range subs {
		sub := subs[i]
		if !syncSubscriptionPlanSnapshotFields(&sub, plan, now) {
			continue
		}
		if err := tx.Save(&sub).Error; err != nil {
			return err
		}
	}
	return nil
}

func RefreshActiveSubscriptionResetWindows(batchSize int) (int, error) {
	if batchSize <= 0 {
		batchSize = 500
	}
	now := GetDBTimestamp()
	totalUpdated := 0
	lastID := 0
	for {
		var subs []UserSubscription
		if err := DB.Where("id > ? AND status = ? AND end_time > ?", lastID, "active", now).
			Order("id asc").
			Limit(batchSize).
			Find(&subs).Error; err != nil {
			return totalUpdated, err
		}
		if len(subs) == 0 {
			return totalUpdated, nil
		}
		for i := range subs {
			sub := subs[i]
			lastID = sub.Id
			originalStatus := sub.Status
			baseUnix := sub.LastResetTime
			if baseUnix <= 0 {
				baseUnix = sub.StartTime
			}
			updates := map[string]interface{}{}
			windowChanged := recalculateSubscriptionResetWindow(&sub, now)
			advanced := sub.LastResetTime > baseUnix && sub.LastResetTime <= now
			if advanced {
				sub.AmountUsed = 0
				if hasSeparatePeriodRequestCounter(&sub) {
					sub.RequestCountPeriodUsed = 0
				} else {
					sub.RequestCountUsed = 0
				}
			}
			usageChanged, err := reconcileUserSubscriptionUsageFromLogs(&sub, now)
			if err != nil {
				return totalUpdated, err
			}
			nextStatus := deriveUserSubscriptionStatus(&sub, now)
			statusChanged := nextStatus != originalStatus
			sub.Status = nextStatus
			if !windowChanged && !advanced && !usageChanged && !statusChanged {
				continue
			}
			if windowChanged {
				updates["last_reset_time"] = sub.LastResetTime
				updates["next_reset_time"] = sub.NextResetTime
			}
			if advanced || usageChanged {
				updates["amount_used"] = sub.AmountUsed
				updates["request_count_used"] = sub.RequestCountUsed
				updates["request_count_period_used"] = sub.RequestCountPeriodUsed
			}
			if statusChanged {
				updates["status"] = sub.Status
			}
			updates["updated_at"] = common.GetTimestamp()
			if err := DB.Model(&UserSubscription{}).Where("id = ?", sub.Id).Updates(updates).Error; err != nil {
				return totalUpdated, err
			}
			totalUpdated++
		}
		if len(subs) < batchSize {
			return totalUpdated, nil
		}
	}
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
	msg, _, err := AdminBindSubscriptionWithResult(userId, planId, sourceNote)
	return msg, err
}

func AdminBindSubscriptionWithResult(userId int, planId int, sourceNote string) (string, *UserSubscription, error) {
	if userId <= 0 || planId <= 0 {
		return "", nil, errors.New("invalid userId or planId")
	}
	plan, err := GetSubscriptionPlanById(planId)
	if err != nil {
		return "", nil, err
	}
	var createdSub *UserSubscription
	isManualDelivery := normalizeSubscriptionDeliveryMode(plan.DeliveryMode) == SubscriptionDeliveryModeManualDelivery
	source := strings.TrimSpace(sourceNote)
	if source == "" {
		source = "admin"
	}
	err = DB.Transaction(func(tx *gorm.DB) error {
		if isManualDelivery {
			tradeNo, err := buildManualDeliveryTradeNo("admin")
			if err != nil {
				return err
			}
			now := common.GetTimestamp()
			order := &SubscriptionOrder{
				UserId:        userId,
				PlanId:        plan.Id,
				Money:         0,
				TradeNo:       tradeNo,
				PaymentMethod: "admin",
				Status:        common.TopUpStatusSuccess,
				CreateTime:    now,
				CompleteTime:  now,
			}
			order.ApplyPlanSnapshot(plan)
			return tx.Create(order).Error
		}
		sub, err := CreateUserSubscriptionFromPlanTx(tx, userId, plan, source)
		if err == nil {
			createdSub = sub
		}
		return err
	})
	if err != nil {
		return "", nil, err
	}
	if isManualDelivery {
		return "已创建人工发放订单，请在人工发放列表中完成发放", nil, nil
	}
	if strings.TrimSpace(plan.UpgradeGroup) != "" {
		_ = UpdateUserGroupCache(userId, plan.UpgradeGroup)
		return fmt.Sprintf("用户分组将升级到 %s", plan.UpgradeGroup), createdSub, nil
	}
	return "", createdSub, nil
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

func GetActiveUserSubscriptionGroups(userId int) ([]string, error) {
	if userId <= 0 {
		return nil, errors.New("invalid userId")
	}
	now := common.GetTimestamp()
	var subs []UserSubscription
	if err := DB.Select("upgrade_group").
		Where("user_id = ? AND status = ? AND (end_time = 0 OR end_time > ?)", userId, "active", now).
		Order("end_time asc, id asc").
		Find(&subs).Error; err != nil {
		return nil, err
	}
	groups := make([]string, 0, len(subs))
	seen := make(map[string]struct{}, len(subs))
	for i := range subs {
		group := strings.TrimSpace(subs[i].UpgradeGroup)
		if group == "" {
			continue
		}
		if _, ok := seen[group]; ok {
			continue
		}
		seen[group] = struct{}{}
		groups = append(groups, group)
	}
	return groups, nil
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

func HasUsableUserSubscription(userId int) (bool, error) {
	if userId <= 0 {
		return false, errors.New("invalid userId")
	}
	now := common.GetTimestamp()
	var subs []UserSubscription
	if err := DB.Select("id, status, end_time, resource_type, request_count_total, request_count_used, request_count_period_total, request_count_period_used, reset_period, amount_total, amount_used").
		Where("user_id = ? AND status = ? AND (end_time = 0 OR end_time > ?)", userId, "active", now).
		Order("end_time asc, id asc").
		Find(&subs).Error; err != nil {
		return false, err
	}
	for i := range subs {
		if isUserSubscriptionUsableNow(&subs[i], now) {
			return true, nil
		}
	}
	return false, nil
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

func GetUserSubscriptionsByAdmin(userId int, pageInfo *common.PageInfo, keyword string, status string, startTimestamp int64, endTimestamp int64) ([]SubscriptionSummary, int64, error) {
	if userId <= 0 {
		return nil, 0, errors.New("invalid userId")
	}
	if pageInfo == nil {
		pageInfo = &common.PageInfo{Page: 1, PageSize: common.ItemsPerPage}
	}

	keyword = strings.TrimSpace(keyword)
	status = strings.TrimSpace(status)
	now := common.GetTimestamp()

	query := DB.Model(&UserSubscription{}).Where("user_id = ?", userId)
	if keyword != "" {
		if keywordInt, err := strconv.Atoi(keyword); err == nil {
			query = query.Where("id = ? OR plan_id = ?", keywordInt, keywordInt)
		} else {
			like := "%" + keyword + "%"
			query = query.Where("source LIKE ? OR status LIKE ?", like, like)
		}
	}

	switch status {
	case "active":
		query = query.Where("status = ? AND end_time > ?", "active", now)
	case "expired":
		query = query.Where("(status = ? OR (status = ? AND end_time <= ?))", "expired", "active", now)
	case "cancelled":
		query = query.Where("status = ?", "cancelled")
	}

	if startTimestamp > 0 {
		query = query.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp > 0 {
		query = query.Where("created_at <= ?", endTimestamp)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var subs []UserSubscription
	if err := query.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&subs).Error; err != nil {
		return nil, 0, err
	}

	return buildSubscriptionSummaries(subs), total, nil
}

func GetUserManualDeliveryOrders(userId int) ([]SubscriptionManualDeliverySummary, error) {
	if userId <= 0 {
		return nil, errors.New("invalid userId")
	}
	var orders []SubscriptionOrder
	if err := DB.Where("user_id = ? AND plan_delivery_mode = ? AND status = ?",
		userId, SubscriptionDeliveryModeManualDelivery, common.TopUpStatusSuccess).
		Order("id desc").
		Find(&orders).Error; err != nil {
		return nil, err
	}
	items := make([]SubscriptionManualDeliverySummary, 0, len(orders))
	for i := range orders {
		summary, err := buildSelfManualDeliverySummary(&orders[i])
		if err != nil {
			return nil, err
		}
		if summary != nil {
			items = append(items, *summary)
		}
	}
	return items, nil
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

func isUserSubscriptionActive(sub *UserSubscription, now int64) bool {
	if sub == nil {
		return false
	}
	return sub.Status == "active" && sub.EndTime > now
}

func getUserSubscriptionStatusForQuery(sub *UserSubscription, now int64) string {
	if sub == nil {
		return ""
	}
	if sub.Status == "cancelled" {
		return "cancelled"
	}
	if isUserSubscriptionActive(sub, now) {
		return "active"
	}
	return "expired"
}

func buildSubscriptionSummaries(subs []UserSubscription) []SubscriptionSummary {
	if len(subs) == 0 {
		return []SubscriptionSummary{}
	}
	result := make([]SubscriptionSummary, 0, len(subs))
	for _, sub := range subs {
		subCopy := sub
		refundOrder, _ := buildSubscriptionRefundOrderSummaryFromSubscription(&subCopy, nil)
		result = append(result, SubscriptionSummary{
			Subscription: &subCopy,
			RefundOrder:  refundOrder,
		})
	}
	return result
}

func buildSubscriptionRefundOrderSummaryFromSubscription(sub *UserSubscription, tx *gorm.DB) (*SubscriptionRefundOrderSummary, error) {
	if sub == nil || sub.Source != "order" || strings.TrimSpace(sub.SourceOrderTradeNo) == "" {
		return nil, nil
	}
	summary := &SubscriptionRefundOrderSummary{
		OrderId:       sub.SourceOrderId,
		TradeNo:       strings.TrimSpace(sub.SourceOrderTradeNo),
		PaymentMethod: strings.TrimSpace(sub.SourceOrderPaymentMethod),
		Money:         sub.SourceOrderMoney,
	}
	topUpMap, err := buildTopUpMapByTradeNo([]string{summary.TradeNo}, tx)
	if err != nil {
		return nil, err
	}
	if topUp := topUpMap[summary.TradeNo]; topUp != nil {
		summary.TopUpId = topUp.Id
		summary.CompleteTime = topUp.CompleteTime
		if summary.PaymentMethod == "" {
			summary.PaymentMethod = topUp.PaymentMethod
		}
		if summary.Money <= 0 {
			summary.Money = topUp.Money
		}
	} else if summary.OrderId > 0 {
		db := DB
		if tx != nil {
			db = tx
		}
		var order SubscriptionOrder
		if err := db.Select("complete_time").Where("id = ?", summary.OrderId).First(&order).Error; err == nil {
			summary.CompleteTime = order.CompleteTime
		}
	}
	return summary, nil
}

func buildSubscriptionRefundOrderSummaryFromOrder(order *SubscriptionOrder, tx *gorm.DB) (*SubscriptionRefundOrderSummary, error) {
	if order == nil || strings.TrimSpace(order.TradeNo) == "" {
		return nil, nil
	}
	summary := &SubscriptionRefundOrderSummary{
		OrderId:       order.Id,
		TradeNo:       strings.TrimSpace(order.TradeNo),
		PaymentMethod: strings.TrimSpace(order.PaymentMethod),
		Money:         order.Money,
		CompleteTime:  order.CompleteTime,
	}
	topUpMap, err := buildTopUpMapByTradeNo([]string{summary.TradeNo}, tx)
	if err != nil {
		return nil, err
	}
	if topUp := topUpMap[summary.TradeNo]; topUp != nil {
		summary.TopUpId = topUp.Id
		if summary.PaymentMethod == "" {
			summary.PaymentMethod = topUp.PaymentMethod
		}
		if summary.Money <= 0 {
			summary.Money = topUp.Money
		}
		if summary.CompleteTime <= 0 {
			summary.CompleteTime = topUp.CompleteTime
		}
	}
	return summary, nil
}

type adminUserSubscriptionListRow struct {
	UserSubscription
	Username  string `gorm:"column:username"`
	UserGroup string `gorm:"column:user_group"`
}

type adminManualDeliveryOrderListRow struct {
	SubscriptionOrder
	Username  string `gorm:"column:username"`
	UserGroup string `gorm:"column:user_group"`
}

func buildTopUpMapByTradeNo(tradeNos []string, tx *gorm.DB) (map[string]*TopUp, error) {
	if len(tradeNos) == 0 {
		return map[string]*TopUp{}, nil
	}
	db := DB
	if tx != nil {
		db = tx
	}
	var topUps []TopUp
	if err := db.Where("trade_no IN ?", tradeNos).Find(&topUps).Error; err != nil {
		return nil, err
	}
	result := make(map[string]*TopUp, len(topUps))
	for i := range topUps {
		topUpCopy := topUps[i]
		result[topUpCopy.TradeNo] = &topUpCopy
	}
	return result, nil
}

func validateManualDeliveryPayload(schema []SubscriptionDeliveryField, payload []SubscriptionDeliveryPayloadItem) ([]SubscriptionDeliveryPayloadItem, error) {
	normalizedSchema := normalizeSubscriptionDeliveryFields(schema)
	if len(normalizedSchema) == 0 {
		return nil, errors.New("该套餐未配置交付字段模板")
	}
	schemaMap := make(map[string]SubscriptionDeliveryField, len(normalizedSchema))
	for _, field := range normalizedSchema {
		schemaMap[field.Key] = field
	}
	payloadMap := make(map[string]SubscriptionDeliveryPayloadItem, len(payload))
	for _, item := range normalizeSubscriptionDeliveryPayload(payload) {
		field, ok := schemaMap[item.Key]
		if !ok {
			continue
		}
		payloadMap[item.Key] = SubscriptionDeliveryPayloadItem{
			Key:      field.Key,
			Label:    field.Label,
			Type:     field.Type,
			Value:    strings.TrimSpace(item.Value),
			Masked:   field.Masked,
			Copyable: field.Copyable,
		}
	}
	result := make([]SubscriptionDeliveryPayloadItem, 0, len(normalizedSchema))
	for _, field := range normalizedSchema {
		item, ok := payloadMap[field.Key]
		if !ok {
			if field.Required && !subscriptionDeliveryFieldIsAutoFilled(field.Key) {
				return nil, fmt.Errorf("请填写交付字段：%s", field.Label)
			}
			continue
		}
		if strings.TrimSpace(item.Value) == "" {
			if field.Required && !subscriptionDeliveryFieldIsAutoFilled(field.Key) {
				return nil, fmt.Errorf("请填写交付字段：%s", field.Label)
			}
			continue
		}
		result = append(result, item)
	}
	if len(result) == 0 {
		if subscriptionDeliverySchemaHasOnlyAutoFilledFields(schemaMap) {
			return result, nil
		}
		return nil, errors.New("请至少填写一项交付信息")
	}
	return result, nil
}

func subscriptionDeliveryFieldIsAutoFilled(key string) bool {
	switch strings.TrimSpace(key) {
	case "api_key", "base_url", "usage_query_url":
		return true
	default:
		return false
	}
}

func subscriptionDeliverySchemaHasOnlyAutoFilledFields(schemaMap map[string]SubscriptionDeliveryField) bool {
	if len(schemaMap) == 0 {
		return false
	}
	for key := range schemaMap {
		if !subscriptionDeliveryFieldIsAutoFilled(key) {
			return false
		}
	}
	return true
}

func buildManualDeliveryPlan(order *SubscriptionOrder) *SubscriptionPlan {
	if order == nil {
		return nil
	}
	plan := order.SnapshotPlan()
	if plan == nil {
		return nil
	}
	ApplySubscriptionPlanRestrictionFields([]*SubscriptionPlan{plan})
	return plan
}

func buildManualDeliverySummary(order *SubscriptionOrder, username string, userGroup string) (*AdminSubscriptionManualDeliverySummary, error) {
	if order == nil {
		return nil, nil
	}
	ApplySubscriptionOrderDeliveryFields(order)
	refundOrder, err := buildSubscriptionRefundOrderSummaryFromOrder(order, nil)
	if err != nil {
		return nil, err
	}
	return &AdminSubscriptionManualDeliverySummary{
		Order:       order,
		Plan:        buildManualDeliveryPlan(order),
		Username:    username,
		UserGroup:   userGroup,
		RefundOrder: refundOrder,
	}, nil
}

func buildSelfManualDeliverySummary(order *SubscriptionOrder) (*SubscriptionManualDeliverySummary, error) {
	if order == nil {
		return nil, nil
	}
	ApplySubscriptionOrderDeliveryFields(order)
	refundOrder, err := buildSubscriptionRefundOrderSummaryFromOrder(order, nil)
	if err != nil {
		return nil, err
	}
	return &SubscriptionManualDeliverySummary{
		Order:       order,
		Plan:        buildManualDeliveryPlan(order),
		RefundOrder: refundOrder,
	}, nil
}

func GetAdminUserSubscriptions(
	pageInfo *common.PageInfo,
	subscriptionId int,
	username string,
	userGroup string,
	upgradeGroup string,
	status string,
	planId int,
	source string,
	resourceType string,
	timeField string,
	startTimestamp int64,
	endTimestamp int64,
) ([]AdminUserSubscriptionSummary, int64, error) {
	if pageInfo == nil {
		pageInfo = &common.PageInfo{Page: 1, PageSize: common.ItemsPerPage}
	}
	subscriptionId = max(subscriptionId, 0)
	username = strings.TrimSpace(username)
	userGroup = strings.TrimSpace(userGroup)
	upgradeGroup = strings.TrimSpace(upgradeGroup)
	status = strings.TrimSpace(status)
	source = strings.TrimSpace(source)
	resourceType = strings.TrimSpace(resourceType)
	if resourceType != "" {
		resourceType = NormalizeSubscriptionResourceType(resourceType)
	}
	timeField = strings.TrimSpace(timeField)
	now := common.GetTimestamp()

	baseQuery := DB.Table("user_subscriptions").
		Select("user_subscriptions.*, users.username as username, users." + commonGroupCol + " as user_group").
		Joins("left join users on users.id = user_subscriptions.user_id")

	if subscriptionId > 0 {
		baseQuery = baseQuery.Where("user_subscriptions.id = ?", subscriptionId)
	}
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
	if upgradeGroup != "" {
		baseQuery = baseQuery.Where("user_subscriptions.upgrade_group = ?", upgradeGroup)
	}
	if planId > 0 {
		baseQuery = baseQuery.Where("user_subscriptions.plan_id = ?", planId)
	}
	if source != "" {
		baseQuery = baseQuery.Where("user_subscriptions.source = ?", source)
	}
	if resourceType != "" {
		baseQuery = baseQuery.Where("user_subscriptions.resource_type = ?", resourceType)
	}
	switch status {
	case "active":
		baseQuery = baseQuery.Where("user_subscriptions.status = ? AND user_subscriptions.end_time > ?", "active", now)
	case "expired":
		baseQuery = baseQuery.Where("(user_subscriptions.status = ? OR (user_subscriptions.status = ? AND user_subscriptions.end_time <= ?))", "expired", "active", now)
	case "cancelled":
		baseQuery = baseQuery.Where("user_subscriptions.status = ?", "cancelled")
	}
	timeColumn := "user_subscriptions.created_at"
	switch timeField {
	case "start_time":
		timeColumn = "user_subscriptions.start_time"
	case "end_time":
		timeColumn = "user_subscriptions.end_time"
	}
	if startTimestamp > 0 {
		baseQuery = baseQuery.Where(timeColumn+" >= ?", startTimestamp)
	}
	if endTimestamp > 0 {
		baseQuery = baseQuery.Where(timeColumn+" <= ?", endTimestamp)
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
		refundOrder, err := buildSubscriptionRefundOrderSummaryFromSubscription(&subCopy, nil)
		if err != nil {
			return nil, 0, err
		}
		items = append(items, AdminUserSubscriptionSummary{
			Subscription: &subCopy,
			Username:     row.Username,
			UserGroup:    row.UserGroup,
			RefundOrder:  refundOrder,
		})
	}
	return items, total, nil
}

func GetAdminManualDeliveryOrders(pageInfo *common.PageInfo, keyword string, fulfillmentStatus string) ([]AdminSubscriptionManualDeliverySummary, int64, error) {
	if pageInfo == nil {
		pageInfo = &common.PageInfo{Page: 1, PageSize: common.ItemsPerPage}
	}
	keyword = strings.TrimSpace(keyword)
	fulfillmentStatus = normalizeSubscriptionFulfillmentStatus(fulfillmentStatus)
	baseQuery := DB.Table("subscription_orders").
		Select("subscription_orders.*, users.username as username, users."+commonGroupCol+" as user_group").
		Joins("left join users on users.id = subscription_orders.user_id").
		Where("subscription_orders.plan_delivery_mode = ? AND subscription_orders.status = ?",
			SubscriptionDeliveryModeManualDelivery, common.TopUpStatusSuccess)

	if keyword != "" {
		like := "%" + keyword + "%"
		if keywordInt, err := strconv.Atoi(keyword); err == nil {
			baseQuery = baseQuery.Where("subscription_orders.id = ? OR subscription_orders.user_id = ? OR subscription_orders.plan_id = ? OR users.id = ? OR users.username LIKE ? OR subscription_orders.trade_no LIKE ? OR subscription_orders.plan_title LIKE ?",
				keywordInt, keywordInt, keywordInt, keywordInt, like, like, like)
		} else {
			baseQuery = baseQuery.Where("users.username LIKE ? OR subscription_orders.trade_no LIKE ? OR subscription_orders.plan_title LIKE ?",
				like, like, like)
		}
	}
	if strings.TrimSpace(fulfillmentStatus) != "" && fulfillmentStatus != SubscriptionFulfillmentNotRequired {
		baseQuery = baseQuery.Where("subscription_orders.fulfillment_status = ?", fulfillmentStatus)
	}

	var total int64
	if err := baseQuery.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var rows []adminManualDeliveryOrderListRow
	if err := baseQuery.
		Order("subscription_orders.id desc").
		Limit(pageInfo.GetPageSize()).
		Offset(pageInfo.GetStartIdx()).
		Find(&rows).Error; err != nil {
		return nil, 0, err
	}

	items := make([]AdminSubscriptionManualDeliverySummary, 0, len(rows))
	for i := range rows {
		orderCopy := rows[i].SubscriptionOrder
		summary, err := buildManualDeliverySummary(&orderCopy, rows[i].Username, rows[i].UserGroup)
		if err != nil {
			return nil, 0, err
		}
		if summary != nil {
			items = append(items, *summary)
		}
	}
	return items, total, nil
}

func AdminDeliverManualDeliveryOrder(orderId int, adminId int, payload []SubscriptionDeliveryPayloadItem, adminRemark string) (*SubscriptionOrder, error) {
	if orderId <= 0 {
		return nil, errors.New("invalid orderId")
	}
	var result SubscriptionOrder
	var upgradeGroup string
	var targetUserId int
	err := DB.Transaction(func(tx *gorm.DB) error {
		var order SubscriptionOrder
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where("id = ?", orderId).First(&order).Error; err != nil {
			return err
		}
		if order.PlanDeliveryMode != SubscriptionDeliveryModeManualDelivery {
			return errors.New("该订单不是人工发放套餐")
		}
		if order.Status != common.TopUpStatusSuccess {
			return errors.New("仅已支付成功的订单可发放")
		}
		if normalizeSubscriptionFulfillmentStatus(order.FulfillmentStatus) == SubscriptionFulfillmentDelivered {
			return errors.New("该订单已发放")
		}
		schema := decodeSubscriptionDeliveryFields(order.PlanDeliveryFieldSchemaJSON)
		if len(schema) == 0 {
			plan := order.SnapshotPlan()
			if plan != nil {
				schema = decodeSubscriptionDeliveryFields(plan.DeliveryFieldSchemaJSON)
			}
		}
		normalizedPayload, err := validateManualDeliveryPayload(schema, payload)
		if err != nil {
			return err
		}
		now := common.GetTimestamp()

		// Only the standard Claude manual-delivery template should trigger
		// automatic channel-pool allocation and token issuance.
		if isAutoIssuedSubscriptionDeliverySchema(schema) {
			if resolveSubscriptionDeliveryBaseURL() == "" {
				return errors.New("当前未配置站点地址(ServerAddress)，无法自动发放套餐")
			}
			planTag := subscriptionPlanChannelPoolTag(order.PlanId)
			if planTag == "" {
				return errors.New("无效的套餐ID，无法分配渠道池")
			}
			channel, keyIndex, err := allocateSubscriptionPlanChannelFromPoolTx(tx, planTag)
			if err != nil {
				return err
			}
			if channel == nil || channel.Id <= 0 {
				return errors.New("渠道池暂无可用 Key，请先补充渠道或释放占用")
			}

			plan := order.SnapshotPlan()
			if plan == nil {
				plan, err = getSubscriptionPlanByIdTx(tx, order.PlanId)
				if err != nil {
					return err
				}
			}
			targetUserId = order.UserId
			if plan != nil {
				upgradeGroup = strings.TrimSpace(plan.UpgradeGroup)
			}

			sub, err := CreateUserSubscriptionFromPlanTx(tx, order.UserId, plan, "order")
			if err != nil {
				return err
			}
			if err := tx.Model(sub).Updates(map[string]any{
				"source_order_id":             order.Id,
				"source_order_trade_no":       order.TradeNo,
				"source_order_payment_method": order.PaymentMethod,
				"source_order_money":          order.Money,
				"updated_at":                  common.GetTimestamp(),
			}).Error; err != nil {
				return err
			}
			if err := upsertSubscriptionTopUpTx(tx, &order); err != nil {
				return err
			}

			allowedModels := decodeSubscriptionStringList(order.PlanAllowedModelsJSON)
			if len(allowedModels) == 0 && plan != nil {
				allowedModels = decodeSubscriptionStringList(plan.AllowedModelsJSON)
			}

			key, err := common.GenerateKey()
			if err != nil {
				return err
			}
			token := Token{
				UserId:                  order.UserId,
				Name:                    fmt.Sprintf("%s #%d", strings.TrimSpace(order.PlanTitle), order.Id),
				Key:                     key,
				SpecificChannelId:       channel.Id,
				SpecificChannelKeyIndex: keyIndex,
				CreatedTime:             now,
				AccessedTime:            now,
				ExpiredTime:             sub.EndTime,
				UnlimitedQuota:          true,
				Group:                   "default",
			}
			if len(allowedModels) > 0 {
				token.ModelLimitsEnabled = true
				token.ModelLimits = strings.Join(allowedModels, ",")
			}
			if err := tx.Create(&token).Error; err != nil {
				return err
			}
			if common.RedisEnabled {
				gopool.Go(func() {
					_ = cacheSetToken(token)
				})
			}

			normalizedPayload = upsertSubscriptionDeliveryPayloadValue(normalizedPayload, schema, "api_key", "sk-"+token.Key)
		}

		normalizedPayload = upsertSubscriptionDeliveryPayloadValue(normalizedPayload, schema, "base_url", resolveSubscriptionDeliveryBaseURL())
		normalizedPayload = upsertSubscriptionDeliveryPayloadValue(normalizedPayload, schema, "usage_query_url", "https://api-key-tool.fishxcode.com/")

		payloadJSON, err := encodeSubscriptionDeliveryPayload(normalizedPayload)
		if err != nil {
			return err
		}
		updates := map[string]any{
			"fulfillment_status":    SubscriptionFulfillmentDelivered,
			"delivery_payload_json": payloadJSON,
			"delivery_admin_remark": strings.TrimSpace(adminRemark),
			"delivered_by":          adminId,
			"delivered_at":          now,
		}
		if err := tx.Model(&SubscriptionOrder{}).Where("id = ?", orderId).Updates(updates).Error; err != nil {
			return err
		}
		if err := tx.Where("id = ?", orderId).First(&result).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	if upgradeGroup != "" && targetUserId > 0 {
		_ = UpdateUserGroupCache(targetUserId, upgradeGroup)
	}
	ApplySubscriptionOrderDeliveryFields(&result)
	return &result, nil
}

func subscriptionPlanChannelPoolTag(planId int) string {
	if planId <= 0 {
		return ""
	}
	return fmt.Sprintf("subscription_plan:%d", planId)
}

func subscriptionDeliverySchemaHasKey(schema []SubscriptionDeliveryField, key string) bool {
	key = strings.TrimSpace(key)
	if key == "" || len(schema) == 0 {
		return false
	}
	for _, f := range schema {
		if strings.TrimSpace(f.Key) == key {
			return true
		}
	}
	return false
}

func isAutoIssuedSubscriptionDeliverySchema(schema []SubscriptionDeliveryField) bool {
	return subscriptionDeliverySchemaHasKey(schema, "api_key") &&
		subscriptionDeliverySchemaHasKey(schema, "base_url") &&
		subscriptionDeliverySchemaHasKey(schema, "usage_query_url")
}

func allocateSubscriptionPlanChannelFromPoolTx(tx *gorm.DB, tag string) (*Channel, int, error) {
	if tx == nil {
		return nil, -1, errors.New("tx is nil")
	}
	tag = strings.TrimSpace(tag)
	if tag == "" {
		return nil, -1, errors.New("tag is empty")
	}
	type boundKeyBinding struct {
		SpecificChannelId       int
		SpecificChannelKeyIndex int
	}
	var bindings []boundKeyBinding
	if err := tx.Model(&Token{}).
		Select("specific_channel_id", "specific_channel_key_index").
		Where("specific_channel_id > 0 AND deleted_at IS NULL").
		Find(&bindings).Error; err != nil {
		return nil, -1, err
	}
	usedKeyMap := make(map[string]struct{}, len(bindings))
	usedWholeChannel := make(map[int]struct{})
	for _, binding := range bindings {
		if binding.SpecificChannelId <= 0 {
			continue
		}
		if binding.SpecificChannelKeyIndex < 0 {
			usedWholeChannel[binding.SpecificChannelId] = struct{}{}
			continue
		}
		usedKeyMap[fmt.Sprintf("%d:%d", binding.SpecificChannelId, binding.SpecificChannelKeyIndex)] = struct{}{}
	}

	var channels []Channel
	if err := tx.Set("gorm:query_option", "FOR UPDATE").
		Where("tag = ? AND status = ?", tag, common.ChannelStatusEnabled).
		Order("id asc").
		Find(&channels).Error; err != nil {
		return nil, -1, err
	}
	for i := range channels {
		channel := &channels[i]
		keys := channel.GetKeys()
		if len(keys) == 0 {
			continue
		}
		if !channel.ChannelInfo.IsMultiKey {
			if _, exists := usedWholeChannel[channel.Id]; exists {
				continue
			}
			if _, exists := usedKeyMap[fmt.Sprintf("%d:%d", channel.Id, 0)]; exists {
				continue
			}
			return channel, 0, nil
		}
		if _, exists := usedWholeChannel[channel.Id]; exists {
			continue
		}
		for keyIndex := range keys {
			if !channel.IsSpecificKeyAvailable(keyIndex) {
				continue
			}
			if _, exists := usedKeyMap[fmt.Sprintf("%d:%d", channel.Id, keyIndex)]; exists {
				continue
			}
			return channel, keyIndex, nil
		}
	}
	return nil, -1, nil
}

func upsertSubscriptionDeliveryPayloadValue(payload []SubscriptionDeliveryPayloadItem, schema []SubscriptionDeliveryField, key string, value string) []SubscriptionDeliveryPayloadItem {
	key = strings.TrimSpace(key)
	if key == "" {
		return payload
	}
	value = strings.TrimSpace(value)
	if value == "" {
		return payload
	}
	label := ""
	typ := ""
	masked := false
	copyable := false
	found := false
	for _, f := range schema {
		if strings.TrimSpace(f.Key) != key {
			continue
		}
		found = true
		label = f.Label
		typ = f.Type
		masked = f.Masked
		copyable = f.Copyable
		break
	}
	if !found {
		return payload
	}
	for i := range payload {
		if strings.TrimSpace(payload[i].Key) != key {
			continue
		}
		payload[i].Value = value
		if label != "" {
			payload[i].Label = label
		}
		if typ != "" {
			payload[i].Type = typ
		}
		payload[i].Masked = masked
		payload[i].Copyable = copyable
		return payload
	}
	item := SubscriptionDeliveryPayloadItem{
		Key:      key,
		Label:    label,
		Type:     typ,
		Value:    value,
		Masked:   masked,
		Copyable: copyable,
	}
	return append(payload, item)
}

func resolveSubscriptionDeliveryBaseURL() string {
	return strings.TrimRight(strings.TrimSpace(system_setting.ServerAddress), "/")
}

func AdminRejectManualDeliveryOrder(orderId int, adminId int, adminRemark string) (*SubscriptionOrder, error) {
	if orderId <= 0 {
		return nil, errors.New("invalid orderId")
	}
	var result SubscriptionOrder
	err := DB.Transaction(func(tx *gorm.DB) error {
		var order SubscriptionOrder
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where("id = ?", orderId).First(&order).Error; err != nil {
			return err
		}
		if order.PlanDeliveryMode != SubscriptionDeliveryModeManualDelivery {
			return errors.New("该订单不是人工发放套餐")
		}
		if order.Status != common.TopUpStatusSuccess {
			return errors.New("仅已支付成功的订单可拒绝")
		}
		if normalizeSubscriptionFulfillmentStatus(order.FulfillmentStatus) == SubscriptionFulfillmentDelivered {
			return errors.New("该订单已发放，不能拒绝")
		}
		now := common.GetTimestamp()
		updates := map[string]any{
			"fulfillment_status":    SubscriptionFulfillmentRejected,
			"delivery_admin_remark": strings.TrimSpace(adminRemark),
			"delivered_by":          adminId,
			"delivered_at":          now,
		}
		if err := tx.Model(&SubscriptionOrder{}).Where("id = ?", orderId).Updates(updates).Error; err != nil {
			return err
		}
		if err := tx.Where("id = ?", orderId).First(&result).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	ApplySubscriptionOrderDeliveryFields(&result)
	return &result, nil
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
		QuotaResetUseFixedClock: plan.QuotaResetUseFixedClock,
		QuotaResetFixedSeconds:  plan.QuotaResetFixedSeconds,
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
		UserId:                  source.UserId,
		PlanId:                  targetPlan.Id,
		AmountTotal:             amountTotal,
		AmountUsed:              amountUsed,
		ResourceType:            targetResourceType,
		RequestCountTotal:       requestCountTotal,
		RequestCountUsed:        requestCountUsed,
		RequestCountPeriodTotal: targetPlan.RequestCountPeriodTotal,
		RequestCountPeriodUsed:  source.RequestCountPeriodUsed,
		ResetPeriod:             NormalizeResetPeriod(targetPlan.QuotaResetPeriod),
		ResetCustomSeconds:      targetPlan.QuotaResetCustomSeconds,
		ResetUseFixedClock:      targetPlan.QuotaResetUseFixedClock,
		ResetFixedSeconds:       targetPlan.QuotaResetFixedSeconds,
		AllowedGroupsJSON:       strings.TrimSpace(targetPlan.AllowedGroupsJSON),
		AllowedModelsJSON:       strings.TrimSpace(targetPlan.AllowedModelsJSON),
		AllowedVendorIDsJSON:    strings.TrimSpace(targetPlan.AllowedVendorIDsJSON),
		DurationUnit:            targetPlan.DurationUnit,
		DurationValue:           targetPlan.DurationValue,
		CustomSeconds:           targetPlan.CustomSeconds,
		StartTime:               source.StartTime,
		EndTime:                 source.EndTime,
		Status:                  "active",
		Source:                  "migration",
		LastResetTime:           lastReset,
		NextResetTime:           nextReset,
		UpgradeGroup:            targetGroup,
		PrevUserGroup:           prevGroup,
		CreatedAt:               common.GetTimestamp(),
		UpdatedAt:               common.GetTimestamp(),
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
			newSub, newGroup, err := createMigratedUserSubscriptionTx(tx, &source, targetPlan, GetDBTimestampWithTx(tx))
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
		QuotaResetUseFixedClock: sub.ResetUseFixedClock,
		QuotaResetFixedSeconds:  sub.ResetFixedSeconds,
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
			if hasSeparatePeriodRequestCounter(&sub) {
				sub.RequestCountPeriodUsed = 0
			} else {
				sub.RequestCountUsed = 0
			}
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
	UserSubscriptionId       int
	PreConsumed              int64
	PreConsumedAmount        int64
	PreConsumedCount         int64
	AmountTotal              int64
	AmountUsedBefore         int64
	AmountUsedAfter          int64
	ResourceType             string
	RequestCountTotal        int64
	RequestCountPeriodTotal  int64
	RequestCountBefore       int64
	RequestCountAfter        int64
	RequestCountPeriodBefore int64
	RequestCountPeriodAfter  int64
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
	PreConsumedAmount  int64  `json:"pre_consumed_amount" gorm:"type:bigint;not null;default:0"`
	PreConsumedCount   int64  `json:"pre_consumed_count" gorm:"type:bigint;not null;default:0"`
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
	if NormalizeResetPeriod(sub.ResetPeriod) == SubscriptionResetNever {
		return nil
	}
	baseUnix := sub.LastResetTime
	if baseUnix <= 0 {
		baseUnix = sub.StartTime
	}
	oldLastResetTime := sub.LastResetTime
	oldNextResetTime := sub.NextResetTime
	recalculateSubscriptionResetWindow(sub, now)
	advanced := sub.LastResetTime > baseUnix && sub.LastResetTime <= now
	if !advanced {
		if sub.NextResetTime == 0 && (sub.LastResetTime != oldLastResetTime || sub.NextResetTime != oldNextResetTime) {
			return tx.Save(sub).Error
		}
		return nil
	}
	sub.AmountUsed = 0
	if hasSeparatePeriodRequestCounter(sub) {
		sub.RequestCountPeriodUsed = 0
	} else {
		sub.RequestCountUsed = 0
	}
	return tx.Save(sub).Error
}

func isUserSubscriptionEligibleForPreConsume(sub *UserSubscription, amount int64) (bool, int64, int64, string) {
	if sub == nil {
		return false, 0, 0, SubscriptionResourceQuota
	}
	resourceType := NormalizeSubscriptionResourceType(sub.ResourceType)
	requiredAmount := int64(0)
	requiredCount := int64(0)
	if sub.AmountTotal > 0 {
		requiredAmount = amount
		remain := sub.AmountTotal - sub.AmountUsed
		if remain < requiredAmount {
			return false, requiredAmount, requiredCount, resourceType
		}
	}
	if hasLifetimeRequestCountLimit(sub) {
		requiredCount = 1
		remain := sub.RequestCountTotal - sub.RequestCountUsed
		if remain < requiredCount {
			return false, requiredAmount, requiredCount, resourceType
		}
	}
	if periodLimit := getSubscriptionRequestCountPeriodLimit(sub); periodLimit > 0 {
		requiredCount = 1
		remain := periodLimit - getCurrentRequestCountUsed(sub)
		if remain < requiredCount {
			return false, requiredAmount, requiredCount, resourceType
		}
	}
	return true, requiredAmount, requiredCount, resourceType
}

func getUsableGroupsForUserGroup(userGroup string) map[string]string {
	groupsCopy := setting.GetUserUsableGroupsCopy()
	userGroup = strings.TrimSpace(userGroup)
	if userGroup == "" {
		return groupsCopy
	}
	if specialSettings, ok := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.Get(userGroup); ok {
		for specialGroup, desc := range specialSettings {
			if strings.HasPrefix(specialGroup, "-:") {
				delete(groupsCopy, strings.TrimPrefix(specialGroup, "-:"))
				continue
			}
			if strings.HasPrefix(specialGroup, "+:") {
				groupsCopy[strings.TrimPrefix(specialGroup, "+:")] = desc
				continue
			}
			groupsCopy[specialGroup] = desc
		}
	}
	if _, ok := groupsCopy[userGroup]; !ok {
		groupsCopy[userGroup] = "用户分组"
	}
	return groupsCopy
}

func doesUserSubscriptionMatchGroup(sub *UserSubscription, usingGroup string, currentUserGroup string) bool {
	if sub == nil {
		return false
	}
	subGroup := strings.TrimSpace(sub.UpgradeGroup)
	usingGroup = strings.TrimSpace(usingGroup)
	currentUserGroup = strings.TrimSpace(currentUserGroup)
	if subGroup == "" || usingGroup == "" {
		return true
	}
	if subGroup == usingGroup {
		return true
	}
	if currentUserGroup == "" {
		return false
	}
	if currentUserGroup == subGroup {
		_, ok := getUsableGroupsForUserGroup(currentUserGroup)[usingGroup]
		return ok
	}
	_, ok := getUsableGroupsForUserGroup(subGroup)[usingGroup]
	return ok
}

func doesUserSubscriptionMatchAllowedGroup(sub *UserSubscription, usingGroup string) bool {
	allowedGroups := decodeUserSubscriptionAllowedGroups(sub)
	if len(allowedGroups) == 0 {
		return true
	}
	usingGroup = strings.TrimSpace(usingGroup)
	if usingGroup == "" {
		return false
	}
	for _, group := range allowedGroups {
		if group == usingGroup {
			return true
		}
	}
	return false
}

func doesUserSubscriptionMatchAllowedModel(sub *UserSubscription, modelName string) bool {
	allowedModels := decodeUserSubscriptionAllowedModels(sub)
	if len(allowedModels) == 0 {
		return true
	}
	modelName = strings.TrimSpace(modelName)
	if modelName == "" {
		return false
	}
	for _, allowedModel := range allowedModels {
		if allowedModel == modelName {
			return true
		}
	}
	return false
}

func doesUserSubscriptionMatchAllowedVendor(sub *UserSubscription, vendorID int) bool {
	allowedVendorIDs := decodeUserSubscriptionAllowedVendorIDs(sub)
	if len(allowedVendorIDs) == 0 {
		return true
	}
	if vendorID <= 0 {
		return false
	}
	for _, allowedVendorID := range allowedVendorIDs {
		if allowedVendorID == vendorID {
			return true
		}
	}
	return false
}

func applyUserSubscriptionPreConsumeTx(tx *gorm.DB, requestId string, userId int, sub *UserSubscription, requiredAmount int64, requiredCount int64, resourceType string, returnValue *SubscriptionPreConsumeResult) error {
	if tx == nil || sub == nil || returnValue == nil {
		return errors.New("invalid pre-consume args")
	}
	usedBefore := sub.AmountUsed
	requestCountBefore := sub.RequestCountUsed
	requestCountPeriodBefore := sub.RequestCountPeriodUsed
	primaryPreConsumed := requiredAmount
	if primaryPreConsumed <= 0 {
		primaryPreConsumed = requiredCount
	}
	record := &SubscriptionPreConsumeRecord{
		RequestId:          requestId,
		UserId:             userId,
		UserSubscriptionId: sub.Id,
		PreConsumed:        primaryPreConsumed,
		PreConsumedAmount:  requiredAmount,
		PreConsumedCount:   requiredCount,
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
			returnValue.PreConsumedAmount = dup.PreConsumedAmount
			returnValue.PreConsumedCount = dup.PreConsumedCount
			returnValue.AmountTotal = sub.AmountTotal
			returnValue.AmountUsedBefore = sub.AmountUsed
			returnValue.AmountUsedAfter = sub.AmountUsed
			returnValue.ResourceType = resourceType
			returnValue.RequestCountTotal = sub.RequestCountTotal
			returnValue.RequestCountPeriodTotal = sub.RequestCountPeriodTotal
			returnValue.RequestCountBefore = sub.RequestCountUsed
			returnValue.RequestCountAfter = sub.RequestCountUsed
			returnValue.RequestCountPeriodBefore = sub.RequestCountPeriodUsed
			returnValue.RequestCountPeriodAfter = sub.RequestCountPeriodUsed
			return nil
		}
		return err
	}
	if requiredCount > 0 {
		if hasLifetimeRequestCountLimit(sub) || !hasSeparatePeriodRequestCounter(sub) {
			sub.RequestCountUsed += requiredCount
		}
		if hasSeparatePeriodRequestCounter(sub) {
			sub.RequestCountPeriodUsed += requiredCount
		}
	}
	if requiredAmount > 0 {
		sub.AmountUsed += requiredAmount
	}
	if err := tx.Save(sub).Error; err != nil {
		return err
	}
	returnValue.UserSubscriptionId = sub.Id
	returnValue.PreConsumed = primaryPreConsumed
	returnValue.PreConsumedAmount = requiredAmount
	returnValue.PreConsumedCount = requiredCount
	returnValue.AmountTotal = sub.AmountTotal
	returnValue.AmountUsedBefore = usedBefore
	returnValue.AmountUsedAfter = sub.AmountUsed
	returnValue.ResourceType = resourceType
	returnValue.RequestCountTotal = sub.RequestCountTotal
	returnValue.RequestCountPeriodTotal = sub.RequestCountPeriodTotal
	returnValue.RequestCountBefore = requestCountBefore
	returnValue.RequestCountAfter = sub.RequestCountUsed
	returnValue.RequestCountPeriodBefore = requestCountPeriodBefore
	returnValue.RequestCountPeriodAfter = sub.RequestCountPeriodUsed
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
			returnValue.PreConsumedAmount = existing.PreConsumedAmount
			returnValue.PreConsumedCount = existing.PreConsumedCount
			returnValue.AmountTotal = sub.AmountTotal
			returnValue.AmountUsedBefore = sub.AmountUsed
			returnValue.AmountUsedAfter = sub.AmountUsed
			returnValue.ResourceType = NormalizeSubscriptionResourceType(sub.ResourceType)
			returnValue.RequestCountTotal = sub.RequestCountTotal
			returnValue.RequestCountPeriodTotal = sub.RequestCountPeriodTotal
			returnValue.RequestCountBefore = sub.RequestCountUsed
			returnValue.RequestCountAfter = sub.RequestCountUsed
			returnValue.RequestCountPeriodBefore = sub.RequestCountPeriodUsed
			returnValue.RequestCountPeriodAfter = sub.RequestCountPeriodUsed
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
		currentUserGroup, err := getUserGroupByIdTx(tx, userId)
		if err != nil {
			return err
		}
		resolvedVendorID := getVendorIDByModelNameTx(tx, modelName)
		requestCountCandidates := make([]UserSubscription, 0, len(subs))
		quotaCandidates := make([]UserSubscription, 0, len(subs))
		for _, candidate := range subs {
			sub := candidate
			if !doesUserSubscriptionMatchGroup(&sub, usingGroup, currentUserGroup) {
				continue
			}
			if !doesUserSubscriptionMatchAllowedGroup(&sub, usingGroup) {
				continue
			}
			if !doesUserSubscriptionMatchAllowedModel(&sub, modelName) {
				continue
			}
			if !doesUserSubscriptionMatchAllowedVendor(&sub, resolvedVendorID) {
				continue
			}
			plan, err := getSubscriptionPlanByIdTx(tx, sub.PlanId)
			if err != nil {
				return err
			}
			if err := maybeResetUserSubscriptionWithPlanTx(tx, &sub, plan, now); err != nil {
				return err
			}
			eligible, _, _, resourceType := isUserSubscriptionEligibleForPreConsume(&sub, amount)
			if !eligible {
				continue
			}
			if resourceType == SubscriptionResourceRequestCount {
				requestCountCandidates = append(requestCountCandidates, sub)
				continue
			}
			quotaCandidates = append(quotaCandidates, sub)
		}
		if len(requestCountCandidates) > 0 {
			selected := requestCountCandidates[0]
			_, requiredAmount, requiredCount, resourceType := isUserSubscriptionEligibleForPreConsume(&selected, amount)
			return applyUserSubscriptionPreConsumeTx(tx, requestId, userId, &selected, requiredAmount, requiredCount, resourceType, returnValue)
		}
		if len(quotaCandidates) > 0 {
			selected := quotaCandidates[0]
			_, requiredAmount, requiredCount, resourceType := isUserSubscriptionEligibleForPreConsume(&selected, amount)
			return applyUserSubscriptionPreConsumeTx(tx, requestId, userId, &selected, requiredAmount, requiredCount, resourceType, returnValue)
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
		var sub UserSubscription
		if err := tx.Where("id = ?", record.UserSubscriptionId).First(&sub).Error; err != nil {
			return err
		}
		legacyAmount := record.PreConsumedAmount
		legacyCount := record.PreConsumedCount
		if legacyAmount <= 0 && legacyCount <= 0 && record.PreConsumed > 0 {
			if NormalizeSubscriptionResourceType(sub.ResourceType) == SubscriptionResourceRequestCount {
				legacyCount = record.PreConsumed
			} else {
				legacyAmount = record.PreConsumed
			}
		}
		if legacyAmount <= 0 && legacyCount <= 0 {
			record.Status = "refunded"
			return tx.Save(&record).Error
		}
		if err := postConsumeUserSubscriptionDeltaDetailedTx(tx, record.UserSubscriptionId, -legacyAmount, -legacyCount); err != nil {
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

func PostConsumeUserSubscriptionUsage(userSubscriptionId int, amountDelta int64, countDelta int64) error {
	if userSubscriptionId <= 0 {
		return errors.New("invalid userSubscriptionId")
	}
	if amountDelta == 0 && countDelta == 0 {
		return nil
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		return postConsumeUserSubscriptionDeltaDetailedTx(tx, userSubscriptionId, amountDelta, countDelta)
	})
}

func postConsumeUserSubscriptionDeltaTx(tx *gorm.DB, userSubscriptionId int, delta int64) error {
	return postConsumeUserSubscriptionDeltaDetailedTx(tx, userSubscriptionId, delta, 0)
}

func postConsumeUserSubscriptionDeltaDetailedTx(tx *gorm.DB, userSubscriptionId int, amountDelta int64, countDelta int64) error {
	if tx == nil {
		return errors.New("tx is nil")
	}
	if userSubscriptionId <= 0 {
		return errors.New("invalid userSubscriptionId")
	}
	if amountDelta == 0 && countDelta == 0 {
		return nil
	}
	var sub UserSubscription
	if err := tx.Set("gorm:query_option", "FOR UPDATE").
		Where("id = ?", userSubscriptionId).
		First(&sub).Error; err != nil {
		return err
	}
	if countDelta != 0 {
		if hasLifetimeRequestCountLimit(&sub) || !hasSeparatePeriodRequestCounter(&sub) {
			newCountUsed := sub.RequestCountUsed + countDelta
			if newCountUsed < 0 {
				newCountUsed = 0
			}
			if hasLifetimeRequestCountLimit(&sub) && newCountUsed > sub.RequestCountTotal {
				return fmt.Errorf("subscription request count exceeds total, used=%d total=%d", newCountUsed, sub.RequestCountTotal)
			}
			sub.RequestCountUsed = newCountUsed
		}
		if hasSeparatePeriodRequestCounter(&sub) || sub.RequestCountPeriodUsed > 0 {
			newPeriodCountUsed := sub.RequestCountPeriodUsed + countDelta
			if newPeriodCountUsed < 0 {
				newPeriodCountUsed = 0
			}
			periodLimit := getSubscriptionRequestCountPeriodLimit(&sub)
			if periodLimit > 0 && newPeriodCountUsed > periodLimit {
				return fmt.Errorf("subscription request count exceeds period limit, used=%d total=%d", newPeriodCountUsed, periodLimit)
			}
			sub.RequestCountPeriodUsed = newPeriodCountUsed
		}
	}
	if amountDelta != 0 {
		newAmountUsed := sub.AmountUsed + amountDelta
		if newAmountUsed < 0 {
			newAmountUsed = 0
		}
		if sub.AmountTotal > 0 && newAmountUsed > sub.AmountTotal {
			return fmt.Errorf("subscription used exceeds total, used=%d total=%d", newAmountUsed, sub.AmountTotal)
		}
		sub.AmountUsed = newAmountUsed
	}
	return tx.Save(&sub).Error
}
