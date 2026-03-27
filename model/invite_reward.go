package model

import (
	"errors"
	"sort"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const (
	inviteRewardSource = "invite_reward"

	InviteRewardSideInviter = "inviter"
	InviteRewardSideInvitee = "invitee"
	InviteRewardSideSystem  = "system"

	InviteRewardTypeQuota   = "quota"
	InviteRewardTypePlan    = "plan"
	InviteRewardTypeBlocked = "blocked"

	InviteRewardStatusGranted       = "granted"
	InviteRewardStatusBlocked       = "blocked"
	InviteRewardStatusUnknown       = "unknown"
	InviteRewardStatusNotConfigured = "not_configured"
)

type InviteRewardGrant struct {
	Id                 int    `json:"id"`
	InviterId          int    `json:"inviter_id" gorm:"index"`
	InviteeId          int    `json:"invitee_id" gorm:"index"`
	RewardedUserId     int    `json:"rewarded_user_id" gorm:"index"`
	RewardSide         string `json:"reward_side" gorm:"type:varchar(32);index"`
	RewardType         string `json:"reward_type" gorm:"type:varchar(32);index"`
	RewardStatus       string `json:"reward_status" gorm:"type:varchar(32);index"`
	QuotaAmount        int    `json:"quota_amount" gorm:"type:int;default:0"`
	PlanId             int    `json:"plan_id" gorm:"type:int;default:0;index"`
	UserSubscriptionId int    `json:"user_subscription_id" gorm:"type:int;default:0;index"`
	Reason             string `json:"reason" gorm:"type:varchar(255);default:''"`
	CreatedAt          int64  `json:"created_at" gorm:"bigint;index"`
	UpdatedAt          int64  `json:"updated_at" gorm:"bigint"`
}

func (g *InviteRewardGrant) BeforeCreate(tx *gorm.DB) error {
	now := common.GetTimestamp()
	g.CreatedAt = now
	g.UpdatedAt = now
	return nil
}

func (g *InviteRewardGrant) BeforeUpdate(tx *gorm.DB) error {
	g.UpdatedAt = common.GetTimestamp()
	return nil
}

type InviteRewardPlanInfo struct {
	PlanId            int    `json:"plan_id"`
	Title             string `json:"title"`
	ResourceType      string `json:"resource_type"`
	AmountTotal       int64  `json:"amount_total"`
	RequestCountTotal int64  `json:"request_count_total"`
	DurationUnit      string `json:"duration_unit"`
	DurationValue     int    `json:"duration_value"`
	CustomSeconds     int64  `json:"custom_seconds"`
	UpgradeGroup      string `json:"upgrade_group"`
}

type InviteRewardConfig struct {
	InviterQuota int                   `json:"inviter_quota"`
	InviteeQuota int                   `json:"invitee_quota"`
	InviterPlan  *InviteRewardPlanInfo `json:"inviter_plan,omitempty"`
	InviteePlan  *InviteRewardPlanInfo `json:"invitee_plan,omitempty"`
}

type InviteRewardRecord struct {
	SubscriptionId int                   `json:"subscription_id"`
	PlanId         int                   `json:"plan_id"`
	PlanTitle      string                `json:"plan_title"`
	Status         string                `json:"status"`
	CreatedAt      int64                 `json:"created_at"`
	EndTime        int64                 `json:"end_time"`
	Plan           *InviteRewardPlanInfo `json:"plan,omitempty"`
}

type InvitedUserRewardInfo struct {
	UserId        int                   `json:"user_id"`
	Username      string                `json:"username"`
	DisplayName   string                `json:"display_name"`
	Status        int                   `json:"status"`
	OverallStatus string                `json:"overall_status"`
	QuotaStatus   string                `json:"quota_status"`
	PlanStatus    string                `json:"plan_status"`
	RewardAt      int64                 `json:"reward_at"`
	BlockedReason string                `json:"blocked_reason"`
	RewardEndTime int64                 `json:"reward_end_time"`
	InviteePlan   *InviteRewardPlanInfo `json:"invitee_plan,omitempty"`
}

type InviteRewardDetails struct {
	Config                InviteRewardConfig      `json:"config"`
	InviterRewardRecords  []InviteRewardRecord    `json:"inviter_reward_records"`
	InviterRewardTotal    int64                   `json:"inviter_reward_total"`
	InviterRewardPage     int                     `json:"inviter_reward_page"`
	InviterRewardPageSize int                     `json:"inviter_reward_page_size"`
	InvitedUsers          []InvitedUserRewardInfo `json:"invited_users"`
	InvitedUsersTotal     int64                   `json:"invited_users_total"`
	InvitedUsersPage      int                     `json:"invited_users_page"`
	InvitedUsersPageSize  int                     `json:"invited_users_page_size"`
}

type inviteRewardGrantSummary struct {
	QuotaGranted  bool
	PlanGranted   bool
	Blocked       bool
	BlockedReason string
	RewardAt      int64
}

func buildInviteRewardPlanInfo(plan *SubscriptionPlan) *InviteRewardPlanInfo {
	if plan == nil || plan.Id <= 0 {
		return nil
	}
	return &InviteRewardPlanInfo{
		PlanId:            plan.Id,
		Title:             plan.Title,
		ResourceType:      NormalizeSubscriptionResourceType(plan.ResourceType),
		AmountTotal:       plan.TotalAmount,
		RequestCountTotal: plan.RequestCountTotal,
		DurationUnit:      plan.DurationUnit,
		DurationValue:     plan.DurationValue,
		CustomSeconds:     plan.CustomSeconds,
		UpgradeGroup:      plan.UpgradeGroup,
	}
}

func buildInviteRewardPlanInfoFromSubscription(sub *UserSubscription, title string) *InviteRewardPlanInfo {
	if sub == nil || sub.Id <= 0 {
		return nil
	}
	return &InviteRewardPlanInfo{
		PlanId:            sub.PlanId,
		Title:             title,
		ResourceType:      NormalizeSubscriptionResourceType(sub.ResourceType),
		AmountTotal:       sub.AmountTotal,
		RequestCountTotal: sub.RequestCountTotal,
		DurationUnit:      sub.DurationUnit,
		DurationValue:     sub.DurationValue,
		CustomSeconds:     sub.CustomSeconds,
		UpgradeGroup:      sub.UpgradeGroup,
	}
}

func recordInviteRewardGrant(grant *InviteRewardGrant) error {
	if grant == nil {
		return errors.New("invite reward grant is nil")
	}
	return DB.Create(grant).Error
}

func recordInviteRewardBlocked(inviterId int, inviteeId int, reason string) {
	if inviterId <= 0 || inviteeId <= 0 {
		return
	}
	if err := recordInviteRewardGrant(&InviteRewardGrant{
		InviterId:      inviterId,
		InviteeId:      inviteeId,
		RewardedUserId: inviteeId,
		RewardSide:     InviteRewardSideSystem,
		RewardType:     InviteRewardTypeBlocked,
		RewardStatus:   InviteRewardStatusBlocked,
		Reason:         reason,
	}); err != nil {
		common.SysError("记录邀请奖励拦截事件失败: " + err.Error())
	}
}

func recordInviteQuotaGrant(inviterId int, inviteeId int, rewardedUserId int, rewardSide string, quotaAmount int) {
	if quotaAmount <= 0 || rewardedUserId <= 0 {
		return
	}
	if err := recordInviteRewardGrant(&InviteRewardGrant{
		InviterId:      inviterId,
		InviteeId:      inviteeId,
		RewardedUserId: rewardedUserId,
		RewardSide:     rewardSide,
		RewardType:     InviteRewardTypeQuota,
		RewardStatus:   InviteRewardStatusGranted,
		QuotaAmount:    quotaAmount,
	}); err != nil {
		common.SysError("记录邀请额度奖励失败: " + err.Error())
	}
}

func recordInvitePlanGrant(inviterId int, inviteeId int, rewardedUserId int, rewardSide string, sub *UserSubscription) {
	if rewardedUserId <= 0 || sub == nil || sub.Id <= 0 {
		return
	}
	if err := recordInviteRewardGrant(&InviteRewardGrant{
		InviterId:          inviterId,
		InviteeId:          inviteeId,
		RewardedUserId:     rewardedUserId,
		RewardSide:         rewardSide,
		RewardType:         InviteRewardTypePlan,
		RewardStatus:       InviteRewardStatusGranted,
		PlanId:             sub.PlanId,
		UserSubscriptionId: sub.Id,
	}); err != nil {
		common.SysError("记录邀请套餐奖励失败: " + err.Error())
	}
}

func loadInviteRewardPlanTitleMap(planIds []int) (map[int]string, error) {
	result := make(map[int]string, len(planIds))
	if len(planIds) == 0 {
		return result, nil
	}
	var plans []SubscriptionPlan
	if err := DB.Select("id", "title").Where("id IN ?", planIds).Find(&plans).Error; err != nil {
		return nil, err
	}
	for _, plan := range plans {
		result[plan.Id] = plan.Title
	}
	return result, nil
}

func listInviteRewardSubscriptionsByUser(userId int, startIdx int, pageSize int) ([]UserSubscription, int64, error) {
	var total int64
	query := DB.Model(&UserSubscription{}).Where("user_id = ? AND source = ?", userId, inviteRewardSource)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var subs []UserSubscription
	if total == 0 {
		return subs, 0, nil
	}
	err := DB.
		Where("user_id = ? AND source = ?", userId, inviteRewardSource).
		Order("created_at desc, id desc").
		Offset(startIdx).
		Limit(pageSize).
		Find(&subs).Error
	return subs, total, err
}

func listInvitedUsers(inviterId int, startIdx int, pageSize int) ([]User, int64, error) {
	var total int64
	query := DB.Model(&User{}).Where("inviter_id = ?", inviterId)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var users []User
	if total == 0 {
		return users, 0, nil
	}
	err := DB.
		Select("id", "username", "display_name", "status").
		Where("inviter_id = ?", inviterId).
		Order("id desc").
		Offset(startIdx).
		Limit(pageSize).
		Find(&users).Error
	return users, total, err
}

func listInviteRewardSubscriptionsByUsers(userIds []int) ([]UserSubscription, error) {
	var subs []UserSubscription
	if len(userIds) == 0 {
		return subs, nil
	}
	err := DB.
		Where("user_id IN ? AND source = ?", userIds, inviteRewardSource).
		Order("created_at desc, id desc").
		Find(&subs).Error
	return subs, err
}

func loadInviteRewardGrantSummary(inviterId int, inviteeIds []int) (map[int]inviteRewardGrantSummary, error) {
	result := make(map[int]inviteRewardGrantSummary, len(inviteeIds))
	if inviterId <= 0 || len(inviteeIds) == 0 {
		return result, nil
	}
	var grants []InviteRewardGrant
	err := DB.
		Where("inviter_id = ? AND invitee_id IN ?", inviterId, inviteeIds).
		Order("created_at desc, id desc").
		Find(&grants).Error
	if err != nil {
		return nil, err
	}
	for _, grant := range grants {
		summary := result[grant.InviteeId]
		if grant.CreatedAt > summary.RewardAt {
			summary.RewardAt = grant.CreatedAt
		}
		switch grant.RewardType {
		case InviteRewardTypeQuota:
			if grant.RewardStatus == InviteRewardStatusGranted {
				summary.QuotaGranted = true
			}
		case InviteRewardTypePlan:
			if grant.RewardStatus == InviteRewardStatusGranted {
				summary.PlanGranted = true
			}
		case InviteRewardTypeBlocked:
			if grant.RewardStatus == InviteRewardStatusBlocked {
				summary.Blocked = true
				if summary.BlockedReason == "" {
					summary.BlockedReason = grant.Reason
				}
			}
		}
		result[grant.InviteeId] = summary
	}
	return result, nil
}

func normalizePage(page int, pageSize int) (int, int) {
	if page < 1 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = common.ItemsPerPage
	}
	if pageSize > 100 {
		pageSize = 100
	}
	return page, pageSize
}

