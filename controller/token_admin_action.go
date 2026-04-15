package controller

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"

	"github.com/tidwall/gjson"

	"github.com/gin-gonic/gin"
)

type adminTokenTestRequest struct {
	// Mode: "both"（默认）/"claude"/"responses"
	Mode string `json:"mode,omitempty"`

	// 兼容旧字段：model/max_tokens 默认视为 claude 的参数
	Model     string `json:"model,omitempty"`
	MaxTokens *uint  `json:"max_tokens,omitempty"`

	ClaudeModel    string `json:"claude_model,omitempty"`
	ResponsesModel string `json:"responses_model,omitempty"`
}

type adminRotateTokenRequest struct {
	NotifyUser *bool `json:"notify_user,omitempty"`
}

type adminTokenTestResult struct {
	Kind             string `json:"kind"`
	Path             string `json:"path"`
	Model            string `json:"model"`
	HttpCode         int    `json:"http_code"`
	Ok               bool   `json:"ok"`
	XOneAPIRequestID string `json:"x_oneapi_request_id,omitempty"`
	ErrorType        string `json:"error_type,omitempty"`
}

func runTokenRelayTest(tokenKey string, path string, relayFormat types.RelayFormat, headers map[string]string, body []byte) adminTokenTestResult {
	internalRouter := gin.New()
	internalRouter.Use(
		middleware.SystemPerformanceCheck(),
		middleware.TokenAuth(),
		middleware.ModelRequestRateLimit(),
		middleware.Distribute(),
	)
	internalRouter.POST(path, func(ctx *gin.Context) {
		Relay(ctx, relayFormat)
	})

	recorder := httptest.NewRecorder()
	internalReq := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(body))
	internalReq.Header.Set("Content-Type", "application/json")
	internalReq.Header.Set("Authorization", "Bearer sk-"+tokenKey)
	internalReq.Header.Set("x-api-key", "sk-"+tokenKey)
	for k, v := range headers {
		internalReq.Header.Set(k, v)
	}
	internalRouter.ServeHTTP(recorder, internalReq)

	httpCode := recorder.Code
	requestID := recorder.Header().Get("x-oneapi-request-id")

	var errorType string
	respBody := recorder.Body.Bytes()
	if len(respBody) > 0 && (respBody[0] == '{' || respBody[0] == '[') {
		errorType = gjson.GetBytes(respBody, "error.type").String()
		if errorType == "" {
			errorType = gjson.GetBytes(respBody, "error.error.type").String()
		}
	}

	return adminTokenTestResult{
		Path:             path,
		Model:            "",
		HttpCode:         httpCode,
		Ok:               httpCode == http.StatusOK,
		XOneAPIRequestID: requestID,
		ErrorType:        errorType,
		Kind:             "",
	}
}

// TestTokenByAdmin 对指定 token 发起最小测试请求，用于在管理台快速验证 token 是否可用。
// 注意：该操作会走完整 relay 链路，可能产生实际调用与计费。
func TestTokenByAdmin(c *gin.Context) {
	tokenId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}

	var req adminTokenTestRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiError(c, err)
		return
	}

	token, err := model.GetTokenById(tokenId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if token == nil || strings.TrimSpace(token.Key) == "" {
		common.ApiErrorI18n(c, i18n.MsgTokenGetInfoFailed)
		return
	}

	mode := strings.TrimSpace(strings.ToLower(req.Mode))
	if mode == "" {
		mode = "both"
	}

	maxTokens := uint(16)
	if req.MaxTokens != nil && *req.MaxTokens > 0 {
		maxTokens = *req.MaxTokens
	}
	stream := false

	results := make([]adminTokenTestResult, 0, 2)

	claudeModel := strings.TrimSpace(req.ClaudeModel)
	if claudeModel == "" {
		claudeModel = strings.TrimSpace(req.Model)
	}
	if claudeModel == "" {
		claudeModel = "claude-opus-4-6"
	}

	responsesModel := strings.TrimSpace(req.ResponsesModel)
	if responsesModel == "" {
		responsesModel = "gpt-5.1-codex"
	}

	if mode == "claude" || mode == "both" {
		claudeReq := &dto.ClaudeRequest{
			Model:     claudeModel,
			MaxTokens: &maxTokens,
			Messages: []dto.ClaudeMessage{
				{
					Role:    "user",
					Content: "hi",
				},
			},
			Stream: &stream,
		}
		claudeBody, err := common.Marshal(claudeReq)
		if err != nil {
			common.ApiError(c, err)
			return
		}

		r := runTokenRelayTest(
			token.Key,
			"/v1/messages",
			types.RelayFormatClaude,
			map[string]string{"anthropic-version": "2023-06-01"},
			claudeBody,
		)
		r.Kind = "claude"
		r.Path = "/v1/messages"
		r.Model = claudeModel
		results = append(results, r)
	}

	if mode == "responses" || mode == "both" {
		maxOutputTokens := maxTokens
		responsesInput := json.RawMessage(`[{"role":"system","content":"test"},{"role":"user","content":[{"type":"input_text","text":"hi"}]}]`)
		responsesReq := &dto.OpenAIResponsesRequest{
			Model:           responsesModel,
			Input:           responsesInput,
			MaxOutputTokens: &maxOutputTokens,
			Stream:          &stream,
		}
		responsesBody, err := common.Marshal(responsesReq)
		if err != nil {
			common.ApiError(c, err)
			return
		}

		r := runTokenRelayTest(
			token.Key,
			"/v1/responses",
			types.RelayFormatOpenAIResponses,
			nil,
			responsesBody,
		)
		r.Kind = "responses"
		r.Path = "/v1/responses"
		r.Model = responsesModel
		results = append(results, r)
	}

	common.ApiSuccess(c, gin.H{
		"token_id": token.Id,
		"user_id":  token.UserId,
		"mode":     mode,
		"results":  results,
	})
}

