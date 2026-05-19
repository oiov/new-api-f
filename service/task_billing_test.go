package service

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestMain(m *testing.M) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		panic("failed to open test db: " + err.Error())
	}
	sqlDB, err := db.DB()
	if err != nil {
		panic("failed to get sql.DB: " + err.Error())
	}
	sqlDB.SetMaxOpenConns(1)

	model.DB = db
	model.LOG_DB = db

	common.UsingSQLite = true
	common.RedisEnabled = false
	common.BatchUpdateEnabled = false
	common.LogConsumeEnabled = true

	if err := db.AutoMigrate(
		&model.Task{},
		&model.User{},
		&model.Token{},
		&model.Log{},
		&model.Channel{},
		&model.Model{},
		&model.Vendor{},
		&model.SubscriptionPlan{},
		&model.UserSubscription{},
		&model.SubscriptionPreConsumeRecord{},
	); err != nil {
		panic("failed to migrate: " + err.Error())
	}

	os.Exit(m.Run())
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

func truncate(t *testing.T) {
	t.Helper()
	t.Cleanup(func() {
		model.DB.Exec("DELETE FROM tasks")
		model.DB.Exec("DELETE FROM users")
		model.DB.Exec("DELETE FROM tokens")
		model.DB.Exec("DELETE FROM logs")
		model.DB.Exec("DELETE FROM channels")
		model.DB.Exec("DELETE FROM models")
		model.DB.Exec("DELETE FROM vendors")
		model.DB.Exec("DELETE FROM subscription_pre_consume_records")
		model.DB.Exec("DELETE FROM subscription_plans")
		model.DB.Exec("DELETE FROM user_subscriptions")
	})
}

func seedUser(t *testing.T, id int, quota int) {
	t.Helper()
	user := &model.User{Id: id, Username: "test_user", Quota: quota, Status: common.UserStatusEnabled}
	require.NoError(t, model.DB.Create(user).Error)
}

func seedToken(t *testing.T, id int, userId int, key string, remainQuota int) {
	t.Helper()
	token := &model.Token{
		Id:          id,
		UserId:      userId,
		Key:         key,
		Name:        "test_token",
		Status:      common.TokenStatusEnabled,
		RemainQuota: remainQuota,
		UsedQuota:   0,
	}
	require.NoError(t, model.DB.Create(token).Error)
}

func seedSubscription(t *testing.T, id int, userId int, amountTotal int64, amountUsed int64) {
	t.Helper()
	sub := &model.UserSubscription{
		Id:          id,
		UserId:      userId,
		AmountTotal: amountTotal,
		AmountUsed:  amountUsed,
		Status:      "active",
		StartTime:   time.Now().Unix(),
		EndTime:     time.Now().Add(30 * 24 * time.Hour).Unix(),
	}
	require.NoError(t, model.DB.Create(sub).Error)
}

func seedRequestCountSubscription(t *testing.T, id int, userId int, total int64, used int64) {
	t.Helper()
	seedSubscriptionPlan(t, id, model.SubscriptionResourceRequestCount)
	sub := &model.UserSubscription{
		Id:                id,
		UserId:            userId,
		PlanId:            id,
		ResourceType:      model.SubscriptionResourceRequestCount,
		RequestCountTotal: total,
		RequestCountUsed:  used,
		Status:            "active",
		StartTime:         time.Now().Unix(),
		EndTime:           time.Now().Add(30 * 24 * time.Hour).Unix(),
	}
	require.NoError(t, model.DB.Create(sub).Error)
}

func seedDualLimitSubscription(t *testing.T, id int, userId int, amountTotal int64, amountUsed int64, countTotal int64, countUsed int64, resourceType string) {
	t.Helper()
	seedSubscriptionPlan(t, id, resourceType)
	sub := &model.UserSubscription{
		Id:                id,
		UserId:            userId,
		PlanId:            id,
		ResourceType:      resourceType,
		AmountTotal:       amountTotal,
		AmountUsed:        amountUsed,
		RequestCountTotal: countTotal,
		RequestCountUsed:  countUsed,
		Status:            "active",
		StartTime:         time.Now().Unix(),
		EndTime:           time.Now().Add(30 * 24 * time.Hour).Unix(),
	}
	require.NoError(t, model.DB.Create(sub).Error)
}

func seedSubscriptionPlan(t *testing.T, id int, resourceType string) {
	t.Helper()
	plan := &model.SubscriptionPlan{
		Id:                id,
		Title:             "test_plan",
		PriceAmount:       1,
		Currency:          "USD",
		DurationUnit:      model.SubscriptionDurationMonth,
		DurationValue:     1,
		Enabled:           true,
		TotalAmount:       100000,
		ResourceType:      resourceType,
		RequestCountTotal: 100,
	}
	require.NoError(t, model.DB.Create(plan).Error)
}

func seedChannel(t *testing.T, id int) {
	t.Helper()
	ch := &model.Channel{Id: id, Name: "test_channel", Key: "sk-test", Status: common.ChannelStatusEnabled}
	require.NoError(t, model.DB.Create(ch).Error)
}

func makeTask(userId, channelId, quota, tokenId int, billingSource string, subscriptionId int) *model.Task {
	return &model.Task{
		TaskID:    "task_" + time.Now().Format("150405.000"),
		UserId:    userId,
		ChannelId: channelId,
		Quota:     quota,
		Status:    model.TaskStatus(model.TaskStatusInProgress),
		Group:     "default",
		Data:      json.RawMessage(`{}`),
		CreatedAt: time.Now().Unix(),
		UpdatedAt: time.Now().Unix(),
		Properties: model.Properties{
			OriginModelName: "test-model",
		},
		PrivateData: model.TaskPrivateData{
			BillingSource:  billingSource,
			SubscriptionId: subscriptionId,
			TokenId:        tokenId,
			BillingContext: &model.TaskBillingContext{
				ModelPrice:      0.02,
				GroupRatio:      1.0,
				OriginModelName: "test-model",
			},
		},
	}
}

// ---------------------------------------------------------------------------
// Read-back helpers
// ---------------------------------------------------------------------------

func getUserQuota(t *testing.T, id int) int {
	t.Helper()
	var user model.User
	require.NoError(t, model.DB.Select("quota").Where("id = ?", id).First(&user).Error)
	return user.Quota
}

func getTokenRemainQuota(t *testing.T, id int) int {
	t.Helper()
	var token model.Token
	require.NoError(t, model.DB.Select("remain_quota").Where("id = ?", id).First(&token).Error)
	return token.RemainQuota
}

func getTokenUsedQuota(t *testing.T, id int) int {
	t.Helper()
	var token model.Token
	require.NoError(t, model.DB.Select("used_quota").Where("id = ?", id).First(&token).Error)
	return token.UsedQuota
}

func getSubscriptionUsed(t *testing.T, id int) int64 {
	t.Helper()
	var sub model.UserSubscription
	require.NoError(t, model.DB.Select("amount_used").Where("id = ?", id).First(&sub).Error)
	return sub.AmountUsed
}

func getSubscriptionRequestCountUsed(t *testing.T, id int) int64 {
	t.Helper()
	var sub model.UserSubscription
	require.NoError(t, model.DB.Select("request_count_used").Where("id = ?", id).First(&sub).Error)
	return sub.RequestCountUsed
}

