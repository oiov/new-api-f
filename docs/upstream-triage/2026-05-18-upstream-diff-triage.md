# Upstream Diff Triage Snapshot

Date: 2026-05-18

Repository: `/Users/songjunxi/Desktop/repos/fish-new-api`

Purpose: record the current comparison between this fork, `dext7r/Zeabur` branch `fishxcode`, and `QuantumNous/new-api` so later merge/backport work can continue from a stable written baseline instead of relying on chat context.

## Current Refs

| Role | Ref | Commit | Notes |
| --- | --- | --- | --- |
| This fork | `HEAD`, `origin/fishxcode` | `ae0e3528de4d22e4611a1c14b59c92a301adf375` | `feat: 添加图像结果计数回退逻辑及相关单元测试` |
| Direct upstream | `upstream/fishxcode` | `7af2f0e4a33069650b5cb8c9869c21ffc55d6067` | `Merge pull request #18 from dext7r/claude/amazing-dirac-d55317` |
| Zeabur mirror of original upstream | `upstream/new-api` | `5d93351d04269d9504e5fd0a5fd32ded674ddef2` | Mirror sync commit only, `sync: QuantumNous/new-api@fbf235d2` |
| Original upstream | `quantumnous/main` | `5dd0d3bcbd7b1d523bd046a5f9cf9fc8ce28d579` | `fix: add analytics placeholder (#4928)` |

Working tree note: `web-worker/` is untracked. Do not modify or delete it unless explicitly requested.

## Recheck 2026-05-18

Latest fetch of both upstreams produced no ref changes:

- `HEAD` / `origin/fishxcode`: `ae0e3528de4d22e4611a1c14b59c92a301adf375`
- `upstream/fishxcode`: `7af2f0e4a33069650b5cb8c9869c21ffc55d6067`
- `upstream/new-api`: `5d93351d04269d9504e5fd0a5fd32ded674ddef2`
- `quantumnous/main`: `5dd0d3bcbd7b1d523bd046a5f9cf9fc8ce28d579`

Merge bases and commit counts are unchanged from the baseline below.

## Continuation Check 2026-05-18

This file was reopened after context compression and is the active source of truth for the ongoing upstream triage. A fresh fetch of `upstream` and `QuantumNous/new-api` again produced no ref changes:

- Local / `origin/fishxcode`: `ae0e3528de4d22e4611a1c14b59c92a301adf375`
- Direct upstream `upstream/fishxcode`: `7af2f0e4a33069650b5cb8c9869c21ffc55d6067`
- Zeabur mirror sync marker `upstream/new-api`: `5d93351d04269d9504e5fd0a5fd32ded674ddef2`
- Original upstream `quantumnous/main`: `5dd0d3bcbd7b1d523bd046a5f9cf9fc8ce28d579`

Current worktree note remains unchanged: `web-worker/` is untracked and should not be touched during upstream triage unless explicitly requested.

## Last Known Sync/Merge Baselines

This section must be updated every time future upstream work is merged or selectively backported.

| Baseline | Commit | Meaning |
| --- | --- | --- |
| Last local merge from Zeabur | `4495f32811901c9965ec6b58f7176dc54f187615` | Latest local merge commit titled `Merge remote-tracking branch 'upstream/fishxcode' into fishxcode`, dated 2026-04-30 12:38:01 +0800. |
| Local side of that merge | `ffba78d7da9bc45d6c71495849f308f060cf4f3a` | Local parent before the merge. |
| Zeabur side merged then | `cf207512b7861ebce11262ad138f3fd652a7c107` | Upstream parent merged into local at that time, `chore: update subscription pricing copy`. |
| Current merge-base: local vs Zeabur | `8aa8b81e03522f306d24134725378228e64b03ab` | `fix: original_model && upstream_model paramOverrideKeyAuditPaths`; this is older than the last explicit local merge because histories diverged through later merges/cherry-picks. |
| Current merge-base: local vs QuantumNous main | `9ae9040b3c9dab88660fb9724d182393d0137861` | `Merge pull request #3401 from seefs001/fix/convert-openai-detail-field`; local contains this ancestor. |
| Current merge-base: Zeabur fishxcode vs QuantumNous main | `8aa8b81e03522f306d24134725378228e64b03ab` | Direct upstream and original upstream now diverge after this older shared point. |
| Zeabur's recorded original-upstream sync | `5d93351d04269d9504e5fd0a5fd32ded674ddef2` | Mirror sync wrapper only; do not treat it as the real original-upstream head. It is not an ancestor of local HEAD. |

Interpretation:

- Use `quantumnous/main` as the real original upstream comparison point.
- Use `upstream/fishxcode` as the direct Zeabur comparison point.
- Treat `upstream/new-api` only as a historical sync marker from Zeabur, not as a merge target.

Quick counts from current refs:

- `git log --oneline upstream/fishxcode ^HEAD --no-merges | wc -l`: 467 upstream non-merge commits not in local by ancestry.
- `git log --oneline quantumnous/main ^HEAD --no-merges | wc -l`: 231 original-upstream non-merge commits not in local by ancestry.
- `git log --oneline HEAD ^upstream/fishxcode --no-merges | wc -l`: 406 local non-merge commits not in Zeabur by ancestry.
- `git log --oneline HEAD ^quantumnous/main --no-merges | wc -l`: 368 local non-merge commits not in QuantumNous by ancestry.

