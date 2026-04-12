package controller

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

type optionalInt64RequestValue struct {
	IsSet   bool
	IsBlank bool
	Value   int64
}

func (v *optionalInt64RequestValue) UnmarshalJSON(data []byte) error {
	trimmed := strings.TrimSpace(string(data))
	if trimmed == "" || trimmed == "null" {
		v.IsSet = false
		v.IsBlank = false
		v.Value = 0
		return nil
	}
	v.IsSet = true
	v.IsBlank = false
	if len(trimmed) >= 2 && trimmed[0] == '"' && trimmed[len(trimmed)-1] == '"' {
		trimmed = strings.TrimSpace(trimmed[1 : len(trimmed)-1])
		if trimmed == "" {
			v.IsBlank = true
			v.Value = 0
			return nil
		}
	}
	value, err := strconv.ParseInt(trimmed, 10, 64)
	if err != nil {
		return err
	}
	v.Value = value
	return nil
}

type EcomAgentAccountRequest struct {
	Email                       *string                   `json:"email"`
	Password                    *string                   `json:"password"`
	BaseURL                     *string                   `json:"base_url"`
	SupabaseAuthURL             *string                   `json:"supabase_auth_url"`
	SupabaseAnonKey             *string                   `json:"supabase_anon_key"`
	ConfirmURL                  *string                   `json:"confirm_url"`
	AccountID                   *string                   `json:"account_id"`
	AccessToken                 *string                   `json:"access_token"`
	RefreshToken                *string                   `json:"refresh_token"`
	SessionJSON                 *string                   `json:"session_json"`
	AssignmentStatus            *string                   `json:"assignment_status"`
	AssignedPlan                *string                   `json:"assigned_plan"`
	Tags                        *string                   `json:"tags"`
	Remark                      *string                   `json:"remark"`
	ExpiresAt                   optionalInt64RequestValue `json:"access_token_expires_at"`
	AssignedSubscriptionOrderID optionalInt64RequestValue `json:"assigned_subscription_order_id"`
	AssignedChannelID           optionalInt64RequestValue `json:"assigned_channel_id"`
	AssignedChannelKeyIndex     optionalInt64RequestValue `json:"assigned_channel_key_index"`
	AssignedUserSubscriptionID  optionalInt64RequestValue `json:"assigned_user_subscription_id"`
	AssignedAt                  optionalInt64RequestValue `json:"assigned_at"`
}

type EcomAgentDeliverManualOrderRequest struct {
	OrderID     int    `json:"order_id"`
	AdminRemark string `json:"admin_remark"`
}

type ecomAgentImportedSession struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresAt    int64  `json:"expires_at"`
	User         struct {
		ID    string `json:"id"`
		Email string `json:"email"`
	} `json:"user"`
}

func applyImportedSession(account *model.EcomAgentAccount, sessionJSON string) error {
	sessionJSON = strings.TrimSpace(sessionJSON)
	if sessionJSON == "" {
		return nil
	}
	session := ecomAgentImportedSession{}
	if err := common.UnmarshalJsonStr(sessionJSON, &session); err != nil {
		return err
	}
	if strings.TrimSpace(account.Email) == "" {
		account.Email = strings.TrimSpace(session.User.Email)
	}
	if strings.TrimSpace(account.AccountID) == "" {
		account.AccountID = strings.TrimSpace(session.User.ID)
	}
	if strings.TrimSpace(session.AccessToken) != "" {
		account.AccessToken = strings.TrimSpace(session.AccessToken)
	}
	if strings.TrimSpace(session.RefreshToken) != "" {
		account.RefreshToken = strings.TrimSpace(session.RefreshToken)
	}
	if session.ExpiresAt > 0 {
		account.AccessTokenExpiresAt = session.ExpiresAt
	}
	return nil
}

func GetEcomAgentAccounts(c *gin.Context) {
	accounts, err := model.GetAllEcomAgentAccounts()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, buildEcomAgentAccountResponses(accounts))
}

func GetEcomAgentAccount(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	account, err := model.GetEcomAgentAccountByID(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, buildEcomAgentAccountEditResponse(account))
}