func getChannelUsage(t *testing.T, id int) (int64, int64) {
	t.Helper()
	var ch model.Channel
	require.NoError(t, model.DB.Select("used_quota", "used_count").Where("id = ?", id).First(&ch).Error)
	return ch.UsedQuota, ch.UsedCount
}

func getLastLog(t *testing.T) *model.Log {
	t.Helper()
	var log model.Log
	err := model.LOG_DB.Order("id desc").First(&log).Error
	if err != nil {
		return nil
	}
	return &log
}

func countLogs(t *testing.T) int64 {
	t.Helper()
	var count int64
	model.LOG_DB.Model(&model.Log{}).Count(&count)
	return count
}

// ===========================================================================
// RefundTaskQuota tests
// ===========================================================================

func TestRefundTaskQuota_Wallet(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, tokenID, channelID = 1, 1, 1
	const initQuota, preConsumed = 10000, 3000
	const tokenRemain = 5000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-test-key", tokenRemain)
	seedChannel(t, channelID)

	task := makeTask(userID, channelID, preConsumed, tokenID, BillingSourceWallet, 0)

	RefundTaskQuota(ctx, task, "task failed: upstream error")

	// User quota should increase by preConsumed
	assert.Equal(t, initQuota+preConsumed, getUserQuota(t, userID))

	// Token remain_quota should increase, used_quota should decrease
	assert.Equal(t, tokenRemain+preConsumed, getTokenRemainQuota(t, tokenID))
	assert.Equal(t, -preConsumed, getTokenUsedQuota(t, tokenID))

	// A refund log should be created
	log := getLastLog(t)
	require.NotNil(t, log)
	assert.Equal(t, model.LogTypeRefund, log.Type)
	assert.Equal(t, preConsumed, log.Quota)
	assert.Equal(t, "test-model", log.ModelName)
}

func TestRefundTaskQuota_Subscription(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, tokenID, channelID, subID = 2, 2, 2, 1
	const preConsumed = 2000
	const subTotal, subUsed int64 = 100000, 50000
	const tokenRemain = 8000

	seedUser(t, userID, 0)
	seedToken(t, tokenID, userID, "sk-sub-key", tokenRemain)
	seedChannel(t, channelID)
	seedSubscription(t, subID, userID, subTotal, subUsed)

	task := makeTask(userID, channelID, preConsumed, tokenID, BillingSourceSubscription, subID)

	RefundTaskQuota(ctx, task, "subscription task failed")

	// Subscription used should decrease by preConsumed
	assert.Equal(t, subUsed-int64(preConsumed), getSubscriptionUsed(t, subID))

	// Token should also be refunded
	assert.Equal(t, tokenRemain+preConsumed, getTokenRemainQuota(t, tokenID))

	log := getLastLog(t)
	require.NotNil(t, log)
	assert.Equal(t, model.LogTypeRefund, log.Type)
}

func TestRefundTaskQuota_RequestCountSubscription(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, tokenID, channelID, subID = 21, 21, 21, 21
	const requestUsed int64 = 5
	const tokenRemain = 8000

	seedUser(t, userID, 0)
	seedToken(t, tokenID, userID, "sk-sub-request-count", tokenRemain)
	seedChannel(t, channelID)
	seedRequestCountSubscription(t, subID, userID, 100, requestUsed)

	task := makeTask(userID, channelID, 4800, tokenID, BillingSourceSubscription, subID)
	task.PrivateData.SubscriptionResourceType = model.SubscriptionResourceRequestCount
	task.PrivateData.SubscriptionPreConsumed = 1

	RefundTaskQuota(ctx, task, "request_count task failed")

	assert.Equal(t, requestUsed-1, getSubscriptionRequestCountUsed(t, subID))
	assert.Equal(t, tokenRemain, getTokenRemainQuota(t, tokenID))

	log := getLastLog(t)
	require.NotNil(t, log)
	assert.Equal(t, model.LogTypeRefund, log.Type)
	assert.Equal(t, 1, log.Quota)
}

func TestRefundTaskQuota_ZeroQuota(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID = 3
	seedUser(t, userID, 5000)

	task := makeTask(userID, 0, 0, 0, BillingSourceWallet, 0)

	RefundTaskQuota(ctx, task, "zero quota task")

	// No change to user quota
	assert.Equal(t, 5000, getUserQuota(t, userID))

	// No log created
	assert.Equal(t, int64(0), countLogs(t))
}

func TestPreConsumeUserSubscription_PrefersEarliestRequestCountThenQuota(t *testing.T) {
	truncate(t)

	const userID = 10
	seedUser(t, userID, 10000)

	seedSubscriptionPlan(t, 101, model.SubscriptionResourceQuota)
	seedSubscriptionPlan(t, 102, model.SubscriptionResourceRequestCount)
	seedSubscriptionPlan(t, 103, model.SubscriptionResourceRequestCount)

	now := time.Now()
	quotaSub := &model.UserSubscription{
		Id:          101,
		UserId:      userID,
		PlanId:      101,
		AmountTotal: 10000,
		AmountUsed:  0,
		Status:      "active",
		StartTime:   now.Unix(),
		EndTime:     now.Add(24 * time.Hour).Unix(),
	}
	requestSubLate := &model.UserSubscription{
		Id:                102,
		UserId:            userID,
		PlanId:            102,
		ResourceType:      model.SubscriptionResourceRequestCount,
		RequestCountTotal: 10,
		RequestCountUsed:  0,
		Status:            "active",
		StartTime:         now.Unix(),
		EndTime:           now.Add(48 * time.Hour).Unix(),
	}
	requestSubEarly := &model.UserSubscription{
		Id:                103,
		UserId:            userID,
		PlanId:            103,
		ResourceType:      model.SubscriptionResourceRequestCount,
		RequestCountTotal: 10,
		RequestCountUsed:  0,
		Status:            "active",
		StartTime:         now.Unix(),
		EndTime:           now.Add(12 * time.Hour).Unix(),
	}
	require.NoError(t, model.DB.Create(quotaSub).Error)
	require.NoError(t, model.DB.Create(requestSubLate).Error)
	require.NoError(t, model.DB.Create(requestSubEarly).Error)

	res, err := model.PreConsumeUserSubscription("req-prefers-request-count", userID, "test-model", "", 0, 500)
	require.NoError(t, err)
	require.NotNil(t, res)
	assert.Equal(t, requestSubEarly.Id, res.UserSubscriptionId)
	assert.Equal(t, int64(1), res.PreConsumed)
	assert.Equal(t, model.SubscriptionResourceRequestCount, res.ResourceType)

	var refreshedQuota model.UserSubscription
	var refreshedRequest model.UserSubscription
	require.NoError(t, model.DB.Where("id = ?", quotaSub.Id).First(&refreshedQuota).Error)
	require.NoError(t, model.DB.Where("id = ?", requestSubEarly.Id).First(&refreshedRequest).Error)
	assert.Equal(t, int64(0), refreshedQuota.AmountUsed)
	assert.Equal(t, int64(1), refreshedRequest.RequestCountUsed)
}

