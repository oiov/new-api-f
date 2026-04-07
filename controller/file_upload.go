package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// UploadInvoiceFile 处理管理员发票文件上传请求。
// POST /api/invoice/admin/upload
// 表单字段：file（multipart/form-data）
// 返回：{"success":true,"message":"","data":{"url":"..."}}
func UploadInvoiceFile(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		common.ApiErrorMsg(c, "获取上传文件失败："+err.Error())
		return
	}

	url, err := service.UploadInvoiceFile(file)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	common.ApiSuccess(c, gin.H{"url": url})
}
