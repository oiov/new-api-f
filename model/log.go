package model

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/common/geoip"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"

	"github.com/bytedance/gopkg/util/gopool"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Log struct {
	Id               int    `json:"id" gorm:"index:idx_created_at_id,priority:1;index:idx_user_id_id,priority:2"`
	DisplayId        int    `json:"display_id" gorm:"-"`
	UserId           int    `json:"user_id" gorm:"index;index:idx_user_id_id,priority:1"`
	CreatedAt        int64  `json:"created_at" gorm:"bigint;index:idx_created_at_id,priority:2;index:idx_created_at_type"`
	Type             int    `json:"type" gorm:"index:idx_created_at_type"`
	Content          string `json:"content"`
	Username         string `json:"username" gorm:"index;index:index_username_model_name,priority:2;default:''"`
	TokenName        string `json:"token_name" gorm:"index;default:''"`
	ModelName        string `json:"model_name" gorm:"index;index:index_username_model_name,priority:1;default:''"`
	Quota            int    `json:"quota" gorm:"default:0"`
	PromptTokens     int    `json:"prompt_tokens" gorm:"default:0"`
	CompletionTokens int    `json:"completion_tokens" gorm:"default:0"`
	UseTime          int    `json:"use_time" gorm:"default:0"`
	IsStream         bool   `json:"is_stream"`
	ChannelId        int    `json:"channel" gorm:"index"`
	ChannelName      string `json:"channel_name" gorm:"->"`
	ChannelTag       string `json:"channel_tag" gorm:"->"`
	TokenId          int    `json:"token_id" gorm:"default:0;index"`
	Group            string `json:"group" gorm:"index"`
	BusinessGroup    string `json:"business_group" gorm:"type:varchar(128);not null;default:'';index"`
	Ip               string `json:"ip" gorm:"index;default:''"`
	RequestId        string `json:"request_id,omitempty" gorm:"type:varchar(64);index:idx_logs_request_id;default:''"`
	Other            string `json:"other"`
}

type SubscriptionConsumeSummary struct {
	TotalSuccessCount       int64 `json:"total_success_count"`
	TodaySuccessCount       int64 `json:"today_success_count"`
	SevenDaySuccessCount    int64 `json:"seven_day_success_count"`
	TotalRequestConsumed    int64 `json:"total_request_consumed"`
	TodayRequestConsumed    int64 `json:"today_request_consumed"`
	SevenDayRequestConsumed int64 `json:"seven_day_request_consumed"`
	TotalQuotaConsumed      int64 `json:"total_quota_consumed"`
	TodayQuotaConsumed      int64 `json:"today_quota_consumed"`
	SevenDayQuotaConsumed   int64 `json:"seven_day_quota_consumed"`
}

type ChannelMultiKeyGroupUsage struct {
	Group        string `json:"group"`
	SuccessCount int64  `json:"success_count"`
	UsedQuota    int64  `json:"used_quota"`
}

type ChannelMultiKeyUsageDetail struct {
	KeyIndex     int                         `json:"key_index"`
	SuccessCount int64                       `json:"success_count"`
	UsedQuota    int64                       `json:"used_quota"`
	LastUsedAt   int64                       `json:"last_used_at"`
	Groups       []ChannelMultiKeyGroupUsage `json:"groups,omitempty"`
}

type channelMultiKeyUsageRow struct {
	CreatedAt int64  `gorm:"column:created_at"`
	Quota     int    `gorm:"column:quota"`
	Group     string `gorm:"column:group"`
	Other     string `gorm:"column:other"`
}

type subscriptionConsumeSummaryRow struct {
	CreatedAt int64  `gorm:"column:created_at"`
	RequestId string `gorm:"column:request_id"`
	Other     string `gorm:"column:other"`
}

// don't use iota, avoid change log type value
const (
	LogTypeUnknown      = 0
	LogTypeTopup        = 1
	LogTypeConsume      = 2
	LogTypeManage       = 3
	LogTypeSystem       = 4
	LogTypeError        = 5
	LogTypeRefund       = 6
	LogTypeSubscription = 7
)

func formatUserLogs(logs []*Log, startIdx int) {
	formatLogs(logs, startIdx, true, false, false)
}

func formatLogs(logs []*Log, startIdx int, hideChannelName bool, hideAdminDebugFields bool, allowSensitivePreview bool) {
	for i := range logs {
		if hideChannelName {
			logs[i].ChannelName = ""
			logs[i].ChannelTag = ""
		}
		logs[i].Other = sanitizeLogOther(logs[i].Other, hideAdminDebugFields, allowSensitivePreview)
		logs[i].DisplayId = startIdx + i + 1
	}
}

func sanitizeLogOther(other string, hideAdminDebugFields bool, allowSensitivePreview bool) string {
	otherMap, _ := common.StrToMap(other)
	if otherMap == nil {
		return common.MapToJsonStr(otherMap)
	}
	if hideAdminDebugFields {
		delete(otherMap, "admin_info")
		delete(otherMap, "reject_reason")
	}
	if !allowSensitivePreview {
		delete(otherMap, "system_text")
		delete(otherMap, "messages_preview")
		delete(otherMap, "messages_count")
	}
	return common.MapToJsonStr(otherMap)
}

func GetLogByTokenId(tokenId int, allowSensitivePreview bool) (logs []*Log, err error) {
	tx := LOG_DB.Model(&Log{}).Where("token_id = ?", tokenId)
	tx = applyErrorLogVisibilityFilter(tx, LogTypeUnknown, !common.ErrorDetailsEnabled || !common.ErrorLogDisplayEnabled)
	err = tx.Order("id desc").Limit(common.MaxRecentItems).Find(&logs).Error
	formatLogs(logs, 0, true, true, allowSensitivePreview)
	return logs, err
}

func GetConsumeLogByRequestId(requestId string) (*Log, error) {
	requestId = strings.TrimSpace(requestId)
	if requestId == "" {
		return nil, gorm.ErrRecordNotFound
	}
	logItem := &Log{}
	err := LOG_DB.Where("request_id = ? AND type = ?", requestId, LogTypeConsume).
		Order("id desc").
		First(logItem).Error
	if err != nil {
		return nil, err
	}
	return logItem, nil
}

func RecordLog(userId int, logType int, content string) {
	if logType == LogTypeConsume && !common.LogConsumeEnabled {
		return
	}
	username, _ := GetUsernameById(userId, false)
	log := &Log{
		UserId:    userId,
		Username:  username,
		CreatedAt: common.GetTimestamp(),
		Type:      logType,
		Content:   content,
	}
	err := LOG_DB.Create(log).Error
	if err != nil {
		common.SysLog("failed to record log: " + err.Error())
	}
}

type RecordAdminSubscriptionDeliveryLogParams struct {
	UserId    int
	LogType   int
	Content   string
	ModelName string
	CreatedAt int64
	Other     map[string]interface{}
}

func RecordAdminSubscriptionDeliveryLog(params RecordAdminSubscriptionDeliveryLogParams) {
	username, _ := GetUsernameById(params.UserId, false)
	createdAt := params.CreatedAt
	if createdAt <= 0 {
		createdAt = common.GetTimestamp()
	}
	log := &Log{
		UserId:    params.UserId,
		Username:  username,
		CreatedAt: createdAt,
		Type:      params.LogType,
		Content:   params.Content,
		ModelName: params.ModelName,
		Other:     common.MapToJsonStr(params.Other),
	}
	if err := LOG_DB.Create(log).Error; err != nil {
		common.SysLog("failed to record admin subscription delivery log: " + err.Error())
	}
}

func GetChannelSuccessRequestCountMapSince(channelIds []int, since int64) (map[int]int64, error) {
	result := make(map[int]int64, len(channelIds))
	if len(channelIds) == 0 {
		return result, nil
	}
	type channelRequestCountRow struct {
		ChannelId int
		Count     int64
	}
	rows := make([]channelRequestCountRow, 0, len(channelIds))
	err := LOG_DB.Model(&Log{}).
		Select("channel_id", "count(*) as count").
		Where("type = ? AND created_at >= ? AND channel_id IN ? AND token_name <> ?", LogTypeConsume, since, channelIds, "模型测试").
		Group("channel_id").
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		result[row.ChannelId] = row.Count
	}
	return result, nil
}

func GetChannelMultiKeyUsageDetailMap(channelId int) (map[int]ChannelMultiKeyUsageDetail, error) {
	result := make(map[int]ChannelMultiKeyUsageDetail)
	if channelId <= 0 {
		return result, nil
	}
	var rows []channelMultiKeyUsageRow
	err := LOG_DB.Model(&Log{}).
		Select("created_at, quota, "+logGroupCol+" as group, other").
		Where("type = ? AND channel_id = ? AND token_name <> ?", LogTypeConsume, channelId, "模型测试").
		Order("created_at desc").
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	groupMaps := make(map[int]map[string]*ChannelMultiKeyGroupUsage)
	for _, row := range rows {
		otherMap, err := common.StrToMap(row.Other)
		if err != nil || otherMap == nil {
			continue
		}
		adminInfo, ok := otherMap["admin_info"].(map[string]interface{})
		if !ok {
			continue
		}
		keyIndex := readIntFromAny(adminInfo["multi_key_index"], -1)
		item := result[keyIndex]
		item.KeyIndex = keyIndex
		item.SuccessCount++
		item.UsedQuota += int64(row.Quota)
		if row.CreatedAt > item.LastUsedAt {
			item.LastUsedAt = row.CreatedAt
		}
		if _, ok := groupMaps[keyIndex]; !ok {
			groupMaps[keyIndex] = make(map[string]*ChannelMultiKeyGroupUsage)
		}
		groupName := strings.TrimSpace(row.Group)
		if groupName == "" {
			groupName = "default"
		}
		groupItem, ok := groupMaps[keyIndex][groupName]
		if !ok {
			groupItem = &ChannelMultiKeyGroupUsage{Group: groupName}
			groupMaps[keyIndex][groupName] = groupItem
		}
		groupItem.SuccessCount++
		groupItem.UsedQuota += int64(row.Quota)
		result[keyIndex] = item
	}
	for keyIndex, item := range result {
		groups := make([]ChannelMultiKeyGroupUsage, 0, len(groupMaps[keyIndex]))
		for _, groupItem := range groupMaps[keyIndex] {
			groups = append(groups, *groupItem)
		}
		sort.Slice(groups, func(i, j int) bool {
			if groups[i].SuccessCount == groups[j].SuccessCount {
				if groups[i].UsedQuota == groups[j].UsedQuota {
					return groups[i].Group < groups[j].Group
				}
				return groups[i].UsedQuota > groups[j].UsedQuota
			}
			return groups[i].SuccessCount > groups[j].SuccessCount
		})
		item.Groups = groups
		result[keyIndex] = item
	}
	return result, nil
}

func readIntFromAny(value interface{}, fallback int) int {
	switch v := value.(type) {
	case int:
		return v
	case int64:
		return int(v)
	case float64:
		return int(v)
	case json.Number:
		if parsed, err := v.Int64(); err == nil {
			return int(parsed)
		}
	case string:
		if parsed, err := strconv.Atoi(strings.TrimSpace(v)); err == nil {
			return parsed
		}
	}
	return fallback
}

