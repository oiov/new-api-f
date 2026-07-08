package model

import (
	"testing"

	"github.com/stretchr/testify/require"
)

// 硬删除用户时应级联清理其 OAuth 绑定，避免遗留绑定影响后续登录/换绑。
func TestHardDeleteUserByIdCascadesOAuthBindings(t *testing.T) {
	truncateTables(t)

	user := &User{Username: "cascade-hard-delete-1", Password: "x"}
	require.NoError(t, DB.Create(user).Error)
	require.NoError(t, DB.Create(&UserOAuthBinding{UserId: user.Id, ProviderId: 1, ProviderUserId: "p1"}).Error)
	require.NoError(t, DB.Create(&UserOAuthBinding{UserId: user.Id, ProviderId: 2, ProviderUserId: "p2"}).Error)

	require.NoError(t, HardDeleteUserById(user.Id))

	var userCount, bindingCount int64
	DB.Model(&User{}).Where("id = ?", user.Id).Count(&userCount)
	DB.Model(&UserOAuthBinding{}).Where("user_id = ?", user.Id).Count(&bindingCount)
	require.Zero(t, userCount, "user row should be hard-deleted")
	require.Zero(t, bindingCount, "oauth bindings should be cascaded")
}

func TestUserHardDeleteCascadesOAuthBindings(t *testing.T) {
	truncateTables(t)

	user := &User{Username: "cascade-hard-delete-2", Password: "x"}
	require.NoError(t, DB.Create(user).Error)
	require.NoError(t, DB.Create(&UserOAuthBinding{UserId: user.Id, ProviderId: 1, ProviderUserId: "px"}).Error)

	require.NoError(t, user.HardDelete())

	var bindingCount int64
	DB.Model(&UserOAuthBinding{}).Where("user_id = ?", user.Id).Count(&bindingCount)
	require.Zero(t, bindingCount, "oauth bindings should be cascaded")
}
