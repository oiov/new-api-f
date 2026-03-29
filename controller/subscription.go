package controller

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ---- Shared types ----

type SubscriptionPlanDTO struct {
	Plan model.SubscriptionPlan `json:"plan"`
}

type BillingPreferenceRequest struct {
	BillingPreference string `json:"billing_preference"`
}

func applySubscriptionPlanDisplayFields(plan *model.SubscriptionPlan, now int64) {
	if plan == nil {
		return
	}
	plan.ApplyDisplayPrice(now)
	plan.ApplyDisplayInventory()
}

func validateSubscriptionPlanPurchaseAvailability(userId int, plan *model.SubscriptionPlan) error {
	if plan == nil {
		return fmt.Errorf("套餐不存在")
	}
	if plan.IsSoldOut() {
		return fmt.Errorf("该套餐已售罄")
	}
	if userId <= 0 || plan.MaxPurchasePerUser <= 0 {
		return nil
	}
	count, err := model.CountUserSubscriptionsByPlan(userId, plan.Id)
	if err != nil {
		return err
	}
	if count >= int64(plan.MaxPurchasePerUser) {
		return fmt.Errorf("已达到该套餐购买上限")
	}
	return nil
}

// ---- User APIs ----

func GetSubscriptionPlans(c *gin.Context) {
	var plans []model.SubscriptionPlan
	if err := model.DB.Where("enabled = ?", true).Order("sort_order desc, id desc").Find(&plans).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	now := common.GetTimestamp()
	result := make([]SubscriptionPlanDTO, 0, len(plans))
	for _, p := range plans {
		applySubscriptionPlanDisplayFields(&p, now)
		result = append(result, SubscriptionPlanDTO{
			Plan: p,
		})
	}
	common.ApiSuccess(c, result)
}

func GetSubscriptionSelf(c *gin.Context) {
	userId := c.GetInt("id")
	settingMap, _ := model.GetUserSetting(userId, false)
	pref := common.NormalizeBillingPreference(settingMap.BillingPreference)

	// Get all subscriptions (including expired)
	allSubscriptions, err := model.GetAllUserSubscriptions(userId)
	if err != nil {
		allSubscriptions = []model.SubscriptionSummary{}
	}

	// Get active subscriptions for backward compatibility
	activeSubscriptions, err := model.GetAllActiveUserSubscriptions(userId)
	if err != nil {
		activeSubscriptions = []model.SubscriptionSummary{}
	}

	common.ApiSuccess(c, gin.H{
		"billing_preference": pref,
		"subscriptions":      activeSubscriptions, // all active subscriptions
		"all_subscriptions":  allSubscriptions,    // all subscriptions including expired
	})
}

func GetSubscriptionSelfConsumeLogs(c *gin.Context) {
	userId := c.GetInt("id")
	pageInfo := common.GetPageQuery(c)
	subscriptionId, _ := strconv.Atoi(c.Query("subscription_id"))
	planId, _ := strconv.Atoi(c.Query("plan_id"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)

	if subscriptionId > 0 {
		sub, err := model.GetUserSubscriptionById(subscriptionId)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		if sub.UserId != userId {
			common.ApiErrorMsg(c, "无权查看该订阅消耗记录")
			return
		}
	}

	logs, total, summary, err := model.GetSubscriptionConsumeLogs(
		userId,
		subscriptionId,
		planId,
		0,
		startTimestamp,
		endTimestamp,
		pageInfo.GetStartIdx(),
		pageInfo.GetPageSize(),
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"page":      pageInfo.Page,
		"page_size": pageInfo.PageSize,
		"total":     total,
		"items":     logs,
		"summary":   summary,
	})
}

func UpdateSubscriptionPreference(c *gin.Context) {
	userId := c.GetInt("id")
	var req BillingPreferenceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	pref := common.NormalizeBillingPreference(req.BillingPreference)

	user, err := model.GetUserById(userId, true)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	current := user.GetSetting()
	current.BillingPreference = pref
	user.SetSetting(current)
	if err := user.Update(false); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"billing_preference": pref})
}