func RecordErrorLog(c *gin.Context, userId int, channelId int, modelName string, tokenName string, content string, tokenId int, useTimeSeconds int,
	isStream bool, group string, other map[string]interface{}) {
	logger.LogInfo(c, fmt.Sprintf("record error log: userId=%d, channelId=%d, modelName=%s, tokenName=%s, content=%s", userId, channelId, modelName, tokenName, content))
	username := c.GetString("username")
	requestId := c.GetString(common.RequestIdKey)
	otherStr := common.MapToJsonStr(other)
	// 判断是否需要记录 IP
	needRecordIp := false
	if settingMap, err := GetUserSetting(userId, false); err == nil {
		if settingMap.IsRecordIpLogEnabled() {
			needRecordIp = true
		}
	}
	log := &Log{
		UserId:           userId,
		Username:         username,
		CreatedAt:        common.GetTimestamp(),
		Type:             LogTypeError,
		Content:          content,
		PromptTokens:     0,
		CompletionTokens: 0,
		TokenName:        tokenName,
		ModelName:        modelName,
		Quota:            0,
		ChannelId:        channelId,
		TokenId:          tokenId,
		UseTime:          useTimeSeconds,
		IsStream:         isStream,
		Group:            group,
		BusinessGroup:    c.GetString("business_group"),
		Ip: func() string {
			if needRecordIp {
				return c.ClientIP()
			}
			return ""
		}(),
		RequestId: requestId,
		Other:     otherStr,
	}
	err := LOG_DB.Create(log).Error
	if err != nil {
		logger.LogError(c, "failed to record log: "+err.Error())
	}
}

type RecordConsumeLogParams struct {
	ChannelId        int                    `json:"channel_id"`
	PromptTokens     int                    `json:"prompt_tokens"`
	CompletionTokens int                    `json:"completion_tokens"`
	ModelName        string                 `json:"model_name"`
	TokenName        string                 `json:"token_name"`
	Quota            int                    `json:"quota"`
	Content          string                 `json:"content"`
	TokenId          int                    `json:"token_id"`
	UseTimeSeconds   int                    `json:"use_time_seconds"`
	IsStream         bool                   `json:"is_stream"`
	Group            string                 `json:"group"`
	BusinessGroup    string                 `json:"business_group"`
	Other            map[string]interface{} `json:"other"`
}

func RecordConsumeLog(c *gin.Context, userId int, params RecordConsumeLogParams) {
	if !common.LogConsumeEnabled {
		return
	}
	logger.LogInfo(c, fmt.Sprintf("record consume log: userId=%d, params=%s", userId, common.GetJsonString(params)))
	username := c.GetString("username")
	requestId := c.GetString(common.RequestIdKey)
	otherStr := common.MapToJsonStr(params.Other)
	// 判断是否需要记录 IP
	needRecordIp := false
	if settingMap, err := GetUserSetting(userId, false); err == nil {
		if settingMap.IsRecordIpLogEnabled() {
			needRecordIp = true
		}
	}
	log := &Log{
		UserId:           userId,
		Username:         username,
		CreatedAt:        common.GetTimestamp(),
		Type:             LogTypeConsume,
		Content:          params.Content,
		PromptTokens:     params.PromptTokens,
		CompletionTokens: params.CompletionTokens,
		TokenName:        params.TokenName,
		ModelName:        params.ModelName,
		Quota:            params.Quota,
		ChannelId:        params.ChannelId,
		TokenId:          params.TokenId,
		UseTime:          params.UseTimeSeconds,
		IsStream:         params.IsStream,
		Group:            params.Group,
		BusinessGroup: func() string {
			if strings.TrimSpace(params.BusinessGroup) != "" {
				return strings.TrimSpace(params.BusinessGroup)
			}
			return c.GetString("business_group")
		}(),
		Ip: func() string {
			if needRecordIp {
				return c.ClientIP()
			}
			return ""
		}(),
		RequestId: requestId,
		Other:     otherStr,
	}
	err := LOG_DB.Create(log).Error
	if err != nil {
		logger.LogError(c, "failed to record log: "+err.Error())
	}
	if common.DataExportEnabled {
		gopool.Go(func() {
			LogQuotaData(userId, username, params.ModelName, params.Quota, common.GetTimestamp(), params.PromptTokens+params.CompletionTokens)
		})
	}
}

type RecordTaskBillingLogParams struct {
	UserId    int
	LogType   int
	Content   string
	ChannelId int
	ModelName string
	Quota     int
	TokenId   int
	Group     string
	Other     map[string]interface{}
}

func RecordTaskBillingLog(params RecordTaskBillingLogParams) {
	if params.LogType == LogTypeConsume && !common.LogConsumeEnabled {
		return
	}
	username, _ := GetUsernameById(params.UserId, false)
	tokenName := ""
	businessGroup := ""
	if params.TokenId > 0 {
		if token, err := GetTokenById(params.TokenId); err == nil {
			tokenName = token.Name
			businessGroup = token.BusinessGroup
		}
	}
	log := &Log{
		UserId:    params.UserId,
		Username:  username,
		CreatedAt: common.GetTimestamp(),
		Type:      params.LogType,
		Content:   params.Content,
		TokenName: tokenName,
		ModelName: params.ModelName,
		Quota:     params.Quota,
		ChannelId: params.ChannelId,
		TokenId:   params.TokenId,
		Group:     params.Group,
		BusinessGroup: businessGroup,
		Other:     common.MapToJsonStr(params.Other),
	}
	err := LOG_DB.Create(log).Error
	if err != nil {
		common.SysLog("failed to record task billing log: " + err.Error())
	} else if params.LogType == LogTypeConsume && params.Quota > 0 {
		// 不影响主流程：后台任务消耗也计入“今日消耗达标参与”
		gopool.Go(func() {
			tryJoinActivityLotteryByDailyConsume(params.UserId, params.Quota, time.Now())
		})
	}
}

func GetAllLogs(logType int, startTimestamp int64, endTimestamp int64, userId int, modelName string, username string, tokenName string, startIdx int, num int, channel int, group string, businessGroup string, requestId string, errorMessage string, statusCode string, subscriptionId int, subscriptionPlanId int, allowSensitivePreview bool) (logs []*Log, total int64, err error) {
	tx, err := buildAdminLogsQuery(logType, startTimestamp, endTimestamp, userId, modelName, username, tokenName, channel, group, businessGroup, requestId, errorMessage, statusCode, subscriptionId, subscriptionPlanId)
	if err != nil {
		return nil, 0, err
	}
	err = tx.Model(&Log{}).Count(&total).Error
	if err != nil {
		return nil, 0, err
	}
	// 性能 #5116: 按 created_at desc 排序以利用 (created_at, ...) 复合索引；
	// id desc 作为同一时间戳内的稳定兜底。导出 keyset 分页仍保持 id desc，不在此列。
	err = tx.Order("logs.created_at desc, logs.id desc").Limit(num).Offset(startIdx).Find(&logs).Error
	if err != nil {
		return nil, 0, err
	}
	if err = attachChannelNamesToLogs(logs); err != nil {
		return logs, total, err
	}
	formatLogs(logs, startIdx, false, false, allowSensitivePreview)

	return logs, total, err
}

const logSearchCountLimit = 10000
const logExportLimit = 50000

var logExportBatchSize = 500

