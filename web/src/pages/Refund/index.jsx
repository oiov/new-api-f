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

import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Banner,
  Button,
  Card,
  Collapse,
  Empty,
  Modal,
  Select,
  Skeleton,
  Space,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { StatusContext } from '../../context/Status';
import {
  API,
  copy,
  renderQuota,
  showError,
  showSuccess,
  timestamp2string,
} from '../../helpers';
import { renderQuotaWithAmount } from '../../helpers/render';
import { getUserData } from '../../helpers/data';
import {
  getAllowedRefundTargets,
  getDefaultRefundTarget,
  parseSubscriptionRefundSettings,
  REFUND_TARGET_BALANCE,
  REFUND_TARGET_ORIGINAL_PAYMENT,
} from '../../helpers/subscriptionRefund';
import SubscriptionConversionRequestsPanel from '../../components/table/subscriptions/SubscriptionConversionRequestsPanel';

const { Text, Title } = Typography;

const SUPPORT_EMAIL = 'support@fishxcode.com';

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

function formatDateTime(timestamp) {
  if (!timestamp) return '--';
  return timestamp2string(timestamp);
}

function formatTokenCount(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString('en-US');
}

function getEffectiveRefundTarget(request) {
  if (!request) {
    return '';
  }
  if (request.status === 'approved' && request.approved_refund_target) {
    return request.approved_refund_target;
  }
  return request.requested_refund_target;
}

