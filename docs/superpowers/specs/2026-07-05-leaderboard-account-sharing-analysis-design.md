# 天梯榜「账号共用分析」设计

> Status: Draft for approval
> Date: 2026-07-05
> Authors: Claude (planner), operator (oiov)
> Scope: 在 `web-worker` 的 `/console/leaderboard` 天梯榜中，新增一列「分析」，估计每个头部账号在所选时间段内「疑似几个人在使用」，点击整行弹出右侧抽屉展示证据明细；并把天梯榜的日期筛选从「按天」升级为「自定义时间段」（默认当天）。
> Implementer: Codex（按 §8 切片顺序执行，Claude + 人肉审查）
> 关联规约：根 `/CLAUDE.md` Rule 1/2/5，`web-worker/CLAUDE.md` §Rule 7

---

## 目录

- §1 · 背景与目标
- §2 · 可用数据与信号
- §3 · 「疑似 N 人」估计算法
- §4 · GeoIP 地理定位子系统
- §5 · 后端接口规格
- §6 · 前端规格（web-worker）
- §7 · 数据流与性能边界
- §8 · Codex 切片与交付顺序
- §9 · 测试策略
- §10 · 非目标 / YAGNI

---

## §1 · 背景与目标

### 1.1 问题

天梯榜列出消费 top-N 用户。管理员想识别：某个头部账号**实际上是几个人在用**，用来区分三种典型形态：

1. **单人正常使用** —— IP 固定、地理固定、单 token、请求稀疏。
2. **真·分发给多人** —— 多个不同 IP / 多国多城、可能多个 token、同一时段并发出现输入规模差异明显的请求。
3. **自建中转分发**（用户把号接进自己的 new-api 再分发）—— 所有请求 IP 都是他自己的服务器（少数固定 IP、同一地理），但**同一时段高并发** + 输入 token 规模离散度大 —— 说明背后是多个真实终端。

### 1.2 目标

- 天梯榜每行新增「分析」列：展示「疑似 N 人使用」（或「≥N 人」）+ 置信度色点；数据不足时显示「数据不足」。
- 点击整行 → 右侧抽屉展示该账号在所选时间段内的分析明细与**证据**（IP 列表+地理、token 明细、并发峰值、输入 token 分布、时间线、结论文本）。
- 日期筛选升级为「自定义时间段」（起止 datetime），默认当天 00:00 → 现在。
- 所有相关接口**仅管理员**可访问。

### 1.3 权限

沿用既有模式：`/api/log/leaderboard` 当前已挂 `middleware.AdminAuth() + middleware.PermissionAuth(common.PermissionPointLogView)`（`router/api-router.go:443`）。新增接口照挂同一组中间件。

---

## §2 · 可用数据与信号

### 2.1 日志表可用字段（`model/log.go` Log struct）

每条 `type = LogTypeConsume` 的日志在 `[start, end)` 窗口内可取：

| 字段 | 用途 | 备注 |
|---|---|---|
| `user_id` | 分组主键 | |
| `ip` | IP 信号 + 地理定位 | ⚠️ **受门控**：仅当用户 `IsRecordIpLogEnabled()` 为真才记录，否则为空串 |
| `token_id` / `token_name` | 去重 token 数（分发信号） | |
| `prompt_tokens` | 输入规模 / 离散度信号 | **无 prompt 原文**，只有 token 计数 |
| `completion_tokens` | 辅助 | |
| `model_name` | 辅助展示 | |
| `use_time` | 并发重叠计算（区间长度） | 秒 |
| `is_stream` | 辅助 | |
| `created_at` | 时间线 / 并发起点 | unix 秒 |

> **关键约束**：没有 prompt 原文，「输入有明显差异」只能用 `prompt_tokens`（输入 token 数）的分布近似。这是设计的已知上限，UI 措辞需诚实（用「输入规模差异」而非「输入内容差异」）。

### 2.2 抽取的信号