func buildAdminLogsQuery(logType int, startTimestamp int64, endTimestamp int64, userId int, modelName string, username string, tokenName string, channel int, group string, businessGroup string, requestId string, errorMessage string, statusCode string, subscriptionId int, subscriptionPlanId int) (*gorm.DB, error) {
	var tx *gorm.DB
	if logType == LogTypeUnknown {
		tx = LOG_DB
	} else {
		tx = LOG_DB.Where("logs.type = ?", logType)
	}
	tx = applyErrorLogVisibilityFilter(tx, logType, !common.ErrorLogDisplayEnabled && !common.AdminErrorLogDisplayEnabled)

	var err error
	// 修复 #5097: 文本过滤无显式 % 时精确匹配，有 % 时走转义模糊，
	// 避免用户输入中的 `_`/`%` 被当作通配符（如 "gpt_4" 误匹配 "gpt-4"）。
	if tx, err = applyExplicitLogTextFilter(tx, "logs.model_name", modelName); err != nil {
		return nil, err
	}
	if userId > 0 {
		tx = tx.Where("logs.user_id = ?", userId)
	}
	if tx, err = applyExplicitLogTextFilter(tx, "logs.username", username); err != nil {
		return nil, err
	}
	if tx, err = applyExplicitLogTextFilter(tx, "logs.token_name", tokenName); err != nil {
		return nil, err
	}
	if requestId != "" {
		tx = tx.Where("logs.request_id = ?", requestId)
	}
	if errorMessage != "" {
		errorPattern := buildLogContentSearchPattern(errorMessage)
		tx = tx.Where("(logs.content LIKE ? ESCAPE '!' OR logs.other LIKE ? ESCAPE '!')", errorPattern, errorPattern)
	}
	if statusCode != "" {
		statusCodeExact, statusCodePrefix := buildStatusCodeSearchPatterns(statusCode)
		tx = tx.Where("(logs.content = ? OR logs.content LIKE ? ESCAPE '!')", statusCodeExact, statusCodePrefix)
	}
	if startTimestamp != 0 {
		tx = tx.Where("logs.created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("logs.created_at <= ?", endTimestamp)
	}
	if channel != 0 {
		tx = tx.Where("logs.channel_id = ?", channel)
	}
	if group != "" {
		tx = tx.Where("logs."+logGroupCol+" = ?", group)
	}
	if businessGroup != "" {
		tx = tx.Where("logs.business_group = ?", businessGroup)
	}
	if subscriptionId > 0 {
		tx = applySubscriptionJSONIdFilter(tx, "subscription_id", subscriptionId)
	}
	if subscriptionPlanId > 0 {
		tx = applySubscriptionJSONIdFilter(tx, "subscription_plan_id", subscriptionPlanId)
	}
	return tx, nil
}

// applyExplicitLogTextFilter 仅在用户显式提供 % 通配符时才走转义 LIKE 模糊匹配，
// 否则做精确等值匹配。这样可避免用户输入中的 `_`/`%` 被无意当作通配符。
// 修复 #5097。
func applyExplicitLogTextFilter(tx *gorm.DB, column string, value string) (*gorm.DB, error) {
	if value == "" {
		return tx, nil
	}
	if strings.Contains(value, "%") {
		pattern, err := sanitizeLikePattern(value)
		if err != nil {
			return nil, err
		}
		return tx.Where(column+" LIKE ? ESCAPE '!'", pattern), nil
	}
	return tx.Where(column+" = ?", value), nil
}

func buildUserLogsQuery(userId int, logType int, startTimestamp int64, endTimestamp int64, modelName string, tokenName string, group string, businessGroup string, requestId string, errorMessage string, statusCode string, subscriptionId int, subscriptionPlanId int) (*gorm.DB, error) {
	var tx *gorm.DB
	if logType == LogTypeUnknown {
		tx = LOG_DB.Where("logs.user_id = ?", userId)
	} else {
		tx = LOG_DB.Where("logs.user_id = ? and logs.type = ?", userId, logType)
	}
	tx = applyErrorLogVisibilityFilter(tx, logType, !common.ErrorDetailsEnabled || !common.ErrorLogDisplayEnabled)

	if modelName != "" {
		modelNamePattern, err := sanitizeLikePattern(modelName)
		if err != nil {
			return nil, err
		}
		tx = tx.Where("logs.model_name LIKE ? ESCAPE '!'", modelNamePattern)
	}
	if tokenName != "" {
		tx = tx.Where("logs.token_name = ?", tokenName)
	}
	if requestId != "" {
		tx = tx.Where("logs.request_id = ?", requestId)
	}
	if errorMessage != "" {
		errorPattern := buildLogContentSearchPattern(errorMessage)
		tx = tx.Where("(logs.content LIKE ? ESCAPE '!' OR logs.other LIKE ? ESCAPE '!')", errorPattern, errorPattern)
	}
	if statusCode != "" {
		statusCodeExact, statusCodePrefix := buildStatusCodeSearchPatterns(statusCode)
		tx = tx.Where("(logs.content = ? OR logs.content LIKE ? ESCAPE '!')", statusCodeExact, statusCodePrefix)
	}
	if startTimestamp != 0 {
		tx = tx.Where("logs.created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("logs.created_at <= ?", endTimestamp)
	}
	if group != "" {
		tx = tx.Where("logs."+logGroupCol+" = ?", group)
	}
	if businessGroup != "" {
		tx = tx.Where("logs.business_group = ?", businessGroup)
	}
	if subscriptionId > 0 {
		tx = applySubscriptionJSONIdFilter(tx, "subscription_id", subscriptionId)
	}
	if subscriptionPlanId > 0 {
		tx = applySubscriptionJSONIdFilter(tx, "subscription_plan_id", subscriptionPlanId)
	}
	return tx, nil
}

func attachChannelNamesToLogs(logs []*Log) error {
	channelIds := types.NewSet[int]()
	for _, log := range logs {
		if log.ChannelId != 0 {
			channelIds.Add(log.ChannelId)
		}
	}

	if channelIds.Len() == 0 {
		return nil
	}

	var channels []struct {
		Id   int     `gorm:"column:id"`
		Name string  `gorm:"column:name"`
		Tag  *string `gorm:"column:tag"`
	}
	if common.MemoryCacheEnabled {
		for _, channelId := range channelIds.Items() {
			if cacheChannel, err := CacheGetChannel(channelId); err == nil {
				channels = append(channels, struct {
					Id   int     `gorm:"column:id"`
					Name string  `gorm:"column:name"`
					Tag  *string `gorm:"column:tag"`
				}{
					Id:   channelId,
					Name: cacheChannel.Name,
					Tag:  cacheChannel.Tag,
				})
			}
		}
	} else {
		if err := DB.Table("channels").Select("id, name, tag").Where("id IN ?", channelIds.Items()).Find(&channels).Error; err != nil {
			return err
		}
	}
	type channelLogMetadata struct {
		name string
		tag  string
	}
	channelMap := make(map[int]channelLogMetadata, len(channels))
	for _, channel := range channels {
		metadata := channelLogMetadata{name: channel.Name}
		if channel.Tag != nil {
			metadata.tag = *channel.Tag
		}
		channelMap[channel.Id] = metadata
	}
	for i := range logs {
		metadata := channelMap[logs[i].ChannelId]
		logs[i].ChannelName = metadata.name
		logs[i].ChannelTag = metadata.tag
	}
	return nil
}

func GetUserLogs(userId int, logType int, startTimestamp int64, endTimestamp int64, modelName string, tokenName string, startIdx int, num int, group string, businessGroup string, requestId string, errorMessage string, statusCode string, subscriptionId int, subscriptionPlanId int, allowSensitivePreview bool) (logs []*Log, total int64, err error) {
	tx, err := buildUserLogsQuery(userId, logType, startTimestamp, endTimestamp, modelName, tokenName, group, businessGroup, requestId, errorMessage, statusCode, subscriptionId, subscriptionPlanId)
	if err != nil {
		return nil, 0, err
	}
	err = tx.Model(&Log{}).Limit(logSearchCountLimit).Count(&total).Error
	if err != nil {
		common.SysError("failed to count user logs: " + err.Error())
		return nil, 0, errors.New("查询日志失败")
	}
	// 性能 #5116: 按 created_at desc 排序以利用 (created_at, ...) 复合索引；
	// id desc 作为同一时间戳内的稳定兜底（也让分页更确定）。
	err = tx.Order("logs.created_at desc, logs.id desc").Limit(num).Offset(startIdx).Find(&logs).Error
	if err != nil {
		common.SysError("failed to search user logs: " + err.Error())
		return nil, 0, errors.New("查询日志失败")
	}

	formatLogs(logs, startIdx, true, true, allowSensitivePreview)
	return logs, total, err
}

func logExportColumns(compact bool) []string {
	columns := []string{
		"logs.id",
		"logs.created_at",
		"logs.type",
		"logs.user_id",
		"logs.username",
		"logs.token_name",
		"logs.model_name",
		"logs.quota",
		"logs.prompt_tokens",
		"logs.completion_tokens",
		"logs.use_time",
		"logs.is_stream",
		"logs.channel_id",
		"logs." + logGroupCol,
		"logs.business_group",
		"logs.ip",
		"logs.request_id",
	}
	if !compact {
		columns = append(columns, "logs.content", "logs.other")
	}
	return columns
}

func findLogsForExport(tx *gorm.DB, limit int, compact bool) ([]*Log, error) {
	if limit <= 0 {
		return []*Log{}, nil
	}
	batchSize := logExportBatchSize
	if batchSize <= 0 {
		batchSize = limit
	}

	logs := make([]*Log, 0)
	lastId := 0
	for len(logs) < limit {
		remaining := limit - len(logs)
		currentBatchSize := batchSize
		if currentBatchSize > remaining {
			currentBatchSize = remaining
		}

		var batch []*Log
		batchQuery := tx.Select(logExportColumns(compact)).Order("logs.id desc").Limit(currentBatchSize)
		if lastId > 0 {
			batchQuery = batchQuery.Where("logs.id < ?", lastId)
		}
		if err := batchQuery.Find(&batch).Error; err != nil {
			return nil, err
		}
		if len(batch) == 0 {
			break
		}

		logs = append(logs, batch...)
		lastId = batch[len(batch)-1].Id
		if len(batch) < currentBatchSize {
			break
		}
	}
	return logs, nil
}

// LogExportFilters 承载账单导出/统计专用的 opt-in 多值筛选与零输出排除。
// 现有单值查询构造器不受影响；仅导出与统计路径消费本结构。
type LogExportFilters struct {
	TokenNames                  []string
	ModelNames                  []string
	Groups                      []string
	BusinessGroups              []string
	ExcludeStreamZeroCompletion bool
	// NonChatModels 为空且 ExcludeStreamZeroCompletion 时，由调用方用 GetNonChatModelNames() 填充。
	NonChatModels []string
}

// applyLogExtraFilters 按列前缀（导出用 "logs."，统计用 ""）追加多值 IN 过滤与零输出排除。
// prefix 之后拼接的均为固定列名/内部常量，非用户输入，无注入风险。
func applyLogExtraFilters(tx *gorm.DB, f LogExportFilters, prefix string) *gorm.DB {
	if len(f.TokenNames) > 0 {
		tx = tx.Where(prefix+"token_name IN ?", f.TokenNames)
	}
	if len(f.ModelNames) > 0 {
		tx = tx.Where(prefix+"model_name IN ?", f.ModelNames)
	}
	if len(f.Groups) > 0 {
		tx = tx.Where(prefix+logGroupCol+" IN ?", f.Groups)
	}
	if len(f.BusinessGroups) > 0 {
		tx = tx.Where(prefix+"business_group IN ?", f.BusinessGroups)
	}
	if f.ExcludeStreamZeroCompletion {
		base := "NOT (" + prefix + "is_stream = ? AND " + prefix + "completion_tokens = 0 AND " + prefix + "quota > 0"
		if len(f.NonChatModels) > 0 {
			tx = tx.Where(base+" AND "+prefix+"model_name NOT IN ?)", true, f.NonChatModels)
		} else {
			tx = tx.Where(base+")", true)
		}
	}
	return tx
}

func GetAllLogsForExport(logType int, startTimestamp int64, endTimestamp int64, userId int, modelName string, username string, tokenName string, channel int, group string, businessGroup string, requestId string, errorMessage string, statusCode string, subscriptionId int, subscriptionPlanId int, allowSensitivePreview bool, compact bool, filters LogExportFilters) (logs []*Log, total int64, truncated bool, err error) {
	tx, err := buildAdminLogsQuery(logType, startTimestamp, endTimestamp, userId, modelName, username, tokenName, channel, group, businessGroup, requestId, errorMessage, statusCode, subscriptionId, subscriptionPlanId)
	if err != nil {
		return nil, 0, false, err
	}
	if filters.ExcludeStreamZeroCompletion && filters.NonChatModels == nil {
		filters.NonChatModels = GetNonChatModelNames()
	}
	tx = applyLogExtraFilters(tx, filters, "logs.")
	err = tx.Model(&Log{}).Count(&total).Error
	if err != nil {
		return nil, 0, false, err
	}
	limit := logExportLimit
	truncated = total > int64(limit)
	logs, err = findLogsForExport(tx, limit, compact)
	if err != nil {
		return nil, 0, false, err
	}
	if err = attachChannelNamesToLogs(logs); err != nil {
		return nil, 0, false, err
	}
	if !compact {
		formatLogs(logs, 0, false, false, allowSensitivePreview)
	}
	return logs, total, truncated, nil
}

func GetUserLogsForExport(userId int, logType int, startTimestamp int64, endTimestamp int64, modelName string, tokenName string, group string, businessGroup string, requestId string, errorMessage string, statusCode string, subscriptionId int, subscriptionPlanId int, allowSensitivePreview bool, compact bool, filters LogExportFilters) (logs []*Log, total int64, truncated bool, err error) {
	tx, err := buildUserLogsQuery(userId, logType, startTimestamp, endTimestamp, modelName, tokenName, group, businessGroup, requestId, errorMessage, statusCode, subscriptionId, subscriptionPlanId)
	if err != nil {
		return nil, 0, false, err
	}
	if filters.ExcludeStreamZeroCompletion && filters.NonChatModels == nil {
		filters.NonChatModels = GetNonChatModelNames()
	}
	tx = applyLogExtraFilters(tx, filters, "logs.")
	err = tx.Model(&Log{}).Limit(logExportLimit).Count(&total).Error
	if err != nil {
		common.SysError("failed to count user logs for export: " + err.Error())
		return nil, 0, false, errors.New("导出日志失败")
	}
	limit := logExportLimit
	truncated = total > int64(limit)
	logs, err = findLogsForExport(tx, limit, compact)
	if err != nil {
		common.SysError("failed to export user logs: " + err.Error())
		return nil, 0, false, errors.New("导出日志失败")
	}
	if !compact {
		formatLogs(logs, 0, true, true, allowSensitivePreview)
	}
	for index := range logs {
		logs[index].Id = 0
		logs[index].ChannelName = ""
	}
	return logs, total, truncated, nil
}

func applyErrorLogVisibilityFilter(tx *gorm.DB, logType int, hideErrorLogs bool) *gorm.DB {
	if !hideErrorLogs {
		return tx
	}
	if logType == LogTypeError {
		return tx.Where("1 = 0")
	}
	return tx.Where("logs.type <> ?", LogTypeError)
}

func buildLogContentSearchPattern(input string) string {
	escaped := strings.ReplaceAll(input, "!", "!!")
	escaped = strings.ReplaceAll(escaped, "%", "!%")
	escaped = strings.ReplaceAll(escaped, "_", "!_")
	return "%" + escaped + "%"
}

func buildStatusCodeSearchPatterns(statusCode string) (string, string) {
	escaped := strings.ReplaceAll(statusCode, "!", "!!")
	escaped = strings.ReplaceAll(escaped, "%", "!%")
	escaped = strings.ReplaceAll(escaped, "_", "!_")
	return "status_code=" + escaped, "status_code=" + escaped + ",%"
}

func GetSubscriptionConsumeLogs(userId int, subscriptionId int, planId int, filterUserId int, startTimestamp int64, endTimestamp int64, startIdx int, num int) (logs []*Log, total int64, summary *SubscriptionConsumeSummary, err error) {
	tx := buildSubscriptionConsumeLogsQuery(userId, subscriptionId, planId, filterUserId, startTimestamp, endTimestamp)
	err = tx.Model(&Log{}).Count(&total).Error
	if err != nil {
		return nil, 0, nil, err
	}
	err = tx.Order("logs.id desc").Limit(num).Offset(startIdx).Find(&logs).Error
	if err != nil {
		return nil, 0, nil, err
	}

	if err = attachSubscriptionResourceTypeToLogs(logs); err != nil {
		return nil, 0, nil, err
	}
	sanitizeSubscriptionConsumeLogs(logs)
	summary, err = summarizeSubscriptionConsumeLogs(userId, subscriptionId, planId, filterUserId, startTimestamp, endTimestamp)
	if err != nil {
		return nil, 0, nil, err
	}
	return logs, total, summary, nil
}

func applySubscriptionJSONIdFilter(tx *gorm.DB, key string, value int) *gorm.DB {
	valueStr := strconv.Itoa(value)
	return tx.Where(
		"(logs.other LIKE ? OR logs.other LIKE ?)",
		`%"`+key+`":`+valueStr+`,%`,
		`%"`+key+`":`+valueStr+`}%`,
	)
}

func buildSubscriptionConsumeLogsQuery(userId int, subscriptionId int, planId int, filterUserId int, startTimestamp int64, endTimestamp int64) *gorm.DB {
	logDB := LOG_DB
	if logDB == nil {
		logDB = DB
	}
	tx := logDB.Table("logs").Where("logs.type = ?", LogTypeConsume)
	tx = tx.Where("logs.other LIKE ?", `%"billing_source":"subscription"%`)

	if userId > 0 {
		tx = tx.Where("logs.user_id = ?", userId)
	}
	if filterUserId > 0 {
		tx = tx.Where("logs.user_id = ?", filterUserId)
	}
	if subscriptionId > 0 {
		tx = applySubscriptionJSONIdFilter(tx, "subscription_id", subscriptionId)
	}
	if planId > 0 {
		tx = applySubscriptionJSONIdFilter(tx, "subscription_plan_id", planId)
	}
	if startTimestamp != 0 {
		tx = tx.Where("logs.created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("logs.created_at <= ?", endTimestamp)
	}
	return tx
}

func summarizeSubscriptionConsumeLogs(userId int, subscriptionId int, planId int, filterUserId int, startTimestamp int64, endTimestamp int64) (*SubscriptionConsumeSummary, error) {
	return summarizeSubscriptionConsumeLogsWithExcludedRequestIDs(userId, subscriptionId, planId, filterUserId, startTimestamp, endTimestamp, nil)
}

func summarizeSubscriptionConsumeLogsWithExcludedRequestIDs(userId int, subscriptionId int, planId int, filterUserId int, startTimestamp int64, endTimestamp int64, excludedRequestIDs map[string]struct{}) (*SubscriptionConsumeSummary, error) {
	rows := make([]subscriptionConsumeSummaryRow, 0)
	tx := buildSubscriptionConsumeLogsQuery(userId, subscriptionId, planId, filterUserId, startTimestamp, endTimestamp)
	if err := tx.Select("logs.created_at, logs.request_id, logs.other").Find(&rows).Error; err != nil {
		return nil, err
	}

	resourceTypeMap, err := buildSubscriptionResourceTypeMap(rows)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	location := now.Location()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, location).Unix()
	sevenDayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, location).AddDate(0, 0, -6).Unix()

	summary := &SubscriptionConsumeSummary{}
	for _, row := range rows {
		if excludedRequestIDs != nil && row.RequestId != "" {
			if _, ok := excludedRequestIDs[row.RequestId]; ok {
				continue
			}
		}
		otherMap := map[string]interface{}{}
		if err := common.UnmarshalJsonStr(row.Other, &otherMap); err != nil {
			continue
		}
		subscriptionID := readIntFromMap(otherMap, "subscription_id")
		resourceType := resourceTypeMap[subscriptionID]
		if resourceType == "" {
			resourceType = SubscriptionResourceQuota
		}
		consumed := readSubscriptionConsumedFromOther(otherMap, resourceType)
		if consumed <= 0 {
			continue
		}

		summary.TotalSuccessCount++
		if resourceType == SubscriptionResourceRequestCount {
			summary.TotalRequestConsumed += consumed
		} else {
			summary.TotalQuotaConsumed += consumed
		}

		if row.CreatedAt >= todayStart {
			summary.TodaySuccessCount++
			if resourceType == SubscriptionResourceRequestCount {
				summary.TodayRequestConsumed += consumed
			} else {
				summary.TodayQuotaConsumed += consumed
			}
		}
		if row.CreatedAt >= sevenDayStart {
			summary.SevenDaySuccessCount++
			if resourceType == SubscriptionResourceRequestCount {
				summary.SevenDayRequestConsumed += consumed
			} else {
				summary.SevenDayQuotaConsumed += consumed
			}
		}
	}
	return summary, nil
}

func readSubscriptionConsumedFromOther(otherMap map[string]interface{}, resourceType string) int64 {
	if resourceType == SubscriptionResourceRequestCount {
		if consumed := readInt64FromMap(otherMap, "subscription_request_count_consumed"); consumed > 0 {
			return consumed
		}
		if consumed := readInt64FromMap(otherMap, "subscription_consumed"); consumed > 0 {
			return consumed
		}
		if consumed := readInt64FromMap(otherMap, "subscription_pre_consumed_count"); consumed > 0 {
			return consumed
		}
		return 0
	}
	if consumed := readInt64FromMap(otherMap, "subscription_amount_consumed"); consumed > 0 {
		return consumed
	}
	if consumed := readInt64FromMap(otherMap, "subscription_consumed"); consumed > 0 {
		return consumed
	}
	preConsumed := readInt64FromMap(otherMap, "subscription_pre_consumed_amount")
	if preConsumed <= 0 {
		preConsumed = readInt64FromMap(otherMap, "subscription_pre_consumed")
	}
	postDelta := readInt64FromMap(otherMap, "subscription_post_delta")
	fallback := preConsumed + postDelta
	if fallback > 0 {
		return fallback
	}
	return 0
}

func buildSubscriptionResourceTypeMap(rows []subscriptionConsumeSummaryRow) (map[int]string, error) {
	subscriptionIDs := types.NewSet[int]()
	for _, row := range rows {
		otherMap := map[string]interface{}{}
		if err := common.UnmarshalJsonStr(row.Other, &otherMap); err != nil {
			continue
		}
		subscriptionID := readIntFromMap(otherMap, "subscription_id")
		if subscriptionID > 0 {
			subscriptionIDs.Add(subscriptionID)
		}
	}
	if subscriptionIDs.Len() == 0 {
		return map[int]string{}, nil
	}

	var subscriptions []UserSubscription
	if err := DB.Select("id, resource_type").Where("id IN ?", subscriptionIDs.Items()).Find(&subscriptions).Error; err != nil {
		return nil, err
	}
	result := make(map[int]string, len(subscriptions))
	for _, subscription := range subscriptions {
		result[subscription.Id] = NormalizeSubscriptionResourceType(subscription.ResourceType)
	}
	return result, nil
}

func sanitizeSubscriptionConsumeLogs(logs []*Log) {
	if len(logs) == 0 {
		return
	}
	allowedOtherKeys := map[string]struct{}{
		"billing_source":             {},
		"subscription_id":            {},
		"subscription_plan_id":       {},
		"subscription_resource_type": {},
		"subscription_pre_consumed":  {},
		"subscription_post_delta":    {},
		"subscription_total":         {},
		"subscription_used":          {},
		"subscription_remain":        {},
		"subscription_consumed":      {},
		"wallet_quota_deducted":      {},
	}
	for _, log := range logs {
		if log == nil {
			continue
		}
		log.Username = ""
		log.TokenName = ""
		log.ModelName = ""
		log.Content = ""
		log.ChannelName = ""
		log.Ip = ""
		log.PromptTokens = 0
		log.CompletionTokens = 0
		log.UseTime = 0

		if strings.TrimSpace(log.Other) == "" {
			log.Other = "{}"
			continue
		}

		otherMap := map[string]interface{}{}
		if err := common.UnmarshalJsonStr(log.Other, &otherMap); err != nil {
			log.Other = "{}"
			continue
		}
		sanitized := make(map[string]interface{}, len(allowedOtherKeys))
		for key := range allowedOtherKeys {
			if value, ok := otherMap[key]; ok {
				sanitized[key] = value
			}
		}
		log.Other = common.MapToJsonStr(sanitized)
	}
}

func attachSubscriptionResourceTypeToLogs(logs []*Log) error {
	if len(logs) == 0 {
		return nil
	}
	rows := make([]subscriptionConsumeSummaryRow, 0, len(logs))
	for _, log := range logs {
		if log == nil || strings.TrimSpace(log.Other) == "" {
			continue
		}
		rows = append(rows, subscriptionConsumeSummaryRow{
			CreatedAt: log.CreatedAt,
			Other:     log.Other,
		})
	}
	resourceTypeMap, err := buildSubscriptionResourceTypeMap(rows)
	if err != nil {
		return err
	}
	if len(resourceTypeMap) == 0 {
		return nil
	}
	for _, log := range logs {
		if log == nil || strings.TrimSpace(log.Other) == "" {
			continue
		}
		otherMap := map[string]interface{}{}
		if err := common.UnmarshalJsonStr(log.Other, &otherMap); err != nil {
			continue
		}
		subscriptionID := readIntFromMap(otherMap, "subscription_id")
		if subscriptionID <= 0 {
			continue
		}
		resourceType := resourceTypeMap[subscriptionID]
		if resourceType == "" {
			continue
		}
		otherMap["subscription_resource_type"] = resourceType
		log.Other = common.MapToJsonStr(otherMap)
	}
	return nil
}

func readIntFromMap(values map[string]interface{}, key string) int {
	return int(readInt64FromMap(values, key))
}

func readInt64FromMap(values map[string]interface{}, key string) int64 {
	if values == nil {
		return 0
	}
	value, ok := values[key]
	if !ok || value == nil {
		return 0
	}
	switch typed := value.(type) {
	case int:
		return int64(typed)
	case int8:
		return int64(typed)
	case int16:
		return int64(typed)
	case int32:
		return int64(typed)
	case int64:
		return typed
	case float32:
		return int64(typed)
	case float64:
		return int64(typed)
	case json.Number:
		if n, err := typed.Int64(); err == nil {
			return n
		}
	case string:
		if n, err := strconv.ParseInt(strings.TrimSpace(typed), 10, 64); err == nil {
			return n
		}
	}
	return 0
}

type Stat struct {
	BalanceQuota           int64           `json:"balance_quota"`
	Quota                  int             `json:"quota"`
	RequestCount           int64           `json:"request_count"`
	Rpm                    int             `json:"rpm"`
	Tpm                    int             `json:"tpm"`
	PromptTokens           int64           `json:"prompt_tokens"`
	CompletionTokens       int64           `json:"completion_tokens"`
	TotalTokens            int64           `json:"total_tokens"`
	AverageUseTime         float64         `json:"average_use_time"`
	PromptCacheHitCount    int64           `json:"prompt_cache_hit_count"`
	PromptCacheTotalCount  int64           `json:"prompt_cache_total_count"`
	PromptCacheHitRate     float64         `json:"prompt_cache_hit_rate"`
	PromptCacheInputTokens int64           `json:"prompt_cache_input_tokens"`
	PromptCacheReadTokens  int64           `json:"prompt_cache_read_tokens"`
	PromptCacheWriteTokens int64           `json:"prompt_cache_write_tokens"`
	PromptCacheOpenAI      PromptCacheStat `gorm:"-"`
	PromptCacheClaude      PromptCacheStat `gorm:"-"`
}

type LeaderboardRegion struct {
	Country string `json:"country"`
	City    string `json:"city"`
	Count   int    `json:"count"`
}

type LeaderboardAnalysis struct {
	Estimate      int                 `json:"estimate"`
	EstimateIsMin bool                `json:"estimate_is_min"`
	Confidence    string              `json:"confidence"`
	IpCount       int                 `json:"ip_count"`
	TokenCount    int                 `json:"token_count"`
	TopRegions    []LeaderboardRegion `json:"top_regions"`
	HasIpData     bool                `json:"has_ip_data"`
}

type LeaderboardEntry struct {
	UserId       int                 `json:"user_id" gorm:"column:user_id"`
	Username     string              `json:"username" gorm:"-"`
	TotalQuota   int64               `json:"total_quota" gorm:"column:total_quota"`
	TotalTokens  int64               `json:"total_tokens" gorm:"column:total_tokens"`
	RequestCount int64               `json:"request_count" gorm:"column:request_count"`
	TopModel     string              `json:"top_model" gorm:"-"`
	Analysis     LeaderboardAnalysis `json:"analysis" gorm:"-"`
}

type LeaderboardSummary struct {
	TotalQuota        int64 `json:"total_quota"`
	TotalTokens       int64 `json:"total_tokens"`
	TotalRequestCount int64 `json:"total_request_count"`
	Top10Quota        int64 `json:"top10_quota"`
	Top10Tokens       int64 `json:"top10_tokens"`
	Top10RequestCount int64 `json:"top10_request_count"`
}

type LeaderboardResponse struct {
	Summary     *LeaderboardSummary `json:"summary,omitempty"`
	Leaderboard []LeaderboardEntry  `json:"leaderboard"`
	Page        int                 `json:"page"`
	PageSize    int                 `json:"page_size"`
	Total       int                 `json:"total"`
}

type GroupLogHealthStatsQuery struct {
	StartTimestamp        int64
	EndTimestamp          int64
	UserId                int
	Username              string
	TokenName             string
	ModelName             string
	Channel               int
	Group                 string
	Groups                []string
	StatusCode            string
	RequestId             string
	ErrorMessage          string
	SubscriptionId        int
	SubscriptionPlanId    int
	IgnoreRateLimitErrors bool
}

type GroupLogHealthStat struct {
	Group        string                      `json:"group"`
	TotalCount   int64                       `json:"total_count"`
	SuccessCount int64                       `json:"success_count"`
	ErrorCount   int64                       `json:"error_count"`
	Quota        int64                       `json:"quota"`
	Tokens       int64                       `json:"tokens"`
	AvgUseTime   float64                     `json:"avg_use_time"`
	SuccessRate  float64                     `json:"success_rate"`
	FirstSeenAt  int64                       `json:"first_seen_at"`
	LastSeenAt   int64                       `json:"last_seen_at"`
	ErrorReasons []GroupLogHealthErrorReason `json:"error_reasons"`
}

type GroupLogHealthErrorReason struct {
	Content    string `json:"content"`
	Count      int64  `json:"count"`
	StatusCode string `json:"status_code"`
}

type groupLogHealthStatRow struct {
	Group        string  `gorm:"column:group_name"`
	TotalCount   int64   `gorm:"column:total_count"`
	SuccessCount int64   `gorm:"column:success_count"`
	ErrorCount   int64   `gorm:"column:error_count"`
	Quota        int64   `gorm:"column:quota"`
	Tokens       int64   `gorm:"column:tokens"`
	AvgUseTime   float64 `gorm:"column:avg_use_time"`
	FirstSeenAt  int64   `gorm:"column:first_seen_at"`
	LastSeenAt   int64   `gorm:"column:last_seen_at"`
}

type groupLogHealthErrorReasonRow struct {
	Group   string `gorm:"column:group_name"`
	Content string `gorm:"column:content"`
	Count   int64  `gorm:"column:reason_count"`
}

const groupLogHealthErrorReasonLimit = 3

func normalizeLogGroup(group string) string {
	group = strings.TrimSpace(group)
	if group == "" {
		return "default"
	}
	return group
}

func extractLogStatusCode(content string) string {
	const prefix = "status_code="
	if !strings.HasPrefix(content, prefix) {
		return ""
	}
	remainder := strings.TrimPrefix(content, prefix)
	if idx := strings.Index(remainder, ","); idx >= 0 {
		return strings.TrimSpace(remainder[:idx])
	}
	return strings.TrimSpace(remainder)
}

func buildGroupLogHealthQuery(query GroupLogHealthStatsQuery, groupCol string, logTypes []int) (*gorm.DB, error) {
	tx := LOG_DB.Table("logs").Where("type IN ?", logTypes)
	if query.StartTimestamp > 0 {
		tx = tx.Where("created_at >= ?", query.StartTimestamp)
	}
	if query.EndTimestamp > 0 {
		tx = tx.Where("created_at <= ?", query.EndTimestamp)
	}
	if query.UserId > 0 {
		tx = tx.Where("user_id = ?", query.UserId)
	}
	if query.Username != "" {
		tx = tx.Where("username = ?", query.Username)
	}
	if query.TokenName != "" {
		tx = tx.Where("token_name = ?", query.TokenName)
	}
	if query.ModelName != "" {
		modelNamePattern, err := sanitizeLikePattern(query.ModelName)
		if err != nil {
			return nil, err
		}
		tx = tx.Where("model_name LIKE ? ESCAPE '!'", modelNamePattern)
	}
	if query.Channel != 0 {
		tx = tx.Where("channel_id = ?", query.Channel)
	}
	if query.Group != "" {
		tx = tx.Where(groupCol+" = ?", query.Group)
	} else if len(query.Groups) > 0 {
		tx = tx.Where(groupCol+" IN ?", query.Groups)
	}
	if query.RequestId != "" {
		tx = tx.Where("request_id = ?", query.RequestId)
	}
	if query.ErrorMessage != "" {
		errorPattern := buildLogContentSearchPattern(query.ErrorMessage)
		tx = tx.Where("(content LIKE ? ESCAPE '!' OR other LIKE ? ESCAPE '!')", errorPattern, errorPattern)
	}
	if query.SubscriptionId > 0 {
		tx = applySubscriptionJSONIdFilter(tx, "subscription_id", query.SubscriptionId)
	}
	if query.SubscriptionPlanId > 0 {
		tx = applySubscriptionJSONIdFilter(tx, "subscription_plan_id", query.SubscriptionPlanId)
	}
	if query.StatusCode != "" {
		statusCodeExact, statusCodePrefix := buildStatusCodeSearchPatterns(query.StatusCode)
		tx = tx.Where("(content = ? OR content LIKE ? ESCAPE '!')", statusCodeExact, statusCodePrefix)
	}
	if query.IgnoreRateLimitErrors {
		statusCodeExact, statusCodePrefix := buildStatusCodeSearchPatterns("429")
		tx = tx.Where("type != ? OR (content != ? AND content NOT LIKE ? ESCAPE '!')", LogTypeError, statusCodeExact, statusCodePrefix)
	}
	return tx, nil
}

func getGroupLogHealthErrorReasons(query GroupLogHealthStatsQuery, groupCol string) (map[string][]GroupLogHealthErrorReason, error) {
	tx, err := buildGroupLogHealthQuery(query, groupCol, []int{LogTypeError})
	if err != nil {
		return nil, err
	}

	rows := make([]groupLogHealthErrorReasonRow, 0)
	if err = tx.Select(groupCol + " as group_name, content, count(*) as reason_count").
		Clauses(clause.GroupBy{Columns: []clause.Column{{Name: groupCol, Raw: true}, {Name: "content"}}}).
		Order("reason_count desc").
		Order("content asc").
		Find(&rows).Error; err != nil {
		return nil, err
	}

	reasonsByGroup := make(map[string][]GroupLogHealthErrorReason)
	for _, row := range rows {
		group := normalizeLogGroup(row.Group)
		if len(reasonsByGroup[group]) >= groupLogHealthErrorReasonLimit {
			continue
		}
		reasonsByGroup[group] = append(reasonsByGroup[group], GroupLogHealthErrorReason{
			Content:    row.Content,
			Count:      row.Count,
			StatusCode: extractLogStatusCode(row.Content),
		})
	}
	return reasonsByGroup, nil
}

func GetGroupLogHealthStats(query GroupLogHealthStatsQuery) ([]GroupLogHealthStat, error) {
	groupCol := logGroupCol
	if groupCol == "" {
		if common.UsingPostgreSQL {
			groupCol = `"group"`
		} else {
			groupCol = "`group`"
		}
	}
	tx, err := buildGroupLogHealthQuery(query, groupCol, []int{LogTypeConsume, LogTypeError})
	if err != nil {
		return nil, err
	}

	selectExpr := groupCol + " as group_name, " +
		"count(*) as total_count, " +
		"sum(case when type = ? then 1 else 0 end) as success_count, " +
		"sum(case when type = ? then 1 else 0 end) as error_count, " +
		"sum(case when type = ? then quota else 0 end) as quota, " +
		"sum(case when type = ? then prompt_tokens + completion_tokens else 0 end) as tokens, " +
		"avg(use_time) as avg_use_time, " +
		"min(created_at) as first_seen_at, " +
		"max(created_at) as last_seen_at"

	rows := make([]groupLogHealthStatRow, 0)
	if err = tx.Select(selectExpr, LogTypeConsume, LogTypeError, LogTypeConsume, LogTypeConsume).
		Clauses(clause.GroupBy{Columns: []clause.Column{{Name: groupCol, Raw: true}}}).
		Order("total_count desc").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	reasonsByGroup, err := getGroupLogHealthErrorReasons(query, groupCol)
	if err != nil {
		return nil, err
	}

	stats := make([]GroupLogHealthStat, 0, len(rows))
	for _, row := range rows {
		stat := GroupLogHealthStat{
			Group:        normalizeLogGroup(row.Group),
			TotalCount:   row.TotalCount,
			SuccessCount: row.SuccessCount,
			ErrorCount:   row.ErrorCount,
			Quota:        row.Quota,
			Tokens:       row.Tokens,
			AvgUseTime:   row.AvgUseTime,
			FirstSeenAt:  row.FirstSeenAt,
			LastSeenAt:   row.LastSeenAt,
			ErrorReasons: make([]GroupLogHealthErrorReason, 0),
		}
		if reasons, ok := reasonsByGroup[stat.Group]; ok {
			stat.ErrorReasons = reasons
		}
		if stat.TotalCount > 0 {
			stat.SuccessRate = float64(stat.SuccessCount) * 100 / float64(stat.TotalCount)
		}
		stats = append(stats, stat)
	}
	return stats, nil
}

func buildLogStatConsumeQuery(logType int, startTimestamp int64, endTimestamp int64, userId int, modelName string, username string, tokenName string, channel int, group string, businessGroup string, requestId string, errorMessage string, statusCode string, subscriptionId int, subscriptionPlanId int) (*gorm.DB, error) {
	tx := LOG_DB.Table("logs")
	if username != "" {
		tx = tx.Where("username = ?", username)
	}
	if userId > 0 {
		tx = tx.Where("user_id = ?", userId)
	}
	if tokenName != "" {
		tx = tx.Where("token_name = ?", tokenName)
	}
	if startTimestamp != 0 {
		tx = tx.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("created_at <= ?", endTimestamp)
	}
	if modelName != "" {
		modelNamePattern, err := sanitizeLikePattern(modelName)
		if err != nil {
			return nil, err
		}
		tx = tx.Where("model_name LIKE ? ESCAPE '!'", modelNamePattern)
	}
	if channel != 0 {
		tx = tx.Where("channel_id = ?", channel)
	}
	if group != "" {
		tx = tx.Where(logGroupCol+" = ?", group)
	}
	if businessGroup != "" {
		tx = tx.Where("business_group = ?", businessGroup)
	}
	if requestId != "" {
		tx = tx.Where("request_id = ?", requestId)
	}
	if errorMessage != "" {
		errorPattern := buildLogContentSearchPattern(errorMessage)
		tx = tx.Where("(content LIKE ? ESCAPE '!' OR other LIKE ? ESCAPE '!')", errorPattern, errorPattern)
	}
	if statusCode != "" {
		statusCodeExact, statusCodePrefix := buildStatusCodeSearchPatterns(statusCode)
		tx = tx.Where("(content = ? OR content LIKE ? ESCAPE '!')", statusCodeExact, statusCodePrefix)
	}
	if subscriptionId > 0 {
		tx = applySubscriptionJSONIdFilter(tx, "subscription_id", subscriptionId)
	}
	if subscriptionPlanId > 0 {
		tx = applySubscriptionJSONIdFilter(tx, "subscription_plan_id", subscriptionPlanId)
	}
	return tx.Where("type = ?", LogTypeConsume), nil
}

type PromptCacheStat struct {
	HitCount    int64
	TotalCount  int64
	InputTokens int64
	ReadTokens  int64
	WriteTokens int64
	HitRate     float64
}

type promptCacheAggregateRow struct {
	TotalCount        int64 `gorm:"column:total_count"`
	InputTokens       int64 `gorm:"column:input_tokens"`
	HitCount          int64 `gorm:"column:hit_count"`
	OpenAITotalCount  int64 `gorm:"column:openai_total_count"`
	OpenAIInputTokens int64 `gorm:"column:openai_input_tokens"`
	OpenAIHitCount    int64 `gorm:"column:openai_hit_count"`
	ClaudeTotalCount  int64 `gorm:"column:claude_total_count"`
	ClaudeInputTokens int64 `gorm:"column:claude_input_tokens"`
	ClaudeHitCount    int64 `gorm:"column:claude_hit_count"`
}

func sumPromptCacheStats(query *gorm.DB) (PromptCacheStat, PromptCacheStat, PromptCacheStat, error) {
	hitCondition := promptCacheHitConditionSQL()
	openAICondition := promptCacheOpenAIConditionSQL()
	claudeCondition := promptCacheClaudeConditionSQL()
	selectExpr := strings.Join([]string{
		"count(*) total_count",
		"COALESCE(sum(prompt_tokens), 0) input_tokens",
		promptCacheCountSQL(hitCondition) + " hit_count",
		promptCacheCountSQL(openAICondition) + " openai_total_count",
		promptCacheSumSQL(openAICondition, "prompt_tokens") + " openai_input_tokens",
		promptCacheCountSQL("("+openAICondition+" AND "+hitCondition+")") + " openai_hit_count",
		promptCacheCountSQL(claudeCondition) + " claude_total_count",
		promptCacheSumSQL(claudeCondition, "prompt_tokens") + " claude_input_tokens",
		promptCacheCountSQL("("+claudeCondition+" AND "+hitCondition+")") + " claude_hit_count",
	}, ", ")

	row := promptCacheAggregateRow{}
	if err := query.Select(selectExpr).Scan(&row).Error; err != nil {
		return PromptCacheStat{}, PromptCacheStat{}, PromptCacheStat{}, err
	}
	total := newPromptCacheStat(row.HitCount, row.TotalCount, row.InputTokens)
	openAI := newPromptCacheStat(row.OpenAIHitCount, row.OpenAITotalCount, row.OpenAIInputTokens)
	claude := newPromptCacheStat(row.ClaudeHitCount, row.ClaudeTotalCount, row.ClaudeInputTokens)
	return total, openAI, claude, nil
}

func newPromptCacheStat(hitCount int64, totalCount int64, inputTokens int64) PromptCacheStat {
	stat := PromptCacheStat{
		HitCount:    hitCount,
		TotalCount:  totalCount,
		InputTokens: inputTokens,
	}
	if totalCount > 0 {
		stat.HitRate = float64(hitCount) / float64(totalCount)
	}
	return stat
}

func promptCacheCountSQL(condition string) string {
	return "COALESCE(sum(CASE WHEN " + condition + " THEN 1 ELSE 0 END), 0)"
}

func promptCacheSumSQL(condition string, column string) string {
	return "COALESCE(sum(CASE WHEN " + condition + " THEN " + column + " ELSE 0 END), 0)"
}

func promptCacheHitConditionSQL() string {
	return `((other LIKE '%"cache_tokens":%' AND other NOT LIKE '%"cache_tokens":0%') OR (other LIKE '%"prompt_cache_hit_tokens":%' AND other NOT LIKE '%"prompt_cache_hit_tokens":0%'))`
}

func promptCacheOpenAIConditionSQL() string {
	return `(LOWER(model_name) LIKE 'gpt-%' OR LOWER(model_name) LIKE 'o1%' OR LOWER(model_name) LIKE 'o3%' OR LOWER(model_name) LIKE 'o4%' OR LOWER(model_name) LIKE 'chatgpt-%' OR LOWER(model_name) LIKE 'text-embedding-%' OR LOWER(model_name) LIKE 'dall-e-%' OR LOWER(model_name) LIKE 'tts-%' OR LOWER(model_name) LIKE 'whisper-%' OR LOWER(model_name) LIKE 'openai/%' OR other LIKE '%"usage_semantic":"openai"%')`
}

func promptCacheClaudeConditionSQL() string {
	return `(LOWER(model_name) LIKE '%claude%' OR other LIKE '%"claude":true%' OR other LIKE '%"usage_semantic":"anthropic"%')`
}

func readPositiveInt64FromMap(values map[string]interface{}, key string) int64 {
	n := readInt64FromMap(values, key)
	if n < 0 {
		return 0
	}
	return n
}

func SumUsedQuota(logType int, startTimestamp int64, endTimestamp int64, userId int, modelName string, username string, tokenName string, channel int, group string, businessGroup string, requestId string, errorMessage string, statusCode string, subscriptionId int, subscriptionPlanId int, filters LogExportFilters) (stat Stat, err error) {
	if filters.ExcludeStreamZeroCompletion && filters.NonChatModels == nil {
		filters.NonChatModels = GetNonChatModelNames()
	}
	tx, err := buildLogStatConsumeQuery(logType, startTimestamp, endTimestamp, userId, modelName, username, tokenName, channel, group, businessGroup, requestId, errorMessage, statusCode, subscriptionId, subscriptionPlanId)
	if err != nil {
		return stat, err
	}
	tx = applyLogExtraFilters(tx, filters, "")
	rpmTpmQuery, err := buildLogStatConsumeQuery(logType, startTimestamp, endTimestamp, userId, modelName, username, tokenName, channel, group, businessGroup, requestId, errorMessage, statusCode, subscriptionId, subscriptionPlanId)
	if err != nil {
		return stat, err
	}
	rpmTpmQuery = applyLogExtraFilters(rpmTpmQuery, filters, "")

	// 只统计最近60秒的rpm和tpm
	rpmTpmQuery = rpmTpmQuery.Where("created_at >= ?", time.Now().Add(-60*time.Second).Unix())

	// 执行查询
	if err := tx.Select("COALESCE(sum(quota), 0) quota, count(*) request_count, COALESCE(sum(prompt_tokens), 0) prompt_tokens, COALESCE(sum(completion_tokens), 0) completion_tokens, COALESCE(sum(prompt_tokens), 0) + COALESCE(sum(completion_tokens), 0) total_tokens, COALESCE(avg(use_time), 0) average_use_time").Scan(&stat).Error; err != nil {
		common.SysError("failed to query log stat: " + err.Error())
		return stat, errors.New("查询统计数据失败")
	}
	if err := rpmTpmQuery.Select("count(*) rpm, sum(prompt_tokens) + sum(completion_tokens) tpm").Scan(&stat).Error; err != nil {
		common.SysError("failed to query rpm/tpm stat: " + err.Error())
		return stat, errors.New("查询统计数据失败")
	}

	cacheQuery, err := buildLogStatConsumeQuery(logType, startTimestamp, endTimestamp, userId, modelName, username, tokenName, channel, group, businessGroup, requestId, errorMessage, statusCode, subscriptionId, subscriptionPlanId)
	if err != nil {
		return stat, err
	}
	cacheQuery = applyLogExtraFilters(cacheQuery, filters, "")
	cacheStat, cacheOpenAIStat, cacheClaudeStat, err := sumPromptCacheStats(cacheQuery.Where("is_stream = ?", true))
	if err != nil {
		common.SysError("failed to query prompt cache stat: " + err.Error())
		return stat, errors.New("查询统计数据失败")
	}
	stat.PromptCacheHitCount = cacheStat.HitCount
	stat.PromptCacheTotalCount = cacheStat.TotalCount
	stat.PromptCacheHitRate = cacheStat.HitRate
	stat.PromptCacheInputTokens = cacheStat.InputTokens
	stat.PromptCacheReadTokens = cacheStat.ReadTokens
	stat.PromptCacheWriteTokens = cacheStat.WriteTokens
	stat.PromptCacheOpenAI = cacheOpenAIStat
	stat.PromptCacheClaude = cacheClaudeStat

	return stat, nil
}

func SumUsedToken(logType int, startTimestamp int64, endTimestamp int64, modelName string, username string, tokenName string) (token int) {
	tx := LOG_DB.Table("logs").Select("ifnull(sum(prompt_tokens),0) + ifnull(sum(completion_tokens),0)")
	if username != "" {
		tx = tx.Where("username = ?", username)
	}
	if tokenName != "" {
		tx = tx.Where("token_name = ?", tokenName)
	}
	if startTimestamp != 0 {
		tx = tx.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("created_at <= ?", endTimestamp)
	}
	if modelName != "" {
		tx = tx.Where("model_name = ?", modelName)
	}
	tx.Where("type = ?", LogTypeConsume).Scan(&token)
	return token
}

func DeleteLogsByIds(ids []int) (int64, error) {
	if len(ids) == 0 {
		return 0, nil
	}
	result := LOG_DB.Where("id IN ?", ids).Delete(&Log{})
	return result.RowsAffected, result.Error
}

func DeleteOldLog(ctx context.Context, targetTimestamp int64, limit int) (int64, error) {
	var total int64 = 0

	for {
		if nil != ctx.Err() {
			return total, ctx.Err()
		}

		result := LOG_DB.Where("created_at < ?", targetTimestamp).Limit(limit).Delete(&Log{})
		if nil != result.Error {
			return total, result.Error
		}

		total += result.RowsAffected

		if result.RowsAffected < int64(limit) {
			break
		}
	}

	return total, nil
}

// resolveKeywordUserIds：keyword 为纯数字 → user_id 精确 OR 用户名含；否则用户名 LIKE。返回候选 user_id。
func resolveKeywordUserIds(keyword string) ([]int, error) {
	keyword = strings.TrimSpace(keyword)
	if keyword == "" {
		return nil, nil
	}
	var ids []int
	q := DB.Table("users").Select("id")
	if _, err := strconv.Atoi(keyword); err == nil {
		q = q.Where("id = ? OR username LIKE ?", keyword, "%"+keyword+"%")
	} else {
		q = q.Where("username LIKE ?", "%"+keyword+"%")
	}
	if err := q.Pluck("id", &ids).Error; err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return []int{-1}, nil // 哨兵：确保 IN(-1) 命中空集
	}
	return ids, nil
}

