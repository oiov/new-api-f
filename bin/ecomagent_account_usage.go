package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
)

const (
	defaultBaseURL         = "https://ecomagent.in"
	defaultSupabaseAuthURL = "https://zwggawnojtjiaklycfhc.supabase.co/auth/v1"
	defaultSupabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3Z2dhd25vanRqaWFrbHljZmhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMzU3NDUsImV4cCI6MjA4NzYxMTc0NX0.-pQHomLNGWL7OvQpHL2_7T_NwI4wAzyNYMOknX_YJSE"
	defaultNewAPIBaseURL   = "http://127.0.0.1:3000"
	requestTimeout         = 20 * time.Second
	accessTokenLeeway      = 5 * time.Minute
	apiKeyTTL              = 24 * time.Hour
)

type options struct {
	Email             string
	Password          string
	ConfirmURL        string
	StorePath         string
	BaseURL           string
	SupabaseAuthURL   string
	SupabaseAnonKey   string
	SkipSignup        bool
	SkipConfirm       bool
	SkipKey           bool
	SkipUsage         bool
	ForcePasswordAuth bool
	SyncNewAPI        bool
	NewAPIBaseURL     string
	NewAPIToken       string
	ChannelType       int
	ChannelModels     string
	ChannelNamePrefix string
	SharedGroup       string
	Raw               bool
}

type accountStore struct {
	Version   int                       `json:"version"`
	UpdatedAt string                    `json:"updated_at"`
	Accounts  map[string]*accountRecord `json:"accounts"`
}

type accountRecord struct {
	Email                     string             `json:"email"`
	Password                  string             `json:"password"`
	BaseURL                   string             `json:"base_url"`
	AccountID                 string             `json:"account_id,omitempty"`
	RefreshToken              string             `json:"refresh_token,omitempty"`
	RequiresEmailConfirmation bool               `json:"requires_email_confirmation,omitempty"`
	ConfirmURL                string             `json:"confirm_url,omitempty"`
	Status                    string             `json:"status"`
	SignupAt                  string             `json:"signup_at,omitempty"`
	ConfirmedAt               string             `json:"confirmed_at,omitempty"`
	LoginAt                   string             `json:"login_at,omitempty"`
	CreatedAt                 string             `json:"created_at"`
	UpdatedAt                 string             `json:"updated_at"`
	LastError                 string             `json:"last_error,omitempty"`
	Signup                    *signupResponse    `json:"signup,omitempty"`
	Confirmation              *confirmationState `json:"confirmation,omitempty"`
	Runtime                   *runtimeState      `json:"runtime,omitempty"`
	Key                       *keyState          `json:"key,omitempty"`
	Subscription              *subscriptionState `json:"subscription,omitempty"`
	Usage                     *usageState        `json:"usage,omitempty"`
	NewAPI                    *newAPIState       `json:"newapi,omitempty"`
}

type runtimeState struct {
	Token          string `json:"token,omitempty"`
	TokenExpiresAt string `json:"token_expires_at,omitempty"`
}

type keyState struct {
	Value       string          `json:"value,omitempty"`
	Reused      bool            `json:"reused"`
	CreatedAt   string          `json:"created_at,omitempty"`
	ExpiresAt   string          `json:"expires_at,omitempty"`
	RawResponse jsonRawEnvelope `json:"raw_response,omitempty"`
}

type subscriptionState struct {
	Plan            string          `json:"plan"`
	RequestLimit    int64           `json:"request_limit"`
	TokenLimit      int64           `json:"token_limit"`
	APIKey          string          `json:"api_key,omitempty"`
	APIKeyName      string          `json:"api_key_name,omitempty"`
	APIKeyCreatedAt string          `json:"api_key_created_at,omitempty"`
	RawResponse     jsonRawEnvelope `json:"raw_response,omitempty"`
}

type usageState struct {
	Requests       int64           `json:"requests"`
	Tokens         int64           `json:"tokens"`
	LastUpdated    string          `json:"last_updated,omitempty"`
	RecentLogs     []any           `json:"recent_logs,omitempty"`
	ModelBreakdown []any           `json:"model_breakdown,omitempty"`
	RawResponse    jsonRawEnvelope `json:"raw_response,omitempty"`
}

type newAPIState struct {
	SyncedAt     string `json:"synced_at,omitempty"`
	ChannelName  string `json:"channel_name,omitempty"`
	ChannelGroup string `json:"channel_group,omitempty"`
	ChannelTag   string `json:"channel_tag,omitempty"`
	Message      string `json:"message,omitempty"`
}

