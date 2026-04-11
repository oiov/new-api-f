package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

const (
	ecomAgentDefaultBaseURL       = "https://ecomagent.in"
	ecomAgentDefaultSupabaseAuth  = "https://zwggawnojtjiaklycfhc.supabase.co/auth/v1"
	ecomAgentDefaultSupabaseAnon  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3Z2dhd25vanRqaWFrbHljZmhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMzU3NDUsImV4cCI6MjA4NzYxMTc0NX0.-pQHomLNGWL7OvQpHL2_7T_NwI4wAzyNYMOknX_YJSE"
	ecomAgentRequestTimeout       = 20 * time.Second
	ecomAgentAccessTokenLeewaySec = int64(300)
	ecomAgentAPIKeyTTLSeconds     = int64(24 * 60 * 60)
)

type ecomAgentSignupResponse struct {
	Success                   bool `json:"success"`
	RequiresEmailConfirmation bool `json:"requiresEmailConfirmation"`
}

type ecomAgentLoginUser struct {
	ID string `json:"id"`
}

type ecomAgentPasswordLoginResponse struct {
	AccessToken  string             `json:"access_token"`
	ExpiresIn    int                `json:"expires_in"`
	ExpiresAt    int64              `json:"expires_at"`
	RefreshToken string             `json:"refresh_token"`
	User         ecomAgentLoginUser `json:"user"`
}

type ecomAgentRefreshResponse struct {
	AccessToken  string             `json:"access_token"`
	ExpiresIn    int                `json:"expires_in"`
	ExpiresAt    int64              `json:"expires_at"`
	RefreshToken string             `json:"refresh_token"`
	User         ecomAgentLoginUser `json:"user"`
}

type ecomAgentGenerateKeyResponse struct {
	Success   bool   `json:"success"`
	Key       string `json:"key"`
	APIKey    string `json:"apiKey"`
	Reused    bool   `json:"reused"`
	CreatedAt string `json:"createdAt"`
	ExpiresAt string `json:"expiresAt"`
}

type ecomAgentSubscriptionEnvelope struct {
	Success      bool                          `json:"success"`
	Subscription ecomAgentSubscriptionResponse `json:"subscription"`
}

type ecomAgentSubscriptionResponse struct {
	Plan            string `json:"plan"`
	RequestLimit    int64  `json:"requestLimit"`
	TokenLimit      int64  `json:"tokenLimit"`
	APIKey          string `json:"apiKey"`
	APIKeyName      string `json:"apiKeyName"`
	APIKeyCreatedAt string `json:"apiKeyCreatedAt"`
}

type ecomAgentUsageEnvelope struct {
	Success bool                   `json:"success"`
	Usage   ecomAgentUsageResponse `json:"usage"`
}

type ecomAgentUsageResponse struct {
	Requests    int64  `json:"requests"`
	Tokens      int64  `json:"tokens"`
	TotalTokens int64  `json:"totalTokens"`
	LastUpdated string `json:"lastUpdated"`
}

type ecomAgentClient struct {
	baseURL         string
	supabaseAuthURL string
	supabaseAnonKey string
	httpClient      *http.Client
}

func EcomAgentDefaultBaseURL() string {
	return ecomAgentDefaultBaseURL
}

func EcomAgentDefaultSupabaseAuthURL() string {
	return ecomAgentDefaultSupabaseAuth
}

func EcomAgentDefaultSupabaseAnonKey() string {
	return ecomAgentDefaultSupabaseAnon
}

type SyncEcomAgentAccountOptions struct {
	ForceGenerateKey bool
}

func SyncEcomAgentAccount(ctx context.Context, account *model.EcomAgentAccount) error {
	return SyncEcomAgentAccountWithOptions(ctx, account, SyncEcomAgentAccountOptions{})
}

