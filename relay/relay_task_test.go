package relay

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestRelayTaskFetchRefreshesSeedanceTaskFromUpstream(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupRelayTaskFetchTestDB(t)

	const (
		userID         = 42
		channelID      = 61
		publicTaskID   = "task_public_seedance_123"
		upstreamTaskID = "task_upstream_seedance_123"
		resultURL      = "https://cdn.example.com/out.mp4"
	)

	var gotPath string
	var gotAuth string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"code":"success",
			"data":{
				"task_id":"` + upstreamTaskID + `",
				"status":"SUCCESS",
				"progress":"100%",
				"result_url":"` + resultURL + `",
				"data":{"video_url":"` + resultURL + `"}
			}
		}`))
	}))
	t.Cleanup(upstream.Close)

	baseURL := upstream.URL
	require.NoError(t, model.DB.Create(&model.Channel{
		Id:      channelID,
		Type:    constant.ChannelTypeSeedance2,
		Key:     "seedance-test-key",
		BaseURL: &baseURL,
		Status:  common.ChannelStatusEnabled,
	}).Error)
	require.NoError(t, model.DB.Create(&model.Task{
		TaskID:    publicTaskID,
		Platform:  constant.TaskPlatform("59"),
		UserId:    userID,
		ChannelId: channelID,
		Status:    model.TaskStatusNotStart,
		Progress:  "0%",
		PrivateData: model.TaskPrivateData{
			UpstreamTaskID: upstreamTaskID,
		},
		Properties: model.Properties{
			OriginModelName: "seedance-2-0-lite-t2v",
		},
		Data: []byte(`{"task_id":"` + upstreamTaskID + `","status":"NOT_START","progress":"0%"}`),
	}).Error)

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/v1/videos/"+publicTaskID, nil)
	c.Params = gin.Params{{Key: "task_id", Value: publicTaskID}}
	c.Set("id", userID)

	taskErr := RelayTaskFetch(c, relayconstant.RelayModeVideoFetchByID)
	require.Nil(t, taskErr)
	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, "/v1/video/generations/"+upstreamTaskID, gotPath)
	require.Equal(t, "Bearer seedance-test-key", gotAuth)

	var video dto.OpenAIVideo
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &video))
	require.Equal(t, publicTaskID, video.ID)
	require.Equal(t, dto.VideoStatusCompleted, video.Status)
	require.Equal(t, 100, video.Progress)
	require.Equal(t, resultURL, video.Metadata["url"])

	var persisted model.Task
	require.NoError(t, model.DB.Where("task_id = ?", publicTaskID).First(&persisted).Error)
	require.Equal(t, string(model.TaskStatusSuccess), string(persisted.Status))
	require.Equal(t, "100%", persisted.Progress)
	require.Equal(t, resultURL, persisted.GetResultURL())
	require.Contains(t, string(persisted.Data), resultURL)
}

func setupRelayTaskFetchTestDB(t *testing.T) {
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
