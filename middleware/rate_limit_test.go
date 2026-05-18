package middleware

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
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

func setupMiddlewareTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	gin.SetMode(gin.TestMode)
	common.UsingSQLite = true
	common.UsingMySQL = false
	common.UsingPostgreSQL = false
	common.RedisEnabled = false

	oldUserUsableGroups := setting.UserUsableGroups2JSONString()
	oldGroupRatio := ratio_setting.GroupRatio2JSONString()
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"默认分组","vip":"VIP"}`))
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"vip":1}`))

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	model.LOG_DB = db

	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Token{}))

	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(oldUserUsableGroups))
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(oldGroupRatio))
		sqlDB, err := db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	})

	return db
}

func TestTokenAuthStoresAuthorizedTokenGroups(t *testing.T) {
	db := setupMiddlewareTestDB(t)

	require.NoError(t, db.Create(&model.User{
		Id:          10,
		Username:    "multi-group-user",
		Status:      common.UserStatusEnabled,
		Group:       "default",
		Quota:       1000,
		AccessToken: common.GetPointer("access-token"),
	}).Error)
	require.NoError(t, db.Create(&model.Token{
		Id:             20,
		UserId:         10,
		Name:           "multi-group-token",
		Key:            "multigroupkey",
		Status:         common.TokenStatusEnabled,
		Group:          "default,vip",
		ExpiredTime:    -1,
		UnlimitedQuota: true,
	}).Error)

	var tokenGroup string
	var tokenGroups []string
	engine := gin.New()
	engine.Use(TokenAuth())
	engine.GET("/test", func(c *gin.Context) {
		tokenGroup = common.GetContextKeyString(c, constant.ContextKeyTokenGroup)
		rawGroups, ok := common.GetContextKey(c, constant.ContextKeyTokenGroups)
		require.True(t, ok)
		tokenGroups = rawGroups.([]string)
		c.Status(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer sk-multigroupkey")
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "default,vip", tokenGroup)
	require.Equal(t, []string{"default", "vip"}, tokenGroups)
}

func TestTokenAuthDoesNotLeakTokenStatusForInvalidToken(t *testing.T) {
	db := setupMiddlewareTestDB(t)

	require.NoError(t, db.Create(&model.User{
		Id:       11,
		Username: "exhausted-user",
		Status:   common.UserStatusEnabled,
		Group:    "default",
		Quota:    1000,
	}).Error)
	require.NoError(t, db.Create(&model.Token{
		Id:             21,
		UserId:         11,
		Name:           "exhausted-token",
		Key:            "leakyexhaustedkey",
		Status:         common.TokenStatusExhausted,
		Group:          "default",
		ExpiredTime:    -1,
		RemainQuota:    0,
		UnlimitedQuota: false,
	}).Error)

	engine := gin.New()
	engine.Use(TokenAuth())
	engine.GET("/test", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer sk-leakyexhaustedkey")
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	require.Equal(t, http.StatusUnauthorized, rec.Code)
	require.NotContains(t, rec.Body.String(), "TokenStatusExhausted")
	require.NotContains(t, rec.Body.String(), "leakyexhaustedkey")
	require.NotContains(t, rec.Body.String(), "额度已用尽")
	require.Contains(t, rec.Body.String(), "无效的令牌")
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
