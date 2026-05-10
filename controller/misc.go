package controller

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/oauth"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/console_setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"

	"github.com/gin-gonic/gin"
)

func TestStatus(c *gin.Context) {
	err := model.PingDB()
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"success": false,
			"message": "数据库连接失败",
		})
		return
	}
	// 获取HTTP统计信息
	httpStats := middleware.GetStats()
	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"message":    "Server is running",
		"http_stats": httpStats,
	})
	return
}

func GetStatus(c *gin.Context) {

	cs := console_setting.GetConsoleSetting()
	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()

	passkeySetting := system_setting.GetPasskeySettings()
	legalSetting := system_setting.GetLegalSettings()
	checkinSetting := operation_setting.GetCheckinSetting()
	activityLotterySetting := operation_setting.GetActivityLotterySetting()

	data := gin.H{
		"version":                     common.Version,
		"start_time":                  common.StartTime,
		"password_login_enabled":      common.PasswordLoginEnabled,
		"password_register_enabled":   common.PasswordRegisterEnabled,
		"register_enabled":            common.RegisterEnabled,
		"email_verification":          common.EmailVerificationEnabled,
		"google_oauth":                common.GoogleOAuthEnabled,
		"google_oauth_register":       common.IsGoogleOAuthRegisterEnabled(),
		"google_client_id":            common.GoogleClientId,
		"github_oauth":                common.GitHubOAuthEnabled,
		"github_oauth_register":       common.IsGitHubOAuthRegisterEnabled(),
		"github_client_id":            common.GitHubClientId,
		"discord_oauth":               system_setting.IsDiscordLoginEnabled(),
		"discord_oauth_register":      system_setting.IsDiscordRegisterEnabled(),
		"discord_client_id":           system_setting.GetDiscordSettings().ClientId,
		"linuxdo_oauth":               common.LinuxDOOAuthEnabled,
		"linuxdo_oauth_register":      common.IsLinuxDOOAuthRegisterEnabled(),
		"linuxdo_client_id":           common.LinuxDOClientId,
		"linuxdo_minimum_trust_level": common.LinuxDOMinimumTrustLevel,
		"telegram_oauth":              common.TelegramOAuthEnabled,
		"telegram_oauth_register":     common.IsTelegramOAuthRegisterEnabled(),
		"telegram_bot_name":           common.TelegramBotName,
		"system_name":                 common.SystemName,
		"logo":                        common.Logo,
		"footer_html":                 common.Footer,
		"wechat_qrcode":               common.WeChatAccountQRCodeImageURL,
		"wechat_login":                common.WeChatAuthEnabled,
		"wechat_register":             common.IsWeChatOAuthRegisterEnabled(),
		"server_address":              system_setting.ServerAddress,
		"turnstile_check":             common.TurnstileCheckEnabled,
		"turnstile_site_key":          common.TurnstileSiteKey,
		"invite_register_enabled":     common.InviteRegisterEnabled,
		"top_up_link":                 common.TopUpLink,
		"docs_link":                   operation_setting.GetGeneralSetting().DocsLink,
		"quota_per_unit":              common.QuotaPerUnit,
		// 兼容旧前端：保留 display_in_currency，同时提供新的 quota_display_type
		"display_in_currency":           operation_setting.IsCurrencyDisplay(),
		"quota_display_type":            operation_setting.GetQuotaDisplayType(),
		"custom_currency_symbol":        operation_setting.GetGeneralSetting().CustomCurrencySymbol,
		"custom_currency_exchange_rate": operation_setting.GetGeneralSetting().CustomCurrencyExchangeRate,
		"enable_batch_update":           common.BatchUpdateEnabled,
		"enable_drawing":                common.DrawingEnabled,
		"enable_task":                   common.TaskEnabled,
		"enable_data_export":            common.DataExportEnabled,
		"enable_log_export":             common.LogExportEnabled,
		"data_export_default_time":      common.DataExportDefaultTime,
		"default_collapse_sidebar":      common.DefaultCollapseSidebar,
		"mj_notify_enabled":             setting.MjNotifyEnabled,
		"chats":                         setting.Chats,
		"demo_site_enabled":             operation_setting.DemoSiteEnabled,
		"self_use_mode_enabled":         operation_setting.SelfUseModeEnabled,
		"default_use_auto_group":        setting.DefaultUseAutoGroup,

		"usd_exchange_rate": operation_setting.USDExchangeRate,
		"price":             operation_setting.Price,
		"stripe_unit_price": setting.StripeUnitPrice,

		// 面板启用开关
		"api_info_enabled":      cs.ApiInfoEnabled,
		"uptime_kuma_enabled":   cs.UptimeKumaEnabled,
		"announcements_enabled": cs.AnnouncementsEnabled,
		"faq_enabled":           cs.FAQEnabled,
		"contact_channels":      console_setting.GetContactChannels(),

		// 控制台购买引导横幅
		"subscription_promo_enabled":     cs.SubscriptionPromoEnabled,
		"subscription_promo_badge_left":  cs.SubscriptionPromoBadgeLeft,
		"subscription_promo_badge_right": cs.SubscriptionPromoBadgeRight,
		"subscription_promo_title":       cs.SubscriptionPromoTitle,
		"subscription_promo_subtitle":    cs.SubscriptionPromoSubtitle,
		"subscription_promo_button_text": cs.SubscriptionPromoButtonText,
		"subscription_promo_button_link": cs.SubscriptionPromoButtonLink,

		// 模块管理配置
		"HeaderNavModules":                          common.OptionMap["HeaderNavModules"],
		"SidebarModulesAdmin":                       common.OptionMap["SidebarModulesAdmin"],
		"SubscriptionRefundSettings":                common.OptionMap["SubscriptionRefundSettings"],
		"SelfServiceSubscriptionConversionCampaign": common.OptionMap["SelfServiceSubscriptionConversionCampaign"],

		"oidc_enabled":                                  system_setting.IsOIDCLoginEnabled(),
		"oidc_register_enabled":                         system_setting.IsOIDCRegisterEnabled(),
		"oidc_client_id":                                system_setting.GetOIDCSettings().ClientId,
		"oidc_authorization_endpoint":                   system_setting.GetOIDCSettings().AuthorizationEndpoint,
		"passkey_login":                                 passkeySetting.Enabled,
		"passkey_display_name":                          passkeySetting.RPDisplayName,
		"passkey_rp_id":                                 passkeySetting.RPID,
		"passkey_origins":                               passkeySetting.Origins,
		"passkey_allow_insecure":                        passkeySetting.AllowInsecureOrigin,
		"passkey_user_verification":                     passkeySetting.UserVerification,
		"passkey_attachment":                            passkeySetting.AttachmentPreference,
		"setup":                                         constant.Setup,
		"user_agreement_enabled":                        legalSetting.UserAgreement != "",
		"privacy_policy_enabled":                        legalSetting.PrivacyPolicy != "",
		"checkin_enabled":                               checkinSetting.Enabled,
		"activity_lottery_enabled":                      activityLotterySetting.Enabled,
		"activity_lottery_auto_draw_enabled":            activityLotterySetting.AutoDrawEnabled,
		"activity_lottery_default_min_participants":     activityLotterySetting.DefaultMinParticipants,
		"activity_lottery_default_winner_count":         activityLotterySetting.DefaultWinnerCount,
		"activity_lottery_join_sources":                 activityLotterySetting.JoinSources,
		"activity_lottery_join_topup_min_money":         activityLotterySetting.JoinTopupMinMoney,
		"activity_lottery_join_daily_consume_min_money": activityLotterySetting.JoinDailyConsumeMinMoney,
		"checkin_setting.open_weekdays":                 checkinSetting.OpenWeekdays,
		"checkin_setting.open_start_seconds":            checkinSetting.OpenStartSeconds,
		"checkin_setting.open_end_seconds":              checkinSetting.OpenEndSeconds,
		"checkin_setting.daily_user_limit":              checkinSetting.DailyUserLimit,
		"_qn":                                           "new-api",
	}

	if rawDefaults := strings.TrimSpace(common.OptionMap["console_setting.ccswitch_defaults"]); rawDefaults != "" {
		var payload any
		if err := common.UnmarshalJsonStr(rawDefaults, &payload); err == nil {
			data["ccswitch_defaults"] = payload
		}
	}
	data["token_test_defaults"] = gin.H{
		"mode":            "both",
		"claude_model":    strings.TrimSpace(common.OptionMap["TokenTestDefaultClaudeModel"]),
		"responses_model": strings.TrimSpace(common.OptionMap["TokenTestDefaultResponsesModel"]),
	}
	if rawDefaults := strings.TrimSpace(common.OptionMap["console_setting.token_test_defaults_by_group"]); rawDefaults != "" {
		var payload any
		if err := common.UnmarshalJsonStr(rawDefaults, &payload); err == nil {
			data["token_test_defaults_by_group"] = payload
		}
	}

	// 根据启用状态注入可选内容
	if cs.ApiInfoEnabled {
		data["api_info"] = console_setting.GetApiInfo()
	}
	if cs.AnnouncementsEnabled {
		data["announcements"] = console_setting.GetAnnouncements()
	}
	if cs.FAQEnabled {
		data["faq"] = console_setting.GetFAQ()
	}

	// Add enabled custom OAuth providers
	customProviders := oauth.GetEnabledCustomProviders()
	if len(customProviders) > 0 {
		type CustomOAuthInfo struct {
			Id                    int    `json:"id"`
			Name                  string `json:"name"`
			Slug                  string `json:"slug"`
			Icon                  string `json:"icon"`
			ClientId              string `json:"client_id"`
			AuthorizationEndpoint string `json:"authorization_endpoint"`
			Scopes                string `json:"scopes"`
		}
		providersInfo := make([]CustomOAuthInfo, 0, len(customProviders))
		for _, p := range customProviders {
			config := p.GetConfig()
			providersInfo = append(providersInfo, CustomOAuthInfo{
				Id:                    config.Id,
				Name:                  config.Name,
				Slug:                  config.Slug,
				Icon:                  config.Icon,
				ClientId:              config.ClientId,
				AuthorizationEndpoint: config.AuthorizationEndpoint,
				Scopes:                config.Scopes,
			})
		}
		data["custom_oauth_providers"] = providersInfo
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    data,
	})
	return
}

