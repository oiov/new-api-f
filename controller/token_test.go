package controller

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

type tokenAPIResponse struct {
	Success bool            `json:"success"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

type tokenPageResponse struct {
	Page  int                 `json:"page"`
	Total int                 `json:"total"`
	Items []tokenResponseItem `json:"items"`
}

type tokenResponseItem struct {
	ID              int    `json:"id"`
	UserID          int    `json:"user_id"`
	Username        string `json:"username"`
	Name            string `json:"name"`
	Key             string `json:"key"`
	Source          string `json:"source"`
	Status          int    `json:"status"`
	LastTestAt      int64  `json:"last_test_at"`
	LastTestOK      bool   `json:"last_test_ok"`
	LastTestSummary string `json:"last_test_summary"`
}

type tokenKeyResponse struct {
	Key string `json:"key"`
}

func setupTokenControllerTestDB(t *testing.T) *gorm.DB {
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
	model.InitChannelCache()

	if err := db.AutoMigrate(&model.Token{}); err != nil {
		t.Fatalf("failed to migrate token table: %v", err)
	}
	if err := db.AutoMigrate(&model.User{}); err != nil {
		t.Fatalf("failed to migrate user table: %v", err)
	}
	if err := db.AutoMigrate(&model.Log{}); err != nil {
		t.Fatalf("failed to migrate log table: %v", err)
	}

	t.Cleanup(func() {
		sqlDB, err := db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	})

	return db
}

func seedTokenWithStatus(t *testing.T, db *gorm.DB, userID int, name string, rawKey string, status int) *model.Token {
	t.Helper()

	token := &model.Token{
		UserId:         userID,
		Name:           name,
		Key:            rawKey,
		Status:         status,
		CreatedTime:    1,
		AccessedTime:   1,
		ExpiredTime:    -1,
		RemainQuota:    100,
		UnlimitedQuota: true,
		Group:          "default",
	}
	if err := db.Create(token).Error; err != nil {
		t.Fatalf("failed to create token: %v", err)
	}
	return token
}

func seedToken(t *testing.T, db *gorm.DB, userID int, name string, rawKey string) *model.Token {
	t.Helper()
	return seedTokenWithStatus(t, db, userID, name, rawKey, common.TokenStatusEnabled)
}

func seedUser(t *testing.T, db *gorm.DB, userID int, username string, role int) *model.User {
	t.Helper()

	user := &model.User{
		Id:          userID,
		Username:    username,
		Password:    "password123",
		DisplayName: username,
		Role:        role,
		Status:      common.UserStatusEnabled,
		Group:       "default",
		AffCode:     fmt.Sprintf("aff_%d", userID),
	}
	if err := db.Create(user).Error; err != nil {
		t.Fatalf("failed to create user: %v", err)
	}
	return user
}

func newAuthenticatedContext(t *testing.T, method string, target string, body any, userID int) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()

	var requestBody *bytes.Reader
	if body != nil {
		payload, err := common.Marshal(body)
		if err != nil {
			t.Fatalf("failed to marshal request body: %v", err)
		}
		requestBody = bytes.NewReader(payload)
	} else {
		requestBody = bytes.NewReader(nil)
	}

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(method, target, requestBody)
	if body != nil {
		ctx.Request.Header.Set("Content-Type", "application/json")
	}
	ctx.Set("id", userID)
	return ctx, recorder
}

func decodeAPIResponse(t *testing.T, recorder *httptest.ResponseRecorder) tokenAPIResponse {
	t.Helper()

	var response tokenAPIResponse
	if err := common.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to decode api response: %v", err)
	}
	return response
}

func TestGetAllTokensMasksKeyInResponse(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	token := seedToken(t, db, 1, "list-token", "abcd1234efgh5678")
	seedToken(t, db, 2, "other-user-token", "zzzz1234yyyy5678")

	ctx, recorder := newAuthenticatedContext(t, http.MethodGet, "/api/token/?p=1&size=10", nil, 1)
	GetAllTokens(ctx)

	response := decodeAPIResponse(t, recorder)
	if !response.Success {
		t.Fatalf("expected success response, got message: %s", response.Message)
	}

	var page tokenPageResponse
	if err := common.Unmarshal(response.Data, &page); err != nil {
		t.Fatalf("failed to decode token page response: %v", err)
	}
	if len(page.Items) != 1 {
		t.Fatalf("expected exactly one token, got %d", len(page.Items))
	}
	if page.Items[0].Key != token.GetMaskedKey() {
		t.Fatalf("expected masked key %q, got %q", token.GetMaskedKey(), page.Items[0].Key)
	}
	if strings.Contains(recorder.Body.String(), token.Key) {
		t.Fatalf("list response leaked raw token key: %s", recorder.Body.String())
	}
}

func TestSearchTokensMasksKeyInResponse(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	token := seedToken(t, db, 1, "searchable-token", "ijkl1234mnop5678")

	ctx, recorder := newAuthenticatedContext(t, http.MethodGet, "/api/token/search?keyword=searchable-token&p=1&size=10", nil, 1)
	SearchTokens(ctx)

	response := decodeAPIResponse(t, recorder)
	if !response.Success {
		t.Fatalf("expected success response, got message: %s", response.Message)
	}

	var page tokenPageResponse
	if err := common.Unmarshal(response.Data, &page); err != nil {
		t.Fatalf("failed to decode search response: %v", err)
	}
	if len(page.Items) != 1 {
		t.Fatalf("expected exactly one search result, got %d", len(page.Items))
	}
	if page.Items[0].Key != token.GetMaskedKey() {
		t.Fatalf("expected masked search key %q, got %q", token.GetMaskedKey(), page.Items[0].Key)
	}
	if strings.Contains(recorder.Body.String(), token.Key) {
		t.Fatalf("search response leaked raw token key: %s", recorder.Body.String())
	}
}

func TestSearchTokensSupportsCompositeFilters(t *testing.T) {
	db := setupTokenControllerTestDB(t)

	target := seedTokenWithStatus(t, db, 1, "claude-status", "claude-status-key", common.TokenStatusEnabled)
	target.Group = "claude"
	target.UnlimitedQuota = false
	target.ExpiredTime = common.GetTimestamp() + 3600
	if err := db.Save(target).Error; err != nil {
		t.Fatalf("failed to update target token: %v", err)
	}

	otherStatus := seedTokenWithStatus(t, db, 1, "claude-status", "claude-status-disabled-key", common.TokenStatusDisabled)
	otherStatus.Group = "claude"
	otherStatus.UnlimitedQuota = false
	otherStatus.ExpiredTime = common.GetTimestamp() + 3600
	if err := db.Save(otherStatus).Error; err != nil {
		t.Fatalf("failed to update status token: %v", err)
	}

	otherGroup := seedTokenWithStatus(t, db, 1, "claude-status", "claude-status-default-key", common.TokenStatusEnabled)
	otherGroup.Group = "default"
	otherGroup.UnlimitedQuota = false
	otherGroup.ExpiredTime = common.GetTimestamp() + 3600
	if err := db.Save(otherGroup).Error; err != nil {
		t.Fatalf("failed to update group token: %v", err)
	}

	expiredToken := seedTokenWithStatus(t, db, 1, "claude-status", "claude-status-expired-key", common.TokenStatusEnabled)
	expiredToken.Group = "claude"
	expiredToken.UnlimitedQuota = false
	expiredToken.ExpiredTime = common.GetTimestamp() - 3600
	if err := db.Save(expiredToken).Error; err != nil {
		t.Fatalf("failed to update expired token: %v", err)
	}

	unlimitedToken := seedTokenWithStatus(t, db, 1, "claude-status", "claude-status-unlimited-key", common.TokenStatusEnabled)
	unlimitedToken.Group = "claude"
	unlimitedToken.UnlimitedQuota = true
	unlimitedToken.ExpiredTime = common.GetTimestamp() + 3600
	if err := db.Save(unlimitedToken).Error; err != nil {
		t.Fatalf("failed to update unlimited token: %v", err)
	}

	otherUser := seedTokenWithStatus(t, db, 2, "claude-status", "other-user-key", common.TokenStatusEnabled)
	otherUser.Group = "claude"
	otherUser.UnlimitedQuota = false
	otherUser.ExpiredTime = common.GetTimestamp() + 3600
	if err := db.Save(otherUser).Error; err != nil {
		t.Fatalf("failed to update other user token: %v", err)
	}

	ctx, recorder := newAuthenticatedContext(
		t,
		http.MethodGet,
		"/api/token/search?keyword=claude-status&status=1&group=claude&expired_state=not_expired&unlimited_state=limited&p=1&size=10",
		nil,
		1,
	)
	SearchTokens(ctx)

	response := decodeAPIResponse(t, recorder)
	if !response.Success {
		t.Fatalf("expected success response, got message: %s", response.Message)
	}

	var page tokenPageResponse
	if err := common.Unmarshal(response.Data, &page); err != nil {
		t.Fatalf("failed to decode composite search response: %v", err)
	}
	if page.Total != 1 || len(page.Items) != 1 {
		t.Fatalf("expected exactly one composite search result, got total=%d items=%d", page.Total, len(page.Items))
	}
	if page.Items[0].ID != target.Id {
		t.Fatalf("expected target token, got %+v", page.Items[0])
	}
}

func TestAddTokenAcceptsMultipleAuthorizedGroups(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	seedUser(t, db, 1, "multi-group-user", common.RoleCommonUser)
	oldUserUsableGroups := setting.UserUsableGroups2JSONString()
	oldGroupRatio := ratio_setting.GroupRatio2JSONString()
	if err := setting.UpdateUserUsableGroupsByJSONString(`{"default":"默认分组","vip":"VIP"}`); err != nil {
		t.Fatalf("failed to set usable groups: %v", err)
	}
	if err := ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"vip":1}`); err != nil {
		t.Fatalf("failed to set group ratios: %v", err)
	}
	t.Cleanup(func() {
		_ = setting.UpdateUserUsableGroupsByJSONString(oldUserUsableGroups)
		_ = ratio_setting.UpdateGroupRatioByJSONString(oldGroupRatio)
	})

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/token/", map[string]any{
		"name":            "multi-group-token",
		"expired_time":    -1,
		"unlimited_quota": true,
		"group":           "default,vip,default",
	}, 1)
	AddToken(ctx)

	response := decodeAPIResponse(t, recorder)
	if !response.Success {
		t.Fatalf("expected success response, got message: %s", response.Message)
	}

	var token model.Token
	if err := db.Where("user_id = ? AND name = ?", 1, "multi-group-token").First(&token).Error; err != nil {
		t.Fatalf("failed to load created token: %v", err)
	}
	if token.Group != "default,vip" {
		t.Fatalf("expected normalized group default,vip, got %q", token.Group)
	}
}

