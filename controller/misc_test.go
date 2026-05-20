package controller

import (
	"fmt"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/system_setting"
)

func TestBuildEmailVerificationContentIncludesCodeAndSafetyCopy(t *testing.T) {
	oldSystemName := common.SystemName
	defer func() {
		common.SystemName = oldSystemName
	}()
	common.SystemName = "Nbility"

	content := buildEmailVerificationContent("123456")

	for _, want := range []string{
		"Nbility",
		"123456",
		"验证码",
		fmt.Sprintf("%d 分钟内有效", common.VerificationValidMinutes),
		"如果不是你本人操作",
	} {
		if !strings.Contains(content, want) {
			t.Fatalf("expected verification template to contain %q, got %s", want, content)
		}
	}
}

func TestBuildPasswordResetContentIncludesLinkAndSafetyCopy(t *testing.T) {
	oldSystemName := common.SystemName
	defer func() {
		common.SystemName = oldSystemName
	}()
	common.SystemName = "Nbility"

	link := "https://example.com/user/reset?email=user@example.com&token=abc"
	content := buildPasswordResetContent(link)

	for _, want := range []string{
		"Nbility",
		"重置密码",
		link,
		fmt.Sprintf("%d 分钟内有效", common.VerificationValidMinutes),
		"如果不是你本人操作",
	} {
		if !strings.Contains(content, want) {
			t.Fatalf("expected password reset template to contain %q, got %s", want, content)
		}
	}
}

func TestBuildStatusOAuthFlagsLockedUsesRegisterOverrideOnlyWhenConfigured(t *testing.T) {
	origOptionMap := common.OptionMap
	origGoogleEnabled := common.GoogleOAuthEnabled
	origGoogleRegisterEnabled := common.GoogleOAuthRegisterEnabled
	origGitHubEnabled := common.GitHubOAuthEnabled
	origGitHubRegisterEnabled := common.GitHubOAuthRegisterEnabled
	origLinuxDOEnabled := common.LinuxDOOAuthEnabled
	origLinuxDORegisterEnabled := common.LinuxDOOAuthRegisterEnabled
	origWeChatEnabled := common.WeChatAuthEnabled
	origWeChatRegisterEnabled := common.WeChatRegisterEnabled
	origTelegramEnabled := common.TelegramOAuthEnabled
	origTelegramRegisterEnabled := common.TelegramOAuthRegisterEnabled

	discordSetting := system_setting.GetDiscordSettings()
	origDiscordEnabled := discordSetting.Enabled
	origDiscordRegisterEnabled := discordSetting.RegisterEnabled
	oidcSetting := system_setting.GetOIDCSettings()
	origOIDCEnabled := oidcSetting.Enabled
	origOIDCRegisterEnabled := oidcSetting.RegisterEnabled

	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = origOptionMap
		common.OptionMapRWMutex.Unlock()

		common.GoogleOAuthEnabled = origGoogleEnabled
		common.GoogleOAuthRegisterEnabled = origGoogleRegisterEnabled
		common.GitHubOAuthEnabled = origGitHubEnabled
		common.GitHubOAuthRegisterEnabled = origGitHubRegisterEnabled
		common.LinuxDOOAuthEnabled = origLinuxDOEnabled
		common.LinuxDOOAuthRegisterEnabled = origLinuxDORegisterEnabled
		common.WeChatAuthEnabled = origWeChatEnabled
		common.WeChatRegisterEnabled = origWeChatRegisterEnabled
		common.TelegramOAuthEnabled = origTelegramEnabled
		common.TelegramOAuthRegisterEnabled = origTelegramRegisterEnabled
		discordSetting.Enabled = origDiscordEnabled
		discordSetting.RegisterEnabled = origDiscordRegisterEnabled
		oidcSetting.Enabled = origOIDCEnabled
		oidcSetting.RegisterEnabled = origOIDCRegisterEnabled
	})

	common.GoogleOAuthEnabled = true
	common.GoogleOAuthRegisterEnabled = false
	common.GitHubOAuthEnabled = true
	common.GitHubOAuthRegisterEnabled = false
	common.LinuxDOOAuthEnabled = true
	common.LinuxDOOAuthRegisterEnabled = false
	common.WeChatAuthEnabled = true
	common.WeChatRegisterEnabled = false
	common.TelegramOAuthEnabled = true
	common.TelegramOAuthRegisterEnabled = false
	discordSetting.Enabled = true
	discordSetting.RegisterEnabled = false
	oidcSetting.Enabled = true
	oidcSetting.RegisterEnabled = false

	common.OptionMapRWMutex.Lock()
	common.OptionMap = map[string]string{}
	flags := buildStatusOAuthFlagsLocked()
	common.OptionMapRWMutex.Unlock()

	if !flags.GoogleRegister ||
		!flags.GitHubRegister ||
		!flags.LinuxDORegister ||
		!flags.WeChatRegister ||
		!flags.TelegramRegister ||
		!flags.DiscordRegister ||
		!flags.OIDCRegister {
		t.Fatalf("expected absent register options to fall back to login-enabled flags, got %+v", flags)
	}

	common.OptionMapRWMutex.Lock()
	common.OptionMap = map[string]string{
		"GoogleOAuthRegisterEnabled":   "false",
		"GitHubOAuthRegisterEnabled":   "false",
		"LinuxDOOAuthRegisterEnabled":  "false",
		"WeChatRegisterEnabled":        "false",
		"TelegramOAuthRegisterEnabled": "false",
		"discord.register_enabled":     "false",
		"oidc.register_enabled":        "false",
	}
	flags = buildStatusOAuthFlagsLocked()
	common.OptionMapRWMutex.Unlock()

	if flags.GoogleRegister ||
		flags.GitHubRegister ||
		flags.LinuxDORegister ||
		flags.WeChatRegister ||
		flags.TelegramRegister ||
		flags.DiscordRegister ||
		flags.OIDCRegister {
		t.Fatalf("expected configured register options to use register-specific flags, got %+v", flags)
	}
}
