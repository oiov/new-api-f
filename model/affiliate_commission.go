package model

import (
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"gorm.io/gorm"
)

const (
	AffiliateCommissionSourceTopUp             = "topup"
	AffiliateCommissionSourceSubscriptionOrder = "subscription_order"

	AffiliateCommissionSettlementQuota = "quota"

	AffiliateCommissionScopeAllPaidOrders  = "all_paid_orders"
	AffiliateCommissionScopeFirstPaidOrder = "first_paid_order"

	AffiliateCommissionStatusGranted  = "granted"
	AffiliateCommissionStatusSkipped  = "skipped"
	AffiliateCommissionStatusReversed = "reversed"

	AffiliateCommissionWithdrawalNotAvailable = "not_available"

	AffiliateCommissionReasonCommissionDisabled        = "commission_disabled"
	AffiliateCommissionReasonTopupExcluded             = "topup_excluded"
	AffiliateCommissionReasonSubscriptionExcluded      = "subscription_excluded"
	AffiliateCommissionReasonManualDeliveryExcluded    = "manual_delivery_excluded"
	AffiliateCommissionReasonNoInviter                 = "no_inviter"
	AffiliateCommissionReasonInviterNotFound           = "inviter_not_found"
	AffiliateCommissionReasonFirstPaidOrderOnly        = "first_paid_order_only"
	AffiliateCommissionReasonBelowMinOrderMoney        = "below_min_order_money"
	AffiliateCommissionReasonRateZero                  = "rate_zero"
	AffiliateCommissionReasonCommissionQuotaZero       = "commission_quota_zero"
	AffiliateCommissionReasonSettlementModeUnsupported = "settlement_mode_unsupported"
)

type AffiliateCommission struct {
	Id               int     `json:"id"`
	InviterId        int     `json:"inviter_id" gorm:"index"`
	InviteeId        int     `json:"invitee_id" gorm:"index"`
	InviteeUsername  string  `json:"invitee_username,omitempty" gorm:"-"`
	SourceType       string  `json:"source_type" gorm:"type:varchar(32);not null;uniqueIndex:idx_affiliate_commission_source;index"`
	SourceId         int     `json:"source_id" gorm:"not null;uniqueIndex:idx_affiliate_commission_source"`
	SourceTradeNo    string  `json:"source_trade_no" gorm:"type:varchar(255);default:'';index"`
	PaymentProvider  string  `json:"payment_provider" gorm:"type:varchar(50);default:''"`
	PaymentMethod    string  `json:"payment_method" gorm:"type:varchar(50);default:''"`
	OrderMoney       float64 `json:"order_money" gorm:"type:decimal(12,4);not null;default:0"`
	Rate             float64 `json:"rate" gorm:"type:decimal(10,4);not null;default:0"`
	SettlementType   string  `json:"settlement_type" gorm:"type:varchar(32);not null;default:'quota'"`
	CommissionQuota  int     `json:"commission_quota" gorm:"type:int;not null;default:0"`
	CashAmount       float64 `json:"cash_amount" gorm:"type:decimal(12,4);not null;default:0"`
	Currency         string  `json:"currency" gorm:"type:varchar(16);default:''"`
	Status           string  `json:"status" gorm:"type:varchar(32);not null;index"`
	Reason           string  `json:"reason" gorm:"type:varchar(255);default:''"`
	WithdrawalStatus string  `json:"withdrawal_status" gorm:"type:varchar(32);default:'not_available'"`
	WithdrawalId     int     `json:"withdrawal_id" gorm:"type:int;not null;default:0"`
	CreatedAt        int64   `json:"created_at" gorm:"bigint;index"`
	UpdatedAt        int64   `json:"updated_at" gorm:"bigint"`
}

func (c *AffiliateCommission) BeforeCreate(tx *gorm.DB) error {
	now := common.GetTimestamp()
	if c.CreatedAt == 0 {
		c.CreatedAt = now
	}
	c.UpdatedAt = now
	if c.SettlementType == "" {
		c.SettlementType = AffiliateCommissionSettlementQuota
	}
	if c.WithdrawalStatus == "" {
		c.WithdrawalStatus = AffiliateCommissionWithdrawalNotAvailable
	}
	return nil
}

