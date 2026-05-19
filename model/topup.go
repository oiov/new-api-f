package model

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type TopUp struct {
	Id            int     `json:"id"`
	UserId        int     `json:"user_id" gorm:"index"`
	Username      string  `json:"username,omitempty" gorm:"-"`
	Amount        int64   `json:"amount"`
	Money         float64 `json:"money"`
	TradeNo       string  `json:"trade_no" gorm:"unique;type:varchar(255);index"`
	PaymentMethod string  `json:"payment_method" gorm:"type:varchar(50)"`
	// PaymentProvider records the payment gateway that created the order.
	// PaymentMethod can be the provider's real method, such as alipay/wxpay for EPay.
	PaymentProvider string `json:"-" gorm:"type:varchar(50);default:''"`
	CreateTime      int64  `json:"create_time"`
	CompleteTime    int64  `json:"complete_time"`
	Status          string `json:"status"`
	Invoiced        bool   `json:"invoiced" gorm:"default:false"` // 是否已开发票
}

const (
	PaymentMethodStripe       = "stripe"
	PaymentMethodCreem        = "creem"
	PaymentMethodWaffo        = "waffo"
	PaymentMethodWaffoPancake = "waffo_pancake"
)

const (
	PaymentProviderEpay         = "epay"
	PaymentProviderStripe       = "stripe"
	PaymentProviderCreem        = "creem"
	PaymentProviderWaffo        = "waffo"
	PaymentProviderWaffoPancake = "waffo_pancake"
)

var ErrPaymentMethodMismatch = errors.New("payment method mismatch")
var ErrPaymentAmountMismatch = errors.New("payment amount mismatch")

const topUpQueryWindowSeconds int64 = 30 * 24 * 60 * 60

const searchTopUpCountHardLimit = 10000

func topUpQueryCutoff() int64 {
	return common.GetTimestamp() - topUpQueryWindowSeconds
}

func ValidateTopUpPaidMoney(topUp *TopUp, paidMoney decimal.Decimal) error {
	if topUp == nil {
		return errors.New("充值订单不存在")
	}
	expectedMoney := decimal.NewFromFloat(topUp.Money).Round(2)
	actualMoney := paidMoney.Round(2)
	if !expectedMoney.Equal(actualMoney) {
		return fmt.Errorf("%w: expected=%s actual=%s", ErrPaymentAmountMismatch, expectedMoney.StringFixed(2), actualMoney.StringFixed(2))
	}
	return nil
}

type TopUpAdminFilters struct {
	UserID         int
	Keyword        string
	PaymentMethod  string
	Status         string
	StartTimestamp int64
	EndTimestamp   int64
}

type TopUpUserFilters struct {
	Keyword        string
	PaymentMethod  string
	Status         string
	StartTimestamp int64
	EndTimestamp   int64
}

func (topUp *TopUp) Insert() error {
	var err error
	err = DB.Create(topUp).Error
	return err
}

func (topUp *TopUp) Update() error {
	var err error
	err = DB.Save(topUp).Error
	return err
}

func GetTopUpById(id int) *TopUp {
	var topUp *TopUp
	var err error
	err = DB.Where("id = ?", id).First(&topUp).Error
	if err != nil {
		return nil
	}
	return topUp
}

func GetTopUpByTradeNo(tradeNo string) *TopUp {
	var topUp *TopUp
	var err error
	err = DB.Where("trade_no = ?", tradeNo).First(&topUp).Error
	if err != nil {
		return nil
	}
	return topUp
}

func (topUp *TopUp) PaymentGateway() string {
	if topUp == nil {
		return ""
	}
	if provider := strings.TrimSpace(topUp.PaymentProvider); provider != "" {
		return provider
	}
	return inferPaymentProviderFromMethod(topUp.PaymentMethod)
}

func inferPaymentProviderFromMethod(method string) string {
	switch strings.TrimSpace(method) {
	case PaymentMethodStripe:
		return PaymentProviderStripe
	case PaymentMethodCreem:
		return PaymentProviderCreem
	case PaymentMethodWaffo:
		return PaymentProviderWaffo
	case PaymentMethodWaffoPancake:
		return PaymentProviderWaffoPancake
	case "redemption", "admin", "":
		return ""
	default:
		return PaymentProviderEpay
	}
}