1. **IP 子网簇 `subnet_clusters`** — IPv4 归并到 /24，IPv6 归并到 /48，去重。抵消「同一人动态 IP」造成的虚高。
2. **地理分布 `distinct_geo`** — GeoIP 解析出的 distinct (国家, 城市) 数。跨国 > 跨城 > 同城。
   - **空城市归并**：DB-IP Lite 常返回「有国家、无城市」。`city == ""` 的行**归并到国家级**，同一国家只计 1 个 geo；`distinct_geo` = distinct 国家数（若某国有多个非空城市则按 (国, 城) 细分）。渲染见 §6.5（`city==""` 只显示国家）。
3. **去重活跃 token 数 `token_count`** — 分发给多人的强信号（每个下游常拿独立 key）。
4. **并发重叠 `max_concurrency`**（抽屉才算）— 以每条日志的 `[created_at, created_at + use_time]` 建区间，用扫描线求同时并发的最大值。
5. **输入 token 离散度 `input_dispersion`**（抽屉才算）— 把 `prompt_tokens` 分桶，观察短时间窗（如同一分钟/并发窗口）内是否同时出现量级差异大的请求（如一个 200-token 一个 40k-token 并发 → 强烈暗示不同终端/不同用途）。

---

## §3 · 「疑似 N 人」估计算法

### 3.1 列表头条估计（仅便宜信号，列表接口内计算）

列表接口**只有便宜信号**：`subnet_clusters`、`distinct_geo`、`token_count`、`request_count`。并发/输入离散度是抽屉才算的贵信号，列表**不得**依赖它们。

```
base      = max(subnet_clusters, distinct_geo)
estimate  = base
若 token_count > base 且各 token 请求数均 > 0：
    estimate = token_count            // token 分叉视为独立使用者
estimate = max(estimate, 1)

// 列表级「疑似中转」廉价代理（不需要并发信号）：
list_transit_suspected = (subnet_clusters <= 2) && (request_count >= T_LIST)   // T_LIST 默认 200
estimate_is_min = list_transit_suspected
```

- `estimate` 作为「疑似 N 人」。
- **`estimate_is_min` 只由上面这个廉价代理决定**（IP 高度集中但请求量很大 → 真实人数无法从列表信号确定，故展示为「**≥N 人**」，由抽屉细化）。列表**不**引用 `max_concurrency` / `input_dispersion`。
- 抽屉里的 §3.2 是**独立、更强**的中转判定，可能得出更高的估计（见 §3.6 口径对齐）。

### 3.2 中转分发识别（抽屉接口内计算）

信号组合：`subnet_clusters <= 2`（IP 高度集中）**且** `max_concurrency >= K`（默认 K=3）**且** `input_dispersion_score >= 2`（见 §3.2.1）。
→ 抽屉结论标注「疑似自建中转分发；观测到并发 ≥ max_concurrency，输入规模差异显著」，估计 `estimate = max(base, max_concurrency)`，`estimate_is_min = true`（以「≥ N 人」表达）。

### 3.2.1 输入离散度量化（`input_dispersion_score`，抽屉内计算）

- `prompt_tokens` 按**数量级分桶**（bucket 边界固定：`[0,100)`、`[100,1k)`、`[1k,10k)`、`[10k,100k)`、`[100k,∞)`），桶即 §5.2 的 `input_buckets`。
- 定义**并发窗口**：任一时刻并发重叠（区间 `[created_at, created_at+use_time]` 相交）的请求集合。
- `input_dispersion_score` = 在**存在并发重叠的窗口内**，同时活跃请求所落入的**distinct 数量级桶数**的最大值。
  - `score >= 2` 即判为「输入规模差异显著」（同一时段并发出现跨 ≥1 个数量级的请求，强烈暗示不同终端/用途）。
- 该 score 作为标量随抽屉返回，供 §9 单测直接断言。

### 3.3 置信度（high / medium / low）

| 置信度 | 判据 |
|---|---|
| **high** | 多信号一致：多国/多城 **且**（多 token **或** 高并发）。 |
| **medium** | 部分信号：多 IP 同国，或有 token 分叉但地理单一，或有并发但 IP 单一。 |
| **low** | 数据不足：IP 全空（用户未开 IP 记录）、或请求数过少（如 < 10）、或 GeoIP 库缺失导致地理留空。 |

