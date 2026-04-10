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
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"

	"github.com/bytedance/gopkg/util/gopool"
	"gorm.io/gorm"
)

type Log struct {
	Id               int    `json:"id" gorm:"index:idx_created_at_id,priority:1;index:idx_user_id_id,priority:2"`
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
	TokenId          int    `json:"token_id" gorm:"default:0;index"`
	Group            string `json:"group" gorm:"index"`
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
	LogTypeUnknown = 0
	LogTypeTopup   = 1
	LogTypeConsume = 2
	LogTypeManage  = 3
	LogTypeSystem  = 4
	LogTypeError   = 5
	LogTypeRefund  = 6
)

func formatUserLogs(logs []*Log, startIdx int) {
	for i := range logs {
		logs[i].ChannelName = ""
		var otherMap map[string]interface{}
		otherMap, _ = common.StrToMap(logs[i].Other)
		if otherMap != nil {
			// Remove admin-only debug fields.
			delete(otherMap, "admin_info")
			delete(otherMap, "reject_reason")
		}
		logs[i].Other = common.MapToJsonStr(otherMap)
		logs[i].Id = startIdx + i + 1
	}
}

func GetLogByTokenId(tokenId int) (logs []*Log, err error) {
	tx := LOG_DB.Model(&Log{}).Where("token_id = ?", tokenId)
	tx = applyErrorLogVisibilityFilter(tx, LogTypeUnknown, !common.ErrorDetailsEnabled || !common.ErrorLogDisplayEnabled)
	err = tx.Order("id desc").Limit(common.MaxRecentItems).Find(&logs).Error
	formatUserLogs(logs, 0)
	return logs, err
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
	if params.TokenId > 0 {
		if token, err := GetTokenById(params.TokenId); err == nil {
			tokenName = token.Name
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
		Other:     common.MapToJsonStr(params.Other),
	}
	err := LOG_DB.Create(log).Error
	if err != nil {
		common.SysLog("failed to record task billing log: " + err.Error())
	}
}

func GetAllLogs(logType int, startTimestamp int64, endTimestamp int64, userId int, modelName string, username string, tokenName string, startIdx int, num int, channel int, group string, requestId string, subscriptionId int, subscriptionPlanId int) (logs []*Log, total int64, err error) {
	var tx *gorm.DB
	if logType == LogTypeUnknown {
		tx = LOG_DB
	} else {
		tx = LOG_DB.Where("logs.type = ?", logType)
	}
	tx = applyErrorLogVisibilityFilter(tx, logType, !common.ErrorLogDisplayEnabled)

	if modelName != "" {
		tx = tx.Where("logs.model_name like ?", modelName)
	}
	if userId > 0 {
		tx = tx.Where("logs.user_id = ?", userId)
	}
	if username != "" {
		tx = tx.Where("logs.username = ?", username)
	}
	if tokenName != "" {
		tx = tx.Where("logs.token_name = ?", tokenName)
	}
	if requestId != "" {
		tx = tx.Where("logs.request_id = ?", requestId)
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
	if subscriptionId > 0 {
		tx = applySubscriptionJSONIdFilter(tx, "subscription_id", subscriptionId)
	}
	if subscriptionPlanId > 0 {
		tx = applySubscriptionJSONIdFilter(tx, "subscription_plan_id", subscriptionPlanId)
	}
	err = tx.Model(&Log{}).Count(&total).Error
	if err != nil {
		return nil, 0, err
	}
	err = tx.Order("logs.id desc").Limit(num).Offset(startIdx).Find(&logs).Error
	if err != nil {
		return nil, 0, err
	}

	channelIds := types.NewSet[int]()
	for _, log := range logs {
		if log.ChannelId != 0 {
			channelIds.Add(log.ChannelId)
		}
	}

	if channelIds.Len() > 0 {
		var channels []struct {
			Id   int    `gorm:"column:id"`
			Name string `gorm:"column:name"`
		}
		if common.MemoryCacheEnabled {
			// Cache get channel
			for _, channelId := range channelIds.Items() {
				if cacheChannel, err := CacheGetChannel(channelId); err == nil {
					channels = append(channels, struct {
						Id   int    `gorm:"column:id"`
						Name string `gorm:"column:name"`
					}{
						Id:   channelId,
						Name: cacheChannel.Name,
					})
				}
			}
		} else {
			// Bulk query channels from DB
			if err = DB.Table("channels").Select("id, name").Where("id IN ?", channelIds.Items()).Find(&channels).Error; err != nil {
				return logs, total, err
			}
		}
		channelMap := make(map[int]string, len(channels))
		for _, channel := range channels {
			channelMap[channel.Id] = channel.Name
		}
		for i := range logs {
			logs[i].ChannelName = channelMap[logs[i].ChannelId]
		}
	}

	return logs, total, err
}

const logSearchCountLimit = 10000

func GetUserLogs(userId int, logType int, startTimestamp int64, endTimestamp int64, modelName string, tokenName string, startIdx int, num int, group string, requestId string, subscriptionId int, subscriptionPlanId int) (logs []*Log, total int64, err error) {
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
			return nil, 0, err
		}
		tx = tx.Where("logs.model_name LIKE ? ESCAPE '!'", modelNamePattern)
	}
	if tokenName != "" {
		tx = tx.Where("logs.token_name = ?", tokenName)
	}
	if requestId != "" {
		tx = tx.Where("logs.request_id = ?", requestId)
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
	if subscriptionId > 0 {
		tx = applySubscriptionJSONIdFilter(tx, "subscription_id", subscriptionId)
	}
	if subscriptionPlanId > 0 {
		tx = applySubscriptionJSONIdFilter(tx, "subscription_plan_id", subscriptionPlanId)
	}
	err = tx.Model(&Log{}).Limit(logSearchCountLimit).Count(&total).Error
	if err != nil {
		common.SysError("failed to count user logs: " + err.Error())
		return nil, 0, errors.New("查询日志失败")
	}
	err = tx.Order("logs.id desc").Limit(num).Offset(startIdx).Find(&logs).Error
	if err != nil {
		common.SysError("failed to search user logs: " + err.Error())
		return nil, 0, errors.New("查询日志失败")
	}

	formatUserLogs(logs, startIdx)
	return logs, total, err
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
		consumed := readInt64FromMap(otherMap, "subscription_consumed")
		resourceType := resourceTypeMap[subscriptionID]
		if resourceType == "" {
			resourceType = SubscriptionResourceQuota
		}
		// Fallback for older records that lack subscription_consumed:
		// derive from subscription_pre_consumed + subscription_post_delta.
		if consumed <= 0 {
			preConsumed := readInt64FromMap(otherMap, "subscription_pre_consumed")
			postDelta := readInt64FromMap(otherMap, "subscription_post_delta")
			fallback := preConsumed + postDelta
			if fallback > 0 {
				consumed = fallback
			}
		}
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
	Quota int `json:"quota"`
	Rpm   int `json:"rpm"`
	Tpm   int `json:"tpm"`
}

func SumUsedQuota(logType int, startTimestamp int64, endTimestamp int64, userId int, modelName string, username string, tokenName string, channel int, group string, subscriptionId int, subscriptionPlanId int) (stat Stat, err error) {
	tx := LOG_DB.Table("logs").Select("sum(quota) quota")

	// 为rpm和tpm创建单独的查询
	rpmTpmQuery := LOG_DB.Table("logs").Select("count(*) rpm, sum(prompt_tokens) + sum(completion_tokens) tpm")

	if username != "" {
		tx = tx.Where("username = ?", username)
		rpmTpmQuery = rpmTpmQuery.Where("username = ?", username)
	}
	if userId > 0 {
		tx = tx.Where("user_id = ?", userId)
		rpmTpmQuery = rpmTpmQuery.Where("user_id = ?", userId)
	}
	if tokenName != "" {
		tx = tx.Where("token_name = ?", tokenName)
		rpmTpmQuery = rpmTpmQuery.Where("token_name = ?", tokenName)
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
			return stat, err
		}
		tx = tx.Where("model_name LIKE ? ESCAPE '!'", modelNamePattern)
		rpmTpmQuery = rpmTpmQuery.Where("model_name LIKE ? ESCAPE '!'", modelNamePattern)
	}
	if channel != 0 {
		tx = tx.Where("channel_id = ?", channel)
		rpmTpmQuery = rpmTpmQuery.Where("channel_id = ?", channel)
	}
	if group != "" {
		tx = tx.Where(logGroupCol+" = ?", group)
		rpmTpmQuery = rpmTpmQuery.Where(logGroupCol+" = ?", group)
	}
	if subscriptionId > 0 {
		tx = applySubscriptionJSONIdFilter(tx, "subscription_id", subscriptionId)
		rpmTpmQuery = applySubscriptionJSONIdFilter(rpmTpmQuery, "subscription_id", subscriptionId)
	}
	if subscriptionPlanId > 0 {
		tx = applySubscriptionJSONIdFilter(tx, "subscription_plan_id", subscriptionPlanId)
		rpmTpmQuery = applySubscriptionJSONIdFilter(rpmTpmQuery, "subscription_plan_id", subscriptionPlanId)
	}

	tx = tx.Where("type = ?", LogTypeConsume)
	rpmTpmQuery = rpmTpmQuery.Where("type = ?", LogTypeConsume)

	// 只统计最近60秒的rpm和tpm
	rpmTpmQuery = rpmTpmQuery.Where("created_at >= ?", time.Now().Add(-60*time.Second).Unix())

	// 执行查询
	if err := tx.Scan(&stat).Error; err != nil {
		common.SysError("failed to query log stat: " + err.Error())
		return stat, errors.New("查询统计数据失败")
	}
	if err := rpmTpmQuery.Scan(&stat).Error; err != nil {
		common.SysError("failed to query rpm/tpm stat: " + err.Error())
		return stat, errors.New("查询统计数据失败")
	}

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
