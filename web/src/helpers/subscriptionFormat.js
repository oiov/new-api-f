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

export function formatSubscriptionResourceLabel(plan, t) {
  return getSubscriptionResourceType(plan) === 'request_count'
    ? t('总次数')
    : t('总额度');
}

export function getSubscriptionUsageSummary(plan) {
  const resourceType = getSubscriptionResourceType(plan);
  if (resourceType === 'request_count') {
    const total = Number(plan?.request_count_total || 0);
    const used = Number(plan?.request_count_used || 0);
    const remain = total > 0 ? Math.max(0, total - used) : 0;
    return {
      resourceType,
      total,
      used,
      remain,
      unlimited: total <= 0,
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

export function formatSubscriptionResetPeriod(plan, t) {
  const period = plan?.reset_period || plan?.quota_reset_period || 'never';
  if (period === 'never') return t('不重置');
  if (period === 'daily') return t('每天');
  if (period === 'weekly') return t('每周');
  if (period === 'monthly') return t('每月');
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
