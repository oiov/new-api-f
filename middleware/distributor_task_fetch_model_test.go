package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 回归测试 (#5133 / #4834): 当 token 启用「可用模型限制」时，
// GET /v1/video/generations/:task_id 与 /v1/videos/:task_id 必须从已存储的任务
// 回填 OriginModelName，否则下游 modelLimit 校验会因 model 为空误报无权限。
// 同时不得重新开启渠道选择（shouldSelectChannel 保持 false）。
func TestGetModelRequestResolvesVideoTaskFetchModelUnderTokenModelLimit(t *testing.T) {
	gin.SetMode(gin.TestMode)

	for _, path := range []string{
		"/v1/video/generations/allowed_task_123",
		"/v1/videos/allowed_task_123",
	} {
		t.Run(path, func(t *testing.T) {
			withDistributorTestDB(t, func() {
				require.NoError(t, model.DB.AutoMigrate(&model.Task{}))
				task := &model.Task{
					UserId: 42,
					TaskID: "allowed_task_123",
					Properties: model.Properties{
						OriginModelName: "allowed-video-model",
					},
				}
				require.NoError(t, model.DB.Create(task).Error)

				c, _ := gin.CreateTestContext(httptest.NewRecorder())
				c.Request = httptest.NewRequest(http.MethodGet, path, nil)
				c.Params = gin.Params{{Key: "task_id", Value: "allowed_task_123"}}
				c.Set("id", 42)
				common.SetContextKey(c, constant.ContextKeyTokenModelLimitEnabled, true)

				modelRequest, shouldSelectChannel, err := getModelRequest(c)
				require.NoError(t, err)
				assert.False(t, shouldSelectChannel, "video task fetch must not select a channel")
				require.NotNil(t, modelRequest)
				assert.Equal(t, "allowed-video-model", modelRequest.Model)
			})
		})
	}
}
