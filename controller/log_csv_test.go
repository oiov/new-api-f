package controller

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestLogCSVHeadersNoChannelIdHasQuotaUsd(t *testing.T) {
	h := logCSVHeaders()
	require.NotContains(t, h, "channel_id")
	require.NotContains(t, h, "channel_name")
	require.Contains(t, h, "quota_usd")
	for i, c := range h {
		if c == "quota" {
			require.Equal(t, "quota_usd", h[i+1], "quota_usd 应紧跟 quota")
		}
	}
}

func TestLogCSVRowQuotaUsd(t *testing.T) {
	row := logCSVRow(&model.Log{Quota: 174660})
	h := logCSVHeaders()
	require.Equal(t, len(h), len(row), "行列数应与表头一致")
	idx := -1
	for i, c := range h {
		if c == "quota_usd" {
			idx = i
		}
	}
	require.NotEqual(t, -1, idx)
	require.Equal(t, "0.349320", row[idx])
}

func TestLogCSVRowCreatedAtFormatted(t *testing.T) {
	// 1782961428 => 2026-07 (服务器本地时区格式化)
	row := logCSVRow(&model.Log{CreatedAt: 1782961428})
	h := logCSVHeaders()
	idx := -1
	for i, c := range h {
		if c == "created_at" {
			idx = i
		}
	}
	require.NotEqual(t, -1, idx)
	require.Equal(t, time.Unix(1782961428, 0).Format("2006-01-02 15:04:05"), row[idx])
	require.NotEqual(t, "1782961428", row[idx], "created_at 应为格式化后的时间，而非原始 unix 秒")
}