func TestPreConsumeUserSubscription_AllowsUsableChildGroupOfCurrentSubscriptionGroup(t *testing.T) {
	truncate(t)

	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"默认分组"}`))
	ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.Set("default", map[string]string{
		"claude": "Claude 分组",
	})
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"默认分组","vip":"vip分组"}`))
		ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.Clear()
		ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.AddAll(map[string]map[string]string{
			"vip": {
				"append_1":   "vip_special_group_1",
				"-:remove_1": "vip_removed_group_1",
			},
		})
	})

	const userID = 11
	seedUser(t, userID, 10000)
	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", userID).Update("group", "default").Error)

	seedSubscriptionPlan(t, 111, model.SubscriptionResourceQuota)
	sub := &model.UserSubscription{
		Id:           111,
		UserId:       userID,
		PlanId:       111,
		AmountTotal:  5000,
		AmountUsed:   0,
		UpgradeGroup: "default",
		Status:       "active",
		StartTime:    time.Now().Unix(),
		EndTime:      time.Now().Add(24 * time.Hour).Unix(),
	}
	require.NoError(t, model.DB.Create(sub).Error)

	res, err := model.PreConsumeUserSubscription("req-usable-child-group", userID, "test-model", "claude", 0, 500)
	require.NoError(t, err)
	require.NotNil(t, res)
	assert.Equal(t, sub.Id, res.UserSubscriptionId)
	assert.Equal(t, int64(500), res.PreConsumed)
	assert.Equal(t, model.SubscriptionResourceQuota, res.ResourceType)
	assert.Equal(t, int64(500), getSubscriptionUsed(t, sub.Id))
}

func TestPreConsumeUserSubscription_AllowsUsingGroupWhenCurrentUserGroupIsStale(t *testing.T) {
	truncate(t)

	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"默认分组","codex_sub":"Codex 订阅组"}`))
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"默认分组","vip":"vip分组"}`))
		ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.Clear()
		ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.AddAll(map[string]map[string]string{
			"vip": {
				"append_1":   "vip_special_group_1",
				"-:remove_1": "vip_removed_group_1",
			},
		})
	})

	const userID = 12
	seedUser(t, userID, 10000)
	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", userID).Update("group", "codex包月").Error)

	seedSubscriptionPlan(t, 112, model.SubscriptionResourceQuota)
	require.NoError(t, model.DB.Model(&model.SubscriptionPlan{}).Where("id = ?", 112).Update("upgrade_group", "codex_sub").Error)

	sub := &model.UserSubscription{
		Id:           112,
		UserId:       userID,
		PlanId:       112,
		AmountTotal:  5000,
		AmountUsed:   0,
		UpgradeGroup: "codex_sub",
		Status:       "active",
		StartTime:    time.Now().Unix(),
		EndTime:      time.Now().Add(24 * time.Hour).Unix(),
	}
	require.NoError(t, model.DB.Create(sub).Error)

	res, err := model.PreConsumeUserSubscription("req-stale-user-group", userID, "test-model", "codex_sub", 0, 500)
	require.NoError(t, err)
	require.NotNil(t, res)
	assert.Equal(t, sub.Id, res.UserSubscriptionId)
	assert.Equal(t, int64(500), res.PreConsumed)
	assert.Equal(t, model.SubscriptionResourceQuota, res.ResourceType)
	assert.Equal(t, int64(500), getSubscriptionUsed(t, sub.Id))
}

func TestPreConsumeUserSubscription_RejectsUsingGroupOnlyAllowedByStaleCurrentUserGroup(t *testing.T) {
	truncate(t)

	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"默认分组","codex_sub":"Codex 订阅组"}`))
	ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.Set("default", map[string]string{
		"claude": "Claude 分组",
	})
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"默认分组","vip":"vip分组"}`))
		ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.Clear()
		ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.AddAll(map[string]map[string]string{
			"vip": {
				"append_1":   "vip_special_group_1",
				"-:remove_1": "vip_removed_group_1",
			},
		})
	})

	const userID = 13
	seedUser(t, userID, 10000)
	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", userID).Update("group", "default").Error)

	seedSubscriptionPlan(t, 113, model.SubscriptionResourceQuota)
	require.NoError(t, model.DB.Model(&model.SubscriptionPlan{}).Where("id = ?", 113).Update("upgrade_group", "codex_sub").Error)

	sub := &model.UserSubscription{
		Id:           113,
		UserId:       userID,
		PlanId:       113,
		AmountTotal:  5000,
		AmountUsed:   0,
		UpgradeGroup: "codex_sub",
		Status:       "active",
		StartTime:    time.Now().Unix(),
		EndTime:      time.Now().Add(24 * time.Hour).Unix(),
	}
	require.NoError(t, model.DB.Create(sub).Error)

	res, err := model.PreConsumeUserSubscription("req-stale-user-group-reject", userID, "test-model", "claude", 0, 500)
	require.Error(t, err)
	require.Nil(t, res)
	assert.Contains(t, err.Error(), "subscription quota insufficient")
	assert.Equal(t, int64(0), getSubscriptionUsed(t, sub.Id))
}

func TestPreConsumeUserSubscription_RejectsModelOutsidePlanScope(t *testing.T) {
	truncate(t)

	const userID = 14
	seedUser(t, userID, 10000)
	seedSubscriptionPlan(t, 114, model.SubscriptionResourceQuota)
	require.NoError(t, model.DB.Model(&model.SubscriptionPlan{}).Where("id = ?", 114).Updates(map[string]any{
		"allowed_models_json": `["claude-3-7-sonnet"]`,
	}).Error)

	sub := &model.UserSubscription{
		Id:                114,
		UserId:            userID,
		PlanId:            114,
		AmountTotal:       5000,
		AmountUsed:        0,
		AllowedModelsJSON: `["claude-3-7-sonnet"]`,
		Status:            "active",
		StartTime:         time.Now().Unix(),
		EndTime:           time.Now().Add(24 * time.Hour).Unix(),
	}
	require.NoError(t, model.DB.Create(sub).Error)

	res, err := model.PreConsumeUserSubscription("req-model-scope-reject", userID, "gpt-4o", "", 0, 500)
	require.Error(t, err)
	require.Nil(t, res)
	assert.Contains(t, err.Error(), "subscription quota insufficient")
	assert.Equal(t, int64(0), getSubscriptionUsed(t, sub.Id))
}

func TestPreConsumeUserSubscription_RejectsVendorOutsidePlanScope(t *testing.T) {
	truncate(t)

	const userID = 15
	seedUser(t, userID, 10000)
	seedSubscriptionPlan(t, 115, model.SubscriptionResourceQuota)
	require.NoError(t, model.DB.Create(&model.Vendor{Id: 501, Name: "Anthropic"}).Error)
	require.NoError(t, model.DB.Create(&model.Vendor{Id: 502, Name: "OpenAI"}).Error)
	require.NoError(t, model.DB.Create(&model.Model{
		Id:        501,
		ModelName: "claude-3-7-sonnet",
		VendorID:  501,
	}).Error)
	require.NoError(t, model.DB.Create(&model.Model{
		Id:        502,
		ModelName: "gpt-4o",
		VendorID:  502,
	}).Error)

	sub := &model.UserSubscription{
		Id:                   115,
		UserId:               userID,
		PlanId:               115,
		AmountTotal:          5000,
		AmountUsed:           0,
		AllowedVendorIDsJSON: `[501]`,
		Status:               "active",
		StartTime:            time.Now().Unix(),
		EndTime:              time.Now().Add(24 * time.Hour).Unix(),
	}
	require.NoError(t, model.DB.Create(sub).Error)

	res, err := model.PreConsumeUserSubscription("req-vendor-scope-reject", userID, "gpt-4o", "", 0, 500)
	require.Error(t, err)
	require.Nil(t, res)
	assert.Contains(t, err.Error(), "subscription quota insufficient")
	assert.Equal(t, int64(0), getSubscriptionUsed(t, sub.Id))
}

