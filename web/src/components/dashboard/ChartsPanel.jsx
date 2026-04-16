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

import React, { useEffect } from 'react';
import { Button, Card, DatePicker, Input, Select, Tabs, TabPane } from '@douyinfe/semi-ui';
import { PieChart } from 'lucide-react';
import { VChart } from '@visactor/react-vchart';
import { useDashboardCharts } from '../../hooks/dashboard/useDashboardCharts';

const ChartsPanel = ({
  activeChartTab,
  setActiveChartTab,
  chartData,
  dataExportDefaultTime,
  setTrendData,
  setConsumeQuota,
  setTimes,
  setConsumeTokens,
  setPieData,
  setLineData,
  setModelColors,
  CARD_PROPS,
  CHART_CONFIG,
  FLEX_CENTER_GAP2,
  hasApiInfoPanel,
  t,
  inputs,
  timeOptions,
  handleInputChange,
  handleSearchConfirm,
  resetSearchFilters,
  isAdminUser,
  loading,
}) => {
  const safeInputs =
    inputs ||
    {
      start_timestamp: null,
      end_timestamp: null,
      username: '',
    };

  const { spec_line, spec_model_line, spec_pie, spec_rank_bar, updateChartData } =
    useDashboardCharts(
      dataExportDefaultTime,
      setTrendData,
      setConsumeQuota,
      setTimes,
      setConsumeTokens,
      setPieData,
      setLineData,
      setModelColors,
      t,
    );

  useEffect(() => {
    if (Array.isArray(chartData) && chartData.length > 0) {
      updateChartData(chartData);
    }
  }, [chartData, updateChartData]);

  return (
    <Card
      {...CARD_PROPS}
      className={`!rounded-2xl ${hasApiInfoPanel ? 'lg:col-span-3' : ''}`}
      title={
        <div className='flex w-full flex-col gap-4'>
          <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
            <div className={FLEX_CENTER_GAP2}>
              <PieChart size={16} />
              {t('模型数据分析')}
            </div>
            <Tabs
              type='slash'
              activeKey={activeChartTab}
              onChange={setActiveChartTab}
            >
              <TabPane tab={<span>{t('消耗分布')}</span>} itemKey='1' />
              <TabPane tab={<span>{t('消耗趋势')}</span>} itemKey='2' />
              <TabPane tab={<span>{t('调用次数分布')}</span>} itemKey='3' />
              <TabPane tab={<span>{t('调用次数排行')}</span>} itemKey='4' />
            </Tabs>
          </div>

          <div className='flex flex-col gap-2.5 rounded-xl border border-semi-color-border bg-semi-color-fill-0/80 p-2.5'>
            <div className='text-sm font-medium text-semi-color-text-0'>
              {t('搜索条件')}
            </div>
            <div className='grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px_auto]'>
              <DatePicker
                size='small'
                type='dateTime'
                value={safeInputs.start_timestamp}
                insetLabel={t('起始时间')}
                onChange={(value) => handleInputChange(value, 'start_timestamp')}
              />
              <DatePicker
                size='small'
                type='dateTime'
                value={safeInputs.end_timestamp}
                insetLabel={t('结束时间')}
                onChange={(value) => handleInputChange(value, 'end_timestamp')}
              />
              <Select
                size='small'
                value={dataExportDefaultTime || undefined}
                placeholder={t('时间粒度')}
                optionList={timeOptions}
                onChange={(value) =>
                  handleInputChange(value, 'data_export_default_time')
                }
              />
              <div className='flex gap-2 md:justify-end'>
                <Button
                  size='small'
                  type='primary'
                  theme='light'
                  loading={loading}
                  onClick={handleSearchConfirm}
                >
                  {t('查询')}
                </Button>
                <Button
                  size='small'
                  type='tertiary'
                  disabled={loading}
                  onClick={resetSearchFilters}
                >
                  {t('重置')}
                </Button>
              </div>
            </div>

            {isAdminUser && (
              <Input
                size='small'
                value={safeInputs.username}
                placeholder={t('用户名称')}
                onChange={(value) => handleInputChange(value, 'username')}
              />
            )}
          </div>
        </div>
      }
      bodyStyle={{ padding: 0 }}
    >
      <div className='h-96 p-2'>
        {activeChartTab === '1' && (
          <VChart spec={spec_line} option={CHART_CONFIG} />
        )}
        {activeChartTab === '2' && (
          <VChart spec={spec_model_line} option={CHART_CONFIG} />
        )}
        {activeChartTab === '3' && (
          <VChart spec={spec_pie} option={CHART_CONFIG} />
        )}
        {activeChartTab === '4' && (
          <VChart spec={spec_rank_bar} option={CHART_CONFIG} />
        )}
      </div>
    </Card>
  );
};

export default ChartsPanel;
