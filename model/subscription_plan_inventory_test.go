package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSubscriptionPlanInventoryHelpers_Limited(t *testing.T) {
	plan := &SubscriptionPlan{
		SaleLimitCount: 10,
		SoldCount:      4,
	}

	assert.True(t, plan.HasSaleLimit())
	assert.EqualValues(t, 6, plan.GetRemainingSaleCount())
	assert.False(t, plan.IsSoldOut())

	plan.ApplyDisplayInventory()
	assert.EqualValues(t, 6, plan.RemainingSaleCount)
	assert.False(t, plan.SoldOut)
}

func TestSubscriptionPlanInventoryHelpers_SoldOut(t *testing.T) {
	plan := &SubscriptionPlan{
		SaleLimitCount: 5,
		SoldCount:      5,
	}

	assert.True(t, plan.HasSaleLimit())
	assert.EqualValues(t, 0, plan.GetRemainingSaleCount())
	assert.True(t, plan.IsSoldOut())

	plan.ApplyDisplayInventory()
	assert.EqualValues(t, 0, plan.RemainingSaleCount)
	assert.True(t, plan.SoldOut)
}

func TestSubscriptionPlanInventoryHelpers_Unlimited(t *testing.T) {
	plan := &SubscriptionPlan{
		SaleLimitCount: 0,
		SoldCount:      12,
	}

	assert.False(t, plan.HasSaleLimit())
	assert.EqualValues(t, 0, plan.GetRemainingSaleCount())
	assert.False(t, plan.IsSoldOut())

	plan.ApplyDisplayInventory()
	assert.EqualValues(t, 0, plan.RemainingSaleCount)
	assert.False(t, plan.SoldOut)
}