func CreateEcomAgentAccount(c *gin.Context) {
	req := EcomAgentAccountRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	account := &model.EcomAgentAccount{
		Email:            trimStringPointer(req.Email),
		Password:         trimStringPointer(req.Password),
		BaseURL:          trimStringPointer(req.BaseURL),
		SupabaseAuthURL:  trimStringPointer(req.SupabaseAuthURL),
		SupabaseAnonKey:  trimStringPointer(req.SupabaseAnonKey),
		ConfirmURL:       trimStringPointer(req.ConfirmURL),
		AccountID:        trimStringPointer(req.AccountID),
		AccessToken:      trimStringPointer(req.AccessToken),
		RefreshToken:     trimStringPointer(req.RefreshToken),
		AssignmentStatus: trimStringPointer(req.AssignmentStatus),
		AssignedPlan:     trimStringPointer(req.AssignedPlan),
		Tags:             trimStringPointer(req.Tags),
		Remark:           trimStringPointer(req.Remark),
		AccessTokenExpiresAt: func() int64 {
			if !req.ExpiresAt.IsSet {
				return 0
			}
			return req.ExpiresAt.Value
		}(),
		AssignedChannelID: func() int {
			if !req.AssignedChannelID.IsSet {
				return 0
			}
			return int(req.AssignedChannelID.Value)
		}(),
		AssignedSubscriptionOrderID: func() int {
			if !req.AssignedSubscriptionOrderID.IsSet {
				return 0
			}
			return int(req.AssignedSubscriptionOrderID.Value)
		}(),
		AssignedChannelKeyIndex: func() int {
			if !req.AssignedChannelKeyIndex.IsSet {
				return -1
			}
			if req.AssignedChannelKeyIndex.IsBlank {
				return -1
			}
			return int(req.AssignedChannelKeyIndex.Value)
		}(),
		AssignedUserSubscriptionID: func() int {
			if !req.AssignedUserSubscriptionID.IsSet {
				return 0
			}
			return int(req.AssignedUserSubscriptionID.Value)
		}(),
		AssignedAt: func() int64 {
			if !req.AssignedAt.IsSet {
				return 0
			}
			return req.AssignedAt.Value
		}(),
	}
	if account.BaseURL == "" {
		account.BaseURL = service.EcomAgentDefaultBaseURL()
	}
	if account.SupabaseAuthURL == "" {
		account.SupabaseAuthURL = service.EcomAgentDefaultSupabaseAuthURL()
	}
	if account.SupabaseAnonKey == "" {
		account.SupabaseAnonKey = service.EcomAgentDefaultSupabaseAnonKey()
	}
	if err := applyImportedSession(account, trimStringPointer(req.SessionJSON)); err != nil {
		common.ApiError(c, err)
		return
	}
	if account.HasRealEmail() {
		if duplicated, err := model.IsEcomAgentAccountEmailDuplicated(0, account.Email); err != nil {
			common.ApiError(c, err)
			return
		} else if duplicated {
			common.ApiErrorMsg(c, "邮箱已存在")
			return
		}
	}
	if err := account.Insert(); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, buildEcomAgentAccountResponse(account))
}

