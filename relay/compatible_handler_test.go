package relay

import (
	"testing"

	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
)

func TestShouldUseTextPassThroughBypassesGPTImage2ChatCompatibility(t *testing.T) {
	info := &relaycommon.RelayInfo{
		RelayMode:       relayconstant.RelayModeChatCompletions,
		OriginModelName: "gpt-image-2-vip",
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelSetting: dto.ChannelSettings{PassThroughBodyEnabled: true},
		},
	}

	if shouldUseTextPassThrough(false, info) {
		t.Fatal("expected channel pass-through to be bypassed for chat gpt-image-2 compatibility")
	}
	if shouldUseTextPassThrough(true, info) {
		t.Fatal("expected global pass-through to be bypassed for chat gpt-image-2 compatibility")
	}
}

func TestShouldUseTextPassThroughPreservesRegularChatAndImageEndpointBehavior(t *testing.T) {
	textInfo := &relaycommon.RelayInfo{
		RelayMode:       relayconstant.RelayModeChatCompletions,
		OriginModelName: "gpt-4o",
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelSetting: dto.ChannelSettings{PassThroughBodyEnabled: true},
		},
	}
	if !shouldUseTextPassThrough(false, textInfo) {
		t.Fatal("expected regular chat pass-through behavior to be preserved")
	}

	imageEndpointInfo := &relaycommon.RelayInfo{
		RelayMode:       relayconstant.RelayModeImagesGenerations,
		OriginModelName: "gpt-image-2-vip",
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelSetting: dto.ChannelSettings{PassThroughBodyEnabled: true},
		},
	}
	if !shouldUseTextPassThrough(false, imageEndpointInfo) {
		t.Fatal("expected direct image endpoint pass-through behavior to be untouched")
	}
}
