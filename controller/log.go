package controller

import (
	"encoding/csv"
	"fmt"
	"io"
	"mime"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

const maxLogImageDownloadBytes int64 = 50 * 1024 * 1024

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

func getLogImageURLs(logItem *model.Log) []string {
	if logItem == nil || strings.TrimSpace(logItem.Other) == "" {
		return nil
	}
	var other struct {
		ImageURLs []string `json:"image_urls"`
	}
	if err := common.Unmarshal([]byte(logItem.Other), &other); err != nil {
		return nil
	}
	return other.ImageURLs
}

func imageDownloadFilename(rawURL string, index int) string {
	filename := strings.TrimSpace(path.Base(strings.Split(rawURL, "?")[0]))
	if filename == "" || filename == "." || filename == "/" {
		filename = fmt.Sprintf("image-%d.png", index+1)
	}
	return filename
}

func validateLogImageDownloadResponse(resp *http.Response) error {
	if resp == nil {
		return fmt.Errorf("图片下载失败，源站无响应")
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("图片下载失败，源站状态码 %d", resp.StatusCode)
	}
	if resp.ContentLength > maxLogImageDownloadBytes {
		return fmt.Errorf("图片文件过大，无法通过服务器下载")
	}
	return nil
}

func DownloadLogImage(c *gin.Context) {
	requestId := strings.TrimSpace(c.Param("request_id"))
	index, err := strconv.Atoi(c.Param("index"))
	if err != nil || index < 0 {
		common.ApiErrorMsg(c, "无效的图片序号")
		return
	}

	logItem, err := model.GetConsumeLogByRequestId(requestId)
	if err != nil {
		common.ApiErrorMsg(c, "日志不存在")
		return
	}
	if c.GetInt("role") < common.RoleAdminUser && logItem.UserId != c.GetInt("id") {
		common.ApiErrorMsg(c, "无权下载该图片")
		return
	}

	imageURLs := getLogImageURLs(logItem)
	if index >= len(imageURLs) || strings.TrimSpace(imageURLs[index]) == "" {
		common.ApiErrorMsg(c, "图片不存在")
		return
	}

	imageURL := strings.TrimSpace(imageURLs[index])
	resp, err := service.DoDownloadRequest(imageURL, "log image download")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	defer service.CloseResponseBodyGracefully(resp)

	if err := validateLogImageDownloadResponse(resp); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	filename := imageDownloadFilename(imageURL, index)
	if exts, _ := mime.ExtensionsByType(contentType); len(exts) > 0 && path.Ext(filename) == "" {
		filename += exts[0]
	}
	c.Header("Content-Type", contentType)
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	if resp.ContentLength > 0 {
		c.Header("Content-Length", strconv.FormatInt(resp.ContentLength, 10))
	}
	c.Status(http.StatusOK)
	_, err = io.Copy(c.Writer, io.LimitReader(resp.Body, maxLogImageDownloadBytes+1))
	if err != nil {
		common.SysError("failed to stream log image download: " + err.Error())
	}
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
	logs, total, err := model.GetAllLogs(query.LogType, query.StartTimestamp, query.EndTimestamp, query.UserId, query.ModelName, query.Username, query.TokenName, pageInfo.GetStartIdx(), pageInfo.GetPageSize(), query.Channel, query.Group, query.RequestId, query.ErrorMessage, query.StatusCode, query.SubscriptionId, query.SubscriptionPlanId)
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
	logs, total, err := model.GetUserLogs(userId, query.LogType, query.StartTimestamp, query.EndTimestamp, query.ModelName, query.TokenName, pageInfo.GetStartIdx(), pageInfo.GetPageSize(), query.Group, query.RequestId, query.ErrorMessage, query.StatusCode, query.SubscriptionId, query.SubscriptionPlanId)
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
	logs, total, truncated, err := model.GetAllLogsForExport(query.LogType, query.StartTimestamp, query.EndTimestamp, query.UserId, query.ModelName, query.Username, query.TokenName, query.Channel, query.Group, query.RequestId, query.ErrorMessage, query.StatusCode, query.SubscriptionId, query.SubscriptionPlanId)
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
	logs, total, truncated, err := model.GetUserLogsForExport(userId, query.LogType, query.StartTimestamp, query.EndTimestamp, query.ModelName, query.TokenName, query.Group, query.RequestId, query.ErrorMessage, query.StatusCode, query.SubscriptionId, query.SubscriptionPlanId)
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
	logs, err := model.GetLogByTokenId(tokenId)
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
	stat, err := model.SumUsedQuota(query.LogType, query.StartTimestamp, query.EndTimestamp, query.UserId, query.ModelName, query.Username, query.TokenName, query.Channel, query.Group, query.RequestId, query.ErrorMessage, query.StatusCode, query.SubscriptionId, query.SubscriptionPlanId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	//tokenNum := model.SumUsedToken(logType, startTimestamp, endTimestamp, modelName, username, "")
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"quota":                     stat.Quota,
			"rpm":                       stat.Rpm,
			"tpm":                       stat.Tpm,
			"prompt_cache_hit_count":    stat.PromptCacheHitCount,
			"prompt_cache_total_count":  stat.PromptCacheTotalCount,
			"prompt_cache_hit_rate":     stat.PromptCacheHitRate,
			"prompt_cache_input_tokens": stat.PromptCacheInputTokens,
			"prompt_cache_read_tokens":  stat.PromptCacheReadTokens,
			"prompt_cache_write_tokens": stat.PromptCacheWriteTokens,
		},
	})
	return
}

func GetLogsSelfStat(c *gin.Context) {
	username := c.GetString("username")
	query := getLogQueryParams(c)
	quotaNum, err := model.SumUsedQuota(query.LogType, query.StartTimestamp, query.EndTimestamp, 0, query.ModelName, username, query.TokenName, query.Channel, query.Group, query.RequestId, query.ErrorMessage, query.StatusCode, query.SubscriptionId, query.SubscriptionPlanId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	//tokenNum := model.SumUsedToken(logType, startTimestamp, endTimestamp, modelName, username, tokenName)
	c.JSON(200, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"quota":                     quotaNum.Quota,
			"rpm":                       quotaNum.Rpm,
			"tpm":                       quotaNum.Tpm,
			"prompt_cache_hit_count":    quotaNum.PromptCacheHitCount,
			"prompt_cache_total_count":  quotaNum.PromptCacheTotalCount,
			"prompt_cache_hit_rate":     quotaNum.PromptCacheHitRate,
			"prompt_cache_input_tokens": quotaNum.PromptCacheInputTokens,
			"prompt_cache_read_tokens":  quotaNum.PromptCacheReadTokens,
			"prompt_cache_write_tokens": quotaNum.PromptCacheWriteTokens,
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
