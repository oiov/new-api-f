package controller

import (
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/bytedance/gopkg/util/gopool"

	"github.com/gin-gonic/gin"
)

type adminTokenGroupBatchUpdateRequest struct {
	TokenIDs []int  `json:"token_ids"`
	Group    string `json:"group"`
}

// UpdateTokenGroupBatchByAdmin 批量修改 token 分组（管理员）。
// 注意：该操作可能影响 token 的模型可用性与分发策略，请谨慎使用。
func UpdateTokenGroupBatchByAdmin(c *gin.Context) {
	var req adminTokenGroupBatchUpdateRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "无效的参数",
		})
		return
	}
	if len(req.TokenIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "token_ids 不能为空",
		})
		return
	}

	nextGroup := strings.TrimSpace(req.Group)
	result := model.DB.Model(&model.Token{}).
		Where("id IN (?) AND deleted_at IS NULL", req.TokenIDs).
		Update("group", nextGroup)
	if result.Error != nil {
		common.ApiError(c, result.Error)
		return
	}

	if common.RedisEnabled {
		ids := append([]int(nil), req.TokenIDs...)
		gopool.Go(func() {
			for _, id := range ids {
				_, _ = model.GetTokenById(id)
			}
		})
	}

	common.ApiSuccess(c, gin.H{
		"updated": result.RowsAffected,
	})
}