func TestRotateTokenByAdmin_UsesStableTokenSource(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	seedUser(t, db, 1, "admin", common.RoleRootUser)
	seedUser(t, db, 2, "sub-user", common.RoleCommonUser)

	token := seedToken(t, db, 2, model.SubscriptionAggregateAccessTokenName, "rotate-source-key-0001")
	token.Source = model.TokenSourceSubscriptionAggregateAccess
	if err := db.Save(token).Error; err != nil {
		t.Fatalf("failed to update token source: %v", err)
	}

	ctx, recorder := newAuthenticatedContext(
		t,
		http.MethodPost,
		fmt.Sprintf("/api/token/admin/%d/rotate", token.Id),
		map[string]any{"notify_user": false},
		1,
	)
	ctx.Params = gin.Params{{Key: "id", Value: strconv.Itoa(token.Id)}}

	RotateTokenByAdmin(ctx)

	response := decodeAPIResponse(t, recorder)
	if !response.Success {
		t.Fatalf("expected success response, got message: %s", response.Message)
	}

	var data map[string]any
	if err := common.Unmarshal(response.Data, &data); err != nil {
		t.Fatalf("failed to decode rotate response: %v", err)
	}
	if data["action_label"] != "重新签发" {
		t.Fatalf("expected action label reissue, got %#v", data["action_label"])
	}
	if data["token_source"] != "subscription_delivery" {
		t.Fatalf("expected token source subscription_delivery, got %#v", data["token_source"])
	}
	if data["is_system_issued"] != true {
		t.Fatalf("expected system issued token, got %#v", data["is_system_issued"])
	}
}