func (topUp *TopUp) ensurePaymentProvider(expectedProvider string) error {
	if topUp == nil {
		return errors.New("充值订单不存在")
	}
	if expectedProvider == "" {
		return nil
	}
	if topUp.PaymentGateway() != expectedProvider {
		return ErrPaymentMethodMismatch
	}
	if topUp.PaymentProvider == "" {
		topUp.PaymentProvider = expectedProvider
	}
	return nil
}

func UpdatePendingTopUpStatus(tradeNo string, expectedPaymentProvider string, targetStatus string) error {
	if tradeNo == "" {
		return errors.New("未提供支付单号")
	}
	if targetStatus == "" {
		return errors.New("未提供目标状态")
	}

	refCol := "`trade_no`"
	if common.UsingPostgreSQL {
		refCol = `"trade_no"`
	}

	return DB.Transaction(func(tx *gorm.DB) error {
		topUp := &TopUp{}
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where(refCol+" = ?", tradeNo).First(topUp).Error; err != nil {
			return errors.New("充值订单不存在")
		}
		if err := topUp.ensurePaymentProvider(expectedPaymentProvider); err != nil {
			return err
		}
		if topUp.Status != common.TopUpStatusPending {
			return errors.New("充值订单状态错误")
		}
		topUp.Status = targetStatus
		topUp.CompleteTime = common.GetTimestamp()
		return tx.Save(topUp).Error
	})
}

func rechargeAmountBasedTopUp(tradeNo string, expectedPaymentProvider string, actualPaymentMethod string) (topUp *TopUp, quotaToAdd int, completed bool, err error) {
	if tradeNo == "" {
		return nil, 0, false, errors.New("未提供支付单号")
	}

	topUp = &TopUp{}
	refCol := "`trade_no`"
	if common.UsingPostgreSQL {
		refCol = `"trade_no"`
	}

	err = DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where(refCol+" = ?", tradeNo).First(topUp).Error; err != nil {
			return errors.New("充值订单不存在")
		}

		if err := topUp.ensurePaymentProvider(expectedPaymentProvider); err != nil {
			return err
		}

		if topUp.Status == common.TopUpStatusSuccess {
			return nil
		}

		if topUp.Status != common.TopUpStatusPending {
			return errors.New("充值订单状态错误")
		}

		dAmount := decimal.NewFromInt(topUp.Amount)
		dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
		quotaToAdd = int(dAmount.Mul(dQuotaPerUnit).IntPart())
		if quotaToAdd <= 0 {
			return errors.New("无效的充值额度")
		}

		topUp.CompleteTime = common.GetTimestamp()
		topUp.Status = common.TopUpStatusSuccess
		if actualPaymentMethod != "" && topUp.PaymentMethod != actualPaymentMethod {
			topUp.PaymentMethod = actualPaymentMethod
		}
		if err := tx.Save(topUp).Error; err != nil {
			return err
		}

		if err := tx.Model(&User{}).Where("id = ?", topUp.UserId).Update("quota", gorm.Expr("quota + ?", quotaToAdd)).Error; err != nil {
			return err
		}

		completed = true
		return nil
	})

	if err == nil && completed {
		// 不影响主流程：充值达标可自动参与活动抽奖
		go tryJoinActivityLotteryByTopup(topUp, time.Now())
	}

	return topUp, quotaToAdd, completed, err
}

