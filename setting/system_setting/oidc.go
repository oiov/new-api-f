package system_setting

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
)

type OIDCSettings struct {
	Enabled               bool   `json:"enabled"`
	RegisterEnabled       bool   `json:"register_enabled"`
	ClientId              string `json:"client_id"`
	ClientSecret          string `json:"client_secret"`
	WellKnown             string `json:"well_known"`
	AuthorizationEndpoint string `json:"authorization_endpoint"`
	TokenEndpoint         string `json:"token_endpoint"`
	UserInfoEndpoint      string `json:"user_info_endpoint"`
}

// 默认配置
var defaultOIDCSettings = OIDCSettings{}

func init() {
	// 注册到全局配置管理器
	config.GlobalConfig.Register("oidc", &defaultOIDCSettings)
}

func GetOIDCSettings() *OIDCSettings {
	return &defaultOIDCSettings
}

func IsOIDCLoginEnabled() bool {
	return defaultOIDCSettings.Enabled
}

func IsOIDCRegisterEnabled() bool {
	common.OptionMapRWMutex.RLock()
	_, ok := common.OptionMap["oidc.register_enabled"]
	common.OptionMapRWMutex.RUnlock()
	if ok {
		return defaultOIDCSettings.RegisterEnabled
	}
	return defaultOIDCSettings.Enabled
}

func IsOIDCOAuthEnabled() bool {
	return IsOIDCLoginEnabled() || IsOIDCRegisterEnabled()
}
