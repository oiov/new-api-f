package dto

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestResponsesOutputArgumentsAcceptRawJSON(t *testing.T) {
	raw := []byte(`{
		"type": "function_call",
		"call_id": "call_1",
		"name": "weather",
		"arguments": {"city":"Paris","days":0,"strict":false}
	}`)

	var out ResponsesOutput
	require.NoError(t, common.Unmarshal(raw, &out))

	require.JSONEq(t, `{"city":"Paris","days":0,"strict":false}`, out.ArgumentsString())
}

func TestResponsesOutputArgumentsStringDecodesJSONString(t *testing.T) {
	raw := []byte(`{
		"type": "function_call",
		"call_id": "call_1",
		"name": "weather",
		"arguments": "{\"city\":\"Paris\",\"days\":0,\"strict\":false}"
	}`)

	var out ResponsesOutput
	require.NoError(t, common.Unmarshal(raw, &out))

	require.JSONEq(t, `{"city":"Paris","days":0,"strict":false}`, out.ArgumentsString())
}