func UpdateEcomAgentAccount(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	account, err := model.GetEcomAgentAccountByID(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	req := EcomAgentAccountRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	nextEmail := trimOptionalString(req.Email)
	if nextEmail != nil && *nextEmail != "" && !strings.EqualFold(*nextEmail, account.Email) {
		if duplicated, err := model.IsEcomAgentAccountEmailDuplicated(account.Id, *nextEmail); err != nil {
			common.ApiError(c, err)
			return
		} else if duplicated {
			common.ApiErrorMsg(c, "邮箱已存在")
			return
		}
		account.Email = *nextEmail
	}
	if nextPassword := trimOptionalString(req.Password); nextPassword != nil && *nextPassword != "" {
		account.Password = *nextPassword
	}
	if nextBaseURL := trimOptionalString(req.BaseURL); nextBaseURL != nil && *nextBaseURL != "" {
		account.BaseURL = *nextBaseURL
	}
	if nextSupabaseAuthURL := trimOptionalString(req.SupabaseAuthURL); nextSupabaseAuthURL != nil && *nextSupabaseAuthURL != "" {
		account.SupabaseAuthURL = *nextSupabaseAuthURL
	}
	if nextSupabaseAnonKey := trimOptionalString(req.SupabaseAnonKey); nextSupabaseAnonKey != nil && *nextSupabaseAnonKey != "" {
		account.SupabaseAnonKey = *nextSupabaseAnonKey
	}
	if nextConfirmURL := trimOptionalString(req.ConfirmURL); nextConfirmURL != nil {
		account.ConfirmURL = *nextConfirmURL
	}
	if nextAccountID := trimOptionalString(req.AccountID); nextAccountID != nil {
		account.AccountID = *nextAccountID
	}
	if nextAccessToken := trimOptionalString(req.AccessToken); nextAccessToken != nil {
		account.AccessToken = *nextAccessToken
	}
	if nextRefreshToken := trimOptionalString(req.RefreshToken); nextRefreshToken != nil {
		account.RefreshToken = *nextRefreshToken
	}
	if req.ExpiresAt.IsSet {
		account.AccessTokenExpiresAt = req.ExpiresAt.Value
	}
	if nextAssignmentStatus := trimOptionalString(req.AssignmentStatus); nextAssignmentStatus != nil {
		account.AssignmentStatus = *nextAssignmentStatus
	}
	if nextAssignedPlan := trimOptionalString(req.AssignedPlan); nextAssignedPlan != nil {
		account.AssignedPlan = *nextAssignedPlan
	}
	if req.AssignedChannelID.IsSet {
		account.AssignedChannelID = int(req.AssignedChannelID.Value)
	}
	if req.AssignedSubscriptionOrderID.IsSet {
		account.AssignedSubscriptionOrderID = int(req.AssignedSubscriptionOrderID.Value)
	}
	if req.AssignedChannelKeyIndex.IsSet {
		if req.AssignedChannelKeyIndex.IsBlank {
			account.AssignedChannelKeyIndex = -1
		} else {
			account.AssignedChannelKeyIndex = int(req.AssignedChannelKeyIndex.Value)
		}
	}
	if req.AssignedUserSubscriptionID.IsSet {
		account.AssignedUserSubscriptionID = int(req.AssignedUserSubscriptionID.Value)
	}
	if req.AssignedAt.IsSet {
		account.AssignedAt = req.AssignedAt.Value
	}
	if nextTags := trimOptionalString(req.Tags); nextTags != nil {
		account.Tags = *nextTags
	}
	if nextRemark := trimOptionalString(req.Remark); nextRemark != nil {
		account.Remark = *nextRemark
	}
	if err := applyImportedSession(account, trimStringPointer(req.SessionJSON)); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := account.Update(); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, buildEcomAgentAccountResponse(account))
}

func DeleteEcomAgentAccount(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.DeleteEcomAgentAccountByID(id); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func SyncEcomAgentAccount(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	account, err := model.GetEcomAgentAccountByID(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	forceGenerateKey := strings.EqualFold(strings.TrimSpace(c.Query("force_generate_key")), "true")
	err = service.SyncEcomAgentAccountWithOptions(c.Request.Context(), account, service.SyncEcomAgentAccountOptions{
		ForceGenerateKey: forceGenerateKey,
	})
	if saveErr := account.Update(); saveErr != nil {
		common.ApiError(c, saveErr)
		return
	}
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
			"data":    buildEcomAgentAccountResponse(account),
		})
		return
	}
	common.ApiSuccess(c, buildEcomAgentAccountResponse(account))
}

func GetEcomAgentManualDeliveryOrders(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	items, total, err := model.GetAdminManualDeliveryOrders(pageInfo, c.Query("keyword"), c.Query("fulfillment_status"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(items)
	common.ApiSuccess(c, pageInfo)
}

func DeliverEcomAgentManualDeliveryOrder(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "无效的账号ID")
		return
	}
	account, err := model.GetEcomAgentAccountByID(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	req := EcomAgentDeliverManualOrderRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	orderID := req.OrderID
	if orderID <= 0 {
		orderID = account.AssignedSubscriptionOrderID
	}
	if orderID <= 0 {
		common.ApiErrorMsg(c, "请先关联人工发放订单")
		return
	}
	if strings.TrimSpace(account.APIKey) == "" {
		if err := service.SyncEcomAgentAccount(c.Request.Context(), account); err != nil {
			if saveErr := account.Update(); saveErr != nil {
				common.ApiError(c, saveErr)
				return
			}
			common.ApiError(c, err)
			return
		}
	}
	baseURL := strings.TrimRight(strings.TrimSpace(account.BaseURL), "/")
	if baseURL == "" {
		baseURL = service.EcomAgentDefaultBaseURL()
	}
	if strings.TrimSpace(account.APIKey) == "" {
		common.ApiErrorMsg(c, "当前账号没有可用 API Key，请先同步账号")
		return
	}

	deliveryPayload := []model.SubscriptionDeliveryPayloadItem{
		{Key: "api_key", Label: "API Key", Type: "text", Value: strings.TrimSpace(account.APIKey)},
		{Key: "base_url", Label: "Base URL", Type: "text", Value: baseURL},
		{Key: "usage_query_url", Label: "Usage URL", Type: "text", Value: baseURL + "/dashboard?tab=usage"},
	}
	order, err := model.AdminDeliverManualDeliveryOrder(orderID, c.GetInt("id"), deliveryPayload, strings.TrimSpace(req.AdminRemark))
	if err != nil {
		if saveErr := account.Update(); saveErr != nil {
			common.ApiError(c, saveErr)
			return
		}
		common.ApiError(c, err)
		return
	}

	account.AssignmentStatus = "assigned"
	account.AssignedPlan = strings.TrimSpace(order.PlanTitle)
	account.AssignedSubscriptionOrderID = orderID
	account.AssignedAt = common.GetTimestamp()
	account.AssignedUserSubscriptionID = 0
	account.AssignedChannelID = 0
	account.AssignedChannelKeyIndex = -1

	var sub model.UserSubscription
	if subErr := model.DB.Where("source_order_id = ?", orderID).Order("id desc").First(&sub).Error; subErr == nil {
		account.AssignedUserSubscriptionID = sub.Id
		account.AssignedChannelID = sub.SpecificChannelId
		account.AssignedChannelKeyIndex = sub.SpecificChannelKeyIndex
	}
	if err := account.Update(); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"account":              buildEcomAgentAccountResponse(account),
		"order":                order,
		"user_subscription_id": account.AssignedUserSubscriptionID,
	})
}

