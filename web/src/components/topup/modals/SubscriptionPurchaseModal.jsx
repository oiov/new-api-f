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

import React from 'react';
import {
  Banner,
  Collapse,
  Modal,
  Typography,
  Button,
  Select,
  Tag,
} from '@douyinfe/semi-ui';
import { Crown, Package, Sparkles } from 'lucide-react';
import { SiStripe } from 'react-icons/si';
import { IconCreditCard } from '@douyinfe/semi-icons';
import {
  formatSubscriptionSettlementPrice,
  formatSubscriptionSellingDuration,
  getClaudeMonthlyMarketingSubtitle,
  getSubscriptionDailyPriceDisplay,
  getSubscriptionPriceDisplay,
  getSubscriptionResourceType,
  getSubscriptionUsageSummary,
  isClaudeMonthlySubscriptionPlan,
  isSubscriptionClaudePlan,
  isSubscriptionDiscountActive,
} from '../../../helpers/subscriptionFormat';
import { renderQuota } from '../../../helpers';

const { Text } = Typography;

function getPlanComputedSubtitle(plan, t, symbol, effectivePrice) {
  if (!plan) {
    return t('以套餐配置为准');
  }

  const claudeMonthlySubtitle = getClaudeMonthlyMarketingSubtitle(plan, t);
  if (claudeMonthlySubtitle) {
    return claudeMonthlySubtitle;
  }

  const resourceType = getSubscriptionResourceType(plan);
  if (resourceType !== 'request_count') {
    return plan.subtitle || t('以套餐配置为准');
  }

  const usageSummary = getSubscriptionUsageSummary(plan);
  const durationText = formatSubscriptionSellingDuration(plan, t);
  const subtitleParts = [];

  if (!usageSummary.unlimited && usageSummary.total > 0) {
    subtitleParts.push(
      t('总计 {{count}} 次', {
        count: usageSummary.total,
      }),
    );
  }

  subtitleParts.push(
    t('有效期 {{duration}}', {
      duration: durationText,
    }),
  );

  const pricePerRequest =
    usageSummary.total > 0
      ? Number(effectivePrice || 0) / usageSummary.total
      : 0;

  if (pricePerRequest > 0) {
    subtitleParts.push(
      t('折合约 {{price}}/次', {
        price: `${symbol}${pricePerRequest.toFixed(4)}`,
      }),
    );
  }

  return subtitleParts.join('，');
}

