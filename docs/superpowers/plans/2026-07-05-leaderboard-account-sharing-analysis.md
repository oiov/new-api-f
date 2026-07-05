# 天梯榜「账号共用分析」实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `web-worker` 天梯榜新增「分析」列（估计账号疑似几人共用 + 右侧抽屉证据明细），日期筛选升级为自定义时间段，榜单从固定 top20 升级为分页浏览全部有日志用户 + 按 user_id/用户名搜索。

**Architecture:** 混合式 —— 列表接口只算便宜信号（IP 子网簇 / 地理 / token 数）出「疑似 N 人」+ 置信度；抽屉接口按 user_id 拉该用户最近 5 万行原始日志算并发峰值 + 输入 token 离散度识别「真分发 vs 自建中转」。GeoIP 用离线 DB-IP City Lite（`geoip2-golang`），挂 `/data` 卷 + 启动异步自下载 + 优雅降级。

**Tech Stack:** Go 1.22 / Gin / GORM（后端，外层仓库）；`github.com/oschwald/geoip2-golang`；React 18 / TanStack Router+Query / shadcn/ui / Tailwind v4 / recharts（前端，`web-worker/` 独立仓库）。

**Spec:** `docs/superpowers/specs/2026-07-05-leaderboard-account-sharing-analysis-design.md`

---

## ⚠️ 两仓库须知（每次 commit 前确认）

- **后端（Task 1–7 的 Go 部分）**：仓库根 `/Users/songjunxi/Desktop/repos/fish-new-api`，`git` 操作在根目录。
- **前端（Task 8–13）**：`web-worker/` 是**独立 git 仓库**（非子模块），`cd web-worker` 后再 `git add/commit`；改动不会进外层仓库。
- 拉 Go 依赖走国内镜像：`GOPROXY=https://goproxy.cn,direct go get ...`（`proxy.golang.org` 被墙）。
- 后端跑测试：`go test ./<pkg>/... -run <Name> -v`。前端跑测试：`cd web-worker && node --import tsx --test <file>`（若 `tsx` 缺失，`pnpm add -D tsx`）。

---

## 文件结构

**新建（后端）**
- `common/geoip/geoip.go` — GeoIP 单例 reader：`Init/Lookup/Close`，优雅降级。
- `common/geoip/download.go` — DB-IP 当月库自下载 + `.version` sidecar + 原子落盘。
- `common/geoip/geoip_test.go` — Lookup 降级 + `SubnetOf` 纯函数测试。
- `model/leaderboard_analysis.go` — 纯函数：信号结构体、`SubnetOf`、`EstimateList`、`ListConfidence`、`MaxConcurrency`、`InputDispersionScore`、`EstimateDrawer`、`DrawerConfidence`。
- `model/leaderboard_analysis_test.go` — 上述纯函数的表驱动测试。

**修改（后端）**
- `model/log.go` — 扩展 `LeaderboardEntry`/`LeaderboardResponse` 结构体、重写 `GetLeaderboard`（分页+搜索+便宜信号）、新增 `GetLeaderboardAnalysisDetail`。
- `controller/log.go` — 重写 `GetLeaderboard` handler（新参数）、新增 `GetLeaderboardAnalysis` handler。
- `router/api-router.go` — 注册 `/log/leaderboard/analysis`。
- `main.go` — 启动调用 `geoip.Init()`。

**新建（前端，`web-worker/`）**
- `src/api-client/leaderboard-analysis.ts` — 抽屉明细 client。
- `src/hooks/use-leaderboard-analysis.ts` — 抽屉 hook。
- `src/components/leaderboard/analysis-cell.tsx` — 「分析」列单元格（疑似 N 人 + 置信度点）。
- `src/components/leaderboard/analysis-drawer.tsx` — 右侧 Sheet 明细。

**修改（前端）**
- `src/api-client/types.ts` — 加 `LeaderboardAnalysis` / `LeaderboardAnalysisDetail` 等类型 + 分页字段。
- `src/api-client/leaderboard.ts` — `getLeaderboard` 改对象入参（时间段/分页/keyword）。
- `src/hooks/use-leaderboard.ts` — queryKey 纳入新参数。
- `src/routes/console/leaderboard.tsx` — URL search 参数、时间段选择、搜索框、分页、podium/summary 门控。
- `src/components/leaderboard/leaderboard-table.tsx` — 分析列、全局名次（删除 `i+4`）、行点击开抽屉。
- `src/components/leaderboard/podium.tsx` — 分析徽标、点击开抽屉、<3 降级。
- `src/i18n/locales/zh/console.json` — 新增中文 key。

---

# 后端（外层仓库）

## Task 1: GeoIP 纯函数 `SubnetOf` + 依赖引入

**Files:**
- Create: `common/geoip/geoip.go`, `common/geoip/geoip_test.go`
- Modify: `go.mod`, `go.sum`

- [ ] **Step 1: 写失败测试**

