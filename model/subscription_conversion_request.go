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
)

type SubscriptionConversionRequest struct {
	Id int `json:"id"`

	UserId   int    `json:"user_id" gorm:"index;not null"`
	Username string `json:"username,omitempty" gorm:"-"`

	CampaignKey   string `json:"campaign_key" gorm:"type:varchar(128);not null;default:'';index"`
	CampaignTitle string `json:"campaign_title" gorm:"type:varchar(255);not null;default:''"`
	Status        string `json:"status" gorm:"type:varchar(32);not null;default:'pending';index"`

	SubscriptionIdsJSON string `json:"subscription_ids_json" gorm:"type:text;not null"`
	RequestRemark       string `json:"request_remark" gorm:"type:text;default:''"`
	AdminRemark         string `json:"admin_remark" gorm:"type:text;default:''"`

	RequestedRatio  float64 `json:"requested_ratio" gorm:"type:decimal(12,6);not null;default:1"`
	RequestedAmount float64 `json:"requested_amount" gorm:"type:decimal(12,2);not null;default:0"`
	RequestedQuota  int     `json:"requested_quota" gorm:"type:int;not null;default:0"`

	ApprovedRatio  float64 `json:"approved_ratio" gorm:"type:decimal(12,6);not null;default:0"`
	ApprovedAmount float64 `json:"approved_amount" gorm:"type:decimal(12,2);not null;default:0"`
	ApprovedQuota  int     `json:"approved_quota" gorm:"type:int;not null;default:0"`

	ApprovedAt int64 `json:"approved_at" gorm:"bigint;default:0"`
	RejectedAt int64 `json:"rejected_at" gorm:"bigint;default:0"`
	ExecutedAt int64 `json:"executed_at" gorm:"bigint;default:0"`
	CreateTime int64 `json:"create_time" gorm:"bigint;autoCreateTime"`
	UpdateTime int64 `json:"update_time" gorm:"bigint;autoUpdateTime"`
}

type SubscriptionConversionAdminFilters struct {
	Keyword string
	Status  string
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

func CreateSubscriptionConversionRequest(userId int, requestRemark string) (*SubscriptionConversionRequest, error) {
	if userId <= 0 {
		return nil, fmt.Errorf("invalid user id")
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
	return createSubscriptionConversionRequestFromPreview(userId, preview, requestRemark)
}

func createSubscriptionConversionRequestFromPreview(userId int, preview *SelfServiceSubscriptionConversionPreview, requestRemark string) (*SubscriptionConversionRequest, error) {
	if userId <= 0 || preview == nil {
		return nil, fmt.Errorf("invalid conversion request args")
	}
	subscriptionIDs := make([]int, 0, len(preview.Items))
	for _, item := range preview.Items {
		if item.UserSubscriptionId > 0 {
			subscriptionIDs = append(subscriptionIDs, item.UserSubscriptionId)
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
		request := SubscriptionConversionRequest{
			UserId:              userId,
			CampaignKey:         strings.TrimSpace(preview.Campaign.Key),
			CampaignTitle:       strings.TrimSpace(preview.Campaign.Title),
			Status:              SubscriptionConversionRequestStatusPending,
			SubscriptionIdsJSON: subscriptionIDsJSON,
			RequestRemark:       requestRemark,
			RequestedRatio:      1,
			RequestedAmount:     math.Round(preview.TotalConvertibleAmount*100) / 100,
			RequestedQuota:      preview.TotalConvertibleQuota,
		}
		if err := tx.Create(&request).Error; err != nil {
			return err
		}
		created = request
		return nil
	})
	if err != nil {
		return nil, err
	}
	RecordLog(userId, LogTypeSystem, fmt.Sprintf("已提交套餐转余额申请，预计返还 %s", logger.LogQuota(created.RequestedQuota)))
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
	return items, total, nil
}

func executeSubscriptionConversionRequestTx(tx *gorm.DB, request *SubscriptionConversionRequest, approvedQuota int, approvedAmount float64) (string, error) {
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
	var subs []UserSubscription
	now := GetDBTimestampWithTx(tx)
	if err := tx.Set("gorm:query_option", "FOR UPDATE").
		Where("user_id = ? AND id IN ?", request.UserId, subscriptionIDs).
		Order("end_time asc, id asc").
		Find(&subs).Error; err != nil {
		return "", err
	}
	if len(subs) == 0 {
		return "", fmt.Errorf("申请中的套餐已不存在")
	}
	if len(subs) != len(subscriptionIDs) {
		return "", fmt.Errorf("申请中的部分套餐已不存在或不可用，请让用户重新提交申请")
	}
	subIndex := make(map[int]UserSubscription, len(subs))
	for i := range subs {
		subIndex[subs[i].Id] = subs[i]
	}
	for _, subID := range subscriptionIDs {
		sub, ok := subIndex[subID]
		if !ok {
			return "", fmt.Errorf("申请中的部分套餐已不存在或不可用，请让用户重新提交申请")
		}
		if sub.Status != "active" || sub.EndTime <= now {
			return "", fmt.Errorf("申请中的套餐已过期或失效，请让用户重新提交申请")
		}
	}
	if approvedQuota <= 0 {
		return "", fmt.Errorf("审批增加的余额必须大于0")
	}
	if err := tx.Model(&User{}).Where("id = ?", request.UserId).
		Update("quota", gorm.Expr("quota + ?", approvedQuota)).Error; err != nil {
		return "", err
	}
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
	request.Status = SubscriptionConversionRequestStatusApproved
	request.ApprovedAt = now
	request.ExecutedAt = now
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

func ApproveSubscriptionConversionRequest(requestId int, approvedRatio float64, approvedQuota int, adminRemark string) (*SubscriptionConversionRequest, error) {
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
		if approvedRatio <= 0 {
			approvedRatio = 1
		}
		if approvedQuota <= 0 {
			approvedQuota = int(math.Round(float64(request.RequestedQuota) * approvedRatio))
		}
		if approvedQuota <= 0 {
			return fmt.Errorf("审批增加的余额必须大于0")
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
		var execErr error
		cacheGroup, execErr = executeSubscriptionConversionRequestTx(tx, &request, approvedQuota, approvedAmount)
		return execErr
	})
	if err != nil {
		return nil, err
	}
	if cacheGroup != "" {
		_ = UpdateUserGroupCache(request.UserId, cacheGroup)
	}
	if user, getErr := GetUserById(request.UserId, false); getErr == nil && user != nil {
		_ = updateUserQuotaCache(request.UserId, user.Quota)
	}
	RecordLog(request.UserId, LogTypeSystem, fmt.Sprintf("套餐转余额申请已通过，到账 %s", logger.LogQuota(request.ApprovedQuota)))
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
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where("id = ?", requestId).First(&request).Error; err != nil {
			return err
		}
		if request.Status != SubscriptionConversionRequestStatusPending {
			return fmt.Errorf("仅可拒绝待审核申请")
		}
		now := GetDBTimestampWithTx(tx)
		request.Status = SubscriptionConversionRequestStatusRejected
		request.RejectedAt = now
		request.AdminRemark = adminRemark
		return tx.Save(&request).Error
	})
	if err != nil {
		return nil, err
	}
	RecordLog(request.UserId, LogTypeSystem, fmt.Sprintf("套餐转余额申请已被拒绝：%s", adminRemark))
	return &request, nil
}
