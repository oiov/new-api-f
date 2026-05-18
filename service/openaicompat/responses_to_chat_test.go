package openaicompat

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/stretchr/testify/require"
)

func TestResponsesResponseToChatCompletionsResponseConvertsRawJSONToolArguments(t *testing.T) {
	resp := &dto.OpenAIResponsesResponse{
		ID:        "resp_1",
		Model:     "gpt-4.1",
		CreatedAt: 1710000000,
		Output: []dto.ResponsesOutput{
			{
				Type:      "function_call",
				ID:        "item_1",
				CallId:    "call_1",
				Name:      "weather",
				Arguments: common.StringToByteSlice(`{"city":"Paris","days":0,"strict":false}`),
			},
		},
	}

	chat, _, err := ResponsesResponseToChatCompletionsResponse(resp, "chatcmpl_1")
	require.NoError(t, err)
	require.Len(t, chat.Choices, 1)

	var toolCalls []dto.ToolCallResponse
	require.NoError(t, common.Unmarshal(chat.Choices[0].Message.ToolCalls, &toolCalls))
	require.Len(t, toolCalls, 1)
	require.JSONEq(t, `{"city":"Paris","days":0,"strict":false}`, toolCalls[0].Function.Arguments)
}
