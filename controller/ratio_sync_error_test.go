package controller

import (
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// 回归测试 (3ec5f3555): 上游 ratio 同步非 200 时，应解析响应体的 message/error
// 字段并附在错误里，使失败在 API test_results 中可见，而非仅 HTTP status。
func TestUpstreamHTTPError(t *testing.T) {
	newResp := func(status string, code int, body string) *http.Response {
		var b io.ReadCloser
		if body != "" {
			b = io.NopCloser(strings.NewReader(body))
		}
		return &http.Response{Status: status, StatusCode: code, Body: b}
	}

	// nil 响应
	require.Equal(t, "upstream response is nil", upstreamHTTPError(nil))

	// message 字段
	require.Equal(t, "403 Forbidden: quota exceeded",
		upstreamHTTPError(newResp("403 Forbidden", 403, `{"message":"quota exceeded"}`)))

	// error 字段（message 为空时回退）
	require.Equal(t, "401 Unauthorized: invalid key",
		upstreamHTTPError(newResp("401 Unauthorized", 401, `{"error":"invalid key"}`)))

	// 空 body 回退为纯 status
	require.Equal(t, "500 Internal Server Error",
		upstreamHTTPError(newResp("500 Internal Server Error", 500, "")))

	// 非 JSON body 回退为纯 status
	require.Equal(t, "502 Bad Gateway",
		upstreamHTTPError(newResp("502 Bad Gateway", 502, "<html>nginx</html>")))
}
