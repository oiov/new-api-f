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

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Table, Tag } from '@douyinfe/semi-ui';
import {
  API,
  copy,
  showError,
  showSuccess,
  encodeToBase64,
} from '../../helpers';
import { ITEMS_PER_PAGE } from '../../constants';
import { useTableCompactMode } from '../common/useTableCompactMode';
import {
  fetchTokenKey as fetchTokenKeyById,
  buildTokenTestPayload,
  resolveTokenTestConfig,
} from '../../helpers/token';

const SUBSCRIPTION_ACCESS_TOKEN_NAME = 'Subscription Access';
const BATCH_TOKEN_TEST_INTERVAL_MS = 400;

const waitForBatchTokenTest = (duration = BATCH_TOKEN_TEST_INTERVAL_MS) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, duration);
  });

const isProtectedSubscriptionAccessToken = (token) => {
  if (!token) {
    return false;
  }
  if (Number(token.specific_channel_id || 0) > 0) {
    return false;
  }
  if ((token.name || '').trim() !== SUBSCRIPTION_ACCESS_TOKEN_NAME) {
    return false;
  }
  const expiredTime = Number(token.expired_time ?? -1);
  const now = Math.floor(Date.now() / 1000);
  return expiredTime === -1 || expiredTime > now;
};

const parsePersistedLastTestInfo = (token) => {
  const tokenId = token?.id;
  if (!tokenId) {
    return null;
  }
  const lastTestAt = Number(token?.last_test_at || 0);
  const summaryText = String(token?.last_test_summary || '').trim();
  if (!lastTestAt || !summaryText) {
    return null;
  }
  try {
    const summary = JSON.parse(summaryText);
    return {
      at: lastTestAt * 1000,
      ok: Boolean(token?.last_test_ok),
      error: String(summary?.error || ''),
      results: Array.isArray(summary?.results) ? summary.results : [],
      mode: String(summary?.mode || ''),
    };
  } catch (error) {
    return {
      at: lastTestAt * 1000,
      ok: Boolean(token?.last_test_ok),
      error: '',
      results: [],
      mode: '',
    };
  }
};

const buildTokenTestRows = (results = []) => {
  return (Array.isArray(results) ? results : []).map((item, index) => ({
    key: `${item?.kind || 'unknown'}-${item?.path || 'path'}-${index}`,
    kind: (item?.kind || '-').toUpperCase(),
    path: item?.path || '-',
    model: item?.model || '-',
    http_code: item?.http_code ?? '-',
    ok: Boolean(item?.ok),
    x_oneapi_request_id: item?.x_oneapi_request_id || '',
    error_type: item?.error_type || '',
  }));
};

