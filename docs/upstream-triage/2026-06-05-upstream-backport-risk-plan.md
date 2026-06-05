# Upstream Backport Risk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backport only upstream fixes that improve correctness or safety while preserving local fishxcode features, especially local subscription billing, log export/filtering, relay conversion, channel multi-key handling, and the separate `web-worker` frontend direction.

**Architecture:** Do not direct-merge `upstream/fishxcode` or `quantumnous/main`. Apply small manual backports in isolated batches, write regression tests before each implementation, and treat any upstream code touching locally customized behavior as a risk item until tests prove compatibility.

**Tech Stack:** Go 1.22+, Gin, GORM v2, SQLite/MySQL/PostgreSQL compatibility, local JSON wrappers in `common/json.go`, Bun only for frontend work. Primary refs are local `HEAD` `649b6659169e562a27070b91f120928d9447e0bf`, Zeabur `upstream/fishxcode` `70bd759d80a64be8e53ecd58fe35de0c90c65a18`, and QuantumNous `quantumnous/main` `87cc22d7ec4923ad08df826866fb3e51c95ed1d8`.

---

## Non-Negotiable Merge Policy

- Do not direct-merge either upstream branch.
- Do not cherry-pick broad commits into files that already have local custom work; manually port the minimal behavioral change.
- Preserve local features: support tickets/trial applications, affiliate commission, activity lottery auto jobs, Seedance2/model billing units, payment provider guards, subscription billing/request-count logic, log export and group-health features, channel multi-key usage limits, `web-worker` as nested repository.
- Skip old `web/`, `web/default`, and `web/classic` UI-only work unless a backend/API contract fix is separable.
- Follow AGENTS.md rules: use `common.Marshal` / `common.Unmarshal`, preserve optional zero values in upstream request DTOs, and keep DB changes compatible with SQLite, MySQL, and PostgreSQL.

## Recommended Backport Order

1. Relay/provider correctness batch from QuantumNous: `87cc22d7e`, `3aa113b5a`, `ff06067a1`, `465c5edab`, `2a528d46c`.
2. Billing/log/channel correctness batch: Zeabur `70bd759d8`; QuantumNous `230a3592f`, `afb470e40`, `74985fa87`, `1d3203736`, `ebbe31553`.
3. Follow-up inspection batch: `128802818`, `fddf54ccc`, `006e80165`, `0c7aceb83`, `3ec5f3555`, `56241ad9c`, Zeabur subscription token/request-count family.
4. Conditional/skip batch: Waffo Pancake integration, provider pricing API, old frontend layout/theme commits, disabled-frontend landing fallback.

## Task 1: Backport Task Fetch Model Resolution

**Upstream commit:** `87cc22d7e` from QuantumNous.

**Recommendation:** Backport now.

**Risk:** Medium. This touches `middleware/distributor.go`, which local commits already changed for video task fetch without selecting a channel. The fix must not re-enable channel selection for `GET /v1/video/generations/:task_id`.

**Local conflict assessment:**
- Local `relay/relay_task.go` already resolves `OriginModelName` after routing for actual fetch.
- The missing behavior is earlier in distributor token model-limit validation: `modelRequest.Model` is empty for task fetch.
- Safe implementation is a read-only DB lookup by user ID and `task_id`; it should only run when `ContextKeyTokenModelLimitEnabled` is true.

**Files:**
- Modify: `middleware/distributor.go`
- Test: `middleware/distributor_task_fetch_test.go` or `middleware/distributor_test.go`

- [ ] **Step 1: Write failing regression test**

Create a test that seeds a task with `Properties.OriginModelName = "allowed-video-model"`, enables token model limit for that model, sends `GET /v1/video/generations/:task_id`, and verifies `getModelRequest` returns model `"allowed-video-model"` while `shouldSelectChannel` remains false.

Run:

```bash
go test ./middleware -run 'Test.*Video.*Task.*ModelLimit|Test.*Distributor.*Task.*Fetch' -count=1
```

Expected before implementation: FAIL because `modelRequest.Model` is empty.

- [ ] **Step 2: Implement minimal model backfill**

Add helper logic equivalent to:

```go
func getTaskOriginModelName(c *gin.Context) string {
	if !common.GetContextKeyBool(c, constant.ContextKeyTokenModelLimitEnabled) {
		return ""
	}
	taskId := c.Param("task_id")
	if taskId == "" {
		taskId = c.GetString("task_id")
	}
	if taskId == "" {
		return ""
	}
	userId := c.GetInt("id")
	if task, exist, err := model.GetByTaskId(userId, taskId); err == nil && exist && task != nil {
		return task.Properties.OriginModelName
	}
	return ""
}
```

