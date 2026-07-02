# 账单导出优化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `/console/topup` 底部「导出账单」默认只需选日期即可导出全部，筛选项改多选下拉，CSV 去掉 `channel_id`、新增 `quota_usd`，并排除流式对话零输出扣费的异常日志。

**Architecture:** 后端在 Go 主仓给日志导出/统计路径新增 opt-in 复数筛选参数（重复 query param → `IN`）与零输出排除（新增 `LogExportFilters` 结构 + 纯函数 `applyLogExtraFilters`，不改现有查询构造器签名，日志列表页零影响）；CSV 生成层增删列。前端在 `web-worker` 把 4 个文本框换成多选下拉、移除渠道筛选与分组默认锁定、按数组重复参数发请求，统计卡与导出同口径。

**Tech Stack:** Go 1.22 + Gin + GORM；React 18 + TanStack Router/Query + shadcn/ui + Tailwind；测试 `go test` 与 `node --import tsx --test`。

**Spec:** `docs/superpowers/specs/2026-07-02-billing-export-optimization-design.md`

**关键决策（已确认）：** `quota_usd` 纯数字 6 位小数保留原始 `quota`；表头保持英文；渠道筛选完全移除；两个导出都改；对话模型判定用**黑名单**（非对话才保留）；汇总卡同步。

**工作目录约定：** 后端任务在仓库根 `/Users/songjunxi/Desktop/repos/fish-new-api` 执行；前端任务在 `web-worker/` 执行。

---

## Part A — 后端（Go 主仓）

### Task A1: 非对话模型名派生 `GetNonChatModelNames`

**Files:**
- Modify: `model/pricing.go`（在 `GetModelSupportEndpointTypes` 之后新增）
- Test: `model/pricing_nonchat_test.go`（新建）

- [ ] **Step 1: 写失败测试**（测纯函数 `hasChatEndpoint`）

```go
package model

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/require"
)

func TestHasChatEndpoint(t *testing.T) {
	require.True(t, hasChatEndpoint([]constant.EndpointType{constant.EndpointTypeAnthropic}))
	require.True(t, hasChatEndpoint([]constant.EndpointType{constant.EndpointTypeOpenAI, constant.EndpointTypeEmbeddings}))
	require.False(t, hasChatEndpoint([]constant.EndpointType{constant.EndpointTypeEmbeddings}))
	require.False(t, hasChatEndpoint([]constant.EndpointType{constant.EndpointTypeJinaRerank, constant.EndpointTypeImageGeneration}))
	require.False(t, hasChatEndpoint(nil))
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `go test ./model/ -run TestHasChatEndpoint -v`
Expected: FAIL（`hasChatEndpoint` undefined）

- [ ] **Step 3: 实现**（加到 `model/pricing.go`）

```go
var chatEndpointTypeSet = map[constant.EndpointType]bool{
	constant.EndpointTypeOpenAI:                true,
	constant.EndpointTypeOpenAIResponse:        true,
	constant.EndpointTypeOpenAIResponseCompact: true,
	constant.EndpointTypeAnthropic:             true,
	constant.EndpointTypeGemini:                true,
}

func hasChatEndpoint(endpoints []constant.EndpointType) bool {
	for _, ep := range endpoints {
		if chatEndpointTypeSet[ep] {
			return true
		}
	}
	return false
}