`common/geoip/geoip_test.go`:
```go
package geoip

import "testing"

func TestSubnetOf(t *testing.T) {
	cases := []struct{ ip, want string }{
		{"8.8.8.8", "8.8.8.0/24"},
		{"114.114.114.114", "114.114.114.0/24"},
		{"192.168.1.55", "192.168.1.0/24"},
		{"2001:4860:4860::8888", "2001:4860:4860::/48"},
		{"", ""},
		{"not-an-ip", ""},
	}
	for _, c := range cases {
		if got := SubnetOf(c.ip); got != c.want {
			t.Errorf("SubnetOf(%q)=%q want %q", c.ip, got, c.want)
		}
	}
}

func TestLookupNilReaderDegrades(t *testing.T) {
	// reader 未初始化时不 panic，返回 ok=false
	_, _, ok := Lookup("8.8.8.8")
	if ok {
		t.Fatal("expected ok=false when reader is nil")
	}
}
```

- [ ] **Step 2: 运行验证失败**

Run: `go test ./common/geoip/ -run 'TestSubnetOf|TestLookupNilReaderDegrades' -v`
Expected: FAIL（`undefined: SubnetOf` / `Lookup`）

- [ ] **Step 3: 最小实现**

`common/geoip/geoip.go`:
```go
package geoip

import (
	"net"
	"sync"

	"github.com/oschwald/geoip2-golang"
)

var (
	mu     sync.RWMutex
	reader *geoip2.Reader
)

// SubnetOf 返回 IP 的归并子网前缀：IPv4 /24、IPv6 /48。非法/空 → ""。
func SubnetOf(ip string) string {
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return ""
	}
	if v4 := parsed.To4(); v4 != nil {
		mask := net.CIDRMask(24, 32)
		return (&net.IPNet{IP: v4.Mask(mask), Mask: mask}).String()
	}
	mask := net.CIDRMask(48, 128)
	return (&net.IPNet{IP: parsed.Mask(mask), Mask: mask}).String()
}

// Lookup 解析 IP 的国家/城市。reader 未就绪 / 非法 IP / 未命中 → ok=false，绝不 panic。
func Lookup(ip string) (country string, city string, ok bool) {
	mu.RLock()
	r := reader
	mu.RUnlock()
	if r == nil {
		return "", "", false
	}
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return "", "", false
	}
	rec, err := r.City(parsed)
	if err != nil || rec == nil {
		return "", "", false
	}
	return rec.Country.IsoCode, rec.City.Names["en"], true
}
```

- [ ] **Step 4: 引入依赖并运行测试**

Run:
```bash
GOPROXY=https://goproxy.cn,direct go get github.com/oschwald/geoip2-golang@v1.13.0
go test ./common/geoip/ -run 'TestSubnetOf|TestLookupNilReaderDegrades' -v
```
Expected: PASS（6 子用例 + nil 降级）

- [ ] **Step 5: Commit**

```bash
git add common/geoip/geoip.go common/geoip/geoip_test.go go.mod go.sum
git commit -m "feat(geoip): SubnetOf + Lookup 单例(优雅降级) + geoip2 依赖"
```

---

## Task 2: GeoIP `Init` + 自下载（DB-IP 当月库 + sidecar）

**Files:**
- Create: `common/geoip/download.go`
- Modify: `common/geoip/geoip.go`（加 `Init`/`Close`/`load`）

- [ ] **Step 1: 实现 `Init` / `load` / `Close`**

追加到 `common/geoip/geoip.go`:
```go
import (
	"os"
	"github.com/QuantumNous/new-api/common"
)

// Init 读取配置，尝试载入本地 mmdb；缺失且允许自下载时后台异步拉取。非致命。
func Init() {
	path := common.GetEnvOrDefaultString("GEOIP_DB_PATH", "/data/geoip/dbip-city-lite.mmdb")
	autoDownload := common.GetEnvOrDefaultString("GEOIP_AUTO_DOWNLOAD", "true") == "true"

	if fileExists(path) && !isStale(path) {
		if err := load(path); err != nil {
			common.SysError("geoip: load failed: " + err.Error())
		} else {
			common.SysLog("geoip: loaded " + path)
		}
		return
	}
	if !autoDownload {
		common.SysLog("geoip: db missing/stale and auto-download disabled; geo degraded")
		return
	}
	go func() {
		if err := downloadCurrentMonth(path); err != nil {
			common.SysError("geoip: auto-download failed (geo degraded): " + err.Error())
			return
		}
		if err := load(path); err != nil {
			common.SysError("geoip: load after download failed: " + err.Error())
			return
		}
		common.SysLog("geoip: downloaded + loaded " + path)
	}()
}

func load(path string) error {
	r, err := geoip2.Open(path)
	if err != nil {
		return err
	}
	mu.Lock()
	old := reader
	reader = r
	mu.Unlock()
	if old != nil {
		_ = old.Close()
	}
	return nil
}

func Close() {
	mu.Lock()
	defer mu.Unlock()
	if reader != nil {
		_ = reader.Close()
		reader = nil
	}
}

func fileExists(p string) bool {
	info, err := os.Stat(p)
	return err == nil && !info.IsDir()
}
```

- [ ] **Step 2: 实现自下载 + sidecar 过期判定**

