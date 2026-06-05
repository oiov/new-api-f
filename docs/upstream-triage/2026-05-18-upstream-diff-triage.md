# Upstream Diff Triage Snapshot

Date: 2026-05-18

Repository: `/Users/songjunxi/Desktop/repos/fish-new-api`

Purpose: record the current comparison between this fork, `dext7r/Zeabur` branch `fishxcode`, and `QuantumNous/new-api` so later merge/backport work can continue from a stable written baseline instead of relying on chat context.

## Current Refs

| Role | Ref | Commit | Notes |
| --- | --- | --- | --- |
| This fork | `HEAD` | `HEAD` | `fix: backport payment provider guards`; one commit ahead of `origin/fishxcode` |
| Fork remote | `origin/fishxcode` | `dd5a29233ca6bda210c2f939ee5ae874de6a834f` | `docs: 更新上游差异快照，记录最新合并状态和手动回退进度` |
| Direct upstream | `upstream/fishxcode` | `d2e755b99c99b35cf51e92b707e1ea26faccdb1d` | `feat: allow editing checkin record time` |
| Zeabur mirror of original upstream | `upstream/new-api` | `5d93351d04269d9504e5fd0a5fd32ded674ddef2` | Mirror sync commit only, `sync: QuantumNous/new-api@fbf235d2` |
| Original upstream | `quantumnous/main` | `0936e2504655a5cbf7bc3c388f6d3e2bb24916d3` | `perf: avoid eager formatting in debug log calls (#4929)` |

Working tree note: `web-worker/` is untracked. Do not modify or delete it unless explicitly requested.

## Current Check 2026-06-05

Fresh fetch results on 2026-06-05:

- Local `HEAD` / `origin/fishxcode`: `649b6659169e562a27070b91f120928d9447e0bf` (`feat: 增加用户配额统计功能，支持按用户名查询`), authored 2026-06-04 20:03:17 +0800.
- Direct upstream `upstream/fishxcode`: `70bd759d80a64be8e53ecd58fe35de0c90c65a18` (`fix: fallback expired subscription-only billing`), authored 2026-06-01 23:14:45 +0800.
- Original upstream `quantumnous/main`: `87cc22d7ec4923ad08df826866fb3e51c95ed1d8` (`fix(distributor): resolve model for GET /v1/video/generations/:task_id (#5133)`), authored 2026-06-04 18:48:30 +0800.
- Zeabur mirror sync marker `upstream/new-api`: unchanged at `5d93351d04269d9504e5fd0a5fd32ded674ddef2` (`sync: QuantumNous/new-api@fbf235d2`).
- Historical `upstream/main`: unchanged at `d2796837bac9af4f49a59330e703a260097322b4` (`chore: add MREGISTER sync target`).
- Fetch note: `git fetch https://github.com/QuantumNous/new-api main:refs/remotes/quantumnous/main --prune` failed because this repository has no configured `quantumnous` remote and the pseudo remote ref was left invalid after prune. Verified `87cc22d7ec4923ad08df826866fb3e51c95ed1d8` with `git ls-remote`, then repaired `refs/remotes/quantumnous/main` using `git update-ref`.
- Root worktree note: only `?? web-worker/` is shown. `web-worker` is a nested repository and `git -C web-worker status --short --branch` reports `## main...origin/main`.

Merge bases remain unchanged:

- Local vs Zeabur: `8aa8b81e03522f306d24134725378228e64b03ab` (`fix: original_model && upstream_model paramOverrideKeyAuditPaths`).
- Local vs QuantumNous main: `9ae9040b3c9dab88660fb9724d182393d0137861` (`Merge pull request #3401 from seefs001/fix/convert-openai-detail-field`).
- Zeabur fishxcode vs QuantumNous main: `8aa8b81e03522f306d24134725378228e64b03ab`.
- `upstream/new-api` is not an ancestor of local `HEAD` or `upstream/fishxcode`; continue treating it as a historical sync marker only.

Current ancestry counts:

- `git rev-list --left-right --count HEAD...upstream/fishxcode`: `488 552` total commits by ancestry.
- `git rev-list --count --no-merges upstream/fishxcode ^HEAD`: 529 Zeabur non-merge commits not in local by ancestry.
- `git rev-list --count --no-merges HEAD ^upstream/fishxcode`: 452 local non-merge commits not in Zeabur by ancestry.
- `git rev-list --left-right --count HEAD...quantumnous/main`: `431 375` total commits by ancestry.
- `git rev-list --count --no-merges quantumnous/main ^HEAD`: 310 QuantumNous non-merge commits not in local by ancestry.
- `git rev-list --count --no-merges HEAD ^quantumnous/main`: 414 local non-merge commits not in QuantumNous by ancestry.
- `git rev-list --left-right --count upstream/fishxcode...quantumnous/main`: `552 432` total commits by ancestry, Zeabur side first.

Current file diff scale:

- `git diff --shortstat HEAD..upstream/fishxcode`: 573 files changed, 87574 insertions(+), 40942 deletions(-).
- `git diff --shortstat HEAD..quantumnous/main`: 2037 files changed, 256755 insertions(+), 174297 deletions(-).

New upstream commits since the previous late 2026-05-19 check:

- Zeabur advanced from `d2e755b99c99b35cf51e92b707e1ea26faccdb1d` to `70bd759d80a64be8e53ecd58fe35de0c90c65a18`: 55 new non-merge commits.
- QuantumNous advanced from `0936e2504655a5cbf7bc3c388f6d3e2bb24916d3` to `87cc22d7ec4923ad08df826866fb3e51c95ed1d8`: 78 new non-merge commits.

High-value new Zeabur candidates:

| Commit | Area | Local status | Recommendation |
| --- | --- | --- | --- |
| `70bd759d8` | Subscription-only billing fallback when no active subscription remains | Not covered. Local `service/billing_session.go` still switches on `subscription_only` without the upstream downgrade-and-wallet-fallback helper; local `model/subscription.go` has `HasActiveUserSubscription` but lacks `DowngradeSubscriptionOnlyBillingPreferenceIfNoActiveSubscription`. | Manual backport now if subscription-only billing is enabled locally. Add focused billing-session and subscription-expiry tests. No schema change in upstream patch. |
| `66d8f7477`, `dfdd95323`, `c8f096977`, `61d6a10b3`, `63c9ca405`, `7aeaa15b0` family | Subscription token quota, request-count, wallet-overage, vendor resolution | Needs inspection. Local has extensive custom subscription/request-count work and tests, but these upstream commits touch the same functions and may contain edge-case fixes not present locally. | Manual comparison batch, not cherry-pick. Start with tests from `service/task_billing_test.go`, `controller/token_test.go`, and `model/subscription_query_test.go`. |
| `3ec5f3555` | Ratio sync error reporting | Not covered from title-level check; local `controller/ratio_sync.go` has provider pricing import code, but needs exact diff inspection. | Inspect/manual backport. Low conflict risk. |
| `56241ad9c` | Log billing-source filters | Partially overlapping. Local log query/export code has custom subscription filters and export limits; upstream exact billing-source filter behavior is not fully present. | Manual backport with query tests; avoid direct file replacement. |
| `099b7f2a2` | Provider pricing API and CC Switch import helpers | Mostly not covered. `model/provider_pricing.go` is absent locally; only related ratio-sync comments and `ccswitch_defaults` plumbing exist. | Conditional. Backport only if CC Switch/provider-pricing import remains product scope. |
| `aaa7510e5`, `1461e7e3`, `4ee454d56`, `603dc34a1` | Disabled frontend landing fallback and Docker frontend build toggle | Not backend-critical; touches router/static frontend behavior. | Defer/conditional. Verify against local `web-worker` direction before merging. |
| `36c13aa1f`, `095f74ad6`, `2bb6be7c2`, `a01dcd90d` and related package UI commits | Old `web/` package console layout/mobile/loading UI | Not in current primary frontend scope. | Skip/defer unless backend API bug is separable. |

High-value new QuantumNous candidates:

| Commit | Area | Local status | Recommendation |
| --- | --- | --- | --- |
| `87cc22d7e` | Distributor model resolution for `GET /v1/video/generations/:task_id` under token model limits | Not covered. Local `middleware/distributor.go` still sets `RelayModeVideoFetchByID` and `shouldSelectChannel=false` without backfilling `modelRequest.Model` from the stored task. | Backport now. Small focused patch plus test around token model-limit task fetch. |
| `3aa113b5a` | Dify remote image nil pointer panic | Not covered. Local `relay/channel/dify/relay-dify.go` still declares `var file *DifyFile` and assigns `file.Type` in the remote-image branch before initialization. | Backport now. Small safe bugfix plus unit/regression test if practical. |
| `ff06067a1` | Claude stream concurrent `tool_use` index collision | Not covered. Local `relay/channel/claude/relay-claude.go` still uses `*Index - 1` with clamp to zero. | Backport now. High protocol correctness value. |
| `465c5edab` | Gemini-to-Claude streaming `tool_use` finish handling | Not covered. Local `GeminiChatStreamHandler` still always emits the stop response and final usage response in the older flow. | Backport now/manual due local display-model wrappers. |
| `2a528d46c` | Image quality parameter handling | Not covered. Local `relay/image_handler.go` collapses all non-`hd` qualities to `standard`. | Backport now. Small protocol compatibility fix. |
| `230a3592f`, `afb470e40`, `74985fa87`, `1d3203736` | Log query exact filters and `(created_at, id)` index/order performance | Partially not covered. Local `model/log.go` still has `idx_created_at_id` priority `(id, created_at)`, admin/user lists order by `logs.id desc`, admin model filter uses raw `like`, and token-name filters are exact in some paths. | Manual backport. Flag manual index rebuild for existing DBs if applying `afb470e40`; AutoMigrate will not reorder an existing index. |
| `ebbe31553` | Evict/restore auto-disabled multi-key channels from cache | Not covered. Local `handlerMultiKeyUpdate` initializes `keyIndex` to zero, does not handle missing key, and does not evict cache when all keys are disabled. | Manual backport with channel-cache tests. |
| `128802818` | Truncate oversized upstream error logs | Needs inspection. Local has request-log preview/truncation utilities but this exact RelayErrorHandler behavior is not verified. | Inspect/manual backport to reduce log memory/noise. |
| `fddf54ccc` | Reduce heap residency for large base64 relay requests | Needs inspection. Local has `common.GetRequestBody` and pass-through helpers, but not the upstream `outbound_body` package by name. | Manual performance backport only after reviewing interaction with local pass-through/body-storage behavior. |
| `006e80165` | Resolve model `owned_by` from active channels and token group | Not covered. Local `ListModels` still returns static `openAIModelsMap` owner or `custom`; `model.GetPreferredModelOwnerChannelTypes` is absent. | Manual backport if accurate `/v1/models` metadata matters; cross-check with local multi-group token behavior. |
| `0c7aceb83` | Claude Opus 4.8 support and ratios | Not covered from quick check. | Conditional model catalog/ratio update. Backport if provider support is desired. |
| `0354c38be`, `49bc3a117`, `f2c7647ec`, `19f1821fc` | Waffo Pancake payment/webhook/subscription integration | Mostly not applicable to current local active Waffo paths. Local has Waffo, not the upstream Pancake controller/service set. | Conditional/skip unless enabling Waffo Pancake. Do not mix into existing payment safety batch without product decision. |
| `b397c58ba`, `8ae095c3b` | Register status exposure and user create/delete handling | Needs inspection. Small backend correctness candidates, but less urgent than relay/log/cache fixes. | Inspect after relay/log/cache batch. |
| Web/default/classic TypeScript, theme, channel editor, usage-log UI commits | Frontend UI migration and polish | Outside current primary `web-worker` direction. | Usually skip unless a backend/API contract fix is separable. |

Current recommendation:

- Do not direct-merge either `upstream/fishxcode` or `quantumnous/main`.
- Continue manual backport batches. Highest immediate batch should be QuantumNous relay/provider correctness (`87cc22d7e`, `3aa113b5a`, `ff06067a1`, `465c5edab`, `2a528d46c`), then log/channel-cache correctness (`230a3592f`, `afb470e40`, `74985fa87`, `1d3203736`, `ebbe31553`), then Zeabur subscription billing edge cases (`70bd759d8` plus request-count/token quota family).
- Schema/data-shape note: no schema change was applied during this check. If `afb470e40` is later backported, existing deployments need a manual rebuild of `logs.idx_created_at_id` to reorder it to `(created_at, id)` for SQLite/MySQL/PostgreSQL; record exact DDL at implementation time. If Waffo Pancake or provider-pricing work is later selected, re-check model fields and migrations before applying.
- Detailed conflict/risk plan: `docs/upstream-triage/2026-06-05-upstream-backport-risk-plan.md`. Use that plan before any merge/backport so recommended fixes are tested against local subscription, log, relay, channel-cache, payment, and `web-worker` constraints.

## Current Check 2026-05-19 Late

Fresh fetch results:

- Local `HEAD`: `HEAD` (`fix: backport payment provider guards`), one commit ahead of `origin/fishxcode`.
- `origin/fishxcode`: `dd5a29233ca6bda210c2f939ee5ae874de6a834f` (`docs: 更新上游差异快照，记录最新合并状态和手动回退进度`).
- Direct upstream `upstream/fishxcode`: advanced to `d2e755b99c99b35cf51e92b707e1ea26faccdb1d` (`feat: allow editing checkin record time`).
- Zeabur mirror sync marker `upstream/new-api`: unchanged at `5d93351d04269d9504e5fd0a5fd32ded674ddef2`.
- Original upstream `quantumnous/main`: advanced to `0936e2504655a5cbf7bc3c388f6d3e2bb24916d3` (`perf: avoid eager formatting in debug log calls (#4929)`).
- Fetch note: the local `refs/remotes/quantumnous/main` ref was broken and was repaired with `git update-ref -d refs/remotes/quantumnous/main`, then refetched.
- Worktree note remains: `web-worker/` is untracked and should not be touched during upstream triage unless explicitly requested.

Merge bases remain unchanged:

- Local vs Zeabur: `8aa8b81e03522f306d24134725378228e64b03ab`
- Local vs QuantumNous main: `9ae9040b3c9dab88660fb9724d182393d0137861`
- Zeabur fishxcode vs QuantumNous main: `8aa8b81e03522f306d24134725378228e64b03ab`

Current ancestry counts:

- `upstream/fishxcode ^HEAD --no-merges`: 474 upstream non-merge commits not in local by ancestry.
- `quantumnous/main ^HEAD --no-merges`: 232 original-upstream non-merge commits not in local by ancestry.
- `HEAD ^upstream/fishxcode --no-merges`: 414 local non-merge commits not in Zeabur by ancestry.
- `HEAD ^quantumnous/main --no-merges`: 376 local non-merge commits not in QuantumNous by ancestry.

New upstream commits since the previous check:

| Commit | Source | Area | Status | Recommendation |
| --- | --- | --- | --- | --- |
| `d2e755b99` | Zeabur | Check-in record time editing, likely activity/check-in admin flow | Not applied. | Defer/conditional. This is outside the current payment-safety backend batch; inspect only if check-in admin correctness becomes in scope. |
| `0936e2504` | QuantumNous | Debug logging performance: avoid eager formatting in debug log calls | Not applied. | Low-risk optimization candidate. Defer until after safety/accounting/admin correctness batches unless local profiling shows log formatting overhead. |

Progress checkpoint:

- Relay/provider protocol batch is committed locally as `69a31879c2ceee9c5ea62109042359ea34bada1c`.
- Auth/token/user-cache security batch is committed locally as `ddd501c95`.
- Auth/relay real smoke-test results are recorded in `656743e5e7f6f93ad591a11de83db4d70590ff82`.
- SSRF/URL-fetch safety batch is committed locally as `ca1f26586caf019c2d59d6bfdf8f4a6706f7c700`.
- EPay/Stripe ordinary top-up provider-guard subset is committed locally as `28f19a5468306b82797bc16c4caae94bbebee915`.
- Payment provider guard continuation is committed locally as `HEAD`.

Recommendation remains unchanged: do not direct-merge `upstream/fishxcode` or `quantumnous/main`. Continue manual backport batches. The next high-value backend batches after committing payment safety are admin/query correctness and cross-DB/config correctness.

## Current Check 2026-05-19

Fresh fetch of `upstream` and `QuantumNous/new-api` produced no ref changes during this check.

- Local `HEAD`: `28f19a5468306b82797bc16c4caae94bbebee915` (`fix: harden epay stripe topup callbacks`).
- `origin/fishxcode`: `ca1f26586caf019c2d59d6bfdf8f4a6706f7c700` (`fix: backport upstream ssrf hardening`), one commit behind local `HEAD`.
- Direct upstream `upstream/fishxcode`: `404d54bd976942bd1b25ba5cff309a5c830f5368` (`优化活动抽奖历史报名展示`).
- Zeabur mirror sync marker `upstream/new-api`: `5d93351d04269d9504e5fd0a5fd32ded674ddef2`.
- Original upstream `quantumnous/main`: `5dd0d3bcbd7b1d523bd046a5f9cf9fc8ce28d579` (`fix: add analytics placeholder (#4928)`).
- Worktree note remains: `web-worker/` is untracked and should not be touched during upstream triage unless explicitly requested.

Merge bases remain unchanged:

- Local vs Zeabur: `8aa8b81e03522f306d24134725378228e64b03ab`
- Local vs QuantumNous main: `9ae9040b3c9dab88660fb9724d182393d0137861`
- Zeabur fishxcode vs QuantumNous main: `8aa8b81e03522f306d24134725378228e64b03ab`

Current ancestry counts:

- `upstream/fishxcode ^HEAD --no-merges`: 473 upstream non-merge commits not in local by ancestry.
- `quantumnous/main ^HEAD --no-merges`: 231 original-upstream non-merge commits not in local by ancestry.
- `HEAD ^upstream/fishxcode --no-merges`: 412 local non-merge commits not in Zeabur by ancestry.
- `HEAD ^quantumnous/main --no-merges`: 374 local non-merge commits not in QuantumNous by ancestry.

Progress checkpoint:

- Relay/provider protocol batch is committed locally as `69a31879c2ceee9c5ea62109042359ea34bada1c`.
- Auth/token/user-cache security batch is committed locally as `ddd501c95`.
- Auth/relay real smoke-test results are recorded in `656743e5e7f6f93ad591a11de83db4d70590ff82`.
- SSRF/URL-fetch safety batch is committed locally as `ca1f26586caf019c2d59d6bfdf8f4a6706f7c700`.
- EPay/Stripe ordinary top-up provider-guard subset is committed locally as `28f19a5468306b82797bc16c4caae94bbebee915`.
- Payment safety continuation is committed locally as `HEAD`.
- Because these were manual backports, their upstream commit hashes can still appear in ancestry-only `git log upstream ^HEAD` output. Treat the local batch commits above as the source of truth for progress.

