package model

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/require"
)

func TestHasChatEndpoint(t *testing.T) {
	require.True(t, hasChatEndpoint([]constant.EndpointType{constant.EndpointTypeAnthropic}))
	require.True(t, hasChatEndpoint([]constant.EndpointType{constant.EndpointTypeOpenAI, constant.EndpointTypeEmbeddings}))
	require.False(t, hasChatEndpoint([]constant.EndpointType{constant.EndpointTypeEmbeddings}))
	require.False(t, hasChatEndpoint([]constant.EndpointType{constant.EndpointTypeJinaRerank, constant.EndpointTypeImageGeneration}))
	require.False(t, hasChatEndpoint(nil))
}
