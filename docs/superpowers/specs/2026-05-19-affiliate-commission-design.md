# Affiliate Commission Design

> Status: Approved for implementation planning
> Date: 2026-05-19
> Scope: 新增一级邀请分佣能力，包含后端分佣流水、支付成功结算、旧 `web` 后台配置、旧 `web` 用户级比例覆盖、`web-worker` 分佣中心页面
> Out of scope: 现金提现、二级/多级分佣、余额支付分佣、兑换码分佣、管理员补单分佣、手工发货套餐分佣

---

## 1. Goals

新增一个可审计、可幂等、可扩展到未来提现的分佣功能。第一版只做一级直推和站内额度结算：A 邀请 B，B 通过真实在线支付完成余额充值或自动发货订阅套餐购买后，A 按配置比例获得站内推广额度。

本次目标：

1. 支持全局默认分佣比例，例如所有邀请人默认返 10%。
2. 支持对单个邀请人设置覆盖比例，例如 user1 单独返 20%。
3. 分佣收益进入现有 `users.aff_quota`，用户可继续通过现有划转接口转入余额。
4. 新增独立分佣流水表，记录订单来源、实付金额、比例快照、奖励额度、状态和原因。
5. 余额充值和自动发货订阅套餐购买参与分佣。
6. 管理员补单、兑换码、余额支付、后台绑定套餐和手工发货套餐不参与分佣。
7. `web-worker` 新增 `/console/affiliate` 分佣中心，统一展示邀请链接、普通邀请奖励、分佣统计、分佣流水和奖励转余额。
8. `/console/rewards` 只保留签到、抽奖等福利能力，移除邀请奖励展示，避免重复。
9. 数据结构预留未来现金提现字段，但第一版不实现提现流程。

## 2. Current Context

当前项目已经有邀请关系和推广额度能力：

- `users` 表包含 `aff_code`、`aff_count`、`aff_quota`、`aff_history`、`inviter_id`。
- 注册时会通过 `inviter_id` 记录一级邀请关系。
- 邀请注册奖励会增加邀请人的 `aff_quota` 和 `aff_history`。
- 用户可通过 `/api/user/self/aff_transfer` 将可用推广额度划转到余额。
- 现有邀请详情接口 `/api/user/self/aff/details` 主要面向注册奖励、邀请人/被邀请人奖励和邀请套餐奖励。

支付侧有两类需要接入的真实在线支付成功路径：

- 余额充值：`model.Recharge`、`model.RechargeCreem`、`model.RechargeWaffo`、`model.RechargeEpay`。
- 订阅套餐购买：`model.CompleteSubscriptionOrderWithResult`。

订阅自动发货订单会创建或更新订阅权益，并同步一条 `TopUp` 展示记录；手工发货订单支付成功后进入待发货状态，本次不参与分佣。

## 3. Product Decisions

### 3.1 Commission Scope

第一版只支持一级直推：

```text
inviter -> invitee -> paid order -> inviter commission
```

不支持二级或多级分佣。这样可以直接复用 `users.inviter_id`，避免新增邀请树、循环检测和多级比例配置。

### 3.2 Eligible Orders

参与分佣：

- 在线余额充值成功。
- 在线订阅套餐购买成功，且套餐是自动发货。

不参与分佣：

- 兑换码充值。
- 管理员补单。
- 管理员绑定套餐。
- 余额支付。
- 手工发货套餐。
- 没有邀请人的用户订单。

### 3.3 Settlement Asset

第一版结算为站内额度，发放到邀请人的 `aff_quota`，同时增加 `aff_history`。用户继续使用现有划转能力把可用推广额度转入余额。

未来提现预留通过分佣流水字段表达，不在第一版新增提现申请、审核或打款流程。

### 3.4 Rate Resolution

实际分佣比例按邀请人维度解析：

1. 如果邀请人配置了用户级覆盖比例，使用覆盖比例。
2. 否则使用全局默认比例。

流水保存实际使用的比例快照。后续修改全局或用户比例，不影响历史流水。

### 3.5 Rewards Page Split

`web-worker` 页面职责调整：

- `/console/rewards`: 只展示签到、抽奖等福利。
- `/console/affiliate`: 展示所有邀请和分佣相关内容，包括普通邀请奖励与订单分佣。

这样普通邀请奖励不会在 rewards 页和 affiliate 页重复展示。

## 4. Backend Design

### 4.1 Models

新增 `model/affiliate_commission.go`。

`AffiliateCommission` fields:

