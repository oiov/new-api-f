package model

import (
	"fmt"
	"math"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"gorm.io/gorm"
)

const (
	SubscriptionConversionRequestStatusPending  = "pending"
	SubscriptionConversionRequestStatusApproved = "approved"
	SubscriptionConversionRequestStatusRejected = "rejected"
	SubscriptionConversionRequestStatusCanceled = "canceled"

	SubscriptionConversionPayoutStatusNone    = ""
	SubscriptionConversionPayoutStatusPending = "pending"
	SubscriptionConversionPayoutStatusPaid    = "paid"
)

type SubscriptionConversionRequest struct {
	Id int `json:"id"`

	UserId   int    `json:"user_id" gorm:"index;not null"`
	Username string `json:"username,omitempty" gorm:"-"`

	CampaignKey   string `json:"campaign_key" gorm:"type:varchar(128);not null;default:'';index"`
	CampaignTitle string `json:"campaign_title" gorm:"type:varchar(255);not null;default:''"`
	Status        string `json:"status" gorm:"type:varchar(32);not null;default:'pending';index"`

	SubscriptionIdsJSON       string `json:"subscription_ids_json" gorm:"type:text;not null"`
	SubscriptionSnapshotsJSON string `json:"-" gorm:"type:text;not null;default:''"`
	RequestRemark             string `json:"request_remark" gorm:"type:text;default:''"`
	AdminRemark               string `json:"admin_remark" gorm:"type:text;default:''"`
	RequestedRefundTarget     string `json:"requested_refund_target" gorm:"type:varchar(32);not null;default:'balance'"`
	ApprovedRefundTarget      string `json:"approved_refund_target" gorm:"type:varchar(32);not null;default:''"`
	PayoutStatus              string `json:"payout_status" gorm:"type:varchar(32);not null;default:''"`
	PayoutRemark              string `json:"payout_remark" gorm:"type:text;default:''"`

	RequestedRatio  float64 `json:"requested_ratio" gorm:"type:decimal(12,6);not null;default:1"`
	RequestedAmount float64 `json:"requested_amount" gorm:"type:decimal(12,2);not null;default:0"`
	RequestedQuota  int     `json:"requested_quota" gorm:"type:int;not null;default:0"`

	ApprovedRatio  float64 `json:"approved_ratio" gorm:"type:decimal(12,6);not null;default:0"`
	ApprovedAmount float64 `json:"approved_amount" gorm:"type:decimal(12,2);not null;default:0"`
	ApprovedQuota  int     `json:"approved_quota" gorm:"type:int;not null;default:0"`

	ApprovedAt int64 `json:"approved_at" gorm:"bigint;default:0"`
	RejectedAt int64 `json:"rejected_at" gorm:"bigint;default:0"`
	ExecutedAt int64 `json:"executed_at" gorm:"bigint;default:0"`
	PayoutAt   int64 `json:"payout_at" gorm:"bigint;default:0"`
	DisabledAt int64 `json:"disabled_at" gorm:"bigint;default:0"`
	CreateTime int64 `json:"create_time" gorm:"bigint;autoCreateTime"`
	UpdateTime int64 `json:"update_time" gorm:"bigint;autoUpdateTime"`

	SubscriptionItems []*SubscriptionConversionRequestItem `json:"subscription_items,omitempty" gorm:"-"`
}

type SubscriptionConversionRequestItem struct {
	UserSubscriptionId int                             `json:"user_subscription_id"`
	PlanId             int                             `json:"plan_id"`
	PlanTitle          string                          `json:"plan_title"`
	Source             string                          `json:"source"`
	StartTime          int64                           `json:"start_time"`
	EndTime            int64                           `json:"end_time"`
	RefundOrder        *SubscriptionRefundOrderSummary `json:"refund_order,omitempty"`
}

type subscriptionConversionRequestSnapshot struct {
	UserSubscriptionId int                             `json:"user_subscription_id"`
	PlanId             int                             `json:"plan_id"`
	PlanTitle          string                          `json:"plan_title"`
	Source             string                          `json:"source"`
	StartTime          int64                           `json:"start_time"`
	EndTime            int64                           `json:"end_time"`
	NextResetTime      int64                           `json:"next_reset_time"`
	RefundOrder        *SubscriptionRefundOrderSummary `json:"refund_order,omitempty"`
}

type SubscriptionConversionAdminFilters struct {
	Keyword      string
	Status       string
	PayoutStatus string
}