// GetNonChatModelNames 返回「不支持任何对话端点」的模型名列表（embeddings/rerank/image/video 等）。
// 用于账单导出的零输出异常排除：仅对话模型才参与排除，非对话模型永不被剔除。
func GetNonChatModelNames() []string {
	GetPricing() // 确保 modelSupportEndpointTypes 已加载/刷新
	modelSupportEndpointsLock.RLock()
	defer modelSupportEndpointsLock.RUnlock()
	nonChat := make([]string, 0)
	for modelName, endpoints := range modelSupportEndpointTypes {
		if !hasChatEndpoint(endpoints) {
			nonChat = append(nonChat, modelName)
		}
	}
	return nonChat
}
```

确认 `model/pricing.go` 已 import `github.com/QuantumNous/new-api/constant`（`SupportedEndpointTypes []constant.EndpointType` 已在用，应已导入）。

- [ ] **Step 4: 跑测试确认通过**

Run: `go test ./model/ -run TestHasChatEndpoint -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add model/pricing.go model/pricing_nonchat_test.go
git commit -m "feat(log): 新增 GetNonChatModelNames 用于账单零输出排除"
```

---

### Task A2: `LogExportFilters` 结构 + `applyLogExtraFilters` 纯函数

**Files:**
- Modify: `model/log.go`（新增类型与函数，放在 `buildUserLogsQuery` 附近）
- Test: `model/log_extra_filters_test.go`（新建）

- [ ] **Step 1: 写失败测试**（用真实 DB helper `withLogStatTestDB`，直接经导出函数验证 IN 过滤与零输出排除）

```go
package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func seedExportLog(t *testing.T, id, userId int, model, token, group string, isStream bool, comp, quota int) {
	t.Helper()
	require.NoError(t, LOG_DB.Create(&Log{
		Id: id, UserId: userId, Type: LogTypeConsume,
		ModelName: model, TokenName: token, Group: group,
		IsStream: isStream, CompletionTokens: comp, Quota: quota,
		CreatedAt: common.GetTimestamp(),
	}).Error)
}

func TestGetUserLogsForExportExtraFilters(t *testing.T) {
	withLogStatTestDB(t, func() {
		now := common.GetTimestamp()
		// 1: 正常对话 2: 另一模型 3: 另一令牌
		seedExportLog(t, 1, 10, "gpt-5", "prod", "vip", false, 20, 100)
		seedExportLog(t, 2, 10, "claude-opus-4-8", "prod", "vip", false, 30, 200)
		seedExportLog(t, 3, 10, "gpt-5", "test", "vip", false, 10, 50)

		count := func(f LogExportFilters) int64 {
			logs, _, _, err := GetUserLogsForExport(10, LogTypeConsume, now-100, now+100, "", "", "", "", "", "", "", false, f)
			require.NoError(t, err)
			return int64(len(logs))
		}

		// model_names IN 精确过滤
		require.EqualValues(t, 2, count(LogExportFilters{ModelNames: []string{"gpt-5"}}))
		require.EqualValues(t, 3, count(LogExportFilters{}))
		// token_names IN
		require.EqualValues(t, 2, count(LogExportFilters{TokenNames: []string{"prod"}}))
		// 多值 IN
		require.EqualValues(t, 3, count(LogExportFilters{ModelNames: []string{"gpt-5", "claude-opus-4-8"}}))
	})
}

func TestGetUserLogsForExportExcludeStreamZeroCompletion(t *testing.T) {
	withLogStatTestDB(t, func() {
		now := common.GetTimestamp()
		// A: 流式对话模型 + 0输出 + 扣费 → 异常，应排除
		seedExportLog(t, 1, 10, "claude-opus-4-8", "t", "g", true, 0, 174660)
		// B: 流式 embedding + 0输出 + 扣费 → 非对话，应保留
		seedExportLog(t, 2, 10, "text-embedding-3-small", "t", "g", true, 0, 500)
		// C: 流式对话 + 有输出 → 保留
		seedExportLog(t, 3, 10, "claude-opus-4-8", "t", "g", true, 40, 200)
		// D: 非流式对话 + 0输出 + 扣费 → 保留（非流式不排除）
		seedExportLog(t, 4, 10, "claude-opus-4-8", "t", "g", false, 0, 300)

		f := LogExportFilters{
			ExcludeStreamZeroCompletion: true,
			NonChatModels:               []string{"text-embedding-3-small"}, // 显式注入，绕过定价加载
		}
		logs, _, _, err := GetUserLogsForExport(10, LogTypeConsume, now-100, now+100, "", "", "", "", "", "", "", false, f)
		require.NoError(t, err)
		ids := map[int]bool{}
		for _, l := range logs {
			ids[l.Id] = true
		}
		require.False(t, ids[1], "异常流式对话零输出应被排除")
		require.True(t, ids[2], "embedding 零输出应保留")
		require.True(t, ids[3], "有输出应保留")
		require.True(t, ids[4], "非流式应保留")
	})
}
```

> 注：`GetUserLogsForExport` 会在导出时把 `logs[i].Id = 0`。若上面按 Id 断言失败，改为按 `ModelName`+`Quota`+`IsStream` 组合断言，或在断言前记录数量。实施时以实际返回字段为准（见 model/log.go:806-825 会清空 Id/ChannelName）——**因此测试改用「按数量 + 特征」断言**：断言总数=3 且不含 (is_stream=true,comp=0,quota=174660) 那条。

- [ ] **Step 2: 跑测试确认失败**

Run: `go test ./model/ -run TestGetUserLogsForExport -v`
Expected: FAIL（`LogExportFilters` / 新签名未定义）

- [ ] **Step 3: 实现 `LogExportFilters` + `applyLogExtraFilters`**（加到 `model/log.go`）

```go
// LogExportFilters 承载账单导出/统计专用的 opt-in 多值筛选与零输出排除。
// 现有单值查询构造器不受影响；仅导出与统计路径消费本结构。
type LogExportFilters struct {
	TokenNames                  []string
	ModelNames                  []string
	Groups                      []string
	BusinessGroups              []string
	ExcludeStreamZeroCompletion bool
	// NonChatModels 为空且 ExcludeStreamZeroCompletion 时，由调用方用 GetNonChatModelNames() 填充。
	NonChatModels []string
}

