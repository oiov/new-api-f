package middleware

import (
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

func abortWithOpenAiMessage(c *gin.Context, statusCode int, message string, code ...types.ErrorCode) {
	codeStr := ""
	if len(code) > 0 {
		codeStr = string(code[0])
	}
	userId := c.GetInt("id")
	displayMessage := common.MessageWithRequestId(
		common.BuildPublicErrorMessage(statusCode, message),
		c.GetString(common.RequestIdKey),
	)
	c.JSON(statusCode, gin.H{
		"error": gin.H{
			"message": displayMessage,
			"type":    "new_api_error",
			"code":    codeStr,
		},
	})
	c.Abort()
	if common.ErrorDetailsEnabled {
		logger.LogError(c.Request.Context(), fmt.Sprintf("user %d | %s", userId, message))
	} else {
		logger.LogError(c.Request.Context(), fmt.Sprintf("user %d | status=%d | request rejected", userId, statusCode))
	}
}

func abortWithMidjourneyMessage(c *gin.Context, statusCode int, code int, description string) {
	displayDescription := common.BuildPublicErrorMessage(statusCode, description)
	c.JSON(statusCode, gin.H{
		"description": displayDescription,
		"type":        "new_api_error",
		"code":        code,
	})
	c.Abort()
	if common.ErrorDetailsEnabled {
		logger.LogError(c.Request.Context(), description)
	} else {
		logger.LogError(c.Request.Context(), fmt.Sprintf("midjourney request rejected | status=%d | code=%d", statusCode, code))
	}
}
