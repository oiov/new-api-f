# Async Task Log Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/console/tasks` page in `web-worker` that shows async task logs for the current user, or all async task logs when the current user is a super admin.

**Architecture:** Follow the existing `/console/log` page pattern. Add a typed task API client and query hooks, a dedicated task table component with role-aware filters, and a new file-route under the authenticated console shell. Reuse existing backend task list APIs and route-search driven filters.

**Tech Stack:** React 19, TanStack Router, TanStack Query, TypeScript, i18next, Vite

---

### Task 1: Add task API types and client

**Files:**
- Create: `web-worker/src/api-client/tasks.ts`
- Modify: `web-worker/src/api-client/types.ts`
- Test: `web-worker` build

- [ ] **Step 1: Add typed async-task query and item interfaces**

Add `TaskItem`, `TaskListQuery`, and `AdminTaskListQuery` to `web-worker/src/api-client/types.ts`, matching backend `dto.TaskDto` and `controller/task.go` query params.

- [ ] **Step 2: Add task list client functions**

Create `web-worker/src/api-client/tasks.ts` with:
- a local `withSearch()` helper
- `listUserTasks(query)` -> `GET /task/self`
- `listAllTasks(query)` -> `GET /task/`

- [ ] **Step 3: Verify types compile**

Run: `pnpm build`
Expected: task API client types compile with no missing imports

### Task 2: Add task query hooks

**Files:**
- Create: `web-worker/src/hooks/use-tasks.ts`
- Test: `web-worker` build

- [ ] **Step 1: Add role-agnostic task hooks**

Create:
- `useUserTasks(query, enabled)`
- `useAllTasks(query, enabled)`

Use the same query behavior as `use-logs.ts`:
- stable query keys
- `placeholderData: (previousData) => previousData`
- `staleTime: 10_000`

- [ ] **Step 2: Verify hooks compile**

Run: `pnpm build`
Expected: hooks compile and resolve the new client/types

### Task 3: Add i18n strings and navigation entry

**Files:**
- Modify: `web-worker/src/i18n/index.ts`
- Modify: `web-worker/src/i18n/locales/en/console.json`
- Modify: `web-worker/src/i18n/locales/zh/console.json`
- Create: `web-worker/src/i18n/locales/en/task.json`
- Create: `web-worker/src/i18n/locales/zh/task.json`
- Modify: `web-worker/src/config/sidebar-config.ts`
- Test: `web-worker` build

- [ ] **Step 1: Add task namespace resources**

Register `task` in `web-worker/src/i18n/index.ts` for both `en` and `zh`.

- [ ] **Step 2: Add page and sidebar labels**

Add console breadcrumb/sidebar/page-title keys for async tasks if any are missing.

- [ ] **Step 3: Add task table/filter/status strings**

Create `task.json` in both languages with:
- filter labels
- admin-only labels
- status labels
- table headers
- empty/error states
- copy/open-result text

- [ ] **Step 4: Add sidebar link**

Insert `/console/tasks` into `web-worker/src/config/sidebar-config.ts` beside usage logs.

- [ ] **Step 5: Verify i18n compiles**

Run: `pnpm build`
Expected: no missing locale import or resource-name error

### Task 4: Add `/console/tasks` route and table UI

**Files:**
- Create: `web-worker/src/routes/console/tasks.tsx`
- Create: `web-worker/src/components/task/task-table.tsx`
- Modify: `web-worker/src/routeTree.gen.ts` (if generator updates checked-in file)
- Test: `web-worker` build

- [ ] **Step 1: Add route search schema**

Create a file route with search params:
- `p`
- `page_size`
- `task_id`
- `status`
- `action`
- `platform`
- `start_timestamp`
- `end_timestamp`
- `username`
- `channel_id`

Default pagination should match the console log page.

- [ ] **Step 2: Add dashboard shell for async tasks**

Use `DashboardLayout` with:
- console breadcrumb
- async-task breadcrumb
- title/description from `console`
- refresh button
- filter toggle button

- [ ] **Step 3: Add role-aware table component**

In `web-worker/src/components/task/task-table.tsx`:
- load `me`
- switch between `useUserTasks()` and `useAllTasks()` based on `me.role === 100`
- keep filters in route search
- render loading, empty, and error states

- [ ] **Step 4: Add table rendering**

Render columns:
- submit time
- finish time
- duration
- task id with copy action
- platform
- action
- status badge
- progress
- result link
- fail reason
- plus `username` and `channel_id` for super admins

- [ ] **Step 5: Add safe progress and duration formatting**

Support percent strings like `50%` with a progress bar; fallback to raw text for non-percent values. Render duration only when both timestamps exist.

- [ ] **Step 6: Verify route registration**

Run: `pnpm build`
Expected: route compiles and route tree is up to date

### Task 5: Verify behavior and stage changes

**Files:**
- Modify: staged files from Tasks 1-4
- Test: `web-worker` build

- [ ] **Step 1: Run final frontend verification**

Run: `pnpm build`
Expected: successful production build for `web-worker`

- [ ] **Step 2: Review changed files**

Check:
- route and sidebar entry exist
- normal users query `/api/task/self`
- super admins query `/api/task/`
- filters live in URL
- result link opens safely

- [ ] **Step 3: Stage only intended files**

Run:

```bash
git add docs/superpowers/plans/2026-04-24-async-task-log-page.md
git add docs/superpowers/specs/2026-04-24-async-task-log-page-design.md
```

And inside `web-worker/` stage only the new task-page files plus any generated route/i18n/sidebar updates.
