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
import { REDEMPTION_KEY_PREFIX } from '../../../constants/redemption.constants';

const RedemptionsFilters = ({
  formInitValues,
  setFormApi,
  searchRedemptions,
  loading,
  searching,
  subscriptionPlanOptions,
  t,
}) => {
  // Handle form reset and immediate search
  const formApiRef = useRef(null);

  const handleReset = () => {
    if (!formApiRef.current) return;
    formApiRef.current.reset();
    setTimeout(() => {
      searchRedemptions();
    }, 100);
  };

  const applyPrefixFilter = (keyword) => {
    if (!formApiRef.current) return;
    formApiRef.current.setValue('searchKeyword', keyword);
    setTimeout(() => {
      searchRedemptions();
    }, 0);
  };

  return (
    <Form
      initValues={formInitValues}
      getFormApi={(api) => {
        setFormApi(api);
        formApiRef.current = api;
      }}
      onSubmit={searchRedemptions}
      allowEmpty={true}
      autoComplete='off'
      layout='horizontal'
      trigger='change'
      stopValidateWithError={false}
      className='w-full md:w-auto order-1 md:order-2'
    >
      <div className='flex flex-col md:flex-row items-center gap-2 w-full md:w-auto'>
        <div className='relative w-full md:w-64'>
          <Form.Input
            field='searchKeyword'
            prefix={<IconSearch />}
            placeholder={t('关键字(id/名称/前缀，如 nbredemptionP)')}
            showClear
            pure
            size='small'
          />
        </div>
        <div className='w-full md:w-40'>
          <Form.Select
            field='redemptionType'
            placeholder={t('兑换类型')}
            optionList={[
              { label: t('全部类型'), value: '' },
              { label: t('订阅套餐'), value: 'subscription' },
              { label: t('额度兑换'), value: 'quota' },
            ]}
            showClear
            pure
            size='small'
          />
        </div>
        <div className='w-full md:w-56'>
          <Form.Select
            field='subscriptionPlanId'
            placeholder={t('筛选订阅套餐')}
            optionList={subscriptionPlanOptions || []}
            filter
            showClear
            pure
            size='small'
          />
        </div>
        <div className='flex gap-2 w-full md:w-auto'>
          <Button
            type='tertiary'
            onClick={() =>
              applyPrefixFilter(REDEMPTION_KEY_PREFIX.SUBSCRIPTION)
            }
            className='flex-1 md:flex-initial md:w-auto'
            size='small'
          >
            {t('套餐码')}
          </Button>
          <Button
            type='tertiary'
            onClick={() => applyPrefixFilter(REDEMPTION_KEY_PREFIX.QUOTA)}
            className='flex-1 md:flex-initial md:w-auto'
            size='small'
          >
            {t('额度码')}
          </Button>
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
        </div>
      </div>
    </Form>
  );
};

export default RedemptionsFilters;
