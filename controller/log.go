package controller

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

type logQueryParams struct {
	LogType            int
	StartTimestamp     int64
	EndTimestamp       int64
	UserId             int
	Username           string
	TokenName          string
	ModelName          string
	Channel            int
	Group              string
	RequestId          string
	ErrorMessage       string
	StatusCode         string
	SubscriptionId     int
	SubscriptionPlanId int
}

func getLogQueryParams(c *gin.Context) logQueryParams {
	logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	userId, _ := strconv.Atoi(c.Query("user_id"))
	channel, _ := strconv.Atoi(c.Query("channel"))
	subscriptionId, _ := strconv.Atoi(c.Query("subscription_id"))
	subscriptionPlanId, _ := strconv.Atoi(c.Query("subscription_plan_id"))
	return logQueryParams{
		LogType:            logType,
		StartTimestamp:     startTimestamp,
		EndTimestamp:       endTimestamp,
		UserId:             userId,
		Username:           c.Query("username"),
		TokenName:          c.Query("token_name"),
		ModelName:          c.Query("model_name"),
		Channel:            channel,
		Group:              c.Query("group"),
		RequestId:          c.Query("request_id"),
		ErrorMessage:       c.Query("error_message"),
		StatusCode:         c.Query("status_code"),
		SubscriptionId:     subscriptionId,
		SubscriptionPlanId: subscriptionPlanId,
	}
}

func GetAllLogs(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	query := getLogQueryParams(c)
	isRootUser := c.GetInt("role") == common.RoleRootUser
	logs, total, err := model.GetAllLogs(query.LogType, query.StartTimestamp, query.EndTimestamp, query.UserId, query.ModelName, query.Username, query.TokenName, pageInfo.GetStartIdx(), pageInfo.GetPageSize(), query.Channel, query.Group, query.RequestId, query.ErrorMessage, query.StatusCode, query.SubscriptionId, query.SubscriptionPlanId, isRootUser)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(logs)
	common.ApiSuccess(c, pageInfo)
	return
}

func GetUserLogs(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	userId := c.GetInt("id")
	query := getLogQueryParams(c)
	isRootUser := c.GetInt("role") == common.RoleRootUser
	logs, total, err := model.GetUserLogs(userId, query.LogType, query.StartTimestamp, query.EndTimestamp, query.ModelName, query.TokenName, pageInfo.GetStartIdx(), pageInfo.GetPageSize(), query.Group, query.RequestId, query.ErrorMessage, query.StatusCode, query.SubscriptionId, query.SubscriptionPlanId, isRootUser)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(logs)
	common.ApiSuccess(c, pageInfo)
	return
}

func writeLogsCSV(c *gin.Context, logs []*model.Log, total int64, truncated bool, filenamePrefix string) {
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s-%s.csv", filenamePrefix, time.Now().Format("2006-01-02")))
	c.Header("X-Export-Total", strconv.FormatInt(total, 10))
	if truncated {
		c.Header("X-Export-Truncated", "true")
	}

	c.Status(http.StatusOK)
	_, _ = c.Writer.Write([]byte{0xEF, 0xBB, 0xBF})

	writer := csv.NewWriter(c.Writer)
	defer writer.Flush()

	headers := []string{
		"id",
		"created_at",
		"type",
		"user_id",
		"username",
		"token_name",
		"model_name",
		"quota",
		"prompt_tokens",
		"completion_tokens",
		"use_time",
		"is_stream",
		"channel_id",
		"channel_name",
		"group",
		"ip",
		"request_id",
		"content",
		"other",
	}
	if err := writer.Write(headers); err != nil {
		common.ApiError(c, err)
		return
	}

	for _, logItem := range logs {
		row := []string{
			strconv.Itoa(logItem.Id),
			strconv.FormatInt(logItem.CreatedAt, 10),
			strconv.Itoa(logItem.Type),
			strconv.Itoa(logItem.UserId),
			logItem.Username,
			logItem.TokenName,
			logItem.ModelName,
			strconv.Itoa(logItem.Quota),
			strconv.Itoa(logItem.PromptTokens),
			strconv.Itoa(logItem.CompletionTokens),
			strconv.Itoa(logItem.UseTime),
			strconv.FormatBool(logItem.IsStream),
			strconv.Itoa(logItem.ChannelId),
			logItem.ChannelName,
			logItem.Group,
			logItem.Ip,
			logItem.RequestId,
			logItem.Content,
			logItem.Other,
		}
		if err := writer.Write(row); err != nil {
			common.ApiError(c, err)
			return
		}
	}
}

