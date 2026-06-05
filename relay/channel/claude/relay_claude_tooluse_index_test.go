package claude

import (
	"testing"

	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/stretchr/testify/require"
)

// 回归测试 (#5095): 当 Claude 直接以多个 tool_use 块起始（index=0,1）时，
// 旧的 fcIdx = *Index - 1（负值钳到 0）会让 index=0 和 index=1 都映射到 fcIdx=0，
// 导致第二个工具调用撞键丢失。修复后两个工具的 OpenAI 侧 index 必须是 0 和 1。
func TestStreamResponseClaude2OpenAIConcurrentToolUseIndexes(t *testing.T) {
	info := &relaycommon.RelayInfo{}

	indexes := []int{0, 1}
	gotIndexes := make([]int, 0, len(indexes))
	for _, idx := range indexes {
		blockIndex := idx
		resp := &dto.ClaudeResponse{
			Type:  "content_block_start",
			Index: &blockIndex,
			ContentBlock: &dto.ClaudeMediaMessage{
				Type: "tool_use",
				Id:   "tool_call_id",
				Name: "get_weather",
			},
		}
		out := StreamResponseClaude2OpenAI(resp, info)
		require.NotNil(t, out)
		require.Len(t, out.Choices, 1)
		require.Len(t, out.Choices[0].Delta.ToolCalls, 1)
		toolCall := out.Choices[0].Delta.ToolCalls[0]
		require.NotNil(t, toolCall.Index)
		gotIndexes = append(gotIndexes, *toolCall.Index)
	}

	require.Equal(t, []int{0, 1}, gotIndexes, "concurrent tool_use indexes must not collide at 0")
}
