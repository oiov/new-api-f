package zhipu_4v

import (
	"testing"

	channelconstant "github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/stretchr/testify/require"
)

func TestGetRequestURLUsesSpecialOpenAIBaseForImageGeneration(t *testing.T) {
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelBaseUrl: "glm-coding-plan",
		},
		RelayMode: relayconstant.RelayModeImagesGenerations,
	}

	got, err := (&Adaptor{}).GetRequestURL(info)
	require.NoError(t, err)
	require.Equal(t, channelconstant.ChannelSpecialBases["glm-coding-plan"].OpenAIBaseURL+"/images/generations", got)
}
