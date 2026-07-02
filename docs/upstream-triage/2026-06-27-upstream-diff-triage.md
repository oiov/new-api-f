# Upstream Diff Triage Snapshot

Date: 2026-06-27

Repository: `/Users/songjunxi/Desktop/repos/fish-new-api`

Purpose: daily monitoring snapshot. Primary upstream tracking is now `QuantumNous/new-api` branch `main`. `dext7r/Zeabur` branch `fishxcode` is retained as secondary context only.

## Current Refs

| Role | Ref | Commit | Subject |
| --- | --- | --- | --- |
| Local fork | `HEAD` | `eac0152b59f33a4b4d88c71c5447df2869ff6dcf` | `feat: 添加 API 登陆页面，更新直接网页访问请求的响应逻辑` |
| Fork remote | `origin/fishxcode` | `eac0152b59f33a4b4d88c71c5447df2869ff6dcf` | `feat: 添加 API 登陆页面，更新直接网页访问请求的响应逻辑` |
| Primary upstream | `quantumnous/main` | `3a506f50f08b4c11968f102972bc814e0fc9da0d` | `fix(openai): harden Chat-to-Responses compatibility (#5772)` |
| Secondary upstream | `upstream/fishxcode` | `89aac67c0888a4bcfbc14df6a165ef2fc4f598eb` | `feat: support subscription plan purchase quantity` |
| Historical mirror marker | `upstream/new-api` | `5d93351d04269d9504e5fd0a5fd32ded674ddef2` | `sync: QuantumNous/new-api@fbf235d2` |

## Network Note

Initial plain `git fetch https://github.com/QuantumNous/new-api ...` failed from this Codex process with GitHub connection errors. Local Clash Verge is running and mihomo listens on `127.0.0.1:7897`; explicit proxy commands work:

```bash
git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 fetch https://github.com/QuantumNous/new-api main:refs/remotes/quantumnous/main --prune
```

This check also found Clash Verge Rev macOS TUN/service issues upstream:

- `https://github.com/clash-verge-rev/clash-verge-rev/issues/7333`: macOS service IPC failure can prevent system proxy/TUN from enabling.
- `https://github.com/clash-verge-rev/clash-verge-rev/pull/7340`: proposed macOS IPC fix; root cause described as AppTranslocation writing unstable core paths into service desired state.
- `https://github.com/clash-verge-rev/clash-verge-rev/issues/7290`: macOS proxy/TUN unreliability with Wi-Fi plus external LAN/ethernet.
- `https://github.com/clash-verge-rev/clash-verge-rev/pull/6381`: macOS TUN DNS-loop fix proposal around `stack: mixed` and `strict-route: true`.
- `https://github.com/clash-verge-rev/clash-verge-rev/issues/7341`: DNS override writes runtime state into the signed app bundle, breaking code signature.

## Merge Bases

| Pair | Merge base |
| --- | --- |
| `HEAD` vs `quantumnous/main` | `9ae9040b3c9dab88660fb9724d182393d0137861` |
| `HEAD` vs `upstream/fishxcode` | `8aa8b81e03522f306d24134725378228e64b03ab` |
| `upstream/fishxcode` vs `quantumnous/main` | `8aa8b81e03522f306d24134725378228e64b03ab` |

`upstream/new-api` remains a historical sync wrapper and must not be treated as the real original-upstream head.

## Divergence Counts

| Comparison | Left/right total | Upstream non-merge commits not in local | Local non-merge commits not in upstream |
| --- | ---: | ---: | ---: |
| `HEAD...quantumnous/main` | `491 538` | `459` | `473` |
| `HEAD...upstream/fishxcode` | `548 583` | `560` | `511` |
| `upstream/fishxcode...quantumnous/main` | `583 595` | n/a | n/a |

Diff scale:

- `HEAD..quantumnous/main`: 2229 files changed, 290707 insertions, 184424 deletions.
- `HEAD..upstream/fishxcode`: 735 files changed, 124686 insertions, 51321 deletions.

New non-merge commits since the 2026-06-05 checkpoint:

- Primary upstream `87cc22d7e..quantumnous/main`: 149.
- Secondary upstream `70bd759d8..upstream/fishxcode`: 31.

## Product Scope Rules

- Primary tracking source is `QuantumNous/new-api` `main`.
- Use `dext7r/Zeabur` `fishxcode` as secondary context only.
- Do not direct-merge either upstream.
- Prefer manual backports for security, auth, billing/accounting, relay/provider protocol correctness, cache invalidation, cross-database compatibility, admin query correctness, and request DTO zero-value preservation.
- Old `web/`, `web/default`, and `web/classic` UI-only commits remain skip/defer candidates unless a backend/API fix is separable and needed by local `web-worker`.
- Preserve protected project identifiers and metadata per `AGENTS.md`.

## Primary Upstream Candidates

| Commit | Area | Local status | Recommendation |
| --- | --- | --- | --- |
| `3a506f50f` | OpenAI Chat-to-Responses compatibility hardening | Needs inspection. Local has Chat-to-Responses support and tests, but upstream rewrites `service/openaicompat/responses_to_chat.go`, `relay/channel/openai/chat_via_responses.go`, DTO response details, and adds broad regression coverage. | Inspect/manual backport. High protocol value, but broad enough to avoid cherry-pick. |
| `502858d35` | Claude conversion preserves `tool_use` when tool call arguments are empty | Not covered. Local `RequestOpenAI2ClaudeMessage` still skips tool calls when `json.Unmarshal` fails on empty arguments. | Backport now. Small focused relay correctness fix with test. |
| `97eadbefa` | OAuth bindings are cleared when hard-deleting users | Not covered. Local `HardDeleteUserById` and `User.HardDelete` delete only the user row; custom OAuth bindings can remain. | Backport now/manual. Small data hygiene and login correctness fix. |
| `d2f7f9ee3` | Anonymous request body limit for unauthenticated critical routes/webhooks | Not covered. Local has global decompressed body limits, but no anonymous route-specific 512 KB limit. | Backport now/manual. Security/resource protection; must adapt to local custom routes and payment callbacks. |
| `b798e3496` | AWS Bedrock Anthropic request DTO preserves context management and pointer scalar semantics | Partially not covered. Local `AwsClaudeRequest` uses non-pointer `MaxTokens`, `TopP`, `TopK` and lacks `ContextManagement`. | Backport now/manual. Important for provider compatibility and explicit zero semantics. |
| `83068d115` | Anthropic-compatible GLM avoids chunked encoding by recording pass-through upstream body size | Not covered. Local pass-through branch in `relay/claude_handler.go` does not set `info.UpstreamRequestBodySize = storage.Size()`. | Backport now. Small compatibility fix. |
| `933ea0cdd` | Relay idle connection timeout configuration | Not covered. Local HTTP client transport has no configurable `IdleConnTimeout`. | Manual backport. Low-risk ops fix; include env docs if applied. |
| `cf6ae6fde`, `2f23a6673` | SMTP STARTTLS/NTLM plus PLAIN TLS guard | Not covered. Local email path still uses direct `smtp.SendMail` for port 587 and has no STARTTLS/NTLM controls. | Inspect/manual backport if SMTP deliverability matters. Medium breadth due settings and UI fields. |
| `df44a75d5` | ClickHouse log LIKE filters | Partially not applicable. Local already has LIKE escaping for SQL-backed log filters, but ClickHouse support itself is not local baseline. | Conditional. Only relevant if adopting ClickHouse log backend. |
| `6dc4030fd`, `f84b7d591`, `f8cfbfa4d` | ClickHouse log database support and log deletion refactor | Not in current local product baseline. | Conditional/defer. Large dependency and data-layer work; requires DB compatibility review. |
| `4aee5f7d5` | Better admin permissions/Casbin-backed authorization | Partially overlapping. Local already has permission points and channel fetch root tests, but upstream adds a new `service/authz` stack and schema. | Inspect/defer. Valuable but large auth architecture change; needs explicit product decision and migration review. |
| `d10fc762f` | Async task usage log attributed to initiating node | Not covered from quick check. Local task billing log has node fields, but the upstream initiating-node propagation is absent. | Manual backport. Useful for multi-node accounting/debugging. |
| `dfcb74b52`, `fae39cd90` | Stop repeated subscription migration attempts on restart | Needs inspection. Local subscription migrations have many custom additions and should be compared line-by-line. | Inspect/manual backport; cross-DB migration safety required. |
| `f6c260437` | Subscription wallet overflow and downgrade group | Overlaps local subscription customization. | Defer/manual only. High conflict risk with local subscription billing work. |
| `59a93cf5c`, `d2576ddcd` | OpenAI image streaming relay and image edit support/governance | Partially overlapping. Local already has image edit and result caching work, but upstream adds/reshapes streaming image relay. | Inspect/manual backport. High provider-compat value, broad file movement. |
| `32805849d` | Reuse stream scanner buffer in channel handlers | Partially not covered. Local still has several channel-specific `bufio.Scanner` implementations outside `StreamScannerHandler`. | Manual backport after stream tests. Performance/memory correctness. |
| `01c2128e2` | Narrow OpenAI o-series model adaptation and zero-value tests | Partially covered. Local already has pointer zero-value tests and gpt-5/o-series logic, but exact prefix narrowing needs comparison. | Inspect. |
| `4a188deea` | Channel affinity cache clear behavior when channels are disabled | Partially overlapping. Local has extensive channel affinity support. | Inspect/manual; avoid replacing local custom distributor logic. |
| `91ab664c5` | Routing reliability management | Broad UI/settings feature. | Conditional/defer unless routing-reliability feature is desired locally. |

