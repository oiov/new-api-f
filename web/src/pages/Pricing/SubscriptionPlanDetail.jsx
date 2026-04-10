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
import { ArrowLeft, ChevronRight, Package, Sparkles } from 'lucide-react';
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
    return map;
  }, [allSubscriptions]);

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
        } else {
          setAllSubscriptions([]);
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
  const { symbol, effectivePrice, originalPrice } = getSubscriptionPriceDisplay(plan);
  const displayPrice = effectivePrice.toFixed(Number.isInteger(effectivePrice) ? 0 : 2);
  const activeDiscount = isSubscriptionDiscountActive(plan);
  const purchaseLimitInfo = {
    limit,
    count,
  };

  return (
    <>
      <SeoMeta
        {...seo}
        title={`${plan.title} | ${seo.title}`}
        description={plan.subtitle || seo.description}
        canonicalPath={`/pricing/subscription-plans/${plan.id}`}
      />
      <div className='pricing-landing-page mx-auto mt-[60px] w-full max-w-[1120px] px-3 pb-10 md:px-6'>
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

        <div className='grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_360px]'>
          <Card className='!rounded-2xl border-0 shadow-sm' bodyStyle={{ padding: 24 }}>
            <div className='flex flex-col gap-6'>
              <div className='flex flex-col gap-4 border-b border-semi-color-border pb-6 lg:flex-row lg:items-start lg:justify-between'>
                <div className='min-w-0'>
                  <div className='mb-3 flex flex-wrap items-center gap-2'>
                    <Title heading={3} className='!mb-0'>{plan.title}</Title>
                    {isClaudePlan && (
                      <Tag color='violet' shape='circle'>
                        {t('Claude 系列')}
                      </Tag>
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
                  <Text type='secondary' className='block text-base leading-7'>
                    {plan.subtitle || t('暂无说明')}
                  </Text>
                  {isClaudePlan && (
                    <Text type='tertiary' className='mt-3 block'>
                      {t('付款完成后套餐会自动生效；如需协助可联系管理员。')}
                    </Text>
                  )}
                </div>
                <div className='rounded-2xl bg-semi-color-fill-0 p-3'>
                  <Package size={22} className='text-semi-color-text-1' />
                </div>
              </div>

              <div className='grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3'>
                <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-4'>
                  <div className='text-xs text-semi-color-text-2'>{t('价格')}</div>
                  <div className='mt-2 text-3xl font-bold text-semi-color-text-0'>
                    {symbol}{displayPrice}
                  </div>
                  <Text type='tertiary' size='small' className='mt-1 block'>
                    / {formatSubscriptionDuration(plan, t)}
                  </Text>
                  {activeDiscount ? (
                    <Text type='tertiary' size='small' delete className='mt-1 block'>
                      {symbol}
                      {originalPrice.toFixed(Number.isInteger(originalPrice) ? 0 : 2)}
                    </Text>
                  ) : null}
                </div>

                <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-4'>
                  <div className='text-xs text-semi-color-text-2'>{t('完整权益')}</div>
                  <div className='mt-2 text-sm leading-7 text-semi-color-text-0'>
                    {usageSummary.unlimited
                      ? t('有效期内不限使用')
                      : getPlanBenefitDescription(plan, t)}
                  </div>
                </div>

                <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-4'>
                  <div className='text-xs text-semi-color-text-2'>{t('购买情况')}</div>
                  <div className='mt-2 text-sm leading-7 text-semi-color-text-0'>
                    {limit > 0 ? t('已购 {{count}} / {{limit}}', { count, limit }) : t('已购 {{count}}', { count })}
                    {saleSummary.unlimited
                      ? ` · ${t('已售')} ${saleSummary.soldCount}`
                      : ` · ${t('已售')} ${saleSummary.soldCount} / ${t('剩余')} ${saleSummary.remainingSaleCount}`}
                  </div>
                  {isLoggedIn ? null : (
                    <Text type='tertiary' size='small' className='mt-2 block'>
                      {t('登录后可查看自己已购数量与订阅状态。')}
                    </Text>
                  )}
                </div>
              </div>

              <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                {metricItems.map((item) => (
                  <div key={item.key} className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-4'>
                    <div className='text-xs text-semi-color-text-2'>{item.label}</div>
                    <div className='mt-2 text-sm font-semibold leading-7 text-semi-color-text-0'>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              {(restrictionSummary.groups.length > 0 ||
                restrictionSummary.models.length > 0 ||
                restrictionSummary.vendors.length > 0 ||
                plan?.upgrade_group) && (
                <Card className='!rounded-2xl border border-semi-color-border shadow-none' bodyStyle={{ padding: 20 }}>
                  <div className='mb-3 flex items-center gap-2'>
                    <Text strong>{t('适用限制')}</Text>
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    {plan?.upgrade_group ? (
                      <div>{renderGroupTextWithDescription(plan.upgrade_group)}</div>
                    ) : null}
                    {restrictionSummary.groups.map((group) => (
                      <div key={`group-${group}`}>{renderGroup(group)}</div>
                    ))}
                    {restrictionSummary.models.map((modelName) => (
                      <Tag key={`model-${modelName}`} color='white' shape='circle'>
                        {t('模型')}: {modelName}
                      </Tag>
                    ))}
                    {restrictionSummary.vendors.map((vendorName) => (
                      <Tag key={`vendor-${vendorName}`} color='white' shape='circle'>
                        {t('供应商')}: {vendorName}
                      </Tag>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          </Card>

          <Card className='!rounded-2xl border-0 shadow-sm' bodyStyle={{ padding: 24 }}>
            <div className='space-y-4'>
              <Title heading={5} className='!mb-0'>{t('购买订阅套餐')}</Title>
              <Banner
                type='info'
                description={t('支付后将自动生效，若需协助可联系管理员。')}
                closeIcon={null}
                className='!rounded-xl'
              />
              <div className='rounded-xl bg-semi-color-fill-0 p-4'>
                <div className='text-xs text-semi-color-text-2'>{t('价格')}</div>
                <div className='mt-2 text-2xl font-bold'>
                  {symbol}{displayPrice}
                </div>
                <Text type='tertiary' size='small' className='mt-1 block'>
                  {formatSubscriptionDuration(plan, t)}
                </Text>
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
            </div>
          </Card>
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
