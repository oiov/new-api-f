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

const selfServiceSubscriptionConversionCampaignOptionKey = "SelfServiceSubscriptionConversionCampaign"

type SelfServiceSubscriptionConversionCampaign struct {
	Enabled               bool     `json:"enabled"`
	Key                   string   `json:"key"`
	Title                 string   `json:"title"`
	Subtitle              string   `json:"subtitle"`
	Description           string   `json:"description"`
	Deadline              int64    `json:"deadline"`
	Timezone              string   `json:"timezone"`
	RequireDisabledPlan   bool     `json:"require_disabled_plan"`
	EligiblePlanIds       []int    `json:"eligible_plan_ids,omitempty"`
	EligibleUpgradeGroups []string `json:"eligible_upgrade_groups,omitempty"`
	EligibleTitleKeywords []string `json:"eligible_title_keywords,omitempty"`
	ConversionRule        string   `json:"conversion_rule"`
	BillingRules          []string `json:"billing_rules,omitempty"`
	ChargeRules           []string `json:"charge_rules,omitempty"`
}

type SelfServiceSubscriptionConversionPreviewItem struct {
	UserSubscriptionId      int     `json:"user_subscription_id"`
	PlanId                  int     `json:"plan_id"`
	PlanTitle               string  `json:"plan_title"`
	ResourceType            string  `json:"resource_type"`
	Source                  string  `json:"source"`
	StartTime               int64   `json:"start_time"`
	EndTime                 int64   `json:"end_time"`
	TotalSeconds            int64   `json:"total_seconds"`
	RemainingSeconds        int64   `json:"remaining_seconds"`
	RemainingRatio          float64 `json:"remaining_ratio"`
	PriceBasisAmount        float64 `json:"price_basis_amount"`
	PriceBasisSource        string  `json:"price_basis_source"`
	ConvertibleAmount       float64 `json:"convertible_amount"`
	ConvertibleQuota        int     `json:"convertible_quota"`
	Formula                 string  `json:"formula"`
	AmountUsed              int64   `json:"amount_used"`
	AmountTotal             int64   `json:"amount_total"`
	RequestCountUsed        int64   `json:"request_count_used"`
	RequestCountTotal       int64   `json:"request_count_total"`
	RequestCountPeriodUsed  int64   `json:"request_count_period_used"`
	RequestCountPeriodTotal int64   `json:"request_count_period_total"`
}

type SelfServiceSubscriptionConversionPreview struct {
	Campaign               SelfServiceSubscriptionConversionCampaign      `json:"campaign"`
	Now                    int64                                          `json:"now"`
	CurrentQuota           int                                            `json:"current_quota"`
	EstimatedQuotaAfter    int                                            `json:"estimated_quota_after"`
	TotalConvertibleQuota  int                                            `json:"total_convertible_quota"`
	TotalConvertibleAmount float64                                        `json:"total_convertible_amount"`
	CanExecute             bool                                           `json:"can_execute"`
	ClosedReason           string                                         `json:"closed_reason,omitempty"`
	LatestRequest          *SubscriptionConversionRequest                 `json:"latest_request,omitempty"`
	Items                  []SelfServiceSubscriptionConversionPreviewItem `json:"items"`
}

type SelfServiceSubscriptionConversionExecutionItem struct {
	UserSubscriptionId int     `json:"user_subscription_id"`
	PlanTitle          string  `json:"plan_title"`
	AddedQuota         int     `json:"added_quota"`
	AddedAmount        float64 `json:"added_amount"`
	Status             string  `json:"status"`
	Message            string  `json:"message"`
}

type SelfServiceSubscriptionConversionExecutionResult struct {
	CampaignKey      string                                           `json:"campaign_key"`
	Now              int64                                            `json:"now"`
	Converted        int                                              `json:"converted"`
	TotalAddedQuota  int                                              `json:"total_added_quota"`
	TotalAddedAmount float64                                          `json:"total_added_amount"`
	CurrentQuota     int                                              `json:"current_quota"`
	Items            []SelfServiceSubscriptionConversionExecutionItem `json:"items"`
}