type confirmationState struct {
	VisitedAt string `json:"visited_at,omitempty"`
	FinalURL  string `json:"final_url,omitempty"`
	Status    int    `json:"status"`
	OK        bool   `json:"ok"`
}

type signupResponse struct {
	Success                   bool `json:"success"`
	RequiresEmailConfirmation bool `json:"requiresEmailConfirmation"`
}

type passwordLoginResponse struct {
	AccessToken  string    `json:"access_token"`
	ExpiresIn    int       `json:"expires_in"`
	ExpiresAt    int64     `json:"expires_at"`
	RefreshToken string    `json:"refresh_token"`
	User         loginUser `json:"user"`
}

type loginUser struct {
	ID               string `json:"id"`
	Email            string `json:"email"`
	EmailConfirmedAt string `json:"email_confirmed_at"`
	ConfirmedAt      string `json:"confirmed_at"`
}

type refreshResponse struct {
	AccessToken  string    `json:"access_token"`
	ExpiresIn    int       `json:"expires_in"`
	ExpiresAt    int64     `json:"expires_at"`
	RefreshToken string    `json:"refresh_token"`
	User         loginUser `json:"user"`
}

type generateKeyResponse struct {
	Success   bool   `json:"success"`
	Key       string `json:"key"`
	APIKey    string `json:"apiKey"`
	Reused    bool   `json:"reused"`
	CreatedAt string `json:"createdAt"`
	ExpiresAt string `json:"expiresAt"`
}

type subscriptionEnvelope struct {
	Success      bool                 `json:"success"`
	Subscription subscriptionResponse `json:"subscription"`
}

type subscriptionResponse struct {
	Plan            string `json:"plan"`
	RequestLimit    int64  `json:"requestLimit"`
	TokenLimit      int64  `json:"tokenLimit"`
	APIKey          string `json:"apiKey"`
	APIKeyName      string `json:"apiKeyName"`
	APIKeyCreatedAt string `json:"apiKeyCreatedAt"`
}

type usageEnvelope struct {
	Success bool          `json:"success"`
	Usage   usageResponse `json:"usage"`
}

type usageResponse struct {
	Requests       int64  `json:"requests"`
	Tokens         int64  `json:"tokens"`
	TotalTokens    int64  `json:"totalTokens"`
	LastUpdated    string `json:"lastUpdated"`
	RecentLogs     []any  `json:"recentLogs"`
	ModelBreakdown []any  `json:"modelBreakdown"`
}

type newAPIChannelRequest struct {
	Mode    string        `json:"mode"`
	Channel newAPIChannel `json:"channel"`
}

type newAPIChannel struct {
	Type      int    `json:"type"`
	Key       string `json:"key"`
	Name      string `json:"name"`
	Models    string `json:"models,omitempty"`
	Group     string `json:"group"`
	Priority  int    `json:"priority"`
	Weight    int    `json:"weight"`
	Status    int    `json:"status"`
	Tag       string `json:"tag"`
	TestModel string `json:"test_model,omitempty"`
	Remark    string `json:"remark,omitempty"`
}

type newAPIEnvelope struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type jsonRawEnvelope map[string]any

type ecomAgentClient struct {
	baseURL         string
	supabaseAuthURL string
	supabaseAnonKey string
	httpClient      *http.Client
}

func main() {
	opts := parseFlags()
	if err := run(opts); err != nil {
		fmt.Fprintf(os.Stderr, "执行失败: %v\n", err)
		os.Exit(1)
	}
}

