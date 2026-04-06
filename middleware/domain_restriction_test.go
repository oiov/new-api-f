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
	t.Run("allow configured host family", func(t *testing.T) {
		require.True(t, isAllowedFishxcodeHost("nbility.dev"))
		require.True(t, isAllowedFishxcodeHost("api.nbility.dev"))
		require.True(t, isAllowedFishxcodeHost("API.FISHXCODE.COM:443"))
	})

	t.Run("allow local development hosts", func(t *testing.T) {
		require.True(t, isAllowedFishxcodeHost("localhost"))
		require.True(t, isAllowedFishxcodeHost("127.0.0.1:3000"))
		require.True(t, isAllowedFishxcodeHost("[::1]:8080"))
	})

	t.Run("block non allowed hosts", func(t *testing.T) {
		require.False(t, isAllowedFishxcodeHost("example.com"))
		require.False(t, isAllowedFishxcodeHost("nbility.dev.evil.com"))
	})
}

func TestEvaluateProxyDistributionRequest(t *testing.T) {
	allowedHosts := []string{"nbility.dev", "*.nbility.dev", "localhost"}
	allowedSources := []string{"nbility.dev", "*.nbility.dev", "localhost"}

	t.Run("allow configured host and origin", func(t *testing.T) {
		decision := EvaluateProxyDistributionRequest(
			"nbility.dev",
			"https://console.nbility.dev",
			"https://console.nbility.dev/path",
			allowedHosts,
			allowedSources,
			false,
		)
		require.True(t, decision.Allowed)
		require.Equal(t, "allow", decision.Action)
	})

	t.Run("block request host outside allow list", func(t *testing.T) {
		decision := EvaluateProxyDistributionRequest(
			"example.com",
			"",
			"",
			allowedHosts,
			allowedSources,
			false,
		)
		require.False(t, decision.Allowed)
		require.Equal(t, "block", decision.Action)
		require.Equal(t, "request_host_not_allowed", decision.Reason)
	})

	t.Run("block invalid origin host", func(t *testing.T) {
		decision := EvaluateProxyDistributionRequest(
			"nbility.dev",
			"https://evil.example.com",
			"",
			allowedHosts,
			allowedSources,
			false,
		)
		require.False(t, decision.Allowed)
		require.Equal(t, "origin_host_not_allowed", decision.Reason)
	})

	t.Run("observe only when log only enabled", func(t *testing.T) {
		decision := EvaluateProxyDistributionRequest(
			"nbility.dev",
			"https://evil.example.com",
			"",
			allowedHosts,
			allowedSources,
			true,
		)
		require.False(t, decision.Allowed)
		require.Equal(t, "observe", decision.Action)
	})
}

