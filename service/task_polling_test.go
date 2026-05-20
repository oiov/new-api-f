package service

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestVideoTaskPollingIntervalIsAtLeastTenSeconds(t *testing.T) {
	require.GreaterOrEqual(t, videoTaskPollingInterval, 10*time.Second)
}
