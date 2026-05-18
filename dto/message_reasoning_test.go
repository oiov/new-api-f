package dto

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

func TestMessageReasoningContentPreservesExplicitEmptyString(t *testing.T) {
	raw := []byte(`{
		"role": "assistant",
		"content": "Hello",
		"reasoning_content": "",
		"reasoning": ""
	}`)

	var msg Message
	require.NoError(t, common.Unmarshal(raw, &msg))
	require.NotNil(t, msg.ReasoningContent)
	require.NotNil(t, msg.Reasoning)
	require.Equal(t, "", *msg.ReasoningContent)
	require.Equal(t, "", *msg.Reasoning)

	encoded, err := common.Marshal(msg)
	require.NoError(t, err)
	require.True(t, gjson.GetBytes(encoded, "reasoning_content").Exists())
	require.True(t, gjson.GetBytes(encoded, "reasoning").Exists())
}

func TestMessageReasoningContentOmitsAbsentFields(t *testing.T) {
	raw := []byte(`{"role":"assistant","content":"Hello"}`)

	var msg Message
	require.NoError(t, common.Unmarshal(raw, &msg))
	require.Nil(t, msg.ReasoningContent)
	require.Nil(t, msg.Reasoning)

	encoded, err := common.Marshal(msg)
	require.NoError(t, err)
	require.False(t, gjson.GetBytes(encoded, "reasoning_content").Exists())
	require.False(t, gjson.GetBytes(encoded, "reasoning").Exists())
}

func TestMessageGetReasoningContent(t *testing.T) {
	t.Run("both nil returns empty", func(t *testing.T) {
		msg := Message{Role: "assistant"}
		require.Equal(t, "", msg.GetReasoningContent())
	})

	t.Run("reasoning_content takes priority", func(t *testing.T) {
		reasoningContent := "primary"
		reasoning := "fallback"
		msg := Message{ReasoningContent: &reasoningContent, Reasoning: &reasoning}
		require.Equal(t, "primary", msg.GetReasoningContent())
	})

	t.Run("falls back to reasoning", func(t *testing.T) {
		reasoning := "fallback"
		msg := Message{Reasoning: &reasoning}
		require.Equal(t, "fallback", msg.GetReasoningContent())
	})
}
