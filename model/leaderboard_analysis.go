package model

import "sort"

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

const (
	transitK          = 3
	transitConclusion = "疑似自建中转分发"
)

type Interval struct{ Start, End int64 }

type ConcurRow struct {
	Start, End   int64
	PromptTokens int
}

// MaxConcurrency 扫描线求最大重叠数。
func MaxConcurrency(iv []Interval) int {
	if len(iv) == 0 {
		return 0
	}
	type ev struct {
		t     int64
		delta int
	}
	evs := make([]ev, 0, len(iv)*2)
	for _, x := range iv {
		end := x.End
		if end < x.Start {
			end = x.Start
		}
		evs = append(evs, ev{x.Start, 1}, ev{end, -1})
	}
	// 同一时刻先减后加，避免相邻端点误判并发（[a,b) 语义）
	sort.Slice(evs, func(i, j int) bool {
		if evs[i].t != evs[j].t {
			return evs[i].t < evs[j].t
		}
		return evs[i].delta < evs[j].delta
	})
	cur, max := 0, 0
	for _, e := range evs {
		cur += e.delta
		if cur > max {
			max = cur
		}
	}
	return max
}

// magnitudeBucket 返回 prompt_tokens 的数量级桶序号 0..4。
func magnitudeBucket(p int) int {
	switch {
	case p < 100:
		return 0
	case p < 1000:
		return 1
	case p < 10000:
		return 2
	case p < 100000:
		return 3
	default:
		return 4
	}
}

// InputDispersionScore：并发重叠期间「同时活跃请求」落入的 distinct 数量级桶数的最大值。
// 扫描线 O(n log n)：半开区间 [Start,End)，同一时刻先减后加。
func InputDispersionScore(rows []ConcurRow) int {
	if len(rows) == 0 {
		return 0
	}
	type ev struct {
		t      int64
		delta  int
		bucket int
	}
	evs := make([]ev, 0, len(rows)*2)
	for _, r := range rows {
		end := r.End
		if end < r.Start {
			end = r.Start
		}
		b := magnitudeBucket(r.PromptTokens)
		evs = append(evs, ev{r.Start, 1, b}, ev{end, -1, b})
	}
	sort.Slice(evs, func(i, j int) bool {
		if evs[i].t != evs[j].t {
			return evs[i].t < evs[j].t
		}
		return evs[i].delta < evs[j].delta // 同一时刻 -1 先于 +1（半开区间）
	})
	var active [5]int
	distinct, best := 0, 0
	for _, e := range evs {
		if e.delta == 1 {
			if active[e.bucket] == 0 {
				distinct++
			}
			active[e.bucket]++
		} else {
			active[e.bucket]--
			if active[e.bucket] == 0 {
				distinct--
			}
		}
		if distinct > best {
			best = distinct
		}
	}
	return best
}

// EstimateDrawer 抽屉档估计 + 中转识别。
func EstimateDrawer(s UserSignals, maxConc, dispScore int) (estimate int, estimateIsMin bool, conclusion string) {
	est, isMin := EstimateList(s)
	estimate, estimateIsMin, conclusion = est, isMin, "单人或少量使用"
	if s.DistinctGeo >= 2 || s.SubnetClusters >= 3 {
		conclusion = "疑似分发给多个用户"
	}
	if s.HasIpData && s.SubnetClusters >= 1 && s.SubnetClusters <= 2 &&
		maxConc >= transitK && dispScore >= 2 {
		conclusion = transitConclusion
		estimateIsMin = true
		if maxConc > estimate {
			estimate = maxConc
		}
	}
	if !s.HasIpData {
		conclusion = "该账号未开启 IP 记录，地理与 IP 信号不可用"
	}
	return
}

// DrawerConfidence 抽屉档置信度（全信号，含并发）。
func DrawerConfidence(s UserSignals, maxConc int) string {
	if !s.HasIpData || s.RequestCount < 10 {
		return "low"
	}
	multiGeo := s.DistinctGeo >= 2
	multiToken := s.TokenCount >= 2
	highConc := maxConc >= transitK
	if multiGeo && (multiToken || highConc) {
		return "high"
	}
	if s.SubnetClusters >= 2 || multiToken || highConc {
		return "medium"
	}
	return "low"
}