- `Id int`
- `InviterId int`
- `InviteeId int`
- `SourceType string`: `topup` or `subscription_order`
- `SourceId int`
- `SourceTradeNo string`
- `PaymentProvider string`
- `PaymentMethod string`
- `OrderMoney float64`
- `Rate float64`
- `SettlementType string`: first version always `quota`
- `CommissionQuota int`
- `CashAmount float64`
- `Currency string`
- `Status string`: `granted`, `skipped`, `reversed`
- `Reason string`
- `WithdrawalStatus string`: reserved, default empty or `not_available`
- `WithdrawalId int`
- `CreatedAt int64`
- `UpdatedAt int64`

Recommended indexes:

- `InviterId`
- `InviteeId`
- `SourceType`
- `SourceTradeNo`
- `Status`
- `CreatedAt`

Recommended unique index:

- `(source_type, source_id)`

`source_trade_no` remains available for cross-system reconciliation and support debugging. The unique key uses local source ID because it is stable inside the database and avoids relying on external order number formatting.

### 4.2 User-Level Rate Override

Add a field to `User`:

- `AffiliateCommissionRate float64 json:"affiliate_commission_rate" gorm:"type:decimal(10,4);not null;default:-1"`

`-1` means no override and should use the global default. `0` is a valid override and means this inviter receives no commission. Positive values mean a percentage when presented in admin UI, for example `20` means 20%.

This is intentionally a user column, not JSON in `user.setting`, because admins need to see and edit it in user management and the model needs to query it during payment settlement.

### 4.3 Constants And Options

Add global options through existing option storage:

- `AffiliateCommissionEnabled bool`, default `false`
- `AffiliateCommissionDefaultRate float64`, default `10`
- `AffiliateCommissionSettlementMode string`, default `quota`
- `AffiliateCommissionScope string`, default `all_paid_orders`
- `AffiliateCommissionMinOrderMoney float64`, default `0`
- `AffiliateCommissionMaxQuotaPerOrder int`, default `0`
- `AffiliateCommissionIncludeTopup bool`, default `true`
- `AffiliateCommissionIncludeSubscription bool`, default `true`

`AffiliateCommissionScope` values:

- `all_paid_orders`: every eligible paid order can grant commission.
- `first_paid_order`: only the invitee's first eligible paid order grants commission.

`AffiliateCommissionSettlementMode` is stored now but only `quota` is accepted in the first version.

Add validation in `controller/option.go`:

- rates must be `>= 0` and should reject extremely high values unless a clear max is chosen.
- min order money must be `>= 0`.
- max quota per order must be `>= 0`.
- scope must be one of the allowed values.
- settlement mode must be `quota`.

### 4.4 Settlement Calculation

Commission quota:

```text
commission_quota = floor(order_money * rate_percent / 100 * common.QuotaPerUnit)
```

Examples:

- `order_money=10`, `rate=10`, `QuotaPerUnit=500000` -> `500000`
- `order_money=10`, `rate=20`, `QuotaPerUnit=500000` -> `1000000`

If `AffiliateCommissionMaxQuotaPerOrder > 0`, cap the calculated quota to that value.

If calculated quota is `<= 0`, record a skipped row with a reason such as `commission_quota_zero`.

### 4.5 Settlement Service

Add model-level functions:

- `GrantAffiliateCommissionForTopUpTx(tx *gorm.DB, topUp *TopUp) error`
- `GrantAffiliateCommissionForSubscriptionOrderTx(tx *gorm.DB, order *SubscriptionOrder) error`
- `ListAffiliateCommissionsByUser(userId int, pageInfo *common.PageInfo, filters AffiliateCommissionFilters) ([]AffiliateCommission, int64, error)`
- `GetAffiliateCommissionSummary(userId int) (*AffiliateCommissionSummary, error)`
- `ResolveAffiliateCommissionRate(inviter *User) float64`

Settlement algorithm inside the payment transaction:

1. Return immediately if source is nil or source ID is invalid.
2. If a row already exists for `(source_type, source_id)`, return nil to make repeated callbacks idempotent.
3. Load invitee user with `FOR UPDATE`.
4. If invitee has no `inviter_id`, create skipped row with reason `no_inviter`.
5. Load inviter with `FOR UPDATE`.
6. Evaluate global enabled flag and source include flags.
7. Evaluate `first_paid_order` if configured.
8. Evaluate min order money.
9. Resolve rate from inviter override or global default.
10. Calculate commission quota.
11. Create an `AffiliateCommission` row with final status and snapshots.
12. If status is `granted`, update inviter:
    - `aff_quota = aff_quota + commission_quota`
    - `aff_history = aff_history + commission_quota`