func GetLeaderboard(startTimestamp, endTimestamp int64, sortBy string, page, pageSize int, keyword string) (*LeaderboardResponse, error) {
	// 1. 排序列 + 确定性 tiebreaker
	var orderClause string
	switch sortBy {
	case "tokens":
		orderClause = "total_tokens DESC, user_id ASC"
	default:
		orderClause = "total_quota DESC, user_id ASC"
	}

	// 2. keyword → 候选 user_id
	var candidateIds []int
	if strings.TrimSpace(keyword) != "" {
		var err error
		candidateIds, err = resolveKeywordUserIds(keyword)
		if err != nil {
			return nil, err
		}
	}

	// applyBase：type=consume + 时间范围 + keyword IN 过滤
	applyBase := func(tx *gorm.DB) *gorm.DB {
		tx = tx.Where("type = ? AND created_at >= ?", LogTypeConsume, startTimestamp)
		if endTimestamp > 0 {
			tx = tx.Where("created_at < ?", endTimestamp)
		}
		if candidateIds != nil {
			tx = tx.Where("user_id IN ?", candidateIds)
		}
		return tx
	}

	resp := &LeaderboardResponse{
		Leaderboard: []LeaderboardEntry{},
		Page:        page,
		PageSize:    pageSize,
	}

	// 3. total：COUNT(DISTINCT user_id)
	var total int64
	if err := applyBase(LOG_DB.Table("logs")).
		Select("COUNT(DISTINCT user_id)").
		Scan(&total).Error; err != nil {
		return nil, err
	}
	resp.Total = int(total)

	// 4. 当前页聚合
	var entries []LeaderboardEntry
	offset := (page - 1) * pageSize
	if offset < 0 {
		offset = 0
	}
	if err := applyBase(LOG_DB.Table("logs")).
		Select("user_id, COALESCE(SUM(quota), 0) as total_quota, COALESCE(SUM(prompt_tokens + completion_tokens), 0) as total_tokens, COUNT(*) as request_count").
		Group("user_id").
		Order(orderClause).
		Limit(pageSize).
		Offset(offset).
		Find(&entries).Error; err != nil {
		return nil, err
	}

	// 8/9. summary（仅首页 & 无搜索）——独立 top-20 聚合，非当前页求和
	if page == 1 && strings.TrimSpace(keyword) == "" {
		summary, err := computeLeaderboardSummary(startTimestamp, endTimestamp)
		if err != nil {
			return nil, err
		}
		resp.Summary = summary
	}

	// 5. 空页直接返回
	if len(entries) == 0 {
		return resp, nil
	}

	// 6. 页内 userIds
	userIds := make([]int, len(entries))
	for i, e := range entries {
		userIds[i] = e.UserId
	}

	// 6a. 用户名解析
	var users []struct {
		Id       int    `gorm:"column:id"`
		Username string `gorm:"column:username"`
	}
	if err := DB.Table("users").
		Select("id, username").
		Where("id IN ?", userIds).
		Find(&users).Error; err != nil {
		return nil, err
	}
	usernameMap := make(map[int]string, len(users))
	for _, u := range users {
		usernameMap[u.Id] = u.Username
	}
	for i := range entries {
		entries[i].Username = usernameMap[entries[i].UserId]
	}

	// 6b. 每用户 top-model
	type modelRow struct {
		UserId     int    `gorm:"column:user_id"`
		ModelName  string `gorm:"column:model_name"`
		ModelQuota int64  `gorm:"column:model_quota"`
	}
	var modelRows []modelRow
	if err := applyBase(LOG_DB.Table("logs")).
		Select("user_id, model_name, COALESCE(SUM(quota), 0) as model_quota").
		Where("user_id IN ?", userIds).
		Group("user_id, model_name").
		Find(&modelRows).Error; err != nil {
		return nil, err
	}
	topModelMap := make(map[int]string)
	topModelQuota := make(map[int]int64)
	for _, r := range modelRows {
		if r.ModelQuota > topModelQuota[r.UserId] {
			topModelQuota[r.UserId] = r.ModelQuota
			topModelMap[r.UserId] = r.ModelName
		}
	}
	for i := range entries {
		entries[i].TopModel = topModelMap[entries[i].UserId]
	}

	// 7. 便宜信号（仅页内 userIds）
	// 7a. 每用户 distinct IP
	type ipRow struct {
		UserId int    `gorm:"column:user_id"`
		Ip     string `gorm:"column:ip"`
		Cnt    int    `gorm:"column:cnt"`
	}
	var ipRows []ipRow
	if err := applyBase(LOG_DB.Table("logs")).
		Select("user_id, ip, COUNT(*) as cnt").
		Where("user_id IN ?", userIds).
		Group("user_id, ip").
		Find(&ipRows).Error; err != nil {
		return nil, err
	}

	type ipAgg struct {
		subnets     map[string]bool
		geoSet      map[string]bool
		regionCount map[LeaderboardRegion]int
		hasIpData   bool
	}
	ipAggMap := make(map[int]*ipAgg, len(userIds))
	getAgg := func(uid int) *ipAgg {
		a := ipAggMap[uid]
		if a == nil {
			a = &ipAgg{
				subnets:     make(map[string]bool),
				geoSet:      make(map[string]bool),
				regionCount: make(map[LeaderboardRegion]int),
			}
			ipAggMap[uid] = a
		}
		return a
	}
	for _, r := range ipRows {
		if r.Ip == "" {
			// 空 IP = 未开启记录，不得计入信号
			continue
		}
		a := getAgg(r.UserId)
		a.hasIpData = true
		if subnet := geoip.SubnetOf(r.Ip); subnet != "" {
			a.subnets[subnet] = true
		}
		if country, city, ok := geoip.Lookup(r.Ip); ok {
			// ok==true 时才记录；无城市（city==""）折叠到国家级
			a.geoSet[country+"|"+city] = true
			a.regionCount[LeaderboardRegion{Country: country, City: city}] += r.Cnt
		}
	}

	// 7b. 每用户 distinct token 数
	type tokRow struct {
		UserId int `gorm:"column:user_id"`
		Cnt    int `gorm:"column:cnt"`
	}
	var tokRows []tokRow
	if err := applyBase(LOG_DB.Table("logs")).
		Select("user_id, COUNT(DISTINCT token_id) as cnt").
		Where("user_id IN ?", userIds).
		Group("user_id").
		Find(&tokRows).Error; err != nil {
		return nil, err
	}
	tokenCountMap := make(map[int]int, len(tokRows))
	for _, r := range tokRows {
		tokenCountMap[r.UserId] = r.Cnt
	}

	// 8. 组装 analysis
	for i := range entries {
		uid := entries[i].UserId
		a := ipAggMap[uid]
		var subnetClusters, distinctGeo int
		var hasIpData bool
		var topRegions []LeaderboardRegion
		if a != nil {
			subnetClusters = len(a.subnets)
			distinctGeo = len(a.geoSet)
			hasIpData = a.hasIpData
			topRegions = topRegionsByCount(a.regionCount, 3)
		}
		tokenCount := tokenCountMap[uid]
		s := UserSignals{
			SubnetClusters: subnetClusters,
			DistinctGeo:    distinctGeo,
			TokenCount:     tokenCount,
			RequestCount:   int(entries[i].RequestCount),
			HasIpData:      hasIpData,
		}
		est, isMin := EstimateList(s)
		conf := ListConfidence(s)
		entries[i].Analysis = LeaderboardAnalysis{
			Estimate:      est,
			EstimateIsMin: isMin,
			Confidence:    conf,
			IpCount:       subnetClusters,
			TokenCount:    tokenCount,
			TopRegions:    topRegions,
			HasIpData:     hasIpData,
		}
	}

	resp.Leaderboard = entries
	return resp, nil
}