type EcomAgentAccountResponse struct {
	Id                          int    `json:"id"`
	Email                       string `json:"email"`
	BaseURL                     string `json:"base_url"`
	SupabaseAuthURL             string `json:"supabase_auth_url"`
	SupabaseAnonKey             string `json:"supabase_anon_key"`
	ConfirmURL                  string `json:"confirm_url"`
	AccountID                   string `json:"account_id"`
	AccessTokenExpiresAt        int64  `json:"access_token_expires_at"`
	APIKeyCreatedAt             int64  `json:"api_key_created_at"`
	APIKeyExpiresAt             int64  `json:"api_key_expires_at"`
	Plan                        string `json:"plan"`
	RequestLimit                int64  `json:"request_limit"`
	TokenLimit                  int64  `json:"token_limit"`
	UsageRequests               int64  `json:"usage_requests"`
	UsageTokens                 int64  `json:"usage_tokens"`
	UsageUpdatedAt              int64  `json:"usage_updated_at"`
	RequiresEmailConfirmation   bool   `json:"requires_email_confirmation"`
	SignupAt                    int64  `json:"signup_at"`
	ConfirmedAt                 int64  `json:"confirmed_at"`
	ConfirmationStatusCode      int    `json:"confirmation_status_code"`
	ConfirmationFinalURL        string `json:"confirmation_final_url"`
	AssignmentStatus            string `json:"assignment_status"`
	AssignedPlan                string `json:"assigned_plan"`
	AssignedSubscriptionOrderID int    `json:"assigned_subscription_order_id"`
	AssignedChannelID           int    `json:"assigned_channel_id"`
	AssignedChannelKeyIndex     int    `json:"assigned_channel_key_index"`
	AssignedUserSubscriptionID  int    `json:"assigned_user_subscription_id"`
	AssignedAt                  int64  `json:"assigned_at"`
	Tags                        string `json:"tags"`
	Remark                      string `json:"remark"`
	LoginAt                     int64  `json:"login_at"`
	LastSyncAt                  int64  `json:"last_sync_at"`
	Status                      string `json:"status"`
	LastError                   string `json:"last_error"`
	CreatedTime                 int64  `json:"created_time"`
	UpdatedTime                 int64  `json:"updated_time"`
	APIKey                      string `json:"api_key"`
	SubscriptionRaw             string `json:"subscription_raw"`
	UsageRaw                    string `json:"usage_raw"`
	HasPassword                 bool   `json:"has_password"`
	HasRefreshToken             bool   `json:"has_refresh_token"`
	HasAccessToken              bool   `json:"has_access_token"`
	HasAPIKey                   bool   `json:"has_api_key"`
	MaskedRefreshToken          string `json:"masked_refresh_token"`
	MaskedAccessToken           string `json:"masked_access_token"`
	MaskedAPIKey                string `json:"masked_api_key"`
}

type EcomAgentAccountEditResponse struct {
	*EcomAgentAccountResponse
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	SessionJSON  string `json:"session_json"`
}

func buildEcomAgentAccountResponses(accounts []*model.EcomAgentAccount) []*EcomAgentAccountResponse {
	responses := make([]*EcomAgentAccountResponse, 0, len(accounts))
	for _, account := range accounts {
		responses = append(responses, buildEcomAgentAccountResponse(account))
	}
	return responses
}

