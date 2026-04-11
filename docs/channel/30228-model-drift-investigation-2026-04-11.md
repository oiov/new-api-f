# 30228 通道模型漂移排查结论

## 背景

用户反馈请求 `request_id = 20260411073138948206537U4yNpAQP` 的实际模型表现异常，怀疑 `claude-sonnet-4-6` 实际被转发成了其他模型。

本次排查目标：

- 确认该请求的入口模型、上游模型记录、通道配置是否一致
- 判断 `30228` 通道是否存在稳定或间歇性模型漂移
- 给出可执行的处置建议

## 结论摘要

结论如下：

1. `30228` 通道并非稳定返回单一模型，存在实际模型不一致的问题。
2. 历史日志中，多次记录到 `upstream_model_name = gpt-5.3-codex`。
3. 同时，实时复现请求又返回了 `claude-opus-4-6`。
4. 因此，这不是单纯的本地模型映射错误，更像是上游服务或上游代理池存在间歇性模型漂移。

## 关键对象

- 通道 ID：`30228`
- 通道名称：`Claude Lite #1`
- 通道类型：`14`（Anthropic）
- 通道分组：`sub_plan_claude_lite`
- 通道标签：`subscription_plan:19`
- 通道 base URL：`https://api.***.***`

## 本地配置核对

数据库中 `30228` 的 `model_mapping` 为：

```json
{
  "claude-haiku-4-5-20251001": "claude-opus-4-6",
  "claude-opus-4-5-20251101": "claude-opus-4-6",
  "claude-sonnet-4-5-20250929": "claude-opus-4-6",
  "claude-sonnet-4.6": "claude-opus-4-6",
  "claude-sonnet-4-6": "claude-opus-4-6"
}
```

可以确定：

- 本地显式模型映射只会把 `claude-*` 系列映射到 `claude-opus-4-6`
- 本地数据库配置里没有任何 `-> gpt-5.3-codex` 的映射规则

## 历史请求证据

目标请求：

- `request_id = 20260411073138948206537U4yNpAQP`

日志记录结果：

- `model_name = claude-sonnet-4-6`
- `other.upstream_model_name = gpt-5.3-codex`
- `request_path = /v1/messages`
- `is_model_mapped = true`
- `key_index = 2`

这说明：

- 客户端入口模型是 `claude-sonnet-4-6`
- new-api 最终记录的上游模型名是 `gpt-5.3-codex`

## 代码证据

Claude 链路中，`upstream_model_name` 的记录来源为 `relayInfo.UpstreamModelName`。

相关代码：

- [relay/helper/model_mapped.go](/Users/admin/Developer/fishxcode/new-api/relay/helper/model_mapped.go)
- [relay/channel/claude/relay-claude.go](/Users/admin/Developer/fishxcode/new-api/relay/channel/claude/relay-claude.go)
- [service/log_info_generate.go](/Users/admin/Developer/fishxcode/new-api/service/log_info_generate.go)

关键逻辑：

1. 本地模型映射阶段：
   - `claude-sonnet-4-6` 最多被映射到 `claude-opus-4-6`
2. Claude 流式响应阶段：
   - 在 `message_start` 事件里，如果上游响应带有 `message.model`
   - 代码会执行 `info.UpstreamModelName = claudeResponse.Message.Model`
3. 记录日志阶段：
   - `other["upstream_model_name"] = relayInfo.UpstreamModelName`

因此，若日志中出现 `upstream_model_name = gpt-5.3-codex`，最合理解释是：

- 上游返回的 `message.model` 为 `gpt-5.3-codex`

但这条结论必须结合实时复现结果一起看，不能单独当作“当前稳定行为”。

## 实时复现结果

使用 `mu` 的 `Subscription Access`，对 `https://fishxcode.com/v1/messages` 发起真实请求：

- 请求模型：`claude-sonnet-4-6`
- 返回内容：`ok`

本次实时复现返回给客户端的模型为：

- `model = claude-opus-4-6`

对应请求：

- `x-oneapi-request-id = 20260411074301525341131SXJFUfUi`

对应日志：

- `model_name = claude-sonnet-4-6`
- `upstream_model_name = claude-opus-4-6`
- `request_path = /v1/messages`
- `key_index = 2`

说明：

- 当前同样的请求，并未复现成 `gpt-5.3-codex`
- 当前通道返回的是 `claude-opus-4-6`

## 近 24 小时统计

对 `channel_id = 30228` 的最近 24 小时日志聚合后，`upstream_model_name` 分布如下：

- 空值：`1226`
- `gpt-5.3-codex`：`62`
- `claude-opus-4-6`：`1`

这说明：

- `gpt-5.3-codex` 不是单次孤立事件
- 但该通道也并非始终返回 `gpt-5.3-codex`
- 同一通道确实存在不一致返回

## 样本片段

同一用户 `mu`、同一通道 `30228`、同一 `key_index = 2`，在短时间内出现：

- `2026-04-11 07:31:55` `claude-sonnet-4-6 -> gpt-5.3-codex`
- `2026-04-11 07:31:37` `claude-sonnet-4-6 -> gpt-5.3-codex`
- `2026-04-11 07:28:18` `claude-sonnet-4-6 -> gpt-5.3-codex`
- `2026-04-11 07:24:38` `claude-haiku-4-5-20251001 -> gpt-5.3-codex`
- `2026-04-11 07:43:03` `claude-sonnet-4-6 -> claude-opus-4-6`

说明问题并不局限于某个单一入口模型，且行为不稳定。

## 研判

目前更符合事实的判断是：

1. 不是本地 `model_mapping` 单纯写错。
2. 不是单条日志脏数据。
3. `30228` 对应的上游服务 `https://api.***.***` 很可能存在：
   - 混合模型池
   - 上游代理层动态改写
   - 不同时间/不同后端返回不同模型名

## 风险

该通道继续使用会带来以下风险：

- 用户选择的模型与实际执行模型不一致
- 套餐能力说明与真实返回不一致
- 计费、体验、预期性能、输出风格都可能偏离
- 后续问题难以归因，尤其在多 key 场景下

## 建议

建议按优先级处理：

1. 临时停用或隔离 `30228`
   - 在问题彻底确认前，不建议继续作为稳定套餐通道使用

2. 向上游供应商核实
   - 确认 `api.***.***` 对应 key 是否接入了混合模型池
   - 确认 Anthropic 兼容接口是否会返回非 Claude 模型名

3. 对 `30228` 做分 key 维度排查
   - 检查 `key_index = 0/1/2` 各自是否都存在模型漂移
   - 当前证据已确认 `key_index = 2` 有该问题

4. 后续可选增强
   - 在日志中额外记录更原始的上游首包内容或模型声明
   - 对 Claude 通道增加告警：若返回模型名不以 `claude` 开头则记录异常事件

## 最终结论

截至 `2026-04-11` 本次排查结束时，可确认：

- `30228` 通道存在实际模型不一致问题
- 历史上多次记录为 `gpt-5.3-codex`
- 实时复现又返回 `claude-opus-4-6`
- 因此该通道当前不具备“稳定且可预期”的模型行为

建议将该问题定性为：

**上游通道模型漂移 / 上游行为不一致**
