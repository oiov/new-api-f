package controller

import (
	"bytes"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestIsAsyncImageTaskRequestRequiresHeaderAndImageGenerationMode(t *testing.T) {
	gin.SetMode(gin.TestMode)

	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
	info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeImagesGenerations}
	require.False(t, isAsyncImageTaskRequest(ctx, info))

	ctx.Request.Header.Set(asyncImageTaskHeader, "true")
	require.True(t, isAsyncImageTaskRequest(ctx, info))

	info.RelayMode = relayconstant.RelayModeChatCompletions
	require.False(t, isAsyncImageTaskRequest(ctx, info))
}

func TestIsAsyncImageTaskRequestSupportsImageEdits(t *testing.T) {
	gin.SetMode(gin.TestMode)

	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/images/edits", nil)
	ctx.Request.Header.Set(asyncImageTaskHeader, "true")
	info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeImagesEdits}

	require.True(t, isAsyncImageTaskRequest(ctx, info))
}

// TestAsyncImageEditContextPreservesMultipartAndParamOverride 验证异步图像编辑任务在重放
// 时：(1) 保留原始 multipart/form-data 请求体与 Content-Type，从而仍走 multipart 转换路径；
// (2) 把渠道参数覆盖透传到 InitChannelMeta 读取的上下文 key 上。结合 openai 适配器的
// ConvertImageRequest 覆盖测试，即证明异步模式同样会应用参数覆盖。
func TestAsyncImageEditContextPreservesMultipartAndParamOverride(t *testing.T) {
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	require.NoError(t, writer.WriteField("model", "gpt-image-1"))
	require.NoError(t, writer.WriteField("response_format", "b64_json"))
	part, err := writer.CreateFormFile("image", "image.png")
	require.NoError(t, err)
	_, err = part.Write([]byte("\x89PNG\r\n\x1a\nfake-image-bytes"))
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	relayInfo := &relaycommon.RelayInfo{
		RelayMode:      relayconstant.RelayModeImagesEdits,
		RequestURLPath: "/v1/images/edits",
		RequestHeaders: map[string]string{"Content-Type": writer.FormDataContentType()},
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelId:     78,
			ChannelType:   1,
			ParamOverride: map[string]interface{}{"response_format": nil},
		},
	}

	ctx, _ := newAsyncImageGinContext(relayInfo, buf.Bytes())

	require.True(t, strings.HasPrefix(ctx.Request.Header.Get("Content-Type"), "multipart/form-data"),
		"async edit context must preserve multipart content-type so it hits the override-aware path")

	override := common.GetContextKeyStringMap(ctx, constant.ContextKeyChannelParamOverride)
	_, ok := override["response_format"]
	require.True(t, ok, "param override must be reachable via the context key InitChannelMeta reads")
}

func TestInitImageTaskCopiesBillingAndMetadata(t *testing.T) {
	info := &relaycommon.RelayInfo{
		RequestId:       "req_123",
		UserId:          7,
		UsingGroup:      "vip",
		OriginModelName: "gpt-image-2",
		ChannelMeta:     &relaycommon.ChannelMeta{ChannelId: 36},
		PriceData: types.PriceData{
			QuotaToPreConsume: 1234,
			ModelPrice:        0.04,
			ModelRatio:        2,
			GroupRatioInfo:    types.GroupRatioInfo{GroupRatio: 1.5},
		},
		BillingSource:            "wallet",
		SubscriptionId:           11,
		SubscriptionResourceType: "quota",
		SubscriptionPreConsumed:  1234,
		TokenId:                  22,
	}

	task := initImageTask(info)

	require.Equal(t, string(constant.TaskPlatformImage), string(task.Platform))
	require.Equal(t, "generations", task.Action)
	require.Equal(t, 1234, task.Quota)
	require.Equal(t, "wallet", task.PrivateData.BillingSource)
	require.Equal(t, 22, task.PrivateData.TokenId)
	require.NotNil(t, task.PrivateData.BillingContext)
	require.Equal(t, "gpt-image-2", task.PrivateData.BillingContext.OriginModelName)
}

func TestInitImageTaskUsesRelayModeAction(t *testing.T) {
	info := &relaycommon.RelayInfo{
		RelayMode:       relayconstant.RelayModeImagesEdits,
		OriginModelName: "gpt-image-1",
		ChannelMeta:     &relaycommon.ChannelMeta{ChannelId: 36},
		PriceData:       types.PriceData{QuotaToPreConsume: 10},
	}

	task := initImageTask(info)

	require.Equal(t, "edits", task.Action)
}