`common/geoip/download.go`:
```go
package geoip

import (
	"compress/gzip"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func currentYearMonth() string { return time.Now().Format("2006-01") }

func versionPath(dbPath string) string { return dbPath + ".version" }

// isStale：sidecar 缺失或年月 != 当前年月 → 过期。
func isStale(dbPath string) bool {
	b, err := os.ReadFile(versionPath(dbPath))
	if err != nil {
		return true
	}
	return strings.TrimSpace(string(b)) != currentYearMonth()
}

// downloadCurrentMonth：拉 DB-IP 当月 gz → gunzip → 原子写 dbPath → 写 sidecar。
func downloadCurrentMonth(dbPath string) error {
	ym := currentYearMonth()
	url := fmt.Sprintf("https://download.db-ip.com/free/dbip-city-lite-%s.mmdb.gz", ym)
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return err
	}
	resp, err := http.Get(url) //nolint
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("db-ip status %d", resp.StatusCode)
	}
	gz, err := gzip.NewReader(resp.Body)
	if err != nil {
		return err
	}
	defer gz.Close()

	tmp := dbPath + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if _, err := io.Copy(f, gz); err != nil { //nolint:gosec
		f.Close()
		os.Remove(tmp)
		return err
	}
	f.Close()
	if err := os.Rename(tmp, dbPath); err != nil {
		return err
	}
	return os.WriteFile(versionPath(dbPath), []byte(ym), 0o644)
}
```

- [ ] **Step 3: 编译校验**

Run: `go build ./common/geoip/`
Expected: 无错误。（自下载走网络，不写单测；`isStale` 逻辑简单，靠 `currentYearMonth` 纯函数隐式覆盖。）

- [ ] **Step 4: 落地首个库文件（一次性）**

Run:
```bash
ls -la data/geoip/dbip-city-lite-2026-07.mmdb && \
cp data/geoip/dbip-city-lite-2026-07.mmdb data/geoip/dbip-city-lite.mmdb && \
printf '2026-07' > data/geoip/dbip-city-lite.mmdb.version && \
ls -la data/geoip/
```
Expected: 出现稳定文件名 `dbip-city-lite.mmdb` + `.version`。（`data/` 已 gitignore，不进 git。）

- [ ] **Step 5: 接入启动**

`main.go` 在 `model.InitLogDB()` 成功之后（约 302 行后）插入：
```go
	// Initialize GeoIP (non-fatal; degrades gracefully)
	geoip.Init()
```
并在 import 块加 `"github.com/QuantumNous/new-api/common/geoip"`。

- [ ] **Step 6: 编译 + Commit**

Run: `go build -o /dev/null .`
Expected: 通过。
```bash
git add common/geoip/geoip.go common/geoip/download.go main.go
git commit -m "feat(geoip): Init + DB-IP 当月库自下载(sidecar 过期判定) + 启动接入"
```

---

## Task 3: 估计算法纯函数（列表档）

**Files:**
- Create: `model/leaderboard_analysis.go`, `model/leaderboard_analysis_test.go`

- [ ] **Step 1: 写失败测试**

`model/leaderboard_analysis_test.go`:
```go
package model

import "testing"

func TestEstimateList(t *testing.T) {
	cases := []struct {
		name     string
		s        UserSignals
		wantEst  int
		wantMin  bool
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
```

- [ ] **Step 2: 运行验证失败**

Run: `go test ./model/ -run 'TestEstimateList|TestListConfidence' -v`
Expected: FAIL（`undefined: UserSignals` / `EstimateList`）

- [ ] **Step 3: 最小实现**

`model/leaderboard_analysis.go`:
```go
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
```

- [ ] **Step 4: 运行验证通过**

Run: `go test ./model/ -run 'TestEstimateList|TestListConfidence' -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add model/leaderboard_analysis.go model/leaderboard_analysis_test.go
git commit -m "feat(leaderboard): 列表档估计算法+置信度纯函数(TDD)"
```

---

## Task 4: 抽屉档纯函数（并发扫描线 + 输入离散度 + 中转识别）

**Files:**
- Modify: `model/leaderboard_analysis.go`, `model/leaderboard_analysis_test.go`

- [ ] **Step 1: 写失败测试**

追加到 `model/leaderboard_analysis_test.go`:
```go
func TestMaxConcurrency(t *testing.T) {
	// 三个区间：[0,10) [5,15) [20,25) → 最大并发 2
	iv := []Interval{{0, 10}, {5, 15}, {20, 25}}
	if got := MaxConcurrency(iv); got != 2 {
		t.Errorf("MaxConcurrency=%d want 2", got)
	}
	if got := MaxConcurrency(nil); got != 0 {
		t.Errorf("empty want 0 got %d", got)
	}
}

func TestInputDispersionScore(t *testing.T) {
	// 两个并发请求(区间相交)，prompt_tokens 50 与 40000 → 跨数量级桶 → score>=2
	rows := []ConcurRow{{Start: 0, End: 10, PromptTokens: 50}, {Start: 2, End: 8, PromptTokens: 40000}}
	if got := InputDispersionScore(rows); got < 2 {
		t.Errorf("cross-magnitude concurrent want >=2 got %d", got)
	}
	// 不并发（时间错开）→ 不触发
	rows2 := []ConcurRow{{Start: 0, End: 5, PromptTokens: 50}, {Start: 100, End: 105, PromptTokens: 40000}}
	if got := InputDispersionScore(rows2); got >= 2 {
		t.Errorf("non-concurrent want <2 got %d", got)
	}
}

func TestEstimateDrawerTransit(t *testing.T) {
	s := UserSignals{SubnetClusters: 1, DistinctGeo: 1, TokenCount: 1, RequestCount: 500, HasIpData: true}
	est, isMin, concl := EstimateDrawer(s, 4 /*maxConc*/, 2 /*dispScore*/)
	if est != 4 || !isMin || concl == "" {
		t.Errorf("transit: got (%d,%v,%q)", est, isMin, concl)
	}
	// 无 IP → 不判中转
	s2 := UserSignals{SubnetClusters: 0, HasIpData: false, RequestCount: 500}
	_, _, concl2 := EstimateDrawer(s2, 9, 3)
	if concl2 == transitConclusion {
		t.Error("no-ip must not be transit")
	}
}
```

