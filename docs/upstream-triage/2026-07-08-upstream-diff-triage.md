# Upstream Diff Triage Snapshot

Date: 2026-07-08

Repository: `/Users/songjunxi/Desktop/repos/fish-new-api`

Purpose: daily monitoring snapshot. Primary upstream tracking is `QuantumNous/new-api` branch `main` (highest priority). `dext7r/Zeabur` branch `fishxcode` is retained as secondary context only.

Prior snapshot: `docs/upstream-triage/2026-06-27-upstream-diff-triage.md`. **None of the prior backport candidates were executed** — they are carried forward below and re-verified as still absent from local.

## Execution Record (2026-07-08, branch `backport/security-batch-1`)

本轮已落地 4 个 backport(TDD + slave 实例真实验证)，均**无 DB 字段变更、不影响 web-worker 接口**：

| commit | 上游源 | 内容 |
| --- | --- | --- |
| `c18ec1b39` | `bfddc5fea` | access_token 泄露：分层修复(admin 列表/搜索/单查堵漏，GetSelf 保留) |
| `05a673e91` | `0d5995eb6` | 只读令牌鉴权拒绝已禁用令牌 |
| `80cbcc18c` | `502858d35` | Claude 空 arguments 保留 tool_use 块 |
| `f2411bfd7` | `83068d115` | pass-through 出站补 Content-Length，消除 chunked(聚焦方案，非上游一行) |

未执行的结转候选(`97eadbefa`/`d2f7f9ee3`/`b798e3496`/`933ea0cdd` 等)仍待后续批次。

### Batch 2 (branch `backport/security-batch-2`)

结转的 4 个小修复全部落地(TDD + 编译/回归验证)，均**无 DB schema 变更**：

| commit | 上游源 | 内容 |
| --- | --- | --- |
| `c75e690b9` | `933ea0cdd` | RELAY_IDLE_CONN_TIMEOUT 上游连接池空闲超时(默认 90s) |
| `41c88ae72` | `b798e3496` | AwsClaudeRequest 标量指针化(Rule 6)+ context_management |
| `c46d79151` | `97eadbefa` | 硬删除用户级联清理 OAuth 绑定(事务) |
| `5300f84f7` | `d2f7f9ee3` | 未认证关键路由请求体限制(512KB，13 路由，web-worker 无影响) |



## Current Refs

| Role | Ref | Commit | Subject |
| --- | --- | --- | --- |
| Local fork | `HEAD` (`fishxcode`) | `2c194dd7d9ec3091a908963ae7079993b01a13fc` | `feat(log): 新增活动统计接口，支持近实时活跃度数据聚合` |
| Fork remote | `origin/fishxcode` | `2c194dd7d9ec3091a908963ae7079993b01a13fc` | (same as HEAD) |
| Primary upstream | `quantumnous/main` | `6ce7305cd36f16506fb6a2c3c524a5a318539ba7` | `feat(price): add token ratios for GPT-5.6 models` |
| Secondary upstream | `upstream/fishxcode` (Zeabur) | `a6db631be68efafcbbad22981415133df0434c7f` | `feat(channel): 渠道批量编辑API地址；统计页指标/筛选可折叠与错误统计多维搜索` |

## Environment / Network Note

- `origin` is now `https://github.com/oiov/new-api-f.git`; `upstream` is `https://github.com/dext7r/Zeabur.git`. The primary-upstream remote `quantumnous` (`https://github.com/QuantumNous/new-api.git`) was re-added this run.
- Network: **Clash Verge TUN mode is on**, so direct `git fetch` works — no explicit proxy needed this time (previous run used `127.0.0.1:7897`; that port is now down, mihomo listens on `7890`, but TUN makes it moot).
- The Zeabur `upstream/fishxcode` tracking ref was dangling (`refs/remotes/upstream/HEAD` broken); repaired via `git update-ref -d` + re-fetch.

## Merge Bases (unchanged since 2026-06-27)