// ActivityHourBucket：近 24h 分时活跃度桶，HourTs 为该小时起点的 unix 秒。
type ActivityHourBucket struct {
	HourTs       int64 `json:"hour_ts"`
	ActiveUsers  int64 `json:"active_users"`
	RequestCount int64 `json:"request_count"`
}

// ActivityStats：管理端近实时活跃度面板数据。基于消费日志（type=consume）去重派生，
// 不是 WebSocket 在线数——"active_tokens/active_ips" 表示窗口内有过调用的去重令牌/IP。
type ActivityStats struct {
	WindowMinutes    int                  `json:"window_minutes"`
	ActiveUsers      int64                `json:"active_users"`
	ActiveTokens     int64                `json:"active_tokens"`
	ActiveIps        int64                `json:"active_ips"`
	RequestCount     int64                `json:"request_count"`
	Rpm              int64                `json:"rpm"`
	Tpm              int64                `json:"tpm"`
	TodayActiveUsers int64                `json:"today_active_users"`
	TodayRequests    int64                `json:"today_requests"`
	Hourly           []ActivityHourBucket `json:"hourly"`
}

// GetActivityStats：聚合近 windowMinutes 分钟的活跃用户/令牌/IP + RPM/TPM，
// 今日累计，以及近 24 小时分时曲线。三库兼容：分时桶用 created_at/3600 整除在 Go 侧分桶，
// 不依赖任何数据库时间函数。
func GetActivityStats(windowMinutes int, now time.Time) (*ActivityStats, error) {
	if windowMinutes <= 0 {
		windowMinutes = 15
	}
	stats := &ActivityStats{
		WindowMinutes: windowMinutes,
		Hourly:        []ActivityHourBucket{},
	}
	nowTs := now.Unix()
	windowStart := nowTs - int64(windowMinutes)*60

	base := func() *gorm.DB {
		return LOG_DB.Table("logs").Where("type = ?", LogTypeConsume)
	}

	// 1. 窗口内去重活跃度
	if err := base().Where("created_at >= ?", windowStart).
		Select("COUNT(DISTINCT user_id)").Scan(&stats.ActiveUsers).Error; err != nil {
		return nil, err
	}
	if err := base().Where("created_at >= ?", windowStart).
		Select("COUNT(DISTINCT token_id)").Scan(&stats.ActiveTokens).Error; err != nil {
		return nil, err
	}
	if err := base().Where("created_at >= ? AND ip <> ''", windowStart).
		Select("COUNT(DISTINCT ip)").Scan(&stats.ActiveIps).Error; err != nil {
		return nil, err
	}

	// 2. 窗口内请求量 + tokens → RPM/TPM（按窗口时长归一到每分钟）
	var windowAgg struct {
		RequestCount int64
		TotalTokens  int64
	}
	if err := base().Where("created_at >= ?", windowStart).
		Select("COUNT(*) as request_count, COALESCE(SUM(prompt_tokens + completion_tokens), 0) as total_tokens").
		Scan(&windowAgg).Error; err != nil {
		return nil, err
	}
	stats.RequestCount = windowAgg.RequestCount
	stats.Rpm = windowAgg.RequestCount / int64(windowMinutes)
	stats.Tpm = windowAgg.TotalTokens / int64(windowMinutes)

	// 3. 今日累计（本地时区当日 0 点起）
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).Unix()
	if err := base().Where("created_at >= ?", dayStart).
		Select("COUNT(DISTINCT user_id)").Scan(&stats.TodayActiveUsers).Error; err != nil {
		return nil, err
	}
	if err := base().Where("created_at >= ?", dayStart).
		Select("COUNT(*)").Scan(&stats.TodayRequests).Error; err != nil {
		return nil, err
	}

	// 4. 近 24h 分时曲线：预置 24 个空桶，DB 侧只做 created_at/3600 整除分组（纯算术，三库兼容）
	hourStart := (nowTs / 3600) * 3600
	rangeStart := hourStart - 23*3600
	buckets := make([]ActivityHourBucket, 24)
	idxByHour := make(map[int64]int, 24)
	for i := 0; i < 24; i++ {
		hourTs := rangeStart + int64(i)*3600
		buckets[i] = ActivityHourBucket{HourTs: hourTs}
		idxByHour[hourTs] = i
	}

	var hourlyRows []struct {
		Bucket       int64
		ActiveUsers  int64
		RequestCount int64
	}
	if err := base().Where("created_at >= ?", rangeStart).
		Select("(created_at / 3600) * 3600 as bucket, COUNT(DISTINCT user_id) as active_users, COUNT(*) as request_count").
		Group("bucket").
		Scan(&hourlyRows).Error; err != nil {
		return nil, err
	}
	for _, row := range hourlyRows {
		if i, ok := idxByHour[row.Bucket]; ok {
			buckets[i].ActiveUsers = row.ActiveUsers
			buckets[i].RequestCount = row.RequestCount
		}
	}
	stats.Hourly = buckets

	return stats, nil
}