Skipped rows should be persisted for explainability when there is enough source context. If a duplicate row is found, do not create another skipped row.

### 4.6 Transaction Semantics

Payment success and commission grant should be in the same database transaction. If commission row creation or inviter quota update fails, the payment success transaction should fail too. This avoids a paid order being marked success while commission silently fails.

Repeated payment callbacks should not issue duplicate rewards. Existing success-order early returns and the unique commission source key provide the idempotency boundary.

### 4.7 Integration Points

余额充值:

- `rechargeAmountBasedTopUp`: after user quota is increased and before transaction return, call `GrantAffiliateCommissionForTopUpTx(tx, topUp)`.
- `Recharge`: same after Stripe top-up quota update.
- `RechargeCreem`: same after Creem top-up quota update.
- `RechargeWaffo` and `RechargeEpay` benefit from `rechargeAmountBasedTopUp`.

订阅套餐:

- `CompleteSubscriptionOrderWithResult`: after order is marked success and before transaction return, call `GrantAffiliateCommissionForSubscriptionOrderTx(tx, &order)` only when `PlanDeliveryMode` is not `manual_delivery`.

Do not call settlement from:

- `ManualCompleteTopUp`
- redemption code flow
- `AdminBindSubscriptionWithResult`
- manual delivery admin fulfillment

### 4.8 Logs

For granted commissions, record a system log for the inviter after transaction success:

```text
好友订单分佣到账，订单: <trade_no>，奖励: <quota>
```

The core audit source is the `affiliate_commissions` table, so logs are a secondary user-facing trace.

## 5. Controller And Routes

Add `controller/affiliate.go`.

User routes under authenticated self route:

```text
GET /api/user/self/affiliate/summary
GET /api/user/self/affiliate/commissions
```

Response for summary:

```json
{
  "available_quota": 1000000,
  "history_quota": 2500000,
  "invite_count": 12,
  "paid_invite_count": 4,
  "month_commission_quota": 500000,
  "effective_rate": 10,
  "uses_custom_rate": false,
  "config": {
    "enabled": true,
    "default_rate": 10,
    "scope": "all_paid_orders",
    "include_topup": true,
    "include_subscription": true,
    "settlement_type": "quota"
  }
}
```

Response for commission list:

```json
{
  "items": [
    {
      "id": 1,
      "invitee_id": 22,
      "invitee_username": "user22",
      "source_type": "topup",
      "source_trade_no": "USR22NOabc",
      "payment_provider": "epay",
      "payment_method": "alipay",
      "order_money": 10,
      "rate": 10,
      "settlement_type": "quota",
      "commission_quota": 500000,
      "status": "granted",
      "reason": "",
      "created_at": 1779189338
    }
  ],
  "page": 1,
  "page_size": 10,
  "total": 1
}
```

The existing transfer endpoint remains unchanged:

```text
POST /api/user/self/aff_transfer
```

## 6. Old Web Admin Design

### 6.1 Global Settings

Add a new section to the old `web` operation/credit settings area:

```text
分佣设置
```

Fields:

- Enable switch: `AffiliateCommissionEnabled`
- Default rate input: `AffiliateCommissionDefaultRate`, displayed as percent
- Scope select: `AffiliateCommissionScope`
- Include top-up switch: `AffiliateCommissionIncludeTopup`
- Include subscription switch: `AffiliateCommissionIncludeSubscription`
- Min order money input: `AffiliateCommissionMinOrderMoney`
- Max quota per order input: `AffiliateCommissionMaxQuotaPerOrder`
- Settlement mode display: quota only

This can live next to existing invite reward settings because both operate on `aff_quota`, but it should be visually separated from registration reward fields.

### 6.2 User Override

Add a field to the old `web` user edit modal:

```text
分佣比例覆盖
```

Behavior:

- Empty means use global default and sends `-1`.
- `0` means this inviter receives no commission.
- Positive number means percent override.

User list can show a compact tag when a user has a custom commission rate, for example `分佣 20%`. This is optional for the first implementation if the edit modal exposes the value clearly.

## 7. Web-Worker Client Design

### 7.1 Route And Navigation

Add route:

```text
/console/affiliate
```

Add sidebar entry under account:

```text
分佣中心
```

Update `/console/rewards`:

- remove `InviteStats`, `InviteCard`, and `TransferCard`.
- remove invite item from the rewards hero if present.
- keep check-in and lottery.

### 7.2 Affiliate Page

The page should be operational, not marketing-style. It should use dense but readable panels:

1. Summary metrics:
   - available quota
   - history quota
   - current month commission
   - paid invite count
2. Invite card:
   - invite code
   - invite link
   - copy actions
3. Transfer card:
   - reuse current transfer behavior
4. Rule summary:
   - effective rate
   - whether it is a custom rate
   - eligible order types
   - scope
5. Commission table:
   - created time
   - invitee
   - source type
   - trade no
   - order money
   - rate
   - commission quota
   - status

Existing `InviteCard`, `InviteStats`, and `TransferCard` can be moved or reused. The affiliate page should also call the new summary and commission APIs.

### 7.3 I18n

Add translations for all supported `web-worker` locales:

- `zh`
- `zh-TW`
- `en`
- `fr`
- `ru`
- `ja`
- `vi`

At minimum, keep keys complete for all locales. Where full translations are not available, use clear English fallback text rather than missing keys.

## 8. Data Compatibility

All schema changes use GORM `AutoMigrate` and portable column types. Avoid raw SQL unless necessary.

Database compatibility requirements:

- SQLite: no unsupported `ALTER COLUMN`.
- MySQL 5.7.8+: no JSON-specific column types required.
- PostgreSQL 9.6+: no PostgreSQL-only operators.

Store enum-like values as short strings.

## 9. Edge Cases

### 9.1 No Inviter

Create a skipped row if there is a valid source order and no inviter. Reason: `no_inviter`.

### 9.2 Commission Disabled

Create a skipped row with reason `commission_disabled`.

### 9.3 User Override Rate Is Zero

Create skipped row with reason `rate_zero`.

### 9.4 First Paid Order Scope

If `AffiliateCommissionScope=first_paid_order`, check whether this invitee already has a granted commission row before granting. Existing skipped rows should not count as paid commission. If the current source already has a row, idempotency wins and the function returns.

### 9.5 Deleted Or Disabled Inviter

If inviter cannot be found, create skipped row with reason `inviter_not_found`. If inviter is disabled, first version can still grant because the invite relationship remains valid; if policy should block disabled inviters later, add a config flag.

### 9.6 Manual Delivery Subscription

Skip by design. Reason: `manual_delivery_excluded`.

### 9.7 Refunds And Reversal

First version does not automatically reverse commissions on refund because existing payment refund flows are not unified for all providers. The table includes `reversed` status for future work. A future reversal should create or update audit data and subtract available `aff_quota` only when enough untransferred quota remains; otherwise it needs an admin-visible negative balance policy.

## 10. Tests

Backend tests:

1. Default 10% global rate grants commission for an invited user's successful balance top-up.
2. Inviter custom 20% override takes precedence over global 10%.
3. `0` custom override skips commission.
4. Automatic subscription order grants commission.
5. Manual delivery subscription order does not grant commission.
6. Redemption and admin top-up completion do not call commission settlement.
7. Duplicate payment callback does not duplicate `aff_quota`.
8. First-paid-order scope grants only once per invitee.
9. Min order money and max quota cap are applied.
10. Historical row keeps the original rate after settings change.
11. SQLite migration and model tests pass; code avoids database-specific SQL.

Frontend tests:

1. Old `web` settings page loads and saves global commission settings.
2. Old `web` user edit modal can set, clear, and display user override rate.
3. `web-worker` `/console/affiliate` renders summary, invite link, transfer card, and commission table.
4. `/console/rewards` no longer renders invite reward cards.
5. Transfer mutation invalidates current user and affiliate summary data.

## 11. Implementation Order

1. Add constants/options and validation.
2. Add user override field and migration.
3. Add `AffiliateCommission` model, summary/list functions, and settlement functions.
4. Wire settlement into top-up and subscription success transactions.
5. Add controller routes and DTOs.
6. Add old `web` global settings UI.
7. Add old `web` user override UI.
8. Add `web-worker` API client, hooks, route, sidebar entry, and i18n.
9. Remove invite display from `/console/rewards`.
10. Add backend and frontend tests.

## 12. Open Follow-Ups

Cash withdrawal remains intentionally out of scope. The reserved fields support a later design with withdrawal applications, admin approval, payout records, and reversal policy.

Refund-linked commission reversal also remains a future feature because provider refund and manual refund flows need a unified policy before automatic subtraction is safe.