func TestImageTaskResponseDataIncludesStatusAndImageURLs(t *testing.T) {
	task := &model.Task{
		TaskID:     "task_img",
		Platform:   constant.TaskPlatformImage,
		Action:     "edits",
		Status:     model.TaskStatusSuccess,
		Progress:   "100%",
		SubmitTime: 100,
		StartTime:  110,
		FinishTime: 120,
	}
	task.PrivateData.ResultURL = "https://example.com/a.png"
	task.SetData(map[string]any{
		"model":      "gpt-image-2",
		"image_urls": []string{"https://example.com/a.png"},
	})

	data := imageTaskResponseData(task)

	require.Equal(t, "task_img", data["task_id"])
	require.Equal(t, "succeeded", data["status"])
	require.Equal(t, "edits", data["action"])
	require.Equal(t, "100%", data["progress"])
	require.Equal(t, "https://example.com/a.png", data["result_url"])
	require.Equal(t, []string{"https://example.com/a.png"}, data["image_urls"])
}

func TestCopyRelayInfoToAsyncContextPreservesModelAndRelayMode(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	info := &relaycommon.RelayInfo{
		RelayMode:       relayconstant.RelayModeImagesGenerations,
		OriginModelName: "gpt-image-2",
		UserId:          7,
		UsingGroup:      "default",
		UserGroup:       "default",
	}

	copyRelayInfoToAsyncContext(ctx, info)

	require.Equal(t, "gpt-image-2", ctx.GetString("original_model"))
	require.Equal(t, relayconstant.RelayModeImagesGenerations, ctx.GetInt("relay_mode"))
}

func TestCopyRelayInfoToAsyncContextPreservesLogIdentity(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	info := &relaycommon.RelayInfo{
		UserId:     7,
		Username:   "async-user",
		TokenId:    11,
		TokenKey:   "token-key",
		TokenName:  "async-token",
		TokenGroup: "default",
	}
	ctx.Set("username", "")
	ctx.Set("token_name", "")
	common.SetContextKey(ctx, constant.ContextKeyUserName, "")

	copyRelayInfoToAsyncContext(ctx, info)

	require.Equal(t, "async-user", ctx.GetString("username"))
	require.Equal(t, "async-token", ctx.GetString("token_name"))
	require.Equal(t, "async-user", common.GetContextKeyString(ctx, constant.ContextKeyUserName))
}

func TestCopyRelayInfoToAsyncContextPreservesChannelMappings(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	info := &relaycommon.RelayInfo{
		OriginModelName: "gpt-image-2-official",
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelId:         78,
			ChannelType:       constant.ChannelTypeOpenAI,
			ChannelBaseUrl:    "https://api.example.test",
			ModelMapping:      `{"gpt-image-2-official":"gpt-image-2"}`,
			StatusCodeMapping: `{"400":500}`,
		},
	}

	copyRelayInfoToAsyncContext(ctx, info)

	require.Equal(t, `{"gpt-image-2-official":"gpt-image-2"}`, ctx.GetString("model_mapping"))
	require.Equal(t, `{"400":500}`, ctx.GetString("status_code_mapping"))
	require.Equal(t, `{"gpt-image-2-official":"gpt-image-2"}`, common.GetContextKeyString(ctx, constant.ContextKeyChannelModelMapping))
	require.Equal(t, `{"400":500}`, common.GetContextKeyString(ctx, constant.ContextKeyChannelStatusCodeMapping))
}

func TestAsyncImageContextModelMappingAppliesToRequest(t *testing.T) {
	gin.SetMode(gin.TestMode)
	info := &relaycommon.RelayInfo{
		RequestId:       "req_async_mapping",
		RequestURLPath:  "/v1/images/generations",
		RelayMode:       relayconstant.RelayModeImagesGenerations,
		OriginModelName: "gpt-image-2-official",
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelId:      78,
			ChannelType:    constant.ChannelTypeOpenAI,
			ChannelBaseUrl: "https://api.example.test",
			ModelMapping:   `{"gpt-image-2-official":"gpt-image-2"}`,
		},
		Request: &dto.ImageRequest{Model: "gpt-image-2-official", Prompt: "banana"},
	}
	ctx, _ := newAsyncImageGinContext(info, []byte(`{"model":"gpt-image-2-official","prompt":"banana"}`))
	info.InitChannelMeta(ctx)
	req := &dto.ImageRequest{Model: "gpt-image-2-official", Prompt: "banana"}

	require.NoError(t, helper.ModelMappedHelper(ctx, info, req))

	require.Equal(t, "gpt-image-2", req.Model)
	require.Equal(t, "gpt-image-2", info.UpstreamModelName)
	require.True(t, info.IsModelMapped)
}