func parseFlags() options {
	opts := options{}

	flag.StringVar(&opts.Email, "email", "", "目标邮箱")
	flag.StringVar(&opts.Password, "password", "", "目标密码，默认与邮箱相同")
	flag.StringVar(&opts.ConfirmURL, "confirm-url", "", "邮件确认链接")
	flag.StringVar(&opts.StorePath, "store", envOrDefault("ECOMAGENT_STORE_PATH", ""), "账户存储文件路径")
	flag.StringVar(&opts.BaseURL, "base-url", envOrDefault("ECOMAGENT_BASE_URL", defaultBaseURL), "EcomAgent 基础地址")
	flag.StringVar(&opts.SupabaseAuthURL, "supabase-auth-url", envOrDefault("ECOMAGENT_SUPABASE_AUTH_URL", defaultSupabaseAuthURL), "Supabase Auth 地址")
	flag.StringVar(&opts.SupabaseAnonKey, "supabase-anon-key", envOrDefault("ECOMAGENT_SUPABASE_ANON_KEY", defaultSupabaseAnonKey), "Supabase anon key")
	flag.BoolVar(&opts.SkipSignup, "skip-signup", false, "跳过注册")
	flag.BoolVar(&opts.SkipConfirm, "skip-confirm", false, "跳过确认链接访问")
	flag.BoolVar(&opts.SkipKey, "skip-key", false, "跳过生成 key")
	flag.BoolVar(&opts.SkipUsage, "skip-usage", false, "跳过查询额度")
	flag.BoolVar(&opts.ForcePasswordAuth, "force-password-auth", false, "忽略 refresh_token，强制密码登录")
	flag.BoolVar(&opts.SyncNewAPI, "sync-newapi", false, "将生成的 key 同步到 new-api 渠道")
	flag.StringVar(&opts.NewAPIBaseURL, "newapi-base-url", envOrDefault("NEWAPI_BASE_URL", defaultNewAPIBaseURL), "new-api 地址")
	flag.StringVar(&opts.NewAPIToken, "newapi-token", envOrDefault("NEWAPI_BEARER", envOrDefault("NEW_API_BEARER", "")), "new-api 管理令牌")
	flag.IntVar(&opts.ChannelType, "channel-type", envInt("NEWAPI_CHANNEL_TYPE", 1), "new-api 渠道类型")
	flag.StringVar(&opts.ChannelModels, "channel-models", envOrDefault("NEWAPI_CHANNEL_MODELS", ""), "渠道模型，逗号分隔")
	flag.StringVar(&opts.ChannelNamePrefix, "channel-name-prefix", envOrDefault("NEWAPI_CHANNEL_NAME_PREFIX", "EcomAgent"), "渠道名称前缀")
	flag.StringVar(&opts.SharedGroup, "shared-group", envOrDefault("NEWAPI_SHARED_GROUP", "ecomagent_auto"), "渠道共享分组")
	flag.BoolVar(&opts.Raw, "raw", false, "输出完整 JSON")
	flag.Parse()

	if strings.TrimSpace(opts.Password) == "" && strings.TrimSpace(opts.Email) != "" {
		opts.Password = opts.Email
	}
	return opts
}

