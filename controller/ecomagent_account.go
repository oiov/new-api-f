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

type EcomAgentAccountRequest struct {
	Email           *string `json:"email"`
	Password        *string `json:"password"`
	BaseURL         *string `json:"base_url"`
	SupabaseAuthURL *string `json:"supabase_auth_url"`
	SupabaseAnonKey *string `json:"supabase_anon_key"`
	ConfirmURL      *string `json:"confirm_url"`
}

func GetEcomAgentAccounts(c *gin.Context) {
	accounts, err := model.GetAllEcomAgentAccounts()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, buildEcomAgentAccountResponses(accounts))
}

func CreateEcomAgentAccount(c *gin.Context) {
	req := EcomAgentAccountRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	account := &model.EcomAgentAccount{
		Email:           trimStringPointer(req.Email),
		Password:        trimStringPointer(req.Password),
		BaseURL:         trimStringPointer(req.BaseURL),
		SupabaseAuthURL: trimStringPointer(req.SupabaseAuthURL),
		SupabaseAnonKey: trimStringPointer(req.SupabaseAnonKey),
		ConfirmURL:      trimStringPointer(req.ConfirmURL),
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
	if duplicated, err := model.IsEcomAgentAccountEmailDuplicated(0, account.Email); err != nil {
		common.ApiError(c, err)
		return
	} else if duplicated {
		common.ApiErrorMsg(c, "邮箱已存在")
		return
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

type EcomAgentAccountResponse struct {
	Id                        int    `json:"id"`
	Email                     string `json:"email"`
	BaseURL                   string `json:"base_url"`
	SupabaseAuthURL           string `json:"supabase_auth_url"`
	SupabaseAnonKey           string `json:"supabase_anon_key"`
	ConfirmURL                string `json:"confirm_url"`
	AccountID                 string `json:"account_id"`
	AccessTokenExpiresAt      int64  `json:"access_token_expires_at"`
	APIKeyCreatedAt           int64  `json:"api_key_created_at"`
	APIKeyExpiresAt           int64  `json:"api_key_expires_at"`
	Plan                      string `json:"plan"`
	RequestLimit              int64  `json:"request_limit"`
	TokenLimit                int64  `json:"token_limit"`
	UsageRequests             int64  `json:"usage_requests"`
	UsageTokens               int64  `json:"usage_tokens"`
	UsageUpdatedAt            int64  `json:"usage_updated_at"`
	RequiresEmailConfirmation bool   `json:"requires_email_confirmation"`
	SignupAt                  int64  `json:"signup_at"`
	ConfirmedAt               int64  `json:"confirmed_at"`
	ConfirmationStatusCode    int    `json:"confirmation_status_code"`
	ConfirmationFinalURL      string `json:"confirmation_final_url"`
	LoginAt                   int64  `json:"login_at"`
	LastSyncAt                int64  `json:"last_sync_at"`
	Status                    string `json:"status"`
	LastError                 string `json:"last_error"`
	CreatedTime               int64  `json:"created_time"`
	UpdatedTime               int64  `json:"updated_time"`
	HasPassword               bool   `json:"has_password"`
	HasRefreshToken           bool   `json:"has_refresh_token"`
	HasAccessToken            bool   `json:"has_access_token"`
	HasAPIKey                 bool   `json:"has_api_key"`
	MaskedRefreshToken        string `json:"masked_refresh_token"`
	MaskedAccessToken         string `json:"masked_access_token"`
	MaskedAPIKey              string `json:"masked_api_key"`
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
		Id:                        account.Id,
		Email:                     account.Email,
		BaseURL:                   account.BaseURL,
		SupabaseAuthURL:           account.SupabaseAuthURL,
		SupabaseAnonKey:           account.SupabaseAnonKey,
		ConfirmURL:                account.ConfirmURL,
		AccountID:                 account.AccountID,
		AccessTokenExpiresAt:      account.AccessTokenExpiresAt,
		APIKeyCreatedAt:           account.APIKeyCreatedAt,
		APIKeyExpiresAt:           account.APIKeyExpiresAt,
		Plan:                      account.Plan,
		RequestLimit:              account.RequestLimit,
		TokenLimit:                account.TokenLimit,
		UsageRequests:             account.UsageRequests,
		UsageTokens:               account.UsageTokens,
		UsageUpdatedAt:            account.UsageUpdatedAt,
		RequiresEmailConfirmation: account.RequiresEmailConfirmation,
		SignupAt:                  account.SignupAt,
		ConfirmedAt:               account.ConfirmedAt,
		ConfirmationStatusCode:    account.ConfirmationStatusCode,
		ConfirmationFinalURL:      account.ConfirmationFinalURL,
		LoginAt:                   account.LoginAt,
		LastSyncAt:                account.LastSyncAt,
		Status:                    account.Status,
		LastError:                 account.LastError,
		CreatedTime:               account.CreatedTime,
		UpdatedTime:               account.UpdatedTime,
		HasPassword:               strings.TrimSpace(account.Password) != "",
		HasRefreshToken:           strings.TrimSpace(account.RefreshToken) != "",
		HasAccessToken:            strings.TrimSpace(account.AccessToken) != "",
		HasAPIKey:                 strings.TrimSpace(account.APIKey) != "",
		MaskedRefreshToken:        maskSensitiveValue(account.RefreshToken),
		MaskedAccessToken:         maskSensitiveValue(account.AccessToken),
		MaskedAPIKey:              maskSensitiveValue(account.APIKey),
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
