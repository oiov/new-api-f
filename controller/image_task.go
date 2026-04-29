package controller

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/types"

	"github.com/bytedance/gopkg/util/gopool"
	"github.com/gin-gonic/gin"
)

const asyncImageTaskHeader = "X-New-Api-Async-Task"

func isAsyncImageTaskRequest(c *gin.Context, relayInfo *relaycommon.RelayInfo) bool {
	if c == nil || relayInfo == nil || !isAsyncImageTaskRelayMode(relayInfo.RelayMode) {
		return false
	}
	value := strings.TrimSpace(c.GetHeader(asyncImageTaskHeader))
	return strings.EqualFold(value, "true") || value == "1"
}

func isAsyncImageTaskRelayMode(relayMode int) bool {
	return relayMode == relayconstant.RelayModeImagesGenerations ||
		relayMode == relayconstant.RelayModeImagesEdits
}

func submitAsyncImageTask(c *gin.Context, relayInfo *relaycommon.RelayInfo, body []byte) {
	task := initImageTask(relayInfo)
	if err := task.Insert(); err != nil {
		if relayInfo.Billing != nil {
			relayInfo.Billing.Refund(c)
		}
		newAPIError := types.NewError(err, types.ErrorCodeUpdateDataError, types.ErrOptionWithSkipRetry())
		c.JSON(http.StatusInternalServerError, gin.H{"error": newAPIError.ToOpenAIError()})
		return
	}

	c.JSON(http.StatusOK, dto.TaskResponse[any]{
		Code:    dto.TaskSuccessCode,
		Message: "success",
		Data: map[string]any{
			"task_id": task.TaskID,
			"status":  strings.ToLower(string(task.Status)),
		},
	})

	gopool.Go(func() {
		runAsyncImageTask(task, relayInfo, body)
	})
}

func GetImageTask(c *gin.Context) {
	taskID := strings.TrimSpace(c.Param("task_id"))
	if taskID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": types.NewError(
				fmt.Errorf("task_id is required"),
				types.ErrorCodeInvalidRequest,
				types.ErrOptionWithSkipRetry(),
			).ToOpenAIError(),
		})
		return
	}

	task, exists, err := model.GetByTaskId(c.GetInt("id"), taskID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": types.NewError(
				err,
				types.ErrorCodeUpdateDataError,
				types.ErrOptionWithSkipRetry(),
			).ToOpenAIError(),
		})
		return
	}
	if !exists || task.Platform != constant.TaskPlatformImage {
		c.JSON(http.StatusNotFound, gin.H{
			"error": types.NewError(
				fmt.Errorf("image task not found"),
				types.ErrorCodeInvalidRequest,
				types.ErrOptionWithSkipRetry(),
			).ToOpenAIError(),
		})
		return
	}

	c.JSON(http.StatusOK, dto.TaskResponse[any]{
		Code:    dto.TaskSuccessCode,
		Message: "success",
		Data:    imageTaskResponseData(task),
	})
}

func initImageTask(relayInfo *relaycommon.RelayInfo) *model.Task {
	task := model.InitTask(constant.TaskPlatformImage, relayInfo)
	task.Action = imageTaskAction(relayInfo)
	task.Status = model.TaskStatusSubmitted
	task.Progress = "0%"
	task.Quota = relayInfo.PriceData.QuotaToPreConsume
	task.PrivateData.BillingSource = relayInfo.BillingSource
	task.PrivateData.SubscriptionId = relayInfo.SubscriptionId
	task.PrivateData.SubscriptionResourceType = relayInfo.SubscriptionResourceType
	task.PrivateData.SubscriptionPreConsumed = relayInfo.SubscriptionPreConsumed
	task.PrivateData.SubscriptionPreConsumedAmount = relayInfo.SubscriptionPreConsumedAmount
	task.PrivateData.SubscriptionPreConsumedCount = relayInfo.SubscriptionPreConsumedCount
	task.PrivateData.SubscriptionAmountTotal = relayInfo.SubscriptionAmountTotal
	task.PrivateData.SubscriptionRequestCountTotal = relayInfo.SubscriptionRequestCountTotal
	task.PrivateData.TokenId = relayInfo.TokenId
	task.PrivateData.BillingContext = &model.TaskBillingContext{
		ModelPrice:      relayInfo.PriceData.ModelPrice,
		GroupRatio:      relayInfo.PriceData.GroupRatioInfo.GroupRatio,
		ModelRatio:      relayInfo.PriceData.ModelRatio,
		OtherRatios:     relayInfo.PriceData.OtherRatios,
		OriginModelName: relayInfo.OriginModelName,
	}
	task.SetData(map[string]any{
		"request_id": relayInfo.RequestId,
		"model":      relayInfo.OriginModelName,
	})
	return task
}

