package seedance2

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSeedance2AdaptorChannelMetadata(t *testing.T) {
	adaptor := &Adaptor{}

	require.Equal(t, ChannelName, adaptor.GetChannelName())
	require.Equal(t, ModelList, adaptor.GetModelList())
}