### 3.4 IP 全空的退化路径

当窗口内该用户所有 `ip` 均为空串（用户设置未开启记录）：
- `subnet_clusters = 0`，`distinct_geo = 0`，`has_ip_data = false`。
- 列表 `estimate` 仍按 §3.1 计算（此时 base=0，若有 token 分叉则 estimate=token_count），但**置信度强制 `low`**。
- 「分析」列**显示优先级**：`has_ip_data = false` 时列表统一显示「数据不足」灰字（**即便 token 信号算出了 estimate 也不在列表展示数字**——避免无地理佐证的数字误导管理员）；用户仍可点开抽屉，抽屉里会展示 token/并发等非地理信号与算出的 estimate。
- 抽屉顶部明确提示「该账号未开启 IP 记录，地理与 IP 信号不可用」。

### 3.5 纯函数边界

估计与置信度逻辑封装为**纯函数**（输入：聚合信号结构体；输出：estimate/confidence/flags），不碰 DB、不碰 gin.Context，便于 §9 单测。

### 3.6 列表值 ↔ 抽屉值口径对齐

- 列表 `analysis.estimate` 是**廉价启发式**（只用便宜信号）；抽屉 `estimate` 是**权威值**（含并发/离散度）。
- 二者可能不一致（列表「疑似 3 人」，抽屉「≥5 人」是**设计允许**的——抽屉信号更强）。
- 前端口径：**抽屉打开后以抽屉值为准展示**；列表行标签**不回写/不改动**（列表是快速概览，抽屉是深挖）。两者各自独立标注，不视为矛盾。

---

## §4 · GeoIP 地理定位子系统

### 4.1 库选型（已验证）

- **默认库：DB-IP City Lite**（免费、直连可下、CC-BY 4.0、mmdb 格式、城市级精度）。
  - 下载 URL 模板：`https://download.db-ip.com/free/dbip-city-lite-YYYY-MM.mmdb.gz`
  - 已验证：`geoip2-golang v1.13.0` 可读；`8.8.8.8→US/Mountain View`、`114.114.114.114→CN/Jinan`、IPv6 `2001:4860:4860::8888→CA/Montreal` 均正确。
- **可选库：MaxMind GeoLite2**（需 MaxMind 账号 + license key；同为 mmdb，`geoip2-golang` 通吃，配置 `GEOIP_DB_PATH` 指向即可，代码零改动）。
- Go 依赖：`github.com/oschwald/geoip2-golang`（间接引入 `oschwald/maxminddb-golang`）。JSON 仍走根 Rule 1 的 `common.*`（本子系统不做 JSON，读的是二进制 mmdb，不冲突）。

### 4.2 包结构 `common/geoip`

- 启动时 `Init()` 载入 mmdb 到单例 `*geoip2.Reader`（读锁保护，惰性/预载均可）。
- 暴露 `Lookup(ip string) (country string, city string, ok bool)`：解析失败 / reader 为 nil / IP 非法 → `ok=false`，**绝不 panic**。
- 关闭时 `Close()`。

### 4.3 配置

| 配置项 | 默认 | 说明 |
|---|---|---|
| `GEOIP_DB_PATH` | `/data/geoip/dbip-city-lite.mmdb` | mmdb 路径（`/data` 为既有持久卷 + WORKDIR） |
| `GEOIP_AUTO_DOWNLOAD` | `true` | 缺库时是否自动下载 DB-IP 当月库 |

配置读取沿用项目既有 option/env 机制（与其它 `GetXxx` 配置一致），不新造框架。

### 4.4 部署策略（A + B：挂卷 + 启动自下载 + 优雅降级）

- **A（默认）挂卷**：库文件放宿主 `data/geoip/`（已挂载为容器 `/data/geoip/`）。镜像干净、CI 不动、不进 git。
  - ⚠️ **mmdb 不进 git**：文件 125MB，超 GitHub 单文件 100MB 硬限；`data/` 已在 `.gitignore`（`.gitignore:34`）。
