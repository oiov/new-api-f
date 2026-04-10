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
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Banner,
  Button,
  Card,
  Empty,
  Skeleton,
  Space,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import {
  ArrowLeft,
  BadgeCheck,
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
import { API, getUserData, renderGroup, renderGroupTextWithDescription, renderQuota, showError, showSuccess } from '../../helpers';
import {
  formatSubscriptionDuration,
  getSubscriptionPriceDisplay,
  formatSubscriptionResourceLabel,
  getSubscriptionPlanMetricItems,
  getSubscriptionRestrictionSummary,
  getSubscriptionResourceType,
  getSubscriptionSaleSummary,
  getSubscriptionUsageSummary,
  isSubscriptionDiscountActive,
} from '../../helpers/subscriptionFormat';
import { getPricingSeo } from '../../helpers/seo';

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
  return `${formatSubscriptionResourceLabel(plan, t)} ${amountText} · ${t('有效期')} ${formatSubscriptionDuration(plan, t)}`;
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

function getPlanHighlightItems(plan, metricItems, t) {
  const restrictionSummary = getSubscriptionRestrictionSummary(plan);
  const isManualDelivery = plan?.delivery_mode === 'manual_delivery';
  return [
    {
      key: 'benefit',
      icon: Sparkles,
      title: t('权益与价格'),
      description: metricItems[0]?.value || t('以当前套餐配置为准'),
    },
    {
      key: 'activation',
      icon: BadgeCheck,
      title: isManualDelivery ? t('支付后人工发放') : t('支付后自动生效'),
      description: isManualDelivery
        ? t('支付成功后进入待发放状态，发放完成后可查看交付信息。')
        : t('支付成功后自动开通对应套餐权益。'),
    },
    {
      key: 'reset',
      icon: Clock3,
      title: t('重置规则'),
      description:
        metricItems.find((item) => item.key === 'reset_time')?.value ||
        t('按套餐设置的重置规则执行'),
    },
    {
      key: 'restriction',
      icon: Layers3,
      title: t('适用范围'),
      description:
        restrictionSummary.groups.length > 0 ||
        restrictionSummary.models.length > 0 ||
        restrictionSummary.vendors.length > 0
          ? t('购买前请确认分组、模型和供应商限制')
          : t('无额外限制'),
    },
  ];
}

export default function SubscriptionPlanDetail() {
  const { planId } = useParams();
  const [searchParams] = useSearchParams();
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
  const seo = getPricingSeo(i18n.language);

  const backQuery = useMemo(() => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'subscription-plans');
    return next.toString();
  }, [searchParams]);
  const listPath = `/pricing?${backQuery}`;

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
        const [plansRes, topupRes, selfRes] = await Promise.allSettled([
          API.get('/api/subscription/plans'),
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

  if (loading) {
    return (
      <div className='mx-auto mt-[60px] w-full max-w-[1120px] px-3 pb-10 md:px-6'>
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
        <div className='mx-auto mt-[60px] w-full max-w-[1120px] px-3 pb-10 md:px-6'>
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
  const metricItems = getSubscriptionPlanMetricItems(plan, t);
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
  const { symbol, effectivePrice, originalPrice } = getSubscriptionPriceDisplay(plan);
  const displayPrice = effectivePrice.toFixed(Number.isInteger(effectivePrice) ? 0 : 2);
  const displayOriginalPrice = originalPrice.toFixed(
    Number.isInteger(originalPrice) ? 0 : 2,
  );
  const activeDiscount = isSubscriptionDiscountActive(plan);
  const purchaseLimitInfo = {
    limit,
    count,
  };
  const heroStats = [
    {
      label: t('套餐价格'),
      value: `${symbol}${displayPrice}`,
      sub: formatSubscriptionDuration(plan, t),
    },
    {
      label: t('包含权益'),
      value: metricItems[0]?.value || t('以套餐配置为准'),
      sub: metricItems[0]?.label || t('套餐权益'),
    },
    {
      label: t('购买状态'),
      value: saleSummary.soldOut ? t('已售罄') : t('可购买'),
      sub: limit > 0 ? t('每人限购 {{limit}}', { limit }) : t('不限购'),
    },
  ];
  const planHighlights = getPlanHighlightItems(plan, metricItems, t);
  const summaryItems = [
    {
      label: t('套餐权益'),
      value: usageSummary.unlimited
        ? t('有效期内不限使用')
        : getPlanBenefitDescription(plan, t),
    },
    {
      label: t('购买情况'),
      value:
        limit > 0
          ? t('已购 {{count}} / {{limit}}', { count, limit })
          : t('已购 {{count}}', { count }),
    },
    {
      label: t('适用限制'),
      value:
        restrictionSummary.groups.length > 0 ||
        restrictionSummary.models.length > 0 ||
        restrictionSummary.vendors.length > 0 ||
        plan?.upgrade_group
          ? t('购买前请确认分组、模型和供应商限制')
          : t('无额外限制'),
    },
  ];

  return (
    <>
      <SeoMeta
        {...seo}
        title={`${plan.title} | ${seo.title}`}
        description={plan.subtitle || seo.description}
        canonicalPath={`/pricing/subscription-plans/${plan.id}`}
      />
      <div className='pricing-landing-page pricing-plan-detail-page mx-auto mt-[60px] w-full max-w-[1180px] px-3 pb-10 md:px-6'>
        <div className='mb-4 flex flex-wrap items-center gap-3'>
          <Button
            theme='outline'
            type='tertiary'
            icon={<ArrowLeft size={14} />}
            onClick={() => navigate(listPath)}
          >
            {t('返回套餐列表')}
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
                    {plan.subtitle || t('以套餐配置为准')}
                  </Text>
                  <div className='pricing-plan-detail-hero__summary'>
                    {summaryItems.map((item) => (
                      <div key={item.label} className='pricing-plan-detail-summary-card'>
                        <div className='pricing-plan-detail-summary-card__label'>{item.label}</div>
                        <div className='pricing-plan-detail-summary-card__value'>{item.value}</div>
                      </div>
                    ))}
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

            <Card className='pricing-plan-detail-section !rounded-3xl border-0 shadow-sm' bodyStyle={{ padding: 24 }}>
              <div className='pricing-plan-detail-section__header'>
                <div>
                  <Text strong>{t('购买说明')}</Text>
                  <Text type='tertiary' className='block mt-1'>
                    {t('价格、权益、重置规则和适用范围以当前套餐配置为准。')}
                  </Text>
                </div>
              </div>
              <div className='pricing-plan-detail-highlights'>
                {planHighlights.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.key} className='pricing-plan-detail-highlight'>
                      <div className='pricing-plan-detail-highlight__icon'>
                        <Icon size={18} />
                      </div>
                      <div>
                        <div className='pricing-plan-detail-highlight__title'>{item.title}</div>
                        <div className='pricing-plan-detail-highlight__desc'>{item.description}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className='pricing-plan-detail-section !rounded-3xl border-0 shadow-sm' bodyStyle={{ padding: 24 }}>
              <div className='pricing-plan-detail-section__header'>
                <div>
                  <Text strong>{t('规则与权益明细')}</Text>
                  <Text type='tertiary' className='block mt-1'>
                    {t('以下为当前套餐规则与权益明细。')}
                  </Text>
                </div>
              </div>
              <div className='pricing-plan-detail-metrics'>
                {metricItems.map((item) => (
                  <div key={item.key} className='pricing-plan-detail-metric'>
                    <div className='pricing-plan-detail-metric__label'>{item.label}</div>
                    <div className='pricing-plan-detail-metric__value'>{item.value}</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className='pricing-plan-detail-section !rounded-3xl border-0 shadow-sm' bodyStyle={{ padding: 24 }}>
              <div className='pricing-plan-detail-section__header'>
                <div>
                  <Text strong>{t('适用限制')}</Text>
                  <Text type='tertiary' className='block mt-1'>
                    {t('购买前请确认套餐对应的分组、模型和供应商范围。')}
                  </Text>
                </div>
              </div>
              {(restrictionSummary.groups.length > 0 ||
                restrictionSummary.models.length > 0 ||
                restrictionSummary.vendors.length > 0 ||
                plan?.upgrade_group) ? (
                <div className='pricing-plan-detail-restrictions'>
                  {plan?.upgrade_group ? (
                    <div className='pricing-plan-detail-restrictions__row'>
                      <div className='pricing-plan-detail-restrictions__label'>{t('升级分组')}</div>
                      <div className='pricing-plan-detail-restrictions__content'>
                        {renderGroupTextWithDescription(plan.upgrade_group)}
                      </div>
                    </div>
                  ) : null}
                  {restrictionSummary.groups.length > 0 ? (
                    <div className='pricing-plan-detail-restrictions__row'>
                      <div className='pricing-plan-detail-restrictions__label'>{t('可用分组')}</div>
                      <div className='pricing-plan-detail-restrictions__content'>
                        {restrictionSummary.groups.map((group) => (
                          <div key={`group-${group}`}>{renderGroup(group)}</div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {restrictionSummary.models.length > 0 ? (
                    <div className='pricing-plan-detail-restrictions__row'>
                      <div className='pricing-plan-detail-restrictions__label'>{t('可用模型')}</div>
                      <div className='pricing-plan-detail-restrictions__content'>
                        {restrictionSummary.models.map((modelName) => (
                          <Tag key={`model-${modelName}`} color='white' shape='circle'>
                            {modelName}
                          </Tag>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {restrictionSummary.vendors.length > 0 ? (
                    <div className='pricing-plan-detail-restrictions__row'>
                      <div className='pricing-plan-detail-restrictions__label'>{t('供应商')}</div>
                      <div className='pricing-plan-detail-restrictions__content'>
                        {restrictionSummary.vendors.map((vendorName) => (
                          <Tag key={`vendor-${vendorName}`} color='white' shape='circle'>
                            {vendorName}
                          </Tag>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className='pricing-plan-detail-empty-note'>
                  <ShieldCheck size={16} />
                  <span>{t('无额外限制')}</span>
                </div>
              )}
            </Card>
          </div>

          <div className='pricing-plan-detail-sidebar'>
            <Card className='pricing-plan-detail-buy-card !rounded-3xl border-0 shadow-sm' bodyStyle={{ padding: 24 }}>
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
                </div>
              </div>
              {activeDiscount ? (
                <div className='pricing-plan-detail-buy-card__price-note'>
                  <Text type='tertiary' delete>
                    {symbol}
                    {displayOriginalPrice}
                  </Text>
                  <Tag color='red' shape='circle'>
                    {t('限时优惠')}
                  </Tag>
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
                  <span>{t('价格、权益和适用范围以当前套餐配置为准。')}</span>
                </div>
                <div className='pricing-plan-detail-buy-card__checklist-item'>
                  <Clock3 size={15} />
                  <span>{t('周期性权益按页面标注的重置规则生效。')}</span>
                </div>
                <div className='pricing-plan-detail-buy-card__checklist-item'>
                  <Layers3 size={15} />
                  <span>{t('购买前请确认所需模型、分组和供应商范围。')}</span>
                </div>
              </div>

              <div className='pricing-plan-detail-buy-card__meta'>
                <div className='pricing-plan-detail-buy-card__meta-row'>
                  <span>{t('套餐 ID')}</span>
                  <strong>#{plan.id}</strong>
                </div>
                <div className='pricing-plan-detail-buy-card__meta-row'>
                  <span>{t('有效期')}</span>
                  <strong>{formatSubscriptionDuration(plan, t)}</strong>
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
                onClick={() => setOpen(true)}
                icon={<ChevronRight size={14} />}
                iconPosition='right'
              >
                {disabled ? (saleSummary.soldOut ? t('已售罄') : t('已达上限')) : t('立即订阅')}
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
                    {t('登录后可查看自己已购数量与订阅状态。')}
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