- [ ] **Step 2: 运行验证失败**

Run: `go test ./model/ -run 'TestMaxConcurrency|TestInputDispersionScore|TestEstimateDrawerTransit' -v`
Expected: FAIL（未定义）

- [ ] **Step 3: 最小实现**

追加到 `model/leaderboard_analysis.go`:
```go
import "sort"

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

// InputDispersionScore：并发重叠窗口内同时活跃请求落入的 distinct 数量级桶数的最大值。
func InputDispersionScore(rows []ConcurRow) int {
	best := 0
	for i := range rows {
		buckets := map[int]bool{magnitudeBucket(rows[i].PromptTokens): true}
		for j := range rows {
			if i == j {
				continue
			}
			// j 与 i 是否时间重叠 [start,end)
			if rows[j].Start < rows[i].End && rows[i].Start < rows[j].End {
				buckets[magnitudeBucket(rows[j].PromptTokens)] = true
			}
		}
		if len(buckets) > best {
			best = len(buckets)
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
	// 中转识别：必须有 IP 且高度集中
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
```

- [ ] **Step 4: 运行验证通过 + 全 model 测试**

Run: `go test ./model/ -run 'TestMaxConcurrency|TestInputDispersionScore|TestEstimateDrawerTransit|TestEstimateList|TestListConfidence' -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add model/leaderboard_analysis.go model/leaderboard_analysis_test.go
git commit -m "feat(leaderboard): 抽屉档并发/输入离散度/中转识别纯函数(TDD)"
```

---

## Task 5: 后端结构体扩展 + `GetLeaderboard` 重写（分页 + 搜索 + 便宜信号）

**Files:**
- Modify: `model/log.go`（结构体 1243-1264、`GetLeaderboard` 1733）

- [ ] **Step 1: 扩展结构体**

`model/log.go` 替换 `LeaderboardEntry` / `LeaderboardResponse`：
```go
type LeaderboardRegion struct {
	Country string `json:"country"`
	City    string `json:"city"`
	Count   int    `json:"count"`
}
type LeaderboardAnalysis struct {
	Estimate      int                 `json:"estimate"`
	EstimateIsMin bool                `json:"estimate_is_min"`
	Confidence    string              `json:"confidence"`
	IpCount       int                 `json:"ip_count"`
	TokenCount    int                 `json:"token_count"`
	TopRegions    []LeaderboardRegion `json:"top_regions"`
	HasIpData     bool                `json:"has_ip_data"`
}
type LeaderboardEntry struct {
	UserId       int                 `json:"user_id" gorm:"column:user_id"`
	Username     string              `json:"username" gorm:"-"`
	TotalQuota   int64               `json:"total_quota" gorm:"column:total_quota"`
	TotalTokens  int64               `json:"total_tokens" gorm:"column:total_tokens"`
	RequestCount int64               `json:"request_count" gorm:"column:request_count"`
	TopModel     string              `json:"top_model" gorm:"-"`
	Analysis     LeaderboardAnalysis `json:"analysis" gorm:"-"`
}
type LeaderboardResponse struct {
	Summary     *LeaderboardSummary `json:"summary,omitempty"`
	Leaderboard []LeaderboardEntry  `json:"leaderboard"`
	Page        int                 `json:"page"`
	PageSize    int                 `json:"page_size"`
	Total       int                 `json:"total"`
}
```

- [ ] **Step 2: 重写 `GetLeaderboard` 签名 + 分页/搜索/信号**

替换 `model/log.go:GetLeaderboard`，新签名：
```go
func GetLeaderboard(startTimestamp, endTimestamp int64, sortBy string, page, pageSize int, keyword string) (*LeaderboardResponse, error)
```
实现要点（完整代码见下）：
1. `orderCol` 按 sortBy 选 `total_quota` / `total_tokens`，ORDER BY 加 `, user_id ASC` tiebreaker。
2. keyword 非空 → 解析候选 user_id（见 Step 3 的 `resolveKeywordUserIds`），日志聚合加 `user_id IN ?`。
3. `total` = `COUNT(DISTINCT user_id)`（同筛选）。
4. 主聚合 `GROUP BY user_id ORDER BY <col> DESC, user_id ASC LIMIT pageSize OFFSET (page-1)*pageSize` → 当页 entries。
5. 便宜信号：仅对当页 user_ids —— `GROUP BY user_id, ip`（去重 IP）+ `COUNT(DISTINCT token_id)`；Go 层 `geoip.SubnetOf` 归并子网、`geoip.Lookup` 解析地理、空城市归国家级、算 `distinct_geo`、`top_regions`（count 降序取 3）。
6. 每个 entry：`s := UserSignals{...}`；`est,isMin := EstimateList(s)`；`conf := ListConfidence(s)`；填 `Analysis`。`HasIpData` = 该用户有非空 ip。
7. Summary 仅 `page==1 && keyword==""` 时算（独立 top-N 聚合，逻辑同原实现），否则 `nil`。
8. 数据源日志用 `LOG_DB.Table("logs")`，用户名/keyword 解析用 `DB`。

