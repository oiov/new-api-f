# 上线人工验证清单(backport 批次 1-4)

> 日期: 2026-07-08
> 范围: `origin/fishxcode` 之后本地领先的全部 backport(batch-1~4)
> 说明: 以下按"我(自动化)能不能测到"分档。**A 档必须人工走真实流程**(涉及真实第三方/真实 Postgres 并发/真实前端/特定渠道,slave+单测覆盖不到);**B 档建议确认**(我部分验证过,线上真实负载/配置再走一遍);**C 档已充分验证,无需人工**。

---

## A 档 — 必须人工走真实流程(自动化测不到)

### A1. 支付回调 + 匿名请求体限制 `d2f7f9ee3` ⚠️ 风险最高
- **测什么**: 走一遍**真实充值**,覆盖 epay / stripe / creem / waffo 的 webhook/notify 回调;确认回调正常入账。
- **重点**: 中间件会读取并 `bytes.Reader` 重放 body。**验签类 webhook(stripe 用原始 body 验签)** 要确认签名校验没被破坏;确认回调 body < 512KB 未被误拒。
- **补充**: 故意发一个 >512KB 的匿名请求,确认返回 413。
- **为什么人工**: 真实第三方回调 + 验签,slave 模拟不了。

### A2. AWS Bedrock DTO 指针化 `b798e3496`
- **测什么**: 用**真实 AWS Bedrock Claude 渠道**发请求,分别带 `max_tokens/top_p/top_k` 为非 0 和显式 0。
- **预期**: 参数正确透传给 Bedrock;显式 0 被保留(不被 omit)、缺省被省略;`context_management` 透传。
- **为什么人工**: 无 AWS 渠道,patchToken 分组不含 Bedrock。

### A3. 行锁并发正确性 `70ea899e3`(核心账务 13 处) ⚠️
- **测什么**: 在**线上 PostgreSQL** 上并发压测同一目标:
  - 同一用户 aff 额度**并发转账** → 不超发
  - 同一 tradeNo/referenceId **并发充值回调** → 幂等,不重复入账
  - 同一兑换码**并发兑换** → 只成功一次
  - 同一佣金**并发结算** → 不重复
  - 同一 token **并发额度操作** → 一致
- **为什么人工**: 本地测试是 SQLite(测不出真行锁),SQL 生成单测只证明了"新写法产生 FOR UPDATE";真正的并发竞争要在 Postgres 上验。

### A4. access_token 泄露修复 + web-worker 个人页 `bfddc5fea`
- **测什么**:
  1. 登录 web-worker **个人页** → access_token 卡片仍能显示**自己的**系统令牌(GetSelf 保留)
  2. 管理员看**用户列表 / 搜索 / 查单个用户** → 响应 JSON **不含** `access_token`
  3. 令牌生成(`GET /api/user/token`)仍返回新令牌
- **为什么人工**: 前端交互 + 权限视图,slave 测不了前端。

### A5. OAuth 硬删除级联清绑定 `97eadbefa`
- **测什么**: 管理员**硬删除一个有 OAuth(GitHub/Discord/LinuxDO 等)绑定的用户** → 之后用**同一个 OAuth 账号能重新注册/绑定**(绑定已被清理)。
- **为什么人工**: 真实 OAuth 授权流程。

### A6. Update 不覆盖 quota `dfc0d6324 第1层`
- **测什么**: 一个用户**边跑 API 消费(或同时充值)边改个人设置**(切语言 / 改 sidebar / 改 billing preference) → 确认改设置后 quota **没有被重置**回改前的值。
- **为什么人工**: 真实并发时间窗口 + 前端操作。

---

## B 档 — 建议人工确认(我部分验证过)

### B1. SSRF 防护 `df087b022`
- **测什么**: webhook 通知 / 媒体下载 / 视频代理到**真实公网 URL** 仍正常(不误伤)。若有**合法内网出站**需求(内网 webhook/对象存储),用 `AllowPrivateIp` 或 `IpList/DomainList` 白名单放行。
- **已验证**: 单测覆盖拦截逻辑 + 5 出站点接入。**盲区**: 真实公网出站是否误伤。

### B2. 优雅关闭 `986d90ae0`
- **测什么**: 线上**部署/重启**时,确认进行中的流式请求不被中断、面板(quota_data)数据不丢。
- **已验证**: 我本地 SIGTERM 验证了优雅退出 + quota flush 无 panic。**盲区**: 真实负载 + SSE 长连接下的表现。

### B3. 只读令牌拒绝已禁用 `0d5995eb6`
- **测什么**: 用一个**已禁用的令牌**调 `/api/usage/token` 或 `/api/log/token` → 返回 401;正常令牌仍能查。
- **已验证**: 逻辑清晰,但外部 sk- 令牌行为值得快速确认。

### B4. pass-through Content-Length `f2411bfd7`(仅当配 pass-through 渠道)
- **测什么**: 配一个 **Anthropic pass-through / GLM 渠道**发请求 → 不再因 chunked encoding 报错。
- **已验证**: 我在本地**强制 pass-through** 测过(探针确认 body size 设置 + 上游 200)。**盲区**: 真实 GLM 渠道。

### B5. stream scanner 6 渠道 `32805849d`(仅当有这些渠道)
- **测什么**: cloudflare / cohere / coze / ollama / tencent / zhipu 的**流式**请求正常(尤其长响应)。
- **已验证**: 我用 claude / gemini / gpt-5.5 真实流式验证了核心 StreamScannerHandler(213/420 帧大输出正常)。**盲区**: 这 6 个具体厂商 patchToken 分组没覆盖。

---

## C 档 — 已充分验证,无需人工

- `0977965d9` ollama 非流式工具调用 — 移植单测覆盖(非流式 tool_calls 两条解析路径)
- `933ea0cdd` RELAY_IDLE_CONN_TIMEOUT — 纯配置项
- `502858d35` Claude 空 arguments 保留 tool_use — relay 单测
- `32805849d` stream scanner **核心路径** — claude/gemini/gpt-5.5 真实多厂商流式已验证

---

## 汇总:上线前必做(A 档)
1. 走真实支付回调(A1)
2. Postgres 并发压测账务(A3)
3. web-worker 个人页 + 管理员用户视图看 access_token(A4)
4. 硬删带 OAuth 绑定用户(A5)
5. 边消费边改设置看 quota(A6)
6. 有 AWS Bedrock 渠道则测参数透传(A2)
