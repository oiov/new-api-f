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
import { renderGroupOption } from '../../../helpers';

const TokensFilters = ({
  formInitValues,
  setFormApi,
  searchTokens,
  setShowColumnSelector,
  loading,
  searching,
  groupOptions,
  t,
}) => {
  // Handle form reset and immediate search
  const formApiRef = useRef(null);

  const handleReset = () => {
    if (!formApiRef.current) return;
    formApiRef.current.reset();
    setTimeout(() => {
      searchTokens();
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
      className='w-full md:w-auto order-1 md:order-2'
    >
      <div className='flex flex-col gap-2 w-full'>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2 w-full'>
          <div className='relative w-full'>
          <Form.Input
            field='searchKeyword'
            prefix={<IconSearch />}
            placeholder={t('搜索关键字')}
            showClear
            pure
            size='small'
          />
          </div>

          <div className='relative w-full'>
            <Form.Input
              field='searchToken'
              prefix={<IconSearch />}
              placeholder={t('密钥')}
              showClear
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
              field='expiredState'
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

          <div className='w-full'>
            <Form.Select
              field='unlimitedState'
              placeholder={t('额度类型')}
              optionList={[
                { label: t('全部'), value: '' },
                { label: t('无限额度'), value: 'unlimited' },
                { label: t('普通额度'), value: 'limited' },
              ]}
              pure
              size='small'
            />
          </div>
        </div>

        <div className='flex gap-2 w-full md:w-auto md:justify-end'>
          <Button
            type='tertiary'
            htmlType='submit'
            loading={loading || searching}
            className='flex-1 md:flex-initial md:w-auto'
            size='small'
          >
            {t('查询')}
          </Button>

          <Button
            type='tertiary'
            onClick={handleReset}
            className='flex-1 md:flex-initial md:w-auto'
            size='small'
          >
            {t('重置')}
          </Button>

          <Button
            type='tertiary'
            onClick={() => setShowColumnSelector?.(true)}
            className='flex-1 md:flex-initial md:w-auto'
            size='small'
          >
            {t('列设置')}
          </Button>
        </div>
      </div>
    </Form>
  );
};

export default TokensFilters;
