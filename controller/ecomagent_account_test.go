package controller

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func setupEcomAgentAccountControllerTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	gin.SetMode(gin.TestMode)
	common.UsingSQLite = true
	common.UsingMySQL = false
	common.UsingPostgreSQL = false
	common.RedisEnabled = false

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open sqlite db: %v", err)
	}
	model.DB = db
	model.LOG_DB = db

	if err := db.AutoMigrate(&model.EcomAgentAccount{}); err != nil {
		t.Fatalf("failed to migrate ecomagent account table: %v", err)
	}

	t.Cleanup(func() {
		sqlDB, err := db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	})

	return db
}

func TestCreateEcomAgentAccountAcceptsEmptyStringExpiry(t *testing.T) {
	setupEcomAgentAccountControllerTestDB(t)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/ecomagent/accounts", map[string]any{
		"email":                   "empty-expiry@example.com",
		"password":                "password123",
		"access_token_expires_at": "",
		"base_url":                "https://ecomagent.in",
		"supabase_auth_url":       "https://example.supabase.co/auth/v1",
		"supabase_anon_key":       "anon-key",
	}, 1)

	CreateEcomAgentAccount(ctx)

	response := decodeAPIResponse(t, recorder)
	if !response.Success {
		t.Fatalf("expected success response, got message: %s", response.Message)
	}

	account, err := model.GetEcomAgentAccountByEmail("empty-expiry@example.com")
	if err != nil {
		t.Fatalf("failed to reload account: %v", err)
	}
	if account.AccessTokenExpiresAt != 0 {
		t.Fatalf("expected empty string expiry to be stored as 0, got %d", account.AccessTokenExpiresAt)
	}
}

func TestCreateEcomAgentAccountAcceptsStringExpiry(t *testing.T) {
	setupEcomAgentAccountControllerTestDB(t)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/ecomagent/accounts", map[string]any{
		"email":                   "string-expiry@example.com",
		"password":                "password123",
		"access_token_expires_at": "1775959211",
		"base_url":                "https://ecomagent.in",
		"supabase_auth_url":       "https://example.supabase.co/auth/v1",
		"supabase_anon_key":       "anon-key",
	}, 1)

	CreateEcomAgentAccount(ctx)

	response := decodeAPIResponse(t, recorder)
	if !response.Success {
		t.Fatalf("expected success response, got message: %s", response.Message)
	}

	account, err := model.GetEcomAgentAccountByEmail("string-expiry@example.com")
	if err != nil {
		t.Fatalf("failed to reload account: %v", err)
	}
	if account.AccessTokenExpiresAt != 1775959211 {
		t.Fatalf("expected string expiry to be parsed, got %d", account.AccessTokenExpiresAt)
	}
}

func TestCreateEcomAgentAccountStoresAssignmentFields(t *testing.T) {
	setupEcomAgentAccountControllerTestDB(t)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/ecomagent/accounts", map[string]any{
		"email":                         "assigned@example.com",
		"password":                      "password123",
		"base_url":                      "https://ecomagent.in",
		"supabase_auth_url":             "https://example.supabase.co/auth/v1",
		"supabase_anon_key":             "anon-key",
		"assignment_status":             "assigned",
		"assigned_plan":                 "Claude Mini Plus #1",
		"assigned_channel_id":           "30231",
		"assigned_channel_key_index":    "0",
		"assigned_user_subscription_id": "119",
		"assigned_at":                   "1775959211",
		"tags":                          "sf_dream,已分配",
		"remark":                        "手工绑定渠道",
	}, 1)

	CreateEcomAgentAccount(ctx)

	response := decodeAPIResponse(t, recorder)
	if !response.Success {
		t.Fatalf("expected success response, got message: %s", response.Message)
	}

	account, err := model.GetEcomAgentAccountByEmail("assigned@example.com")
	if err != nil {
		t.Fatalf("failed to reload account: %v", err)
	}
	if account.AssignmentStatus != "assigned" {
		t.Fatalf("expected assignment status to be stored, got %q", account.AssignmentStatus)
	}
	if account.AssignedPlan != "Claude Mini Plus #1" {
		t.Fatalf("expected assigned plan to be stored, got %q", account.AssignedPlan)
	}
	if account.AssignedChannelID != 30231 {
		t.Fatalf("expected assigned channel id 30231, got %d", account.AssignedChannelID)
	}
	if account.AssignedChannelKeyIndex != 0 {
		t.Fatalf("expected assigned channel key index 0, got %d", account.AssignedChannelKeyIndex)
	}
	if account.AssignedUserSubscriptionID != 119 {
		t.Fatalf("expected assigned user subscription id 119, got %d", account.AssignedUserSubscriptionID)
	}
	if account.AssignedAt != 1775959211 {
		t.Fatalf("expected assigned at 1775959211, got %d", account.AssignedAt)
	}
	if account.Tags != "sf_dream,已分配" {
		t.Fatalf("expected tags to be stored, got %q", account.Tags)
	}
	if account.Remark != "手工绑定渠道" {
		t.Fatalf("expected remark to be stored, got %q", account.Remark)
	}
}

