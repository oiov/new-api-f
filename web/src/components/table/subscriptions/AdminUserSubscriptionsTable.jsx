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

import React, { useMemo } from 'react';
import { Button, Empty, Tag, Typography } from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { renderGroup, renderQuota } from '../../../helpers';
import {
  formatSubscriptionResourceLabel,
  formatSubscriptionResetPeriod,
  getSubscriptionUsageSummary,
} from '../../../helpers/subscriptionFormat';
import CardTable from '../../common/ui/CardTable';

const { Text } = Typography;

function renderUsageBlock(sub, t) {
  const blocks = [];
  const requestTotal = Number(sub?.request_count_total || 0);
  const requestUsed = Number(sub?.request_count_used || 0);
  if (requestTotal > 0) {
    blocks.push(
      <div key='count'>
        {formatSubscriptionResourceLabel(
          { resource_type: 'request_count', reset_period: sub?.reset_period },
          t,
        )}{' '}
        {requestUsed}/{requestTotal} · {t('剩余')}{' '}
        {Math.max(0, requestTotal - requestUsed)}
      </div>,
    );
  }
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
    default:
      return <Tag size='small'>{source || '-'}</Tag>;
  }
}

const AdminUserSubscriptionsTable = ({
  dataSource,
  loading,
  compactMode,
  planTitleMap,
  openConsumeLogs,
  t,
}) => {
  const columns = useMemo(
    () => [
      {
        title: t('ID'),
        dataIndex: ['subscription', 'id'],
        width: 70,
      },
      {
        title: t('用户'),
        width: 180,
        render: (_, record) => (
          <div>
            <div className='font-medium'>{record?.username || '-'}</div>
            <Text type='tertiary' size='small'>
              #{record?.subscription?.user_id || '-'}
            </Text>
          </div>
        ),
      },
      {
        title: t('配置分组'),
        dataIndex: 'user_group',
        width: 120,
        render: (text) =>
          text ? renderGroup(text) : <Tag size='small'>-</Tag>,
      },
      {
        title: t('套餐'),
        width: 180,
        render: (_, record) => {
          const sub = record?.subscription;
          const title =
            planTitleMap.get(sub?.plan_id) ||
            (sub?.plan_id ? `#${sub.plan_id}` : '-');
          return (
            <div>
              <div>{title}</div>
              <Text type='tertiary' size='small'>
                {sub?.upgrade_group ? renderGroup(sub.upgrade_group) : '-'}
              </Text>
            </div>
          );
        },
      },
      {
        title: t('来源'),
        width: 120,
        render: (_, record) => renderSourceTag(record?.subscription?.source, t),
      },
      {
        title: t('资源'),
        width: 170,
        render: (_, record) => {
          const sub = record?.subscription;
          return (
            <div className='text-xs text-gray-600'>
              {renderUsageBlock(sub, t)}
            </div>
          );
        },
      },
      {
        title: t('重置规则'),
        width: 120,
        render: (_, record) =>
          formatSubscriptionResetPeriod(record?.subscription, t),
      },
      {
        title: t('有效期'),
        width: 220,
        render: (_, record) => {
          const sub = record?.subscription;
          return (
            <div className='text-xs text-gray-600'>
              <div>{formatTs(sub?.start_time)}</div>
              <div>{formatTs(sub?.end_time)}</div>
            </div>
          );
        },
      },
      {
        title: t('状态'),
        width: 100,
        render: (_, record) => renderStatusTag(record?.subscription, t),
      },
      {
        title: t('操作'),
        width: 120,
        render: (_, record) => (
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
        ),
      },
    ],
    [openConsumeLogs, planTitleMap, t],
  );

  const tableColumns = useMemo(() => {
    return compactMode ? columns : columns;
  }, [compactMode, columns]);

  return (
    <CardTable
      columns={tableColumns}
      dataSource={dataSource}
      loading={loading}
      rowKey={(row) => row?.subscription?.id}
      pagination={false}
      hidePagination={true}
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
      size='middle'
    />
  );
};

export default AdminUserSubscriptionsTable;
