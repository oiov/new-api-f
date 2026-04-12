package controller

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

type SendSiteNotificationRequest struct {
	UserId    int    `json:"user_id"`
	Title     string `json:"title"`
	Content   string `json:"content"`
	Level     string `json:"level"`
	SendEmail bool   `json:"send_email"`
}

func ListSelfSiteNotifications(c *gin.Context) {
	userId := c.GetInt("id")
	pageInfo := common.GetPageQuery(c)
	unreadOnly := strings.EqualFold(strings.TrimSpace(c.Query("unread_only")), "true")
	items, total, err := model.GetUserSiteNotifications(userId, pageInfo, unreadOnly)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"message":   "",
		"data":      items,
		"total":     total,
		"page":      pageInfo.Page,
		"page_size": pageInfo.PageSize,
	})
}

func GetSelfSiteNotificationUnreadCount(c *gin.Context) {
	userId := c.GetInt("id")
	total, err := model.CountUnreadSiteNotifications(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"unread_count": total,
		},
	})
}

func MarkSelfSiteNotificationRead(c *gin.Context) {
	userId := c.GetInt("id")
	notificationId, err := strconv.Atoi(c.Param("id"))
	if err != nil || notificationId <= 0 {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	if err := model.MarkSiteNotificationRead(userId, notificationId); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func MarkAllSelfSiteNotificationsRead(c *gin.Context) {
	userId := c.GetInt("id")
	if err := model.MarkAllSiteNotificationsRead(userId); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func AdminSendSiteNotification(c *gin.Context) {
	var req SendSiteNotificationRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	req.Title = strings.TrimSpace(req.Title)
	req.Content = strings.TrimSpace(req.Content)
	if req.UserId <= 0 || req.Title == "" || req.Content == "" {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}

	user, err := model.GetUserById(req.UserId, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	senderUserId := c.GetInt("id")
	notification, err := service.SendSiteNotificationToUser(user, senderUserId, req.Title, req.Content, req.Level, req.SendEmail)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	model.RecordLog(user.Id, model.LogTypeSystem, "管理员发送站内信："+req.Title)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    notification,
	})
}
