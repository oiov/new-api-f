# Daily Token Consumption Leaderboard

> Date: 2026-06-24
> Status: Draft
> Scope: Backend API + web-worker frontend page (admin-only)

## 1. Overview

A daily leaderboard page showing the top 10 users by token consumption (quota) for the current day. Admin-only initially, with the option to open to all users later.

## 2. Requirements

- Display the top 10 users ranked by daily quota consumption (descending)
- Each entry shows: username, user ID, quota consumed, request count, total tokens (prompt + completion), and most-used model
- Top 3 users displayed as a podium (1st center/tallest, 2nd left/medium, 3rd right/shortest)
- Ranks 4–10 displayed as a table with relative progress bars
- Summary cards above: total daily quota, total requests, total tokens — each with Top 10's share percentage
- Admin-only access; can be opened to regular users later by adjusting the middleware and sidebar config
- Data is queried in real-time on each page load / manual refresh (no caching, no scheduled aggregation)

## 3. Backend API

### 3.1 Endpoint

```
GET /api/log/leaderboard
```

### 3.2 Auth

```go
middleware.AdminAuth(), middleware.PermissionAuth(common.PermissionPointLogView)
```

Follows the existing pattern used by `GET /api/log/stat`.

### 3.3 Response

```json
{
  "success": true,
  "data": {
    "summary": {
      "total_quota": 569460,
      "total_tokens": 12800000,
      "total_request_count": 34521,
      "top10_quota": 387232,
      "top10_tokens": 6656000,
      "top10_request_count": 15528
    },
    "leaderboard": [
      {
        "user_id": 1024,
        "username": "alice_dev",
        "total_quota": 104680,
        "total_tokens": 2100000,
        "request_count": 8234,
        "top_model": "claude-opus-4"
      }
    ]
  }
}
```

- `leaderboard` is ordered by `total_quota` descending, max 10 entries. Always returns `[]` (empty array), never `null` — initialize the Go slice explicitly to avoid `nil` marshaling to JSON `null`.
- `total_tokens` = `prompt_tokens + completion_tokens`.
- `top_model` is the model with the highest `SUM(quota)` for that user on the current day.
- `username` is resolved from the `users` table (not from the denormalized `logs.username`).
- Quota-to-currency conversion is handled by the frontend (using existing `quotaPerUnit` from system status).
- When there are fewer than 3 users with activity today, the podium gracefully renders only the available entries (e.g., 1 user = only center card, 2 users = center + left).

### 3.4 SQL Strategy

All queries target the `logs` table where `type = 2` (consume) and `created_at >= todayStartUnix`.

**Main leaderboard query:**

```sql
SELECT user_id,
       COALESCE(SUM(quota), 0) AS total_quota,
       COALESCE(SUM(prompt_tokens + completion_tokens), 0) AS total_tokens,
       COUNT(*) AS request_count
FROM logs
WHERE type = 2 AND created_at >= ?
GROUP BY user_id
ORDER BY total_quota DESC
LIMIT 10
```

Note: Group by `user_id` only (not `username`) because `username` in logs is denormalized and may differ across rows if a user renames mid-day. The username is resolved by joining the `users` table on `user_id` after the aggregation.

**Top model per user** (for the top 10 user IDs):

```sql
SELECT user_id, model_name, SUM(quota) AS model_quota
FROM logs
WHERE type = 2 AND created_at >= ? AND user_id IN (?)
GROUP BY user_id, model_name
```

Then pick the model with the highest `model_quota` per user in Go code.

**Summary query:**

```sql
SELECT COALESCE(SUM(quota), 0), COALESCE(SUM(prompt_tokens + completion_tokens), 0), COUNT(*)
FROM logs
WHERE type = 2 AND created_at >= ?
```

Top 10 subtotals are computed from the leaderboard result in Go (sum the 10 rows).

### 3.5 Database Compatibility

- All queries use standard SQL (SUM, COUNT, GROUP BY) — compatible with SQLite, MySQL, and PostgreSQL.
- No reserved-word column issues (`user_id`, `username`, `model_name`, `quota` are all safe).
- `created_at` is a Unix timestamp (int64), compared with `>=` — no date functions needed.
- "Today start" is computed in Go using `time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).Unix()` — matching the existing pattern in `model/log.go` (`todayStart`). Do NOT use `time.Truncate(24*time.Hour)` as it truncates relative to UTC zero time, not local midnight.
- All queries must target `LOG_DB` (not `DB`), since logs may be stored in a separate database when `LOG_SQL_DSN` is configured.
- Use `COALESCE(SUM(...), 0)` to handle the case where no rows match (SUM returns NULL).
- New code must use `common.Marshal`/`common.Unmarshal` wrappers per Rule 1 — do not import `encoding/json` for marshal/unmarshal operations.
- The handler must use `common.ApiSuccess(c, data)` (not manual `gin.H` wrapping) for the response, following the newer controller pattern.