Conclusion: do not directly merge either upstream branch. The histories and product direction diverged enough that direct merge would pull large DIY feature sets and old/new web frontend work that is not aligned with this fork's `web-worker` focus.

## Product Scope Rules For This Fork

- Core user-facing frontend work should target the new `web-worker` direction.
- Old `web/` and upstream `web/default` UI-only improvements are usually not worth merging unless they expose or require backend/API changes needed by `web-worker`.
- Backend security fixes, payment correctness, relay/provider protocol compatibility, billing/accounting correctness, cache invalidation, and cross-database correctness are in scope.
- Zeabur-specific DIY features such as ecomagent expansion, lottery/check-in flows, commission pages, region-block pages, discount-code management, and broad subscription UI redesigns should be skipped unless a backend bugfix is separable and relevant.
- Preserve protected project identifiers and metadata per AGENTS.md. Do not rename or remove protected `nеw-аρi` or `QuаntumΝоuѕ` references.

## High Priority Backport Candidates

These should be handled as manual backports with focused tests. Do not cherry-pick blindly because many files have local changes.

### Authentication And User Cache

| Commit | Source | Status in local | Recommendation |
| --- | --- | --- | --- |
| `59c582d13` | QuantumNous | Not applied. Local `model.ValidateAccessToken` still returns only `*User` and swallows DB errors; `middleware.authHelper` still exposes exact invalid/disabled access-token state. | Backport manually. Preserve local `Fish-X-Code-User` header behavior while hiding token state and surfacing DB errors correctly. |
| `2819e3a1d` | QuantumNous | Not applied. Login/access-token validation still lacks the upstream DB-error distinction. | Backport with `59c582d13` as one auth hardening batch. |
| `925342622` | QuantumNous | Not applied. Local `ManageUser` disable/ban/enable/delete path does not invalidate user cache or all token caches. Local has only unexported `invalidateUserCache`; there is no `InvalidateUserTokensCache`. | Backport manually into local user/token cache model. Include tests for disabled user token invalidation. |

Local evidence:

- `middleware/auth.go`: `authHelper` calls `model.ValidateAccessToken(accessToken)` and returns distinct messages for missing/invalid access token and disabled user.
- `model/user.go`: `ValidateAccessToken(token string) *User` uses `DB.Where("access_token = ?", token).First(user).RowsAffected == 1`, no error return.
- `controller/user.go`: `ManageUser` updates/deletes users without calling cache invalidation after status/role changes.
- `model/token.go`: `ValidateUserToken` still returns exact status messages and key snippets such as `TokenStatusExhausted[sk-***]`.

### Confirmed Local Coverage Gaps And Wins

These were checked while writing the snapshot:

- `OpenAIResponsesResponse.Instructions` is already `json.RawMessage` locally, so the upstream `ee7cedd57` response-instructions fix can be skipped for now.
- `dto/openai_request.go` still uses string fields for `Message.ReasoningContent` and `Message.Reasoning`; the pointer-preserving upstream request fix still matters.
- `model/channel.go` still lacks a group parameter in `GetAllChannels`; channel list group filtering needs the upstream fix.
- `setting/config/config.go` still uses direct `encoding/json` marshal/unmarshal for config map updates; this should move to `common.Marshal` / `common.Unmarshal`.
- `upstream/new-api` is only a sync wrapper commit and does not carry useful live branch history for merge-base work.

### SSRF And URL Fetch Safety

| Commit | Source | Status in local | Recommendation |
| --- | --- | --- | --- |
| `20399d3c8` | QuantumNous | Not fully applied. Local `service/download.go`, `service/webhook.go`, `service/payment_notify.go`, and `service/user_notify.go` use fetch settings, but unauthenticated/user-level endpoints such as video proxy/MJ need audit. Default `ApplyIPFilterForDomain` is still false. | Backport manually. Treat as security priority. |
| `e2807c5f9` | QuantumNous | Not fully applied. Local `common/ssrf_protection.go` has private/link-local checks but lacks the expanded/reserved range hardening from upstream. | Backport with `20399d3c8`; add tests for IPv4/IPv6 private/reserved, domain resolution, and allowed ports. |

Local evidence:

- `common/ssrf_protection.go`: `DefaultSSRFProtection` does not set `ApplyIPFilterForDomain`; `setting/system_setting/fetch_setting.go` default is false.
- Current implementation performs DNS lookup only when `ApplyIPFilterForDomain` is true.
- `controller/video_proxy.go` fetches resolved video URLs without `ValidateURLWithFetchSetting`.
- `relay/mjproxy_handler.go` fetches Midjourney image URLs without `ValidateURLWithFetchSetting`.

### Payment And Subscription Callback Safety

| Commit | Source | Status in local | Recommendation |
| --- | --- | --- | --- |
| `a7c38ec85` | QuantumNous | Not applied. Local `TopUp` and `SubscriptionOrder` have `PaymentMethod`, but no separate `PaymentProvider`. Subscription completion still completes by trade number only. | Manual security backport. Add provider guard to topup and subscription callbacks; migrate old rows carefully for SQLite/MySQL/Postgres. |
| `b2e62a44e` | QuantumNous | Not applied. Local top-up filtering has payment method filters, but no hard query window / DoS cap equivalent. | Backport after provider guard. |
| `e70eaec4d` / `6f26145bf` | QuantumNous/Zeabur | Partially applied locally via payment method checks. | Audit before merging; keep local Stripe/Waffo/Creem behavior intact. |

