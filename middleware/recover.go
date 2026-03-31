package middleware

import (
	"fmt"
	"net/http"
	"runtime/debug"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

func RelayPanicRecover() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
				if common.ErrorDetailsEnabled {
					common.SysLog(fmt.Sprintf("panic detected: %v", err))
					common.SysLog(fmt.Sprintf("stacktrace from panic: %s", string(debug.Stack())))
				} else {
					common.SysLog("panic detected")
				}
				message := common.BuildPublicErrorMessage(
					http.StatusInternalServerError,
					fmt.Sprintf("Panic detected, error: %v. Please submit a issue here: https://github.com/Calcium-Ion/new-api", err),
				)
				c.JSON(http.StatusInternalServerError, gin.H{
					"error": gin.H{
						"message": message,
						"type":    "new_api_panic",
					},
				})
				c.Abort()
			}
		}()
		c.Next()
	}
}
