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

import React, { useRef } from 'react';
import { Button, Form } from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';
import { renderGroupOption } from '../../../helpers';

const SubscriptionsPlanFilters = ({
  formInitValues,
  setFormApi,
  searchPlans,
  resetPlanFilters,
  loading,
  groupOptions,
  t,
}) => {
  const formApiRef = useRef(null);

  const handleReset = () => {
    if (formApiRef.current) {
      formApiRef.current.reset();
    }
    resetPlanFilters();
  };

  return (
    <Form
      initValues={formInitValues}
      getFormApi={(api) => {
        setFormApi(api);
        formApiRef.current = api;
      }}
      onSubmit={searchPlans}
      allowEmpty={true}
      autoComplete='off'
      layout='horizontal'
      stopValidateWithError={false}
      className='w-full'
    >
      <div className='flex flex-col gap-2 w-full'>
        <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-2 w-full'>
          <Form.Input
            field='keyword'
            prefix={<IconSearch />}
            placeholder={t('搜索套餐名称 / 副标题 / ID')}
            showClear
            pure
            size='small'
          />

          <Form.Select
            field='enabled'
            placeholder={t('启用状态')}
            optionList={[
              { label: t('全部状态'), value: '' },
              { label: t('仅看启用'), value: 'enabled' },
              { label: t('仅看禁用'), value: 'disabled' },
            ]}
            size='small'
          />

          <Form.Select
            field='resource_type'
            placeholder={t('权益类型')}
            optionList={[
              { label: t('全部类型'), value: '' },
              { label: t('按额度'), value: 'quota' },
              { label: t('按次数'), value: 'request_count' },
            ]}
            size='small'
          />

          <Form.Select
            field='quota_reset_period'
            placeholder={t('重置周期')}
            optionList={[
              { label: t('全部重置'), value: '' },
              { label: t('不重置'), value: 'never' },
              { label: t('每天'), value: 'daily' },
              { label: t('每周'), value: 'weekly' },
              { label: t('每月'), value: 'monthly' },
              { label: t('每年'), value: 'yearly' },
              { label: t('自定义'), value: 'custom' },
            ]}
            size='small'
          />

          <Form.Select
            field='upgrade_group'
            placeholder={t('升级分组')}
            optionList={[
              { label: t('全部升级分组'), value: '' },
              ...(groupOptions || []),
            ]}
            renderOptionItem={renderGroupOption}
            filter
            size='small'
          />

          <Form.Select
            field='sale_status'
            placeholder={t('销售状态')}
            optionList={[
              { label: t('全部销售状态'), value: '' },
              { label: t('可售'), value: 'available' },
              { label: t('已售罄'), value: 'sold_out' },
              { label: t('不限量'), value: 'unlimited' },
            ]}
            size='small'
          />
        </div>

        <div className='flex gap-2 w-full md:w-auto justify-end'>
          <Button
            type='tertiary'
            htmlType='submit'
            loading={loading}
            className='flex-1 md:flex-initial'
            size='small'
          >
            {t('查询')}
          </Button>
          <Button
            type='tertiary'
            onClick={handleReset}
            className='flex-1 md:flex-initial'
            size='small'
          >
            {t('重置')}
          </Button>
        </div>
      </div>
    </Form>
  );
};

export default SubscriptionsPlanFilters;
