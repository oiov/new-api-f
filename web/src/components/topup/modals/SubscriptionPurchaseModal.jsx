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
  Modal,
  Typography,
  Card,
  Button,
  Select,
  Divider,
  Tooltip,
} from '@douyinfe/semi-ui';
import { Crown, CalendarClock, Package } from 'lucide-react';
import { SiStripe } from 'react-icons/si';
import { IconCreditCard } from '@douyinfe/semi-icons';
import { renderQuota } from '../../../helpers';
import { getCurrencyConfig } from '../../../helpers/render';
import {
  formatSubscriptionResourceLabel,
  formatSubscriptionDuration,
  formatSubscriptionResetPeriod,
  getSubscriptionPlanMetricItems,
  getSubscriptionEffectivePrice,
  getSubscriptionRestrictionSummary,
  isSubscriptionDiscountActive,
} from '../../../helpers/subscriptionFormat';

const { Text } = Typography;

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
  const totalAmount = Number(plan?.total_amount || 0);
  const resetPeriodText = formatSubscriptionResetPeriod(plan, t);
  const restrictionSummary = getSubscriptionRestrictionSummary(plan);
  const { symbol, rate } = getCurrencyConfig();
  const price = plan ? getSubscriptionEffectivePrice(plan) : 0;
  const hasActiveDiscount = isSubscriptionDiscountActive(plan);
  const convertedPrice = price * rate;
  const displayPrice = convertedPrice.toFixed(
    Number.isInteger(convertedPrice) ? 0 : 2,
  );
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
  const metricItems = getSubscriptionPlanMetricItems(plan, t);

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
      centered
    >
      {plan ? (
        <div className='space-y-4 pb-10'>
          {/* 套餐信息 */}
          <Card className='!rounded-xl !border-0 bg-slate-50 dark:bg-slate-800'>
            <div className='space-y-3'>
              <div className='flex justify-between items-center'>
                <Text strong className='text-slate-700 dark:text-slate-200'>
                  {t('套餐名称')}：
                </Text>
                <Typography.Text
                  ellipsis={{ rows: 1, showTooltip: true }}
                  className='text-slate-900 dark:text-slate-100'
                  style={{ maxWidth: 200 }}
                >
                  {plan.title}
                </Typography.Text>
              </div>
              <div className='flex justify-between items-center'>
                <Text strong className='text-slate-700 dark:text-slate-200'>
                  {t('有效期')}：
                </Text>
                <div className='flex items-center'>
                  <CalendarClock size={14} className='mr-1 text-slate-500' />
                  <Text className='text-slate-900 dark:text-slate-100'>
                    {formatSubscriptionDuration(plan, t)}
                  </Text>
                </div>
              </div>
              {resetPeriodText !== t('不重置') && (
                <div className='flex justify-between items-center'>
                  <Text strong className='text-slate-700 dark:text-slate-200'>
                    {t('重置周期')}：
                  </Text>
                  <Text className='text-slate-900 dark:text-slate-100'>
                    {resetPeriodText}
                  </Text>
                </div>
              )}
              <div className='grid grid-cols-2 gap-2'>
                {metricItems.map((item) => (
                  <div
                    key={item.key}
                    className='rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900/50'
                  >
                    <div className='text-xs text-slate-500'>{item.label}</div>
                    <div className='mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100'>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
              <div className='flex justify-between items-center'>
                <Text strong className='text-slate-700 dark:text-slate-200'>
                  {formatSubscriptionResourceLabel(
                    { resource_type: 'quota', quota_reset_period: plan?.quota_reset_period },
                    t,
                  )}：
                </Text>
                {totalAmount > 0 ? (
                  <Tooltip content={`${t('原生额度')}：${totalAmount}`}>
                    <Text className='text-slate-900 dark:text-slate-100'>
                      {renderQuota(totalAmount)}
                    </Text>
                  </Tooltip>
                ) : (
                  <Text className='text-slate-900 dark:text-slate-100'>{t('不限')}</Text>
                )}
              </div>
              {resetPeriodText !== t('不重置') ? (
                <Text size='small' type='tertiary'>
                  {t('带重置规则的套餐同时受周期上限与有效期总量约束，任一限制达到后都将暂停服务。')}
                </Text>
              ) : null}
              {restrictionSummary.groups.length > 0 && (
                <div className='flex justify-between items-center'>
                  <Text strong className='text-slate-700 dark:text-slate-200'>
                    {t('可用分组')}：
                  </Text>
                  <Text className='text-slate-900 dark:text-slate-100'>
                    {restrictionSummary.groups.join(' / ')}
                  </Text>
                </div>
              )}
              {restrictionSummary.models.length > 0 && (
                <div className='flex justify-between items-center'>
                  <Text strong className='text-slate-700 dark:text-slate-200'>
                    {t('可用模型')}：
                  </Text>
                  <Text className='text-slate-900 dark:text-slate-100'>
                    {restrictionSummary.models.join(' / ')}
                  </Text>
                </div>
              )}
              {restrictionSummary.vendors.length > 0 && (
                <div className='flex justify-between items-center'>
                  <Text strong className='text-slate-700 dark:text-slate-200'>
                    {t('可用供应商')}：
                  </Text>
                  <Text className='text-slate-900 dark:text-slate-100'>
                    {restrictionSummary.vendors.join(' / ')}
                  </Text>
                </div>
              )}
              {plan?.upgrade_group ? (
                <div className='flex justify-between items-center'>
                  <Text strong className='text-slate-700 dark:text-slate-200'>
                    {t('升级分组')}：
                  </Text>
                  <Text className='text-slate-900 dark:text-slate-100'>
                    {plan.upgrade_group}
                  </Text>
                </div>
              ) : null}
              <Divider margin={8} />
              <div className='flex justify-between items-center'>
                <Text strong className='text-slate-700 dark:text-slate-200'>
                  {t('应付金额')}：
                </Text>
                <div className='text-right'>
                  {hasActiveDiscount ? (
                    <Text
                      type='tertiary'
                      delete
                      className='block text-sm'
                    >
                      {symbol}
                      {(Number(plan?.price_amount || 0) * rate).toFixed(
                        Number.isInteger(Number(plan?.price_amount || 0) * rate)
                          ? 0
                          : 2,
                      )}
                    </Text>
                  ) : null}
                  <Text strong className='text-xl text-purple-600'>
                    {symbol}
                    {displayPrice}
                  </Text>
                </div>
              </div>
            </div>
          </Card>

          {hasActiveDiscount && (
            <Banner
              type='success'
              description={
                `${t('当前套餐正在限时优惠中，优惠截止时间')}：` +
                new Date(Number(plan?.discount_deadline || 0) * 1000).toLocaleString()
              }
              className='!rounded-xl'
              closeIcon={null}
            />
          )}

          {hasActiveDiscount && !hasEpay && (enableStripeTopUp || enableCreemTopUp) ? (
            <Banner
              type='warning'
              description={t('当前套餐存在限时优惠，当前仅支持易支付购买；请先启用易支付。')}
              className='!rounded-xl'
              closeIcon={null}
            />
          ) : null}

          {/* 支付方式 */}
          {purchaseLimitReached && (
            <Banner
              type='warning'
              description={`${t('已达到购买上限')} (${purchaseCount}/${purchaseLimit})`}
              className='!rounded-xl'
              closeIcon={null}
            />
          )}

          {hasAnyPayment ? (
            <div className='space-y-3'>
              <Text size='small' type='tertiary'>
                {t('选择支付方式')}：
              </Text>

              {/* Stripe / Creem */}
              {(hasStripe || hasCreem) && (
                <div className='flex gap-2'>
                  {hasStripe && (
                    <Button
                      theme='light'
                      className='flex-1'
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
                      className='flex-1'
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

              {/* 易支付 */}
              {hasEpay && (
                <div className='flex gap-2'>
                  <Select
                    value={selectedEpayMethod}
                    onChange={setSelectedEpayMethod}
                    style={{ flex: 1 }}
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
                    onClick={onPayEpay}
                    loading={paying}
                    disabled={!selectedEpayMethod || purchaseLimitReached}
                  >
                    {t('支付')}
                  </Button>
                </div>
              )}
            </div>
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
