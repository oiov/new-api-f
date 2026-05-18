package dto

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

func TestImageRequestPreservesEditReferenceFields(t *testing.T) {
	raw := []byte(`{
		"model": "gpt-image-1",
		"prompt": "make the hat blue",
		"image": "data:image/png;base64,aW1hZ2U=",
		"images": ["data:image/png;base64,cmVmMQ==", "data:image/png;base64,cmVmMg=="],
		"mask": "data:image/png;base64,bWFzaw==",
		"input_fidelity": "high"
	}`)

	var req ImageRequest
	require.NoError(t, common.Unmarshal(raw, &req))

	encoded, err := common.Marshal(req)
	require.NoError(t, err)

	require.True(t, gjson.GetBytes(encoded, "image").Exists())
	require.True(t, gjson.GetBytes(encoded, "images").Exists())
	require.True(t, gjson.GetBytes(encoded, "mask").Exists())
	require.True(t, gjson.GetBytes(encoded, "input_fidelity").Exists())
	require.Len(t, gjson.GetBytes(encoded, "images").Array(), 2)
	require.Equal(t, "high", gjson.GetBytes(encoded, "input_fidelity").String())
}
