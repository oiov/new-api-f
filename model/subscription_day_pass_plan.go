package model

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const (
	SubscriptionDayPassPlanStatusActive    = "active"
	SubscriptionDayPassPlanStatusCompleted = "completed"
	SubscriptionDayPassPlanStatusCancelled = "cancelled"
)

const (
	SubscriptionDayPassPlanModeFixedDaily = "fixed_daily"
)

type SubscriptionDayPassPlan struct {
	Id                       int    `json:"id"`
	UserId                   int    `json:"user_id" gorm:"type:int;not null;index"`
	ParentUserSubscriptionId int    `json:"parent_user_subscription_id" gorm:"type:int;not null;index"`
	Status                   string `json:"status" gorm:"type:varchar(32);not null;default:'active';index"`
	Mode                     string `json:"mode" gorm:"type:varchar(32);not null;default:'fixed_daily'"`
	TotalDays                int    `json:"total_days" gorm:"type:int;not null;default:0"`
	GeneratedDays            int    `json:"generated_days" gorm:"type:int;not null;default:0"`
	RequestCountPerDay       int64  `json:"request_count_per_day" gorm:"type:bigint;not null;default:0"`
	TotalRequestCount        int64  `json:"total_request_count" gorm:"type:bigint;not null;default:0"`
	GeneratedRequestCount    int64  `json:"generated_request_count" gorm:"type:bigint;not null;default:0"`
	Timezone                 string `json:"timezone" gorm:"type:varchar(64);not null;default:'Asia/Shanghai'"`
	StartDate                string `json:"start_date" gorm:"type:varchar(16);not null;default:''"`
	EndDate                  string `json:"end_date" gorm:"type:varchar(16);not null;default:''"`
	NextGenerateAt           int64  `json:"next_generate_at" gorm:"type:bigint;not null;default:0;index"`
	LastGenerateAt           int64  `json:"last_generate_at" gorm:"type:bigint;not null;default:0"`
	LastError                string `json:"last_error" gorm:"type:varchar(255);not null;default:''"`
	CreatedAt                int64  `json:"created_at" gorm:"bigint"`
	UpdatedAt                int64  `json:"updated_at" gorm:"bigint"`
}

func (p *SubscriptionDayPassPlan) BeforeCreate(tx *gorm.DB) error {
	now := common.GetTimestamp()
	p.CreatedAt = now
	p.UpdatedAt = now
	return nil
}

func (p *SubscriptionDayPassPlan) BeforeUpdate(tx *gorm.DB) error {
	p.UpdatedAt = common.GetTimestamp()
	return nil
}

type SubscriptionDayPassPlanSummary struct {
	Plan               *SubscriptionDayPassPlan `json:"plan"`
	ParentSubscription *UserSubscription        `json:"parent_subscription,omitempty"`
}

type AdminSubscriptionDayPassPlanSummary struct {
	Plan               *SubscriptionDayPassPlan `json:"plan"`
	ParentSubscription *UserSubscription        `json:"parent_subscription,omitempty"`
	Username           string                   `json:"username"`
	UserGroup          string                   `json:"user_group"`
}

type CreateSubscriptionDayPassPlanResult struct {
	Plan               *SubscriptionDayPassPlan `json:"plan"`
	ParentSubscription *UserSubscription        `json:"parent_subscription"`
	ParentRemainCount  int64                    `json:"parent_remain_count"`
}

func formatSubscriptionPlanDate(ts int64) string {
	if ts <= 0 {
		return ""
	}
	return subscriptionResetTime(time.Unix(ts, 0)).Format("2006-01-02")
}

func getDerivedDayPassFixedSeconds(parent *UserSubscription) int64 {
	fixedSeconds := int64(8 * 3600)
	if parent != nil && parent.ResetUseFixedClock {
		if useFixed, normalized := normalizeResetFixedClock(true, parent.ResetFixedSeconds, SubscriptionResetDaily); useFixed {
			fixedSeconds = normalized
		}
	}
	return fixedSeconds
}

func calcDerivedDayPassPlanGenerateAt(now time.Time, parent *UserSubscription) int64 {
	localNow := subscriptionResetTime(now)
	fixedSeconds := getDerivedDayPassFixedSeconds(parent)
	deadline := time.Date(
		localNow.Year(),
		localNow.Month(),
		localNow.Day(),
		int(fixedSeconds/3600),
		int((fixedSeconds%3600)/60),
		int(fixedSeconds%60),
		0,
		localNow.Location(),
	)
	if !deadline.After(localNow) {
		deadline = deadline.AddDate(0, 0, 1)
	}
	return deadline.Unix()
}