- **B（自举）启动自下载**：`GEOIP_AUTO_DOWNLOAD=true` 时，若 `GEOIP_DB_PATH` 不存在或过期（见下），后端启动阶段**异步**从 DB-IP 拉当月 `.mmdb.gz` → gunzip → **原子写到 `GEOIP_DB_PATH`（稳定文件名，不带月份）** → 载入。
  - **过期判定（明确，不留 or）**：下载成功后在同目录写一个 sidecar `GEOIP_DB_PATH + ".version"`，内容为该库年月字符串（如 `2026-07`）。启动时读 sidecar：缺失或 `!= 当前年月`（`time.Now()` 的 `YYYY-MM`）即判为过期，触发下载；相等则跳过。
  - 下载在后台 goroutine，**不阻塞**服务启动；下载中地理暂降级，完成后热切换 reader。
  - 拉取失败（无外网/URL 变动）→ 记 warn 日志，保持降级，不影响其它功能。
  - 月份计算避免用 `Date.now()` 之类不可复现调用——这是 Go 后端，正常用 `time.Now()`（本约束仅针对 workflow 脚本，不适用后端）。
- **优雅降级贯穿**：reader 为 nil 时，所有 geo 相关字段返回空，estimate 用非地理信号照常算，置信度降 `low`，接口不报错、不拖慢。

### 4.5 首次落地

我已把 `dbip-city-lite-2026-07.mmdb` 下载到仓库 `data/geoip/`（gitignored）。实施时**统一到稳定文件名**：把它复制/重命名为 `GEOIP_DB_PATH` 指向的 `dbip-city-lite.mmdb`（默认 `/data/geoip/dbip-city-lite.mmdb`），并写好对应的 `.version` sidecar（`2026-07`）。此后 §4.4-B 的自举逻辑按 sidecar 年月自动维护，不再出现带月份的文件名。

---

## §5 · 后端接口规格

### 5.1 扩展 `GET /api/log/leaderboard`（`controller/log.go:GetLeaderboard` + `model/log.go:GetLeaderboard`）

**新增 query 参数（向后兼容）**：
- `start_timestamp`（unix 秒）、`end_timestamp`（unix 秒）—— 与日志列表接口同名同义。
- 保留既有 `date`（YYYY-MM-DD）与 `sort_by`。
- 优先级：给了 `start_timestamp`/`end_timestamp` 用之；否则回落 `date`；再否则默认当天 00:00 → 现在（`end=0` 表示不设上界，沿用既有约定）。

**每个 `LeaderboardEntry` 新增 `analysis` 字段**：

```go
type LeaderboardAnalysis struct {
    Estimate     int              `json:"estimate"`        // 疑似人数
    EstimateIsMin bool            `json:"estimate_is_min"` // true => 展示为「≥N」
    Confidence   string           `json:"confidence"`      // high|medium|low
    IpCount      int              `json:"ip_count"`        // 去重子网簇数
    TokenCount   int              `json:"token_count"`     // 去重活跃 token 数
    TopRegions   []LeaderboardRegion `json:"top_regions"`  // 最多 3 个
    HasIpData    bool             `json:"has_ip_data"`     // false => 「数据不足」
}
type LeaderboardRegion struct {
    Country string `json:"country"`
    City    string `json:"city"`
    Count   int    `json:"count"`
}
```

**计算方式（便宜信号，不扫全部原始行）**：
- 数据源：**日志读 `LOG_DB.Table("logs")`**（logs 与 users 可能是不同数据库；用户名解析走 `DB`，与既有 `model.GetLeaderboard` 一致）。
- 用聚合查询取每个 top-N 用户的：
  - 去重 IP 集合：`... WHERE type=? AND created_at>=? [AND created_at<?] AND user_id IN ? GROUP BY user_id, ip`（每 (user, ip) 一行，IP 天然有界，一个用户 distinct IP 通常几十个内），Go 层按 user 聚合。
  - 去重 token 数：`SELECT user_id, COUNT(DISTINCT token_id) ... GROUP BY user_id`。
  - `request_count`：复用主聚合的 `COUNT(*)`。
