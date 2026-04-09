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
import { renderGroupOption } from '../../../helpers';

const AdminTokensFilters = ({
  formInitValues,
  setFormApi,
  searchTokens,
  loading,
  searching,
  groupOptions,
  t,
}) => {
  const formApiRef = useRef(null);

  const handleReset = () => {
    if (!formApiRef.current) return;
    formApiRef.current.reset();
    setTimeout(() => {
      searchTokens(1);
    }, 100);
  };

  return (
    <Form
      initValues={formInitValues}
      getFormApi={(api) => {
        setFormApi(api);
        formApiRef.current = api;
      }}
      onSubmit={() => searchTokens(1)}
      allowEmpty={true}
      autoComplete='off'
      layout='horizontal'
      trigger='change'
      stopValidateWithError={false}
      className='w-full'
    >
      <div className='flex flex-col gap-2 w-full'>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 w-full'>
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

          <div className='relative w-full'>
            <Form.Input
              field='token_name'
              prefix={<IconSearch />}
              placeholder={t('令牌名称')}
              showClear
              pure
              size='small'
            />
          </div>

          <div className='relative w-full'>
            <Form.Input
              field='token'
              prefix={<IconSearch />}
              placeholder={t('密钥')}
              showClear
              pure
              size='small'
            />
          </div>

          <div className='w-full'>
            <Form.Select
              field='group'
              placeholder={t('令牌分组')}
              optionList={groupOptions}
              renderOptionItem={renderGroupOption}
              showClear
              filter
              pure
              size='small'
            />
          </div>

          <div className='w-full'>
            <Form.Select
              field='status'
              placeholder={t('状态')}
              optionList={[
                { label: t('全部状态'), value: '' },
                { label: t('已启用'), value: '1' },
                { label: t('已禁用'), value: '2' },
                { label: t('已过期'), value: '3' },
                { label: t('已耗尽'), value: '4' },
              ]}
              pure
              size='small'
            />
          </div>

          <div className='w-full'>
            <Form.Select
              field='expired_state'
              placeholder={t('过期筛选')}
              optionList={[
                { label: t('全部'), value: '' },
                { label: t('已过期'), value: 'expired' },
                { label: t('未过期'), value: 'not_expired' },
              ]}
              pure
              size='small'
            />
          </div>

          <div className='w-full lg:col-span-2'>
            <Form.DatePicker
              field='dateRange'
              type='dateTimeRange'
              placeholder={[t('创建开始时间'), t('创建结束时间')]}
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

        <div className='flex gap-2 w-full md:w-auto justify-end'>
          <Button
            type='tertiary'
            htmlType='submit'
            loading={loading || searching}
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

export default AdminTokensFilters;
