package service

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
)

type TokenRotationNotifyResult struct {
	SiteSent   bool
	SiteError  string
	EventSent  bool
	EventError string
	Title      string
	Content    string
}

func buildTokenRotationNotificationContent(tokenName string, isSubscriptionAccess bool) (string, string, string, string) {
	tokenName = strings.TrimSpace(tokenName)
	siteTitle := "管理员已重置你的 API 令牌"
	siteContent := fmt.Sprintf(
		"你的令牌 <strong>%s</strong> 已被管理员重置，旧令牌已立即失效。请前往令牌页面获取并替换新的令牌。",
		tokenName,
	)
	plainContent := fmt.Sprintf(
		"你的令牌 %s 已被管理员重置，旧令牌已立即失效。请前往令牌页面获取并替换新的令牌。",
		tokenName,
	)
	level := "warning"
	if isSubscriptionAccess {
		siteTitle = "管理员已重新签发你的 Subscription Access 令牌"
		siteContent = "你的 Subscription Access 令牌已被管理员重新签发，旧令牌已立即失效。请前往订阅页面查看并复制新的访问令牌。"
		plainContent = "你的 Subscription Access 令牌已被管理员重新签发，旧令牌已立即失效。请前往订阅页面查看并复制新的访问令牌。"
		level = "success"
	}
	return siteTitle, siteContent, plainContent, level
}

func SendTokenRotationNotification(user *model.User, senderUserId int, tokenName string, isSubscriptionAccess bool) TokenRotationNotifyResult {
	result := TokenRotationNotifyResult{}
	if user == nil || user.Id <= 0 {
		result.SiteError = "invalid user"
		result.EventError = "invalid user"
		return result
	}

	title, siteContent, plainContent, level := buildTokenRotationNotificationContent(tokenName, isSubscriptionAccess)
	result.Title = title
	result.Content = plainContent

	if _, err := SendSiteNotificationToUser(user, senderUserId, title, siteContent, level, false); err != nil {
		result.SiteError = err.Error()
	} else {
		result.SiteSent = true
	}

	notify := dto.NewNotify(dto.NotifyTypeTokenRotated, title, plainContent, nil)
	if err := NotifyUser(user.Id, user.Email, user.GetSetting(), notify); err != nil {
		result.EventError = err.Error()
	} else {
		result.EventSent = true
	}
	return result
}
