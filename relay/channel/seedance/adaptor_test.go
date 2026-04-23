package seedance

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSeedanceAdaptorChannelMetadata(t *testing.T) {
	adaptor := &Adaptor{}

	require.Equal(t, ChannelName, adaptor.GetChannelName())
	require.Equal(t, ModelList, adaptor.GetModelList())
}
