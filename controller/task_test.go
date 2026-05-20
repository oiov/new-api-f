package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestGetUserTaskWithTaskIDRefreshesSeedanceTaskFromUpstream(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupTaskControllerTestDB(t)

	const (
		userID         = 42
		channelID      = 61
		publicTaskID   = "task_public_seedance_list"
		upstreamTaskID = "task_upstream_seedance_list"
		resultURL      = "https://cdn.example.com/list.mp4"
	)

	var gotPath string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
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
		Status:    model.TaskStatusInProgress,
		Progress:  "50%",
		PrivateData: model.TaskPrivateData{
			UpstreamTaskID: upstreamTaskID,
		},
		Properties: model.Properties{
			OriginModelName: "seedance-2-0-lite-t2v",
		},
		Data: []byte(`{"task_id":"` + upstreamTaskID + `","status":"IN_PROGRESS","progress":"50%"}`),
	}).Error)

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/task/self?task_id="+publicTaskID, nil)
	c.Set("id", userID)

	GetUserTask(c)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, "/v1/video/generations/"+upstreamTaskID, gotPath)

	var resp struct {
		Success bool `json:"success"`
		Data    struct {
			Items []dto.TaskDto `json:"items"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &resp))
	require.True(t, resp.Success)
	require.Len(t, resp.Data.Items, 1)
	require.EqualValues(t, "SUCCESS", resp.Data.Items[0].Status)
	require.Equal(t, "100%", resp.Data.Items[0].Progress)
	require.Equal(t, resultURL, resp.Data.Items[0].ResultURL)
	require.Zero(t, resp.Data.Items[0].ChannelId)

	var persisted model.Task
	require.NoError(t, model.DB.Where("task_id = ?", publicTaskID).First(&persisted).Error)
	require.Equal(t, model.TaskStatusSuccess, persisted.Status)
	require.Equal(t, "100%", persisted.Progress)
	require.Equal(t, resultURL, persisted.GetResultURL())
}

func setupTaskControllerTestDB(t *testing.T) {
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
