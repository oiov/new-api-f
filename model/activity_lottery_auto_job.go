package model

import (
	"fmt"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/setting/operation_setting"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ActivityLotteryAutoJob 自动抽奖任务：按模板每日自动创建并开启一期活动抽奖。
// 开奖+发奖复用现有 activity_lottery_task ticker；本任务只负责“自动建期”。
type ActivityLotteryAutoJob struct {
	Id                       int     `json:"id" gorm:"primaryKey;autoIncrement"`
	Name                     string  `json:"name" gorm:"type:varchar(128);not null;default:''"`
	Enabled                  bool    `json:"enabled" gorm:"not null;default:true;index"`
	TitleTemplate            string  `json:"title_template" gorm:"type:varchar(128);not null;default:''"` // 含 {n}
	IssueNo                  int     `json:"issue_no" gorm:"not null;default:0"`
	RunAtSeconds             int     `json:"run_at_seconds" gorm:"not null;default:0"`    // 当天开期时刻 0..86399 (Asia/Shanghai)
	DurationSeconds          int     `json:"duration_seconds" gorm:"not null;default:0"`  // end_at = start_at + duration
	WinnerCount              int     `json:"winner_count" gorm:"not null;default:0"`
	MinParticipants          int     `json:"min_participants" gorm:"not null;default:0"`
	JoinSources              string  `json:"join_sources" gorm:"type:varchar(128);not null;default:'manual'"`
	JoinTopupMinMoney        float64 `json:"join_topup_min_money" gorm:"not null;default:0"`
	JoinDailyConsumeMinMoney float64 `json:"join_daily_consume_min_money" gorm:"not null;default:0"`
	PrizeQuota               int     `json:"prize_quota" gorm:"not null;default:0"`     // 兑换码额度(quota 单位)
	PrizeName                string  `json:"prize_name" gorm:"type:varchar(64);not null;default:''"` // 码 name 模板(含 {n})
	PrizeText                string  `json:"prize_text" gorm:"type:varchar(255);not null;default:''"` // round 展示用奖品名
	LastRunDate              string  `json:"last_run_date" gorm:"type:varchar(10);not null;default:'';index"`
	LastRoundId              int     `json:"last_round_id" gorm:"not null;default:0"`
	Status                   string  `json:"status" gorm:"type:varchar(32);not null;default:'';index"`
	LastError                string  `json:"last_error" gorm:"type:text;not null;default:''"`
	CreatedAt                int64   `json:"created_at" gorm:"bigint;index"`
	UpdatedAt                int64   `json:"updated_at" gorm:"bigint;index"`
}

func (ActivityLotteryAutoJob) TableName() string {
	return "activity_lottery_auto_jobs"
}

type ActivityLotteryAutoJobUpsertRequest struct {
	Name                     string  `json:"name"`
	Enabled                  *bool   `json:"enabled"`
	TitleTemplate            string  `json:"title_template"`
	RunAtSeconds             int     `json:"run_at_seconds"`
	DurationSeconds          int     `json:"duration_seconds"`
	WinnerCount              int     `json:"winner_count"`
	MinParticipants          int     `json:"min_participants"`
	JoinSources              string  `json:"join_sources"`
	JoinTopupMinMoney        float64 `json:"join_topup_min_money"`
	JoinDailyConsumeMinMoney float64 `json:"join_daily_consume_min_money"`
	PrizeQuota               int     `json:"prize_quota"`
	PrizeName                string  `json:"prize_name"`
	PrizeText                string  `json:"prize_text"`
}

type ActivityLotteryAutoJobListResult struct {
	Items []*ActivityLotteryAutoJob `json:"items"`
	Total int64                     `json:"total"`
}

// expandIssueTemplate 将模板中的 {n} 替换为期号。
func expandIssueTemplate(template string, issueNo int) string {
	return strings.ReplaceAll(template, "{n}", strconv.Itoa(issueNo))
}

func validateActivityLotteryAutoJobRequest(req *ActivityLotteryAutoJobUpsertRequest) (string, error) {
	if req == nil {
		return "", fmt.Errorf("请求不能为空")
	}
	titleTemplate := strings.TrimSpace(req.TitleTemplate)
	if titleTemplate == "" {
		return "", fmt.Errorf("标题模板不能为空")
	}
	if req.DurationSeconds <= 0 {
		return "", fmt.Errorf("持续时长必须大于 0")
	}
	if req.RunAtSeconds < 0 || req.RunAtSeconds >= 24*3600 {
		return "", fmt.Errorf("开期时刻必须在 0 到 86399 秒之间")
	}
	if req.WinnerCount < 1 {
		return "", fmt.Errorf("中奖人数必须大于等于 1")
	}
	if req.PrizeQuota <= 0 {
		return "", fmt.Errorf("兑换码额度必须大于 0")
	}
	prizeName := strings.TrimSpace(req.PrizeName)
	if prizeName == "" {
		return "", fmt.Errorf("兑换码名称不能为空")
	}
	// 展开期号后长度不得超过 20（兑换码 name 约束），用较大期号样例校验
	if utf8.RuneCountInString(expandIssueTemplate(prizeName, 9999)) > 20 {
		return "", fmt.Errorf("兑换码名称（含期号）不能超过 20 个字符")
	}
	joinSources := operation_setting.NormalizeActivityLotteryJoinSources(req.JoinSources)
	if strings.Contains(joinSources, "topup") && req.JoinTopupMinMoney <= 0 {
		return "", fmt.Errorf("启用充值参与时，充值门槛必须大于 0")
	}
	if strings.Contains(joinSources, "consume") && req.JoinDailyConsumeMinMoney <= 0 {
		return "", fmt.Errorf("启用消耗参与时，今日消耗门槛必须大于 0")
	}
	return joinSources, nil
}

func CreateActivityLotteryAutoJob(req *ActivityLotteryAutoJobUpsertRequest, now time.Time) (*ActivityLotteryAutoJob, error) {
	joinSources, err := validateActivityLotteryAutoJobRequest(req)
	if err != nil {
		return nil, err
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	minParticipants := req.MinParticipants
	if minParticipants < 0 {
		minParticipants = 0
	}
	nowUnix := now.Unix()
	job := &ActivityLotteryAutoJob{
		Name:                     normalizeLotteryText(req.Name, 128),
		Enabled:                  enabled,
		TitleTemplate:            normalizeLotteryText(req.TitleTemplate, 128),
		IssueNo:                  0,
		RunAtSeconds:             req.RunAtSeconds,
		DurationSeconds:          req.DurationSeconds,
		WinnerCount:              req.WinnerCount,
		MinParticipants:          minParticipants,
		JoinSources:              joinSources,
		JoinTopupMinMoney:        req.JoinTopupMinMoney,
		JoinDailyConsumeMinMoney: req.JoinDailyConsumeMinMoney,
		PrizeQuota:               req.PrizeQuota,
		PrizeName:                normalizeLotteryText(req.PrizeName, 64),
		PrizeText:                normalizeLotteryText(req.PrizeText, 255),
		Status:                   "",
		CreatedAt:                nowUnix,
		UpdatedAt:                nowUnix,
	}
	if err := DB.Create(job).Error; err != nil {
		return nil, err
	}
	return job, nil
}

func UpdateActivityLotteryAutoJob(jobId int, req *ActivityLotteryAutoJobUpsertRequest, now time.Time) (*ActivityLotteryAutoJob, error) {
	if jobId <= 0 {
		return nil, gorm.ErrRecordNotFound
	}
	joinSources, err := validateActivityLotteryAutoJobRequest(req)
	if err != nil {
		return nil, err
	}
	job := &ActivityLotteryAutoJob{}
	if err := DB.First(job, jobId).Error; err != nil {
		return nil, err
	}
	enabled := job.Enabled
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	minParticipants := req.MinParticipants
	if minParticipants < 0 {
		minParticipants = 0
	}
	update := map[string]any{
		"name":                         normalizeLotteryText(req.Name, 128),
		"enabled":                      enabled,
		"title_template":               normalizeLotteryText(req.TitleTemplate, 128),
		"run_at_seconds":               req.RunAtSeconds,
		"duration_seconds":             req.DurationSeconds,
		"winner_count":                 req.WinnerCount,
		"min_participants":             minParticipants,
		"join_sources":                 joinSources,
		"join_topup_min_money":         req.JoinTopupMinMoney,
		"join_daily_consume_min_money": req.JoinDailyConsumeMinMoney,
		"prize_quota":                  req.PrizeQuota,
		"prize_name":                   normalizeLotteryText(req.PrizeName, 64),
		"prize_text":                   normalizeLotteryText(req.PrizeText, 255),
		"updated_at":                   now.Unix(),
	}
	if err := DB.Model(&ActivityLotteryAutoJob{}).Where("id = ?", jobId).Updates(update).Error; err != nil {
		return nil, err
	}
	if err := DB.First(job, jobId).Error; err != nil {
		return nil, err
	}
	return job, nil
}

func DeleteActivityLotteryAutoJob(jobId int) error {
	if jobId <= 0 {
		return gorm.ErrRecordNotFound
	}
	return DB.Delete(&ActivityLotteryAutoJob{}, jobId).Error
}

func GetActivityLotteryAutoJobById(jobId int) (*ActivityLotteryAutoJob, error) {
	if jobId <= 0 {
		return nil, gorm.ErrRecordNotFound
	}
	job := &ActivityLotteryAutoJob{}
	if err := DB.First(job, jobId).Error; err != nil {
		return nil, err
	}
	return job, nil
}

func ListActivityLotteryAutoJobs(page int, pageSize int) (*ActivityLotteryAutoJobListResult, error) {
	page, pageSize = normalizeCheckinPage(page, pageSize)
	query := DB.Model(&ActivityLotteryAutoJob{})
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, err
	}
	items := make([]*ActivityLotteryAutoJob, 0, pageSize)
	if total > 0 {
		if err := query.Order("id desc").
			Limit(pageSize).
			Offset((page - 1) * pageSize).
			Find(&items).Error; err != nil {
			return nil, err
		}
	}
	return &ActivityLotteryAutoJobListResult{Items: items, Total: total}, nil
}

// ListDueActivityLotteryAutoJobs 返回所有启用的任务（具体是否到点由 RunActivityLotteryAutoJob 判定）。
func ListDueActivityLotteryAutoJobs(now time.Time) ([]*ActivityLotteryAutoJob, error) {
	items := make([]*ActivityLotteryAutoJob, 0)
	err := DB.Model(&ActivityLotteryAutoJob{}).
		Where("enabled = ?", true).
		Order("id asc").
		Find(&items).Error
	return items, err
}

func updateActivityLotteryAutoJobError(jobId int, runErr error, now time.Time) error {
	return DB.Model(&ActivityLotteryAutoJob{}).
		Where("id = ?", jobId).
		Updates(map[string]any{
			"status":     "error",
			"last_error": runErr.Error(),
			"updated_at": now.Unix(),
		}).Error
}

// RunActivityLotteryAutoJob 在到点时按模板创建并开启一期。
// 返回新建的 round（未到点/已建过/上一期进行中则返回 nil, nil）。
// 采用“先抢占当天名额（行锁事务）再建期”，确保单 master 下不会重复建期/重复发奖。
func RunActivityLotteryAutoJob(jobId int, now time.Time) (*ActivityLotteryRound, error) {
	if jobId <= 0 {
		return nil, gorm.ErrRecordNotFound
	}
	nowUnix := now.Unix()
	today := formatCheckinDate(now)

	var claimed bool
	var claimedJob ActivityLotteryAutoJob
	var issueNo int
	err := DB.Transaction(func(tx *gorm.DB) error {
		var job ActivityLotteryAutoJob
		if e := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&job, jobId).Error; e != nil {
			return e
		}
		if !job.Enabled {
			return nil
		}
		runAt := getActivityLotteryDayStart(now) + int64(job.RunAtSeconds)
		if nowUnix < runAt {
			return nil
		}
		if job.LastRunDate == today {
			return nil
		}
		// 不与进行中的上一期重叠
		if job.LastRoundId > 0 {
			var last ActivityLotteryRound
			if e := tx.First(&last, job.LastRoundId).Error; e == nil && last.Status == ActivityLotteryRoundStatusOpen {
				return nil
			}
		}
		issueNo = job.IssueNo + 1
		// 抢占当天名额：标记 last_run_date=today + issue_no++（建期失败也不会今天重试，错误见 last_error）
		if e := tx.Model(&ActivityLotteryAutoJob{}).
			Where("id = ?", jobId).
			Updates(map[string]any{
				"issue_no":      issueNo,
				"last_run_date": today,
				"updated_at":    nowUnix,
			}).Error; e != nil {
			return e
		}
		claimedJob = job
		claimed = true
		return nil
	})
	if err != nil {
		return nil, err
	}
	if !claimed {
		return nil, nil
	}

	startAt := getActivityLotteryDayStart(now) + int64(claimedJob.RunAtSeconds)
	return buildAndOpenRoundForAutoJob(&claimedJob, issueNo, startAt, now)
}

