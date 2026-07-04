package openai

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestOaiResponsesStreamHandlerDoesNotBillWhenUpstreamUsageAndOutputAreZero(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)

	start := time.Now()
	common.SetContextKey(c, constant.ContextKeyRequestStartTime, start)

	stream := true
	info, err := relaycommon.GenRelayInfo(c, types.RelayFormatOpenAIResponses, &dto.OpenAIResponsesRequest{
		Model:  "gpt-5.5",
		Stream: &stream,
	}, nil)
	require.NoError(t, err)
	info.ChannelMeta = &relaycommon.ChannelMeta{}
	info.UpstreamModelName = "gpt-5.5"
	info.SetEstimatePromptTokens(1234)

	body := strings.Join([]string{
		`data: {"type":"response.completed","response":{"id":"resp_1","model":"gpt-5.5","created_at":1778737984,"usage":{"input_tokens":0,"output_tokens":0,"total_tokens":0}}}`,
		`data: [DONE]`,
		``,
	}, "\n")
	resp := &http.Response{Body: io.NopCloser(strings.NewReader(body))}

	usage, apiErr := OaiResponsesStreamHandler(c, info, resp)
	require.Nil(t, apiErr)
	require.NotNil(t, usage)
	// Empty response (no upstream usage, no output) must not be billed on the estimate.
	require.Equal(t, 0, usage.PromptTokens)
	require.Equal(t, 0, usage.CompletionTokens)
	require.Equal(t, 0, usage.TotalTokens)
	require.True(t, info.HasSendResponse())
	require.GreaterOrEqual(t, info.FirstResponseTime.Sub(start), time.Duration(0))
}

func TestOaiResponsesStreamHandlerFallsBackToEstimatedPromptTokensWhenOutputPresent(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)

	start := time.Now()
	common.SetContextKey(c, constant.ContextKeyRequestStartTime, start)

	stream := true
	info, err := relaycommon.GenRelayInfo(c, types.RelayFormatOpenAIResponses, &dto.OpenAIResponsesRequest{
		Model:  "gpt-5.5",
		Stream: &stream,
	}, nil)
	require.NoError(t, err)
	info.ChannelMeta = &relaycommon.ChannelMeta{}
	info.UpstreamModelName = "gpt-5.5"
	info.SetEstimatePromptTokens(1234)

	// Output text present but upstream omitted usage -> still fall back to estimate for prompt.
	body := strings.Join([]string{
		`data: {"type":"response.output_text.delta","delta":"hello world"}`,
		`data: {"type":"response.completed","response":{"id":"resp_1","model":"gpt-5.5","created_at":1778737984,"usage":{"input_tokens":0,"output_tokens":0,"total_tokens":0}}}`,
		`data: [DONE]`,
		``,
	}, "\n")
	resp := &http.Response{Body: io.NopCloser(strings.NewReader(body))}

	usage, apiErr := OaiResponsesStreamHandler(c, info, resp)
	require.Nil(t, apiErr)
	require.NotNil(t, usage)
	require.Equal(t, 1234, usage.PromptTokens)
	require.Greater(t, usage.CompletionTokens, 0)
	require.Equal(t, usage.PromptTokens+usage.CompletionTokens, usage.TotalTokens)
}

func TestOaiResponsesHandlerDoesNotBillWhenUpstreamUsageAndOutputAreZero(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)

	stream := false
	info, err := relaycommon.GenRelayInfo(c, types.RelayFormatOpenAIResponses, &dto.OpenAIResponsesRequest{
		Model:  "gpt-5.5",
		Stream: &stream,
	}, nil)
	require.NoError(t, err)
	info.ChannelMeta = &relaycommon.ChannelMeta{UpstreamModelName: "gpt-5.5"}
	info.SetEstimatePromptTokens(3456)

	body := `{"id":"resp_1","model":"gpt-5.5","created_at":1778737984,"usage":{"input_tokens":0,"output_tokens":0,"total_tokens":0},"output":[]}`
	resp := &http.Response{Body: io.NopCloser(strings.NewReader(body))}

	usage, apiErr := OaiResponsesHandler(c, info, resp)
	require.Nil(t, apiErr)
	require.NotNil(t, usage)
	// Empty response (no upstream usage, no output) must not be billed on the estimate.
	require.Equal(t, 0, usage.PromptTokens)
	require.Equal(t, 0, usage.CompletionTokens)
	require.Equal(t, 0, usage.TotalTokens)
}

