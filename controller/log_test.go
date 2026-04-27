package controller

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestValidateLogImageDownloadResponseRejectsOversizedContentLength(t *testing.T) {
	err := validateLogImageDownloadResponse(&http.Response{
		StatusCode:    http.StatusOK,
		ContentLength: maxLogImageDownloadBytes + 1,
	})

	require.Error(t, err)
	require.Contains(t, err.Error(), "图片文件过大")
}

func TestValidateLogImageDownloadResponseRejectsBadStatus(t *testing.T) {
	err := validateLogImageDownloadResponse(&http.Response{
		StatusCode:    http.StatusBadGateway,
		ContentLength: 1024,
	})

	require.Error(t, err)
	require.Contains(t, err.Error(), "源站状态码 502")
}
