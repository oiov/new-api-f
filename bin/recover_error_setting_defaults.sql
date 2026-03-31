-- 反分发配置默认值恢复（PostgreSQL）

UPDATE options SET value = '["aicentos.com","*.aicentos.com","localhost","127.0.0.1","::1"]' WHERE "key" = 'error_setting.restrict_proxy_distribution_allowed_hosts';

UPDATE options SET value = '["aicentos.com","*.aicentos.com","localhost","127.0.0.1","::1"]' WHERE "key" = 'error_setting.restrict_proxy_distribution_allowed_sources';

UPDATE options SET value = '请勿使用反代等程序，请使用 https://www.aicentos.com 中转站，如需外接请联系。' WHERE "key" = 'error_setting.restrict_proxy_distribution_blocked_message';

-- 快速校验
SELECT "key", value
FROM options
WHERE "key" LIKE 'error_setting.restrict_proxy_distribution%'
ORDER BY "key";