func defaultSelfServiceSubscriptionConversionCampaign() SelfServiceSubscriptionConversionCampaign {
	loc := subscriptionResetLocation
	if loc == nil {
		loc = time.FixedZone("UTC+8", 8*3600)
	}
	deadline := time.Date(2026, time.April, 9, 23, 0, 0, 0, loc).Unix()
	return SelfServiceSubscriptionConversionCampaign{
		Enabled:             true,
		Key:                 "default-self-service-subscription-conversion",
		Title:               "套餐自助折算活动",
		Subtitle:            "将命中的有效套餐折算为账户余额并立即失效",
		Description:         "管理员可通过配置决定哪些有效套餐可参与自助折算，以及折算展示文案、截止时间和执行开关。用户执行后，命中的套餐会按统一规则返还到账户余额，并立即失效。",
		Deadline:            deadline,
		Timezone:            "Asia/Shanghai",
		RequireDisabledPlan: true,
		EligibleUpgradeGroups: []string{
			"claude_sub",
		},
		EligibleTitleKeywords: []string{
			"Claude",
			"claude",
		},
		ConversionRule: "返还余额 = 套餐折算基价 × 剩余有效期占比；其中剩余有效期占比 = (到期时间 - 当前时间) / (到期时间 - 生效时间)。返还结果再按系统额度汇率转换为账户余额。",
		BillingRules: []string{
			"仅处理当前仍在有效期内且命中活动范围的套餐；已过期、已作废、未命中的套餐不会进入折算。",
			"按订单购买的套餐，优先按历史成功订单的实付金额作为折算基价；无法匹配到订单时，回退到套餐快照价格。",
			"折算只看剩余有效期占比，不按当日已用次数、未来重置次数单独补偿，避免周卡/月卡在不同重置周期下口径不一致。",
		},
		ChargeRules: []string{
			"执行后系统会先返还账户余额，再立即作废对应旧套餐，后续请求将不再命中这些旧套餐。",
			"账户余额仍按你当前系统的标准钱包计费规则扣减，和普通充值余额一致。",
			"该操作不可撤销；如果你仍想继续使用旧套餐权益，请不要执行折算。",
		},
	}
}

func GetSelfServiceSubscriptionConversionCampaign() SelfServiceSubscriptionConversionCampaign {
	campaign := defaultSelfServiceSubscriptionConversionCampaign()
	common.OptionMapRWMutex.RLock()
	raw := strings.TrimSpace(common.OptionMap[selfServiceSubscriptionConversionCampaignOptionKey])
	common.OptionMapRWMutex.RUnlock()
	if raw == "" {
		return campaign
	}
	var override SelfServiceSubscriptionConversionCampaign
	if err := common.UnmarshalJsonStr(raw, &override); err != nil {
		return campaign
	}
	var rawMap map[string]any
	if err := common.UnmarshalJsonStr(raw, &rawMap); err != nil {
		rawMap = map[string]any{}
	}
	if override.Key != "" {
		campaign.Key = override.Key
	}
	if override.Title != "" {
		campaign.Title = override.Title
	}
	if override.Subtitle != "" {
		campaign.Subtitle = override.Subtitle
	}
	if override.Description != "" {
		campaign.Description = override.Description
	}
	if override.Timezone != "" {
		campaign.Timezone = override.Timezone
	}
	if override.Deadline > 0 {
		campaign.Deadline = override.Deadline
	}
	if _, ok := rawMap["enabled"]; ok {
		campaign.Enabled = override.Enabled
	}
	if _, ok := rawMap["require_disabled_plan"]; ok {
		campaign.RequireDisabledPlan = override.RequireDisabledPlan
	}
	if len(override.EligiblePlanIds) > 0 {
		campaign.EligiblePlanIds = normalizeSubscriptionIntList(override.EligiblePlanIds)
	}
	if len(override.EligibleUpgradeGroups) > 0 {
		campaign.EligibleUpgradeGroups = normalizeSubscriptionStringList(override.EligibleUpgradeGroups)
	}
	if len(override.EligibleTitleKeywords) > 0 {
		campaign.EligibleTitleKeywords = normalizeSubscriptionStringList(override.EligibleTitleKeywords)
	}
	if override.ConversionRule != "" {
		campaign.ConversionRule = override.ConversionRule
	}
	if len(override.BillingRules) > 0 {
		campaign.BillingRules = normalizeSubscriptionStringList(override.BillingRules)
	}
	if len(override.ChargeRules) > 0 {
		campaign.ChargeRules = normalizeSubscriptionStringList(override.ChargeRules)
	}
	if len(campaign.EligibleUpgradeGroups) == 0 {
		campaign.EligibleUpgradeGroups = []string{"claude_sub"}
	}
	if len(campaign.EligibleTitleKeywords) == 0 {
		campaign.EligibleTitleKeywords = []string{"Claude", "claude"}
	}
	return campaign
}

