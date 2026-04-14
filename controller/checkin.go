package controller

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

type CreateCheckinAutoJobRequest struct {
	Name                string `json:"name"`
	Enabled             *bool  `json:"enabled"`
	TargetDate          string `json:"target_date"`
	WindowStartSeconds  int    `json:"window_start_seconds"`
	WindowEndSeconds    int    `json:"window_end_seconds"`
	RandomWindowSeconds int    `json:"random_window_seconds"`
	UserIDs             []int  `json:"user_ids"`
}

type UpdateCheckinAutoJobRequest struct {
	Name                string `json:"name"`
	Enabled             *bool  `json:"enabled"`
	TargetDate          string `json:"target_date"`
	WindowStartSeconds  int    `json:"window_start_seconds"`
	WindowEndSeconds    int    `json:"window_end_seconds"`
	RandomWindowSeconds int    `json:"random_window_seconds"`
	UserIDs             []int  `json:"user_ids"`
}

// GetCheckinStatus 获取用户签到状态和历史记录
func GetCheckinStatus(c *gin.Context) {
	setting := operation_setting.GetCheckinSetting()
	if !setting.Enabled {
		common.ApiErrorMsg(c, "签到功能未启用")
		return
	}
	userId := c.GetInt("id")
	// 获取月份参数，默认为当前月份
	month := c.DefaultQuery("month", time.Now().Format("2006-01"))

	stats, err := model.GetUserCheckinStats(userId, month)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	availability, err := model.GetCheckinAvailability(model.GetCheckinNow())
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"enabled":             setting.Enabled,
			"min_quota":           setting.MinQuota,
			"max_quota":           setting.MaxQuota,
			"stats":               stats,
			"available_now":       availability.AvailableNow,
			"availability_reason": availability.Reason,
			"today_checkins":      availability.TodayCheckins,
			"daily_user_limit":    availability.DailyUserLimit,
			"remaining_slots":     availability.RemainingSlots,
			"open_weekdays":       availability.OpenWeekdays,
			"open_start_seconds":  availability.OpenStartSeconds,
			"open_end_seconds":    availability.OpenEndSeconds,
		},
	})
}

// GetCheckinLeaderboard 获取签到榜
func GetCheckinLeaderboard(c *gin.Context) {
	setting := operation_setting.GetCheckinSetting()
	if !setting.Enabled {
		common.ApiErrorMsg(c, "签到功能未启用")
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "10"))
	limit := setting.LeaderboardLimit
	if limit <= 0 {
		limit = 100
	}
	data, err := model.GetCheckinLeaderboard(page, pageSize, limit)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    data,
	})
}

// GetAdminCheckinRecords 获取签到管理记录（仅超级管理员）
func GetAdminCheckinRecords(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", strconv.Itoa(common.ItemsPerPage)))
	userId, _ := strconv.Atoi(c.DefaultQuery("user_id", "0"))
	keyword := strings.TrimSpace(c.Query("keyword"))
	startDate := strings.TrimSpace(c.Query("start_date"))
	endDate := strings.TrimSpace(c.Query("end_date"))

	items, total, stats, err := model.GetAdminCheckinRecords(
		page,
		pageSize,
		keyword,
		userId,
		startDate,
		endDate,
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"items": items,
			"total": total,
			"stats": stats,
		},
	})
}

func CreateCheckinAutoJob(c *gin.Context) {
	req := CreateCheckinAutoJobRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	result, err := model.CreateCheckinAutoJob(&model.CheckinAutoJobCreateRequest{
		Name:                strings.TrimSpace(req.Name),
		Enabled:             req.Enabled,
		TargetDate:          strings.TrimSpace(req.TargetDate),
		WindowStartSeconds:  req.WindowStartSeconds,
		WindowEndSeconds:    req.WindowEndSeconds,
		RandomWindowSeconds: req.RandomWindowSeconds,
		UserIDs:             req.UserIDs,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

func UpdateCheckinAutoJob(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "无效的任务ID")
		return
	}

	req := UpdateCheckinAutoJobRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}

	result, err := model.UpdateCheckinAutoJob(id, &model.CheckinAutoJobUpdateRequest{
		Name:                strings.TrimSpace(req.Name),
		Enabled:             req.Enabled,
		TargetDate:          strings.TrimSpace(req.TargetDate),
		WindowStartSeconds:  req.WindowStartSeconds,
		WindowEndSeconds:    req.WindowEndSeconds,
		RandomWindowSeconds: req.RandomWindowSeconds,
		UserIDs:             req.UserIDs,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

func GetCheckinAutoJobs(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", strconv.Itoa(common.ItemsPerPage)))
	targetDate := strings.TrimSpace(c.Query("target_date"))
	status := strings.TrimSpace(c.Query("status"))
	result, err := model.ListCheckinAutoJobs(page, pageSize, targetDate, status)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

func GetCheckinAutoJob(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	result, err := model.GetCheckinAutoJobDetail(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

func CancelCheckinAutoJob(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.CancelCheckinAutoJob(id); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"id": id, "status": model.CheckinAutoJobStatusCancelled})
}

// DoCheckin 执行用户签到
func DoCheckin(c *gin.Context) {
	setting := operation_setting.GetCheckinSetting()
	if !setting.Enabled {
		common.ApiErrorMsg(c, "签到功能未启用")
		return
	}

	userId := c.GetInt("id")

	checkin, err := model.UserCheckin(userId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	model.RecordLog(userId, model.LogTypeSystem, fmt.Sprintf("用户签到，获得额度 %s", logger.LogQuota(checkin.QuotaAwarded)))
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "签到成功",
		"data": gin.H{
			"quota_awarded": checkin.QuotaAwarded,
			"checkin_date":  checkin.CheckinDate},
	})
}