- 子网归并（/24、/48）+ GeoIP 解析 + `distinct_geo` 空城市归并均在 **Go 层**做（不进 SQL，规避跨库函数差异，符合根 Rule 2）。
- `top_regions`：按 `count` 降序取前 3。
- best-effort：GeoIP 缺失 → `top_regions` 空、`estimate` 照出、`confidence` 降级。

### 5.2 新增 `GET /api/log/leaderboard/analysis`（抽屉明细）

**Query**：`user_id`（必填）、`start_timestamp`、`end_timestamp`（同上语义）。

**Response `data`**（所有子结构体字段显式定义，供前端 `types.ts` + Zod 精确对齐，符合 §Rule 7）：

```go
type LeaderboardAnalysisDetail struct {
    UserId         int                  `json:"user_id"`
    Estimate       int                  `json:"estimate"`
    EstimateIsMin  bool                 `json:"estimate_is_min"`
    Confidence     string               `json:"confidence"`         // high|medium|low
    Conclusion     string               `json:"conclusion"`         // 一句话结论（中转分发/多人分发/单人 等）
    HasIpData      bool                 `json:"has_ip_data"`
    Truncated      bool                 `json:"truncated"`          // 采样是否触顶
    SampledRows    int                  `json:"sampled_rows"`       // 实际参与分析的行数
    SubnetClusters int                  `json:"subnet_clusters"`
    DistinctGeo    int                  `json:"distinct_geo"`
    TokenCount     int                  `json:"token_count"`
    MaxConcurrency int                  `json:"max_concurrency"`
    InputDispersionScore int            `json:"input_dispersion_score"` // §3.2.1 标量
    Ips            []AnalysisIpRow      `json:"ips"`
    Tokens         []AnalysisTokenRow   `json:"tokens"`
    InputBuckets   []AnalysisBucket     `json:"input_buckets"`      // prompt_tokens 数量级直方图
    Timeline       []AnalysisTimeBucket `json:"timeline"`           // 按时间片的请求数
}

type AnalysisIpRow struct {
    Ip           string `json:"ip"`
    Country      string `json:"country"`      // 可空（GeoIP 缺失/未命中）
    City         string `json:"city"`         // 可空
    Subnet       string `json:"subnet"`       // 归并后的 /24 或 /48 前缀
    RequestCount int    `json:"request_count"`
    FirstSeen    int64  `json:"first_seen"`   // unix 秒
    LastSeen     int64  `json:"last_seen"`    // unix 秒
}

type AnalysisTokenRow struct {
    TokenId      int    `json:"token_id"`
    TokenName    string `json:"token_name"`
    RequestCount int    `json:"request_count"`
    PromptTokens int64  `json:"prompt_tokens"`   // 该 token 输入 token 汇总
}

type AnalysisBucket struct {
    Label string `json:"label"`   // 如 "0-100" / "100-1k" / "1k-10k" / "10k-100k" / "100k+"
    Min   int    `json:"min"`      // 桶下界（prompt_tokens）
    Count int    `json:"count"`    // 落入该桶的请求数
}

type AnalysisTimeBucket struct {
    Ts    int64 `json:"ts"`     // 时间片起点 unix 秒
    Count int   `json:"count"`  // 该时间片请求数
}
```

- **时间片粒度**：按窗口跨度自适应（如 ≤1 天用小时片、≤7 天用天片…），实现时取一个固定映射，前端只消费 `ts`+`count` 不关心粒度。

**采样边界（§7）**：明细拉原始行**封顶 5 万行**，按 `created_at DESC` 取最近 N 行；触顶时 `truncated=true`，`sampled_rows` 反映实际行数，UI 提示「基于最近 5 万条」。数据源同为 `LOG_DB.Table("logs")`。

### 5.3 路由注册（`router/api-router.go`，logRoute 组内）

```go
logRoute.GET("/leaderboard/analysis",
    middleware.AdminAuth(),
    middleware.PermissionAuth(common.PermissionPointLogView),
    controller.GetLeaderboardAnalysis)
```

