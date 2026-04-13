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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Checkbox,
  Empty,
  Modal,
  Select,
  SideSheet,
  Space,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { IconPlusCircle } from '@douyinfe/semi-icons';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { API, renderQuota, showError, showSuccess } from '../../../../helpers';
import {
  convertUSDToCurrency,
  renderQuotaWithAmount,
} from '../../../../helpers/render';
import {
  formatSubscriptionResourceLabel,
  getSubscriptionResourceType,
  getSubscriptionUsageSummary,
} from '../../../../helpers/subscriptionFormat';
import { useIsMobile } from '../../../../hooks/common/useIsMobile';
import CardTable from '../../../common/ui/CardTable';

const { Text } = Typography;

function formatTs(ts) {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString();
}

function renderStatusTag(sub, t) {
  const now = Date.now() / 1000;
  const end = sub?.end_time || 0;
  const status = sub?.status || '';

  const isExpiredByTime = end > 0 && end < now;
  const isActive = status === 'active' && !isExpiredByTime;
  if (isActive) {
    return (
      <Tag color='green' shape='circle' size='small'>
        {t('生效')}
      </Tag>
    );
  }
  if (status === 'cancelled') {
    return (
      <Tag color='grey' shape='circle' size='small'>
        {t('已作废')}
      </Tag>
    );
  }
  return (
    <Tag color='grey' shape='circle' size='small'>
      {t('已过期')}
    </Tag>
  );
}

function renderAccessTokenStatus(status, t) {
  if (Number(status) === 1) {
    return (
      <Tag color='green' size='small'>
        {t('可用')}
      </Tag>
    );
  }
  return (
    <Tag color='grey' size='small'>
      {t('停用')}
    </Tag>
  );
}

function getPlanPeriodLabel(source, t) {
  const unit = source?.duration_unit || 'month';
  const value = Number(source?.duration_value || 1);
  if (unit === 'year') return `${value}${t('年')}`;
  if (unit === 'month') return `${value}${t('个月')}`;
  if (unit === 'week') return `${value}${t('周')}`;
  if (unit === 'day') return `${value}${t('天')}`;
  if (unit === 'hour') return `${value}${t('小时')}`;
  if (unit === 'custom') {
    const seconds = Number(source?.custom_seconds || 0);
    if (seconds % 86400 === 0) return `${seconds / 86400}${t('天')}`;
    if (seconds % 3600 === 0) return `${seconds / 3600}${t('小时')}`;
    if (seconds % 60 === 0) return `${seconds / 60}${t('分钟')}`;
    return `${seconds}${t('秒')}`;
  }
  return `${value}${t('个月')}`;
}

function buildUserOption(item) {
  if (!item?.id) return null;
  const username = item?.username || '-';
  const email = item?.email ? ` · ${item.email}` : '';
  return {
    label: `${username} (#${item.id})${email}`,
    value: item.id,
    raw: item,
  };
}