| Pair | Merge base |
| --- | --- |
| `HEAD` vs `quantumnous/main` | `9ae9040b3c9dab88660fb9724d182393d0137861` |
| `HEAD` vs `upstream/fishxcode` | `8aa8b81e03522f306d24134725378228e64b03ab` |
| `upstream/fishxcode` vs `quantumnous/main` | `8aa8b81e03522f306d24134725378228e64b03ab` |

## Divergence Counts

| Comparison | Left/right total | Upstream non-merge not in local | Local non-merge not in upstream |
| --- | ---: | ---: | ---: |
| `HEAD...quantumnous/main` | `522 614` | `531` | `503` |
| `HEAD...upstream/fishxcode` | `579 595` | `572` | `541` |
| `upstream/fishxcode...quantumnous/main` | `595 671` | n/a | n/a |

Diff scale:

- `HEAD..quantumnous/main`: 2295 files changed, 307402 insertions, 189916 deletions.
- `HEAD..upstream/fishxcode`: 766 files changed, 126429 insertions, 56171 deletions.

New non-merge commits since the 2026-06-27 checkpoint:

- Primary upstream `3a506f50f..quantumnous/main`: **72**.
- Secondary upstream `89aac67c0..upstream/fishxcode`: **12**.

## Product Scope Rules (unchanged)

- Primary tracking source is `QuantumNous/new-api` `main` (highest priority).
- Use `dext7r/Zeabur` `fishxcode` as secondary context only. Do not direct-merge either upstream.
- Prefer manual backports for: security, auth, billing/accounting, relay/provider protocol correctness, cache invalidation, cross-database compatibility, admin query correctness, and request DTO zero-value preservation.
- Old `web/`, `web/default`, `web/classic`, electron UI-only commits remain skip/defer unless a backend/API fix is separable and needed by local `web-worker`.
- Preserve protected project identifiers (`new-api`, `QuantumNous`) per `CLAUDE.md` Rule 5.

---

## Carry-Forward Candidates (from 2026-06-27, still NOT in local — re-verified this run)

