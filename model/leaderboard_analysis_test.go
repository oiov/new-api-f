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