func ValidateSelfServiceSubscriptionConversionCampaign(raw string) error {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var campaign SelfServiceSubscriptionConversionCampaign
	if err := common.UnmarshalJsonStr(raw, &campaign); err != nil {
		return fmt.Errorf("套餐自助折算活动配置格式错误: %w", err)
	}
	if strings.TrimSpace(campaign.Title) == "" {
		return fmt.Errorf("套餐自助折算活动标题不能为空")
	}
	if campaign.Deadline < 0 {
		return fmt.Errorf("套餐自助折算活动截止时间不能小于0")
	}
	for _, planID := range campaign.EligiblePlanIds {
		if planID <= 0 {
			return fmt.Errorf("套餐ID必须大于0")
		}
	}
	return nil
}

func isSelfServiceSubscriptionConversionPlanEligible(sub *UserSubscription, plan *SubscriptionPlan, campaign SelfServiceSubscriptionConversionCampaign) bool {
	if sub == nil || plan == nil {
		return false
	}
	if campaign.RequireDisabledPlan && plan.Enabled {
		return false
	}
	if len(campaign.EligiblePlanIds) > 0 {
		for _, planID := range campaign.EligiblePlanIds {
			if planID == plan.Id {
				return true
			}
		}
		return false
	}
	for _, group := range campaign.EligibleUpgradeGroups {
		group = strings.TrimSpace(group)
		if group == "" {
			continue
		}
		if strings.EqualFold(strings.TrimSpace(plan.UpgradeGroup), group) || strings.EqualFold(strings.TrimSpace(sub.UpgradeGroup), group) {
			return true
		}
	}
	title := strings.TrimSpace(plan.Title)
	for _, keyword := range campaign.EligibleTitleKeywords {
		keyword = strings.TrimSpace(keyword)
		if keyword != "" && strings.Contains(title, keyword) {
			return true
		}
	}
	return false
}

func findMatchedSuccessfulSubscriptionOrder(userID int, planID int, createdAt int64, tx *gorm.DB) *SubscriptionOrder {
	if userID <= 0 || planID <= 0 {
		return nil
	}
	db := DB
	if tx != nil {
		db = tx
	}
	var orders []SubscriptionOrder
	if err := db.Where("user_id = ? AND plan_id = ? AND status = ?", userID, planID, common.TopUpStatusSuccess).
		Order("complete_time desc, id desc").
		Limit(20).
		Find(&orders).Error; err != nil {
		return nil
	}
	if len(orders) == 0 {
		return nil
	}
	if createdAt <= 0 {
		return &orders[0]
	}
	best := &orders[0]
	bestDiff := int64(math.MaxInt64)
	for i := range orders {
		diff := orders[i].CompleteTime - createdAt
		if diff < 0 {
			diff = -diff
		}
		if diff < bestDiff {
			best = &orders[i]
			bestDiff = diff
		}
	}
	return best
}

func resolveSelfServiceSubscriptionConversionPriceBasis(sub *UserSubscription, plan *SubscriptionPlan, tx *gorm.DB) (float64, string) {
	if sub == nil || plan == nil {
		return 0, ""
	}
	if strings.TrimSpace(sub.Source) == "order" {
		if order := findMatchedSuccessfulSubscriptionOrder(sub.UserId, sub.PlanId, sub.CreatedAt, tx); order != nil && order.Money > 0 {
			return order.Money, "order"
		}
	}
	price := plan.GetEffectivePriceAmount(sub.StartTime)
	if price > 0 {
		return price, "plan"
	}
	return 0, ""
}