func TestPreConsumeUserSubscription_AllowsVendorScopeWithDefaultVendorRule(t *testing.T) {
	truncate(t)

	const userID = 16
	seedUser(t, userID, 10000)
	seedSubscriptionPlan(t, 116, model.SubscriptionResourceQuota)
	require.NoError(t, model.DB.Create(&model.Vendor{Id: 601, Name: "OpenAI"}).Error)

	sub := &model.UserSubscription{
		Id:                   116,
		UserId:               userID,
		PlanId:               116,
		AmountTotal:          5000,
		AmountUsed:           0,
		AllowedVendorIDsJSON: `[601]`,
		Status:               "active",
		StartTime:            time.Now().Unix(),
		EndTime:              time.Now().Add(24 * time.Hour).Unix(),
	}
	require.NoError(t, model.DB.Create(sub).Error)

	res, err := model.PreConsumeUserSubscription("req-vendor-scope-default-rule", userID, "gpt-4o", "", 0, 500)
	require.NoError(t, err)
	require.NotNil(t, res)
	assert.Equal(t, sub.Id, res.UserSubscriptionId)
	assert.Equal(t, int64(500), res.PreConsumed)
}

func TestSyncActiveSubscriptionsForPlanTx_RefreshesRestrictionSnapshot(t *testing.T) {
	truncate(t)

	seedSubscriptionPlan(t, 117, model.SubscriptionResourceRequestCount)
	require.NoError(t, model.DB.Model(&model.SubscriptionPlan{}).Where("id = ?", 117).Updates(map[string]any{
		"allowed_models_json": `["claude-3-7-sonnet"]`,
	}).Error)

	sub := &model.UserSubscription{
		Id:                117,
		UserId:            17,
		PlanId:            117,
		ResourceType:      model.SubscriptionResourceRequestCount,
		RequestCountTotal: 100,
		RequestCountUsed:  0,
		AllowedModelsJSON: `["claude-3-7-sonnet"]`,
		Status:            "active",
		StartTime:         time.Now().Unix(),
		EndTime:           time.Now().Add(24 * time.Hour).Unix(),
	}
	require.NoError(t, model.DB.Create(sub).Error)

	require.NoError(t, model.DB.Model(&model.SubscriptionPlan{}).Where("id = ?", 117).Updates(map[string]any{
		"request_count_total": 200,
		"allowed_models_json": `["gpt-4o"]`,
	}).Error)

	require.NoError(t, model.DB.Transaction(func(tx *gorm.DB) error {
		return model.SyncActiveSubscriptionsForPlanTx(tx, 117)
	}))

	var refreshed model.UserSubscription
	require.NoError(t, model.DB.Where("id = ?", 117).First(&refreshed).Error)
	assert.Equal(t, int64(200), refreshed.RequestCountTotal)
	assert.Equal(t, `["gpt-4o"]`, refreshed.AllowedModelsJSON)
}

func TestCreateMigratedUserSubscriptionTx_CopiesTargetRestrictionSnapshot(t *testing.T) {
	truncate(t)

	seedUser(t, 18, 10000)
	seedSubscriptionPlan(t, 118, model.SubscriptionResourceRequestCount)
	seedSubscriptionPlan(t, 119, model.SubscriptionResourceRequestCount)
	require.NoError(t, model.DB.Model(&model.SubscriptionPlan{}).Where("id = ?", 119).Updates(map[string]any{
		"allowed_models_json":     `["gpt-4o"]`,
		"allowed_vendor_ids_json": `[701]`,
	}).Error)

	source := &model.UserSubscription{
		Id:                118,
		UserId:            18,
		PlanId:            118,
		ResourceType:      model.SubscriptionResourceRequestCount,
		RequestCountTotal: 100,
		RequestCountUsed:  10,
		Status:            "active",
		StartTime:         time.Now().Unix(),
		EndTime:           time.Now().Add(24 * time.Hour).Unix(),
	}
	require.NoError(t, model.DB.Create(source).Error)

	result, err := model.ExecuteSubscriptionMigration(model.SubscriptionMigrationFilter{
		TargetPlanId:       119,
		SourcePlanIds:      []int{118},
		SourceResourceType: model.SubscriptionResourceRequestCount,
	})
	require.NoError(t, err)
	require.NotNil(t, result)
	require.Equal(t, 1, result.Migrated)

	var migrated model.UserSubscription
	require.NoError(t, model.DB.Where("plan_id = ? AND user_id = ?", 119, 18).First(&migrated).Error)
	assert.Equal(t, `["gpt-4o"]`, migrated.AllowedModelsJSON)
	assert.Equal(t, `[701]`, migrated.AllowedVendorIDsJSON)
}

func TestRefundTaskQuota_NoToken(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, channelID = 4, 4
	const initQuota, preConsumed = 10000, 1500

	seedUser(t, userID, initQuota)
	seedChannel(t, channelID)

	task := makeTask(userID, channelID, preConsumed, 0, BillingSourceWallet, 0) // TokenId=0

	RefundTaskQuota(ctx, task, "no token task failed")

	// User quota refunded
	assert.Equal(t, initQuota+preConsumed, getUserQuota(t, userID))

	// Log created
	log := getLastLog(t)
	require.NotNil(t, log)
	assert.Equal(t, model.LogTypeRefund, log.Type)
}

// ===========================================================================
// RecalculateTaskQuota tests
// ===========================================================================

func TestRecalculate_PositiveDelta(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, tokenID, channelID = 10, 10, 10
	const initQuota, preConsumed = 10000, 2000
	const actualQuota = 3000 // under-charged by 1000
	const tokenRemain = 5000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-recalc-pos", tokenRemain)
	seedChannel(t, channelID)

	task := makeTask(userID, channelID, preConsumed, tokenID, BillingSourceWallet, 0)

	RecalculateTaskQuota(ctx, task, actualQuota, "adaptor adjustment")

	// User quota should decrease by the delta (1000 additional charge)
	assert.Equal(t, initQuota-(actualQuota-preConsumed), getUserQuota(t, userID))

	// Token should also be charged the delta
	assert.Equal(t, tokenRemain-(actualQuota-preConsumed), getTokenRemainQuota(t, tokenID))

	// task.Quota should be updated to actualQuota
	assert.Equal(t, actualQuota, task.Quota)

	// Log type should be Consume (additional charge)
	log := getLastLog(t)
	require.NotNil(t, log)
	assert.Equal(t, model.LogTypeConsume, log.Type)
	assert.Equal(t, actualQuota-preConsumed, log.Quota)

	usedQuota, usedCount := getChannelUsage(t, channelID)
	assert.Equal(t, int64(actualQuota-preConsumed), usedQuota)
	assert.Equal(t, int64(0), usedCount)
}

