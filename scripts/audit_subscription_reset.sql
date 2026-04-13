\set ON_ERROR_STOP on

-- PostgreSQL only.
-- Required psql vars:
--   audit_date   : target business date, format YYYY-MM-DD
-- Optional psql vars:
--   reset_tz     : business timezone, default Asia/Shanghai

\if :{?reset_tz}
\else
\set reset_tz 'Asia/Shanghai'
\endif

\echo === Subscription Reset Audit ===
\echo audit_date=:audit_date
\echo reset_tz=:reset_tz

WITH params AS (
  SELECT
    :'audit_date'::date AS audit_date,
    :'reset_tz'::text AS reset_tz,
    extract(epoch FROM now())::bigint AS now_unix
)
SELECT
  p.audit_date,
  p.reset_tz,
  p.now_unix,
  to_char(to_timestamp(p.now_unix) AT TIME ZONE p.reset_tz, 'YYYY-MM-DD HH24:MI:SS') AS now_in_tz
FROM params p;

\echo
\echo --- A. 当前已到重置点但仍未处理的活跃订阅 ---
WITH params AS (
  SELECT extract(epoch FROM now())::bigint AS now_unix
)
SELECT count(*) AS due_not_reset
FROM user_subscriptions s, params p
WHERE s.status = 'active'
  AND s.end_time > p.now_unix
  AND s.next_reset_time > 0
  AND s.next_reset_time <= p.now_unix;

\echo
\echo --- B. 今天业务日已重置的活跃订阅分布 ---
WITH params AS (
  SELECT
    :'audit_date'::date AS audit_date,
    :'reset_tz'::text AS reset_tz,
    extract(epoch FROM now())::bigint AS now_unix
)
SELECT
  s.reset_period,
  count(*) AS total_count,
  count(*) FILTER (
    WHERE to_char(to_timestamp(s.last_reset_time) AT TIME ZONE p.reset_tz, 'YYYY-MM-DD') = p.audit_date::text
  ) AS reset_on_audit_date,
  count(*) FILTER (
    WHERE s.next_reset_time = 0
  ) AS next_reset_is_zero
FROM user_subscriptions s, params p
WHERE s.status = 'active'
  AND s.end_time > p.now_unix
GROUP BY s.reset_period
ORDER BY s.reset_period;

\echo
\echo --- C. 日重置订阅中，今天仍未落到审计日期的活跃订阅 ---
WITH params AS (
  SELECT
    :'audit_date'::date AS audit_date,
    :'reset_tz'::text AS reset_tz,
    extract(epoch FROM now())::bigint AS now_unix
)
SELECT
  s.id,
  s.user_id,
  s.plan_id,
  s.status,
  s.resource_type,
  s.reset_period,
  s.request_count_total,
  s.request_count_used,
  s.amount_total,
  s.amount_used,
  to_char(to_timestamp(s.start_time) AT TIME ZONE p.reset_tz, 'YYYY-MM-DD HH24:MI:SS') AS start_at,
  to_char(to_timestamp(s.end_time) AT TIME ZONE p.reset_tz, 'YYYY-MM-DD HH24:MI:SS') AS end_at,
  to_char(to_timestamp(s.last_reset_time) AT TIME ZONE p.reset_tz, 'YYYY-MM-DD HH24:MI:SS') AS last_reset_at,
  to_char(to_timestamp(s.next_reset_time) AT TIME ZONE p.reset_tz, 'YYYY-MM-DD HH24:MI:SS') AS next_reset_at
FROM user_subscriptions s, params p
WHERE s.status = 'active'
  AND s.end_time > p.now_unix
  AND s.reset_period = 'daily'
  AND (
    s.last_reset_time <= 0
    OR to_char(to_timestamp(s.last_reset_time) AT TIME ZONE p.reset_tz, 'YYYY-MM-DD') <> p.audit_date::text
  )
ORDER BY s.end_time ASC, s.id ASC;

\echo
\echo --- D. 今天已重置但 next_reset_time = 0 的活跃订阅（通常是最后一个周期） ---
WITH params AS (
  SELECT
    :'audit_date'::date AS audit_date,
    :'reset_tz'::text AS reset_tz,
    extract(epoch FROM now())::bigint AS now_unix
)
SELECT
  s.id,
  s.user_id,
  s.plan_id,
  p.title AS plan_title,
  s.resource_type,
  s.reset_period,
  s.request_count_total,
  s.request_count_used,
  s.amount_total,
  s.amount_used,
  to_char(to_timestamp(s.last_reset_time) AT TIME ZONE pa.reset_tz, 'YYYY-MM-DD HH24:MI:SS') AS last_reset_at,
  to_char(to_timestamp(s.end_time) AT TIME ZONE pa.reset_tz, 'YYYY-MM-DD HH24:MI:SS') AS end_at
FROM user_subscriptions s
LEFT JOIN subscription_plans p ON p.id = s.plan_id,
params pa
WHERE s.status = 'active'
  AND s.end_time > pa.now_unix
  AND s.reset_period IN ('daily', 'weekly', 'monthly', 'custom')
  AND s.next_reset_time = 0
  AND to_char(to_timestamp(s.last_reset_time) AT TIME ZONE pa.reset_tz, 'YYYY-MM-DD') = pa.audit_date::text
ORDER BY s.end_time ASC, s.id ASC;

\echo
\echo --- E. 今天会到期的活跃周期订阅 ---
WITH params AS (
  SELECT
    :'audit_date'::date AS audit_date,
    :'reset_tz'::text AS reset_tz,
    extract(epoch FROM now())::bigint AS now_unix
)
SELECT
  s.id,
  s.user_id,
  s.plan_id,
  p.title AS plan_title,
  s.resource_type,
  s.reset_period,
  to_char(to_timestamp(s.last_reset_time) AT TIME ZONE pa.reset_tz, 'YYYY-MM-DD HH24:MI:SS') AS last_reset_at,
  to_char(to_timestamp(s.next_reset_time) AT TIME ZONE pa.reset_tz, 'YYYY-MM-DD HH24:MI:SS') AS next_reset_at,
  to_char(to_timestamp(s.end_time) AT TIME ZONE pa.reset_tz, 'YYYY-MM-DD HH24:MI:SS') AS end_at
FROM user_subscriptions s
LEFT JOIN subscription_plans p ON p.id = s.plan_id,
params pa
WHERE s.status = 'active'
  AND s.end_time > pa.now_unix
  AND s.reset_period IN ('daily', 'weekly', 'monthly', 'custom')
  AND to_char(to_timestamp(s.end_time) AT TIME ZONE pa.reset_tz, 'YYYY-MM-DD') = pa.audit_date::text
ORDER BY s.end_time ASC, s.id ASC;
