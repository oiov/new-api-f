# Async Task Log Page Design

## Summary

Add a dedicated `/console/tasks` page in `web-worker` so users can inspect async generation tasks without relying on `/playground` polling alone.

The page will reuse the current console page pattern and existing backend task APIs:

- normal users load `GET /api/task/self`
- super admins (`role === 100`) load `GET /api/task/`

This scope is intentionally limited to list, filter, refresh, and result-link access. No new backend API, database change, task detail drawer, or embedded media preview is included.

## Goals

- Give users a stable place to inspect async task status after submission.
- Let super admins inspect all async task logs from the new console.
- Reuse existing `TaskDto` and pagination contracts without backend changes.
- Keep query state in the URL so refresh, pagination, and link sharing preserve filters.

## Non-Goals

- No new database tables or schema changes.
- No new backend route or DTO changes.
- No auto-polling on the page.
- No task detail drawer.
- No inline video/audio preview.
- No `/playground` to `/console/tasks` deep-linking in this iteration.

## Route And Navigation

- Add a new console route: `/console/tasks`
- Add a sidebar item beside the existing console log entry.
- Keep it under the authenticated console shell used by other `/console/*` pages.

## Data Flow

1. The page reads the current route search parameters.
2. The page loads `me` with the existing auth hook.
3. If `me.role === 100`, it queries `/api/task/`; otherwise it queries `/api/task/self`.
4. The response is rendered directly from existing paginated `TaskDto` items.
5. Refresh invalidates task queries and reloads the current filter state.

## Search Parameters

Common:

- `p`
- `page_size`
- `task_id`
- `status`
- `action`
- `platform`
- `start_timestamp`
- `end_timestamp`

Super-admin only:

- `username`
- `channel_id`

All filters are optional. The page should default to page 1 and a sensible default page size aligned with the existing console log page.

## Page Layout

The page should mirror the current `/console/log` structure:

- dashboard layout with breadcrumb, title, description
- top-right actions: refresh and filter toggle
- filter panel under the stat/header area
- main table area
- pagination footer

This keeps the page visually and behaviorally aligned with the current console.

## Table Columns

Base columns for all users:

- `submit_time`
- `finish_time`
- derived `duration`
- `task_id`
- `platform`
- `action`
- `status`
- `progress`
- `result_url`
- `fail_reason`

Extra columns for super admins:

- `username`
- `channel_id`

## Column Behavior

### `submit_time` and `finish_time`

Render as formatted local timestamps. Empty values render as `-`.

### `duration`

If both `submit_time` and `finish_time` exist, render the elapsed seconds. Otherwise render `-`.

### `task_id`

Render the task id with a copy action.

### `platform`

Render the raw platform value from the backend for this iteration.

### `action`

Render the raw action value from the backend for this iteration.

### `status`

Render as colored status badges. Supported values:

- `NOT_START`
- `SUBMITTED`
- `QUEUED`
- `IN_PROGRESS`
- `SUCCESS`
- `FAILURE`
- `UNKNOWN`

Unknown or empty values should degrade safely instead of breaking the table.

### `progress`

If the value is parseable as a percent string such as `50%`, render a progress bar plus numeric text. Otherwise render the raw value or `-`.

### `result_url`

If present, render an external-link action that opens in a new tab. If missing, render `-`.

### `fail_reason`

Render truncated text in the table with a tooltip or full-text affordance for long messages.

## Filters

Base filters:

- task id text input
- status select
- action text input
- platform text input
- date-time range

Super-admin only:

- username text input
- channel id text input

The first version should stay close to the console log page interaction model:

- editing inputs does not immediately request
- clicking apply updates route search and resets to page 1
- reset clears filters and preserves page-size defaults

## Error Handling

- While fetching, keep previous data visible where possible and show loading state.
- On request failure, show the existing console-friendly error state/message pattern.
- Auth expiry should keep using the existing `apiFetch` redirect behavior.
- Empty `result_url`, missing `finish_time`, or non-percent `progress` must render safely.

## Frontend Files To Add Or Modify

Likely new files:

- `web-worker/src/routes/console/tasks.tsx`
- `web-worker/src/components/task/task-table.tsx`
- `web-worker/src/api-client/tasks.ts`
- `web-worker/src/hooks/use-tasks.ts`

Likely modified files:

- `web-worker/src/config/sidebar-config.ts`
- `web-worker/src/api-client/types.ts`
- `web-worker/src/messages/zh.ts`
- `web-worker/src/messages/en.ts`

Exact file grouping may shift slightly during implementation, but the page should remain isolated from unrelated console pages.

## Validation Plan

### Automated

- Build `web-worker` to confirm route registration, query types, and i18n references are valid.
- Add focused frontend tests only if the surrounding test setup already supports the touched units cleanly.

### Manual

- Verify a normal user only requests `/api/task/self`.
- Verify a super admin requests `/api/task/`.
- Verify filter changes update the URL and reload results.
- Verify pagination preserves filters.
- Verify result links open correctly.
- Verify empty states and request failures remain usable.

## Risks And Mitigations

- Backend task fields vary by upstream provider.
  Mitigation: render platform/action raw in v1 and avoid overfitting provider-specific labels.

- `progress` values may be inconsistent.
  Mitigation: parse percentage when possible, otherwise render raw text.

- Admin and non-admin behavior can diverge.
  Mitigation: mirror the existing `/console/log` role-switching pattern based on `me.role`.
