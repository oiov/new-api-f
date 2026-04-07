-- ============================================
-- 修复历史违规令牌分组
-- 执行前请先备份数据库！
-- ============================================

-- 方案 1: 禁用所有违规令牌（推荐，最安全）
-- 将状态设为 2（禁用），用户需要重新创建符合规则的令牌

BEGIN;

-- 禁用非订阅用户的订阅分组令牌
UPDATE tokens t
SET status = 2
FROM users u
LEFT JOIN user_subscriptions us ON u.id = us.user_id
    AND us.status = 'active'
    AND us.end_time > EXTRACT(EPOCH FROM NOW())
WHERE t.user_id = u.id
  AND t."group" IN ('claude_sub', 'codex_sub')
  AND us.id IS NULL
  AND t.status = 1;

-- 禁用订阅用户的按量分组令牌
UPDATE tokens t
SET status = 2
FROM users u
INNER JOIN user_subscriptions us ON u.id = us.user_id
    AND us.status = 'active'
    AND us.end_time > EXTRACT(EPOCH FROM NOW())
WHERE t.user_id = u.id
  AND t."group" IN ('cc-max', 'cc-kiro', 'claude', 'default', 'codex', 'aws-enterprise')
  AND t.status = 1;

-- 查看影响的令牌数量
SELECT
    '禁用的令牌总数' AS action,
    COUNT(*) AS count
FROM tokens
WHERE status = 2
  AND updated_time >= EXTRACT(EPOCH FROM NOW()) - 60;

COMMIT;


-- ============================================
-- 方案 2: 自动修正分组（风险较高，可能不符合用户预期）
-- 将违规令牌改为用户默认可用的分组
-- ============================================

-- BEGIN;

-- -- 非订阅用户的订阅分组令牌 → 改为 default
-- UPDATE tokens t
-- SET "group" = 'default'
-- FROM users u
-- LEFT JOIN user_subscriptions us ON u.id = us.user_id
--     AND us.status = 'active'
--     AND us.end_time > EXTRACT(EPOCH FROM NOW())
-- WHERE t.user_id = u.id
--   AND t."group" IN ('claude_sub', 'codex_sub')
--   AND us.id IS NULL
--   AND t.status = 1;

-- -- 订阅用户的按量分组令牌 → 改为 claude_sub 或 codex_sub（根据用户分组）
-- UPDATE tokens t
-- SET "group" = CASE
--     WHEN u."group" = 'codex_sub' THEN 'codex_sub'
--     ELSE 'claude_sub'
-- END
-- FROM users u
-- INNER JOIN user_subscriptions us ON u.id = us.user_id
--     AND us.status = 'active'
--     AND us.end_time > EXTRACT(EPOCH FROM NOW())
-- WHERE t.user_id = u.id
--   AND t."group" IN ('cc-max', 'cc-kiro', 'claude', 'default', 'codex', 'aws-enterprise')
--   AND t.status = 1;

-- COMMIT;


-- ============================================
-- 方案 3: 仅查询，不修改（用于确认影响范围）
-- ============================================

-- 查看所有违规令牌详情
SELECT
    '非订阅用户使用订阅分组' AS issue_type,
    t.id AS token_id,
    t.name AS token_name,
    u.id AS user_id,
    u.username,
    u."group" AS user_group,
    t."group" AS token_group,
    t.status,
    to_timestamp(t.created_time) AS created_at
FROM tokens t
INNER JOIN users u ON t.user_id = u.id
LEFT JOIN user_subscriptions us ON u.id = us.user_id
    AND us.status = 'active'
    AND us.end_time > EXTRACT(EPOCH FROM NOW())
WHERE t."group" IN ('claude_sub', 'codex_sub')
  AND us.id IS NULL
  AND t.status = 1

UNION ALL

SELECT
    '订阅用户使用按量分组' AS issue_type,
    t.id AS token_id,
    t.name AS token_name,
    u.id AS user_id,
    u.username,
    u."group" AS user_group,
    t."group" AS token_group,
    t.status,
    to_timestamp(t.created_time) AS created_at
FROM tokens t
INNER JOIN users u ON t.user_id = u.id
INNER JOIN user_subscriptions us ON u.id = us.user_id
    AND us.status = 'active'
    AND us.end_time > EXTRACT(EPOCH FROM NOW())
WHERE t."group" IN ('cc-max', 'cc-kiro', 'claude', 'default', 'codex', 'aws-enterprise')
  AND t.status = 1
ORDER BY issue_type, user_id, token_id;