func SyncEcomAgentAccountWithOptions(ctx context.Context, account *model.EcomAgentAccount, options SyncEcomAgentAccountOptions) error {
	if account == nil {
		return errors.New("账号不能为空")
	}
	account.PrepareDefaults()
	if account.BaseURL == "" {
		account.BaseURL = ecomAgentDefaultBaseURL
	}
	if account.SupabaseAuthURL == "" {
		account.SupabaseAuthURL = ecomAgentDefaultSupabaseAuth
	}
	if account.SupabaseAnonKey == "" {
		account.SupabaseAnonKey = ecomAgentDefaultSupabaseAnon
	}
	if err := account.Validate(); err != nil {
		account.Status = "invalid"
		account.LastError = err.Error()
		return err
	}

	client := &ecomAgentClient{
		baseURL:         account.BaseURL,
		supabaseAuthURL: account.SupabaseAuthURL,
		supabaseAnonKey: account.SupabaseAnonKey,
		httpClient:      cloneDefaultHTTPClient(),
	}
	if account.SignupAt == 0 && account.AccountID == "" {
		signupResp, signupRaw, err := client.signup(ctx, account.Email, account.Password)
		if err != nil {
			account.Status = "signup_failed"
			account.LastError = err.Error()
			return err
		}
		account.SignupRaw = signupRaw
		account.RequiresEmailConfirmation = signupResp.RequiresEmailConfirmation
		account.SignupAt = common.GetTimestamp()
		if signupResp.RequiresEmailConfirmation {
			account.Status = "pending_email_confirmation"
		} else {
			account.Status = "signed_up"
		}
		account.LastError = ""
	}

	if account.ConfirmURL != "" && account.ConfirmedAt == 0 {
		confirmStatus, finalURL, err := client.visitConfirmationLink(ctx, account.ConfirmURL)
		if err != nil {
			account.Status = "confirm_failed"
			account.LastError = err.Error()
			return err
		}
		account.ConfirmationStatusCode = confirmStatus
		account.ConfirmationFinalURL = finalURL
		account.Status = "confirmation_attempted"
		account.LastError = ""
	}

	accessToken, refreshToken, accountID, expiresAt, authStatus, err := ensureEcomAgentAccessToken(ctx, client, account)
	if err != nil {
		if account.RequiresEmailConfirmation && account.ConfirmedAt == 0 {
			account.Status = "pending_email_confirmation"
		} else {
			account.Status = authStatus
		}
		account.LastError = err.Error()
		return err
	}
	account.AccessToken = accessToken
	account.RefreshToken = refreshToken
	account.AccountID = accountID
	account.AccessTokenExpiresAt = expiresAt
	account.LoginAt = common.GetTimestamp()
	account.Status = authStatus
	account.LastError = ""
	if account.RequiresEmailConfirmation && account.ConfirmedAt == 0 {
		account.ConfirmedAt = account.LoginAt
	}

	shouldGenerateKey := options.ForceGenerateKey || !hasUsableEcomAgentAPIKey(account)
	if shouldGenerateKey {
		keyResp, keyRaw, err := client.generateKey(ctx, account.AccessToken, account.AccountID, account.Email)
		if err != nil {
			account.Status = "generate_key_failed"
			account.LastError = err.Error()
			return err
		}
		apiKey := firstNonEmptyString(keyResp.Key, keyResp.APIKey)
		if apiKey == "" {
			account.Status = "generate_key_failed"
			account.LastError = "响应缺少 api key"
			return errors.New("响应缺少 api key")
		}
		account.APIKey = apiKey
		account.APIKeyCreatedAt = parseTimestampOrNow(keyResp.CreatedAt)
		account.APIKeyExpiresAt = parseTimestampOrDefault(keyResp.ExpiresAt, account.APIKeyCreatedAt+ecomAgentAPIKeyTTLSeconds)
		account.KeyRaw = keyRaw
		account.Status = "key_ready"
		account.LastError = ""
	}

	subscriptionResp, subscriptionRaw, subErr := client.subscription(ctx, account.AccessToken, account.AccountID)
	usageResp, usageRaw, usageErr := client.usage(ctx, account.AccessToken, account.AccountID)
	if subErr != nil && usageErr != nil {
		account.Status = "usage_failed"
		account.LastError = fmt.Sprintf("subscription: %v; usage: %v", subErr, usageErr)
		return errors.New(account.LastError)
	}
	if subErr == nil {
		account.Plan = subscriptionResp.Subscription.Plan
		account.RequestLimit = subscriptionResp.Subscription.RequestLimit
		account.TokenLimit = subscriptionResp.Subscription.TokenLimit
		account.SubscriptionRaw = subscriptionRaw
		if account.APIKey == "" {
			account.APIKey = subscriptionResp.Subscription.APIKey
		}
	}
	if usageErr == nil {
		account.UsageRequests = usageResp.Usage.Requests
		account.UsageTokens = usageResp.Usage.Tokens
		if account.UsageTokens == 0 {
			account.UsageTokens = usageResp.Usage.TotalTokens
		}
		account.UsageUpdatedAt = parseTimestampOrDefault(usageResp.Usage.LastUpdated, common.GetTimestamp())
		account.UsageRaw = usageRaw
	}
	account.LastSyncAt = common.GetTimestamp()
	account.Status = "ready"
	account.LastError = ""
	return nil
}

