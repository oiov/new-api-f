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

import React from 'react';
import { Tabs } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import TokensTable from '../../components/table/tokens';
import AdminTokensTable from '../../components/table/admin-tokens';

const AdminToken = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'admin' ? 'admin' : 'tokens';

  const handleTabChange = (key) => {
    const nextParams = new URLSearchParams(searchParams);
    if (key === 'admin') {
      nextParams.set('tab', 'admin');
    } else {
      nextParams.delete('tab');
    }
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <div className='mt-[60px] px-2 w-full'>
      <Tabs activeKey={activeTab} onChange={handleTabChange} type='line'>
        <Tabs.TabPane tab={t('令牌管理')} itemKey='tokens'>
          <TokensTable />
        </Tabs.TabPane>
        <Tabs.TabPane tab={t('管理员令牌')} itemKey='admin'>
          <AdminTokensTable />
        </Tabs.TabPane>
      </Tabs>
    </div>
  );
};

export default AdminToken;