func GetInviteRewardDetails(userId int, invitedPage int, invitedPageSize int, rewardPage int, rewardPageSize int) (*InviteRewardDetails, error) {
	if userId <= 0 {
		return nil, errors.New("invalid user id")
	}
	invitedPage, invitedPageSize = normalizePage(invitedPage, invitedPageSize)
	rewardPage, rewardPageSize = normalizePage(rewardPage, rewardPageSize)

	result := &InviteRewardDetails{
		Config: InviteRewardConfig{
			InviterQuota: common.QuotaForInviter,
			InviteeQuota: common.QuotaForInvitee,
		},
		InviterRewardRecords:  make([]InviteRewardRecord, 0),
		InviterRewardPage:     rewardPage,
		InviterRewardPageSize: rewardPageSize,
		InvitedUsers:          make([]InvitedUserRewardInfo, 0),
		InvitedUsersPage:      invitedPage,
		InvitedUsersPageSize:  invitedPageSize,
	}

	if common.SubscriptionPlanForInviter > 0 {
		if plan, err := GetSubscriptionPlanById(common.SubscriptionPlanForInviter); err == nil {
			result.Config.InviterPlan = buildInviteRewardPlanInfo(plan)
		}
	}
	if common.SubscriptionPlanForInvitee > 0 {
		if plan, err := GetSubscriptionPlanById(common.SubscriptionPlanForInvitee); err == nil {
			result.Config.InviteePlan = buildInviteRewardPlanInfo(plan)
		}
	}

	rewardSubs, rewardTotal, err := listInviteRewardSubscriptionsByUser(
		userId,
		(rewardPage-1)*rewardPageSize,
		rewardPageSize,
	)
	if err != nil {
		return nil, err
	}
	result.InviterRewardTotal = rewardTotal

	invitedUsers, invitedTotal, err := listInvitedUsers(
		userId,
		(invitedPage-1)*invitedPageSize,
		invitedPageSize,
	)
	if err != nil {
		return nil, err
	}
	result.InvitedUsersTotal = invitedTotal

	inviteeIds := make([]int, 0, len(invitedUsers))
	planIdSet := make(map[int]struct{})
	for _, sub := range rewardSubs {
		if sub.PlanId > 0 {
			planIdSet[sub.PlanId] = struct{}{}
		}
	}
	for _, user := range invitedUsers {
		inviteeIds = append(inviteeIds, user.Id)
	}

	inviteeRewardSubs, err := listInviteRewardSubscriptionsByUsers(inviteeIds)
	if err != nil {
		return nil, err
	}
	for _, sub := range inviteeRewardSubs {
		if sub.PlanId > 0 {
			planIdSet[sub.PlanId] = struct{}{}
		}
	}

	inviteeGrantMap, err := loadInviteRewardGrantSummary(userId, inviteeIds)
	if err != nil {
		return nil, err
	}

	planIds := make([]int, 0, len(planIdSet))
	for planId := range planIdSet {
		planIds = append(planIds, planId)
	}
	sort.Ints(planIds)
	planTitleMap, err := loadInviteRewardPlanTitleMap(planIds)
	if err != nil {
		return nil, err
	}

	for _, sub := range rewardSubs {
		title := planTitleMap[sub.PlanId]
		if title == "" && sub.PlanId > 0 {
			title = "#" + strconv.Itoa(sub.PlanId)
		}
		result.InviterRewardRecords = append(result.InviterRewardRecords, InviteRewardRecord{
			SubscriptionId: sub.Id,
			PlanId:         sub.PlanId,
			PlanTitle:      title,
			Status:         sub.Status,
			CreatedAt:      sub.CreatedAt,
			EndTime:        sub.EndTime,
			Plan:           buildInviteRewardPlanInfoFromSubscription(&sub, title),
		})
	}

	inviteeRewardSubMap := make(map[int]*UserSubscription, len(inviteeRewardSubs))
	for i := range inviteeRewardSubs {
		sub := inviteeRewardSubs[i]
		if _, ok := inviteeRewardSubMap[sub.UserId]; ok {
			continue
		}
		subCopy := sub
		inviteeRewardSubMap[sub.UserId] = &subCopy
	}

	for _, user := range invitedUsers {
		summary := inviteeGrantMap[user.Id]
		sub := inviteeRewardSubMap[user.Id]
		item := InvitedUserRewardInfo{
			UserId:        user.Id,
			Username:      user.Username,
			DisplayName:   user.DisplayName,
			Status:        user.Status,
			OverallStatus: InviteRewardStatusUnknown,
			QuotaStatus:   InviteRewardStatusUnknown,
			PlanStatus:    InviteRewardStatusUnknown,
			RewardAt:      summary.RewardAt,
			BlockedReason: summary.BlockedReason,
		}

		if common.QuotaForInvitee <= 0 {
			item.QuotaStatus = InviteRewardStatusNotConfigured
		} else if summary.QuotaGranted {
			item.QuotaStatus = InviteRewardStatusGranted
		} else if summary.Blocked {
			item.QuotaStatus = InviteRewardStatusBlocked
		}

		if common.SubscriptionPlanForInvitee <= 0 {
			item.PlanStatus = InviteRewardStatusNotConfigured
		} else if sub != nil || summary.PlanGranted {
			item.PlanStatus = InviteRewardStatusGranted
		} else if summary.Blocked {
			item.PlanStatus = InviteRewardStatusBlocked
		}

		if sub != nil {
			title := planTitleMap[sub.PlanId]
			if title == "" && sub.PlanId > 0 {
				title = "#" + strconv.Itoa(sub.PlanId)
			}
			item.InviteePlan = buildInviteRewardPlanInfoFromSubscription(sub, title)
			item.RewardEndTime = sub.EndTime
			if sub.CreatedAt > item.RewardAt {
				item.RewardAt = sub.CreatedAt
			}
		}

		if summary.Blocked {
			item.OverallStatus = InviteRewardStatusBlocked
		} else if item.QuotaStatus == InviteRewardStatusGranted || item.PlanStatus == InviteRewardStatusGranted {
			item.OverallStatus = InviteRewardStatusGranted
		}

		result.InvitedUsers = append(result.InvitedUsers, item)
	}

	return result, nil
}
