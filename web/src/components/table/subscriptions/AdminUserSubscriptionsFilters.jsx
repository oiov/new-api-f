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

const AdminUserSubscriptionsFilters = ({
  formInitValues,
  setFormApi,
  searchUserSubscriptions,
  loading,
  groupOptions,
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
      <div className='flex flex-col md:flex-row items-center gap-2 w-full'>
        <div className='relative w-full md:w-64'>
          <Form.Input
            field='username'
            prefix={<IconSearch />}
            placeholder={t('用户名或用户ID')}
            showClear
            pure
            size='small'
          />
        </div>
        <div className='w-full md:w-44'>
          <Form.Select
            field='group'
            placeholder={t('用户分组')}
            optionList={groupOptions}
            showClear
            filter
            size='small'
          />
        </div>
        <div className='w-full md:w-36'>
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
        <div className='flex gap-2 w-full md:w-auto'>
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
