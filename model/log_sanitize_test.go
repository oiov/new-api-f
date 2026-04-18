package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSanitizeLogOtherHidesSensitivePreviewForNonRoot(t *testing.T) {
	other := `{"messages_count":2,"system_text":"system prompt","messages_preview":"user: hi","admin_info":{"retry":1},"reject_reason":"blocked","safe":"ok"}`

	sanitized := sanitizeLogOther(other, true, false)

	assert.JSONEq(t, `{"safe":"ok"}`, sanitized)
}

func TestSanitizeLogOtherKeepsSensitivePreviewForRoot(t *testing.T) {
	other := `{"messages_count":2,"system_text":"system prompt","messages_preview":"user: hi","admin_info":{"retry":1},"reject_reason":"blocked","safe":"ok"}`

	sanitized := sanitizeLogOther(other, false, true)

	assert.JSONEq(t, `{"messages_count":2,"system_text":"system prompt","messages_preview":"user: hi","admin_info":{"retry":1},"reject_reason":"blocked","safe":"ok"}`, sanitized)
}

func TestFormatLogsRemovesSensitivePreviewAndChannelNameForUserView(t *testing.T) {
	logs := []*Log{
		{
			Id:          99,
			ChannelName: "test-channel",
			Other:       `{"messages_count":1,"system_text":"system prompt","messages_preview":"user: hi","safe":"ok"}`,
		},
	}

	formatLogs(logs, 10, true, true, false)

	assert.Equal(t, 11, logs[0].Id)
	assert.Empty(t, logs[0].ChannelName)
	assert.JSONEq(t, `{"safe":"ok"}`, logs[0].Other)
}
