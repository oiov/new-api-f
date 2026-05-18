package dto

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestGeminiToolConfigPreservesIncludeServerSideToolInvocationsFalse(t *testing.T) {
	raw := []byte(`{
		"contents":[{"role":"user","parts":[{"text":"hello"}]}],
		"toolConfig":{
			"includeServerSideToolInvocations": false
		}
	}`)

	var req GeminiChatRequest
	require.NoError(t, common.Unmarshal(raw, &req))
	require.NotNil(t, req.ToolConfig)
	require.NotNil(t, req.ToolConfig.IncludeServerSideToolInvocations)
	require.False(t, *req.ToolConfig.IncludeServerSideToolInvocations)

	encoded, err := common.Marshal(req)
	require.NoError(t, err)
	require.JSONEq(t, `{"includeServerSideToolInvocations":false}`, string(mustMarshalToolConfig(t, encoded)))
}

func mustMarshalToolConfig(t *testing.T, encoded []byte) []byte {
	t.Helper()
	var out struct {
		ToolConfig map[string]any `json:"toolConfig"`
	}
	require.NoError(t, common.Unmarshal(encoded, &out))
	data, err := common.Marshal(out.ToolConfig)
	require.NoError(t, err)
	return data
}