func hasUsableEcomAgentAPIKey(account *model.EcomAgentAccount) bool {
	if account == nil {
		return false
	}
	if strings.TrimSpace(account.APIKey) == "" {
		return false
	}
	if account.APIKeyExpiresAt == 0 {
		return true
	}
	return account.APIKeyExpiresAt > common.GetTimestamp()
}

func cloneDefaultHTTPClient() *http.Client {
	base := GetHttpClient()
	if base == nil {
		return &http.Client{Timeout: ecomAgentRequestTimeout}
	}
	clone := *base
	clone.Timeout = ecomAgentRequestTimeout
	return &clone
}

func ensureEcomAgentAccessToken(ctx context.Context, client *ecomAgentClient, account *model.EcomAgentAccount) (string, string, string, int64, string, error) {
	if strings.TrimSpace(account.AccessToken) != "" && !isEcomAgentTokenExpired(account.AccessToken) {
		return account.AccessToken, account.RefreshToken, firstNonEmptyString(account.AccountID, extractEcomAgentAccountID(account.AccessToken)), account.AccessTokenExpiresAt, "token_reused", nil
	}
	if strings.TrimSpace(account.RefreshToken) != "" {
		refreshResp, _, err := client.refreshAccessToken(ctx, account.RefreshToken)
		if err == nil {
			return refreshResp.AccessToken, firstNonEmptyString(refreshResp.RefreshToken, account.RefreshToken), firstNonEmptyString(account.AccountID, refreshResp.User.ID, extractEcomAgentAccountID(refreshResp.AccessToken)), normalizeEcomAgentExpiry(refreshResp.ExpiresAt, refreshResp.ExpiresIn), "token_refreshed", nil
		}
	}
	loginResp, _, err := client.passwordLogin(ctx, account.Email, account.Password)
	if err != nil {
		return "", "", "", 0, "auth_failed", err
	}
	return loginResp.AccessToken, loginResp.RefreshToken, firstNonEmptyString(loginResp.User.ID, extractEcomAgentAccountID(loginResp.AccessToken)), normalizeEcomAgentExpiry(loginResp.ExpiresAt, loginResp.ExpiresIn), "logged_in", nil
}

func (c *ecomAgentClient) signup(ctx context.Context, email string, password string) (*ecomAgentSignupResponse, string, error) {
	payload := map[string]string{
		"email":    email,
		"password": password,
	}
	resp := &ecomAgentSignupResponse{}
	raw, err := c.requestJSON(ctx, http.MethodPost, c.baseURL+"/api/auth/signup", map[string]string{
		"Accept":       "*/*",
		"Content-Type": "application/json",
		"Origin":       c.baseURL,
		"Referer":      c.baseURL + "/signup",
	}, payload, resp)
	return resp, raw, err
}

func (c *ecomAgentClient) visitConfirmationLink(ctx context.Context, confirmURL string) (int, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, confirmURL, nil)
	if err != nil {
		return 0, "", err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return 0, "", err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	return resp.StatusCode, resp.Request.URL.String(), nil
}

func (c *ecomAgentClient) passwordLogin(ctx context.Context, email string, password string) (*ecomAgentPasswordLoginResponse, string, error) {
	payload := map[string]any{
		"email":                email,
		"password":             password,
		"gotrue_meta_security": map[string]any{},
	}
	resp := &ecomAgentPasswordLoginResponse{}
	raw, err := c.requestJSON(ctx, http.MethodPost, c.supabaseAuthURL+"/token?grant_type=password", map[string]string{
		"Accept":                 "*/*",
		"Content-Type":           "application/json;charset=UTF-8",
		"apikey":                 c.supabaseAnonKey,
		"Authorization":          "Bearer " + c.supabaseAnonKey,
		"Origin":                 c.baseURL,
		"Referer":                c.baseURL + "/",
		"X-Client-Info":          "supabase-js-web/2.98.0",
		"X-Supabase-Api-Version": "2024-01-01",
	}, payload, resp)
	return resp, raw, err
}

