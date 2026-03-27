package controller

import (
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func countInviteRegistrations(inviterId int) (int64, error) {
	query := model.DB.Model(&model.User{}).Where("inviter_id = ?", inviterId)
	if common.InviteRewardLimitWindowMinutes > 0 {
		windowStart := time.Now().
			Add(-time.Duration(common.InviteRewardLimitWindowMinutes) * time.Minute).
			Unix()
		query = query.Where("created_at >= ?", windowStart)
	}
	var count int64
	err := query.Count(&count).Error
	return count, err
}

func resolveInviteRegistration(c *gin.Context, affCode string) (int, string) {
	if !common.InviteRegisterEnabled {
		return 0, ""
	}

	trimmedCode := strings.TrimSpace(affCode)
	if trimmedCode == "" {
		return 0, i18n.MsgUserInviteCodeRequired
	}

	inviterId, err := model.GetUserIdByAffCode(trimmedCode)
	if err != nil || inviterId <= 0 {
		return 0, i18n.MsgUserInviteCodeInvalid
	}
	if common.InviteRewardMaxCountPerInviter > 0 {
		count, countErr := countInviteRegistrations(inviterId)
		if countErr != nil {
			return 0, i18n.MsgDatabaseError
		}
		if count >= int64(common.InviteRewardMaxCountPerInviter) {
			return 0, i18n.MsgUserInviteCodeUsageLimitReached
		}
	}

	return inviterId, ""
}
