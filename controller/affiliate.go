package controller

import (
	"errors"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func GetAffiliateSummary(c *gin.Context) {
	userId := c.GetInt("id")
	data, err := model.GetAffiliateCommissionSummary(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, data)
}

func GetAffiliateCommissions(c *gin.Context) {
	userId := c.GetInt("id")
	pageInfo := common.GetPageQuery(c)
	items, total, err := model.ListAffiliateCommissionsByUser(userId, pageInfo, model.AffiliateCommissionFilters{
		Status:     strings.TrimSpace(c.Query("status")),
		SourceType: strings.TrimSpace(c.Query("source_type")),
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(items)
	common.ApiSuccess(c, pageInfo)
}

func AdminGetAffiliateCommissions(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	items, total, err := model.ListAffiliateCommissionsForAdmin(pageInfo, model.AffiliateCommissionFilters{
		Status:     strings.TrimSpace(c.Query("status")),
		SourceType: strings.TrimSpace(c.Query("source_type")),
		Keyword:    strings.TrimSpace(c.Query("keyword")),
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(items)
	common.ApiSuccess(c, pageInfo)
}

func AdminApproveAffiliateCommission(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiError(c, errors.New("无效的分佣流水"))
		return
	}
	commission, err := model.ApproveAffiliateCommission(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, commission)
}

type affiliateCommissionRejectRequest struct {
	Reason string `json:"reason"`
}

func AdminRejectAffiliateCommission(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiError(c, errors.New("无效的分佣流水"))
		return
	}
	var req affiliateCommissionRejectRequest
	_ = common.DecodeJson(c.Request.Body, &req)
	commission, err := model.RejectAffiliateCommission(id, req.Reason)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, commission)
}