func run(opts options) error {
	if strings.TrimSpace(opts.Email) == "" {
		return errors.New("缺少 -email")
	}
	if strings.TrimSpace(opts.Password) == "" {
		return errors.New("缺少密码")
	}
	if strings.TrimSpace(opts.StorePath) == "" {
		opts.StorePath = "ecomagent_accounts.json"
	}
	opts.StorePath = absPath(opts.StorePath)

	store, err := loadStore(opts.StorePath)
	if err != nil {
		return err
	}
	record := upsertAccount(store, opts.Email, func(item *accountRecord) {
		now := nowRFC3339()
		if item.CreatedAt == "" {
			item.CreatedAt = now
		}
		item.Email = opts.Email
		item.Password = opts.Password
		item.BaseURL = opts.BaseURL
		item.UpdatedAt = now
		item.Status = coalesce(item.Status, "initialized")
	})
	if err := saveStore(opts.StorePath, store); err != nil {
		return err
	}

	client := &ecomAgentClient{
		baseURL:         strings.TrimRight(opts.BaseURL, "/"),
		supabaseAuthURL: strings.TrimRight(opts.SupabaseAuthURL, "/"),
		supabaseAnonKey: strings.TrimSpace(opts.SupabaseAnonKey),
		httpClient:      &http.Client{Timeout: requestTimeout},
	}

	if shouldSignup(record, opts) {
		signupResp, err := client.signup(context.Background(), opts.Email, opts.Password)
		if err != nil {
			return updateFailureAndSave(opts.StorePath, store, record, "signup_failed", err)
		}
		record = upsertAccount(store, opts.Email, func(item *accountRecord) {
			item.Signup = signupResp
			item.RequiresEmailConfirmation = signupResp.RequiresEmailConfirmation
			item.SignupAt = nowRFC3339()
			item.Status = "pending_email_confirmation"
			item.LastError = ""
			item.UpdatedAt = nowRFC3339()
		})
		if err := saveStore(opts.StorePath, store); err != nil {
			return err
		}
	}

	if strings.TrimSpace(opts.ConfirmURL) != "" && !opts.SkipConfirm {
		confirmState, err := client.visitConfirmLink(context.Background(), opts.ConfirmURL)
		if err != nil {
			return updateFailureAndSave(opts.StorePath, store, record, "confirm_failed", err)
		}
		record = upsertAccount(store, opts.Email, func(item *accountRecord) {
			item.ConfirmURL = opts.ConfirmURL
			item.Confirmation = confirmState
			item.ConfirmedAt = confirmState.VisitedAt
			item.Status = "confirmed"
			item.LastError = ""
			item.UpdatedAt = nowRFC3339()
		})
		if err := saveStore(opts.StorePath, store); err != nil {
			return err
		}
	}

	auth, authMode, err := ensureAccessToken(context.Background(), client, record, opts)
	if err != nil {
		return updateFailureAndSave(opts.StorePath, store, record, "auth_failed", err)
	}
	record = upsertAccount(store, opts.Email, func(item *accountRecord) {
		item.AccountID = auth.AccountID
		item.RefreshToken = auth.RefreshToken
		item.Runtime = &runtimeState{
			Token:          auth.AccessToken,
			TokenExpiresAt: auth.TokenExpiresAt,
		}
		item.LoginAt = nowRFC3339()
		item.Status = authMode
		item.LastError = ""
		item.UpdatedAt = nowRFC3339()
	})
	if err := saveStore(opts.StorePath, store); err != nil {
		return err
	}

	if !opts.SkipKey {
		keyResp, keyRaw, err := client.generateKey(context.Background(), auth.AccessToken, record.AccountID, record.Email)
		if err != nil {
			return updateFailureAndSave(opts.StorePath, store, record, "generate_key_failed", err)
		}
		keyValue := firstNonEmpty(keyResp.Key, keyResp.APIKey)
		createdAt := firstNonEmpty(keyResp.CreatedAt, nowRFC3339())
		expiresAt := firstNonEmpty(keyResp.ExpiresAt, inferFuture(createdAt, apiKeyTTL))
		record = upsertAccount(store, opts.Email, func(item *accountRecord) {
			item.Key = &keyState{
				Value:       keyValue,
				Reused:      keyResp.Reused,
				CreatedAt:   createdAt,
				ExpiresAt:   expiresAt,
				RawResponse: keyRaw,
			}
			if item.Runtime == nil {
				item.Runtime = &runtimeState{}
			}
			item.Status = "key_ready"
			item.UpdatedAt = nowRFC3339()
		})
		if err := saveStore(opts.StorePath, store); err != nil {
			return err
		}
	}

	if !opts.SkipUsage {
		subResp, subRaw, subErr := client.subscription(context.Background(), auth.AccessToken, record.AccountID)
		usageResp, usageRaw, usageErr := client.usage(context.Background(), auth.AccessToken, record.AccountID)
		if subErr != nil && usageErr != nil {
			return updateFailureAndSave(opts.StorePath, store, record, "usage_failed", fmt.Errorf("subscription: %v; usage: %v", subErr, usageErr))
		}
		record = upsertAccount(store, opts.Email, func(item *accountRecord) {
			if subErr == nil && subResp != nil {
				item.Subscription = &subscriptionState{
					Plan:            coalesce(subResp.Subscription.Plan, "-"),
					RequestLimit:    subResp.Subscription.RequestLimit,
					TokenLimit:      subResp.Subscription.TokenLimit,
					APIKey:          subResp.Subscription.APIKey,
					APIKeyName:      subResp.Subscription.APIKeyName,
					APIKeyCreatedAt: subResp.Subscription.APIKeyCreatedAt,
					RawResponse:     subRaw,
				}
			}
			if usageErr == nil && usageResp != nil {
				totalTokens := usageResp.Usage.Tokens
				if totalTokens == 0 {
					totalTokens = usageResp.Usage.TotalTokens
				}
				item.Usage = &usageState{
					Requests:       usageResp.Usage.Requests,
					Tokens:         totalTokens,
					LastUpdated:    usageResp.Usage.LastUpdated,
					RecentLogs:     usageResp.Usage.RecentLogs,
					ModelBreakdown: usageResp.Usage.ModelBreakdown,
					RawResponse:    usageRaw,
				}
			}
			item.Status = "completed"
			item.LastError = ""
			item.UpdatedAt = nowRFC3339()
		})
		if err := saveStore(opts.StorePath, store); err != nil {
			return err
		}
	}

	if opts.SyncNewAPI {
		if strings.TrimSpace(opts.NewAPIToken) == "" {
			return updateFailureAndSave(opts.StorePath, store, record, "newapi_failed", errors.New("缺少 new-api token"))
		}
		if record.Key == nil || strings.TrimSpace(record.Key.Value) == "" {
			return updateFailureAndSave(opts.StorePath, store, record, "newapi_failed", errors.New("缺少可同步的 key"))
		}
		channelName, groupName, tagName, message, err := syncToNewAPI(context.Background(), opts, record)
		if err != nil {
			return updateFailureAndSave(opts.StorePath, store, record, "newapi_failed", err)
		}
		record = upsertAccount(store, opts.Email, func(item *accountRecord) {
			item.NewAPI = &newAPIState{
				SyncedAt:     nowRFC3339(),
				ChannelName:  channelName,
				ChannelGroup: groupName,
				ChannelTag:   tagName,
				Message:      message,
			}
			item.Status = "synced_newapi"
			item.LastError = ""
			item.UpdatedAt = nowRFC3339()
		})
		if err := saveStore(opts.StorePath, store); err != nil {
			return err
		}
	}

	if opts.Raw {
		if err := printJSON(record); err != nil {
			return err
		}
	} else {
		if err := printCompact(record); err != nil {
			return err
		}
	}
	fmt.Printf("\n账户数据已保存: %s\n", opts.StorePath)
	return nil
}

