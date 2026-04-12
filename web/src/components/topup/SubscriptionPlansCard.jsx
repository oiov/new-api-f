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
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Badge,
  Banner,
  Button,
  Card,
  Collapse,
  Divider,
  Empty,
  Input,
  Modal,
  Pagination,
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
import { IconInfoCircle } from '@douyinfe/semi-icons';
import {
  API,
  copy,
  showError,
  showSuccess,
  renderGroup,
  renderGroupTextWithDescription,
  renderQuota,
} from '../../helpers';
import { primeGroupMetadata } from '../../helpers/group';
import { getCurrencyConfig, renderQuotaWithAmount } from '../../helpers/render';
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  Clock,
  Crown,
  History,
  LayoutGrid,
  List,
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
  getSubscriptionDailyPriceDisplay,
  formatSubscriptionSellingDuration,
  getSubscriptionPriceDisplay,
  formatSubscriptionResetPeriod,
  formatSubscriptionResourceLabel,
  getSubscriptionEffectivePrice,
  getSubscriptionPlanMetricItems,
  getSubscriptionRestrictionSummary,
  getSubscriptionResourceType,
  getSubscriptionSaleSummary,
  getSubscriptionUsageSummary,
  isSubscriptionDiscountActive,
} from '../../helpers/subscriptionFormat';

const { Text } = Typography;
const PLAN_URL_PARAM_KEYS = {
  mainTab: 'plan_tab',
  subscriptionView: 'sub_view',
  sort: 'plan_sort',
  series: 'plan_series',
  page: 'plan_page',
  pageSize: 'plan_size',
  view: 'plan_view',
};

function getEpayMethods(payMethods = []) {
  return (payMethods || []).filter(
    (m) => m?.type && m.type !== 'stripe' && m.type !== 'creem',
  );
}

function getSubscriptionPlanDetailPath(planId) {
  if (!planId) return '/pricing?tab=subscription-plans';
  if (typeof window === 'undefined') {
    return `/pricing/subscription-plans/${planId}`;
  }
  const params = new URLSearchParams(window.location.search || '');
  params.delete('tab');
  const query = params.toString();
  return `/pricing/subscription-plans/${planId}${query ? `?${query}` : ''}`;
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
  const isActive =
    subscription?.status === 'active' &&
    Number(subscription?.end_time || 0) > now;
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
    if (
      usageSummary.resourceType === 'request_count' &&
      !usageSummary.periodUnlimited
    ) {
      return `${resetPeriod} ${usageSummary.periodTotal} ${t('次')} · ${t('有效期内不限总量')}`;
    }
    return t('有效期内不限使用');
  }

  if (
    usageSummary.resourceType === 'request_count' &&
    !usageSummary.periodUnlimited
  ) {
    return `${resetPeriod} ${usageSummary.periodTotal} ${t('次')} · ${t('总计')} ${amountText}`;
  }

  if (resetPeriod === t('不重置')) {
    return `${t('有效期内共可用')} ${amountText}`;
  }

  return `${t('每个重置周期可用')} ${amountText} · ${t('重置')} ${resetPeriod}`;
}

