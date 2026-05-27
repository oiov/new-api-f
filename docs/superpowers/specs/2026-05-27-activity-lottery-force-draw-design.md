# Activity Lottery Force Draw Design

## Goal

Allow admins to manually force an activity lottery draw from the old web admin page even when the configured participant target has not been reached and the activity end time has not arrived.

## Scope

- Add an explicit force mode to the existing admin draw API.
- Keep automatic draw behavior unchanged.
- Keep normal manual draw behavior unchanged unless the admin explicitly chooses force mode.
- Update the old `web/` admin page at `/console/checkin-admin`, in the "活动抽奖" tab.

## Backend Design

The existing admin draw endpoint remains:

```http
POST /api/activity/lottery/admin/rounds/:id/draw
```

The endpoint accepts an optional JSON body:

```json
{ "force": true }
```

When `force` is absent or false, the model uses the existing checks:

- round status must be `open` or `draft`
- qualified participant count must meet `min_participants`
- current time must be at or after `end_at`
- at least one qualified participant must exist

When `force` is true, the draw skips only these checks:

- `min_participants`
- `end_at`

Force mode still requires an eligible round status and at least one qualified participant. If the round is already drawn, the draw remains idempotent and returns existing winners.

## Frontend Design

In the activity lottery admin table:

- Keep the existing "开奖" button as the normal draw action.
- Add a "强制开奖" danger action.
- The confirmation modal must clearly state that force draw ignores the participant target and activity end time, then draws from the current qualified participant list immediately.

## Testing

Add model tests that use an in-memory SQLite database:

- Normal draw fails when participant count is below the target and time has not reached the end.
- Force draw succeeds under the same conditions, creates winners and notifications, and marks the round as `drawn`.

Automatic draw continues to call normal draw mode, so it still requires both time and count conditions.
