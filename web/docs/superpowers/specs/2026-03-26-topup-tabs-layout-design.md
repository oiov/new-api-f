# TopUp 页面 Tabs 化改版设计

## 1. 目标
将 `/console/topup` 页面从当前双列并排布局改为页面级 Tabs 结构，提供“账户充值 / 邀请奖励”两大分区，降低信息拥挤并提升可理解性，同时保证现有充值、邀请、账单等业务逻辑零变更。

## 2. 需求范围（已确认）
- 修改页面：`/console/topup`
- 页面主结构改为 Tabs 切换：
  - `账户充值`
  - `邀请奖励`
- 默认 Tab：`账户充值`
- 支持深链：`/console/topup?tab=invite`
- 保持现有业务逻辑不变（充值、邀请、账单、划转、支付回跳）

## 3. 非目标
- 不改 `RechargeCard`、`InvitationCard` 内部实现
- 不新增或变更后端 API
- 不调整支付流程、邀请奖励计算、账单数据模型
- 不引入新状态管理方案或测试框架

## 4. 现状与问题
当前 `TopUp` 主体采用 `grid grid-cols-1 lg:grid-cols-2` 同屏并排渲染充值与邀请两块内容。随着充值侧信息密度增加（充值方式、套餐、账单入口等），用户在同一屏需要并行处理两类任务，视觉层级被稀释，主任务聚焦下降。

## 5. 方案设计

### 5.1 信息架构
页面主内容改为一级 Tabs：
1. `账户充值`：承载现有 `RechargeCard`
2. `邀请奖励`：承载现有 `InvitationCard`

默认展示 `账户充值`，确保进入页面后的首要任务仍为充值操作。

### 5.2 URL 参数约定
- Query 参数：`tab`
- 允许值：`account | invite`
- 归一化规则：
  - `tab=invite` => 激活“邀请奖励”
  - 其他值或缺省 => 激活“账户充值”
- URL 同步规则：
  - 切到 `invite`：设置 `tab=invite`
  - 切回 `account`：移除 `tab` 参数（默认语义）
- 兼容要求：更新 `tab` 时必须保留其他 query（如 `show_history=true`）

### 5.3 状态与同步
在 `TopUp` 容器层新增主级 tab 状态（如 `activeMainTab`），并与 `useSearchParams` 双向同步：
- 初始渲染及 query 变化时，从 URL 同步到 UI
- 用户切换 tab 时，从 UI 同步回 URL
- 支持浏览器 back/forward 时保持 URL 与 UI 一致

### 5.4 变更边界
仅修改：
- `web/src/components/topup/index.jsx`

不修改：
- `web/src/components/topup/RechargeCard.jsx`
- `web/src/components/topup/InvitationCard.jsx`
- 所有支付/邀请/账单相关 API 调用与处理分支

## 6. 关键兼容点
1. `show_history=true` 支付回跳逻辑保持可用，账单弹窗仍能自动打开。
2. `RechargeCard` 与 `InvitationCard` 现有 props 透传保持不变，避免行为回归。
3. Tab 切换仅影响展示层，不改变任何业务计算与提交路径。

## 7. 验收标准
1. 访问 `/console/topup` 默认显示“账户充值”。
2. 访问 `/console/topup?tab=invite` 默认显示“邀请奖励”。
3. 页面内切换 tabs 时，URL `tab` 参数按约定同步更新。
4. 浏览器 back/forward 时，Tab 与 URL 保持一致。
5. 存在 `show_history=true` 时，账单弹窗仍可自动打开。
6. 充值入口、邀请链接复制、账单入口功能均可正常触达。
7. `bun --cwd web run eslint "src/components/topup/index.jsx"` 通过。
8. `bun --cwd web run build` 通过。

## 8. 风险与回滚
- 风险：URL 参数同步处理不当导致深链或回跳行为异常。
- 缓解：严格限制改动在容器层，并以 query 保留策略做回归验证。
- 回滚：仅回滚 `web/src/components/topup/index.jsx` 至改版前版本即可恢复双列布局。

---

该设计文档用于指导后续实现与验收，不代表代码已完成。