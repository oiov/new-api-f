# TopUp 页面 Tabs 化设计说明

## 1. 目标与范围

将 `/console/topup` 页面从“充值卡 + 邀请卡双列并排”调整为“页面级 Tabs 切换”，在不改变现有业务能力的前提下优化信息分组与移动端可读性。

本次仅改动：
- `web/src/components/topup/index.jsx` 的页面容器布局与 query 同步逻辑；
- 页面级 tab 状态与 URL 参数 `tab` 的双向同步规则。

本次不改动：
- `RechargeCard`、`InvitationCard` 内部实现；
- 支付流程、邀请码逻辑、账单逻辑、额度划转逻辑；
- `show_history=true` 回跳弹窗行为。

## 2. 已确认需求（验收约束）

1. 修改 `/console/topup` 页面布局。
2. 页面改为 tabs 切换：`账户充值` / `邀请奖励`。
3. 默认 tab 为 `账户充值`。
4. 支持 `?tab=invite` 深链。
5. 保持现有充值、邀请、账单等业务逻辑不变。

## 3. 架构设计

### 3.1 改造层级

采用“容器层改造、业务子卡不动”的最小变更策略：

- 容器层（`topup/index.jsx`）负责：
  - 主级 tab 状态管理；
  - URL query 解析与写回；
  - Tabs 结构渲染；
  - 原有 modal 与异步请求状态保持不变。
- 子卡层（`RechargeCard` / `InvitationCard`）继续作为现有业务承载单元，仅改变挂载位置。

### 3.2 Tab 语义与规范

- 主 tab key：
  - `account`：账户充值
  - `invite`：邀请奖励
- 归一化函数：
  - 输入为 `invite` 时返回 `invite`；
  - 其他值（含空值/非法值）统一回落 `account`。

### 3.3 URL 同步规则（唯一口径）

- 访问 `/console/topup`：默认激活 `account`。
- 访问 `/console/topup?tab=invite`：默认激活 `invite`。
- UI 切换到 `invite`：写入 `tab=invite`。
- UI 切换到 `account`：移除 `tab` 参数（保持“默认即 account”的语义）。
- 任何写回操作必须保留其他 query（例如 `show_history=true`）。

## 4. 组件设计

### 4.1 页面骨架

`topup/index.jsx` 主体布局由：

- 原结构：`grid grid-cols-1 lg:grid-cols-2`
- 新结构：`Tabs(type='line') + TabPane(account/invite)`

### 4.2 组件职责

- `Tabs`：主级切换容器，仅承载“账户充值/邀请奖励”两个视图。
- `RechargeCard`：维持现有 props 透传和全部业务行为。
- `InvitationCard`：维持现有 props 透传和全部业务行为。
- `TopupHistoryModal` / `PaymentConfirmModal` / `TransferModal`：与主级 tab 解耦，继续在容器层按原状态控制。

### 4.3 兼容性约束

- 不重命名、不删减、不重排现有子组件关键 props。
- 不新增业务接口调用。
- 不改动任何支付回调、账单查询、邀请码生成与复制链路。

## 5. 数据流设计

### 5.1 初始化流

1. 页面加载。
2. 从 `searchParams.get('tab')` 读取 query。
3. 通过 `normalizeMainTab` 得到 `activeMainTab`。
4. 渲染对应 TabPane。

### 5.2 交互流（tab 切换）

1. 用户点击 Tabs。
2. `handleMainTabChange` 归一化目标 key。
3. 更新 `activeMainTab`。
4. 克隆并更新 `URLSearchParams`：
   - `invite` => set(`tab`, `invite`)
   - `account` => delete(`tab`)
5. `setSearchParams(next, { replace: true })` 写回 URL（保留其它 query）。

### 5.3 历史导航流（back/forward）

1. 浏览器历史变更导致 query 变化。
2. `useEffect` 监听 `searchParams`（或 `tab` 派生值）触发。
3. 重新归一化并更新 `activeMainTab`。
4. UI 与 URL 保持一致。

## 6. 异常处理设计

1. **非法 tab 值**（如 `?tab=abc`）
   - 降级为 `account`，不抛错，不阻断页面。
2. **query 缺失**（无 `tab`）
   - 视为默认 `account`。
3. **并发状态冲突**（支付/账单 modal 打开时切 tab）
   - 不耦合处理；modal 状态按原逻辑继续运行。
4. **保留参数要求**
   - 写回 `tab` 时必须保留 `show_history` 等既有 query，避免回跳行为回归。

## 7. 验证方式

### 7.1 功能验收（必须全部通过）

1. `/console/topup` 默认展示“账户充值”。
2. `/console/topup?tab=invite` 默认展示“邀请奖励”。
3. 切换 tabs 时 URL 与 UI 双向同步。
4. 浏览器 back/forward 后，tab 与 URL 仍一致。
5. `show_history=true` 访问时，账单弹窗仍可打开。
6. 充值入口、邀请链接复制、账单入口均可用。

### 7.2 工程验证

```bash
bun --cwd web run eslint "src/components/topup/index.jsx"
bun --cwd web run build
```

预期：全部通过。

## 8. 回滚方案

若出现回归，回滚单文件 `web/src/components/topup/index.jsx` 到改造前版本，即可恢复双列布局与原行为。该方案不涉及后端协议、数据库迁移或跨模块联动，回滚风险低。

---

该设计文档用于指导后续实现与验证，不代表功能已发布上线。
