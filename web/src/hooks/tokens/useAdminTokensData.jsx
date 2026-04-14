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

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@douyinfe/semi-ui';
import { API, buildGroupOptions, showError } from '../../helpers';
import { ITEMS_PER_PAGE } from '../../constants';
import { useTableCompactMode } from '../common/useTableCompactMode';

export const useAdminTokensData = () => {
  const { t } = useTranslation();
  const [compactMode, setCompactMode] = useTableCompactMode('admin-tokens');
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState(1);
  const [tokenCount, setTokenCount] = useState(0);
  const [pageSize, setPageSize] = useState(ITEMS_PER_PAGE);
  const [searching, setSearching] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [formApi, setFormApi] = useState(null);
  const [groupOptions, setGroupOptions] = useState([]);
  const [showKeys] = useState({});
  const [resolvedTokenKeys] = useState({});
  const [loadingTokenKeys] = useState({});
  const [testingTokenIds, setTestingTokenIds] = useState({});
  const [appliedFilters, setAppliedFilters] = useState({
    username: '',
    token_name: '',
    token: '',
    status: '',
    group: '',
    expired_state: '',
    start_timestamp: '',
    end_timestamp: '',
  });

  const formInitValues = {
    username: '',
    token_name: '',
    token: '',
    status: '',
    group: '',
    expired_state: '',
    dateRange: [],
  };

  const getFormValues = () => {
    const formValues = formApi ? formApi.getValues() : {};
    let start_timestamp = '';
    let end_timestamp = '';
    if (
      formValues.dateRange &&
      Array.isArray(formValues.dateRange) &&
      formValues.dateRange.length === 2
    ) {
      start_timestamp = formValues.dateRange[0] || '';
      end_timestamp = formValues.dateRange[1] || '';
    }
    return {
      username: formValues.username || '',
      token_name: formValues.token_name || '',
      token: formValues.token || '',
      status: formValues.status || '',
      group: formValues.group || '',
      expired_state: formValues.expired_state || '',
      start_timestamp,
      end_timestamp,
    };
  };

  const syncPageData = (payload) => {
    const items = (payload.items || []).map((token) => ({
      ...token,
      key: token.id,
    }));
    setTokens(items);
    setTokenCount(payload.total || 0);
    setActivePage(payload.page || 1);
    setPageSize(payload.page_size || ITEMS_PER_PAGE);
  };

  const loadTokens = async (page = 1, size = pageSize) => {
    setLoading(true);
    setSearchMode(false);
    setAppliedFilters(formInitValues);
    try {
      const res = await API.get(`/api/token/admin?p=${page}&size=${size}`);
      const { success, message, data } = res.data;
      if (success) {
        syncPageData(data);
      } else {
        showError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadGroups = async () => {
    try {
      const res = await API.get('/api/group/');
      if (res?.data?.success) {
        setGroupOptions([
          { label: t('全部分组'), value: '', fullLabel: t('全部分组') },
          ...buildGroupOptions(res.data.data || []),
        ]);
      }
    } catch (error) {
      showError(error?.message || t('加载分组失败'));
    }
  };

  const searchTokens = async (page = 1, size = pageSize, filters = null) => {
    const normalizedFilters = filters || getFormValues();
    const {
      username = '',
      token_name = '',
      token = '',
      status = '',
      group = '',
      expired_state = '',
      start_timestamp = '',
      end_timestamp = '',
    } = normalizedFilters;

    if (
      username === '' &&
      token_name === '' &&
      token === '' &&
      status === '' &&
      group === '' &&
      expired_state === '' &&
      start_timestamp === '' &&
      end_timestamp === ''
    ) {
      await loadTokens(1, size);
      return;
    }

    setSearching(true);
    try {
      const searchParams = new URLSearchParams({
        username,
        token_name,
        token,
        status,
        group,
        expired_state,
        p: String(page),
        size: String(size),
        start_timestamp: start_timestamp
          ? String(Date.parse(start_timestamp) / 1000)
          : '',
        end_timestamp: end_timestamp
          ? String(Date.parse(end_timestamp) / 1000)
          : '',
      });
      const res = await API.get(
        `/api/token/admin/search?${searchParams.toString()}`,
      );
      const { success, message, data } = res.data;
      if (success) {
        setSearchMode(true);
        setAppliedFilters({
          username,
          token_name,
          token,
          status,
          group,
          expired_state,
          start_timestamp,
          end_timestamp,
        });
        syncPageData(data);
      } else {
        showError(message);
      }
    } finally {
      setSearching(false);
    }
  };

  const handlePageChange = (page) => {
    if (searchMode) {
      searchTokens(page, pageSize, appliedFilters).then();
      return;
    }
    loadTokens(page, pageSize).then();
  };

  const handlePageSizeChange = async (size) => {
    setPageSize(size);
    if (searchMode) {
      await searchTokens(1, size, appliedFilters);
      return;
    }
    await loadTokens(1, size);
  };

  const handleRow = (record) => {
    if (record.status !== 1) {
      return {
        style: {
          background: 'var(--semi-color-disabled-border)',
        },
      };
    }
    return {};
  };

  const testToken = async (record) => {
    const tokenId = record?.id;
    if (!tokenId) return;

    setTestingTokenIds((prev) => ({ ...prev, [tokenId]: true }));
    try {
      const res = await API.post(`/api/token/admin/${tokenId}/test`, {
        model: 'claude-opus-4-6',
        max_tokens: 16,
      });
      const { success, message, data } = res.data || {};
      if (!success) {
        showError(message || t('测试失败'));
        return;
      }

      Modal.info({
        title: t('令牌测试结果'),
        size: 'small',
        content: (
          <div className='flex flex-col gap-1'>
            <div>
              {t('用户')}: {record.username || '-'} ({t('用户 ID')}: {record.user_id})
            </div>
            <div>
              {t('令牌')}: {record.name || '-'} ({t('令牌 ID')}: {tokenId})
            </div>
            <div>
              HTTP: {data?.http_code} / ok: {data?.ok ? '1' : '0'}
            </div>
            {data?.x_oneapi_request_id ? (
              <div>x-oneapi-request-id: {data.x_oneapi_request_id}</div>
            ) : null}
            {data?.error_type ? <div>error.type: {data.error_type}</div> : null}
          </div>
        ),
      });
    } catch (error) {
      showError(error?.message || t('测试失败'));
    } finally {
      setTestingTokenIds((prev) => ({ ...prev, [tokenId]: false }));
    }
  };

  useEffect(() => {
    loadGroups().then();
    loadTokens(1).catch((error) => {
      showError(error?.message || t('加载令牌失败'));
    });
  }, []);

  return {
    tokens,
    loading,
    activePage,
    tokenCount,
    pageSize,
    searching,
    compactMode,
    setCompactMode,
    formInitValues,
    setFormApi,
    groupOptions,
    showKeys,
    resolvedTokenKeys,
    loadingTokenKeys,
    searchTokens,
    handlePageChange,
    handlePageSizeChange,
    handleRow,
    testingTokenIds,
    testToken,
    t,
  };
};
