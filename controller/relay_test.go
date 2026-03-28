package controller

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestAppendSiteDomainForRateLimitError(t *testing.T) {
	t.Parallel()

	origServerAddress := system_setting.ServerAddress
	t.Cleanup(func() {
		system_setting.ServerAddress = origServerAddress
	})

	gin.SetMode(gin.TestMode)

	t.Run("append server address domain for upstream rpm limit", func(t *testing.T) {
		system_setting.ServerAddress = "https://fishxcode.com"
		ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
		ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
		ctx.Request.Host = "api.example.com"

		apiErr := types.NewOpenAIError(
			errors.New("Account RPM limit exceeded. Please slow down (Max 20/min)."),
			types.ErrorCodeBadResponseStatusCode,
			http.StatusTooManyRequests,
		)

		message := appendSiteDomainForRateLimitError(ctx, apiErr)
		require.Equal(t, "Account RPM limit exceeded. Please slow down (Max 20/min). (site: fishxcode.com)", message)
	})

	t.Run("fallback to request host when server address is empty", func(t *testing.T) {
		system_setting.ServerAddress = ""
		ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
		ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
		ctx.Request.Host = "relay.example.com:8443"

		apiErr := types.NewOpenAIError(
			errors.New("Account RPM limit exceeded. Please slow down (Max 20/min)."),
			types.ErrorCodeBadResponseStatusCode,
			http.StatusTooManyRequests,
		)

		message := appendSiteDomainForRateLimitError(ctx, apiErr)
		require.Equal(t, "Account RPM limit exceeded. Please slow down (Max 20/min). (site: relay.example.com)", message)
	})

	t.Run("skip non target 429 message", func(t *testing.T) {
		system_setting.ServerAddress = "https://fishxcode.com"
		ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
		ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
		ctx.Request.Host = "relay.example.com"

		apiErr := types.NewOpenAIError(
			errors.New("quota exceeded"),
			types.ErrorCodeBadResponseStatusCode,
			http.StatusTooManyRequests,
		)

		message := appendSiteDomainForRateLimitError(ctx, apiErr)
		require.Equal(t, "quota exceeded", message)
	})
}
