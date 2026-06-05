package gemini

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func strptr(s string) *string { return &s }

// 构造「先文本、后工具调用+STOP」的 Gemini 流：工具调用出现在非首个响应上。
// 这是 #5041 的触发场景：旧逻辑只在首个响应里清空 finishReason，
// 工具调用落在后续 chunk 时会被提前关闭、丢失。
func geminiTextThenToolStream(t *testing.T) []byte {
	t.Helper()
	textChunk := dto.GeminiChatResponse{
		Candidates: []dto.GeminiChatCandidate{
			{Content: dto.GeminiChatContent{Role: "model", Parts: []dto.GeminiPart{{Text: "Let me check the weather."}}}},
		},
	}
	textData, err := common.Marshal(textChunk)
	require.NoError(t, err)

	toolChunk := dto.GeminiChatResponse{
		Candidates: []dto.GeminiChatCandidate{
			{
				Content: dto.GeminiChatContent{
					Role:  "model",
					Parts: []dto.GeminiPart{{FunctionCall: &dto.FunctionCall{FunctionName: "get_weather", Arguments: map[string]any{"location": "SF"}}}},
				},
				FinishReason: strptr("STOP"),
			},
		},
		UsageMetadata: dto.GeminiUsageMetadata{PromptTokenCount: 10, CandidatesTokenCount: 5, TotalTokenCount: 15},
	}
	toolData, err := common.Marshal(toolChunk)
	require.NoError(t, err)

	return []byte("data: " + string(textData) + "\n" + "data: " + string(toolData) + "\n" + "data: [DONE]\n")
}

func runGeminiStreamHandler(t *testing.T, relayFormat types.RelayFormat) (*dto.Usage, string) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/messages", nil)

	oldStreamingTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 300
	t.Cleanup(func() { constant.StreamingTimeout = oldStreamingTimeout })

	info := &relaycommon.RelayInfo{
		RelayFormat:     relayFormat,
		OriginModelName: "gemini-3-flash-preview",
		ChannelMeta:     &relaycommon.ChannelMeta{UpstreamModelName: "gemini-3-flash-preview"},
	}
	if relayFormat == types.RelayFormatClaude {
		info.ClaudeConvertInfo = &relaycommon.ClaudeConvertInfo{LastMessagesType: relaycommon.LastMessageTypeNone}
	}

	resp := &http.Response{Body: io.NopCloser(bytes.NewReader(geminiTextThenToolStream(t)))}
	usage, apiErr := GeminiChatStreamHandler(c, info, resp)
	require.Nil(t, apiErr)
	return usage, recorder.Body.String()
}

// 回归测试 (#5041): Claude 格式下，落在后续 chunk 的工具调用必须被正确输出为
// tool_use 块，且最终 stop_reason 必须是 tool_use，message_stop 只出现一次。
func TestGeminiChatStreamHandlerClaudeFormatEmitsToolUse(t *testing.T) {
	usage, body := runGeminiStreamHandler(t, types.RelayFormatClaude)

	require.NotNil(t, usage)
	require.Equal(t, 15, usage.TotalTokens)
	require.Contains(t, body, `"type":"tool_use"`, "tool_use content block must be present")
	require.Contains(t, body, `"name":"get_weather"`)
	require.Contains(t, body, `"stop_reason":"tool_use"`, "stop_reason must be tool_use")
	require.NotContains(t, body, `"stop_reason":"end_turn"`, "tool call must not be reported as end_turn")
	require.Equal(t, 1, strings.Count(body, `"type":"message_stop"`), "exactly one message_stop")
}

// 在线安全护栏: OpenAI 格式 (非 Claude) 路径不得被回退影响——
// 仍需发送 stop chunk，且工具调用 finish_reason 为 tool_calls。
func TestGeminiChatStreamHandlerOpenAIFormatStillEmitsToolCallStop(t *testing.T) {
	usage, body := runGeminiStreamHandler(t, types.RelayFormatOpenAI)

	require.NotNil(t, usage)
	require.Equal(t, 15, usage.TotalTokens)
	require.Contains(t, body, "get_weather", "tool call must still be present in OpenAI format")
	require.Contains(t, body, `"finish_reason":"tool_calls"`, "OpenAI stop chunk must report tool_calls")
}