// ---- Admin APIs ----

func AdminListSubscriptionPlans(c *gin.Context) {
	var plans []model.SubscriptionPlan
	if err := model.DB.Order("sort_order desc, id desc").Find(&plans).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	now := common.GetTimestamp()
	result := make([]SubscriptionPlanDTO, 0, len(plans))
	for _, p := range plans {
		applySubscriptionPlanDisplayFields(&p, now)
		result = append(result, SubscriptionPlanDTO{
			Plan: p,
		})
	}
	common.ApiSuccess(c, result)
}

type AdminUpsertSubscriptionPlanRequest struct {
	Plan model.SubscriptionPlan `json:"plan"`
}

func normalizeSubscriptionPlanPriceFields(plan *model.SubscriptionPlan) error {
	if plan == nil {
		return nil
	}
	if plan.PriceAmount < 0 {
		return fmt.Errorf("价格不能为负数")
	}
	if plan.PriceAmount > 9999 {
		return fmt.Errorf("价格不能超过9999")
	}
	if plan.DiscountPriceAmount < 0 {
		return fmt.Errorf("优惠价格不能为负数")
	}
	if plan.DiscountPriceAmount > 9999 {
		return fmt.Errorf("优惠价格不能超过9999")
	}
	if plan.DiscountPriceAmount > 0 {
		if plan.DiscountPriceAmount >= plan.PriceAmount {
			return fmt.Errorf("优惠价格必须小于原价")
		}
		if plan.DiscountDeadline <= 0 {
			return fmt.Errorf("设置优惠价格时必须填写优惠截止时间")
		}
	} else {
		plan.DiscountDeadline = 0
	}
	if plan.DiscountDeadline < 0 {
		return fmt.Errorf("优惠截止时间无效")
	}
	return nil
}

func normalizeSubscriptionPlanLimitFields(plan *model.SubscriptionPlan) error {
	if plan == nil {
		return nil
	}
	plan.ResourceType = model.NormalizeSubscriptionResourceType(plan.ResourceType)
	if plan.TotalAmount < 0 {
		return fmt.Errorf("总额度不能为负数")
	}
	if plan.RequestCountTotal < 0 {
		return fmt.Errorf("次数不能为负数")
	}
	if plan.TotalAmount <= 0 && plan.RequestCountTotal <= 0 {
		return fmt.Errorf("总额度和次数不能同时为0")
	}
	if plan.SaleLimitCount < 0 {
		return fmt.Errorf("可购买总数不能为负数")
	}
	if plan.SoldCount < 0 {
		return fmt.Errorf("已售数量不能为负数")
	}
	if plan.SaleLimitCount > 0 && plan.SoldCount > plan.SaleLimitCount {
		return fmt.Errorf("已售数量不能大于可购买总数")
	}
	return nil
}