func Recharge(referenceId string, customerId string) (completed bool, err error) {
	if referenceId == "" {
		return false, errors.New("未提供支付单号")
	}

	var quota float64
	topUp := &TopUp{}

	refCol := "`trade_no`"
	if common.UsingPostgreSQL {
		refCol = `"trade_no"`
	}

	err = DB.Transaction(func(tx *gorm.DB) error {
		err := tx.Set("gorm:query_option", "FOR UPDATE").Where(refCol+" = ?", referenceId).First(topUp).Error
		if err != nil {
			return errors.New("充值订单不存在")
		}

		if err := topUp.ensurePaymentProvider(PaymentProviderStripe); err != nil {
			return ErrPaymentMethodMismatch
		}

		if topUp.Status == common.TopUpStatusSuccess {
			return nil
		}

		if topUp.Status != common.TopUpStatusPending {
			return errors.New("充值订单状态错误")
		}

		topUp.CompleteTime = common.GetTimestamp()
		topUp.Status = common.TopUpStatusSuccess
		err = tx.Save(topUp).Error
		if err != nil {
			return err
		}

		quota = topUp.Money * common.QuotaPerUnit
		err = tx.Model(&User{}).Where("id = ?", topUp.UserId).Updates(map[string]interface{}{"stripe_customer": customerId, "quota": gorm.Expr("quota + ?", quota)}).Error
		if err != nil {
			return err
		}

		completed = true
		return nil
	})

	if err != nil {
		common.SysError("topup failed: " + err.Error())
		return false, errors.New("充值失败，请稍后重试")
	}

	if completed {
		RecordLog(topUp.UserId, LogTypeTopup, fmt.Sprintf("使用在线充值成功，充值金额: %v，支付金额：%d", logger.FormatQuota(int(quota)), topUp.Amount))
		go tryJoinActivityLotteryByTopup(topUp, time.Now())
	}

	return completed, nil
}

func GetUserTopUps(userId int, pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	return GetUserTopUpsWithFilters(userId, pageInfo, TopUpUserFilters{})
}

func GetUserTopUpsWithFilters(userId int, pageInfo *common.PageInfo, filters TopUpUserFilters) (topups []*TopUp, total int64, err error) {
	// Start transaction
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	query := tx.Model(&TopUp{}).Where("user_id = ? AND create_time >= ?", userId, topUpQueryCutoff())
	query = applyTopUpUserFilters(query, filters)

	// Get total count within transaction
	err = query.Count(&total).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	// Get paginated topups within same transaction
	err = query.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	// Commit transaction
	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	return topups, total, nil
}

// GetAllTopUps 获取全平台的充值记录（管理员使用）
func GetAllTopUps(pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	if err = tx.Model(&TopUp{}).Count(&total).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	return topups, total, nil
}

func SearchUserTopUps(userId int, keyword string, pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	return GetUserTopUpsWithFilters(userId, pageInfo, TopUpUserFilters{Keyword: keyword})
}

// SearchAllTopUps 按订单号搜索全平台充值记录（管理员使用）
func SearchAllTopUps(keyword string, pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	return GetAllTopUpsWithFilters(pageInfo, TopUpAdminFilters{Keyword: keyword})
}

func GetAllTopUpsWithFilters(pageInfo *common.PageInfo, filters TopUpAdminFilters) (topups []*TopUp, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Build base query for counting
	countQuery := tx.Table("top_ups")
	if strings.TrimSpace(filters.Keyword) != "" {
		countQuery = countQuery.Joins("LEFT JOIN users ON top_ups.user_id = users.id")
	}
	countQuery = applyTopUpFiltersWithPrefix(countQuery, filters, "top_ups.")
	if countQuery.Error != nil {
		tx.Rollback()
		return nil, 0, countQuery.Error
	}

	if err = countQuery.Limit(searchTopUpCountHardLimit).Count(&total).Error; err != nil {
		tx.Rollback()
		common.SysError("failed to count topups: " + err.Error())
		return nil, 0, errors.New("搜索充值记录失败")
	}

	// Build query for fetching records with username
	dataQuery := tx.Table("top_ups").
		Select("top_ups.*, users.username").
		Joins("LEFT JOIN users ON top_ups.user_id = users.id")

	dataQuery = applyTopUpFiltersWithPrefix(dataQuery, filters, "top_ups.")
	if dataQuery.Error != nil {
		tx.Rollback()
		return nil, 0, dataQuery.Error
	}

	if err = dataQuery.Order("top_ups.id desc").
		Limit(pageInfo.GetPageSize()).
		Offset(pageInfo.GetStartIdx()).
		Find(&topups).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}
	return topups, total, nil
}

// applyTopUpFilters applies filter conditions to a query without table prefix
func applyTopUpFilters(query *gorm.DB, filters TopUpAdminFilters) *gorm.DB {
	return applyTopUpFiltersWithPrefix(query, filters, "")
}