// computeLeaderboardSummary：全站 SUM 总量 + 独立 top-20 聚合的 Top10* 小计。
func computeLeaderboardSummary(startTimestamp, endTimestamp int64) (*LeaderboardSummary, error) {
	var summary LeaderboardSummary
	summaryTx := LOG_DB.Table("logs").
		Select("COALESCE(SUM(quota), 0) as total_quota, COALESCE(SUM(prompt_tokens + completion_tokens), 0) as total_tokens, COUNT(*) as total_request_count").
		Where("type = ? AND created_at >= ?", LogTypeConsume, startTimestamp)
	if endTimestamp > 0 {
		summaryTx = summaryTx.Where("created_at < ?", endTimestamp)
	}
	if err := summaryTx.Scan(&summary).Error; err != nil {
		return nil, err
	}

	// 独立 top-20 查询（按 quota 排序，确定性 tiebreaker）
	var topEntries []LeaderboardEntry
	topTx := LOG_DB.Table("logs").
		Select("user_id, COALESCE(SUM(quota), 0) as total_quota, COALESCE(SUM(prompt_tokens + completion_tokens), 0) as total_tokens, COUNT(*) as request_count").
		Where("type = ? AND created_at >= ?", LogTypeConsume, startTimestamp)
	if endTimestamp > 0 {
		topTx = topTx.Where("created_at < ?", endTimestamp)
	}
	if err := topTx.Group("user_id").
		Order("total_quota DESC, user_id ASC").
		Limit(20).
		Find(&topEntries).Error; err != nil {
		return nil, err
	}
	for _, e := range topEntries {
		summary.Top10Quota += e.TotalQuota
		summary.Top10Tokens += e.TotalTokens
		summary.Top10RequestCount += e.RequestCount
	}
	return &summary, nil
}

