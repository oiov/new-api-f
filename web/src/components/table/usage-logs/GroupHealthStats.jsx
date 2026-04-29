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
  Typography,
} from '@douyinfe/semi-ui';
import {
  IconBarChartVStroked,
  IconChevronDown,
  IconChevronUp,
  IconGridView,
  IconLink,
  IconListView,
  IconRefresh,
} from '@douyinfe/semi-icons';
import { VChart } from '@visactor/react-vchart';
import { initVChartSemiTheme } from '@visactor/vchart-semi-theme';
import { renderQuota, timestamp2string } from '../../../helpers';

const CHART_OPTION = { mode: 'desktop-browser' };
const ERROR_LOG_FAQ_URL =
  'https://doc.fishxcode.com/en/faq#how-do-i-read-error-logs';
const STATUS_CODE_PREFIX_PATTERN = /^status_code=\d+,\s*/i;

const getHealthColor = (successRate) => {
  if (successRate >= 99) return 'green';
  if (successRate >= 95) return 'blue';
  if (successRate >= 90) return 'orange';
  return 'red';
};

const normalizeErrorReasons = (errorReasons) => {
  if (!Array.isArray(errorReasons)) return [];
  return errorReasons
    .slice(0, 3)
    .filter((reason) => reason?.content || reason?.status_code);
};

const cleanErrorMessage = (content) =>
  String(content || '')
    .replace(STATUS_CODE_PREFIX_PATTERN, '')
    .trim();