func ensureAccessToken(ctx context.Context, client *ecomAgentClient, record *accountRecord, opts options) (*authState, string, error) {
	if !opts.ForcePasswordAuth && record.Runtime != nil && !tokenExpired(record.Runtime.Token) {
		return &authState{
			AccessToken:    record.Runtime.Token,
			TokenExpiresAt: record.Runtime.TokenExpiresAt,
			RefreshToken:   record.RefreshToken,
			AccountID:      firstNonEmpty(record.AccountID, extractAccountID(record.Runtime.Token)),
		}, "token_reused", nil
	}

	if !opts.ForcePasswordAuth && strings.TrimSpace(record.RefreshToken) != "" {
		refreshResp, err := client.refreshAccessToken(ctx, record.RefreshToken)
		if err == nil {
			return &authState{
				AccessToken:    refreshResp.AccessToken,
				TokenExpiresAt: normalizeUnix(refreshResp.ExpiresAt, refreshResp.ExpiresIn),
				RefreshToken:   firstNonEmpty(refreshResp.RefreshToken, record.RefreshToken),
				AccountID:      firstNonEmpty(record.AccountID, refreshResp.User.ID, extractAccountID(refreshResp.AccessToken)),
			}, "token_refreshed", nil
		}
	}

	loginResp, err := client.passwordLogin(ctx, record.Email, record.Password)
	if err != nil {
		return nil, "", err
	}
	return &authState{
		AccessToken:    loginResp.AccessToken,
		TokenExpiresAt: normalizeUnix(loginResp.ExpiresAt, loginResp.ExpiresIn),
		RefreshToken:   loginResp.RefreshToken,
		AccountID:      firstNonEmpty(loginResp.User.ID, extractAccountID(loginResp.AccessToken)),
	}, "logged_in", nil
}

type authState struct {
	AccessToken    string
	TokenExpiresAt string
	RefreshToken   string
	AccountID      string
}

func (c *ecomAgentClient) signup(ctx context.Context, email string, password string) (*signupResponse, error) {
	payload := map[string]string{
		"email":    email,
		"password": password,
	}
	resp := &signupResponse{}
	if _, err := c.requestJSON(ctx, http.MethodPost, c.baseURL+"/api/auth/signup", map[string]string{
		"Accept":       "*/*",
		"Content-Type": "application/json",
		"Origin":       c.baseURL,
		"Referer":      c.baseURL + "/signup",
	}, payload, resp); err != nil {
		return nil, err
	}
	return resp, nil
}

func (c *ecomAgentClient) visitConfirmLink(ctx context.Context, confirmURL string) (*confirmationState, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, confirmURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	return &confirmationState{
		VisitedAt: nowRFC3339(),
		FinalURL:  resp.Request.URL.String(),
		Status:    resp.StatusCode,
		OK:        resp.StatusCode >= 200 && resp.StatusCode < 400,
	}, nil
}

func (c *ecomAgentClient) passwordLogin(ctx context.Context, email string, password string) (*passwordLoginResponse, error) {
	payload := map[string]any{
		"email":                email,
		"password":             password,
		"gotrue_meta_security": map[string]any{},
	}
	resp := &passwordLoginResponse{}
	if _, err := c.requestJSON(ctx, http.MethodPost, c.supabaseAuthURL+"/token?grant_type=password", map[string]string{
		"Accept":                 "*/*",
		"Content-Type":           "application/json;charset=UTF-8",
		"apikey":                 c.supabaseAnonKey,
		"Authorization":          "Bearer " + c.supabaseAnonKey,
		"Origin":                 c.baseURL,
		"Referer":                c.baseURL + "/",
		"X-Client-Info":          "supabase-js-web/2.98.0",
		"X-Supabase-Api-Version": "2024-01-01",
	}, payload, resp); err != nil {
		return nil, err
	}
	return resp, nil
}