Recommendation remains unchanged: do not direct-merge `upstream/fishxcode` or `quantumnous/main`. Continue manual backport batches. The next high-value backend batches after committing the payment continuation are admin/query correctness and cross-DB/config correctness.

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

## Recheck 2026-05-19

Fresh fetch results:

- `origin/fishxcode`: unchanged at `61fe82952614414f881fd6f4e8db634e34c0f879` (`docs: record auth backport checkpoint`).
- Local `HEAD`: `656743e5e7f6f93ad591a11de83db4d70590ff82` (`feat: 添加真实烟雾测试凭证和结果记录`), one commit ahead of `origin/fishxcode`.
- Direct upstream `upstream/fishxcode`: advanced from `7af2f0e4a33069650b5cb8c9869c21ffc55d6067` to `404d54bd976942bd1b25ba5cff309a5c830f5368` (`优化活动抽奖历史报名展示`).
- Zeabur mirror sync marker `upstream/new-api`: unchanged at `5d93351d04269d9504e5fd0a5fd32ded674ddef2`.
- Original upstream `quantumnous/main`: unchanged at `5dd0d3bcbd7b1d523bd046a5f9cf9fc8ce28d579`.
- Worktree note remains: `web-worker/` is untracked and should not be touched during upstream triage unless explicitly requested.

Merge bases remain unchanged:

- Local vs Zeabur: `8aa8b81e03522f306d24134725378228e64b03ab`
- Local vs QuantumNous main: `9ae9040b3c9dab88660fb9724d182393d0137861`
- Zeabur fishxcode vs QuantumNous main: `8aa8b81e03522f306d24134725378228e64b03ab`

Current ancestry counts:

- `upstream/fishxcode ^HEAD --no-merges`: 473 upstream non-merge commits not in local by ancestry.
- `quantumnous/main ^HEAD --no-merges`: 231 original-upstream non-merge commits not in local by ancestry.
- `HEAD ^upstream/fishxcode --no-merges`: 410 local non-merge commits not in Zeabur by ancestry.
- `HEAD ^quantumnous/main --no-merges`: 372 local non-merge commits not in QuantumNous by ancestry.

Progress checkpoint:

- Relay/provider protocol batch is committed locally as `69a31879c2ceee9c5ea62109042359ea34bada1c`.
- Auth/token/user-cache security batch is committed locally as `ddd501c95`.
- Auth/relay real smoke-test results are recorded in local `HEAD` `656743e5e7f6f93ad591a11de83db4d70590ff82`.
- Because these were manual backports, their upstream commit hashes can still appear in ancestry-only `git log upstream ^HEAD` output. Treat the local batch commits above as the source of truth for progress.

New Zeabur commits since the last direct-upstream head:

| Commit | Area | Status | Recommendation |
| --- | --- | --- | --- |
| `58a2cadad` | Activity lottery config, `model/activity_lottery.go`, old `web/` admin UI/i18n | Not applied. | Conditional. Backend lottery fixes may be reviewed only if this fork uses activity lottery flows; broad old `web/` changes should remain out of current priority batches. |
| `315319267` | Activity lottery frontend experience and helper tests | Not applied. | Skip/defer for current scope; old `web/` UI work. |
| `139cbb38f` | Activity lottery old `web/` component split | Not applied. | Skip/defer for current scope; old `web/` UI refactor. |
| `fe74ba17a` | Activity lottery period/privacy backend tests plus old `web/` admin UI | Not applied. | Conditional. Backend correctness may be inspected with `58a2cadad` if lottery is in scope. |
| `07ab7ad22` | Lottery admin form builder and old `web/` i18n | Not applied. | Skip/defer for current scope. |
| `404d54bd9` | Activity lottery history display in old `web/` | Not applied. | Skip/defer for current scope. |

Recommendation remains unchanged: do not direct-merge `upstream/fishxcode` or `quantumnous/main`. Continue manual backport batches. The next high-value backend batches are SSRF/URL fetch safety, payment callback provider guards, admin/query correctness, and cross-DB/config correctness.

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

- `git log --oneline upstream/fishxcode ^HEAD --no-merges | wc -l`: 473 upstream non-merge commits not in local by ancestry.
- `git log --oneline quantumnous/main ^HEAD --no-merges | wc -l`: 231 original-upstream non-merge commits not in local by ancestry.
- `git log --oneline HEAD ^upstream/fishxcode --no-merges | wc -l`: 412 local non-merge commits not in Zeabur by ancestry.
- `git log --oneline HEAD ^quantumnous/main --no-merges | wc -l`: 374 local non-merge commits not in QuantumNous by ancestry.

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
| `59c582d13` | QuantumNous | Applied as committed manual backport in `ddd501c95`. | Already covered. Preserve local `Fish-X-Code-User` header behavior if this area is touched again. |
| `2819e3a1d` | QuantumNous | Applied as committed manual backport in `ddd501c95`. | Already covered. |
| `925342622` | QuantumNous | Applied as committed manual backport in `ddd501c95`, including local `ban`, `promote`, and `demote` paths. | Already covered. |

Historical local evidence before the auth batch:

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
| `20399d3c8` | QuantumNous | Applied as committed manual backport in `ca1f26586`, adapted to local video proxy, MJ proxy, fetch defaults, and channel model-fetch route. | Already covered for audited unauthenticated/user-level fetch paths. Re-audit any newly added outbound URL fetcher. |
| `e2807c5f9` | QuantumNous | Applied as committed manual backport in `ca1f26586`. | Already covered. Keep expanded IPv4/IPv6 special-purpose range tests if touching SSRF code. |

Historical local evidence before the SSRF batch:

- `common/ssrf_protection.go`: `DefaultSSRFProtection` does not set `ApplyIPFilterForDomain`; `setting/system_setting/fetch_setting.go` default is false.
- Current implementation performs DNS lookup only when `ApplyIPFilterForDomain` is true.
- `controller/video_proxy.go` fetches resolved video URLs without `ValidateURLWithFetchSetting`.
- `relay/mjproxy_handler.go` fetches Midjourney image URLs without `ValidateURLWithFetchSetting`.

### Payment And Subscription Callback Safety

| Commit | Source | Status in local | Recommendation |
| --- | --- | --- | --- |
| `a7c38ec85` | QuantumNous | Covered by committed manual backports: `28f19a546` for ordinary EPay/Stripe top-up, and `payment-guard continuation commit` for subscription EPay/Stripe/Creem plus ordinary Creem/Waffo provider guards. WaffoPancake has no active local controller/callback path. | Already covered for active local payment paths. |
| `b2e62a44e` | QuantumNous | Applied as committed manual backport in `payment-guard continuation commit`, adapted to local filtered top-up queries. | Already covered. |
| `e70eaec4d` / `6f26145bf` | QuantumNous/Zeabur | Partially applied locally via payment method checks. | Audit before merging; keep local Stripe/Waffo/Creem behavior intact. |

Current payment evidence:

- `model/topup.go` now contains an internal `PaymentProvider` field and provider checks for ordinary EPay/Stripe top-up completion/expiry.
- `model/subscription.go` now contains an internal `SubscriptionOrder.PaymentProvider` field and guarded completion/expiry parameters for subscription payment callbacks.
- Subscription EPay callbacks pass provider `epay` and preserve the actual EPay callback method, allowing wxpay-to-alipay style switches while rejecting cross-gateway callbacks.
- Stripe and Creem subscription callbacks pass provider guards before completing subscription orders.
- QuantumNous adds `PaymentProvider` to both `TopUp` and `SubscriptionOrder`; local top-up EPay/Stripe/Creem/Waffo plus subscription EPay/Stripe/Creem active paths are covered by `28f19a546` and `payment-guard continuation commit`. WaffoPancake has only constants locally and no active callback/controller path found by `rg`.
- Local `model/subscription.go` already has `ProviderPayload`, so keep that field and add provider guard parameters around the existing completion/expiry APIs.
- `b2e62a44e` is adapted to local filtered top-up search: user-facing top-up queries now cap to the last 30 days; top-up keyword search uses `sanitizeLikePattern` and `ESCAPE '!'`; admin count queries use a 10000-row hard limit.

### Relay / Provider Protocol Compatibility