func buildSelfServiceSubscriptionConversionPreviewItem(sub *UserSubscription, plan *SubscriptionPlan, campaign SelfServiceSubscriptionConversionCampaign, now int64, tx *gorm.DB) (*SelfServiceSubscriptionConversionPreviewItem, error) {
	if sub == nil || plan == nil {
		return nil, fmt.Errorf("invalid legacy migration subscription")
	}
	if sub.Status != "active" || sub.EndTime <= now {
		return nil, nil
	}
	if !isSelfServiceSubscriptionConversionPlanEligible(sub, plan, campaign) {
		return nil, nil
	}
	totalSeconds := sub.EndTime - sub.StartTime
	if totalSeconds <= 0 {
		totalSeconds = 1
	}
	remainingSeconds := sub.EndTime - now
	if remainingSeconds < 0 {
		remainingSeconds = 0
	}
	ratio := float64(remainingSeconds) / float64(totalSeconds)
	if ratio < 0 {
		ratio = 0
	}
	if ratio > 1 {
		ratio = 1
	}
	priceBasis, priceBasisSource := resolveSelfServiceSubscriptionConversionPriceBasis(sub, plan, tx)
	convertibleAmount := math.Round(priceBasis*ratio*100) / 100
	convertibleQuota := 0
	if convertibleAmount > 0 && common.QuotaPerUnit > 0 {
		convertibleQuota = int(math.Floor(convertibleAmount*common.QuotaPerUnit + 1e-9))
	}
	item := &SelfServiceSubscriptionConversionPreviewItem{
		UserSubscriptionId:      sub.Id,
		PlanId:                  sub.PlanId,
		PlanTitle:               strings.TrimSpace(plan.Title),
		ResourceType:            NormalizeSubscriptionResourceType(sub.ResourceType),
		Source:                  strings.TrimSpace(sub.Source),
		StartTime:               sub.StartTime,
		EndTime:                 sub.EndTime,
		TotalSeconds:            totalSeconds,
		RemainingSeconds:        remainingSeconds,
		RemainingRatio:          math.Round(ratio*10000) / 10000,
		PriceBasisAmount:        priceBasis,
		PriceBasisSource:        priceBasisSource,
		ConvertibleAmount:       convertibleAmount,
		ConvertibleQuota:        convertibleQuota,
		Formula:                 campaign.ConversionRule,
		AmountUsed:              sub.AmountUsed,
		AmountTotal:             sub.AmountTotal,
		RequestCountUsed:        sub.RequestCountUsed,
		RequestCountTotal:       sub.RequestCountTotal,
		RequestCountPeriodUsed:  sub.RequestCountPeriodUsed,
		RequestCountPeriodTotal: sub.RequestCountPeriodTotal,
	}
	return item, nil
}

func PreviewSelfServiceSubscriptionConversion(userId int) (*SelfServiceSubscriptionConversionPreview, error) {
	if userId <= 0 {
		return nil, fmt.Errorf("invalid user id")
	}
	campaign := GetSelfServiceSubscriptionConversionCampaign()
	now := common.GetTimestamp()
	user, err := GetUserById(userId, false)
	if err != nil {
		return nil, err
	}
	var subs []UserSubscription
	if err := DB.Where("user_id = ? AND status = ? AND end_time > ?", userId, "active", now).
		Order("end_time asc, id asc").
		Find(&subs).Error; err != nil {
		return nil, err
	}
	items := make([]SelfServiceSubscriptionConversionPreviewItem, 0, len(subs))
	totalQuota := 0
	totalAmount := 0.0
	for i := range subs {
		plan, err := GetSubscriptionPlanById(subs[i].PlanId)
		if err != nil {
			return nil, err
		}
		item, err := buildSelfServiceSubscriptionConversionPreviewItem(&subs[i], plan, campaign, now, nil)
		if err != nil {
			return nil, err
		}
		if item == nil || item.ConvertibleQuota <= 0 {
			continue
		}
		items = append(items, *item)
		totalQuota += item.ConvertibleQuota
		totalAmount += item.ConvertibleAmount
	}
	totalAmount = math.Round(totalAmount*100) / 100
	preview := &SelfServiceSubscriptionConversionPreview{
		Campaign:               campaign,
		Now:                    now,
		CurrentQuota:           user.Quota,
		EstimatedQuotaAfter:    user.Quota + totalQuota,
		TotalConvertibleQuota:  totalQuota,
		TotalConvertibleAmount: totalAmount,
		CanExecute:             campaign.Enabled && now < campaign.Deadline && len(items) > 0,
		Items:                  items,
	}
	latestRequest, _ := GetLatestSubscriptionConversionRequestByUser(userId)
	preview.LatestRequest = latestRequest
	if !campaign.Enabled {
		preview.ClosedReason = "当前活动未开启"
	} else if now >= campaign.Deadline {
		preview.ClosedReason = "当前活动已截止"
	} else if len(items) == 0 {
		preview.ClosedReason = "当前没有可折算的套餐"
	}
	return preview, nil
}