// applyTopUpFiltersWithPrefix applies filter conditions to a query with optional table prefix
func applyTopUpFiltersWithPrefix(query *gorm.DB, filters TopUpAdminFilters, prefix string) *gorm.DB {
	if filters.UserID > 0 {
		query = query.Where(prefix+"user_id = ?", filters.UserID)
	}
	if keyword := strings.TrimSpace(filters.Keyword); keyword != "" {
		like, err := sanitizeLikePattern(keyword)
		if err != nil {
			_ = query.AddError(err)
			return query
		}
		query = query.Where(prefix+"trade_no LIKE ? ESCAPE '!' OR users.username LIKE ? ESCAPE '!'", like, like)
	}
	if paymentMethod := strings.TrimSpace(filters.PaymentMethod); paymentMethod != "" {
		query = query.Where(prefix+"payment_method = ?", paymentMethod)
	}
	if status := strings.TrimSpace(filters.Status); status != "" {
		query = query.Where(prefix+"status = ?", status)
	}
	if filters.StartTimestamp > 0 {
		query = query.Where(prefix+"create_time >= ?", filters.StartTimestamp)
	}
	if filters.EndTimestamp > 0 {
		query = query.Where(prefix+"create_time <= ?", filters.EndTimestamp)
	}
	return query
}

func applyTopUpUserFilters(query *gorm.DB, filters TopUpUserFilters) *gorm.DB {
	if keyword := strings.TrimSpace(filters.Keyword); keyword != "" {
		like, err := sanitizeLikePattern(keyword)
		if err != nil {
			_ = query.AddError(err)
			return query
		}
		query = query.Where("trade_no LIKE ? ESCAPE '!'", like)
	}
	if paymentMethod := strings.TrimSpace(filters.PaymentMethod); paymentMethod != "" {
		query = query.Where("payment_method = ?", paymentMethod)
	}
	if status := strings.TrimSpace(filters.Status); status != "" {
		query = query.Where("status = ?", status)
	}
	if filters.StartTimestamp > 0 {
		query = query.Where("create_time >= ?", filters.StartTimestamp)
	}
	if filters.EndTimestamp > 0 {
		query = query.Where("create_time <= ?", filters.EndTimestamp)
	}
	return query
}