const RefundPage = () => {
  const { t } = useTranslation();
  const [statusState] = useContext(StatusContext);
  const currentUser = getUserData();
  const isAdminUser =
    currentUser && typeof currentUser.role === 'number' && currentUser.role >= 10;
  const [conversionPreview, setConversionPreview] = useState(null);
  const [conversionLoading, setConversionLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const refundSettings = useMemo(
    () =>
      parseSubscriptionRefundSettings(
        statusState?.status?.SubscriptionRefundSettings,
      ),
    [statusState?.status?.SubscriptionRefundSettings],
  );
  const allowedRefundTargets = useMemo(
    () => getAllowedRefundTargets(refundSettings),
    [refundSettings],
  );
  const [selectedRefundTarget, setSelectedRefundTarget] = useState('');

  const loadConversionPreview = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    loadConversionPreview();
  }, [loadConversionPreview]);

  useEffect(() => {
    setSelectedRefundTarget((current) => {
      if (current && allowedRefundTargets.includes(current)) {
        return current;
      }
      return getDefaultRefundTarget(refundSettings);
    });
  }, [allowedRefundTargets, refundSettings]);

  const latestRequest = conversionPreview?.latest_request || null;
  const latestRequestRefundTarget = useMemo(
    () => getEffectiveRefundTarget(latestRequest),
    [latestRequest],
  );
  const latestRequestMeta = useMemo(() => {
    if (!latestRequest) return null;
    return getConversionRequestStatusMeta(latestRequest.status, t);
  }, [latestRequest, t]);

  const isTokenUsageSettlement = useMemo(() => {
    return (conversionPreview?.items || []).some(
      (item) => item.settlement_mode === 'token_usage',
    );
  }, [conversionPreview]);

  const conversionSummary = useMemo(() => {
    if (!conversionPreview) {
      return t('当前没有可用的套餐折算活动，若需人工协助请联系售后。');
    }
    if (latestRequest?.status === 'pending') {
      return t('你已经提交过申请，命中套餐会在审核结束前保持禁用状态。');
    }
    if (conversionPreview?.can_execute) {
      return selectedRefundTarget === REFUND_TARGET_ORIGINAL_PAYMENT
        ? t(
            '命中当前活动的套餐会按系统预览规则核算退款金额，审核通过后按原有支付方式退款。',
          )
        : t(
            '命中当前活动的套餐会按系统预览规则折算，审核通过后返还到账户余额。',
          );
    }
    return (
      conversionPreview?.closed_reason ||
      t('当前仅展示历史申请记录，如需继续处理请联系售后。')
    );
  }, [conversionPreview, latestRequest, selectedRefundTarget, t]);

  const handleCopyEmail = async () => {
    const copied = await copy(SUPPORT_EMAIL);
    if (copied) {
      showSuccess(t('已复制售后邮箱'));
      return;
    }
    showError(t('复制失败，请手动复制'));
  };

  const handleSubmitConversionRequest = () => {
    if (
      !selectedRefundTarget ||
      !conversionPreview?.can_execute ||
      !conversionPreview?.items?.length ||
      submitting
    ) {
      return;
    }
    Modal.confirm({
      title:
        selectedRefundTarget === REFUND_TARGET_ORIGINAL_PAYMENT
          ? t('确认提交套餐原路退款申请？')
          : t('确认提交套餐转余额申请？'),
      content: (
        <div className='space-y-2 text-sm text-semi-color-text-1'>
          <div>
            {t(
              '提交后命中的旧套餐会立即临时禁用，审核期间这些套餐将无法继续使用。',
            )}
          </div>
          <div>
            {selectedRefundTarget === REFUND_TARGET_ORIGINAL_PAYMENT
              ? t(
                  '审核通过后，系统会记录核准退款金额并正式作废旧套餐，财务再按原支付方式处理退款；审核拒绝则恢复原套餐。',
                )
              : t(
                  '审核通过后，系统会把核准后的返还额度转入余额并正式作废旧套餐；审核拒绝则恢复原套餐。',
                )}
          </div>
          <div>
            {selectedRefundTarget === REFUND_TARGET_ORIGINAL_PAYMENT
              ? t('预计退款金额')
              : t('预计返还')}
            ：
            {selectedRefundTarget === REFUND_TARGET_ORIGINAL_PAYMENT
              ? renderQuotaWithAmount(
                  Number(conversionPreview.total_convertible_amount || 0),
                )
              : renderQuota(conversionPreview.total_convertible_quota || 0)}
          </div>
          <div>
            {t('命中套餐')}：
            {conversionPreview.items.length} {t('个')}
          </div>
          <div>
            {t('退款去向')}：
            {selectedRefundTarget === REFUND_TARGET_ORIGINAL_PAYMENT
              ? t('原有支付方式')
              : t('账户余额')}
          </div>
        </div>
      ),
      okText: t('确认提交'),
      cancelText: t('取消'),
      onOk: async () => {
        setSubmitting(true);
        try {
          const res = await API.post(
            '/api/subscription/self/conversion_campaign/request',
            {
              refund_target: selectedRefundTarget,
            },
          );
          if (res.data?.success) {
            showSuccess(t('申请已提交，等待管理员审核'));
            await loadConversionPreview();
            return;
          }
          showError(res.data?.message || t('提交申请失败'));
        } catch (error) {
          showError(error?.response?.data?.message || t('提交申请失败'));
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  if (!refundSettings.page_enabled || !refundSettings.enabled) {
    if (isAdminUser) {
      return (
        <div className='px-2'>
          <div className='mx-auto flex max-w-6xl flex-col gap-4'>
            <Card
              className='!rounded-2xl border border-semi-color-border shadow-none'
              bodyStyle={{ padding: '24px' }}
            >
              <div className='space-y-3'>
                <div>
                  <Title heading={5} style={{ margin: 0 }}>
                    {t('退款与售后')}
                  </Title>
                  <Text type='tertiary'>
                    {t('当前退款与售后入口未开放给普通用户，但管理员仍可在此处理审核与打款。')}
                  </Text>
                </div>
                <Banner
                  type='warning'
                  closeIcon={null}
                  description={t(
                    '当前页面处于后台关闭状态：普通用户不会看到退款入口，但管理员可以继续处理已有申请。',
                  )}
                />
              </div>
            </Card>
            <SubscriptionConversionRequestsPanel t={t} />
          </div>
        </div>
      );
    }
    return (
      <div className='px-2'>
        <div className='mx-auto max-w-4xl'>
          <Card
            className='!rounded-2xl border border-semi-color-border shadow-none'
            bodyStyle={{ padding: '32px' }}
          >
            <Empty
              description={t('当前退款与售后入口未开放')}
              image={<Empty.PRESENTED_IMAGE_SIMPLE />}
            />
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className='px-2'>
      <div className='mx-auto flex max-w-6xl flex-col gap-4'>
        <Card
          className='!rounded-2xl border border-semi-color-border shadow-sm'
          bodyStyle={{ padding: '20px' }}
        >
          <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
            <div className='space-y-2'>
              <Tag color='blue' shape='circle'>
                {t('退款与售后')}
              </Tag>
              <Title heading={4} style={{ margin: 0 }}>
                {t('退款政策与工单处理入口')}
              </Title>
              <Text type='tertiary'>
                {t(
                  '本页依据 FishXCode 退款政策整理余额退款、Codex 套餐折算和 Claude 售后补偿的处理方式。',
                )}
              </Text>
            </div>
            <Space wrap>
              <Button theme='outline' onClick={handleCopyEmail}>
                {t('复制售后邮箱')}
              </Button>
              <Button
                theme='solid'
                type='primary'
                onClick={() =>
                  window.open(
                    `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('FishXCode 退款/售后申请')}`,
                    '_self',
                  )
                }
              >
                {t('发送邮件')}
              </Button>
            </Space>
          </div>

          <Banner
            className='mt-4'
            type='info'
            closeIcon={null}
            description={
              <div className='space-y-1 text-sm'>
                <div>
                  {t('1. 充值余额支持按 1:1 原路退款，申请时请提供订单号与账户信息。')}
                </div>
                <div>
                  {isTokenUsageSettlement
                    ? selectedRefundTarget === REFUND_TARGET_ORIGINAL_PAYMENT
                      ? t(
                          '2. 命中活动的套餐可按后台配置的 1M token 标准单价核算退款金额，系统会先扣减已消耗成本，再按原支付方式退款。',
                        )
                      : t(
                          '2. 命中活动的套餐可按后台配置的 1M token 标准单价折算，系统会先扣减已消耗成本，再返还剩余余额。',
                        )
                    : selectedRefundTarget === REFUND_TARGET_ORIGINAL_PAYMENT
                      ? t(
                          '2. 命中活动的套餐可按系统当前规则核算退款金额，审核通过后按原支付方式退款，不会自动转成余额。',
                        )
                      : t(
                          '2. 命中活动的套餐可按系统当前规则折算，提交后旧套餐会先临时禁用，审核通过后返还余额。',
                        )}
                </div>
                <div>
                  {t(
                    '3. Claude 套餐不支持退款，仅在承诺次数明显不足时提供补偿，不折现不原路退。',
                  )}
                </div>
              </div>
            }
          />
        </Card>

        <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
          <Card
            className='!rounded-2xl border border-emerald-200 bg-emerald-50/70 shadow-none'
            bodyStyle={{ padding: '20px' }}
          >
            <div className='space-y-3'>
              <div>
                <Title heading={5} style={{ margin: 0 }}>
                  {t('充值余额退款')}
                </Title>
                <Text type='tertiary'>
                  {t('支持按 1:1 原路退款，实际到账时间取决于支付通道。')}
                </Text>
              </div>

              <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
                <div className='rounded-xl bg-white/80 p-3'>
                  <div className='text-xs text-gray-500'>{t('退款比例')}</div>
                  <div className='mt-1 font-semibold'>{t('1:1 原路退款')}</div>
                </div>
                <div className='rounded-xl bg-white/80 p-3'>
                  <div className='text-xs text-gray-500'>{t('提交材料')}</div>
                  <div className='mt-1 font-semibold'>
                    {t('账户 ID、订单号、退款说明')}
                  </div>
                </div>
              </div>

              <div className='rounded-xl bg-white/80 p-4 text-sm text-semi-color-text-1'>
                <div>{t('适用范围')}：{t('充值到账后的账户余额')}</div>
                <div className='mt-2'>
                  {t('处理方式')}：
                  {t('售后确认订单后原路退回，若支付通道收取手续费，用户需自行承担。')}
                </div>
                <div className='mt-2'>
                  {t('建议')}：
                  {t('提交时一并说明支付渠道和订单截图，可减少人工核对时间。')}
                </div>
              </div>
            </div>
          </Card>

          <Card
            className='!rounded-2xl border border-sky-200 bg-sky-50/70 shadow-none'
            bodyStyle={{ padding: '20px' }}
          >
            <div className='space-y-3'>
              <div>
                <Title heading={5} style={{ margin: 0 }}>
                  {t('Claude 售后补偿')}
                </Title>
                <Text type='tertiary'>
                  {t('Claude 套餐不支持退款，仅提供可用性不足时的次数补偿。')}
                </Text>
              </div>

              <Banner
                type='warning'
                closeIcon={null}
                description={
                  <div className='space-y-1 text-sm'>
                    <div>
                      {t(
                        '若某自然日稳定可用次数低于承诺次数的 80%，可申请补偿 1 天对应次数额度。',
                      )}
                    </div>
                    <div>
                      {t('补偿属于售后补偿，不折现、不原路退款，也不会转成账户余额。')}
                    </div>
                  </div>
                }
              />

              <div className='rounded-xl bg-white/80 p-4 text-sm text-semi-color-text-1'>
                <div>{t('所需信息')}：{t('账户 ID、受影响日期、模型、失败截图或使用记录')}</div>
                <div className='mt-2'>
                  {t('处理结果')}：
                  {t('审核通过后补发 1 天对应次数额度；若不满足条件则不会补偿。')}
                </div>
                <div className='mt-2'>
                  {t('联系渠道')}：
                  <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    style={{ color: 'var(--semi-color-link)' }}
                  >
                    {SUPPORT_EMAIL}
                  </a>
                  {t('，或前往')}
                  <Link
                    to='/contact'
                    style={{ color: 'var(--semi-color-link)', margin: '0 4px' }}
                  >
                    {t('联系我们')}
                  </Link>
                  {t('页面。')}
                </div>
              </div>
            </div>
          </Card>
        </div>

        <Card
          className='!rounded-2xl border border-amber-200 bg-amber-50/70 shadow-none'
          bodyStyle={{ padding: '20px' }}
        >
          <div className='space-y-4'>
            <div className='flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between'>
              <div className='space-y-1'>
                <Space wrap>
                  <Title heading={5} style={{ margin: 0 }}>
                    {t('套餐退款/折算申请')}
                  </Title>
                  <Tag
                    color={
                      latestRequestMeta?.color ||
                      (conversionPreview?.can_execute ? 'green' : 'grey')
                    }
                    shape='circle'
                    size='small'
                  >
                    {latestRequestMeta?.text ||
                      (conversionPreview?.can_execute
                        ? t('可申请')
                        : t('查看规则'))}
                  </Tag>
                </Space>
                <Text type='tertiary'>{conversionSummary}</Text>
              </div>
              <Space wrap>
                <Button onClick={loadConversionPreview} loading={conversionLoading}>
                  {t('刷新')}
                </Button>
                <Button
                  theme='solid'
                  type='warning'
                  loading={submitting}
                  disabled={
                    !selectedRefundTarget ||
                    !conversionPreview?.can_execute ||
                    submitting ||
                    latestRequest?.status === 'pending'
                  }
                  onClick={handleSubmitConversionRequest}
                >
                  {latestRequest?.status === 'pending'
                    ? t('申请审核中')
                    : selectedRefundTarget === REFUND_TARGET_ORIGINAL_PAYMENT
                      ? t('提交套餐原路退款申请')
                      : t('提交套餐转余额申请')}
                </Button>
              </Space>
            </div>

            <Banner
              type='warning'
              closeIcon={null}
              description={
                <div className='space-y-1 text-sm'>
                  <div>
                    {isTokenUsageSettlement
                      ? t(
                          '折算结果以系统预览为准，核心依据是成功支付订单实付金额、已消耗的标准输入/输出/cache tokens 与后台退款单价配置。',
                        )
                      : t(
                          '折算结果以系统预览为准，核心依据是成功支付订单的实付金额、套餐周期和计费天数。',
                        )}
                  </div>
                  <div>
                    {t(
                      '仅有效期内、命中活动范围、且能关联成功支付订单的套餐可以申请。',
                    )}
                  </div>
                  <div>
                    {t('提交后旧套餐立即临时禁用；审核通过后正式作废，拒绝则恢复。')}
                  </div>
                </div>
              }
            />

            <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
              <div className='rounded-xl bg-white/80 p-4'>
                <div className='text-xs text-gray-500'>{t('退款去向')}</div>
                <div className='mt-2'>
                  <Select
                    value={selectedRefundTarget}
                    onChange={setSelectedRefundTarget}
                    optionList={allowedRefundTargets.map((value) => ({
                      value,
                      label:
                        value === REFUND_TARGET_ORIGINAL_PAYMENT
                          ? t('原有支付方式')
                          : t('账户余额'),
                    }))}
                    placeholder={t('请选择退款去向')}
                    style={{ width: '100%' }}
                  />
                </div>
                <Text type='tertiary' size='small' className='mt-2 block'>
                  {selectedRefundTarget === REFUND_TARGET_ORIGINAL_PAYMENT
                    ? t(
                        '选择原路退款后，审批通过只会记录应退金额和支付单信息，财务仍需按原支付方式人工处理。',
                      )
                    : t(
                        '选择退到账户余额后，审批通过会直接把核准额度返还到你的系统余额。',
                      )}
                </Text>
              </div>
              <div className='rounded-xl bg-white/80 p-4'>
                <div className='text-xs text-gray-500'>{t('当前处理方式')}</div>
                <div className='mt-1 font-semibold'>
                  {selectedRefundTarget === REFUND_TARGET_ORIGINAL_PAYMENT
                    ? t('按审批金额原路退款')
                    : t('按审批额度退到账户余额')}
                </div>
                <Text type='tertiary' size='small' className='mt-2 block'>
                  {selectedRefundTarget === REFUND_TARGET_ORIGINAL_PAYMENT
                    ? t('原路退款不会自动折算成余额，到账时间取决于原支付通道。')
                    : t('账户余额到账后会继续按当前站点的钱包计费规则扣减。')}
                </Text>
              </div>
            </div>

            {conversionLoading ? (
              <Skeleton
                placeholder={
                  <Skeleton.Paragraph rows={6} style={{ width: '100%' }} />
                }
                loading
              />
            ) : (
              <>
                {(conversionPreview?.campaign?.conversion_rule ||
                  (conversionPreview?.campaign?.billing_rules || []).length > 0 ||
                  (conversionPreview?.campaign?.charge_rules || []).length >
                    0) && (
                  <Collapse>
                    <Collapse.Panel
                      itemKey='refund-policy-rules'
                      header={t('详细规则与计算方式')}
                    >
                      <div className='space-y-2 text-sm text-semi-color-text-1'>
                        {conversionPreview?.campaign?.conversion_rule ? (
                          <div>{conversionPreview.campaign.conversion_rule}</div>
                        ) : null}
                        {(conversionPreview?.campaign?.billing_rules || []).map(
                          (rule) => (
                            <div key={rule}>• {rule}</div>
                          ),
                        )}
                        {(conversionPreview?.campaign?.charge_rules || []).map(
                          (rule) => (
                            <div key={rule}>• {rule}</div>
                          ),
                        )}
                      </div>
                    </Collapse.Panel>
                  </Collapse>
                )}

                <div className='grid grid-cols-1 gap-3 md:grid-cols-3'>
                  <div className='rounded-xl bg-white/80 p-4'>
                    <div className='text-xs text-gray-500'>{t('活动标题')}</div>
                    <div className='mt-1 font-semibold'>
                      {conversionPreview?.campaign?.title || t('套餐退款')}
                    </div>
                  </div>
                  <div className='rounded-xl bg-white/80 p-4'>
                    <div className='text-xs text-gray-500'>{t('活动截止')}</div>
                    <div className='mt-1 font-semibold'>
                      {formatDateTime(conversionPreview?.campaign?.deadline)}
                    </div>
                  </div>
                  <div className='rounded-xl bg-white/80 p-4'>
                    <div className='text-xs text-gray-500'>
                      {selectedRefundTarget === REFUND_TARGET_ORIGINAL_PAYMENT
                        ? t('预计退款金额')
                        : t('预计返还')}
                    </div>
                    <div className='mt-1 font-semibold'>
                      {selectedRefundTarget === REFUND_TARGET_ORIGINAL_PAYMENT
                        ? renderQuotaWithAmount(
                            Number(
                              conversionPreview?.total_convertible_amount || 0,
                            ),
                          )
                        : renderQuota(
                            conversionPreview?.total_convertible_quota || 0,
                          )}
                    </div>
                  </div>
                </div>

                  {(conversionPreview?.items || []).length > 0 ? (
                  <div className='space-y-3'>
                    {(conversionPreview?.items || []).map((item) => (
                      <div
                        key={item.user_subscription_id}
                        className='rounded-xl border border-semi-color-border bg-white/80 p-4'
                      >
                        <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
                          <div>
                            <div className='font-semibold'>{item.plan_title}</div>
                            <Text type='tertiary' size='small'>
                              #{item.user_subscription_id} · {t('来源')} {item.source || '--'}
                            </Text>
                            <Text
                              type='tertiary'
                              size='small'
                              className='mt-1 block'
                            >
                              {t('有效期')}：{formatDateTime(item.start_time)} ~{' '}
                              {formatDateTime(item.end_time)}
                            </Text>
                          </div>
                          <div className='text-left lg:text-right'>
                            <div className='font-semibold'>
                              {selectedRefundTarget ===
                              REFUND_TARGET_ORIGINAL_PAYMENT
                                ? renderQuotaWithAmount(
                                    Number(item.convertible_amount || 0),
                                  )
                                : renderQuota(item.convertible_quota || 0)}
                            </div>
                            <Text type='tertiary' size='small' className='block'>
                              {selectedRefundTarget ===
                              REFUND_TARGET_ORIGINAL_PAYMENT
                                ? t('预计退款金额')
                                : t('预计折算金额')}{' '}
                              {renderQuotaWithAmount(
                                Number(item.convertible_amount || 0),
                              )}
                            </Text>
                            <Text type='tertiary' size='small' className='block'>
                              {t('折算基价')}{' '}
                              {renderQuotaWithAmount(
                                Number(item.price_basis_amount || 0),
                              )}
                            </Text>
                            {item.settlement_mode === 'token_usage' ? (
                              <>
                                <Text
                                  type='tertiary'
                                  size='small'
                                  className='block'
                                >
                                  {t('已消耗成本')}{' '}
                                  {renderQuotaWithAmount(
                                    Number(item.consumed_cost_amount || 0),
                                  )}
                                </Text>
                                <Text
                                  type='tertiary'
                                  size='small'
                                  className='block'
                                >
                                  {t('标准输入 tokens')}{' '}
                                  {formatTokenCount(item.billed_input_tokens)}
                                </Text>
                              </>
                            ) : (
                              <>
                                <Text
                                  type='tertiary'
                                  size='small'
                                  className='block'
                                >
                                  {t('剩余比例')}{' '}
                                  {Math.round(
                                    Number(item.remaining_ratio || 0) * 10000,
                                  ) / 100}
                                  %
                                </Text>
                                <Text
                                  type='tertiary'
                                  size='small'
                                  className='block'
                                >
                                  {t('计费天数')}{' '}
                                  {Number(item.billable_used_days || 0)} /{' '}
                                  {Number(item.duration_days || 0)} {t('天')}
                                </Text>
                              </>
                            )}
                          </div>
                        </div>
                        <div className='mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4'>
                          {item.settlement_mode === 'token_usage' ? (
                            <>
                              <div className='rounded-lg bg-amber-50 px-3 py-2 text-sm'>
                                <div className='text-xs text-gray-500'>
                                  {t('输入 tokens')}
                                </div>
                                <div className='mt-1 font-semibold'>
                                  {formatTokenCount(item.input_tokens)}
                                </div>
                              </div>
                              <div className='rounded-lg bg-amber-50 px-3 py-2 text-sm'>
                                <div className='text-xs text-gray-500'>
                                  {t('输出 tokens')}
                                </div>
                                <div className='mt-1 font-semibold'>
                                  {formatTokenCount(item.output_tokens)}
                                </div>
                              </div>
                              <div className='rounded-lg bg-amber-50 px-3 py-2 text-sm'>
                                <div className='text-xs text-gray-500'>
                                  {t('Cache Read tokens')}
                                </div>
                                <div className='mt-1 font-semibold'>
                                  {formatTokenCount(item.cache_read_tokens)}
                                </div>
                              </div>
                              <div className='rounded-lg bg-amber-50 px-3 py-2 text-sm'>
                                <div className='text-xs text-gray-500'>
                                  {t('Cache Write tokens')}
                                </div>
                                <div className='mt-1 font-semibold'>
                                  {formatTokenCount(item.cache_write_tokens)}
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className='rounded-lg bg-amber-50 px-3 py-2 text-sm'>
                                <div className='text-xs text-gray-500'>
                                  {t('已使用天数')}
                                </div>
                                <div className='mt-1 font-semibold'>
                                  {Number(item.used_days || 0)} {t('天')}
                                </div>
                              </div>
                              <div className='rounded-lg bg-amber-50 px-3 py-2 text-sm'>
                                <div className='text-xs text-gray-500'>
                                  {t('计费天数')}
                                </div>
                                <div className='mt-1 font-semibold'>
                                  {Number(item.billable_used_days || 0)} /{' '}
                                  {Number(item.duration_days || 0)} {t('天')}
                                </div>
                              </div>
                              <div className='rounded-lg bg-amber-50 px-3 py-2 text-sm'>
                                <div className='text-xs text-gray-500'>
                                  {t('剩余比例')}
                                </div>
                                <div className='mt-1 font-semibold'>
                                  {Math.round(
                                    Number(item.remaining_ratio || 0) * 10000,
                                  ) / 100}
                                  %
                                </div>
                              </div>
                              <div className='rounded-lg bg-amber-50 px-3 py-2 text-sm'>
                                <div className='text-xs text-gray-500'>
                                  {t('结算模式')}
                                </div>
                                <div className='mt-1 font-semibold'>
                                  {t('按剩余时长折算')}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                        <div className='mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-semi-color-text-1'>
                          <div className='text-xs text-gray-500'>{t('计算公式')}</div>
                          <div className='mt-1'>{item.formula || '--'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty
                    image={<Empty.PRESENTED_IMAGE_SIMPLE />}
                    description={
                      conversionPreview?.closed_reason ||
                      t('当前没有可直接申请折算的套餐')
                    }
                  />
                )}

                {latestRequest ? (
                  <div className='rounded-xl border border-semi-color-border bg-white/80 p-4 text-sm text-semi-color-text-1'>
                    <Space wrap align='center'>
                      <Text strong>{t('最近一次申请')}</Text>
                      <Tag
                        color={latestRequestMeta?.color}
                        shape='circle'
                        size='small'
                      >
                        {latestRequestMeta?.text}
                      </Tag>
                    </Space>
                    <div className='mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2'>
                      <div>
                        {t('退款去向')}：
                        {latestRequestRefundTarget === REFUND_TARGET_ORIGINAL_PAYMENT
                          ? t('原有支付方式')
                          : t('账户余额')}
                      </div>
                      <div>
                        {t('申请单')} #{latestRequest.id}
                      </div>
                      <div>
                        {t('申请时间')}：{formatDateTime(latestRequest.create_time)}
                      </div>
                      {latestRequest.disabled_at ? (
                        <div>
                          {t('禁用时间')}：{formatDateTime(latestRequest.disabled_at)}
                        </div>
                      ) : null}
                      {latestRequestRefundTarget === REFUND_TARGET_ORIGINAL_PAYMENT ? (
                        <div>
                          {t('打款状态')}：
                          {latestRequest.payout_status === 'paid'
                            ? t('已打款')
                            : latestRequest.status === 'approved'
                              ? t('待打款')
                              : '--'}
                        </div>
                      ) : null}
                      {latestRequest.payout_at ? (
                        <div>
                          {t('打款时间')}：{formatDateTime(latestRequest.payout_at)}
                        </div>
                      ) : null}
                      {latestRequest.payout_remark ? (
                        <div>
                          {t('打款备注')}：{latestRequest.payout_remark}
                        </div>
                      ) : null}
                      {latestRequest.admin_remark ? (
                        <div>
                          {t('管理员备注')}：{latestRequest.admin_remark}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </Card>

        <Card
          className='!rounded-2xl border border-semi-color-border shadow-none'
          bodyStyle={{ padding: '20px' }}
        >
          <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
            <div>
              <Title heading={6} style={{ margin: 0 }}>
                {t('补充说明')}
              </Title>
              <Text type='tertiary'>
                {t('开票仍然走系统内申请流程；折算与退款以当前活动预览和人工审核结果为准。')}
              </Text>
            </div>
            <Space wrap>
              <Link to='/console/invoice'>
                <Button theme='outline'>{t('前往发票管理')}</Button>
              </Link>
              <Link to='/contact'>
                <Button theme='outline'>{t('联系我们')}</Button>
              </Link>
            </Space>
          </div>
        </Card>

        {isAdminUser ? (
          <div className='space-y-3'>
            <Card
              className='!rounded-2xl border border-semi-color-border shadow-none'
              bodyStyle={{ padding: '20px' }}
            >
              <div className='flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between'>
                <div>
                  <Title heading={6} style={{ margin: 0 }}>
                    {t('管理员处理区')}
                  </Title>
                  <Text type='tertiary'>
                    {t('你可以直接在本页处理用户提交的退款/折算申请，无需再跳转到订阅后台。')}
                  </Text>
                </div>
                <Tag color='orange' shape='circle'>
                  {t('仅管理员可见')}
                </Tag>
              </div>
            </Card>
            <SubscriptionConversionRequestsPanel t={t} />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default RefundPage;