> 完整实现较长，实现时参照原 `GetLeaderboard`（top model / username 解析 / summary 逻辑可复用），仅把「固定 top20」换成「分页 + keyword 过滤」，并在拿到当页 userIds 后补便宜信号 + Analysis 组装。

- [ ] **Step 3: keyword 解析辅助**

在 `model/log.go` 加：
```go
// resolveKeywordUserIds：keyword 为纯数字 → user_id 精确 OR 用户名含；否则用户名 LIKE。返回候选 user_id。
func resolveKeywordUserIds(keyword string) ([]int, error) {
	keyword = strings.TrimSpace(keyword)
	if keyword == "" {
		return nil, nil
	}
	var ids []int
	q := DB.Table("users").Select("id")
	if _, err := strconv.Atoi(keyword); err == nil {
		q = q.Where("id = ? OR username LIKE ?", keyword, "%"+keyword+"%")
	} else {
		q = q.Where("username LIKE ?", "%"+keyword+"%")
	}
	if err := q.Pluck("id", &ids).Error; err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return []int{-1}, nil // 哨兵：确保 IN(-1) 命中空集
	}
	return ids, nil
}
```
（确认 `strings` / `strconv` 已 import。）

- [ ] **Step 4: 编译**

Run: `go build ./model/... ./controller/...`
Expected: 会在 controller 处报错（调用签名变了）—— 下一 Task 修 controller。先确认 model 包自身编译：`go build ./model/`
Expected: model 通过。

- [ ] **Step 5: Commit**

```bash
git add model/log.go
git commit -m "feat(leaderboard): 结构体扩展analysis+分页/搜索/便宜信号(model)"
```

---

## Task 6: 抽屉明细 `GetLeaderboardAnalysisDetail`（model）

**Files:**
- Modify: `model/log.go`（新增函数 + 明细结构体）

- [ ] **Step 1: 明细结构体**

`model/log.go` 加（与 spec §5.2 对齐）：
```go
type AnalysisIpRow struct {
	Ip           string `json:"ip"`
	Country      string `json:"country"`
	City         string `json:"city"`
	Subnet       string `json:"subnet"`
	RequestCount int    `json:"request_count"`
	FirstSeen    int64  `json:"first_seen"`
	LastSeen     int64  `json:"last_seen"`
}
type AnalysisTokenRow struct {
	TokenId      int    `json:"token_id"`
	TokenName    string `json:"token_name"`
	RequestCount int    `json:"request_count"`
	PromptTokens int64  `json:"prompt_tokens"`
}
type AnalysisBucket struct {
	Label string `json:"label"`
	Min   int    `json:"min"`
	Count int    `json:"count"`
}
type AnalysisTimeBucket struct {
	Ts    int64 `json:"ts"`
	Count int   `json:"count"`
}
type LeaderboardAnalysisDetail struct {
	UserId               int                  `json:"user_id"`
	Estimate             int                  `json:"estimate"`
	EstimateIsMin        bool                 `json:"estimate_is_min"`
	Confidence           string               `json:"confidence"`
	Conclusion           string               `json:"conclusion"`
	HasIpData            bool                 `json:"has_ip_data"`
	Truncated            bool                 `json:"truncated"`
	SampledRows          int                  `json:"sampled_rows"`
	SubnetClusters       int                  `json:"subnet_clusters"`
	DistinctGeo          int                  `json:"distinct_geo"`
	TokenCount           int                  `json:"token_count"`
	MaxConcurrency       int                  `json:"max_concurrency"`
	InputDispersionScore int                  `json:"input_dispersion_score"`
	Ips                  []AnalysisIpRow      `json:"ips"`
	Tokens               []AnalysisTokenRow   `json:"tokens"`
	InputBuckets         []AnalysisBucket     `json:"input_buckets"`
	Timeline             []AnalysisTimeBucket `json:"timeline"`
}

const analysisSampleCap = 50000
```

- [ ] **Step 2: 实现 `GetLeaderboardAnalysisDetail`**

```go
func GetLeaderboardAnalysisDetail(userId int, startTimestamp, endTimestamp int64) (*LeaderboardAnalysisDetail, error)
```
要点：
1. 拉原始行（`LOG_DB.Table("logs")`，`type=LogTypeConsume AND user_id=? AND created_at 区间`，`ORDER BY created_at DESC LIMIT analysisSampleCap`），select `ip, token_id, token_name, prompt_tokens, use_time, created_at`。
2. `Truncated = len(rows) == analysisSampleCap`；`SampledRows = len(rows)`。
3. 聚合：按 ip → `AnalysisIpRow`（subnet=`geoip.SubnetOf`，geo=`geoip.Lookup`，count/first/last）；按 token → `AnalysisTokenRow`；数量级桶 → `InputBuckets`；时间片（窗口跨度自适应，≤1 天用小时、否则天）→ `Timeline`。
4. 信号：`SubnetClusters`=distinct subnet 数；`DistinctGeo`=distinct(country,city) 空城市归国家；`TokenCount`=distinct token；`HasIpData`=有非空 ip；`RequestCount`=len(rows)。
5. `MaxConcurrency(intervals)`（intervals 来自 `[created_at, created_at+use_time]`）；`InputDispersionScore(concurRows)`。
6. `est,isMin,concl := EstimateDrawer(signals, maxConc, disp)`；`conf := DrawerConfidence(signals, maxConc)`。组装返回。