func TestUpdateEcomAgentAccountClearsAssignmentFields(t *testing.T) {
	setupEcomAgentAccountControllerTestDB(t)

	account := &model.EcomAgentAccount{
		Email:                      "update-assignment@example.com",
		Password:                   "password123",
		BaseURL:                    "https://ecomagent.in",
		SupabaseAuthURL:            "https://example.supabase.co/auth/v1",
		SupabaseAnonKey:            "anon-key",
		AssignmentStatus:           "assigned",
		AssignedPlan:               "Claude Mini Plus #1",
		AssignedChannelID:          30231,
		AssignedChannelKeyIndex:    1,
		AssignedUserSubscriptionID: 200,
		AssignedAt:                 1775959211,
		Tags:                       "old-tag",
		Remark:                     "old-remark",
	}
	if err := account.Insert(); err != nil {
		t.Fatalf("failed to create seed account: %v", err)
	}

	ctx, recorder := newAuthenticatedContext(t, http.MethodPut, fmt.Sprintf("/api/ecomagent/accounts/%d", account.Id), map[string]any{
		"assignment_status":             "unassigned",
		"assigned_plan":                 "",
		"assigned_channel_id":           "",
		"assigned_channel_key_index":    "",
		"assigned_user_subscription_id": "",
		"assigned_at":                   "",
		"tags":                          "",
		"remark":                        "",
	}, 1)
	ctx.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", account.Id)}}

	UpdateEcomAgentAccount(ctx)

	response := decodeAPIResponse(t, recorder)
	if !response.Success {
		t.Fatalf("expected success response, got message: %s", response.Message)
	}

	reloaded, err := model.GetEcomAgentAccountByID(account.Id)
	if err != nil {
		t.Fatalf("failed to reload account: %v", err)
	}
	if reloaded.AssignmentStatus != "unassigned" {
		t.Fatalf("expected assignment status to be cleared, got %q", reloaded.AssignmentStatus)
	}
	if reloaded.AssignedPlan != "" {
		t.Fatalf("expected assigned plan to be cleared, got %q", reloaded.AssignedPlan)
	}
	if reloaded.AssignedChannelID != 0 {
		t.Fatalf("expected assigned channel id to be cleared, got %d", reloaded.AssignedChannelID)
	}
	if reloaded.AssignedChannelKeyIndex != -1 {
		t.Fatalf("expected assigned channel key index to be reset to -1 when request is empty, got %d", reloaded.AssignedChannelKeyIndex)
	}
	if reloaded.AssignedUserSubscriptionID != 0 {
		t.Fatalf("expected assigned user subscription id to be cleared, got %d", reloaded.AssignedUserSubscriptionID)
	}
	if reloaded.AssignedAt != 0 {
		t.Fatalf("expected assigned at to be cleared, got %d", reloaded.AssignedAt)
	}
	if reloaded.Tags != "" {
		t.Fatalf("expected tags to be cleared, got %q", reloaded.Tags)
	}
	if reloaded.Remark != "" {
		t.Fatalf("expected remark to be cleared, got %q", reloaded.Remark)
	}
}

func TestGetEcomAgentAccountReturnsEditableAuthFields(t *testing.T) {
	setupEcomAgentAccountControllerTestDB(t)

	account := &model.EcomAgentAccount{
		Email:                "editable@example.com",
		Password:             "password123",
		BaseURL:              "https://ecomagent.in",
		SupabaseAuthURL:      "https://example.supabase.co/auth/v1",
		SupabaseAnonKey:      "anon-key",
		AccountID:            "acc-123",
		AccessToken:          "access-token-123456",
		RefreshToken:         "refresh-token-654321",
		AccessTokenExpiresAt: 1775959211,
	}
	if err := account.Insert(); err != nil {
		t.Fatalf("failed to create seed account: %v", err)
	}

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, fmt.Sprintf("/api/ecomagent/accounts/%d/edit", account.Id), nil, 1)
	ctx.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", account.Id)}}

	GetEcomAgentAccount(ctx)

	response := decodeAPIResponse(t, recorder)
	if !response.Success {
		t.Fatalf("expected success response, got message: %s", response.Message)
	}

	dataMap := map[string]any{}
	if err := common.Unmarshal(response.Data, &dataMap); err != nil {
		t.Fatalf("failed to decode response data: %v", err)
	}
	if got := dataMap["access_token"]; got != "access-token-123456" {
		t.Fatalf("expected access token to be returned, got %#v", got)
	}
	if got := dataMap["refresh_token"]; got != "refresh-token-654321" {
		t.Fatalf("expected refresh token to be returned, got %#v", got)
	}
	sessionJSON, _ := dataMap["session_json"].(string)
	if !strings.Contains(sessionJSON, "\"access_token\":\"access-token-123456\"") {
		t.Fatalf("expected session_json to include access token, got %q", sessionJSON)
	}
	if !strings.Contains(sessionJSON, "\"id\":\"acc-123\"") {
		t.Fatalf("expected session_json to include account id, got %q", sessionJSON)
	}
}