Call it only in the GET branches for `/v1/videos` and `/v1/video/generations` task fetches after setting `RelayModeVideoFetchByID`.

- [ ] **Step 3: Verify no local routing regression**

Run:

```bash
go test ./middleware ./relay -run 'Video|RelayTask|Distributor' -count=1
```

Expected: PASS.

## Task 2: Backport Dify Remote Image Panic Fix

**Upstream commit:** `3aa113b5a` from QuantumNous.

**Recommendation:** Backport now.

**Risk:** Low. The upstream fix initializes a pointer before assigning remote image fields. It does not change DB, routing, or billing behavior.

**Local conflict assessment:**
- Local `relay/channel/dify/relay-dify.go` still uses `var file *DifyFile` and assigns `file.Type` in the remote-image branch.
- No local Dify tests currently cover remote image conversion.

**Files:**
- Modify: `relay/channel/dify/relay-dify.go`
- Test: create `relay/channel/dify/relay_dify_test.go`

- [ ] **Step 1: Write failing regression test**

Create a test in package `dify` that builds a `dto.GeneralOpenAIRequest` with one user message containing an `image_url` remote URL and calls `requestOpenAI2Dify`. Assert that the returned request contains one file with `TransferMode == "remote_url"` and the original URL.

Run:

```bash
go test ./relay/channel/dify -run TestRequestOpenAI2DifyRemoteImage -count=1
```

Expected before implementation: FAIL or panic.

- [ ] **Step 2: Implement minimal pointer initialization**

Use the upstream shape:

```go
file = &DifyFile{
	Type:         media.MimeType,
	TransferMode: "remote_url",
	URL:          media.Url,
}
```

- [ ] **Step 3: Verify Dify package**

Run:

```bash
go test ./relay/channel/dify -count=1
```

Expected: PASS.

## Task 3: Backport Claude Concurrent Tool Use Index Fix

**Upstream commit:** `ff06067a1` from QuantumNous.

**Recommendation:** Backport now.

**Risk:** Medium. Local relay code has several tool-call and tool-result pairing fixes. This change is small, but a bad test could miss interaction with existing `service/convert.go` behavior.

**Local conflict assessment:**
- Local `relay/channel/claude/relay-claude.go` still computes `fcIdx = *claudeResponse.Index - 1` and clamps negative values to zero.
- Local history includes `da1161777`, `2df604bba`, and `7cc8ec2c9` tool-call fixes; preserve those.

**Files:**
- Modify: `relay/channel/claude/relay-claude.go`
- Test: `relay/channel/claude/relay_claude_test.go`

- [ ] **Step 1: Write failing index-collision test**

Add a test that feeds two `content_block_start`/`input_json_delta` responses with Claude indexes `0` and `1`, calls `StreamResponseClaude2OpenAI`, and asserts returned OpenAI tool call indexes are `0` and `1`, not both `0`.

Run:

```bash
go test ./relay/channel/claude -run TestStreamResponseClaude2OpenAIConcurrentToolUseIndexes -count=1
```

Expected before implementation: FAIL because indexes collide at zero.

- [ ] **Step 2: Implement minimal index fix**

Change only the index calculation:

```go
if claudeResponse.Index != nil {
	fcIdx = *claudeResponse.Index
}
```

- [ ] **Step 3: Verify Claude conversion package**

Run:

```bash
go test ./relay/channel/claude ./service -run 'Claude|Tool|Convert' -count=1
```

Expected: PASS.

## Task 4: Backport Gemini-To-Claude Tool Stream Finish Handling

**Upstream commit:** `465c5edab` from QuantumNous.

**Recommendation:** Backport now, manually.

**Risk:** Medium-high. Local `GeminiChatStreamHandler` uses `relaycommon.DisplayedResponseModelName`, local usage accounting, and Claude conversion state. Apply only the finish-handling semantics, not a full file replacement.

**Local conflict assessment:**
- Local code always emits `helper.GenerateStopResponse(...)` on stop.
- Upstream avoids emitting the OpenAI-style stop response when `info.RelayFormat == types.RelayFormatClaude`, and generates a stop response with usage if Claude conversion is not done.
- Preserve local displayed model wrapper and usage estimate behavior.

**Files:**
- Modify: `relay/channel/gemini/relay-gemini.go`
- Test: create or update a Gemini stream test under `relay/channel/gemini/`

