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

import React, { useState } from 'react';
import { Button, Form } from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';
import { ChevronDown, ChevronUp, Filter } from 'lucide-react';

import { USAGE_LOG_DATE_RANGE_PRESETS } from '../../../constants/console.constants';

const LogsFilters = ({
  formInitValues,
  setFormApi,
  refresh,
  exportLogs,
  setShowColumnSelector,
  formApi,
  setLogType,
  loading,
  exporting,
  logExportEnabled,
  isAdminUser,
  t,
}) => {
  const [filtersExpanded, setFiltersExpanded] = useState(true);

  return (
    <Form
      initValues={formInitValues}
      getFormApi={(api) => setFormApi(api)}
      onSubmit={refresh}
      allowEmpty={true}
      autoComplete='off'
      layout='vertical'
      trigger='change'
      stopValidateWithError={false}
    >
      <div className='flex flex-col gap-2'>
        {/* 操作按钮区域 */}
        <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3'>
          <div className='flex w-full flex-col gap-2 sm:w-auto'>
            <div className='flex w-full flex-wrap items-center gap-2 sm:w-auto'>
              <Form.Select
                field='logType'
                placeholder={t('日志类型')}
                className='w-full sm:w-auto min-w-[120px]'
                showClear
                pure
                onChange={() => {
                  setTimeout(() => {
                    refresh();
                  }, 0);
                }}
                size='small'
              >
                <Form.Select.Option value='0'>{t('全部')}</Form.Select.Option>
                <Form.Select.Option value='1'>{t('充值')}</Form.Select.Option>
                <Form.Select.Option value='2'>{t('消费')}</Form.Select.Option>
                <Form.Select.Option value='3'>{t('管理')}</Form.Select.Option>
                <Form.Select.Option value='4'>{t('系统')}</Form.Select.Option>
                <Form.Select.Option value='5'>{t('错误')}</Form.Select.Option>
                <Form.Select.Option value='6'>{t('退款')}</Form.Select.Option>
                <Form.Select.Option value='7'>{t('套餐')}</Form.Select.Option>
              </Form.Select>
              <Button
                type='tertiary'
                icon={<Filter size={14} />}
                onClick={() => setFiltersExpanded((prev) => !prev)}
                size='small'
              >
                {filtersExpanded ? t('收起筛选条件') : t('展开筛选条件')}
              </Button>
            </div>
            <div className='text-xs text-[var(--semi-color-text-2)]'>
              {filtersExpanded
                ? t('当前显示完整搜索条件')
                : t('搜索条件已折叠，可按需展开精细筛选')}
            </div>
          </div>

          <div className='flex gap-2 w-full sm:w-auto justify-end'>
            <Button
              type='tertiary'
              htmlType='submit'
              loading={loading}
              size='small'
            >
              {t('查询')}
            </Button>
            <Button
              type='tertiary'
              onClick={() => {
                if (formApi) {
                  formApi.reset();
                  setLogType(0);
                  setTimeout(() => {
                    refresh();
                  }, 100);
                }
              }}
              size='small'
            >
              {t('重置')}
            </Button>
            {logExportEnabled && (
              <Button
                type='tertiary'
                onClick={exportLogs}
                loading={exporting}
                size='small'
              >
                {t('导出当前筛选结果')}
              </Button>
            )}
            <Button
              type='tertiary'
              onClick={() => setShowColumnSelector(true)}
              size='small'
            >
              {t('列设置')}
            </Button>
          </div>
        </div>

        {filtersExpanded ? (
          <div className='rounded-xl border border-[var(--semi-color-border)] bg-[var(--semi-color-fill-0)] p-3'>
            <div className='mb-3 flex items-center justify-between gap-2'>
              <div className='text-sm font-medium text-[var(--semi-color-text-0)]'>
                {t('筛选条件')}
              </div>
              <button
                type='button'
                onClick={() => setFiltersExpanded(false)}
                className='inline-flex items-center gap-1 text-xs text-[var(--semi-color-text-2)] transition-colors hover:text-[var(--semi-color-text-0)]'
              >
                <ChevronUp size={14} />
                {t('收起筛选条件')}
              </button>
            </div>
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2'>
              <div className='col-span-1 lg:col-span-2'>
                <Form.DatePicker
                  field='dateRange'
                  className='w-full'
                  type='dateTimeRange'
                  placeholder={[t('开始时间'), t('结束时间')]}
                  showClear
                  pure
                  size='small'
                  presets={USAGE_LOG_DATE_RANGE_PRESETS.map((preset) => ({
                    text: t(preset.text),
                    start: preset.start(),
                    end: preset.end(),
                  }))}
                />
              </div>

              <Form.Input
                field='token_name'
                prefix={<IconSearch />}
                placeholder={t('令牌名称')}
                showClear
                pure
                size='small'
              />

              <Form.Input
                field='model_name'
                prefix={<IconSearch />}
                placeholder={t('模型名称')}
                showClear
                pure
                size='small'
              />

              <Form.Input
                field='group'
                prefix={<IconSearch />}
                placeholder={t('分组')}
                showClear
                pure
                size='small'
              />

              <Form.Input
                field='request_id'
                prefix={<IconSearch />}
                placeholder={t('Request ID')}
                showClear
                pure
                size='small'
              />

              <Form.Input
                field='error_message'
                prefix={<IconSearch />}
                placeholder={t('错误内容')}
                showClear
                pure
                size='small'
              />

              <Form.Input
                field='status_code'
                prefix={<IconSearch />}
                placeholder={t('状态码')}
                showClear
                pure
                size='small'
              />

              <Form.Input
                field='subscription_id'
                prefix={<IconSearch />}
                placeholder={`${t('订阅实例')} ${t('ID')}`}
                showClear
                pure
                size='small'
              />

              <Form.Input
                field='subscription_plan_id'
                prefix={<IconSearch />}
                placeholder={`${t('套餐')} ${t('ID')}`}
                showClear
                pure
                size='small'
              />

              {isAdminUser && (
                <>
                  <Form.Input
                    field='channel'
                    prefix={<IconSearch />}
                    placeholder={t('渠道 ID')}
                    showClear
                    pure
                    size='small'
                  />
                  <Form.Input
                    field='user_id'
                    prefix={<IconSearch />}
                    placeholder={t('用户 ID')}
                    showClear
                    pure
                    size='small'
                  />
                  <Form.Input
                    field='username'
                    prefix={<IconSearch />}
                    placeholder={t('用户名称')}
                    showClear
                    pure
                    size='small'
                  />
                </>
              )}
            </div>
          </div>
        ) : (
          <div className='flex items-center justify-between rounded-xl border border-dashed border-[var(--semi-color-border)] px-3 py-2 text-xs text-[var(--semi-color-text-2)]'>
            <span>{t('搜索条件已折叠，可按需展开精细筛选')}</span>
            <button
              type='button'
              onClick={() => setFiltersExpanded(true)}
              className='inline-flex items-center gap-1 transition-colors hover:text-[var(--semi-color-text-0)]'
            >
              <ChevronDown size={14} />
              {t('展开筛选条件')}
            </button>
          </div>
        )}
      </div>
    </Form>
  );
};

export default LogsFilters;
