package service

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

// 护栏 (#5083): 截断仅作用于本地日志；当 showBodyWhenFail=true 时，
// 返回给调用方的错误必须保留完整的上游响应体，不被截断。
func TestRelayErrorHandlerKeepsFullBodyForCaller(t *testing.T) {
	longBody := strings.Repeat("E", common.LocalLogContentLimit+500) // 非 JSON，触发 Unmarshal 失败分支
	resp := &http.Response{
		StatusCode: http.StatusInternalServerError,
		Body:       io.NopCloser(strings.NewReader(longBody)),
		Header:     make(http.Header),
	}

	apiErr := RelayErrorHandler(context.Background(), resp, true)
	require.NotNil(t, apiErr)
	require.NotNil(t, apiErr.Err)
	require.Contains(t, apiErr.Err.Error(), longBody, "调用方错误必须保留完整上游响应体（不截断）")
}
