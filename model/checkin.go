package model

import (
	"errors"
	"math/rand"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"gorm.io/gorm"
)

// Checkin 签到记录
type Checkin struct {
	Id           int    `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId       int    `json:"user_id" gorm:"not null;uniqueIndex:idx_user_checkin_date"`
	CheckinDate  string `json:"checkin_date" gorm:"type:varchar(10);not null;uniqueIndex:idx_user_checkin_date"` // 格式: YYYY-MM-DD
	QuotaAwarded int    `json:"quota_awarded" gorm:"not null"`
	CreatedAt    int64  `json:"created_at" gorm:"bigint"`
}

// CheckinRecord 用于API返回的签到记录（不包含敏感字段）
type CheckinRecord struct {
	CheckinDate  string `json:"checkin_date"`
	QuotaAwarded int    `json:"quota_awarded"`
}

type CheckinLeaderboardItem struct {
	DisplayName   string `json:"display_name"`
	TotalCheckins int64  `json:"total_checkins"`
	TotalQuota    int64  `json:"total_quota"`
}

type AdminCheckinRecord struct {
	Id           int    `json:"id"`
	UserId       int    `json:"user_id"`
	Username     string `json:"username"`
	DisplayName  string `json:"display_name"`
	CheckinDate  string `json:"checkin_date"`
	QuotaAwarded int    `json:"quota_awarded"`
	CreatedAt    int64  `json:"created_at"`
}

type AdminCheckinStats struct {
	TotalCheckins int64 `json:"total_checkins"`
	TotalUsers    int64 `json:"total_users"`
	TotalQuota    int64 `json:"total_quota"`
	TodayCheckins int64 `json:"today_checkins"`
}

func (Checkin) TableName() string {
	return "checkins"
}

// GetUserCheckinRecords 获取用户在指定日期范围内的签到记录
func GetUserCheckinRecords(userId int, startDate, endDate string) ([]Checkin, error) {
	var records []Checkin
	err := DB.Where("user_id = ? AND checkin_date >= ? AND checkin_date <= ?",
		userId, startDate, endDate).
		Order("checkin_date DESC").
		Find(&records).Error
	return records, err
}

// HasCheckedInToday 检查用户今天是否已签到
func HasCheckedInToday(userId int) (bool, error) {
	today := time.Now().Format("2006-01-02")
	var count int64
	err := DB.Model(&Checkin{}).
		Where("user_id = ? AND checkin_date = ?", userId, today).
		Count(&count).Error
	return count > 0, err
}

// UserCheckin 执行用户签到
// MySQL 和 PostgreSQL 使用事务保证原子性
// SQLite 不支持嵌套事务，使用顺序操作 + 手动回滚
func UserCheckin(userId int) (*Checkin, error) {
	setting := operation_setting.GetCheckinSetting()
	if !setting.Enabled {
		return nil, errors.New("签到功能未启用")
	}

	// 检查今天是否已签到
	hasChecked, err := HasCheckedInToday(userId)
	if err != nil {
		return nil, err
	}
	if hasChecked {
		return nil, errors.New("今日已签到")
	}

	// 计算随机额度奖励
	quotaAwarded := setting.MinQuota
	if setting.MaxQuota > setting.MinQuota {
		quotaAwarded = setting.MinQuota + rand.Intn(setting.MaxQuota-setting.MinQuota+1)
	}

	today := time.Now().Format("2006-01-02")
	checkin := &Checkin{
		UserId:       userId,
		CheckinDate:  today,
		QuotaAwarded: quotaAwarded,
		CreatedAt:    time.Now().Unix(),
	}

	// 根据数据库类型选择不同的策略
	if common.UsingSQLite {
		// SQLite 不支持嵌套事务，使用顺序操作 + 手动回滚
		return userCheckinWithoutTransaction(checkin, userId, quotaAwarded)
	}

	// MySQL 和 PostgreSQL 支持事务，使用事务保证原子性
	return userCheckinWithTransaction(checkin, userId, quotaAwarded)
}

// userCheckinWithTransaction 使用事务执行签到（适用于 MySQL 和 PostgreSQL）
func userCheckinWithTransaction(checkin *Checkin, userId int, quotaAwarded int) (*Checkin, error) {
	err := DB.Transaction(func(tx *gorm.DB) error {
		// 步骤1: 创建签到记录
		// 数据库有唯一约束 (user_id, checkin_date)，可以防止并发重复签到
		if err := tx.Create(checkin).Error; err != nil {
			return errors.New("签到失败，请稍后重试")
		}

		// 步骤2: 在事务中增加用户额度
		if err := tx.Model(&User{}).Where("id = ?", userId).
			Update("quota", gorm.Expr("quota + ?", quotaAwarded)).Error; err != nil {
			return errors.New("签到失败：更新额度出错")
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	// 事务成功后，异步更新缓存
	go func() {
		_ = cacheIncrUserQuota(userId, int64(quotaAwarded))
	}()

	return checkin, nil
}

// userCheckinWithoutTransaction 不使用事务执行签到（适用于 SQLite）
func userCheckinWithoutTransaction(checkin *Checkin, userId int, quotaAwarded int) (*Checkin, error) {
	// 步骤1: 创建签到记录
	// 数据库有唯一约束 (user_id, checkin_date)，可以防止并发重复签到
	if err := DB.Create(checkin).Error; err != nil {
		return nil, errors.New("签到失败，请稍后重试")
	}

	// 步骤2: 增加用户额度
	// 使用 db=true 强制直接写入数据库，不使用批量更新
	if err := IncreaseUserQuota(userId, quotaAwarded, true); err != nil {
		// 如果增加额度失败，需要回滚签到记录
		DB.Delete(checkin)
		return nil, errors.New("签到失败：更新额度出错")
	}

	return checkin, nil
}

// GetUserCheckinStats 获取用户签到统计信息
func GetUserCheckinStats(userId int, month string) (map[string]interface{}, error) {
	// 获取指定月份的所有签到记录
	startDate := month + "-01"
	endDate := month + "-31"

	records, err := GetUserCheckinRecords(userId, startDate, endDate)
	if err != nil {
		return nil, err
	}

	// 转换为不包含敏感字段的记录
	checkinRecords := make([]CheckinRecord, len(records))
	for i, r := range records {
		checkinRecords[i] = CheckinRecord{
			CheckinDate:  r.CheckinDate,
			QuotaAwarded: r.QuotaAwarded,
		}
	}

	// 检查今天是否已签到
	hasCheckedToday, _ := HasCheckedInToday(userId)

	// 获取用户所有时间的签到统计
	var totalCheckins int64
	var totalQuota int64
	DB.Model(&Checkin{}).Where("user_id = ?", userId).Count(&totalCheckins)
	DB.Model(&Checkin{}).Where("user_id = ?", userId).Select("COALESCE(SUM(quota_awarded), 0)").Scan(&totalQuota)

	return map[string]interface{}{
		"total_quota":      totalQuota,      // 所有时间累计获得的额度
		"total_checkins":   totalCheckins,   // 所有时间累计签到次数
		"checkin_count":    len(records),    // 本月签到次数
		"checked_in_today": hasCheckedToday, // 今天是否已签到
		"records":          checkinRecords,  // 本月签到记录详情（不含id和user_id）
	}, nil
}

func maskCheckinLeaderboardName(value string) string {
	runes := []rune(strings.TrimSpace(value))
	if len(runes) == 0 {
		return "匿名用户"
	}
	if len(runes) == 1 {
		return string(runes[0]) + "*"
	}
	if len(runes) == 2 {
		return string(runes[0]) + "*"
	}
	return string(runes[0]) + strings.Repeat("*", len(runes)-2) + string(runes[len(runes)-1])
}

func normalizeCheckinPage(page int, pageSize int) (int, int) {
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

func GetCheckinLeaderboard(limit int) ([]CheckinLeaderboardItem, error) {
	if limit <= 0 {
		limit = 100
	}
	if limit > 1000 {
		limit = 1000
	}

	type checkinLeaderboardRow struct {
		DisplayName   string
		Username      string
		TotalCheckins int64
		TotalQuota    int64
	}

	rows := make([]checkinLeaderboardRow, 0, limit)
	err := DB.Model(&Checkin{}).
		Select(
			"users.display_name AS display_name",
			"users.username AS username",
			"COUNT(checkins.id) AS total_checkins",
			"COALESCE(SUM(checkins.quota_awarded), 0) AS total_quota",
		).
		Joins("LEFT JOIN users ON users.id = checkins.user_id").
		Where("users.deleted_at IS NULL").
		Group("checkins.user_id, users.display_name, users.username").
		Order("total_quota DESC, total_checkins DESC, checkins.user_id ASC").
		Limit(limit).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	items := make([]CheckinLeaderboardItem, 0, len(rows))
	for _, row := range rows {
		name := strings.TrimSpace(row.DisplayName)
		if name == "" {
			name = strings.TrimSpace(row.Username)
		}
		items = append(items, CheckinLeaderboardItem{
			DisplayName:   maskCheckinLeaderboardName(name),
			TotalCheckins: row.TotalCheckins,
			TotalQuota:    row.TotalQuota,
		})
	}
	return items, nil
}

func GetAdminCheckinRecords(page int, pageSize int, keyword string, userId int, startDate string, endDate string) ([]AdminCheckinRecord, int64, *AdminCheckinStats, error) {
	page, pageSize = normalizeCheckinPage(page, pageSize)

	baseQuery := DB.Model(&Checkin{}).
		Joins("LEFT JOIN users ON users.id = checkins.user_id")

	keyword = strings.TrimSpace(keyword)
	if keyword != "" {
		likeKeyword := "%" + keyword + "%"
		baseQuery = baseQuery.Where("users.username LIKE ? OR users.display_name LIKE ?", likeKeyword, likeKeyword)
	}
	if userId > 0 {
		baseQuery = baseQuery.Where("checkins.user_id = ?", userId)
	}
	if startDate != "" {
		baseQuery = baseQuery.Where("checkins.checkin_date >= ?", startDate)
	}
	if endDate != "" {
		baseQuery = baseQuery.Where("checkins.checkin_date <= ?", endDate)
	}

	var total int64
	if err := baseQuery.Count(&total).Error; err != nil {
		return nil, 0, nil, err
	}

	rows := make([]AdminCheckinRecord, 0, pageSize)
	err := baseQuery.
		Select(
			"checkins.id",
			"checkins.user_id",
			"users.username",
			"users.display_name",
			"checkins.checkin_date",
			"checkins.quota_awarded",
			"checkins.created_at",
		).
		Order("checkins.checkin_date DESC, checkins.id DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Scan(&rows).Error
	if err != nil {
		return nil, 0, nil, err
	}

	stats := &AdminCheckinStats{}
	if err := baseQuery.Count(&stats.TotalCheckins).Error; err != nil {
		return nil, 0, nil, err
	}
	if err := baseQuery.Distinct("checkins.user_id").Count(&stats.TotalUsers).Error; err != nil {
		return nil, 0, nil, err
	}
	if err := baseQuery.Select("COALESCE(SUM(checkins.quota_awarded), 0)").Scan(&stats.TotalQuota).Error; err != nil {
		return nil, 0, nil, err
	}

	today := time.Now().Format("2006-01-02")
	if err := baseQuery.Where("checkins.checkin_date = ?", today).Count(&stats.TodayCheckins).Error; err != nil {
		return nil, 0, nil, err
	}

	return rows, total, stats, nil
}