func (c *AffiliateCommission) BeforeUpdate(tx *gorm.DB) error {
	c.UpdatedAt = common.GetTimestamp()
	return nil
}

type AffiliateCommissionFilters struct {
	Status     string
	SourceType string
}

type AffiliateCommissionConfigSummary struct {
	Enabled             bool    `json:"enabled"`
	DefaultRate         float64 `json:"default_rate"`
	Scope               string  `json:"scope"`
	IncludeTopup        bool    `json:"include_topup"`
	IncludeSubscription bool    `json:"include_subscription"`
	SettlementType      string  `json:"settlement_type"`
}

type AffiliateCommissionSummary struct {
	AvailableQuota       int                              `json:"available_quota"`
	HistoryQuota         int                              `json:"history_quota"`
	InviteCount          int                              `json:"invite_count"`
	PaidInviteCount      int64                            `json:"paid_invite_count"`
	MonthCommissionQuota int64                            `json:"month_commission_quota"`
	EffectiveRate        float64                          `json:"effective_rate"`
	UsesCustomRate       bool                             `json:"uses_custom_rate"`
	Config               AffiliateCommissionConfigSummary `json:"config"`
}

type affiliateCommissionSource struct {
	sourceType      string
	sourceId        int
	inviteeId       int
	tradeNo         string
	paymentProvider string
	paymentMethod   string
	orderMoney      float64
	manualDelivery  bool
}

func ResolveAffiliateCommissionRate(inviter *User) float64 {
	if inviter == nil {
		return common.AffiliateCommissionDefaultRate
	}
	if inviter.AffiliateCommissionRate >= 0 {
		return inviter.AffiliateCommissionRate
	}
	return common.AffiliateCommissionDefaultRate
}

func GrantAffiliateCommissionForTopUpTx(tx *gorm.DB, topUp *TopUp) error {
	if topUp == nil || topUp.Id <= 0 {
		return nil
	}
	return grantAffiliateCommissionTx(tx, affiliateCommissionSource{
		sourceType:      AffiliateCommissionSourceTopUp,
		sourceId:        topUp.Id,
		inviteeId:       topUp.UserId,
		tradeNo:         topUp.TradeNo,
		paymentProvider: topUp.PaymentGateway(),
		paymentMethod:   strings.TrimSpace(topUp.PaymentMethod),
		orderMoney:      topUp.Money,
	})
}

func GrantAffiliateCommissionForSubscriptionOrderTx(tx *gorm.DB, order *SubscriptionOrder) error {
	if order == nil || order.Id <= 0 {
		return nil
	}
	return grantAffiliateCommissionTx(tx, affiliateCommissionSource{
		sourceType:      AffiliateCommissionSourceSubscriptionOrder,
		sourceId:        order.Id,
		inviteeId:       order.UserId,
		tradeNo:         order.TradeNo,
		paymentProvider: order.PaymentGateway(),
		paymentMethod:   strings.TrimSpace(order.PaymentMethod),
		orderMoney:      order.Money,
		manualDelivery:  normalizeSubscriptionDeliveryMode(order.PlanDeliveryMode) == SubscriptionDeliveryModeManualDelivery,
	})
}

