package model

import (
	"crypto/rand"
	"errors"
	"math/big"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"gorm.io/gorm"
)

var checkinLocation = loadCheckinLocation()

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

type CheckinTodayRecord struct {
	DisplayName   string `json:"display_name"`
	QuotaAwarded  int    `json:"quota_awarded"`
	CreatedAt     int64  `json:"created_at"`
	CheckedInAt   string `json:"checked_in_at"`
	TotalCheckins int64  `json:"total_checkins"`
	TotalQuota    int64  `json:"total_quota"`
}

type CheckinLeaderboardPage struct {
	Items         []CheckinLeaderboardItem `json:"items"`
	TodayRecords  []CheckinTodayRecord     `json:"today_records"`
	Total         int64                    `json:"total"`
	Page          int                      `json:"page"`
	PageSize      int                      `json:"page_size"`
	Limit         int                      `json:"limit"`
	TodayCheckins int64                    `json:"today_checkins"`
	TodayQuota    int64                    `json:"today_quota"`
	TotalUsers    int64                    `json:"total_users"`
	TotalQuota    int64                    `json:"total_quota"`
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

type CheckinAvailability struct {
	AvailableNow     bool   `json:"available_now"`
	Reason           string `json:"reason"`
	TodayCheckins    int64  `json:"today_checkins"`
	DailyUserLimit   int    `json:"daily_user_limit"`
	RemainingSlots   int64  `json:"remaining_slots"`
	OpenWeekdays     []int  `json:"open_weekdays"`
	OpenStartSeconds int    `json:"open_start_seconds"`
	OpenEndSeconds   int    `json:"open_end_seconds"`
}

type UserCheckinOptions struct {
	Now                  *time.Time
	BypassTimeWindow     bool
	BypassDailyUserLimit bool
	Source               string
}

var checkinMutex sync.Mutex

func loadCheckinLocation() *time.Location {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return time.FixedZone("UTC+8", 8*3600)
	}
	return loc
}

func checkinNow() time.Time {
	if checkinLocation == nil {
		return time.Now()
	}
	return time.Now().In(checkinLocation)
}

func GetCheckinNow() time.Time {
	return checkinNow()
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
	today := checkinNow().Format("2006-01-02")
	return HasCheckedInOnDate(userId, today)
}

func HasCheckedInOnDate(userId int, checkinDate string) (bool, error) {
	var count int64
	err := DB.Model(&Checkin{}).
		Where("user_id = ? AND checkin_date = ?", userId, checkinDate).
		Count(&count).Error
	return count > 0, err
}

func GetTodayCheckinCount() (int64, error) {
	today := checkinNow().Format("2006-01-02")
	return GetCheckinCountByDate(today)
}

func GetCheckinCountByDate(checkinDate string) (int64, error) {
	var count int64
	err := DB.Model(&Checkin{}).
		Where("checkin_date = ?", checkinDate).
		Count(&count).Error
	return count, err
}

func GetCheckinAvailability(now time.Time) (*CheckinAvailability, error) {
	return GetCheckinAvailabilityWithOptions(now, UserCheckinOptions{})
}

func GetCheckinAvailabilityWithOptions(now time.Time, opts UserCheckinOptions) (*CheckinAvailability, error) {
	todayCheckins, err := GetCheckinCountByDate(now.Format("2006-01-02"))
	if err != nil {
		return nil, err
	}
	limit := operation_setting.GetCheckinDailyUserLimit()
	availability := &CheckinAvailability{
		AvailableNow:     true,
		Reason:           "ok",
		TodayCheckins:    todayCheckins,
		DailyUserLimit:   limit,
		RemainingSlots:   -1,
		OpenWeekdays:     operation_setting.GetCheckinOpenWeekdays(),
		OpenStartSeconds: operation_setting.GetCheckinOpenStartSeconds(),
		OpenEndSeconds:   operation_setting.GetCheckinOpenEndSeconds(),
	}
	if limit > 0 {
		availability.RemainingSlots = int64(limit) - todayCheckins
		if availability.RemainingSlots < 0 {
			availability.RemainingSlots = 0
		}
	}
	if !opts.BypassTimeWindow && !operation_setting.IsCheckinWeekdayAllowed(now) {
		availability.AvailableNow = false
		availability.Reason = "weekday_closed"
		return availability, nil
	}
	if !opts.BypassTimeWindow && !operation_setting.IsCheckinTimeAllowed(now) {
		availability.AvailableNow = false
		availability.Reason = "time_closed"
		return availability, nil
	}
	if !opts.BypassDailyUserLimit && limit > 0 && todayCheckins >= int64(limit) {
		availability.AvailableNow = false
		availability.Reason = "daily_limit_reached"
	}
	return availability, nil
}

