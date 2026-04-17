package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

type batchDeleteStorageObjectsRequest struct {
	Keys []string `json:"keys"`
}

type renameStorageObjectRequest struct {
	OldKey string `json:"old_key"`
	NewKey string `json:"new_key"`
}

type createStorageDirectoryRequest struct {
	Prefix string `json:"prefix"`
	Name   string `json:"name"`
}

type storageObjectAccessURLResponse struct {
	URL       string `json:"url"`
	ExpiresAt int64  `json:"expires_at,omitempty"`
}

func ListStorageObjects(c *gin.Context) {
	maxKeys, _ := strconv.Atoi(c.DefaultQuery("max_keys", "50"))
	data, err := service.ListStorageObjects(
		c.Query("prefix"),
		c.Query("continuation_token"),
		c.Query("search"),
		maxKeys,
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	common.ApiSuccess(c, data)
}

func UploadStorageObject(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		common.ApiErrorMsg(c, "获取上传文件失败："+err.Error())
		return
	}

	data, err := service.UploadStorageObject(
		file,
		c.PostForm("prefix"),
		c.PostForm("key"),
		c.PostForm("conflict_strategy"),
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	common.ApiSuccess(c, data)
}

func GetStorageObjectContent(c *gin.Context) {
	data, err := service.GetStorageObjectContent(c.Query("key"), map[string]string{
		"Range": c.GetHeader("Range"),
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	defer data.Body.Close()

	headers := map[string]string{}
	if data.ContentDisposition != "" {
		headers["Content-Disposition"] = data.ContentDisposition
	}
	if data.ETag != "" {
		headers["ETag"] = data.ETag
	}
	if data.LastModified != "" {
		headers["Last-Modified"] = data.LastModified
	}
	if data.ContentRange != "" {
		headers["Content-Range"] = data.ContentRange
	}
	if data.AcceptRanges != "" {
		headers["Accept-Ranges"] = data.AcceptRanges
	}
	if data.CacheControl != "" {
		headers["Cache-Control"] = data.CacheControl
	}

	statusCode := data.StatusCode
	if statusCode == 0 {
		statusCode = http.StatusOK
	}
	c.DataFromReader(statusCode, data.ContentLength, data.ContentType, data.Body, headers)
}

func GetStorageObjectAccessURL(c *gin.Context) {
	url, expiresAt, err := service.GetStorageObjectAccessURL(c.Query("key"), 300)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, storageObjectAccessURLResponse{
		URL:       url,
		ExpiresAt: expiresAt,
	})
}

func CreateStorageDirectory(c *gin.Context) {
	var req createStorageDirectoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "请求参数错误："+err.Error())
		return
	}

	data, err := service.CreateStorageDirectory(req.Prefix, req.Name)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	common.ApiSuccess(c, data)
}

func DeleteStorageObject(c *gin.Context) {
	if err := service.DeleteStorageObject(c.Query("key")); err != nil {
		common.ApiError(c, err)
		return
	}

	common.ApiSuccess(c, gin.H{"deleted": true})
}

func BatchDeleteStorageObjects(c *gin.Context) {
	var req batchDeleteStorageObjectsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "请求参数错误："+err.Error())
		return
	}

	result, err := service.DeleteStorageObjects(req.Keys)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	common.ApiSuccess(c, result)
}

func RenameStorageObject(c *gin.Context) {
	var req renameStorageObjectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "请求参数错误："+err.Error())
		return
	}

	data, err := service.RenameStorageObject(req.OldKey, req.NewKey)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	common.ApiSuccess(c, data)
}
