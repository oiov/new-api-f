# 账单导出优化 — 设计文档

> 日期：2026-07-02
> 范围：`/console/topup` 页面底部「导出账单」功能
> 涉及仓库：Go 主仓（`controller/`、`model/`）+ `web-worker/` 前端仓
> 状态：设计待评审

## 1. 背景与目标

`/console/topup` 底部的 `BillingSection`（`web-worker/src/components/billing/billing-section.tsx`）提供按条件导出用量账单 CSV 的功能。当前筛选项（令牌名 / 模型名 / 分组 / 业务分组 / 渠道 ID）都是**自由文本输入框**，用户需手动敲字符串、容易出错，且默认行为不直观。

导出的 CSV 由 Go 后端 `controller/log.go:writeLogsCSV` 生成，命中端点：
- 普通用户：`GET /api/log/self/export` → `ExportUserLogs` → `model.GetUserLogsForExport`
- 管理员：`GET /api/log/export` → `ExportAllLogs` → `model.GetAllLogsForExport`

**目标**：让用户默认只需选日期范围即可快速导出全部；其余筛选项改为**下拉多选**（默认全选=全部），并修正导出内容。

### 目标清单

1. 令牌名 / 模型名 / 分组 / 业务分组 改为**可搜索的多选下拉**，选项来自当前用户实际拥有的值；留空=全部。
2. **移除**账单导出面板中的「渠道 ID」筛选项。
3. 移除现有「默认锁定用户自身分组」的隐藏行为，使默认真正为全部分组。
4. CSV 中**移除 `channel_id` 列**，**新增 `quota_usd` 列**（保留原始 `quota` 整数列）。
5. 导出与汇总统计中**排除异常零输出日志**：流式对话请求、输出 token=0、但仍扣费的日志。
6. 上方汇总统计卡与导出 CSV 口径保持一致（同样的筛选 + 排除逻辑）。

## 2. 关键决策（已与用户确认）

| 决策点 | 结论 |
|---|---|
| `quota_usd` 格式 | 纯十进制数字，**6 位小数**，无 `$` 符号（便于表格求和）。保留原始 `quota` 整数列 |
| CSV 表头语言 | 保持英文小写不变，仅增删列 |
| 渠道筛选 | 从账单导出面板**完全移除**；CSV 同步去掉 `channel_id` |
| 列改动范围 | 共享的 `writeLogsCSV`，**管理员导出与用户账单导出都改** |
| 「对话模型」判定 | **黑名单**：除非模型是已知非对话类（embeddings/rerank/image/video），否则都视为对话模型参与排除 |
| 汇总卡一致性 | 多选筛选 + 零输出排除**同步作用于上方汇总统计卡** |
| 多选后端传参 | **新增 opt-in 复数参数**（重复 query param），不改动现有单值参数，日志列表页行为零变化 |

## 3. 后端设计（Go 主仓）

### 3.1 新增 opt-in 复数筛选参数（不破坏现有单值语义）

`token_name` / `model_name` / `group` / `business_group` 是单值参数，且被日志列表页、统计页、健康统计等**共享**（经 `controller/log.go:getLogQueryParams` → `buildAdminLogsQuery` / `buildUserLogsQuery` / `buildLogStatConsumeQuery`）。**禁止**把它们改成逗号分隔——会波及所有共享调用方，且名称含逗号会误切分。

改为**新增复数参数**，用重复 query param 传递（`c.QueryArray`，规避名称含逗号问题）：

| 参数 | 类型 | 语义 |
|---|---|---|
| `token_names` | `[]string` | 精确 `IN` 匹配；空=不过滤 |
| `model_names` | `[]string` | 精确 `IN` 匹配；空=不过滤 |
| `groups` | `[]string` | 精确 `IN` 匹配；空=不过滤 |
| `business_groups` | `[]string` | 精确 `IN` 匹配；空=不过滤 |

- 在 `getLogQueryParams` 中解析为切片，塞进 `logQueryParams` 新增字段（`TokenNames`、`ModelNames`、`Groups`、`BusinessGroups`）。
- 在 `buildAdminLogsQuery` / `buildUserLogsQuery` / `buildLogStatConsumeQuery` 中，当对应切片非空时追加 `col IN (?)` 条件——与现有单值条件**独立叠加**（账单前端只发复数参数，不发单值，故无冲突）。
- 列名走跨库变量：分组列用 `logGroupCol`（`buildLogStatConsumeQuery` 用非前缀 `"logs"` 表别名时对应 `commonGroupCol` 语境，实施时按该函数既有写法取列名）。
- **日志列表 / 健康统计端点不发复数参数 → 行为 100% 不变。**

> 注：`model_names` 走精确 `IN`（非 LIKE），因为选项来自 `/user/models` 的真实模型名，无需模糊匹配。

### 3.2 排除异常零输出日志（opt-in）

新增 opt-in 布尔参数 `exclude_stream_zero_completion`（`=true`/`=1`），仅账单导出与账单统计发送。命中时在查询上追加排除条件，**同时满足**以下全部才排除：

