package controller

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
)

// resolveUserGroupAccess 返回用户当前可用分组列表。
// 同时考虑订阅状态和余额：两者独立，有哪个能力就开哪类分组。
func resolveUserGroupAccess(userId int) map[string]string {
	userCache, err := model.GetUserCache(userId)
	if err != nil {
		return service.GetUserUsableGroups("")
	}
	hasQuotaBalance := true
	if setting.EnableGroupBillingFilter {
		hasQuotaBalance = userCache.Quota > 0
	}
	return service.GetUserUsableGroupsForUser(userId, userCache.Group, hasQuotaBalance)
}

func buildMaskedTokenResponse(token *model.Token) *model.Token {
	if token == nil {
		return nil
	}
	maskedToken := *token
	maskedToken.Key = token.GetMaskedKey()
	return &maskedToken
}

func buildMaskedTokenResponses(tokens []*model.Token) []*model.Token {
	maskedTokens := make([]*model.Token, 0, len(tokens))
	for _, token := range tokens {
		maskedTokens = append(maskedTokens, buildMaskedTokenResponse(token))
	}
	return maskedTokens
}

func GetAllTokens(c *gin.Context) {
	userId := c.GetInt("id")
	pageInfo := common.GetPageQuery(c)
	tokens, err := model.GetAllUserTokens(userId, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	total, _ := model.CountUserTokens(userId)
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(buildMaskedTokenResponses(tokens))
	common.ApiSuccess(c, pageInfo)
}

func SearchTokens(c *gin.Context) {
	userId := c.GetInt("id")
	pageInfo := common.GetPageQuery(c)
	filters := model.UserTokenSearchFilters{
		Keyword:        c.Query("keyword"),
		Token:          c.Query("token"),
		Status:         c.Query("status"),
		Group:          c.Query("group"),
		BusinessGroup:  c.Query("business_group"),
		ExpiredState:   c.Query("expired_state"),
		UnlimitedState: c.Query("unlimited_state"),
	}

	tokens, total, err := model.SearchUserTokens(userId, filters, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(buildMaskedTokenResponses(tokens))
	common.ApiSuccess(c, pageInfo)
}

func GetAllTokensByAdmin(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	tokens, total, err := model.GetAllTokensByAdmin(pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(buildMaskedTokenResponses(tokens))
	common.ApiSuccess(c, pageInfo)
}

func SearchTokensByAdmin(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)

	filters := model.AdminTokenSearchFilters{
		Username:      c.Query("username"),
		TokenName:     c.Query("token_name"),
		Token:         c.Query("token"),
		Status:        c.Query("status"),
		Group:         c.Query("group"),
		BusinessGroup: c.Query("business_group"),
		ExpiredState:  c.Query("expired_state"),
		StartTime:     startTimestamp,
		EndTime:       endTimestamp,
	}

	tokens, total, err := model.SearchTokensByAdmin(filters, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(buildMaskedTokenResponses(tokens))
	common.ApiSuccess(c, pageInfo)
}

func GetToken(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	userId := c.GetInt("id")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	token, err := model.GetTokenByIds(id, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, buildMaskedTokenResponse(token))
}

func GetTokenKey(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	userId := c.GetInt("id")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	token, err := model.GetTokenByIds(id, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"key": token.GetFullKey(),
	})
}

func TestToken(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	userId := c.GetInt("id")
	if err != nil {
		common.SysError(fmt.Sprintf("[token-test] scope=user-entry requester_user_id=%d invalid_token_id raw=%q err=%s", userId, c.Param("id"), err.Error()))
		common.ApiError(c, err)
		return
	}

	var req adminTokenTestRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.SysError(fmt.Sprintf("[token-test] scope=user-entry requester_user_id=%d token_id=%d decode_request_failed err=%s", userId, id, err.Error()))
		common.ApiError(c, err)
		return
	}

	logTokenTestEvent("user-entry", id, userId, userId, req, "request accepted")

	token, err := model.GetTokenByIds(id, userId)
	if err != nil {
		common.SysError(fmt.Sprintf("[token-test] scope=user-entry requester_user_id=%d token_id=%d load_token_failed err=%s", userId, id, err.Error()))
		common.ApiError(c, err)
		return
	}
	executeTokenAvailabilityTest(c, token, req)
}

func GetTokenStatus(c *gin.Context) {
	tokenId := c.GetInt("token_id")
	userId := c.GetInt("id")
	token, err := model.GetTokenByIds(tokenId, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	expiredAt := token.ExpiredTime
	if expiredAt == -1 {
		expiredAt = 0
	}
	c.JSON(http.StatusOK, gin.H{
		"object":          "credit_summary",
		"total_granted":   token.RemainQuota,
		"total_used":      0, // not supported currently
		"total_available": token.RemainQuota,
		"expires_at":      expiredAt * 1000,
	})
}

func GetTokenUsage(c *gin.Context) {
	authHeader := c.GetHeader("Authorization")
	if authHeader == "" {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "No Authorization header",
		})
		return
	}

	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "Invalid Bearer token",
		})
		return
	}
	tokenKey := parts[1]

	token, err := model.GetTokenByKey(strings.TrimPrefix(tokenKey, "sk-"), false)
	if err != nil {
		common.SysError("failed to get token by key: " + err.Error())
		common.ApiErrorI18n(c, i18n.MsgTokenGetInfoFailed)
		return
	}

	expiredAt := token.ExpiredTime
	if expiredAt == -1 {
		expiredAt = 0
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    true,
		"message": "ok",
		"data": gin.H{
			"object":               "token_usage",
			"name":                 token.Name,
			"total_granted":        token.RemainQuota + token.UsedQuota,
			"total_used":           token.UsedQuota,
			"total_available":      token.RemainQuota,
			"unlimited_quota":      token.UnlimitedQuota,
			"model_limits":         token.GetModelLimitsMap(),
			"model_limits_enabled": token.ModelLimitsEnabled,
			"expires_at":           expiredAt,
		},
	})
}