（`/leaderboard` 已存在，仅扩展其 handler。）

### 5.4 跨库兼容（根 Rule 2）

- `COUNT(DISTINCT ...)`、`GROUP BY`、`DISTINCT` 均三库可移植。
- 子网归并、并发扫描线、输入分桶全部放 Go 层，不写库特定 SQL / JSON 操作符。
- 时间比较用既有 `created_at >= ? AND created_at < ?` 模式（与现有 leaderboard 查询一致）。

---

## §6 · 前端规格（web-worker）

> 约束：仅 shadcn/ui + Tailwind v4 + `@tabler/icons-react`；图表用 `recharts`；全 `/api/*` 200 约定，不用 `res.ok` 判错（`web-worker/CLAUDE.md` §Rule 7）。

### 6.1 日期范围筛选（替换单日 Calendar）

- 复用日志列表的 datetime-local 起止选择模式：`toDatetimeLocal` / `fromDatetimeLocal` 定义在 **`web-worker/src/lib/dashboard-metrics.ts`**（`log-table.tsx:60` 从那里 import），`rangeInput` 结构参考 `log-table.tsx`。
- 默认当天 00:00 → 现在；提供「今天 / 近 7 天」快捷按钮。
- 发送 `start_timestamp` / `end_timestamp`（unix 秒），不再发 `date`。

### 6.2 api-client（`src/api-client/leaderboard.ts` + `types.ts`）

- `getLeaderboard(startTs?, endTs?, sortBy)` 改传 `start_timestamp`/`end_timestamp`。
- `LeaderboardEntry` 类型加 `analysis: LeaderboardAnalysis`（顶部 `// source: model/log.go:GetLeaderboard` 注释）。
- 新增 `LeaderboardAnalysisDetail` 类型 + `getLeaderboardAnalysis(userId, startTs?, endTs?)`。
- 新增 hook `useLeaderboardAnalysis(userId, startTs, endTs, enabled)`（点击行时 enabled）。
- 均为 GET 读取，无写操作，不涉及 §Rule 7 的高危写接口对齐（但仍遵守下划线字段名 + 全 200 约定）。

### 6.3 列表列（`src/components/leaderboard/leaderboard-table.tsx`）

- 新增「**分析**」列：
  - `has_ip_data && estimate` → 「疑似 N 人」/「≥N 人」（`estimate_is_min`）+ 置信度色点（high=绿 / medium=黄 / low=灰）。
  - `!has_ip_data` → 「数据不足」灰字。
- 整行可点击（`cursor-pointer` + hover 态）→ 打开抽屉（见 6.5）。

### 6.4 podium 前三（`src/components/leaderboard/podium.tsx`）

- 前三卡片加小徽标：「疑似 N 人」+ 置信度色点，视觉不大改。
- 点击卡片同样打开抽屉。

### 6.5 详情抽屉

- 用现成 `src/components/ui/sheet.tsx`（右侧 Sheet）。
- 结构：
  - 头部：账号名 + 结论文本（`conclusion`）+ 置信度徽标；`!has_ip_data` 时的提示条；`truncated` 时的「基于最近 5 万条」提示。
  - 分块卡片：
    1. **IP 明细** — 表格：IP / 国家（可加国旗 emoji）/ 城市 / 子网 / 请求数 / 首末见时间。`city == ""` 时只显示国家；国家也空时显示「未知」。
    2. **Token 明细** — 每个 token 的请求数 + 输入 token 汇总。
    3. **并发峰值** — `max_concurrency` 数值 + 一句解读。
    4. **输入 token 分布** — recharts 直方图（`input_buckets`）。
    5. **时间线** — recharts 趋势（`timeline`）。
- 加载态 skeleton；错误态 `StateMessage`。

### 6.6 i18n

- `web-worker/src/i18n/locales/zh/console.json` 新增中文源 key（分析列、置信度、抽屉各标题、数据不足/截断提示等）。其它语言留 key（按项目现有 i18n 流程）。

---

## §7 · 数据流与性能边界

