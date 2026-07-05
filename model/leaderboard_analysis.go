package model

const listTransitReqThreshold = 200 // T_LIST

// UserSignals 便宜信号（列表档）。
type UserSignals struct {
	SubnetClusters int
	DistinctGeo    int
	TokenCount     int
	RequestCount   int
	HasIpData      bool
}

// EstimateList 列表头条估计 + 是否「≥N」。
func EstimateList(s UserSignals) (estimate int, estimateIsMin bool) {
	base := s.SubnetClusters
	if s.DistinctGeo > base {
		base = s.DistinctGeo
	}
	estimate = base
	if s.TokenCount > base {
		estimate = s.TokenCount
	}
	if estimate < 1 {
		estimate = 1
	}
	estimateIsMin = s.HasIpData &&
		s.SubnetClusters >= 1 && s.SubnetClusters <= 2 &&
		s.RequestCount >= listTransitReqThreshold
	return
}

// ListConfidence 列表档置信度（仅便宜信号）。
func ListConfidence(s UserSignals) string {
	if !s.HasIpData || s.RequestCount < 10 || (s.SubnetClusters == 0 && s.DistinctGeo == 0) {
		return "low"
	}
	multiGeo := s.DistinctGeo >= 2
	multiToken := s.TokenCount >= 2
	multiIp := s.SubnetClusters >= 2
	if multiGeo && multiToken {
		return "high"
	}
	if multiIp || multiToken {
		return "medium"
	}
	return "low"
}
