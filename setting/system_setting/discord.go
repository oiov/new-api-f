package system_setting

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
)

type DiscordSettings struct {
	Enabled         bool   `json:"enabled"`
	RegisterEnabled bool   `json:"register_enabled"`
	ClientId        string `json:"client_id"`
	ClientSecret    string `json:"client_secret"`
}

// 默认配置
var defaultDiscordSettings = DiscordSettings{}

func init() {
	// 注册到全局配置管理器
	config.GlobalConfig.Register("discord", &defaultDiscordSettings)
}

func GetDiscordSettings() *DiscordSettings {
	return &defaultDiscordSettings
}

func IsDiscordLoginEnabled() bool {
	return defaultDiscordSettings.Enabled
}

func IsDiscordRegisterEnabled() bool {
	common.OptionMapRWMutex.RLock()
	_, ok := common.OptionMap["discord.register_enabled"]
	common.OptionMapRWMutex.RUnlock()
	if ok {
		return defaultDiscordSettings.RegisterEnabled
	}
	return defaultDiscordSettings.Enabled
}

func IsDiscordOAuthEnabled() bool {
	return IsDiscordLoginEnabled() || IsDiscordRegisterEnabled()
}
