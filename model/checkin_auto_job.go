package model

import (
	"fmt"
	"math/rand"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const (
	CheckinAutoJobStatusScheduled = "scheduled"
	CheckinAutoJobStatusRunning   = "running"
	CheckinAutoJobStatusPartial   = "partial"
	CheckinAutoJobStatusCompleted = "completed"
	CheckinAutoJobStatusCancelled = "cancelled"

	CheckinAutoJobItemStatusPending   = "pending"
	CheckinAutoJobItemStatusRunning   = "running"
	CheckinAutoJobItemStatusSuccess   = "success"
	CheckinAutoJobItemStatusFailed    = "failed"
	CheckinAutoJobItemStatusSkipped   = "skipped"
	CheckinAutoJobItemStatusCancelled = "cancelled"
)

type CheckinAutoJob struct {
	Id                   int    `json:"id" gorm:"primaryKey;autoIncrement"`
	Name                 string `json:"name" gorm:"type:varchar(128);not null;default:''"`
	Enabled              bool   `json:"enabled" gorm:"not null;default:true;index"`
	RepeatDaily          bool   `json:"repeat_daily" gorm:"not null;default:false;index"`
	TargetDate           string `json:"target_date" gorm:"type:varchar(10);not null;index"`
	WindowStartSeconds   int    `json:"window_start_seconds" gorm:"not null;default:0"`
	WindowEndSeconds     int    `json:"window_end_seconds" gorm:"not null;default:0"`
	RandomWindowSeconds  int    `json:"random_window_seconds" gorm:"not null;default:480"`
	BypassTimeWindow     bool   `json:"bypass_time_window" gorm:"not null;default:false"`
	BypassDailyUserLimit bool   `json:"bypass_daily_user_limit" gorm:"not null;default:false"`
	UserIdsJSON          string `json:"user_ids_json" gorm:"type:text;not null"`
	Status               string `json:"status" gorm:"type:varchar(32);not null;default:'scheduled';index"`
	ItemCount            int    `json:"item_count" gorm:"not null;default:0"`
	SuccessCount         int    `json:"success_count" gorm:"not null;default:0"`
	FailedCount          int    `json:"failed_count" gorm:"not null;default:0"`
	SkippedCount         int    `json:"skipped_count" gorm:"not null;default:0"`
	CancelledCount       int    `json:"cancelled_count" gorm:"not null;default:0"`
	LastError            string `json:"last_error" gorm:"type:text;not null;default:''"`
	CreatedAt            int64  `json:"created_at" gorm:"bigint;index"`
	UpdatedAt            int64  `json:"updated_at" gorm:"bigint;index"`
}

type CheckinAutoJobItem struct {
	Id           int    `json:"id" gorm:"primaryKey;autoIncrement"`
	JobID        int    `json:"job_id" gorm:"not null;index;uniqueIndex:idx_checkin_auto_job_user"`
	UserID       int    `json:"user_id" gorm:"not null;index;uniqueIndex:idx_checkin_auto_job_user"`
	ScheduledAt  int64  `json:"scheduled_at" gorm:"bigint;not null;index"`
	ExecutedAt   int64  `json:"executed_at" gorm:"bigint;not null;default:0"`
	Status       string `json:"status" gorm:"type:varchar(32);not null;default:'pending';index"`
	ErrorMessage string `json:"error_message" gorm:"type:text;not null;default:''"`
	QuotaAwarded int    `json:"quota_awarded" gorm:"not null;default:0"`
	CreatedAt    int64  `json:"created_at" gorm:"bigint;index"`
	UpdatedAt    int64  `json:"updated_at" gorm:"bigint;index"`
}

type CheckinAutoJobWithItems struct {
	Job   *CheckinAutoJob       `json:"job"`
	Items []*CheckinAutoJobItem `json:"items"`
}

type CheckinAutoJobListResult struct {
	Items []*CheckinAutoJob `json:"items"`
	Total int64             `json:"total"`
}

type CheckinAutoJobCreateRequest struct {
	Name                string `json:"name"`
	Enabled             *bool  `json:"enabled"`
	TargetDate          string `json:"target_date"`
	WindowStartSeconds  int    `json:"window_start_seconds"`
	WindowEndSeconds    int    `json:"window_end_seconds"`
	RandomWindowSeconds int    `json:"random_window_seconds"`
	UserIDs             []int  `json:"user_ids"`
}

type CheckinAutoJobUpdateRequest struct {
	Name                string `json:"name"`
	Enabled             *bool  `json:"enabled"`
	TargetDate          string `json:"target_date"`
	WindowStartSeconds  int    `json:"window_start_seconds"`
	WindowEndSeconds    int    `json:"window_end_seconds"`
	RandomWindowSeconds int    `json:"random_window_seconds"`
	UserIDs             []int  `json:"user_ids"`
}

func formatCheckinDate(now time.Time) string {
	return now.In(checkinLocation).Format("2006-01-02")
}

func (CheckinAutoJob) TableName() string {
	return "checkin_auto_jobs"
}

func (CheckinAutoJobItem) TableName() string {
	return "checkin_auto_job_items"
}

func normalizeCheckinAutoJobUserIDs(userIDs []int) []int {
	if len(userIDs) == 0 {
		return []int{}
	}
	seen := make(map[int]struct{}, len(userIDs))
	result := make([]int, 0, len(userIDs))
	for _, userID := range userIDs {
		if userID <= 0 {
			continue
		}
		if _, ok := seen[userID]; ok {
			continue
		}
		seen[userID] = struct{}{}
		result = append(result, userID)
	}
	return result
}

func CheckinDateTime(targetDate string, seconds int) (time.Time, error) {
	targetDate = strings.TrimSpace(targetDate)
	if targetDate == "" {
		return time.Time{}, fmt.Errorf("签到日期不能为空")
	}
	if seconds < 0 || seconds >= 24*3600 {
		return time.Time{}, fmt.Errorf("签到时间必须在 0 到 86399 秒之间")
	}
	base, err := time.ParseInLocation("2006-01-02", targetDate, checkinLocation)
	if err != nil {
		return time.Time{}, fmt.Errorf("签到日期格式错误")
	}
	return base.Add(time.Duration(seconds) * time.Second), nil
}

func buildCheckinAutoJobItems(jobID int, targetDate string, windowStartSeconds int, windowEndSeconds int, randomWindowSeconds int, userIDs []int, nowUnix int64) ([]*CheckinAutoJobItem, error) {
	startAt, err := CheckinDateTime(targetDate, windowStartSeconds)
	if err != nil {
		return nil, err
	}
	endAt, err := CheckinDateTime(targetDate, windowEndSeconds)
	if err != nil {
		return nil, err
	}
	if endAt.Before(startAt) {
		return nil, fmt.Errorf("签到结束时间不能早于开始时间")
	}
	scheduleEndAt := endAt
	if randomWindowSeconds > 0 {
		randomEndAt := startAt.Add(time.Duration(randomWindowSeconds) * time.Second)
		if randomEndAt.Before(scheduleEndAt) {
			scheduleEndAt = randomEndAt
		}
	}
	startUnix := startAt.Unix()
	endUnix := scheduleEndAt.Unix()
	items := make([]*CheckinAutoJobItem, 0, len(userIDs))
	for _, userID := range userIDs {
		scheduledAt := startUnix
		if endUnix > startUnix {
			scheduledAt = startUnix + int64(rand.Intn(int(endUnix-startUnix)+1))
		}
		item := &CheckinAutoJobItem{
			JobID:       jobID,
			UserID:      userID,
			ScheduledAt: scheduledAt,
			Status:      CheckinAutoJobItemStatusPending,
			CreatedAt:   nowUnix,
			UpdatedAt:   nowUnix,
		}
		items = append(items, item)
	}
	return items, nil
}

func CreateCheckinAutoJob(req *CheckinAutoJobCreateRequest) (*CheckinAutoJobWithItems, error) {
	if req == nil {
		return nil, fmt.Errorf("请求不能为空")
	}

	targetDate := strings.TrimSpace(req.TargetDate)
	repeatDaily := false
	if targetDate == "" {
		repeatDaily = true
		targetDate = formatCheckinDate(checkinNow())
	}

	userIDs := normalizeCheckinAutoJobUserIDs(req.UserIDs)
	if len(userIDs) == 0 {
		return nil, fmt.Errorf("至少需要一个用户")
	}
	var userCount int64
	if err := DB.Model(&User{}).Where("id IN ?", userIDs).Count(&userCount).Error; err != nil {
		return nil, err
	}
	if userCount != int64(len(userIDs)) {
		return nil, fmt.Errorf("用户列表中包含不存在的用户")
	}
	if req.WindowStartSeconds < 0 || req.WindowStartSeconds >= 24*3600 {
		return nil, fmt.Errorf("签到开始时间必须在 0 到 86399 秒之间")
	}
	if req.WindowEndSeconds < 0 || req.WindowEndSeconds >= 24*3600 {
		return nil, fmt.Errorf("签到结束时间必须在 0 到 86399 秒之间")
	}
	if req.WindowEndSeconds < req.WindowStartSeconds {
		return nil, fmt.Errorf("签到结束时间不能早于开始时间")
	}
	if req.RandomWindowSeconds < 0 {
		return nil, fmt.Errorf("随机签到窗口不能小于 0")
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	userIDsJSONBytes, err := common.Marshal(userIDs)
	if err != nil {
		return nil, err
	}
	nowUnix := checkinNow().Unix()
	job := &CheckinAutoJob{
		Name:                 strings.TrimSpace(req.Name),
		Enabled:              enabled,
		RepeatDaily:          repeatDaily,
		TargetDate:           targetDate,
		WindowStartSeconds:   req.WindowStartSeconds,
		WindowEndSeconds:     req.WindowEndSeconds,
		RandomWindowSeconds:  req.RandomWindowSeconds,
		BypassTimeWindow:     false,
		BypassDailyUserLimit: false,
		UserIdsJSON:          string(userIDsJSONBytes),
		Status:               CheckinAutoJobStatusScheduled,
		ItemCount:            len(userIDs),
		CreatedAt:            nowUnix,
		UpdatedAt:            nowUnix,
	}
	err = DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(job).Error; err != nil {
			return err
		}
		items, err := buildCheckinAutoJobItems(job.Id, job.TargetDate, job.WindowStartSeconds, job.WindowEndSeconds, job.RandomWindowSeconds, userIDs, nowUnix)
		if err != nil {
			return err
		}
		if len(items) > 0 {
			if err := tx.Create(&items).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return GetCheckinAutoJobDetail(job.Id)
}

func ListCheckinAutoJobs(page int, pageSize int, targetDate string, status string) (*CheckinAutoJobListResult, error) {
	page, pageSize = normalizeCheckinPage(page, pageSize)
	query := DB.Model(&CheckinAutoJob{})
	if strings.TrimSpace(targetDate) != "" {
		query = query.Where("target_date = ?", strings.TrimSpace(targetDate))
	}
	if strings.TrimSpace(status) != "" {
		query = query.Where("status = ?", strings.TrimSpace(status))
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, err
	}
	items := make([]*CheckinAutoJob, 0, pageSize)
	if total > 0 {
		if err := query.Order("id desc").
			Limit(pageSize).
			Offset((page - 1) * pageSize).
			Find(&items).Error; err != nil {
			return nil, err
		}
	}
	return &CheckinAutoJobListResult{Items: items, Total: total}, nil
}

func GetCheckinAutoJobDetail(jobID int) (*CheckinAutoJobWithItems, error) {
	if jobID <= 0 {
		return nil, gorm.ErrRecordNotFound
	}
	job := &CheckinAutoJob{}
	if err := DB.First(job, jobID).Error; err != nil {
		return nil, err
	}
	items := make([]*CheckinAutoJobItem, 0)
	if err := DB.Where("job_id = ?", jobID).Order("scheduled_at asc, id asc").Find(&items).Error; err != nil {
		return nil, err
	}
	return &CheckinAutoJobWithItems{
		Job:   job,
		Items: items,
	}, nil
}

func IsCheckinAutoJobCancellable(status string) bool {
	switch strings.TrimSpace(status) {
	case CheckinAutoJobStatusCancelled, CheckinAutoJobStatusCompleted:
		return false
	default:
		return true
	}
}

func CancelCheckinAutoJob(jobID int) error {
	if jobID <= 0 {
		return fmt.Errorf("任务不存在")
	}
	nowUnix := checkinNow().Unix()
	return DB.Transaction(func(tx *gorm.DB) error {
		job := &CheckinAutoJob{}
		if err := tx.First(job, jobID).Error; err != nil {
			return err
		}
		if !IsCheckinAutoJobCancellable(job.Status) {
			return fmt.Errorf("当前任务状态不允许取消")
		}
		if err := tx.Model(&CheckinAutoJob{}).
			Where("id = ?", jobID).
			Updates(map[string]interface{}{
				"enabled":    false,
				"status":     CheckinAutoJobStatusCancelled,
				"updated_at": nowUnix,
			}).Error; err != nil {
			return err
		}
		if err := tx.Model(&CheckinAutoJobItem{}).
			Where("job_id = ? AND status IN ?", jobID, []string{CheckinAutoJobItemStatusPending, CheckinAutoJobItemStatusRunning}).
			Updates(map[string]interface{}{
				"status":     CheckinAutoJobItemStatusCancelled,
				"updated_at": nowUnix,
			}).Error; err != nil {
			return err
		}
		if err := refreshCheckinAutoJobSummaryTx(tx, jobID, nowUnix); err != nil {
			return err
		}
		if err := tx.Model(&CheckinAutoJob{}).
			Where("id = ?", jobID).
			Updates(map[string]interface{}{
				"enabled":    false,
				"status":     CheckinAutoJobStatusCancelled,
				"updated_at": nowUnix,
			}).Error; err != nil {
			return err
		}
		return nil
	})
}

func ResetStaleRunningCheckinAutoJobItems(expireBefore int64, nowUnix int64) (int64, error) {
	result := DB.Model(&CheckinAutoJobItem{}).
		Where("status = ? AND updated_at > 0 AND updated_at < ?", CheckinAutoJobItemStatusRunning, expireBefore).
		Updates(map[string]interface{}{
			"status":        CheckinAutoJobItemStatusPending,
			"error_message": "",
			"updated_at":    nowUnix,
		})
	return result.RowsAffected, result.Error
}

func UpdateCheckinAutoJob(jobID int, req *CheckinAutoJobUpdateRequest) (*CheckinAutoJobWithItems, error) {
	if jobID <= 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req == nil {
		return nil, fmt.Errorf("请求不能为空")
	}

	job := &CheckinAutoJob{}
	if err := DB.First(job, jobID).Error; err != nil {
		return nil, err
	}
	if strings.TrimSpace(job.Status) != CheckinAutoJobStatusScheduled {
		return nil, fmt.Errorf("仅支持修改待执行任务")
	}

	targetDate := strings.TrimSpace(req.TargetDate)
	repeatDaily := false
	if targetDate == "" {
		repeatDaily = true
		targetDate = formatCheckinDate(checkinNow())
	}

	userIDs := normalizeCheckinAutoJobUserIDs(req.UserIDs)
	if len(userIDs) == 0 {
		return nil, fmt.Errorf("至少需要一个用户")
	}
	var userCount int64
	if err := DB.Model(&User{}).Where("id IN ?", userIDs).Count(&userCount).Error; err != nil {
		return nil, err
	}
	if userCount != int64(len(userIDs)) {
		return nil, fmt.Errorf("用户列表中包含不存在的用户")
	}

	if req.WindowStartSeconds < 0 || req.WindowStartSeconds >= 24*3600 {
		return nil, fmt.Errorf("签到开始时间必须在 0 到 86399 秒之间")
	}
	if req.WindowEndSeconds < 0 || req.WindowEndSeconds >= 24*3600 {
		return nil, fmt.Errorf("签到结束时间必须在 0 到 86399 秒之间")
	}
	if req.WindowEndSeconds < req.WindowStartSeconds {
		return nil, fmt.Errorf("签到结束时间不能早于开始时间")
	}
	if req.RandomWindowSeconds < 0 {
		return nil, fmt.Errorf("随机签到窗口不能小于 0")
	}

	enabled := job.Enabled
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	userIDsJSONBytes, err := common.Marshal(userIDs)
	if err != nil {
		return nil, err
	}

	nowUnix := checkinNow().Unix()
	updateJob := &CheckinAutoJob{
		Id:                  jobID,
		Name:                strings.TrimSpace(req.Name),
		Enabled:             enabled,
		RepeatDaily:         repeatDaily,
		TargetDate:          targetDate,
		WindowStartSeconds:  req.WindowStartSeconds,
		WindowEndSeconds:    req.WindowEndSeconds,
		RandomWindowSeconds: req.RandomWindowSeconds,
		UserIdsJSON:         string(userIDsJSONBytes),
		Status:              CheckinAutoJobStatusScheduled,
		ItemCount:           len(userIDs),
		SuccessCount:        0,
		FailedCount:         0,
		SkippedCount:        0,
		CancelledCount:      0,
		LastError:           "",
		UpdatedAt:           nowUnix,
	}

	err = DB.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&CheckinAutoJob{}).
			Where("id = ? AND status = ?", jobID, CheckinAutoJobStatusScheduled).
			Updates(map[string]any{
				"name":                  updateJob.Name,
				"enabled":               updateJob.Enabled,
				"repeat_daily":          updateJob.RepeatDaily,
				"target_date":           updateJob.TargetDate,
				"window_start_seconds":  updateJob.WindowStartSeconds,
				"window_end_seconds":    updateJob.WindowEndSeconds,
				"random_window_seconds": updateJob.RandomWindowSeconds,
				"user_ids_json":         updateJob.UserIdsJSON,
				"status":                CheckinAutoJobStatusScheduled,
				"item_count":            updateJob.ItemCount,
				"success_count":         0,
				"failed_count":          0,
				"skipped_count":         0,
				"cancelled_count":       0,
				"last_error":            "",
				"updated_at":            nowUnix,
			})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return fmt.Errorf("任务状态已变更，请刷新后重试")
		}

		if err := tx.Where("job_id = ?", jobID).Delete(&CheckinAutoJobItem{}).Error; err != nil {
			return err
		}
		items, err := buildCheckinAutoJobItems(jobID, targetDate, req.WindowStartSeconds, req.WindowEndSeconds, req.RandomWindowSeconds, userIDs, nowUnix)
		if err != nil {
			return err
		}
		if len(items) > 0 {
			if err := tx.Create(&items).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	return GetCheckinAutoJobDetail(jobID)
}

func parseCheckinAutoJobUserIDs(raw string) ([]int, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return []int{}, nil
	}
	var ids []int
	if err := common.UnmarshalJsonStr(raw, &ids); err != nil {
		return nil, err
	}
	return normalizeCheckinAutoJobUserIDs(ids), nil
}

func refreshRepeatDailyCheckinAutoJobs(nowUnix int64) {
	today := formatCheckinDate(time.Unix(nowUnix, 0))

	jobs := make([]*CheckinAutoJob, 0)
	err := DB.Model(&CheckinAutoJob{}).
		Where("enabled = ?", true).
		Where("repeat_daily = ?", true).
		Where("target_date <> ?", today).
		Where("status IN ?", []string{CheckinAutoJobStatusScheduled, CheckinAutoJobStatusRunning, CheckinAutoJobStatusPartial}).
		Find(&jobs).Error
	if err != nil || len(jobs) == 0 {
		return
	}

	for _, job := range jobs {
		if job == nil || job.Id <= 0 {
			continue
		}

		_ = DB.Transaction(func(tx *gorm.DB) error {
			update := tx.Model(&CheckinAutoJob{}).
				Where("id = ? AND repeat_daily = ? AND target_date <> ?", job.Id, true, today).
				Updates(map[string]any{
					"target_date":     today,
					"status":          CheckinAutoJobStatusScheduled,
					"success_count":   0,
					"failed_count":    0,
					"skipped_count":   0,
					"cancelled_count": 0,
					"last_error":      "",
					"updated_at":      nowUnix,
				})
			if update.Error != nil {
				return update.Error
			}
			if update.RowsAffected == 0 {
				return nil
			}

			userIDs, err := parseCheckinAutoJobUserIDs(job.UserIdsJSON)
			if err != nil {
				return err
			}
			if len(userIDs) == 0 {
				return fmt.Errorf("用户列表为空")
			}

			if err := tx.Where("job_id = ?", job.Id).Delete(&CheckinAutoJobItem{}).Error; err != nil {
				return err
			}
			items, err := buildCheckinAutoJobItems(job.Id, today, job.WindowStartSeconds, job.WindowEndSeconds, job.RandomWindowSeconds, userIDs, nowUnix)
			if err != nil {
				return err
			}
			if len(items) > 0 {
				if err := tx.Create(&items).Error; err != nil {
					return err
				}
			}

			return nil
		})
	}
}

func ListDueCheckinAutoJobItems(nowUnix int64, limit int) ([]*CheckinAutoJobItem, error) {
	if limit <= 0 {
		limit = 100
	}
	refreshRepeatDailyCheckinAutoJobs(nowUnix)
	items := make([]*CheckinAutoJobItem, 0, limit)
	err := DB.Model(&CheckinAutoJobItem{}).
		Joins("JOIN checkin_auto_jobs ON checkin_auto_jobs.id = checkin_auto_job_items.job_id").
		Where("checkin_auto_jobs.enabled = ?", true).
		Where("checkin_auto_jobs.status IN ?", []string{CheckinAutoJobStatusScheduled, CheckinAutoJobStatusRunning, CheckinAutoJobStatusPartial}).
		Where("checkin_auto_job_items.status = ?", CheckinAutoJobItemStatusPending).
		Where("checkin_auto_job_items.scheduled_at <= ?", nowUnix).
		Order("checkin_auto_job_items.scheduled_at asc, checkin_auto_job_items.id asc").
		Limit(limit).
		Find(&items).Error
	return items, err
}

func ClaimCheckinAutoJobItem(itemID int, nowUnix int64) (bool, error) {
	result := DB.Model(&CheckinAutoJobItem{}).
		Where("id = ? AND status = ?", itemID, CheckinAutoJobItemStatusPending).
		Updates(map[string]interface{}{
			"status":     CheckinAutoJobItemStatusRunning,
			"updated_at": nowUnix,
		})
	if result.Error != nil {
		return false, result.Error
	}
	return result.RowsAffected > 0, nil
}

func GetCheckinAutoJobByID(jobID int) (*CheckinAutoJob, error) {
	job := &CheckinAutoJob{}
	if err := DB.First(job, jobID).Error; err != nil {
		return nil, err
	}
	return job, nil
}

func FinishCheckinAutoJobItem(itemID int, status string, quotaAwarded int, errorMessage string, executedAt int64) error {
	if itemID <= 0 {
		return fmt.Errorf("任务项不存在")
	}
	switch status {
	case CheckinAutoJobItemStatusSuccess, CheckinAutoJobItemStatusFailed, CheckinAutoJobItemStatusSkipped, CheckinAutoJobItemStatusCancelled:
	default:
		return fmt.Errorf("无效的任务项状态")
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		item := &CheckinAutoJobItem{}
		if err := tx.First(item, itemID).Error; err != nil {
			return err
		}
		if err := tx.Model(item).Updates(map[string]interface{}{
			"status":        status,
			"quota_awarded": quotaAwarded,
			"error_message": strings.TrimSpace(errorMessage),
			"executed_at":   executedAt,
			"updated_at":    executedAt,
		}).Error; err != nil {
			return err
		}
		return refreshCheckinAutoJobSummaryTx(tx, item.JobID, executedAt)
	})
}