func TestRecalculate_NegativeDelta(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, tokenID, channelID = 11, 11, 11
	const initQuota, preConsumed = 10000, 5000
	const actualQuota = 3000 // over-charged by 2000
	const tokenRemain = 5000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-recalc-neg", tokenRemain)
	seedChannel(t, channelID)

	task := makeTask(userID, channelID, preConsumed, tokenID, BillingSourceWallet, 0)

	RecalculateTaskQuota(ctx, task, actualQuota, "adaptor adjustment")

	// User quota should increase by abs(delta) = 2000 (refund overpayment)
	assert.Equal(t, initQuota+(preConsumed-actualQuota), getUserQuota(t, userID))

	// Token should be refunded the difference
	assert.Equal(t, tokenRemain+(preConsumed-actualQuota), getTokenRemainQuota(t, tokenID))

	// task.Quota updated
	assert.Equal(t, actualQuota, task.Quota)

	// Log type should be Refund
	log := getLastLog(t)
	require.NotNil(t, log)
	assert.Equal(t, model.LogTypeRefund, log.Type)
	assert.Equal(t, preConsumed-actualQuota, log.Quota)
}

func TestRecalculate_ZeroDelta(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID = 12
	const initQuota, preConsumed = 10000, 3000

	seedUser(t, userID, initQuota)

	task := makeTask(userID, 0, preConsumed, 0, BillingSourceWallet, 0)

	RecalculateTaskQuota(ctx, task, preConsumed, "exact match")

	// No change to user quota
	assert.Equal(t, initQuota, getUserQuota(t, userID))

	// No log created (delta is zero)
	assert.Equal(t, int64(0), countLogs(t))
}

func TestRecalculate_ActualQuotaZero(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID = 13
	const initQuota = 10000

	seedUser(t, userID, initQuota)

	task := makeTask(userID, 0, 5000, 0, BillingSourceWallet, 0)

	RecalculateTaskQuota(ctx, task, 0, "zero actual")

	// No change (early return)
	assert.Equal(t, initQuota, getUserQuota(t, userID))
	assert.Equal(t, int64(0), countLogs(t))
}

func TestRecalculate_Subscription_NegativeDelta(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, tokenID, channelID, subID = 14, 14, 14, 2
	const preConsumed = 5000
	const actualQuota = 2000 // over-charged by 3000
	const subTotal, subUsed int64 = 100000, 50000
	const tokenRemain = 8000

	seedUser(t, userID, 0)
	seedToken(t, tokenID, userID, "sk-sub-recalc", tokenRemain)
	seedChannel(t, channelID)
	seedSubscription(t, subID, userID, subTotal, subUsed)

	task := makeTask(userID, channelID, preConsumed, tokenID, BillingSourceSubscription, subID)

	RecalculateTaskQuota(ctx, task, actualQuota, "subscription over-charge")

	// Subscription used should decrease by delta (refund 3000)
	assert.Equal(t, subUsed-int64(preConsumed-actualQuota), getSubscriptionUsed(t, subID))

	// Token refunded
	assert.Equal(t, tokenRemain+(preConsumed-actualQuota), getTokenRemainQuota(t, tokenID))

	assert.Equal(t, actualQuota, task.Quota)

	log := getLastLog(t)
	require.NotNil(t, log)
	assert.Equal(t, model.LogTypeRefund, log.Type)
}

func TestRecalculate_RequestCountSubscription_SkipsDelta(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, tokenID, channelID, subID = 22, 22, 22, 22
	const requestUsed int64 = 1
	const tokenRemain = 9000

	seedUser(t, userID, 0)
	seedToken(t, tokenID, userID, "sk-request-count-recalc", tokenRemain)
	seedChannel(t, channelID)
	seedRequestCountSubscription(t, subID, userID, 100, requestUsed)

	task := makeTask(userID, channelID, 5000, tokenID, BillingSourceSubscription, subID)
	task.PrivateData.SubscriptionResourceType = model.SubscriptionResourceRequestCount
	task.PrivateData.SubscriptionPreConsumed = 1

	RecalculateTaskQuota(ctx, task, 9000, "request_count exact one success")

	assert.Equal(t, requestUsed, getSubscriptionRequestCountUsed(t, subID))
	assert.Equal(t, tokenRemain, getTokenRemainQuota(t, tokenID))
	assert.Equal(t, int64(0), countLogs(t))
	assert.Equal(t, 9000, task.Quota)
}

func TestRefundSubscriptionPreConsume_RequestCountMarksRecordRefunded(t *testing.T) {
	truncate(t)

	const userID = 23
	const subID = 23
	const requestID = "req-request-count-refund"

	seedUser(t, userID, 0)
	seedRequestCountSubscription(t, subID, userID, 100, 0)

	res, err := model.PreConsumeUserSubscription(requestID, userID, "test-model", "", 0, 6000)
	require.NoError(t, err)
	require.NotNil(t, res)
	require.Equal(t, model.SubscriptionResourceRequestCount, res.ResourceType)
	require.Equal(t, int64(1), res.PreConsumed)
	require.Equal(t, int64(1), getSubscriptionRequestCountUsed(t, subID))

	require.NoError(t, model.RefundSubscriptionPreConsume(requestID))
	assert.Equal(t, int64(0), getSubscriptionRequestCountUsed(t, subID))

	var record model.SubscriptionPreConsumeRecord
	require.NoError(t, model.DB.Where("request_id = ?", requestID).First(&record).Error)
	assert.Equal(t, "refunded", record.Status)
}

func TestRefundSubscriptionPreConsume_LegacyPreConsumedRecordCompatible(t *testing.T) {
	truncate(t)

	const userID = 31
	const subID = 31
	const requestID = "req-legacy-refund"

	seedUser(t, userID, 0)
	seedRequestCountSubscription(t, subID, userID, 100, 1)

	record := &model.SubscriptionPreConsumeRecord{
		RequestId:          requestID,
		UserId:             userID,
		UserSubscriptionId: subID,
		PreConsumed:        1,
		Status:             "consumed",
	}
	require.NoError(t, model.DB.Create(record).Error)

	require.NoError(t, model.RefundSubscriptionPreConsume(requestID))
	assert.Equal(t, int64(0), getSubscriptionRequestCountUsed(t, subID))

	var refreshed model.SubscriptionPreConsumeRecord
	require.NoError(t, model.DB.Where("request_id = ?", requestID).First(&refreshed).Error)
	assert.Equal(t, "refunded", refreshed.Status)
}