func AdminCreateSubscriptionPlan(c *gin.Context) {
	var req AdminUpsertSubscriptionPlanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	req.Plan.Id = 0
	if strings.TrimSpace(req.Plan.Title) == "" {
		common.ApiErrorMsg(c, "套餐标题不能为空")
		return
	}
	if err := normalizeSubscriptionPlanPriceFields(&req.Plan); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	if req.Plan.Currency == "" {
		req.Plan.Currency = "USD"
	}
	req.Plan.Currency = "USD"
	if req.Plan.DurationUnit == "" {
		req.Plan.DurationUnit = model.SubscriptionDurationMonth
	}
	if req.Plan.DurationValue <= 0 && req.Plan.DurationUnit != model.SubscriptionDurationCustom {
		req.Plan.DurationValue = 1
	}
	if req.Plan.MaxPurchasePerUser < 0 {
		common.ApiErrorMsg(c, "购买上限不能为负数")
		return
	}
	req.Plan.UpgradeGroup = strings.TrimSpace(req.Plan.UpgradeGroup)
	if req.Plan.UpgradeGroup != "" {
		if _, ok := ratio_setting.GetGroupRatioCopy()[req.Plan.UpgradeGroup]; !ok {
			common.ApiErrorMsg(c, "升级分组不存在")
			return
		}
	}
	if err := normalizeSubscriptionPlanLimitFields(&req.Plan); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	req.Plan.QuotaResetPeriod = model.NormalizeResetPeriod(req.Plan.QuotaResetPeriod)
	if req.Plan.QuotaResetPeriod == model.SubscriptionResetCustom && req.Plan.QuotaResetCustomSeconds <= 0 {
		common.ApiErrorMsg(c, "自定义重置周期需大于0秒")
		return
	}
	err := model.DB.Create(&req.Plan).Error
	if err != nil {
		common.ApiError(c, err)
		return
	}
	model.InvalidateSubscriptionPlanCache(req.Plan.Id)
	applySubscriptionPlanDisplayFields(&req.Plan, common.GetTimestamp())
	common.ApiSuccess(c, req.Plan)
}

