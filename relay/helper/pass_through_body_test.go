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
