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
import { Button, Modal, Select, Space, Typography } from '@douyinfe/semi-ui';
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

const AdminTokensBatchActions = ({
  selectedRowKeys,
  setSelectedRowKeys,
  groupOptions,
  batchTestTokens,
  batchUpdateGroup,
  t,
}) => {
  const selectedCount = selectedRowKeys?.length || 0;

  const handleBatchUpdateGroup = () => {
    let nextGroup = '';
    Modal.confirm({
      title: t('批量修改分组'),
      content: (
        <div className='flex flex-col gap-2'>
          <div className='text-sm text-[var(--semi-color-text-2)]'>
            {t('将对选中的 {{count}} 个令牌更新分组字段。该操作可能影响模型可用性与分发策略。', {
              count: selectedCount,
            })}
          </div>
          <Select
            placeholder={t('请选择分组')}
            optionList={(groupOptions || []).map((item) => ({
              label: item.fullLabel || item.label,
              value: item.value,
            }))}
            onChange={(value) => {
              nextGroup = value || '';
            }}
            style={{ width: '100%' }}
            showClear
          />
        </div>
      ),
      onOk: async () => {
        await batchUpdateGroup(nextGroup);
      },
    });
  };

  return (
    <div className='flex items-center justify-between gap-2 flex-wrap w-full'>
      <Space spacing='tight' wrap>
        <Button
          type='primary'
          disabled={selectedCount === 0}
          onClick={batchTestTokens}
          size='small'
        >
          {t('批量测试')} ({selectedCount})
        </Button>
        <Button
          type='tertiary'
          disabled={selectedCount === 0}
          onClick={handleBatchUpdateGroup}
          size='small'
        >
          {t('批量改分组')} ({selectedCount})
        </Button>
        <Button
          type='tertiary'
          disabled={selectedCount === 0}
          onClick={() => setSelectedRowKeys([])}
          size='small'
        >
          {t('清空选择')}
        </Button>
      </Space>
      <div className='text-sm text-[var(--semi-color-text-2)]'>
        {t('已选择 {{count}} 项', { count: selectedCount })}
      </div>
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

          <AdminTokensBatchActions
            selectedRowKeys={tokensData.selectedRowKeys}
            setSelectedRowKeys={tokensData.setSelectedRowKeys}
            groupOptions={tokensData.groupOptions}
            batchTestTokens={tokensData.batchTestTokens}
            batchUpdateGroup={tokensData.batchUpdateGroup}
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
        rowSelection={tokensData.rowSelection}
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