function inferSubscriptionPlanSeries(plan) {
  const text = [
    plan?.title,
    plan?.subtitle,
    plan?.upgrade_group,
    ...(Array.isArray(plan?.allowed_groups) ? plan.allowed_groups : []),
    ...(Array.isArray(plan?.allowed_models) ? plan.allowed_models : []),
    ...(Array.isArray(plan?.allowed_vendor_names) ? plan.allowed_vendor_names : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const isClaude =
    text.includes('claude') || text.includes('anthropic') || text.includes('cc-');
  const isCodex =
    text.includes('codex') ||
    text.includes('openai') ||
    text.includes('gpt') ||
    text.includes('o4');

  if (isClaude && !isCodex) return 'claude';
  if (isCodex && !isClaude) return 'codex';
  if (isClaude && isCodex) return 'mixed';
  return 'other';
}

function getSubscriptionSeriesMeta(plan, t) {
  const series = inferSubscriptionPlanSeries(plan);
  if (series === 'claude') {
    return {
      key: 'claude',
      label: t('Claude 系列'),
      color: 'violet',
      showDailyPrice: true,
    };
  }
  if (series === 'codex') {
    return {
      key: 'codex',
      label: t('Codex 系列'),
      color: 'cyan',
      showDailyPrice: true,
    };
  }
  return {
    key: series,
    label: '',
    color: 'grey',
    showDailyPrice: false,
  };
}

function renderScopedValueTag({
  key,
  value,
  color = 'white',
  size = 'small',
  onClick,
}) {
  return (
    <Tag
      key={key}
      color={color}
      shape='circle'
      size={size}
      onClick={onClick}
      className={onClick ? 'pricing-clickable-tag' : undefined}
    >
      {value}
    </Tag>
  );
}

function getConversionRequestStatusMeta(status, t) {
  switch (status) {
    case 'approved':
      return { color: 'green', text: t('已批准') };
    case 'rejected':
      return { color: 'red', text: t('已拒绝') };
    case 'pending':
      return { color: 'orange', text: t('待审核') };
    default:
      return { color: 'grey', text: status || '--' };
  }
}

function getManualDeliveryStatusMeta(status, t) {
  switch (status) {
    case 'pending_delivery':
      return { color: 'orange', text: t('待发放') };
    case 'delivered':
      return { color: 'green', text: t('已发放') };
    case 'rejected':
      return { color: 'red', text: t('已拒绝') };
    default:
      return { color: 'grey', text: status || '--' };
  }
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
  manualDeliveryOrders = [],
  reloadSubscriptionSelf,
  withCard = true,
  initialMainTab = 'my_subscriptions',
  uiVariant = 'subscription',
  showUserSubscriptions = true,
  mainPanelMode = 'tabs',
}) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isPackageVariant = uiVariant === 'package';
  const renderSubscriptionPanel =
    showUserSubscriptions && mainPanelMode !== 'plans';
  const renderPlanListPanel = mainPanelMode !== 'subscriptions';
  const shouldShowMainTabs = renderSubscriptionPanel && renderPlanListPanel;
  const enablePlanUrlSync = isPackageVariant && mainPanelMode === 'plans';
  const initialPlanMainTab =
    mainPanelMode === 'subscriptions'
      ? 'my_subscriptions'
      : mainPanelMode === 'plans'
        ? 'plan_list'
        : searchParams.get(PLAN_URL_PARAM_KEYS.mainTab) || initialMainTab;
  const initialSubscriptionView =
    searchParams.get(PLAN_URL_PARAM_KEYS.subscriptionView) || 'active';
  const initialPlanSort =
    searchParams.get(PLAN_URL_PARAM_KEYS.sort) ||
    (isPackageVariant ? 'recommended' : 'price_asc');
  const initialPlanSeries =
    searchParams.get(PLAN_URL_PARAM_KEYS.series) ||
    (isPackageVariant ? 'claude' : 'all');
  const initialPlanPage = Math.max(
    1,
    Number.parseInt(searchParams.get(PLAN_URL_PARAM_KEYS.page) || '1', 10) || 1,
  );
  const initialPlanPageSize = Math.max(
    1,
    Number.parseInt(searchParams.get(PLAN_URL_PARAM_KEYS.pageSize) || '9', 10) ||
    9,
  );
  const initialPlanViewMode =
    searchParams.get(PLAN_URL_PARAM_KEYS.view) ||
    (isPackageVariant ? 'card' : 'table');
  const [open, setOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [paying, setPaying] = useState(false);
  const [selectedEpayMethod, setSelectedEpayMethod] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [activeMainTab, setActiveMainTab] = useState(initialPlanMainTab);
  const [subscriptionView, setSubscriptionView] = useState(
    initialSubscriptionView,
  );
  const [planSort, setPlanSort] = useState(initialPlanSort);
  const [planSeriesFilter, setPlanSeriesFilter] = useState(initialPlanSeries);
  const [expandedSubscriptionKeys, setExpandedSubscriptionKeys] = useState([]);
  const [consumeLogsFilter, setConsumeLogsFilter] = useState(null);
  const [planPage, setPlanPage] = useState(initialPlanPage);
  const [planPageSize, setPlanPageSize] = useState(initialPlanPageSize);
  const [subscriptionKeyword, setSubscriptionKeyword] = useState('');
  const [subscriptionPlanFilter, setSubscriptionPlanFilter] = useState('all');
  const [subscriptionResourceFilter, setSubscriptionResourceFilter] =
    useState('all');
  const [subscriptionResetFilter, setSubscriptionResetFilter] = useState('all');
  const [conversionPreview, setConversionPreview] = useState(null);
  const [conversionLoading, setConversionLoading] = useState(false);
  const [submittingConversionRequest, setSubmittingConversionRequest] =
    useState(false);

  const epayMethods = useMemo(() => getEpayMethods(payMethods), [payMethods]);
  const [planViewMode, setPlanViewMode] = useState(initialPlanViewMode);

  const openBuy = (p) => {
    setSelectedPlan(p);
    setSelectedEpayMethod(epayMethods?.[0]?.type || '');
    setOpen(true);
  };

  const openPlanDetail = (planId) => {
    navigate(getSubscriptionPlanDetailPath(planId));
  };

  const copyRestrictionValue = async (event, value) => {
    event.stopPropagation();
    if (!value) {
      return;
    }
    if (await copy(value)) {
      showSuccess(t('已复制：') + value);
      return;
    }
    Modal.error({
      title: t('无法复制到剪贴板，请手动复制'),
      content: value,
    });
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
      await loadConversionPreview();
    } finally {
      setRefreshing(false);
    }
  };

  const loadConversionPreview = async () => {
    if (!showUserSubscriptions) {
      setConversionPreview(null);
      return;
    }
    setConversionLoading(true);
    try {
      const res = await API.get('/api/subscription/self/conversion_campaign', {
        skipErrorHandler: true,
      });
      if (res.data?.success) {
        setConversionPreview(res.data.data || null);
      } else {
        setConversionPreview(null);
      }
    } catch {
      setConversionPreview(null);
    } finally {
      setConversionLoading(false);
    }
  };

  const handleSubmitConversionRequest = async () => {
    if (
      !conversionPreview?.can_execute ||
      submittingConversionRequest ||
      !conversionPreview
    ) {
      return;
    }

    Modal.confirm({
      title: t('确认提交套餐转余额申请？'),
      content: (
        <div className='space-y-2 text-sm text-semi-color-text-1'>
          <div>
            {t(
              '提交后会先暂时禁用命中的当前订阅，待审核期间这些套餐将无法继续使用。',
            )}
          </div>
          <div>
            {t(
              '管理员审核通过后才会返还余额并正式作废对应套餐；如果审核拒绝，系统会恢复原套餐。',
            )}
          </div>
          <div>
            {t('申请预计返还')}：
            {renderQuota(conversionPreview.total_convertible_quota || 0)}
          </div>
          <div>
            {t('命中套餐')}：
            {conversionPreview.items?.length || 0} {t('个')}
          </div>
          <div>{t('该操作提交后不可自行撤销。')}</div>
        </div>
      ),
      okText: t('确认提交'),
      cancelText: t('取消'),
      onOk: async () => {
        setSubmittingConversionRequest(true);
        try {
          const res = await API.post(
            '/api/subscription/self/conversion_campaign/request',
            {},
          );
          if (res.data?.success) {
            showSuccess(t('申请已提交，等待管理员审核'));
            await reloadSubscriptionSelf?.();
            await loadConversionPreview();
          } else {
            showError(res.data?.message || t('提交申请失败'));
          }
        } catch {
          showError(t('提交申请失败'));
        } finally {
          setSubmittingConversionRequest(false);
        }
      },
    });
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
  const hasAnySubscription =
    allSubscriptions.length > 0 || manualDeliveryOrders.length > 0;
  const disableSubscriptionPreference = !hasActiveSubscription;

  useEffect(() => {
    if (uiVariant !== 'package' || !showUserSubscriptions) {
      return;
    }
    setActiveMainTab(hasAnySubscription ? 'my_subscriptions' : 'plan_list');
  }, [hasAnySubscription, showUserSubscriptions, uiVariant]);

  useEffect(() => {
    setPlanViewMode(isPackageVariant ? 'card' : 'table');
  }, [isPackageVariant]);

  useEffect(() => {
    loadConversionPreview();
  }, [showUserSubscriptions]);

  useEffect(() => {
    if (!renderPlanListPanel) {
      return;
    }

    const loadGroupMetadata = async () => {
      try {
        const res = await API.get('/api/pricing', { skipErrorHandler: true });
        if (res.data?.success) {
          primeGroupMetadata(
            res.data?.usable_group_meta || res.data?.usable_group || {},
          );
        }
      } catch {
        // noop
      }
    };

    loadGroupMetadata();
  }, [renderPlanListPanel]);

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
    (manualDeliveryOrders || []).forEach((item) => {
      if (item?.order?.fulfillment_status === 'rejected') return;
      const planId = item?.order?.plan_id;
      if (!planId) return;
      map.set(planId, (map.get(planId) || 0) + 1);
    });
    return map;
  }, [allSubscriptions, manualDeliveryOrders]);

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
      .sort(
        (a, b) =>
          (b?.subscription?.end_time || 0) - (a?.subscription?.end_time || 0),
      );
  }, [allSubscriptions, planMap, planTitleMap, t]);

  const normalizedManualDeliveryOrders = useMemo(() => {
    return (manualDeliveryOrders || []).map((item, index) => {
      const order = item?.order || {};
      const plan = item?.plan || planMap.get(order?.plan_id) || null;
      return {
        ...item,
        key: String(order?.id || order?.trade_no || `manual-${index}`),
        order,
        plan,
        title:
          order?.plan_title ||
          plan?.title ||
          `${t('人工发放订单')} #${order?.id || index + 1}`,
        statusMeta: getManualDeliveryStatusMeta(order?.fulfillment_status, t),
      };
    });
  }, [manualDeliveryOrders, planMap, t]);

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

  const filteredVisibleSubscriptionItems = useMemo(() => {
    const keyword = subscriptionKeyword.trim().toLowerCase();
    return visibleSubscriptionItems.filter((item) => {
      const subscription = item?.subscription || {};
      const matchesKeyword =
        !keyword ||
        item?.title?.toLowerCase().includes(keyword) ||
        item?.plan?.subtitle?.toLowerCase().includes(keyword) ||
        String(subscription?.id || '').includes(keyword) ||
        String(subscription?.plan_id || '').includes(keyword);
      const matchesPlan =
        subscriptionPlanFilter === 'all' ||
        String(subscription?.plan_id || '') === String(subscriptionPlanFilter);
      const matchesResource =
        subscriptionResourceFilter === 'all' ||
        item?.resourceType === subscriptionResourceFilter;
      const matchesReset =
        subscriptionResetFilter === 'all' ||
        String(subscription?.reset_period || 'never') ===
        String(subscriptionResetFilter);
      return matchesKeyword && matchesPlan && matchesResource && matchesReset;
    });
  }, [
    visibleSubscriptionItems,
    subscriptionKeyword,
    subscriptionPlanFilter,
    subscriptionResourceFilter,
    subscriptionResetFilter,
  ]);

  const subscriptionPlanOptions = useMemo(() => {
    const items = (plans || [])
      .map((item) => item?.plan)
      .filter((plan) => plan?.id)
      .map((plan) => ({
        label: plan.title || `#${plan.id}`,
        value: String(plan.id),
      }));
    return [{ label: t('全部套餐'), value: 'all' }, ...items];
  }, [plans, t]);

  const resetPeriodOptions = useMemo(
    () => [
      { label: t('全部重置周期'), value: 'all' },
      { label: t('不重置'), value: 'never' },
      { label: t('每天'), value: 'daily' },
      { label: t('每周'), value: 'weekly' },
      { label: t('每月'), value: 'monthly' },
      { label: t('每年'), value: 'yearly' },
      { label: t('自定义'), value: 'custom' },
    ],
    [t],
  );

  const nextExpiringSubscription = useMemo(() => {
    return [...activeSubscriptionItems].sort(
      (a, b) =>
        (a?.subscription?.end_time || 0) - (b?.subscription?.end_time || 0),
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

  const filteredPlans = useMemo(() => {
    const result = [...(plans || [])];
    if (planSeriesFilter === 'all') {
      return result;
    }
    return result.filter((item) => {
      const plan = item?.plan || {};
      const series = inferSubscriptionPlanSeries(plan);
      if (planSeriesFilter === 'mixed') {
        return series === 'mixed';
      }
      return series === planSeriesFilter;
    });
  }, [plans, planSeriesFilter]);

  const sortedPlans = useMemo(() => {
    const result = [...filteredPlans];
    result.sort((a, b) => {
      const planA = a?.plan || {};
      const planB = b?.plan || {};

      if (planSort === 'price_asc') {
        return (
          Number(planA.price_amount || 0) - Number(planB.price_amount || 0)
        );
      }

      if (planSort === 'price_desc') {
        return (
          Number(planB.price_amount || 0) - Number(planA.price_amount || 0)
        );
      }

      if (planSort === 'value_desc') {
        return getPlanValueScore(planB) - getPlanValueScore(planA);
      }

      if (planSort === 'recommended') {
        const sortOrderDiff =
          Number(planB.sort_order || 0) - Number(planA.sort_order || 0);
        if (sortOrderDiff !== 0) return sortOrderDiff;
      }

      const purchaseDiff =
        getPlanPurchaseCount(planB.id) - getPlanPurchaseCount(planA.id);
      if (purchaseDiff !== 0) return purchaseDiff;

      return Number(planA.price_amount || 0) - Number(planB.price_amount || 0);
    });
    return result;
  }, [filteredPlans, planSort, getPlanPurchaseCount]);

  const claudePlanCount = useMemo(
    () =>
      (plans || []).filter(
        (item) => inferSubscriptionPlanSeries(item?.plan || {}) === 'claude',
      ).length,
    [plans],
  );

  useEffect(() => {
    if (!isPackageVariant) return;
    if (planSeriesFilter === 'claude' && claudePlanCount === 0) {
      setPlanSeriesFilter('all');
    }
  }, [claudePlanCount, isPackageVariant, planSeriesFilter]);

  useEffect(() => {
    if (!enablePlanUrlSync) {
      return;
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const set = (key, value, defaultValue) => {
          if (
            value !== undefined &&
            value !== null &&
            String(value) !== String(defaultValue)
          ) {
            next.set(key, String(value));
            return;
          }
          next.delete(key);
        };

        set(PLAN_URL_PARAM_KEYS.mainTab, activeMainTab, initialMainTab);
        set(PLAN_URL_PARAM_KEYS.subscriptionView, subscriptionView, 'active');
        set(
          PLAN_URL_PARAM_KEYS.sort,
          planSort,
          isPackageVariant ? 'recommended' : 'price_asc',
        );
        set(
          PLAN_URL_PARAM_KEYS.series,
          planSeriesFilter,
          isPackageVariant ? 'claude' : 'all',
        );
        set(PLAN_URL_PARAM_KEYS.page, planPage, 1);
        set(PLAN_URL_PARAM_KEYS.pageSize, planPageSize, 9);
        set(
          PLAN_URL_PARAM_KEYS.view,
          planViewMode,
          isPackageVariant ? 'card' : 'table',
        );
        return next;
      },
      { replace: true },
    );
  }, [
    activeMainTab,
    enablePlanUrlSync,
    initialMainTab,
    isPackageVariant,
    planPage,
    planPageSize,
    planSeriesFilter,
    planSort,
    planViewMode,
    setSearchParams,
    subscriptionView,
  ]);

  useEffect(() => {
    setPlanPage(1);
  }, [planSort, planSeriesFilter, filteredPlans.length]);

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

  const recommendedEmptyStatePlans = useMemo(() => {
    const planItems = sortedPlans || [];
    const claudePlans = planItems.filter(
      (item) => getSubscriptionSeriesMeta(item?.plan || {}, t).key === 'claude',
    );
    const codexPlans = planItems.filter(
      (item) => getSubscriptionSeriesMeta(item?.plan || {}, t).key === 'codex',
    );

    const picked = [...claudePlans.slice(0, 3), ...codexPlans.slice(0, 3)];
    if (picked.length >= 6) {
      return picked;
    }

    const existingIds = new Set(picked.map((item) => item?.plan?.id).filter(Boolean));
    const fallback = planItems.filter((item) => !existingIds.has(item?.plan?.id));
    return [...picked, ...fallback].slice(0, 6);
  }, [sortedPlans, t]);

  const overviewItems = [
    {
      label: t('生效中的订阅'),
      value: `${activeSubscriptionItems.length}`,
      helper: hasActiveSubscription
        ? t('正在提供模型权益')
        : t('当前暂无生效套餐'),
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
      const resourceType =
        item?.resourceType === 'request_count' ? 'request_count' : 'quota';
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
            Math.round(
              (Number(item.used || 0) /
                Math.max(Number(item.total || 0), 1)) *
              100,
            ),
          ),
        );

      const formatter =
        item.resourceType === 'request_count'
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
              {t(
                '套餐购买成功后会立即生效，并进入“我的订阅”。生效中的套餐会直接参与后续请求结算。',
              )}
            </div>
            <div>
              {t(
                '你可以在“我的订阅”中查看套餐详情、剩余额度/次数、下次重置时间，以及历史消耗记录。',
              )}
            </div>
            <div>
              {t(
                '按次套餐统计的是成功请求次数；失败请求、鉴权失败、上游报错不会计入成功次数。',
              )}
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
              {t(
                '如果你启用了订阅扣费，请求会优先尝试使用可用订阅；如果当前订阅不足，再按你的扣费偏好决定是否回退到钱包余额。',
              )}
            </div>
            <div>
              {t(
                '按额度套餐会扣减额度余额；按次套餐会在请求成功后扣减成功次数。两种资源类型彼此独立，不会混算。',
              )}
            </div>
            <div>
              {t(
                '带有重置周期的套餐，重置的是“当前周期可用权益”；重置周期从购买生效时间开始按 24 小时、7 天、1 个月、1 年等规则滚动计算；不重置的套餐会持续累计使用，直到到期或耗尽。',
              )}
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
              {t(
                '多个生效套餐可以同时存在。系统会按“最早到期优先”使用订阅权益，先消耗最早过期的套餐，再消耗后到期的套餐。',
              )}
            </div>
            <div>
              {t(
                '如果同时存在多个按次套餐，会优先消耗最早到期的按次套餐；如果存在多个按额度套餐，也会优先消耗最早到期的按额度套餐。',
              )}
            </div>
            <div>
              {t(
                '按次套餐和按额度套餐不会互相覆盖。实际命中哪类套餐，取决于当前请求是否走订阅结算以及系统可用的订阅权益。',
              )}
            </div>
          </div>
        ),
      },
      {
        key: 'faq',
        title: t('常见问题答疑'),
        content: (
          <div className='space-y-2 text-sm text-semi-color-text-1'>
            <div>{t('问：我调整了套餐价格或权益，会影响已购买用户吗？')}</div>
            <div className='text-semi-color-text-2'>
              {t(
                '答：不会。已购买订阅会保留购买时的周期和订阅实例快照，不会被后续套餐配置修改直接覆盖。',
              )}
            </div>
            <div>
              {t('问：删除旧令牌后重新创建同分组令牌，套餐额度/次数会重置吗？')}
            </div>
            <div className='text-semi-color-text-2'>
              {t(
                '答：不会。订阅权益绑定的是用户账户与订阅实例，不绑定某个具体令牌。新建令牌后仍继续使用原有剩余权益。',
              )}
            </div>
            <div>{t('问：为什么有“总量”和“重置周期”同时存在？')}</div>
            <div className='text-semi-color-text-2'>
              {t(
                '答：如果页面显示“每个重置周期可用 X，重置 Y”，其中 X 表示单个重置周期内可用的权益，Y 会从购买生效时间开始按每天、每周、每月、每年或其他自定义周期滚动重置；“有效期”只表示套餐会在何时到期，不表示整个有效期内的总权益。',
              )}
            </div>
          </div>
        ),
      },
    ],
    [t],
  );

  const shouldShowConversionCampaign = useMemo(() => {
    if (!conversionPreview) return false;
    const enabled = Boolean(conversionPreview?.campaign?.enabled);
    const deadline = Number(conversionPreview?.campaign?.deadline || 0);
    const now = Number(conversionPreview?.now || 0);
    if (!enabled) return false;
    if (deadline > 0 && now >= deadline) return false;
    return (conversionPreview?.items || []).length > 0 || !!conversionPreview?.latest_request;
  }, [conversionPreview]);

  const latestConversionRequest = conversionPreview?.latest_request || null;
  const latestConversionRequestStatusMeta = useMemo(() => {
    if (!latestConversionRequest) return null;
    return getConversionRequestStatusMeta(latestConversionRequest.status, t);
  }, [latestConversionRequest, t]);

  const conversionCampaignSummary = useMemo(() => {
    const count = (conversionPreview?.items || []).length;
    const amount = renderQuota(
      Number(conversionPreview?.total_convertible_quota || 0),
    );

    if (latestConversionRequest?.status === 'pending') {
      return t(
        '申请已提交，相关套餐已暂停使用。审核完成后会自动处理余额或恢复套餐。',
      );
    }

    if (count > 0) {
      return t('当前有 {{count}} 个套餐可申请转换，预计返还 {{amount}}。', {
        count,
        amount,
      });
    }

    return t('你最近提交过转换申请，可在这里查看处理进度。');
  }, [conversionPreview, latestConversionRequest, t]);

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
            <div
              className={`flex-shrink-0 rounded-lg p-2 ${item.state === 'active' ? 'bg-green-500/10' : 'bg-gray-500/10'}`}
            >
              <ShieldCheck
                size={18}
                className={
                  item.state === 'active'
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-gray-400'
                }
              />
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
              {t('剩余')}{' '}
              {getUsageDisplayText(item.usageSummary, item.resourceType, t)}
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
              {item.resourceType === 'request_count'
                ? t('次数重置')
                : t('额度重置')}
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
              {item.usageSummary.unlimited ? t('不限') : `${usagePercent}%`}
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
        label:
          item.resourceType === 'request_count' ? t('次数重置') : t('额度重置'),
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
    const metricItems = getSubscriptionPlanMetricItems(plan, t);
    const restrictionSummary = getSubscriptionRestrictionSummary(plan);

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
            {plan?.upgrade_group
              ? renderGroupTextWithDescription(plan.upgrade_group)
              : '--'}
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
              : `${getPlanBenefitDescription(plan, t)} · ${t('有效期')} ${formatSubscriptionSellingDuration(plan, t)}`}
          </div>
        </div>
        {metricItems.map((item) => (
          <div
            key={item.label}
            className='rounded-lg border border-semi-color-border bg-semi-color-fill-0 p-3'
          >
            <div className='text-xs text-gray-500'>{item.label}</div>
            <div className='mt-1 text-sm font-semibold text-semi-color-text-0 break-all'>
              {item.value}
            </div>
          </div>
        ))}
        {(restrictionSummary.groups.length > 0 ||
          restrictionSummary.models.length > 0 ||
          restrictionSummary.vendors.length > 0) && (
            <div className='rounded-lg border border-semi-color-border bg-semi-color-fill-0 p-3 lg:col-span-2'>
              <div className='text-xs text-gray-500'>{t('可用范围')}</div>
              <div className='mt-1 text-sm text-semi-color-text-0 break-all'>
                {restrictionSummary.groups.length > 0
                  ? `${t('分组')}：${restrictionSummary.groups.join(' / ')}`
                  : null}
                {restrictionSummary.models.length > 0
                  ? ` ${t('模型')}：${restrictionSummary.models.join(' / ')}`
                  : null}
                {restrictionSummary.vendors.length > 0
                  ? ` ${t('供应商')}：${restrictionSummary.vendors.join(' / ')}`
                  : null}
              </div>
            </div>
          )}
      </div>
    );
  };

  const renderManualDeliveryValue = (item) => {
    if (!item?.value) return '--';
    return item.value;
  };

  const renderManualDeliveryOrderCard = (item) => {
    const order = item?.order || {};
    const payload = Array.isArray(order?.delivery_payload)
      ? order.delivery_payload
      : [];
    const hasPayload = payload.length > 0;

    return (
      <div
        key={item.key}
        className='rounded-2xl border border-semi-color-border bg-semi-color-fill-0 p-4'
      >
        <div className='flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between'>
          <div className='min-w-0 flex-1'>
            <div className='flex flex-wrap items-center gap-2'>
              <Text strong>{item.title}</Text>
              <Tag color={item.statusMeta.color} shape='circle' size='small'>
                {item.statusMeta.text}
              </Tag>
            </div>
            <div className='mt-1 text-sm text-semi-color-text-2'>
              #{order?.id || '--'} · {order?.trade_no || '--'}
            </div>
            {item?.plan?.subtitle ? (
              <div className='mt-1 text-sm text-semi-color-text-2'>
                {item.plan.subtitle}
              </div>
            ) : null}
          </div>
          <div className='grid grid-cols-1 gap-2 text-sm lg:min-w-[280px]'>
            <div>
              {t('支付完成')}：{formatDateTime(order?.complete_time)}
            </div>
            <div>
              {t('处理时间')}：{formatDateTime(order?.delivered_at)}
            </div>
            {order?.delivery_admin_remark ? (
              <div>
                {t('管理员备注')}：{order.delivery_admin_remark}
              </div>
            ) : null}
          </div>
        </div>

        {order?.fulfillment_status === 'pending_delivery' ? (
          <Banner
            type='warning'
            closeIcon={null}
            className='!mt-3 !rounded-xl'
            description={t(
              '已支付成功，当前套餐正在等待发放。发放完成后可在此查看交付内容。',
            )}
          />
        ) : null}

        {hasPayload ? (
          <div className='mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2'>
            {payload.map((entry) => (
              <div
                key={`${item.key}-${entry.key}`}
                className='rounded-xl border border-semi-color-border bg-white p-3 dark:bg-semi-color-bg-0'
              >
                <div className='flex items-center justify-between gap-2'>
                  <Text strong>{entry.label}</Text>
                  {entry.copyable ? (
                    <Text
                      type='tertiary'
                      size='small'
                      copyable={{ content: entry.value }}
                    >
                      {t('可复制')}
                    </Text>
                  ) : null}
                </div>
                <div className='mt-2 break-all text-sm text-semi-color-text-0'>
                  {renderManualDeliveryValue(entry)}
                </div>
              </div>
            ))}
          </div>
        ) : null}
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
          const seriesMeta = getSubscriptionSeriesMeta(plan, t);
          const isPopular =
            planSort === 'recommended' &&
            sortedPlans.length > 1 &&
            sortedPlans[0]?.plan?.id === plan?.id;

          return (
            <div className='min-w-0 flex items-center gap-3'>
              <div
                className={`flex-shrink-0 rounded-lg p-2 ${isPopular ? 'bg-blue-500/15' : 'bg-semi-color-fill-1'}`}
              >
                <Package
                  size={16}
                  className={
                    isPopular
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-semi-color-text-2'
                  }
                />
              </div>
              <div className='min-w-0'>
                <div className='flex flex-wrap items-center gap-2'>
                  <Text strong>{plan?.title || t('订阅套餐')}</Text>
                  {seriesMeta.label ? (
                    <Tag color={seriesMeta.color} shape='circle' size='small'>
                      {seriesMeta.label}
                    </Tag>
                  ) : null}
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
                  {plan?.delivery_mode === 'manual_delivery' && (
                    <Tag color='cyan' shape='circle' size='small'>
                      {t('人工发放')}
                    </Tag>
                  )}
                </div>
                <Text type='tertiary' size='small'>
                  {plan?.subtitle || t('以套餐配置为准')}
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
          const seriesMeta = getSubscriptionSeriesMeta(plan, t);
          const dailyPriceDisplay = getSubscriptionDailyPriceDisplay(plan);
          const { symbol, effectivePrice, originalPrice } =
            getSubscriptionPriceDisplay(plan);
          const displayPrice = effectivePrice.toFixed(
            Number.isInteger(effectivePrice) ? 0 : 2,
          );
          const activeDiscount = isSubscriptionDiscountActive(plan);
          return (
            <div className='inline-flex flex-col items-start'>
              <div className='text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent'>
                {seriesMeta.showDailyPrice && dailyPriceDisplay ? (
                  <>
                    {symbol}
                    {dailyPriceDisplay.displayDailyPrice}
                  </>
                ) : (
                  <>
                    {symbol}
                    {displayPrice}
                  </>
                )}
              </div>
              {seriesMeta.showDailyPrice && dailyPriceDisplay ? (
                <Text type='secondary' size='small'>
                  {t('约每天成本')}
                </Text>
              ) : null}
              {activeDiscount ? (
                <Text type='tertiary' size='small' delete>
                  {symbol}
                  {originalPrice.toFixed(
                    Number.isInteger(originalPrice) ? 0 : 2,
                  )}
                </Text>
              ) : null}
              <Text type='tertiary' size='small'>
                {seriesMeta.showDailyPrice && dailyPriceDisplay
                  ? t('合计 {{price}} / {{duration}}', {
                      price: `${symbol}${displayPrice}`,
                      duration: formatSubscriptionSellingDuration(plan, t),
                    })
                  : formatSubscriptionSellingDuration(plan, t)}
              </Text>
              {activeDiscount ? (
                <Text type='tertiary' size='small'>
                  {t('截止')}{' '}
                  {new Date(
                    Number(plan?.discount_deadline || 0) * 1000,
                  ).toLocaleString()}
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
          const metricItems = getSubscriptionPlanMetricItems(plan, t);
          return (
            <div className='space-y-1'>
              {metricItems.map((item) => (
                <div
                  key={item.label}
                  className='flex items-center justify-between gap-3'
                >
                  <Text type='tertiary' size='small'>
                    {item.label}
                  </Text>
                  <Text size='small'>{item.value}</Text>
                </div>
              ))}
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
          const restrictionSummary = getSubscriptionRestrictionSummary(plan);
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
                <div>{renderGroup(plan.upgrade_group)}</div>
              )}
              {plan?.delivery_mode === 'manual_delivery' && (
                <Tag color='cyan' shape='circle' size='small'>
                  {t('人工发放')}
                </Tag>
              )}
              {restrictionSummary.groups.map((group) => (
                <div key={`group-${group}`}>{renderGroup(group)}</div>
              ))}
              {restrictionSummary.models.slice(0, 2).map((modelName) => (
                <Tag
                  key={`model-${modelName}`}
                  color='white'
                  shape='circle'
                  size='small'
                >
                  {t('模型')}: {modelName}
                </Tag>
              ))}
              {restrictionSummary.vendors.map((vendorName) => (
                <Tag
                  key={`vendor-${vendorName}`}
                  color='white'
                  shape='circle'
                  size='small'
                >
                  {t('供应商')}: {vendorName}
                </Tag>
              ))}
              {!limit && !plan?.upgrade_group && saleSummary.soldCount <= 0 && (
                <Text type='tertiary' size='small'>
                  {t('暂无')}
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
            <div className='flex flex-col gap-2'>
              <Button
                theme='outline'
                type='tertiary'
                block
                onClick={() => openPlanDetail(plan?.id)}
              >
                {t('查看详情')}
              </Button>
              <Button
                theme='solid'
                type='primary'
                onClick={() => openBuy(record)}
                icon={<ChevronRight size={14} />}
                iconPosition='right'
                block
              >
                {t('立即订阅')}
              </Button>
            </div>
          );
        },
      },
    ],
    [t, getPlanPurchaseCount, planSort, sortedPlans],
  );

  const renderPackagePlanCard = (record, index) => {
    const plan = record?.plan || {};
    const seriesMeta = getSubscriptionSeriesMeta(plan, t);
    const dailyPriceDisplay = getSubscriptionDailyPriceDisplay(plan);
    const count = getPlanPurchaseCount(plan?.id);
    const limit = Number(plan?.max_purchase_per_user || 0);
    const reached = limit > 0 && count >= limit;
    const saleSummary = getSubscriptionSaleSummary(plan);
    const restrictionSummary = getSubscriptionRestrictionSummary(plan);
    const metricItems = getSubscriptionPlanMetricItems(plan, t);
    const { symbol, effectivePrice, originalPrice } =
      getSubscriptionPriceDisplay(plan);
    const displayPrice = effectivePrice.toFixed(
      Number.isInteger(effectivePrice) ? 0 : 2,
    );
    const activeDiscount = isSubscriptionDiscountActive(plan);
    const disabled = reached || saleSummary.soldOut;
    const tip = reached
      ? `${t('已达到购买上限')} (${count}/${limit})`
      : saleSummary.soldOut
        ? t('该套餐已售罄')
        : '';
    const uniqueGroups = Array.from(
      new Set(
        restrictionSummary.groups.filter(
          (item) => item && item !== plan?.upgrade_group,
        ),
      ),
    );
    const uniqueModels = Array.from(new Set(restrictionSummary.models)).slice(0, 2);
    const uniqueVendors = Array.from(new Set(restrictionSummary.vendors)).slice(0, 1);
    const remainingModelCount = Math.max(
      0,
      Array.from(new Set(restrictionSummary.models)).length - uniqueModels.length,
    );

    return (
      <Card
        key={plan?.id || index}
        className='subscription-plan-selling-card !overflow-hidden border-0 shadow-sm'
        bodyStyle={{ padding: 0 }}
      >
        <div className='subscription-plan-selling-card__inner'>
          <div className='subscription-plan-selling-card__top'>
            <div className='flex items-start justify-between gap-3'>
              <div className='subscription-plan-selling-card__summary min-w-0 flex-1'>
                <div className='subscription-plan-selling-card__title-row flex flex-wrap items-center gap-2'>
                  <Text strong className='subscription-plan-selling-card__title text-base'>
                    {plan?.title || t('订阅套餐')}
                  </Text>
                  {seriesMeta.label && (
                    <Tag color={seriesMeta.color} shape='circle' size='small'>
                      {seriesMeta.label}
                    </Tag>
                  )}
                  {saleSummary.soldOut && (
                    <Tag color='red' shape='circle' size='small'>
                      {t('已售罄')}
                    </Tag>
                  )}
                  {reached && !saleSummary.soldOut && (
                    <Tag color='orange' shape='circle' size='small'>
                      {t('已达上限')}
                    </Tag>
                  )}
                </div>
                <Text
                  type='tertiary'
                  size='small'
                  className='subscription-plan-selling-card__subtitle mt-2 block leading-6'
                >
                  {plan?.subtitle || t('以套餐配置为准')}
                </Text>
                {seriesMeta.showDailyPrice ? (
                  <Text
                    type='secondary'
                    size='small'
                    className='subscription-plan-selling-card__hint mt-2 block leading-5'
                  >
                    {t('支付成功后自动生效。')}
                  </Text>
                ) : (
                  <span className='subscription-plan-selling-card__hint-spacer' />
                )}
              </div>
              <div className='rounded-2xl bg-white/80 p-2 shadow-sm dark:bg-white/10'>
                <Package
                  size={18}
                  className='text-semi-color-text-1'
                />
              </div>
            </div>

            <div className='subscription-plan-selling-card__price-row mt-5 flex items-end justify-between gap-3'>
              <div className='min-w-0 flex-1'>
                <div className='subscription-plan-selling-card__price'>
                  {seriesMeta.showDailyPrice && dailyPriceDisplay ? (
                    <>
                      {symbol}
                      {dailyPriceDisplay.displayDailyPrice}
                    </>
                  ) : (
                    <>
                      {symbol}
                      {displayPrice}
                    </>
                  )}
                  <span className='subscription-plan-selling-card__duration'>
                    /{' '}
                    {seriesMeta.showDailyPrice && dailyPriceDisplay
                      ? t('天')
                      : formatSubscriptionSellingDuration(plan, t)}
                  </span>
                </div>
                {seriesMeta.showDailyPrice && dailyPriceDisplay ? (
                  <Text type='secondary' size='small' className='block'>
                    {t('合计 {{price}} / {{duration}}', {
                      price: `${symbol}${displayPrice}`,
                      duration: formatSubscriptionSellingDuration(plan, t),
                    })}
                  </Text>
                ) : null}
                {activeDiscount ? (
                  <Text type='tertiary' size='small' delete>
                    {symbol}
                    {originalPrice.toFixed(
                      Number.isInteger(originalPrice) ? 0 : 2,
                    )}
                  </Text>
                ) : null}
              </div>
              <div className='subscription-plan-selling-card__sale-meta text-right text-xs text-semi-color-text-2'>
                <div>
                  {saleSummary.unlimited
                    ? `${t('已售')} ${saleSummary.soldCount}`
                    : `${t('剩余')} ${saleSummary.remainingSaleCount}`}
                </div>
                {limit > 0 && <div>{`${t('限购')} ${limit}`}</div>}
              </div>
            </div>
          </div>

          <div className='subscription-plan-selling-card__metrics'>
            {metricItems.slice(0, 4).map((item) => (
              <div
                key={item.key}
                className='subscription-plan-selling-card__metric'
              >
                <div className='subscription-plan-selling-card__metric-label'>
                  {item.label}
                </div>
                <div className='subscription-plan-selling-card__metric-value'>
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          <div className='subscription-plan-selling-card__bottom'>
            <div className='subscription-plan-selling-card__restriction-head'>
              <div className='subscription-plan-selling-card__restriction-title'>
                <IconInfoCircle size='small' />
                <span>{t('适用范围')}</span>
              </div>
            </div>
            {plan?.upgrade_group || uniqueGroups.length > 0 ? (
              <div className='subscription-plan-selling-card__restriction-row'>
                <div className='subscription-plan-selling-card__restriction-label'>
                  {plan?.upgrade_group ? t('分组') : t('可用分组')}
                </div>
                <div className='subscription-plan-selling-card__tag-group'>
                  {plan?.upgrade_group ? renderGroup(plan.upgrade_group) : null}
                  {uniqueGroups.map((item) => (
                    <React.Fragment key={`group-fragment-${item}`}>
                      {renderGroup(item)}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ) : null}
            {uniqueModels.length > 0 || uniqueVendors.length > 0 ? (
              <div className='subscription-plan-selling-card__restriction-row'>
                <div className='subscription-plan-selling-card__restriction-label'>
                  {t('模型与供应商')}
                </div>
                <div className='subscription-plan-selling-card__tag-group'>
                  {uniqueModels.map((item) =>
                    renderScopedValueTag({
                      key: `model-${item}`,
                      value: item,
                      color: 'grey',
                      onClick: (event) => copyRestrictionValue(event, item),
                    }),
                  )}
                  {remainingModelCount > 0 ? (
                    <Tag color='orange' shape='circle' size='small'>
                      {t('另有 {{count}} 个模型', { count: remainingModelCount })}
                    </Tag>
                  ) : null}
                  {uniqueVendors.map((item) =>
                    renderScopedValueTag({
                      key: `vendor-${item}`,
                      value: item,
                      color: 'green',
                      onClick: (event) => copyRestrictionValue(event, item),
                    }),
                  )}
                </div>
              </div>
            ) : null}
            {!plan?.upgrade_group &&
              uniqueGroups.length === 0 &&
              uniqueModels.length === 0 &&
              uniqueVendors.length === 0 ? (
              <div className='subscription-plan-selling-card__restriction-empty'>
                {t('适用范围更灵活')}
              </div>
            ) : null}
            <div className='grid grid-cols-2 gap-2'>
              <Button
                theme='outline'
                type='tertiary'
                block
                onClick={() => openPlanDetail(plan?.id)}
              >
                {t('查看详情')}
              </Button>
              {disabled ? (
                <Tooltip content={tip} position='top'>
                  <Button theme='solid' type='primary' disabled block>
                    {saleSummary.soldOut ? t('已售罄') : t('已达上限')}
                  </Button>
                </Tooltip>
              ) : (
                <Button
                  theme='solid'
                  type='primary'
                  block
                  onClick={() => openBuy(record)}
                  icon={<ChevronRight size={14} />}
                  iconPosition='right'
                >
                  {t('立即订阅')}
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>
    );
  };

  const renderSubscriptionEmptyState = ({
    title,
    description,
    showPurchaseGuide = false,
  }) => {
    if (!showPurchaseGuide) {
      return (
        <div className='py-8'>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            title={title}
            description={description}
          />
        </div>
      );
    }

    return (
      <div className='rounded-2xl border border-blue-100 bg-[linear-gradient(180deg,rgba(239,246,255,0.9)_0%,rgba(255,255,255,1)_40%)] p-6 shadow-sm'>
        <div className='mx-auto flex max-w-4xl flex-col gap-6'>
          <div className='text-center'>
            <div className='inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600'>
              <Sparkles size={14} />
              {t('先选一个适合你的套餐')}
            </div>
            <div className='mt-4 text-3xl font-semibold text-semi-color-text-0'>
              {title}
            </div>
            <Text type='tertiary' size='small' className='mt-3 block text-base'>
              {description}
            </Text>
          </div>

          <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3'>
            {recommendedEmptyStatePlans.map((record, index) => {
              const plan = record?.plan || {};
              const seriesMeta = getSubscriptionSeriesMeta(plan, t);
              const dailyPriceDisplay = getSubscriptionDailyPriceDisplay(plan);
              const { symbol, effectivePrice } = getSubscriptionPriceDisplay(plan);
              const displayPrice = Number(effectivePrice || 0).toFixed(
                Number.isInteger(effectivePrice) ? 0 : 2,
              );
              return (
                <div
                  key={plan?.id || index}
                  className='rounded-2xl border border-[var(--semi-color-border)] bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.05)]'
                >
                  <div className='flex items-start justify-between gap-3'>
                    <div className='min-w-0'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <Text strong>{plan?.title || t('订阅套餐')}</Text>
                        {seriesMeta.label ? (
                          <Tag color={seriesMeta.color} shape='circle' size='small'>
                            {seriesMeta.label}
                          </Tag>
                        ) : null}
                      </div>
                      <Text
                        type='tertiary'
                        size='small'
                        className='mt-2 block leading-6'
                      >
                        {plan?.subtitle || getPlanBenefitDescription(plan, t)}
                      </Text>
                    </div>
                    <div className='rounded-xl bg-blue-50 p-2 text-blue-600'>
                      <Package size={16} />
                    </div>
                  </div>
                  <div className='mt-4'>
                    <div className='text-3xl font-semibold text-semi-color-text-0'>
                      {seriesMeta.showDailyPrice && dailyPriceDisplay
                        ? `${symbol}${dailyPriceDisplay.displayDailyPrice}`
                        : `${symbol}${displayPrice}`}
                      <span className='ml-1 text-base font-medium text-semi-color-text-2'>
                        /{' '}
                        {seriesMeta.showDailyPrice && dailyPriceDisplay
                          ? t('天')
                          : formatSubscriptionSellingDuration(plan, t)}
                      </span>
                    </div>
                    <Text type='tertiary' size='small' className='mt-1 block'>
                      {seriesMeta.showDailyPrice && dailyPriceDisplay
                        ? t('合计 {{price}} / {{duration}}', {
                            price: `${symbol}${displayPrice}`,
                            duration: formatSubscriptionSellingDuration(plan, t),
                          })
                        : getPlanBenefitDescription(plan, t)}
                    </Text>
                  </div>
                  <Button
                    theme='solid'
                    type='primary'
                    block
                    className='mt-4'
                    onClick={() => openBuy(record)}
                  >
                    {t('立即购买这个套餐')}
                  </Button>
                </div>
              );
            })}
          </div>

          <div className='flex flex-col items-center justify-center gap-3 sm:flex-row'>
            <Button
              theme='solid'
              type='primary'
              size='large'
              onClick={() => navigate('/pricing?currency=CNY&plan_series=all')}
            >
              {t('查看全部套餐')}
            </Button>
            <Button
              theme='outline'
              type='tertiary'
              size='large'
              onClick={() => setActiveMainTab('plan_list')}
            >
              {t('切换到套餐列表')}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const cardContent = (
    <>
      {loading ? (
        <div className={isPackageVariant ? 'space-y-5' : 'space-y-4'}>
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4'>
            {[1, 2, 3, 4].map((i) => (
              <Card
                key={i}
                className={
                  isPackageVariant
                    ? '!rounded-2xl border-0 shadow-sm'
                    : '!rounded-xl border-0 shadow-sm'
                }
              >
                <div className='flex items-start justify-between'>
                  <div className='flex-1'>
                    <Skeleton.Title
                      active
                      style={{ width: '50%', height: 12, marginBottom: 12 }}
                    />
                    <Skeleton.Title
                      active
                      style={{ width: '70%', height: 24, marginBottom: 8 }}
                    />
                    <Skeleton.Title
                      active
                      style={{ width: '60%', height: 12 }}
                    />
                  </div>
                  <Skeleton.Avatar active size='small' shape='square' />
                </div>
              </Card>
            ))}
          </div>
          {!isPackageVariant && (
            <>
              <Card
                className='!rounded-xl w-full border-0 shadow-sm'
                bodyStyle={{ padding: '12px' }}
              >
                <Skeleton.Paragraph active rows={5} />
              </Card>
              <Card
                className='!rounded-xl w-full border-0 shadow-sm'
                bodyStyle={{ padding: '12px' }}
              >
                <Skeleton.Paragraph active rows={4} />
              </Card>
            </>
          )}
        </div>
      ) : (
        <Space vertical style={{ width: '100%' }} spacing={12}>
          <Card
            className='!rounded-xl w-full border-0 shadow-sm'
            bodyStyle={{ padding: '16px 20px' }}
          >
            <Tabs
              className={`topup-page-tabs${
                shouldShowMainTabs ? '' : ' topup-page-tabs--single'
              }`}
              type='card'
              collapsible
              activeKey={
                shouldShowMainTabs
                  ? activeMainTab
                  : renderSubscriptionPanel
                    ? 'my_subscriptions'
                    : 'plan_list'
              }
              onChange={(key) => {
                if (!shouldShowMainTabs) {
                  return;
                }
                setActiveMainTab(key);
              }}
            >
              {renderSubscriptionPanel && (
                <TabPane
                  itemKey='my_subscriptions'
                  tab={`${t('我的订阅')} (${allSubscriptions.length})`}
                >
                  <div className='space-y-3'>
                    <div className='flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <Tag
                          color={
                            subscriptionView === 'active' ? 'green' : 'white'
                          }
                          shape='circle'
                          size='small'
                        >
                          {activeSubscriptionItems.length} {t('个生效中')}
                        </Tag>
                        {historySubscriptionItems.length > 0 && (
                          <Tag
                            color={
                              subscriptionView === 'history'
                                ? 'orange'
                                : 'white'
                            }
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
                            theme={
                              subscriptionView === 'active'
                                ? 'solid'
                                : 'outline'
                            }
                            type='primary'
                            size='small'
                            onClick={() => setSubscriptionView('active')}
                          >
                            {t('生效中')}
                          </Button>
                          <Button
                            theme={
                              subscriptionView === 'history'
                                ? 'solid'
                                : 'outline'
                            }
                            type='tertiary'
                            size='small'
                            onClick={() => setSubscriptionView('history')}
                          >
                            {t('历史订阅')}
                          </Button>
                          <Button
                            theme={
                              subscriptionView === 'all' ? 'solid' : 'outline'
                            }
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

                    <div className='flex flex-col gap-2 rounded-2xl border border-semi-color-border bg-semi-color-fill-0 p-3 xl:flex-row xl:items-center'>
                      <Input
                        value={subscriptionKeyword}
                        onChange={setSubscriptionKeyword}
                        placeholder={t('搜索套餐名 / 说明 / 订阅 ID')}
                        showClear
                        className='min-w-0 flex-1'
                      />
                      <div className='grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3'>
                        <Select
                          value={subscriptionPlanFilter}
                          onChange={setSubscriptionPlanFilter}
                          size='small'
                          optionList={subscriptionPlanOptions}
                        />
                        <Select
                          value={subscriptionResourceFilter}
                          onChange={setSubscriptionResourceFilter}
                          size='small'
                          optionList={[
                            { value: 'all', label: t('全部资源类型') },
                            { value: 'quota', label: t('按额度') },
                            { value: 'request_count', label: t('按次数') },
                          ]}
                        />
                        <Select
                          value={subscriptionResetFilter}
                          onChange={setSubscriptionResetFilter}
                          size='small'
                          optionList={resetPeriodOptions}
                        />
                      </div>
                      <Button
                        theme='outline'
                        type='tertiary'
                        size='small'
                        onClick={() => {
                          setSubscriptionKeyword('');
                          setSubscriptionPlanFilter('all');
                          setSubscriptionResourceFilter('all');
                          setSubscriptionResetFilter('all');
                        }}
                      >
                        {t('清空筛选')}
                      </Button>
                    </div>

                    {disableSubscriptionPreference &&
                      isSubscriptionPreference && (
                        <Text type='tertiary' size='small' className='block'>
                          {t('已保存偏好为')}
                          {subscriptionPreferenceLabel}
                          {t('，当前无生效订阅，将自动使用钱包')}
                        </Text>
                      )}

                    {shouldShowConversionCampaign && (
                      <Card
                        className='!rounded-2xl border border-amber-200 bg-amber-50/70 shadow-none'
                        bodyStyle={{ padding: '16px' }}
                      >
                        <div className='space-y-3'>
                          <div className='flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between'>
                            <div className='min-w-0 space-y-1'>
                              <Space wrap>
                                <Text strong>
                                  {conversionPreview?.campaign?.title ||
                                    t('套餐转余额')}
                                </Text>
                                <Tag
                                  color={
                                    latestConversionRequestStatusMeta?.color ||
                                    (conversionPreview?.can_execute
                                      ? 'green'
                                      : 'grey')
                                  }
                                  shape='circle'
                                  size='small'
                                >
                                  {latestConversionRequestStatusMeta?.text ||
                                    (conversionPreview?.can_execute
                                      ? t('可申请')
                                      : conversionPreview?.closed_reason ||
                                      t('仅展示记录'))}
                                </Tag>
                                {conversionLoading && (
                                  <Tag color='white' shape='circle' size='small'>
                                    {t('加载中')}
                                  </Tag>
                                )}
                              </Space>
                              <Text type='tertiary' size='small'>
                                {conversionCampaignSummary}
                              </Text>
                            </div>
                            <div className='grid grid-cols-1 gap-2 sm:grid-cols-3'>
                              <div className='rounded-lg bg-white/80 p-3'>
                                <div className='text-xs text-gray-500'>
                                  {t('活动截止')}
                                </div>
                                <div className='mt-1 font-medium'>
                                  {formatDateTime(
                                    conversionPreview?.campaign?.deadline,
                                  )}
                                </div>
                              </div>
                              <div className='rounded-lg bg-white/80 p-3'>
                                <div className='text-xs text-gray-500'>
                                  {t('申请预计返还')}
                                </div>
                                <div className='mt-1 font-medium'>
                                  {renderQuota(
                                    conversionPreview?.total_convertible_quota ||
                                    0,
                                  )}
                                </div>
                              </div>
                              <div className='rounded-lg bg-white/80 p-3'>
                                <div className='text-xs text-gray-500'>
                                  {t('可申请套餐')}
                                </div>
                                <div className='mt-1 font-medium'>
                                  {(conversionPreview?.items || []).length} {t('个')}
                                </div>
                              </div>
                            </div>
                          </div>

                          <Banner
                            type='warning'
                            closeIcon={null}
                            description={
                              <div className='space-y-1 text-sm'>
                                <div>
                                  {t('提交申请后，相关套餐会暂停使用。')}
                                </div>
                                <div>
                                  {t(
                                    '审核通过后，剩余额度将按规则转换为账户余额，原套餐失效。',
                                  )}
                                </div>
                                <div>
                                  {t('审核拒绝后，套餐会恢复使用。')}
                                </div>
                              </div>
                            }
                          />

                          {(conversionPreview?.campaign?.conversion_rule ||
                            (conversionPreview?.campaign?.billing_rules || [])
                              .length > 0 ||
                            (conversionPreview?.campaign?.charge_rules || [])
                              .length > 0) && (
                              <Collapse>
                                <Collapse.Panel
                                  itemKey='conversion-rules'
                                  header={t('详细规则与计算方式')}
                                >
                                  <div className='space-y-2 text-sm text-semi-color-text-1'>
                                    {conversionPreview?.campaign?.conversion_rule ? (
                                      <div>
                                        {conversionPreview.campaign.conversion_rule}
                                      </div>
                                    ) : null}
                                    {(
                                      conversionPreview?.campaign?.billing_rules ||
                                      []
                                    ).map((rule) => (
                                      <div key={rule}>• {rule}</div>
                                    ))}
                                    {(
                                      conversionPreview?.campaign?.charge_rules ||
                                      []
                                    ).map((rule) => (
                                      <div key={rule}>• {rule}</div>
                                    ))}
                                  </div>
                                </Collapse.Panel>
                              </Collapse>
                            )}

                          {(conversionPreview?.items || []).length > 0 && (
                            <div className='rounded-xl bg-white/70 p-3'>
                              <div className='mb-2 flex items-center justify-between'>
                                <Text strong>{t('本次可申请转换的套餐')}</Text>
                                <Text type='tertiary' size='small'>
                                  {(conversionPreview?.items || []).length} {t('个')}
                                </Text>
                              </div>
                              <div className='space-y-2'>
                                {(conversionPreview?.items || []).map((item) => (
                                  <div
                                    key={item.user_subscription_id}
                                    className='rounded-lg border border-semi-color-border bg-semi-color-bg-0 p-3'
                                  >
                                    <div className='flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between'>
                                      <div>
                                        <div className='font-medium'>
                                          {item.plan_title}
                                        </div>
                                        <Text type='tertiary' size='small'>
                                          #{item.user_subscription_id} · {t('来源')}{' '}
                                          {item.source || '--'}
                                        </Text>
                                        <Text
                                          type='tertiary'
                                          size='small'
                                          className='block'
                                        >
                                          {t('购买价格')} {renderQuotaWithAmount(
                                            Number(item.price_basis_amount || 0),
                                          )}{' '}
                                          · {t('仅统计有支付订单的套餐')}
                                        </Text>
                                      </div>
                                      <div className='text-left lg:text-right'>
                                        <div className='font-semibold'>
                                          {renderQuota(
                                            item.convertible_quota || 0,
                                          )}
                                        </div>
                                        <Text type='tertiary' size='small'>
                                          {t('折算比例')} {Math.round(
                                            Number(item.remaining_ratio || 0) *
                                            10000,
                                          ) / 100}
                                          %
                                        </Text>
                                        <Text
                                          type='tertiary'
                                          size='small'
                                          className='block'
                                        >
                                          {t(
                                            '已使用 {{days}} 天，计费 {{billableDays}} 天',
                                            {
                                              days: Number(item.used_days || 0),
                                              billableDays: Number(
                                                item.billable_used_days || 0,
                                              ),
                                            },
                                          )}
                                        </Text>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {conversionPreview?.latest_request && (
                            <div className='rounded-xl bg-white/70 p-3'>
                              <Space wrap align='center'>
                                <Text strong>{t('申请进度')}</Text>
                                <Tag
                                  color={latestConversionRequestStatusMeta?.color}
                                  shape='circle'
                                  size='small'
                                >
                                  {latestConversionRequestStatusMeta?.text}
                                </Tag>
                              </Space>
                              <div className='mt-2 grid grid-cols-1 gap-2 text-sm lg:grid-cols-2'>
                                <div>
                                  {t('申请单')} #{conversionPreview.latest_request.id}
                                </div>
                                <div>
                                  {t('申请时间')}：
                                  {formatDateTime(
                                    conversionPreview.latest_request.create_time,
                                  )}
                                </div>
                                {conversionPreview.latest_request.disabled_at ? (
                                  <div>
                                    {t('禁用时间')}：
                                    {formatDateTime(
                                      conversionPreview.latest_request
                                        .disabled_at,
                                    )}
                                  </div>
                                ) : null}
                                {conversionPreview.latest_request.admin_remark ? (
                                  <div>
                                    {t('管理员备注')}：
                                    {conversionPreview.latest_request.admin_remark}
                                  </div>
                                ) : null}
                              </div>
                              <Text
                                type='tertiary'
                                size='small'
                                className='mt-2 block'
                              >
                                {conversionPreview.latest_request.status ===
                                  'pending'
                                  ? t(
                                    '申请提交后，相关套餐会暂停使用，直到审核通过或拒绝。',
                                  )
                                  : conversionPreview.latest_request.status ===
                                    'approved'
                                    ? t(
                                      '申请已通过，系统会把核准后的额度转入账户余额，原套餐失效。',
                                    )
                                    : t(
                                      '申请未通过，系统会恢复原套餐，你可以继续使用。',
                                    )}
                              </Text>
                            </div>
                          )}

                          <div className='flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between'>
                            <Text type='tertiary' size='small'>
                              {conversionPreview?.closed_reason ||
                                t('管理员可审核并调整最终返还比例或额度。')}
                            </Text>
                            <Button
                              theme='solid'
                              type='warning'
                              loading={submittingConversionRequest}
                              disabled={
                                !conversionPreview?.can_execute ||
                                submittingConversionRequest ||
                                conversionPreview?.latest_request?.status ===
                                'pending'
                              }
                              onClick={handleSubmitConversionRequest}
                            >
                              {conversionPreview?.latest_request?.status ===
                                'pending'
                                ? t('申请审核中')
                                : t('提交套餐转余额申请')}
                            </Button>
                          </div>
                        </div>
                      </Card>
                    )}

                    {normalizedManualDeliveryOrders.length > 0 ? (
                      <Card
                        className='!rounded-2xl border border-sky-200 bg-sky-50/70 shadow-none'
                        bodyStyle={{ padding: '16px' }}
                      >
                        <div className='space-y-3'>
                          <div className='flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between'>
                            <div>
                              <Text strong>{t('人工发放订单')}</Text>
                              <div className='mt-1 text-sm text-semi-color-text-2'>
                                {t(
                                  '这里会显示待发放或已发放完成的订单内容。',
                                )}
                              </div>
                            </div>
                            <Tag color='blue' shape='circle' size='small'>
                              {normalizedManualDeliveryOrders.length} {t('个订单')}
                            </Tag>
                          </div>
                          <div className='space-y-3'>
                            {normalizedManualDeliveryOrders.map((item) =>
                              renderManualDeliveryOrderCard(item),
                            )}
                          </div>
                        </div>
                      </Card>
                    ) : null}

                    <Divider margin={8} />

                    {hasAnySubscription ? (
                      filteredVisibleSubscriptionItems.length > 0 ? (
                        <Collapse
                          activeKey={expandedSubscriptionKeys}
                          onChange={setExpandedSubscriptionKeys}
                        >
                          {filteredVisibleSubscriptionItems.map((item) => (
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
                        renderSubscriptionEmptyState({
                          title:
                            subscriptionView === 'history'
                              ? t('暂无历史订阅')
                              : t('暂无生效订阅'),
                          description:
                            subscriptionKeyword ||
                            subscriptionPlanFilter !== 'all' ||
                            subscriptionResourceFilter !== 'all' ||
                            subscriptionResetFilter !== 'all'
                              ? t('当前组合筛选下没有匹配结果')
                              : t('调整筛选条件后，或购买套餐后，会显示在这里。'),
                          showPurchaseGuide:
                            !subscriptionKeyword &&
                            subscriptionPlanFilter === 'all' &&
                            subscriptionResourceFilter === 'all' &&
                            subscriptionResetFilter === 'all' &&
                            subscriptionView !== 'history' &&
                            recommendedEmptyStatePlans.length > 0,
                        })
                      )
                    ) : (
                      renderSubscriptionEmptyState({
                        title: t('暂无订阅记录'),
                        description: t(
                          '现在开通套餐后，请求会优先走订阅权益，成本和体验都会更稳定。',
                        ),
                        showPurchaseGuide: recommendedEmptyStatePlans.length > 0,
                      })
                    )}
                  </div>
                </TabPane>
              )}

              {renderPlanListPanel && (
                <TabPane
                  itemKey='plan_list'
                  tab={`${t('套餐列表')} (${sortedPlans.length})`}
                >
                  <div className='space-y-3'>
                    <div className='subscription-plan-selling-toolbar'>
                      <div className='subscription-plan-selling-toolbar__tabs'>
                        <Tabs
                          type='button'
                          collapsible={false}
                          activeKey={planSeriesFilter}
                          onChange={setPlanSeriesFilter}
                        >
                          <TabPane
                            itemKey='all'
                            tab={`${t('全部系列')} (${plans.length})`}
                          />
                          <TabPane
                            itemKey='claude'
                            tab={t('Claude 系列')}
                          />
                          <TabPane
                            itemKey='codex'
                            tab={t('Codex 系列')}
                          />
                          <TabPane
                            itemKey='mixed'
                            tab={t('混合系列')}
                          />
                        </Tabs>
                      </div>
                      <div className='subscription-plan-selling-toolbar__controls'>
                        <div className='subscription-plan-selling-toolbar__switch'>
                          <Tooltip content={t('卡片视图')}>
                            <Button
                              theme={
                                planViewMode === 'card' ? 'solid' : 'borderless'
                              }
                              type={
                                planViewMode === 'card' ? 'primary' : 'tertiary'
                              }
                              icon={<LayoutGrid size={14} />}
                              size='small'
                              onClick={() => setPlanViewMode('card')}
                              aria-label={t('卡片视图')}
                            />
                          </Tooltip>
                          <Tooltip content={t('列表视图')}>
                            <Button
                              theme={
                                planViewMode === 'table' ? 'solid' : 'borderless'
                              }
                              type={
                                planViewMode === 'table' ? 'primary' : 'tertiary'
                              }
                              icon={<List size={14} />}
                              size='small'
                              onClick={() => setPlanViewMode('table')}
                              aria-label={t('列表视图')}
                            />
                          </Tooltip>
                        </div>
                        <div className='subscription-plan-selling-toolbar__sort'>
                          <Select
                            value={planSort}
                            size='small'
                            onChange={setPlanSort}
                            optionList={[
                              { value: 'price_asc', label: t('价格从低到高') },
                              { value: 'price_desc', label: t('价格从高到低') },
                              { value: 'value_desc', label: t('权益从多到少') },
                              { value: 'recommended', label: t('推荐优先') },
                            ]}
                          />
                        </div>
                      </div>
                    </div>

                    {sortedPlans.length > 0 ? (
                      planViewMode === 'card' ? (
                        <div className='subscription-plan-selling-content space-y-4'>
                          <div className='subscription-plan-selling-grid'>
                            {pagedPlans.map((record, index) =>
                              renderPackagePlanCard(record, index),
                            )}
                          </div>
                          <div className='subscription-plan-selling-pagination'>
                            <Text type='tertiary' size='small'>
                              {t(
                                '显示第 {{start}} 条-第 {{end}} 条，共 {{total}} 条',
                                {
                                  start:
                                    sortedPlans.length === 0
                                      ? 0
                                      : (planPage - 1) * planPageSize + 1,
                                  end: Math.min(
                                    planPage * planPageSize,
                                    sortedPlans.length,
                                  ),
                                  total: sortedPlans.length,
                                },
                              )}
                            </Text>
                            <div className='flex justify-end'>
                              <Select
                                value={planPageSize}
                                size='small'
                                onChange={(size) => {
                                  setPlanPageSize(size);
                                  setPlanPage(1);
                                }}
                                optionList={[6, 9, 12, 18].map((size) => ({
                                  value: size,
                                  label: `${t('每页')} ${size}`,
                                }))}
                              />
                            </div>
                          </div>
                          <div className='flex flex-col gap-3 border-t border-semi-color-border pt-4 lg:flex-row lg:items-center lg:justify-between'>
                            <Pagination
                              currentPage={planPage}
                              pageSize={planPageSize}
                              total={sortedPlans.length}
                              pageSizeOptions={[6, 9, 12, 18]}
                              showSizeChanger={false}
                              onPageChange={setPlanPage}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className='subscription-plan-selling-content'>
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
                        </div>
                      )
                    ) : (
                      <div className='py-8'>
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          title={t('暂无可购买套餐')}
                          description={t(
                            '管理员暂未上架套餐，请稍后再试或联系管理员',
                          )}
                        />
                      </div>
                    )}
                  </div>
                </TabPane>
              )}
            </Tabs>
          </Card>
        </Space>
      )}
    </>
  );

  return (
    <>
      {withCard ? (
        <Card
          className={
            isPackageVariant
              ? 'package-page-shell !rounded-3xl border border-semi-color-border shadow-md'
              : '!rounded-2xl shadow-sm border-0'
          }
        >
          {cardContent}
        </Card>
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
