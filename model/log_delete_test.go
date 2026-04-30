package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDeleteLogsByIds(t *testing.T) {
	withGroupLogHealthTestDB(t, func() {
		logs := []*Log{
			{Id: 1, Type: LogTypeConsume},
			{Id: 2, Type: LogTypeConsume},
			{Id: 3, Type: LogTypeConsume},
		}
		require.NoError(t, LOG_DB.Create(&logs).Error)

		deleted, err := DeleteLogsByIds([]int{1, 3})
		require.NoError(t, err)
		assert.EqualValues(t, 2, deleted)

		var remaining []Log
		require.NoError(t, LOG_DB.Order("id asc").Find(&remaining).Error)
		require.Len(t, remaining, 1)
		assert.Equal(t, 2, remaining[0].Id)
	})
}