func imageTaskAction(relayInfo *relaycommon.RelayInfo) string {
	if relayInfo != nil && relayInfo.RelayMode == relayconstant.RelayModeImagesEdits {
		return "edits"
	}
	return "generations"
}

func imageTaskResponseData(task *model.Task) map[string]any {
	if task == nil {
		return map[string]any{}
	}
	data := map[string]any{
		"task_id":     task.TaskID,
		"status":      imageTaskPublicStatus(task.Status),
		"status_raw":  string(task.Status),
		"action":      task.Action,
		"progress":    task.Progress,
		"submit_time": task.SubmitTime,
		"start_time":  task.StartTime,
		"finish_time": task.FinishTime,
	}
	if task.FailReason != "" {
		data["fail_reason"] = task.FailReason
	}
	if task.PrivateData.ResultURL != "" {
		data["result_url"] = task.PrivateData.ResultURL
	}
	taskData := imageTaskData(task)
	if len(taskData) > 0 {
		data["data"] = taskData
		if imageURLs := imageURLsFromTaskData(taskData); len(imageURLs) > 0 {
			data["image_urls"] = imageURLs
		}
	}
	return data
}

func imageTaskPublicStatus(status model.TaskStatus) string {
	switch status {
	case model.TaskStatusSubmitted:
		return "submitted"
	case model.TaskStatusQueued:
		return "queued"
	case model.TaskStatusInProgress:
		return "in_progress"
	case model.TaskStatusSuccess:
		return "succeeded"
	case model.TaskStatusFailure:
		return "failed"
	default:
		return strings.ToLower(string(status))
	}
}

func imageTaskData(task *model.Task) map[string]any {
	if task == nil || len(task.Data) == 0 {
		return nil
	}
	data := map[string]any{}
	if err := common.Unmarshal(task.Data, &data); err != nil {
		return nil
	}
	return data
}

func imageURLsFromTaskData(data map[string]any) []string {
	raw, ok := data["image_urls"]
	if !ok {
		return nil
	}
	switch urls := raw.(type) {
	case []string:
		return urls
	case []any:
		result := make([]string, 0, len(urls))
		for _, item := range urls {
			if url, ok := item.(string); ok && url != "" {
				result = append(result, url)
			}
		}
		return result
	default:
		return nil
	}
}

func runAsyncImageTask(task *model.Task, relayInfo *relaycommon.RelayInfo, body []byte) {
	ctx, recorder := newAsyncImageGinContext(relayInfo, body)
	task.Status = model.TaskStatusInProgress
	task.Progress = "1%"
	task.StartTime = time.Now().Unix()
	_ = task.Update()

	apiErr := relay.ImageHelper(ctx, relayInfo)
	if apiErr != nil {
		if relayInfo.Billing != nil {
			relayInfo.Billing.Refund(ctx)
		}
		task.Status = model.TaskStatusFailure
		task.Progress = "100%"
		task.FinishTime = time.Now().Unix()
		task.FailReason = apiErr.Error()
		_ = task.Update()
		logger.LogError(ctx, fmt.Sprintf("async image task failed: %s", apiErr.Error()))
		return
	}

	imageURLs := common.GetContextKeyStringSlice(ctx, constant.ContextKeyImageResultURLs)
	task.Status = model.TaskStatusSuccess
	task.Progress = "100%"
	task.FinishTime = time.Now().Unix()
	if len(imageURLs) > 0 {
		task.PrivateData.ResultURL = strings.Join(imageURLs, ",")
		task.SetData(map[string]any{
			"request_id": relayInfo.RequestId,
			"model":      relayInfo.OriginModelName,
			"image_urls": imageURLs,
		})
	} else {
		task.SetData(map[string]any{
			"request_id": relayInfo.RequestId,
			"model":      relayInfo.OriginModelName,
			"response":   recorder.Body.String(),
		})
	}
	if err := task.Update(); err != nil {
		logger.LogError(ctx, fmt.Sprintf("async image task update failed: %s", err.Error()))
	}
}

