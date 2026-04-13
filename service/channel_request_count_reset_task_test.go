package service

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestCurrentChannelRequestResetMarkerBeforeEightAM(t *testing.T) {
	loc := time.FixedZone("UTC+8", 8*3600)
	oldLoc := channelRequestCountResetLocation
	channelRequestCountResetLocation = loc
	t.Cleanup(func() {
		channelRequestCountResetLocation = oldLoc
	})

	now := time.Date(2026, 4, 12, 7, 59, 0, 0, loc)
	assert.Equal(t, "2026-04-11", currentChannelRequestResetMarker(now))
}

func TestCurrentChannelRequestResetMarkerAtEightAM(t *testing.T) {
	loc := time.FixedZone("UTC+8", 8*3600)
	oldLoc := channelRequestCountResetLocation
	channelRequestCountResetLocation = loc
	t.Cleanup(func() {
		channelRequestCountResetLocation = oldLoc
	})

	now := time.Date(2026, 4, 12, 8, 0, 0, 0, loc)
	assert.Equal(t, "2026-04-12", currentChannelRequestResetMarker(now))
}
