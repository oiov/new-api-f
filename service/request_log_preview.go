package service

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

const (
	requestLogPreviewMaxLen = 1200
	systemTextMaxLen        = 600
)

func appendRequestPromptPreviewInfo(ctx *gin.Context, relayInfo *relaycommon.RelayInfo, other map[string]interface{}) {
	if relayInfo == nil || other == nil {
		return
	}

	meta, _ := common.GetContextKeyType[*types.TokenCountMeta](ctx, constant.ContextKeyTokenCountMeta)
	if meta != nil && meta.MessagesCount > 0 {
		other["messages_count"] = meta.MessagesCount
	}

	switch req := relayInfo.Request.(type) {
	case *dto.ClaudeRequest:
		appendClaudeRequestPreview(req, other)
	case *dto.GeneralOpenAIRequest:
		appendOpenAIRequestPreview(req, other)
	case *dto.OpenAIResponsesRequest:
		appendResponsesRequestPreview(req, other)
	}

	if meta != nil {
		if _, ok := other["messages_count"]; !ok && meta.MessagesCount > 0 {
			other["messages_count"] = meta.MessagesCount
		}
		if _, ok := other["messages_preview"]; !ok {
			if preview := clipPreview(meta.CombineText, requestLogPreviewMaxLen); preview != "" {
				other["messages_preview"] = preview
			}
		}
	}
}

func appendClaudeRequestPreview(req *dto.ClaudeRequest, other map[string]interface{}) {
	if req == nil || other == nil {
		return
	}

	if len(req.Messages) > 0 {
		other["messages_count"] = len(req.Messages)
	}

	var systemParts []string
	if req.System != nil {
		if req.IsStringSystem() {
			if systemText := normalizePreviewText(req.GetStringSystem()); systemText != "" {
				systemParts = append(systemParts, systemText)
			}
		} else {
			for _, media := range req.ParseSystem() {
				if media.Type != "text" {
					continue
				}
				if text := normalizePreviewText(media.GetText()); text != "" {
					systemParts = append(systemParts, text)
				}
			}
		}
	}
	if systemText := clipPreview(strings.Join(systemParts, "\n"), systemTextMaxLen); systemText != "" {
		other["system_text"] = systemText
	}

	var parts []string
	for _, message := range req.Messages {
		messageParts := []string{normalizePreviewText(message.Role)}
		if message.IsStringContent() {
			if content := normalizePreviewText(message.GetStringContent()); content != "" {
				messageParts = append(messageParts, content)
			}
		} else {
			content, _ := message.ParseContent()
			for _, media := range content {
				if media.Type != "text" {
					continue
				}
				if text := normalizePreviewText(media.GetText()); text != "" {
					messageParts = append(messageParts, text)
				}
			}
		}
		line := strings.Join(filterEmptyStrings(messageParts), ": ")
		if line != "" {
			parts = append(parts, line)
		}
	}
	if preview := clipPreview(strings.Join(parts, "\n"), requestLogPreviewMaxLen); preview != "" {
		other["messages_preview"] = preview
	}
}

func appendOpenAIRequestPreview(req *dto.GeneralOpenAIRequest, other map[string]interface{}) {
	if req == nil || other == nil {
		return
	}
	if len(req.Messages) > 0 {
		other["messages_count"] = len(req.Messages)
	}

	var systemParts []string
	var parts []string
	for _, message := range req.Messages {
		role := normalizePreviewText(message.Role)
		var contentParts []string
		if message.Content != nil {
			for _, item := range message.ParseContent() {
				if text := normalizePreviewText(item.Text); text != "" {
					contentParts = append(contentParts, text)
				}
			}
		}
		line := strings.Join(filterEmptyStrings(append([]string{role}, contentParts...)), ": ")
		if line != "" {
			parts = append(parts, line)
		}
		if role == "system" && len(contentParts) > 0 {
			systemParts = append(systemParts, strings.Join(contentParts, "\n"))
		}
	}
	if systemText := clipPreview(strings.Join(systemParts, "\n"), systemTextMaxLen); systemText != "" {
		other["system_text"] = systemText
	}
	if preview := clipPreview(strings.Join(parts, "\n"), requestLogPreviewMaxLen); preview != "" {
		other["messages_preview"] = preview
	}
}

func appendResponsesRequestPreview(req *dto.OpenAIResponsesRequest, other map[string]interface{}) {
	if req == nil || other == nil {
		return
	}

	if len(req.Instructions) > 0 {
		if systemText := clipPreview(normalizePreviewText(string(req.Instructions)), systemTextMaxLen); systemText != "" {
			other["system_text"] = systemText
		}
	}

	inputs := req.ParseInput()
	if len(inputs) > 0 {
		other["messages_count"] = len(inputs)
	}

	parts := make([]string, 0, len(inputs))
	for _, input := range inputs {
		text := normalizePreviewText(input.Text)
		if text == "" {
			continue
		}
		if input.Type != "" {
			parts = append(parts, normalizePreviewText(input.Type)+": "+text)
		} else {
			parts = append(parts, text)
		}
	}
	if preview := clipPreview(strings.Join(parts, "\n"), requestLogPreviewMaxLen); preview != "" {
		other["messages_preview"] = preview
	}
}

func normalizePreviewText(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	return strings.Join(strings.Fields(value), " ")
}

func clipPreview(value string, limit int) string {
	value = normalizePreviewText(value)
	if value == "" || limit <= 0 {
		return ""
	}
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit]) + "..."
}

func filterEmptyStrings(values []string) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		if strings.TrimSpace(value) == "" {
			continue
		}
		result = append(result, value)
	}
	return result
}