func TestAppendBillingInfo_RequestCountSubscriptionUsesRequestCountTotals(t *testing.T) {
	relayInfo := &relaycommon.RelayInfo{
		BillingSource:                               BillingSourceSubscription,
		SubscriptionId:                              24,
		SubscriptionResourceType:                    model.SubscriptionResourceRequestCount,
		SubscriptionPreConsumed:                     1,
		SubscriptionPlanId:                          2401,
		SubscriptionPlanTitle:                       "按次套餐",
		SubscriptionRequestCountTotal:               100,
		SubscriptionRequestCountUsedAfterPreConsume: 8,
	}

	other := map[string]interface{}{}
	appendBillingInfo(relayInfo, other)

	assert.Equal(t, "subscription", other["billing_source"])
	assert.Equal(t, model.SubscriptionResourceRequestCount, other["subscription_resource_type"])
	assert.Equal(t, int64(100), other["subscription_total"])
	assert.Equal(t, int64(8), other["subscription_used"])
	assert.Equal(t, int64(92), other["subscription_remain"])
	assert.Equal(t, int64(1), other["subscription_consumed"])
}

func TestBillingSessionSettle_RequestCountZeroUsageRefundsPreConsumedCount(t *testing.T) {
	truncate(t)

	const userID = 61
	const subID = 61
	const requestID = "req-request-count-zero-usage"

	seedUser(t, userID, 0)
	seedRequestCountSubscription(t, subID, userID, 100, 0)

	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	relayInfo := &relaycommon.RelayInfo{
		RequestId:       requestID,
		UserId:          userID,
		OriginModelName: "test-model",
		UsingGroup:      "",
	}
	session := &BillingSession{
		relayInfo: relayInfo,
		funding: &SubscriptionFunding{
			requestId:  requestID,
			userId:     userID,
			modelName:  "test-model",
			usingGroup: "",
			amount:     6000,
		},
	}

	require.Nil(t, session.preConsume(ctx, 6000))
	assert.Equal(t, int64(1), getSubscriptionRequestCountUsed(t, subID))
	require.NoError(t, session.Settle(0))

	assert.Equal(t, int64(0), getSubscriptionRequestCountUsed(t, subID))
	assert.Equal(t, 0, session.GetPreConsumedQuota())
	assert.Equal(t, int64(0), relayInfo.SubscriptionPreConsumedCount)
	assert.Equal(t, int64(0), relayInfo.SubscriptionRequestCountUsedAfterPreConsume)
}

func TestBillingSessionSettle_DualLimitRequestCountZeroUsageRefundsAmountAndCount(t *testing.T) {
	truncate(t)

	const userID, tokenID, subID = 62, 62, 62
	const tokenRemain = 10000
	const requestID = "req-dual-request-count-zero-usage"

	seedUser(t, userID, 0)
	seedToken(t, tokenID, userID, "sk-dual-zero-usage", tokenRemain)
	seedDualLimitSubscription(t, subID, userID, 10000, 0, 100, 0, model.SubscriptionResourceRequestCount)

	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	relayInfo := &relaycommon.RelayInfo{
		RequestId:       requestID,
		UserId:          userID,
		TokenId:         tokenID,
		TokenKey:        "sk-dual-zero-usage",
		OriginModelName: "test-model",
		UsingGroup:      "",
	}
	session := &BillingSession{
		relayInfo: relayInfo,
		funding: &SubscriptionFunding{
			requestId:  requestID,
			userId:     userID,
			modelName:  "test-model",
			usingGroup: "",
			amount:     5000,
		},
	}

	require.Nil(t, session.preConsume(ctx, 5000))

	var pre model.UserSubscription
	require.NoError(t, model.DB.Where("id = ?", subID).First(&pre).Error)
	assert.Equal(t, int64(5000), pre.AmountUsed)
	assert.Equal(t, int64(1), pre.RequestCountUsed)
	assert.Equal(t, tokenRemain-5000, getTokenRemainQuota(t, tokenID))

	require.NoError(t, session.Settle(0))

	var post model.UserSubscription
	require.NoError(t, model.DB.Where("id = ?", subID).First(&post).Error)
	assert.Equal(t, int64(0), post.AmountUsed)
	assert.Equal(t, int64(0), post.RequestCountUsed)
	assert.Equal(t, tokenRemain, getTokenRemainQuota(t, tokenID))
	assert.Equal(t, int64(0), relayInfo.SubscriptionPreConsumedAmount)
	assert.Equal(t, int64(0), relayInfo.SubscriptionPreConsumedCount)
	assert.Equal(t, int64(0), relayInfo.SubscriptionAmountUsedAfterPreConsume)
	assert.Equal(t, int64(0), relayInfo.SubscriptionRequestCountUsedAfterPreConsume)
}

func TestBillingSessionRefund_RequestCountSubscriptionRefundsPreConsumedCount(t *testing.T) {
	truncate(t)

	const userID = 63
	const subID = 63
	const requestID = "req-request-count-refund"

	seedUser(t, userID, 0)
	seedRequestCountSubscription(t, subID, userID, 100, 0)

	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	relayInfo := &relaycommon.RelayInfo{
		RequestId:       requestID,
		UserId:          userID,
		OriginModelName: "test-model",
		UsingGroup:      "",
	}
	session := &BillingSession{
		relayInfo: relayInfo,
		funding: &SubscriptionFunding{
			requestId:  requestID,
			userId:     userID,
			modelName:  "test-model",
			usingGroup: "",
			amount:     6000,
		},
	}

	require.Nil(t, session.preConsume(ctx, 6000))
	assert.True(t, session.NeedsRefund())
	assert.Equal(t, int64(1), getSubscriptionRequestCountUsed(t, subID))

	session.Refund(ctx)

	require.Eventually(t, func() bool {
		return getSubscriptionRequestCountUsed(t, subID) == 0
	}, 2*time.Second, 20*time.Millisecond)

	var record model.SubscriptionPreConsumeRecord
	require.NoError(t, model.DB.Where("request_id = ?", requestID).First(&record).Error)
	assert.Equal(t, "refunded", record.Status)
}

func TestRefundTaskQuota_DualLimitRequestCountSubscriptionAlsoRefundsTokenQuota(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, tokenID, channelID, subID = 41, 41, 41, 41
	const tokenRemain = 5000

	seedUser(t, userID, 0)
	seedToken(t, tokenID, userID, "sk-dual-request-count", tokenRemain)
	seedChannel(t, channelID)
	seedDualLimitSubscription(t, subID, userID, 10000, 4800, 100, 5, model.SubscriptionResourceRequestCount)

	task := makeTask(userID, channelID, 4800, tokenID, BillingSourceSubscription, subID)
	task.PrivateData.SubscriptionResourceType = model.SubscriptionResourceRequestCount
	task.PrivateData.SubscriptionPreConsumed = 1
	task.PrivateData.SubscriptionPreConsumedAmount = 4800
	task.PrivateData.SubscriptionPreConsumedCount = 1
	task.PrivateData.SubscriptionAmountTotal = 10000
	task.PrivateData.SubscriptionRequestCountTotal = 100

	RefundTaskQuota(ctx, task, "dual limit request_count task failed")

	var sub model.UserSubscription
	require.NoError(t, model.DB.Where("id = ?", subID).First(&sub).Error)
	assert.Equal(t, int64(0), sub.AmountUsed)
	assert.Equal(t, int64(4), sub.RequestCountUsed)
	assert.Equal(t, tokenRemain+4800, getTokenRemainQuota(t, tokenID))
}

