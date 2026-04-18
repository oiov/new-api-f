package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func newTokenTestRateLimitEngine(userID int, middlewareFunc gin.HandlerFunc) *gin.Engine {
	engine := gin.New()
	engine.Use(func(c *gin.Context) {
		if userID > 0 {
			c.Set("id", userID)
		}
		c.Next()
	})
	engine.Use(middlewareFunc)
	engine.POST("/test", func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})
	return engine
}

func TestTokenTestRateLimit(t *testing.T) {
	gin.SetMode(gin.TestMode)

	originalRedisEnabled := common.RedisEnabled
	originalEnable := common.TokenTestRateLimitEnable
	originalNum := common.TokenTestRateLimitNum
	originalDuration := common.TokenTestRateLimitDuration
	t.Cleanup(func() {
		common.RedisEnabled = originalRedisEnabled
		common.TokenTestRateLimitEnable = originalEnable
		common.TokenTestRateLimitNum = originalNum
		common.TokenTestRateLimitDuration = originalDuration
	})

	common.RedisEnabled = false

	t.Run("skip when disabled", func(t *testing.T) {
		common.TokenTestRateLimitEnable = false
		common.TokenTestRateLimitNum = 1
		common.TokenTestRateLimitDuration = 60

		engine := newTokenTestRateLimitEngine(10101, TokenTestRateLimit())
		for i := 0; i < 2; i++ {
			recorder := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/test", nil)
			engine.ServeHTTP(recorder, req)
			require.Equal(t, http.StatusNoContent, recorder.Code)
		}
	})

	t.Run("reject unauthenticated request", func(t *testing.T) {
		common.TokenTestRateLimitEnable = true
		common.TokenTestRateLimitNum = 2
		common.TokenTestRateLimitDuration = 60

		engine := newTokenTestRateLimitEngine(0, TokenTestRateLimit())
		recorder := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/test", nil)
		engine.ServeHTTP(recorder, req)
		require.Equal(t, http.StatusUnauthorized, recorder.Code)
	})

	t.Run("limit per authenticated user", func(t *testing.T) {
		common.TokenTestRateLimitEnable = true
		common.TokenTestRateLimitNum = 2
		common.TokenTestRateLimitDuration = 60

		engine := newTokenTestRateLimitEngine(20202, TokenTestRateLimit())

		for i := 0; i < 2; i++ {
			recorder := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/test", nil)
			engine.ServeHTTP(recorder, req)
			require.Equal(t, http.StatusNoContent, recorder.Code)
		}

		recorder := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/test", nil)
		engine.ServeHTTP(recorder, req)
		require.Equal(t, http.StatusTooManyRequests, recorder.Code)
	})
}