func calcNextDerivedDayPassPlanGenerateAt(currentGenerateAt int64, parent *UserSubscription) int64 {
	if currentGenerateAt <= 0 {
		return 0
	}
	localCurrent := subscriptionResetTime(time.Unix(currentGenerateAt, 0))
	nextDay := localCurrent.AddDate(0, 0, 1)
	fixedSeconds := getDerivedDayPassFixedSeconds(parent)
	return time.Date(
		nextDay.Year(),
		nextDay.Month(),
		nextDay.Day(),
		int(fixedSeconds/3600),
		int((fixedSeconds%3600)/60),
		int(fixedSeconds%60),
		0,
		nextDay.Location(),
	).Unix()
}

func calcDerivedDayPassPlanMaxDays(nextGenerateAt int64, parent *UserSubscription) int {
	if nextGenerateAt <= 0 || parent == nil || parent.EndTime <= 0 || nextGenerateAt >= parent.EndTime {
		return 0
	}
	days := 0
	current := nextGenerateAt
	for current > 0 && current < parent.EndTime {
		days++
		current = calcNextDerivedDayPassPlanGenerateAt(current, parent)
	}
	return days
}

func getActiveDerivedDayPassPlanByParentTx(tx *gorm.DB, parentSubscriptionId int) (*SubscriptionDayPassPlan, error) {
	if tx == nil || parentSubscriptionId <= 0 {
		return nil, nil
	}
	var plan SubscriptionDayPassPlan
	err := tx.Where("parent_user_subscription_id = ? AND status = ?", parentSubscriptionId, SubscriptionDayPassPlanStatusActive).
		Order("id desc").
		First(&plan).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &plan, nil
}

func buildSubscriptionDayPassPlanSummaries(plans []SubscriptionDayPassPlan) []SubscriptionDayPassPlanSummary {
	if len(plans) == 0 {
		return []SubscriptionDayPassPlanSummary{}
	}
	parentIDs := make([]int, 0, len(plans))
	parentIDSet := make(map[int]struct{}, len(plans))
	for _, plan := range plans {
		if plan.ParentUserSubscriptionId <= 0 {
			continue
		}
		if _, ok := parentIDSet[plan.ParentUserSubscriptionId]; ok {
			continue
		}
		parentIDSet[plan.ParentUserSubscriptionId] = struct{}{}
		parentIDs = append(parentIDs, plan.ParentUserSubscriptionId)
	}
	parentMap := make(map[int]*UserSubscription, len(parentIDs))
	if len(parentIDs) > 0 {
		var parents []UserSubscription
		if err := DB.Where("id IN ?", parentIDs).Find(&parents).Error; err == nil {
			for i := range parents {
				parent := parents[i]
				parentCopy := parent
				parentMap[parent.Id] = &parentCopy
			}
		}
	}
	items := make([]SubscriptionDayPassPlanSummary, 0, len(plans))
	for _, plan := range plans {
		planCopy := plan
		items = append(items, SubscriptionDayPassPlanSummary{
			Plan:               &planCopy,
			ParentSubscription: parentMap[plan.ParentUserSubscriptionId],
		})
	}
	return items
}

func GetUserDerivedDayPassPlans(userId int) ([]SubscriptionDayPassPlanSummary, error) {
	if userId <= 0 {
		return nil, errors.New("invalid userId")
	}
	var plans []SubscriptionDayPassPlan
	if err := DB.Where("user_id = ?", userId).
		Order("status asc, id desc").
		Find(&plans).Error; err != nil {
		return nil, err
	}
	return buildSubscriptionDayPassPlanSummaries(plans), nil
}