| Commit | Source | Status in local | Recommendation |
| --- | --- | --- | --- |
| `38a3314b9` | QuantumNous | Applied as committed manual backport in `69a31879c`. | Already covered. |
| `db89b57e1` | QuantumNous | Applied as committed manual backport in `69a31879c`. | Already covered. |
| `8ca103342` | QuantumNous | Applied as committed manual backport in `69a31879c`. | Already covered. |
| `f7cdc727d` | QuantumNous | Applied as committed manual backport in `69a31879c`. | Already covered with Claude stream tests and real-call smoke tests. |
| `82c2008d2` | QuantumNous | Applied as committed manual backport in `69a31879c`. | Already covered with Claude stream tests and real-call smoke tests. |
| `23fde25b1` | QuantumNous | Applied as committed manual backport in `69a31879c`. | Already covered. |
| `45cc95a25` / `5b9dcf1bd` | QuantumNous | Applied as committed manual backport in `69a31879c`. | Already covered. |
| `8b2216152` / `bb5b9eaca` | QuantumNous | Not fully verified. Claude `TopP` should be nil for API compatibility in relevant paths. | Backport if local still sends zero TopP. |
| `3cad6b9d7`, `c04f82bfb`, `41cd051ea` | QuantumNous | Needs manual inspection. These improve OpenAI-to-Claude empty content/file media conversion. | Candidate if Claude Messages/media compatibility is important. |
| `3ab65a822` | QuantumNous | Needs inspection. Azure `/v1/responses/compact` routing support. | Candidate if Azure Responses compact is used. |
| `53cf37a46` / `274307b0a` | QuantumNous | `274307b0a` applied as committed manual backport in `69a31879c`; `53cf37a46` still needs separate inspection if it contains additional behavior. | Mostly covered for Ali string usage values. |
| `160cb2857` | QuantumNous | Applied as committed manual backport in `69a31879c`. | Already covered. |
| `987b7ecd2` | QuantumNous | Not applied. Vertex adapters still need custom `base_url` gateway prefix audit. | Backport only if custom Vertex gateways are used; otherwise medium priority. |
| `4ba328a2c` | Zeabur | Already covered. Local Claude adaptor applies forced beta query at final URL construction and reads `ChannelOtherSettings.ClaudeBetaQuery`. | Skip. |

Historical local evidence before the relay batch:

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
- `274307b0a`: applied in `69a31879c`; local Ali task usage fields now accept string values via `dto.IntValue`.
- `160cb2857`: applied in `69a31879c`; local Zhipu coding-plan image generation now uses the special OpenAI base URL.
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
- API compatibility gate: every batch must explicitly check whether it changes routes, auth/permission requirements, request fields, response fields, status codes, error bodies, pagination shape, or task/log DTOs. If any of these change, inspect matching `web-worker/src/api-client/types.ts`, `web-worker/src/api-client/*.ts`, hooks, routes, and components, run focused `web-worker` tests when present, and record the compatibility result in this file.

1. Security batch: auth/token error handling, user/token cache invalidation, SSRF hardening.
2. Payment safety batch: `PaymentProvider`, callback provider guards, top-up query DoS limits, optional top-up audit info.
3. Relay protocol batch: OpenAI image edit fields, raw JSON tool arguments, pointer reasoning fields, Claude/Gemini stream fixes, Ali string usage, optional Zhipu image endpoint.
4. Admin/query correctness batch: log filtering, channel group filter, large log deletion, request/upstream request ID logging, stream error-log flag, upstream model update model-mapping field.
5. Cross-DB/config batch: PostgreSQL sequence sync, config JSON wrapper and fresh-map update fix, token migration coverage.
6. Conditional feature hygiene: passkey stricter verification, channel affinity `omitempty` fix / request-header source, invite/email-domain fixes, announcement unicode validation, performance guard error hiding.

Each batch should get focused tests before implementation. Avoid broad cherry-picks across `web/default`/old `web` unless the backend contract requires it.

## Backport Execution Log

This section is updated after each selective backport step. Relay/provider fixes were committed locally as `69a31879c2ceee9c5ea62109042359ea34bada1c` (`fix: backport upstream relay protocol fixes`). Auth/token/cache fixes were committed locally as `ddd501c95` (`fix: backport upstream auth cache hardening`).

### 2026-05-18 Relay Protocol Batch

Scope approved by user: relay/provider protocol compatibility only. Payment/subscription changes are explicitly excluded for this batch and still require separate confirmation.

| Upstream commit | Local status | Files touched | Verification | Notes |
| --- | --- | --- | --- | --- |
| `38a3314b9` QuantumNous, `fix: preserve OpenAI image edit reference fields (#4646)` | Applied as committed manual backport in `69a31879c`. | `dto/openai_image.go`, `relay/helper/valid_request.go`, `relay/channel/openai/adaptor.go`, tests in `dto/openai_image_test.go`, `relay/channel/openai/image_edit_json_test.go`. | Red first: `GOCACHE=/tmp/go-build-cache go test ./dto ./relay/channel/openai -run 'TestImageRequestPreservesEditReferenceFields|TestConvertImageRequestLeavesJSONEditRequestAsJSON' -count=1` failed because fields were dropped and JSON edit was parsed as multipart. Green after patch: same command passed. | Adds `ImageRequest.Images`, `Mask`, `InputFidelity`; JSON `images/edits` requests now stay JSON instead of forcing multipart/form-data. No `web-worker` API change expected because this is provider request passthrough/compatibility. |
| `db89b57e1` QuantumNous, `fix: support raw JSON response tool arguments` | Applied as committed manual backport in `69a31879c`. | `common/json.go`, `dto/openai_response.go`, `relay/channel/openai/chat_via_responses.go`, `service/openaicompat/responses_to_chat.go`, tests in `common/json_test.go`, `dto/openai_response_arguments_test.go`, `service/openaicompat/responses_to_chat_test.go`. | Red first: `GOCACHE=/tmp/go-build-cache go test ./common ./dto ./service/openaicompat -run 'TestJsonRawMessageToString|TestResponsesOutputArguments|TestResponsesResponseToChatCompletionsResponseConvertsRawJSONToolArguments' -count=1` failed to compile because helper/methods were missing and `Arguments` was `string`. Green after patch: `GOCACHE=/tmp/go-build-cache go test ./common ./dto ./service/openaicompat ./relay/channel/openai -run 'TestJsonRawMessageToString|TestResponsesOutputArguments|TestResponsesResponseToChatCompletionsResponseConvertsRawJSONToolArguments' -count=1` passed. | `ResponsesOutput.Arguments` now accepts raw JSON and converts back to Chat Completions string form. No `web-worker` change expected unless it directly depends on internal Responses DTO typing, which will be checked at module end. |
| `8ca103342` QuantumNous, `fix: Message.ReasoningContent/Reasoning 改为 *string` | Applied as committed manual backport in `69a31879c`. | `dto/openai_request.go`, `relay/channel/openai/relay-openai.go`, `relay/channel/claude/relay-claude.go`, `relay/channel/gemini/relay-gemini.go`, `relay/channel/ollama/stream.go`, test in `dto/message_reasoning_test.go`. | Red first: `GOCACHE=/tmp/go-build-cache go test ./dto -run 'TestMessageReasoningContent|TestMessageGetReasoningContent' -count=1` failed to compile because fields were `string` and getter was missing. Green after patch: `GOCACHE=/tmp/go-build-cache go test ./dto ./relay/channel/openai ./relay/channel/claude ./relay/channel/gemini ./relay/channel/ollama -run 'TestMessageReasoningContent|TestMessageGetReasoningContent' -count=1` passed. | Preserves explicit empty `reasoning_content` / `reasoning` when forwarding requests, aligning with AGENTS.md optional scalar rule. Provider conversions now assign pointer values where needed. |
| `23fde25b1` QuantumNous, `fix(gemini): detect streaming from URL path :streamGenerateContent`; `45cc95a25` / `5b9dcf1bd`, `fix(gemini): add IncludeServerSideToolInvocations field to ToolConfig` | Applied as committed manual backport in `69a31879c`. | `dto/gemini.go`, tests in `dto/gemini_isstream_test.go`, `dto/gemini_tool_config_test.go`. | Red first: `GOCACHE=/tmp/go-build-cache go test ./dto -run 'TestGeminiChatRequestIsStream|TestGeminiToolConfigPreservesIncludeServerSideToolInvocationsFalse' -count=1` failed to compile because `ToolConfig.IncludeServerSideToolInvocations` was missing. Green after patch: same command passed. | Native Gemini `:streamGenerateContent` requests now set stream mode even without `alt=sse`; `includeServerSideToolInvocations:false` is preserved as an explicit optional bool. |
| `274307b0a` QuantumNous, `fix(ali): accept string usage values in task polling` | Applied as committed manual backport in `69a31879c`. | `relay/channel/task/ali/adaptor.go`, test in `relay/channel/task/ali/adaptor_test.go`. | Red first: `GOCACHE=/tmp/go-build-cache go test ./relay/channel/task/ali ./relay/channel/zhipu_4v -run 'TestAliUsageAcceptsStringValues|TestGetRequestURLUsesSpecialOpenAIBaseForImageGeneration' -count=1` failed on Ali with `cannot unmarshal string into ... int`. Green after patch: same command passed. | Uses existing `dto.IntValue` for Ali usage counters, accepting both numeric and string values. |
| `160cb2857` QuantumNous, `fix(zhipu_4v): use correct endpoint for coding plan image generation (#4146)` | Applied as committed manual backport in `69a31879c`. | `relay/channel/zhipu_4v/adaptor.go`, test in `relay/channel/zhipu_4v/adaptor_test.go`. | Red first: same command as Ali/Zhipu above failed because `glm-coding-plan` image generation produced `glm-coding-plan/api/paas/v4/images/generations`. Green after patch: same command passed. | Zhipu coding-plan image generation now uses `ChannelSpecialBases[baseURL].OpenAIBaseURL + /images/generations`, matching existing special-base behavior for chat/embeddings. |
| `f7cdc727d` QuantumNous, `fix: Claude 流式断流时不再整份覆盖 usage，保留 cache 计费字段` | Applied as committed manual backport in `69a31879c`. | `relay/channel/claude/relay-claude.go`, tests in `relay/channel/claude/relay_claude_test.go`. | Red/green coverage added around `HandleStreamFinalResponse`: fallback completion estimation now patches missing prompt/completion values only, instead of replacing the whole usage object. Target command passed: `GOCACHE=/tmp/go-build-cache go test ./relay/channel/claude ./service -run 'TestHandleStreamFinalResponsePreservesClaudeCacheUsageWhenCompletionMissing|TestBuildOpenAIStyleUsageFromClaudeUsageDefaultsAggregateCacheCreationTo5m|TestBuildMessageDeltaPatchUsage|TestStreamResponseOpenAI2ClaudeEmitsUsageOnlyFinalChunk|TestBuildClaudeUsageFromOpenAIUsageDefaultsAggregateCacheCreationTo5m' -count=1`. | Preserves Claude cache read/cache creation fields when a stream ends without complete upstream usage. This is billing/accounting correctness, not a frontend feature. |
| `82c2008d2` QuantumNous, `fix: emit claude message_delta for usage-only final stream chunk` | Applied as committed manual backport in `69a31879c`. | `service/convert.go`, `relay/channel/claude/relay-claude.go`, tests in `service/convert_claude_stream_test.go`, `relay/channel/claude/message_delta_usage_patch_test.go`, `relay/channel/claude/relay_claude_test.go`. | Target command passed: `GOCACHE=/tmp/go-build-cache go test ./relay/channel/claude ./service -run 'TestHandleStreamFinalResponsePreservesClaudeCacheUsageWhenCompletionMissing|TestBuildOpenAIStyleUsageFromClaudeUsageDefaultsAggregateCacheCreationTo5m|TestBuildMessageDeltaPatchUsage|TestStreamResponseOpenAI2ClaudeEmitsUsageOnlyFinalChunk|TestBuildClaudeUsageFromOpenAIUsageDefaultsAggregateCacheCreationTo5m' -count=1`. Follow-up package command passed: `GOCACHE=/tmp/go-build-cache go test ./relay/channel/claude ./service ./dto ./relay/helper -count=1`. | OpenAI-to-Claude streaming conversion now defers close events until a usage-only final chunk arrives, then emits Claude `message_delta` usage and `message_stop`. Aggregate cache creation token remainders default to the 5m bucket to match upstream semantics. |

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
- Local commit after this batch: `69a31879c2ceee9c5ea62109042359ea34bada1c` (`fix: backport upstream relay protocol fixes`).
- Direct upstream ref compared: `upstream/fishxcode` at `7af2f0e4a33069650b5cb8c9869c21ffc55d6067`.
- Original upstream ref compared: `quantumnous/main` at `5dd0d3bcbd7b1d523bd046a5f9cf9fc8ce28d579`.
- Selective upstream commits applied in committed relay batch: `38a3314b9`, `db89b57e1`, `8ca103342`, `23fde25b1`, `45cc95a25`/`5b9dcf1bd`, `274307b0a`, `160cb2857`, `f7cdc727d`, `82c2008d2`.
- Do not reapply the above commits on the next run; first check whether this working tree has been committed, then continue from deferred relay/provider candidates or ask user to choose another module.