func (c *ecomAgentClient) refreshAccessToken(ctx context.Context, refreshToken string) (*refreshResponse, error) {
	payload := map[string]string{
		"refresh_token": refreshToken,
	}
	resp := &refreshResponse{}
	if _, err := c.requestJSON(ctx, http.MethodPost, c.supabaseAuthURL+"/token?grant_type=refresh_token", map[string]string{
		"Accept":       "application/json",
		"Content-Type": "application/json",
		"apikey":       c.supabaseAnonKey,
	}, payload, resp); err != nil {
		return nil, err
	}
	if strings.TrimSpace(resp.AccessToken) == "" {
		return nil, errors.New("refresh 响应缺少 access_token")
	}
	return resp, nil
}

func (c *ecomAgentClient) generateKey(ctx context.Context, accessToken string, accountID string, email string) (*generateKeyResponse, jsonRawEnvelope, error) {
	payload := map[string]string{
		"accountId": accountID,
		"email":     email,
	}
	resp := &generateKeyResponse{}
	raw, err := c.requestJSON(ctx, http.MethodPost, c.baseURL+"/api/generate-key", map[string]string{
		"Accept":        "*/*",
		"Authorization": "Bearer " + accessToken,
		"Content-Type":  "application/json",
		"Origin":        c.baseURL,
		"Referer":       c.baseURL + "/dashboard",
	}, payload, resp)
	return resp, raw, err
}

func (c *ecomAgentClient) subscription(ctx context.Context, accessToken string, accountID string) (*subscriptionEnvelope, jsonRawEnvelope, error) {
	resp := &subscriptionEnvelope{}
	raw, err := c.requestJSON(ctx, http.MethodGet, c.baseURL+"/api/subscription/"+accountID, map[string]string{
		"Accept":        "*/*",
		"Authorization": "Bearer " + accessToken,
	}, nil, resp)
	return resp, raw, err
}

func (c *ecomAgentClient) usage(ctx context.Context, accessToken string, accountID string) (*usageEnvelope, jsonRawEnvelope, error) {
	resp := &usageEnvelope{}
	raw, err := c.requestJSON(ctx, http.MethodGet, c.baseURL+"/api/account-usage/"+accountID, map[string]string{
		"Accept":        "*/*",
		"Authorization": "Bearer " + accessToken,
		"Referer":       c.baseURL + "/dashboard?tab=billing",
	}, nil, resp)
	return resp, raw, err
}

