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

import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Empty,
  Progress,
  Skeleton,
  Space,
  Tag,
  Tabs,
  TabPane,
} from '@douyinfe/semi-ui';
import { IconRefresh } from '@douyinfe/semi-icons';
import { VChart } from '@visactor/react-vchart';
import { initVChartSemiTheme } from '@visactor/vchart-semi-theme';
import { renderQuota, timestamp2string } from '../../../helpers';

const CHART_OPTION = { mode: 'desktop-browser' };

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
  applyLogFilter,
  t,
}) => {
  const stats = Array.isArray(groupHealthStats) ? groupHealthStats : [];
  const [viewMode, setViewMode] = useState('card');
  const [scopeMode, setScopeMode] = useState('global');
  const [selectedGroup, setSelectedGroup] = useState('');

  useEffect(() => {
    initVChartSemiTheme({ isWatchingThemeSwitch: true });
  }, []);

  useEffect(() => {
    if (stats.length === 0) {
      setSelectedGroup('');
      return;
    }
    const selectedGroupExists = stats.some(
      (item) => (item.group || 'default') === selectedGroup,
    );
    if (!selectedGroup || !selectedGroupExists) {
      setSelectedGroup(stats[0].group || 'default');
    }
  }, [selectedGroup, stats]);

  const chartStats = useMemo(() => {
    if (scopeMode === 'local' && selectedGroup) {
      return stats.filter((item) => (item.group || 'default') === selectedGroup);
    }
    return stats;
  }, [scopeMode, selectedGroup, stats]);

  const chartSpec = useMemo(
    () => ({
      type: 'bar',
      data: [
        {
          id: 'groupHealth',
          values: chartStats.map((item) => ({
            group: item.group || 'default',
            successRate: Number(item.success_rate || 0),
            totalCount: Number(item.total_count || 0),
            errorCount: Number(item.error_count || 0),
          })),
        },
      ],
      xField: 'group',
      yField: 'successRate',
      seriesField: 'group',
      axes: [
        { orient: 'bottom', title: { visible: true, text: t('分组') } },
        { orient: 'left', title: { visible: true, text: t('成功率') } },
      ],
      tooltip: {
        mark: {
          content: [
            { key: t('成功率'), value: (datum) => `${Number(datum.successRate || 0).toFixed(2)}%` },
            { key: t('请求数'), value: (datum) => datum.totalCount },
            { key: t('错误'), value: (datum) => datum.errorCount },
          ],
        },
      },
      label: {
        visible: true,
        formatMethod: (value) => `${Number(value || 0).toFixed(1)}%`,
      },
      height: 280,
    }),
    [chartStats, t],
  );

  const selectGroup = (groupName) => {
    setSelectedGroup(groupName);
    setScopeMode('local');
    applyLogFilter?.({
      group: groupName,
      logType: '0',
    });
  };

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
          {selectedGroup && scopeMode === 'local' && (
            <div className='text-xs text-[var(--semi-color-primary)] mt-1'>
              {t('当前局部分组')}: {selectedGroup}
            </div>
          )}
        </div>
        <Space wrap>
          <Tabs type='button' size='small' activeKey={scopeMode} onChange={setScopeMode}>
            <TabPane tab={t('全局')} itemKey='global' />
            <TabPane tab={t('局部')} itemKey='local' />
          </Tabs>
          <Tabs type='button' size='small' activeKey={viewMode} onChange={setViewMode}>
            <TabPane tab={t('卡片')} itemKey='card' />
            <TabPane tab={t('图表')} itemKey='chart' />
          </Tabs>
          <Button
            icon={<IconRefresh />}
            size='small'
            loading={loadingGroupHealth}
            onClick={refreshGroupHealthStats}
          >
            {t('刷新')}
          </Button>
        </Space>
      </div>

      <Skeleton loading={loadingGroupHealth} active paragraph={{ rows: 2 }}>
        {stats.length === 0 ? (
          <Empty description={t('暂无分组健康数据')} />
        ) : viewMode === 'chart' ? (
          <div className='rounded-xl border border-[var(--semi-color-border)] bg-[var(--semi-color-bg-1)] p-2'>
            <VChart spec={chartSpec} option={CHART_OPTION} />
          </div>
        ) : (
          <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3'>
            {chartStats.map((item) => {
              const successRate = Number(item.success_rate || 0);
              const healthColor = getHealthColor(successRate);
              const groupName = item.group || 'default';
              return (
                <button
                  type='button'
                  key={groupName}
                  onClick={() => selectGroup(groupName)}
                  className='w-full cursor-pointer rounded-xl border border-[var(--semi-color-border)] bg-[var(--semi-color-bg-1)] p-3 text-left transition-colors hover:border-[var(--semi-color-primary)]'
                >
                  <div className='flex items-center justify-between gap-2 mb-3'>
                    <Space>
                      <Tag color={healthColor}>{groupName}</Tag>
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
                    {t('开始时间')}:{' '}
                    {item.first_seen_at
                      ? timestamp2string(item.first_seen_at)
                      : '-'}
                  </div>
                  <div className='mt-1 text-xs text-[var(--semi-color-text-2)]'>
                    {t('最后请求')}:{' '}
                    {item.last_seen_at ? timestamp2string(item.last_seen_at) : '-'}
                  </div>
                  <div className='mt-2 text-xs text-[var(--semi-color-primary)]'>
                    {t('点击查看该分组日志详情')}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Skeleton>
    </Card>
  );
};

export default GroupHealthStats;