func (c *ecomAgentClient) refreshAccessToken(ctx context.Context, refreshToken string) (*ecomAgentRefreshResponse, string, error) {
	payload := map[string]string{
		"refresh_token": refreshToken,
	}
	resp := &ecomAgentRefreshResponse{}
	raw, err := c.requestJSON(ctx, http.MethodPost, c.supabaseAuthURL+"/token?grant_type=refresh_token", map[string]string{
		"Accept":       "application/json",
		"Content-Type": "application/json",
		"apikey":       c.supabaseAnonKey,
	}, payload, resp)
	return resp, raw, err
}

func (c *ecomAgentClient) generateKey(ctx context.Context, accessToken string, accountID string, email string) (*ecomAgentGenerateKeyResponse, string, error) {
	payload := map[string]string{
		"accountId": accountID,
		"email":     email,
	}
	resp := &ecomAgentGenerateKeyResponse{}
	raw, err := c.requestJSON(ctx, http.MethodPost, c.baseURL+"/api/generate-key", map[string]string{
		"Accept":        "*/*",
		"Authorization": "Bearer " + accessToken,
		"Content-Type":  "application/json",
		"Origin":        c.baseURL,
		"Referer":       c.baseURL + "/dashboard",
	}, payload, resp)
	return resp, raw, err
}

func (c *ecomAgentClient) subscription(ctx context.Context, accessToken string, accountID string) (*ecomAgentSubscriptionEnvelope, string, error) {
	resp := &ecomAgentSubscriptionEnvelope{}
	raw, err := c.requestJSON(ctx, http.MethodGet, c.baseURL+"/api/subscription/"+accountID, map[string]string{
		"Accept":        "*/*",
		"Authorization": "Bearer " + accessToken,
	}, nil, resp)
	return resp, raw, err
}

func (c *ecomAgentClient) usage(ctx context.Context, accessToken string, accountID string) (*ecomAgentUsageEnvelope, string, error) {
	resp := &ecomAgentUsageEnvelope{}
	raw, err := c.requestJSON(ctx, http.MethodGet, c.baseURL+"/api/account-usage/"+accountID, map[string]string{
		"Accept":        "*/*",
		"Authorization": "Bearer " + accessToken,
		"Referer":       c.baseURL + "/dashboard?tab=billing",
	}, nil, resp)
	return resp, raw, err
}

func (c *ecomAgentClient) requestJSON(ctx context.Context, method string, targetURL string, headers map[string]string, payload any, out any) (string, error) {
	var bodyReader io.Reader
	if payload != nil {
		bodyBytes, err := common.Marshal(payload)
		if err != nil {
			return "", err
		}
		bodyReader = bytes.NewReader(bodyBytes)
	}
	req, err := http.NewRequestWithContext(ctx, method, targetURL, bodyReader)
	if err != nil {
		return "", err
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	bodyString := string(bodyBytes)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return bodyString, fmt.Errorf("HTTP %d: %s", resp.StatusCode, bodyString)
	}
	if out != nil && len(bytes.TrimSpace(bodyBytes)) > 0 {
		if err := common.Unmarshal(bodyBytes, out); err != nil {
			return bodyString, err
		}
	}
	return bodyString, nil
}

func isEcomAgentTokenExpired(token string) bool {
	if strings.TrimSpace(token) == "" {
		return true
	}
	payload, ok := decodeEcomAgentJWTPayload(token)
	if !ok {
		return true
	}
	exp, ok := payload["exp"].(float64)
	if !ok {
		return true
	}
	return int64(exp) <= common.GetTimestamp()+ecomAgentAccessTokenLeewaySec
}

func extractEcomAgentAccountID(token string) string {
	payload, ok := decodeEcomAgentJWTPayload(token)
	if !ok {
		return ""
	}
	sub, _ := payload["sub"].(string)
	return strings.TrimSpace(sub)
}

func decodeEcomAgentJWTPayload(token string) (map[string]any, bool) {
	parts := strings.Split(token, ".")
	if len(parts) < 2 {
		return nil, false
	}
	decoded, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, false
	}
	payload := make(map[string]any)
	if err := common.Unmarshal(decoded, &payload); err != nil {
		return nil, false
	}
	return payload, true
}

func normalizeEcomAgentExpiry(expiresAt int64, expiresIn int) int64 {
	if expiresAt > 0 {
		return expiresAt
	}
	if expiresIn > 0 {
		return common.GetTimestamp() + int64(expiresIn)
	}
	return 0
}

func parseTimestampOrNow(value string) int64 {
	return parseTimestampOrDefault(value, common.GetTimestamp())
}

func parseTimestampOrDefault(value string, fallback int64) int64 {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return parsed.Unix()
	}
	return fallback
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
