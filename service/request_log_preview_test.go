package service

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

func TestAppendRequestPromptPreviewInfoForClaude(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(nil)
	common.SetContextKey(ctx, constant.ContextKeyTokenCountMeta, &types.TokenCountMeta{
		MessagesCount: 1,
	})
	systemText := "你现在是一名产品经理"
	userText := "介绍下自己的角色 身份 和定位"

	maxTokens := uint(1024)
	req := &dto.ClaudeRequest{
		Model:     "claude-opus-4-6",
		MaxTokens: &maxTokens,
		System: []dto.ClaudeMediaMessage{
			{Type: "text", Text: &systemText},
		},
		Messages: []dto.ClaudeMessage{
			{
				Role: "user",
				Content: []dto.ClaudeMediaMessage{
					{Type: "text", Text: &userText},
				},
			},
		},
	}
	relayInfo := &relaycommon.RelayInfo{Request: req}
	other := map[string]interface{}{}

	appendRequestPromptPreviewInfo(ctx, relayInfo, other)

	if got := other["messages_count"]; got != 1 {
		t.Fatalf("expected messages_count=1, got %#v", got)
	}
	if got := other["system_text"]; got != "你现在是一名产品经理" {
		t.Fatalf("expected system_text to be recorded, got %#v", got)
	}
	if got := other["messages_preview"]; got != "user: 介绍下自己的角色 身份 和定位" {
		t.Fatalf("unexpected messages_preview: %#v", got)
	}
}