- [ ] **Step 3: 编译**

Run: `go build ./model/`
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
git add model/log.go
git commit -m "feat(leaderboard): 抽屉明细 GetLeaderboardAnalysisDetail(model)"
```

---

## Task 7: Controller + 路由（handler 参数 + 新接口）

**Files:**
- Modify: `controller/log.go`（`GetLeaderboard` 422、新增 `GetLeaderboardAnalysis`）
- Modify: `router/api-router.go`（443 附近）

- [ ] **Step 1: 重写 `GetLeaderboard` handler**

`controller/log.go:422` 替换为：解析 `start_timestamp`/`end_timestamp`（int64，回落 `date`，再回落当天）、`sort_by`、`common.GetPageQuery(c)` 取 page/pageSize、`keyword := c.Query("keyword")`；调用新 `model.GetLeaderboard(start, end, sortBy, pageInfo.GetPage(), pageInfo.GetPageSize(), keyword)`；`common.ApiSuccess(c, data)`。

- [ ] **Step 2: 新增 `GetLeaderboardAnalysis` handler**

```go
func GetLeaderboardAnalysis(c *gin.Context) {
	userId, err := strconv.Atoi(c.Query("user_id"))
	if err != nil || userId <= 0 {
		common.ApiError(c, errors.New("invalid user_id"))
		return
	}
	start, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	end, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	if start == 0 {
		now := time.Now()
		start = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).Unix()
	}
	data, err := model.GetLeaderboardAnalysisDetail(userId, start, end)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, data)
}
```

- [ ] **Step 3: 注册路由**

`router/api-router.go` 在 443 行 `logRoute.GET("/leaderboard", ...)` 之后加：
```go
		logRoute.GET("/leaderboard/analysis", middleware.AdminAuth(), middleware.PermissionAuth(common.PermissionPointLogView), controller.GetLeaderboardAnalysis)
```

- [ ] **Step 4: 全量编译 + 全测试**

Run: `go build -o /dev/null . && go test ./model/ ./common/geoip/ -v`
Expected: 编译通过，测试 PASS。

- [ ] **Step 5: 冒烟（可选，需本地起服务）**

若本地可起服务：`curl -s 'http://localhost:3000/api/log/leaderboard?p=1&page_size=10' -H '<admin cookie>' | jq '.data | {page,total, first:.leaderboard[0].analysis}'`
Expected: 返回 `page/total` + entry 带 `analysis`。

- [ ] **Step 6: Commit**

```bash
git add controller/log.go router/api-router.go
git commit -m "feat(leaderboard): controller 新参数 + analysis 明细接口 + 路由(仅管理员)"
```

---

# 前端（`web-worker/` 独立仓库）

> 所有前端 Task：`cd web-worker` 后操作；commit 在 web-worker 仓库内。改完跑 `pnpm check` 保证 Biome 通过。

## Task 8: api-client 类型 + client（分页/搜索/明细）

**Files:**
- Modify: `web-worker/src/api-client/types.ts`, `web-worker/src/api-client/leaderboard.ts`, `web-worker/src/hooks/use-leaderboard.ts`
- Create: `web-worker/src/api-client/leaderboard-analysis.ts`, `web-worker/src/hooks/use-leaderboard-analysis.ts`

- [ ] **Step 1: 类型（`types.ts`）**

加（顶部注释 `// source: model/log.go:GetLeaderboard`）：
```ts
export interface LeaderboardRegion { country: string; city: string; count: number; }
export interface LeaderboardAnalysis {
  estimate: number;
  estimate_is_min: boolean;
  confidence: 'high' | 'medium' | 'low';
  ip_count: number;
  token_count: number;
  top_regions: LeaderboardRegion[];
  has_ip_data: boolean;
}
```
在 `LeaderboardEntry` 加 `analysis: LeaderboardAnalysis;`；在 `LeaderboardResponse` 加 `page: number; page_size: number; total: number;`，`summary` 改 `summary?: LeaderboardSummary;`。
新增明细类型 `AnalysisIpRow/AnalysisTokenRow/AnalysisBucket/AnalysisTimeBucket/LeaderboardAnalysisDetail`（字段与 spec §5.2 一一对应，下划线命名）。

- [ ] **Step 2: client（`leaderboard.ts` 改对象入参）**