func GetNotice(c *gin.Context) {
	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    common.OptionMap["Notice"],
	})
	return
}

func GetAbout(c *gin.Context) {
	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    common.OptionMap["About"],
	})
	return
}

func GetUserAgreement(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    system_setting.GetLegalSettings().UserAgreement,
	})
	return
}

func GetPrivacyPolicy(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    system_setting.GetLegalSettings().PrivacyPolicy,
	})
	return
}

func GetMidjourney(c *gin.Context) {
	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    common.OptionMap["Midjourney"],
	})
	return
}

func GetHomePageContent(c *gin.Context) {
	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    common.OptionMap["HomePageContent"],
	})
	return
}

func SendEmailVerification(c *gin.Context) {
	email := c.Query("email")
	if err := common.Validate.Var(email, "required,email"); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "无效的参数",
		})
		return
	}
	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "无效的邮箱地址",
		})
		return
	}
	localPart := parts[0]
	domainPart := parts[1]
	if common.EmailDomainRestrictionEnabled {
		allowed := false
		for _, domain := range common.EmailDomainWhitelist {
			if domainPart == domain {
				allowed = true
				break
			}
		}
		if !allowed {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "The administrator has enabled the email domain name whitelist, and your email address is not allowed due to special symbols or it's not in the whitelist.",
			})
			return
		}
	}
	if common.EmailAliasRestrictionEnabled {
		containsSpecialSymbols := strings.Contains(localPart, "+") || strings.Contains(localPart, ".")
		if containsSpecialSymbols {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "管理员已启用邮箱地址别名限制，您的邮箱地址由于包含特殊符号而被拒绝。",
			})
			return
		}
	}

	if model.IsEmailAlreadyTaken(email) {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "邮箱地址已被占用",
		})
		return
	}
	code := common.GenerateVerificationCode(6)
	common.RegisterVerificationCodeWithKey(email, code, common.EmailVerificationPurpose)
	subject := fmt.Sprintf("%s邮箱验证邮件", common.SystemName)
	content := buildEmailVerificationContent(code)
	err := common.SendEmail(subject, email, content)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
	return
}

