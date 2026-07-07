package controller

import (
	"encoding/csv"
	"errors"
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
	"github.com/QuantumNous/new-api/setting"

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
	BusinessGroup      string
	RequestId          string
	ErrorMessage       string
	StatusCode         string
	SubscriptionId     int
	SubscriptionPlanId int
	CompactExport      bool
	// 账单导出专用 opt-in 多值筛选与零输出排除
	TokenNames                  []string
	ModelNames                  []string
	Groups                      []string
	BusinessGroups              []string
	ExcludeStreamZeroCompletion bool
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
		BusinessGroup:      c.Query("business_group"),
		RequestId:          c.Query("request_id"),
		ErrorMessage:       c.Query("error_message"),
		StatusCode:         c.Query("status_code"),
		SubscriptionId:     subscriptionId,
		SubscriptionPlanId: subscriptionPlanId,
		CompactExport:      c.Query("compact") == "true" || c.Query("compact") == "1",
		TokenNames:         cleanStringSlice(c.QueryArray("token_names")),
		ModelNames:         cleanStringSlice(c.QueryArray("model_names")),
		Groups:             cleanStringSlice(c.QueryArray("groups")),
		BusinessGroups:     cleanStringSlice(c.QueryArray("business_groups")),
		ExcludeStreamZeroCompletion: c.Query("exclude_stream_zero_completion") == "true" ||
			c.Query("exclude_stream_zero_completion") == "1",
	}
}

// cleanStringSlice 归一化重复/逗号分隔的 query 值：去空白、去空项。
func cleanStringSlice(values []string) []string {
	out := make([]string, 0, len(values))
	for _, v := range values {
		for _, part := range strings.Split(v, ",") {
			if part = strings.TrimSpace(part); part != "" {
				out = append(out, part)
			}
		}
	}
	return out
}

// exportFilters 从 query 组装 model 层的账单导出筛选。
func (q logQueryParams) exportFilters() model.LogExportFilters {
	return model.LogExportFilters{
		TokenNames:                  q.TokenNames,
		ModelNames:                  q.ModelNames,
		Groups:                      q.Groups,
		BusinessGroups:              q.BusinessGroups,
		ExcludeStreamZeroCompletion: q.ExcludeStreamZeroCompletion,
	}
}

func GetAllLogs(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	query := getLogQueryParams(c)
	isRootUser := c.GetInt("role") == common.RoleRootUser
	logs, total, err := model.GetAllLogs(query.LogType, query.StartTimestamp, query.EndTimestamp, query.UserId, query.ModelName, query.Username, query.TokenName, pageInfo.GetStartIdx(), pageInfo.GetPageSize(), query.Channel, query.Group, query.BusinessGroup, query.RequestId, query.ErrorMessage, query.StatusCode, query.SubscriptionId, query.SubscriptionPlanId, isRootUser)
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
	logs, total, err := model.GetUserLogs(userId, query.LogType, query.StartTimestamp, query.EndTimestamp, query.ModelName, query.TokenName, pageInfo.GetStartIdx(), pageInfo.GetPageSize(), query.Group, query.BusinessGroup, query.RequestId, query.ErrorMessage, query.StatusCode, query.SubscriptionId, query.SubscriptionPlanId, isRootUser)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(logs)
	common.ApiSuccess(c, pageInfo)
	return
}

func logCSVHeaders() []string {
	return []string{
		"id",
		"created_at",
		"type",
		"user_id",
		"username",
		"token_name",
		"model_name",
		"quota",
		"quota_usd",
		"prompt_tokens",
		"completion_tokens",
		"use_time",
		"is_stream",
		"group",
		"business_group",
		"ip",
		"request_id",
		"content",
		"other",
	}
}

