package model

import (
	"errors"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestValidateUserTokenReturnsGenericSentinelForInvalidStates(t *testing.T) {
	truncateTables(t)
	common.RedisEnabled = false

	token := &Token{
		UserId:         101,
		Name:           "exhausted",
		Key:            "generic-invalid-token",
		Status:         common.TokenStatusExhausted,
		CreatedTime:    1,
		AccessedTime:   1,
		ExpiredTime:    -1,
		RemainQuota:    0,
		UnlimitedQuota: false,
	}
	require.NoError(t, DB.Create(token).Error)

	_, err := ValidateUserToken(token.Key)

	require.ErrorIs(t, err, ErrTokenInvalid)
	require.NotContains(t, err.Error(), "TokenStatusExhausted")
	require.NotContains(t, err.Error(), token.Key)
	require.NotContains(t, err.Error(), "generic-invalid-token")
}

func TestValidateAccessTokenDistinguishesMissingFromDatabaseErrors(t *testing.T) {
	truncateTables(t)

	user, err := ValidateAccessToken("Bearer missing-access-token")
	require.NoError(t, err)
	require.Nil(t, user)

	invalidDB, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	originalDB := DB
	DB = invalidDB
	t.Cleanup(func() { DB = originalDB })

	user, err = ValidateAccessToken("Bearer missing-access-token")

	require.Nil(t, user)
	require.ErrorIs(t, err, ErrDatabase)
}

func TestValidateAndFillReturnsSentinelErrors(t *testing.T) {
	truncateTables(t)

	user := &User{Username: "", Password: ""}
	err := user.ValidateAndFill()
	require.ErrorIs(t, err, ErrUserEmptyCredentials)

	user = &User{Username: "missing", Password: "password123"}
	err = user.ValidateAndFill()
	require.ErrorIs(t, err, ErrInvalidCredentials)
	require.False(t, errors.Is(err, gorm.ErrRecordNotFound))
}

func TestInvalidateUserTokensCacheDeletesAllUserTokenCaches(t *testing.T) {
	truncateTables(t)
	common.RedisEnabled = false

	err := InvalidateUserTokensCache(42)

	require.NoError(t, err)
}