func TestDisallowProxyDistribution(t *testing.T) {
	setting := system_setting.GetErrorSetting()
	origEnabled := setting.RestrictProxyDistribution
	origLogOnly := setting.RestrictProxyDistributionLogOnly
	origHosts := append([]string(nil), setting.RestrictProxyDistributionAllowedHosts...)
	origSources := append([]string(nil), setting.RestrictProxyDistributionAllowedSources...)
	origMessage := setting.RestrictProxyDistributionBlockedMessage
	t.Cleanup(func() {
		setting.RestrictProxyDistribution = origEnabled
		setting.RestrictProxyDistributionLogOnly = origLogOnly
		setting.RestrictProxyDistributionAllowedHosts = origHosts
		setting.RestrictProxyDistributionAllowedSources = origSources
		setting.RestrictProxyDistributionBlockedMessage = origMessage
	})

	setting.RestrictProxyDistributionAllowedHosts = []string{"nbility.dev", "*.nbility.dev", "localhost"}
	setting.RestrictProxyDistributionAllowedSources = []string{"nbility.dev", "*.nbility.dev", "localhost"}

	gin.SetMode(gin.TestMode)

	t.Run("skip restriction when disabled", func(t *testing.T) {
		setting.RestrictProxyDistribution = false
		setting.RestrictProxyDistributionLogOnly = false
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

	t.Run("bypass public config route", func(t *testing.T) {
		setting.RestrictProxyDistribution = true
		setting.RestrictProxyDistributionLogOnly = false
		recorder := httptest.NewRecorder()
		_, engine := gin.CreateTestContext(recorder)
		engine.Use(DisallowProxyDistribution())
		engine.GET("/api/anti_distribution/public", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"success": true})
		})

		req := httptest.NewRequest(http.MethodGet, "/api/anti_distribution/public", nil)
		req.Host = "example.com"
		engine.ServeHTTP(recorder, req)

		require.Equal(t, http.StatusOK, recorder.Code)
	})

	t.Run("block relay with openai error format", func(t *testing.T) {
		setting.RestrictProxyDistribution = true
		setting.RestrictProxyDistributionLogOnly = false
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
		require.Contains(t, body["error"]["message"], "请求 Host 不在白名单")
		require.Equal(t, "backend", recorder.Header().Get("X-Anti-Distribution-Layer"))
	})

	t.Run("block disallowed origin", func(t *testing.T) {
		setting.RestrictProxyDistribution = true
		setting.RestrictProxyDistributionLogOnly = false
		recorder := httptest.NewRecorder()
		_, engine := gin.CreateTestContext(recorder)
		engine.Use(RouteTag("api"), DisallowProxyDistribution())
		engine.GET("/api/status", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"success": true})
		})

		req := httptest.NewRequest(http.MethodGet, "/api/status", nil)
		req.Host = "nbility.dev"
		req.Header.Set("Origin", "https://evil.example.com")
		engine.ServeHTTP(recorder, req)

		require.Equal(t, http.StatusForbidden, recorder.Code)
		require.Contains(t, recorder.Body.String(), "Origin 不在白名单")
	})

	t.Run("ignore forged x forwarded host header", func(t *testing.T) {
		setting.RestrictProxyDistribution = true
		setting.RestrictProxyDistributionLogOnly = false
		recorder := httptest.NewRecorder()
		_, engine := gin.CreateTestContext(recorder)
		engine.Use(DisallowProxyDistribution())
		engine.GET("/api/status", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"success": true})
		})

		req := httptest.NewRequest(http.MethodGet, "/api/status", nil)
		req.Host = "example.com"
		req.Header.Set("X-Forwarded-Host", "nbility.dev")
		engine.ServeHTTP(recorder, req)

		require.Equal(t, http.StatusForbidden, recorder.Code)
		require.Contains(t, recorder.Body.String(), "请求 Host 不在白名单")
	})

	t.Run("allow nbility subdomain when enabled", func(t *testing.T) {
		setting.RestrictProxyDistribution = true
		setting.RestrictProxyDistributionLogOnly = false
		recorder := httptest.NewRecorder()
		_, engine := gin.CreateTestContext(recorder)
		engine.Use(RouteTag("api"), DisallowProxyDistribution())
		engine.GET("/api/status", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"success": true})
		})

		req := httptest.NewRequest(http.MethodGet, "/api/status", nil)
		req.Host = "console.nbility.dev"
		req.Header.Set("Origin", "https://www.nbility.dev")
		engine.ServeHTTP(recorder, req)

		require.Equal(t, http.StatusOK, recorder.Code)
	})

	t.Run("observe only in log mode", func(t *testing.T) {
		setting.RestrictProxyDistribution = true
		setting.RestrictProxyDistributionLogOnly = true
		recorder := httptest.NewRecorder()
		_, engine := gin.CreateTestContext(recorder)
		engine.Use(RouteTag("api"), DisallowProxyDistribution())
		engine.GET("/api/status", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"success": true})
		})

		req := httptest.NewRequest(http.MethodGet, "/api/status", nil)
		req.Host = "example.com"
		engine.ServeHTTP(recorder, req)

		require.Equal(t, http.StatusOK, recorder.Code)
	})
}