func TestGetTokenMasksKeyInResponse(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	token := seedToken(t, db, 1, "detail-token", "qrst1234uvwx5678")

	ctx, recorder := newAuthenticatedContext(t, http.MethodGet, "/api/token/"+strconv.Itoa(token.Id), nil, 1)
	ctx.Params = gin.Params{{Key: "id", Value: strconv.Itoa(token.Id)}}
	GetToken(ctx)

	response := decodeAPIResponse(t, recorder)
	if !response.Success {
		t.Fatalf("expected success response, got message: %s", response.Message)
	}

	var detail tokenResponseItem
	if err := common.Unmarshal(response.Data, &detail); err != nil {
		t.Fatalf("failed to decode token detail response: %v", err)
	}
	if detail.Key != token.GetMaskedKey() {
		t.Fatalf("expected masked detail key %q, got %q", token.GetMaskedKey(), detail.Key)
	}
	if strings.Contains(recorder.Body.String(), token.Key) {
		t.Fatalf("detail response leaked raw token key: %s", recorder.Body.String())
	}
}

func TestUpdateTokenMasksKeyInResponse(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	token := seedToken(t, db, 1, "editable-token", "yzab1234cdef5678")

	body := map[string]any{
		"id":                   token.Id,
		"name":                 "updated-token",
		"expired_time":         -1,
		"remain_quota":         100,
		"unlimited_quota":      true,
		"model_limits_enabled": false,
		"model_limits":         "",
		"group":                "default",
		"cross_group_retry":    false,
	}

	ctx, recorder := newAuthenticatedContext(t, http.MethodPut, "/api/token/", body, 1)
	UpdateToken(ctx)

	response := decodeAPIResponse(t, recorder)
	if !response.Success {
		t.Fatalf("expected success response, got message: %s", response.Message)
	}

	var detail tokenResponseItem
	if err := common.Unmarshal(response.Data, &detail); err != nil {
		t.Fatalf("failed to decode token update response: %v", err)
	}
	if detail.Key != token.GetMaskedKey() {
		t.Fatalf("expected masked update key %q, got %q", token.GetMaskedKey(), detail.Key)
	}
	if strings.Contains(recorder.Body.String(), token.Key) {
		t.Fatalf("update response leaked raw token key: %s", recorder.Body.String())
	}
}