const UserSubscriptionsModal = ({ visible, onCancel, user, t, onSuccess }) => {
  const isMobile = useIsMobile();
  const searchTimerRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [plansLoading, setPlansLoading] = useState(false);

  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState(null);

  const [subs, setSubs] = useState([]);
  const [preferredSubscriptionId, setPreferredSubscriptionId] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [transferVisible, setTransferVisible] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferUserSearchLoading, setTransferUserSearchLoading] =
    useState(false);
  const [transferSubscription, setTransferSubscription] = useState(null);
  const [transferTargetUserId, setTransferTargetUserId] = useState(null);
  const [transferUserOptions, setTransferUserOptions] = useState([]);
  const [reactivateOnTransfer, setReactivateOnTransfer] = useState(false);
  const pageSize = 10;

  const planTitleMap = useMemo(() => {
    const map = new Map();
    (plans || []).forEach((p) => {
      const id = p?.plan?.id;
      const title = p?.plan?.title;
      if (id) map.set(id, title || `#${id}`);
    });
    return map;
  }, [plans]);

  const planMap = useMemo(() => {
    const map = new Map();
    (plans || []).forEach((p) => {
      const plan = p?.plan;
      if (plan?.id) {
        map.set(plan.id, plan);
      }
    });
    return map;
  }, [plans]);

  const pagedSubs = useMemo(() => {
    const start = Math.max(0, (Number(currentPage || 1) - 1) * pageSize);
    const end = start + pageSize;
    return (subs || []).slice(start, end);
  }, [subs, currentPage]);

  const planOptions = useMemo(() => {
    return (plans || []).map((p) => ({
      label: `${p?.plan?.title || ''} · ${formatSubscriptionResourceLabel(
        p?.plan,
        t,
      )} · ${convertUSDToCurrency(Number(p?.plan?.price_amount || 0), 2)}`,
      value: p?.plan?.id,
    }));
  }, [plans, t]);

  const loadPlans = async () => {
    setPlansLoading(true);
    try {
      const res = await API.get('/api/subscription/admin/plans');
      if (res.data?.success) {
        setPlans(res.data.data || []);
      } else {
        showError(res.data?.message || t('加载失败'));
      }
    } catch (e) {
      showError(t('请求失败'));
    } finally {
      setPlansLoading(false);
    }
  };

  const loadUserSubscriptions = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await API.get(
        `/api/subscription/admin/users/${user.id}/subscriptions`,
      );
      if (res.data?.success) {
        const payload = res.data.data;
        const next = Array.isArray(payload) ? payload : payload?.items || [];
        setSubs(next);
        setPreferredSubscriptionId(
          Number(Array.isArray(payload) ? 0 : payload?.preferred_subscription_id || 0),
        );
        setCurrentPage(1);
      } else {
        showError(res.data?.message || t('加载失败'));
      }
    } catch (e) {
      showError(t('请求失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!visible) return;
    setSelectedPlanId(null);
    setCurrentPage(1);
    loadPlans();
    loadUserSubscriptions();
  }, [visible]);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const loadTransferUserOptions = async (keyword = '') => {
    setTransferUserSearchLoading(true);
    try {
      const res = await API.get('/api/user/search', {
        params: {
          keyword: String(keyword || '').trim() || undefined,
          page: 1,
          page_size: 12,
        },
      });
      if (res.data?.success) {
        const items = res.data?.data?.items || [];
        setTransferUserOptions(
          items.map(buildUserOption).filter(Boolean),
        );
      } else {
        showError(res.data?.message || t('搜索用户失败'));
      }
    } catch (e) {
      showError(e?.response?.data?.message || t('搜索用户失败'));
    } finally {
      setTransferUserSearchLoading(false);
    }
  };

  const handleSearchTransferUsers = (keyword) => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = setTimeout(() => {
      loadTransferUserOptions(keyword);
    }, 300);
  };

  const closeTransferModal = () => {
    setTransferVisible(false);
    setTransferLoading(false);
    setTransferSubscription(null);
    setTransferTargetUserId(null);
    setTransferUserOptions([]);
    setReactivateOnTransfer(false);
  };

  const openTransferModal = (sub) => {
    setTransferSubscription(sub || null);
    setTransferTargetUserId(null);
    setTransferUserOptions([]);
    setReactivateOnTransfer((sub?.status || '') === 'cancelled');
    setTransferVisible(true);
    loadTransferUserOptions('');
  };

  const submitTransferSubscription = async () => {
    const subId = Number(transferSubscription?.id || 0);
    const targetUserId = Number(transferTargetUserId || 0);
    if (subId <= 0) {
      showError(t('订阅信息缺失'));
      return;
    }
    if (targetUserId <= 0) {
      showError(t('请选择目标用户'));
      return;
    }
    if (targetUserId === Number(transferSubscription?.user_id || 0)) {
      showError(t('不能转移给当前用户'));
      return;
    }
    setTransferLoading(true);
    try {
      const res = await API.post(
        `/api/subscription/admin/user_subscriptions/${subId}/transfer`,
        {
          target_user_id: targetUserId,
          reactivate: reactivateOnTransfer,
        },
      );
      if (res.data?.success) {
        const msg = res.data?.data?.message;
        showSuccess(msg ? msg : t('转移成功'));
        closeTransferModal();
        await loadUserSubscriptions();
        onSuccess?.();
      } else {
        showError(res.data?.message || t('转移失败'));
      }
    } catch (e) {
      showError(e?.response?.data?.message || t('转移失败'));
    } finally {
      setTransferLoading(false);
    }
  };

  const createSubscription = async () => {
    if (!user?.id) {
      showError(t('用户信息缺失'));
      return;
    }
    if (!selectedPlanId) {
      showError(t('请选择订阅套餐'));
      return;
    }
    setCreating(true);
    try {
      const res = await API.post(
        `/api/subscription/admin/users/${user.id}/subscriptions`,
        {
          plan_id: selectedPlanId,
        },
      );
      if (res.data?.success) {
        const msg = res.data?.data?.message;
        showSuccess(msg ? msg : t('新增成功'));
        setSelectedPlanId(null);
        await loadUserSubscriptions();
        onSuccess?.();
      } else {
        showError(res.data?.message || t('新增失败'));
      }
    } catch (e) {
      showError(t('请求失败'));
    } finally {
      setCreating(false);
    }
  };

  const invalidateSubscription = (subId) => {
    Modal.confirm({
      title: t('确认作废'),
      content: t('作废后该订阅将立即失效；若该订阅占用了人工发放位置，系统会同步释放该位置供后续重新发放。历史记录不受影响。是否继续？'),
      centered: true,
      onOk: async () => {
        try {
          const res = await API.post(
            `/api/subscription/admin/user_subscriptions/${subId}/invalidate`,
          );
          if (res.data?.success) {
            const msg = res.data?.data?.message;
            showSuccess(msg ? msg : t('已作废'));
            await loadUserSubscriptions();
            onSuccess?.();
          } else {
            showError(res.data?.message || t('操作失败'));
          }
        } catch (e) {
          showError(t('请求失败'));
        }
      },
    });
  };

  const operateSubscription = (subId, action, title, content) => {
    Modal.confirm({
      title,
      content,
      centered: true,
      onOk: async () => {
        try {
          const res = await API.post(
            `/api/subscription/admin/user_subscriptions/${subId}/action`,
            {
              action,
              value: 1,
            },
          );
          if (res.data?.success) {
            const msg = res.data?.data?.message;
            showSuccess(msg ? msg : t('操作成功'));
            await loadUserSubscriptions();
            onSuccess?.();
          } else {
            showError(res.data?.message || t('操作失败'));
          }
        } catch (e) {
          showError(t('请求失败'));
        }
      },
    });
  };

  const columns = useMemo(() => {
    return [
      {
        title: 'ID',
        dataIndex: ['subscription', 'id'],
        key: 'id',
        width: 70,
      },
      {
        title: t('套餐'),
        key: 'plan',
        width: 180,
        render: (_, record) => {
          const sub = record?.subscription;
          const planId = sub?.plan_id;
          const title =
            planTitleMap.get(planId) || (planId ? `#${planId}` : '-');
          return (
            <div className='min-w-0'>
              <div className='font-medium truncate'>{title}</div>
              <div className='text-xs text-gray-500'>
                {t('来源')}: {sub?.source || '-'}
              </div>
            </div>
          );
        },
      },
      {
        title: t('状态'),
        key: 'status',
        width: 200,
        render: (_, record) => {
          const sub = record?.subscription || {};
          const isPreferred =
            Number(sub?.id || 0) === Number(preferredSubscriptionId || 0);
          return (
            <Space wrap size={6}>
              {renderStatusTag(sub, t)}
              <Tag
                color={sub?.aggregate_enabled ? 'blue' : 'grey'}
                shape='circle'
                size='small'
              >
                {sub?.aggregate_enabled ? t('参与聚合') : t('暂停聚合')}
              </Tag>
              {isPreferred ? (
                <Tag color='orange' shape='circle' size='small'>
                  {t('优先消耗')}
                </Tag>
              ) : null}
            </Space>
          );
        },
      },
      {
        title: t('关联充值订单'),
        key: 'refund_order',
        width: 250,
        render: (_, record) => {
          const refundOrder = record?.refund_order;
          if (!refundOrder?.trade_no) {
            return <Text type='tertiary' size='small'>-</Text>;
          }
          return (
            <div className='text-xs text-gray-600 space-y-1'>
              <div>
                {t('支付单')} #{refundOrder.order_id || '-'}
              </div>
              <div className='break-all'>{refundOrder.trade_no}</div>
              <div>
                {t('充值单')} #{refundOrder.topup_id || '-'} ·{' '}
                {t('实付金额')} {renderQuotaWithAmount(Number(refundOrder.money || 0))}
              </div>
              <div>
                {t('支付方式')} {refundOrder.payment_method || '-'}
              </div>
            </div>
          );
        },
      },
      {
        title: t('有效期'),
        key: 'validity',
        width: 200,
        render: (_, record) => {
          const sub = record?.subscription;
          return (
            <div className='text-xs text-gray-600'>
              <div>
                {t('开始')}: {formatTs(sub?.start_time)}
              </div>
              <div>
                {t('结束')}: {formatTs(sub?.end_time)}
              </div>
            </div>
          );
        },
      },
      {
        title: t('套餐权益'),
        key: 'total',
        width: 160,
        render: (_, record) => {
          const sub = record?.subscription;
          const summary = getSubscriptionUsageSummary(sub);
          const resourceType = getSubscriptionResourceType(sub);
          return (
            <div className='text-xs text-gray-600'>
              <div>
                {formatSubscriptionResourceLabel(sub, t)}:{' '}
                {!summary.unlimited ? (
                  resourceType === 'request_count' ? (
                    `${summary.used}/${summary.total}`
                  ) : (
                    `${renderQuota(summary.used)}/${renderQuota(summary.total)}`
                  )
                ) : (
                  t('不限')
                )}
              </div>
              {!summary.unlimited && (
                <div>
                  {t('剩余')}:{' '}
                  {resourceType === 'request_count'
                    ? summary.remain
                    : renderQuota(summary.remain)}
                </div>
              )}
            </div>
          );
        },
      },
      {
        title: t('订阅绑定'),
        key: 'binding',
        width: 260,
        render: (_, record) => {
          const sub = record?.subscription;
          const aggregateToken = record?.aggregate_access_token;
          return (
            <div className='text-xs text-gray-600 space-y-1'>
              <div>
                {t('渠道')} #{sub?.specific_channel_id || '-'}
                {sub?.specific_channel_id > 0
                  ? ` · Key #${Number(sub?.specific_channel_key_index ?? -1) >= 0 ? sub?.specific_channel_key_index : 0}`
                  : ''}
              </div>
              <div>
                {t('聚合访问 Key')}:{' '}
                {aggregateToken?.key_preview || t('未生成')}
              </div>
              {aggregateToken?.token_id ? (
                <div className='flex items-center gap-2 flex-wrap'>
                  <Tag size='small' color='white'>
                    #{aggregateToken.token_id}
                  </Tag>
                  {renderAccessTokenStatus(aggregateToken?.status, t)}
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        title: '',
        key: 'operate',
        width: 320,
        fixed: 'right',
        render: (_, record) => {
          const sub = record?.subscription;
          const plan = planMap.get(sub?.plan_id);
          const periodLabel = getPlanPeriodLabel(
            sub?.duration_unit ? sub : plan,
            t,
          );
          const now = Date.now() / 1000;
          const isExpired =
            (sub?.end_time || 0) > 0 && (sub?.end_time || 0) < now;
          const isActive = sub?.status === 'active' && !isExpired;
          const isCancelled = sub?.status === 'cancelled';
          return (
            <Space wrap>
              <Button
                size='small'
                theme='light'
                disabled={isCancelled}
                onClick={() =>
                  operateSubscription(
                    sub?.id,
                    'extend_period',
                    t('确认延长套餐周期'),
                    t('该订阅的结束时间将延长 {{period}}。是否继续？', {
                      period: periodLabel,
                    }),
                  )
                }
              >
                +{periodLabel}
              </Button>
              <Button
                size='small'
                theme='light'
                type='secondary'
                disabled={isCancelled}
                onClick={() =>
                  operateSubscription(
                    sub?.id,
                    'reduce_period',
                    t('确认减少套餐周期'),
                    t('该订阅的结束时间将减少 {{period}}。是否继续？', {
                      period: periodLabel,
                    }),
                  )
                }
              >
                -{periodLabel}
              </Button>
              <Button
                size='small'
                theme='light'
                type='tertiary'
                disabled={!isActive || isCancelled}
                onClick={() =>
                  operateSubscription(
                    sub?.id,
                    'reset_usage_now',
                    t('确认重置当前周期用量'),
                    t('将立即清空当前重置周期已用额度或次数，并按该订阅的滚动周期重算下次重置时间。是否继续？'),
                  )
                }
              >
                {t('重置当期')}
              </Button>
              <Button
                size='small'
                theme='light'
                type={sub?.aggregate_enabled ? 'warning' : 'primary'}
                disabled={isCancelled}
                onClick={() =>
                  operateSubscription(
                    sub?.id,
                    sub?.aggregate_enabled
                      ? 'disable_aggregate_access'
                      : 'enable_aggregate_access',
                    sub?.aggregate_enabled
                      ? t('确认暂停聚合扣费')
                      : t('确认恢复聚合扣费'),
                    sub?.aggregate_enabled
                      ? t('暂停后，该订阅不会继续参与同一 Subscription Access Key 的自动扣费。是否继续？')
                      : t('恢复后，该订阅会重新参与同一 Subscription Access Key 的自动扣费。是否继续？'),
                  )
                }
              >
                {sub?.aggregate_enabled ? t('暂停聚合') : t('参与聚合')}
              </Button>
              <Button
                size='small'
                theme='light'
                type='primary'
                disabled={!isActive || isCancelled || !sub?.aggregate_enabled}
                onClick={() =>
                  operateSubscription(
                    sub?.id,
                    Number(sub?.id || 0) === Number(preferredSubscriptionId || 0)
                      ? 'clear_preferred'
                      : 'set_preferred',
                    Number(sub?.id || 0) === Number(preferredSubscriptionId || 0)
                      ? t('确认取消优先消耗')
                      : t('确认设为优先消耗'),
                    Number(sub?.id || 0) === Number(preferredSubscriptionId || 0)
                      ? t('取消后将回退到系统自动选择最合适的可用订阅。是否继续？')
                      : t('设置后，在该订阅仍参与聚合且可用时，系统会优先消耗它。是否继续？'),
                  )
                }
              >
                {Number(sub?.id || 0) === Number(preferredSubscriptionId || 0)
                  ? t('取消优先')
                  : t('设为优先')}
              </Button>
              <Button
                size='small'
                type='warning'
                theme='light'
                disabled={!isActive || isCancelled}
                onClick={() => invalidateSubscription(sub?.id)}
              >
                {t('作废')}
              </Button>
              <Button
                size='small'
                theme='light'
                type='primary'
                onClick={() => openTransferModal(sub)}
              >
                {t('转移')}
              </Button>
            </Space>
          );
        },
      },
    ];
  }, [t, planTitleMap, planMap, preferredSubscriptionId]);

  return (
    <SideSheet
      visible={visible}
      placement='right'
      width={isMobile ? '100%' : 920}
      bodyStyle={{ padding: 0 }}
      onCancel={onCancel}
      title={
        <Space>
          <Tag color='blue' shape='circle'>
            {t('管理')}
          </Tag>
          <Typography.Title heading={4} className='m-0'>
            {t('用户订阅管理')}
          </Typography.Title>
          <Text type='tertiary' className='ml-2'>
            {user?.username || '-'} ({t('用户 ID')}: {user?.id || '-'})
          </Text>
        </Space>
      }
    >
      <div className='p-4'>
        {/* 顶部操作栏：新增订阅 */}
        <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4'>
          <div className='flex gap-2 flex-1'>
            <Select
              placeholder={t('选择订阅套餐')}
              optionList={planOptions}
              value={selectedPlanId}
              onChange={setSelectedPlanId}
              loading={plansLoading}
              filter
              style={{ minWidth: isMobile ? undefined : 300, flex: 1 }}
            />
            <Button
              type='primary'
              theme='solid'
              icon={<IconPlusCircle />}
              loading={creating}
              onClick={createSubscription}
            >
              {t('新增订阅')}
            </Button>
          </div>
        </div>

        {/* 订阅列表 */}
        <CardTable
          columns={columns}
          dataSource={pagedSubs}
          rowKey={(row) => row?.subscription?.id}
          loading={loading}
          scroll={{ x: 'max-content' }}
          hidePagination={false}
          pagination={{
            currentPage,
            pageSize,
            total: subs.length,
            pageSizeOpts: [10, 20, 50],
            showSizeChanger: false,
            onPageChange: handlePageChange,
          }}
          empty={
            <Empty
              image={
                <IllustrationNoResult style={{ width: 150, height: 150 }} />
              }
              darkModeImage={
                <IllustrationNoResultDark style={{ width: 150, height: 150 }} />
              }
              description={t('暂无订阅记录')}
              style={{ padding: 30 }}
            />
          }
          size='middle'
        />
      </div>
      <Modal
        title={t('确认转移订阅')}
        visible={transferVisible}
        onCancel={closeTransferModal}
        onOk={submitTransferSubscription}
        okText={t('确认转移')}
        confirmLoading={transferLoading}
        centered
      >
        <div className='space-y-4'>
          <div className='rounded-xl border border-dashed border-semi-color-border bg-semi-color-fill-0 p-3'>
            <div className='text-sm font-medium text-semi-color-text-0'>
              {t('保留当前订阅 ID 与消耗历史，仅转移使用权')}
            </div>
            <div className='mt-1 text-xs text-semi-color-text-2'>
              {t(
                '转移后，该订阅的使用权与 Subscription Access 令牌归属将切换到目标用户；历史消耗记录会一并迁移到目标用户视角，且不会覆盖目标用户当前主分组。是否继续？',
              )}
            </div>
          </div>

          <div>
            <div className='mb-1 text-sm font-medium text-semi-color-text-0'>
              {t('转移给其他用户')}
            </div>
            <Select
              filter={false}
              remote
              loading={transferUserSearchLoading}
              optionList={transferUserOptions}
              value={transferTargetUserId}
              onSearch={handleSearchTransferUsers}
              onDropdownVisibleChange={(dropdownVisible) => {
                if (dropdownVisible && !transferUserOptions.length) {
                  loadTransferUserOptions('');
                }
              }}
              onChange={(value) => setTransferTargetUserId(value || null)}
              placeholder={t('搜索目标用户 ID / 用户名 / 邮箱')}
              autoClearSearchValue={false}
              style={{ width: '100%' }}
            />
          </div>

          <Checkbox
            checked={reactivateOnTransfer}
            onChange={(e) => setReactivateOnTransfer(Boolean(e?.target?.checked))}
          >
            {t('若订阅已作废，则按原自然有效期恢复为生效状态')}
          </Checkbox>
        </div>
      </Modal>
    </SideSheet>
  );
};

export default UserSubscriptionsModal;