Deferred relay/provider candidates still requiring separate confirmation before implementation:

- `8b2216152` / `bb5b9eaca`: Claude `TopP` API compatibility. Still needs local audit before deciding.
- `3cad6b9d7`, `c04f82bfb`, `41cd051ea`: OpenAI-to-Claude empty content/file media conversion improvements. Still needs local audit before deciding.

### 2026-05-18 Auth / Token / User Cache Security Batch

Scope approved by user: auth/token/cache safety fixes. Payment/subscription changes remain excluded from this batch.

| Upstream commit | Local status | Files touched | Verification | Notes |
| --- | --- | --- | --- | --- |
| `59c582d13` QuantumNous, `fix: harden token auth error handling to prevent info leakage` | Applied as committed manual backport in `ddd501c95`. | `model/errors.go`, `model/token.go`, `model/user.go`, `middleware/auth.go`, tests in `model/auth_security_test.go`, `middleware/rate_limit_test.go`. | Red first: `GOCACHE=/tmp/go-build-cache go test ./model -run 'TestValidateUserTokenReturnsGenericSentinelForInvalidStates|TestValidateAccessTokenDistinguishesMissingFromDatabaseErrors|TestValidateAndFillReturnsSentinelErrors|TestInvalidateUserTokensCacheDeletesAllUserTokenCaches' -count=1` failed to compile because sentinel errors/new access-token signature/cache invalidation function were missing. Red first: `GOCACHE=/tmp/go-build-cache go test ./middleware -run 'TestTokenAuthDoesNotLeakTokenStatusForInvalidToken' -count=1` failed because the response leaked `TokenStatusExhausted` and token key fragments. Green after patch: both target commands passed. | Keeps local Chinese response style instead of importing the whole upstream i18n auth rewrite. TokenAuth now returns generic `无效的令牌` for expired/exhausted/disabled/not-found tokens and logs DB errors server-side. `ValidateAccessToken` now returns `(*User, error)` so DB failures are not treated as invalid credentials. |
| `2819e3a1d` QuantumNous, `fix: improve login error handling to distinguish database errors from auth failures` | Applied as committed manual backport in `ddd501c95`. | `model/user.go`, `controller/user.go`, tests in `model/auth_security_test.go`. | Target model command passed: `GOCACHE=/tmp/go-build-cache go test ./model -run 'TestValidateUserTokenReturnsGenericSentinelForInvalidStates|TestValidateAccessTokenDistinguishesMissingFromDatabaseErrors|TestValidateAndFillReturnsSentinelErrors|TestInvalidateUserTokensCacheDeletesAllUserTokenCaches' -count=1`. | `ValidateAndFill` now returns sentinel errors for empty credentials, invalid credentials, and database failures. `Login` maps DB errors to generic database error responses and invalid credentials to the existing username/password error message. |
| `925342622` QuantumNous, `fix(user): invalidate user and token caches when disabling user` | Applied as committed manual backport in `ddd501c95`, adapted for local `disable`, `ban`, `enable`, `promote`, and `demote` actions. | `controller/user.go`, `model/token.go`, `model/user_cache.go`, tests in `model/auth_security_test.go`. | Target model command passed: `GOCACHE=/tmp/go-build-cache go test ./model -run 'TestValidateUserTokenReturnsGenericSentinelForInvalidStates|TestValidateAccessTokenDistinguishesMissingFromDatabaseErrors|TestValidateAndFillReturnsSentinelErrors|TestInvalidateUserTokensCacheDeletesAllUserTokenCaches' -count=1`. | Adds exported `InvalidateUserCache` and `InvalidateUserTokensCache`. `ManageUser` invalidates all user token caches after delete and invalidates user plus token caches after status/role changes. Local extra `ban` action is included. |

Auth batch implementation notes:

- `middleware/auth.go` also now uses `common.IsEnabledUserStatus` for dashboard/access-token user cache checks, so locally added `UserStatusBanned` is treated as blocked alongside disabled users.
- `TokenAuthReadOnly` now treats record-not-found as invalid token and other token/user-cache errors as database errors without returning raw DB error text to clients.
- No `web-worker` API type change is expected: response status/message behavior changes only for invalid token/login/database failures. The frontend should already handle `success:false` and OpenAI-style error objects.

Auth batch verification:

- `git diff --check`: passed.
- Target red/green tests passed after implementation:
  - `GOCACHE=/tmp/go-build-cache go test ./model -run 'TestValidateUserTokenReturnsGenericSentinelForInvalidStates|TestValidateAccessTokenDistinguishesMissingFromDatabaseErrors|TestValidateAndFillReturnsSentinelErrors|TestInvalidateUserTokensCacheDeletesAllUserTokenCaches' -count=1`
  - `GOCACHE=/tmp/go-build-cache go test ./middleware -run 'TestTokenAuthDoesNotLeakTokenStatusForInvalidToken|TestTokenAuthStoresAuthorizedTokenGroups' -count=1`
- Follow-up focused tests passed:
  - `GOCACHE=/tmp/go-build-cache go test ./middleware -count=1`
  - `GOCACHE=/tmp/go-build-cache go test ./controller -run 'Test.*User|Test.*Token|TestLogin|TestManage' -count=1`
  - `GOCACHE=/tmp/go-build-cache go test ./model -run 'TestValidateUserTokenReturnsGenericSentinelForInvalidStates|TestValidateAccessTokenDistinguishesMissingFromDatabaseErrors|TestValidateAndFillReturnsSentinelErrors|TestInvalidateUserTokensCacheDeletesAllUserTokenCaches|TestGetAllUsersStatusFilter|TestSearchUsersStatusFilter' -count=1`
- Attempted `GOCACHE=/tmp/go-build-cache go test ./model ./middleware ./controller -count=1` and `GOCACHE=/tmp/go-build-cache go test ./model ./middleware -count=1`; both were stopped after the existing `model` package test binary produced no output for more than a minute. Focused `model` tests and full `middleware` tests passed afterward.

Continuation marker for next run:

- Branch updated locally: `fishxcode`.
- Local commit after this auth batch: `ddd501c95` (`fix: backport upstream auth cache hardening`).
- Auth/token/cache selective upstream commits applied in committed auth batch: `59c582d13`, `2819e3a1d`, `925342622`.
- Direct upstream ref compared: `upstream/fishxcode` at `7af2f0e4a33069650b5cb8c9869c21ffc55d6067`.
- Original upstream ref compared: `quantumnous/main` at `5dd0d3bcbd7b1d523bd046a5f9cf9fc8ce28d579`.

