package controller

import "testing"

func TestStripeAmountCentsRoundsToMinorUnits(t *testing.T) {
	cases := []struct {
		name   string
		amount float64
		want   int64
	}{
		{name: "whole dollars", amount: 10, want: 1000},
		{name: "discounted cents", amount: 8.5, want: 850},
		{name: "rounding", amount: 1.235, want: 124},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := stripeAmountCents(tc.amount); got != tc.want {
				t.Fatalf("stripeAmountCents(%v) = %d, want %d", tc.amount, got, tc.want)
			}
		})
	}
}
