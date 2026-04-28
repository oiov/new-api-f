package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
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

func TestNewAsyncImageGinContextPreservesContentType(t *testing.T) {
	gin.SetMode(gin.TestMode)
	info := &relaycommon.RelayInfo{
		RequestId:       "req_123",
		RequestURLPath:  "/v1/images/generations",
		RelayMode:       relayconstant.RelayModeImagesGenerations,
		OriginModelName: "gpt-image-2",
	}

	ctx, _ := newAsyncImageGinContext(info, []byte(`{"model":"gpt-image-2"}`))

	require.Equal(t, "application/json", ctx.Request.Header.Get("Content-Type"))
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