func (f LogExportFilters) isEmpty() bool {
	return len(f.TokenNames) == 0 && len(f.ModelNames) == 0 &&
		len(f.Groups) == 0 && len(f.BusinessGroups) == 0 &&
		!f.ExcludeStreamZeroCompletion
}

// applyLogExtraFilters 按列前缀（导出用 "logs."，统计用 ""）追加多值 IN 过滤与零输出排除。
// prefix 之后拼接的均为固定列名/内部常量，非用户输入，无注入风险。
func applyLogExtraFilters(tx *gorm.DB, f LogExportFilters, prefix string) *gorm.DB {
	if len(f.TokenNames) > 0 {
		tx = tx.Where(prefix+"token_name IN ?", f.TokenNames)
	}
	if len(f.ModelNames) > 0 {
		tx = tx.Where(prefix+"model_name IN ?", f.ModelNames)
	}
	if len(f.Groups) > 0 {
		tx = tx.Where(prefix+logGroupCol+" IN ?", f.Groups)
	}
	if len(f.BusinessGroups) > 0 {
		tx = tx.Where(prefix+"business_group IN ?", f.BusinessGroups)
	}
	if f.ExcludeStreamZeroCompletion {
		base := "NOT (" + prefix + "is_stream = ? AND " + prefix + "completion_tokens = 0 AND " + prefix + "quota > 0"
		if len(f.NonChatModels) > 0 {
			tx = tx.Where(base+" AND "+prefix+"model_name NOT IN ?)", true, f.NonChatModels)
		} else {
			tx = tx.Where(base+")", true)
		}
	}
	return tx
}
```

确认 `model/log.go` 顶部已 import `"gorm.io/gorm"`（`buildUserLogsQuery` 返回 `*gorm.DB`，应已导入）。

- [ ] **Step 4:** 先不跑（导出函数签名下一任务改）。仅确认编译：`go build ./model/`
Expected: 编译错误只应来自「测试引用了尚未改签名的 `GetUserLogsForExport`」——这会在 Task A3 消解。若想让本任务独立可编译，可先在 Task A3 一并跑测试。**建议 A2+A3 连续实施后再统一跑测试与提交。**

- [ ] **Step 5:** 暂不单独提交，与 A3 合并提交。

---

### Task A3: 导出/统计函数透传 `LogExportFilters`

**Files:**
- Modify: `model/log.go`
  - `GetUserLogsForExport`、`GetAllLogsForExport`（末尾加参数 `filters LogExportFilters`，builder 之后 `applyLogExtraFilters`）
  - `SumUsedQuota`（末尾加 `filters LogExportFilters`，对 3 个子查询各 `applyLogExtraFilters(..., "")`）
- Modify: 测试调用 `SumUsedQuota` 的 3 处（`model/log_stat_test.go`、`model/log_business_group_test.go`）末尾加 `LogExportFilters{}`

- [ ] **Step 1:** 改 `GetUserLogsForExport` 签名与体

在函数签名末尾加 `, filters LogExportFilters`；在 `tx, err := buildUserLogsQuery(...)` 成功之后、`Count` 之前插入：

```go
	if filters.ExcludeStreamZeroCompletion && filters.NonChatModels == nil {
		filters.NonChatModels = GetNonChatModelNames()
	}
	tx = applyLogExtraFilters(tx, filters, "logs.")