// topRegionsByCount：按计数降序取前 n 个地区（计数相同按 country、city 稳定排序）。
func topRegionsByCount(regionCount map[LeaderboardRegion]int, n int) []LeaderboardRegion {
	if len(regionCount) == 0 {
		return nil
	}
	regions := make([]LeaderboardRegion, 0, len(regionCount))
	for r, c := range regionCount {
		rr := r
		rr.Count = c
		regions = append(regions, rr)
	}
	sort.Slice(regions, func(i, j int) bool {
		if regions[i].Count != regions[j].Count {
			return regions[i].Count > regions[j].Count
		}
		if regions[i].Country != regions[j].Country {
			return regions[i].Country < regions[j].Country
		}
		return regions[i].City < regions[j].City
	})
	if len(regions) > n {
		regions = regions[:n]
	}
	return regions
}

// ---- Leaderboard 抽屉明细（Task 6）----

type AnalysisIpRow struct {
	Ip           string `json:"ip"`
	Country      string `json:"country"`
	City         string `json:"city"`
	Subnet       string `json:"subnet"`
	RequestCount int    `json:"request_count"`
	FirstSeen    int64  `json:"first_seen"`
	LastSeen     int64  `json:"last_seen"`
}

type AnalysisTokenRow struct {
	TokenId      int    `json:"token_id"`
	TokenName    string `json:"token_name"`
	RequestCount int    `json:"request_count"`
	PromptTokens int64  `json:"prompt_tokens"`
}