func AddToken(c *gin.Context) {
	token := model.Token{}
	err := c.ShouldBindJSON(&token)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if len(token.Name) > 50 {
		common.ApiErrorI18n(c, i18n.MsgTokenNameTooLong)
		return
	}
	tokenGroups, err := service.NormalizeTokenGroups(token.Group)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	allowedGroups := resolveUserGroupAccess(c.GetInt("id"))
	for _, tokenGroup := range tokenGroups {
		if tokenGroup == "auto" {
			continue
		}
		if _, ok := allowedGroups[tokenGroup]; !ok {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": fmt.Sprintf("无权使用分组 '%s'，请选择您可用的分组", tokenGroup),
			})
			return
		}
	}
	token.Group = service.JoinTokenGroups(tokenGroups)

	if !token.UnlimitedQuota {
		if token.RemainQuota < 0 {
			common.ApiErrorI18n(c, i18n.MsgTokenQuotaNegative)
			return
		}
		maxQuotaValue := int((1000000000 * common.QuotaPerUnit))
		if token.RemainQuota > maxQuotaValue {
			common.ApiErrorI18n(c, i18n.MsgTokenQuotaExceedMax, map[string]any{"Max": maxQuotaValue})
			return
		}
	}
	maxTokens := operation_setting.GetMaxUserTokens()
	count, err := model.CountUserTokens(c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if int(count) >= maxTokens {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": fmt.Sprintf("已达到最大令牌数量限制 (%d)", maxTokens),
		})
		return
	}
	key, err := common.GenerateKey()
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgTokenGenerateFailed)
		common.SysLog("failed to generate token key: " + err.Error())
		return
	}
	if token.PeriodQuota < 0 {
		common.ApiErrorMsg(c, "周期额度不能为负数")
		return
	}
	if token.PeriodDuration <= 0 {
		token.PeriodDuration = model.PeriodDurationDaily
	}
	cleanToken := model.Token{
		UserId:             c.GetInt("id"),
		Name:               token.Name,
		Key:                key,
		Source:             model.TokenSourceUserCreated,
		CreatedTime:        common.GetTimestamp(),
		AccessedTime:       common.GetTimestamp(),
		ExpiredTime:        token.ExpiredTime,
		RemainQuota:        token.RemainQuota,
		UnlimitedQuota:     token.UnlimitedQuota,
		ModelLimitsEnabled: token.ModelLimitsEnabled,
		ModelLimits:        token.ModelLimits,
		AllowIps:           token.AllowIps,
		Group:              token.Group,
		BusinessGroup:      strings.TrimSpace(token.BusinessGroup),
		PeriodDuration:     token.PeriodDuration,
		PeriodQuota:        token.PeriodQuota,
		PeriodResetAnchor: func() int64 {
			if token.PeriodResetAnchor > 0 && token.PeriodDuration >= model.PeriodDurationDaily {
				return token.PeriodResetAnchor
			}
			return 0
		}(),
		PeriodStartAt: func() int64 {
			if token.PeriodQuota <= 0 {
				return 0
			}
			if token.PeriodResetAnchor > 0 && token.PeriodDuration >= model.PeriodDurationDaily {
				return model.AlignToAnchor(time.Now(), token.PeriodResetAnchor, token.PeriodDuration)
			}
			return common.GetTimestamp()
		}(),
		CrossGroupRetry:    token.CrossGroupRetry,
	}
	err = cleanToken.Insert()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func DeleteToken(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	userId := c.GetInt("id")
	err := model.DeleteTokenById(id, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func UpdateToken(c *gin.Context) {
	userId := c.GetInt("id")
	statusOnly := c.Query("status_only")
	token := model.Token{}
	err := c.ShouldBindJSON(&token)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if len(token.Name) > 50 {
		common.ApiErrorI18n(c, i18n.MsgTokenNameTooLong)
		return
	}
	if !token.UnlimitedQuota {
		if token.RemainQuota < 0 {
			common.ApiErrorI18n(c, i18n.MsgTokenQuotaNegative)
			return
		}
		maxQuotaValue := int((1000000000 * common.QuotaPerUnit))
		if token.RemainQuota > maxQuotaValue {
			common.ApiErrorI18n(c, i18n.MsgTokenQuotaExceedMax, map[string]any{"Max": maxQuotaValue})
			return
		}
	}
	if token.PeriodQuota < 0 {
		common.ApiErrorMsg(c, "周期额度不能为负数")
		return
	}
	if token.PeriodDuration <= 0 {
		token.PeriodDuration = model.PeriodDurationDaily
	}
	cleanToken, err := model.GetTokenByIds(token.Id, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if statusOnly == "" && cleanToken.IsActiveSubscriptionAggregateAccessToken(common.GetTimestamp()) {
		common.ApiErrorMsg(c, "有效期内的 Subscription Access 令牌不可编辑")
		return
	}
	if token.Status == common.TokenStatusEnabled {
		if cleanToken.Status == common.TokenStatusExpired && cleanToken.ExpiredTime <= common.GetTimestamp() && cleanToken.ExpiredTime != -1 {
			common.ApiErrorI18n(c, i18n.MsgTokenExpiredCannotEnable)
			return
		}
		if cleanToken.Status == common.TokenStatusExhausted && cleanToken.RemainQuota <= 0 && !cleanToken.UnlimitedQuota {
			common.ApiErrorI18n(c, i18n.MsgTokenExhaustedCannotEable)
			return
		}
	}
	if statusOnly != "" {
		cleanToken.Status = token.Status
	} else {
		tokenGroups, err := service.NormalizeTokenGroups(token.Group)
		if err != nil {
			common.ApiErrorMsg(c, err.Error())
			return
		}
		allowedGroups := resolveUserGroupAccess(userId)
		for _, tokenGroup := range tokenGroups {
			if tokenGroup == "auto" {
				continue
			}
			if _, ok := allowedGroups[tokenGroup]; !ok {
				c.JSON(http.StatusOK, gin.H{
					"success": false,
					"message": fmt.Sprintf("无权使用分组 '%s'，请选择您可用的分组", tokenGroup),
				})
				return
			}
		}
		token.Group = service.JoinTokenGroups(tokenGroups)

		// If you add more fields, please also update token.Update()
		cleanToken.Name = token.Name
		cleanToken.ExpiredTime = token.ExpiredTime
		cleanToken.RemainQuota = token.RemainQuota
		cleanToken.UnlimitedQuota = token.UnlimitedQuota
		cleanToken.ModelLimitsEnabled = token.ModelLimitsEnabled
		cleanToken.ModelLimits = token.ModelLimits
		cleanToken.AllowIps = token.AllowIps
		cleanToken.Group = token.Group
		cleanToken.BusinessGroup = strings.TrimSpace(token.BusinessGroup)
		cleanToken.PeriodDuration = token.PeriodDuration
		cleanToken.PeriodQuota = token.PeriodQuota
		newAnchor := int64(0)
		if token.PeriodResetAnchor > 0 && token.PeriodDuration >= model.PeriodDurationDaily {
			newAnchor = token.PeriodResetAnchor
		}
		anchorChanged := newAnchor != cleanToken.PeriodResetAnchor
		cleanToken.PeriodResetAnchor = newAnchor
		if anchorChanged && cleanToken.PeriodQuota > 0 && newAnchor > 0 && cleanToken.PeriodDuration >= model.PeriodDurationDaily {
			cleanToken.PeriodStartAt = model.AlignToAnchor(time.Now(), newAnchor, cleanToken.PeriodDuration)
		}
		cleanToken.CrossGroupRetry = token.CrossGroupRetry
	}
	err = cleanToken.Update()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    buildMaskedTokenResponse(cleanToken),
	})
}

type TokenBatch struct {
	Ids []int `json:"ids"`
}

type DeleteInvalidTokensRequest struct {
	Keyword        string `json:"keyword"`
	Token          string `json:"token"`
	Status         string `json:"status"`
	Group          string `json:"group"`
	ExpiredState   string `json:"expired_state"`
	UnlimitedState string `json:"unlimited_state"`
}

func DeleteTokenBatch(c *gin.Context) {
	tokenBatch := TokenBatch{}
	if err := c.ShouldBindJSON(&tokenBatch); err != nil || len(tokenBatch.Ids) == 0 {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	userId := c.GetInt("id")
	count, err := model.BatchDeleteTokens(tokenBatch.Ids, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    count,
	})
}

func DeleteInvalidTokenBatch(c *gin.Context) {
	req := DeleteInvalidTokensRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	userId := c.GetInt("id")
	filters := model.UserTokenSearchFilters{
		Keyword:        req.Keyword,
		Token:          req.Token,
		Status:         req.Status,
		Group:          req.Group,
		ExpiredState:   req.ExpiredState,
		UnlimitedState: req.UnlimitedState,
	}
	count, err := model.BatchDeleteInvalidTokensByFilter(userId, filters)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    count,
	})
}