- [ ] **Step 1: Write failing Claude-format stream test**

Create a test for a Gemini stream that yields a tool call while `info.RelayFormat == types.RelayFormatClaude`. Assert the handler does not emit an extra OpenAI-style stop chunk before final Claude completion, and usage is still returned.

Run:

```bash
go test ./relay/channel/gemini -run 'TestGemini.*Claude.*Tool' -count=1
```

Expected before implementation: FAIL due duplicate/incorrect stop handling.

- [ ] **Step 2: Manually port finish handling**

Keep local `relaycommon.DisplayedResponseModelName(info, info.UpstreamModelName)` calls. Add upstream semantics:

```go
if response.IsToolCall() {
	finishReason = constant.FinishReasonToolCalls
	if info.RelayFormat == types.RelayFormatClaude {
		for choiceIdx := range response.Choices {
			response.Choices[choiceIdx].FinishReason = nil
		}
	}
}
if isStop {
	if info.RelayFormat != types.RelayFormatClaude {
		_ = handleStream(c, info, helper.GenerateStopResponse(id, createAt, relaycommon.DisplayedResponseModelName(info, info.UpstreamModelName), finishReason))
	}
}
```

Before final output, adapt the upstream `ClaudeConvertInfo` guard while keeping local model display:

```go
if info.RelayFormat == types.RelayFormatClaude && info.ClaudeConvertInfo != nil && !info.ClaudeConvertInfo.Done {
	response = helper.GenerateStopResponse(id, createAt, relaycommon.DisplayedResponseModelName(info, info.UpstreamModelName), finishReason)
	response.Usage = usage
}
```

- [ ] **Step 3: Verify Gemini, Claude, and service conversion tests**

Run:

```bash
go test ./relay/channel/gemini ./relay/channel/claude ./service -run 'Gemini|Claude|Tool|Convert' -count=1
```

Expected: PASS.

## Task 5: Backport Image Quality Preservation

**Upstream commit:** `2a528d46c` from QuantumNous.

**Recommendation:** Backport now.

**Risk:** Low-medium. It only affects log content after image request handling, but local code has custom `gpt-image-2` compatibility and image result token accounting.

**Local conflict assessment:**
- Local `relay/image_handler.go` collapses every quality except `"hd"` to `"standard"`.
- That hides valid non-`hd` values such as newer provider quality values.

**Files:**
- Modify: `relay/image_handler.go`
- Test: add or update `relay/image_handler_test.go`

- [ ] **Step 1: Write failing quality log test**

Create a test that builds an `ImageRequest{Quality: "high"}` through `ImageHelper` with a stub adaptor or a narrow helper if the existing codebase already uses one. Assert log content contains `品质 high`.

Run:

```bash
go test ./relay -run TestImageHelperPreservesNonHDQuality -count=1
```

Expected before implementation: FAIL because log content uses `standard`.

- [ ] **Step 2: Implement minimal preservation**

Change:

```go
quality := request.Quality
if quality == "" {
	quality = "standard"
}
```

- [ ] **Step 3: Verify image-related tests**

Run:

```bash
go test ./relay ./relay/channel/openai -run 'Image|ChatImage|Responses' -count=1
```

Expected: PASS.

## Task 6: Backport Subscription-Only Billing Fallback

**Upstream commit:** `70bd759d8` from Zeabur.

**Recommendation:** Backport after Tasks 1-5, but before lower-priority follow-ups if local deployments use `subscription_only`.

**Risk:** High. Local subscription logic is heavily customized: request-count subscriptions, aggregate access tokens, wallet fallback, day-pass behavior, manual delivery, and subscription consume logs all touch the same files.

**Local conflict assessment:**
- Local `service/billing_session.go` has `subscription_only` directly calling `trySubscription()`.
- Local `subscription_first` already falls back to wallet when `HasUsableUserSubscription` is false.
- Local `model/subscription.go` has `HasActiveUserSubscription`, but it only checks `end_time > now`; upstream helper also treats `end_time = 0` as unexpired.
- Adding automatic preference downgrade changes persisted user settings; this must invalidate user cache and must not break user-selected billing policy when an active subscription exists.

**Files:**
- Modify: `model/subscription.go`
- Modify: `service/billing_session.go`
- Test: `service/task_billing_test.go`
- Test: `model/subscription_query_test.go` or a focused new model test

- [ ] **Step 1: Write failing billing fallback test**