func TestRecalculateTaskQuota_DualLimitRequestCountSubscriptionStillSettlesAmount(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, tokenID, channelID, subID = 42, 42, 42, 42
	const tokenRemain = 9000

	seedUser(t, userID, 0)
	seedToken(t, tokenID, userID, "sk-dual-request-count-recalc", tokenRemain)
	seedChannel(t, channelID)
	seedDualLimitSubscription(t, subID, userID, 20000, 5000, 100, 8, model.SubscriptionResourceRequestCount)

	task := makeTask(userID, channelID, 5000, tokenID, BillingSourceSubscription, subID)
	task.PrivateData.SubscriptionResourceType = model.SubscriptionResourceRequestCount
	task.PrivateData.SubscriptionPreConsumed = 1
	task.PrivateData.SubscriptionPreConsumedAmount = 5000
	task.PrivateData.SubscriptionPreConsumedCount = 1
	task.PrivateData.SubscriptionAmountTotal = 20000
	task.PrivateData.SubscriptionRequestCountTotal = 100

	RecalculateTaskQuota(ctx, task, 9000, "dual limit settle")

	var sub model.UserSubscription
	require.NoError(t, model.DB.Where("id = ?", subID).First(&sub).Error)
	assert.Equal(t, int64(9000), sub.AmountUsed)
	assert.Equal(t, int64(8), sub.RequestCountUsed)
	assert.Equal(t, tokenRemain-4000, getTokenRemainQuota(t, tokenID))
}

// ===========================================================================
// CAS + Billing integration tests
// Simulates the flow in updateVideoSingleTask (service/task_polling.go)
// ===========================================================================

// simulatePollBilling reproduces the CAS + billing logic from updateVideoSingleTask.
// It takes a persisted task (already in DB), applies the new status, and performs
// the conditional update + billing exactly as the polling loop does.
func simulatePollBilling(ctx context.Context, task *model.Task, newStatus model.TaskStatus, actualQuota int) {
	snap := task.Snapshot()

	shouldRefund := false
	shouldSettle := false
	quota := task.Quota

	task.Status = newStatus
	switch string(newStatus) {
	case model.TaskStatusSuccess:
		task.Progress = "100%"
		task.FinishTime = 9999
		shouldSettle = true
	case model.TaskStatusFailure:
		task.Progress = "100%"
		task.FinishTime = 9999
		task.FailReason = "upstream error"
		if quota != 0 {
			shouldRefund = true
		}
	default:
		task.Progress = "50%"
	}

	isDone := task.Status == model.TaskStatus(model.TaskStatusSuccess) || task.Status == model.TaskStatus(model.TaskStatusFailure)
	if isDone && snap.Status != task.Status {
		won, err := task.UpdateWithStatus(snap.Status)
		if err != nil {
			shouldRefund = false
			shouldSettle = false
		} else if !won {
			shouldRefund = false
			shouldSettle = false
		}
	} else if !snap.Equal(task.Snapshot()) {
		_, _ = task.UpdateWithStatus(snap.Status)
	}

	if shouldSettle && actualQuota > 0 {
		RecalculateTaskQuota(ctx, task, actualQuota, "test settle")
	}
	if shouldRefund {
		RefundTaskQuota(ctx, task, task.FailReason)
	}
}

func TestCASGuardedRefund_Win(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, tokenID, channelID = 20, 20, 20
	const initQuota, preConsumed = 10000, 4000
	const tokenRemain = 6000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-cas-refund-win", tokenRemain)
	seedChannel(t, channelID)

	task := makeTask(userID, channelID, preConsumed, tokenID, BillingSourceWallet, 0)
	task.Status = model.TaskStatus(model.TaskStatusInProgress)
	require.NoError(t, model.DB.Create(task).Error)

	simulatePollBilling(ctx, task, model.TaskStatus(model.TaskStatusFailure), 0)

	// CAS wins: task in DB should now be FAILURE
	var reloaded model.Task
	require.NoError(t, model.DB.First(&reloaded, task.ID).Error)
	assert.EqualValues(t, model.TaskStatusFailure, reloaded.Status)

	// Refund should have happened
	assert.Equal(t, initQuota+preConsumed, getUserQuota(t, userID))
	assert.Equal(t, tokenRemain+preConsumed, getTokenRemainQuota(t, tokenID))

	log := getLastLog(t)
	require.NotNil(t, log)
	assert.Equal(t, model.LogTypeRefund, log.Type)
}

func TestCASGuardedRefund_Lose(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, tokenID, channelID = 21, 21, 21
	const initQuota, preConsumed = 10000, 4000
	const tokenRemain = 6000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-cas-refund-lose", tokenRemain)
	seedChannel(t, channelID)

	// Create task with IN_PROGRESS in DB
	task := makeTask(userID, channelID, preConsumed, tokenID, BillingSourceWallet, 0)
	task.Status = model.TaskStatus(model.TaskStatusInProgress)
	require.NoError(t, model.DB.Create(task).Error)

	// Simulate another process already transitioning to FAILURE
	model.DB.Model(&model.Task{}).Where("id = ?", task.ID).Update("status", model.TaskStatusFailure)

	// Our process still has the old in-memory state (IN_PROGRESS) and tries to transition
	// task.Status is still IN_PROGRESS in the snapshot
	simulatePollBilling(ctx, task, model.TaskStatus(model.TaskStatusFailure), 0)

	// CAS lost: user quota should NOT change (no double refund)
	assert.Equal(t, initQuota, getUserQuota(t, userID))
	assert.Equal(t, tokenRemain, getTokenRemainQuota(t, tokenID))

	// No billing log should be created
	assert.Equal(t, int64(0), countLogs(t))
}

func TestCASGuardedSettle_Win(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, tokenID, channelID = 22, 22, 22
	const initQuota, preConsumed = 10000, 5000
	const actualQuota = 3000 // over-charged, should get partial refund
	const tokenRemain = 8000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-cas-settle-win", tokenRemain)
	seedChannel(t, channelID)

	task := makeTask(userID, channelID, preConsumed, tokenID, BillingSourceWallet, 0)
	task.Status = model.TaskStatus(model.TaskStatusInProgress)
	require.NoError(t, model.DB.Create(task).Error)

	simulatePollBilling(ctx, task, model.TaskStatus(model.TaskStatusSuccess), actualQuota)

	// CAS wins: task should be SUCCESS
	var reloaded model.Task
	require.NoError(t, model.DB.First(&reloaded, task.ID).Error)
	assert.EqualValues(t, model.TaskStatusSuccess, reloaded.Status)

	// Settlement should refund the over-charge (5000 - 3000 = 2000 back to user)
	assert.Equal(t, initQuota+(preConsumed-actualQuota), getUserQuota(t, userID))
	assert.Equal(t, tokenRemain+(preConsumed-actualQuota), getTokenRemainQuota(t, tokenID))

	// task.Quota should be updated to actualQuota
	assert.Equal(t, actualQuota, task.Quota)
}

