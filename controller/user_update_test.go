package controller

import (
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUpdateUserReturnsUpdatedUserData(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	admin := seedUser(t, db, 1, "root", common.RoleRootUser)
	user := seedUser(t, db, 2, "alice", common.RoleCommonUser)
	require.NoError(t, db.Model(user).Updates(map[string]interface{}{
		"used_quota": 900,
		"aff_count":  7,
	}).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPut, "/api/user/", map[string]any{
		"id":           user.Id,
		"username":     "alice-new",
		"display_name": "Alice New",
		"group":        "vip",
		"quota":        12345,
		"remark":       "important",
		"role":         common.RoleCommonUser,
		"status":       common.UserStatusEnabled,
	}, admin.Id)
	ctx.Set("role", admin.Role)

	UpdateUser(ctx)

	response := decodeAPIResponse(t, recorder)
	require.True(t, response.Success, response.Message)
	var updated model.User
	require.NoError(t, common.Unmarshal(response.Data, &updated))
	assert.Equal(t, user.Id, updated.Id)
	assert.Equal(t, "alice-new", updated.Username)
	assert.Equal(t, "Alice New", updated.DisplayName)
	assert.Equal(t, "vip", updated.Group)
	assert.Equal(t, 12345, updated.Quota)
	assert.Equal(t, "important", updated.Remark)
	assert.Equal(t, 900, updated.UsedQuota)
	assert.Equal(t, 7, updated.AffCount)
	assert.Empty(t, updated.Password)
}

func TestUpdateSelfDisplayNameDoesNotRequireOriginalPassword(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	user := seedUser(t, db, 1, "alice", common.RoleCommonUser)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPut, "/api/user/self", map[string]any{
		"display_name": "Alice New",
	}, user.Id)

	UpdateSelf(ctx)

	response := decodeAPIResponse(t, recorder)
	require.True(t, response.Success, response.Message)

	var updated model.User
	require.NoError(t, db.First(&updated, user.Id).Error)
	assert.Equal(t, "Alice New", updated.DisplayName)
	assert.Equal(t, user.Username, updated.Username)
	assert.Equal(t, user.Password, updated.Password)
}

func TestUpdateSelfPasswordStillRequiresOriginalPassword(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	user := seedUser(t, db, 1, "alice", common.RoleCommonUser)
	hashedPassword, err := common.Password2Hash("old-password")
	require.NoError(t, err)
	require.NoError(t, db.Model(user).Update("password", hashedPassword).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPut, "/api/user/self", map[string]any{
		"original_password": "wrong-password",
		"password":          "new-password",
	}, user.Id)

	UpdateSelf(ctx)

	response := decodeAPIResponse(t, recorder)
	require.False(t, response.Success)
	assert.Contains(t, response.Message, "原密码错误")
}