const GroupHealthStats = ({
  groupHealthStats,
  loadingGroupHealth,
  refreshGroupHealthStats,
  applyLogFilter,
  t,
}) => {
  const stats = Array.isArray(groupHealthStats) ? groupHealthStats : [];
  const [viewMode, setViewMode] = useState('chart');
  const [scopeMode, setScopeMode] = useState('global');
  const [expanded, setExpanded] = useState(true);
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
      return stats.filter(
        (item) => (item.group || 'default') === selectedGroup,
      );
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
            {
              key: t('成功率'),
              value: (datum) => `${Number(datum.successRate || 0).toFixed(2)}%`,
            },
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

  const selectErrorReason = (event, groupName, reason) => {
    event.stopPropagation();

    const errorMessage = cleanErrorMessage(reason.content);
    const patch = {
      group: groupName,
      logType: '5',
    };

    if (
      reason.status_code !== undefined &&
      reason.status_code !== null &&
      reason.status_code !== ''
    ) {
      patch.status_code = String(reason.status_code);
    }
    if (errorMessage) {
      patch.error_message = errorMessage;
    }

    applyLogFilter?.(patch);
  };

  return (
    <Card
      className='!rounded-2xl !border-0 shadow-sm mb-4'
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
          <Typography.Text
            link={{
              href: ERROR_LOG_FAQ_URL,
              target: '_blank',
              rel: 'noopener noreferrer',
            }}
            icon={<IconLink />}
            underline
          >
            {t('错误日志说明')}
          </Typography.Text>
          <Tabs
            type='button'
            size='small'
            activeKey={scopeMode}
            onChange={setScopeMode}
          >
            <TabPane tab={t('全局')} itemKey='global' />
            <TabPane tab={t('局部')} itemKey='local' />
          </Tabs>
          <Button.Group size='small'>
            <Button
              type={viewMode === 'card' ? 'primary' : 'tertiary'}
              icon={<IconGridView />}
              aria-label={t('卡片')}
              title={t('卡片')}
              onClick={() => setViewMode('card')}
            />
            <Button
              type={viewMode === 'list' ? 'primary' : 'tertiary'}
              icon={<IconListView />}
              aria-label={t('列表')}
              title={t('列表')}
              onClick={() => setViewMode('list')}
            />
            <Button
              type={viewMode === 'chart' ? 'primary' : 'tertiary'}
              icon={<IconBarChartVStroked />}
              aria-label={t('图表')}
              title={t('图表')}
              onClick={() => setViewMode('chart')}
            />
          </Button.Group>
          <Button
            icon={expanded ? <IconChevronUp /> : <IconChevronDown />}
            size='small'
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? t('收起') : t('展开')}
          </Button>
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

      {expanded && (
        <Skeleton loading={loadingGroupHealth} active paragraph={{ rows: 2 }}>
          {stats.length === 0 ? (
            <Empty description={t('暂无分组健康数据')} />
          ) : viewMode === 'chart' ? (
            <div className='rounded-xl border border-[var(--semi-color-border)] bg-[var(--semi-color-bg-1)] p-2'>
              <VChart spec={chartSpec} option={CHART_OPTION} />
            </div>
          ) : viewMode === 'list' ? (
            <div className='overflow-x-auto rounded-xl border border-[var(--semi-color-border)] bg-[var(--semi-color-bg-1)]'>
              <table className='min-w-full text-left text-xs'>
                <thead className='bg-[var(--semi-color-fill-0)] text-[var(--semi-color-text-2)]'>
                  <tr>
                    <th className='whitespace-nowrap px-3 py-2 font-medium'>
                      {t('分组')}
                    </th>
                    <th className='whitespace-nowrap px-3 py-2 font-medium'>
                      {t('成功率')}
                    </th>
                    <th className='whitespace-nowrap px-3 py-2 font-medium'>
                      {t('请求数')}
                    </th>
                    <th className='whitespace-nowrap px-3 py-2 font-medium'>
                      {t('成功')}
                    </th>
                    <th className='whitespace-nowrap px-3 py-2 font-medium'>
                      {t('错误')}
                    </th>
                    <th className='whitespace-nowrap px-3 py-2 font-medium'>
                      {t('消耗')}
                    </th>
                    <th className='whitespace-nowrap px-3 py-2 font-medium'>
                      {t('平均耗时')}
                    </th>
                    <th className='whitespace-nowrap px-3 py-2 font-medium'>
                      {t('开始时间')}
                    </th>
                    <th className='whitespace-nowrap px-3 py-2 font-medium'>
                      {t('最后请求')}
                    </th>
                    <th className='min-w-[240px] px-3 py-2 font-medium'>
                      {t('失败原因')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {chartStats.map((item) => {
                    const successRate = Number(item.success_rate || 0);
                    const healthColor = getHealthColor(successRate);
                    const groupName = item.group || 'default';
                    const errorReasons = normalizeErrorReasons(
                      item.error_reasons,
                    );

                    return (
                      <tr
                        key={groupName}
                        className='cursor-pointer border-t border-[var(--semi-color-border)] text-[var(--semi-color-text-1)] transition-colors hover:bg-[var(--semi-color-fill-0)]'
                        onClick={() => selectGroup(groupName)}
                      >
                        <td className='whitespace-nowrap px-3 py-2'>
                          <Tag color={healthColor}>{groupName}</Tag>
                        </td>
                        <td className='whitespace-nowrap px-3 py-2 font-semibold'>
                          {successRate.toFixed(2)}%
                        </td>
                        <td className='whitespace-nowrap px-3 py-2'>
                          {item.total_count || 0}
                        </td>
                        <td className='whitespace-nowrap px-3 py-2'>
                          {item.success_count || 0}
                        </td>
                        <td className='whitespace-nowrap px-3 py-2'>
                          {item.error_count || 0}
                        </td>
                        <td className='whitespace-nowrap px-3 py-2'>
                          {renderQuota(item.quota || 0)}
                        </td>
                        <td className='whitespace-nowrap px-3 py-2'>
                          {Number(item.avg_use_time || 0).toFixed(2)}s
                        </td>
                        <td className='whitespace-nowrap px-3 py-2'>
                          {item.first_seen_at
                            ? timestamp2string(item.first_seen_at)
                            : '-'}
                        </td>
                        <td className='whitespace-nowrap px-3 py-2'>
                          {item.last_seen_at
                            ? timestamp2string(item.last_seen_at)
                            : '-'}
                        </td>
                        <td className='px-3 py-2'>
                          {errorReasons.length > 0 ? (
                            <div className='space-y-1'>
                              {errorReasons.map((reason, index) => {
                                const statusCode = reason.status_code || '-';
                                const errorMessage =
                                  cleanErrorMessage(reason.content) || '-';
                                const reasonKey = `${groupName}-${statusCode}-${reason.content || index}`;

                                return (
                                  <button
                                    type='button'
                                    key={reasonKey}
                                    title={`${statusCode} · ${errorMessage} · ${reason.count || 0}`}
                                    onClick={(event) =>
                                      selectErrorReason(
                                        event,
                                        groupName,
                                        reason,
                                      )
                                    }
                                    className='flex max-w-[360px] items-center gap-1 rounded px-1 py-0.5 text-left transition-colors hover:bg-[var(--semi-color-fill-1)] hover:text-[var(--semi-color-primary)]'
                                  >
                                    <span className='shrink-0 font-medium'>
                                      {statusCode}
                                    </span>
                                    <span className='shrink-0 text-[var(--semi-color-text-2)]'>
                                      ·
                                    </span>
                                    <span className='min-w-0 flex-1 truncate'>
                                      {errorMessage}
                                    </span>
                                    <span className='shrink-0 text-[var(--semi-color-text-2)]'>
                                      ·
                                    </span>
                                    <span className='shrink-0'>
                                      {reason.count || 0}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3'>
              {chartStats.map((item) => {
                const successRate = Number(item.success_rate || 0);
                const healthColor = getHealthColor(successRate);
                const groupName = item.group || 'default';
                const errorReasons = normalizeErrorReasons(item.error_reasons);
                return (
                  <div
                    role='button'
                    tabIndex={0}
                    key={groupName}
                    onClick={() => selectGroup(groupName)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectGroup(groupName);
                      }
                    }}
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
                      <span>
                        {t('成功')}: {item.success_count || 0}
                      </span>
                      <span>
                        {t('错误')}: {item.error_count || 0}
                      </span>
                      <span>
                        {t('消耗')}: {renderQuota(item.quota || 0)}
                      </span>
                      <span>
                        {t('平均耗时')}:{' '}
                        {Number(item.avg_use_time || 0).toFixed(2)}s
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
                      {item.last_seen_at
                        ? timestamp2string(item.last_seen_at)
                        : '-'}
                    </div>
                    {errorReasons.length > 0 && (
                      <div className='mt-3 rounded-lg bg-[var(--semi-color-fill-0)] p-2'>
                        <div className='mb-1 text-xs font-medium text-[var(--semi-color-text-0)]'>
                          {t('主要失败原因')}
                        </div>
                        <div className='space-y-1'>
                          {errorReasons.map((reason, index) => {
                            const statusCode = reason.status_code || '-';
                            const errorMessage =
                              cleanErrorMessage(reason.content) || '-';
                            const reasonKey = `${groupName}-${statusCode}-${reason.content || index}`;

                            return (
                              <button
                                type='button'
                                key={reasonKey}
                                title={`${statusCode} · ${errorMessage} · ${reason.count || 0}`}
                                onClick={(event) =>
                                  selectErrorReason(event, groupName, reason)
                                }
                                className='flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs text-[var(--semi-color-text-1)] transition-colors hover:bg-[var(--semi-color-fill-1)] hover:text-[var(--semi-color-primary)]'
                              >
                                <span className='shrink-0 font-medium'>
                                  {statusCode}
                                </span>
                                <span className='shrink-0 text-[var(--semi-color-text-2)]'>
                                  ·
                                </span>
                                <span className='min-w-0 flex-1 truncate'>
                                  {errorMessage}
                                </span>
                                <span className='shrink-0 text-[var(--semi-color-text-2)]'>
                                  ·
                                </span>
                                <span className='shrink-0'>
                                  {reason.count || 0}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div className='mt-2 text-xs text-[var(--semi-color-primary)]'>
                      {t('点击查看该分组日志详情')}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Skeleton>
      )}
    </Card>
  );
};

export default GroupHealthStats;
