# 管理员错误日志展示开关 — 设计文档

> Date: 2026-07-06
> Status: Design (pending review)
> Scope: 后端 option + 旧 web 设置页 + 日志查询过滤逻辑；web-worker 前端零改动

## 1. 目标

在日志页支持"管理员查看所有日志（含错误日志）"，即使后台
`/console/setting?tab=operation` 的 **展示错误日志**（`ErrorLogDisplayEnabled`）
关闭时，管理员在日志页仍能看到错误日志（type=5）。

通过新增一个全局服务端设置 **展示错误日志（仅管理员可见）**
（`AdminErrorLogDisplayEnabled`），放在旧 web 现有的"展示错误日志"开关旁边。

## 2. 背景 / 现状（已核实）

- 错误日志类型：`model/log.go:97` `LogTypeError = 5`。
- 错误日志的**记录**由 `constant.ErrorLogEnabled` + `common.ErrorDetailsEnabled`
  控制（`controller/relay.go:471`），与"展示"无关。因此 `ErrorLogDisplayEnabled=false`
  时错误日志**仍写入 DB**，只是在查询时被隐藏。
- 隐藏逻辑：`applyErrorLogVisibilityFilter(tx, logType, hideErrorLogs)`
  （`model/log.go:880`）。`hideErrorLogs=true` 时对 `type=5` 加
  `WHERE type <> 5`（或按错误类型筛选时 `WHERE 1=0`）。
- 三个查询构造器的现状：
  - 管理员日志表 & 导出：`buildAdminLogsQuery`（`model/log.go:513`），
    L520 用 `!common.ErrorLogDisplayEnabled`。**`GetAllLogs`（表）与
    `GetAllLogsForExport`（CSV 导出）共用此构造器**，改一处即覆盖两者。
  - 用户自查日志：`buildUserLogsQuery`（L589），L596 用
    `!common.ErrorDetailsEnabled || !common.ErrorLogDisplayEnabled`。
  - 统计（stat bar）：`buildLogStatConsumeQuery`（L1512）**硬编码
    `WHERE type = LogTypeConsume`**（L1562），从不包含错误日志。
    → 统计栏本就不受错误日志展示影响，**无需改动，天然一致**。
  - 第 4 处调用点：`GetLogByTokenId`（L136，用户/令牌自查条件），经
    `GetLogByKey`（`controller/log.go:357`，`TokenAuthReadOnly` 令牌 key 范围自查），
    **非管理员表**，按 §8 非目标**有意不改**，此处仅登记说明避免误判为遗漏。
- 路由守卫：`GET /log/` 由 `middleware.AdminAuth()` 保护
  （`router/api-router.go:438`），即 role ≥ 10（`RoleAdminUser`）。
- web-worker 管理员日志表调用 `GET /log/`（`web-worker/src/api-client/logs.ts:97`
  `listAllLogs`），其 admin 判定为 role===100（root）。

## 3. 已拍板决策

1. **实现方式**：新增全局服务端设置，而非 per-request query param。
   （用户明确要求控件放在旧 web "展示错误日志"开关旁边。）
2. **option key**：`AdminErrorLogDisplayEnabled`（沿用 `ErrorLogDisplayEnabled` 命名）。
   默认 `false`（= 今日行为，向后兼容）。
3. **作用范围**：管理员日志表（`GET /log/`）+ 管理员 CSV 导出（`GET /log/export`）。
   统计栏无需改（本就只算 consume）；用户自查日志（`/log/self`）不变。
4. **作用的管理员层级**：**所有管理员（role ≥ 10）**，与 `AdminAuth` 守卫一致，
   controller 层不加额外 role 判断。
5. **web-worker**：**零代码改动**。设置开启后错误行经 `GET /log/` 自动出现。

## 4. 语义定义

新增 `AdminErrorLogDisplayEnabled`（bool，默认 `false`）。

管理员日志视图（表 + 导出）隐藏错误日志的条件由：

```
hideErrorLogs = !common.ErrorLogDisplayEnabled
```

改为：

```
hideErrorLogs = !common.ErrorLogDisplayEnabled && !common.AdminErrorLogDisplayEnabled
```

真值表（管理员视图）：

| ErrorLogDisplayEnabled | AdminErrorLogDisplayEnabled | 管理员是否看到错误日志 |
|---|---|---|
| true  | false | 是（现状） |
| true  | true  | 是 |
| false | false | 否（现状） |
| false | true  | **是（新能力）** |

用户自查视图（`buildUserLogsQuery`）**不变**：错误日志仍受
`ErrorDetailsEnabled` / `ErrorLogDisplayEnabled` 控制，`AdminErrorLogDisplayEnabled`
对其无效。

## 5. 变更清单

### 5.1 后端（3 文件）

**A. `common/constants.go`**（`ErrorLogDisplayEnabled` 声明附近，~L84）
```go
var AdminErrorLogDisplayEnabled = false
```

