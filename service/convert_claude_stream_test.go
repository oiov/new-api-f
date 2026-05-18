package service

import (
	"testing"

	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/stretchr/testify/require"
)

func TestStreamResponseOpenAI2ClaudeEmitsUsageOnlyFinalChunk(t *testing.T) {
	info := &relaycommon.RelayInfo{
		SendResponseCount: 2,
		ClaudeConvertInfo: &relaycommon.ClaudeConvertInfo{
			LastMessagesType: relaycommon.LastMessageTypeText,
		},
	}

	stop := "stop"
	finishResponses := StreamResponseOpenAI2Claude(&dto.ChatCompletionsStreamResponse{
		Choices: []dto.ChatCompletionsStreamResponseChoice{
			{
				Index:        0,
				FinishReason: &stop,
			},
		},
	}, info)

	require.Empty(t, finishResponses)
	require.Equal(t, "stop", info.FinishReason)
	require.False(t, info.ClaudeConvertInfo.Done)

	finalResponses := StreamResponseOpenAI2Claude(&dto.ChatCompletionsStreamResponse{
		Usage: &dto.Usage{
			PromptTokens:     100,
			CompletionTokens: 20,
			PromptTokensDetails: dto.InputTokenDetails{
				CachedTokens:         30,
				CachedCreationTokens: 50,
			},
			ClaudeCacheCreation5mTokens: 10,
			ClaudeCacheCreation1hTokens: 20,
		},
	}, info)

	require.Len(t, finalResponses, 3)
	require.Equal(t, "content_block_stop", finalResponses[0].Type)
	require.Equal(t, "message_delta", finalResponses[1].Type)
	require.Equal(t, "message_stop", finalResponses[2].Type)
	require.NotNil(t, finalResponses[1].Usage)
	require.Equal(t, 100, finalResponses[1].Usage.InputTokens)
	require.Equal(t, 20, finalResponses[1].Usage.OutputTokens)
	require.Equal(t, 30, finalResponses[1].Usage.CacheReadInputTokens)
	require.Equal(t, 50, finalResponses[1].Usage.CacheCreationInputTokens)
	require.NotNil(t, finalResponses[1].Usage.CacheCreation)
	require.Equal(t, 30, finalResponses[1].Usage.CacheCreation.Ephemeral5mInputTokens)
	require.Equal(t, 20, finalResponses[1].Usage.CacheCreation.Ephemeral1hInputTokens)
	require.NotNil(t, finalResponses[1].Delta)
	require.NotNil(t, finalResponses[1].Delta.StopReason)
	require.Equal(t, "end_turn", *finalResponses[1].Delta.StopReason)
	require.True(t, info.ClaudeConvertInfo.Done)
}

func TestBuildClaudeUsageFromOpenAIUsageDefaultsAggregateCacheCreationTo5m(t *testing.T) {
	usage := buildClaudeUsageFromOpenAIUsage(&dto.Usage{
		PromptTokens:     100,
		CompletionTokens: 20,
		PromptTokensDetails: dto.InputTokenDetails{
			CachedCreationTokens: 50,
		},
	})

	require.NotNil(t, usage)
	require.NotNil(t, usage.CacheCreation)
	require.Equal(t, 50, usage.CacheCreationInputTokens)
	require.Equal(t, 50, usage.CacheCreation.Ephemeral5mInputTokens)
	require.Equal(t, 0, usage.CacheCreation.Ephemeral1hInputTokens)
}
