package model

import "testing"

func TestEstimateList(t *testing.T) {
	cases := []struct {
		name    string
		s       UserSignals
		wantEst int
		wantMin bool
	}{
		{"单人", UserSignals{SubnetClusters: 1, DistinctGeo: 1, TokenCount: 1, RequestCount: 5, HasIpData: true}, 1, false},
		{"多国多token", UserSignals{SubnetClusters: 3, DistinctGeo: 4, TokenCount: 5, RequestCount: 50, HasIpData: true}, 5, false},
		{"单IP高请求疑似中转", UserSignals{SubnetClusters: 1, DistinctGeo: 1, TokenCount: 1, RequestCount: 500, HasIpData: true}, 1, true},
		{"无IP不算集中", UserSignals{SubnetClusters: 0, DistinctGeo: 0, TokenCount: 3, RequestCount: 500, HasIpData: false}, 3, false},
	}
	for _, c := range cases {
		est, isMin := EstimateList(c.s)
		if est != c.wantEst || isMin != c.wantMin {
			t.Errorf("%s: got (%d,%v) want (%d,%v)", c.name, est, isMin, c.wantEst, c.wantMin)
		}
	}
}

func TestListConfidence(t *testing.T) {
	if got := ListConfidence(UserSignals{DistinctGeo: 3, TokenCount: 3, RequestCount: 50, HasIpData: true}); got != "high" {
		t.Errorf("multi-geo+multi-token want high got %s", got)
	}
	if got := ListConfidence(UserSignals{HasIpData: false, RequestCount: 500}); got != "low" {
		t.Errorf("no-ip want low got %s", got)
	}
	if got := ListConfidence(UserSignals{SubnetClusters: 2, DistinctGeo: 1, RequestCount: 50, HasIpData: true}); got != "medium" {
		t.Errorf("multi-ip same-country want medium got %s", got)
	}
}

func TestMaxConcurrency(t *testing.T) {
	iv := []Interval{{0, 10}, {5, 15}, {20, 25}}
	if got := MaxConcurrency(iv); got != 2 {
		t.Errorf("MaxConcurrency=%d want 2", got)
	}
	if got := MaxConcurrency(nil); got != 0 {
		t.Errorf("empty want 0 got %d", got)
	}
}

func TestInputDispersionScore(t *testing.T) {
	rows := []ConcurRow{{Start: 0, End: 10, PromptTokens: 50}, {Start: 2, End: 8, PromptTokens: 40000}}
	if got := InputDispersionScore(rows); got < 2 {
		t.Errorf("cross-magnitude concurrent want >=2 got %d", got)
	}
	rows2 := []ConcurRow{{Start: 0, End: 5, PromptTokens: 50}, {Start: 100, End: 105, PromptTokens: 40000}}
	if got := InputDispersionScore(rows2); got >= 2 {
		t.Errorf("non-concurrent want <2 got %d", got)
	}
}

func TestEstimateDrawerTransit(t *testing.T) {
	s := UserSignals{SubnetClusters: 1, DistinctGeo: 1, TokenCount: 1, RequestCount: 500, HasIpData: true}
	est, isMin, concl := EstimateDrawer(s, 4, 2)
	if est != 4 || !isMin || concl == "" {
		t.Errorf("transit: got (%d,%v,%q)", est, isMin, concl)
	}
	s2 := UserSignals{SubnetClusters: 0, HasIpData: false, RequestCount: 500}
	_, _, concl2 := EstimateDrawer(s2, 9, 3)
	if concl2 == transitConclusion {
		t.Error("no-ip must not be transit")
	}
}