// buildAndOpenRoundForAutoJob 按任务模板创建一期并开启，回写任务的 last_round_id/status。
func buildAndOpenRoundForAutoJob(job *ActivityLotteryAutoJob, issueNo int, startAt int64, now time.Time) (*ActivityLotteryRound, error) {
	title := expandIssueTemplate(job.TitleTemplate, issueNo)
	prizeName := expandIssueTemplate(job.PrizeName, issueNo)
	endAt := startAt + int64(job.DurationSeconds)
	published := true

	round, err := CreateActivityLotteryRound(&ActivityLotteryRoundUpsertRequest{
		Title:                    title,
		Prize:                    job.PrizeText,
		JoinSources:              job.JoinSources,
		JoinTopupMinMoney:        job.JoinTopupMinMoney,
		JoinDailyConsumeMinMoney: job.JoinDailyConsumeMinMoney,
		StartAt:                  startAt,
		EndAt:                    endAt,
		MinParticipants:          job.MinParticipants,
		WinnerCount:              job.WinnerCount,
		PrizeMode:                ActivityLotteryPrizeModePerWinnerCode,
		AutoJobId:                job.Id,
		PrizeQuota:               job.PrizeQuota,
		PrizeName:                prizeName,
		Published:                &published,
	}, now)
	if err != nil {
		_ = updateActivityLotteryAutoJobError(job.Id, err, now)
		return nil, err
	}
	if err := OpenActivityLotteryRound(round.Id, now); err != nil {
		_ = updateActivityLotteryAutoJobError(job.Id, err, now)
		return nil, err
	}
	if err := DB.Model(&ActivityLotteryAutoJob{}).
		Where("id = ?", job.Id).
		Updates(map[string]any{
			"last_round_id": round.Id,
			"status":        "ok",
			"last_error":    "",
			"updated_at":    now.Unix(),
		}).Error; err != nil {
		return nil, err
	}
	round.Status = ActivityLotteryRoundStatusOpen
	return round, nil
}