func (c *ecomAgentClient) requestJSON(
	ctx context.Context,
	method string,
	targetURL string,
	headers map[string]string,
	payload any,
	out any,
) (jsonRawEnvelope, error) {
	var bodyReader io.Reader
	if payload != nil {
		bodyBytes, err := common.Marshal(payload)
		if err != nil {
			return nil, err
		}
		bodyReader = bytes.NewReader(bodyBytes)
	}

	req, err := http.NewRequestWithContext(ctx, method, targetURL, bodyReader)
	if err != nil {
		return nil, err
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	raw := jsonRawEnvelope{}
	if len(bytes.TrimSpace(bodyBytes)) > 0 {
		if err := common.Unmarshal(bodyBytes, &raw); err != nil {
			return nil, fmt.Errorf("解析响应失败: %w", err)
		}
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return raw, fmt.Errorf("HTTP %d: %s", resp.StatusCode, firstNonEmpty(anyString(raw["message"]), anyString(raw["error"]), string(bodyBytes)))
	}
	if out != nil && len(bytes.TrimSpace(bodyBytes)) > 0 {
		if err := common.Unmarshal(bodyBytes, out); err != nil {
			return raw, err
		}
	}
	return raw, nil
}

func syncToNewAPI(ctx context.Context, opts options, record *accountRecord) (string, string, string, string, error) {
	client := &http.Client{Timeout: requestTimeout}
	payload, channelName, groupName, tagName := buildNewAPIChannelPayload(opts, record)
	bodyBytes, err := common.Marshal(payload)
	if err != nil {
		return "", "", "", "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(opts.NewAPIBaseURL, "/")+"/api/channel/", bytes.NewReader(bodyBytes))
	if err != nil {
		return "", "", "", "", err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+opts.NewAPIToken)
	req.Header.Set("New-Api-User", "1")

	resp, err := client.Do(req)
	if err != nil {
		return "", "", "", "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", "", "", "", err
	}
	result := &newAPIEnvelope{}
	if len(bytes.TrimSpace(body)) > 0 {
		if err := common.Unmarshal(body, result); err != nil {
			return "", "", "", "", err
		}
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 || !result.Success {
		return "", "", "", "", fmt.Errorf("new-api 同步失败: status=%d message=%s", resp.StatusCode, firstNonEmpty(result.Message, string(body)))
	}
	return channelName, groupName, tagName, firstNonEmpty(result.Message, "success"), nil
}

func buildNewAPIChannelPayload(opts options, record *accountRecord) (*newAPIChannelRequest, string, string, string) {
	tier, priority, weight := quotaTier(record)
	safeEmail := sanitizeName(strings.Split(record.Email, "@")[0])
	channelName := strings.TrimSpace(opts.ChannelNamePrefix) + " " + safeEmail
	groupName := strings.Join([]string{coalesce(strings.TrimSpace(opts.SharedGroup), "ecomagent_auto"), "quota_" + tier, "u_" + safeEmail}, ",")
	tagName := "ecomagent_" + tier
	testModel := firstCSV(opts.ChannelModels)

	payload := &newAPIChannelRequest{
		Mode: "single",
		Channel: newAPIChannel{
			Type:      opts.ChannelType,
			Key:       record.Key.Value,
			Name:      strings.TrimSpace(channelName),
			Models:    normalizeModels(opts.ChannelModels),
			Group:     groupName,
			Priority:  priority,
			Weight:    weight,
			Status:    1,
			Tag:       tagName,
			TestModel: testModel,
			Remark:    fmt.Sprintf("email:%s|account:%s|limit:%d|requests:%d", record.Email, record.AccountID, subscriptionLimit(record), usageRequests(record)),
		},
	}
	return payload, strings.TrimSpace(channelName), groupName, tagName
}

func quotaTier(record *accountRecord) (string, int, int) {
	limit := subscriptionLimit(record)
	requests := usageRequests(record)
	remaining := limit - requests
	if remaining < 0 {
		remaining = 0
	}
	ratio := 1.0
	if limit > 0 {
		ratio = float64(requests) / float64(limit)
	}
	if limit >= 100000 && remaining >= 50000 && ratio < 0.7 {
		return "premium", 300, 100
	}
	if limit >= 20000 && remaining >= 5000 && ratio < 0.9 {
		return "standard", 200, 80
	}
	return "overflow", 100, 60
}

func loadStore(storePath string) (*accountStore, error) {
	content, err := os.ReadFile(storePath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return &accountStore{
				Version:  1,
				Accounts: map[string]*accountRecord{},
			}, nil
		}
		return nil, err
	}
	store := &accountStore{}
	if err := common.Unmarshal(content, store); err != nil {
		return nil, err
	}
	if store.Accounts == nil {
		store.Accounts = map[string]*accountRecord{}
	}
	if store.Version == 0 {
		store.Version = 1
	}
	return store, nil
}

func saveStore(storePath string, store *accountStore) error {
	store.UpdatedAt = nowRFC3339()
	if store.Accounts == nil {
		store.Accounts = map[string]*accountRecord{}
	}
	if err := os.MkdirAll(filepath.Dir(storePath), 0o755); err != nil {
		return err
	}
	body, err := common.Marshal(store)
	if err != nil {
		return err
	}
	return os.WriteFile(storePath, append(body, '\n'), 0o600)
}

func upsertAccount(store *accountStore, email string, mutate func(item *accountRecord)) *accountRecord {
	item, ok := store.Accounts[email]
	if !ok || item == nil {
		item = &accountRecord{
			Email:     email,
			Status:    "initialized",
			CreatedAt: nowRFC3339(),
		}
		store.Accounts[email] = item
	}
	mutate(item)
	return item
}

func updateFailureAndSave(storePath string, store *accountStore, record *accountRecord, status string, err error) error {
	record.Status = status
	record.LastError = err.Error()
	record.UpdatedAt = nowRFC3339()
	_ = saveStore(storePath, store)
	return err
}

func shouldSignup(record *accountRecord, opts options) bool {
	if opts.SkipSignup {
		return false
	}
	if record.Signup != nil || strings.TrimSpace(record.AccountID) != "" {
		return false
	}
	return true
}

func tokenExpired(token string) bool {
	if strings.TrimSpace(token) == "" {
		return true
	}
	payload, ok := decodeJWTPayload(token)
	if !ok {
		return true
	}
	exp, ok := payload["exp"].(float64)
	if !ok {
		return true
	}
	return time.Unix(int64(exp), 0).Before(time.Now().Add(accessTokenLeeway))
}

func extractAccountID(token string) string {
	payload, ok := decodeJWTPayload(token)
	if !ok {
		return ""
	}
	return anyString(payload["sub"])
}

func decodeJWTPayload(token string) (map[string]any, bool) {
	parts := strings.Split(token, ".")
	if len(parts) < 2 {
		return nil, false
	}
	decoded, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, false
	}
	payload := map[string]any{}
	if err := common.Unmarshal(decoded, &payload); err != nil {
		return nil, false
	}
	return payload, true
}

func printCompact(record *accountRecord) error {
	output := map[string]any{
		"email":         record.Email,
		"password":      record.Password,
		"status":        record.Status,
		"account_id":    record.AccountID,
		"token":         mask(record.RuntimeToken()),
		"refresh":       mask(record.RefreshToken),
		"api_key":       record.KeyValue(),
		"plan":          record.Plan(),
		"request_limit": subscriptionLimit(record),
		"requests":      usageRequests(record),
		"tokens":        usageTokens(record),
		"updated_at":    record.UpdatedAt,
	}
	return printJSON(output)
}

func printJSON(v any) error {
	body, err := common.Marshal(v)
	if err != nil {
		return err
	}
	var pretty bytes.Buffer
	if err := json.Indent(&pretty, body, "", "  "); err == nil {
		fmt.Println(pretty.String())
		return nil
	}
	fmt.Println(string(body))
	return nil
}

func envOrDefault(key string, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func envInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	var parsed int
	_, err := fmt.Sscanf(value, "%d", &parsed)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func nowRFC3339() string {
	return time.Now().Format(time.RFC3339)
}

func normalizeUnix(expiresAt int64, expiresIn int) string {
	if expiresAt > 0 {
		return time.Unix(expiresAt, 0).Format(time.RFC3339)
	}
	if expiresIn > 0 {
		return time.Now().Add(time.Duration(expiresIn) * time.Second).Format(time.RFC3339)
	}
	return ""
}

func inferFuture(base string, delta time.Duration) string {
	parsed, err := time.Parse(time.RFC3339, base)
	if err != nil {
		return time.Now().Add(delta).Format(time.RFC3339)
	}
	return parsed.Add(delta).Format(time.RFC3339)
}

func sanitizeName(value string) string {
	replacer := strings.NewReplacer(" ", "-", "@", "-", ".", "-", "/", "-", ":", "-")
	text := replacer.Replace(strings.TrimSpace(value))
	text = strings.Trim(text, "-")
	if text == "" {
		return "ecomagent"
	}
	return text
}

func normalizeModels(value string) string {
	parts := strings.Split(value, ",")
	items := make([]string, 0, len(parts))
	for _, item := range parts {
		item = strings.TrimSpace(item)
		if item != "" {
			items = append(items, item)
		}
	}
	return strings.Join(items, ",")
}

func firstCSV(value string) string {
	for _, item := range strings.Split(value, ",") {
		item = strings.TrimSpace(item)
		if item != "" {
			return item
		}
	}
	return ""
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func anyString(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	default:
		return ""
	}
}

func coalesce(value string, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func absPath(value string) string {
	if filepath.IsAbs(value) {
		return value
	}
	pathValue, err := filepath.Abs(value)
	if err != nil {
		return value
	}
	return pathValue
}

func mask(value string) string {
	if len(value) <= 12 {
		return value
	}
	return value[:6] + "..." + value[len(value)-4:]
}

func subscriptionLimit(record *accountRecord) int64 {
	if record.Subscription == nil {
		return 0
	}
	return record.Subscription.RequestLimit
}

func usageRequests(record *accountRecord) int64 {
	if record.Usage == nil {
		return 0
	}
	return record.Usage.Requests
}

func usageTokens(record *accountRecord) int64 {
	if record.Usage == nil {
		return 0
	}
	return record.Usage.Tokens
}

func (r *accountRecord) RuntimeToken() string {
	if r.Runtime == nil {
		return ""
	}
	return r.Runtime.Token
}

func (r *accountRecord) KeyValue() string {
	if r.Key == nil {
		return ""
	}
	return r.Key.Value
}

func (r *accountRecord) Plan() string {
	if r.Subscription == nil {
		return ""
	}
	return r.Subscription.Plan
}
