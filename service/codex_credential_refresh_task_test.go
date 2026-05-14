package service

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestShouldAutoRefreshCodexChannelStatusIncludesAutoDisabled(t *testing.T) {
	require.True(t, shouldAutoRefreshCodexChannelStatus(common.ChannelStatusEnabled))
	require.True(t, shouldAutoRefreshCodexChannelStatus(common.ChannelStatusAutoDisabled))
	require.False(t, shouldAutoRefreshCodexChannelStatus(common.ChannelStatusManuallyDisabled))
}
