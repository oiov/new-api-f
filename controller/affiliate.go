package controller

import (
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