func logCSVRow(l *model.Log) []string {
	quotaUsd := strconv.FormatFloat(float64(l.Quota)/common.QuotaPerUnit, 'f', 6, 64)
	createdAt := ""
	if l.CreatedAt > 0 {
		createdAt = time.Unix(l.CreatedAt, 0).Format("2006-01-02 15:04:05")
	}
	return []string{
		strconv.Itoa(l.Id),
		createdAt,
		strconv.Itoa(l.Type),
		strconv.Itoa(l.UserId),
		l.Username,
		l.TokenName,
		l.ModelName,
		strconv.Itoa(l.Quota),
		quotaUsd,
		strconv.Itoa(l.PromptTokens),
		strconv.Itoa(l.CompletionTokens),
		strconv.Itoa(l.UseTime),
		strconv.FormatBool(l.IsStream),
		l.Group,
		l.BusinessGroup,
		l.Ip,
		l.RequestId,
		l.Content,
		l.Other,
	}
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

	if err := writer.Write(logCSVHeaders()); err != nil {
		common.ApiError(c, err)
		return
	}

	for _, logItem := range logs {
		if err := writer.Write(logCSVRow(logItem)); err != nil {
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
	logs, total, truncated, err := model.GetAllLogsForExport(query.LogType, query.StartTimestamp, query.EndTimestamp, query.UserId, query.ModelName, query.Username, query.TokenName, query.Channel, query.Group, query.BusinessGroup, query.RequestId, query.ErrorMessage, query.StatusCode, query.SubscriptionId, query.SubscriptionPlanId, isRootUser, query.CompactExport, query.exportFilters())
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
	logs, total, truncated, err := model.GetUserLogsForExport(userId, query.LogType, query.StartTimestamp, query.EndTimestamp, query.ModelName, query.TokenName, query.Group, query.BusinessGroup, query.RequestId, query.ErrorMessage, query.StatusCode, query.SubscriptionId, query.SubscriptionPlanId, isRootUser, query.CompactExport, query.exportFilters())
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
	stat, err := model.SumUsedQuota(query.LogType, query.StartTimestamp, query.EndTimestamp, query.UserId, query.ModelName, query.Username, query.TokenName, query.Channel, query.Group, query.BusinessGroup, query.RequestId, query.ErrorMessage, query.StatusCode, query.SubscriptionId, query.SubscriptionPlanId, query.exportFilters())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	balanceQuota, err := model.SumUserQuota("")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	stat.BalanceQuota = balanceQuota
	//tokenNum := model.SumUsedToken(logType, startTimestamp, endTimestamp, modelName, username, "")
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"balance_quota":             stat.BalanceQuota,
			"quota":                     stat.Quota,
			"request_count":             stat.RequestCount,
			"rpm":                       stat.Rpm,
			"tpm":                       stat.Tpm,
			"prompt_tokens":             stat.PromptTokens,
			"completion_tokens":         stat.CompletionTokens,
			"total_tokens":              stat.TotalTokens,
			"average_use_time":          stat.AverageUseTime,
			"prompt_cache_hit_count":    stat.PromptCacheHitCount,
			"prompt_cache_total_count":  stat.PromptCacheTotalCount,
			"prompt_cache_hit_rate":     stat.PromptCacheHitRate,
			"prompt_cache_input_tokens": stat.PromptCacheInputTokens,
			"prompt_cache_read_tokens":  stat.PromptCacheReadTokens,
			"prompt_cache_write_tokens": stat.PromptCacheWriteTokens,
			"prompt_cache_openai":       promptCacheStatPayload(stat.PromptCacheOpenAI),
			"prompt_cache_claude":       promptCacheStatPayload(stat.PromptCacheClaude),
		},
	})
	return
}

func GetLeaderboard(c *gin.Context) {
	now := time.Now()
	location := now.Location()
	dateStr := c.Query("date")
	sortBy := c.DefaultQuery("sort_by", "quota")

	var startTimestamp, endTimestamp int64
	queryStart, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	queryEnd, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	if queryStart > 0 {
		startTimestamp = queryStart
		endTimestamp = queryEnd
	} else if dateStr != "" {
		parsed, err := time.ParseInLocation("2006-01-02", dateStr, location)
		if err != nil {
			common.ApiError(c, errors.New("invalid date format, expected YYYY-MM-DD"))
			return
		}
		startTimestamp = parsed.Unix()
		endTimestamp = parsed.AddDate(0, 0, 1).Unix()
	} else {
		startTimestamp = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, location).Unix()
		endTimestamp = 0
	}

	pageInfo := common.GetPageQuery(c)
	keyword := c.Query("keyword")

	data, err := model.GetLeaderboard(startTimestamp, endTimestamp, sortBy, pageInfo.GetPage(), pageInfo.GetPageSize(), keyword)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, data)
}

func GetLeaderboardAnalysis(c *gin.Context) {
	userId, err := strconv.Atoi(c.Query("user_id"))
	if err != nil || userId <= 0 {
		common.ApiError(c, errors.New("invalid user_id"))
		return
	}
	start, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	end, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	if start == 0 {
		now := time.Now()
		start = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).Unix()
	}
	data, err := model.GetLeaderboardAnalysisDetail(userId, start, end)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, data)
}

func GetActivityStats(c *gin.Context) {
	windowMinutes, _ := strconv.Atoi(c.DefaultQuery("window", "15"))
	switch windowMinutes {
	case 5, 15, 60:
	default:
		windowMinutes = 15
	}
	data, err := model.GetActivityStats(windowMinutes, time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, data)
}