Local evidence:

- `model/topup.go` contains `PaymentMethod` and `ErrPaymentMethodMismatch`, but no `PaymentProvider`.
- `model/subscription.go` has `CompleteSubscriptionOrderWithResult(tradeNo, providerPayload)` without provider argument.
- Callback controllers call completion by `tradeNo` only.
- QuantumNous adds `PaymentProvider` to both `TopUp` and `SubscriptionOrder`; local subscription model is heavily extended, so this must be a manual backport rather than cherry-pick.
- Local `model/subscription.go` already has `ProviderPayload`, so keep that field and add provider guard parameters around the existing completion/expiry APIs.
- `b2e62a44e` should be adapted to local filtered top-up search: local has admin/user filters, but lacks upstream's `sanitizeLikePattern`, count hard limit, and user-side time cutoff.

### Relay / Provider Protocol Compatibility

| Commit | Source | Status in local | Recommendation |
| --- | --- | --- | --- |
| `38a3314b9` | QuantumNous | Not applied. Local `dto.ImageRequest` lacks `Images`, `Mask`, and `InputFidelity`; image edit validation still likely drops reference fields. | Backport. Important for OpenAI image edit compatibility. |
| `db89b57e1` | QuantumNous | Not applied. Local Responses tool `Arguments` fields are still `string`; no `common.JsonRawMessageToString`. | Backport. Important for raw JSON tool arguments. |
| `8ca103342` | QuantumNous | Not applied. Local request `dto.Message.ReasoningContent` and `Reasoning` are still `string` with `omitempty`, so explicit empty values are dropped. | Backport. Aligns with AGENTS.md Rule 6 about preserving explicit zero values. |
| `f7cdc727d` | QuantumNous | Applied as uncommitted manual backport in the current working tree. | Covered in the 2026-05-18 relay protocol batch with Claude stream tests and real-call smoke tests. |
| `82c2008d2` | QuantumNous | Applied as uncommitted manual backport in the current working tree. | Covered in the 2026-05-18 relay protocol batch with Claude stream tests and real-call smoke tests. |
| `23fde25b1` | QuantumNous | Not applied. Gemini stream detection should include `:streamGenerateContent` URL path. | Backport. |
| `45cc95a25` / `5b9dcf1bd` | QuantumNous | Not applied. Local `dto.Gemini ToolConfig` lacks `IncludeServerSideToolInvocations`. | Backport with `23fde25b1`; this is tiny and low conflict. |
| `8b2216152` / `bb5b9eaca` | QuantumNous | Not fully verified. Claude `TopP` should be nil for API compatibility in relevant paths. | Backport if local still sends zero TopP. |
| `3cad6b9d7`, `c04f82bfb`, `41cd051ea` | QuantumNous | Needs manual inspection. These improve OpenAI-to-Claude empty content/file media conversion. | Candidate if Claude Messages/media compatibility is important. |
| `3ab65a822` | QuantumNous | Needs inspection. Azure `/v1/responses/compact` routing support. | Candidate if Azure Responses compact is used. |
| `53cf37a46` / `274307b0a` | QuantumNous | Needs inspection. Ali task polling accepts string usage values. | Candidate for Ali task billing robustness. |
| `160cb2857` | QuantumNous | Needs inspection. Zhipu coding-plan image endpoint. | Candidate if Zhipu image generation is used. |
| `987b7ecd2` | QuantumNous | Not applied. Vertex adapters still need custom `base_url` gateway prefix audit. | Backport only if custom Vertex gateways are used; otherwise medium priority. |
| `4ba328a2c` | Zeabur | Already covered. Local Claude adaptor applies forced beta query at final URL construction and reads `ChannelOtherSettings.ClaudeBetaQuery`. | Skip. |

Local evidence:

- `dto/openai_image.go`: `ImageRequest` has `Image json.RawMessage`, but not `Images`, `Mask`, or `InputFidelity`.
- `dto/openai_request.go`: request `Message.ReasoningContent string` and `Reasoning string`.
- `dto/openai_response.go`: `FunctionResponse.Arguments string`, `ResponsesOutput.Arguments string`.
- `dto/openai_response.go`: `OpenAIResponsesResponse.Instructions json.RawMessage` is already present, so `ee7cedd57` can likely be skipped.
- `dto/gemini.go`: local `IsStream` checks only `alt=sse`; QuantumNous also treats URL paths containing `streamGenerateContent` as streaming.
- `dto/gemini.go`: local `ToolConfig` lacks `IncludeServerSideToolInvocations *bool`.
- Local code already includes `gpt-5.5` completion ratio and `claude-opus-4-7` constants/ratios, so those related upstream commits are not urgent.
- Local `relay/channel/xai/adaptor.go` already has the grok-3-mini max token workaround from `d22f889e5`.

Additional relay/provider inspection:

- `3ab65a822`: rechecked; local `relay/channel/openai/adaptor.go` already has Azure `RelayModeResponsesCompact` URL routing. Treat as already covered.
- `274307b0a` / `53cf37a46`: rechecked; local Ali task usage fields are still `int`. `dto.IntValue` already exists, so this is a low-risk backport for upstreams that return usage numbers as strings.
- `160cb2857`: rechecked; local Zhipu v4 uses `specialPlan.OpenAIBaseURL` for embeddings/chat but not image generation. Backport if Zhipu coding-plan image generation is in use.
- `4ba328a2c`: rechecked; local Claude forced beta final-URL fix is already present.

### Logs, Channel Lists, And Admin Query Correctness

| Commit | Source | Status in local | Recommendation |
| --- | --- | --- | --- |
| `554defe4f` | QuantumNous | Not applied. Local log filtering lacks upstream exact/contains fixes. | Backport manually; preserve local log export and group health additions. |
| `4a9b70e17` | Zeabur | Partially overlapped by local `2df7d2ff1` usage log batch delete, but upstream has large pagination/deletion fixes. | Inspect and backport backend-safe parts. |
| `132d7b9f9` / `2d968c3ea` | QuantumNous | Not applied. Local channel list query does not honor group filter in `GetAllChannels`; only search path handles group. | Backport manually, but preserve local tag mode/status/type/request count behavior. |
| `dc8deb0c2` | QuantumNous | Not applied. Channel table server-side sorting touches backend and `web/default`. | Backend sorting can be useful; UI part likely skip unless `web-worker` needs it. |
| `aa56667b8` | QuantumNous | Not applied. Upstream request ID logging and response header override prevention. | Candidate high/medium; useful for troubleshooting and avoiding upstream header clobbering. |
| `b4df9955f` | QuantumNous | Not applied. Local `processChannelError` still records `isStream=false`; `genBaseRelayInfo` calculates stream status but does not persist it into context for error logging. | Backport. Small diagnostic correctness fix. |
| `c31343ac7` | QuantumNous | Not applied. Local `formatUserLogs` strips `Other.admin_info`, but `controller/twofa.go` still writes admin ID into user-visible log `Content`. | Backport backend-only parts if regular users can see manage logs in `web-worker`. |
| `209d90e86` | QuantumNous | Partially covered. Local sanitizes `admin_info`, but top-up success logs do not include admin-only callback/server audit info. | Conditional; useful for payment audit, lower priority than provider guard. |

Local evidence:

- `model/channel.go`: `GetAllChannels(startIdx, num, selectAll, idSort)` has no group parameter.
- `controller/channel.go`: non-tag channel list filters type/status but not group.
- `model/log.go`: local `DeleteLogsByIds` still deletes with one large `WHERE id IN ?`; Zeabur chunks this in batches of 500.
- `model/log.go`: local admin log query still uses exact `username` and `token_name` filters, while QuantumNous uses escaped contains matching.
- `controller/channel.go`: local tag-mode path filters status/type in memory after fetching tags; preserve this while adding group filtering.
- `common/constants.go` defines only `RequestIdKey`; there is no `UpstreamRequestIdKey`.
- `service/http.go`, `relay/channel/openai/audio.go`, and `relay/channel/minimax/tts.go` still copy upstream `X-Oneapi-Request-Id`, so an upstream new-api instance can overwrite the local request ID in client responses.
- `model/log.go` records local request ID only; there is no `upstream_request_id` column/filter.
- `controller/twofa.go` still logs `管理员(ID:%d)强制禁用了用户的两步验证` into `Content`, which remains visible even when `Other.admin_info` is stripped.

### Cross-Database And Config Correctness

| Commit | Source | Status in local | Recommendation |
| --- | --- | --- | --- |
| `a1b887122` / `0ff97c22a` | Zeabur | Not applied. PostgreSQL sequence sync after migrations is relevant to cross-DB support. | Backport if Postgres deployments are active. Must preserve SQLite/MySQL compatibility. |
| `4e93148d9` | QuantumNous | Not applied. Local `setting/config/config.go` imports `encoding/json` and uses direct marshal/unmarshal for maps. | Backport. Also fix AGENTS.md Rule 1 violation by using `common.Marshal` / `common.Unmarshal`. |
| `2431efc01` | QuantumNous | Needs inspection. Longer legacy token keys may matter for migrations. | Candidate if legacy token migration is still supported locally. |
| `0feb6f2c3`, `49474520e` | QuantumNous | Tests only. | Consider after token migration changes; useful cross-DB coverage. |
| `faa0f1425` | QuantumNous | Not applicable currently. Local tree does not have upstream `PerfMetric` model/package. | Skip unless model performance metrics are later imported. |

Local evidence:

- `setting/config/config.go` directly imports and calls `encoding/json`, violating project JSON wrapper rule.
- `4e93148d9` also fixes stale keys when JSON-unmarshalling into existing map fields. If backported here, adapt it with `common.Marshal` / `common.Unmarshal`.
- `model/main.go` currently does not call PostgreSQL sequence sync after `migrateDB` or `migrateDBFast`; the Zeabur sequence fix is relevant for PostgreSQL deployments and should no-op on SQLite/MySQL.

### Billing / Pricing Correctness