func TestGetTokenKeyRequiresOwnershipAndReturnsFullKey(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	token := seedToken(t, db, 1, "owned-token", "owner1234token5678")

	authorizedCtx, authorizedRecorder := newAuthenticatedContext(t, http.MethodPost, "/api/token/"+strconv.Itoa(token.Id)+"/key", nil, 1)
	authorizedCtx.Params = gin.Params{{Key: "id", Value: strconv.Itoa(token.Id)}}
	GetTokenKey(authorizedCtx)

	authorizedResponse := decodeAPIResponse(t, authorizedRecorder)
	if !authorizedResponse.Success {
		t.Fatalf("expected authorized key fetch to succeed, got message: %s", authorizedResponse.Message)
	}

	var keyData tokenKeyResponse
	if err := common.Unmarshal(authorizedResponse.Data, &keyData); err != nil {
		t.Fatalf("failed to decode token key response: %v", err)
	}
	if keyData.Key != token.GetFullKey() {
		t.Fatalf("expected full key %q, got %q", token.GetFullKey(), keyData.Key)
	}

	unauthorizedCtx, unauthorizedRecorder := newAuthenticatedContext(t, http.MethodPost, "/api/token/"+strconv.Itoa(token.Id)+"/key", nil, 2)
	unauthorizedCtx.Params = gin.Params{{Key: "id", Value: strconv.Itoa(token.Id)}}
	GetTokenKey(unauthorizedCtx)

	unauthorizedResponse := decodeAPIResponse(t, unauthorizedRecorder)
	if unauthorizedResponse.Success {
		t.Fatalf("expected unauthorized key fetch to fail")
	}
	if strings.Contains(unauthorizedRecorder.Body.String(), token.Key) {
		t.Fatalf("unauthorized key response leaked raw token key: %s", unauthorizedRecorder.Body.String())
	}
}