func ExecuteSelfServiceSubscriptionConversion(userId int) (*SelfServiceSubscriptionConversionExecutionResult, error) {
	if userId <= 0 {
		return nil, fmt.Errorf("invalid user id")
	}
	preview, err := PreviewSelfServiceSubscriptionConversion(userId)
	if err != nil {
		return nil, err
	}
	if !preview.CanExecute {
		if preview.ClosedReason != "" {
			return nil, errors.New(preview.ClosedReason)
		}
		return nil, errors.New("当前没有可折算的套餐")
	}
	result := &SelfServiceSubscriptionConversionExecutionResult{
		CampaignKey: preview.Campaign.Key,
		Now:         common.GetTimestamp(),
		Items:       make([]SelfServiceSubscriptionConversionExecutionItem, 0, len(preview.Items)),
	}
	cacheGroup := ""
	err = DB.Transaction(func(tx *gorm.DB) error {
		now := GetDBTimestampWithTx(tx)
		if !preview.Campaign.Enabled || now >= preview.Campaign.Deadline {
			return fmt.Errorf("当前活动已截止")
		}
		var subs []UserSubscription
		subIDs := make([]int, 0, len(preview.Items))
		for _, item := range preview.Items {
			subIDs = append(subIDs, item.UserSubscriptionId)
		}
		if err := tx.Set("gorm:query_option", "FOR UPDATE").
			Where("user_id = ? AND id IN ?", userId, subIDs).
			Order("end_time asc, id asc").
			Find(&subs).Error; err != nil {
			return err
		}
		if len(subs) == 0 {
			return fmt.Errorf("当前没有可折算的旧版套餐")
		}
		totalAddedQuota := 0
		totalAddedAmount := 0.0
		converted := 0
		for i := range subs {
			plan, err := getSubscriptionPlanByIdTx(tx, subs[i].PlanId)
			if err != nil {
				return err
			}
			item, err := buildSelfServiceSubscriptionConversionPreviewItem(&subs[i], plan, preview.Campaign, now, tx)
			if err != nil {
				return err
			}
			if item == nil || item.ConvertibleQuota <= 0 {
				continue
			}
			if err := tx.Model(&User{}).Where("id = ?", userId).
				Update("quota", gorm.Expr("quota + ?", item.ConvertibleQuota)).Error; err != nil {
				return err
			}
			if err := tx.Model(&subs[i]).Updates(map[string]any{
				"status":     "cancelled",
				"end_time":   now,
				"updated_at": now,
			}).Error; err != nil {
				return err
			}
			targetGroup, err := downgradeUserGroupForSubscriptionTx(tx, &subs[i], now)
			if err != nil {
				return err
			}
			if targetGroup != "" {
				cacheGroup = targetGroup
			}
			totalAddedQuota += item.ConvertibleQuota
			totalAddedAmount += item.ConvertibleAmount
			converted++
			result.Items = append(result.Items, SelfServiceSubscriptionConversionExecutionItem{
				UserSubscriptionId: item.UserSubscriptionId,
				PlanTitle:          item.PlanTitle,
				AddedQuota:         item.ConvertibleQuota,
				AddedAmount:        item.ConvertibleAmount,
				Status:             "converted",
				Message:            "ok",
			})
		}
		if converted == 0 {
			return fmt.Errorf("当前没有可折算的旧版套餐")
		}
		var user User
		if err := tx.Select("id", "quota").Where("id = ?", userId).First(&user).Error; err != nil {
			return err
		}
		result.Converted = converted
		result.TotalAddedQuota = totalAddedQuota
		result.TotalAddedAmount = math.Round(totalAddedAmount*100) / 100
		result.CurrentQuota = user.Quota
		return nil
	})
	if err != nil {
		return nil, err
	}
	if cacheGroup != "" {
		_ = UpdateUserGroupCache(userId, cacheGroup)
	}
	_ = updateUserQuotaCache(userId, result.CurrentQuota)
	if result.TotalAddedQuota > 0 {
		RecordLog(userId, LogTypeSystem, fmt.Sprintf("套餐自助折算完成，返还余额 %s，作废订阅 %d 个", logger.LogQuota(result.TotalAddedQuota), result.Converted))
	}
	return result, nil
}
