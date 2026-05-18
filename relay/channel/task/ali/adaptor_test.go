package ali

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestAliUsageAcceptsStringValues(t *testing.T) {
	raw := []byte(`{
		"output": {"task_id": "task_1", "task_status": "SUCCEEDED"},
		"request_id": "req_1",
		"usage": {
			"duration": "5",
			"video_count": "1",
			"SR": "2"
		}
	}`)

	var resp AliVideoResponse
	require.NoError(t, common.Unmarshal(raw, &resp))
	require.NotNil(t, resp.Usage)
	require.Equal(t, 5, int(resp.Usage.Duration))
	require.Equal(t, 1, int(resp.Usage.VideoCount))
	require.Equal(t, 2, int(resp.Usage.SR))
}