func ExportAllLogs(c *gin.Context) {
	if !common.LogExportEnabled {
		common.ApiErrorMsg(c, "日志导出未启用")
		return
	}
	query := getLogQueryParams(c)
	isRootUser := c.GetInt("role") == common.RoleRootUser
	logs, total, truncated, err := model.GetAllLogsForExport(query.LogType, query.StartTimestamp, query.EndTimestamp, query.UserId, query.ModelName, query.Username, query.TokenName, query.Channel, query.Group, query.RequestId, query.ErrorMessage, query.StatusCode, query.SubscriptionId, query.SubscriptionPlanId, isRootUser)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	writeLogsCSV(c, logs, total, truncated, "usage-logs")
}

func ExportUserLogs(c *gin.Context) {
	if !common.LogExportEnabled {
		common.ApiErrorMsg(c, "日志导出未启用")
		return
	}
	userId := c.GetInt("id")
	query := getLogQueryParams(c)
	isRootUser := c.GetInt("role") == common.RoleRootUser
	logs, total, truncated, err := model.GetUserLogsForExport(userId, query.LogType, query.StartTimestamp, query.EndTimestamp, query.ModelName, query.TokenName, query.Group, query.RequestId, query.ErrorMessage, query.StatusCode, query.SubscriptionId, query.SubscriptionPlanId, isRootUser)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	writeLogsCSV(c, logs, total, truncated, "usage-logs-self")
}

// Deprecated: SearchAllLogs 已废弃，前端未使用该接口。
func SearchAllLogs(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": false,
		"message": "该接口已废弃",
	})
}

// Deprecated: SearchUserLogs 已废弃，前端未使用该接口。
func SearchUserLogs(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": false,
		"message": "该接口已废弃",
	})
}

func GetLogByKey(c *gin.Context) {
	tokenId := c.GetInt("token_id")
	if tokenId == 0 {
		c.JSON(200, gin.H{
			"success": false,
			"message": "无效的令牌",
		})
		return
	}
	isRootUser := c.GetInt("role") == common.RoleRootUser
	logs, err := model.GetLogByTokenId(tokenId, isRootUser)
	if err != nil {
		c.JSON(200, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(200, gin.H{
		"success": true,
		"message": "",
		"data":    logs,
	})
}

func GetLogsStat(c *gin.Context) {
	query := getLogQueryParams(c)
	stat, err := model.SumUsedQuota(query.LogType, query.StartTimestamp, query.EndTimestamp, query.UserId, query.ModelName, query.Username, query.TokenName, query.Channel, query.Group, query.ErrorMessage, query.StatusCode, query.SubscriptionId, query.SubscriptionPlanId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	//tokenNum := model.SumUsedToken(logType, startTimestamp, endTimestamp, modelName, username, "")
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"quota": stat.Quota,
			"rpm":   stat.Rpm,
			"tpm":   stat.Tpm,
		},
	})
	return
}

func GetLogsSelfStat(c *gin.Context) {
	username := c.GetString("username")
	query := getLogQueryParams(c)
	quotaNum, err := model.SumUsedQuota(query.LogType, query.StartTimestamp, query.EndTimestamp, 0, query.ModelName, username, query.TokenName, query.Channel, query.Group, query.ErrorMessage, query.StatusCode, query.SubscriptionId, query.SubscriptionPlanId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	//tokenNum := model.SumUsedToken(logType, startTimestamp, endTimestamp, modelName, username, tokenName)
	c.JSON(200, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"quota": quotaNum.Quota,
			"rpm":   quotaNum.Rpm,
			"tpm":   quotaNum.Tpm,
			//"token": tokenNum,
		},
	})
	return
}

func DeleteHistoryLogs(c *gin.Context) {
	targetTimestamp, _ := strconv.ParseInt(c.Query("target_timestamp"), 10, 64)
	if targetTimestamp == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "target timestamp is required",
		})
		return
	}
	count, err := model.DeleteOldLog(c.Request.Context(), targetTimestamp, 100)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    count,
	})
	return
}
