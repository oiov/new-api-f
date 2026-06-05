package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 回归测试 (#4983): handlerMultiKeyUpdate 的健壮性。

func newMultiKeyChannel() *Channel {
	return &Channel{
		Id:     1,
		Name:   "mk",
		Key:    "sk-a\nsk-b",
		Status: common.ChannelStatusEnabled,
		Group:  "default",
		Models: "gpt-4o-mini",
		ChannelInfo: ChannelInfo{
			IsMultiKey:         true,
			MultiKeySize:       2,
			MultiKeyStatusList: map[int]int{},
		},
		Weight:   common.GetPointer[uint](0),
		Priority: common.GetPointer[int64](0),
	}
}

func routingHasChannel(group, model string, id int) bool {
	for _, cid := range group2model2channels[group][model] {
		if cid == id {
			return true
		}
	}
	return false
}

// 缺失的 usingKey（非空但不在 keys 中）不得误禁用 index 0。
func TestHandlerMultiKeyUpdateMissingKeyDoesNotDisableIndexZero(t *testing.T) {
	ch := newMultiKeyChannel()
	handlerMultiKeyUpdate(ch, "sk-not-exist", common.ChannelStatusAutoDisabled, "boom")
	assert.NotContains(t, ch.ChannelInfo.MultiKeyStatusList, 0, "未匹配的 key 不应禁用 index 0")
	assert.Equal(t, common.ChannelStatusEnabled, ch.Status, "渠道状态不应被未匹配的 key 改变")
}

// 全部 key 被禁用后，渠道应自动禁用。
func TestHandlerMultiKeyUpdateAllKeysDisabledAutoDisablesChannel(t *testing.T) {
	ch := newMultiKeyChannel()
	handlerMultiKeyUpdate(ch, "sk-a", common.ChannelStatusAutoDisabled, "boom")
	assert.Equal(t, common.ChannelStatusEnabled, ch.Status, "仍有可用 key 时渠道保持启用")

	handlerMultiKeyUpdate(ch, "sk-b", common.ChannelStatusAutoDisabled, "boom")
	assert.Equal(t, common.ChannelStatusAutoDisabled, ch.Status, "全部 key 禁用后渠道自动禁用")
}

// 重新启用任一 key 后，渠道应从自动禁用恢复为启用。
func TestHandlerMultiKeyUpdateReenableRestoresChannel(t *testing.T) {
	ch := newMultiKeyChannel()
	ch.ChannelInfo.MultiKeyStatusList = map[int]int{
		0: common.ChannelStatusAutoDisabled,
		1: common.ChannelStatusAutoDisabled,
	}
	ch.Status = common.ChannelStatusAutoDisabled

	handlerMultiKeyUpdate(ch, "sk-a", common.ChannelStatusEnabled, "")
	require.NotContains(t, ch.ChannelInfo.MultiKeyStatusList, 0, "启用的 key 应从禁用列表移除")
	assert.Equal(t, common.ChannelStatusEnabled, ch.Status, "重新启用 key 后渠道应恢复启用")
}

// 集成测试 (#4983): 多 key 渠道全部 key 禁用后，必须从路由缓存
// group2model2channels 中驱逐，避免后续请求继续选中无可用 key 的渠道。
func TestUpdateChannelStatusEvictsMultiKeyChannelWhenAllKeysDisabled(t *testing.T) {
	withChannelUsageTestDB(t, func() {
		ch := newMultiKeyChannel()
		require.NoError(t, DB.Create(ch).Error)
		require.NoError(t, ch.AddAbilities(nil))
		InitChannelCache()

		require.True(t, routingHasChannel("default", "gpt-4o-mini", 1), "初始应在路由缓存中")

		// 禁用第一个 key：仍有可用 key，不应驱逐。
		UpdateChannelStatus(1, "sk-a", common.ChannelStatusAutoDisabled, "boom")
		assert.True(t, routingHasChannel("default", "gpt-4o-mini", 1), "仍有可用 key 时不应驱逐")

		// 禁用第二个 key：无可用 key，应自动禁用并从路由缓存驱逐。
		UpdateChannelStatus(1, "sk-b", common.ChannelStatusAutoDisabled, "boom")
		cached, err := CacheGetChannel(1)
		require.NoError(t, err)
		assert.Equal(t, common.ChannelStatusAutoDisabled, cached.Status, "全部 key 禁用后渠道应自动禁用")
		assert.False(t, routingHasChannel("default", "gpt-4o-mini", 1), "全部 key 禁用后应从路由缓存驱逐")
	})
}