| Commit | Source | Status in local | Recommendation |
| --- | --- | --- | --- |
| `3e5f2ee1d` | QuantumNous | Not applicable currently. Local tree has no `service/tiered_settle.go` / upstream tiered billing expression path. | Skip unless tiered billing expression support is later imported. |
| `05b0041de` / `df6d86289` | QuantumNous | Already covered. Local ratio table and tests include `gpt-5.5`. | Skip. |
| `69ba18d39` | QuantumNous | Not directly applicable yet. Local `relay/image_handler.go` does not set `OtherRatios["n"]`; the exact double-count path is not present, but image billing should be rechecked when changing image pricing. | Inspect during image billing batch; backport only if local image pricing starts using `n` outside price models. |
| `7fe896d2f` | QuantumNous | Mostly `web/default`. | Skip unless backend ratio API behavior differs. |
| `095e1920f` | QuantumNous | Not applied. Local `controller/channel_upstream_update.go` select field list omits `model_mapping`. | Backport. Small correctness fix for upstream model update checks when local model mapping is configured. |

## Medium / Conditional Candidates

| Commit | Source | Why conditional |
| --- | --- | --- |
| `1d83b5472` | QuantumNous | Local already has `PasskeyReady` flow, but upstream adds stricter method-specific verification and passkey registration/delete gates. Backport if passkeys are exposed. |
| `59d5aef39` | QuantumNous | Partially covered. Runtime fallback in `ShouldSkipRetryAfterChannelAffinityFailure` is present, but `ChannelAffinityRule.SkipRetryOnFailure` still has `omitempty`, so explicit false may still be lost on save. Backport the tag change. |
| `f25672952` | Zeabur | Already covered. Local distributor already honors channel affinity skip-retry when a preferred channel is disabled. Skip except keep tests if touching this area. |
| `68830e609` | QuantumNous | Not applied. Adds `request_header` key source in channel affinity templates. Useful only if local users need header-derived affinity; backend portion is low risk. |
| `6f8668e4c` | QuantumNous | Not applied. Enforces `HeaderNavModules` access control for public pricing/rankings/perf routes. Consider if `web-worker` public module visibility must be enforced backend-side. |
| `0526a2264` | QuantumNous | Not applied. Adds audited compliance confirmation gate for paid features. Product/policy decision, not a pure bugfix; if adopted, adapt backend response types and `web-worker` top-up UI. |
| `e079e669f` | Zeabur | Hides performance guard errors. Useful if local performance middleware leaks confusing/internal errors to users. |
| `a2dc7a610` | Zeabur | Unicode length validation for announcements. Small and safe if local announcement validation has byte/rune mismatch. |
| `8191c3762`, `1862c3671`, `1f1d8fa5c` | Zeabur | Invite/email-domain fixes. Backport only if local invite registration is enabled in `web-worker` flows. |
| `8650dcc44` | Zeabur | Payment success notification improvements. Useful, but lower priority than payment provider guard. |
| `5238f279d` | QuantumNous | Stream interruption reason tracking is useful but broad; defer until core relay fixes are done. |
| `f424f906d` | QuantumNous | Upstream pricing sync from pricing endpoint is useful but touches old `web` ratio pages; backend-only extraction should be considered separately. |
| `560ba57c8` | QuantumNous | DeepChat deeplink is mostly old/default frontend plus `setting/chat.go`. Skip unless `web-worker` chat preset links need it. |
| `9acf5feca` | QuantumNous | Model performance metrics are broad feature work across backend and `web/default`; defer/skip unless `web-worker` pricing/model plaza will show live performance data. |

## Likely Skip

Skip or defer these broad categories unless a small backend bugfix is isolated:

- Zeabur ecomagent expansion and account assignment flows.
- Zeabur commission page polish and related large i18n rewrites.
- Zeabur lottery/check-in/activity pages.
- Zeabur region-block page, discount-code UI, and first-time discount flows.
- QuantumNous `web/default` large UI migration (`a42b39760`, `8b2b03d27`, related dashboard/base-ui/table-toolbar changes), because this fork's user-facing direction is `web-worker`.
- QuantumNous/Zeabur public frontend polish such as `469d3747a`, `ba474393f`, `e8cfb546f`, `f8cf9c57c`, and most `web/default` pricing/ranking/table visual work, unless a backend API fix is isolated.
- Broad feature additions not requested for this fork right now: model performance metrics (`9acf5feca`), paid-feature compliance gate (`0526a2264`), DeepChat deeplink (`560ba57c8`), and region-block/discount flows. Re-evaluate only if product direction changes.
- Electron-only dependency bumps unless this fork ships Electron.
- README/license/copyright/branding churn, especially anything touching protected identifiers.

## Already Covered Or Probably Skip

| Commit | Reason |
| --- | --- |
| `ee7cedd57` | Local `OpenAIResponsesResponse.Instructions` is already `json.RawMessage`. |
| `e729b2219` | Prior notes indicate local Codex auto-refresh logic already includes enabled + autoDisabled behavior; re-check before skipping in implementation. |
| `e729b2219` | Rechecked: local `shouldAutoRefreshCodexChannelStatus` and query include enabled plus auto-disabled channels. |
| `05b0041de` / `df6d86289` | Rechecked: local `setting/ratio_setting/model_ratio.go` already has `gpt-5.5` completion ratio and tests. |
| `47d7bca26` | Rechecked: local already has `claude-opus-4-7` constants/ratios/tests. |
| `d22f889e5` | Rechecked: local xAI adaptor already maps `MaxTokens` to `MaxCompletionTokens` for `grok-3-mini`. |
| `3ab65a822` | Rechecked: local OpenAI adaptor already supports Azure `/v1/responses/compact` URL routing. |
| `4ba328a2c` | Rechecked: local Claude adaptor already applies forced beta query at final upstream URL stage. |
| `f25672952` | Rechecked: local distributor already honors channel affinity skip-retry when preferred channel is disabled. |
| `3e5f2ee1d` | Not applicable currently because local does not have upstream tiered billing expression settlement path. |
| `faa0f1425` | Not applicable currently because local does not have upstream `PerfMetric` model/package. |
| `8744d951a`, `18282e610`, `3856b9d2c` | Axios bumps affect old `web`/`web/classic`; decide separately as dependency hygiene, not as core upstream merge. |
| `3e588b4d4` | Electron dependency bump; probably irrelevant unless Electron is shipped. |