**B. `model/option.go`**
- OptionMap 注册（`ErrorLogDisplayEnabled` 之后，~L54）：
```go
common.OptionMap["AdminErrorLogDisplayEnabled"] = strconv.FormatBool(common.AdminErrorLogDisplayEnabled)
```
- 同步 case（`case "ErrorLogDisplayEnabled":` 之后，~L365）：
```go
case "AdminErrorLogDisplayEnabled":
    common.AdminErrorLogDisplayEnabled = boolValue
```

**C. `model/log.go:520`**（`buildAdminLogsQuery` 内）
```go
// before
tx = applyErrorLogVisibilityFilter(tx, logType, !common.ErrorLogDisplayEnabled)
// after
tx = applyErrorLogVisibilityFilter(tx, logType,
    !common.ErrorLogDisplayEnabled && !common.AdminErrorLogDisplayEnabled)
```
`buildUserLogsQuery`（L596）与 `applyErrorLogVisibilityFilter`（L880）**不改**。

### 5.2 旧 web（1 页面 + 2 默认值 + i18n）

**D. `web/src/pages/Setting/Operation/SettingsLog.jsx`**
- 本地 `inputs` 默认值（~L49，`ErrorLogDisplayEnabled: true` 后）新增
  `AdminErrorLogDisplayEnabled: false,`。
- 在现有 `ErrorLogDisplayEnabled` 的 `<Col>`（~L244）之后新增一个
  `<Col xs=24 sm=12 md=8 lg=8 xl=8>`，内含 `Form.Switch`：
  - `field={'AdminErrorLogDisplayEnabled'}`
  - `label={t('展示错误日志（仅管理员可见）')}`
  - `onChange` 同其它开关，写回 `inputs`
  - 下方 `Text type='tertiary' size='small'` 辅助说明：
    `t('开启后即使关闭上方"展示错误日志"，管理员在日志页仍可查看错误日志')`

**E. `web/src/components/settings/OperationSetting.jsx`**（~L77）
在日志设置默认值块 `ErrorLogDisplayEnabled: true,` 后新增
`AdminErrorLogDisplayEnabled: false,`。

**F. i18n**（zh 源 + en，然后 `bun run i18n:sync`）
- `展示错误日志（仅管理员可见）`
- `开启后即使关闭上方"展示错误日志"，管理员在日志页仍可查看错误日志`
- 英文对应译文（如 `Show error logs (admin only)` /
  `When on, admins can view error logs on the log page even if "Show error logs" above is off`）。

### 5.3 web-worker：无改动

管理员日志表已走 `GET /log/`；设置开启后错误行自动出现。
不新增前端开关（用户明确要求控件在旧 web 设置页）。

## 6. 测试（TDD）

后端 table-driven 测试（新增或就近于 `model/` 现有 log 测试）：

1. 准备：写入若干 `LogTypeConsume` + 若干 `LogTypeError` 日志。
2. 遍历两 flag 的 4 种组合，断言 `GetAllLogs`（管理员表）返回集是否含 error：
   - 仅当 `ErrorLogDisplayEnabled || AdminErrorLogDisplayEnabled` 为真时含 error。
3. 断言 `GetUserLogs`（用户自查）在 `ErrorLogDisplayEnabled=false` 时**始终**不含
   error，且不受 `AdminErrorLogDisplayEnabled` 影响。
4. 断言 `GetAllLogsForExport` 与 `GetAllLogs` 对错误日志可见性一致（共用构造器，
   任选一条组合验证即可）。
5. 回归：`AdminErrorLogDisplayEnabled=false` 且 `ErrorLogDisplayEnabled=true` 时
   行为与改动前一致。

测试卫生：两个开关是包级全局变量（`common.*`），测试中用 `defer` 保存/还原原值，
且这些用例**不得** `t.Parallel()`，避免跨用例串扰。

测试后手动验证：旧 web 开关持久化到 option、`GET /log/` 在设置开启后返回 type=5 行。

## 7. 兼容性 / 风险

- **向后兼容**：默认 `false`，未开启时所有查询行为与今日逐字节一致。
- **DB 兼容**：仅改 WHERE 条件的布尔组合，无新 SQL 结构，SQLite/MySQL/PG 通用。
- **Rule 7（双前端并存）**：web-worker 无写操作改动；此设置经由既有
  `GET /api/option` + option 更新接口持久化，与旧 web 一致，无请求形状分歧。
- **权限**：`GET /log/` 已由 `AdminAuth` + `PermissionPointLogView` 守卫，
  新设置不放宽任何鉴权，仅在既有管理员边界内解除 type 过滤。
- **JSON Rule 1**：本改动不涉及 JSON marshal；option 走既有 OptionMap 机制。

## 8. 非目标（YAGNI）

- 不做 per-user / per-request 的临时开关。
- 不改统计栏、用户自查视图、错误日志的**记录**逻辑。
- 不在 web-worker 新增任何 UI 控件。
