package controller

import (
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBatchDeleteLogsDeletesSelectedIds(t *testing.T) {
	db := setupLogGroupHealthControllerTestDB(t)
	require.NoError(t, db.Create(&[]model.Log{
		{Id: 1, UserId: 1, Type: model.LogTypeConsume},
		{Id: 2, UserId: 2, Type: model.LogTypeConsume},
		{Id: 3, UserId: 3, Type: model.LogTypeConsume},
	}).Error)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/log/batch_delete", map[string]any{
		"ids": []int{1, 2, 2, 0, -1},
	}, 1)
	BatchDeleteLogs(ctx)

	response := decodeAPIResponse(t, recorder)
	require.True(t, response.Success, response.Message)
	var deleted int64
	require.NoError(t, common.Unmarshal(response.Data, &deleted))
	assert.EqualValues(t, 2, deleted)

	var remaining []model.Log
	require.NoError(t, db.Order("id asc").Find(&remaining).Error)
	require.Len(t, remaining, 1)
	assert.Equal(t, 3, remaining[0].Id)
}

func TestBatchDeleteLogsRejectsEmptyIds(t *testing.T) {
	setupLogGroupHealthControllerTestDB(t)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/log/batch_delete", map[string]any{
		"ids": []int{0, -1},
	}, 1)
	BatchDeleteLogs(ctx)

	response := decodeAPIResponse(t, recorder)
	assert.False(t, response.Success)
	assert.Contains(t, response.Message, "请选择要删除的日志")
}

func TestBatchDeleteLogsRejectsTooManyIds(t *testing.T) {
	setupLogGroupHealthControllerTestDB(t)
	ids := make([]int, maxBatchDeleteLogCount+1)
	for i := range ids {
		ids[i] = i + 1
	}

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/log/batch_delete", map[string]any{
		"ids": ids,
	}, 1)
	BatchDeleteLogs(ctx)

	response := decodeAPIResponse(t, recorder)
	assert.False(t, response.Success)
	assert.Contains(t, response.Message, "单次最多删除")
}
