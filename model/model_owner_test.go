package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/require"
)

// 回归测试 (#4416): GetPreferredModelOwnerChannelTypes 从活跃渠道(abilities+channels)
// 解析模型对应的渠道类型，并尊重 group 过滤、只取 enabled 渠道。
func TestGetPreferredModelOwnerChannelTypes(t *testing.T) {
	withChannelUsageTestDB(t, func() {
		// withChannelUsageTestDB 不初始化列名，这里据 SQLite 初始化并隔离恢复。
		oldGroupCol, oldKeyCol := commonGroupCol, commonKeyCol
		oldTrue, oldFalse := commonTrueVal, commonFalseVal
		initCol()
		t.Cleanup(func() {
			commonGroupCol, commonKeyCol = oldGroupCol, oldKeyCol
			commonTrueVal, commonFalseVal = oldTrue, oldFalse
		})

		ch := &Channel{
			Id:       1,
			Name:     "openai-ch",
			Key:      "sk-x",
			Status:   common.ChannelStatusEnabled,
			Type:     constant.ChannelTypeOpenAI,
			Group:    "default",
			Models:   "gpt-test",
			Weight:   common.GetPointer[uint](0),
			Priority: common.GetPointer[int64](0),
		}
		require.NoError(t, DB.Create(ch).Error)
		require.NoError(t, ch.AddAbilities(nil))

		// 命中: group 匹配 + enabled 渠道
		owners, err := GetPreferredModelOwnerChannelTypes([]string{"gpt-test"}, []string{"default"})
		require.NoError(t, err)
		require.Equal(t, constant.ChannelTypeOpenAI, owners["gpt-test"])

		// group 不匹配则不返回
		owners2, err := GetPreferredModelOwnerChannelTypes([]string{"gpt-test"}, []string{"other-group"})
		require.NoError(t, err)
		require.NotContains(t, owners2, "gpt-test")

		// 无 group 过滤时仍能解析
		owners3, err := GetPreferredModelOwnerChannelTypes([]string{"gpt-test"}, nil)
		require.NoError(t, err)
		require.Equal(t, constant.ChannelTypeOpenAI, owners3["gpt-test"])

		// 空输入
		owners4, err := GetPreferredModelOwnerChannelTypes(nil, nil)
		require.NoError(t, err)
		require.Empty(t, owners4)
	})
}