func (r *SubscriptionConversionRequest) BeforeCreate(tx *gorm.DB) error {
	now := common.GetTimestamp()
	if r.CreateTime <= 0 {
		r.CreateTime = now
	}
	r.UpdateTime = now
	if strings.TrimSpace(r.Status) == "" {
		r.Status = SubscriptionConversionRequestStatusPending
	}
	if NormalizeSubscriptionRefundTarget(r.RequestedRefundTarget) == "" {
		r.RequestedRefundTarget = SubscriptionRefundTargetBalance
	}
	return nil
}

func (r *SubscriptionConversionRequest) BeforeUpdate(tx *gorm.DB) error {
	r.UpdateTime = common.GetTimestamp()
	return nil
}

func normalizeSubscriptionConversionRequestStatus(status string) string {
	switch strings.TrimSpace(status) {
	case SubscriptionConversionRequestStatusPending:
		return SubscriptionConversionRequestStatusPending
	case SubscriptionConversionRequestStatusApproved:
		return SubscriptionConversionRequestStatusApproved
	case SubscriptionConversionRequestStatusRejected:
		return SubscriptionConversionRequestStatusRejected
	case SubscriptionConversionRequestStatusCanceled:
		return SubscriptionConversionRequestStatusCanceled
	default:
		return ""
	}
}

func normalizeSubscriptionConversionPayoutStatus(status string) string {
	switch strings.TrimSpace(status) {
	case SubscriptionConversionPayoutStatusPending:
		return SubscriptionConversionPayoutStatusPending
	case SubscriptionConversionPayoutStatusPaid:
		return SubscriptionConversionPayoutStatusPaid
	default:
		return SubscriptionConversionPayoutStatusNone
	}
}

