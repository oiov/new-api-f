package router

import (
	"embed"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestSelfSiteNotificationRoutesUseSelfPrefix(t *testing.T) {
	gin.SetMode(gin.TestMode)

	previousFrontendBaseURL := os.Getenv("FRONTEND_BASE_URL")
	previousIsMasterNode := common.IsMasterNode
	t.Cleanup(func() {
		common.IsMasterNode = previousIsMasterNode
		if previousFrontendBaseURL == "" {
			_ = os.Unsetenv("FRONTEND_BASE_URL")
		} else {
			_ = os.Setenv("FRONTEND_BASE_URL", previousFrontendBaseURL)
		}
	})

	common.IsMasterNode = false
	require.NoError(t, os.Setenv("FRONTEND_BASE_URL", "https://nbility.dev"))

	engine := gin.New()
	engine.Use(sessions.Sessions("session", cookie.NewStore([]byte("test"))))
	SetRouter(engine, embed.FS{}, nil)

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/user/self/notifications/unread_count", nil)
	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusUnauthorized, recorder.Code)
	require.Empty(t, recorder.Header().Get("Location"))
	require.JSONEq(t, `{"success":false,"message":"无权进行此操作，未登录且未提供 access token"}`, recorder.Body.String())
}