func GetBusinessGroups(c *gin.Context) {
	userId := c.GetInt("id")
	stats, err := model.GetUserBusinessGroups(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    stats,
	})
}

func GetBusinessGroupStat(c *gin.Context) {
	userId := c.GetInt("id")
	businessGroup := strings.TrimSpace(c.Query("business_group"))
	if businessGroup == "" {
		common.ApiErrorMsg(c, "业务分组不能为空")
		return
	}
	totalQuota, err := model.GetBusinessGroupLogStat(userId, businessGroup)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"business_group":   businessGroup,
			"total_used_quota": totalQuota,
		},
	})
}

type UpdateBusinessGroupPeriodQuotaRequest struct {
	BusinessGroup     string `json:"business_group"`
	PeriodQuota       int    `json:"period_quota"`
	PeriodDuration    int64  `json:"period_duration"`
	PeriodResetAnchor int64  `json:"period_reset_anchor"`
}

func UpdateBusinessGroupPeriodQuota(c *gin.Context) {
	userId := c.GetInt("id")
	req := UpdateBusinessGroupPeriodQuotaRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数格式错误")
		return
	}
	req.BusinessGroup = strings.TrimSpace(req.BusinessGroup)
	if req.BusinessGroup == "" {
		common.ApiErrorMsg(c, "业务分组不能为空")
		return
	}
	if req.PeriodQuota < 0 {
		common.ApiErrorMsg(c, "周期额度不能为负数")
		return
	}
	if req.PeriodDuration <= 0 {
		req.PeriodDuration = model.PeriodDurationDaily
	}
	count, err := model.UpdateUserBusinessGroupPeriodQuota(userId, req.BusinessGroup, req.PeriodQuota, req.PeriodDuration, req.PeriodResetAnchor)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    count,
	})
}