## Suggested Backport Batches

Execution rule added before implementation:

- Do not direct-merge upstream branches.
- Backport one functional module at a time.
- After each module is implemented and tested, update this file with the applied commits/files/tests and the new local HEAD if committed.
- Before starting each new module, ask for user confirmation. This is especially required for payment, subscription, public frontend/API behavior, and broad product-policy changes.
- For backend API shape changes, check `web-worker/src/api-client/types.ts`, relevant `web-worker/src/api-client/*.ts`, hooks, and pages/components to avoid runtime crashes.

1. Security batch: auth/token error handling, user/token cache invalidation, SSRF hardening.
2. Payment safety batch: `PaymentProvider`, callback provider guards, top-up query DoS limits, optional top-up audit info.
3. Relay protocol batch: OpenAI image edit fields, raw JSON tool arguments, pointer reasoning fields, Claude/Gemini stream fixes, Ali string usage, optional Zhipu image endpoint.
4. Admin/query correctness batch: log filtering, channel group filter, large log deletion, request/upstream request ID logging, stream error-log flag, upstream model update model-mapping field.
5. Cross-DB/config batch: PostgreSQL sequence sync, config JSON wrapper and fresh-map update fix, token migration coverage.
6. Conditional feature hygiene: passkey stricter verification, channel affinity `omitempty` fix / request-header source, invite/email-domain fixes, announcement unicode validation, performance guard error hiding.

Each batch should get focused tests before implementation. Avoid broad cherry-picks across `web/default`/old `web` unless the backend contract requires it.

## Backport Execution Log

This section is updated after each selective backport step. `HEAD` stays `ae0e3528de4d22e4611a1c14b59c92a301adf375` until these manual backports are committed.

### 2026-05-18 Relay Protocol Batch

Scope approved by user: relay/provider protocol compatibility only. Payment/subscription changes are explicitly excluded for this batch and still require separate confirmation.