### 2026-05-19 Real Smoke Test Pass

Local server: started temporarily on `http://127.0.0.1:3001` with `.env`, `NODE_TYPE=slave`, `UPDATE_TASK=false`, and `ERROR_LOG_ENABLED=true`; stopped after tests. Test API key was loaded from `.env` variable `patchToken`; the key value is intentionally not written here.

Results:

- `/v1/models` with `patchToken`: PASS, HTTP 200, returned 105 models.
- `/v1/models` with a deliberately invalid token: PASS, HTTP 401, generic `无效的令牌` OpenAI-style error; response did not expose token status, quota details, or key fragments.
- `/v1/chat/completions` streaming to `claude-haiku-4-5-20251001` with `stream_options.include_usage:true`: PASS, received content chunk, final usage chunk, and `[DONE]`.
- `/v1/messages` Anthropic-native streaming to `claude-haiku-4-5-20251001`: PASS, received `message_start`, `content_block_delta`, `message_delta` with usage, and `message_stop`.
- `/v1beta/models/{model}:streamGenerateContent` Gemini-native streaming path: PASS using the discovered `gemini-3.1-flash-image-preview`; received 2 streamed chunks with candidates. Note: this model is image-priced in the current environment, so avoid frequent real smoke reruns unless the Gemini stream path needs verification.

### 2026-05-19 SSRF / URL Fetch Safety Batch

Scope approved by user: continue by recommended priority and manually backport or merge where appropriate. Direct branch merge remains excluded; this batch manually backports SSRF/URL-fetch safety only.

| Upstream commit | Local status | Files touched | Verification | Notes |
| --- | --- | --- | --- | --- |
| `e2807c5f9` QuantumNous, `feat: enhance SSRF protection` | Applied as committed manual backport in this SSRF batch. | `common/ssrf_protection.go`, tests in `common/ssrf_protection_test.go`. | Red first: `GOCACHE=/tmp/go-build-cache go test ./common ./setting/system_setting ./controller ./relay -run 'TestValidateURLWithFetchSettingAppliesDomainIPFilterByDefault|TestValidateURLWithFetchSettingRejectsSpecialPurposeIPv4Ranges|TestDefaultFetchSettingAppliesIPFilterForDomain|TestVideoProxyBlocksUnsafeResultURLBeforeFetch|TestRelayMidjourneyImageBlocksUnsafeImageURLBeforeFetch' -count=1` failed because special IPv4 ranges were allowed. Green after patch: target command passed. | Expands private/special-purpose IP detection to include unspecified, CGNAT, TEST-NET, benchmarking, limited broadcast, IPv4-mapped/translation IPv6, documentation, discard-only, ULA/link-local/multicast IPv6 ranges. |
| `20399d3c8` QuantumNous, `fix: harden SSRF protection for unauthenticated and user-level endpoints` | Applied as committed manual backport in this SSRF batch. | `controller/video_proxy.go`, `relay/mjproxy_handler.go`, `setting/system_setting/fetch_setting.go`, `router/api-router.go`, tests in `controller/video_proxy_test.go`, `relay/mjproxy_handler_test.go`, `setting/system_setting/fetch_setting_test.go`, `router/channel_security_test.go`. | Red first: target tests failed because `VideoProxy` returned 502 after attempting `127.0.0.1`, `RelayMidjourneyImage` returned 500 after attempting `127.0.0.1`, default fetch setting did not apply domain IP filtering, and `/api/channel/fetch_models` allowed an admin with `channel.upstream.sync` to reach controller JSON parsing. Green after patch: target tests passed. | Video content proxy and Midjourney image proxy now call `common.ValidateURLWithFetchSetting` before outbound fetches. `ApplyIPFilterForDomain` now defaults true. Manual model fetch route now requires `RootAuth` plus the existing upstream-sync permission check, preserving local permission model while matching upstream's root-only security intent. |

SSRF batch verification:

- `git diff --check`: passed.
- Target command passed in sandbox:
  - `GOCACHE=/tmp/go-build-cache go test ./common ./setting/system_setting ./controller ./relay ./router -run 'TestValidateURLWithFetchSettingAppliesDomainIPFilterByDefault|TestValidateURLWithFetchSettingRejectsSpecialPurposeIPv4Ranges|TestDefaultFetchSettingAppliesIPFilterForDomain|TestVideoProxyBlocksUnsafeResultURLBeforeFetch|TestRelayMidjourneyImageBlocksUnsafeImageURLBeforeFetch|TestFetchModelsRouteRequiresRootRole' -count=1`
- Relevant package command passed outside sandbox:
  - `GOCACHE=/tmp/go-build-cache go test ./common ./setting/system_setting ./controller ./relay ./router -count=1`
- The same package command initially failed inside sandbox because existing `common` tests use `httptest.NewServer`, which cannot bind localhost in the sandbox; rerunning outside sandbox passed.

SSRF batch `web-worker` API compatibility:

- Changed backend API surface:
  - `/v1/videos/:task_id/content` can now return HTTP 403 with OpenAI-style error body when the resolved result URL is blocked by SSRF policy. Success response headers/body are unchanged.
  - `/mj/image/:id` can now return HTTP 403 with `{"error":"request blocked: ..."}` when the image URL is blocked. `web-worker` has no direct caller for this endpoint.
  - `/api/channel/fetch_models` now requires root auth in addition to the existing upstream-sync permission check. This route is old/admin UI oriented; `web-worker/src` has no caller.
  - Default fetch setting now enables domain IP filtering; this changes backend safety behavior, not request/response DTO shape.
- `web-worker` inspection:
  - `rg` found no `web-worker/src` caller for `/api/channel/fetch_models` or `/mj/image`.
  - `web-worker/src/lib/task-result.ts` still accepts `/v1/videos/:task_id/content` result URLs and does not depend on proxy response body shape until the browser opens the link.
  - `web-worker/src/hooks/use-playground-video.ts` calls `/v1/videos/:task_id` for task status, not `/v1/videos/:task_id/content`.
  - `web-worker/src/api-client/types.ts` `TaskItem.result_url` remains compatible; no type update required.
- Focused `web-worker` verification passed:
  - `pnpm exec tsx --test src/lib/task-result.test.ts src/lib/playground-video.test.ts src/hooks/use-playground-video.ts`

Continuation marker for next run:

- Branch updated locally: `fishxcode`.
- Direct upstream ref compared: `upstream/fishxcode` at `404d54bd976942bd1b25ba5cff309a5c830f5368`.
- Original upstream ref compared: `quantumnous/main` at `5dd0d3bcbd7b1d523bd046a5f9cf9fc8ce28d579`.
- Selective upstream commits applied in SSRF batch: `20399d3c8`, `e2807c5f9`.
- Next priority batch remains payment safety: `a7c38ec85`, `b2e62a44e`, with local Stripe/Waffo/Creem/subscription behavior requiring careful manual adaptation.

### 2026-05-19 Payment Safety Batch: EPay And Stripe Top-Up Only

Scope narrowed by user during implementation: do not change Creem, Waffo, or subscription payment behavior in this batch. Preserve online EPay and Stripe payment compatibility as the highest constraint.

| Upstream commit | Local status | Files touched | Verification | Notes |
| --- | --- | --- | --- | --- |
| `a7c38ec85` QuantumNous, `fix: add PaymentProvider field to prevent cross-gateway callback attacks` | Partially applied as committed manual backport `28f19a546` for ordinary top-up EPay and Stripe only. | `model/topup.go`, `controller/topup.go`, `controller/topup_stripe.go`, tests in `model/topup_test.go`. | Red first: `GOCACHE=/tmp/go-build-cache go test ./model -run 'TestRechargeEpayRejectsCrossGatewayOrder|TestRechargeEpayAcceptsLegacyEpayOrderAndUpdatesActualPaymentMethod|TestRechargeStripeRejectsEpayProviderEvenIfMethodWasTampered|TestStripeExpireRejectsEpayProviderEvenIfMethodWasTampered|TestValidateTopUpPaidMoney' -count=1` failed because `PaymentProvider`, provider constants, EPay actual-method update, and Stripe expiry guard were missing. Green after patch: same command passed. Controller Stripe regression tests passed separately. | Adds an internal `TopUp.PaymentProvider` DB column with `json:"-"`, so the field is not exposed in API responses. New EPay top-up orders store provider `epay`; new Stripe top-up orders store provider `stripe`. Legacy pending orders with empty provider are mapped by existing `payment_method` so old EPay/Stripe pending orders can still complete. EPay callbacks may update `payment_method` to the actual gateway type returned by EPay, preserving wxpay-to-alipay style checkout switches. |
| `b2e62a44e` QuantumNous, `fix(topup): harden top-up search against DoS and cap user queries to 30 days` | Not applied in this batch after scope reduction. | None. | Not run. | Deferred. This changes user top-up history query semantics and should be handled only after confirming the frontend/user-history impact. |

Payment batch API compatibility gate:

- Changed backend API surface:
  - `/api/user/pay` request and success/error response shape are unchanged: still accepts `amount` and `payment_method`, still returns `{message,data,url}`.
  - `/api/user/stripe/pay` request and success/error response shape are unchanged: still accepts `amount`, `payment_method:"stripe"`, optional redirect URLs, and returns `{message,data:{pay_link}}`.
  - EPay notify behavior now accepts an EPay-created order even if the actual callback `type` differs from the originally requested EPay method, while still rejecting Stripe-created orders.
  - Stripe completion and expiry now reject EPay-created orders even if `payment_method` was tampered to `stripe`.
  - `TopUp.payment_provider` is persisted only in the database and intentionally hidden from JSON responses with `json:"-"`.