## Secondary Zeabur Context

Zeabur advanced from `70bd759d8` to `89aac67c0` with 31 new non-merge commits. Most new work is subscription purchase quantity, EcomAgent reseller workflow, region-aware pricing/package visibility, ClaudeMax console, and old frontend/product flows.

| Commit | Area | Local status | Recommendation |
| --- | --- | --- | --- |
| `89aac67c0` | Subscription plan purchase quantity | Not evaluated. | Secondary/defer unless local subscription UX needs quantity support. |
| `930b10883` | Force subscription plan billing to subscription only | Needs comparison with local subscription-only billing custom work. | Secondary inspect only if subscription billing edge cases surface. |
| `2901da895` | Refresh subscription payment status | Needs comparison. | Secondary inspect. |
| EcomAgent/ClaudeMax/region-aware UI family | Product-specific Zeabur work | Outside primary tracking scope. | Skip/defer. |

## Recommended Batches

1. Small relay/security fixes:
   - `502858d35` Claude empty tool arguments.
   - `83068d115` GLM Anthropic-compatible pass-through body size.
   - `b798e3496` AWS Anthropic DTO context management and pointer scalars.
   - `d2f7f9ee3` anonymous request body limits.

2. Account/auth hygiene:
   - `97eadbefa` OAuth binding cleanup on hard delete.
   - Inspect `4aee5f7d5` separately as an authz architecture decision, not part of the small hygiene batch.

3. Protocol compatibility inspection:
   - `3a506f50f` Chat-to-Responses hardening.
   - `59a93cf5c` and `d2576ddcd` OpenAI image streaming/edit governance.
   - `32805849d` stream scanner memory/performance cleanup.

4. Operations and logging:
   - `933ea0cdd` relay idle connection timeout.
   - SMTP `cf6ae6fde`/`2f23a6673` if email deliverability is active.
   - ClickHouse commits only if ClickHouse logging is in scope.

## Final Recommendation

Do not direct-merge. Do not auto-apply code changes from the daily monitor. The next user-approved backport branch should start with the small relay/security batch above, because it is high value and has the lowest conflict surface.

No database schema or data-shape changes were applied during this check. If later applying admin authz, ClickHouse logging, or subscription wallet-overflow changes, re-check SQLite/MySQL/PostgreSQL migrations and document manual migration steps.
