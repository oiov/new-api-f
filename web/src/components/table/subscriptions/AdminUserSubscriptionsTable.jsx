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
import { renderQuota } from '../../../helpers';
import {
  formatSubscriptionResetPeriod,
  formatSubscriptionResourceLabel,
  getSubscriptionResourceType,
  getSubscriptionUsageSummary,
} from '../../../helpers/subscriptionFormat';
import CardTable from '../../common/ui/CardTable';

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
    return <Tag color='green' size='small'>{t('生效')}</Tag>;
  }
  if (status === 'cancelled') {
    return <Tag color='grey' size='small'>{t('已作废')}</Tag>;
  }
  return <Tag color='orange' size='small'>{t('已过期')}</Tag>;
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
        title: 'ID',
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
        title: t('用户分组'),
        dataIndex: 'user_group',
        width: 120,
        render: (text) => <Tag size='small'>{text || '-'}</Tag>,
      },
      {
        title: t('套餐'),
        width: 180,
        render: (_, record) => {
          const sub = record?.subscription;
          const title =
            planTitleMap.get(sub?.plan_id) || (sub?.plan_id ? `#${sub.plan_id}` : '-');
          return (
            <div>
              <div>{title}</div>
              <Text type='tertiary' size='small'>
                {sub?.upgrade_group || '-'}
              </Text>
            </div>
          );
        },
      },
      {
        title: t('资源'),
        width: 170,
        render: (_, record) => {
          const sub = record?.subscription;
          const summary = getSubscriptionUsageSummary(sub);
          const resourceType = getSubscriptionResourceType(sub);
          return (
            <div className='text-xs text-gray-600'>
              <div>{formatSubscriptionResourceLabel(sub, t)}</div>
              <div>
                {!summary.unlimited
                  ? resourceType === 'request_count'
                    ? `${summary.used}/${summary.total} · ${t('剩余')} ${summary.remain}`
                    : `${renderQuota(summary.used)}/${renderQuota(summary.total)} · ${t('剩余')} ${renderQuota(summary.remain)}`
                  : t('不限')}
              </div>
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
        title: '',
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