```
列表加载:
  前端 → GET /log/leaderboard?start_timestamp&end_timestamp&sort_by
       → 后端: 聚合(quota/tokens/count) + 便宜信号(distinct ip / distinct token) [top-N]
       → Go 层: 子网归并 + GeoIP 解析 + 估计算法(纯函数)
       → 返回 entries[].analysis
  ⇒ 不扫原始行, 宽窗口也快

点击某行:
  前端 → GET /log/leaderboard/analysis?user_id&start_timestamp&end_timestamp
       → 后端: 拉该用户原始行 (created_at DESC, LIMIT 50000)
       → Go 层: 并发扫描线 + 输入分桶 + 时间线 + 中转识别
       → 返回明细 + truncated 标记
  ⇒ 单用户有界, 只在点击时算
```

- **列表接口**：绝不扫单用户全部原始行；只做聚合 + 有界 distinct。
- **抽屉接口**：单用户封顶 5 万行，`created_at DESC` 采样；触顶 `truncated=true`。
- **GeoIP**：本地 mmdb，微秒级，缺失即降级，不成为瓶颈。

---

## §8 · Codex 切片与交付顺序

1. **切片 1 — GeoIP 子系统**：`common/geoip` 包（Init/Lookup/Close）、配置项、A+B 部署逻辑（挂卷 + 启动异步自下载 + 降级）、go.mod 依赖。可独立单测（Lookup + 降级路径）。
2. **切片 2 — 后端估计算法（纯函数）+ 聚合查询**：信号抽取、子网归并、`EstimateAccountSharing` 纯函数、置信度。纯函数单测优先（TDD）。
3. **切片 3 — 扩展 `/log/leaderboard`**：start/end 参数、`analysis` 字段拼装、best-effort geo。
4. **切片 4 — 新增 `/log/leaderboard/analysis`**：明细计算（并发扫描线、输入分桶、时间线、中转识别）、5 万采样边界、路由注册。
5. **切片 5 — 前端日期范围筛选**：替换单日 Calendar 为起止选择，默认当天，快捷按钮。
6. **切片 6 — 前端分析列 + api-client**：types/hook、列表「分析」列、podium 徽标。
7. **切片 7 — 前端详情抽屉**：Sheet 明细、recharts 图、i18n。

每切片交付附：改动文件清单 + 自测结果；涉及接口形状的附实际响应样例。

---

## §9 · 测试策略

- **后端（优先 TDD）**：
  - `EstimateAccountSharing` 纯函数单测：构造聚合信号 → 断言 estimate / confidence / estimate_is_min（覆盖单人、多国多 token、单 IP 高请求量触发 `list_transit_suspected` 的列表级 `≥N`、IP 全空退化）。
  - `input_dispersion_score` 纯函数单测：构造并发重叠且 prompt_tokens 跨数量级的请求 → 断言 score>=2；单一量级 → score<2。
  - 中转识别组合断言：`subnet_clusters<=2 && max_concurrency>=K && score>=2` → conclusion 标中转、estimate_is_min=true。
  - GeoIP：Lookup 正常 + reader=nil 降级 + 非法 IP + 有国家无城市（空城市归并到国家级）。
  - start/end 参数解析与 date 回落。
  - 并发扫描线纯函数单测（构造重叠区间 → 断言 max_concurrency）。
- **前端**：
  - range picker 参数编码（datetime-local → unix 秒）。
  - analysis 列渲染（三种置信度 + 数据不足）。
  - 抽屉数据流（enabled 时机、truncated 提示）。

---

## §10 · 非目标 / YAGNI

- **不**做基于 prompt 原文的相似度分析（日志不存原文）。
- **不**做实时告警 / 自动封号（本功能只做只读展示）。
- **不**把地理信息写回日志表（历史日志无此列，且改动扩散到 relay 写路径；本设计只在读时解析）。
- **不**把 mmdb 提交进 git（超 100MB 限制，走挂卷/自下载）。
- **不**引入 ECharts / Semi UI 等（违反 §Rule 7）。
- **不**改动旧 `web/` 前端。