func TestOaiResponsesHandlerAcceptsNonStringInstructions(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)

	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "gpt-5.5"},
	}
	body := `{"id":"resp_1","model":"gpt-5.5","instructions":{"type":"developer","text":"keep short"},"usage":{"input_tokens":10,"output_tokens":2,"total_tokens":12},"output":[]}`
	resp := &http.Response{Body: io.NopCloser(strings.NewReader(body))}

	usage, apiErr := OaiResponsesHandler(c, info, resp)
	require.Nil(t, apiErr)
	require.NotNil(t, usage)
	require.Equal(t, 12, usage.TotalTokens)
}

func TestOaiResponsesToChatStreamHandlerDoesNotBillWhenUpstreamUsageAndOutputAreZero(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)

	start := time.Now()
	common.SetContextKey(c, constant.ContextKeyRequestStartTime, start)
	stream := true
	info, err := relaycommon.GenRelayInfo(c, types.RelayFormatOpenAI, &dto.GeneralOpenAIRequest{
		Model:  "gpt-5.5",
		Stream: &stream,
	}, nil)
	require.NoError(t, err)
	info.ChannelMeta = &relaycommon.ChannelMeta{UpstreamModelName: "gpt-5.5"}
	info.SetEstimatePromptTokens(2345)

	body := strings.Join([]string{
		`data: {"type":"response.completed","response":{"id":"resp_1","model":"gpt-5.5","created_at":1778737984,"usage":{"input_tokens":0,"output_tokens":0,"total_tokens":0}}}`,
		`data: [DONE]`,
		``,
	}, "\n")
	resp := &http.Response{Body: io.NopCloser(strings.NewReader(body))}

	usage, apiErr := OaiResponsesToChatStreamHandler(c, info, resp)
	require.Nil(t, apiErr)
	require.NotNil(t, usage)
	// Empty response (no upstream usage, no output) must not be billed on the estimate.
	require.Equal(t, 0, usage.PromptTokens)
	require.Equal(t, 0, usage.CompletionTokens)
	require.Equal(t, 0, usage.TotalTokens)
	require.True(t, info.HasSendResponse())
}

func TestOaiResponsesToChatStreamHandlerFallsBackToEstimatedPromptTokensWhenOutputPresent(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)

	start := time.Now()
	common.SetContextKey(c, constant.ContextKeyRequestStartTime, start)
	stream := true
	info, err := relaycommon.GenRelayInfo(c, types.RelayFormatOpenAI, &dto.GeneralOpenAIRequest{
		Model:  "gpt-5.5",
		Stream: &stream,
	}, nil)
	require.NoError(t, err)
	info.ChannelMeta = &relaycommon.ChannelMeta{UpstreamModelName: "gpt-5.5"}
	info.SetEstimatePromptTokens(2345)

	// Output text present but upstream omitted usage -> still fall back to estimate for prompt.
	body := strings.Join([]string{
		`data: {"type":"response.output_text.delta","delta":"hello world"}`,
		`data: {"type":"response.completed","response":{"id":"resp_1","model":"gpt-5.5","created_at":1778737984,"usage":{"input_tokens":0,"output_tokens":0,"total_tokens":0}}}`,
		`data: [DONE]`,
		``,
	}, "\n")
	resp := &http.Response{Body: io.NopCloser(strings.NewReader(body))}

	usage, apiErr := OaiResponsesToChatStreamHandler(c, info, resp)
	require.Nil(t, apiErr)
	require.NotNil(t, usage)
	require.Equal(t, 2345, usage.PromptTokens)
	require.Greater(t, usage.CompletionTokens, 0)
	require.Equal(t, usage.PromptTokens+usage.CompletionTokens, usage.TotalTokens)
	require.True(t, info.HasSendResponse())
}
