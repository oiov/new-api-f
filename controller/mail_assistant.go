package controller

import (
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var mailAssistantUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return allowMailAssistantOrigin(r)
	},
}

func allowMailAssistantOrigin(r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return true
	}
	originHost := extractMailAssistantHost(origin)
	requestHost := extractMailAssistantHost(r.Host)
	if originHost != "" && requestHost != "" && strings.EqualFold(originHost, requestHost) {
		return true
	}
	frontendBaseURL := strings.TrimSpace(os.Getenv("FRONTEND_BASE_URL"))
	frontendHost := extractMailAssistantHost(frontendBaseURL)
	return frontendHost != "" && originHost != "" && strings.EqualFold(originHost, frontendHost)
}

func extractMailAssistantHost(raw string) string {
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
		return host
	}
	return raw
}

func GetMailAssistantSnapshot(c *gin.Context) {
	common.ApiSuccess(c, service.MailAssistant.GetSnapshot(c.GetInt("id")))
}

func ImportMailAssistantAccounts(c *gin.Context) {
	var req service.MailAssistantImportRequest
	if err := common.UnmarshalBodyReusable(c, &req); err != nil {
		common.ApiErrorMsg(c, "请求参数格式错误")
		return
	}
	snapshot, err := service.MailAssistant.Import(c.GetInt("id"), req.Content)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, snapshot)
}

func PullMailAssistantAccounts(c *gin.Context) {
	snapshot, err := service.MailAssistant.PullAll(c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, snapshot)
}

func PullMailAssistantAccount(c *gin.Context) {
	snapshot, err := service.MailAssistant.PullAccount(c.GetInt("id"), c.Param("account_id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, snapshot)
}

func MailAssistantWS(c *gin.Context) {
	conn, err := mailAssistantUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	userID := c.GetInt("id")
	service.MailAssistant.RegisterWS(userID, conn)
	defer func() {
		service.MailAssistant.UnregisterWS(userID, conn)
		_ = conn.Close()
	}()

	for {
		if _, _, err = conn.ReadMessage(); err != nil {
			return
		}
	}
}