func RotateTokenByAdmin(c *gin.Context) {
	tokenId, err := strconv.Atoi(c.Param("id"))
	if err != nil || tokenId <= 0 {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}

	req := adminRotateTokenRequest{}
	if c.Request.ContentLength > 0 {
		if err := common.DecodeJson(c.Request.Body, &req); err != nil {
			common.ApiErrorI18n(c, i18n.MsgInvalidParams)
			return
		}
	}

	token, err := model.GetTokenById(tokenId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if token == nil || strings.TrimSpace(token.Key) == "" {
		common.ApiErrorI18n(c, i18n.MsgTokenGetInfoFailed)
		return
	}

	isSubscriptionDeliveryToken := token.IsSubscriptionAggregateAccessToken()
	newKey, err := token.RotateKey()
	if err != nil {
		common.ApiError(c, err)
		return
	}

	notifyUser := isSubscriptionDeliveryToken
	if req.NotifyUser != nil {
		notifyUser = *req.NotifyUser
	}

	siteNotifySent := false
	siteNotifyError := ""
	eventSent := false
	eventError := ""
	if notifyUser && token.UserId > 0 {
		user, userErr := model.GetUserById(token.UserId, false)
		if userErr != nil {
			siteNotifyError = userErr.Error()
			eventError = userErr.Error()
		} else {
			notifyResult := service.SendTokenRotationNotification(
				user,
				c.GetInt("id"),
				strings.TrimSpace(token.Name),
				isSubscriptionDeliveryToken,
			)
			siteNotifySent = notifyResult.SiteSent
			siteNotifyError = notifyResult.SiteError
			eventSent = notifyResult.EventSent
			eventError = notifyResult.EventError
		}
	}

	actionName := "重置令牌"
	tokenSource := "user_created"
	if isSubscriptionDeliveryToken {
		actionName = "重新签发"
		tokenSource = "subscription_delivery"
	}
	model.RecordLog(token.UserId, model.LogTypeSystem, fmt.Sprintf("管理员%s：%s", actionName, strings.TrimSpace(token.Name)))
	model.RecordLog(c.GetInt("id"), model.LogTypeManage, fmt.Sprintf("管理员%s用户 %d 的令牌：%s (#%d)", actionName, token.UserId, strings.TrimSpace(token.Name), token.Id))

	notifyError := strings.TrimSpace(siteNotifyError)
	if notifyError == "" {
		notifyError = strings.TrimSpace(eventError)
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"token_id":          token.Id,
			"user_id":           token.UserId,
			"token_name":        token.Name,
			"token_key":         "sk-" + newKey,
			"token_source":      tokenSource,
			"notify_sent":       siteNotifySent || eventSent,
			"notify_error":      notifyError,
			"site_notify_sent":  siteNotifySent,
			"site_notify_error": siteNotifyError,
			"event_sent":        eventSent,
			"event_error":       eventError,
			"action_label":      actionName,
			"is_system_issued":  isSubscriptionDeliveryToken,
		},
	})
}