func SendPasswordResetEmail(c *gin.Context) {
	email := c.Query("email")
	if err := common.Validate.Var(email, "required,email"); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "无效的参数",
		})
		return
	}
	if !model.IsEmailAlreadyTaken(email) {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "该邮箱地址未注册",
		})
		return
	}
	code := common.GenerateVerificationCode(0)
	common.RegisterVerificationCodeWithKey(email, code, common.PasswordResetPurpose)
	link := fmt.Sprintf("%s/user/reset?email=%s&token=%s", system_setting.ServerAddress, email, code)
	subject := fmt.Sprintf("%s密码重置", common.SystemName)
	content := buildPasswordResetContent(link)
	err := common.SendEmail(subject, email, content)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
	return
}

func buildEmailVerificationContent(code string) string {
	return buildAuthEmailContent(
		"邮箱验证",
		"你正在注册或绑定邮箱，请在页面中输入下面的验证码完成验证。",
		fmt.Sprintf(`<div style="font-size:32px;font-weight:700;letter-spacing:6px;color:#111827;margin:14px 0 8px;">%s</div>`, code),
		"验证码",
	)
}

func buildPasswordResetContent(link string) string {
	return buildAuthEmailContent(
		"重置密码",
		"你正在重置账户密码。点击下面的按钮继续操作。",
		fmt.Sprintf(`<p style="margin:18px 0;"><a href="%s" style="display:inline-block;padding:10px 18px;border-radius:6px;background:#111827;color:#ffffff;text-decoration:none;font-weight:600;">重置密码</a></p><p style="margin:14px 0 0;color:#4b5563;font-size:13px;line-height:1.7;">如果按钮无法打开，请复制以下链接到浏览器：<br><span style="word-break:break-all;color:#2563eb;">%s</span></p>`, link, link),
		"重置链接",
	)
}