```

- [ ] **Step 2:** 同样改 `GetAllLogsForExport`（`buildAdminLogsQuery` 之后同插入，prefix `"logs."`）。

- [ ] **Step 3:** 改 `SumUsedQuota` 签名末尾加 `, filters LogExportFilters`；在函数开头解析一次 NonChatModels，然后对 `tx`、`rpmTpmQuery`、`cacheQuery` 三处构建后各追加：

```go
	if filters.ExcludeStreamZeroCompletion && filters.NonChatModels == nil {
		filters.NonChatModels = GetNonChatModelNames()
	}
	// 每次 buildLogStatConsumeQuery(...) 之后：
	tx = applyLogExtraFilters(tx, filters, "")
	// rpmTpmQuery = applyLogExtraFilters(rpmTpmQuery, filters, "")
	// cacheQuery = applyLogExtraFilters(cacheQuery, filters, "")
```

（统计用 `Table("logs")` 无前缀 → prefix `""`；group 列走 `logGroupCol`，与 `buildLogStatConsumeQuery` 一致。）

- [ ] **Step 4:** 更新 3 处测试调用，`SumUsedQuota(..., 0, 0)` 末尾追加 `, LogExportFilters{}`：
  - `model/log_business_group_test.go:54`
  - `model/log_stat_test.go:138`、`:214`、`:329`（共 3 处，按实际 grep 结果）

- [ ] **Step 5: 跑全部相关测试**

Run: `go test ./model/ -run 'TestGetUserLogsForExport|TestHasChatEndpoint|Stat|BusinessGroup' -v`
Expected: PASS（含 A2 的两个新测试）

- [ ] **Step 6: 编译整包**

Run: `go build ./...`
Expected: 仍会因 controller 未透传参数而**报错**（`GetUserLogsForExport`/`GetAllLogsForExport`/`SumUsedQuota` 调用参数不足）——这在 Task A4 消解。**A3、A4 连续实施后再统一 `go build ./...`。**

- [ ] **Step 7: 提交（A2+A3 合并）**

```bash
git add model/log.go model/log_extra_filters_test.go model/log_stat_test.go model/log_business_group_test.go
git commit -m "feat(log): 导出/统计支持多值IN过滤与流式零输出排除"
```

---

### Task A4: 解析新 query 参数并在 controller 透传

**Files:**
- Modify: `controller/log.go`
  - `logQueryParams` struct 加字段
  - `getLogQueryParams` 解析
  - `ExportUserLogs`/`ExportAllLogs`/`GetLogsStat`/`GetLogsSelfStat` 组装 `model.LogExportFilters` 并透传

- [ ] **Step 1:** `logQueryParams` struct 增字段：

```go
	TokenNames                  []string
	ModelNames                  []string
	Groups                      []string
	BusinessGroups              []string
	ExcludeStreamZeroCompletion bool
```

- [ ] **Step 2:** 在 `getLogQueryParams` 里解析（新增 `cleanStringSlice` helper，支持重复 param 与逗号分隔，去空白去空值）：

```go
func cleanStringSlice(values []string) []string {
	out := make([]string, 0, len(values))
	for _, v := range values {
		for _, part := range strings.Split(v, ",") {
			if part = strings.TrimSpace(part); part != "" {
				out = append(out, part)
			}
		}
	}
	return out
}
```

在返回的 `logQueryParams{...}` 里补：

```go
		TokenNames:                  cleanStringSlice(c.QueryArray("token_names")),
		ModelNames:                  cleanStringSlice(c.QueryArray("model_names")),
		Groups:                      cleanStringSlice(c.QueryArray("groups")),
		BusinessGroups:              cleanStringSlice(c.QueryArray("business_groups")),
		ExcludeStreamZeroCompletion: c.Query("exclude_stream_zero_completion") == "true" || c.Query("exclude_stream_zero_completion") == "1",
