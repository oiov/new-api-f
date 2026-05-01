package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupRegisterInviteTestDB(t *testing.T) {
	t.Helper()

	originalDB := model.DB
	originalInviteRegisterEnabled := common.InviteRegisterEnabled

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.InviteRewardGrant{}))

	model.DB = db
	common.InviteRegisterEnabled = false

	t.Cleanup(func() {
		model.DB = originalDB
		common.InviteRegisterEnabled = originalInviteRegisterEnabled
	})
}

func TestResolveInviteRegistrationUsesOptionalInviteCode(t *testing.T) {
	setupRegisterInviteTestDB(t)

	require.NoError(t, model.DB.Create(&model.User{
		Id:      42,
		AffCode: "Invite42",
		Status:  common.UserStatusEnabled,
	}).Error)

	inviterId, errKey := resolveInviteRegistration(nil, "Invite42")

	require.Empty(t, errKey)
	require.Equal(t, 42, inviterId)
}