func TestNewAsyncImageGinContextPreservesContentType(t *testing.T) {
	gin.SetMode(gin.TestMode)
	info := &relaycommon.RelayInfo{
		RequestId:       "req_123",
		RequestURLPath:  "/v1/images/generations",
		RelayMode:       relayconstant.RelayModeImagesGenerations,
		OriginModelName: "gpt-image-2",
		RequestHeaders: map[string]string{
			"Content-Type":          "application/json",
			asyncImageTaskHeader:    "true",
			common.RequestIdKey:     "client-request-id",
			"X-Client-Debug-Header": "keep-me",
		},
	}

	ctx, _ := newAsyncImageGinContext(info, []byte(`{"model":"gpt-image-2"}`))

	require.Equal(t, "application/json", ctx.Request.Header.Get("Content-Type"))
	require.Empty(t, ctx.Request.Header.Get(asyncImageTaskHeader))
	require.Empty(t, ctx.Request.Header.Get(common.RequestIdKey))
	require.Equal(t, "keep-me", ctx.Request.Header.Get("X-Client-Debug-Header"))
}

func TestAsyncImageContextAllowsJSONModelParsing(t *testing.T) {
	gin.SetMode(gin.TestMode)
	info := &relaycommon.RelayInfo{
		RequestId:       "req_123",
		RequestURLPath:  "/v1/images/generations",
		RelayMode:       relayconstant.RelayModeImagesGenerations,
		OriginModelName: "gpt-image-2",
	}
	body := []byte(`{"model":"gpt-image-2","prompt":"banana","size":"1024x1024"}`)
	ctx, _ := newAsyncImageGinContext(info, body)

	var req struct {
		Model string `json:"model"`
	}
	err := common.UnmarshalBodyReusable(ctx, &req)

	require.NoError(t, err)
	require.Equal(t, "gpt-image-2", req.Model)
}

func TestRecordAsyncImageTaskErrorWritesErrorLog(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupImageTaskTestDB(t)
	common.ErrorDetailsEnabled = true
	constant.ErrorLogEnabled = true

	engine := gin.New()
	ctx := gin.CreateTestContextOnly(httptest.NewRecorder(), engine)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
	ctx.Request.RemoteAddr = "127.0.0.1:12345"
	recordIpLog := false
	user := &model.User{Id: 7, Username: "async-user"}
	user.SetSetting(dto.UserSetting{RecordIpLog: &recordIpLog})
	require.NoError(t, model.DB.Create(user).Error)
	info := &relaycommon.RelayInfo{
		RequestId:       "req_async_error",
		UserId:          7,
		Username:        "async-user",
		TokenId:         11,
		TokenName:       "async-token",
		UsingGroup:      "image",
		OriginModelName: "gpt-image-2",
		StartTime:       time.Now().Add(-3 * time.Second),
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelId:      36,
			ChannelType:    constant.ChannelTypeOpenAI,
			ChannelBaseUrl: "https://api.example.test",
		},
	}
	copyRelayInfoToAsyncContext(ctx, info)
	apiErr := types.NewOpenAIError(errors.New("upstream error: do request failed"), types.ErrorCodeDoRequestFailed, http.StatusInternalServerError)

	recordAsyncImageTaskError(ctx, info, "task_async_error", apiErr)

	var log model.Log
	require.NoError(t, model.LOG_DB.Where("request_id = ? AND type = ?", "req_async_error", model.LogTypeError).First(&log).Error)
	require.Equal(t, 7, log.UserId)
	require.Equal(t, 36, log.ChannelId)
	require.Equal(t, 11, log.TokenId)
	require.Equal(t, "async-token", log.TokenName)
	require.Equal(t, "gpt-image-2", log.ModelName)
	require.Equal(t, "image", log.Group)
	require.Contains(t, log.Content, "status_code=500")
	require.Contains(t, log.Content, "upstream error: do request failed")
	require.GreaterOrEqual(t, log.UseTime, 2)
	require.Contains(t, log.Other, "do_request_failed")
	require.Contains(t, log.Other, "task_async_error")
}

func setupImageTaskTestDB(t *testing.T) {
	t.Helper()
	originalDB := model.DB
	originalLogDB := model.LOG_DB
	originalUsingSQLite := common.UsingSQLite
	originalRedisEnabled := common.RedisEnabled
	originalErrorDetailsEnabled := common.ErrorDetailsEnabled
	originalErrorLogEnabled := constant.ErrorLogEnabled

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Log{}))

	model.DB = db
	model.LOG_DB = db
	common.UsingSQLite = true
	common.RedisEnabled = false
	t.Cleanup(func() {
		model.DB = originalDB
		model.LOG_DB = originalLogDB
		common.UsingSQLite = originalUsingSQLite
		common.RedisEnabled = originalRedisEnabled
		common.ErrorDetailsEnabled = originalErrorDetailsEnabled
		constant.ErrorLogEnabled = originalErrorLogEnabled
		_ = sqlDB.Close()
	})
}
