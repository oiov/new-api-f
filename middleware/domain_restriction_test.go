package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestIsAllowedFishxcodeHost(t *testing.T) {
	t.Run("allow fishxcode domain family", func(t *testing.T) {
		require.True(t, isAllowedFishxcodeHost("fishxcode.com"))
		require.True(t, isAllowedFishxcodeHost("api.fishxcode.com"))
		require.True(t, isAllowedFishxcodeHost("API.FISHXCODE.COM:443"))
	})

	t.Run("allow local development hosts", func(t *testing.T) {
		require.True(t, isAllowedFishxcodeHost("localhost"))
		require.True(t, isAllowedFishxcodeHost("127.0.0.1:3000"))
		require.True(t, isAllowedFishxcodeHost("[::1]:8080"))
	})

	t.Run("block non fishxcode hosts", func(t *testing.T) {
		require.False(t, isAllowedFishxcodeHost("example.com"))
		require.False(t, isAllowedFishxcodeHost("fishxcode.com.evil.com"))
	})
}

func TestDisallowProxyDistribution(t *testing.T) {
	orig := system_setting.GetErrorSetting().RestrictProxyDistribution
	t.Cleanup(func() {
		system_setting.GetErrorSetting().RestrictProxyDistribution = orig
	})

	gin.SetMode(gin.TestMode)

	t.Run("skip restriction when disabled", func(t *testing.T) {
		system_setting.GetErrorSetting().RestrictProxyDistribution = false
		recorder := httptest.NewRecorder()
		ctx, engine := gin.CreateTestContext(recorder)
		ctx.Request = httptest.NewRequest(http.MethodGet, "/api/status", nil)
		ctx.Request.Host = "example.com"
		engine.Use(RouteTag("api"), DisallowProxyDistribution())
		engine.GET("/api/status", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"success": true})
		})

		engine.ServeHTTP(recorder, ctx.Request)
		require.Equal(t, http.StatusOK, recorder.Code)
	})

	t.Run("block non fishxcode api host when enabled", func(t *testing.T) {
		system_setting.GetErrorSetting().RestrictProxyDistribution = true
		recorder := httptest.NewRecorder()
		_, engine := gin.CreateTestContext(recorder)
		engine.Use(RouteTag("api"), DisallowProxyDistribution())
		engine.GET("/api/status", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"success": true})
		})

		req := httptest.NewRequest(http.MethodGet, "/api/status", nil)
		req.Host = "example.com"
		engine.ServeHTTP(recorder, req)

		require.Equal(t, http.StatusForbidden, recorder.Code)
		require.Contains(t, recorder.Body.String(), proxyDistributionBlockedMessage)
	})

	t.Run("block relay with openai error format", func(t *testing.T) {
		system_setting.GetErrorSetting().RestrictProxyDistribution = true
		recorder := httptest.NewRecorder()
		_, engine := gin.CreateTestContext(recorder)
		engine.Use(DisallowProxyDistribution())
		engine.GET("/v1/models", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"ok": true})
		})

		req := httptest.NewRequest(http.MethodGet, "/v1/models", nil)
		req.Host = "example.com"
		engine.ServeHTTP(recorder, req)

		require.Equal(t, http.StatusForbidden, recorder.Code)
		var body map[string]map[string]string
		require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
		require.Contains(t, body["error"]["message"], proxyDistributionBlockedMessage)
	})

	t.Run("block mode mj route with openai error format", func(t *testing.T) {
		system_setting.GetErrorSetting().RestrictProxyDistribution = true
		recorder := httptest.NewRecorder()
		_, engine := gin.CreateTestContext(recorder)
		engine.Use(DisallowProxyDistribution())
		engine.POST("/fast/mj/submit/imagine", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"ok": true})
		})

		req := httptest.NewRequest(http.MethodPost, "/fast/mj/submit/imagine", nil)
		req.Host = "example.com"
		engine.ServeHTTP(recorder, req)

		require.Equal(t, http.StatusForbidden, recorder.Code)
		var body map[string]map[string]string
		require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
		require.Contains(t, body["error"]["message"], proxyDistributionBlockedMessage)
	})

	t.Run("ignore forged x forwarded host header", func(t *testing.T) {
		system_setting.GetErrorSetting().RestrictProxyDistribution = true
		recorder := httptest.NewRecorder()
		_, engine := gin.CreateTestContext(recorder)
		engine.Use(DisallowProxyDistribution())
		engine.GET("/api/status", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"success": true})
		})

		req := httptest.NewRequest(http.MethodGet, "/api/status", nil)
		req.Host = "example.com"
		req.Header.Set("X-Forwarded-Host", "fishxcode.com")
		engine.ServeHTTP(recorder, req)

		require.Equal(t, http.StatusForbidden, recorder.Code)
		require.Contains(t, recorder.Body.String(), proxyDistributionBlockedMessage)
	})

	t.Run("block empty host", func(t *testing.T) {
		system_setting.GetErrorSetting().RestrictProxyDistribution = true
		recorder := httptest.NewRecorder()
		_, engine := gin.CreateTestContext(recorder)
		engine.Use(DisallowProxyDistribution())
		engine.GET("/api/status", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"success": true})
		})

		req := httptest.NewRequest(http.MethodGet, "/api/status", nil)
		req.Host = ""
		engine.ServeHTTP(recorder, req)

		require.Equal(t, http.StatusForbidden, recorder.Code)
		require.Contains(t, recorder.Body.String(), proxyDistributionBlockedMessage)
	})

	t.Run("allow fishxcode subdomain when enabled", func(t *testing.T) {
		system_setting.GetErrorSetting().RestrictProxyDistribution = true
		recorder := httptest.NewRecorder()
		_, engine := gin.CreateTestContext(recorder)
		engine.Use(RouteTag("api"), DisallowProxyDistribution())
		engine.GET("/api/status", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"success": true})
		})

		req := httptest.NewRequest(http.MethodGet, "/api/status", nil)
		req.Host = "console.fishxcode.com"
		engine.ServeHTTP(recorder, req)

		require.Equal(t, http.StatusOK, recorder.Code)
	})
}
