package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestDistribute_AllowsVideoTaskFetchWithoutSelectingChannel(t *testing.T) {
	gin.SetMode(gin.TestMode)

	for _, path := range []string{
		"/v1/videos/task_demo_123",
		"/v1/video/generations/task_demo_123",
	} {
		t.Run(path, func(t *testing.T) {
			router := gin.New()
			router.Use(Distribute())
			router.GET(path, func(c *gin.Context) {
				c.Status(http.StatusNoContent)
			})

			req := httptest.NewRequest(http.MethodGet, path, nil)
			recorder := httptest.NewRecorder()

			router.ServeHTTP(recorder, req)

			if recorder.Code != http.StatusNoContent {
				t.Fatalf("expected status %d, got %d, body=%s", http.StatusNoContent, recorder.Code, recorder.Body.String())
			}
		})
	}
}
