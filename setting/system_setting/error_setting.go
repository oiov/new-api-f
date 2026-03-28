package system_setting

import "github.com/QuantumNous/new-api/setting/config"

type ErrorSetting struct {
	ShowSiteDomainInError     bool `json:"show_site_domain_in_error"`
	RestrictProxyDistribution bool `json:"restrict_proxy_distribution"`
}

var defaultErrorSetting = ErrorSetting{
	ShowSiteDomainInError:     true,
	RestrictProxyDistribution: false,
}

func init() {
	config.GlobalConfig.Register("error_setting", &defaultErrorSetting)
}

func GetErrorSetting() *ErrorSetting {
	return &defaultErrorSetting
}
