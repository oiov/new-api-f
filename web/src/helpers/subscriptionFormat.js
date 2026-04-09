/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import { getCurrencyConfig, renderQuota } from './render';

export function formatSubscriptionDuration(plan, t) {
  const unit = plan?.duration_unit || 'month';
  const value = plan?.duration_value || 1;
  const unitLabels = {
    year: t('年'),
    month: t('个月'),
    week: t('周'),
    day: t('天'),
    hour: t('小时'),
    custom: t('自定义'),
  };
  if (unit === 'custom') {
    const seconds = plan?.custom_seconds || 0;
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)} ${t('天')}`;
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)} ${t('小时')}`;
    return `${seconds} ${t('秒')}`;
  }
  return `${value} ${unitLabels[unit] || unit}`;
}

export function getSubscriptionResourceType(plan) {
  return plan?.resource_type === 'request_count' ? 'request_count' : 'quota';
}

export function getSubscriptionResetPeriodValue(plan) {
  return plan?.reset_period || plan?.quota_reset_period || 'never';
}

export function getSubscriptionRequestCountPeriodLimit(plan) {
  const period = getSubscriptionResetPeriodValue(plan);
  if (period === 'never') return 0;
  return Number(plan?.request_count_period_total || 0);
}

export function isSubscriptionResourcePeriodic(plan) {
  return getSubscriptionResetPeriodValue(plan) !== 'never';
}

export function isSubscriptionDiscountActive(plan, now = Date.now() / 1000) {
  if (typeof plan?.has_active_discount === 'boolean') {
    return plan.has_active_discount;
  }
  const original = Number(plan?.price_amount || 0);
  const discount = Number(plan?.discount_price_amount || 0);
  const deadline = Number(plan?.discount_deadline || 0);
  return discount > 0 && original > 0 && discount < original && deadline > now;
}

export function getSubscriptionEffectivePrice(plan, now = Date.now() / 1000) {
  if (
    plan?.effective_price_amount !== undefined &&
    plan?.effective_price_amount !== null
  ) {
    return Number(plan.effective_price_amount || 0);
  }
  return isSubscriptionDiscountActive(plan, now)
    ? Number(plan?.discount_price_amount || 0)
    : Number(plan?.price_amount || 0);
}

function getSubscriptionCurrencyStatus() {
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    return JSON.parse(localStorage.getItem('status') || '{}');
  } catch {
    return {};
  }
}

function convertSubscriptionPrice(amount, sourceCurrency, targetCurrency, rates) {
  const value = Number(amount || 0);
  const source = String(sourceCurrency || 'USD').toUpperCase();
  const target = String(targetCurrency || 'USD').toUpperCase();
  if (source === target) return value;

  const usdExchangeRate = Number(rates?.usdExchangeRate || 7) || 7;
  const customRate = Number(rates?.customRate || 1) || 1;

  let usdValue = value;
  if (source === 'CNY') {
    usdValue = value / usdExchangeRate;
  } else if (source === 'CUSTOM') {
    usdValue = value / customRate;
  }

  if (target === 'CNY') {
    return usdValue * usdExchangeRate;
  }
  if (target === 'CUSTOM') {
    return usdValue * customRate;
  }
  return usdValue;
}

export function getSubscriptionPriceDisplay(plan) {
  const displayConfig = getCurrencyConfig();
  const status = getSubscriptionCurrencyStatus();
  const sourceCurrency = String(plan?.currency || 'USD').toUpperCase();
  const displayCurrency = displayConfig?.type || 'USD';
  const symbol =
    displayCurrency === 'CNY'
      ? '¥'
      : displayCurrency === 'CUSTOM'
        ? status?.custom_currency_symbol || displayConfig?.symbol || '¤'
        : '$';
  const rates = {
    usdExchangeRate: status?.usd_exchange_rate || 7,
    customRate: status?.custom_currency_exchange_rate || 1,
  };

  return {
    symbol,
    currency: displayCurrency,
    effectivePrice: convertSubscriptionPrice(
      getSubscriptionEffectivePrice(plan),
      sourceCurrency,
      displayCurrency,
      rates,
    ),
    originalPrice: convertSubscriptionPrice(
      Number(plan?.price_amount || 0),
      sourceCurrency,
      displayCurrency,
      rates,
    ),
  };
}

export function formatSubscriptionResourceLabel(plan, t) {
  const isRequestCount = getSubscriptionResourceType(plan) === 'request_count';
  const isPeriodic = isSubscriptionResourcePeriodic(plan);
  if (isRequestCount) {
    return isPeriodic ? t('每周期次数') : t('总次数');
  }
  return isPeriodic ? t('每周期额度') : t('总额度');
}

export function getSubscriptionUsageSummary(plan) {
  const resourceType = getSubscriptionResourceType(plan);
  if (resourceType === 'request_count') {
    const total = Number(plan?.request_count_total || 0);
    const used = Number(plan?.request_count_used || 0);
    const remain = total > 0 ? Math.max(0, total - used) : 0;
    const periodTotal = getSubscriptionRequestCountPeriodLimit(plan);
    const periodUsed = Number(plan?.request_count_period_used || 0);
    const periodRemain =
      periodTotal > 0 ? Math.max(0, periodTotal - periodUsed) : 0;
    return {
      resourceType,
      total,
      used,
      remain,
      unlimited: total <= 0,
      periodTotal,
      periodUsed,
      periodRemain,
      periodUnlimited: periodTotal <= 0,
    };
  }
  const total = Number(plan?.amount_total ?? plan?.total_amount ?? 0);
  const used = Number(plan?.amount_used ?? 0);
  const remain = total > 0 ? Math.max(0, total - used) : 0;
  return {
    resourceType,
    total,
    used,
    remain,
    unlimited: total <= 0,
  };
}