func GetLogsSelfStat(c *gin.Context) {
	username := c.GetString("username")
	query := getLogQueryParams(c)
	quotaNum, err := model.SumUsedQuota(query.LogType, query.StartTimestamp, query.EndTimestamp, 0, query.ModelName, username, query.TokenName, query.Channel, query.Group, query.BusinessGroup, query.RequestId, query.ErrorMessage, query.StatusCode, query.SubscriptionId, query.SubscriptionPlanId, query.exportFilters())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	balanceQuota, err := model.SumUserQuota(username)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	quotaNum.BalanceQuota = balanceQuota
	//tokenNum := model.SumUsedToken(logType, startTimestamp, endTimestamp, modelName, username, tokenName)
	c.JSON(200, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"balance_quota":             quotaNum.BalanceQuota,
			"quota":                     quotaNum.Quota,
			"request_count":             quotaNum.RequestCount,
			"rpm":                       quotaNum.Rpm,
			"tpm":                       quotaNum.Tpm,
			"prompt_tokens":             quotaNum.PromptTokens,
			"completion_tokens":         quotaNum.CompletionTokens,
			"total_tokens":              quotaNum.TotalTokens,
			"average_use_time":          quotaNum.AverageUseTime,
			"prompt_cache_hit_count":    quotaNum.PromptCacheHitCount,
			"prompt_cache_total_count":  quotaNum.PromptCacheTotalCount,
			"prompt_cache_hit_rate":     quotaNum.PromptCacheHitRate,
			"prompt_cache_input_tokens": quotaNum.PromptCacheInputTokens,
			"prompt_cache_read_tokens":  quotaNum.PromptCacheReadTokens,
			"prompt_cache_write_tokens": quotaNum.PromptCacheWriteTokens,
			"prompt_cache_openai":       promptCacheStatPayload(quotaNum.PromptCacheOpenAI),
			"prompt_cache_claude":       promptCacheStatPayload(quotaNum.PromptCacheClaude),
			//"token": tokenNum,
		},
	})
	return
}

func promptCacheStatPayload(stat model.PromptCacheStat) gin.H {
	return gin.H{
		"hit_count":    stat.HitCount,
		"total_count":  stat.TotalCount,
		"hit_rate":     stat.HitRate,
		"input_tokens": stat.InputTokens,
	}
}

func buildGroupLogHealthStatsQuery(query logQueryParams) model.GroupLogHealthStatsQuery {
	return model.GroupLogHealthStatsQuery{
		StartTimestamp:        query.StartTimestamp,
		EndTimestamp:          query.EndTimestamp,
		UserId:                query.UserId,
		Username:              query.Username,
		TokenName:             query.TokenName,
		ModelName:             query.ModelName,
		Channel:               query.Channel,
		Group:                 query.Group,
		StatusCode:            query.StatusCode,
		RequestId:             query.RequestId,
		ErrorMessage:          query.ErrorMessage,
		SubscriptionId:        query.SubscriptionId,
		SubscriptionPlanId:    query.SubscriptionPlanId,
		IgnoreRateLimitErrors: true,
	}
}

func GetGroupLogHealthStats(c *gin.Context) {
	query := buildGroupLogHealthStatsQuery(getLogQueryParams(c))
	stats, err := model.GetGroupLogHealthStats(query)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, stats)
}

func GetGroupLogSelfHealthStats(c *gin.Context) {
	query := buildGroupLogHealthStatsQuery(getLogQueryParams(c))
	userId := c.GetInt("id")
	user, err := model.GetUserById(userId, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	hasQuotaBalance := true
	if setting.EnableGroupBillingFilter {
		hasQuotaBalance = user.Quota > 0
	}
	usableGroups := service.GetUserUsableGroupsForUser(userId, user.Group, hasQuotaBalance)
	if query.Group == "auto" {
		query.Group = ""
		query.Groups = service.GetAutoGroupsFromUsableGroups(usableGroups)
	} else if query.Group != "" {
		if _, ok := usableGroups[query.Group]; !ok {
			common.ApiErrorMsg(c, "无权查看该分组健康状态")
			return
		}
	} else {
		groups := make([]string, 0, len(usableGroups))
		for groupName := range usableGroups {
			groupName = strings.TrimSpace(groupName)
			if groupName != "" && groupName != "auto" {
				groups = append(groups, groupName)
			}
		}
		query.Groups = groups
	}
	query.UserId = userId
	query.Username = ""
	query.Channel = 0

	stats, err := model.GetGroupLogHealthStats(query)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, stats)
}

const maxBatchDeleteLogCount = 1000

type batchDeleteLogsRequest struct {
	Ids []int `json:"ids"`
}

func BatchDeleteLogs(c *gin.Context) {
	req := batchDeleteLogsRequest{}
	if err := common.UnmarshalBodyReusable(c, &req); err != nil {
		common.ApiError(c, err)
		return
	}
	ids := make([]int, 0, len(req.Ids))
	seen := make(map[int]struct{}, len(req.Ids))
	for _, id := range req.Ids {
		if id <= 0 {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		common.ApiErrorMsg(c, "请选择要删除的日志")
		return
	}
	if len(ids) > maxBatchDeleteLogCount {
		common.ApiErrorMsg(c, fmt.Sprintf("单次最多删除 %d 条日志", maxBatchDeleteLogCount))
		return
	}
	count, err := model.DeleteLogsByIds(ids)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, count)
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
