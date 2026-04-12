package operation_setting

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/setting/config"
)

// CheckinSetting 签到功能配置
type CheckinSetting struct {
	Enabled          bool   `json:"enabled"`            // 是否启用签到功能
	MinQuota         int    `json:"min_quota"`          // 签到最小额度奖励
	MaxQuota         int    `json:"max_quota"`          // 签到最大额度奖励
	LeaderboardLimit int    `json:"leaderboard_limit"`  // 签到榜展示条数
	OpenWeekdays     string `json:"open_weekdays"`      // 允许签到的星期，格式：1,2,3,4,5
	OpenStartSeconds int    `json:"open_start_seconds"` // 每日开放开始秒数
	OpenEndSeconds   int    `json:"open_end_seconds"`   // 每日开放结束秒数
	DailyUserLimit   int    `json:"daily_user_limit"`   // 每日前 N 人可签到，0 表示不限
}

const (
	defaultCheckinOpenWeekdays     = "1,2,3,4,5"
	defaultCheckinOpenStartSeconds = 8 * 60 * 60
	defaultCheckinOpenEndSeconds   = 12 * 60 * 60
	defaultCheckinDailyUserLimit   = 20
)

// 默认配置
var checkinSetting = CheckinSetting{
	Enabled:          false,                           // 默认关闭
	MinQuota:         1000,                            // 默认最小额度 1000 (约 0.002 USD)
	MaxQuota:         10000,                           // 默认最大额度 10000 (约 0.02 USD)
	LeaderboardLimit: 100,                             // 默认展示前 100 名
	OpenWeekdays:     defaultCheckinOpenWeekdays,      // 默认周一到周五开放
	OpenStartSeconds: defaultCheckinOpenStartSeconds,  // 默认 08:00 开始
	OpenEndSeconds:   defaultCheckinOpenEndSeconds,    // 默认 12:00 结束
	DailyUserLimit:   defaultCheckinDailyUserLimit,    // 默认前 20 人可签到
}

func init() {
	// 注册到全局配置管理器
	config.GlobalConfig.Register("checkin_setting", &checkinSetting)
}

// GetCheckinSetting 获取签到配置
func GetCheckinSetting() *CheckinSetting {
	return &checkinSetting
}

// IsCheckinEnabled 是否启用签到功能
func IsCheckinEnabled() bool {
	return checkinSetting.Enabled
}

// GetCheckinQuotaRange 获取签到额度范围
func GetCheckinQuotaRange() (min, max int) {
	return checkinSetting.MinQuota, checkinSetting.MaxQuota
}

func NormalizeCheckinWeekdays(raw string) string {
	parts := strings.Split(raw, ",")
	seen := make(map[int]struct{}, 7)
	values := make([]int, 0, 7)
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		value, err := strconv.Atoi(part)
		if err != nil || value < 0 || value > 6 {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		values = append(values, value)
	}
	if len(values) == 0 {
		return defaultCheckinOpenWeekdays
	}
	sort.Ints(values)
	normalized := make([]string, 0, len(values))
	for _, value := range values {
		normalized = append(normalized, strconv.Itoa(value))
	}
	return strings.Join(normalized, ",")
}

func GetCheckinOpenWeekdays() []int {
	normalized := NormalizeCheckinWeekdays(checkinSetting.OpenWeekdays)
	parts := strings.Split(normalized, ",")
	values := make([]int, 0, len(parts))
	for _, part := range parts {
		value, err := strconv.Atoi(strings.TrimSpace(part))
		if err == nil {
			values = append(values, value)
		}
	}
	return values
}

func GetCheckinOpenStartSeconds() int {
	if checkinSetting.OpenStartSeconds < 0 || checkinSetting.OpenStartSeconds >= 24*60*60 {
		return defaultCheckinOpenStartSeconds
	}
	return checkinSetting.OpenStartSeconds
}

func GetCheckinOpenEndSeconds() int {
	if checkinSetting.OpenEndSeconds <= 0 || checkinSetting.OpenEndSeconds > 24*60*60 {
		return defaultCheckinOpenEndSeconds
	}
	return checkinSetting.OpenEndSeconds
}

func GetCheckinDailyUserLimit() int {
	if checkinSetting.DailyUserLimit < 0 {
		return defaultCheckinDailyUserLimit
	}
	return checkinSetting.DailyUserLimit
}

func IsCheckinWeekdayAllowed(now time.Time) bool {
	currentWeekday := int(now.Weekday())
	for _, weekday := range GetCheckinOpenWeekdays() {
		if weekday == currentWeekday {
			return true
		}
	}
	return false
}

func IsCheckinTimeAllowed(now time.Time) bool {
	currentSeconds := now.Hour()*3600 + now.Minute()*60 + now.Second()
	startSeconds := GetCheckinOpenStartSeconds()
	endSeconds := GetCheckinOpenEndSeconds()
	if startSeconds >= endSeconds {
		return false
	}
	return currentSeconds >= startSeconds && currentSeconds < endSeconds
}

func FormatCheckinTime(seconds int) string {
	if seconds < 0 {
		seconds = 0
	}
	if seconds > 24*60*60 {
		seconds = 24 * 60 * 60
	}
	hour := seconds / 3600
	minute := (seconds % 3600) / 60
	return fmt.Sprintf("%02d:%02d", hour, minute)
}