Create a test where a user has billing preference `subscription_only`, no active usable subscription, and enough wallet quota. Call `NewBillingSession` and assert it returns wallet funding, updates the user setting to `subscription_first`, and invalidates the user cache.

Run:

```bash
go test ./service ./model -run 'SubscriptionOnly|BillingPreference|BillingSession' -count=1
```

Expected before implementation: FAIL because `subscription_only` does not fall back.

- [ ] **Step 2: Add transaction-safe downgrade helper**

Add a model helper shaped like upstream but adapted to local `end_time = 0` semantics:

```go
func hasActiveUnexpiredUserSubscriptionTx(tx *gorm.DB, userId int, now int64) (bool, error) {
	if tx == nil {
		tx = DB
	}
	var count int64
	if err := tx.Model(&UserSubscription{}).
		Where("user_id = ? AND status = ? AND (end_time = 0 OR end_time > ?)", userId, "active", now).
		Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}
```

Add `DowngradeSubscriptionOnlyBillingPreferenceIfNoActiveSubscription(userId int)` that locks the user row when possible, changes only normalized `"subscription_only"` to `"subscription_first"`, persists `setting`, and calls local user-cache invalidation.

- [ ] **Step 3: Update billing session branch**

In `NewBillingSession`, for `pref == "subscription_only"`, check for active unexpired subscription before `trySubscription()`. If none exists, downgrade preference and call local `tryWalletFallback()` or the local equivalent that keeps wallet group pricing correct.

- [ ] **Step 4: Verify subscription and billing tests**

Run:

```bash
go test ./model ./service -run 'Subscription|BillingSession|TaskBilling|RequestCount' -count=1
```

Expected: PASS.

**Schema note:** No schema migration is expected for this task.

## Task 7: Backport Log Filter and Index Improvements

**Upstream commits:** `1d3203736`, `74985fa87`, `afb470e40`, `230a3592f` from QuantumNous; related Zeabur `56241ad9c`.

**Recommendation:** Manual backport after Task 6. Do not replace `model/log.go`.

**Risk:** High. Local log behavior includes export limits, compact CSV export, group-health stats, subscription consume summaries, error visibility filters, request ID filters, channel tag metadata, and log ID preservation.

**Local conflict assessment:**
- Local `buildAdminLogsQuery` still uses `logs.model_name like ?` without escaping and without exact-match behavior.
- Local user queries already sanitize model-name LIKE, but admin and stat queries differ.
- Local `Log` index priority still creates `idx_created_at_id` as `(id, created_at)` instead of `(created_at, id)`.
- Local list queries still order by `logs.id desc`; changing order may alter pagination expectations and export order tests.
- Local token-name filters are exact in most paths; upstream token-name exact fix is partially covered.

**Files:**
- Modify: `model/log.go`
- Test: `model/log_test.go`, `model/log_export_test.go`, `model/log_billing_source_test.go`, `controller/log_test.go`

- [ ] **Step 1: Write exact-filter regression tests**

Add tests for:
- Admin model filter without `%` matches exact model only.
- Admin model filter with `%` uses escaped LIKE.
- User model filter keeps existing escaped LIKE behavior only when wildcard is explicit.
- Token-name filters remain exact.
- Billing-source filter does not drop local subscription consume log behavior.

Run:

```bash
go test ./model ./controller -run 'Log.*Filter|BillingSource|UsageLogs|Export' -count=1
```

Expected before implementation: at least admin exact model filter test fails.

- [ ] **Step 2: Add shared explicit text filter helper**

Add an internal helper that only uses LIKE when the user supplies `%`:

```go
func applyExplicitLogTextFilter(tx *gorm.DB, column string, value string) (*gorm.DB, error) {
	if value == "" {
		return tx, nil
	}
	if strings.Contains(value, "%") {
		pattern, err := sanitizeLikePattern(value)
		if err != nil {
			return nil, err
		}
		return tx.Where(column+" LIKE ? ESCAPE '!'", pattern), nil
	}
	return tx.Where(column+" = ?", value), nil
}
```

Use it in admin, user, export, and stat query builders only where it preserves local semantics.

- [ ] **Step 3: Change list ordering and index tags only with test coverage**

Change GORM tags to:

```go
Id        int   `json:"id" gorm:"index:idx_created_at_id,priority:2;index:idx_user_id_id,priority:2"`
CreatedAt int64 `json:"created_at" gorm:"bigint;index:idx_created_at_id,priority:1;index:idx_created_at_type"`
```

Change admin/user list order to:

```go
tx.Order("logs.created_at desc, logs.id desc")
```

Keep export batching by `logs.id desc` unless tests prove changing export order is safe; export uses keyset pagination by ID locally.

- [ ] **Step 4: Record manual index rebuild SQL**

If this task is implemented, add a migration note to the triage file and release notes. Existing DBs need manual index rebuild because GORM AutoMigrate will not reorder an existing index.

SQLite:

```sql
DROP INDEX IF EXISTS idx_created_at_id;
CREATE INDEX idx_created_at_id ON logs (created_at, id);
```

MySQL:

```sql
DROP INDEX idx_created_at_id ON logs;
CREATE INDEX idx_created_at_id ON logs (created_at, id);
```

PostgreSQL:

```sql
DROP INDEX IF EXISTS idx_created_at_id;
CREATE INDEX idx_created_at_id ON logs (created_at, id);
```

- [ ] **Step 5: Verify log tests**

Run:

```bash
go test ./model ./controller -run 'Log|Usage|Export|GroupHealth|SubscriptionConsume' -count=1
```

Expected: PASS.

## Task 8: Backport Multi-Key Channel Cache Eviction

**Upstream commit:** `ebbe31553` from QuantumNous.

**Recommendation:** Manual backport after log changes or in a separate branch.

**Risk:** Medium. Local channel code includes multi-key usage limits and request-count tracking. Cache eviction must not erase local `MultiKeyUsedCount`, `MultiKeyMaxRequestCount`, or polling index behavior.

**Local conflict assessment:**
- Local `handlerMultiKeyUpdate` initializes missing `keyIndex` as zero; if `usingKey` is not found, it can update the wrong key.
- Local code sets channel auto-disabled when `len(MultiKeyStatusList) >= MultiKeySize`, which can be wrong when stale indexes exist.
- Local cache path updates in-memory channel but does not clearly evict from routing cache when all keys become unavailable.

**Files:**
- Modify: `model/channel.go`
- Test: `model/channel_usage_test.go`
- Test: `service/channel_select_test.go`

- [ ] **Step 1: Write failing multi-key cache tests**

Add tests for:
- Missing `usingKey` does not disable key index `0`.
- All disabled keys mark channel auto-disabled and make it unavailable to `CacheGetRandomSatisfiedChannel`.
- Re-enabling one key restores channel enabled status and routing availability.

Run:

```bash
go test ./model ./service -run 'MultiKey|ChannelCache|AutoDisabled|GetNextEnabledKey' -count=1
```

Expected before implementation: at least missing-key or routing-availability test fails.

- [ ] **Step 2: Implement enabled-key helper and safer update**

Add:

```go
func hasEnabledMultiKey(keys []string, statusList map[int]int) bool {
	for i := range keys {
		if statusList == nil {
			return true
		}
		status, ok := statusList[i]
		if !ok || status == common.ChannelStatusEnabled {
			return true
		}
	}
	return false
}
```

Initialize `keyIndex := -1`; if `usingKey` is non-empty and not found, log and return without mutating index zero. When no enabled key remains, set channel status to `common.ChannelStatusAutoDisabled`. When re-enabling a key and at least one enabled key exists, restore `common.ChannelStatusEnabled`.

- [ ] **Step 3: Verify channel tests**

Run:

```bash
go test ./model ./service ./controller -run 'Channel|MultiKey|ChannelCache|ChannelSelect' -count=1
```

Expected: PASS.

## Task 9: Follow-Up Inspection Batch

These commits are not recommended for immediate merge until their local conflicts are inspected.

### `128802818`: Truncate Oversized Upstream Error Logs

**Recommendation:** Follow-up inspect.

**Risk:** Medium. Local `service/error.go` logs upstream response bodies and local log visibility has custom sensitive-preview behavior.

**Files to inspect:** `service/error.go`, `common/str.go`, `service/error_test.go`, `controller/log.go`.

**Inspection command:**

```bash
git show --patch 128802818 -- common/str.go service/error.go service/error_test.go
```

**Acceptance gate:** Backport only if it preserves exact structured error messages returned to callers while truncating only local debug/log output.

### `fddf54ccc`: Large Base64 Relay Request Memory Reduction

**Recommendation:** Follow-up inspect.

**Risk:** High. Local code already has `common.GetRequestBody`, `BodyStorage`, pass-through helpers, and request body size limits.

**Files to inspect:** `common/gin.go`, `relay/common/override.go`, `relay/channel/api_request.go`, `relay/common/outbound_body.go` from upstream, `relay/helper/pass_through_body.go`.