// ForceRunActivityLotteryAutoJob 手动“立即执行一次”：忽略 run_at 时刻与当天去重，
// 以当前时刻为开期时间立即建一期并开启（持续时长仍取任务配置）。
// 注意：开启新一期会关闭其他仍在进行中的期（OpenActivityLotteryRound 语义）。
func ForceRunActivityLotteryAutoJob(jobId int, now time.Time) (*ActivityLotteryRound, error) {
	if jobId <= 0 {
		return nil, gorm.ErrRecordNotFound
	}
	today := formatCheckinDate(now)
	var issueNo int
	var jobCopy ActivityLotteryAutoJob
	err := DB.Transaction(func(tx *gorm.DB) error {
		var job ActivityLotteryAutoJob
		if e := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&job, jobId).Error; e != nil {
			return e
		}
		issueNo = job.IssueNo + 1
		if e := tx.Model(&ActivityLotteryAutoJob{}).
			Where("id = ?", jobId).
			Updates(map[string]any{
				"issue_no":      issueNo,
				"last_run_date": today,
				"updated_at":    now.Unix(),
			}).Error; e != nil {
			return e
		}
		jobCopy = job
		return nil
	})
	if err != nil {
		return nil, err
	}
	return buildAndOpenRoundForAutoJob(&jobCopy, issueNo, now.Unix(), now)
}
