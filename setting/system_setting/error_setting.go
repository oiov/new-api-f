package system_setting

import "github.com/QuantumNous/new-api/setting/config"

type ErrorSetting struct {
	ShowSiteDomainInError                   bool     `json:"show_site_domain_in_error"`
	RestrictProxyDistribution               bool     `json:"restrict_proxy_distribution"`
	RestrictProxyDistributionLogOnly        bool     `json:"restrict_proxy_distribution_log_only"`
	RestrictProxyDistributionAllowedHosts   []string `json:"restrict_proxy_distribution_allowed_hosts"`
	RestrictProxyDistributionAllowedSources []string `json:"restrict_proxy_distribution_allowed_sources"`
	RestrictProxyDistributionBlockedMessage string   `json:"restrict_proxy_distribution_blocked_message"`
}

var defaultErrorSetting = ErrorSetting{
	ShowSiteDomainInError:                   true,
	RestrictProxyDistribution:               false,
	RestrictProxyDistributionLogOnly:        false,
	RestrictProxyDistributionAllowedHosts:   []string{"nbility.dev", "*.nbility.dev", "localhost", "127.0.0.1", "::1"},
	RestrictProxyDistributionAllowedSources: []string{"nbility.dev", "*.nbility.dev", "localhost", "127.0.0.1", "::1"},
	RestrictProxyDistributionBlockedMessage: "请勿使用反代等程序，请使用 https://nbility.dev 中转站，如需外接请联系。",
}

func init() {
	config.GlobalConfig.Register("error_setting", &defaultErrorSetting)
}

func GetErrorSetting() *ErrorSetting {
	return &defaultErrorSetting
}

func GetDefaultErrorSetting() ErrorSetting {
	return ErrorSetting{
		ShowSiteDomainInError:                   true,
		RestrictProxyDistribution:               false,
		RestrictProxyDistributionLogOnly:        false,
		RestrictProxyDistributionAllowedHosts:   []string{"nbility.dev", "*.nbility.dev", "localhost", "127.0.0.1", "::1"},
		RestrictProxyDistributionAllowedSources: []string{"nbility.dev", "*.nbility.dev", "localhost", "127.0.0.1", "::1"},
		RestrictProxyDistributionBlockedMessage: "请勿使用反代等程序，请使用 https://nbility.dev 中转站，如需外接请联系。",
	}
}