```ts
export interface LeaderboardParams {
  startTs?: number; endTs?: number;
  sortBy?: LeaderboardSortBy;
  p?: number; pageSize?: number; keyword?: string;
}
export function getLeaderboard(params: LeaderboardParams = {}): Promise<LeaderboardResponse> {
  const q = new URLSearchParams();
  if (params.startTs) q.set('start_timestamp', String(params.startTs));
  if (params.endTs) q.set('end_timestamp', String(params.endTs));
  if (params.sortBy && params.sortBy !== 'quota') q.set('sort_by', params.sortBy);
  if (params.p && params.p > 1) q.set('p', String(params.p));
  if (params.pageSize) q.set('page_size', String(params.pageSize));
  if (params.keyword) q.set('keyword', params.keyword);
  const qs = q.toString();
  return apiFetch<LeaderboardResponse>(qs ? `/log/leaderboard?${qs}` : '/log/leaderboard');
}
```

- [ ] **Step 3: 明细 client + hooks**

`leaderboard-analysis.ts`:
```ts
import { apiFetch } from './client';
import type { LeaderboardAnalysisDetail } from './types';
export function getLeaderboardAnalysis(userId: number, startTs?: number, endTs?: number) {
  const q = new URLSearchParams({ user_id: String(userId) });
  if (startTs) q.set('start_timestamp', String(startTs));
  if (endTs) q.set('end_timestamp', String(endTs));
  return apiFetch<LeaderboardAnalysisDetail>(`/log/leaderboard/analysis?${q.toString()}`);
}
```
`use-leaderboard.ts`：queryKey/queryFn 改为传 `LeaderboardParams`（含 p/pageSize/keyword）。
`use-leaderboard-analysis.ts`：`useQuery({ queryKey:['leaderboard-analysis',userId,startTs,endTs], queryFn:()=>getLeaderboardAnalysis(...), enabled })`。

- [ ] **Step 4: 校验**

Run: `cd web-worker && pnpm check && npx tsc --noEmit`
Expected: Biome + 类型通过（消费方 leaderboard.tsx 下一 Task 改）。若 tsc 报 leaderboard.tsx 旧调用，属预期，Task 11 修。

- [ ] **Step 5: Commit**

```bash
cd web-worker
git add src/api-client/types.ts src/api-client/leaderboard.ts src/api-client/leaderboard-analysis.ts src/hooks/use-leaderboard.ts src/hooks/use-leaderboard-analysis.ts
git commit -m "feat(leaderboard): api-client 分页/搜索/分析明细类型+client+hooks"
```

---

## Task 9: 分析列单元格组件

**Files:**
- Create: `web-worker/src/components/leaderboard/analysis-cell.tsx`

- [ ] **Step 1: 实现**

```tsx
import type { LeaderboardAnalysis } from '@/api-client/types';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

const DOT: Record<string, string> = {
  high: 'bg-emerald-500', medium: 'bg-amber-500', low: 'bg-muted-foreground/40',
};
export function AnalysisCell({ a }: { a: LeaderboardAnalysis }) {
  const { t } = useTranslation('console');
  if (!a?.has_ip_data) {
    return <span className="text-muted-foreground text-xs">{t('leaderboard.analysisNoData')}</span>;
  }
  const label = a.estimate_is_min
    ? t('leaderboard.analysisAtLeast', { n: a.estimate })
    : t('leaderboard.analysisSuspected', { n: a.estimate });
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('size-2 rounded-full', DOT[a.confidence] ?? DOT.low)} />
      <span className="text-sm">{label}</span>
    </div>
  );
}
```

- [ ] **Step 2: 校验 + Commit**

Run: `cd web-worker && pnpm check`
```bash
git add src/components/leaderboard/analysis-cell.tsx
git commit -m "feat(leaderboard): 分析列单元格(疑似N人+置信度点)"
```

---

## Task 10: 详情抽屉组件

**Files:**
- Create: `web-worker/src/components/leaderboard/analysis-drawer.tsx`

- [ ] **Step 1: 实现**

用 `@/components/ui/sheet`（右侧），props `{ userId: number|null; startTs?: number; endTs?: number; onClose: ()=>void }`；`useLeaderboardAnalysis(userId, startTs, endTs, userId != null)`。结构（spec §6.5）：
- 头部：结论 `conclusion` + 置信度徽标 + `!has_ip_data` 提示条 + `truncated` 提示。
- IP 明细表（`city===''` 只显国家，国家空显「未知」）。
- Token 明细表。
- 并发峰值数值 + 解读。
- 输入 token 分布 recharts `BarChart`（`input_buckets`）。
- 时间线 recharts `AreaChart`/`LineChart`（`timeline`）。
- 加载 skeleton；错误 `StateMessage`。

- [ ] **Step 2: 校验 + Commit**

Run: `cd web-worker && pnpm check`
```bash
git add src/components/leaderboard/analysis-drawer.tsx
git commit -m "feat(leaderboard): 详情抽屉(IP/token/并发/输入分布/时间线)"
```

---

## Task 11: 表格分析列 + 全局名次 + 行点击

**Files:**
- Modify: `web-worker/src/components/leaderboard/leaderboard-table.tsx`

- [ ] **Step 1: 改 props + 名次 + 分析列 + 行点击**

- props 加 `baseRank: number`（父传 `(page-1)*pageSize` 或 page1 的 3）、`startTs?/endTs?`、`onRowClick:(userId:number)=>void`。
- 删除 `const rank = i + 4;`，改 `const rank = baseRank + i + 1;`。
- 表头加「分析」列 `<TableHead>{t('leaderboard.analysis')}</TableHead>`；行内 `<TableCell><AnalysisCell a={entry.analysis} /></TableCell>`。
- `<TableRow className="cursor-pointer" onClick={()=>onRowClick(entry.user_id)}>`。