const SubscriptionPurchaseModal = ({
  t,
  visible,
  onCancel,
  selectedPlan,
  paying,
  selectedEpayMethod,
  setSelectedEpayMethod,
  epayMethods = [],
  enableOnlineTopUp = false,
  enableStripeTopUp = false,
  enableCreemTopUp = false,
  purchaseLimitInfo = null,
  onPayStripe,
  onPayCreem,
  onPayEpay,
}) => {
  const plan = selectedPlan?.plan;
  const dailyPriceDisplay = getSubscriptionDailyPriceDisplay(plan);
  const { symbol, effectivePrice, originalPrice } =
    getSubscriptionPriceDisplay(plan);
  const hasActiveDiscount = isSubscriptionDiscountActive(plan);
  const displayPrice = formatSubscriptionSettlementPrice(effectivePrice);
  const computedSubtitle = getPlanComputedSubtitle(plan, t, symbol, effectivePrice);
  // 只有当管理员开启支付网关 AND 套餐配置了对应的支付ID时才显示
  const hasStripe =
    enableStripeTopUp && !!plan?.stripe_price_id && !hasActiveDiscount;
  const hasCreem =
    enableCreemTopUp && !!plan?.creem_product_id && !hasActiveDiscount;
  const hasEpay = enableOnlineTopUp && epayMethods.length > 0;
  const hasAnyPayment = hasStripe || hasCreem || hasEpay;
  const purchaseLimit = Number(purchaseLimitInfo?.limit || 0);
  const purchaseCount = Number(purchaseLimitInfo?.count || 0);
  const purchaseLimitReached =
    purchaseLimit > 0 && purchaseCount >= purchaseLimit;
  const isClaudePlan = isSubscriptionClaudePlan(plan);
  const isClaudeMonthlyPlan = isClaudeMonthlySubscriptionPlan(plan);
  const isManualDeliveryPlan = plan?.delivery_mode === 'manual_delivery';
  const resourceType = getSubscriptionResourceType(plan);
  const usageSummary = getSubscriptionUsageSummary(plan);
  const resourceAmountText = usageSummary.unlimited
    ? t('不限')
    : resourceType === 'request_count'
      ? `${Number(usageSummary.total || 0).toLocaleString()} ${t('次')}`
      : renderQuota(usageSummary.total || 0);
  const paymentMethodText = [
    hasStripe ? 'Stripe' : null,
    hasCreem ? 'Creem' : null,
    hasEpay ? t('易支付') : null,
  ]
    .filter(Boolean)
    .join(' / ');
  const planMetaItems = [
    {
      key: 'duration',
      label: t('有效期'),
      value: formatSubscriptionSellingDuration(plan, t),
    },
    {
      key: 'resource',
      label: resourceType === 'request_count' ? t('请求次数') : t('Token额度'),
      value: resourceAmountText,
    },
    {
      key: 'delivery',
      label: t('套餐类型'),
      value: isManualDeliveryPlan ? t('人工发放') : t('自动开通'),
    },
    {
      key: 'payment',
      label: t('支付方式'),
      value: paymentMethodText || t('在线支付'),
    },
  ];
  const noticeItems = [
    isManualDeliveryPlan
      ? {
          key: 'manual_delivery',
          type: 'info',
          text: t(
            '该套餐支付成功后不会自动开通，订单将进入待发放状态；发放完成后可在订阅页查看交付内容。',
          ),
        }
      : null,
    isClaudePlan && !isManualDeliveryPlan
      ? {
          key: 'claude_auto',
          type: 'warning',
          text: t('Claude 系列套餐支付成功后自动生效。'),
        }
      : null,
    isClaudeMonthlyPlan
      ? {
          key: 'claude_monthly_discount',
          type: 'success',
          text: t('Claude 系列月卡套餐已恢复原价'),
        }
      : null,
    isClaudeMonthlyPlan
      ? {
          key: 'claude_monthly',
          type: 'danger',
          text: t('Claude 月卡套餐购买后不支持退换；如需体验，建议先购买天卡。'),
        }
      : null,
    hasActiveDiscount
      ? {
          key: 'discount_deadline',
          type: 'success',
          text:
            `${t('当前套餐正在限时优惠中，优惠截止时间')}：` +
            new Date(
              Number(plan?.discount_deadline || 0) * 1000,
            ).toLocaleString(),
        }
      : null,
    hasActiveDiscount && !hasEpay && (enableStripeTopUp || enableCreemTopUp)
      ? {
          key: 'discount_gateway',
          type: 'warning',
          text: t('当前套餐存在限时优惠，当前仅支持易支付购买；请先启用易支付。'),
        }
      : null,
  ].filter(Boolean);
  return (
    <Modal
      title={
        <div className='flex items-center'>
          <Crown className='mr-2' size={18} />
          {t('购买订阅套餐')}
        </div>
      }
      visible={visible}
      onCancel={onCancel}
      footer={null}
      size='small'
      width={420}
      centered
      className='subscription-purchase-modal'
    >
      {plan ? (
        <div className='subscription-purchase-modal__body'>
          <section className='subscription-purchase-modal__hero'>
            <div className='subscription-purchase-modal__hero-main'>
              <div className='subscription-purchase-modal__eyebrow'>
                <Tag color='blue' shape='circle'>{t('订阅确认')}</Tag>
                {isClaudePlan ? (
                  <Tag color='violet' shape='circle'>{t('Claude 系列')}</Tag>
                ) : null}
                {hasActiveDiscount ? (
                  <Tag color='red' shape='circle' icon={<Sparkles size={12} />}>
                    {t('限时优惠')}
                  </Tag>
                ) : null}
              </div>
              <Typography.Text
                ellipsis={{ rows: 2, showTooltip: true }}
                className='subscription-purchase-modal__title'
              >
                {plan.title}
              </Typography.Text>
              <Text className='subscription-purchase-modal__subtitle' type='secondary'>
                {computedSubtitle}
              </Text>
            </div>
            <div className='subscription-purchase-modal__price-box'>
              <div className='subscription-purchase-modal__price-box-head'>
                <div className='subscription-purchase-modal__price-box-icon'>
                  <Package size={14} />
                </div>
                <Text className='subscription-purchase-modal__price-box-label'>
                  {t('当前价格')}
                </Text>
              </div>
              {hasActiveDiscount ? (
                <Text type='tertiary' delete className='subscription-purchase-modal__price-original'>
                  {symbol}
                  {formatSubscriptionSettlementPrice(originalPrice)}
                </Text>
              ) : null}
              <div className='subscription-purchase-modal__price-current'>
                <span>{symbol}</span>
                {isClaudePlan && dailyPriceDisplay
                  ? dailyPriceDisplay.displayDailyPrice
                  : displayPrice}
              </div>
              <div className='subscription-purchase-modal__price-duration'>
                {isClaudePlan && dailyPriceDisplay
                  ? t('约每天成本，合计 {{price}} / {{duration}}', {
                      price: `${symbol}${displayPrice}`,
                      duration: formatSubscriptionSellingDuration(plan, t),
                    })
                  : formatSubscriptionSellingDuration(plan, t)}
              </div>
            </div>
            <div className='subscription-purchase-modal__meta-grid'>
              {planMetaItems.map((item) => (
                <div
                  key={item.key}
                  className='subscription-purchase-modal__meta-card'
                >
                  <div className='subscription-purchase-modal__meta-card-label'>
                    {item.label}
                  </div>
                  <div
                    className={`subscription-purchase-modal__meta-card-value ${
                      item.key === 'resource' || item.key === 'payment'
                        ? 'subscription-purchase-modal__meta-card-value--strong'
                        : ''
                    }`}
                  >
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 支付方式 */}
          {purchaseLimitReached && (
            <Banner
              type='warning'
              description={`${t('已达到购买上限')} (${purchaseCount}/${purchaseLimit})`}
              className='!rounded-xl'
              closeIcon={null}
            />
          )}

          <Collapse
            className='subscription-purchase-modal__collapse'
            defaultActiveKey={[]}
            keepDOM={false}
          >
            {noticeItems.length > 0 ? (
              <Collapse.Panel header={t('购买须知')} itemKey='notice'>
                <div className='subscription-purchase-modal__notice-list'>
                  {noticeItems.map((item) => (
                    <Banner
                      key={item.key}
                      type={item.type}
                      description={item.text}
                      className='!rounded-xl'
                      closeIcon={null}
                    />
                  ))}
                </div>
              </Collapse.Panel>
            ) : null}
          </Collapse>

          {hasAnyPayment ? (
            <section className='subscription-purchase-modal__payment'>
              <div className='subscription-purchase-modal__section-head'>
                <Text strong>{t('选择支付方式')}</Text>
                <Text type='tertiary' size='small'>
                  {isManualDeliveryPlan
                    ? t('支付后进入待发放状态')
                    : t('支付后自动开通套餐')}
                </Text>
              </div>

              {(hasStripe || hasCreem) && (
                <div className='subscription-purchase-modal__payment-grid'>
                  {hasStripe && (
                    <Button
                      theme='light'
                      className='subscription-purchase-modal__payment-button'
                      icon={<SiStripe size={14} color='#635BFF' />}
                      onClick={onPayStripe}
                      loading={paying}
                      disabled={purchaseLimitReached}
                    >
                      {t('Stripe')}
                    </Button>
                  )}
                  {hasCreem && (
                    <Button
                      theme='light'
                      className='subscription-purchase-modal__payment-button'
                      icon={<IconCreditCard />}
                      onClick={onPayCreem}
                      loading={paying}
                      disabled={purchaseLimitReached}
                    >
                      {t('Creem')}
                    </Button>
                  )}
                </div>
              )}

              {hasEpay && (
                <div className='subscription-purchase-modal__epay-row'>
                  <Select
                    value={selectedEpayMethod}
                    onChange={setSelectedEpayMethod}
                    className='subscription-purchase-modal__epay-select'
                    size='default'
                    placeholder={t('选择支付方式')}
                    optionList={epayMethods.map((m) => ({
                      value: m.type,
                      label: m.name || m.type,
                    }))}
                    disabled={purchaseLimitReached}
                  />
                  <Button
                    theme='solid'
                    type='primary'
                    className='subscription-purchase-modal__epay-submit'
                    onClick={onPayEpay}
                    loading={paying}
                    disabled={!selectedEpayMethod || purchaseLimitReached}
                  >
                    {t('支付')}
                  </Button>
                </div>
              )}
            </section>
          ) : (
            <Banner
              type='info'
              description={t('管理员未开启在线支付功能，请联系管理员配置。')}
              className='!rounded-xl'
              closeIcon={null}
            />
          )}
        </div>
      ) : null}
    </Modal>
  );
};

export default SubscriptionPurchaseModal;