func TestNonTerminalUpdate_NoBilling(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, channelID = 23, 23
	const initQuota, preConsumed = 10000, 3000

	seedUser(t, userID, initQuota)
	seedChannel(t, channelID)

	task := makeTask(userID, channelID, preConsumed, 0, BillingSourceWallet, 0)
	task.Status = model.TaskStatus(model.TaskStatusInProgress)
	task.Progress = "20%"
	require.NoError(t, model.DB.Create(task).Error)

	// Simulate a non-terminal poll update (still IN_PROGRESS, progress changed)
	simulatePollBilling(ctx, task, model.TaskStatus(model.TaskStatusInProgress), 0)

	// User quota should NOT change
	assert.Equal(t, initQuota, getUserQuota(t, userID))

	// No billing log
	assert.Equal(t, int64(0), countLogs(t))

	// Task progress should be updated in DB
	var reloaded model.Task
	require.NoError(t, model.DB.First(&reloaded, task.ID).Error)
	assert.Equal(t, "50%", reloaded.Progress)
}

func TestRefreshVideoTaskFromUpstreamTerminalSnapshotDoesNotRebill(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, tokenID, channelID = 24, 24, 24
	const initQuota, preConsumed = 10000, 5000
	const tokenRemain = 8000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-refresh-terminal", tokenRemain)
	seedChannel(t, channelID)

	task := makeTask(userID, channelID, preConsumed, tokenID, BillingSourceWallet, 0)
	task.TaskID = "task_refresh_terminal"
	task.Status = model.TaskStatusSuccess
	task.Progress = "100%"
	task.PrivateData.ResultURL = ""
	task.Data = json.RawMessage(`{"task_id":"task_upstream","status":"SUCCESS"}`)
	task.PrivateData.UpstreamTaskID = "task_upstream"
	require.NoError(t, model.DB.Create(task).Error)

	adaptor := &mockAdaptor{
		adjustReturn: 1000,
		parseResult: &relaycommon.TaskInfo{
			Status:   model.TaskStatusSuccess,
			Progress: "100%",
			Url:      "https://cdn.example.com/out.mp4",
		},
		responseBody: `{"task_id":"task_upstream","status":"SUCCESS","progress":"100%","result_url":"https://cdn.example.com/out.mp4"}`,
	}
	ch := &model.Channel{Id: channelID, Type: constant.ChannelTypeSeedance2, Key: "sk-test"}

	body, taskInfo, err := RefreshVideoTaskFromUpstream(ctx, adaptor, ch, task)
	require.NoError(t, err)
	require.Contains(t, string(body), "https://cdn.example.com/out.mp4")
	require.Equal(t, "https://cdn.example.com/out.mp4", taskInfo.Url)

	assert.Equal(t, initQuota, getUserQuota(t, userID))
	assert.Equal(t, tokenRemain, getTokenRemainQuota(t, tokenID))
	assert.Equal(t, int64(0), countLogs(t))

	var reloaded model.Task
	require.NoError(t, model.DB.First(&reloaded, task.ID).Error)
	assert.Equal(t, "https://cdn.example.com/out.mp4", reloaded.GetResultURL())
}

// ===========================================================================
// Mock adaptor for settleTaskBillingOnComplete tests
// ===========================================================================

type mockAdaptor struct {
	adjustReturn int
	parseResult  *relaycommon.TaskInfo
	responseBody string
}

func (m *mockAdaptor) Init(_ *relaycommon.RelayInfo) {}
func (m *mockAdaptor) FetchTask(string, string, map[string]any, string) (*http.Response, error) {
	body := m.responseBody
	if body == "" {
		body = `{}`
	}
	return &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(body)),
	}, nil
}
func (m *mockAdaptor) ParseTaskResult([]byte) (*relaycommon.TaskInfo, error) {
	return m.parseResult, nil
}
func (m *mockAdaptor) AdjustBillingOnComplete(_ *model.Task, _ *relaycommon.TaskInfo) int {
	return m.adjustReturn
}

// ===========================================================================
// PerCallBilling tests — settleTaskBillingOnComplete
// ===========================================================================

func TestSettle_PerCallBilling_SkipsAdaptorAdjust(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, tokenID, channelID = 30, 30, 30
	const initQuota, preConsumed = 10000, 5000
	const tokenRemain = 8000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-percall-adaptor", tokenRemain)
	seedChannel(t, channelID)

	task := makeTask(userID, channelID, preConsumed, tokenID, BillingSourceWallet, 0)
	task.PrivateData.BillingContext.PerCallBilling = true

	adaptor := &mockAdaptor{adjustReturn: 2000}
	taskResult := &relaycommon.TaskInfo{Status: model.TaskStatusSuccess}

	settleTaskBillingOnComplete(ctx, adaptor, task, taskResult)

	// Per-call: no adjustment despite adaptor returning 2000
	assert.Equal(t, initQuota, getUserQuota(t, userID))
	assert.Equal(t, tokenRemain, getTokenRemainQuota(t, tokenID))
	assert.Equal(t, preConsumed, task.Quota)
	assert.Equal(t, int64(0), countLogs(t))
}

func TestSettle_PerCallBilling_SkipsTotalTokens(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, tokenID, channelID = 31, 31, 31
	const initQuota, preConsumed = 10000, 4000
	const tokenRemain = 7000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-percall-tokens", tokenRemain)
	seedChannel(t, channelID)

	task := makeTask(userID, channelID, preConsumed, tokenID, BillingSourceWallet, 0)
	task.PrivateData.BillingContext.PerCallBilling = true

	adaptor := &mockAdaptor{adjustReturn: 0}
	taskResult := &relaycommon.TaskInfo{Status: model.TaskStatusSuccess, TotalTokens: 9999}

	settleTaskBillingOnComplete(ctx, adaptor, task, taskResult)

	// Per-call: no recalculation by tokens
	assert.Equal(t, initQuota, getUserQuota(t, userID))
	assert.Equal(t, tokenRemain, getTokenRemainQuota(t, tokenID))
	assert.Equal(t, preConsumed, task.Quota)
	assert.Equal(t, int64(0), countLogs(t))
}

func TestSettle_NonPerCall_AdaptorAdjustWorks(t *testing.T) {
	truncate(t)
	ctx := context.Background()

	const userID, tokenID, channelID = 32, 32, 32
	const initQuota, preConsumed = 10000, 5000
	const adaptorQuota = 3000
	const tokenRemain = 8000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-nonpercall-adj", tokenRemain)
	seedChannel(t, channelID)

	task := makeTask(userID, channelID, preConsumed, tokenID, BillingSourceWallet, 0)
	// PerCallBilling defaults to false

	adaptor := &mockAdaptor{adjustReturn: adaptorQuota}
	taskResult := &relaycommon.TaskInfo{Status: model.TaskStatusSuccess}

	settleTaskBillingOnComplete(ctx, adaptor, task, taskResult)

	// Non-per-call: adaptor adjustment applies (refund 2000)
	assert.Equal(t, initQuota+(preConsumed-adaptorQuota), getUserQuota(t, userID))
	assert.Equal(t, tokenRemain+(preConsumed-adaptorQuota), getTokenRemainQuota(t, tokenID))
	assert.Equal(t, adaptorQuota, task.Quota)

	log := getLastLog(t)
	require.NotNil(t, log)
	assert.Equal(t, model.LogTypeRefund, log.Type)
}
