package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestShouldUseStreamForAutomaticChannelTestUsesStreamForCodex(t *testing.T) {
	require.True(t, shouldUseStreamForAutomaticChannelTest(&model.Channel{Type: constant.ChannelTypeCodex}))
	require.False(t, shouldUseStreamForAutomaticChannelTest(&model.Channel{Type: constant.ChannelTypeOpenAI}))
	require.False(t, shouldUseStreamForAutomaticChannelTest(nil))
}

func TestValidateStreamTestResponseBodyRequiresValidDataEvent(t *testing.T) {
	require.NoError(t, validateStreamTestResponseBody([]byte("data: {\"id\":\"chunk\"}\n\ndata: [DONE]\n")))
	require.Error(t, validateStreamTestResponseBody([]byte("")))
	require.Error(t, validateStreamTestResponseBody([]byte("data: [DONE]\n")))
	require.Error(t, validateStreamTestResponseBody([]byte(": keepalive\n\n")))
}