| Commit | Area | Recommendation |
| --- | --- | --- |
| `502858d35` | Claude conversion preserves `tool_use` when tool-call arguments are empty (#5543) | ✅ **DONE** `80cbcc18c`. Backported (保持本地 `json.Unmarshal` 风格，未混入 Rule 1 整改)。 |
| `97eadbefa` | Clear OAuth bindings when hard-deleting users (#5582) | ✅ **DONE** `c46d79151`. HardDelete 事务级联删 user_oauth_bindings;无 schema 变更;含级联删除测试。 |
| `d2f7f9ee3` | Anonymous request body limit for unauthenticated critical routes (#5244) | ✅ **DONE** `5300f84f7`. AnonymousRequestBodyLimit 中间件(512KB,可关);按本地 13 个 POST 匿名路由适配(GET bind 不挂);body 重放不破坏,web-worker 无影响。 |
| `b798e3496` | AWS Bedrock Anthropic DTO context management + pointer scalars (#5547) | ✅ **DONE** `41c88ae72`. AwsClaudeRequest MaxTokens/TopP/TopK 指针化(Rule 6)+ context_management。 |
| `83068d115` | GLM Anthropic-compatible pass-through body size (avoid chunked encoding) (#5307) | ✅ **DONE** `f2411bfd7`. ⚠️ **不是上游那一行** — 依赖横跨 relay 层的 `UpstreamRequestBodySize`→`ContentLength` 机制。本地已有 `body_storage`/`ReaderOnly`，仅缺 Content-Length 传递；以聚焦方案落地(字段+`applyUpstreamContentLength`+pass-through 内部设 size)，未移植上游磁盘缓存迁移。真实 slave 实例端到端验证通过。 |
| `933ea0cdd` | Relay idle connection timeout config (#5309) | ✅ **DONE** `c75e690b9`. RELAY_IDLE_CONN_TIMEOUT(默认 90s),3 处 transport 设 IdleConnTimeout。 |
| `3a506f50f` | OpenAI Chat-to-Responses compat hardening (prior head) | Inspect/manual; broad. See companion `2d5a04163` below. |
| `32805849d` | Reuse stream scanner buffer in channel handlers | Inspect together with new `153d7f01a`. |
| `59a93cf5c` / `d2576ddcd` | OpenAI image streaming relay + image edit governance | Inspect/manual; broad file movement. |

(Larger prior items — `4aee5f7d5` authz/Casbin, ClickHouse logging family, subscription wallet overflow `f6c260437`, SMTP STARTTLS `cf6ae6fde`/`2f23a6673` — remain **defer/conditional**, unchanged.)

---

## NEW Primary Upstream Candidates (since `3a506f50f`)

### Batch A — Security / data-leak (backport now, low conflict)

| Commit | Area | Local status (verified) | Recommendation |
| --- | --- | --- | --- |
| `bfddc5fea` | `fix: omit access_token from user queries` | ✅ **DONE** `c18ec1b39`. **CONFIRMED LEAK** — local `Omit("password")` 未含 `access_token`。**分层修复**(比上游更精准)：`GetAllUsers`/`SearchUsers` 加 omit；`GetUser`(admin 查他人)controller 层置空；`GetSelf`(查自己)保留，web-worker 个人页零影响。 |
| `df087b022` | `feat(ssrf): SSRF protection in HTTP clients + validators` | **Not covered.** Local lacks `service/protected_fetch_client.go`; local `common/ssrf_protection.go` is 339 lines vs upstream 391. Touches video_proxy, mjproxy, download, webhook, user_notify. | **Backport (inspect).** High security value; 10 files, adapt to local relay/proxy paths. |
| `dfc0d6324` | `Merge commit from fork` → harden user-setting cache updates + test isolation | Not covered. Touches `model/user_cache.go`, `controller/user.go`, `model/user.go`. | **Backport (inspect).** Cache-invalidation correctness = explicit scope priority. |
| `0d5995eb6` | `fix(auth): allow read-only access for non-disabled tokens` | ✅ **DONE** `05a673e91`. `TokenAuthReadOnly` 现对 `TokenStatusDisabled` 返回 401(仅影响 `/api/usage/token`、`/api/log/token` 外部 sk-令牌自查路径；web-worker 走 session，不受影响)。 |
| `56dbaab1d` | `feat(session): opt-in Secure session cookies` (`SESSION_COOKIE_SECURE`/`_TRUSTED_URL`) | Not covered. | **Backport (inspect).** Relevant to web-worker cookie-domain strategy; medium (env + startup validation). |
| `5fc35e28a` | `fix(user): harden account email + password handling` (normalize/lowercase, uniqueness, concurrent-writer serialization, single-account reset) | Not covered; broad (`model/user.go` +255). | **Inspect/manual.** High auth value but high conflict with local user model — line-by-line. |
| `bed4a3f91` | `fix(user): trim whitespace from username + validate` | Not covered. | Backport with `5fc35e28a` (same area). |
| `4a64b8707` | `test(user): cover self-service password update guard` | Test companion to the user-hardening cluster. | Include with `5fc35e28a`/`dfc0d6324`. |

### Batch B — Billing / accounting

| Commit | Area | Local status | Recommendation |
| --- | --- | --- | --- |
| `48b7f4918` | Saturate quota sum to avoid exceeding int32 quota bound | Local `service/text_quota.go` lacks `QuotaFromDecimalChecked`/`tieredQuota` path — upstream code path differs. | **Inspect.** Concept (int32 saturation on persisted quota) is valid; may not apply cleanly. |
| `d0bd8aac7`, `c9943d37a`, `bae799ccb` | Quantity validation + saturating conversions; surface quota-saturation audit events | Not covered. | **Inspect as a cluster.** Billing hardening; evaluate against local billing paths. |
| `043720f9b` | 任务差额结算后 quota + 阿里视频时长优化 | Not covered. | Inspect/manual. Task-settlement accounting correctness. |
| `8874d1929` | Make quota logging synchronous + delay startup log | Not covered. | Inspect. Accounting reliability (avoids lost quota logs). |
| `3fbad6a72` | Default token estimate for tiered-expression pre-consume | Not covered. | Inspect with pricing work. |
| `fc1259f58` | Refactor `PriceData` other-ratios handling | Not covered. | Defer/inspect (refactor). |
| `6ce7305cd`, `2f5f6ba84` | GPT-5.6 token ratios / prepare for 5.6 | Pricing data. | Optional/low-risk; adopt if 5.6 models are offered locally. |
| `90fa6fe6b` | Wallet reward-transfer honors configured quota units (#5808) | Mostly `web/default` UI + i18n; small backend. Overlaps local wallet/org-wallet work. | **Defer.** Backend delta small; local uses web-worker UI. |
| `9b93d61b7` | Subscription admin quota reset actions (#5952) | Overlaps local subscription customization. | Defer/manual (high conflict). |

### Batch C — Relay / provider protocol correctness

| Commit | Area | Local status | Recommendation |
| --- | --- | --- | --- |
| `2d5a04163` | `feat: support Responses to Chat` (#5787) | Companion to Chat-to-Responses (`3a506f50f`). Not covered. | **Inspect/manual.** Protocol value; evaluate with `3a506f50f`. |
| `153d7f01a` | Avoid stale stream writes after client disconnect (#5710) | Not covered; reworks `relay/helper/stream_scanner.go` + `api_request.go`. | **Inspect/manual.** Relay correctness; overlaps prior `32805849d` — do together, run stream tests. |
| `0977965d9` | Handle ollama non-stream tool calls (#5865) | Not covered. | Backport (inspect). Small relay correctness. |
| `aa334c085` | Read nested usage token details (ai-elements) | Not covered. | Inspect. Usage-accounting parse correctness. |
| `4ae341756` | Codex channel field-passthrough controls (#5902) | Not covered. | Inspect if Codex channel used locally. |
| `52858ad1e` | Wan2.7 i2v media mapping (#4984) | Not covered. | Optional; provider feature. |
| `e514db20f`, `c8491b41b` | Doubao seedance-2.0 billing by output resolution + video input; safety_identifier/priority + 4k | Not covered. | Optional cluster; provider feature + billing. Adopt if seedance offered. |

### Batch D — Model / DB correctness

| Commit | Area | Local status | Recommendation |
| --- | --- | --- | --- |
| `70ea899e3` | Centralize row locking in transactional flows (`model/locking.go`) across redemption/subscription/topup/user | Not covered. | **Inspect/backport.** Cross-DB locking correctness (Rule 2); adds tests. Verify against local custom subscription/topup. |

### Batch E — Ops / infra

| Commit | Area | Recommendation |
| --- | --- | --- |
| `986d90ae0` | 支持服务优雅关闭 (graceful shutdown) (#4258) | Inspect/backport. Avoids restart reply-interruption + panel cache loss. |
| `a72e5082e` | System-info: stale instance cleanup actions (#5953) | Optional ops. |
| `45f0484dc` | Fix build date DNS error (#5945) | Low-risk build fix. |

### Skip / defer (UI, i18n, deps, build — per scope)

`fc26b88fd` group ratio editor, `394b023db` group ratio decimal draft, `2281c9e3d`/`b35dfa32e`/`c5600f9b1` channel UI, `d1abf78ec`/`becc18e30`/`8f31b3059` i18n, `86021d8ed`/`997926bbe`/`1f4d8d2b2`/`17465b855`/`2f91d8ccb`/`fda817786` web default/classic, `759ab6bbc`/`3a876d6f3`/`0565e6267`/`c1903607d` web state/routing, electron/deps bumps, `8bc4bf1d6`/`55858f353` docker/cosign, makefile renames. (`0565e6267` "only treat 401 as session expiry" is web-worker-relevant if the local auth guard shares the pattern — low priority inspect.)

---

## NEW Secondary (Zeabur) Context (since `89aac67c0`, 12 commits)

Zeabur advanced to `a6db631be`. Most new work overlaps **local's own log/stats/activity-dashboard and error-log features** — treat as parallel-idea reference, not backport source.

| Commit | Area | Recommendation |
| --- | --- | --- |
| `a6db631be` | Channel batch-edit API url; stats metrics/filters collapsible; error-stats multi-dim search | Reference only — overlaps local activity dashboard + log work. |
| `82b61f445` | Error stats time-select/pagination/dim-delete; strip upstream request id on error-log ingest | Reference — compare with local error-log-display work. |
| `815e5be30` | Log page enhancements (rename, tab routing, stats jump) | Reference — overlaps local log enhancements. |
| `4280558bb` | `/v1/models` adds `models` alias field for Codex client model refresh | **Inspect.** Small relay-compat fix; possibly worth backporting if Codex clients used. |
| `ee1b9e1ed`, `72561c057`, `bf9f02ead`, `b2d1aeda9`, `ad6d4be2c`, `63d036497`, `4c80550d5`, `db6340e69` | ClaudeMax auto-link, fishxlab/降智雷达 nav, password reset flow, docker/vercel, announcement length | Product-specific / skip. |

---

## 剩余候选优先级 (2026-07-08 排序，两批结转小修复已全部完成)

排序逻辑：安全/正确性 > 运维 > 功能；低冲突聚焦 > broad/高冲突；成对的一起做。

### P0 — 下一批优先(高价值·低冲突·聚焦)
| commit | Batch | 理由 | 成本 |
| --- | --- | --- | --- |
| `df087b022` SSRF 防护 | A | 安全高价值;本地确认缺 `protected_fetch_client.go`(339 vs 391);web-worker 无关 | 中(10 文件聚焦) |
| `dfc0d6324` 用户缓存加固 | A | 缓存失效正确性(scope 优先级);本地缺 | 小 |
| `0977965d9` ollama 非流式工具调用 | C | 中继正确性,独立聚焦 | 小 |
| `986d90ae0` 优雅关闭 | E | 运维可靠性(重启不中断答复+面板缓存不丢) | 中,独立 |

### P1 — 有价值·需 inspect 或中等冲突
| commit | Batch | 关注点 |
| --- | --- | --- |
| `32805849d` stream scanner buffer | C | ✅ **DONE** `b4210d323`(多厂商真实流式验证)。 |
| `153d7f01a` 断连处理 | C | ❌ **不做**(2026-07-08 决定)。复核发现**本地已有断连核心保护**(scanner 读循环检查 context-done 即停止读上游=不计费断连后 token;wg.Wait 5s 兜底)。上游增量仅"中断原因入日志"(运营 nice-to-have),不值 3-5 天/9 channel 高风险迁移。存档见 `2026-07-08-153d7f01a-migration-plan.md`。 |
| `70ea899e3` 集中行锁 | D | 跨库正确性;触及 redemption/subscription/topup,需对比本地自定义订阅 |
| `56dbaab1d` Secure Cookie | A | 与 web-worker cookie 域策略耦合,需协调 spec §7。**用户决定暂不做,保持现状** |

> 归类修正(2026-07-08 复核规模后):
> - `aa334c085` nested usage token → 实际是**纯前端 `web/default`**(ai-elements 组件,1 文件 2 行),本地用 web-worker **不适用,跳过**(见下 P3)。
> - `2d5a04163` + `3a506f50f` Responses↔Chat → 实际合计 **44 文件 4000+ 行**(含 web/),**降至 P2**(broad)。

### P2 — broad/高冲突/需产品决策(暂缓)
| commit(s) | Batch | 为什么缓 |
| --- | --- | --- |
| `2d5a04163` + `3a506f50f` Responses↔Chat | C | 合计 44 文件 4000+ 行(含 web/),broad,协议价值高但改动面大,需专门规划 |
| `5fc35e28a`+`bed4a3f91`+`4a64b8707` 邮箱/密码加固 | A | 价值高但 `model/user.go +255`,与本地用户模型高冲突,需逐行走查 |
| `48b7f4918`/`d0bd8aac7`/`c9943d37a`/`bae799ccb`/`043720f9b`/`8874d1929` 计费集群 | B | 需和本地 billing/wallet/组织钱包重构对齐,风险高 |
| `fc1259f58` PriceData 重构 | B | 纯重构,收益低 |

### P3 — 条件性(仅当用到对应能力) — **2026-07-08 逐项核实并处置**

> 关键事实:本地 `web/` 是**单一前端**(无 `web/default`/`web/classic` 子目录),真正 UI 在独立仓库 `web-worker/`。凡纯 `web/default`/`web/classic` 的 commit 一律不适用。

- `6ce7305cd`+`2f5f6ba84` GPT-5.6 pricing — ✅ **DONE** `d5a60b4a2`。本地已提供 gpt-5 全系(5.4/mini/nano),条件满足。补 defaultModelRatio 4 条(5.5/5.6-sol/terra/luna)+ completion 锁定逻辑对齐(base 8 locked / 5.5+ 6 unlocked)。含内联测试验证无回归,无 schema 变更。
- `aa334c085` nested usage token — ❌ **跳过**。纯 `web/default` ai-elements 组件,本地无此目录。
- `4ae341756` Codex 字段透传 — ❌ **跳过**。纯 `web/default` UI。
- `45f0484dc` build dns — ❌ **跳过**。纯 `web/classic` rsbuild 配置。
- `a72e5082e` stale instance cleanup — ❌ **跳过**。本地**无 `model/system_instance.go`** 模型,后端前提不存在;其余为 web/default UI。
- `90fa6fe6b` wallet reward — ❌ **跳过**。纯 web/default,后端零 delta。
- `9b93d61b7` subscription quota reset — ⏸️ **defer**。有后端(controller/subscription.go +86, model +129)但与本地自定义订阅高冲突,需专门走查。
- `52858ad1e` Wan2.7 i2v — ⚠️ **需产品决策**。本地 ali 有 wan2.5/2.2/2.1,**无 2.7**;仅当上架 2.7 才做。
- `e514db20f`+`c8491b41b` doubao seedance 2.0 — ⚠️ **需产品决策**。本地有 seedance 1.0/1.5,**无 2.0**;仅当上架 2.0 才做(注意本地 ali/doubao adaptor 已相对上游改过,届时需处理冲突)。

---

## Recommended Execution Order

1. **Trivial security wins first** (tiny diffs, confirmed local gaps):
   - `bfddc5fea` access_token omit (**confirmed leak, 3 lines**).
   - `0d5995eb6` read-only token auth (11 lines).
   - Carry-forward `502858d35`, `83068d115`.
2. **Security hardening (medium):** `df087b022` SSRF, `dfc0d6324` user-cache hardening, `56dbaab1d` Secure cookies, then the `5fc35e28a`+`bed4a3f91`+`4a64b8707` email/password cluster.
3. **Account/auth hygiene carry-forward:** `97eadbefa` OAuth hard-delete, `d2f7f9ee3` anonymous body limit, `b798e3496` AWS DTO.
4. **Relay/protocol inspection:** `2d5a04163` + `3a506f50f` (Responses↔Chat), `153d7f01a` + `32805849d` (stream scanner), `0977965d9` ollama tool calls.
5. **DB + ops:** `70ea899e3` row locking, `986d90ae0` graceful shutdown.
6. **Billing cluster (careful):** `48b7f4918` / `d0bd8aac7` / `c9943d37a` / `bae799ccb` / `043720f9b` / `8874d1929` — inspect against local billing before touching.

## Final Recommendation

Do not direct-merge. Do not auto-apply. The next user-approved backport branch should start with **Step 1 (trivial security wins)** — `bfddc5fea` is a confirmed access_token exposure in admin user queries and is a 3-line change.

No database schema or data-shape changes were applied during this check. If later adopting `70ea899e3` row locking, SSRF client changes, or the billing saturation cluster, re-check SQLite/MySQL/PostgreSQL behavior and document any manual migration steps.
