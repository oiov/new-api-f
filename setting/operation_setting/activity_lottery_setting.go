package operation_setting

import (
	"strings"

	"github.com/QuantumNous/new-api/setting/config"
)

// ActivityLotterySetting 活动抽奖配置（全局）
type ActivityLotterySetting struct {
	Enabled                  bool    `json:"enabled"`                      // 是否启用活动抽奖
	DefaultMinParticipants   int     `json:"default_min_participants"`     // 默认最低参与人数
	DefaultWinnerCount       int     `json:"default_winner_count"`         // 默认中奖人数
	AutoDrawEnabled          bool    `json:"auto_draw_enabled"`            // 是否启用自动开奖任务
	JoinSources              string  `json:"join_sources"`                 // 允许参与方式（逗号分隔）：manual,checkin
	JoinTopupMinMoney        float64 `json:"join_topup_min_money"`         // 充值金额达到阈值自动参与（单位同 TopUp.Money）
	JoinDailyConsumeMinMoney float64 `json:"join_daily_consume_min_money"` // 今日消耗达到阈值自动参与（按 quota/QuotaPerUnit 换算）
}

var activityLotterySetting = ActivityLotterySetting{
	Enabled:                  false,
	DefaultMinParticipants:   200,
	DefaultWinnerCount:       3,
	AutoDrawEnabled:          true,
	JoinSources:              "manual",
	JoinTopupMinMoney:        0,
	JoinDailyConsumeMinMoney: 0,
}

func init() {
	config.GlobalConfig.Register("activity_lottery_setting", &activityLotterySetting)
}

func GetActivityLotterySetting() *ActivityLotterySetting {
	return &activityLotterySetting
}

func IsActivityLotteryEnabled() bool {
	return activityLotterySetting.Enabled
}

func NormalizeActivityLotteryJoinSources(raw string) string {
	parts := strings.Split(raw, ",")
	seen := make(map[string]struct{}, len(parts))
	normalized := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(strings.ToLower(part))
		if part == "" {
			continue
		}
		if part != "manual" && part != "checkin" && part != "topup" && part != "consume" {
			continue
		}
		if _, ok := seen[part]; ok {
			continue
		}
		seen[part] = struct{}{}
		normalized = append(normalized, part)
	}
	if len(normalized) == 0 {
		return "manual"
	}
	return strings.Join(normalized, ",")
}

func IsActivityLotteryJoinSourceEnabled(source string) bool {
	source = strings.TrimSpace(strings.ToLower(source))
	if source == "" {
		return false
	}
	normalized := NormalizeActivityLotteryJoinSources(activityLotterySetting.JoinSources)
	for _, part := range strings.Split(normalized, ",") {
		if strings.TrimSpace(part) == source {
			return true
		}
	}
	return false
}