func TestDeleteInvalidTokenBatchDeletesAllFilteredInvalidTokens(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	seedTokenWithStatus(t, db, 1, "expired-a", "expired-a-key", common.TokenStatusExpired)
	seedTokenWithStatus(t, db, 1, "expired-b", "expired-b-key", common.TokenStatusExhausted)
	lazyExpired := seedToken(t, db, 1, "expired-c", "expired-c-key")
	lazyExpired.ExpiredTime = common.GetTimestamp() - 60
	if err := db.Save(lazyExpired).Error; err != nil {
		t.Fatalf("failed to update lazy expired token: %v", err)
	}
	lazyExhausted := seedToken(t, db, 1, "expired-d", "expired-d-key")
	lazyExhausted.UnlimitedQuota = false
	lazyExhausted.RemainQuota = 0
	if err := db.Save(lazyExhausted).Error; err != nil {
		t.Fatalf("failed to update lazy exhausted token: %v", err)
	}
	seedToken(t, db, 1, "enabled-a", "enabled-a-key")
	seedTokenWithStatus(t, db, 1, "other-name", "other-name-key", common.TokenStatusDisabled)
	seedTokenWithStatus(t, db, 2, "expired-a", "other-user-expired-key", common.TokenStatusExpired)

	body := map[string]any{
		"keyword":         "expired%",
		"token":           "",
		"group":           "default",
		"unlimited_state": "limited",
	}
	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/token/batch/invalid", body, 1)
	DeleteInvalidTokenBatch(ctx)

	response := decodeAPIResponse(t, recorder)
	if !response.Success {
		t.Fatalf("expected success response, got message: %s", response.Message)
	}

	var deletedCount int
	if err := common.Unmarshal(response.Data, &deletedCount); err != nil {
		t.Fatalf("failed to decode delete count: %v", err)
	}
	if deletedCount != 1 {
		t.Fatalf("expected 1 deleted token, got %d", deletedCount)
	}

	var remaining []model.Token
	if err := db.Order("id asc").Find(&remaining).Error; err != nil {
		t.Fatalf("failed to query remaining tokens: %v", err)
	}
	if len(remaining) != 6 {
		t.Fatalf("expected 6 remaining tokens, got %d", len(remaining))
	}
	for _, token := range remaining {
		if token.UserId == 1 && token.Name == "expired-d" {
			t.Fatalf("filtered invalid token should have been deleted: %+v", token)
		}
	}
}

func TestGetAllTokensByAdminReturnsAllUsersWithMaskedKeys(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	admin := seedUser(t, db, 100, "admin", common.RoleAdminUser)
	userA := seedUser(t, db, 1, "alice", common.RoleCommonUser)
	userB := seedUser(t, db, 2, "bob", common.RoleCommonUser)
	tokenA := seedToken(t, db, userA.Id, "alice-token", "alice1234token5678")
	tokenB := seedToken(t, db, userB.Id, "bob-token", "bob1234token5678")

	ctx, recorder := newAuthenticatedContext(t, http.MethodGet, "/api/token/admin?p=1&size=10", nil, admin.Id)
	GetAllTokensByAdmin(ctx)

	response := decodeAPIResponse(t, recorder)
	if !response.Success {
		t.Fatalf("expected success response, got message: %s", response.Message)
	}

	var page tokenPageResponse
	if err := common.Unmarshal(response.Data, &page); err != nil {
		t.Fatalf("failed to decode admin token page response: %v", err)
	}
	if page.Total != 2 {
		t.Fatalf("expected total 2, got %d", page.Total)
	}
	if len(page.Items) != 2 {
		t.Fatalf("expected 2 tokens, got %d", len(page.Items))
	}
	if page.Items[0].Username != userB.Username || page.Items[0].UserID != userB.Id {
		t.Fatalf("expected newest token to belong to bob, got %+v", page.Items[0])
	}
	if page.Items[1].Username != userA.Username || page.Items[1].UserID != userA.Id {
		t.Fatalf("expected older token to belong to alice, got %+v", page.Items[1])
	}
	if page.Items[0].Key != tokenB.GetMaskedKey() || page.Items[1].Key != tokenA.GetMaskedKey() {
		t.Fatalf("expected masked keys, got %+v", page.Items)
	}
	if strings.Contains(recorder.Body.String(), tokenA.Key) || strings.Contains(recorder.Body.String(), tokenB.Key) {
		t.Fatalf("admin list response leaked raw token key: %s", recorder.Body.String())
	}
}

