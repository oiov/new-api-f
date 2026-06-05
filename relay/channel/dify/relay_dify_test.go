package dify

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 回归测试 (#5134 / #2083): 远程图片分支此前未初始化 file 指针，
// 导致 file.Type = ... 触发 nil pointer dereference 而 panic。
// 修复后必须返回一个 transfer_mode=remote_url 且 URL 为原始地址的文件。
func TestRequestOpenAI2DifyRemoteImage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())

	const remoteURL = "https://example.com/cat.png"
	request := dto.GeneralOpenAIRequest{
		Model: "dify",
		Messages: []dto.Message{
			{
				Role: "user",
				Content: []any{
					dto.MediaContent{
						Type:     dto.ContentTypeImageURL,
						ImageUrl: &dto.MessageImageUrl{Url: remoteURL},
					},
				},
			},
		},
	}

	difyReq := requestOpenAI2Dify(c, &relaycommon.RelayInfo{}, request)

	require.NotNil(t, difyReq)
	require.Len(t, difyReq.Files, 1)
	assert.Equal(t, "remote_url", difyReq.Files[0].TransferMode)
	assert.Equal(t, remoteURL, difyReq.Files[0].URL)
}