func CreateDerivedDayPassPlan(userId int, parentSubscriptionId int, totalDays int, requestCountPerDay int64) (*CreateSubscriptionDayPassPlanResult, error) {
	if userId <= 0 {
		return nil, errors.New("无效的用户ID")
	}
	if parentSubscriptionId <= 0 {
		return nil, errors.New("无效的订阅ID")
	}
	if totalDays <= 0 {
		return nil, errors.New("拆分天数必须大于 0")
	}
	if requestCountPerDay <= 0 {
		return nil, errors.New("每日转出次数必须大于 0")
	}

	result := &CreateSubscriptionDayPassPlanResult{}
	err := DB.Transaction(func(tx *gorm.DB) error {
		nowUnix := GetDBTimestampWithTx(tx)
		now := time.Unix(nowUnix, 0)

		var parent UserSubscription
		query := tx.Where("id = ? AND user_id = ?", parentSubscriptionId, userId)
		if !common.UsingSQLite {
			query = query.Set("gorm:query_option", "FOR UPDATE")
		}
		if err := query.First(&parent).Error; err != nil {
			return err
		}
		plan, err := getSubscriptionPlanByIdTx(tx, parent.PlanId)
		if err != nil {
			return err
		}
		if err := maybeResetUserSubscriptionWithPlanTx(tx, &parent, plan, nowUnix); err != nil {
			return err
		}
		if err := canGenerateDerivedDayPassFromSubscription(&parent, nowUnix); err != nil {
			return err
		}
		if activePlan, err := getActiveDerivedDayPassPlanByParentTx(tx, parent.Id); err != nil {
			return err
		} else if activePlan != nil {
			return errors.New("当前月卡已有生效中的拆分计划")
		}
		var activeChildCount int64
		if err := tx.Model(&UserSubscription{}).
			Where("parent_user_subscription_id = ? AND status = ? AND end_time > ?", parent.Id, "active", nowUnix).
			Count(&activeChildCount).Error; err != nil {
			return err
		}
		if activeChildCount > 0 {
			return errors.New("当前月卡已有生效中的天卡，请先等待其到期")
		}

		nextGenerateAt := calcDerivedDayPassPlanGenerateAt(now, &parent)
		maxDays := calcDerivedDayPassPlanMaxDays(nextGenerateAt, &parent)
		if maxDays <= 0 {
			return errors.New("当前月卡剩余有效期不足，无法创建拆分计划")
		}
		if totalDays > maxDays {
			return fmt.Errorf("当前最多仅可拆分 %d 天", maxDays)
		}
		remainingCount := getUserSubscriptionRemainingRequestCount(&parent)
		totalRequestCount := int64(totalDays) * requestCountPerDay
		if totalRequestCount > remainingCount {
			return fmt.Errorf("当前最多可拆分 %d 次", remainingCount)
		}

		derivedPlan := &SubscriptionDayPassPlan{
			UserId:                   userId,
			ParentUserSubscriptionId: parent.Id,
			Status:                   SubscriptionDayPassPlanStatusActive,
			Mode:                     SubscriptionDayPassPlanModeFixedDaily,
			TotalDays:                totalDays,
			GeneratedDays:            0,
			RequestCountPerDay:       requestCountPerDay,
			TotalRequestCount:        totalRequestCount,
			GeneratedRequestCount:    0,
			Timezone:                 "Asia/Shanghai",
			StartDate:                formatSubscriptionPlanDate(nextGenerateAt),
			EndDate:                  formatSubscriptionPlanDate(calcNextDerivedDayPassPlanGenerateAt(nextGenerateAt, &parent) - 1 + int64((totalDays-1))*86400),
			NextGenerateAt:           nextGenerateAt,
			LastGenerateAt:           0,
			LastError:                "",
		}
		if totalDays == 1 {
			derivedPlan.EndDate = derivedPlan.StartDate
		}
		if err := tx.Create(derivedPlan).Error; err != nil {
			return err
		}

		parentCopy := parent
		planCopy := *derivedPlan
		result.Plan = &planCopy
		result.ParentSubscription = &parentCopy
		result.ParentRemainCount = remainingCount
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

func CancelDerivedDayPassPlan(userId int, planId int) (*SubscriptionDayPassPlan, error) {
	if userId <= 0 || planId <= 0 {
		return nil, errors.New("参数错误")
	}
	var result *SubscriptionDayPassPlan
	err := DB.Transaction(func(tx *gorm.DB) error {
		var plan SubscriptionDayPassPlan
		query := tx.Where("id = ? AND user_id = ?", planId, userId)
		if !common.UsingSQLite {
			query = query.Set("gorm:query_option", "FOR UPDATE")
		}
		if err := query.First(&plan).Error; err != nil {
			return err
		}
		if plan.Status != SubscriptionDayPassPlanStatusActive {
			return errors.New("当前拆分计划不可取消")
		}
		plan.Status = SubscriptionDayPassPlanStatusCancelled
		plan.NextGenerateAt = 0
		plan.LastError = ""
		if err := tx.Model(&SubscriptionDayPassPlan{}).Where("id = ?", plan.Id).Updates(map[string]any{
			"status":           plan.Status,
			"next_generate_at": 0,
			"last_error":       "",
			"updated_at":       common.GetTimestamp(),
		}).Error; err != nil {
			return err
		}
		planCopy := plan
		result = &planCopy
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

func AdminCancelDerivedDayPassPlan(planId int) (*SubscriptionDayPassPlan, error) {
	if planId <= 0 {
		return nil, errors.New("无效的拆分计划ID")
	}
	var result *SubscriptionDayPassPlan
	err := DB.Transaction(func(tx *gorm.DB) error {
		var plan SubscriptionDayPassPlan
		query := tx.Where("id = ?", planId)
		if !common.UsingSQLite {
			query = query.Set("gorm:query_option", "FOR UPDATE")
		}
		if err := query.First(&plan).Error; err != nil {
			return err
		}
		if plan.Status != SubscriptionDayPassPlanStatusActive {
			return errors.New("当前拆分计划不可取消")
		}
		plan.Status = SubscriptionDayPassPlanStatusCancelled
		plan.NextGenerateAt = 0
		plan.LastError = ""
		if err := tx.Model(&SubscriptionDayPassPlan{}).Where("id = ?", plan.Id).Updates(map[string]any{
			"status":           plan.Status,
			"next_generate_at": 0,
			"last_error":       "",
			"updated_at":       common.GetTimestamp(),
		}).Error; err != nil {
			return err
		}
		planCopy := plan
		result = &planCopy
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

type adminSubscriptionDayPassPlanRow struct {
	SubscriptionDayPassPlan
	Username  string `json:"username" gorm:"column:username"`
	UserGroup string `json:"user_group" gorm:"column:user_group"`
}

func GetAdminSubscriptionDayPassPlans(
	pageInfo *common.PageInfo,
	keyword string,
	status string,
) ([]AdminSubscriptionDayPassPlanSummary, int64, error) {
	if pageInfo == nil {
		pageInfo = &common.PageInfo{Page: 1, PageSize: common.ItemsPerPage}
	}
	keyword = strings.TrimSpace(keyword)
	status = strings.TrimSpace(status)
	userGroupCol := commonGroupCol
	if strings.TrimSpace(userGroupCol) == "" {
		userGroupCol = "`group`"
		if common.UsingPostgreSQL {
			userGroupCol = `"group"`
		}
	}

	baseQuery := DB.Table("subscription_day_pass_plans").
		Select("subscription_day_pass_plans.*, users.username as username, users." + userGroupCol + " as user_group").
		Joins("left join users on users.id = subscription_day_pass_plans.user_id")

	if keyword != "" {
		like := "%" + keyword + "%"
		if keywordInt, err := strconv.Atoi(keyword); err == nil {
			baseQuery = baseQuery.Where("subscription_day_pass_plans.id = ? OR subscription_day_pass_plans.user_id = ? OR subscription_day_pass_plans.parent_user_subscription_id = ? OR users.id = ? OR users.username LIKE ?",
				keywordInt, keywordInt, keywordInt, keywordInt, like)
		} else {
			baseQuery = baseQuery.Where("users.username LIKE ?", like)
		}
	}
	switch status {
	case SubscriptionDayPassPlanStatusActive, SubscriptionDayPassPlanStatusCompleted, SubscriptionDayPassPlanStatusCancelled:
		baseQuery = baseQuery.Where("subscription_day_pass_plans.status = ?", status)
	}

	var total int64
	if err := baseQuery.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var rows []adminSubscriptionDayPassPlanRow
	if err := baseQuery.Order("subscription_day_pass_plans.id desc").
		Limit(pageInfo.GetPageSize()).
		Offset(pageInfo.GetStartIdx()).
		Find(&rows).Error; err != nil {
		return nil, 0, err
	}

	parentIDs := make([]int, 0, len(rows))
	parentSet := make(map[int]struct{}, len(rows))
	for _, row := range rows {
		if row.ParentUserSubscriptionId <= 0 {
			continue
		}
		if _, ok := parentSet[row.ParentUserSubscriptionId]; ok {
			continue
		}
		parentSet[row.ParentUserSubscriptionId] = struct{}{}
		parentIDs = append(parentIDs, row.ParentUserSubscriptionId)
	}
	parentMap := make(map[int]*UserSubscription, len(parentIDs))
	if len(parentIDs) > 0 {
		var parents []UserSubscription
		if err := DB.Where("id IN ?", parentIDs).Find(&parents).Error; err != nil {
			return nil, 0, err
		}
		for i := range parents {
			parent := parents[i]
			parentCopy := parent
			parentMap[parent.Id] = &parentCopy
		}
	}

	items := make([]AdminSubscriptionDayPassPlanSummary, 0, len(rows))
	for _, row := range rows {
		planCopy := row.SubscriptionDayPassPlan
		items = append(items, AdminSubscriptionDayPassPlanSummary{
			Plan:               &planCopy,
			ParentSubscription: parentMap[row.ParentUserSubscriptionId],
			Username:           row.Username,
			UserGroup:          row.UserGroup,
		})
	}
	return items, total, nil
}

func markDerivedDayPassPlanStatusTx(tx *gorm.DB, planId int, status string, nextGenerateAt int64, lastError string) error {
	if tx == nil || planId <= 0 {
		return errors.New("invalid plan update args")
	}
	return tx.Model(&SubscriptionDayPassPlan{}).Where("id = ?", planId).Updates(map[string]any{
		"status":           status,
		"next_generate_at": nextGenerateAt,
		"last_error":       strings.TrimSpace(lastError),
		"updated_at":       common.GetTimestamp(),
	}).Error
}

func ProcessDueDerivedDayPassPlans(limit int) (int, error) {
	if limit <= 0 {
		limit = 100
	}
	now := GetDBTimestamp()
	var planIDs []int
	if err := DB.Model(&SubscriptionDayPassPlan{}).
		Where("status = ? AND next_generate_at > 0 AND next_generate_at <= ?", SubscriptionDayPassPlanStatusActive, now).
		Order("next_generate_at asc, id asc").
		Limit(limit).
		Pluck("id", &planIDs).Error; err != nil {
		return 0, err
	}
	if len(planIDs) == 0 {
		return 0, nil
	}

	processed := 0
	for _, planID := range planIDs {
		err := DB.Transaction(func(tx *gorm.DB) error {
			nowUnix := GetDBTimestampWithTx(tx)

			var plan SubscriptionDayPassPlan
			query := tx.Where("id = ?", planID)
			if !common.UsingSQLite {
				query = query.Set("gorm:query_option", "FOR UPDATE")
			}
			if err := query.First(&plan).Error; err != nil {
				return err
			}
			if plan.Status != SubscriptionDayPassPlanStatusActive || plan.NextGenerateAt <= 0 || plan.NextGenerateAt > nowUnix {
				return nil
			}
			if plan.GeneratedDays >= plan.TotalDays {
				return markDerivedDayPassPlanStatusTx(tx, plan.Id, SubscriptionDayPassPlanStatusCompleted, 0, "")
			}

			var parent UserSubscription
			parentQuery := tx.Where("id = ? AND user_id = ?", plan.ParentUserSubscriptionId, plan.UserId)
			if !common.UsingSQLite {
				parentQuery = parentQuery.Set("gorm:query_option", "FOR UPDATE")
			}
			if err := parentQuery.First(&parent).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return markDerivedDayPassPlanStatusTx(tx, plan.Id, SubscriptionDayPassPlanStatusCancelled, 0, "原月卡不存在或已变更")
				}
				return err
			}
			parentPlan, err := getSubscriptionPlanByIdTx(tx, parent.PlanId)
			if err != nil {
				return err
			}
			if err := maybeResetUserSubscriptionWithPlanTx(tx, &parent, parentPlan, nowUnix); err != nil {
				return err
			}
			if err := canGenerateDerivedDayPassFromSubscription(&parent, nowUnix); err != nil {
				return markDerivedDayPassPlanStatusTx(tx, plan.Id, SubscriptionDayPassPlanStatusCancelled, 0, err.Error())
			}
			child, parentRemainCount, err := createDerivedDayPassFromParentTx(tx, &parent, plan.RequestCountPerDay, nowUnix, false)
			if err != nil {
				return markDerivedDayPassPlanStatusTx(tx, plan.Id, SubscriptionDayPassPlanStatusCancelled, 0, err.Error())
			}
			processed++
			generatedDays := plan.GeneratedDays + 1
			generatedRequestCount := plan.GeneratedRequestCount + plan.RequestCountPerDay
			updates := map[string]any{
				"generated_days":          generatedDays,
				"generated_request_count": generatedRequestCount,
				"last_generate_at":        nowUnix,
				"last_error":              "",
				"updated_at":              common.GetTimestamp(),
			}
			nextGenerateAt := int64(0)
			status := SubscriptionDayPassPlanStatusActive
			if generatedDays >= plan.TotalDays || parentRemainCount <= 0 {
				status = SubscriptionDayPassPlanStatusCompleted
			} else {
				nextGenerateAt = calcNextDerivedDayPassPlanGenerateAt(plan.NextGenerateAt, &parent)
				if nextGenerateAt <= 0 || (parent.EndTime > 0 && nextGenerateAt >= parent.EndTime) {
					status = SubscriptionDayPassPlanStatusCompleted
					nextGenerateAt = 0
				}
			}
			updates["status"] = status
			updates["next_generate_at"] = nextGenerateAt
			if err := tx.Model(&SubscriptionDayPassPlan{}).Where("id = ?", plan.Id).Updates(updates).Error; err != nil {
				return err
			}
			_ = child
			return nil
		})
		if err != nil {
			return processed, err
		}
	}
	return processed, nil
}