func TestGetAllTokensByAdminReturnsPersistedLastTestResult(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	admin := seedUser(t, db, 100, "admin", common.RoleAdminUser)
	user := seedUser(t, db, 1, "alice", common.RoleCommonUser)
	token := seedToken(t, db, user.Id, "alice-token", "alice1234token5678")
	token.LastTestAt = 1710000000
	token.LastTestOK = true
	token.LastTestSummary = `{"mode":"both","results":[{"kind":"claude","path":"/v1/messages","model":"claude-opus-4-6","http_code":200,"ok":true}]}`
	if err := db.Model(&model.Token{}).
		Where("id = ?", token.Id).
		Updates(map[string]interface{}{
			"last_test_at":      token.LastTestAt,
			"last_test_ok":      token.LastTestOK,
			"last_test_summary": token.LastTestSummary,
		}).Error; err != nil {
		t.Fatalf("failed to persist last test result: %v", err)
	}

	ctx, recorder := newAuthenticatedContext(t, http.MethodGet, "/api/token/admin?p=1&size=10", nil, admin.Id)
	GetAllTokensByAdmin(ctx)

	response := decodeAPIResponse(t, recorder)
	if !response.Success {
		t.Fatalf("expected success response, got message: %s", response.Message)
	}

	var page tokenPageResponse
	if err := common.Unmarshal(response.Data, &page); err != nil {
		t.Fatalf("failed to decode admin token page response: %v", err)
	}
	if len(page.Items) != 1 {
		t.Fatalf("expected 1 token, got %d", len(page.Items))
	}
	if page.Items[0].LastTestAt != token.LastTestAt {
		t.Fatalf("expected last_test_at %d, got %d", token.LastTestAt, page.Items[0].LastTestAt)
	}
	if !page.Items[0].LastTestOK {
		t.Fatalf("expected last_test_ok to be true")
	}
	if page.Items[0].LastTestSummary != token.LastTestSummary {
		t.Fatalf("expected last_test_summary %q, got %q", token.LastTestSummary, page.Items[0].LastTestSummary)
	}
}

func TestSearchTokensByAdminSupportsUsernameTokenAndPagination(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	admin := seedUser(t, db, 100, "admin", common.RoleAdminUser)
	userA := seedUser(t, db, 1, "alice", common.RoleCommonUser)
	userB := seedUser(t, db, 2, "bob", common.RoleCommonUser)
	seedToken(t, db, userA.Id, "alice-first", "alice-first-key-1234")
	target := seedToken(t, db, userA.Id, "alice-second", "alice-second-key-5678")
	seedToken(t, db, userB.Id, "bob-only", "bob-only-key-9999")

	ctx, recorder := newAuthenticatedContext(
		t,
		http.MethodGet,
		"/api/token/admin/search?username=alice&token=alice-second-key-5678&p=1&size=1",
		nil,
		admin.Id,
	)
	SearchTokensByAdmin(ctx)

	response := decodeAPIResponse(t, recorder)
	if !response.Success {
		t.Fatalf("expected success response, got message: %s", response.Message)
	}

	var page tokenPageResponse
	if err := common.Unmarshal(response.Data, &page); err != nil {
		t.Fatalf("failed to decode admin search token page response: %v", err)
	}
	if page.Page != 1 {
		t.Fatalf("expected page 1, got %d", page.Page)
	}
	if page.Total != 1 {
		t.Fatalf("expected total 1, got %d", page.Total)
	}
	if len(page.Items) != 1 {
		t.Fatalf("expected 1 token, got %d", len(page.Items))
	}
	if page.Items[0].ID != target.Id || page.Items[0].Username != userA.Username {
		t.Fatalf("expected alice-second token, got %+v", page.Items[0])
	}
	if page.Items[0].Key != target.GetMaskedKey() {
		t.Fatalf("expected masked key %q, got %q", target.GetMaskedKey(), page.Items[0].Key)
	}
	if strings.Contains(recorder.Body.String(), target.Key) {
		t.Fatalf("admin search response leaked raw token key: %s", recorder.Body.String())
	}
}