### 3.6 Files Changed (Backend)

| File | Change |
|------|--------|
| `model/log.go` | Add `GetLeaderboard()` and `GetLeaderboardTopModels()` functions, plus `LeaderboardEntry` and `LeaderboardSummary` structs. All queries use `LOG_DB`. |
| `controller/log.go` | Add `GetLeaderboard()` handler using `common.ApiSuccess()` |
| `router/api-router.go` | Add route `logRoute.GET("/leaderboard", ...)` — place in the same section as `/stat` and `/group_health` (before any `.Use()` rate-limit middleware) |

## 4. Frontend (web-worker)

### 4.1 Route

`/console/leaderboard` — file: `src/routes/console/leaderboard.tsx`

### 4.2 API Client

File: `src/api-client/leaderboard.ts`

```typescript
export function getLeaderboard(): Promise<LeaderboardResponse> {
  return apiFetch('/log/leaderboard');
}
```

Types added to `src/api-client/types.ts`:

```typescript
// source: model/log.go:GetLeaderboard
export interface LeaderboardEntry {
  user_id: number;
  username: string;
  total_quota: number;
  total_tokens: number;
  request_count: number;
  top_model: string;
}

export interface LeaderboardSummary {
  total_quota: number;
  total_tokens: number;
  total_request_count: number;
  top10_quota: number;
  top10_tokens: number;
  top10_request_count: number;
}

export interface LeaderboardResponse {
  summary: LeaderboardSummary;
  leaderboard: LeaderboardEntry[];
}
```

### 4.3 Hook

File: `src/hooks/use-leaderboard.ts`

Uses `useQuery` with key `['leaderboard']`, calls `getLeaderboard()`.

### 4.4 Components

| File | Purpose |
|------|---------|
| `src/components/leaderboard/podium.tsx` | Top 3 podium cards (gold/silver/bronze with height difference) |
| `src/components/leaderboard/leaderboard-table.tsx` | Ranks 4–10 table with progress bars |

### 4.5 Page Layout

```
DashboardLayout
├── Header: title + date badge + refresh button
├── Summary Cards (3-col grid): total quota, total requests, total tokens
├── Podium: #2 (left) — #1 (center, tallest) — #3 (right)
└── Table: ranks 4–10
```

### 4.6 Sidebar Entry

In `src/config/sidebar-config.ts`, add under the analytics/data section:

```typescript
{
  title: '天梯榜',
  url: '/console/leaderboard',
  icon: IconTrophy,
  authorizeOnly: ['admin'],
}
```

### 4.7 Visual Design

- **Podium**: 3 cards with bottom pedestals at heights 72px / 48px / 32px for 1st / 2nd / 3rd
  - #1: gold gradient border, crown emoji, gold-highlighted amount, tallest pedestal
  - #2: silver medal badge, neutral card, medium pedestal
  - #3: bronze medal badge, neutral card, shortest pedestal
- **Table rows**: relative progress bar (width = row quota / #1 quota * 100%), gray tones
- **Model badges**: colored by provider convention (purple for Claude, green for OpenAI, etc.)
- **Summary cards**: dark card with large number, small "Top 10 占比 X%" subtitle
- **Empty state**: when no data for today, show a centered message
- UI library: shadcn/ui + Tailwind + @tabler/icons-react only

### 4.8 i18n

Add keys to `en.json` and `zh.json` for: page title, column headers, summary card labels, empty state message.

## 5. Future Extensibility

- **Open to all users**: Remove `authorizeOnly` from sidebar, change middleware to `UserAuth()`, optionally anonymize usernames (show first 2 chars + `***`)
- **Date picker**: Allow viewing past days (add `?date=2026-06-23` query param, backend accepts optional `date` parameter)
- **Caching**: If performance becomes an issue, cache the result in Redis with a short TTL (e.g., 60s)

## 6. Non-Goals

- No historical trend charts (out of scope for v1)
- No per-model breakdown per user (top_model is sufficient)
- No real-time WebSocket updates
- No export/download functionality