func formatCheckinAvailabilitySummary(availability *CheckinAvailability) string {
	if availability == nil {
		return ""
	}
	weekdayLabels := map[int]string{
		0: "周日",
		1: "周一",
		2: "周二",
		3: "周三",
		4: "周四",
		5: "周五",
		6: "周六",
	}
	parts := make([]string, 0, 3)
	if len(availability.OpenWeekdays) > 0 {
		weekdays := make([]string, 0, len(availability.OpenWeekdays))
		for _, weekday := range availability.OpenWeekdays {
			if label, ok := weekdayLabels[weekday]; ok {
				weekdays = append(weekdays, label)
			}
		}
		if len(weekdays) > 0 {
			parts = append(parts, strings.Join(weekdays, "、"))
		}
	}
	if availability.OpenStartSeconds >= 0 && availability.OpenEndSeconds > 0 {
		parts = append(parts, operation_setting.FormatCheckinTime(availability.OpenStartSeconds)+"-"+operation_setting.FormatCheckinTime(availability.OpenEndSeconds))
	}
	return strings.Join(parts, "，")
}

func buildCheckinUnavailableError(availability *CheckinAvailability) error {
	schedule := formatCheckinAvailabilitySummary(availability)
	switch availability.Reason {
	case "weekday_closed", "time_closed":
		if schedule == "" {
			return errors.New("签到当前仅在指定开放时段内可用")
		}
		return errors.New("签到当前仅在指定开放时段内可用。开放规则：" + schedule)
	case "daily_limit_reached":
		return errors.New("今日签到已结束，请明日再试")
	default:
		return errors.New("当前暂不可签到")
	}
}

// UserCheckin 执行用户签到
// MySQL 和 PostgreSQL 使用事务保证原子性
// SQLite 不支持嵌套事务，使用顺序操作 + 手动回滚
func UserCheckin(userId int) (*Checkin, error) {
	return UserCheckinWithOptions(userId, UserCheckinOptions{})
}

// UserCheckinWithOptions 执行用户签到并允许后台任务按需绕过时间窗口/名额限制
func UserCheckinWithOptions(userId int, opts UserCheckinOptions) (*Checkin, error) {
	setting := operation_setting.GetCheckinSetting()
	if !setting.Enabled {
		return nil, errors.New("签到功能未启用")
	}
	if _, err := GetUserById(userId, false); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("用户不存在")
		}
		return nil, err
	}

	checkinMutex.Lock()
	defer checkinMutex.Unlock()

	now := checkinNow()
	if opts.Now != nil {
		now = opts.Now.In(checkinLocation)
	}
	availability, err := GetCheckinAvailabilityWithOptions(now, opts)
	if err != nil {
		return nil, err
	}
	if !availability.AvailableNow {
		return nil, buildCheckinUnavailableError(availability)
	}

	// 检查今天是否已签到
	today := now.Format("2006-01-02")
	hasChecked, err := HasCheckedInOnDate(userId, today)
	if err != nil {
		return nil, err
	}
	if hasChecked {
		return nil, errors.New("今日已签到")
	}

	// 计算随机额度奖励
	quotaAwarded := setting.MinQuota
	if setting.MaxQuota > setting.MinQuota {
		quotaAwarded = setting.MinQuota + secureRandInt(setting.MaxQuota-setting.MinQuota+1)
	}

	checkin := &Checkin{
		UserId:       userId,
		CheckinDate:  today,
		QuotaAwarded: quotaAwarded,
		CreatedAt:    now.Unix(),
	}

	var record *Checkin
	// 根据数据库类型选择不同的策略
	if common.UsingSQLite {
		// SQLite 不支持嵌套事务，使用顺序操作 + 手动回滚
		record, err = userCheckinWithoutTransaction(checkin, userId, quotaAwarded)
	} else {
		// MySQL 和 PostgreSQL 支持事务，使用事务保证原子性
		record, err = userCheckinWithTransaction(checkin, userId, quotaAwarded)
	}
	if err != nil {
		return nil, err
	}

	// 签到抽奖报名不影响签到主流程（失败不回滚）
	if strings.TrimSpace(opts.Source) != "auto_job" {
		go func() {
			// 可选参与动作：签到参与活动抽奖
			_ = EnsureActivityLotteryEntry(userId, "checkin", now)
		}()
	}

	return record, nil
}