func TestSearchTokensByAdminSupportsCompositeFilters(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	admin := seedUser(t, db, 100, "admin", common.RoleAdminUser)
	userA := seedUser(t, db, 1, "alice", common.RoleCommonUser)
	userB := seedUser(t, db, 2, "bob", common.RoleCommonUser)

	target := seedTokenWithStatus(t, db, userA.Id, "alpha-token", "alpha-token-key-1234", common.TokenStatusEnabled)
	target.Group = "vip"
	target.CreatedTime = 200
	target.ExpiredTime = common.GetTimestamp() + 3600
	if err := db.Save(target).Error; err != nil {
		t.Fatalf("failed to update target token: %v", err)
	}

	otherStatus := seedTokenWithStatus(t, db, userA.Id, "alpha-token", "alpha-token-key-2222", common.TokenStatusDisabled)
	otherStatus.Group = "vip"
	otherStatus.CreatedTime = 200
	if err := db.Save(otherStatus).Error; err != nil {
		t.Fatalf("failed to update otherStatus token: %v", err)
	}

	otherGroup := seedTokenWithStatus(t, db, userA.Id, "alpha-token", "alpha-token-key-3333", common.TokenStatusEnabled)
	otherGroup.Group = "default"
	otherGroup.CreatedTime = 200
	if err := db.Save(otherGroup).Error; err != nil {
		t.Fatalf("failed to update otherGroup token: %v", err)
	}

	expiredToken := seedTokenWithStatus(t, db, userA.Id, "alpha-token", "alpha-token-key-4444", common.TokenStatusEnabled)
	expiredToken.Group = "vip"
	expiredToken.CreatedTime = 200
	expiredToken.ExpiredTime = common.GetTimestamp() - 3600
	if err := db.Save(expiredToken).Error; err != nil {
		t.Fatalf("failed to update expired token: %v", err)
	}

	otherUser := seedTokenWithStatus(t, db, userB.Id, "alpha-token", "alpha-token-key-5555", common.TokenStatusEnabled)
	otherUser.Group = "vip"
	otherUser.CreatedTime = 200
	if err := db.Save(otherUser).Error; err != nil {
		t.Fatalf("failed to update otherUser token: %v", err)
	}

	ctx, recorder := newAuthenticatedContext(
		t,
		http.MethodGet,
		"/api/token/admin/search?username=alice&token_name=alpha-token&status=1&group=vip&expired_state=not_expired&start_timestamp=150&end_timestamp=250&p=1&size=10",
		nil,
		admin.Id,
	)
	SearchTokensByAdmin(ctx)

	response := decodeAPIResponse(t, recorder)
	if !response.Success {
		t.Fatalf("expected success response, got message: %s", response.Message)
	}

	var page tokenPageResponse
	if err := common.Unmarshal(response.Data, &page); err != nil {
		t.Fatalf("failed to decode composite admin search response: %v", err)
	}
	if page.Total != 1 || len(page.Items) != 1 {
		t.Fatalf("expected exactly one composite search result, got total=%d items=%d", page.Total, len(page.Items))
	}
	if page.Items[0].ID != target.Id || page.Items[0].Username != userA.Username {
		t.Fatalf("expected target token, got %+v", page.Items[0])
	}
}