func refreshCheckinAutoJobSummaryTx(tx *gorm.DB, jobID int, nowUnix int64) error {
	type summary struct {
		Total     int64
		Pending   int64
		Running   int64
		Success   int64
		Failed    int64
		Skipped   int64
		Cancelled int64
	}
	var stat summary
	if err := tx.Model(&CheckinAutoJobItem{}).
		Select(
			"COUNT(*) AS total",
			"SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending",
			"SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running",
			"SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success",
			"SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed",
			"SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped",
			"SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled",
		).
		Where("job_id = ?", jobID).
		Scan(&stat).Error; err != nil {
		return err
	}
	jobStatus := CheckinAutoJobStatusScheduled
	switch {
	case stat.Pending == 0 && stat.Running == 0 && stat.Failed == 0:
		if stat.Cancelled == stat.Total && stat.Total > 0 {
			jobStatus = CheckinAutoJobStatusCancelled
		} else {
			jobStatus = CheckinAutoJobStatusCompleted
		}
	case stat.Running > 0:
		jobStatus = CheckinAutoJobStatusRunning
	case stat.Failed > 0:
		jobStatus = CheckinAutoJobStatusPartial
	default:
		jobStatus = CheckinAutoJobStatusScheduled
	}
	return tx.Model(&CheckinAutoJob{}).
		Where("id = ?", jobID).
		Updates(map[string]interface{}{
			"status":          jobStatus,
			"item_count":      int(stat.Total),
			"success_count":   int(stat.Success),
			"failed_count":    int(stat.Failed),
			"skipped_count":   int(stat.Skipped),
			"cancelled_count": int(stat.Cancelled),
			"updated_at":      nowUnix,
		}).Error
}
