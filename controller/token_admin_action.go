package controller

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/types"

	"github.com/tidwall/gjson"

	"github.com/gin-gonic/gin"
)

type adminTokenTestRequest struct {
	Model     string `json:"model,omitempty"`
	MaxTokens *uint  `json:"max_tokens,omitempty"`
}

// TestTokenByAdmin 对指定 token 发起一次最小 Claude /v1/messages 测试请求，用于在管理台快速验证 token 是否可用。
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

	testModel := strings.TrimSpace(req.Model)
	if testModel == "" {
		testModel = "claude-opus-4-6"
	}

	maxTokens := uint(16)
	if req.MaxTokens != nil && *req.MaxTokens > 0 {
		maxTokens = *req.MaxTokens
	}
	stream := false

	relayReq := &dto.ClaudeRequest{
		Model:     testModel,
		MaxTokens: &maxTokens,
		Messages: []dto.ClaudeMessage{
			{
				Role:    "user",
				Content: "hi",
			},
		},
		Stream: &stream,
	}

	body, err := common.Marshal(relayReq)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	internalRouter := gin.New()
	internalRouter.Use(
		middleware.SystemPerformanceCheck(),
		middleware.TokenAuth(),
		middleware.ModelRequestRateLimit(),
		middleware.Distribute(),
	)
	internalRouter.POST("/v1/messages", func(ctx *gin.Context) {
		Relay(ctx, types.RelayFormatClaude)
	})

	recorder := httptest.NewRecorder()
	internalReq := httptest.NewRequest(http.MethodPost, "/v1/messages", bytes.NewReader(body))
	internalReq.Header.Set("Content-Type", "application/json")
	internalReq.Header.Set("anthropic-version", "2023-06-01")
	internalReq.Header.Set("x-api-key", "sk-"+token.Key)
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

	common.ApiSuccess(c, gin.H{
		"token_id":           token.Id,
		"user_id":            token.UserId,
		"http_code":          httpCode,
		"ok":                 httpCode == http.StatusOK,
		"x_oneapi_request_id": requestID,
		"error_type":         errorType,
	})
}