// ManualCompleteTopUp 管理员手动完成订单并给用户充值
func ManualCompleteTopUp(tradeNo string) error {
	if tradeNo == "" {
		return errors.New("未提供订单号")
	}

	refCol := "`trade_no`"
	if common.UsingPostgreSQL {
		refCol = `"trade_no"`
	}

	var userId int
	var quotaToAdd int
	var payMoney float64

	err := DB.Transaction(func(tx *gorm.DB) error {
		topUp := &TopUp{}
		// 行级锁，避免并发补单
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where(refCol+" = ?", tradeNo).First(topUp).Error; err != nil {
			return errors.New("充值订单不存在")
		}

		// 幂等处理：已成功直接返回
		if topUp.Status == common.TopUpStatusSuccess {
			return nil
		}

		if topUp.Status != common.TopUpStatusPending {
			return errors.New("订单状态不是待支付，无法补单")
		}

		// 计算应充值额度：
		// - Stripe 订单：Money 代表经分组倍率换算后的美元数量，直接 * QuotaPerUnit
		// - 其他订单（如易支付）：Amount 为美元数量，* QuotaPerUnit
		if topUp.PaymentGateway() == PaymentProviderStripe {
			dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
			quotaToAdd = int(decimal.NewFromFloat(topUp.Money).Mul(dQuotaPerUnit).IntPart())
		} else {
			dAmount := decimal.NewFromInt(topUp.Amount)
			dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
			quotaToAdd = int(dAmount.Mul(dQuotaPerUnit).IntPart())
		}
		if quotaToAdd <= 0 {
			return errors.New("无效的充值额度")
		}

		// 标记完成
		topUp.CompleteTime = common.GetTimestamp()
		topUp.Status = common.TopUpStatusSuccess
		if err := tx.Save(topUp).Error; err != nil {
			return err
		}

		// 增加用户额度（立即写库，保持一致性）
		if err := tx.Model(&User{}).Where("id = ?", topUp.UserId).Update("quota", gorm.Expr("quota + ?", quotaToAdd)).Error; err != nil {
			return err
		}

		userId = topUp.UserId
		payMoney = topUp.Money
		return nil
	})

	if err != nil {
		return err
	}

	// 事务外记录日志，避免阻塞
	RecordLog(userId, LogTypeTopup, fmt.Sprintf("管理员补单成功，充值金额: %v，支付金额：%f", logger.FormatQuota(quotaToAdd), payMoney))
	go tryJoinActivityLotteryByTopup(&TopUp{UserId: userId, Money: payMoney}, time.Now())
	return nil
}
func RechargeCreem(referenceId string, customerEmail string, customerName string) (completed bool, err error) {
	if referenceId == "" {
		return false, errors.New("未提供支付单号")
	}

	var quota int64
	topUp := &TopUp{}

	refCol := "`trade_no`"
	if common.UsingPostgreSQL {
		refCol = `"trade_no"`
	}

	err = DB.Transaction(func(tx *gorm.DB) error {
		err := tx.Set("gorm:query_option", "FOR UPDATE").Where(refCol+" = ?", referenceId).First(topUp).Error
		if err != nil {
			return errors.New("充值订单不存在")
		}

		if err := topUp.ensurePaymentProvider(PaymentProviderCreem); err != nil {
			return err
		}

		if topUp.Status == common.TopUpStatusSuccess {
			return nil
		}

		if topUp.Status != common.TopUpStatusPending {
			return errors.New("充值订单状态错误")
		}

		topUp.CompleteTime = common.GetTimestamp()
		topUp.Status = common.TopUpStatusSuccess
		err = tx.Save(topUp).Error
		if err != nil {
			return err
		}

		// Creem 直接使用 Amount 作为充值额度（整数）
		quota = topUp.Amount

		// 构建更新字段，优先使用邮箱，如果邮箱为空则使用用户名
		updateFields := map[string]interface{}{
			"quota": gorm.Expr("quota + ?", quota),
		}

		// 如果有客户邮箱，尝试更新用户邮箱（仅当用户邮箱为空时）
		if customerEmail != "" {
			// 先检查用户当前邮箱是否为空
			var user User
			err = tx.Where("id = ?", topUp.UserId).First(&user).Error
			if err != nil {
				return err
			}

			// 如果用户邮箱为空，则更新为支付时使用的邮箱
			if user.Email == "" {
				updateFields["email"] = customerEmail
			}
		}

		err = tx.Model(&User{}).Where("id = ?", topUp.UserId).Updates(updateFields).Error
		if err != nil {
			return err
		}

		completed = true
		return nil
	})

	if err != nil {
		common.SysError("creem topup failed: " + err.Error())
		return false, errors.New("充值失败，请稍后重试")
	}

	if completed {
		RecordLog(topUp.UserId, LogTypeTopup, fmt.Sprintf("使用Creem充值成功，充值额度: %v，支付金额：%.2f", quota, topUp.Money))
		go tryJoinActivityLotteryByTopup(topUp, time.Now())
	}

	return completed, nil
}

func RechargeWaffo(tradeNo string) (completed bool, err error) {
	topUp, quotaToAdd, completed, err := rechargeAmountBasedTopUp(tradeNo, PaymentProviderWaffo, "")

	if err != nil {
		common.SysError("waffo topup failed: " + err.Error())
		return false, errors.New("充值失败，请稍后重试")
	}

	if completed {
		RecordLog(topUp.UserId, LogTypeTopup, fmt.Sprintf("Waffo充值成功，充值额度: %v，支付金额: %.2f", logger.FormatQuota(quotaToAdd), topUp.Money))
	}

	return completed, nil
}

func RechargeEpay(tradeNo string, actualPaymentMethod ...string) (completed bool, err error) {
	method := ""
	if len(actualPaymentMethod) > 0 {
		method = actualPaymentMethod[0]
	}
	topUp, quotaToAdd, completed, err := rechargeAmountBasedTopUp(tradeNo, PaymentProviderEpay, method)
	if err != nil {
		common.SysError("epay topup failed: " + err.Error())
		return false, errors.New("充值失败，请稍后重试")
	}

	if completed {
		RecordLog(topUp.UserId, LogTypeTopup, fmt.Sprintf("使用在线充值成功，充值金额: %v，支付金额：%f", logger.LogQuota(quotaToAdd), topUp.Money))
	}

	return completed, nil
}