func buildAuthEmailContent(title string, intro string, actionHTML string, expiryTarget string) string {
	return fmt.Sprintf(`<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:28px 16px;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:28px;">
      <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">%s</p>
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.35;color:#111827;">%s</h1>
      <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">%s</p>
      %s
      <p style="margin:18px 0 0;color:#374151;font-size:14px;line-height:1.7;">%s %d 分钟内有效。为了账户安全，请不要将邮件内容转发给他人。</p>
      <p style="margin:12px 0 0;color:#6b7280;font-size:13px;line-height:1.7;">如果不是你本人操作，可以忽略这封邮件。</p>
    </div>
  </div>
</body>
</html>`, common.SystemName, title, intro, actionHTML, expiryTarget, common.VerificationValidMinutes)
}

type PasswordResetRequest struct {
	Email string `json:"email"`
	Token string `json:"token"`
}

func ResetPassword(c *gin.Context) {
	var req PasswordResetRequest
	err := json.NewDecoder(c.Request.Body).Decode(&req)
	if req.Email == "" || req.Token == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "无效的参数",
		})
		return
	}
	if !common.VerifyCodeWithKey(req.Email, req.Token, common.PasswordResetPurpose) {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "重置链接非法或已过期",
		})
		return
	}
	password := common.GenerateVerificationCode(12)
	err = model.ResetUserPasswordByEmail(req.Email, password)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.DeleteKey(req.Email, common.PasswordResetPurpose)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    password,
	})
	return
}