func AdminUpdateSubscriptionPlan(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if id <= 0 {
		common.ApiErrorMsg(c, "无效的ID")
		return
	}
	var req AdminUpsertSubscriptionPlanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	if strings.TrimSpace(req.Plan.Title) == "" {
		common.ApiErrorMsg(c, "套餐标题不能为空")
		return
	}
	if err := normalizeSubscriptionPlanPriceFields(&req.Plan); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	req.Plan.Id = id
	if req.Plan.Currency == "" {
		req.Plan.Currency = "USD"
	}
	req.Plan.Currency = "USD"
	if req.Plan.DurationUnit == "" {
		req.Plan.DurationUnit = model.SubscriptionDurationMonth
	}
	if req.Plan.DurationValue <= 0 && req.Plan.DurationUnit != model.SubscriptionDurationCustom {
		req.Plan.DurationValue = 1
	}
	if req.Plan.MaxPurchasePerUser < 0 {
		common.ApiErrorMsg(c, "购买上限不能为负数")
		return
	}
	req.Plan.UpgradeGroup = strings.TrimSpace(req.Plan.UpgradeGroup)
	if req.Plan.UpgradeGroup != "" {
		if _, ok := ratio_setting.GetGroupRatioCopy()[req.Plan.UpgradeGroup]; !ok {
			common.ApiErrorMsg(c, "升级分组不存在")
			return
		}
	}
	if err := normalizeSubscriptionPlanLimitFields(&req.Plan); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	req.Plan.QuotaResetPeriod = model.NormalizeResetPeriod(req.Plan.QuotaResetPeriod)
	if req.Plan.QuotaResetPeriod == model.SubscriptionResetCustom && req.Plan.QuotaResetCustomSeconds <= 0 {
		common.ApiErrorMsg(c, "自定义重置周期需大于0秒")
		return
	}

	err := model.DB.Transaction(func(tx *gorm.DB) error {
		// update plan (allow zero values updates with map)
		updateMap := map[string]interface{}{
			"title":                      req.Plan.Title,
			"subtitle":                   req.Plan.Subtitle,
			"price_amount":               req.Plan.PriceAmount,
			"discount_price_amount":      req.Plan.DiscountPriceAmount,
			"discount_deadline":          req.Plan.DiscountDeadline,
			"currency":                   req.Plan.Currency,
			"duration_unit":              req.Plan.DurationUnit,
			"duration_value":             req.Plan.DurationValue,
			"custom_seconds":             req.Plan.CustomSeconds,
			"enabled":                    req.Plan.Enabled,
			"sort_order":                 req.Plan.SortOrder,
			"stripe_price_id":            req.Plan.StripePriceId,
			"creem_product_id":           req.Plan.CreemProductId,
			"max_purchase_per_user":      req.Plan.MaxPurchasePerUser,
			"sale_limit_count":           req.Plan.SaleLimitCount,
			"sold_count":                 req.Plan.SoldCount,
			"total_amount":               req.Plan.TotalAmount,
			"resource_type":              req.Plan.ResourceType,
			"request_count_total":        req.Plan.RequestCountTotal,
			"upgrade_group":              req.Plan.UpgradeGroup,
			"quota_reset_period":         req.Plan.QuotaResetPeriod,
			"quota_reset_custom_seconds": req.Plan.QuotaResetCustomSeconds,
			"updated_at":                 common.GetTimestamp(),
		}
		if err := tx.Model(&model.SubscriptionPlan{}).Where("id = ?", id).Updates(updateMap).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	model.InvalidateSubscriptionPlanCache(id)
	common.ApiSuccess(c, nil)
}

type AdminUpdateSubscriptionPlanStatusRequest struct {
	Enabled *bool `json:"enabled"`
}

func AdminUpdateSubscriptionPlanStatus(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if id <= 0 {
		common.ApiErrorMsg(c, "无效的ID")
		return
	}
	var req AdminUpdateSubscriptionPlanStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Enabled == nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	if err := model.DB.Model(&model.SubscriptionPlan{}).Where("id = ?", id).Update("enabled", *req.Enabled).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	model.InvalidateSubscriptionPlanCache(id)
	common.ApiSuccess(c, nil)
}

type AdminBindSubscriptionRequest struct {
	UserId int `json:"user_id"`
	PlanId int `json:"plan_id"`
}

func AdminBindSubscription(c *gin.Context) {
	var req AdminBindSubscriptionRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.UserId <= 0 || req.PlanId <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	msg, err := model.AdminBindSubscription(req.UserId, req.PlanId, "")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if msg != "" {
		common.ApiSuccess(c, gin.H{"message": msg})
		return
	}
	common.ApiSuccess(c, nil)
}

// ---- Admin: user subscription management ----

func AdminListUserSubscriptions(c *gin.Context) {
	userId, _ := strconv.Atoi(c.Param("id"))
	if userId <= 0 {
		common.ApiErrorMsg(c, "无效的用户ID")
		return
	}
	pageInfo := common.GetPageQuery(c)
	keyword := c.Query("keyword")
	status := c.Query("status")
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)

	subs, total, err := model.GetUserSubscriptionsByAdmin(userId, pageInfo, keyword, status, startTimestamp, endTimestamp)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(subs)
	common.ApiSuccess(c, pageInfo)
}

func AdminListAllUserSubscriptions(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	username := c.Query("username")
	group := c.Query("group")
	status := c.Query("status")
	items, total, err := model.GetAdminUserSubscriptions(pageInfo, username, group, status)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(items)
	common.ApiSuccess(c, pageInfo)
}

func AdminListSubscriptionConsumeLogs(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	subscriptionId, _ := strconv.Atoi(c.Query("subscription_id"))
	planId, _ := strconv.Atoi(c.Query("plan_id"))
	filterUserId, _ := strconv.Atoi(c.Query("user_id"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	logs, total, summary, err := model.GetSubscriptionConsumeLogs(
		0,
		subscriptionId,
		planId,
		filterUserId,
		startTimestamp,
		endTimestamp,
		pageInfo.GetStartIdx(),
		pageInfo.GetPageSize(),
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"page":      pageInfo.Page,
		"page_size": pageInfo.PageSize,
		"total":     total,
		"items":     logs,
		"summary":   summary,
	})
}

type AdminCreateUserSubscriptionRequest struct {
	PlanId int `json:"plan_id"`
}

type AdminSubscriptionMigrationRequest struct {
	TargetPlanId        int    `json:"target_plan_id"`
	Group               string `json:"group"`
	SourceGroup         string `json:"source_group"`
	SourceResourceType  string `json:"source_resource_type"`
	ExcludeDurationUnit string `json:"exclude_duration_unit"`
	SourcePlanIds       []int  `json:"source_plan_ids"`
}

type AdminUserSubscriptionActionRequest struct {
	Action string `json:"action"`
	Value  int64  `json:"value"`
}

// AdminCreateUserSubscription creates a new user subscription from a plan (no payment).
func AdminCreateUserSubscription(c *gin.Context) {
	userId, _ := strconv.Atoi(c.Param("id"))
	if userId <= 0 {
		common.ApiErrorMsg(c, "无效的用户ID")
		return
	}
	var req AdminCreateUserSubscriptionRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.PlanId <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	msg, err := model.AdminBindSubscription(userId, req.PlanId, "")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if msg != "" {
		common.ApiSuccess(c, gin.H{"message": msg})
		return
	}
	common.ApiSuccess(c, nil)
}

func buildAdminSubscriptionMigrationFilter(req AdminSubscriptionMigrationRequest) model.SubscriptionMigrationFilter {
	group := strings.TrimSpace(req.Group)
	sourceGroup := strings.TrimSpace(req.SourceGroup)
	if sourceGroup == "" {
		sourceGroup = group
	}
	return model.SubscriptionMigrationFilter{
		TargetPlanId:        req.TargetPlanId,
		UserGroup:           group,
		SourceGroup:         sourceGroup,
		SourceResourceType:  req.SourceResourceType,
		ExcludeDurationUnit: req.ExcludeDurationUnit,
		SourcePlanIds:       req.SourcePlanIds,
	}
}

func AdminPreviewSubscriptionMigration(c *gin.Context) {
	var req AdminSubscriptionMigrationRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.TargetPlanId <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	filter := buildAdminSubscriptionMigrationFilter(req)
	items, targetPlan, err := model.ListSubscriptionMigrationCandidates(filter)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"target_plan": targetPlan,
		"total":       len(items),
		"items":       items,
	})
}

