package common

func hasOptionKey(key string) bool {
	OptionMapRWMutex.RLock()
	defer OptionMapRWMutex.RUnlock()
	_, ok := OptionMap[key]
	return ok
}

func IsGitHubOAuthRegisterEnabled() bool {
	if hasOptionKey("GitHubOAuthRegisterEnabled") {
		return GitHubOAuthRegisterEnabled
	}
	return GitHubOAuthEnabled
}

func IsGoogleOAuthRegisterEnabled() bool {
	if hasOptionKey("GoogleOAuthRegisterEnabled") {
		return GoogleOAuthRegisterEnabled
	}
	return GoogleOAuthEnabled
}

func IsGoogleOAuthFlowEnabled() bool {
	return GoogleOAuthEnabled || IsGoogleOAuthRegisterEnabled()
}

func IsGitHubOAuthFlowEnabled() bool {
	return GitHubOAuthEnabled || IsGitHubOAuthRegisterEnabled()
}

func IsLinuxDOOAuthRegisterEnabled() bool {
	if hasOptionKey("LinuxDOOAuthRegisterEnabled") {
		return LinuxDOOAuthRegisterEnabled
	}
	return LinuxDOOAuthEnabled
}

func IsLinuxDOOAuthFlowEnabled() bool {
	return LinuxDOOAuthEnabled || IsLinuxDOOAuthRegisterEnabled()
}

func IsWeChatOAuthRegisterEnabled() bool {
	if hasOptionKey("WeChatRegisterEnabled") {
		return WeChatRegisterEnabled
	}
	return WeChatAuthEnabled
}

func IsWeChatOAuthFlowEnabled() bool {
	return WeChatAuthEnabled || IsWeChatOAuthRegisterEnabled()
}

func IsTelegramOAuthRegisterEnabled() bool {
	if hasOptionKey("TelegramOAuthRegisterEnabled") {
		return TelegramOAuthRegisterEnabled
	}
	return TelegramOAuthEnabled
}

func IsTelegramOAuthFlowEnabled() bool {
	return TelegramOAuthEnabled || IsTelegramOAuthRegisterEnabled()
}