- Explicitly not changed in this batch:
  - Creem top-up creation/callback behavior.
  - Waffo top-up creation/callback behavior.
  - Subscription EPay/Stripe/Creem order creation, completion, and expiry behavior.
  - Top-up history query filtering/window behavior from `b2e62a44e`.
- `web-worker` inspection:
  - `web-worker/src/api-client/topup-pay.ts` still sends EPay `{amount,payment_method}` to `/api/user/pay` and Stripe `{amount,payment_method:"stripe"}` to `/api/user/stripe/pay`.
  - `web-worker/src/api-client/types.ts` `RequestEpayResponse`, `RequestStripePayResponse`, and `TopUpItem` remain compatible because no required response fields changed and `payment_provider` is not exposed.
  - `web-worker/src/components/topup/online-pay-card.tsx` only depends on existing EPay `url/data` and Stripe `data.pay_link`.
  - `web-worker/src/components/topup/topup-history.tsx` only reads `payment_method`, `status`, `trade_no`, and `money`; unchanged.

Payment batch verification:

- `git diff --check`: passed.
- Target model tests passed:
  - `GOCACHE=/tmp/go-build-cache go test ./model -run 'TestRechargeEpayRejectsCrossGatewayOrder|TestRechargeEpayAcceptsLegacyEpayOrderAndUpdatesActualPaymentMethod|TestRechargeStripeRejectsEpayProviderEvenIfMethodWasTampered|TestStripeExpireRejectsEpayProviderEvenIfMethodWasTampered|TestValidateTopUpPaidMoney' -count=1`
- Stripe controller regression tests passed:
  - `GOCACHE=/tmp/go-build-cache go test ./controller -run 'TestStripeAmountCentsRoundsToMinorUnits|TestGenStripeLinkUsesConfiguredPriceWithRequestedQuantity|TestValidateStripeTopUpSessionAcceptsPaidConfiguredPriceEvenWhenRuntimePriceIdChanged|TestStripeWebhookReturnsServerErrorWhenCompletedSessionCannotBeProcessed|TestStripeWebhookCompletedSessionRechargesPendingTopUp' -count=1`
- Focused `web-worker` tests passed:
  - `pnpm exec tsx --test src/server/api-proxy.test.ts src/lib/log-search.test.ts src/lib/subscription-purchase.test.ts`
- Attempted wider command `GOCACHE=/tmp/go-build-cache go test ./model ./controller -count=1`; it produced no output for several minutes and was stopped. `ps` showed it stuck in the existing `model.test` process; the stuck verification processes were killed. Use the focused commands above as the evidence for this scoped batch.

### 2026-05-19 Payment Safety Continuation: Subscription Provider Guards And Top-Up Query Hardening

Scope from user: continue with the recommended manual backport/update sequence. Direct upstream branch merge remains excluded.

| Upstream commit | Local status | Files touched | Verification | Notes |
| --- | --- | --- | --- | --- |
| `a7c38ec85` QuantumNous, `fix: add PaymentProvider field to prevent cross-gateway callback attacks` | Further applied as committed manual backport `payment-guard continuation commit` for subscription EPay/Stripe/Creem and ordinary Creem/Waffo top-up guards. | `model/subscription.go`, `controller/subscription_payment_epay.go`, `controller/subscription_payment_stripe.go`, `controller/subscription_payment_creem.go`, `controller/topup_stripe.go`, `controller/topup_creem.go`, `controller/topup_waffo.go`, tests in `model/subscription_query_test.go` and `model/topup_test.go`. | Red first: target model tests failed because `SubscriptionOrder.PaymentProvider` and guarded completion/expiry arguments were missing. Green after patch: focused model commands passed, including new Creem/Waffo cross-gateway tests. | Adds internal `SubscriptionOrder.PaymentProvider` with `json:"-"`. New subscription EPay/Stripe/Creem orders store their creating provider. Payment callbacks now pass expected provider; EPay callbacks also update `payment_method` to the actual method returned by EPay. New ordinary Creem and Waffo top-up orders now store their provider, and their completion paths reject orders whose provider was created by another gateway. Legacy pending orders with empty provider are inferred from existing `payment_method`. |
| `b2e62a44e` QuantumNous, `fix(topup): harden top-up search against DoS and cap user queries to 30 days` | Applied as committed manual backport `payment-guard continuation commit`, adapted to local `TopUpAdminFilters` and `TopUpUserFilters`. | `model/topup.go`, tests in `model/topup_test.go`. | Red/green coverage added for user 30-day window, wildcard-flood rejection, and `_` escaping. Focused model command passed. | User-facing top-up list/search now only returns records from the last 30 days. Keyword search uses existing `sanitizeLikePattern` with `ESCAPE '!'`. Admin top-up count queries are capped with `searchTopUpCountHardLimit = 10000`. |

Payment continuation API compatibility gate:

- Changed backend API surface:
  - `SubscriptionOrder.payment_provider` is persisted only in the database and intentionally hidden from JSON responses with `json:"-"`.
  - Ordinary `TopUp.payment_provider` remains persisted only in the database and hidden from JSON responses with `json:"-"`.
  - `/api/subscription/epay/pay`, `/api/subscription/stripe/pay`, and `/api/subscription/creem/pay` request and success/error response shapes are unchanged.
  - Subscription EPay notify/return now reject orders created by another provider, but still allow EPay's actual callback method to differ from the originally requested EPay method.
  - Stripe and Creem subscription callbacks now reject subscription orders created by another provider.
  - Ordinary Creem and Waffo top-up request/response shapes are unchanged; their order creation paths now write provider metadata, and their completion paths reject orders created by another provider.
  - `/api/user/topup/self` now caps payment-history results to a 30-day create-time window and rejects unsafe LIKE patterns if `keyword` is provided.
- Explicitly not changed in this continuation:
  - WaffoPancake top-up creation/callback behavior. Local repo currently has only WaffoPancake constants in `model/topup.go`; `rg` found no controller or active callback path to backport.
  - Top-up and subscription request/response DTO shapes consumed by `web-worker`.
  - Creem JSON request/response parsing was moved from direct `encoding/json` calls to the project `common.Marshal` / `common.Unmarshal` wrappers while touching the file.
- `web-worker` inspection:
  - `web-worker/src/api-client/subscription.ts` still sends `{plan_id}` for Stripe and `{plan_id,payment_method}` for EPay and reads existing `pay_link` / EPay form-data responses.
  - `web-worker/src/api-client/topup.ts` supports optional top-up `keyword`, but `web-worker/src/components/topup/topup-history.tsx` currently calls user top-up history without keyword filters.
  - `web-worker/src/api-client/types.ts` remains compatible because `payment_provider` is hidden from backend JSON.

Payment continuation verification:

- `git diff --check`: passed.
- Initial target RED command failed as expected before implementation:
  - `GOCACHE=/tmp/go-build-cache go test ./model -run 'TestCompleteSubscriptionOrderRejectsCrossGatewayProvider|TestCompleteSubscriptionOrderAcceptsLegacyEpayAndUpdatesActualPaymentMethod|TestExpireSubscriptionOrderRejectsCrossGatewayProvider|TestGetUserTopUpsLimitsDefaultWindow|TestTopUpSearchRejectsWildcardFlood|TestTopUpSearchEscapesUnderscore' -count=1`
- Target model command passed after implementation:
  - `GOCACHE=/tmp/go-build-cache go test ./model -run 'TestCompleteSubscriptionOrderRejectsCrossGatewayProvider|TestCompleteSubscriptionOrderAcceptsLegacyEpayAndUpdatesActualPaymentMethod|TestExpireSubscriptionOrderRejectsCrossGatewayProvider|TestGetUserTopUpsLimitsDefaultWindow|TestTopUpSearchRejectsWildcardFlood|TestTopUpSearchEscapesUnderscore' -count=1`
- Broader focused model command passed:
  - `GOCACHE=/tmp/go-build-cache go test ./model -run 'TestGetAllTopUpsByFilter|TestValidateTopUpPaidMoney|TestRechargeEpayRejectsCrossGatewayOrder|TestRechargeEpayAcceptsLegacyEpayOrderAndUpdatesActualPaymentMethod|TestRechargeStripeRejectsEpayProviderEvenIfMethodWasTampered|TestStripeExpireRejectsEpayProviderEvenIfMethodWasTampered|TestCompleteSubscriptionOrder' -count=1`
- Creem/Waffo focused model command passed:
  - `GOCACHE=/tmp/go-build-cache go test ./model -run 'TestRecharge(Creem|Waffo|Epay|Stripe)|TestStripeExpire|TestGetUserTopUpsLimitsDefaultWindow|TestTopUpSearch' -count=1`
- Expanded payment focused model command passed:
  - `GOCACHE=/tmp/go-build-cache go test ./model -run 'TestGetAllTopUpsByFilter|TestValidateTopUpPaidMoney|TestRechargeEpayRejectsCrossGatewayOrder|TestRechargeEpayAcceptsLegacyEpayOrderAndUpdatesActualPaymentMethod|TestRechargeStripeRejectsEpayProviderEvenIfMethodWasTampered|TestStripeExpireRejectsEpayProviderEvenIfMethodWasTampered|TestRechargeCreemRejectsStripeProviderEvenIfMethodWasTampered|TestRechargeCreemAcceptsLegacyCreemOrderAndBackfillsProvider|TestRechargeWaffoRejectsStripeProviderEvenIfMethodWasTampered|TestRechargeWaffoAcceptsLegacyWaffoOrderAndBackfillsProvider|TestCompleteSubscriptionOrder' -count=1`
