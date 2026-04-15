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

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, TextArea, Typography } from '@douyinfe/semi-ui';
import {
  API,
  buildGroupOptions,
  copy,
  showError,
  showSuccess,
} from '../../helpers';
import { ITEMS_PER_PAGE } from '../../constants';
import { useTableCompactMode } from '../common/useTableCompactMode';

export const useAdminTokensData = () => {
  const { t } = useTranslation();
  const { Text } = Typography;
  const subscriptionAccessTokenName = 'Subscription Access';
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
  const [lastTestResultsById, setLastTestResultsById] = useState({});
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
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

  const rowSelection = useMemo(
    () => ({
      selectedRowKeys,
      onChange: (keys) => {
        setSelectedRowKeys(keys || []);
      },
    }),
    [selectedRowKeys],
  );

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
        mode: 'both',
        claude_model: 'claude-opus-4-6',
        responses_model: 'gpt-5.1-codex',
        max_tokens: 16,
      });
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
        return;
      }

      const results = Array.isArray(data?.results) ? data.results : [];
      const allOk = results.length > 0 && results.every((item) => item?.ok);
      setLastTestResultsById((prev) => ({
        ...prev,
        [tokenId]: {
          at: Date.now(),
          ok: allOk,
          error: '',
          results,
        },
      }));

      Modal.info({
        title: t('令牌测试结果'),
        size: 'small',
        content: (
          <div className='flex flex-col gap-1'>
            <div>
              {t('用户')}: {record.username || '-'} ({t('用户 ID')}:{' '}
              {record.user_id})
            </div>
            <div>
              {t('令牌')}: {record.name || '-'} ({t('令牌 ID')}: {tokenId})
            </div>
            {results.length > 0 ? (
              <div className='flex flex-col gap-2 mt-2'>
                {results.map((item) => (
                  <div
                    key={`${item.kind || ''}-${item.path || ''}-${item.model || ''}`}
                    className='p-2 rounded-md'
                    style={{
                      background: 'var(--semi-color-fill-0)',
                      border: '1px solid var(--semi-color-border)',
                    }}
                  >
                    <div className='font-medium'>
                      {(item.kind || '-').toUpperCase()} · {item.path || '-'}
                    </div>
                    <div>
                      {t('模型')}: {item.model || '-'}
                    </div>
                    <div>
                      {t('HTTP')}: {item.http_code} / {t('通过')}:{' '}
                      {item.ok ? '1' : '0'}
                    </div>
                    {item.x_oneapi_request_id ? (
                      <div>
                        {t('请求 ID')}: {item.x_oneapi_request_id}
                      </div>
                    ) : null}
                    {item.error_type ? (
                      <div>
                        {t('错误类型')}: {item.error_type}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className='mt-2'>{t('无返回结果')}</div>
            )}
          </div>
        ),
      });
    } catch (error) {
      showError(error?.message || t('测试失败'));
    } finally {
      setTestingTokenIds((prev) => ({ ...prev, [tokenId]: false }));
    }
  };

  const batchTestTokens = async () => {
    if (!selectedRowKeys.length) {
      showError(t('请先选择要测试的令牌！'));
      return;
    }

    const tokenIds = [...selectedRowKeys];
    const results = [];

    const concurrency = 3;
    let cursor = 0;

    const worker = async () => {
      while (cursor < tokenIds.length) {
        const current = tokenIds[cursor];
        cursor += 1;
        setTestingTokenIds((prev) => ({ ...prev, [current]: true }));
        try {
          const res = await API.post(`/api/token/admin/${current}/test`, {
            mode: 'both',
            claude_model: 'claude-opus-4-6',
            responses_model: 'gpt-5.1-codex',
            max_tokens: 16,
          });
          if (res?.data?.success) {
            const payload = res.data.data || {};
            results.push({ token_id: current, ...payload });
            const list = Array.isArray(payload?.results) ? payload.results : [];
            const allOk = list.length > 0 && list.every((item) => item?.ok);
            setLastTestResultsById((prev) => ({
              ...prev,
              [current]: {
                at: Date.now(),
                ok: allOk,
                error: '',
                results: list,
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
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    const okCount = results.filter((item) => {
      const items = Array.isArray(item?.results) ? item.results : [];
      return items.length > 0 && items.every((r) => r.ok);
    }).length;

    Modal.info({
      title: t('批量测试结果'),
      size: 'large',
      content: (
        <div className='flex flex-col gap-2'>
          <div>
            {t('总计')}: {results.length}，{t('全通过')}: {okCount}
          </div>
          <div className='flex flex-col gap-2 max-h-[60vh] overflow-auto pr-1'>
            {results.map((item) => {
              const list = Array.isArray(item?.results) ? item.results : [];
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
                    {t('令牌 ID')}: {item.token_id}
                  </div>
                  {item.error ? (
                    <div className='text-[var(--semi-color-danger)]'>
                      {t('错误')}: {item.error}
                    </div>
                  ) : null}
                  {list.length ? (
                    <div className='flex flex-col gap-1 mt-1'>
                      {list.map((r) => (
                        <div
                          key={`${item.token_id}-${r.kind || ''}-${r.path || ''}`}
                          className='text-sm'
                        >
                          {(r.kind || '-').toUpperCase()} {r.path} · {t('HTTP')}{' '}
                          {r.http_code} · {t('通过')}:{r.ok ? '1' : '0'}{' '}
                          {r.x_oneapi_request_id
                            ? `· ${t('请求 ID')}: ${r.x_oneapi_request_id}`
                            : ''}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className='text-sm text-[var(--semi-color-text-2)] mt-1'>
                      {t('无返回结果')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ),
    });
  };

  const batchUpdateGroup = async (group) => {
    if (!selectedRowKeys.length) {
      showError(t('请先选择要修改分组的令牌！'));
      return;
    }

    try {
      const res = await API.post('/api/token/admin/batch/group', {
        token_ids: selectedRowKeys,
        group: group || '',
      });
      if (res?.data?.success) {
        showSuccess(
          t('已更新 {{count}} 个令牌分组', {
            count: res.data.data?.updated || 0,
          }),
        );
        await loadTokens(1, pageSize);
        setSelectedRowKeys([]);
      } else {
        showError(res?.data?.message || t('更新失败'));
      }
    } catch (error) {
      showError(error?.message || t('更新失败'));
    }
  };

  const refreshCurrentPage = async () => {
    if (searchMode) {
      await searchTokens(activePage, pageSize, appliedFilters);
      return;
    }
    await loadTokens(activePage, pageSize);
  };

  const rotateToken = async (record) => {
    const tokenId = Number(record?.id || 0);
    if (tokenId <= 0) {
      showError(t('无效的令牌'));
      return;
    }
    const source = String(record?.source || '').trim();
    const isSystemIssued =
      source === 'subscription_aggregate_access' ||
      (Number(record?.specific_channel_id || 0) <= 0 &&
        String(record?.name || '').trim() === subscriptionAccessTokenName);
    const actionLabel = isSystemIssued ? t('重新签发') : t('重置令牌');

    Modal.confirm({
      title: isSystemIssued
        ? t('确认重新签发该访问令牌？')
        : t('确认重置该用户令牌？'),
      content: isSystemIssued
        ? t(
            '重新签发后，旧的 Subscription Access 令牌会立即失效，用户需要到订阅页面复制新的令牌。',
          )
        : t(
            '重置后，旧令牌会立即失效，但额度、分组、模型权限与渠道绑定保持不变。',
          ),
      okText: actionLabel,
      cancelText: t('取消'),
      onOk: async () => {
        try {
          const res = await API.post(`/api/token/admin/${tokenId}/rotate`, {
            notify_user: isSystemIssued,
          });
          if (!res?.data?.success) {
            showError(res?.data?.message || t('操作失败'));
            return;
          }
          const data = res.data?.data || {};
          const tokenKey = String(data?.token_key || '').trim();
          Modal.info({
            title: t('{{action}}成功', { action: actionLabel }),
            size: 'small',
            content: (
              <div className='flex flex-col gap-3'>
                <div className='text-sm text-[var(--semi-color-text-2)]'>
                  {t('旧令牌已立即失效，请尽快复制并发送新的令牌。')}
                </div>
                <div className='text-sm'>
                  {t('用户')}: {record?.username || '-'} ({t('用户 ID')}:{' '}
                  {record?.user_id || '-'})
                </div>
                <div className='text-sm'>
                  {t('令牌')}: {record?.name || '-'} ({t('令牌 ID')}: {tokenId})
                </div>
                <TextArea
                  value={tokenKey}
                  readOnly
                  autosize={{ minRows: 2, maxRows: 4 }}
                />
                <div className='flex items-center justify-between gap-3 flex-wrap'>
                  <Text type='secondary'>
                    {data?.site_notify_sent || data?.event_sent
                      ? t('已触发用户通知事件')
                      : data?.notify_error
                        ? t('用户通知触发失败：{{message}}', {
                            message: data.notify_error,
                          })
                        : t('未触发用户通知事件')}
                  </Text>
                  <Button
                    theme='solid'
                    type='primary'
                    size='small'
                    onClick={async () => {
                      if (await copy(tokenKey)) {
                        showSuccess(t('新令牌已复制'));
                        return;
                      }
                      showError(t('复制失败'));
                    }}
                  >
                    {t('复制新令牌')}
                  </Button>
                </div>
              </div>
            ),
          });
          showSuccess(t('{{action}}成功', { action: actionLabel }));
          await refreshCurrentPage();
        } catch (error) {
          showError(error?.message || t('操作失败'));
        }
      },
    });
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
    selectedRowKeys,
    setSelectedRowKeys,
    rowSelection,
    testingTokenIds,
    lastTestResultsById,
    testToken,
    batchTestTokens,
    batchUpdateGroup,
    rotateToken,
    t,
  };
};
