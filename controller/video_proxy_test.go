package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestVideoProxyBlocksUnsafeResultURLBeforeFetch(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupVideoProxyTestDB(t)
	setupVideoProxyFetchSetting(t)

	require.NoError(t, model.DB.Create(&model.Channel{
		Id:     77,
		Type:   constant.ChannelTypeSunoAPI,
		Key:    "test-key",
		Status: common.ChannelStatusEnabled,
		Name:   "video-test",
	}).Error)
	require.NoError(t, model.DB.Create(&model.Task{
		TaskID:    "task_unsafe_video",
		UserId:    12,
		ChannelId: 77,
		Status:    model.TaskStatusSuccess,
		PrivateData: model.TaskPrivateData{
			ResultURL: "http://127.0.0.1/video.mp4",
		},
	}).Error)

	engine := gin.New()
	engine.GET("/v1/videos/:task_id/content", func(c *gin.Context) {
		c.Set("id", 12)
		VideoProxy(c)
	})
	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/v1/videos/task_unsafe_video/content", nil)

	engine.ServeHTTP(recorder, req)

	require.Equal(t, http.StatusForbidden, recorder.Code)
	require.Contains(t, recorder.Body.String(), "request blocked")
	require.Contains(t, recorder.Body.String(), "private IP address not allowed")
}

func setupVideoProxyTestDB(t *testing.T) {
	t.Helper()
	originalDB := model.DB
	originalLogDB := model.LOG_DB
	originalUsingSQLite := common.UsingSQLite
	originalMemoryCacheEnabled := common.MemoryCacheEnabled

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(&model.Task{}, &model.Channel{}))

	model.DB = db
	model.LOG_DB = db
	common.UsingSQLite = true
	common.MemoryCacheEnabled = false
	service.InitHttpClient()
	t.Cleanup(func() {
		model.DB = originalDB
		model.LOG_DB = originalLogDB
		common.UsingSQLite = originalUsingSQLite
		common.MemoryCacheEnabled = originalMemoryCacheEnabled
		_ = sqlDB.Close()
	})
}

func setupVideoProxyFetchSetting(t *testing.T) {
	t.Helper()
	fetchSetting := system_setting.GetFetchSetting()
	original := *fetchSetting
	*fetchSetting = system_setting.FetchSetting{
		EnableSSRFProtection:   true,
		AllowPrivateIp:         false,
		DomainFilterMode:       false,
		IpFilterMode:           false,
		DomainList:             []string{},
		IpList:                 []string{},
		AllowedPorts:           []string{"80", "443"},
		ApplyIPFilterForDomain: true,
	}
	t.Cleanup(func() {
		*fetchSetting = original
	})
}