**Inspection command:**

```bash
git show --stat --patch fddf54ccc -- common relay
```

**Acceptance gate:** Backport only if it reduces memory without bypassing local `MAX_REQUEST_BODY_MB`, SSRF, pass-through rewrite, or param-override behavior.

### `006e80165`: Resolve `/v1/models` `owned_by` From Active Channels

**Recommendation:** Follow-up inspect.

**Risk:** Medium. Local model listing supports user cache, token groups, `auto` groups, and multi-group token normalization.

**Files to inspect:** `controller/model.go`, `model/model_meta.go`, `model/ability.go`.

**Acceptance gate:** Backport only if owner lookup respects local token groups, `service.NormalizeTokenGroups`, `service.GetUserAutoGroupForUser`, disabled channel filtering, and cross-DB query syntax.

### `0c7aceb83`: Claude Opus 4.8 Model Support

**Recommendation:** Conditional backport.

**Risk:** Low-medium. Model/ratio catalog changes are straightforward but can affect billing.

**Acceptance gate:** Backport only after confirming desired commercial availability and local ratio defaults. Run:

```bash
go test ./relay/channel/claude ./setting/ratio_setting -run 'Claude|Ratio|Model' -count=1
```

### Zeabur Subscription Token/Request-Count Family

**Commits:** `66d8f7477`, `dfdd95323`, `c8f096977`, `61d6a10b3`, `63c9ca405`, `7aeaa15b0`, `104216643`, `105bf6bb2`, `f95e00a81`.

**Recommendation:** Follow-up manual comparison after Task 6.

**Risk:** High. These touch local subscription access tokens, aggregate token refresh, request-count settlement, wallet overage, and vendor resolution.

**Acceptance gate:** Do not merge until current local tests are expanded to cover request-count zero-usage, wallet-overage caps, subscription-only/fallback behavior, token quota refund, and aggregate token refresh.

**Focused test command:**

```bash
go test ./model ./service ./controller -run 'Subscription|RequestCount|AggregateToken|TokenQuota|BillingSession|TaskBilling' -count=1
```

### `3ec5f3555`: Surface Ratio Sync Errors

**Recommendation:** Follow-up small manual backport.

**Risk:** Low-medium. Local `controller/ratio_sync.go` has upstream ratio import and provider metadata logic.

**Acceptance gate:** Preserve local provider pricing import behavior and add a test where upstream sync failure returns a visible API error.

### `56241ad9c`: Log Billing Source Filters

**Recommendation:** Fold into Task 7 after reading exact patch.

**Risk:** Medium-high because local log billing source is encoded in `Other` JSON and subscription consume summaries already parse billing-source fields.

## Task 10: Conditional Or Skip Items

Do not merge these without a product decision:

- Waffo Pancake gateway and webhook commits: `19f1821fc`, `f2c7647ec`, `0354c38be`, `49bc3a117`.
  - Local active payment code is Waffo, EPay, Stripe, Creem, and Waffo provider guards. Upstream Waffo Pancake is a distinct gateway/controller/service set.
  - Risk: high payment reconciliation risk and new dependency/config surface.
- Provider pricing API and CC Switch import helpers: `099b7f2a2`.
  - Local `model/provider_pricing.go` is absent; only ratio sync comments and CC Switch defaults exist.
  - Risk: medium product-scope risk; backport only if CC Switch provider-pricing import is required.
- Old frontend UI commits in `web/`, `web/default`, `web/classic`.
  - Local primary frontend direction is `web-worker`.
  - Risk: high churn, low backend value.
- Disabled frontend landing fallback and Docker frontend build toggle: `aaa7510e5`, `1461e7e3`, `4ee454d56`, `603dc34a1`.
  - Risk: medium routing/static behavior risk. Defer unless deployment needs a disabled-frontend fallback page.

## Final Verification Gate

After each implemented batch, run the smallest focused tests first, then this backend smoke suite:

```bash
go test ./common ./dto ./model ./service ./middleware ./relay ./controller
```

If any DB schema, persistent model field, index, or migration changes are applied, update `docs/upstream-triage/2026-05-18-upstream-diff-triage.md` with:

- exact changed table/column/index;
- whether the migration was executed locally;
- SQLite/MySQL/PostgreSQL manual SQL if AutoMigrate cannot safely apply the change;
- rollback notes.

Do not mark a batch complete until tests pass and the triage file records any schema/data-shape impact.
