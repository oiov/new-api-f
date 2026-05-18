---
name: upstream-diff-triage
description: Use when comparing a fork against one or more upstream branches to decide which upstream commits should be merged, backported, skipped, or deferred.
---

# Upstream Diff Triage

Use this skill when a repository has diverged from direct upstreams and the goal is selective backporting rather than a broad merge.

## Core Rule

Write findings to a repo file before deep analysis. Update that file incrementally as each candidate batch is evaluated. Do not rely on chat context for branch heads, merge baselines, commit decisions, or conflict notes.

## Triage File

Create or update a dated file such as:

```text
docs/upstream-triage/YYYY-MM-DD-upstream-diff-triage.md
```

The file must contain:

- Current local branch and commit.
- Every upstream ref compared, with URL/remote, branch, commit, and commit subject.
- Last known local merge/sync point from each upstream.
- Merge bases between local and each upstream.
- Whether the upstream sync refs are ancestors of local.
- Counts of commits ahead/behind by ancestry.
- Product scope rules that decide what is in or out.
- Candidate commits grouped by priority and subsystem.
- Status per candidate: applied, not applied, partially applied, needs inspection, skip.
- Conflict notes against local custom features.
- Suggested backport batches and required verification.

When the user adds a tracking requirement, add it to the file immediately.

## Baseline Commands

Prefer these commands and paste the important results into the triage file:

```bash
git status --short --branch
git remote -v
git branch -vv --all
git fetch <upstream> --prune
git fetch <original-url> <branch>:refs/remotes/<name>/<branch>
git rev-parse HEAD <upstream-ref> <original-ref>
git log --merges --oneline --grep='<upstream branch or remote name>' -n 20
git merge-base HEAD <upstream-ref>
git merge-base HEAD <original-ref>
git merge-base <upstream-ref> <original-ref>
git log --oneline <upstream-ref> ^HEAD --no-merges | wc -l
git log --oneline HEAD ^<upstream-ref> --no-merges | wc -l
git log --oneline --left-right --cherry-pick HEAD...<upstream-ref> -n 200
```

If the upstream itself mirrors another upstream, record both the mirror sync commit and the real original upstream head. Do not treat the mirror sync as equivalent to the original head unless ancestry proves it.

## Candidate Discovery

Start broad, then inspect only likely high-value areas:

```bash
git log --all --oneline --grep='security\|SSRF\|auth\|token\|payment\|billing\|cache\|migration\|postgres\|stream\|OpenAI\|Claude\|Gemini\|usage\|filter'
git log --oneline <upstream-ref> -- controller service model relay dto common setting middleware
rg -n '<local symbol or behavior>' controller service model relay dto common setting middleware
git show --stat --oneline --decorate <commit...>
git show --name-only --oneline <commit...>
```

Prioritize commits that affect:

- Authentication, token validation, access control, passkeys, sessions.
- Payment callbacks, provider/method guards, quota or subscription settlement.
- SSRF, URL fetches, webhooks, user-supplied remote resources.
- Relay/provider protocol compatibility and request DTO zero-value preservation.
- Billing, pricing, token accounting, and stream usage.
- Cache invalidation and disabled/deleted user behavior.
- Cross-database migrations and raw SQL compatibility.
- Admin query correctness for logs, channels, filters, and pagination.

Usually skip:

- Product-specific DIY features from upstream that do not fit the local fork.
- UI-only changes for an inactive frontend.
- Large frontend migrations unless they expose backend/API fixes needed locally.
- Branding, README, metadata, or license churn unless explicitly required and allowed by project policy.
- Dependency bumps for unshipped packages unless they fix a relevant vulnerability.

## Classification

Use these labels consistently:

- `Backport now`: high-risk bug/security/accounting/protocol fix.
- `Manual backport`: valuable but conflicts with local code or touches broad files.
- `Inspect`: likely relevant, but local coverage is unknown.
- `Conditional`: useful only if the local deployment uses that feature/provider.
- `Skip`: out of product scope or UI-only for inactive surfaces.
- `Already covered`: local code already implements equivalent behavior.

Never call a commit "already covered" from its title alone. Verify with `rg`, local file reads, or tests.

## Conflict Review

Before recommending a merge/backport, check:

- Local custom commits in the same files.
- Untracked or dirty worktree files.
- Project-specific frontend direction.
- Protected project identifiers and policy constraints.
- Database support requirements across SQLite, MySQL, and PostgreSQL.
- JSON wrapper rules if Go code marshals or unmarshals.
- Optional scalar DTO semantics: absent vs explicit zero/false.

For diverged repos, recommend manual backport batches over direct branch merges unless the diff is small and product-compatible.

## Output Shape

In the final answer, lead with the decision:

- Whether to direct-merge, cherry-pick, or manually backport.
- The highest-priority batches.
- Which commits to skip and why.
- Where the triage file was written.
- What still needs inspection.

Keep commit lists actionable: include hash, subsystem, local status, and recommended action.

