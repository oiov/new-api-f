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

import React, { useMemo, useRef, useState } from 'react';
import {
  Button,
  Checkbox,
  Empty,
  Modal,
  Select,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { API, renderGroup, renderQuota, showError, showSuccess } from '../../../helpers';
import { renderQuotaWithAmount } from '../../../helpers/render';
import {
  formatSubscriptionResourceLabel,
  formatSubscriptionResetPeriod,
  getSubscriptionUsageSummary,
} from '../../../helpers/subscriptionFormat';
import CardTable from '../../common/ui/CardTable';

const { Text } = Typography;

function formatDateRange(sub, t) {
  if (!sub) return '-';
  const start = formatTs(sub?.start_time);
  const end = formatTs(sub?.end_time);
  if (start === '-' && end === '-') return '-';
  return (
    <div className='space-y-1 text-xs text-gray-600'>
      <div>
        {t('开始')} · {start}
      </div>
      <div>
        {t('结束')} · {end}
      </div>
    </div>
  );
}

function renderUsageBlock(sub, t) {
  const blocks = [];
  const usage = getSubscriptionUsageSummary(sub);
  if (usage.resourceType === 'request_count') {
    if (!usage.periodUnlimited) {
      blocks.push(
        <div key='count-period'>
          {t('周期次数')} {usage.periodUsed}/{usage.periodTotal} · {t('剩余')}{' '}
          {usage.periodRemain}
        </div>,
      );
    }
    if (!usage.unlimited) {
      blocks.push(
        <div key='count-total'>
          {t('总次数')} {usage.used}/{usage.total} · {t('剩余')}{' '}
          {usage.remain}
        </div>,
      );
    }
  } else {
    const amountTotal = Number(sub?.amount_total || 0);
    const amountUsed = Number(sub?.amount_used || 0);
    if (amountTotal > 0) {
      blocks.push(
        <div key='amount'>
          {formatSubscriptionResourceLabel(
            { resource_type: 'quota', reset_period: sub?.reset_period },
            t,
          )}{' '}
          {renderQuota(amountUsed)}/{renderQuota(amountTotal)} · {t('剩余')}{' '}
          {renderQuota(Math.max(0, amountTotal - amountUsed))}
        </div>,
      );
    }
  }
  if (blocks.length === 0) {
    const summary = getSubscriptionUsageSummary(sub);
    if (summary.unlimited) {
      return <div>{t('不限')}</div>;
    }
  }
  return blocks;
}

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
      <Tag color='green' size='small'>
        {t('生效')}
      </Tag>
    );
  }
  if (status === 'cancelled') {
    return (
      <Tag color='grey' size='small'>
        {t('已作废')}
      </Tag>
    );
  }
  return (
    <Tag color='orange' size='small'>
      {t('已过期')}
    </Tag>
  );
}

