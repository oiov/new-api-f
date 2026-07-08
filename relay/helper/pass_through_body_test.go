package helper

import (
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/tidwall/gjson"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestBuildPassThroughRequestBodyRewritesJSONModel(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest("POST", "/v1/messages", strings.NewReader(`{"model":"claude-sonnet-4-6","max_tokens":1024}`))
	ctx.Request.Header.Set("Content-Type", "application/json")

	_, err := common.GetBodyStorage(ctx)
	require.NoError(t, err)

	bodyReader, err := BuildPassThroughRequestBody(ctx, &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType:       constant.ChannelTypeAnthropic,
			UpstreamModelName: "mmodel",
			ChannelSetting: dto.ChannelSettings{
				RewriteModelInPassThrough: true,
			},
		},
	})
	require.NoError(t, err)

	bodyBytes, err := io.ReadAll(bodyReader)
	require.NoError(t, err)
	require.Equal(t, "mmodel", gjson.GetBytes(bodyBytes, "model").String())
	require.EqualValues(t, 1024, gjson.GetBytes(bodyBytes, "max_tokens").Int())
}

func TestBuildPassThroughRequestBodyKeepsOriginalForNonJSON(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest("POST", "/v1/audio/transcriptions", strings.NewReader("model=whisper-1"))
	ctx.Request.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	_, err := common.GetBodyStorage(ctx)
	require.NoError(t, err)

	bodyReader, err := BuildPassThroughRequestBody(ctx, &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			UpstreamModelName: "rewritten-model",
		},
	})
	require.NoError(t, err)

	bodyBytes, err := io.ReadAll(bodyReader)
	require.NoError(t, err)
	require.Equal(t, "model=whisper-1", string(bodyBytes))
}

func TestBuildPassThroughRequestBodyDoesNotRewriteWhenDisabled(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest("POST", "/v1/messages", strings.NewReader(`{"model":"claude-sonnet-4-6","max_tokens":1024}`))
	ctx.Request.Header.Set("Content-Type", "application/json")

	_, err := common.GetBodyStorage(ctx)
	require.NoError(t, err)

	bodyReader, err := BuildPassThroughRequestBody(ctx, &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			UpstreamModelName: "mmodel",
		},
	})
	require.NoError(t, err)

	bodyBytes, err := io.ReadAll(bodyReader)
	require.NoError(t, err)
	require.Equal(t, "claude-sonnet-4-6", gjson.GetBytes(bodyBytes, "model").String())
}

func TestBuildPassThroughRequestBodyDoesNotRewriteForNonClaudeChannel(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest("POST", "/v1/chat/completions", strings.NewReader(`{"model":"gpt-4o-mini"}`))
	ctx.Request.Header.Set("Content-Type", "application/json")

	_, err := common.GetBodyStorage(ctx)
	require.NoError(t, err)

	bodyReader, err := BuildPassThroughRequestBody(ctx, &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType:       constant.ChannelTypeOpenAI,
			UpstreamModelName: "rewritten-model",
			ChannelSetting: dto.ChannelSettings{
				RewriteModelInPassThrough: true,
			},
		},
	})
	require.NoError(t, err)

	bodyBytes, err := io.ReadAll(bodyReader)
	require.NoError(t, err)
	require.Equal(t, "gpt-4o-mini", gjson.GetBytes(bodyBytes, "model").String())
}

// TestBuildPassThroughRequestBodySetsBodySize 覆盖修复 GLM chunked encoding 的核心:
// pass-through body 被包成 type-erased io.Reader 后，net/http 无法自探测长度，
// 需由 BuildPassThroughRequestBody 把字节数记录到 info.UpstreamRequestBodySize。
func TestBuildPassThroughRequestBodySetsBodySize(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("rewritten json branch", func(t *testing.T) {
		ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
		ctx.Request = httptest.NewRequest("POST", "/v1/messages", strings.NewReader(`{"model":"claude-sonnet-4-6","max_tokens":1024}`))
		ctx.Request.Header.Set("Content-Type", "application/json")
		_, err := common.GetBodyStorage(ctx)
		require.NoError(t, err)

		info := &relaycommon.RelayInfo{
			ChannelMeta: &relaycommon.ChannelMeta{
				ChannelType:       constant.ChannelTypeAnthropic,
				UpstreamModelName: "mmodel",
				ChannelSetting:    dto.ChannelSettings{RewriteModelInPassThrough: true},
			},
		}
		bodyReader, err := BuildPassThroughRequestBody(ctx, info)
		require.NoError(t, err)
		bodyBytes, err := io.ReadAll(bodyReader)
		require.NoError(t, err)
		require.EqualValues(t, len(bodyBytes), info.UpstreamRequestBodySize)
		require.Positive(t, info.UpstreamRequestBodySize)
	})

	t.Run("passthrough storage branch", func(t *testing.T) {
		ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
		ctx.Request = httptest.NewRequest("POST", "/v1/messages", strings.NewReader(`{"model":"claude-sonnet-4-6","max_tokens":1024}`))
		ctx.Request.Header.Set("Content-Type", "application/json")
		_, err := common.GetBodyStorage(ctx)
		require.NoError(t, err)

		// RewriteModelInPassThrough 未开启 → 走 common.ReaderOnly(storage) 分支
		info := &relaycommon.RelayInfo{
			ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "mmodel"},
		}
		bodyReader, err := BuildPassThroughRequestBody(ctx, info)
		require.NoError(t, err)
		bodyBytes, err := io.ReadAll(bodyReader)
		require.NoError(t, err)
		require.EqualValues(t, len(bodyBytes), info.UpstreamRequestBodySize)
		require.Positive(t, info.UpstreamRequestBodySize)
	})
}
