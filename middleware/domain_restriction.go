package middleware

import (
	"net"
	"net/http"
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
)

type ProxyDistributionDecision struct {
	Allowed       bool
	Action        string
	Reason        string
	ReasonDetail  string
	RequestHost   string
	OriginHost    string
	RefererHost   string
	MatchedSource string
}

func DisallowProxyDistribution() gin.HandlerFunc {
	return func(c *gin.Context) {
		if shouldBypassProxyDistributionCheck(c) {
			c.Next()
			return
		}

		setting := system_setting.GetErrorSetting()
		if !setting.RestrictProxyDistribution {
			c.Next()
			return
		}

		decision := EvaluateProxyDistributionRequest(
			getRequestHost(c),
			getOriginHost(c),
			getRefererHost(c),
			setting.RestrictProxyDistributionAllowedHosts,
			setting.RestrictProxyDistributionAllowedSources,
			setting.RestrictProxyDistributionLogOnly,
		)
		if decision.Allowed {
			c.Next()
			return
		}

		recordAntiDistributionDecision(c, decision, "backend")
		if decision.Action == "observe" {
			c.Next()
			return
		}
		abortProxyDistributionRequest(c, decision, setting.RestrictProxyDistributionBlockedMessage)
	}
}

func shouldBypassProxyDistributionCheck(c *gin.Context) bool {
	if c == nil || c.Request == nil || c.Request.URL == nil {
		return false
	}
	return c.Request.URL.Path == "/api/anti_distribution/public"
}

func EvaluateProxyDistributionRequest(requestHost string, originHost string, refererHost string, allowedHosts []string, allowedSources []string, logOnly bool) ProxyDistributionDecision {
	decision := ProxyDistributionDecision{
		Allowed:     true,
		Action:      "allow",
		RequestHost: normalizeHost(requestHost),
		OriginHost:  normalizeHost(originHost),
		RefererHost: normalizeHost(refererHost),
	}

	if !hostMatchesAny(decision.RequestHost, allowedHosts) {
		return blockProxyDistribution(decision, "request_host", "request_host_not_allowed", "请求 Host 不在白名单", logOnly)
	}

	if decision.OriginHost != "" && !hostMatchesAny(decision.OriginHost, allowedSources) {
		return blockProxyDistribution(decision, "origin", "origin_host_not_allowed", "Origin 不在白名单", logOnly)
	}

	if decision.RefererHost != "" && !hostMatchesAny(decision.RefererHost, allowedSources) {
		return blockProxyDistribution(decision, "referer", "referer_host_not_allowed", "Referer 不在白名单", logOnly)
	}

	return decision
}

func blockProxyDistribution(decision ProxyDistributionDecision, matchedSource string, reason string, detail string, logOnly bool) ProxyDistributionDecision {
	decision.Allowed = false
	if logOnly {
		decision.Action = "observe"
	} else {
		decision.Action = "block"
	}
	decision.Reason = reason
	decision.ReasonDetail = detail
	decision.MatchedSource = matchedSource
	return decision
}

func recordAntiDistributionDecision(c *gin.Context, decision ProxyDistributionDecision, layer string) {
	if decision.Action == "allow" {
		return
	}
	model.RecordAntiDistributionLog(&model.AntiDistributionLog{
		Layer:         layer,
		Action:        decision.Action,
		Reason:        decision.Reason,
		RequestHost:   decision.RequestHost,
		OriginHost:    decision.OriginHost,
		RefererHost:   decision.RefererHost,
		Method:        c.Request.Method,
		Path:          c.Request.URL.Path,
		ClientIP:      c.ClientIP(),
		UserAgent:     c.GetHeader("User-Agent"),
		RequestID:     c.GetString(common.RequestIdKey),
		MatchedSource: decision.MatchedSource,
	})
}

func abortProxyDistributionRequest(c *gin.Context, decision ProxyDistributionDecision, blockedMessage string) {
	message := buildProxyDistributionMessage(blockedMessage, decision.ReasonDetail)
	c.Header("X-Anti-Distribution-Layer", "backend")
	c.Header("X-Anti-Distribution-Action", "block")
	c.Header("X-Anti-Distribution-Reason", decision.Reason)
	switch detectRestrictedRouteKind(c) {
	case "relay":
		abortWithOpenAiMessage(c, http.StatusForbidden, message)
	case "api":
		c.JSON(http.StatusForbidden, gin.H{
			"success": false,
			"message": message,
			"reason":  decision.Reason,
		})
		c.Abort()
	default:
		c.String(http.StatusForbidden, message)
		c.Abort()
	}
}

func buildProxyDistributionMessage(base string, reasonDetail string) string {
	base = strings.TrimSpace(base)
	if base == "" {
		base = "请勿使用反代等程序，请使用 https://fishxcode.com 中转站，如需外接请联系。"
	}
	reasonDetail = strings.TrimSpace(reasonDetail)
	if reasonDetail == "" {
		return base
	}
	return base + " 原因：" + reasonDetail
}

func getRequestHost(c *gin.Context) string {
	if c == nil || c.Request == nil {
		return ""
	}
	return normalizeHost(c.Request.Host)
}

func getOriginHost(c *gin.Context) string {
	if c == nil {
		return ""
	}
	return extractURLHost(c.GetHeader("Origin"))
}

func getRefererHost(c *gin.Context) string {
	if c == nil {
		return ""
	}
	return extractURLHost(c.GetHeader("Referer"))
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

func extractURLHost(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return normalizeHost(parsed.Host)
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
	} else if strings.HasPrefix(raw, "[") && strings.Contains(raw, "]") {
		raw = strings.TrimSuffix(strings.TrimPrefix(raw, "["), "]")
	} else if strings.Count(raw, ":") == 1 {
		raw = strings.Split(raw, ":")[0]
	}
	return strings.ToLower(strings.TrimSpace(strings.Trim(raw, "[]")))
}

func hostMatchesAny(host string, patterns []string) bool {
	host = normalizeHost(host)
	if host == "" {
		return false
	}
	for _, pattern := range patterns {
		if hostMatchesPattern(host, pattern) {
			return true
		}
	}
	return false
}

func hostMatchesPattern(host string, pattern string) bool {
	host = normalizeHost(host)
	pattern = normalizeHost(pattern)
	if host == "" || pattern == "" {
		return false
	}
	if pattern == host {
		return true
	}
	if strings.HasPrefix(pattern, "*.") {
		suffix := strings.TrimPrefix(pattern, "*")
		return strings.HasSuffix(host, suffix)
	}
	return false
}

func isAllowedFishxcodeHost(host string) bool {
	return hostMatchesAny(host, system_setting.GetErrorSetting().RestrictProxyDistributionAllowedHosts)
}