func newAsyncImageGinContext(relayInfo *relaycommon.RelayInfo, body []byte) (*gin.Context, *httptest.ResponseRecorder) {
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	requestURL, _ := url.Parse(relayInfo.RequestURLPath)
	if requestURL == nil {
		requestURL = &url.URL{Path: "/v1/images/generations"}
	}
	headers := make(http.Header)
	for key, value := range relayInfo.RequestHeaders {
		headers.Set(key, value)
	}
	if headers.Get("Content-Type") == "" {
		headers.Set("Content-Type", "application/json")
	}
	ctx.Request = &http.Request{
		Method:        http.MethodPost,
		URL:           requestURL,
		Header:        headers,
		Body:          io.NopCloser(bytes.NewReader(body)),
		ContentLength: int64(len(body)),
	}
	ctx.Set(common.RequestIdKey, relayInfo.RequestId)
	copyRelayInfoToAsyncContext(ctx, relayInfo)
	return ctx, recorder
}

func copyRelayInfoToAsyncContext(ctx *gin.Context, relayInfo *relaycommon.RelayInfo) {
	ctx.Set("id", relayInfo.UserId)
	ctx.Set("username", relayInfo.Username)
	ctx.Set("token_name", relayInfo.TokenName)
	ctx.Set("group", relayInfo.UsingGroup)
	ctx.Set("user_group", relayInfo.UserGroup)
	ctx.Set("original_model", relayInfo.OriginModelName)
	ctx.Set("relay_mode", relayInfo.RelayMode)
	common.SetContextKey(ctx, constant.ContextKeyRequestStartTime, relayInfo.StartTime)
	common.SetContextKey(ctx, constant.ContextKeyOriginalModel, relayInfo.OriginModelName)
	common.SetContextKey(ctx, constant.ContextKeyTokenId, relayInfo.TokenId)
	common.SetContextKey(ctx, constant.ContextKeyTokenKey, relayInfo.TokenKey)
	common.SetContextKey(ctx, constant.ContextKeyTokenGroup, relayInfo.TokenGroup)
	common.SetContextKey(ctx, constant.ContextKeyUserId, relayInfo.UserId)
	common.SetContextKey(ctx, constant.ContextKeyUserName, relayInfo.Username)
	common.SetContextKey(ctx, constant.ContextKeyUserGroup, relayInfo.UserGroup)
	common.SetContextKey(ctx, constant.ContextKeyUsingGroup, relayInfo.UsingGroup)
	common.SetContextKey(ctx, constant.ContextKeyUserEmail, relayInfo.UserEmail)
	if relayInfo.ChannelMeta == nil {
		return
	}
	common.SetContextKey(ctx, constant.ContextKeyChannelId, relayInfo.ChannelId)
	common.SetContextKey(ctx, constant.ContextKeyChannelType, relayInfo.ChannelType)
	common.SetContextKey(ctx, constant.ContextKeyChannelBaseUrl, relayInfo.ChannelBaseUrl)
	common.SetContextKey(ctx, constant.ContextKeyChannelKey, relayInfo.ApiKey)
	common.SetContextKey(ctx, constant.ContextKeyChannelIsMultiKey, relayInfo.ChannelIsMultiKey)
	common.SetContextKey(ctx, constant.ContextKeyChannelMultiKeyIndex, relayInfo.ChannelMultiKeyIndex)
	common.SetContextKey(ctx, constant.ContextKeyChannelCreateTime, relayInfo.ChannelCreateTime)
	common.SetContextKey(ctx, constant.ContextKeyChannelParamOverride, relayInfo.ParamOverride)
	common.SetContextKey(ctx, constant.ContextKeyChannelHeaderOverride, relayInfo.HeadersOverride)
	common.SetContextKey(ctx, constant.ContextKeyChannelSetting, relayInfo.ChannelSetting)
	common.SetContextKey(ctx, constant.ContextKeyChannelOtherSetting, relayInfo.ChannelOtherSettings)
	ctx.Set("api_version", relayInfo.ApiVersion)
	ctx.Set("channel_organization", relayInfo.Organization)
}
