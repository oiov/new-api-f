import { renderQuota, getCurrencySymbol } from '@/lib/utils';
import type { SystemStatus } from '@/types';
import type { SubscriptionPlan } from './types';

// ── Price formatting ───────────────────────────────────────────────────────────

export function fmtRatio(ratio: number, digits = 6): string {
  if (ratio === undefined || ratio === null) return '—';
  if (ratio === 0) return '0';
  return ratio.toFixed(digits);
}

// ── Subscription plan helpers ─────────────────────────────────────────────────

export function isDiscountActive(plan: SubscriptionPlan): boolean {
  if (typeof plan.has_active_discount === 'boolean') return plan.has_active_discount;
  const orig = Number(plan.price_amount || 0);
  const disc = Number(plan.discount_price_amount || 0);
  const deadline = Number(plan.discount_deadline || 0);
  return disc > 0 && orig > 0 && disc < orig && deadline > Date.now() / 1000;
}

export function getEffectivePrice(plan: SubscriptionPlan): number {
  if (plan.effective_price_amount !== undefined && plan.effective_price_amount !== null)
    return Number(plan.effective_price_amount);
  return isDiscountActive(plan)
    ? Number(plan.discount_price_amount || 0)
    : Number(plan.price_amount || 0);
}

export function getSaleSummary(plan: SubscriptionPlan) {
  const saleLimit = Number(plan.sale_limit_count || 0);
  const sold = Number(plan.sold_count || 0);
  const remaining = saleLimit > 0
    ? Math.max(0, plan.remaining_sale_count !== undefined
      ? Number(plan.remaining_sale_count) : saleLimit - sold)
    : 0;
  const soldOut = typeof plan.sold_out === 'boolean'
    ? plan.sold_out : saleLimit > 0 && sold >= saleLimit;
  return { saleLimit, sold, remaining, soldOut, unlimited: saleLimit <= 0 };
}

export function getCurrencyRate(status?: SystemStatus): number {
  if (!status) return 1;
  if (status.quota_display_type === 'CNY') return status.usd_exchange_rate ?? 7;
  if (status.quota_display_type === 'CUSTOM') return status.custom_currency_exchange_rate ?? 1;
  return 1;
}

export function fmtPrice(amount: number, status?: SystemStatus): string {
  const symbol = getCurrencySymbol(status);
  const rate = getCurrencyRate(status);
  const price = amount * rate;
  return `${symbol}${price.toFixed(Number.isInteger(price) ? 0 : 2)}`;
}

export function fmtDuration(plan: SubscriptionPlan, t: (k: string) => string): string {
  const unit = plan.duration_unit || 'month';
  const value = plan.duration_value || 1;
  if (unit === 'custom') {
    const s = plan.custom_seconds || 0;
    if (s >= 86400) return `${Math.floor(s / 86400)} ${t('天')}`;
    if (s >= 3600) return `${Math.floor(s / 3600)} ${t('小时')}`;
    return `${s} ${t('秒')}`;
  }
  const labels: Record<string, string> = {
    year: t('年'), month: t('个月'), week: t('周'), day: t('天'), hour: t('小时'),
  };
  return `${value} ${labels[unit] || unit}`;
}

export function fmtBenefit(plan: SubscriptionPlan, t: (k: string) => string): string {
  if (plan.resource_type === 'request_count') {
    const n = Number(plan.request_count_total || 0);
    return n > 0 ? `${n} ${t('次')}` : t('不限次数');
  }
  const total = Number(plan.amount_total ?? plan.total_amount ?? 0);
  return total > 0 ? renderQuota(total) : t('不限额度');
}

// ── Color utilities ───────────────────────────────────────────────────────────

/** 从字符串生成确定性 HSL 色调 (0-359) */
export function hueFromStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i)) % 360;
  return h;
}
