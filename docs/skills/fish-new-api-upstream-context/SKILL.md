---
name: fish-new-api-upstream-context
description: Use when working in the fish-new-api repository on upstream comparison, selective backports, merge decisions, or context recovery after chat compression.
---

# fish-new-api Upstream Context

This skill is the project memory for `/Users/songjunxi/Desktop/repos/fish-new-api`.

## Fixed Upstream Map

- Local fork: `origin/fishxcode`
- Direct upstream: `https://github.com/dext7r/Zeabur.git`, branch `fishxcode`
- Original upstream: `https://github.com/QuantumNous/new-api`, branch `main`
- Historical mirror sync ref: `upstream/new-api` only records Zeabur's sync point and is not the real upstream head

## Active Triage File

- Current written upstream diff baseline: `docs/upstream-triage/2026-05-18-upstream-diff-triage.md`
- Always read this file first after context compression or before selective upstream backports.
- If a newer dated file exists under `docs/upstream-triage/`, read the newest file and update this pointer.

If the user does not specify otherwise, use these refs without asking again.

## Product Scope

- Primary user-facing work is the new `web-worker` frontend.
- Old `web/` or `web/default` UI-only changes are usually skip candidates unless they expose a backend/API bugfix needed by `web-worker`.
- Prefer backporting backend correctness and safety fixes:
  - auth and access control
  - token/cache invalidation
  - payment/provider guards
  - SSRF and remote fetch safety
  - relay/provider protocol compatibility
  - billing, quota, and stream usage correctness
  - cross-database migration compatibility
  - log, channel, and admin query correctness

## Required Workflow

1. Read the latest dated triage file under `docs/upstream-triage/` before making any judgment. Use the newest `YYYY-MM-DD-upstream-diff-triage.md` file if multiple exist.
2. If no triage file exists, create one at `docs/upstream-triage/YYYY-MM-DD-upstream-diff-triage.md`.
2. Record the last known local merge point from each upstream.
3. Treat direct merge as the exception; prefer manual backport batches.
4. Keep notes on which upstream commits are already covered, partially covered, or blocked by local custom work.
5. Update the same triage file incrementally as new candidates are reviewed.

## Required Triage File Fields

At minimum, the file should include:

- local branch and commit
- direct upstream head
- original upstream head
- historical mirror sync ref if present
- last local merge from Zeabur
- merge-base against each upstream
- ahead/behind counts
- candidate commit list with action labels
- conflict notes against local `web-worker` work
- final recommendation: direct merge, cherry-pick, manual backport, skip

## Local Reminder

Do not rely on chat context for upstream addresses in this repository. Use the fixed map above and the triage file instead.
If the user asks for a reuse point, point them to the triage file location first:
`docs/upstream-triage/YYYY-MM-DD-upstream-diff-triage.md` or the latest file in that directory.