type AnalysisBucket struct {
	Label string `json:"label"`
	Min   int    `json:"min"`
	Count int    `json:"count"`
}

type AnalysisTimeBucket struct {
	Ts    int64 `json:"ts"`
	Count int   `json:"count"`
}

type LeaderboardAnalysisDetail struct {
	UserId               int                  `json:"user_id"`
	Estimate             int                  `json:"estimate"`
	EstimateIsMin        bool                 `json:"estimate_is_min"`
	Confidence           string               `json:"confidence"`
	Conclusion           string               `json:"conclusion"`
	HasIpData            bool                 `json:"has_ip_data"`
	Truncated            bool                 `json:"truncated"`
	SampledRows          int                  `json:"sampled_rows"`
	SubnetClusters       int                  `json:"subnet_clusters"`
	DistinctGeo          int                  `json:"distinct_geo"`
	TokenCount           int                  `json:"token_count"`
	MaxConcurrency       int                  `json:"max_concurrency"`
	InputDispersionScore int                  `json:"input_dispersion_score"`
	Ips                  []AnalysisIpRow      `json:"ips"`
	Tokens               []AnalysisTokenRow   `json:"tokens"`
	InputBuckets         []AnalysisBucket     `json:"input_buckets"`
	Timeline             []AnalysisTimeBucket `json:"timeline"`
}

const analysisSampleCap = 50000

// GetLeaderboardAnalysisDetail 拉取单个用户的有界样本原始消费日志，计算完整证据链（抽屉档）。
func GetLeaderboardAnalysisDetail(userId int, startTimestamp, endTimestamp int64) (*LeaderboardAnalysisDetail, error) {
	// 1. 拉取原始行（有界样本，按时间倒序）
	type detailRow struct {
		Ip           string `gorm:"column:ip"`
		TokenId      int    `gorm:"column:token_id"`
		TokenName    string `gorm:"column:token_name"`
		PromptTokens int    `gorm:"column:prompt_tokens"`
		UseTime      int    `gorm:"column:use_time"`
		CreatedAt    int64  `gorm:"column:created_at"`
	}
	var rows []detailRow
	tx := LOG_DB.Table("logs").
		Select("ip, token_id, token_name, prompt_tokens, use_time, created_at").
		Where("type = ? AND user_id = ? AND created_at >= ?", LogTypeConsume, userId, startTimestamp)
	if endTimestamp > 0 {
		tx = tx.Where("created_at < ?", endTimestamp)
	}
	if err := tx.Order("created_at DESC").Limit(analysisSampleCap).Find(&rows).Error; err != nil {
		return nil, err
	}

	detail := &LeaderboardAnalysisDetail{
		UserId:       userId,
		Truncated:    len(rows) == analysisSampleCap,
		SampledRows:  len(rows),
		Ips:          []AnalysisIpRow{},
		Tokens:       []AnalysisTokenRow{},
		InputBuckets: []AnalysisBucket{},
		Timeline:     []AnalysisTimeBucket{},
	}

	// 2. 逐 IP 聚合（Go 内，跨 DB 安全）
	type ipAcc struct {
		ip           string
		country      string
		city         string
		subnet       string
		geoOk        bool
		requestCount int
		firstSeen    int64
		lastSeen     int64
	}
	ipMap := make(map[string]*ipAcc)
	hasIpData := false

	// 逐 token 聚合
	type tokAcc struct {
		tokenId      int
		tokenName    string
		requestCount int
		promptTokens int64
	}
	tokMap := make(map[int]*tokAcc)

	// 输入桶（固定 5 个）
	bucketCounts := [5]int{}

	// 时间线粒度：窗口 <= 24h 用小时桶，否则日桶
	spanEnd := endTimestamp
	if spanEnd <= 0 {
		spanEnd = time.Now().Unix()
	}
	granularity := int64(86400)
	if spanEnd-startTimestamp <= 24*3600 {
		granularity = 3600
	}
	timelineMap := make(map[int64]int)

	intervals := make([]Interval, 0, len(rows))
	concurRows := make([]ConcurRow, 0, len(rows))

	for _, r := range rows {
		// IP 聚合（跳过空 IP）
		if r.Ip != "" {
			hasIpData = true
			a := ipMap[r.Ip]
			if a == nil {
				a = &ipAcc{ip: r.Ip, subnet: geoip.SubnetOf(r.Ip), firstSeen: r.CreatedAt, lastSeen: r.CreatedAt}
				if country, city, ok := geoip.Lookup(r.Ip); ok {
					a.country = country
					a.city = city
					a.geoOk = true
				}
				ipMap[r.Ip] = a
			}
			a.requestCount++
			if r.CreatedAt < a.firstSeen {
				a.firstSeen = r.CreatedAt
			}
			if r.CreatedAt > a.lastSeen {
				a.lastSeen = r.CreatedAt
			}
		}

		// token 聚合
		t := tokMap[r.TokenId]
		if t == nil {
			t = &tokAcc{tokenId: r.TokenId, tokenName: r.TokenName}
			tokMap[r.TokenId] = t
		}
		if t.tokenName == "" && r.TokenName != "" {
			t.tokenName = r.TokenName
		}
		t.requestCount++
		t.promptTokens += int64(r.PromptTokens)

		// 输入桶
		bucketCounts[magnitudeBucket(r.PromptTokens)]++

		// 时间线
		bucketStart := (r.CreatedAt / granularity) * granularity
		timelineMap[bucketStart]++

		// 并发 & 离散度
		end := r.CreatedAt + int64(r.UseTime)
		intervals = append(intervals, Interval{Start: r.CreatedAt, End: end})
		concurRows = append(concurRows, ConcurRow{Start: r.CreatedAt, End: end, PromptTokens: r.PromptTokens})
	}

	detail.HasIpData = hasIpData

	// 3. 组装 IP 行（按 request_count desc 稳定排序）
	subnetSet := make(map[string]bool)
	geoSet := make(map[string]bool)
	for _, a := range ipMap {
		if a.subnet != "" {
			subnetSet[a.subnet] = true
		}
		if a.geoOk {
			geoSet[a.country+"|"+a.city] = true
		}
		detail.Ips = append(detail.Ips, AnalysisIpRow{
			Ip:           a.ip,
			Country:      a.country,
			City:         a.city,
			Subnet:       a.subnet,
			RequestCount: a.requestCount,
			FirstSeen:    a.firstSeen,
			LastSeen:     a.lastSeen,
		})
	}
	sort.SliceStable(detail.Ips, func(i, j int) bool {
		if detail.Ips[i].RequestCount != detail.Ips[j].RequestCount {
			return detail.Ips[i].RequestCount > detail.Ips[j].RequestCount
		}
		return detail.Ips[i].Ip < detail.Ips[j].Ip
	})

	// token 行（按 request_count desc 稳定排序）
	for _, t := range tokMap {
		detail.Tokens = append(detail.Tokens, AnalysisTokenRow{
			TokenId:      t.tokenId,
			TokenName:    t.tokenName,
			RequestCount: t.requestCount,
			PromptTokens: t.promptTokens,
		})
	}
	sort.SliceStable(detail.Tokens, func(i, j int) bool {
		if detail.Tokens[i].RequestCount != detail.Tokens[j].RequestCount {
			return detail.Tokens[i].RequestCount > detail.Tokens[j].RequestCount
		}
		return detail.Tokens[i].TokenId < detail.Tokens[j].TokenId
	})

	// 输入桶（固定 5 个，恒发）
	bucketLabels := [5]string{"0-100", "100-1k", "1k-10k", "10k-100k", "100k+"}
	bucketMins := [5]int{0, 100, 1000, 10000, 100000}
	for i := 0; i < 5; i++ {
		detail.InputBuckets = append(detail.InputBuckets, AnalysisBucket{
			Label: bucketLabels[i],
			Min:   bucketMins[i],
			Count: bucketCounts[i],
		})
	}

	// 时间线（升序）
	for ts, cnt := range timelineMap {
		detail.Timeline = append(detail.Timeline, AnalysisTimeBucket{Ts: ts, Count: cnt})
	}
	sort.SliceStable(detail.Timeline, func(i, j int) bool {
		return detail.Timeline[i].Ts < detail.Timeline[j].Ts
	})

	// 4. 信号 & 估计
	maxConc := MaxConcurrency(intervals)
	disp := InputDispersionScore(concurRows)
	s := UserSignals{
		SubnetClusters: len(subnetSet),
		DistinctGeo:    len(geoSet),
		TokenCount:     len(tokMap),
		RequestCount:   len(rows),
		HasIpData:      hasIpData,
	}
	est, isMin, concl := EstimateDrawer(s, maxConc, disp)
	conf := DrawerConfidence(s, maxConc)

	detail.Estimate = est
	detail.EstimateIsMin = isMin
	detail.Conclusion = concl
	detail.Confidence = conf
	detail.SubnetClusters = s.SubnetClusters
	detail.DistinctGeo = s.DistinctGeo
	detail.TokenCount = s.TokenCount
	detail.MaxConcurrency = maxConc
	detail.InputDispersionScore = disp

	return detail, nil
}
