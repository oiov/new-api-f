package middleware

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestAnonymousRequestBodyLimit(t *testing.T) {
	gin.SetMode(gin.TestMode)

	// run 执行中间件，返回 (是否 abort, 状态码, 下游读到的 body)。
	run := func(limitKB int, bodyLen int) (bool, int, string) {
		prev := constant.AnonymousRequestBodyLimitKB
		constant.AnonymousRequestBodyLimitKB = limitKB
		defer func() { constant.AnonymousRequestBodyLimitKB = prev }()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/api/user/login", strings.NewReader(strings.Repeat("a", bodyLen)))

		AnonymousRequestBodyLimit()(c)

		var seen string
		if !c.IsAborted() {
			data, _ := io.ReadAll(c.Request.Body)
			seen = string(data)
		}
		return c.IsAborted(), w.Code, seen
	}

	t.Run("small body passes and stays intact", func(t *testing.T) {
		// 1KB 上限，500 字节 body → 放行，且下游读到完整 body(web-worker 依赖不被破坏)
		aborted, _, seen := run(1, 500)
		require.False(t, aborted)
		require.Len(t, seen, 500)
	})

	t.Run("oversized body rejected with 413", func(t *testing.T) {
		// 1KB 上限，2000 字节 body → 413
		aborted, code, _ := run(1, 2000)
		require.True(t, aborted)
		require.Equal(t, http.StatusRequestEntityTooLarge, code)
	})

	t.Run("limit disabled with zero passes any size", func(t *testing.T) {
		// 上限 0 表示关闭 → 任意大小放行
		aborted, _, seen := run(0, 4096)
		require.False(t, aborted)
		require.Len(t, seen, 4096)
	})
}
