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
import { Form, Button } from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';
import { DATE_RANGE_PRESETS } from '../../../constants/console.constants';

const AdminUserSubscriptionsFilters = ({
  formInitValues,
  setFormApi,
  searchUserSubscriptions,
  loading,
  groupOptions,
  planOptions,
  t,
}) => {
  const formApiRef = useRef(null);

  const handleReset = () => {
    if (!formApiRef.current) return;
    formApiRef.current.reset();
    setTimeout(() => {
      searchUserSubscriptions();
    }, 100);
  };

  return (
    <Form
      initValues={formInitValues}
      getFormApi={(api) => {
        setFormApi(api);
        formApiRef.current = api;
      }}
      onSubmit={searchUserSubscriptions}
      allowEmpty={true}
      autoComplete='off'
      layout='horizontal'
      trigger='change'
      stopValidateWithError={false}
      className='w-full'
    >
      <div className='flex flex-col gap-2 w-full'>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 w-full'>
          <div className='w-full lg:col-span-2'>
            <div className='grid grid-cols-1 md:grid-cols-[160px_minmax(0,1fr)] gap-2'>
              <Form.Select
                field='time_field'
                optionList={[
                  { label: t('创建时间'), value: 'created_at' },
                  { label: t('生效开始时间'), value: 'start_time' },
                  { label: t('到期时间'), value: 'end_time' },
                ]}
                size='small'
              />
              <Form.DatePicker
                field='dateRange'
                type='dateTimeRange'
                placeholder={[t('开始时间'), t('结束时间')]}
                presets={DATE_RANGE_PRESETS.map((preset) => ({
                  text: t(preset.text),
                  start: preset.start(),
                  end: preset.end(),
                }))}
                showClear
                pure
                size='small'
              />
            </div>
          </div>

          <div className='relative w-full'>
            <Form.Input
              field='username'
              prefix={<IconSearch />}
              placeholder={t('用户名或用户ID')}
              showClear
              pure
              size='small'
            />
          </div>

          <div className='w-full'>
            <Form.Select
              field='plan_id'
              placeholder={t('订阅套餐')}
              optionList={[{ label: t('全部套餐'), value: '' }, ...(planOptions || [])]}
              showClear
              filter
              size='small'
            />
          </div>

          <div className='w-full'>
            <Form.Select
              field='group'
              placeholder={t('用户分组')}
              optionList={groupOptions}
              showClear
              filter
              size='small'
            />
          </div>

          <div className='w-full'>
            <Form.Select
              field='status'
              placeholder={t('状态')}
              optionList={[
                { label: t('全部状态'), value: '' },
                { label: t('生效'), value: 'active' },
                { label: t('已过期'), value: 'expired' },
                { label: t('已作废'), value: 'cancelled' },
              ]}
              size='small'
            />
          </div>

          <div className='w-full'>
            <Form.Select
              field='source'
              placeholder={t('来源')}
              optionList={[
                { label: t('全部来源'), value: '' },
                { label: t('在线购买'), value: 'order' },
                { label: t('管理员发放'), value: 'admin' },
                { label: t('兑换码兑换'), value: 'redemption' },
                { label: t('邀请奖励'), value: 'invite_reward' },
              ]}
              showClear
              size='small'
            />
          </div>
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

export default AdminUserSubscriptionsFilters;