func AdminExecuteSubscriptionMigration(c *gin.Context) {
	var req AdminSubscriptionMigrationRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.TargetPlanId <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	filter := buildAdminSubscriptionMigrationFilter(req)
	result, err := model.ExecuteSubscriptionMigration(filter)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

func AdminOperateUserSubscription(c *gin.Context) {
	subId, _ := strconv.Atoi(c.Param("id"))
	if subId <= 0 {
		common.ApiErrorMsg(c, "无效的订阅ID")
		return
	}
	var req AdminUserSubscriptionActionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	req.Action = model.NormalizeAdminSubscriptionAction(req.Action)
	if req.Action == "" {
		common.ApiErrorMsg(c, "无效的操作")
		return
	}
	msg, err := model.AdminOperateUserSubscription(subId, req.Action, req.Value)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if msg != "" {
		common.ApiSuccess(c, gin.H{"message": msg})
		return
	}
	common.ApiSuccess(c, nil)
}

// AdminInvalidateUserSubscription cancels a user subscription immediately.
func AdminInvalidateUserSubscription(c *gin.Context) {
	subId, _ := strconv.Atoi(c.Param("id"))
	if subId <= 0 {
		common.ApiErrorMsg(c, "无效的订阅ID")
		return
	}
	msg, err := model.AdminInvalidateUserSubscription(subId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if msg != "" {
		common.ApiSuccess(c, gin.H{"message": msg})
		return
	}
	common.ApiSuccess(c, nil)
}

// AdminDeleteUserSubscription hard-deletes a user subscription.
func AdminDeleteUserSubscription(c *gin.Context) {
	subId, _ := strconv.Atoi(c.Param("id"))
	if subId <= 0 {
		common.ApiErrorMsg(c, "无效的订阅ID")
		return
	}
	if c.GetInt("role") != common.RoleRootUser {
		common.ApiErrorMsg(c, "仅超级管理员可删除订阅记录，请优先使用作废")
		return
	}
	msg, err := model.AdminDeleteUserSubscription(subId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if msg != "" {
		common.ApiSuccess(c, gin.H{"message": msg})
		return
	}
	common.ApiSuccess(c, nil)
}
