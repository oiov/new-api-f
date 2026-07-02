package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestLogCSVHeadersNoChannelIdHasQuotaUsd(t *testing.T) {
	h := logCSVHeaders()
	require.NotContains(t, h, "channel_id")
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