func encodeSubscriptionIDList(ids []int) (string, error) {
	data, err := common.Marshal(normalizeSubscriptionIntList(ids))
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func decodeSubscriptionIDList(raw string) ([]int, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	var ids []int
	if err := common.UnmarshalJsonStr(raw, &ids); err != nil {
		return nil, err
	}
	return normalizeSubscriptionIntList(ids), nil
}

func encodeSubscriptionConversionSnapshots(items []subscriptionConversionRequestSnapshot) (string, error) {
	data, err := common.Marshal(items)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func decodeSubscriptionConversionSnapshots(raw string) ([]subscriptionConversionRequestSnapshot, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	var items []subscriptionConversionRequestSnapshot
	if err := common.UnmarshalJsonStr(raw, &items); err != nil {
		return nil, err
	}
	result := make([]subscriptionConversionRequestSnapshot, 0, len(items))
	seen := make(map[int]struct{}, len(items))
	for _, item := range items {
		if item.UserSubscriptionId <= 0 {
			continue
		}
		if _, ok := seen[item.UserSubscriptionId]; ok {
			continue
		}
		seen[item.UserSubscriptionId] = struct{}{}
		result = append(result, item)
	}
	return result, nil
}

func getSubscriptionConversionDisabledAt(request *SubscriptionConversionRequest) int64 {
	if request == nil {
		return 0
	}
	if request.DisabledAt > 0 {
		return request.DisabledAt
	}
	if request.CreateTime > 0 {
		return request.CreateTime
	}
	return common.GetTimestamp()
}

func buildSubscriptionRefundOrderSnapshotForConversion(sub *UserSubscription, tx *gorm.DB) (*SubscriptionRefundOrderSummary, error) {
	summary, err := buildSubscriptionRefundOrderSummaryFromSubscription(sub, tx)
	if err != nil || summary != nil || sub == nil {
		return summary, err
	}
	order := findMatchedSuccessfulSubscriptionOrder(sub.UserId, sub.PlanId, sub.CreatedAt, tx)
	if order == nil {
		return nil, nil
	}
	summary = &SubscriptionRefundOrderSummary{
		OrderId:       order.Id,
		TradeNo:       order.TradeNo,
		PaymentMethod: order.PaymentMethod,
		Money:         order.Money,
		CompleteTime:  order.CompleteTime,
	}
	topUpMap, err := buildTopUpMapByTradeNo([]string{order.TradeNo}, tx)
	if err != nil {
		return nil, err
	}
	if topUp := topUpMap[order.TradeNo]; topUp != nil {
		summary.TopUpId = topUp.Id
		if summary.CompleteTime <= 0 {
			summary.CompleteTime = topUp.CompleteTime
		}
	}
	return summary, nil
}

func lockSubscriptionConversionTargetsTx(tx *gorm.DB, userId int, subscriptionIDs []int) ([]UserSubscription, error) {
	if tx == nil {
		return nil, fmt.Errorf("invalid tx")
	}
	if userId <= 0 || len(subscriptionIDs) == 0 {
		return nil, fmt.Errorf("invalid subscription conversion targets")
	}
	var subs []UserSubscription
	if err := tx.Set("gorm:query_option", "FOR UPDATE").
		Where("user_id = ? AND id IN ?", userId, subscriptionIDs).
		Order("end_time asc, id asc").
		Find(&subs).Error; err != nil {
		return nil, err
	}
	if len(subs) == 0 {
		return nil, fmt.Errorf("申请中的套餐已不存在")
	}
	if len(subs) != len(subscriptionIDs) {
		return nil, fmt.Errorf("申请中的部分套餐已不存在或不可用，请让用户重新提交申请")
	}
	subIndex := make(map[int]UserSubscription, len(subs))
	for i := range subs {
		subIndex[subs[i].Id] = subs[i]
	}
	orderedSubs := make([]UserSubscription, 0, len(subscriptionIDs))
	for _, subID := range subscriptionIDs {
		sub, ok := subIndex[subID]
		if !ok {
			return nil, fmt.Errorf("申请中的部分套餐已不存在或不可用，请让用户重新提交申请")
		}
		orderedSubs = append(orderedSubs, sub)
	}
	return orderedSubs, nil
}

func downgradeUserGroupsForSubscriptionListTx(tx *gorm.DB, subs []UserSubscription, now int64) (string, error) {
	cacheGroup := ""
	for i := range subs {
		if err := tx.Model(&subs[i]).Updates(map[string]any{
			"status":     "cancelled",
			"end_time":   now,
			"updated_at": now,
		}).Error; err != nil {
			return "", err
		}
		targetGroup, err := downgradeUserGroupForSubscriptionTx(tx, &subs[i], now)
		if err != nil {
			return "", err
		}
		if targetGroup != "" {
			cacheGroup = targetGroup
		}
	}
	return cacheGroup, nil
}

func restoreUserGroupForPendingConversionTx(tx *gorm.DB, userId int, now int64) (string, error) {
	if tx == nil || userId <= 0 {
		return "", fmt.Errorf("invalid restore group args")
	}
	var activeSub UserSubscription
	activeQuery := tx.Where("user_id = ? AND status = ? AND end_time > ? AND upgrade_group <> ''",
		userId, "active", now).
		Order("end_time desc, id desc").
		Limit(1).
		Find(&activeSub)
	if activeQuery.Error != nil || activeQuery.RowsAffected == 0 {
		return "", activeQuery.Error
	}
	targetGroup := strings.TrimSpace(activeSub.UpgradeGroup)
	if targetGroup == "" {
		return "", nil
	}
	currentGroup, err := getUserGroupByIdTx(tx, userId)
	if err != nil {
		return "", err
	}
	if currentGroup == targetGroup {
		return "", nil
	}
	if err := tx.Model(&User{}).Where("id = ?", userId).
		Update("group", targetGroup).Error; err != nil {
		return "", err
	}
	return targetGroup, nil
}

func GetLatestSubscriptionConversionRequestByUser(userId int) (*SubscriptionConversionRequest, error) {
	if userId <= 0 {
		return nil, fmt.Errorf("invalid user id")
	}
	var request SubscriptionConversionRequest
	err := DB.Where("user_id = ?", userId).Order("id desc").First(&request).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &request, nil
}

func selectSubscriptionConversionPreviewItems(preview *SelfServiceSubscriptionConversionPreview, selectedSubscriptionIDs []int, strictSelection bool) ([]SelfServiceSubscriptionConversionPreviewItem, int, float64, error) {
	if preview == nil {
		return nil, 0, 0, fmt.Errorf("invalid conversion preview")
	}
	if len(preview.Items) == 0 {
		return nil, 0, 0, fmt.Errorf("当前没有可申请折算的套餐")
	}
	if !strictSelection {
		return preview.Items, preview.TotalConvertibleQuota, preview.TotalConvertibleAmount, nil
	}
	selectedSubscriptionIDs = normalizeSubscriptionIntList(selectedSubscriptionIDs)
	if len(selectedSubscriptionIDs) == 0 {
		return nil, 0, 0, fmt.Errorf("请至少选择一个套餐")
	}
	selectedSet := make(map[int]struct{}, len(selectedSubscriptionIDs))
	for _, id := range selectedSubscriptionIDs {
		if id > 0 {
			selectedSet[id] = struct{}{}
		}
	}
	if len(selectedSet) == 0 {
		return nil, 0, 0, fmt.Errorf("请至少选择一个套餐")
	}
	previewItemMap := make(map[int]SelfServiceSubscriptionConversionPreviewItem, len(preview.Items))
	for _, item := range preview.Items {
		if item.UserSubscriptionId > 0 {
			previewItemMap[item.UserSubscriptionId] = item
		}
	}
	for id := range selectedSet {
		if _, ok := previewItemMap[id]; !ok {
			return nil, 0, 0, fmt.Errorf("所选套餐已发生变化，请刷新后重试")
		}
	}
	items := make([]SelfServiceSubscriptionConversionPreviewItem, 0, len(selectedSet))
	totalQuota := 0
	totalAmount := 0.0
	for _, item := range preview.Items {
		if _, ok := selectedSet[item.UserSubscriptionId]; !ok {
			continue
		}
		items = append(items, item)
		totalQuota += item.ConvertibleQuota
		totalAmount += item.ConvertibleAmount
	}
	if len(items) == 0 || totalQuota <= 0 {
		return nil, 0, 0, fmt.Errorf("当前没有可申请折算的套餐")
	}
	return items, totalQuota, math.Round(totalAmount*100) / 100, nil
}

func CreateSubscriptionConversionRequest(userId int, requestRemark string, refundTarget string, selectedSubscriptionIDs []int, strictSelection bool) (*SubscriptionConversionRequest, error) {
	if userId <= 0 {
		return nil, fmt.Errorf("invalid user id")
	}
	refundSettings := GetSubscriptionRefundSettings()
	if !refundSettings.IsRefundPageEnabled() {
		return nil, fmt.Errorf("当前退款入口未开启")
	}
	refundTarget = NormalizeSubscriptionRefundTarget(refundTarget)
	if refundTarget == "" {
		refundTarget = refundSettings.DefaultRefundTarget()
	}
	if !refundSettings.IsRefundTargetAllowed(refundTarget) {
		return nil, fmt.Errorf("当前不支持该退款去向")
	}
	preview, err := PreviewSelfServiceSubscriptionConversion(userId)
	if err != nil {
		return nil, err
	}
	if !preview.Campaign.Enabled {
		return nil, fmt.Errorf("当前活动未开启")
	}
	if preview.Now >= preview.Campaign.Deadline {
		return nil, fmt.Errorf("当前活动已截止")
	}
	if len(preview.Items) == 0 || preview.TotalConvertibleQuota <= 0 {
		return nil, fmt.Errorf("当前没有可申请折算的套餐")
	}
	selectedItems, selectedTotalQuota, selectedTotalAmount, err := selectSubscriptionConversionPreviewItems(preview, selectedSubscriptionIDs, strictSelection)
	if err != nil {
		return nil, err
	}
	return createSubscriptionConversionRequestFromPreview(
		userId,
		preview,
		selectedItems,
		selectedTotalQuota,
		selectedTotalAmount,
		requestRemark,
		refundTarget,
	)
}

func createSubscriptionConversionRequestFromPreview(userId int, preview *SelfServiceSubscriptionConversionPreview, selectedItems []SelfServiceSubscriptionConversionPreviewItem, selectedTotalQuota int, selectedTotalAmount float64, requestRemark string, refundTarget string) (*SubscriptionConversionRequest, error) {
	if userId <= 0 || preview == nil {
		return nil, fmt.Errorf("invalid conversion request args")
	}
	subscriptionIDs := make([]int, 0, len(selectedItems))
	previewItemMap := make(map[int]SelfServiceSubscriptionConversionPreviewItem, len(selectedItems))
	for _, item := range selectedItems {
		if item.UserSubscriptionId > 0 {
			subscriptionIDs = append(subscriptionIDs, item.UserSubscriptionId)
			previewItemMap[item.UserSubscriptionId] = item
		}
	}
	if len(subscriptionIDs) == 0 {
		return nil, fmt.Errorf("当前没有可申请折算的套餐")
	}
	subscriptionIDsJSON, err := encodeSubscriptionIDList(subscriptionIDs)
	if err != nil {
		return nil, err
	}
	requestRemark = strings.TrimSpace(requestRemark)
	var created SubscriptionConversionRequest
	cacheGroup := ""
	err = DB.Transaction(func(tx *gorm.DB) error {
		var lockedUser User
		if err := tx.Set("gorm:query_option", "FOR UPDATE").
			Select("id").
			Where("id = ?", userId).
			First(&lockedUser).Error; err != nil {
			return err
		}
		var existing SubscriptionConversionRequest
		err := tx.Set("gorm:query_option", "FOR UPDATE").
			Where("user_id = ? AND status = ?", userId, SubscriptionConversionRequestStatusPending).
			Order("id desc").
			First(&existing).Error
		if err == nil {
			return fmt.Errorf("你已有待审核的折算申请，请等待管理员处理")
		}
		if err != nil && err != gorm.ErrRecordNotFound {
			return err
		}
		now := GetDBTimestampWithTx(tx)
		subs, err := lockSubscriptionConversionTargetsTx(tx, userId, subscriptionIDs)
		if err != nil {
			return err
		}
		snapshots := make([]subscriptionConversionRequestSnapshot, 0, len(subs))
		for i := range subs {
			if subs[i].Status != "active" || subs[i].EndTime <= now {
				return fmt.Errorf("申请中的套餐已过期或失效，请刷新后重试")
			}
			previewItem, ok := previewItemMap[subs[i].Id]
			if !ok {
				return fmt.Errorf("所选套餐已发生变化，请刷新后重试")
			}
			refundOrder, err := buildSubscriptionRefundOrderSnapshotForConversion(&subs[i], tx)
			if err != nil {
				return err
			}
			snapshots = append(snapshots, subscriptionConversionRequestSnapshot{
				UserSubscriptionId: subs[i].Id,
				PlanId:             subs[i].PlanId,
				PlanTitle:          strings.TrimSpace(previewItem.PlanTitle),
				Source:             strings.TrimSpace(subs[i].Source),
				StartTime:          subs[i].StartTime,
				EndTime:            subs[i].EndTime,
				NextResetTime:      subs[i].NextResetTime,
				RefundOrder:        refundOrder,
			})
		}
		snapshotsJSON, err := encodeSubscriptionConversionSnapshots(snapshots)
		if err != nil {
			return err
		}
		request := SubscriptionConversionRequest{
			UserId:                    userId,
			CampaignKey:               strings.TrimSpace(preview.Campaign.Key),
			CampaignTitle:             strings.TrimSpace(preview.Campaign.Title),
			Status:                    SubscriptionConversionRequestStatusPending,
			SubscriptionIdsJSON:       subscriptionIDsJSON,
			SubscriptionSnapshotsJSON: snapshotsJSON,
			RequestRemark:             requestRemark,
			RequestedRefundTarget:     refundTarget,
			RequestedRatio:            1,
			RequestedAmount:           math.Round(selectedTotalAmount*100) / 100,
			RequestedQuota:            selectedTotalQuota,
			DisabledAt:                now,
		}
		if err := tx.Create(&request).Error; err != nil {
			return err
		}
		cacheGroup, err = downgradeUserGroupsForSubscriptionListTx(tx, subs, now)
		if err != nil {
			return err
		}
		created = request
		return nil
	})
	if err != nil {
		return nil, err
	}
	if cacheGroup != "" {
		_ = UpdateUserGroupCache(userId, cacheGroup)
	}
	if created.RequestedRefundTarget == SubscriptionRefundTargetOriginalPayment {
		RecordLog(userId, LogTypeSystem, fmt.Sprintf("已提交套餐退款申请（原路退款），原套餐已暂时禁用，预计退款金额 %.2f", created.RequestedAmount))
	} else {
		RecordLog(userId, LogTypeSystem, fmt.Sprintf("已提交套餐转余额申请，原套餐已暂时禁用，预计返还 %s", logger.LogQuota(created.RequestedQuota)))
	}
	return &created, nil
}

func GetSubscriptionConversionRequestsByAdmin(pageInfo *common.PageInfo, filters SubscriptionConversionAdminFilters) ([]*SubscriptionConversionRequest, int64, error) {
	if pageInfo == nil {
		pageInfo = &common.PageInfo{Page: 1, PageSize: common.ItemsPerPage}
	}
	query := DB.Table("subscription_conversion_requests scr").
		Select("scr.*, users.username").
		Joins("LEFT JOIN users ON users.id = scr.user_id")

	if status := normalizeSubscriptionConversionRequestStatus(filters.Status); status != "" {
		query = query.Where("scr.status = ?", status)
	}
	if payoutStatus := normalizeSubscriptionConversionPayoutStatus(filters.PayoutStatus); payoutStatus != "" {
		query = query.Where("scr.payout_status = ?", payoutStatus)
	}
	if keyword := strings.TrimSpace(filters.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		if keywordInt, err := strconv.Atoi(keyword); err == nil {
			query = query.Where("scr.id = ? OR scr.user_id = ?", keywordInt, keywordInt)
		} else {
			query = query.Where("users.username LIKE ? OR scr.campaign_title LIKE ?", like, like)
		}
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var items []*SubscriptionConversionRequest
	if err := query.Order("scr.id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&items).Error; err != nil {
		return nil, 0, err
	}
	if err := attachSubscriptionConversionRequestItems(items); err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func attachSubscriptionConversionRequestItems(items []*SubscriptionConversionRequest) error {
	if len(items) == 0 {
		return nil
	}
	subscriptionIDSet := make(map[int]struct{})
	for _, item := range items {
		if item == nil {
			continue
		}
		ids, err := decodeSubscriptionIDList(item.SubscriptionIdsJSON)
		if err != nil {
			return err
		}
		for _, id := range ids {
			if id > 0 {
				subscriptionIDSet[id] = struct{}{}
			}
		}
	}
	if len(subscriptionIDSet) == 0 {
		return nil
	}
	subscriptionIDs := make([]int, 0, len(subscriptionIDSet))
	for id := range subscriptionIDSet {
		subscriptionIDs = append(subscriptionIDs, id)
	}

	var subs []UserSubscription
	if err := DB.Where("id IN ?", subscriptionIDs).Find(&subs).Error; err != nil {
		return err
	}
	subByID := make(map[int]UserSubscription, len(subs))
	for _, sub := range subs {
		subByID[sub.Id] = sub
	}

	for _, item := range items {
		if item == nil {
			continue
		}
		snapshotMap := make(map[int]subscriptionConversionRequestSnapshot)
		snapshots, err := decodeSubscriptionConversionSnapshots(item.SubscriptionSnapshotsJSON)
		if err != nil {
			return err
		}
		for _, snapshot := range snapshots {
			snapshotMap[snapshot.UserSubscriptionId] = snapshot
		}
		ids, err := decodeSubscriptionIDList(item.SubscriptionIdsJSON)
		if err != nil {
			return err
		}
		details := make([]*SubscriptionConversionRequestItem, 0, len(ids))
		for _, id := range ids {
			snapshot, hasSnapshot := snapshotMap[id]
			if hasSnapshot {
				detail := &SubscriptionConversionRequestItem{
					UserSubscriptionId: snapshot.UserSubscriptionId,
					PlanId:             snapshot.PlanId,
					PlanTitle:          strings.TrimSpace(snapshot.PlanTitle),
					Source:             strings.TrimSpace(snapshot.Source),
					StartTime:          snapshot.StartTime,
					EndTime:            snapshot.EndTime,
					RefundOrder:        snapshot.RefundOrder,
				}
				if detail.PlanTitle == "" && detail.PlanId > 0 {
					detail.PlanTitle = fmt.Sprintf("#%d", detail.PlanId)
				}
				details = append(details, detail)
				continue
			}
			sub, ok := subByID[id]
			if !ok {
				continue
			}
			refundOrder, err := buildSubscriptionRefundOrderSummaryFromSubscription(&sub, nil)
			if err != nil {
				return err
			}
			detail := &SubscriptionConversionRequestItem{
				UserSubscriptionId: sub.Id,
				PlanId:             sub.PlanId,
				PlanTitle:          fmt.Sprintf("#%d", sub.PlanId),
				Source:             strings.TrimSpace(sub.Source),
				StartTime:          sub.StartTime,
				EndTime:            sub.EndTime,
				RefundOrder:        refundOrder,
			}
			details = append(details, detail)
		}
		item.SubscriptionItems = details
	}
	return nil
}

func executeSubscriptionConversionRequestTx(tx *gorm.DB, request *SubscriptionConversionRequest, approvedQuota int, approvedAmount float64, approvedRefundTarget string) (string, error) {
	if tx == nil || request == nil {
		return "", fmt.Errorf("invalid conversion approval args")
	}
	subscriptionIDs, err := decodeSubscriptionIDList(request.SubscriptionIdsJSON)
	if err != nil {
		return "", err
	}
	if len(subscriptionIDs) == 0 {
		return "", fmt.Errorf("申请中没有可执行的套餐")
	}
	now := GetDBTimestampWithTx(tx)
	subs, err := lockSubscriptionConversionTargetsTx(tx, request.UserId, subscriptionIDs)
	if err != nil {
		return "", err
	}
	if request.DisabledAt <= 0 {
		for i := range subs {
			if subs[i].Status != "active" || subs[i].EndTime <= now {
				return "", fmt.Errorf("申请中的套餐已过期或失效，请让用户重新提交申请")
			}
		}
	} else {
		for i := range subs {
			if subs[i].Status != "cancelled" || subs[i].EndTime != request.DisabledAt {
				return "", fmt.Errorf("申请中的套餐状态已发生变化，请先重新核对后再处理")
			}
		}
	}
	if approvedRefundTarget == SubscriptionRefundTargetBalance {
		if approvedQuota <= 0 {
			return "", fmt.Errorf("审批增加的余额必须大于0")
		}
		if err := tx.Model(&User{}).Where("id = ?", request.UserId).
			Update("quota", gorm.Expr("quota + ?", approvedQuota)).Error; err != nil {
			return "", err
		}
	}
	cacheGroup := ""
	if request.DisabledAt <= 0 {
		cacheGroup, err = downgradeUserGroupsForSubscriptionListTx(tx, subs, now)
		if err != nil {
			return "", err
		}
	}
	request.Status = SubscriptionConversionRequestStatusApproved
	request.ApprovedAt = now
	if approvedRefundTarget == SubscriptionRefundTargetBalance {
		request.ExecutedAt = now
		request.PayoutStatus = SubscriptionConversionPayoutStatusNone
		request.PayoutAt = 0
		request.PayoutRemark = ""
	} else {
		request.PayoutStatus = SubscriptionConversionPayoutStatusPending
		request.PayoutAt = 0
	}
	request.ApprovedRefundTarget = approvedRefundTarget
	request.ApprovedQuota = approvedQuota
	request.ApprovedAmount = math.Round(approvedAmount*100) / 100
	if request.ApprovedRatio <= 0 {
		request.ApprovedRatio = 1
	}
	if err := tx.Save(request).Error; err != nil {
		return "", err
	}
	return cacheGroup, nil
}

func ApproveSubscriptionConversionRequest(requestId int, approvedRatio float64, approvedQuota int, approvedRefundTarget string, adminRemark string) (*SubscriptionConversionRequest, error) {
	if requestId <= 0 {
		return nil, fmt.Errorf("invalid request id")
	}
	adminRemark = strings.TrimSpace(adminRemark)
	var request SubscriptionConversionRequest
	cacheGroup := ""
	err := DB.Transaction(func(tx *gorm.DB) error {
		var lockedUser User
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where("id = ?", requestId).First(&request).Error; err != nil {
			return err
		}
		if err := tx.Set("gorm:query_option", "FOR UPDATE").
			Select("id").
			Where("id = ?", request.UserId).
			First(&lockedUser).Error; err != nil {
			return err
		}
		if request.Status != SubscriptionConversionRequestStatusPending {
			return fmt.Errorf("仅可审批待审核申请")
		}
		refundSettings := GetSubscriptionRefundSettings()
		approvedRefundTarget = NormalizeSubscriptionRefundTarget(approvedRefundTarget)
		if approvedRefundTarget == "" {
			approvedRefundTarget = NormalizeSubscriptionRefundTarget(request.RequestedRefundTarget)
		}
		if !refundSettings.IsRefundTargetAllowed(approvedRefundTarget) {
			return fmt.Errorf("当前不支持该退款去向")
		}
		if approvedRatio <= 0 {
			approvedRatio = 1
		}
		if approvedRefundTarget == SubscriptionRefundTargetBalance && approvedQuota <= 0 {
			approvedQuota = int(math.Round(float64(request.RequestedQuota) * approvedRatio))
		}
		if approvedRefundTarget == SubscriptionRefundTargetBalance && approvedQuota <= 0 {
			return fmt.Errorf("审批增加的余额必须大于0")
		}
		if approvedRefundTarget != SubscriptionRefundTargetBalance {
			approvedQuota = 0
		}
		request.ApprovedRatio = approvedRatio
		request.AdminRemark = adminRemark
		approvedAmount := 0.0
		ratioDerivedQuota := int(math.Round(float64(request.RequestedQuota) * approvedRatio))
		if ratioDerivedQuota == approvedQuota && request.RequestedAmount > 0 {
			approvedAmount = request.RequestedAmount * approvedRatio
		}
		if approvedAmount <= 0 && common.QuotaPerUnit > 0 {
			approvedAmount = float64(approvedQuota) / common.QuotaPerUnit
		}
		if approvedRefundTarget == SubscriptionRefundTargetOriginalPayment && request.RequestedAmount > 0 {
			approvedAmount = request.RequestedAmount * approvedRatio
		}
		var execErr error
		cacheGroup, execErr = executeSubscriptionConversionRequestTx(tx, &request, approvedQuota, approvedAmount, approvedRefundTarget)
		return execErr
	})
	if err != nil {
		return nil, err
	}
	if cacheGroup != "" {
		_ = UpdateUserGroupCache(request.UserId, cacheGroup)
	}
	if request.ApprovedRefundTarget == SubscriptionRefundTargetBalance {
		if user, getErr := GetUserById(request.UserId, false); getErr == nil && user != nil {
			_ = updateUserQuotaCache(request.UserId, user.Quota)
		}
	}
	if request.ApprovedRefundTarget == SubscriptionRefundTargetOriginalPayment {
		RecordLog(request.UserId, LogTypeSystem, fmt.Sprintf("套餐退款申请已通过，退款方式为原路退款，审批金额 %.2f", request.ApprovedAmount))
	} else {
		RecordLog(request.UserId, LogTypeSystem, fmt.Sprintf("套餐转余额申请已通过，到账 %s", logger.LogQuota(request.ApprovedQuota)))
	}
	return &request, nil
}

func MarkSubscriptionConversionRequestPaid(requestId int, payoutRemark string) (*SubscriptionConversionRequest, error) {
	if requestId <= 0 {
		return nil, fmt.Errorf("invalid request id")
	}
	payoutRemark = strings.TrimSpace(payoutRemark)
	if payoutRemark == "" {
		return nil, fmt.Errorf("打款流水或备注不能为空")
	}
	var request SubscriptionConversionRequest
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Set("gorm:query_option", "FOR UPDATE").
			Where("id = ?", requestId).
			First(&request).Error; err != nil {
			return err
		}
		if request.Status != SubscriptionConversionRequestStatusApproved {
			return fmt.Errorf("仅可标记已批准申请为已打款")
		}
		if NormalizeSubscriptionRefundTarget(request.ApprovedRefundTarget) != SubscriptionRefundTargetOriginalPayment {
			return fmt.Errorf("仅原路退款申请需要打款状态")
		}
		if normalizeSubscriptionConversionPayoutStatus(request.PayoutStatus) == SubscriptionConversionPayoutStatusPaid {
			return fmt.Errorf("该申请已标记为已打款")
		}
		now := GetDBTimestampWithTx(tx)
		request.PayoutStatus = SubscriptionConversionPayoutStatusPaid
		request.PayoutAt = now
		request.PayoutRemark = payoutRemark
		return tx.Save(&request).Error
	})
	if err != nil {
		return nil, err
	}
	RecordLog(request.UserId, LogTypeSystem, fmt.Sprintf("套餐原路退款已标记打款完成，金额 %.2f", request.ApprovedAmount))
	return &request, nil
}

func RejectSubscriptionConversionRequest(requestId int, adminRemark string) (*SubscriptionConversionRequest, error) {
	if requestId <= 0 {
		return nil, fmt.Errorf("invalid request id")
	}
	adminRemark = strings.TrimSpace(adminRemark)
	if adminRemark == "" {
		return nil, fmt.Errorf("拒绝原因不能为空")
	}
	var request SubscriptionConversionRequest
	cacheGroup := ""
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where("id = ?", requestId).First(&request).Error; err != nil {
			return err
		}
		if request.Status != SubscriptionConversionRequestStatusPending {
			return fmt.Errorf("仅可拒绝待审核申请")
		}
		now := GetDBTimestampWithTx(tx)
		if request.DisabledAt > 0 {
			snapshots, err := decodeSubscriptionConversionSnapshots(request.SubscriptionSnapshotsJSON)
			if err != nil {
				return err
			}
			subscriptionIDs, err := decodeSubscriptionIDList(request.SubscriptionIdsJSON)
			if err != nil {
				return err
			}
			subs, err := lockSubscriptionConversionTargetsTx(tx, request.UserId, subscriptionIDs)
			if err != nil {
				return err
			}
			snapshotIndex := make(map[int]subscriptionConversionRequestSnapshot, len(snapshots))
			for _, item := range snapshots {
				snapshotIndex[item.UserSubscriptionId] = item
			}
			suspendedSeconds := now - getSubscriptionConversionDisabledAt(&request)
			if suspendedSeconds < 0 {
				suspendedSeconds = 0
			}
			for i := range subs {
				snapshot, ok := snapshotIndex[subs[i].Id]
				if !ok {
					return fmt.Errorf("申请快照缺失，无法恢复原套餐")
				}
				restoreEndTime := snapshot.EndTime
				if restoreEndTime > 0 {
					restoreEndTime += suspendedSeconds
				}
				restoreNextResetTime := snapshot.NextResetTime
				if restoreNextResetTime > 0 {
					restoreNextResetTime += suspendedSeconds
				}
				if err := tx.Model(&subs[i]).Updates(map[string]any{
					"status":          "active",
					"end_time":        restoreEndTime,
					"next_reset_time": restoreNextResetTime,
					"updated_at":      now,
				}).Error; err != nil {
					return err
				}
			}
			cacheGroup, err = restoreUserGroupForPendingConversionTx(tx, request.UserId, now)
			if err != nil {
				return err
			}
		}
		request.Status = SubscriptionConversionRequestStatusRejected
		request.RejectedAt = now
		request.AdminRemark = adminRemark
		return tx.Save(&request).Error
	})
	if err != nil {
		return nil, err
	}
	if cacheGroup != "" {
		_ = UpdateUserGroupCache(request.UserId, cacheGroup)
	}
	RecordLog(request.UserId, LogTypeSystem, fmt.Sprintf("套餐转余额申请已被拒绝：%s", adminRemark))
	return &request, nil
}