func grantAffiliateCommissionTx(tx *gorm.DB, source affiliateCommissionSource) error {
	if tx == nil {
		return errors.New("db transaction is nil")
	}
	if source.sourceType == "" || source.sourceId <= 0 || source.inviteeId <= 0 {
		return nil
	}

	var existing AffiliateCommission
	err := tx.Select("id").Where("source_type = ? AND source_id = ?", source.sourceType, source.sourceId).First(&existing).Error
	if err == nil {
		return nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}

	commission := AffiliateCommission{
		InviteeId:        source.inviteeId,
		SourceType:       source.sourceType,
		SourceId:         source.sourceId,
		SourceTradeNo:    strings.TrimSpace(source.tradeNo),
		PaymentProvider:  strings.TrimSpace(source.paymentProvider),
		PaymentMethod:    strings.TrimSpace(source.paymentMethod),
		OrderMoney:       source.orderMoney,
		SettlementType:   AffiliateCommissionSettlementQuota,
		Status:           AffiliateCommissionStatusSkipped,
		WithdrawalStatus: AffiliateCommissionWithdrawalNotAvailable,
	}

	var invitee User
	if err := tx.Set("gorm:query_option", "FOR UPDATE").First(&invitee, source.inviteeId).Error; err != nil {
		return err
	}
	commission.InviteeId = invitee.Id

	if invitee.InviterId <= 0 {
		commission.Reason = AffiliateCommissionReasonNoInviter
		return tx.Create(&commission).Error
	}
	commission.InviterId = invitee.InviterId

	var inviter User
	if err := tx.Set("gorm:query_option", "FOR UPDATE").First(&inviter, invitee.InviterId).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			commission.Reason = AffiliateCommissionReasonInviterNotFound
			return tx.Create(&commission).Error
		}
		return err
	}

	reason := resolveAffiliateCommissionSkipReason(tx, source, invitee.Id)
	rate := ResolveAffiliateCommissionRate(&inviter)
	commission.Rate = rate
	if reason == "" && rate <= 0 {
		reason = AffiliateCommissionReasonRateZero
	}

	quota := 0
	if reason == "" {
		quota = calculateAffiliateCommissionQuota(source.orderMoney, rate)
		if common.AffiliateCommissionMaxQuotaPerOrder > 0 && quota > common.AffiliateCommissionMaxQuotaPerOrder {
			quota = common.AffiliateCommissionMaxQuotaPerOrder
		}
		if quota <= 0 {
			reason = AffiliateCommissionReasonCommissionQuotaZero
		}
	}

	if reason != "" {
		commission.Reason = reason
		return tx.Create(&commission).Error
	}

	commission.Status = AffiliateCommissionStatusGranted
	commission.CommissionQuota = quota
	if err := tx.Create(&commission).Error; err != nil {
		return err
	}
	return tx.Model(&User{}).
		Where("id = ?", inviter.Id).
		Updates(map[string]any{
			"aff_quota":   gorm.Expr("aff_quota + ?", quota),
			"aff_history": gorm.Expr("aff_history + ?", quota),
		}).Error
}

func resolveAffiliateCommissionSkipReason(tx *gorm.DB, source affiliateCommissionSource, inviteeId int) string {
	if !common.AffiliateCommissionEnabled {
		return AffiliateCommissionReasonCommissionDisabled
	}
	if common.AffiliateCommissionSettlementMode != AffiliateCommissionSettlementQuota {
		return AffiliateCommissionReasonSettlementModeUnsupported
	}
	switch source.sourceType {
	case AffiliateCommissionSourceTopUp:
		if !common.AffiliateCommissionIncludeTopup {
			return AffiliateCommissionReasonTopupExcluded
		}
	case AffiliateCommissionSourceSubscriptionOrder:
		if !common.AffiliateCommissionIncludeSubscription {
			return AffiliateCommissionReasonSubscriptionExcluded
		}
		if source.manualDelivery {
			return AffiliateCommissionReasonManualDeliveryExcluded
		}
	}
	if common.AffiliateCommissionScope == AffiliateCommissionScopeFirstPaidOrder && inviteeId > 0 {
		var count int64
		err := tx.Model(&AffiliateCommission{}).
			Where("invitee_id = ? AND status = ?", inviteeId, AffiliateCommissionStatusGranted).
			Count(&count).Error
		if err != nil {
			return ""
		}
		if count > 0 {
			return AffiliateCommissionReasonFirstPaidOrderOnly
		}
	}
	if common.AffiliateCommissionMinOrderMoney > 0 && source.orderMoney < common.AffiliateCommissionMinOrderMoney {
		return AffiliateCommissionReasonBelowMinOrderMoney
	}
	return ""
}

func calculateAffiliateCommissionQuota(orderMoney float64, rate float64) int {
	if orderMoney <= 0 || rate <= 0 || common.QuotaPerUnit <= 0 {
		return 0
	}
	return int(math.Floor(orderMoney * rate / 100 * common.QuotaPerUnit))
}