```

确认 `controller/log.go` 已 import `"strings"`（若无则加）。

- [ ] **Step 3:** 加一个组装 helper（controller 内）：

```go
func (q logQueryParams) exportFilters() model.LogExportFilters {
	return model.LogExportFilters{
		TokenNames:                  q.TokenNames,
		ModelNames:                  q.ModelNames,
		Groups:                      q.Groups,
		BusinessGroups:              q.BusinessGroups,
		ExcludeStreamZeroCompletion: q.ExcludeStreamZeroCompletion,
	}
}
```

- [ ] **Step 4:** 4 处调用透传：
  - `ExportUserLogs`：`model.GetUserLogsForExport(..., query.CompactExport, query.exportFilters())`
  - `ExportAllLogs`：`model.GetAllLogsForExport(..., query.CompactExport, query.exportFilters())`
  - `GetLogsStat`：`model.SumUsedQuota(..., query.SubscriptionPlanId, query.exportFilters())`
  - `GetLogsSelfStat`：`model.SumUsedQuota(..., query.SubscriptionPlanId, query.exportFilters())`

- [ ] **Step 5: 全量编译**

Run: `go build ./...`
Expected: PASS（无报错）

- [ ] **Step 6: 跑 controller/log 测试**

Run: `go test ./controller/ ./model/ 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add controller/log.go
git commit -m "feat(log): 解析并透传账单导出多值参数与零输出排除标志"
```

---

### Task A5: CSV 列 — 去 `channel_id`、加 `quota_usd`

**Files:**
- Modify: `controller/log.go:writeLogsCSV`
- Test: `controller/log_csv_test.go`（新建，若可脱离 DB 直接测 CSV 行；否则测一个抽出的纯函数）

- [ ] **Step 1:** 抽出纯函数便于测试，在 `controller/log.go` 加：

```go
func logCSVHeaders(compact bool) []string {
	headers := []string{
		"id", "created_at", "type", "user_id", "username",
		"token_name", "model_name", "quota", "quota_usd",
		"prompt_tokens", "completion_tokens", "use_time", "is_stream",
		"channel_name", "group", "business_group", "ip", "request_id",
	}
	if !compact {
		headers = append(headers, "content", "other")
	}
	return headers
}

func logCSVRow(l *model.Log, compact bool) []string {
	quotaUsd := strconv.FormatFloat(float64(l.Quota)/common.QuotaPerUnit, 'f', 6, 64)
	row := []string{
		strconv.Itoa(l.Id),
		strconv.FormatInt(l.CreatedAt, 10),
		strconv.Itoa(l.Type),
		strconv.Itoa(l.UserId),
		l.Username,
		l.TokenName,
		l.ModelName,
		strconv.Itoa(l.Quota),
		quotaUsd,
		strconv.Itoa(l.PromptTokens),
		strconv.Itoa(l.CompletionTokens),
		strconv.Itoa(l.UseTime),
		strconv.FormatBool(l.IsStream),
		l.ChannelName,
		l.Group,
		l.BusinessGroup,
		l.Ip,
		l.RequestId,
	}
	if !compact {
		row = append(row, l.Content, l.Other)
	}
	return row
}
```

> 注意：现有 `writeLogsCSV` 表头/行**不按 compact 分支**（始终含 content/other）。为最小改动且保持行为一致，`logCSVHeaders`/`logCSVRow` 也可**始终**附 content/other（即忽略 compact 分支，与现状一致）。实施时二选一并保持 header 与 row 列数一致；推荐：**始终附 content/other**（传 `compact=false` 语义），避免列数漂移。

- [ ] **Step 2:** 写失败测试（纯函数，无需 DB）：

```go
package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestLogCSVHeadersNoChannelIdHasQuotaUsd(t *testing.T) {
	h := logCSVHeaders(false)
	require.NotContains(t, h, "channel_id")
	require.Contains(t, h, "quota_usd")
	// quota_usd 紧跟 quota
	for i, c := range h {
		if c == "quota" {
			require.Equal(t, "quota_usd", h[i+1])
		}
	}
}

