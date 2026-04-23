package common

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/require"
)

func TestSeedanceEndpointTypesPreferOpenAIVideo(t *testing.T) {
	endpointTypes := GetEndpointTypesByChannelType(constant.ChannelTypeSeedance, "seedance-2-cheap")

	require.NotEmpty(t, endpointTypes)
	require.Equal(t, constant.EndpointTypeOpenAIVideo, endpointTypes[0])
}
