package model

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestCalcPlanEndTime_FixedClockDayDeadline(t *testing.T) {
	plan := &SubscriptionPlan{
		Title:                   "Claude Nano Day",
		DurationUnit:            SubscriptionDurationDay,
		DurationValue:           1,
		QuotaResetPeriod:        SubscriptionResetNever,
		QuotaResetUseFixedClock: true,
		QuotaResetFixedSeconds:  8 * 3600,
	}

	start := time.Date(2026, 4, 11, 10, 30, 0, 0, subscriptionResetLocation)
	endUnix, err := calcPlanEndTime(start, plan)
	require.NoError(t, err)

	expected := time.Date(2026, 4, 12, 8, 0, 0, 0, subscriptionResetLocation).Unix()
	require.Equal(t, expected, endUnix)
}

func TestCalcPlanEndTime_FixedClockDayDeadline_NonClaudeFallsBackToNaturalDay(t *testing.T) {
	plan := &SubscriptionPlan{
		Title:                   "General Day Pass",
		DurationUnit:            SubscriptionDurationDay,
		DurationValue:           1,
		QuotaResetPeriod:        SubscriptionResetNever,
		QuotaResetUseFixedClock: true,
		QuotaResetFixedSeconds:  8 * 3600,
	}

	start := time.Date(2026, 4, 11, 10, 30, 0, 0, subscriptionResetLocation)
	endUnix, err := calcPlanEndTime(start, plan)
	require.NoError(t, err)

	require.Equal(t, start.Add(24*time.Hour).Unix(), endUnix)
}

func TestApplyPlanDurationToUnix_FixedClockDayDeadline(t *testing.T) {
	plan := &SubscriptionPlan{
		Title:                   "Claude Lite Day",
		DurationUnit:            SubscriptionDurationDay,
		DurationValue:           1,
		QuotaResetPeriod:        SubscriptionResetNever,
		QuotaResetUseFixedClock: true,
		QuotaResetFixedSeconds:  8 * 3600,
	}

	base := time.Date(2026, 4, 11, 22, 15, 0, 0, subscriptionResetLocation).Unix()
	endUnix, err := applyPlanDurationToUnix(base, plan, 1, 1)
	require.NoError(t, err)

	expected := time.Date(2026, 4, 12, 8, 0, 0, 0, subscriptionResetLocation).Unix()
	require.Equal(t, expected, endUnix)
}