func TestLogCSVRowQuotaUsd(t *testing.T) {
	row := logCSVRow(&model.Log{Quota: 174660}, false)
	h := logCSVHeaders(false)
	idx := -1
	for i, c := range h {
		if c == "quota_usd" {
			idx = i
		}
	}
	require.Equal(t, "0.349320", row[idx])
	require.Equal(t, len(h), len(row))
}
```

- [ ] **Step 3:** 跑确认失败：`go test ./controller/ -run TestLogCSV -v` → FAIL

- [ ] **Step 4:** 让 `writeLogsCSV` 改用这两个纯函数：

```go
	headers := logCSVHeaders(false)
	if err := writer.Write(headers); err != nil { ... }
	for _, logItem := range logs {
		if err := writer.Write(logCSVRow(logItem, false)); err != nil { ... }
	}
```

- [ ] **Step 5:** 跑确认通过：`go test ./controller/ -run TestLogCSV -v` → PASS

- [ ] **Step 6:** 提交

```bash
git add controller/log.go controller/log_csv_test.go
git commit -m "feat(log): 导出CSV去掉channel_id列，新增quota_usd列"
```

---

### Task A6: 后端整体验证

- [ ] **Step 1:** `go build ./...` → PASS
- [ ] **Step 2:** `go test ./model/ ./controller/ 2>&1 | tail -30` → PASS
- [ ] **Step 3:** `go vet ./model/ ./controller/`（如项目用）→ 无新问题
- [ ] **Step 4:** 手测（可选）：本地起服务，`curl` 带 `?token_names=a&token_names=b&exclude_stream_zero_completion=true&compact=true` 命中 `/api/log/self/export`，肉眼核对 CSV 列。

---

## Part B — 前端（`web-worker/`，工作目录切到 `web-worker`）

### Task B1: `billing-export.ts` 契约与工具改为多值

**Files:**
- Modify: `web-worker/src/lib/billing-export.ts`
- Modify: `web-worker/src/lib/billing-export.test.ts`（更新既有用例 + 新增数组用例）

- [ ] **Step 1:** 改类型与函数（要点）：

```ts
export interface BillingExportQuery {
  type: number;
  start_timestamp?: number;
  end_timestamp?: number;
  token_names?: string[];
  model_names?: string[];
  groups?: string[];
  business_groups?: string[];
  exclude_stream_zero_completion?: boolean;
  // admin-only 标量（保留）
  username?: string;
  user_id?: number;
}
```

- `normalizeBillingExportQuery`：清洗数组（trim、去空、去重），保留 timestamps 与 admin 标量；**始终**带 `exclude_stream_zero_completion: true`（账单固定排除）。
- `withBillingFilterDefaults`：**删除**自动锁定用户分组的逻辑（`defaults.group = group` 整段移除）；admin 的 username/user_id 默认逻辑保留。
- `appendBillingExportParams`：数组用 `search.append(key, v)` 逐个追加（重复 param）；标量用 `set`；`exclude_stream_zero_completion` 为真时 `set('exclude_stream_zero_completion','true')`。
- `buildBillingExportUrl`：仍 `set('compact','true')`，其余走 `appendBillingExportParams`。
- 移除对 `channel` / 单值 `token_name` 等的处理。

- [ ] **Step 2:** 写/改测试（`billing-export.test.ts`）覆盖：
  - URL 含重复参数：`token_names=a&token_names=b`、`model_names=...`。
  - 无分组默认：给定不含 group 的 query，输出不含 `groups=`（除非显式选择）。
  - `exclude_stream_zero_completion=true` 恒存在。
  - 移除引用已删除导出（`deriveBillingTokenTotalFromQuota` 若保留则不动；`channel` 相关断言删除）。

```ts
test('serializes multi-select filters as repeated params and always excludes stream-zero', () => {
  const url = buildBillingExportUrl(
    { type: 2, token_names: ['a', 'b'], model_names: ['gpt-5'] },
    false
  );
  assert.match(url, /token_names=a&token_names=b/);
  assert.match(url, /model_names=gpt-5/);
  assert.match(url, /exclude_stream_zero_completion=true/);
  assert.match(url, /compact=true/);
  assert.doesNotMatch(url, /channel/);
});
```

- [ ] **Step 3:** 跑测试

Run: `node --import tsx --test src/lib/billing-export.test.ts`
Expected: PASS（先失败后实现，按 TDD 顺序）

- [ ] **Step 4:** 提交

```bash
git add src/lib/billing-export.ts src/lib/billing-export.test.ts
git commit -m "feat(billing): 导出契约改多值IN参数并移除分组默认锁定"
```

---

### Task B2: `logs.ts` 支持数组参数（导出 + 统计）

**Files:**
- Modify: `web-worker/src/api-client/logs.ts`
- Modify: `web-worker/src/api-client/types.ts`（`LogStatQuery` 加可选数组 + exclude 字段）

- [ ] **Step 1:** `types.ts` 给 `LogStatQuery` 增可选字段（不影响日志页，use-logs 不设即可）：

```ts
  token_names?: string[];
  model_names?: string[];
  groups?: string[];
  business_groups?: string[];
  exclude_stream_zero_completion?: boolean;
