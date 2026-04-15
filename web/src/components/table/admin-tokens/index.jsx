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

import React, { useCallback, useMemo, useState } from 'react';
import {
  Button,
  Modal,
  Select,
  Space,
  TextArea,
  Typography,
} from '@douyinfe/semi-ui';
import { Key, Shield } from 'lucide-react';
import CardPro from '../../common/ui/CardPro';
import CompactModeToggle from '../../common/ui/CompactModeToggle';
import TokensTable from '../tokens/TokensTable';
import AdminTokensFilters from './AdminTokensFilters';
import { useAdminTokensData } from '../../../hooks/tokens/useAdminTokensData';
import { useIsMobile } from '../../../hooks/common/useIsMobile';
import { createCardProPagination } from '../../../helpers/utils';
import { API, isRoot, showError, showSuccess } from '../../../helpers';

const { Text } = Typography;

const CCSWITCH_DEFAULTS_OPTION_KEY = 'console_setting.ccswitch_defaults';
const BUILTIN_CCSWITCH_DEFAULTS = {
  claude: {
    defaultName: 'Claude Provider',
    defaultModels: {
      model: 'claude-opus-4-6',
      haikuModel: 'claude-haiku-4-5-20251001',
      sonnetModel: 'claude-sonnet-4-6',
      opusModel: 'claude-opus-4-6',
    },
    recommendedModels: [
      'claude-opus-4-6',
      'claude-sonnet-4-6',
      'claude-haiku-4-5-20251001',
    ],
  },
  codex: {
    defaultName: 'Codex Provider',
    defaultModels: {
      model: 'gpt-5.4',
    },
    recommendedModels: ['gpt-5.4', 'gpt-5', 'gpt-5-mini', 'gpt-5.2'],
  },
};

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
  const canManageCCSwitchDefaults = isRoot();
  const [ccswitchDefaultsVisible, setCCSwitchDefaultsVisible] = useState(false);
  const [ccswitchDefaultsLoading, setCCSwitchDefaultsLoading] = useState(false);
  const [ccswitchDefaultsSaving, setCCSwitchDefaultsSaving] = useState(false);
  const [ccswitchDefaultsJson, setCCSwitchDefaultsJson] = useState('');

  const builtinDefaultsText = useMemo(
    () => JSON.stringify(BUILTIN_CCSWITCH_DEFAULTS, null, 2),
    [],
  );

  const openCCSwitchDefaultsModal = useCallback(async () => {
    if (!canManageCCSwitchDefaults) {
      showError(tokensData.t('仅 Root 用户可配置'));
      return;
    }
    setCCSwitchDefaultsVisible(true);
    setCCSwitchDefaultsLoading(true);
    try {
      const res = await API.get('/api/option/');
      if (!res?.data?.success) {
        showError(res?.data?.message || tokensData.t('加载配置失败'));
        return;
      }
      const items = Array.isArray(res.data.data) ? res.data.data : [];
      const found = items.find((item) => item?.key === CCSWITCH_DEFAULTS_OPTION_KEY);
      const value = String(found?.value || '').trim();
      setCCSwitchDefaultsJson(value || builtinDefaultsText);
    } catch (error) {
      showError(error?.response?.data?.message || error?.message || tokensData.t('加载配置失败'));
    } finally {
      setCCSwitchDefaultsLoading(false);
    }
  }, [builtinDefaultsText, canManageCCSwitchDefaults, tokensData.t]);

  const saveCCSwitchDefaults = useCallback(async () => {
    if (!canManageCCSwitchDefaults) {
      showError(tokensData.t('仅 Root 用户可配置'));
      return;
    }
    const trimmed = String(ccswitchDefaultsJson || '').trim();
    if (trimmed) {
      try {
        JSON.parse(trimmed);
      } catch {
        showError(tokensData.t('JSON 格式不正确'));
        return;
      }
    }
    setCCSwitchDefaultsSaving(true);
    try {
      const res = await API.put('/api/option/', {
        key: CCSWITCH_DEFAULTS_OPTION_KEY,
        value: trimmed,
      });
      if (res?.data?.success) {
        showSuccess(tokensData.t('已保存，刷新页面后生效'));
        setCCSwitchDefaultsVisible(false);
      } else {
        showError(res?.data?.message || tokensData.t('保存失败'));
      }
    } catch (error) {
      showError(error?.response?.data?.message || error?.message || tokensData.t('保存失败'));
    } finally {
      setCCSwitchDefaultsSaving(false);
    }
  }, [canManageCCSwitchDefaults, ccswitchDefaultsJson, tokensData.t]);

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

          {canManageCCSwitchDefaults ? (
            <div className='flex items-center justify-between gap-2 flex-wrap w-full'>
              <div className='text-sm text-[var(--semi-color-text-2)]'>
                {tokensData.t(
                  '可在此配置 /console/token 导入配置的默认参数（CCSwitch）',
                )}
              </div>
              <Button
                type='tertiary'
                onClick={openCCSwitchDefaultsModal}
                size='small'
              >
                {tokensData.t('配置导入默认参数')}
              </Button>
            </div>
          ) : null}
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
        showTestColumn={true}
        testingTokenIds={tokensData.testingTokenIds}
        testToken={tokensData.testToken}
        showLastTestColumn={true}
        lastTestResultsById={tokensData.lastTestResultsById}
        forceFullWidth={true}
      />

      <Modal
        title={tokensData.t('配置 /console/token 默认导入参数')}
        visible={ccswitchDefaultsVisible}
        onCancel={() => setCCSwitchDefaultsVisible(false)}
        onOk={saveCCSwitchDefaults}
        okText={tokensData.t('保存')}
        cancelText={tokensData.t('取消')}
        confirmLoading={ccswitchDefaultsSaving}
        width={isMobile ? '100%' : 820}
      >
        <div className='flex flex-col gap-3'>
          <div className='text-sm text-[var(--semi-color-text-2)]'>
            {tokensData.t('该配置会通过 /api/status 下发到前端，并在 CCSwitch 导入弹窗中作为默认值回显。')}
          </div>
          <Space spacing='tight' wrap>
            <Button
              type='tertiary'
              size='small'
              onClick={() => setCCSwitchDefaultsJson(builtinDefaultsText)}
            >
              {tokensData.t('填充内置默认')}
            </Button>
            <Button
              type='danger'
              size='small'
              onClick={() => setCCSwitchDefaultsJson('')}
            >
              {tokensData.t('清空（使用前端内置默认）')}
            </Button>
          </Space>
          <TextArea
            value={ccswitchDefaultsJson}
            onChange={setCCSwitchDefaultsJson}
            autosize={{ minRows: 12, maxRows: 24 }}
            placeholder={builtinDefaultsText}
            disabled={ccswitchDefaultsLoading}
          />
        </div>
      </Modal>
    </CardPro>
  );
};

export default AdminTokensPage;
