package controller

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func setupChannelControllerTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	gin.SetMode(gin.TestMode)
	common.UsingSQLite = true
	common.UsingMySQL = false
	common.UsingPostgreSQL = false
	common.RedisEnabled = false

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open sqlite db: %v", err)
	}
	model.DB = db
	model.LOG_DB = db

	if err := db.AutoMigrate(&model.Channel{}, &model.Ability{}); err != nil {
		t.Fatalf("failed to migrate channel tables: %v", err)
	}
	model.InitChannelCache()

	t.Cleanup(func() {
		sqlDB, err := db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	})

	return db
}

func seedChannel(t *testing.T, db *gorm.DB, channel *model.Channel) *model.Channel {
	t.Helper()
	if err := db.Create(channel).Error; err != nil {
		t.Fatalf("failed to create channel: %v", err)
	}
	if err := channel.AddAbilities(nil); err != nil {
		t.Fatalf("failed to add channel abilities: %v", err)
	}
	model.InitChannelCache()
	return channel
}

func TestUpdateChannelRejectsUpgradeToMultiKeyWithLessThanTwoKeys(t *testing.T) {
	db := setupChannelControllerTestDB(t)
	channel := seedChannel(t, db, &model.Channel{
		Id:          1,
		Type:        constant.ChannelTypeAnthropic,
		Key:         "sk-old",
		Name:        "single-key-channel",
		Status:      common.ChannelStatusEnabled,
		Models:      "claude-opus-4-6",
		Group:       "default",
		CreatedTime: 1,
	})

	ctx, recorder := newAuthenticatedContext(t, http.MethodPut, "/api/channel/", map[string]any{
		"id":             channel.Id,
		"type":           channel.Type,
		"name":           channel.Name,
		"status":         channel.Status,
		"models":         channel.Models,
		"group":          channel.Group,
		"key":            "",
		"key_mode":       "append",
		"multi_key_mode": "random",
	}, 1)

	UpdateChannel(ctx)

	response := decodeAPIResponse(t, recorder)
	if response.Success {
		t.Fatalf("expected update failure, got success")
	}
	if response.Message != "升级为多密钥渠道时，至少需要两个有效密钥" {
		t.Fatalf("unexpected error message: %s", response.Message)
	}

	stored, err := model.GetChannelById(channel.Id, true)
	if err != nil {
		t.Fatalf("failed to reload channel: %v", err)
	}
	if stored.ChannelInfo.IsMultiKey {
		t.Fatalf("expected channel to remain single-key after rejection")
	}
	if stored.Key != "sk-old" {
		t.Fatalf("expected original key to remain unchanged, got %q", stored.Key)
	}
}

func TestUpdateChannelUpgradesSingleKeyChannelToMultiKey(t *testing.T) {
	db := setupChannelControllerTestDB(t)
	channel := seedChannel(t, db, &model.Channel{
		Id:          2,
		Type:        constant.ChannelTypeAnthropic,
		Key:         "sk-old",
		Name:        "upgradable-channel",
		Status:      common.ChannelStatusEnabled,
		Models:      "claude-opus-4-6",
		Group:       "default",
		CreatedTime: 1,
	})

	ctx, recorder := newAuthenticatedContext(t, http.MethodPut, "/api/channel/", map[string]any{
		"id":             channel.Id,
		"type":           channel.Type,
		"name":           channel.Name,
		"status":         channel.Status,
		"models":         channel.Models,
		"group":          channel.Group,
		"key":            "sk-new-1\nsk-new-2",
		"key_mode":       "append",
		"multi_key_mode": "random",
	}, 1)

	UpdateChannel(ctx)

	response := decodeAPIResponse(t, recorder)
	if !response.Success {
		t.Fatalf("expected update success, got message: %s", response.Message)
	}

	stored, err := model.GetChannelById(channel.Id, true)
	if err != nil {
		t.Fatalf("failed to reload channel: %v", err)
	}
	if !stored.ChannelInfo.IsMultiKey {
		t.Fatalf("expected channel to upgrade to multi-key")
	}
	if stored.ChannelInfo.MultiKeySize != 3 {
		t.Fatalf("expected multi_key_size=3, got %d", stored.ChannelInfo.MultiKeySize)
	}
	if stored.ChannelInfo.MultiKeyMode != constant.MultiKeyModeRandom {
		t.Fatalf("expected random multi-key mode, got %q", stored.ChannelInfo.MultiKeyMode)
	}
	if stored.Key != "sk-old\nsk-new-1\nsk-new-2" {
		t.Fatalf("unexpected stored key list: %q", stored.Key)
	}
}
