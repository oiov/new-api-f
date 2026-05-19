package router

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestFetchModelsRouteRequiresRootRole(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := setupChannelSecurityTestDB(t)
	seedChannelSecurityUser(t, db, 1, common.RoleAdminUser, `["channel.upstream.sync"]`)

	engine := gin.New()
	engine.Use(sessions.Sessions("session", cookie.NewStore([]byte("test"))))
	engine.GET("/__test_session", func(c *gin.Context) {
		session := sessions.Default(c)
		session.Set("id", 1)
		session.Set("username", "admin")
		require.NoError(t, session.Save())
		c.Status(http.StatusNoContent)
	})
	SetApiRouter(engine)

	sessionRecorder := httptest.NewRecorder()
	sessionRequest := httptest.NewRequest(http.MethodGet, "/__test_session", nil)
	engine.ServeHTTP(sessionRecorder, sessionRequest)
	require.Equal(t, http.StatusNoContent, sessionRecorder.Code)

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/channel/fetch_models", bytes.NewBufferString(`{`))
	request.Header.Set("Content-Type", "application/json")
	for _, cookie := range sessionRecorder.Result().Cookies() {
		request.AddCookie(cookie)
	}

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.JSONEq(t, `{"success":false,"message":"无权进行此操作，权限不足"}`, recorder.Body.String())
}

func setupChannelSecurityTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	originalDB := model.DB
	originalLogDB := model.LOG_DB
	originalUsingSQLite := common.UsingSQLite
	originalRedisEnabled := common.RedisEnabled
	originalMemoryCacheEnabled := common.MemoryCacheEnabled

	common.UsingSQLite = true
	common.RedisEnabled = false
	common.MemoryCacheEnabled = false

	dsn := "file:" + strings.ReplaceAll(t.Name(), "/", "_") + "?mode=memory&cache=shared"
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(&model.User{}))

	model.DB = db
	model.LOG_DB = db
	t.Cleanup(func() {
		model.DB = originalDB
		model.LOG_DB = originalLogDB
		common.UsingSQLite = originalUsingSQLite
		common.RedisEnabled = originalRedisEnabled
		common.MemoryCacheEnabled = originalMemoryCacheEnabled
		_ = sqlDB.Close()
	})
	return db
}

func seedChannelSecurityUser(t *testing.T, db *gorm.DB, userID int, role int, permissionsJSON string) {
	t.Helper()
	require.NoError(t, db.Create(&model.User{
		Id:              userID,
		Username:        "admin",
		DisplayName:     "admin",
		Role:            role,
		Status:          common.UserStatusEnabled,
		Group:           "default",
		AffCode:         "aff_admin",
		PermissionsJSON: permissionsJSON,
	}).Error)
}