func ListAffiliateCommissionsByUser(userId int, pageInfo *common.PageInfo, filters AffiliateCommissionFilters) ([]AffiliateCommission, int64, error) {
	if userId <= 0 {
		return nil, 0, errors.New("invalid user id")
	}
	if pageInfo == nil {
		pageInfo = &common.PageInfo{Page: 1, PageSize: common.ItemsPerPage}
	}

	query := DB.Model(&AffiliateCommission{}).Where("inviter_id = ?", userId)
	if status := strings.TrimSpace(filters.Status); status != "" {
		query = query.Where("status = ?", status)
	}
	if sourceType := strings.TrimSpace(filters.SourceType); sourceType != "" {
		query = query.Where("source_type = ?", sourceType)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	items := make([]AffiliateCommission, 0)
	if total == 0 {
		return items, 0, nil
	}

	err := DB.Model(&AffiliateCommission{}).
		Select("affiliate_commissions.*, users.username AS invitee_username").
		Joins("LEFT JOIN users ON users.id = affiliate_commissions.invitee_id").
		Where("affiliate_commissions.inviter_id = ?", userId).
		Scopes(applyAffiliateCommissionFilters(filters)).
		Order("affiliate_commissions.created_at desc, affiliate_commissions.id desc").
		Limit(pageInfo.GetPageSize()).
		Offset(pageInfo.GetStartIdx()).
		Find(&items).Error
	return items, total, err
}

func applyAffiliateCommissionFilters(filters AffiliateCommissionFilters) func(*gorm.DB) *gorm.DB {
	return func(db *gorm.DB) *gorm.DB {
		if status := strings.TrimSpace(filters.Status); status != "" {
			db = db.Where("affiliate_commissions.status = ?", status)
		}
		if sourceType := strings.TrimSpace(filters.SourceType); sourceType != "" {
			db = db.Where("affiliate_commissions.source_type = ?", sourceType)
		}
		return db
	}
}

func GetAffiliateCommissionSummary(userId int) (*AffiliateCommissionSummary, error) {
	if userId <= 0 {
		return nil, errors.New("invalid user id")
	}
	var user User
	if err := DB.First(&user, userId).Error; err != nil {
		return nil, err
	}

	var paidInviteCount int64
	if err := DB.Model(&AffiliateCommission{}).
		Where("inviter_id = ? AND status = ?", userId, AffiliateCommissionStatusGranted).
		Distinct("invitee_id").
		Count(&paidInviteCount).Error; err != nil {
		return nil, err
	}

	monthStart := time.Now().Local()
	monthStart = time.Date(monthStart.Year(), monthStart.Month(), 1, 0, 0, 0, 0, monthStart.Location())
	var monthCommissionQuota int64
	if err := DB.Model(&AffiliateCommission{}).
		Where("inviter_id = ? AND status = ? AND created_at >= ?", userId, AffiliateCommissionStatusGranted, monthStart.Unix()).
		Select("COALESCE(SUM(commission_quota), 0)").
		Scan(&monthCommissionQuota).Error; err != nil {
		return nil, err
	}

	usesCustomRate := user.AffiliateCommissionRate >= 0
	return &AffiliateCommissionSummary{
		AvailableQuota:       user.AffQuota,
		HistoryQuota:         user.AffHistoryQuota,
		InviteCount:          user.AffCount,
		PaidInviteCount:      paidInviteCount,
		MonthCommissionQuota: monthCommissionQuota,
		EffectiveRate:        ResolveAffiliateCommissionRate(&user),
		UsesCustomRate:       usesCustomRate,
		Config: AffiliateCommissionConfigSummary{
			Enabled:             common.AffiliateCommissionEnabled,
			DefaultRate:         common.AffiliateCommissionDefaultRate,
			Scope:               common.AffiliateCommissionScope,
			IncludeTopup:        common.AffiliateCommissionIncludeTopup,
			IncludeSubscription: common.AffiliateCommissionIncludeSubscription,
			SettlementType:      common.AffiliateCommissionSettlementMode,
		},
	}, nil
}

func RecordAffiliateCommissionGrantedLogBySource(sourceType string, sourceId int) {
	if sourceType == "" || sourceId <= 0 {
		return
	}
	var commission AffiliateCommission
	if err := DB.
		Where("source_type = ? AND source_id = ? AND status = ?", sourceType, sourceId, AffiliateCommissionStatusGranted).
		First(&commission).Error; err != nil {
		return
	}
	RecordLog(
		commission.InviterId,
		LogTypeSystem,
		fmt.Sprintf("好友订单分佣到账，订单: %s，奖励: %s", commission.SourceTradeNo, logger.LogQuota(commission.CommissionQuota)),
	)
}
