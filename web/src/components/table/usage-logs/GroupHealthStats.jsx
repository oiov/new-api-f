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
  Button,
  Card,
  Empty,
  Progress,
  Skeleton,
  Space,
  Tag,
} from '@douyinfe/semi-ui';
import { IconRefresh } from '@douyinfe/semi-icons';
import { renderQuota, timestamp2string } from '../../../helpers';

const getHealthColor = (successRate) => {
  if (successRate >= 99) return 'green';
  if (successRate >= 95) return 'blue';
  if (successRate >= 90) return 'orange';
  return 'red';
};

const GroupHealthStats = ({
  groupHealthStats,
  loadingGroupHealth,
  refreshGroupHealthStats,
  t,
}) => {
  const stats = Array.isArray(groupHealthStats) ? groupHealthStats : [];

  return (
    <Card
      className='!rounded-2xl !border-0 shadow-sm mb-3'
      bodyStyle={{ padding: 16 }}
    >
      <div className='flex items-center justify-between gap-3 mb-3'>
        <div>
          <div className='text-base font-semibold text-[var(--semi-color-text-0)]'>
            {t('分组健康状态')}
          </div>
          <div className='text-xs text-[var(--semi-color-text-2)] mt-1'>
            {t(
              '按时间、分组、模型、令牌、状态码等条件统计分组请求成功率，支持查看过去 1 小时或 24 小时',
            )}
          </div>
        </div>
        <Button
          icon={<IconRefresh />}
          size='small'
          loading={loadingGroupHealth}
          onClick={refreshGroupHealthStats}
        >
          {t('刷新')}
        </Button>
      </div>

      <Skeleton loading={loadingGroupHealth} active paragraph={{ rows: 2 }}>
        {stats.length === 0 ? (
          <Empty description={t('暂无分组健康数据')} />
        ) : (
          <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3'>
            {stats.map((item) => {
              const successRate = Number(item.success_rate || 0);
              const healthColor = getHealthColor(successRate);
              return (
                <div
                  key={item.group}
                  className='rounded-xl border border-[var(--semi-color-border)] p-3 bg-[var(--semi-color-bg-1)]'
                >
                  <div className='flex items-center justify-between gap-2 mb-3'>
                    <Space>
                      <Tag color={healthColor}>{item.group || 'default'}</Tag>
                      <span className='text-xs text-[var(--semi-color-text-2)]'>
                        {t('请求数')}: {item.total_count || 0}
                      </span>
                    </Space>
                    <span className='text-sm font-semibold'>
                      {successRate.toFixed(2)}%
                    </span>
                  </div>
                  <Progress
                    percent={Math.min(100, Math.max(0, successRate))}
                    stroke={healthColor}
                    showInfo={false}
                    aria-label={t('成功率')}
                  />
                  <div className='grid grid-cols-2 gap-2 mt-3 text-xs text-[var(--semi-color-text-1)]'>
                    <span>{t('成功')}: {item.success_count || 0}</span>
                    <span>{t('错误')}: {item.error_count || 0}</span>
                    <span>{t('消耗')}: {renderQuota(item.quota || 0)}</span>
                    <span>
                      {t('平均耗时')}: {Number(item.avg_use_time || 0).toFixed(2)}s
                    </span>
                  </div>
                  <div className='mt-2 text-xs text-[var(--semi-color-text-2)]'>
                    {t('最后请求')}:{' '}
                    {item.last_seen_at ? timestamp2string(item.last_seen_at) : '-'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Skeleton>
    </Card>
  );
};

export default GroupHealthStats;