```

- [ ] **Step 2:** `logs.ts` 新增数组感知的 query 构建 helper，并在 `getSelfStat`/`getLogsStat` 中：先按原 `withSearch` 拼标量，再对数组 `append`，对 exclude flag `set`。抽一个：

```ts
function appendMultiValueLogParams(
  search: URLSearchParams,
  q: {
    token_names?: string[];
    model_names?: string[];
    groups?: string[];
    business_groups?: string[];
    exclude_stream_zero_completion?: boolean;
  }
) {
  for (const v of q.token_names ?? []) search.append('token_names', v);
  for (const v of q.model_names ?? []) search.append('model_names', v);
  for (const v of q.groups ?? []) search.append('groups', v);
  for (const v of q.business_groups ?? []) search.append('business_groups', v);
  if (q.exclude_stream_zero_completion) {
    search.set('exclude_stream_zero_completion', 'true');
  }
}
```

改 `getSelfStat`/`getLogsStat`：改为手动构建 `URLSearchParams`（标量 + `appendMultiValueLogParams`），或在 `withSearch` 返回后拼接。保持 `listUserLogs`/`listAllLogs` 不动（日志页不受影响）。

- [ ] **Step 3:** typecheck / 构建

Run: `pnpm build`
Expected: 通过（无 TS 错误）

- [ ] **Step 4:** 提交

```bash
git add src/api-client/logs.ts src/api-client/types.ts
git commit -m "feat(logs): 统计与导出接口支持多值IN参数与零输出排除"
```

---

### Task B3: `MultiSelect` 通用组件

**Files:**
- Create: `web-worker/src/components/shared/multi-select.tsx`

- [ ] **Step 1:** 基于既有 shadcn 基元（`popover.tsx`、`command.tsx`、`checkbox.tsx`、`badge.tsx`）实现：
  - Props：`options: { value: string; label: string }[]`、`value: string[]`、`onChange: (v: string[]) => void`、`placeholder?: string`、`disabled?`、`loading?`。
  - 触发器：无选中显示 placeholder（默认「全部」）；有选中显示 Badge 列表 + 计数。
  - Popover 内 Command 搜索 + 可勾选项；点选切换。
  - 纯 shadcn/ui + Tailwind + `@tabler/icons-react`（如 `IconChevronDown`、`IconCheck`）。遵守 web-worker Rule 7 §7。

- [ ] **Step 2:** 构建校验

Run: `pnpm build`
Expected: 通过

- [ ] **Step 3:** 提交

```bash
git add src/components/shared/multi-select.tsx
git commit -m "feat(ui): 新增通用 MultiSelect 多选下拉组件"
```

---

### Task B4: `billing-section.tsx` 接线多选 + 移除渠道

**Files:**
- Modify: `web-worker/src/components/billing/billing-section.tsx`

- [ ] **Step 1:** 数据源查询（`@tanstack/react-query`，失败降级空数组）：
  - 令牌：`listTokens({ p: 1, page_size: 100 })` → `items.map(t => t.name)` 去重
  - 模型：`getUserModels()`
  - 分组：`Object.keys(getSelfGroups())`
  - 业务分组：`listBusinessGroups()` → 取 group 名字段
  - 导入来自 `@/api-client/tokens`、`@/api-client/user`。

- [ ] **Step 2:** `filters` state：`tokenName/modelName/group/businessGroup` 改为 `string[]`；删除 `channel` 字段与其输入框。4 个文本框换成 `<MultiSelect>`。渠道筛选整块删除（含 admin 块里的 channel）。username/user_id 文本框保留。

- [ ] **Step 3:** `applyFilters`/`resetFilters`/`normalizedQuery`：改为组装数组字段与 `exclude_stream_zero_completion: true`；reset 时数组清空（=全部）。stat 查询与导出都传同一 `normalizedQuery`。

- [ ] **Step 4:** 构建 + 手测

Run: `pnpm build`
Expected: 通过

- [ ] **Step 5:** 提交

```bash
git add src/components/billing/billing-section.tsx
git commit -m "feat(billing): 筛选改多选下拉、移除渠道、默认全部"
```

---

### Task B5: `billing.tsx` 路由 search 适配数组

**Files:**
- Modify: `web-worker/src/routes/console/billing.tsx`

- [ ] **Step 1:** `billingSearchSchema`：把 `token_name/model_name/group/business_group`（string）换成 `token_names/model_names/groups/business_groups`（`z.array(z.string()).optional()`）；删除 `channel`；保留 `username/user_id/type/timestamps`。
- [ ] **Step 2:** `toRouteSearch`：映射数组字段；删除 `channel`。
- [ ] **Step 3:** 构建校验

Run: `pnpm build`
Expected: 通过（controlled 模式 `/console/billing` 与 uncontrolled `/console/topup` 均正常）

- [ ] **Step 4:** 提交

```bash
git add src/routes/console/billing.tsx
git commit -m "feat(billing): /console/billing 路由参数适配多值筛选"
```

---

### Task B6: 前端整体验证

- [ ] **Step 1:** `node --import tsx --test src/lib/billing-export.test.ts` → PASS
- [ ] **Step 2:** `pnpm check`（Biome）→ 无错误（`pnpm lint` 自动修复格式）
- [ ] **Step 3:** `pnpm build` → 成功
- [ ] **Step 4:** 手测（`pnpm dev`）：`/console/topup` 底部——只选日期即可导出；令牌/模型/分组/业务分组多选生效；无渠道项；导出 CSV 无 `channel_id`、有 `quota_usd`、异常流式零输出行被剔除；上方汇总卡与 CSV 口径一致。
- [ ] **Step 5:** **请求对比表**（web-worker Rule 7 §7.2）：DevTools 抓 `/api/log/self/export` 与 `/api/log/self/stat` 请求 query，逐字段核对与本计划一致。

---

## 验收清单（对齐用户原始需求）

- [ ] 令牌名：下拉多选，留空=所有令牌 ✅
- [ ] 模型名：下拉多选，留空=所有模型 ✅
- [ ] 分组：下拉多选，默认所有 ✅（并移除旧的分组默认锁定）
- [ ] 业务分组：下拉多选，默认所有 ✅
- [ ] 渠道 ID：筛选项移除 ✅
- [ ] CSV 移除「渠道ID」列 ✅（`channel_id`）
- [ ] CSV 新增「额度消耗」列 ✅（`quota_usd`，纯数字 6 位小数，保留原始 `quota`）
- [ ] 默认只需选日期范围即可快速导出、其余默认全选 ✅
- [ ] 排除流式对话零输出扣费的异常日志 ✅（`is_stream=true AND completion_tokens=0 AND quota>0 AND 非黑名单模型`）
- [ ] 汇总统计卡与导出同口径 ✅
