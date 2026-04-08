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

import React, { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Collapse,
  Divider,
  Empty,
  Progress,
  Select,
  Skeleton,
  Space,
  Tag,
  TabPane,
  Tabs,
  Tooltip,
  Typography,
} from '@douyinfe/semi-ui';
import { API, showError, showSuccess, renderQuota } from '../../helpers';
import { getCurrencyConfig } from '../../helpers/render';
import {
  BarChart3,
  BookOpen,
  CalendarClock,
  ChevronRight,
  Clock,
  Crown,
  History,
  Package,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import SubscriptionPurchaseModal from './modals/SubscriptionPurchaseModal';
import SubscriptionConsumeLogsModal from '../table/subscriptions/modals/SubscriptionConsumeLogsModal';
import CardTable from '../common/ui/CardTable';
import {
  formatSubscriptionDuration,
  formatSubscriptionResetPeriod,
  formatSubscriptionResourceLabel,
  getSubscriptionEffectivePrice,
  getSubscriptionResourceType,
  getSubscriptionSaleSummary,
  getSubscriptionUsageSummary,
  isSubscriptionDiscountActive,
} from '../../helpers/subscriptionFormat';

const { Text } = Typography;

function getEpayMethods(payMethods = []) {
  return (payMethods || []).filter(
    (m) => m?.type && m.type !== 'stripe' && m.type !== 'creem',
  );
}

function submitEpayForm({ url, params }) {
  const form = document.createElement('form');
  form.action = url;
  form.method = 'POST';
  const isSafari =
    navigator.userAgent.indexOf('Safari') > -1 &&
    navigator.userAgent.indexOf('Chrome') < 1;
  if (!isSafari) form.target = '_blank';
  Object.keys(params || {}).forEach((key) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = key;
    input.value = params[key];
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);
}

function getSubscriptionState(sub) {
  const subscription = sub?.subscription;
  const now = Date.now() / 1000;
  const isExpired = (subscription?.end_time || 0) < now;
  const isCancelled = subscription?.status === 'cancelled';
  const isActive = subscription?.status === 'active' && !isExpired;

  if (isActive) return 'active';
  if (isCancelled) return 'cancelled';
  return 'expired';
}

function formatDateTime(timestamp) {
  if (!timestamp) return '--';
  return new Date(timestamp * 1000).toLocaleString();
}

function formatNextResetDisplay(subscription, t) {
  const nextResetTime = Number(subscription?.next_reset_time || 0);
  if (nextResetTime > 0) {
    return formatDateTime(nextResetTime);
  }

  const period = subscription?.reset_period || 'never';
  if (period === 'never') {
    return t('不重置');
  }

  const now = Date.now() / 1000;
  const isActive = subscription?.status === 'active' && Number(subscription?.end_time || 0) > now;
  if (isActive && Number(subscription?.last_reset_time || 0) > 0) {
    return t('到期前不再重置');
  }

  return '--';
}

function getUsageDisplayText(summary, resourceType, t) {
  if (summary.unlimited) return t('不限');
  if (resourceType === 'request_count') {
    return `${summary.remain} ${t('次')}`;
  }
  return renderQuota(summary.remain);
}

function getUsageDetailText(summary, resourceType, t) {
  if (summary.unlimited) return t('不限');
  if (resourceType === 'request_count') {
    return `${summary.used}/${summary.total} · ${t('剩余')} ${summary.remain}`;
  }
  return `${renderQuota(summary.used)}/${renderQuota(summary.total)} · ${t('剩余')} ${renderQuota(summary.remain)}`;
}

function getPlanValueScore(plan) {
  const summary = getSubscriptionUsageSummary(plan);
  if (summary.unlimited) return Number.MAX_SAFE_INTEGER;
  return Number(summary.total || 0);
}

function getPlanResourceAmountText(plan, t) {
  const usageSummary = getSubscriptionUsageSummary(plan);
  const resourceType = getSubscriptionResourceType(plan);
  if (usageSummary.unlimited) return t('不限');
  return resourceType === 'request_count'
    ? `${usageSummary.total} ${t('次')}`
    : renderQuota(usageSummary.total);
}

function getPlanBenefitDescription(plan, t) {
  const usageSummary = getSubscriptionUsageSummary(plan);
  const resetPeriod = formatSubscriptionResetPeriod(plan, t);
  const amountText = getPlanResourceAmountText(plan, t);

  if (usageSummary.unlimited) {
    return t('有效期内不限使用');
  }

  if (resetPeriod === t('不重置')) {
    return `${t('有效期内共可用')} ${amountText}`;
  }

  return `${t('每个重置周期可用')} ${amountText} · ${t('重置')} ${resetPeriod}`;
}

const SubscriptionPlansCard = ({
  t,
  loading = false,
  plans = [],
  payMethods = [],
  enableOnlineTopUp = false,
  enableStripeTopUp = false,
  enableCreemTopUp = false,
  billingPreference,
  onChangeBillingPreference,
  activeSubscriptions = [],
  allSubscriptions = [],
  reloadSubscriptionSelf,
  withCard = true,
  initialMainTab = 'my_subscriptions',
  uiVariant = 'subscription',
}) => {
  const [open, setOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [paying, setPaying] = useState(false);
  const [selectedEpayMethod, setSelectedEpayMethod] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [activeMainTab, setActiveMainTab] = useState(initialMainTab);
  const [subscriptionView, setSubscriptionView] = useState('active');
  const [planSort, setPlanSort] = useState('recommended');
  const [expandedSubscriptionKeys, setExpandedSubscriptionKeys] = useState([]);
  const [consumeLogsFilter, setConsumeLogsFilter] = useState(null);
  const [planPage, setPlanPage] = useState(1);
  const [planPageSize, setPlanPageSize] = useState(9);

  const epayMethods = useMemo(() => getEpayMethods(payMethods), [payMethods]);
  const isPackageVariant = uiVariant === 'package';

  const openBuy = (p) => {
    setSelectedPlan(p);
    setSelectedEpayMethod(epayMethods?.[0]?.type || '');
    setOpen(true);
  };

  const closeBuy = () => {
    setOpen(false);
    setSelectedPlan(null);
    setPaying(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await reloadSubscriptionSelf?.();
    } finally {
      setRefreshing(false);
    }
  };

  const payStripe = async () => {
    if (!selectedPlan?.plan?.stripe_price_id) {
      showError(t('该套餐未配置 Stripe'));
      return;
    }
    setPaying(true);
    try {
      const res = await API.post('/api/subscription/stripe/pay', {
        plan_id: selectedPlan.plan.id,
      });
      if (res.data?.message === 'success') {
        window.open(res.data.data?.pay_link, '_blank');
        showSuccess(t('已打开支付页面'));
        closeBuy();
      } else {
        const errorMsg =
          typeof res.data?.data === 'string'
            ? res.data.data
            : res.data?.message || t('支付失败');
        showError(errorMsg);
      }
    } catch (e) {
      showError(t('支付请求失败'));
    } finally {
      setPaying(false);
    }
  };

  const payCreem = async () => {
    if (!selectedPlan?.plan?.creem_product_id) {
      showError(t('该套餐未配置 Creem'));
      return;
    }
    setPaying(true);
    try {
      const res = await API.post('/api/subscription/creem/pay', {
        plan_id: selectedPlan.plan.id,
      });
      if (res.data?.message === 'success') {
        window.open(res.data.data?.checkout_url, '_blank');
        showSuccess(t('已打开支付页面'));
        closeBuy();
      } else {
        const errorMsg =
          typeof res.data?.data === 'string'
            ? res.data.data
            : res.data?.message || t('支付失败');
        showError(errorMsg);
      }
    } catch (e) {
      showError(t('支付请求失败'));
    } finally {
      setPaying(false);
    }
  };

  const payEpay = async () => {
    if (!selectedEpayMethod) {
      showError(t('请选择支付方式'));
      return;
    }
    setPaying(true);
    try {
      const res = await API.post('/api/subscription/epay/pay', {
        plan_id: selectedPlan.plan.id,
        payment_method: selectedEpayMethod,
      });
      if (res.data?.message === 'success') {
        submitEpayForm({ url: res.data.url, params: res.data.data });
        showSuccess(t('已发起支付'));
        closeBuy();
      } else {
        const errorMsg =
          typeof res.data?.data === 'string'
            ? res.data.data
            : res.data?.message || t('支付失败');
        showError(errorMsg);
      }
    } catch (e) {
      showError(t('支付请求失败'));
    } finally {
      setPaying(false);
    }
  };

  const hasActiveSubscription = activeSubscriptions.length > 0;
  const hasAnySubscription = allSubscriptions.length > 0;
  const disableSubscriptionPreference = !hasActiveSubscription;
  const isSubscriptionPreference =
    billingPreference === 'subscription_first' ||
    billingPreference === 'subscription_only';
  const displayBillingPreference =
    disableSubscriptionPreference && isSubscriptionPreference
      ? 'wallet_first'
      : billingPreference;
  const subscriptionPreferenceLabel =
    billingPreference === 'subscription_only' ? t('仅用订阅') : t('优先订阅');

  const planPurchaseCountMap = useMemo(() => {
    const map = new Map();
    (allSubscriptions || []).forEach((sub) => {
      const planId = sub?.subscription?.plan_id;
      if (!planId) return;
      map.set(planId, (map.get(planId) || 0) + 1);
    });
    return map;
  }, [allSubscriptions]);

  const planTitleMap = useMemo(() => {
    const map = new Map();
    (plans || []).forEach((p) => {
      const plan = p?.plan;
      if (!plan?.id) return;
      map.set(plan.id, plan.title || '');
    });
    return map;
  }, [plans]);

  const planMap = useMemo(() => {
    const map = new Map();
    (plans || []).forEach((p) => {
      const plan = p?.plan;
      if (!plan?.id) return;
      map.set(plan.id, plan);
    });
    return map;
  }, [plans]);

  const getPlanPurchaseCount = (planId) =>
    planPurchaseCountMap.get(planId) || 0;

  const normalizedSubscriptions = useMemo(() => {
    return (allSubscriptions || [])
      .map((sub, index) => {
        const subscription = sub?.subscription || {};
        const usageSummary = getSubscriptionUsageSummary(subscription);
        const resourceType = getSubscriptionResourceType(subscription);
        const state = getSubscriptionState(sub);
        const remainingDays = subscription?.end_time
          ? Math.max(
              0,
              Math.ceil((subscription.end_time - Date.now() / 1000) / 86400),
            )
          : 0;

        return {
          ...sub,
          key: String(subscription?.id || index),
          state,
          plan: planMap.get(subscription?.plan_id) || null,
          usageSummary,
          resourceType,
          usageLabel: formatSubscriptionResourceLabel(subscription, t),
          title:
            planTitleMap.get(subscription?.plan_id) ||
            `${t('订阅')} #${subscription?.id}`,
          remainingDays,
        };
      })
      .sort((a, b) => (b?.subscription?.end_time || 0) - (a?.subscription?.end_time || 0));
  }, [allSubscriptions, planMap, planTitleMap, t]);

  const activeSubscriptionItems = useMemo(
    () => normalizedSubscriptions.filter((item) => item.state === 'active'),
    [normalizedSubscriptions],
  );

  const historySubscriptionItems = useMemo(
    () => normalizedSubscriptions.filter((item) => item.state !== 'active'),
    [normalizedSubscriptions],
  );

  const visibleSubscriptionItems = useMemo(() => {
    if (subscriptionView === 'history') return historySubscriptionItems;
    if (subscriptionView === 'all') return normalizedSubscriptions;
    return activeSubscriptionItems;
  }, [
    subscriptionView,
    historySubscriptionItems,
    normalizedSubscriptions,
    activeSubscriptionItems,
  ]);

  const nextExpiringSubscription = useMemo(() => {
    return [...activeSubscriptionItems].sort(
      (a, b) => (a?.subscription?.end_time || 0) - (b?.subscription?.end_time || 0),
    )[0];
  }, [activeSubscriptionItems]);

  const activeRemainSummary = useMemo(() => {
    let quotaRemain = 0;
    let requestRemain = 0;
    let quotaUnlimited = false;
    let requestUnlimited = false;

    activeSubscriptionItems.forEach((item) => {
      if (item.usageSummary.unlimited) {
        if (item.resourceType === 'request_count') {
          requestUnlimited = true;
        } else {
          quotaUnlimited = true;
        }
        return;
      }

      if (item.resourceType === 'request_count') {
        requestRemain += Number(item.usageSummary.remain || 0);
      } else {
        quotaRemain += Number(item.usageSummary.remain || 0);
      }
    });

    const parts = [];
    if (quotaUnlimited) {
      parts.push(`${t('额度')} ${t('不限')}`);
    } else if (quotaRemain > 0) {
      parts.push(`${t('额度')} ${renderQuota(quotaRemain)}`);
    }

    if (requestUnlimited) {
      parts.push(`${t('次数')} ${t('不限')}`);
    } else if (requestRemain > 0) {
      parts.push(`${t('次数')} ${requestRemain}`);
    }

    if (parts.length === 0) {
      return hasActiveSubscription ? t('按套餐明细结算') : t('暂无生效订阅');
    }

    return parts.join(' · ');
  }, [activeSubscriptionItems, hasActiveSubscription, t]);

  const sortedPlans = useMemo(() => {
    const result = [...(plans || [])];
    result.sort((a, b) => {
      const planA = a?.plan || {};
      const planB = b?.plan || {};

      if (planSort === 'price_asc') {
        return Number(planA.price_amount || 0) - Number(planB.price_amount || 0);
      }

      if (planSort === 'price_desc') {
        return Number(planB.price_amount || 0) - Number(planA.price_amount || 0);
      }

      if (planSort === 'value_desc') {
        return getPlanValueScore(planB) - getPlanValueScore(planA);
      }

      const purchaseDiff =
        getPlanPurchaseCount(planB.id) - getPlanPurchaseCount(planA.id);
      if (purchaseDiff !== 0) return purchaseDiff;

      return Number(planA.price_amount || 0) - Number(planB.price_amount || 0);
    });
    return result;
  }, [plans, planSort, getPlanPurchaseCount]);

  useEffect(() => {
    setPlanPage(1);
  }, [planSort, plans.length]);

  const totalPlanPages = Math.max(
    1,
    Math.ceil(sortedPlans.length / Math.max(planPageSize, 1)),
  );

  useEffect(() => {
    if (planPage > totalPlanPages) {
      setPlanPage(totalPlanPages);
    }
  }, [planPage, totalPlanPages]);

  const pagedPlans = useMemo(() => {
    const start = (planPage - 1) * planPageSize;
    return sortedPlans.slice(start, start + planPageSize);
  }, [sortedPlans, planPage, planPageSize]);

  const overviewItems = [
    {
      label: t('生效中的订阅'),
      value: `${activeSubscriptionItems.length}`,
      helper: hasActiveSubscription ? t('正在提供模型权益') : t('当前暂无生效套餐'),
      icon: Zap,
      color: 'blue',
      gradient: 'from-blue-500/10 to-blue-500/5',
      iconBg: 'bg-blue-500/15',
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      label: t('历史订阅'),
      value: `${historySubscriptionItems.length}`,
      helper:
        historySubscriptionItems.length > 0
          ? t('含已过期与已作废记录')
          : t('暂无历史记录'),
      icon: History,
      color: 'purple',
      gradient: 'from-purple-500/10 to-purple-500/5',
      iconBg: 'bg-purple-500/15',
      iconColor: 'text-purple-600 dark:text-purple-400',
    },
    {
      label: t('最近到期'),
      value: nextExpiringSubscription
        ? `${nextExpiringSubscription.remainingDays}${t('天')}`
        : '--',
      helper: nextExpiringSubscription
        ? nextExpiringSubscription.title
        : t('暂无生效套餐'),
      icon: Clock,
      color: 'amber',
      gradient: 'from-amber-500/10 to-amber-500/5',
      iconBg: 'bg-amber-500/15',
      iconColor: 'text-amber-600 dark:text-amber-400',
    },
    {
      label: t('当前权益概览'),
      value: activeRemainSummary,
      helper:
        displayBillingPreference === 'subscription_only'
          ? t('仅使用订阅扣费')
          : displayBillingPreference === 'wallet_only'
            ? t('仅使用钱包扣费')
            : displayBillingPreference === 'wallet_first'
              ? t('优先使用钱包扣费')
              : t('优先使用订阅扣费'),
      icon: Crown,
      color: 'emerald',
      gradient: 'from-emerald-500/10 to-emerald-500/5',
      iconBg: 'bg-emerald-500/15',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
    },
  ];

  const usageChartMetrics = useMemo(() => {
    const usageMap = {
      quota: {
        key: 'quota',
        title: t('额度消耗'),
        resourceType: 'quota',
        total: 0,
        used: 0,
        remain: 0,
        unlimited: false,
      },
      request_count: {
        key: 'request_count',
        title: t('次数消耗'),
        resourceType: 'request_count',
        total: 0,
        used: 0,
        remain: 0,
        unlimited: false,
      },
    };

    activeSubscriptionItems.forEach((item) => {
      const usageSummary = item?.usageSummary || {};
      const resourceType = item?.resourceType === 'request_count' ? 'request_count' : 'quota';
      const target = usageMap[resourceType];
      if (!target) return;

      if (usageSummary.unlimited) {
        target.unlimited = true;
        return;
      }

      target.total += Number(usageSummary.total || 0);
      target.used += Number(usageSummary.used || 0);
      target.remain += Number(usageSummary.remain || 0);
    });

    return Object.values(usageMap).map((item) => {
      const percent = item.unlimited
        ? 0
        : Math.min(
            100,
            Math.max(
              0,
              Math.round((Number(item.used || 0) / Math.max(Number(item.total || 0), 1)) * 100),
            ),
          );

      const formatter = item.resourceType === 'request_count'
        ? (value) => `${value}`
        : (value) => renderQuota(value);

      return {
        ...item,
        percent,
        progressColor:
          percent >= 85
            ? 'var(--semi-color-danger)'
            : percent >= 60
              ? 'var(--semi-color-warning)'
              : 'var(--semi-color-success)',
        totalText: item.unlimited ? t('不限') : formatter(item.total),
        usedText: item.unlimited ? t('按实际调用') : formatter(item.used),
        remainText: item.unlimited ? t('不限') : formatter(item.remain),
      };
    });
  }, [activeSubscriptionItems, t]);

  const packageGuideItems = useMemo(
    () => [
      {
        key: 'usage',
        title: t('使用说明'),
        content: (
          <div className='space-y-2 text-sm text-semi-color-text-1'>
            <div>
              {t('套餐购买成功后会立即生效，并进入“我的订阅”。生效中的套餐会直接参与后续请求结算。')}
            </div>
            <div>
              {t('你可以在“我的订阅”中查看套餐详情、剩余额度/次数、下次重置时间，以及历史消耗记录。')}
            </div>
            <div>
              {t('按次套餐统计的是成功请求次数；失败请求、鉴权失败、上游报错不会计入成功次数。')}
            </div>
          </div>
        ),
      },
      {
        key: 'billing',
        title: t('计费与扣费规则'),
        content: (
          <div className='space-y-2 text-sm text-semi-color-text-1'>
            <div>
              {t('如果你启用了订阅扣费，请求会优先尝试使用可用订阅；如果当前订阅不足，再按你的扣费偏好决定是否回退到钱包余额。')}
            </div>
            <div>
              {t('按额度套餐会扣减额度余额；按次套餐会在请求成功后扣减成功次数。两种资源类型彼此独立，不会混算。')}
            </div>
            <div>
              {t('带有重置周期的套餐，重置的是“当前周期可用权益”；重置周期从购买生效时间开始按 24 小时、7 天、1 个月、1 年等规则滚动计算；不重置的套餐会持续累计使用，直到到期或耗尽。')}
            </div>
          </div>
        ),
      },
      {
        key: 'multi-subscription',
        title: t('多个套餐如何生效'),
        content: (
          <div className='space-y-2 text-sm text-semi-color-text-1'>
            <div>
              {t('多个生效套餐可以同时存在。系统会按“最早到期优先”使用订阅权益，先消耗最早过期的套餐，再消耗后到期的套餐。')}
            </div>
            <div>
              {t('如果同时存在多个按次套餐，会优先消耗最早到期的按次套餐；如果存在多个按额度套餐，也会优先消耗最早到期的按额度套餐。')}
            </div>
            <div>
              {t('按次套餐和按额度套餐不会互相覆盖。实际命中哪类套餐，取决于当前请求是否走订阅结算以及系统可用的订阅权益。')}
            </div>
          </div>
        ),
      },
      {
        key: 'faq',
        title: t('常见问题答疑'),
        content: (
          <div className='space-y-2 text-sm text-semi-color-text-1'>
            <div>
              {t('问：我调整了套餐价格或权益，会影响已购买用户吗？')}
            </div>
            <div className='text-semi-color-text-2'>
              {t('答：不会。已购买订阅会保留购买时的周期和订阅实例快照，不会被后续套餐配置修改直接覆盖。')}
            </div>
            <div>
              {t('问：删除旧令牌后重新创建同分组令牌，套餐额度/次数会重置吗？')}
            </div>
            <div className='text-semi-color-text-2'>
              {t('答：不会。订阅权益绑定的是用户账户与订阅实例，不绑定某个具体令牌。新建令牌后仍继续使用原有剩余权益。')}
            </div>
            <div>
              {t('问：为什么有“总量”和“重置周期”同时存在？')}
            </div>
            <div className='text-semi-color-text-2'>
              {t('答：如果页面显示“每个重置周期可用 X，重置 Y”，其中 X 表示单个重置周期内可用的权益，Y 会从购买生效时间开始按每天、每周、每月、每年或其他自定义周期滚动重置；“有效期”只表示套餐会在何时到期，不表示整个有效期内的总权益。')}
            </div>
          </div>
        ),
      },
    ],
    [t],
  );

  const renderSubscriptionHeader = (item) => {
    const stateTag =
      item.state === 'active' ? (
        <Tag
          color='green'
          size='small'
          shape='circle'
          prefixIcon={<Badge dot type='success' />}
        >
          {t('生效')}
        </Tag>
      ) : item.state === 'cancelled' ? (
        <Tag color='grey' size='small' shape='circle'>
          {t('已作废')}
        </Tag>
      ) : (
        <Tag color='grey' size='small' shape='circle'>
          {t('已过期')}
        </Tag>
      );

    const usagePercent = item.usageSummary.unlimited
      ? 0
      : Math.round(
          (Number(item.usageSummary.used || 0) /
            Number(item.usageSummary.total || 1)) *
            100,
        );

    return (
      <div className='flex flex-col gap-3 py-1'>
        <div className='flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between'>
          <div className='min-w-0 flex items-center gap-3'>
            <div className={`flex-shrink-0 rounded-lg p-2 ${item.state === 'active' ? 'bg-green-500/10' : 'bg-gray-500/10'}`}>
              <ShieldCheck size={18} className={item.state === 'active' ? 'text-green-600 dark:text-green-400' : 'text-gray-400'} />
            </div>
            <div className='min-w-0'>
              <div className='flex flex-wrap items-center gap-2'>
                <Text strong ellipsis={{ showTooltip: true }}>
                  {item.title}
                </Text>
                {stateTag}
              </div>
              <Text type='tertiary' size='small'>
                {t('订阅')} #{item.subscription?.id || '--'}
              </Text>
            </div>
          </div>
          <div className='text-left lg:text-right'>
            <div className='font-semibold text-base'>
              {t('剩余')} {getUsageDisplayText(item.usageSummary, item.resourceType, t)}
            </div>
            <Text type='tertiary' size='small'>
              {item.state === 'active'
                ? `${t('还有')} ${item.remainingDays} ${t('天')}`
                : formatDateTime(item.subscription?.end_time)}
            </Text>
          </div>
        </div>
        {item.state === 'active' && !item.usageSummary.unlimited && (
          <div className='px-1'>
            <Progress
              percent={usagePercent}
              stroke={
                usagePercent >= 85
                  ? 'var(--semi-color-danger)'
                  : usagePercent >= 60
                    ? 'var(--semi-color-warning)'
                    : 'var(--semi-color-success)'
              }
              showInfo={false}
              size='small'
            />
          </div>
        )}
        <div className='grid grid-cols-2 gap-3 text-xs text-gray-500 lg:grid-cols-4'>
          <div className='rounded-lg bg-semi-color-fill-0 p-2'>
            <div>{t('到期时间')}</div>
            <div className='mt-1 font-medium text-semi-color-text-0'>
              {formatDateTime(item.subscription?.end_time)}
            </div>
          </div>
          <div className='rounded-lg bg-semi-color-fill-0 p-2'>
            <div>
              {item.resourceType === 'request_count' ? t('次数重置') : t('额度重置')}
            </div>
            <div className='mt-1 font-medium text-semi-color-text-0'>
              {formatSubscriptionResetPeriod(item.subscription, t)}
            </div>
          </div>
          <div className='rounded-lg bg-semi-color-fill-0 p-2'>
            <div>{item.usageLabel}</div>
            <div className='mt-1 font-medium text-semi-color-text-0'>
              {getUsageDetailText(item.usageSummary, item.resourceType, t)}
            </div>
          </div>
          <div className='rounded-lg bg-semi-color-fill-0 p-2'>
            <div>{t('已用进度')}</div>
            <div className='mt-1 font-medium text-semi-color-text-0'>
              {item.usageSummary.unlimited
                ? t('不限')
                : `${usagePercent}%`}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSubscriptionBody = (item) => {
    const plan = item.plan || {};
    const usagePercent = item.usageSummary.unlimited
      ? 0
      : Math.round(
          (Number(item.usageSummary.used || 0) /
            Number(item.usageSummary.total || 1)) *
            100,
        );
    const progressColor =
      usagePercent >= 85
        ? 'var(--semi-color-danger)'
        : usagePercent >= 60
          ? 'var(--semi-color-warning)'
          : 'var(--semi-color-success)';

    const detailItems = [
      {
        label: t('有效期'),
        value: formatSubscriptionDuration(item.subscription, t),
      },
      {
        label: t('套餐说明'),
        value: plan?.subtitle || t('暂无说明'),
      },
      {
        label: t('结算资源'),
        value: item.usageLabel,
      },
      {
        label: t('资源详情'),
        value: getUsageDetailText(item.usageSummary, item.resourceType, t),
      },
      {
        label: t('生效时间'),
        value: formatDateTime(item.subscription?.start_time),
      },
      {
        label: t('到期时间'),
        value: formatDateTime(item.subscription?.end_time),
      },
      {
        label: item.resourceType === 'request_count' ? t('次数重置') : t('额度重置'),
        value: formatSubscriptionResetPeriod(item.subscription, t),
      },
      {
        label: t('下次重置'),
        value: formatNextResetDisplay(item.subscription, t),
      },
      {
        label: t('上次重置'),
        value: formatDateTime(item.subscription?.last_reset_time),
      },
      {
        label: t('来源'),
        value: item.subscription?.source || '--',
      },
      {
        label: t('升级分组'),
        value: item.subscription?.upgrade_group || plan?.upgrade_group || '--',
      },
    ];

    return (
      <div className='space-y-4'>
        <div className='flex justify-end'>
          <Button
            size='small'
            type='tertiary'
            theme='outline'
            onClick={() =>
              setConsumeLogsFilter({
                subscriptionId: item.subscription?.id,
                planId: item.subscription?.plan_id,
              })
            }
          >
            {t('查看历史消耗')}
          </Button>
        </div>
        {!item.usageSummary.unlimited && (
          <div>
            <div className='mb-2 flex items-center justify-between text-xs text-gray-500'>
              <span>{t('权益使用情况')}</span>
              <span>
                {t('已用')} {usagePercent}%
              </span>
            </div>
            <Progress
              percent={usagePercent}
              stroke={progressColor}
              showInfo={false}
            />
          </div>
        )}
        <div className='grid grid-cols-1 gap-3 text-sm lg:grid-cols-3'>
          {detailItems.map((detail) => (
            <div
              key={detail.label}
              className='rounded-lg border border-semi-color-border bg-semi-color-fill-0 p-3'
            >
              <div className='text-xs text-gray-500'>{detail.label}</div>
              <div className='mt-1 break-all text-semi-color-text-0'>
                {detail.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderPlanExpandedContent = (record) => {
    const plan = record?.plan || {};
    const usageSummary = getSubscriptionUsageSummary(plan);
    const count = getPlanPurchaseCount(plan?.id);
    const limit = Number(plan?.max_purchase_per_user || 0);
    const saleSummary = getSubscriptionSaleSummary(plan);

    return (
      <div className='grid grid-cols-1 gap-3 lg:grid-cols-4'>
        <div className='rounded-lg border border-semi-color-border bg-semi-color-fill-0 p-3'>
          <div className='text-xs text-gray-500'>{t('套餐说明')}</div>
          <div className='mt-1 text-sm text-semi-color-text-0 break-all'>
            {plan?.subtitle || t('暂无说明')}
          </div>
        </div>
        <div className='rounded-lg border border-semi-color-border bg-semi-color-fill-0 p-3'>
          <div className='text-xs text-gray-500'>{t('升级分组')}</div>
          <div className='mt-1 text-sm text-semi-color-text-0 break-all'>
            {plan?.upgrade_group || '--'}
          </div>
        </div>
        <div className='rounded-lg border border-semi-color-border bg-semi-color-fill-0 p-3'>
          <div className='text-xs text-gray-500'>{t('购买情况')}</div>
          <div className='mt-1 text-sm text-semi-color-text-0'>
            {limit > 0
              ? `${t('已购')} ${count} / ${limit}`
              : `${t('已购')} ${count}`}
            {saleSummary.unlimited
              ? ` · ${t('已售')} ${saleSummary.soldCount}`
              : ` · ${t('已售')} ${saleSummary.soldCount} / ${t('剩余')} ${saleSummary.remainingSaleCount}`}
          </div>
        </div>
        <div className='rounded-lg border border-semi-color-border bg-semi-color-fill-0 p-3'>
          <div className='text-xs text-gray-500'>{t('完整权益')}</div>
          <div className='mt-1 text-sm text-semi-color-text-0 break-all'>
            {usageSummary.unlimited
              ? `${formatSubscriptionResourceLabel(plan, t)}: ${t('不限')}`
              : `${getPlanBenefitDescription(plan, t)} · ${t('有效期')} ${formatSubscriptionDuration(plan, t)}`}
          </div>
        </div>
      </div>
    );
  };

  const planTableColumns = useMemo(
    () => [
      {
        title: t('套餐'),
        key: 'plan',
        render: (text, record) => {
          const plan = record?.plan || {};
          const count = getPlanPurchaseCount(plan?.id);
          const limit = Number(plan?.max_purchase_per_user || 0);
          const reached = limit > 0 && count >= limit;
          const saleSummary = getSubscriptionSaleSummary(plan);
          const isPopular =
            planSort === 'recommended' &&
            sortedPlans.length > 1 &&
            sortedPlans[0]?.plan?.id === plan?.id;

          return (
            <div className='min-w-0 flex items-center gap-3'>
              <div className={`flex-shrink-0 rounded-lg p-2 ${isPopular ? 'bg-blue-500/15' : 'bg-semi-color-fill-1'}`}>
                <Package size={16} className={isPopular ? 'text-blue-600 dark:text-blue-400' : 'text-semi-color-text-2'} />
              </div>
              <div className='min-w-0'>
                <div className='flex flex-wrap items-center gap-2'>
                  <Text strong>{plan?.title || t('订阅套餐')}</Text>
                  {isPopular && (
                    <Tag color='blue' shape='circle' size='small'>
                      <Sparkles size={10} className='mr-1' />
                      {t('推荐')}
                    </Tag>
                  )}
                  {!plan?.enabled && (
                    <Tag color='red' shape='circle' size='small'>
                      {t('已下架')}
                    </Tag>
                  )}
                  {reached && (
                    <Tag color='orange' shape='circle' size='small'>
                      {t('已达上限')}
                    </Tag>
                  )}
                  {saleSummary.soldOut && (
                    <Tag color='red' shape='circle' size='small'>
                      {t('已售罄')}
                    </Tag>
                  )}
                </div>
                <Text type='tertiary' size='small'>
                  {plan?.subtitle || t('暂无说明')}
                  {isPopular ? ` · ${t('适合首次购买与标准使用场景')}` : ''}
                </Text>
              </div>
            </div>
          );
        },
      },
      {
        title: t('价格'),
        key: 'price',
        width: 140,
        render: (text, record) => {
          const plan = record?.plan || {};
          const { symbol, rate } = getCurrencyConfig();
          const price = getSubscriptionEffectivePrice(plan) * rate;
          const displayPrice = price.toFixed(Number.isInteger(price) ? 0 : 2);
          const activeDiscount = isSubscriptionDiscountActive(plan);
          return (
            <div className='inline-flex flex-col items-start'>
              <div className='text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent'>
                {symbol}
                {displayPrice}
              </div>
              {activeDiscount ? (
                <Text type='tertiary' size='small' delete>
                  {symbol}
                  {(Number(plan?.price_amount || 0) * rate).toFixed(
                    Number.isInteger(Number(plan?.price_amount || 0) * rate)
                      ? 0
                      : 2,
                  )}
                </Text>
              ) : null}
              <Text type='tertiary' size='small'>
                {formatSubscriptionDuration(plan, t)}
              </Text>
              {activeDiscount ? (
                <Text type='tertiary' size='small'>
                  {t('截止')} {new Date(Number(plan?.discount_deadline || 0) * 1000).toLocaleString()}
                </Text>
              ) : null}
            </div>
          );
        },
      },
      {
        title: t('核心权益'),
        key: 'benefit',
        render: (text, record) => {
          const plan = record?.plan || {};
          return (
            <div className='space-y-1'>
              <div>{getPlanBenefitDescription(plan, t)}</div>
              <Text type='tertiary' size='small'>
                {t('有效期')}：{formatSubscriptionDuration(plan, t)}
              </Text>
            </div>
          );
        },
      },
      {
        title: t('规则'),
        key: 'rule',
        width: 180,
        render: (text, record) => {
          const plan = record?.plan || {};
          const limit = Number(plan?.max_purchase_per_user || 0);
          const saleSummary = getSubscriptionSaleSummary(plan);
          return (
            <div className='flex flex-wrap gap-2'>
              {limit > 0 && (
                <Tag color='white' shape='circle' size='small'>
                  {t('限购')} {limit}
                </Tag>
              )}
              {!saleSummary.unlimited && (
                <>
                  <Tag color='white' shape='circle' size='small'>
                    {t('已售')} {saleSummary.soldCount}
                  </Tag>
                  <Tag
                    color={saleSummary.soldOut ? 'red' : 'white'}
                    shape='circle'
                    size='small'
                  >
                    {t('剩余')} {saleSummary.remainingSaleCount}
                  </Tag>
                </>
              )}
              {saleSummary.unlimited && saleSummary.soldCount > 0 && (
                <Tag color='white' shape='circle' size='small'>
                  {t('已售')} {saleSummary.soldCount}
                </Tag>
              )}
              {plan?.upgrade_group && (
                <Tag color='white' shape='circle' size='small'>
                  {t('升级分组')}: {plan.upgrade_group}
                </Tag>
              )}
              {!limit && !plan?.upgrade_group && saleSummary.soldCount <= 0 && (
                <Text type='tertiary' size='small'>
                  --
                </Text>
              )}
            </div>
          );
        },
      },
      {
        title: t('操作'),
        key: 'actions',
        width: 140,
        render: (text, record) => {
          const plan = record?.plan || {};
          const limit = Number(plan?.max_purchase_per_user || 0);
          const count = getPlanPurchaseCount(plan?.id);
          const reached = limit > 0 && count >= limit;
          const saleSummary = getSubscriptionSaleSummary(plan);
          const soldOut = saleSummary.soldOut;
          const disabled = reached || soldOut;
          const tip = reached
            ? t('已达到购买上限') + ` (${count}/${limit})`
            : soldOut
              ? t('该套餐已售罄')
              : '';

          if (disabled) {
            return (
              <Tooltip content={tip} position='top'>
                <Button theme='outline' type='primary' disabled>
                  {soldOut ? t('已售罄') : t('已达上限')}
                </Button>
              </Tooltip>
            );
          }

          return (
            <Button
              theme='solid'
              type='primary'
              onClick={() => openBuy(record)}
              icon={<ChevronRight size={14} />}
              iconPosition='right'
            >
              {t('立即订阅')}
            </Button>
          );
        },
      },
    ],
    [t, getPlanPurchaseCount, planSort, sortedPlans],
  );

  const cardContent = (
    <>
      {loading ? (
        <div className={isPackageVariant ? 'space-y-5' : 'space-y-4'}>
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4'>
            {[1, 2, 3, 4].map((i) => (
              <Card
                key={i}
                className={isPackageVariant ? '!rounded-2xl border-0 shadow-sm' : '!rounded-xl border-0 shadow-sm'}
              >
                <div className='flex items-start justify-between'>
                  <div className='flex-1'>
                    <Skeleton.Title active style={{ width: '50%', height: 12, marginBottom: 12 }} />
                    <Skeleton.Title active style={{ width: '70%', height: 24, marginBottom: 8 }} />
                    <Skeleton.Title active style={{ width: '60%', height: 12 }} />
                  </div>
                  <Skeleton.Avatar active size='small' shape='square' />
                </div>
              </Card>
            ))}
          </div>
          <Card className='!rounded-xl w-full border-0 shadow-sm' bodyStyle={{ padding: '12px' }}>
            <Skeleton.Paragraph active rows={5} />
          </Card>
          <Card className='!rounded-xl w-full border-0 shadow-sm' bodyStyle={{ padding: '12px' }}>
            <Skeleton.Paragraph active rows={4} />
          </Card>
        </div>
      ) : (
        <Space vertical style={{ width: '100%' }} spacing={isPackageVariant ? 16 : 12}>
          <div className={isPackageVariant ? 'grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4' : 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4'}>
            {overviewItems.map((item) => {
              const Icon = item.icon;
              return (
                <Card
                  key={item.label}
                  className={`border-0 transition-all duration-300 ${
                    isPackageVariant
                      ? '!rounded-2xl shadow-sm hover:-translate-y-0.5 hover:shadow-lg bg-gradient-to-br from-semi-color-bg-0 to-semi-color-fill-0'
                      : `!rounded-xl shadow-sm bg-gradient-to-br ${item.gradient} hover:shadow-md`
                  }`}
                  bodyStyle={{ padding: isPackageVariant ? 18 : 16 }}
                >
                  <div className='flex items-start justify-between'>
                    <div className='min-w-0 flex-1'>
                      <div className='text-xs font-medium text-gray-500'>{item.label}</div>
                      <div className='mt-2 text-xl font-bold break-words text-semi-color-text-0'>
                        {item.value}
                      </div>
                      <div className='mt-2 text-xs text-gray-400'>{item.helper}</div>
                    </div>
                    <div className={`flex-shrink-0 rounded-lg p-2 ${item.iconBg}`}>
                      <Icon size={18} className={item.iconColor} />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          <Card
            className={isPackageVariant ? 'package-usage-card !rounded-2xl w-full overflow-hidden border-0 shadow-sm' : '!rounded-xl w-full overflow-hidden border-0 shadow-sm'}
            bodyStyle={{ padding: 0 }}
          >
            <div className={isPackageVariant ? 'px-6 pt-6' : 'px-5 pt-5'}>
              <div className='flex flex-col gap-2'>
                <div className='flex items-center gap-2'>
                  <div className='rounded-lg bg-amber-500/15 p-1.5'>
                    <BookOpen size={14} className='text-amber-600 dark:text-amber-400' />
                  </div>
                  <Text strong>{t('使用说明与计费规则')}</Text>
                </div>
                <Text type='tertiary' size='small'>
                  {t('下单前建议先阅读这里，了解套餐如何生效、如何扣费，以及多套餐并存时的处理方式。')}
                </Text>
              </div>

              <Divider margin={12} />

              <Collapse>
                {packageGuideItems.map((item) => (
                  <Collapse.Panel
                    key={item.key}
                    itemKey={item.key}
                    header={item.title}
                  >
                    {item.content}
                  </Collapse.Panel>
                ))}
              </Collapse>
            </div>

            <Divider margin={0} />

            <div className={isPackageVariant ? 'package-usage-card-header px-6 py-5' : 'bg-gradient-to-r from-blue-500/10 via-indigo-500/8 to-purple-500/10 px-5 py-4 dark:from-blue-500/15 dark:via-indigo-500/10 dark:to-purple-500/15'}>
              <div className='flex items-center gap-2.5'>
                <div className={isPackageVariant ? 'rounded-lg bg-white/75 p-2 text-blue-600 shadow-sm dark:bg-white/10 dark:text-blue-400' : 'rounded-lg bg-blue-500/15 p-1.5'}>
                  <BarChart3 size={16} className={isPackageVariant ? '' : 'text-blue-600 dark:text-blue-400'} />
                </div>
                <div>
                  <Text strong>{t('消耗额度可视化')}</Text>
                  <div>
                    <Text type='tertiary' size='small'>
                      {t('聚合展示生效订阅的额度/次数使用进度，帮助你更快判断是否需要续费或加购。')}
                    </Text>
                  </div>
                </div>
              </div>
            </div>
            <div className={isPackageVariant ? 'grid grid-cols-1 gap-4 p-5 md:grid-cols-2' : 'grid grid-cols-1 gap-4 p-4 md:grid-cols-2'}>
              {usageChartMetrics.map((metric) => (
                <div
                  key={metric.key}
                  className={isPackageVariant ? 'package-usage-metric-card rounded-2xl border border-semi-color-border bg-semi-color-fill-0 p-5 transition-all duration-300' : 'rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-5 transition-all duration-200 hover:shadow-sm'}
                >
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-2'>
                      <div
                        className='h-2.5 w-2.5 rounded-full'
                        style={{ backgroundColor: metric.unlimited ? 'var(--semi-color-success)' : metric.progressColor }}
                      />
                      <Text strong className='text-base'>{metric.title}</Text>
                    </div>
                    <Tag
                      color={metric.percent >= 85 ? 'red' : metric.percent >= 60 ? 'orange' : 'green'}
                      shape='circle'
                      size='small'
                    >
                      {metric.unlimited ? t('不限') : `${metric.percent}%`}
                    </Tag>
                  </div>
                  {!metric.unlimited && (
                    <div className='mt-4'>
                      <Progress
                        percent={metric.percent}
                        stroke={metric.progressColor}
                        showInfo={false}
                        style={{ height: isPackageVariant ? 10 : 8 }}
                      />
                    </div>
                  )}
                  <div className='mt-4 grid grid-cols-3 gap-2 text-xs'>
                    <div className={isPackageVariant ? 'rounded-xl bg-semi-color-fill-1/80 px-3 py-2.5 text-center' : 'rounded-lg bg-semi-color-fill-1 px-3 py-2.5 text-center'}>
                      <div className='text-semi-color-text-2'>{t('总量')}</div>
                      <div className='mt-1.5 font-semibold text-semi-color-text-0'>{metric.totalText}</div>
                    </div>
                    <div className={isPackageVariant ? 'rounded-xl bg-semi-color-fill-1/80 px-3 py-2.5 text-center' : 'rounded-lg bg-semi-color-fill-1 px-3 py-2.5 text-center'}>
                      <div className='text-semi-color-text-2'>{t('已用')}</div>
                      <div className='mt-1.5 font-semibold text-semi-color-text-0'>{metric.usedText}</div>
                    </div>
                    <div className={isPackageVariant ? 'rounded-xl bg-semi-color-fill-1/80 px-3 py-2.5 text-center' : 'rounded-lg bg-semi-color-fill-1 px-3 py-2.5 text-center'}>
                      <div className='text-semi-color-text-2'>{t('剩余')}</div>
                      <div className='mt-1.5 font-semibold text-semi-color-text-0'>{metric.remainText}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card
            className={isPackageVariant ? '!rounded-2xl w-full border-0 shadow-sm' : '!rounded-xl w-full border-0 shadow-sm'}
            bodyStyle={{ padding: isPackageVariant ? '18px 22px' : '16px 20px' }}
          >
            <Tabs
              className='topup-page-tabs'
              type='card'
              collapsible
              activeKey={activeMainTab}
              onChange={(key) => setActiveMainTab(key)}
            >
              <TabPane
                itemKey='my_subscriptions'
                tab={`${t('我的订阅')} (${allSubscriptions.length})`}
              >
                <div className='space-y-3'>
                  <div className='flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <Tag
                        color={subscriptionView === 'active' ? 'green' : 'white'}
                        shape='circle'
                        size='small'
                      >
                        {activeSubscriptionItems.length} {t('个生效中')}
                      </Tag>
                      {historySubscriptionItems.length > 0 && (
                        <Tag
                          color={subscriptionView === 'history' ? 'orange' : 'white'}
                          shape='circle'
                          size='small'
                        >
                          {historySubscriptionItems.length} {t('个历史记录')}
                        </Tag>
                      )}
                    </div>
                    <div className='flex flex-col gap-2 lg:flex-row lg:items-center'>
                      <Space wrap>
                        <Button
                          theme={subscriptionView === 'active' ? 'solid' : 'outline'}
                          type='primary'
                          size='small'
                          onClick={() => setSubscriptionView('active')}
                        >
                          {t('生效中')}
                        </Button>
                        <Button
                          theme={subscriptionView === 'history' ? 'solid' : 'outline'}
                          type='tertiary'
                          size='small'
                          onClick={() => setSubscriptionView('history')}
                        >
                          {t('历史订阅')}
                        </Button>
                        <Button
                          theme={subscriptionView === 'all' ? 'solid' : 'outline'}
                          type='tertiary'
                          size='small'
                          onClick={() => setSubscriptionView('all')}
                        >
                          {t('全部')}
                        </Button>
                        <Button
                          theme='outline'
                          type='tertiary'
                          size='small'
                          onClick={() => setConsumeLogsFilter({})}
                        >
                          {t('全部订阅消耗')}
                        </Button>
                      </Space>
                      <div className='flex items-center gap-2'>
                        <Select
                          value={displayBillingPreference}
                          onChange={onChangeBillingPreference}
                          size='small'
                          optionList={[
                            {
                              value: 'subscription_first',
                              label: disableSubscriptionPreference
                                ? `${t('优先订阅')} (${t('无生效')})`
                                : t('优先订阅'),
                              disabled: disableSubscriptionPreference,
                            },
                            { value: 'wallet_first', label: t('优先钱包') },
                            {
                              value: 'subscription_only',
                              label: disableSubscriptionPreference
                                ? `${t('仅用订阅')} (${t('无生效')})`
                                : t('仅用订阅'),
                              disabled: disableSubscriptionPreference,
                            },
                            { value: 'wallet_only', label: t('仅用钱包') },
                          ]}
                        />
                        <Button
                          size='small'
                          theme='light'
                          type='tertiary'
                          icon={
                            <RefreshCw
                              size={12}
                              className={refreshing ? 'animate-spin' : ''}
                            />
                          }
                          onClick={handleRefresh}
                          loading={refreshing}
                        />
                      </div>
                    </div>
                  </div>

                  {disableSubscriptionPreference && isSubscriptionPreference && (
                    <Text type='tertiary' size='small' className='block'>
                      {t('已保存偏好为')}
                      {subscriptionPreferenceLabel}
                      {t('，当前无生效订阅，将自动使用钱包')}
                    </Text>
                  )}

                  <Divider margin={8} />

                  {hasAnySubscription ? (
                    visibleSubscriptionItems.length > 0 ? (
                      <Collapse
                        activeKey={expandedSubscriptionKeys}
                        onChange={setExpandedSubscriptionKeys}
                      >
                        {visibleSubscriptionItems.map((item) => (
                          <Collapse.Panel
                            key={item.key}
                            itemKey={item.key}
                            header={renderSubscriptionHeader(item)}
                          >
                            {renderSubscriptionBody(item)}
                          </Collapse.Panel>
                        ))}
                      </Collapse>
                    ) : (
                      <div className='py-8'>
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          title={
                            subscriptionView === 'history'
                              ? t('暂无历史订阅')
                              : t('暂无生效订阅')
                          }
                          description={t('切换筛选或购买新套餐后会显示在这里')}
                        />
                      </div>
                    )
                  ) : (
                    <div className='py-8'>
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        title={t('暂无订阅记录')}
                        description={t('你还没有购买套餐，可前往“套餐列表”选择适合的方案')}
                      />
                    </div>
                  )}
                </div>
              </TabPane>

              <TabPane
                itemKey='plan_list'
                tab={`${t('套餐列表')} (${sortedPlans.length})`}
              >
                <div className='space-y-3'>
                  <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
                    <div>
                      <div className='flex items-center gap-2'>
                        <div className='rounded-lg bg-indigo-500/15 p-1.5'>
                          <Package size={14} className='text-indigo-600 dark:text-indigo-400' />
                        </div>
                        <Text strong>{t('可购买套餐')}</Text>
                      </div>
                      <Text type='tertiary' size='small' className='mt-1 block'>
                        {planSort === 'recommended'
                          ? t('推荐排序综合考虑价格与权益，优先展示更适合多数用户的套餐')
                          : t('先看定位与价格，再进入购买弹窗查看完整支付方式')}
                      </Text>
                    </div>
                    <div className='flex items-center gap-2'>
                      <CalendarClock size={14} className='text-gray-400' />
                      <Select
                        value={planSort}
                        size='small'
                        onChange={setPlanSort}
                        optionList={[
                          { value: 'recommended', label: t('推荐优先') },
                          { value: 'price_asc', label: t('价格从低到高') },
                          { value: 'price_desc', label: t('价格从高到低') },
                          { value: 'value_desc', label: t('权益从多到少') },
                        ]}
                      />
                    </div>
                  </div>

                  <Divider margin={8} />

                  {sortedPlans.length > 0 ? (
                    <CardTable
                      columns={planTableColumns}
                      dataSource={pagedPlans}
                      rowKey={(row) => row?.plan?.id}
                      loading={loading}
                      hidePagination={false}
                      pagination={{
                        currentPage: planPage,
                        pageSize: planPageSize,
                        total: sortedPlans.length,
                        pageSizeOpts: [10, 20, 50],
                        showSizeChanger: true,
                        onPageChange: setPlanPage,
                        onPageSizeChange: (size) => {
                          setPlanPageSize(size);
                          setPlanPage(1);
                        },
                      }}
                      expandedRowRender={renderPlanExpandedContent}
                    />
                  ) : (
                    <div className='py-8'>
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        title={t('暂无可购买套餐')}
                        description={t('管理员暂未上架套餐，请稍后再试或联系管理员')}
                      />
                    </div>
                  )}
                </div>
              </TabPane>
            </Tabs>
          </Card>

        </Space>
      )}
    </>
  );

  return (
    <>
      {withCard ? (
        <Card className={isPackageVariant ? 'package-page-shell !rounded-3xl border border-semi-color-border shadow-md' : '!rounded-2xl shadow-sm border-0'}>{cardContent}</Card>
      ) : (
        <div className='space-y-3'>{cardContent}</div>
      )}

      <SubscriptionPurchaseModal
        t={t}
        visible={open}
        onCancel={closeBuy}
        selectedPlan={selectedPlan}
        paying={paying}
        selectedEpayMethod={selectedEpayMethod}
        setSelectedEpayMethod={setSelectedEpayMethod}
        epayMethods={epayMethods}
        enableOnlineTopUp={enableOnlineTopUp}
        enableStripeTopUp={enableStripeTopUp}
        enableCreemTopUp={enableCreemTopUp}
        purchaseLimitInfo={
          selectedPlan?.plan?.id
            ? {
                limit: Number(selectedPlan?.plan?.max_purchase_per_user || 0),
                count: getPlanPurchaseCount(selectedPlan?.plan?.id),
              }
            : null
        }
        onPayStripe={payStripe}
        onPayCreem={payCreem}
        onPayEpay={payEpay}
      />
      <SubscriptionConsumeLogsModal
        visible={!!consumeLogsFilter}
        onCancel={() => setConsumeLogsFilter(null)}
        initialFilter={consumeLogsFilter}
        planOptions={(plans || []).map((item) => ({
          label: item?.plan?.title || `#${item?.plan?.id}`,
          value: item?.plan?.id,
        }))}
        planMetaMap={planMap}
        endpoint='/api/subscription/self/consume_logs'
        title={
          consumeLogsFilter?.subscriptionId
            ? t('我的订阅消耗记录')
            : t('我的全部订阅消耗')
        }
        allowUserIdFilter={false}
        t={t}
      />
    </>
  );
};

export default SubscriptionPlansCard;