- Stripe controller regression command passed:
  - `GOCACHE=/tmp/go-build-cache go test ./controller -run 'TestStripeAmountCentsRoundsToMinorUnits|TestGenStripeLinkUsesConfiguredPriceWithRequestedQuantity|TestValidateStripeTopUpSessionAcceptsPaidConfiguredPriceEvenWhenRuntimePriceIdChanged|TestStripeWebhookReturnsServerErrorWhenCompletedSessionCannotBeProcessed|TestStripeWebhookCompletedSessionRechargesPendingTopUp' -count=1`
- Focused `web-worker` tests passed:
  - `pnpm exec tsx --test src/server/api-proxy.test.ts src/lib/subscription-purchase.test.ts`
- Wider verification notes:
  - `GOCACHE=/tmp/go-build-cache go test ./controller -count=1` failed due existing cross-test/global DB teardown issues around async site notifications and missing test tables; the focused payment controller command above passed.
  - `GOCACHE=/tmp/go-build-cache go test ./model -count=1` timed out after 10 minutes in existing `TestApproveSubscriptionConversionRequest_BalanceSupportsTokenUsageAutoCalculation`; not in the new payment/top-up tests.

Continuation marker for next run:

- Payment continuation is committed locally as `HEAD`.
- Covered upstream commits in this continuation: `a7c38ec85` for subscription EPay/Stripe/Creem plus ordinary Creem/Waffo provider guards, and `b2e62a44e` for top-up query hardening.
- Remaining payment-safety note: ordinary WaffoPancake provider guard has no active local controller/callback path to update; only constants are present.

### 2026-06-05 Relay / Log / Channel / Model Correctness Batch

Scope approved by user: execute `docs/upstream-triage/2026-06-05-upstream-backport-risk-plan.md` by priority, cautiously, with TDD and (where feasible) real DB + key smoke tests. Base local `HEAD` at batch start: `649b66591`. All work committed on `fishxcode`, not pushed. **No schema/index/migration changes in this entire batch.**

| Local commit | Upstream | Area | Files | Verification |
| --- | --- | --- | --- | --- |
| `c0627d3da` | `87cc22d7e` QuantumNous | Distributor: backfill model for GET `/v1/video/generations/:task_id` & `/v1/videos/:task_id` under token model-limit | `middleware/distributor.go` (+`getTaskOriginModelName`), `middleware/distributor_task_fetch_model_test.go` | Red→green; routing-regression suite passed; real smoke: GET video fetch returns 400 `task_not_exist` (no 500/panic) |
| `1add536f4` | `3aa113b5a` QuantumNous | Dify remote-image nil pointer panic | `relay/channel/dify/relay-dify.go`, `relay/channel/dify/relay_dify_test.go` | Red(panic)→green |
| `86121f620` | `ff06067a1` QuantumNous | Claude concurrent tool_use index collision (removed `-1` offset) | `relay/channel/claude/relay-claude.go`, `relay/channel/claude/relay_claude_tooluse_index_test.go` | Red `[0,0]`→green `[0,1]`; real smoke: parallel 2-tool Claude stream returns 2 distinct indexes |
| `dba939a7f` | `465c5edab` QuantumNous | Gemini→Claude tool stream finish handling (text-then-tool was dropping tool_use) | `relay/channel/gemini/relay-gemini.go`, `relay/channel/gemini/relay_gemini_claude_tool_test.go` | Empirically found real defect (tool dropped + `end_turn`); red→green + OpenAI-format guard test; real smoke: Anthropic `/v1/messages`→gemini emits tool_use + `stop_reason:tool_use` |
| `8fe0dcaac` | `2a528d46c` QuantumNous | Image log quality preservation (non-hd no longer collapsed to standard) | `relay/image_handler.go` (+`resolveImageQuality`), `relay/image_handler_test.go` | Red→green |
| `c39869adb` | `230a3592f` (1d3203736 family) QuantumNous | Admin log exact text filter (`_`/`%` no longer mis-wildcard); `applyExplicitLogTextFilter` for admin model/username/token_name only; **user query untouched** | `model/log.go`, `model/log_admin_filter_test.go` | Red→green; real PG read-only: `gpt_5.5` matched 125466 rows pre-fix → 0 post-fix |
| `5ba206977` | `230a3592f` QuantumNous | Log list ordering `id desc`→`created_at desc, id desc` (GetAllLogs/GetUserLogs only; export keyset & subscription-consume kept `id desc`) | `model/log.go`, `model/log_order_test.go` | Red→green; real PG EXPLAIN ANALYZE: common "latest" case both sub-ms (0.124 vs 0.137ms) — benefit is mainly ordering stability + old-window/deep-page. **Index rebuild `afb470e40` SKIPPED** (existing `idx_created_at_type` covers; 857MB/572k-row table rebuild not worth it) |
| `469f93b2c` | `ebbe31553` QuantumNous | Multi-key channel: `keyIndex=-1` (missing key no longer disables index 0), `hasEnabledMultiKey` availability check, re-enable restore, evict from `group2model2channels` when all keys disabled | `model/channel.go`, `model/channel_multikey_test.go` | Red→green; eviction integration test verified effective (temporarily disabled eviction → red) |
| `46150cfba` | `128802818` QuantumNous | Truncate oversized upstream error body in debug log only (`common.LocalLogPreview`, 2048); caller-facing structured error keeps full body | `common/str.go`, `common/str_preview_test.go`, `service/error.go`, `service/error_preview_test.go` | Red→green + guard test (caller error full) |
| `2bfd325a7` | `3ec5f3555` QuantumNous | Surface upstream ratio-sync non-200 body message/error in `test_results` | `controller/ratio_sync.go`, `controller/ratio_sync_error_test.go` | Red→green (nil/message/error/empty/non-JSON) |
| `f236c85f7` | `0c7aceb83` QuantumNous | Claude Opus 4.8 support (7 variants + ratios model 2.5 / cache 0.1 / create 1.25; reasoning adaptive+strip; AWS/Vertex maps; `dto.Thinking.Display` added) | `dto/claude.go`, `relay/channel/claude/{constants,relay-claude}.go`, `relay/claude_handler.go`, `relay/channel/aws/constants.go`, `relay/channel/vertex/adaptor.go`, `setting/ratio_setting/{model_ratio,cache_ratio}.go`, `relay/channel/claude/relay_claude_opus48_test.go` | Red→green (2 upstream tests); real smoke: `claude-opus-4-8` base end-to-end 200; effort variants need channel declaration (same as 4-6-high, not a regression) |
| `655fd3d06` | `006e80165` QuantumNous | `/v1/models` `owned_by` resolved from active channels (`GetPreferredModelOwnerChannelTypes` + controller helpers); local multi-group ListModels preserved | `model/model_meta.go`, `model/model_owner_test.go`, `controller/model.go` | Red→green; real smoke: owned_by all resolved to real providers (openai/claude/google gemini/...), no `custom`, 41-model list intact |

API-compatibility / web-worker gate for this batch:

- No route/auth/status-code/pagination/DTO-field changes. Relay fixes are provider-protocol correctness only.
- `656fd3d06` (`006e80165`): `/v1/models` `owned_by` VALUES change (custom/static → real provider); field name/type unchanged (`string`). web-worker only references `owned_by` in doc markdown, no functional dependency — verified by `rg`.
- `dto.Thinking.Display` added as `omitempty`; backward compatible.

Skipped / deferred in this batch (with reason):

- Task 6 subscription-only billing fallback (`70bd759d8`): high risk, user skipped.
- Task 7b index rebuild (`afb470e40`): marginal benefit vs existing `idx_created_at_type`; manual rebuild of 857MB/572k-row `logs` table on live PG not worth it. Sort change (`230a3592f`) kept.
- `fddf54ccc` (base64 memory): user skipped; only the disk-offload half was separable.
- `56241ad9c` (log billing-source filter): cannot cherry-pick (local signatures diverged after `c39869adb`) + overlaps local subscription-consume logic. Needs manual re-implementation if wanted.
- Zeabur subscription token/request-count family (`63c9ca405`/`7aeaa15b0`/`66d8f7477`/`dfdd95323`/`c8f096977`/`61d6a10b3`/`104216643`/`105bf6bb2`/`f95e00a81`): dependency-linked, money-governing, local files heavily customized. Needs a dedicated future batch with expanded tests first; `63c9ca405` (wallet-group ratio fallback + overage cap, wholly absent locally) is the linchpin to validate first.

Schema/data-shape note: **no schema, column, index, or migration change was applied in this batch.** AutoMigrate is unaffected. No manual DDL required for any deployment.

Continuation marker for next run:

- Branch: `fishxcode`; local commit after this batch: `655fd3d06`.
- Direct upstream compared: `upstream/fishxcode` at `70bd759d8`; original upstream: `quantumnous/main` at `87cc22d7e`.
- Model package full/wide-`-run` tests still hit a pre-existing `database/sql` goroutine hang (unrelated to this batch); run exact test names for this batch's model tests.

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