func secureRandInt(maxExclusive int) int {
	if maxExclusive <= 1 {
		return 0
	}
	nBig, err := rand.Int(rand.Reader, big.NewInt(int64(maxExclusive)))
	if err != nil {
		return int(time.Now().UnixNano() % int64(maxExclusive))
	}
	return int(nBig.Int64())
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
		result := tx.Model(&User{}).Where("id = ?", userId).
			Update("quota", gorm.Expr("quota + ?", quotaAwarded))
		if result.Error != nil {
			return errors.New("签到失败：更新额度出错")
		}
		if result.RowsAffected != 1 {
			return errors.New("签到失败：用户不存在")
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

func GetCheckinLeaderboard(page int, pageSize int, limit int) (*CheckinLeaderboardPage, error) {
	if limit <= 0 {
		limit = 100
	}
	if limit > 1000 {
		limit = 1000
	}
	page, pageSize = normalizeCheckinPage(page, pageSize)
	if pageSize > limit {
		pageSize = limit
	}

	type checkinLeaderboardRow struct {
		DisplayName   string
		Username      string
		TotalCheckins int64
		TotalQuota    int64
	}

	baseQuery := DB.Model(&Checkin{}).
		Joins("LEFT JOIN users ON users.id = checkins.user_id").
		Where("users.deleted_at IS NULL")

	var totalUsers int64
	if err := baseQuery.Session(&gorm.Session{}).
		Distinct("checkins.user_id").
		Count(&totalUsers).Error; err != nil {
		return nil, err
	}
	total := totalUsers
	if total > int64(limit) {
		total = int64(limit)
	}

	pageData := &CheckinLeaderboardPage{
		Items:        make([]CheckinLeaderboardItem, 0),
		TodayRecords: make([]CheckinTodayRecord, 0),
		Total:        total,
		Page:         page,
		PageSize:     pageSize,
		Limit:        limit,
		TotalUsers:   totalUsers,
	}

	if err := baseQuery.Session(&gorm.Session{}).
		Select("COALESCE(SUM(checkins.quota_awarded), 0)").
		Scan(&pageData.TotalQuota).Error; err != nil {
		return nil, err
	}

	today := checkinNow().Format("2006-01-02")
	todayQuery := baseQuery.Session(&gorm.Session{}).
		Where("checkins.checkin_date = ?", today)

	if err := todayQuery.Count(&pageData.TodayCheckins).Error; err != nil {
		return nil, err
	}
	if err := todayQuery.Session(&gorm.Session{}).
		Select("COALESCE(SUM(checkins.quota_awarded), 0)").
		Scan(&pageData.TodayQuota).Error; err != nil {
		return nil, err
	}

	type checkinTodayRecordRow struct {
		DisplayName   string
		Username      string
		QuotaAwarded  int
		CreatedAt     int64
		TotalCheckins int64
		TotalQuota    int64
	}
	todayRows := make([]checkinTodayRecordRow, 0, 20)
	if err := todayQuery.Session(&gorm.Session{}).
		Select(
			"users.display_name AS display_name",
			"users.username AS username",
			"checkins.quota_awarded AS quota_awarded",
			"checkins.created_at AS created_at",
			"(SELECT COUNT(*) FROM checkins history_checkins WHERE history_checkins.user_id = checkins.user_id) AS total_checkins",
			"(SELECT COALESCE(SUM(history_checkins.quota_awarded), 0) FROM checkins history_checkins WHERE history_checkins.user_id = checkins.user_id) AS total_quota",
		).
		Order("checkins.created_at DESC, checkins.id DESC").
		Limit(20).
		Scan(&todayRows).Error; err != nil {
		return nil, err
	}
	for _, row := range todayRows {
		name := strings.TrimSpace(row.DisplayName)
		if name == "" {
			name = strings.TrimSpace(row.Username)
		}
		checkedInAt := ""
		if row.CreatedAt > 0 {
			checkedInAt = time.Unix(row.CreatedAt, 0).In(checkinLocation).Format("15:04:05")
		}
		pageData.TodayRecords = append(pageData.TodayRecords, CheckinTodayRecord{
			DisplayName:   maskCheckinLeaderboardName(name),
			QuotaAwarded:  row.QuotaAwarded,
			CreatedAt:     row.CreatedAt,
			CheckedInAt:   checkedInAt,
			TotalCheckins: row.TotalCheckins,
			TotalQuota:    row.TotalQuota,
		})
	}

	if total == 0 {
		return pageData, nil
	}

	offset := (page - 1) * pageSize
	if int64(offset) >= total {
		return pageData, nil
	}

	queryLimit := pageSize
	remaining := int(total) - offset
	if remaining < queryLimit {
		queryLimit = remaining
	}

	rows := make([]checkinLeaderboardRow, 0, queryLimit)
	err := baseQuery.Session(&gorm.Session{}).
		Select(
			"users.display_name AS display_name",
			"users.username AS username",
			"COUNT(checkins.id) AS total_checkins",
			"COALESCE(SUM(checkins.quota_awarded), 0) AS total_quota",
		).
		Group("checkins.user_id, users.display_name, users.username").
		Order("total_quota DESC, total_checkins DESC, checkins.user_id ASC").
		Offset(offset).
		Limit(queryLimit).
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
	pageData.Items = items
	return pageData, nil
}

func GetAdminCheckinRecords(page int, pageSize int, keyword string, userId int, startDate string, endDate string) ([]AdminCheckinRecord, int64, *AdminCheckinStats, error) {
	page, pageSize = normalizeCheckinPage(page, pageSize)

	baseQuery := buildAdminCheckinRecordsQuery(keyword, userId, startDate, endDate)

	var total int64
	if err := baseQuery.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		return nil, 0, nil, err
	}

	rows := make([]AdminCheckinRecord, 0, pageSize)
	err := baseQuery.Session(&gorm.Session{}).
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
	if err := baseQuery.Session(&gorm.Session{}).Count(&stats.TotalCheckins).Error; err != nil {
		return nil, 0, nil, err
	}
	if err := baseQuery.Session(&gorm.Session{}).Distinct("checkins.user_id").Count(&stats.TotalUsers).Error; err != nil {
		return nil, 0, nil, err
	}
	if err := baseQuery.Session(&gorm.Session{}).Select("COALESCE(SUM(checkins.quota_awarded), 0)").Scan(&stats.TotalQuota).Error; err != nil {
		return nil, 0, nil, err
	}

	today := time.Now().Format("2006-01-02")
	if err := buildAdminCheckinRecordsQuery(keyword, userId, startDate, endDate).
		Where("checkins.checkin_date = ?", today).
		Count(&stats.TodayCheckins).Error; err != nil {
		return nil, 0, nil, err
	}

	return rows, total, stats, nil
}

func buildAdminCheckinRecordsQuery(keyword string, userId int, startDate string, endDate string) *gorm.DB {
	query := DB.Model(&Checkin{}).
		Joins("LEFT JOIN users ON users.id = checkins.user_id")

	keyword = strings.TrimSpace(keyword)
	if keyword != "" {
		likeKeyword := "%" + keyword + "%"
		query = query.Where("users.username LIKE ? OR users.display_name LIKE ?", likeKeyword, likeKeyword)
	}
	if userId > 0 {
		query = query.Where("checkins.user_id = ?", userId)
	}
	if startDate != "" {
		query = query.Where("checkins.checkin_date >= ?", startDate)
	}
	if endDate != "" {
		query = query.Where("checkins.checkin_date <= ?", endDate)
	}

	return query
}