```
is_stream = <commonTrueVal>
AND completion_tokens = 0
AND quota > 0
AND model_name NOT IN (<非对话模型名列表>)
```

- `is_stream` 用 `commonTrueVal` 保证 SQL/PG/MySQL 三库布尔兼容。
- **黑名单实现**：`<非对话模型名列表>` = 所有「不支持任何对话端点」的模型名。对话端点集合 =
  `{openai, openai-response, openai-response-compact, anthropic, gemini}`（`constant/endpoint_type.go`）。
  - 通过遍历定价层已有映射 `model.GetModelSupportEndpointTypes(model)`（`model/pricing.go`）得到每个模型支持的端点类型；某模型若其支持端点与对话端点集合**无交集**，则归为非对话模型，进入黑名单。
  - 新增辅助函数（`model/pricing.go` 或 `model/log.go`），如 `GetNonChatModelNames() []string`，从 `modelSupportEndpointTypes` 派生并缓存（随定价 1 分钟刷新）。
  - 该列表作为 `IN` 参数传入查询。**列表为空时**排除条件退化为「所有模型都当对话模型」，即仅 `is_stream + completion_tokens=0 + quota>0`。
- SQL 全程无 JSONB / 数据库特有操作符，三库安全。
- 该排除逻辑封装为一个可复用的 `applyStreamZeroCompletionExclusion(tx, enabled)`，供导出与统计两条路径调用，避免逻辑漂移。

> 验证样例（生产库真实日志 request_id `20260702030344663308886hjxh6sv8`）：`model_name=claude-opus-4-8`、`is_stream=true`、`prompt_tokens=43665`、`completion_tokens=0`、`quota=174660` —— 正是要排除的异常行。`claude-opus-4-8` 支持 `anthropic` 端点 → 不在黑名单 → 命中排除。✅

### 3.3 CSV 列改动（`writeLogsCSV`，两个导出都改）

表头与行同步修改（保持英文小写）：

- **移除** `channel_id` 列（表头 + 行中 `strconv.Itoa(logItem.ChannelId)`）。
  - `channel_name` 列**保留**（用户账单导出本就把 `ChannelName` 置空，无信息泄露；管理员导出仍有值）。
- **新增** `quota_usd` 列，**紧跟 `quota` 列之后**：
  - 值 = `logItem.Quota / common.QuotaPerUnit`（`QuotaPerUnit = 500000`）。
  - 格式：`strconv.FormatFloat(usd, 'f', 6, 64)` → 纯数字 6 位小数，无 `$`。
  - 例：`quota=174660` → `quota_usd=0.349320`。

最终表头顺序：
```
id, created_at, type, user_id, username, token_name, model_name,
quota, quota_usd, prompt_tokens, completion_tokens, use_time,
is_stream, channel_name, group, business_group, ip, request_id[, content, other]
```
（`compact=false` 时末尾附 `content, other`，与现状一致。）

- `logExportColumns(compact)`（`model/log.go`）需**去掉** `logs.channel_id` 的 Select（如导出不再需要该列）；`is_stream`、`completion_tokens`、`quota` 已在 Select 中，无需新增列拉取。
  - ⚠️ 注意：`attachChannelNamesToLogs`（管理员导出）依赖 `logs.channel_id` 关联 `channel_name`。若从 Select 移除 `channel_id`，`channel_name` 将无法关联。**解决**：Select 中**保留 `logs.channel_id`**（用于内部关联），仅在 **CSV 输出层**不写 `channel_id` 列。即「查询保留、输出剔除」。

### 3.4 受影响的后端文件

- `controller/log.go`：`logQueryParams` 结构、`getLogQueryParams`、`writeLogsCSV`、`ExportAllLogs`/`ExportUserLogs`（透传新参数）、`GetLogsStat`/`GetLogsSelfStat`（透传新参数）。
- `model/log.go`：`buildAdminLogsQuery`、`buildUserLogsQuery`、`buildLogStatConsumeQuery`、`GetAllLogsForExport`、`GetUserLogsForExport`、`SumUsedQuota`、`logExportColumns`；新增排除辅助函数。
- `model/pricing.go`：新增 `GetNonChatModelNames()`（或等价派生函数）。

## 4. 前端设计（`web-worker`）

### 4.1 多选下拉组件

模板已具备 shadcn 基元：`command.tsx`、`popover.tsx`、`checkbox.tsx`、`badge.tsx`。基于此新建一个通用 `MultiSelect`（`src/components/shared/multi-select.tsx`）：
- Popover + Command 搜索框 + 可勾选选项列表；已选项以 Badge 展示在触发器内。
- 空选择 = 全部（占位符显示「全部」）。
- 纯 shadcn/ui + Tailwind + `@tabler/icons-react`，符合 web-worker Rule 7 §7 UI 纯洁性。

### 4.2 选项数据源

