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

import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Banner,
  Button,
  Card,
  Descriptions,
  Empty,
  Modal,
  Skeleton,
  Space,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import {
  ArrowLeft,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Layers3,
  Package,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import SeoMeta from '../../components/common/seo/SeoMeta';
import SubscriptionPurchaseModal from '../../components/topup/modals/SubscriptionPurchaseModal';
import { StatusContext } from '../../context/Status';
import { API, copy, getUserData, renderGroup, renderQuota, showError, showSuccess } from '../../helpers';
import {
  formatSubscriptionSettlementPrice,
  getSubscriptionDailyPriceDisplay,
  formatSubscriptionDuration,
  formatSubscriptionSellingDuration,
  getSubscriptionPerRequestPriceDisplay,
  getSubscriptionPriceDisplay,
  formatSubscriptionResourceLabel,
  formatSubscriptionResetHint,
  getSubscriptionMarketingSubtitle,
  getSubscriptionCommerceBadge,
  getSubscriptionPlanMetricItemsForCommerce,
  isSubscriptionFixedDeadlineDayPlan,
  getSubscriptionRestrictionSummary,
  getSubscriptionResourceType,
  getSubscriptionSaleSummary,
  getSubscriptionUsageSummary,
  isSubscriptionDiscountActive,
} from '../../helpers/subscriptionFormat';
import { primeGroupMetadata } from '../../helpers/group';
import { getPricingSeo, getSubscriptionPlanSeo } from '../../helpers/seo';

const { Text, Title } = Typography;

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
  const amountText = getPlanResourceAmountText(plan, t);

  if (usageSummary.unlimited) {
    return t('有效期内不限使用');
  }
  return `${formatSubscriptionResourceLabel(plan, t)} ${amountText} · ${t('有效期')} ${formatSubscriptionSellingDuration(plan, t)}`;
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

function renderScopedTag(key, value, options = {}) {
  const {
    color = 'white',
    onClick,
    icon = null,
    className = '',
  } = options;
  return (
    <Tag
      key={key}
      color={color}
      shape='circle'
      onClick={onClick}
      className={[
        onClick ? 'pricing-clickable-tag' : '',
        'pricing-plan-detail-scope-tag',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className='pricing-plan-detail-scope-tag__content'>
        {icon ? (
          <span className='pricing-plan-detail-scope-tag__icon'>{icon}</span>
        ) : null}
        <span>{value}</span>
      </span>
    </Tag>
  );
}

function renderTagList(items = [], options = {}) {
  const { variant = 'default', lead = null } = options;
  return (
    <div className={`pricing-plan-detail-chip-list pricing-plan-detail-chip-list--${variant}`}>
      {lead ? (
        <div className='pricing-plan-detail-chip-list__lead'>
          {lead.icon ? (
            <span className='pricing-plan-detail-chip-list__lead-icon'>{lead.icon}</span>
          ) : null}
          <span>{lead.text}</span>
        </div>
      ) : null}
      {items}
    </div>
  );
}

export default function SubscriptionPlanDetail() {
  const { planId } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { i18n, t } = useTranslation();
  const [statusState] = useContext(StatusContext);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payMethods, setPayMethods] = useState([]);
  const [enableOnlineTopUp, setEnableOnlineTopUp] = useState(
    statusState?.status?.enable_online_topup || false,
  );
  const [enableStripeTopUp, setEnableStripeTopUp] = useState(
    statusState?.status?.enable_stripe_topup || false,
  );
  const [enableCreemTopUp, setEnableCreemTopUp] = useState(
    statusState?.status?.enable_creem_topup || false,
  );
  const [allSubscriptions, setAllSubscriptions] = useState([]);
  const [manualDeliveryOrders, setManualDeliveryOrders] = useState([]);
  const [open, setOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [selectedEpayMethod, setSelectedEpayMethod] = useState('');
  const currentUser = useMemo(() => getUserData(), []);
  const isLoggedIn = !!currentUser?.id;
  const epayMethods = useMemo(() => getEpayMethods(payMethods), [payMethods]);

  const planWrapper = useMemo(() => {
    const id = Number(planId || 0);
    return plans.find((item) => Number(item?.plan?.id || 0) === id) || null;
  }, [planId, plans]);
  const plan = planWrapper?.plan || null;
  const fallbackSeo = getPricingSeo(i18n.language);
  const seo = useMemo(
    () => (plan ? getSubscriptionPlanSeo(i18n.language, plan) : fallbackSeo),
    [fallbackSeo, i18n.language, plan],
  );

  const backQuery = useMemo(() => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'subscription-plans');
    return next.toString();
  }, [searchParams]);
  const listPath = `/pricing?${backQuery}`;
  const detailQuery = useMemo(() => searchParams.toString(), [searchParams]);

  const openPlanDetail = (nextPlanId) => {
    if (!nextPlanId) return;
    navigate(
      `/pricing/subscription-plans/${nextPlanId}${detailQuery ? `?${detailQuery}` : ''}`,
    );
  };

  const planPurchaseCountMap = useMemo(() => {
    const map = new Map();
    (allSubscriptions || []).forEach((sub) => {
      const id = sub?.subscription?.plan_id;
      if (!id) return;
      map.set(id, (map.get(id) || 0) + 1);
    });
    (manualDeliveryOrders || []).forEach((item) => {
      if (item?.order?.fulfillment_status === 'rejected') return;
      const id = item?.order?.plan_id;
      if (!id) return;
      map.set(id, (map.get(id) || 0) + 1);
    });
    return map;
  }, [allSubscriptions, manualDeliveryOrders]);

  const getPlanPurchaseCount = (id) => planPurchaseCountMap.get(id) || 0;

  const visiblePlans = useMemo(() => {
    const seriesFilter = searchParams.get('plan_series') || 'all';
    const sortType = searchParams.get('plan_sort') || 'recommended';
    const filtered = (plans || []).filter((item) => {
      const currentPlan = item?.plan || {};
      if (!currentPlan?.id || currentPlan?.enabled === false) {
        return false;
      }
      if (seriesFilter === 'all') {
        return true;
      }
      const series = inferSubscriptionPlanSeries(currentPlan);
      if (seriesFilter === 'mixed') {
        return series === 'mixed';
      }
      return series === seriesFilter;
    });

    filtered.sort((a, b) => {
      const planA = a?.plan || {};
      const planB = b?.plan || {};

      if (sortType === 'price_asc') {
        return Number(planA.price_amount || 0) - Number(planB.price_amount || 0);
      }
      if (sortType === 'price_desc') {
        return Number(planB.price_amount || 0) - Number(planA.price_amount || 0);
      }
      if (sortType === 'value_desc') {
        const valueA = Number(
          getSubscriptionUsageSummary(planA).periodTotal ||
            getSubscriptionUsageSummary(planA).total ||
            0,
        );
        const valueB = Number(
          getSubscriptionUsageSummary(planB).periodTotal ||
            getSubscriptionUsageSummary(planB).total ||
            0,
        );
        return valueB - valueA;
      }
      const sortOrderDiff =
        Number(planB.sort_order || 0) - Number(planA.sort_order || 0);
      if (sortOrderDiff !== 0) return sortOrderDiff;

      const purchaseDiff =
        getPlanPurchaseCount(planB.id) - getPlanPurchaseCount(planA.id);
      if (purchaseDiff !== 0) return purchaseDiff;

      return Number(planA.price_amount || 0) - Number(planB.price_amount || 0);
    });

    return filtered;
  }, [plans, searchParams, getPlanPurchaseCount]);

  const currentPlanIndex = useMemo(
    () =>
      visiblePlans.findIndex(
        (item) => Number(item?.plan?.id || 0) === Number(planId || 0),
      ),
    [planId, visiblePlans],
  );

  const previousPlan = currentPlanIndex > 0 ? visiblePlans[currentPlanIndex - 1]?.plan : null;
  const nextPlan =
    currentPlanIndex >= 0 && currentPlanIndex < visiblePlans.length - 1
      ? visiblePlans[currentPlanIndex + 1]?.plan
      : null;

  useEffect(() => {
    setSelectedEpayMethod(epayMethods?.[0]?.type || '');
  }, [epayMethods]);

  useEffect(() => {
    if (!statusState?.status) return;
    setEnableOnlineTopUp(Boolean(statusState.status.enable_online_topup));
    setEnableStripeTopUp(Boolean(statusState.status.enable_stripe_topup));
    setEnableCreemTopUp(Boolean(statusState.status.enable_creem_topup));
  }, [statusState?.status]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [plansRes, pricingRes, topupRes, selfRes] = await Promise.allSettled([
          API.get('/api/subscription/plans'),
          API.get('/api/pricing', { skipErrorHandler: true }),
          API.get('/api/user/topup/info', { skipErrorHandler: true }),
          isLoggedIn
            ? API.get('/api/subscription/self', { skipErrorHandler: true })
            : Promise.resolve({ data: { success: true, data: {} } }),
        ]);

        if (plansRes.status === 'fulfilled' && plansRes.value.data?.success) {
          setPlans(plansRes.value.data.data || []);
        } else {
          setPlans([]);
        }

        if (pricingRes.status === 'fulfilled' && pricingRes.value.data?.success) {
          primeGroupMetadata(
            pricingRes.value.data?.usable_group_meta ||
              pricingRes.value.data?.usable_group ||
              {},
          );
        }

        if (topupRes.status === 'fulfilled' && topupRes.value.data?.success) {
          const data = topupRes.value.data.data || {};
          let nextPayMethods = data?.pay_methods || [];
          if (typeof nextPayMethods === 'string') {
            try {
              nextPayMethods = JSON.parse(nextPayMethods);
            } catch {
              nextPayMethods = [];
            }
          }
          setPayMethods(
            Array.isArray(nextPayMethods)
              ? nextPayMethods.filter((method) => method?.name && method?.type)
              : [],
          );
          setEnableOnlineTopUp(Boolean(data?.enable_online_topup));
          setEnableStripeTopUp(Boolean(data?.enable_stripe_topup));
          setEnableCreemTopUp(Boolean(data?.enable_creem_topup));
        } else {
          setPayMethods([]);
        }

        if (selfRes.status === 'fulfilled' && selfRes.value.data?.success) {
          setAllSubscriptions(selfRes.value.data?.data?.all_subscriptions || []);
          setManualDeliveryOrders(
            selfRes.value.data?.data?.manual_delivery_orders || [],
          );
        } else {
          setAllSubscriptions([]);
          setManualDeliveryOrders([]);
        }
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [isLoggedIn, planId]);

  const closeBuy = () => {
    setOpen(false);
    setPaying(false);
  };

  const openBuy = () => {
    if (disabled) return;
    if (!isLoggedIn) {
      navigate('/login', {
        state: {
          from: {
            pathname: location.pathname,
            search: location.search,
          },
        },
      });
      return;
    }
    setOpen(true);
  };

  const payStripe = async () => {
    if (!plan?.stripe_price_id) {
      showError(t('该套餐未配置 Stripe'));
      return;
    }
    setPaying(true);
    try {
      const res = await API.post('/api/subscription/stripe/pay', {
        plan_id: plan.id,
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
    } catch {
      showError(t('支付请求失败'));
    } finally {
      setPaying(false);
    }
  };

  const payCreem = async () => {
    if (!plan?.creem_product_id) {
      showError(t('该套餐未配置 Creem'));
      return;
    }
    setPaying(true);
    try {
      const res = await API.post('/api/subscription/creem/pay', {
        plan_id: plan.id,
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
    } catch {
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
        plan_id: plan.id,
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
    } catch {
      showError(t('支付请求失败'));
    } finally {
      setPaying(false);
    }
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

  if (loading) {
    return (
      <div className='mx-auto w-full max-w-[1120px] px-3 pb-10 pt-[96px] md:px-6 md:pt-[72px]'>
        <Card className='!rounded-2xl border-0 shadow-sm' bodyStyle={{ padding: 24 }}>
          <Skeleton.Title active style={{ width: '30%', height: 18, marginBottom: 20 }} />
          <Skeleton.Paragraph active rows={8} />
        </Card>
      </div>
    );
  }

  if (!plan) {
    return (
      <>
        <SeoMeta {...seo} canonicalPath={`/pricing/subscription-plans/${planId || ''}`} />
        <div className='mx-auto w-full max-w-[1120px] px-3 pb-10 pt-[96px] md:px-6 md:pt-[72px]'>
          <Card className='!rounded-2xl border-0 shadow-sm' bodyStyle={{ padding: 24 }}>
            <Space vertical align='start' spacing={16} style={{ width: '100%' }}>
              <Button
                theme='outline'
                type='tertiary'
                icon={<ArrowLeft size={14} />}
                onClick={() => navigate(listPath)}
              >
                {t('返回套餐列表')}
              </Button>
              <Empty
                title={t('套餐不存在或暂不可购买')}
                description={t('可返回订阅套餐列表重新选择')}
              />
            </Space>
          </Card>
        </div>
      </>
    );
  }

  const saleSummary = getSubscriptionSaleSummary(plan);
  const restrictionSummary = getSubscriptionRestrictionSummary(plan);
  const usageSummary = getSubscriptionUsageSummary(plan);
  const count = getPlanPurchaseCount(plan.id);
  const limit = Number(plan?.max_purchase_per_user || 0);
  const reached = limit > 0 && count >= limit;
  const disabled = saleSummary.soldOut || reached;
  const isClaudePlan = inferSubscriptionPlanSeries(plan) === 'claude';
  const isClaudeMonthlyPlan =
    isClaudePlan && String(plan?.duration_unit || 'month') === 'month';
  const isManualDeliveryPlan = plan?.delivery_mode === 'manual_delivery';
  const dailyPriceDisplay = getSubscriptionDailyPriceDisplay(plan);
  const perRequestPriceDisplay = getSubscriptionPerRequestPriceDisplay(plan);
  const { symbol, effectivePrice, originalPrice } = getSubscriptionPriceDisplay(plan);
  const displayPrice = formatSubscriptionSettlementPrice(effectivePrice);
  const displayOriginalPrice = formatSubscriptionSettlementPrice(originalPrice);
  const activeDiscount = isSubscriptionDiscountActive(plan);
  const resetHint = formatSubscriptionResetHint(plan, t);
  const scheduleHint = isSubscriptionFixedDeadlineDayPlan(plan)
    ? formatSubscriptionSellingDuration(plan, t)
    : resetHint;
  const marketingSubtitle = getSubscriptionMarketingSubtitle(plan, t);
  const marketingBadge = getSubscriptionCommerceBadge(
    plan,
    plans.map((item) => item?.plan || item),
    t,
  );
  const planMetricItems = getSubscriptionPlanMetricItemsForCommerce(plan, t);
  const purchaseLimitInfo = {
    limit,
    count,
  };
  const heroStats = [
    {
      label: t('套餐价格'),
      value: `${symbol}${displayPrice}`,
      sub: t('{{duration}} 生效', {
        duration: formatSubscriptionSellingDuration(plan, t),
      }),
    },
    {
      label: t('核心权益'),
      value: getPlanResourceAmountText(plan, t),
      sub: marketingSubtitle,
    },
    {
      label: t('购买状态'),
      value: saleSummary.soldOut ? t('已售罄') : t('可购买'),
      sub: limit > 0 ? t('每人限购 {{limit}}，已购 {{count}}', { limit, count }) : t('当前不限购'),
    },
  ];
  const uniqueRestrictionGroups = Array.from(
    new Set(
      restrictionSummary.groups.filter(
        (group) => group && group !== plan?.upgrade_group,
      ),
    ),
  );
  const uniqueRestrictionModels = Array.from(new Set(restrictionSummary.models));
  const uniqueRestrictionVendors = Array.from(new Set(restrictionSummary.vendors));

  return (
    <>
      <SeoMeta
        key={`subscription-plan-${plan.id}`}
        {...seo}
        canonicalPath={`/pricing/subscription-plans/${plan.id}`}
      />
      <div className='pricing-landing-page pricing-plan-detail-page mx-auto w-full max-w-[1120px] px-3 pb-8 md:px-6 pt-[96px] md:pt-[72px]'>
        <div className='pricing-plan-detail-toolbar mb-3 flex flex-wrap items-center gap-2'>
          <Button
            theme='outline'
            type='tertiary'
            icon={<ArrowLeft size={14} />}
            onClick={() => navigate(listPath)}
          >
            {t('返回套餐列表')}
          </Button>
          <Button
            theme='outline'
            type='tertiary'
            icon={<ChevronLeft size={14} />}
            disabled={!previousPlan}
            onClick={() => openPlanDetail(previousPlan?.id)}
          >
            {t('上一个套餐')}
          </Button>
          <Button
            theme='outline'
            type='tertiary'
            icon={<ChevronRight size={14} />}
            iconPosition='right'
            disabled={!nextPlan}
            onClick={() => openPlanDetail(nextPlan?.id)}
          >
            {t('下一个套餐')}
          </Button>
          <Tag color='blue' shape='circle'>{t('套餐详情')}</Tag>
          <Text type='tertiary'>{t('套餐 ID')} #{plan.id}</Text>
        </div>

        <div className='pricing-plan-detail-layout'>
          <div className='pricing-plan-detail-main'>
            <div className='pricing-plan-detail-hero pricing-landing-hero'>
              <div className='pricing-landing-hero-glow pricing-landing-hero-glow-primary' />
              <div className='pricing-landing-hero-glow pricing-landing-hero-glow-secondary' />
              <div className='pricing-plan-detail-hero__top'>
                <div className='pricing-plan-detail-hero__copy'>
                  <div className='pricing-plan-detail-hero__eyebrow'>
                    <Tag color='blue' shape='circle'>{t('套餐详情')}</Tag>
                    {marketingBadge ? (
                      <Tag color={marketingBadge.tone} shape='circle'>
                        {marketingBadge.label}
                      </Tag>
                    ) : null}
                    {isClaudePlan && (
                      <Tag color='violet' shape='circle'>{t('Claude 系列')}</Tag>
                    )}
                    {activeDiscount && (
                      <Tag color='red' shape='circle' icon={<Sparkles size={12} />}>
                        {t('限时优惠')}
                      </Tag>
                    )}
                    {saleSummary.soldOut && (
                      <Tag color='red' shape='circle'>{t('已售罄')}</Tag>
                    )}
                  </div>
                  <Title heading={2} className='pricing-plan-detail-hero__title !mb-0'>
                    {plan.title}
                  </Title>
                  <Text className='pricing-plan-detail-hero__subtitle' type='secondary'>
                    {marketingSubtitle}
                  </Text>
                  {marketingBadge?.description ? (
                    <Text className='pricing-plan-detail-hero__selling-point' type='primary'>
                      {marketingBadge.description}
                    </Text>
                  ) : null}
                  <div className='pricing-plan-detail-hero__tag-row mt-4 flex flex-wrap gap-2'>
                    {activeDiscount ? (
                      <Tag color='red' shape='circle'>
                        {t('原价')} {symbol}{displayOriginalPrice}
                      </Tag>
                    ) : null}
                    {dailyPriceDisplay ? (
                      <Tag color='blue' shape='circle'>
                        {t('折合每天约 {{price}}', {
                          price: `${symbol}${dailyPriceDisplay.displayDailyPrice}`,
                        })}
                      </Tag>
                    ) : null}
                    {perRequestPriceDisplay?.displayPerRequestPrice ? (
                      <Tag color='gold' shape='circle'>
                        {t('单次约 {{price}}', {
                          price: `${symbol}${perRequestPriceDisplay.displayPerRequestPrice}`,
                        })}
                      </Tag>
                    ) : null}
                  </div>
                  <div className='pricing-plan-detail-hero__schedule mt-2 inline-flex max-w-full items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 text-xs font-medium text-semi-color-text-1 shadow-sm dark:bg-white/10'>
                    <Clock3 size={14} className='flex-shrink-0' />
                    <span>{scheduleHint}</span>
                  </div>
                </div>
                <div className='pricing-plan-detail-hero__badge'>
                  <div className='pricing-plan-detail-hero__badge-icon'>
                    <Package size={26} />
                  </div>
                  <div className='pricing-plan-detail-hero__badge-label'>{t('公开售卖套餐')}</div>
                </div>
              </div>

              <div className='pricing-plan-detail-stats'>
                {heroStats.map((item) => (
                  <div key={item.label} className='pricing-plan-detail-stat'>
                    <div className='pricing-plan-detail-stat__label'>{item.label}</div>
                    <div className='pricing-plan-detail-stat__value'>{item.value}</div>
                    <div className='pricing-plan-detail-stat__sub'>{item.sub}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className='pricing-plan-detail-content-stack'>
              <Card className='pricing-plan-detail-section pricing-plan-detail-section--rules !rounded-3xl border-0 shadow-sm' bodyStyle={{ padding: 18 }}>
                <div className='pricing-plan-detail-section__header'>
                  <div>
                    <Text strong>{t('套餐规则')}</Text>
                    <Text type='tertiary' className='block mt-1'>
                      {t('重点看可用时长、重置时间和整个有效期内最多可用多少。')}
                    </Text>
                  </div>
                </div>
                <div className='pricing-plan-detail-mini-grid pricing-plan-detail-mini-grid--rules grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4'>
                  {planMetricItems.map((item) => (
                    <div
                      key={item.key}
                      className='pricing-plan-detail-mini-card'
                    >
                      <div className='text-xs text-semi-color-text-2'>{item.label}</div>
                      <div className='mt-2 text-base font-semibold text-semi-color-text-0'>
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className='pricing-plan-detail-section pricing-plan-detail-section--scope !rounded-3xl border-0 shadow-sm' bodyStyle={{ padding: 18 }}>
                <div className='pricing-plan-detail-section__header'>
                  <div>
                    <Text strong>{t('购买后可用范围')}</Text>
                    <Text type='tertiary' className='block mt-1'>
                      {t('购买前请确认这个套餐能用在哪些分组、模型和供应商上。')}
                    </Text>
                  </div>
                </div>
                {(restrictionSummary.groups.length > 0 ||
                  restrictionSummary.models.length > 0 ||
                  restrictionSummary.vendors.length > 0 ||
                  plan?.upgrade_group) ? (
                  <Descriptions
                    className='pricing-plan-detail-restrictions-descriptions'
                    align='left'
                    data={[
                      plan?.upgrade_group
                        ? {
                            key: t('升级分组'),
                            value: renderTagList([
                              <div key={`upgrade-${plan.upgrade_group}`}>
                                {renderGroup(plan.upgrade_group)}
                              </div>,
                            ], {
                              variant: 'highlight',
                              lead: {
                                icon: <Layers3 size={13} />,
                                text: t('升级后进入这个分组'),
                              },
                            }),
                          }
                        : null,
                      uniqueRestrictionGroups.length > 0
                        ? {
                            key: t('可用分组'),
                            value: renderTagList(
                              uniqueRestrictionGroups.map((group) => (
                                <div key={`group-${group}`}>{renderGroup(group)}</div>
                              )),
                              {
                                variant: 'group',
                                lead: {
                                  icon: <Layers3 size={13} />,
                                  text: t('这些分组可直接使用'),
                                },
                              },
                            ),
                          }
                        : null,
                      uniqueRestrictionModels.length > 0
                        ? {
                            key: t('可用模型'),
                            value: renderTagList(
                              uniqueRestrictionModels.map((modelName) =>
                                renderScopedTag(
                                  `model-${modelName}`,
                                  modelName,
                                  {
                                    color: 'grey',
                                    icon: <Package size={12} />,
                                    className: 'pricing-plan-detail-scope-tag--model',
                                    onClick: (event) =>
                                      copyRestrictionValue(event, modelName),
                                  },
                                ),
                              ),
                              {
                                variant: 'model',
                                lead: {
                                  icon: <Package size={13} />,
                                  text: t('支持以下模型'),
                                },
                              },
                            ),
                          }
                        : null,
                      uniqueRestrictionVendors.length > 0
                        ? {
                            key: t('供应商'),
                            value: renderTagList(
                              uniqueRestrictionVendors.map((vendorName) =>
                                renderScopedTag(
                                  `vendor-${vendorName}`,
                                  vendorName,
                                  {
                                    color: 'green',
                                    icon: <BadgeCheck size={12} />,
                                    className: 'pricing-plan-detail-scope-tag--vendor',
                                    onClick: (event) =>
                                      copyRestrictionValue(event, vendorName),
                                  },
                                ),
                              ),
                              {
                                variant: 'vendor',
                                lead: {
                                  icon: <BadgeCheck size={13} />,
                                  text: t('由这些供应商提供'),
                                },
                              },
                            ),
                          }
                        : null,
                    ].filter(Boolean)}
                  />
                ) : (
                  <div className='pricing-plan-detail-empty-note'>
                    <ShieldCheck size={16} />
                    <span>{t('无额外限制')}</span>
                  </div>
                )}
              </Card>
            </div>
          </div>

          <div className='pricing-plan-detail-sidebar'>
            <Card className='pricing-plan-detail-buy-card !rounded-3xl border-0 shadow-sm' bodyStyle={{ padding: 18 }}>
              <div className='pricing-plan-detail-buy-card__header'>
                <div>
                  <Title heading={5} className='!mb-0'>{t('立即订阅')}</Title>
                  <Text type='tertiary' className='block mt-1'>
                    {isManualDeliveryPlan
                      ? t('支付成功后进入待发放状态。')
                      : t('支付成功后自动开通。')}
                  </Text>
                </div>
                <div className='pricing-plan-detail-buy-card__price'>
                  <span>{symbol}</span>
                  {displayPrice}
                  <Text type='secondary' size='small'>
                    / {formatSubscriptionSellingDuration(plan, t)}
                  </Text>
                </div>
              </div>
              {dailyPriceDisplay || activeDiscount || perRequestPriceDisplay ? (
                <div className='pricing-plan-detail-buy-card__price-note flex flex-wrap items-center gap-2'>
                  {dailyPriceDisplay ? (
                    <Tag color='blue' shape='circle'>
                      {t('折合每天约 {{price}}', {
                        price: `${symbol}${dailyPriceDisplay.displayDailyPrice}`,
                      })}
                    </Tag>
                  ) : null}
                  {perRequestPriceDisplay?.displayPerRequestPrice ? (
                    <Tag color='gold' shape='circle'>
                      {t('单次约 {{price}}', {
                        price: `${symbol}${perRequestPriceDisplay.displayPerRequestPrice}`,
                      })}
                    </Tag>
                  ) : null}
                  {activeDiscount ? (
                    <Tag color='red' shape='circle'>
                      {t('原价')} {symbol}{displayOriginalPrice}
                    </Tag>
                  ) : null}
                </div>
              ) : null}
              {activeDiscount ? (
                <div className='pricing-plan-detail-buy-card__price-note'>
                  <Text type='tertiary'>
                    {t('优惠截止时间')}：{' '}
                    {new Date(Number(plan?.discount_deadline || 0) * 1000).toLocaleString()}
                  </Text>
                </div>
              ) : null}

              <Banner
                type='info'
                description={
                  isManualDeliveryPlan
                    ? t(
                        '该套餐支付成功后不会自动开通，发放完成后可在订阅页查看交付信息。',
                      )
                    : t('支付成功后自动生效。')
                }
                closeIcon={null}
                className='!rounded-2xl'
              />
              {isClaudeMonthlyPlan ? (
                <Banner
                  type='warning'
                  description={t(
                    'Claude 月卡套餐购买后不支持退换；如需体验，建议先购买天卡。',
                  )}
                  closeIcon={null}
                  className='!mt-3 !rounded-2xl'
                />
              ) : null}

              <div className='pricing-plan-detail-buy-card__checklist'>
                <div className='pricing-plan-detail-buy-card__checklist-item'>
                  <BadgeCheck size={15} />
                  <span>{t('支付后将按当前套餐配置立即结算。')}</span>
                </div>
                <div className='pricing-plan-detail-buy-card__checklist-item'>
                  <Clock3 size={15} />
                  <span>{t('模型、分组与供应商标签支持点击复制。')}</span>
                </div>
                <div className='pricing-plan-detail-buy-card__checklist-item'>
                  <Layers3 size={15} />
                  <span>{t('购买前重点确认适用范围与重置规则。')}</span>
                </div>
              </div>

              <div className='pricing-plan-detail-buy-card__meta'>
                <div className='pricing-plan-detail-buy-card__meta-row'>
                  <span>{t('套餐 ID')}</span>
                  <strong>#{plan.id}</strong>
                </div>
                <div className='pricing-plan-detail-buy-card__meta-row'>
                  <span>{t('有效期')}</span>
                  <strong>{formatSubscriptionSellingDuration(plan, t)}</strong>
                </div>
                <div className='pricing-plan-detail-buy-card__meta-row'>
                  <span>{t('购买状态')}</span>
                  <strong>{disabled ? (saleSummary.soldOut ? t('已售罄') : t('已达上限')) : t('当前可购买')}</strong>
                </div>
              </div>

              <Button
                theme='solid'
                type='primary'
                block
                disabled={disabled}
                onClick={openBuy}
                icon={
                  isLoggedIn ? <ChevronRight size={14} /> : <ShieldCheck size={14} />
                }
                iconPosition='right'
                className={
                  isLoggedIn ? undefined : 'pricing-plan-detail-buy-card__login-cta'
                }
              >
                {disabled
                  ? saleSummary.soldOut
                    ? t('已售罄')
                    : t('已达上限')
                  : isLoggedIn
                    ? t('立即订阅')
                    : t('登录后购买')}
              </Button>
              <Button
                theme='outline'
                type='tertiary'
                block
                onClick={() => navigate(listPath)}
              >
                {t('去订阅套餐列表')}
              </Button>

              {!isLoggedIn ? (
                <div className='pricing-plan-detail-buy-card__footnote'>
                  <Text type='tertiary' size='small'>
                    {t('先登录，再进入支付确认')}
                  </Text>
                </div>
              ) : null}
            </Card>
          </div>
        </div>
      </div>

      <SubscriptionPurchaseModal
        t={t}
        visible={open}
        onCancel={closeBuy}
        selectedPlan={planWrapper}
        paying={paying}
        selectedEpayMethod={selectedEpayMethod}
        setSelectedEpayMethod={setSelectedEpayMethod}
        epayMethods={epayMethods}
        enableOnlineTopUp={enableOnlineTopUp}
        enableStripeTopUp={enableStripeTopUp}
        enableCreemTopUp={enableCreemTopUp}
        purchaseLimitInfo={purchaseLimitInfo}
        onPayStripe={payStripe}
        onPayCreem={payCreem}
        onPayEpay={payEpay}
      />
    </>
  );
}