- [ ] **Step 2: 校验 + Commit**

Run: `cd web-worker && pnpm check`
```bash
git add src/components/leaderboard/leaderboard-table.tsx
git commit -m "feat(leaderboard): 表格分析列+全局名次(删i+4)+行点击开抽屉"
```

---

## Task 12: podium 徽标 + 点击 + <3 降级

**Files:**
- Modify: `web-worker/src/components/leaderboard/podium.tsx`

- [ ] **Step 1: 改造**

- props 加 `onCardClick:(userId:number)=>void`。
- 每张卡片加 `<AnalysisCell a={entry.analysis} />` 小徽标；卡片 `onClick`。
- 渲染前 `entries.slice(0,3)`，`entries.length<3` 时只映射已有项（现有 MEDAL_STYLES 索引对齐实际项，不越界）。

- [ ] **Step 2: 校验 + Commit**

Run: `cd web-worker && pnpm check`
```bash
git add src/components/leaderboard/podium.tsx
git commit -m "feat(leaderboard): podium 分析徽标+点击开抽屉+<3降级"
```

---

## Task 13: 页面装配（时间段 + 搜索 + 分页 + 门控 + 抽屉 + i18n）

**Files:**
- Modify: `web-worker/src/routes/console/leaderboard.tsx`, `web-worker/src/i18n/locales/zh/console.json`

- [ ] **Step 1: URL search 参数 + 状态**

route `validateSearch` 加 `p?/page_size?/keyword?/start_timestamp?/end_timestamp?/sort_by?`；组件从 search 取值；切 tab/时间/搜索时 `navigate` 重置 `p=1`。

- [ ] **Step 2: 时间段选择（替换单日 Calendar）**

用 `toDatetimeLocal`/`fromDatetimeLocal`（`@/lib/dashboard-metrics`）做起止 datetime-local 输入 + 「今天/近7天」快捷；默认当天 00:00→现在；传 `start_timestamp`/`end_timestamp`。

- [ ] **Step 3: 搜索框 + 分页控件**

搜索框（`keyword`，占位「搜索用户 ID 或用户名」，回车触发，清空恢复）；分页用 `getPaginationItems`/`getTotalPages`（从 `@/components/log/log-format` import）+ `Pagination` UI，基于 `data.total`/`data.page_size`。

- [ ] **Step 4: podium/summary 门控 + 表格 + 抽屉**

- `const showPodium = page===1 && !keyword;`
- `showPodium` 时：summary 卡 + `<Podium entries={leaderboard.slice(0,3)} .../>` + `<LeaderboardTable entries={leaderboard.slice(3)} baseRank={3} .../>`。
- 否则：`<LeaderboardTable entries={leaderboard} baseRank={(page-1)*pageSize} .../>`（无 podium/summary）。
- `const [drawerUser,setDrawerUser]=useState<number|null>(null)`；表格/podium 的 click → `setDrawerUser`；渲染 `<AnalysisDrawer userId={drawerUser} startTs endTs onClose={()=>setDrawerUser(null)} />`。
- 空结果 `StateMessage` empty。

- [ ] **Step 5: i18n**

`src/i18n/locales/zh/console.json` 加：`leaderboard.analysis`「分析」、`analysisSuspected`「疑似 {{n}} 人」、`analysisAtLeast`「≥{{n}} 人」、`analysisNoData`「数据不足」、`leaderboard.searchPlaceholder`、抽屉各标题、`truncatedHint`、`noIpHint` 等。

- [ ] **Step 6: 类型 + Biome + 构建**

Run: `cd web-worker && npx tsc --noEmit && pnpm check && pnpm build`
Expected: 全通过。

- [ ] **Step 7: 手动验收（对照 spec §6）**

- [ ] 默认当天，podium+summary 显示；改时间段生效。
- [ ] 分析列显示「疑似 N 人/≥N 人/数据不足」+ 色点。
- [ ] 点行/卡 → 右侧抽屉出证据；`truncated`/`无IP` 提示正确。
- [ ] 翻到第 2 页：podium+summary 消失，名次连续（不重不漏）。
- [ ] 搜索 user_id / 用户名：命中该用户；清空恢复。

- [ ] **Step 8: Commit**

```bash
cd web-worker
git add src/routes/console/leaderboard.tsx src/i18n/locales/zh/console.json
git commit -m "feat(leaderboard): 页面装配-时间段/搜索/分页/门控/抽屉/i18n"
```

---

## 完成校验（全量）

- [ ] 后端：`go build -o /dev/null . && go test ./model/ ./common/geoip/`
- [ ] 前端：`cd web-worker && npx tsc --noEmit && pnpm check && pnpm build`
- [ ] 端到端：管理员登录天梯榜 → 时间段/分页/搜索/分析列/抽屉全通（§6.3/6.4/6.4a）。
- [ ] GeoIP 降级验证：临时把 `GEOIP_DB_PATH` 指向不存在路径 + `GEOIP_AUTO_DOWNLOAD=false` → 服务正常起、分析列地理留空、`confidence` 降级、无报错。