function renderSourceTag(source, t) {
  switch (source) {
    case 'redemption':
      return (
        <Tag color='orange' size='small'>
          {t('兑换码兑换')}
        </Tag>
      );
    case 'admin':
      return (
        <Tag color='blue' size='small'>
          {t('管理员发放')}
        </Tag>
      );
    case 'invite_reward':
      return (
        <Tag color='purple' size='small'>
          {t('邀请奖励')}
        </Tag>
      );
    case 'order':
      return (
        <Tag color='green' size='small'>
          {t('在线购买')}
        </Tag>
      );
    case 'derived_day_pass':
      return (
        <Tag color='cyan' size='small'>
          {t('派生天卡')}
        </Tag>
      );
    default:
      return <Tag size='small'>{source || '-'}</Tag>;
  }
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

const AdminUserSubscriptionsTable = ({
  dataSource,
  loading,
  compactMode,
  planTitleMap,
  openConsumeLogs,
  onDataChanged,
  t,
}) => {
  const searchTimerRef = useRef(null);
  const [transferVisible, setTransferVisible] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferUserSearchLoading, setTransferUserSearchLoading] =
    useState(false);
  const [transferSubscription, setTransferSubscription] = useState(null);
  const [transferTargetUserId, setTransferTargetUserId] = useState(null);
  const [transferUserOptions, setTransferUserOptions] = useState([]);
  const [reactivateOnTransfer, setReactivateOnTransfer] = useState(false);

  const buildUserOption = (user) => {
    const userId = Number(user?.id || 0);
    if (userId <= 0) return null;
    const username = String(user?.username || '').trim() || `#${userId}`;
    const email = String(user?.email || '').trim();
    return {
      label: email ? `${username} · ${email} (#${userId})` : `${username} (#${userId})`,
      value: userId,
    };
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
        setTransferUserOptions(
          (res.data?.data?.items || []).map(buildUserOption).filter(Boolean),
        );
      } else {
        showError(res.data?.message || t('搜索用户失败'));
      }
    } catch (error) {
      showError(error?.response?.data?.message || t('搜索用户失败'));
    } finally {
      setTransferUserSearchLoading(false);
    }
  };

  const openTransferModal = (sub) => {
    setTransferSubscription(sub || null);
    setTransferTargetUserId(null);
    setTransferUserOptions([]);
    setReactivateOnTransfer(String(sub?.status || '').trim() === 'cancelled');
    setTransferVisible(true);
    loadTransferUserOptions('');
  };

  const closeTransferModal = () => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    setTransferVisible(false);
    setTransferLoading(false);
    setTransferSubscription(null);
    setTransferTargetUserId(null);
    setTransferUserOptions([]);
    setReactivateOnTransfer(false);
  };

  const handleSearchTransferUsers = (keyword) => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = setTimeout(() => {
      loadTransferUserOptions(keyword);
    }, 300);
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
        showSuccess(res.data?.data?.message || t('转移成功'));
        closeTransferModal();
        onDataChanged?.();
      } else {
        showError(res.data?.message || t('转移失败'));
      }
    } catch (error) {
      showError(error?.response?.data?.message || t('转移失败'));
    } finally {
      setTransferLoading(false);
    }
  };

  const renderExpandedDetails = (record) => {
    const sub = record?.subscription;
    const refundOrder = record?.refund_order;
    const aggregateToken = record?.aggregate_access_token;
    const dedicatedToken = record?.dedicated_access_token;
    const planTitle =
      planTitleMap.get(sub?.plan_id) || (sub?.plan_id ? `#${sub.plan_id}` : '-');

    return (
      <div className='grid gap-3 p-2 lg:grid-cols-3'>
        <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3'>
          <div className='mb-2 text-xs font-medium text-semi-color-text-2'>
            {t('订阅信息')}
          </div>
          <div className='space-y-1 text-xs text-gray-600'>
            <div>
              {t('套餐')}：{planTitle}
            </div>
            <div>
              {t('来源')}：{renderSourceTag(sub?.source, t)}
            </div>
            <div>
              {t('配置分组')}：{record?.user_group ? renderGroup(record.user_group) : '-'}
            </div>
            <div>
              {t('升级分组')}：{sub?.upgrade_group ? renderGroup(sub.upgrade_group) : '-'}
            </div>
            <div>
              {t('重置规则')}：{formatSubscriptionResetPeriod(sub, t)}
            </div>
          </div>
        </div>

        <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3'>
          <div className='mb-2 text-xs font-medium text-semi-color-text-2'>
            {t('订单与绑定')}
          </div>
          <div className='space-y-1 text-xs text-gray-600'>
            <div>
              {t('支付单')} #{refundOrder?.order_id || '-'}
            </div>
            <div className='break-all'>{refundOrder?.trade_no || '-'}</div>
            <div>
              {t('充值单')} #{refundOrder?.topup_id || '-'} · {t('实付金额')}{' '}
              {renderQuotaWithAmount(Number(refundOrder?.money || 0))}
            </div>
            <div>
              {t('渠道')} #{sub?.specific_channel_id || '-'}
              {sub?.specific_channel_id > 0
                ? ` · Key #${Number(sub?.specific_channel_key_index ?? -1) >= 0 ? sub?.specific_channel_key_index : 0}`
                : ''}
            </div>
            <div>
              {t('聚合访问 Key')}：{aggregateToken?.key_preview || t('未生成')}
            </div>
            {aggregateToken?.token_id ? (
              <div className='flex items-center gap-2 flex-wrap'>
                <Tag size='small' color='white'>
                  #{aggregateToken.token_id}
                </Tag>
                {renderAccessTokenStatus(aggregateToken?.status, t)}
              </div>
            ) : null}
            {dedicatedToken?.token_id ? (
              <>
                <div>
                  {t('天卡独立 Key')}：{dedicatedToken?.key_preview || t('未生成')}
                </div>
                <div className='flex items-center gap-2 flex-wrap'>
                  <Tag size='small' color='cyan'>
                    #{dedicatedToken.token_id}
                  </Tag>
                  {renderAccessTokenStatus(dedicatedToken?.status, t)}
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3'>
          <div className='mb-2 text-xs font-medium text-semi-color-text-2'>
            {t('资源与时间')}
          </div>
          <div className='space-y-1 text-xs text-gray-600'>
            <div>{renderUsageBlock(sub, t)}</div>
            <div>
              {t('资源类型')}：{formatSubscriptionResourceLabel(sub, t)}
            </div>
            <div>{formatDateRange(sub, t)}</div>
          </div>
        </div>
      </div>
    );
  };

  const columns = useMemo(
    () => [
      {
        title: t('ID'),
        dataIndex: ['subscription', 'id'],
        width: 72,
      },
      {
        title: t('用户'),
        width: 180,
        render: (_, record) => (
          <div className='min-w-0'>
            <div className='truncate font-medium'>{record?.username || '-'}</div>
            <Text type='tertiary' size='small' className='block truncate'>
              #{record?.subscription?.user_id || '-'}
              {record?.user_group ? ` · ${record.user_group}` : ''}
            </Text>
          </div>
        ),
      },
      {
        title: t('套餐'),
        width: 220,
        render: (_, record) => {
          const sub = record?.subscription;
          const title =
            planTitleMap.get(sub?.plan_id) ||
            (sub?.plan_id ? `#${sub.plan_id}` : '-');
          return (
            <div className='min-w-0'>
              <div className='truncate'>{title}</div>
            <div className='mt-1 flex items-center gap-1 flex-wrap'>
                {renderSourceTag(sub?.source, t)}
                {Number(sub?.parent_user_subscription_id || 0) > 0 ? (
                  <Tag size='small' color='cyan'>
                    {t('父订阅')} #{sub?.parent_user_subscription_id}
                  </Tag>
                ) : null}
                {sub?.upgrade_group ? (
                  <Tag size='small' color='white'>
                    {sub.upgrade_group}
                  </Tag>
                ) : null}
              </div>
            </div>
          );
        },
      },
      {
        title: t('资源'),
        width: 180,
        render: (_, record) => {
          const sub = record?.subscription;
          return (
            <div className='text-xs text-gray-600 space-y-1'>
              <div>{renderUsageBlock(sub, t)}</div>
              <div>{formatSubscriptionResourceLabel(sub, t)}</div>
            </div>
          );
        },
      },
      {
        title: t('有效期'),
        width: 200,
        render: (_, record) => {
          const sub = record?.subscription;
          return formatDateRange(sub, t);
        },
      },
      {
        title: t('状态'),
        width: 96,
        render: (_, record) => (
          <div className='space-y-1'>
            {renderStatusTag(record?.subscription, t)}
            {record?.aggregate_access_token?.token_id ? (
              renderAccessTokenStatus(record?.aggregate_access_token?.status, t)
            ) : null}
            {record?.dedicated_access_token?.token_id ? (
              <Tag color='cyan' size='small'>
                {t('独立 Key')}
              </Tag>
            ) : null}
          </div>
        ),
      },
      {
        title: t('操作'),
        width: 180,
        render: (_, record) => (
          <div className='flex items-center gap-2 flex-wrap'>
            <Button
              theme='borderless'
              type='tertiary'
              size='small'
              onClick={() =>
                openConsumeLogs?.({
                  subscriptionId: record?.subscription?.id,
                  planId: record?.subscription?.plan_id,
                  userId: record?.subscription?.user_id,
                })
              }
            >
              {t('消耗记录')}
            </Button>
            {(record?.subscription?.source === 'derived_day_pass' ||
              Number(record?.subscription?.parent_user_subscription_id || 0) > 0) && (
              <Button
                theme='borderless'
                type='primary'
                size='small'
                onClick={() => openTransferModal(record?.subscription)}
              >
                {t('转赠天卡')}
              </Button>
            )}
          </div>
        ),
      },
    ],
    [openConsumeLogs, planTitleMap, t],
  );

  const tableColumns = useMemo(() => {
    return compactMode ? columns : columns;
  }, [compactMode, columns]);

  return (
    <>
      <CardTable
        columns={tableColumns}
        dataSource={dataSource}
        loading={loading}
        rowKey={(row) => row?.subscription?.id}
        pagination={false}
        hidePagination={true}
        expandedRowRender={renderExpandedDetails}
        scroll={{ x: 'max-content' }}
        empty={
          <Empty
            image={<IllustrationNoResult style={{ width: 150, height: 150 }} />}
            darkModeImage={
              <IllustrationNoResultDark style={{ width: 150, height: 150 }} />
            }
            description={t('暂无用户订阅')}
            style={{ padding: 30 }}
          />
        }
        size='small'
      />
      <Modal
        title={t('转赠派生天卡')}
        visible={transferVisible}
        onCancel={closeTransferModal}
        onOk={submitTransferSubscription}
        okText={t('确认转赠')}
        cancelText={t('取消')}
        confirmLoading={transferLoading}
      >
        <div className='space-y-4'>
          <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3 text-sm text-semi-color-text-1'>
            <div>
              {t('订阅')} #{transferSubscription?.id || '--'} ·{' '}
              {t('当前用户')} #{transferSubscription?.user_id || '--'}
            </div>
            <div className='mt-1 text-xs text-semi-color-text-2'>
              {t(
                '转赠后，原用户的天卡独立 Key 会立即失效并自动重签到目标用户名下。',
              )}
            </div>
          </div>
          <div>
            <div className='mb-1 text-sm font-medium text-semi-color-text-0'>
              {t('转移给其他用户')}
            </div>
            <Select
              filter
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
            {t('若天卡已作废，则按原自然有效期恢复为生效状态')}
          </Checkbox>
        </div>
      </Modal>
    </>
  );
};

export default AdminUserSubscriptionsTable;
