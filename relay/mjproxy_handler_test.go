package relay

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestRelayMidjourneyImageBlocksUnsafeImageURLBeforeFetch(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupMJProxyTestDB(t)
	setupMJProxyFetchSetting(t)

	require.NoError(t, model.DB.Create(&model.Midjourney{
		MjId:     "mj_unsafe_image",
		ImageUrl: "http://127.0.0.1/image.png",
	}).Error)

	engine := gin.New()
	engine.GET("/mj/image/:id", RelayMidjourneyImage)
	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/mj/image/mj_unsafe_image", nil)

	engine.ServeHTTP(recorder, req)

	require.Equal(t, http.StatusForbidden, recorder.Code)
	require.Contains(t, recorder.Body.String(), "request blocked")
	require.Contains(t, recorder.Body.String(), "private IP address not allowed")
}

func setupMJProxyTestDB(t *testing.T) {
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
	require.NoError(t, db.AutoMigrate(&model.Midjourney{}, &model.Channel{}))

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

func setupMJProxyFetchSetting(t *testing.T) {
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