export function getSubscriptionSaleSummary(plan) {
  const saleLimitCount = Number(plan?.sale_limit_count || 0);
  const soldCount = Number(plan?.sold_count || 0);
  const remainingSaleCount =
    saleLimitCount > 0
      ? Math.max(
          0,
          Number(
            plan?.remaining_sale_count !== undefined &&
              plan?.remaining_sale_count !== null
              ? plan.remaining_sale_count
              : saleLimitCount - soldCount,
          ),
        )
      : 0;
  const soldOut =
    typeof plan?.sold_out === 'boolean'
      ? plan.sold_out
      : saleLimitCount > 0 && soldCount >= saleLimitCount;

  return {
    saleLimitCount,
    soldCount,
    remainingSaleCount,
    soldOut,
    unlimited: saleLimitCount <= 0,
  };
}

export function formatSubscriptionResetPeriod(plan, t) {
  const period = getSubscriptionResetPeriodValue(plan);
  if (period === 'never') return t('不重置');
  if (period === 'daily') return t('每天');
  if (period === 'weekly') return t('每周');
  if (period === 'monthly') return t('每月');
  if (period === 'yearly') return t('每年');
  if (period === 'custom') {
    const seconds = Number(
      plan?.reset_custom_seconds ?? plan?.quota_reset_custom_seconds ?? 0,
    );
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)} ${t('天')}`;
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)} ${t('小时')}`;
    if (seconds >= 60) return `${Math.floor(seconds / 60)} ${t('分钟')}`;
    return `${seconds} ${t('秒')}`;
  }
  return t('不重置');
}

export function formatSubscriptionResetHint(plan, t) {
  const period = getSubscriptionResetPeriodValue(plan);
  if (period === 'never') return t('不重置');
  if (period === 'daily') return t('每天 00:00 后滚动重置');
  if (period === 'weekly') return t('每 7 天滚动重置');
  if (period === 'monthly') return t('每月按生效时间滚动重置');
  if (period === 'yearly') return t('每年按生效时间滚动重置');
  return `${formatSubscriptionResetPeriod(plan, t)} ${t('滚动重置')}`;
}

export function getSubscriptionRestrictionSummary(plan) {
  return {
    groups: Array.isArray(plan?.allowed_groups) ? plan.allowed_groups : [],
    models: Array.isArray(plan?.allowed_models) ? plan.allowed_models : [],
    vendors: Array.isArray(plan?.allowed_vendor_names)
      ? plan.allowed_vendor_names
      : [],
  };
}

export function getSubscriptionPlanMetricItems(plan, t) {
  const resourceType = getSubscriptionResourceType(plan);
  const resetPeriod = getSubscriptionResetPeriodValue(plan);
  const durationText = formatSubscriptionDuration(plan, t);
  const resetHintText = formatSubscriptionResetHint(plan, t);

  if (resourceType === 'request_count') {
    const periodLimit = Number(plan?.request_count_period_total || 0);
    const totalLimit = Number(plan?.request_count_total || 0);
    const periodLabel =
      resetPeriod === 'never'
        ? t('周期上限')
        : `${formatSubscriptionResetPeriod(plan, t)}${t('上限')}`;
    return [
      {
        key: 'period_limit',
        label: periodLabel,
        value: periodLimit > 0 ? `${periodLimit} ${t('次')}` : t('不限'),
      },
      {
        key: 'total_limit',
        label: t('总次数上限'),
        value: totalLimit > 0 ? `${totalLimit} ${t('次')}` : t('不限'),
      },
      {
        key: 'reset_time',
        label: t('重置时间'),
        value: resetHintText,
      },
      {
        key: 'duration',
        label: t('有效期'),
        value: durationText,
      },
    ];
  }

  const totalAmount = Number(plan?.total_amount ?? plan?.amount_total ?? 0);
  return [
    {
      key: 'quota_limit',
      label: formatSubscriptionResourceLabel(plan, t),
      value: totalAmount > 0 ? renderQuota(totalAmount) : t('不限'),
    },
    {
      key: 'resource_type',
      label: t('权益类型'),
      value: t('按额度'),
    },
    {
      key: 'reset_time',
      label: t('重置时间'),
      value: resetHintText,
    },
    {
      key: 'duration',
      label: t('有效期'),
      value: durationText,
    },
  ];
}

export function formatSubscriptionRequestBenefit(plan, t) {
  const summary = getSubscriptionUsageSummary(plan);
  if (summary.resourceType !== 'request_count') {
    return '';
  }
  const parts = [];
  if (!summary.periodUnlimited) {
    parts.push(
      `${formatSubscriptionResetPeriod(plan, t)} ${summary.periodTotal} ${t('次')}`,
    );
  }
  if (!summary.unlimited) {
    parts.push(`${t('总计')} ${summary.total} ${t('次')}`);
  }
  if (parts.length === 0) {
    return t('不限次数');
  }
  return parts.join(' · ');
}
