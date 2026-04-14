package console_setting

import "github.com/QuantumNous/new-api/setting/config"

type ConsoleSetting struct {
	ApiInfo              string `json:"api_info"`              // 控制台 API 信息 (JSON 数组字符串)
	UptimeKumaGroups     string `json:"uptime_kuma_groups"`    // Uptime Kuma 分组配置 (JSON 数组字符串)
	Announcements        string `json:"announcements"`         // 系统公告 (JSON 数组字符串)
	FAQ                  string `json:"faq"`                   // 常见问题 (JSON 数组字符串)
	ContactChannels      string `json:"contact_channels"`      // 联系页面渠道配置 (JSON 数组字符串)
	ApiInfoEnabled       bool   `json:"api_info_enabled"`      // 是否启用 API 信息面板
	UptimeKumaEnabled    bool   `json:"uptime_kuma_enabled"`   // 是否启用 Uptime Kuma 面板
	AnnouncementsEnabled bool   `json:"announcements_enabled"` // 是否启用系统公告面板
	FAQEnabled           bool   `json:"faq_enabled"`           // 是否启用常见问答面板

	// 控制台购买引导横幅（用于 /console 首页等位置）
	SubscriptionPromoEnabled    bool   `json:"subscription_promo_enabled"`     // 是否启用购买引导横幅
	SubscriptionPromoBadgeLeft  string `json:"subscription_promo_badge_left"`  // 左侧徽标文案
	SubscriptionPromoBadgeRight string `json:"subscription_promo_badge_right"` // 右侧徽标文案
	SubscriptionPromoTitle      string `json:"subscription_promo_title"`       // 主标题
	SubscriptionPromoSubtitle   string `json:"subscription_promo_subtitle"`    // 副标题/说明
	SubscriptionPromoButtonText string `json:"subscription_promo_button_text"` // 按钮文案
	SubscriptionPromoButtonLink string `json:"subscription_promo_button_link"` // 按钮跳转链接（支持 /path 或 https://）
}

// 默认配置
var defaultConsoleSetting = ConsoleSetting{
	ApiInfo:              "",
	UptimeKumaGroups:     "",
	Announcements:        "",
	FAQ:                  "",
	ContactChannels:      "",
	ApiInfoEnabled:       true,
	UptimeKumaEnabled:    true,
	AnnouncementsEnabled: true,
	FAQEnabled:           true,

	SubscriptionPromoEnabled:    true,
	SubscriptionPromoBadgeLeft:  "",
	SubscriptionPromoBadgeRight: "",
	SubscriptionPromoTitle:      "",
	SubscriptionPromoSubtitle:   "",
	SubscriptionPromoButtonText: "",
	SubscriptionPromoButtonLink: "",
}

// 全局实例
var consoleSetting = defaultConsoleSetting

func init() {
	// 注册到全局配置管理器，键名为 console_setting
	config.GlobalConfig.Register("console_setting", &consoleSetting)
}

// GetConsoleSetting 获取 ConsoleSetting 配置实例
func GetConsoleSetting() *ConsoleSetting {
	return &consoleSetting
}