func buildEcomAgentAccountResponse(account *model.EcomAgentAccount) *EcomAgentAccountResponse {
	if account == nil {
		return nil
	}
	return &EcomAgentAccountResponse{
		Id:                          account.Id,
		Email:                       account.GetDisplayEmail(),
		BaseURL:                     account.BaseURL,
		SupabaseAuthURL:             account.SupabaseAuthURL,
		SupabaseAnonKey:             account.SupabaseAnonKey,
		ConfirmURL:                  account.ConfirmURL,
		AccountID:                   account.AccountID,
		AccessTokenExpiresAt:        account.AccessTokenExpiresAt,
		APIKeyCreatedAt:             account.APIKeyCreatedAt,
		APIKeyExpiresAt:             account.APIKeyExpiresAt,
		Plan:                        account.Plan,
		RequestLimit:                account.RequestLimit,
		TokenLimit:                  account.TokenLimit,
		UsageRequests:               account.UsageRequests,
		UsageTokens:                 account.UsageTokens,
		UsageUpdatedAt:              account.UsageUpdatedAt,
		RequiresEmailConfirmation:   account.RequiresEmailConfirmation,
		SignupAt:                    account.SignupAt,
		ConfirmedAt:                 account.ConfirmedAt,
		ConfirmationStatusCode:      account.ConfirmationStatusCode,
		ConfirmationFinalURL:        account.ConfirmationFinalURL,
		AssignmentStatus:            account.AssignmentStatus,
		AssignedPlan:                account.AssignedPlan,
		AssignedSubscriptionOrderID: account.AssignedSubscriptionOrderID,
		AssignedChannelID:           account.AssignedChannelID,
		AssignedChannelKeyIndex:     account.AssignedChannelKeyIndex,
		AssignedUserSubscriptionID:  account.AssignedUserSubscriptionID,
		AssignedAt:                  account.AssignedAt,
		Tags:                        account.Tags,
		Remark:                      account.Remark,
		LoginAt:                     account.LoginAt,
		LastSyncAt:                  account.LastSyncAt,
		Status:                      account.Status,
		LastError:                   account.LastError,
		CreatedTime:                 account.CreatedTime,
		UpdatedTime:                 account.UpdatedTime,
		APIKey:                      account.APIKey,
		SubscriptionRaw:             account.SubscriptionRaw,
		UsageRaw:                    account.UsageRaw,
		HasPassword:                 strings.TrimSpace(account.Password) != "",
		HasRefreshToken:             strings.TrimSpace(account.RefreshToken) != "",
		HasAccessToken:              strings.TrimSpace(account.AccessToken) != "",
		HasAPIKey:                   strings.TrimSpace(account.APIKey) != "",
		MaskedRefreshToken:          maskSensitiveValue(account.RefreshToken),
		MaskedAccessToken:           maskSensitiveValue(account.AccessToken),
		MaskedAPIKey:                maskSensitiveValue(account.APIKey),
	}
}

func buildEcomAgentImportedSessionJSON(account *model.EcomAgentAccount) string {
	if account == nil {
		return ""
	}
	session := ecomAgentImportedSession{
		AccessToken:  strings.TrimSpace(account.AccessToken),
		RefreshToken: strings.TrimSpace(account.RefreshToken),
		ExpiresAt:    account.AccessTokenExpiresAt,
	}
	session.User.ID = strings.TrimSpace(account.AccountID)
	session.User.Email = strings.TrimSpace(account.GetDisplayEmail())
	if session.AccessToken == "" &&
		session.RefreshToken == "" &&
		session.ExpiresAt <= 0 &&
		session.User.ID == "" &&
		session.User.Email == "" {
		return ""
	}
	data, err := common.Marshal(session)
	if err != nil {
		return ""
	}
	return string(data)
}

func buildEcomAgentAccountEditResponse(account *model.EcomAgentAccount) *EcomAgentAccountEditResponse {
	base := buildEcomAgentAccountResponse(account)
	if base == nil || account == nil {
		return nil
	}
	return &EcomAgentAccountEditResponse{
		EcomAgentAccountResponse: base,
		AccessToken:              strings.TrimSpace(account.AccessToken),
		RefreshToken:             strings.TrimSpace(account.RefreshToken),
		SessionJSON:              buildEcomAgentImportedSessionJSON(account),
	}
}

func maskSensitiveValue(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if len(value) <= 12 {
		return value
	}
	return value[:6] + "..." + value[len(value)-4:]
}

func trimStringPointer(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func trimOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	return &trimmed
}