export const useTokensData = (openFluentNotification, openCCSwitchModal) => {
  const { t } = useTranslation();
  const emptyFilters = {
    searchKeyword: '',
    searchToken: '',
    status: '',
    group: '',
    expiredState: '',
    unlimitedState: '',
  };

  // Basic state
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState(1);
  const [tokenCount, setTokenCount] = useState(0);
  const [pageSize, setPageSize] = useState(ITEMS_PER_PAGE);
  const [searching, setSearching] = useState(false);
  const [searchMode, setSearchMode] = useState(false); // 是否处于搜索结果视图
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);

  // Selection state
  const [selectedKeys, setSelectedKeys] = useState([]);

  // Edit state
  const [showEdit, setShowEdit] = useState(false);
  const [editingToken, setEditingToken] = useState({
    id: undefined,
  });

  // UI state
  const [compactMode, setCompactMode] = useTableCompactMode('tokens');
  const [showKeys, setShowKeys] = useState({});
  const [resolvedTokenKeys, setResolvedTokenKeys] = useState({});
  const [loadingTokenKeys, setLoadingTokenKeys] = useState({});
  const keyRequestsRef = useRef({});
  const [testingTokenIds, setTestingTokenIds] = useState({});
  const [lastTestResultsById, setLastTestResultsById] = useState({});

  // Form state
  const [formApi, setFormApi] = useState(null);
  const formInitValues = emptyFilters;

  // Get form values helper function
  const getFormValues = () => {
    const formValues = formApi ? formApi.getValues() : {};
    return {
      searchKeyword: formValues.searchKeyword || '',
      searchToken: formValues.searchToken || '',
      status: formValues.status || '',
      group: formValues.group || '',
      expiredState: formValues.expiredState || '',
      unlimitedState: formValues.unlimitedState || '',
    };
  };

  // Close edit modal
  const closeEdit = () => {
    setShowEdit(false);
    setTimeout(() => {
      setEditingToken({
        id: undefined,
      });
    }, 500);
  };

  // Sync page data from API response
  const syncPageData = (payload) => {
    const items = payload.items || [];
    const persistedLastTestMap = {};
    items.forEach((token) => {
      const info = parsePersistedLastTestInfo(token);
      if (info) {
        persistedLastTestMap[token.id] = info;
      }
    });
    setTokens(items);
    setLastTestResultsById((prev) => ({
      ...prev,
      ...persistedLastTestMap,
    }));
    setTokenCount(payload.total || 0);
    setActivePage(payload.page || 1);
    setPageSize(payload.page_size || pageSize);
    setShowKeys({});
  };

  const renderTokenTestTable = (results = []) => {
    const dataSource = buildTokenTestRows(results);
    if (!dataSource.length) {
      return (
        <div className='text-sm text-[var(--semi-color-text-2)]'>
          {t('无返回结果')}
        </div>
      );
    }

    return (
      <Table
        size='small'
        pagination={false}
        dataSource={dataSource}
        columns={[
          {
            title: t('类型'),
            dataIndex: 'kind',
            width: 92,
          },
          {
            title: t('路径'),
            dataIndex: 'path',
            width: 140,
          },
          {
            title: t('模型'),
            dataIndex: 'model',
          },
          {
            title: t('HTTP'),
            dataIndex: 'http_code',
            width: 88,
          },
          {
            title: t('结果'),
            dataIndex: 'ok',
            width: 92,
            render: (value) => (
              <Tag color={value ? 'green' : 'red'} shape='circle'>
                {value ? t('通过') : t('失败')}
              </Tag>
            ),
          },
          {
            title: t('请求 ID'),
            dataIndex: 'x_oneapi_request_id',
            render: (value) => value || '-',
          },
          {
            title: t('错误类型'),
            dataIndex: 'error_type',
            render: (value) => value || '-',
          },
        ]}
        scroll={{ x: 'max-content' }}
      />
    );
  };

  // Load tokens function
  const loadTokens = async (page = 1, size = pageSize) => {
    setLoading(true);
    setSearchMode(false);
    setAppliedFilters(emptyFilters);
    const res = await API.get(`/api/token/?p=${page}&size=${size}`);
    const { success, message, data } = res.data;
    if (success) {
      syncPageData(data);
    } else {
      showError(message);
    }
    setLoading(false);
  };

  // Refresh function
  const refresh = async (page = activePage) => {
    if (searchMode) {
      await searchTokens(page, pageSize, appliedFilters);
    } else {
      await loadTokens(page);
    }
    setSelectedKeys([]);
  };

  // Copy text function
  const copyText = async (text) => {
    if (await copy(text)) {
      showSuccess(t('已复制到剪贴板！'));
    } else {
      Modal.error({
        title: t('无法复制到剪贴板，请手动复制'),
        content: text,
        size: 'large',
      });
    }
  };

  const fetchTokenKey = async (tokenOrId, options = {}) => {
    const { suppressError = false } = options;
    const tokenId =
      typeof tokenOrId === 'object' ? tokenOrId?.id : Number(tokenOrId);

    if (!tokenId) {
      const error = new Error(t('令牌不存在'));
      if (!suppressError) {
        showError(error.message);
      }
      throw error;
    }

    if (resolvedTokenKeys[tokenId]) {
      return resolvedTokenKeys[tokenId];
    }

    if (keyRequestsRef.current[tokenId]) {
      return keyRequestsRef.current[tokenId];
    }

    const request = (async () => {
      setLoadingTokenKeys((prev) => ({ ...prev, [tokenId]: true }));
      try {
        const fullKey = await fetchTokenKeyById(tokenId);
        setResolvedTokenKeys((prev) => ({ ...prev, [tokenId]: fullKey }));
        return fullKey;
      } catch (error) {
        const normalizedError = new Error(
          error?.message || t('获取令牌密钥失败'),
        );
        if (!suppressError) {
          showError(normalizedError.message);
        }
        throw normalizedError;
      } finally {
        delete keyRequestsRef.current[tokenId];
        setLoadingTokenKeys((prev) => {
          const next = { ...prev };
          delete next[tokenId];
          return next;
        });
      }
    })();

    keyRequestsRef.current[tokenId] = request;
    return request;
  };

  const toggleTokenVisibility = async (record) => {
    const tokenId = record?.id;
    if (!tokenId) {
      return;
    }

    if (showKeys[tokenId]) {
      setShowKeys((prev) => ({ ...prev, [tokenId]: false }));
      return;
    }

    const fullKey = await fetchTokenKey(record);
    if (fullKey) {
      setShowKeys((prev) => ({ ...prev, [tokenId]: true }));
    }
  };

  const copyTokenKey = async (record) => {
    const fullKey = await fetchTokenKey(record);
    await copyText(`sk-${fullKey}`);
  };

  // Open link function for chat integrations
  const onOpenLink = async (type, url, record) => {
    if (url && url.startsWith('ccswitch')) {
      openCCSwitchModal(record);
      return;
    }
    const fullKey = await fetchTokenKey(record);
    if (url && url.startsWith('fluent')) {
      openFluentNotification(fullKey);
      return;
    }
    let status = localStorage.getItem('status');
    let serverAddress = '';
    if (status) {
      status = JSON.parse(status);
      serverAddress = status.server_address;
    }
    if (serverAddress === '') {
      serverAddress = window.location.origin;
    }
    if (url.includes('{cherryConfig}') === true) {
      let cherryConfig = {
        id: 'new-api',
        baseUrl: serverAddress,
        apiKey: `sk-${fullKey}`,
      };
      let encodedConfig = encodeURIComponent(
        encodeToBase64(JSON.stringify(cherryConfig)),
      );
      url = url.replaceAll('{cherryConfig}', encodedConfig);
    } else if (url.includes('{aionuiConfig}') === true) {
      let aionuiConfig = {
        platform: 'new-api',
        baseUrl: serverAddress,
        apiKey: `sk-${fullKey}`,
      };
      let encodedConfig = encodeURIComponent(
        encodeToBase64(JSON.stringify(aionuiConfig)),
      );
      url = url.replaceAll('{aionuiConfig}', encodedConfig);
    } else {
      let encodedServerAddress = encodeURIComponent(serverAddress);
      url = url.replaceAll('{address}', encodedServerAddress);
      url = url.replaceAll('{key}', `sk-${fullKey}`);
    }

    window.open(url, '_blank');
  };

  // Manage token function (delete, enable, disable)
  const manageToken = async (id, action, record) => {
    setLoading(true);
    let data = { id };
    let res;
    switch (action) {
      case 'delete':
        res = await API.delete(`/api/token/${id}/`);
        break;
      case 'enable':
        data.status = 1;
        res = await API.put('/api/token/?status_only=true', data);
        break;
      case 'disable':
        data.status = 2;
        res = await API.put('/api/token/?status_only=true', data);
        break;
    }
    const { success, message } = res.data;
    if (success) {
      showSuccess(t('操作成功完成！'));
      let token = res.data.data;
      let newTokens = [...tokens];
      if (action !== 'delete') {
        record.status = token.status;
      }
      setTokens(newTokens);
    } else {
      showError(message);
    }
    setLoading(false);
  };

  // Search tokens function
  const searchTokens = async (page = 1, size = pageSize, filters = null) => {
    const normalizedPage = Number.isInteger(page) && page > 0 ? page : 1;
    const normalizedSize =
      Number.isInteger(size) && size > 0 ? size : pageSize;

    const {
      searchKeyword = '',
      searchToken = '',
      status = '',
      group = '',
      expiredState = '',
      unlimitedState = '',
    } = filters || getFormValues();
    if (
      searchKeyword === '' &&
      searchToken === '' &&
      status === '' &&
      group === '' &&
      expiredState === '' &&
      unlimitedState === ''
    ) {
      setSearchMode(false);
      setAppliedFilters(emptyFilters);
      await loadTokens(1, normalizedSize);
      return;
    }
    setSearching(true);
    const res = await API.get(
      `/api/token/search?keyword=${encodeURIComponent(searchKeyword)}&token=${encodeURIComponent(searchToken)}&status=${encodeURIComponent(status)}&group=${encodeURIComponent(group)}&expired_state=${encodeURIComponent(expiredState)}&unlimited_state=${encodeURIComponent(unlimitedState)}&p=${normalizedPage}&size=${normalizedSize}`,
    );
    const { success, message, data } = res.data;
    if (success) {
      setSearchMode(true);
      setAppliedFilters({
        searchKeyword,
        searchToken,
        status,
        group,
        expiredState,
        unlimitedState,
      });
      syncPageData(data);
    } else {
      showError(message);
    }
    setSearching(false);
  };

  // Sort tokens function
  const sortToken = (key) => {
    if (tokens.length === 0) return;
    setLoading(true);
    let sortedTokens = [...tokens];
    sortedTokens.sort((a, b) => {
      return ('' + a[key]).localeCompare(b[key]);
    });
    if (sortedTokens[0].id === tokens[0].id) {
      sortedTokens.reverse();
    }
    setTokens(sortedTokens);
    setLoading(false);
  };

  // Page handlers
  const handlePageChange = (page) => {
    if (searchMode) {
      searchTokens(page, pageSize).then();
    } else {
      loadTokens(page, pageSize).then();
    }
  };

  const handlePageSizeChange = async (size) => {
    setPageSize(size);
    if (searchMode) {
      await searchTokens(1, size);
    } else {
      await loadTokens(1, size);
    }
  };

  // Row selection handlers
  const rowSelection = {
    selectedRowKeys: selectedKeys.map((token) => token.id),
    getCheckboxProps: (record) => ({
      disabled: isProtectedSubscriptionAccessToken(record),
    }),
    onSelect: (record, selected) => {},
    onSelectAll: (selected, selectedRows) => {},
    onChange: (selectedRowKeys, selectedRows) => {
      setSelectedKeys((prev) => {
        const nextMap = new Map(
          prev
            .filter((token) => token?.id && !isProtectedSubscriptionAccessToken(token))
            .map((token) => [token.id, token]),
        );
        const currentPageIds = new Set(
          tokens
            .filter((token) => token?.id && !isProtectedSubscriptionAccessToken(token))
            .map((token) => token.id),
        );

        currentPageIds.forEach((id) => nextMap.delete(id));
        selectedRows
          .filter((token) => !isProtectedSubscriptionAccessToken(token))
          .forEach((token) => {
            nextMap.set(token.id, token);
          });

        return Array.from(nextMap.values());
      });
    },
  };

  const testToken = async (record, options = null) => {
    const tokenId = record?.id;
    if (!tokenId) return false;
    const testConfig = options || resolveTokenTestConfig(record?.group);

    setTestingTokenIds((prev) => ({ ...prev, [tokenId]: true }));
    try {
      const res = await API.post(
        `/api/token/${tokenId}/test`,
        buildTokenTestPayload(testConfig),
      );
      const { success, message, data } = res.data || {};
      if (!success) {
        showError(message || t('测试失败'));
        setLastTestResultsById((prev) => ({
          ...prev,
          [tokenId]: {
            at: Date.now(),
            ok: false,
            error: message || t('测试失败'),
            results: [],
          },
        }));
        return false;
      }

      const results = Array.isArray(data?.results) ? data.results : [];
      const allOk = results.length > 0 && results.every((item) => item?.ok);
      setLastTestResultsById((prev) => ({
        ...prev,
        [tokenId]: {
          at: Number(data?.last_test_at || 0) * 1000 || Date.now(),
          ok: allOk,
          error: '',
          results,
          mode: String(data?.mode || 'both'),
        },
      }));

      Modal.info({
        title: t('令牌测试结果'),
        size: 'small',
        content: (
          <div className='flex flex-col gap-3'>
            <div>
              {t('令牌')}: {record.name || '-'} ({t('令牌 ID')}: {tokenId})
            </div>
            {renderTokenTestTable(results)}
          </div>
        ),
      });
      return true;
    } catch (error) {
      showError(error?.message || t('测试失败'));
      return false;
    } finally {
      setTestingTokenIds((prev) => ({ ...prev, [tokenId]: false }));
    }
  };

  const batchTestTokens = async () => {
    if (!selectedKeys.length) {
      showError(t('请先选择要测试的令牌！'));
      return;
    }
    const tokenRecords = [...selectedKeys];
    const tokenIds = tokenRecords.map((item) => item.id);
    const results = [];
    const recordMap = new Map(tokenRecords.map((item) => [item.id, item]));
    for (let index = 0; index < tokenIds.length; index += 1) {
      const current = tokenIds[index];
      setTestingTokenIds((prev) => ({ ...prev, [current]: true }));
      try {
        const currentRecord = recordMap.get(current);
        const res = await API.post(
          `/api/token/${current}/test`,
          buildTokenTestPayload(resolveTokenTestConfig(currentRecord?.group)),
        );
        if (res?.data?.success) {
          const payload = res.data.data || {};
          results.push({ token_id: current, ...payload });
          const list = Array.isArray(payload?.results) ? payload.results : [];
          const allOk = list.length > 0 && list.every((item) => item?.ok);
          setLastTestResultsById((prev) => ({
            ...prev,
            [current]: {
              at: Number(payload?.last_test_at || 0) * 1000 || Date.now(),
              ok: allOk,
              error: '',
              results: list,
              mode: String(payload?.mode || 'both'),
            },
          }));
        } else {
          results.push({
            token_id: current,
            results: [],
            error: res?.data?.message || t('测试失败'),
          });
          setLastTestResultsById((prev) => ({
            ...prev,
            [current]: {
              at: Date.now(),
              ok: false,
              error: res?.data?.message || t('测试失败'),
              results: [],
            },
          }));
        }
      } catch (error) {
        results.push({
          token_id: current,
          results: [],
          error: error?.message || t('测试失败'),
        });
        setLastTestResultsById((prev) => ({
          ...prev,
          [current]: {
            at: Date.now(),
            ok: false,
            error: error?.message || t('测试失败'),
            results: [],
          },
        }));
      } finally {
        setTestingTokenIds((prev) => ({ ...prev, [current]: false }));
      }

      if (index < tokenIds.length - 1) {
        await waitForBatchTokenTest();
      }
    }

    const okCount = results.filter((item) => {
      const list = Array.isArray(item?.results) ? item.results : [];
      return list.length > 0 && list.every((r) => r.ok);
    }).length;

    Modal.info({
      title: t('批量测试结果'),
      size: 'large',
      content: (
        <div className='flex flex-col gap-3'>
          <div>
            {t('总计')}: {results.length}，{t('全通过')}: {okCount}
          </div>
          <div className='flex flex-col gap-2 max-h-[60vh] overflow-auto pr-1'>
            {results.map((item) => {
              const record = recordMap.get(item.token_id);
              return (
                <div
                  key={item.token_id}
                  className='p-2 rounded-md'
                  style={{
                    background: 'var(--semi-color-fill-0)',
                    border: '1px solid var(--semi-color-border)',
                  }}
                >
                  <div className='font-medium'>
                    {record?.name || t('未命名令牌')} · {t('令牌 ID')}: {item.token_id}
                  </div>
                  {item.error ? (
                    <div className='text-[var(--semi-color-danger)]'>
                      {t('错误')}: {item.error}
                    </div>
                  ) : null}
                  <div className='mt-2'>{renderTokenTestTable(item?.results)}</div>
                </div>
              );
            })}
          </div>
        </div>
      ),
    });
  };

  // Handle row styling
  const handleRow = (record, index) => {
    const isSelected = selectedKeys.some((token) => token?.id === record?.id);
    if (record.status !== 1) {
      return {
        className: isSelected
          ? 'token-row token-row--disabled token-row--selected'
          : 'token-row token-row--disabled',
      };
    }
    if (isSelected) {
      return {
        className: 'token-row token-row--selected',
      };
    }
    return {
      className: 'token-row',
    };
  };

  const deleteTokensByIds = async (ids, successMessage) => {
    if (!ids || ids.length === 0) {
      showError(t('没有可删除的令牌！'));
      return;
    }
    setLoading(true);
    try {
      const res = await API.post('/api/token/batch', { ids });
      if (res?.data?.success) {
        const count = res.data.data || 0;
        showSuccess(successMessage || t('已删除 {{count}} 个令牌！', { count }));
        await refresh();
        setTimeout(() => {
          if (tokens.length === 0 && activePage > 1) {
            refresh(activePage - 1);
          }
        }, 100);
      } else {
        showError(res?.data?.message || t('删除失败'));
      }
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Batch delete tokens
  const batchDeleteTokens = async () => {
    const deletableTokens = selectedKeys.filter(
      (token) => !isProtectedSubscriptionAccessToken(token),
    );
    if (deletableTokens.length === 0) {
      showError(t('请先选择要删除的令牌！'));
      return;
    }
    await deleteTokensByIds(
      deletableTokens.map((token) => token.id),
      t('已删除 {{count}} 个令牌！', { count: deletableTokens.length }),
    );
  };

  const batchDeleteInvalidTokens = async () => {
    const {
      searchKeyword,
      searchToken,
      status,
      group,
      expiredState,
      unlimitedState,
    } = appliedFilters;
    setLoading(true);
    try {
      const res = await API.post('/api/token/batch/invalid', {
        keyword: searchKeyword,
        token: searchToken,
        status,
        group,
        expired_state: expiredState,
        unlimited_state: unlimitedState,
      });
      if (res?.data?.success) {
        const count = res.data.data || 0;
        if (count === 0) {
          showError(t('当前筛选条件下没有无效令牌可删除！'));
          return;
        }
        showSuccess(t('已删除 {{count}} 个无效令牌！', { count }));
        await refresh(1);
      } else {
        showError(res?.data?.message || t('删除失败'));
      }
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Batch copy tokens
  const batchCopyTokens = async (copyType) => {
    if (selectedKeys.length === 0) {
      showError(t('请至少选择一个令牌！'));
      return;
    }
    try {
      const keys = await Promise.all(
        selectedKeys.map((token) => fetchTokenKey(token, { suppressError: true })),
      );
      let content = '';
      for (let i = 0; i < selectedKeys.length; i++) {
        const fullKey = keys[i];
        if (copyType === 'name+key') {
          content += `${selectedKeys[i].name}    sk-${fullKey}\n`;
        } else {
          content += `sk-${fullKey}\n`;
        }
      }
      await copyText(content);
    } catch (error) {
      showError(error?.message || t('复制令牌失败'));
    }
  };

  // Initialize data
  useEffect(() => {
    loadTokens(1)
      .then()
      .catch((reason) => {
        showError(reason);
      });
  }, [pageSize]);

  return {
    // Basic state
    tokens,
    loading,
    activePage,
    tokenCount,
    pageSize,
    searching,

    // Selection state
    selectedKeys,
    setSelectedKeys,

    // Edit state
    showEdit,
    setShowEdit,
    editingToken,
    setEditingToken,
    closeEdit,

    // UI state
    compactMode,
    setCompactMode,
    showKeys,
    setShowKeys,
    resolvedTokenKeys,
    loadingTokenKeys,

    // Form state
    formApi,
    setFormApi,
    formInitValues,
    getFormValues,

    // Functions
    loadTokens,
    refresh,
    copyText,
    fetchTokenKey,
    toggleTokenVisibility,
    copyTokenKey,
    onOpenLink,
    manageToken,
    searchTokens,
    sortToken,
    handlePageChange,
    handlePageSizeChange,
    rowSelection,
    handleRow,
    batchDeleteTokens,
    batchDeleteInvalidTokens,
    batchCopyTokens,
    testingTokenIds,
    lastTestResultsById,
    testToken,
    batchTestTokens,
    syncPageData,

    // Translation
    t,
  };
};