| 筛选项 | 数据源 API | 备注 |
|---|---|---|
| 令牌名 | `GET /token/`（`listTokens`，取足够大 size 覆盖全部；多数用户令牌少） | 取 `name` 字段去重 |
| 模型名 | `GET /user/models`（`getUserModels`，返回 `string[]`） | 直接用 |
| 分组 | `GET /user/self/groups`（`getUserGroups`，返回 `Record<string,UserGroupInfo>`） | 取 key |
| 业务分组 | `GET /token/business-groups`（`getBusinessGroups`，返回 `BusinessGroupStat[]`） | 取 group 名 |

用 `@tanstack/react-query` 拉取，staleTime 适中，失败降级为空列表（不阻塞导出）。

### 4.3 面板改动（`billing-section.tsx`）

- 4 个文本输入框 → 4 个 `MultiSelect`。
- **删除**渠道筛选（管理员 username/user_id 保留为文本框，channel 移除）。
- 日期范围 `DateTimeRangeFilter` 不变。
- `filters` state：`tokenName/modelName/group/businessGroup` 由 `string` 改为 `string[]`（`channel` 字段移除）。

### 4.4 筛选/契约层改动（`src/lib/billing-export.ts`）

- `BillingExportQuery` 增补复数字段：`token_names?: string[]`、`model_names?: string[]`、`groups?: string[]`、`business_groups?: string[]`、`exclude_stream_zero_completion?: boolean`；移除对单值 `token_name/model_name/group/business_group/channel` 在账单场景的使用。
- **移除 `withBillingFilterDefaults` 中自动锁定用户分组的逻辑**（默认全部分组）。管理员默认 username/user_id 逻辑视需要保留（不影响分组）。
- `appendBillingExportParams` / URL 构建：复数字段用**重复 query param** 追加（`token_names=a&token_names=b`）；`exclude_stream_zero_completion=true` 固定附带；`compact=true` 不变。
- stat 调用（`getSelfStat`/`getLogsStat`）与 export 调用（`downloadLogExport`）都带上同一套复数参数 + 排除标志，保证汇总卡与 CSV 口径一致。

### 4.5 api-client 改动（`src/api-client/logs.ts`）

- `withSearch` 仅支持标量；新增支持重复 param 的构建（或在账单专用 URL 构建里处理数组）。
- stat 请求函数透传新复数参数 + `exclude_stream_zero_completion`。
- 契约注释 `// source: controller/log.go:...`；复数参数标注语义。

### 4.6 受影响的前端文件

- 新增：`src/components/shared/multi-select.tsx`。
- 改：`src/components/billing/billing-section.tsx`、`src/lib/billing-export.ts`、`src/api-client/logs.ts`、（按需）`src/api-client/types.ts`。
- 数据源 hook：复用现有 `listTokens`/`getUserModels`/`getUserGroups`/`getBusinessGroups`。

## 5. 数据流

```
用户在 /console/topup 底部：选日期范围（其余默认全部）
  → billing-section 组装 BillingExportQuery（复数参数 + exclude 标志）
  → 导出：downloadLogExport → GET /api/log/self/export?token_names=..&model_names=..&groups=..&business_groups=..&exclude_stream_zero_completion=true&compact=true
      → ExportUserLogs → GetUserLogsForExport（IN 过滤 + 零输出排除）→ writeLogsCSV（去 channel_id、加 quota_usd）
  → 汇总卡：getSelfStat → GET /api/log/self/stat?<同套参数>
      → SumUsedQuota → buildLogStatConsumeQuery（IN 过滤 + 零输出排除）
```

## 6. 跨库兼容（Rule 2）

- `IN (?)`：三库通用。
- `is_stream` 布尔：用 `commonTrueVal`。
- 分组列名：用 `logGroupCol` / `commonGroupCol`，不硬编码 `group`。
- 无 JSONB / 数据库特有操作符；`quota_usd` 在应用层计算，不在 SQL 侧。

## 7. 测试

- **后端单测**：
  - `logExportColumns` / CSV 表头与行：断言无 `channel_id` 输出列、有 `quota_usd` 且值正确（`174660 → 0.349320`）。
  - 复数 `IN` 过滤：多值命中、空值不过滤。
  - 零输出排除：构造 `is_stream/completion_tokens/quota/model_name` 组合，断言仅异常对话流被排除，非对话（embedding）零输出保留。
  - 三库若 CI 具备，跑兼容用例；至少 SQLite 本地跑通。
- **前端**：
  - `billing-export.ts` 单测：复数参数 URL 构建（重复 param）、移除分组默认、exclude 标志固定附带。
  - `MultiSelect` 交互：搜索、单/多选、空=全部。
- **请求对比表**（web-worker Rule 7 §7.2）：导出与 stat 的实际请求 query 与本 spec 逐字段核对。

## 8. 非目标（YAGNI）

- 不改日志列表页、健康统计页的筛选。
- 不引入渠道多选（已确认移除渠道筛选）。
- 不改 CSV 表头语言（保持英文）。
- 不做导出格式（xlsx 等）扩展。