| Upstream commit | Local status | Files touched | Verification | Notes |
| --- | --- | --- | --- | --- |
| `38a3314b9` QuantumNous, `fix: preserve OpenAI image edit reference fields (#4646)` | Applied as uncommitted manual backport. | `dto/openai_image.go`, `relay/helper/valid_request.go`, `relay/channel/openai/adaptor.go`, tests in `dto/openai_image_test.go`, `relay/channel/openai/image_edit_json_test.go`. | Red first: `GOCACHE=/tmp/go-build-cache go test ./dto ./relay/channel/openai -run 'TestImageRequestPreservesEditReferenceFields|TestConvertImageRequestLeavesJSONEditRequestAsJSON' -count=1` failed because fields were dropped and JSON edit was parsed as multipart. Green after patch: same command passed. | Adds `ImageRequest.Images`, `Mask`, `InputFidelity`; JSON `images/edits` requests now stay JSON instead of forcing multipart/form-data. No `web-worker` API change expected because this is provider request passthrough/compatibility. |
| `db89b57e1` QuantumNous, `fix: support raw JSON response tool arguments` | Applied as uncommitted manual backport. | `common/json.go`, `dto/openai_response.go`, `relay/channel/openai/chat_via_responses.go`, `service/openaicompat/responses_to_chat.go`, tests in `common/json_test.go`, `dto/openai_response_arguments_test.go`, `service/openaicompat/responses_to_chat_test.go`. | Red first: `GOCACHE=/tmp/go-build-cache go test ./common ./dto ./service/openaicompat -run 'TestJsonRawMessageToString|TestResponsesOutputArguments|TestResponsesResponseToChatCompletionsResponseConvertsRawJSONToolArguments' -count=1` failed to compile because helper/methods were missing and `Arguments` was `string`. Green after patch: `GOCACHE=/tmp/go-build-cache go test ./common ./dto ./service/openaicompat ./relay/channel/openai -run 'TestJsonRawMessageToString|TestResponsesOutputArguments|TestResponsesResponseToChatCompletionsResponseConvertsRawJSONToolArguments' -count=1` passed. | `ResponsesOutput.Arguments` now accepts raw JSON and converts back to Chat Completions string form. No `web-worker` change expected unless it directly depends on internal Responses DTO typing, which will be checked at module end. |
| `8ca103342` QuantumNous, `fix: Message.ReasoningContent/Reasoning 改为 *string` | Applied as uncommitted manual backport. | `dto/openai_request.go`, `relay/channel/openai/relay-openai.go`, `relay/channel/claude/relay-claude.go`, `relay/channel/gemini/relay-gemini.go`, `relay/channel/ollama/stream.go`, test in `dto/message_reasoning_test.go`. | Red first: `GOCACHE=/tmp/go-build-cache go test ./dto -run 'TestMessageReasoningContent|TestMessageGetReasoningContent' -count=1` failed to compile because fields were `string` and getter was missing. Green after patch: `GOCACHE=/tmp/go-build-cache go test ./dto ./relay/channel/openai ./relay/channel/claude ./relay/channel/gemini ./relay/channel/ollama -run 'TestMessageReasoningContent|TestMessageGetReasoningContent' -count=1` passed. | Preserves explicit empty `reasoning_content` / `reasoning` when forwarding requests, aligning with AGENTS.md optional scalar rule. Provider conversions now assign pointer values where needed. |
| `23fde25b1` QuantumNous, `fix(gemini): detect streaming from URL path :streamGenerateContent`; `45cc95a25` / `5b9dcf1bd`, `fix(gemini): add IncludeServerSideToolInvocations field to ToolConfig` | Applied as uncommitted manual backport. | `dto/gemini.go`, tests in `dto/gemini_isstream_test.go`, `dto/gemini_tool_config_test.go`. | Red first: `GOCACHE=/tmp/go-build-cache go test ./dto -run 'TestGeminiChatRequestIsStream|TestGeminiToolConfigPreservesIncludeServerSideToolInvocationsFalse' -count=1` failed to compile because `ToolConfig.IncludeServerSideToolInvocations` was missing. Green after patch: same command passed. | Native Gemini `:streamGenerateContent` requests now set stream mode even without `alt=sse`; `includeServerSideToolInvocations:false` is preserved as an explicit optional bool. |
| `274307b0a` QuantumNous, `fix(ali): accept string usage values in task polling` | Applied as uncommitted manual backport. | `relay/channel/task/ali/adaptor.go`, test in `relay/channel/task/ali/adaptor_test.go`. | Red first: `GOCACHE=/tmp/go-build-cache go test ./relay/channel/task/ali ./relay/channel/zhipu_4v -run 'TestAliUsageAcceptsStringValues|TestGetRequestURLUsesSpecialOpenAIBaseForImageGeneration' -count=1` failed on Ali with `cannot unmarshal string into ... int`. Green after patch: same command passed. | Uses existing `dto.IntValue` for Ali usage counters, accepting both numeric and string values. |
| `160cb2857` QuantumNous, `fix(zhipu_4v): use correct endpoint for coding plan image generation (#4146)` | Applied as uncommitted manual backport. | `relay/channel/zhipu_4v/adaptor.go`, test in `relay/channel/zhipu_4v/adaptor_test.go`. | Red first: same command as Ali/Zhipu above failed because `glm-coding-plan` image generation produced `glm-coding-plan/api/paas/v4/images/generations`. Green after patch: same command passed. | Zhipu coding-plan image generation now uses `ChannelSpecialBases[baseURL].OpenAIBaseURL + /images/generations`, matching existing special-base behavior for chat/embeddings. |
| `f7cdc727d` QuantumNous, `fix: Claude 流式断流时不再整份覆盖 usage，保留 cache 计费字段` | Applied as uncommitted manual backport. | `relay/channel/claude/relay-claude.go`, tests in `relay/channel/claude/relay_claude_test.go`. | Red/green coverage added around `HandleStreamFinalResponse`: fallback completion estimation now patches missing prompt/completion values only, instead of replacing the whole usage object. Target command passed: `GOCACHE=/tmp/go-build-cache go test ./relay/channel/claude ./service -run 'TestHandleStreamFinalResponsePreservesClaudeCacheUsageWhenCompletionMissing|TestBuildOpenAIStyleUsageFromClaudeUsageDefaultsAggregateCacheCreationTo5m|TestBuildMessageDeltaPatchUsage|TestStreamResponseOpenAI2ClaudeEmitsUsageOnlyFinalChunk|TestBuildClaudeUsageFromOpenAIUsageDefaultsAggregateCacheCreationTo5m' -count=1`. | Preserves Claude cache read/cache creation fields when a stream ends without complete upstream usage. This is billing/accounting correctness, not a frontend feature. |
| `82c2008d2` QuantumNous, `fix: emit claude message_delta for usage-only final stream chunk` | Applied as uncommitted manual backport. | `service/convert.go`, `relay/channel/claude/relay-claude.go`, tests in `service/convert_claude_stream_test.go`, `relay/channel/claude/message_delta_usage_patch_test.go`, `relay/channel/claude/relay_claude_test.go`. | Target command passed: `GOCACHE=/tmp/go-build-cache go test ./relay/channel/claude ./service -run 'TestHandleStreamFinalResponsePreservesClaudeCacheUsageWhenCompletionMissing|TestBuildOpenAIStyleUsageFromClaudeUsageDefaultsAggregateCacheCreationTo5m|TestBuildMessageDeltaPatchUsage|TestStreamResponseOpenAI2ClaudeEmitsUsageOnlyFinalChunk|TestBuildClaudeUsageFromOpenAIUsageDefaultsAggregateCacheCreationTo5m' -count=1`. Follow-up package command passed: `GOCACHE=/tmp/go-build-cache go test ./relay/channel/claude ./service ./dto ./relay/helper -count=1`. | OpenAI-to-Claude streaming conversion now defers close events until a usage-only final chunk arrives, then emits Claude `message_delta` usage and `message_stop`. Aggregate cache creation token remainders default to the 5m bucket to match upstream semantics. |

