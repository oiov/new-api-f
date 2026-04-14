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
import { Typography } from '@douyinfe/semi-ui';
import { Key, Shield } from 'lucide-react';
import CardPro from '../../common/ui/CardPro';
import CompactModeToggle from '../../common/ui/CompactModeToggle';
import TokensTable from '../tokens/TokensTable';
import AdminTokensFilters from './AdminTokensFilters';
import { useAdminTokensData } from '../../../hooks/tokens/useAdminTokensData';
import { useIsMobile } from '../../../hooks/common/useIsMobile';
import { createCardProPagination } from '../../../helpers/utils';

const { Text } = Typography;

const AdminTokensDescription = ({ compactMode, setCompactMode, t }) => {
  return (
    <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-2 w-full'>
      <div className='flex items-center text-blue-500'>
        <Shield size={16} className='mr-2' />
        <Text>{t('管理员令牌管理')}</Text>
      </div>

      <CompactModeToggle
        compactMode={compactMode}
        setCompactMode={setCompactMode}
        t={t}
      />
    </div>
  );
};

const AdminTokensPage = () => {
  const tokensData = useAdminTokensData();
  const isMobile = useIsMobile();

  return (
    <CardPro
      type='type1'
      className='w-full'
      descriptionArea={
        <AdminTokensDescription
          compactMode={tokensData.compactMode}
          setCompactMode={tokensData.setCompactMode}
          t={tokensData.t}
        />
      }
      actionsArea={
        <div className='flex flex-col gap-3 w-full'>
          <div className='flex items-center text-[var(--semi-color-text-2)] text-sm gap-2 w-full'>
            <Key size={14} />
            <span>{tokensData.t('查看所有用户令牌的状态、额度和使用情况')}</span>
          </div>

          <AdminTokensFilters
            formInitValues={tokensData.formInitValues}
            setFormApi={tokensData.setFormApi}
            searchTokens={tokensData.searchTokens}
            loading={tokensData.loading}
            searching={tokensData.searching}
            groupOptions={tokensData.groupOptions}
            t={tokensData.t}
          />
        </div>
      }
      paginationArea={createCardProPagination({
        currentPage: tokensData.activePage,
        pageSize: tokensData.pageSize,
        total: tokensData.tokenCount,
        onPageChange: tokensData.handlePageChange,
        onPageSizeChange: tokensData.handlePageSizeChange,
        isMobile,
        t: tokensData.t,
      })}
      t={tokensData.t}
    >
      <TokensTable
        {...tokensData}
        rowSelection={undefined}
        showUsernameColumn={true}
        allowSensitiveActions={false}
        readonly={true}
        showTestColumn={true}
        testingTokenIds={tokensData.testingTokenIds}
        testToken={tokensData.testToken}
        forceFullWidth={true}
      />
    </CardPro>
  );
};

export default AdminTokensPage;
