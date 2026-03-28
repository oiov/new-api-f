package middleware

import (
	"net"
	"net/http"
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
)

const proxyDistributionBlockedMessage = "请勿使用反代等程序，请使用 https://fishxcode.com 中转站，如需外接请联系。"

func DisallowProxyDistribution() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !system_setting.GetErrorSetting().RestrictProxyDistribution {
			c.Next()
			return
		}

		host := getRequestHost(c)
		if isAllowedFishxcodeHost(host) {
			c.Next()
			return
		}

		abortProxyDistributionRequest(c)
	}
}

func abortProxyDistributionRequest(c *gin.Context) {
	switch detectRestrictedRouteKind(c) {
	case "relay":
		abortWithOpenAiMessage(c, http.StatusForbidden, proxyDistributionBlockedMessage)
	case "api":
		c.JSON(http.StatusForbidden, gin.H{
			"success": false,
			"message": proxyDistributionBlockedMessage,
		})
		c.Abort()
	default:
		c.String(http.StatusForbidden, proxyDistributionBlockedMessage)
		c.Abort()
	}
}

func getRequestHost(c *gin.Context) string {
	if c == nil || c.Request == nil {
		return ""
	}
	return normalizeHost(c.Request.Host)
}

func detectRestrictedRouteKind(c *gin.Context) string {
	if c == nil || c.Request == nil || c.Request.URL == nil {
		return "web"
	}
	path := c.Request.URL.Path
	switch {
	case strings.HasPrefix(path, "/api/"):
		return "api"
	case strings.HasPrefix(path, "/v1/"),
		strings.HasPrefix(path, "/v1beta/"),
		strings.HasPrefix(path, "/mj/"),
		strings.Contains(path, "/mj/"),
		strings.HasPrefix(path, "/pg/"),
		strings.HasPrefix(path, "/suno/"),
		strings.HasPrefix(path, "/kling/"),
		strings.HasPrefix(path, "/jimeng"),
		strings.HasPrefix(path, "/dashboard/"):
		return "relay"
	default:
		return "web"
	}
}

func normalizeHost(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if strings.Contains(raw, "://") {
		parsed, err := url.Parse(raw)
		if err != nil {
			return ""
		}
		raw = parsed.Host
	}
	if host, _, err := net.SplitHostPort(raw); err == nil {
		raw = host
	} else if strings.Count(raw, ":") == 1 {
		raw = strings.Split(raw, ":")[0]
	}
	return strings.ToLower(strings.TrimSpace(raw))
}

func isAllowedFishxcodeHost(host string) bool {
	host = normalizeHost(host)
	if host == "" {
		return false
	}
	if host == "fishxcode.com" || strings.HasSuffix(host, ".fishxcode.com") {
		return true
	}
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}