Module verification after the above relay/provider backports:

- `git diff --check`: passed.
- Target package suite: `GOCACHE=/tmp/go-build-cache go test ./common ./dto ./service/openaicompat ./relay/channel/openai ./relay/channel/claude ./relay/channel/gemini ./relay/channel/ollama ./relay/channel/task/ali ./relay/channel/zhipu_4v -count=1`: passed outside sandbox. The same command hit sandbox `httptest` localhost bind restrictions in `common` before being rerun outside sandbox.
- Wider backend suite: `GOCACHE=/tmp/go-build-cache go test ./dto ./service/... ./relay/... -count=1`: passed outside sandbox. The same command hit sandbox `httptest` localhost bind restrictions in `service/support_ticket_notification_test.go` before being rerun outside sandbox.
- `web-worker` compatibility check: `web-worker/src` has no hard dependency on the changed backend internal DTO typings. Playground image edits still send multipart `FormData` to `/v1/images/edits`, so the new JSON edit passthrough is additive. Responses/Gemini changes are provider/API compatibility only and do not require `web-worker/src/api-client/types.ts` changes.
- `web-worker` verification: `pnpm build` in `web-worker/` passed. `pnpm check` currently fails on pre-existing lint/format issues unrelated to this batch, including `src/components/image-prompts/image-prompts-page.tsx` unused `start`/`end`, large `public/prompts.json`, and quote/format changes in existing frontend files.
- Claude stream continuation verification:
  - Target tests passed: `GOCACHE=/tmp/go-build-cache go test ./relay/channel/claude ./service -run 'TestHandleStreamFinalResponsePreservesClaudeCacheUsageWhenCompletionMissing|TestBuildOpenAIStyleUsageFromClaudeUsageDefaultsAggregateCacheCreationTo5m|TestBuildMessageDeltaPatchUsage|TestStreamResponseOpenAI2ClaudeEmitsUsageOnlyFinalChunk|TestBuildClaudeUsageFromOpenAIUsageDefaultsAggregateCacheCreationTo5m' -count=1`.
  - Package tests passed: `GOCACHE=/tmp/go-build-cache go test ./relay/channel/claude ./service ./dto ./relay/helper -count=1`.
  - Real smoke tests used the user-provided API key without writing it to this file: `/v1/models`, Anthropic native `/v1/messages` stream with `claude-haiku-4-5-20251001`, OpenAI chat stream to the same Claude model with `stream_options.include_usage:true`, and Anthropic native stream routed to `gpt-5.4-high` all returned HTTP 200 stream responses with final usage/stop events.

Continuation marker for next run:

- Branch updated locally: `fishxcode`.
- Local commit after this batch: still `ae0e3528de4d22e4611a1c14b59c92a301adf375` because these relay backports are currently uncommitted working-tree changes.
- Direct upstream ref compared: `upstream/fishxcode` at `7af2f0e4a33069650b5cb8c9869c21ffc55d6067`.
- Original upstream ref compared: `quantumnous/main` at `5dd0d3bcbd7b1d523bd046a5f9cf9fc8ce28d579`.
- Selective upstream commits applied in this uncommitted batch: `38a3314b9`, `db89b57e1`, `8ca103342`, `23fde25b1`, `45cc95a25`/`5b9dcf1bd`, `274307b0a`, `160cb2857`, `f7cdc727d`, `82c2008d2`.
- Do not reapply the above commits on the next run; first check whether this working tree has been committed, then continue from deferred relay/provider candidates or ask user to choose another module.

Deferred relay/provider candidates still requiring separate confirmation before implementation:

- `8b2216152` / `bb5b9eaca`: Claude `TopP` API compatibility. Still needs local audit before deciding.
- `3cad6b9d7`, `c04f82bfb`, `41cd051ea`: OpenAI-to-Claude empty content/file media conversion improvements. Still needs local audit before deciding.

## Commands Used For This Snapshot

- `git fetch upstream --prune`
- `git fetch https://github.com/QuantumNous/new-api.git main:refs/remotes/quantumnous/main`
- `git status --short --branch`
- `git branch -vv --all`
- `git log --oneline --left-right --cherry-pick HEAD...upstream/fishxcode -n 120`
- `git log --oneline --left-right --cherry-pick HEAD...quantumnous/main -n 160`
- `git log --all --oneline --grep='SSRF\\|ssrf\\|TokenAuth\\|token auth\\|ValidateAccessToken\\|PaymentProvider\\|cross-gateway\\|passkey\\|WebAuthn\\|OpenAI image edit\\|raw JSON response tool arguments\\|ReasoningContent\\|group filter\\|usage logs filtering\\|GetAllChannels\\|request_header\\|upstream request ID\\|HEIF\\|topup'`
- `rg -n "ValidateAccessToken|TokenAuth|PaymentProvider|ApplyIPFilterForDomain|ssrf|PasskeyReady|GetAllChannels|applyLogContainsFilter|ReasoningContent|JsonRawMessageToString|Images|InputFidelity|ContextKeyIsStream|request_header" controller service model relay dto common setting middleware -S`
- `git show --stat --oneline --decorate <candidate commits>`
