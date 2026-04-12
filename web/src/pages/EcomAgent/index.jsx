import React, { useEffect, useMemo, useState } from 'react';
import {
  Banner,
  Button,
  Collapse,
  Descriptions,
  Empty,
  Input,
  Modal,
  Pagination,
  Popconfirm,
  Radio,
  RadioGroup,
  Select,
  SideSheet,
  Space,
  Tag,
  TextArea,
  Tooltip,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IconDelete,
  IconEdit,
  IconEyeOpened,
  IconHistory,
  IconRefresh,
} from '@douyinfe/semi-icons';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess, timestamp2string } from '../../helpers';
import CardPro from '../../components/common/ui/CardPro';
import CardTable from '../../components/common/ui/CardTable';
import { createCardProPagination } from '../../helpers/utils';
import { useIsMobile } from '../../hooks/common/useIsMobile';

const { Text } = Typography;

const defaultFormState = {
  email: '',
  password: '',
  account_id: '',
  access_token: '',
  refresh_token: '',
  access_token_expires_at: '',
  session_json: '',
  base_url: 'https://ecomagent.in',
  supabase_auth_url: 'https://zwggawnojtjiaklycfhc.supabase.co/auth/v1',
  supabase_anon_key:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3Z2dhd25vanRqaWFrbHljZmhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMzU3NDUsImV4cCI6MjA4NzYxMTc0NX0.-pQHomLNGWL7OvQpHL2_7T_NwI4wAzyNYMOknX_YJSE',
  confirm_url: '',
};

const PLAN_FILTER_OPTIONS = [
  'Free Trial',
  'Mini',
  'Mini Plus',
  'Mini Max',
  'Premium',
  'Premium+',
];

function inferLoginModeFromRecord(record) {
  if (
    record &&
    (String(record.account_id || '').trim() ||
      record.has_access_token ||
      record.has_refresh_token)
  ) {
    return 'token';
  }
  return 'password';
}

function credentialLabel(saved, maskedValue, t) {
  if (!saved) return t('未保存');
  return maskedValue || t('已保存');
}

function formatTs(ts) {
  if (!ts) return '-';
  return timestamp2string(ts);
}

function parseRawJSON(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getSubscriptionData(record) {
  return parseRawJSON(record.subscription_raw)?.subscription || {};
}

function getUsageData(record) {
  return parseRawJSON(record.usage_raw)?.usage || {};
}

function getModelBreakdown(record) {
  const modelBreakdown = getUsageData(record)?.modelBreakdown;
  return Array.isArray(modelBreakdown) ? modelBreakdown : [];
}

function getRecentLogs(record) {
  const recentLogs = getUsageData(record)?.recentLogs;
  return Array.isArray(recentLogs) ? recentLogs : [];
}

function getUsedRequests(record) {
  const directValue = Number(record.usage_requests || 0);
  if (directValue > 0) return directValue;
  return getModelBreakdown(record).reduce(
    (sum, item) => sum + Number(item?.requests || 0),
    0,
  );
}

function getUsedTokens(record) {
  const directValue = Number(record.usage_tokens || 0);
  if (directValue > 0) return directValue;
  return getModelBreakdown(record).reduce(
    (sum, item) => sum + Number(item?.tokens || 0),
    0,
  );
}

function getRequestLimit(record) {
  const directValue = Number(record.request_limit || 0);
  if (directValue > 0) return directValue;
  const subscription = getSubscriptionData(record);
  return Number(subscription?.requestLimit || 0);
}

function getTokenLimitLabel(record, t) {
  const subscription = getSubscriptionData(record);
  const tokenLimit = subscription?.tokenLimit;
  if (typeof tokenLimit === 'string' && tokenLimit.trim()) {
    return tokenLimit.trim();
  }
  const directValue = Number(record.token_limit || 0);
  if (directValue > 0) return String(directValue);
  return record.plan ? t('无限制') : '0';
}

function getPlanType(record, t) {
  if (getRequestLimit(record) > 0) return t('按次套餐');
  if (Number(record.token_limit || 0) > 0) return t('Token套餐');
  return '-';
}

function getAccountSummary(record, t) {
  const status = record.status || '-';
  const plan = record.plan || '-';
  const remain = getRequestRemain(record);
  return `${status} / ${plan} / ${t('剩余请求')}: ${remain}`;
}

function usageSummary(record, t) {
  const requestLimit = getRequestLimit(record);
  const usedRequests = getUsedRequests(record);
  const usedTokens = getUsedTokens(record);
  return [
    `${t('套餐')}: ${record.plan || '-'}`,
    `${t('套餐类型')}: ${getPlanType(record, t)}`,
    `${t('请求额度')}: ${requestLimit || 0}`,
    `${t('Token额度')}: ${getTokenLimitLabel(record, t)}`,
    `${t('已用请求')}: ${usedRequests}`,
    `${t('已用Tokens')}: ${usedTokens}`,
  ].join(' / ');
}

function getRequestRemain(record) {
  const requestLimit = getRequestLimit(record);
  if (requestLimit <= 0) return 0;
  return Math.max(0, requestLimit - getUsedRequests(record));
}

function getBatchFailureMessage(results, recordsById, t) {
  const failures = results
    .map((item, index) => {
      const id = item.id;
      const label = recordsById.get(id)?.email || `#${id}`;

      if (item.status === 'fulfilled' && item.value?.data?.success) {
        return null;
      }

      if (item.status === 'fulfilled') {
        return `${label}: ${item.value?.data?.message || t('未知错误')}`;
      }

      return (
        `${label}: ` +
        (item.reason?.response?.data?.message ||
          item.reason?.message ||
          t('未知错误'))
      );
    })
    .filter(Boolean);

  if (failures.length === 0) return '';
  return failures.slice(0, 3).join('；');
}

const EcomAgentPage = () => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState(null);
  const [batchSyncing, setBatchSyncing] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [visible, setVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailRecord, setDetailRecord] = useState(null);
  const [historyRecord, setHistoryRecord] = useState(null);
  const [form, setForm] = useState(defaultFormState);
  const [loginMode, setLoginMode] = useState('password');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [keyword, setKeyword] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 10;

  const handleCopy = async (value, successMessage) => {
    if (!value) {
      showError(t('无可复制内容'));
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      showSuccess(successMessage || t('复制成功'));
    } catch (error) {
      showError(error?.message || t('复制失败'));
    }
  };

  const openHistory = (record) => {
    setHistoryRecord(record);
    setHistoryPage(1);
  };

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/ecomagent/accounts');
      if (res.data.success) {
        setAccounts(res.data.data || []);
      } else {
        showError(res.data.message || t('加载失败'));
      }
    } catch (error) {
      showError(error?.message || t('加载失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const filteredAccounts = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return accounts.filter((record) => {
      const matchesPlan = !planFilter || String(record.plan || '').trim() === planFilter;
      if (!matchesPlan) {
        return false;
      }
      if (!normalizedKeyword) {
        return true;
      }
      const searchSource = [
        record.email,
        record.account_id,
        record.status,
        record.plan,
        getSubscriptionData(record)?.apiKeyName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchSource.includes(normalizedKeyword);
    });
  }, [accounts, keyword, planFilter]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredAccounts.length / pageSize));
    if (currentPage > maxPage) {
      setCurrentPage(maxPage);
    }
  }, [currentPage, filteredAccounts.length, pageSize]);

  useEffect(() => {
    setSelectedRowKeys((prev) =>
      prev.filter((key) => accounts.some((account) => account.id === key)),
    );
  }, [accounts]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...defaultFormState });
    setLoginMode('password');
    setVisible(true);
  };

  const openEdit = (record) => {
    setEditing(record);
    setForm({
      email: record.email || '',
      password: '',
      account_id: record.account_id || '',
      access_token: '',
      refresh_token: '',
      access_token_expires_at: record.access_token_expires_at || '',
      session_json: '',
      base_url: record.base_url || defaultFormState.base_url,
      supabase_auth_url:
        record.supabase_auth_url || defaultFormState.supabase_auth_url,
      supabase_anon_key:
        record.supabase_anon_key || defaultFormState.supabase_anon_key,
      confirm_url: record.confirm_url || '',
    });
    setLoginMode(inferLoginModeFromRecord(record));
    setVisible(true);
  };

  const handleSave = async () => {
    const hasImportedSession =
      form.session_json.trim() ||
      form.access_token.trim() ||
      form.refresh_token.trim();
    const hasExistingImportedAuth =
      Boolean(editing?.account_id) ||
      Boolean(editing?.has_access_token) ||
      Boolean(editing?.has_refresh_token);
    if (!form.email.trim() && !hasImportedSession && !hasExistingImportedAuth) {
      showError(t('邮箱不能为空'));
      return;
    }
    if (!editing && !form.password.trim() && !hasImportedSession) {
      showError(t('密码或登录态至少填写一种'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        email: form.email.trim(),
        account_id: form.account_id.trim(),
        access_token: form.access_token.trim(),
        refresh_token: form.refresh_token.trim(),
        session_json: form.session_json.trim(),
        base_url: form.base_url.trim(),
        supabase_auth_url: form.supabase_auth_url.trim(),
        supabase_anon_key: form.supabase_anon_key.trim(),
        confirm_url: form.confirm_url.trim(),
      };
      if (form.access_token_expires_at !== '') {
        payload.access_token_expires_at = Number(form.access_token_expires_at) || 0;
      }
      if (!editing || form.password.trim()) {
        payload.password = form.password.trim();
      }
      const res = editing
        ? await API.put(`/api/ecomagent/accounts/${editing.id}`, payload)
        : await API.post('/api/ecomagent/accounts', payload);
      if (res.data.success) {
        showSuccess(editing ? t('更新成功') : t('创建成功'));
        setVisible(false);
        await loadAccounts();
      } else {
        showError(res.data.message || t('保存失败'));
      }
    } catch (error) {
      showError(error?.message || t('保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async (record) => {
    setSyncingId(record.id);
    try {
      const res = await API.post(`/api/ecomagent/accounts/${record.id}/sync`);
      if (res.data.success) {
        showSuccess(t('同步完成'));
      } else {
        showError(res.data.message || t('同步失败'));
      }
      await loadAccounts();
    } catch (error) {
      showError(error?.message || t('同步失败'));
      await loadAccounts();
    } finally {
      setSyncingId(null);
    }
  };

  const handleDelete = async (record) => {
    try {
      const res = await API.delete(`/api/ecomagent/accounts/${record.id}`);
      if (res.data.success) {
        showSuccess(t('删除成功'));
        await loadAccounts();
      } else {
        showError(res.data.message || t('删除失败'));
      }
    } catch (error) {
      showError(error?.message || t('删除失败'));
    }
  };

  const confirmDelete = (record) => {
    Modal.confirm({
      title: t('确认删除'),
      content: record?.email || '-',
      okText: t('确认删除'),
      cancelText: t('取消'),
      okButtonProps: { color: 'red' },
      onOk: () => handleDelete(record),
    });
  };

  const handleBatchSync = async () => {
    if (selectedRowKeys.length === 0) return;
    setBatchSyncing(true);
    try {
      const recordsById = new Map(accounts.map((account) => [account.id, account]));
      const results = await Promise.all(
        selectedRowKeys.map(async (id) => {
          try {
            const value = await API.post(`/api/ecomagent/accounts/${id}/sync`);
            return { id, status: 'fulfilled', value };
          } catch (reason) {
            return { id, status: 'rejected', reason };
          }
        }),
      );
      const success = results.filter(
        (item) => item.status === 'fulfilled' && item.value?.data?.success,
      ).length;
      const failed = results.length - success;
      const failureMessage = getBatchFailureMessage(results, recordsById, t);
      if (failed > 0) {
        showError(
          [t('批量同步完成，成功 {{success}} 个，失败 {{failed}} 个。', { success, failed }), failureMessage]
            .filter(Boolean)
            .join(' '),
        );
      } else {
        showSuccess(t('批量同步完成，成功 {{success}} 个，失败 {{failed}} 个。', { success, failed }));
      }
      await loadAccounts();
    } finally {
      setBatchSyncing(false);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) return;
    setBatchDeleting(true);
    try {
      const recordsById = new Map(accounts.map((account) => [account.id, account]));
      const results = await Promise.all(
        selectedRowKeys.map(async (id) => {
          try {
            const value = await API.delete(`/api/ecomagent/accounts/${id}`);
            return { id, status: 'fulfilled', value };
          } catch (reason) {
            return { id, status: 'rejected', reason };
          }
        }),
      );
      const success = results.filter(
        (item) => item.status === 'fulfilled' && item.value?.data?.success,
      ).length;
      const failed = results.length - success;
      const failureMessage = getBatchFailureMessage(results, recordsById, t);
      if (success > 0) {
        setSelectedRowKeys([]);
      }
      if (failed > 0) {
        showError(
          [t('批量删除完成，成功 {{success}} 个，失败 {{failed}} 个。', { success, failed }), failureMessage]
            .filter(Boolean)
            .join(' '),
        );
      } else {
        showSuccess(t('批量删除完成，成功 {{success}} 个，失败 {{failed}} 个。', { success, failed }));
      }
      await loadAccounts();
    } finally {
      setBatchDeleting(false);
    }
  };

  const columns = useMemo(
    () => [
      {
        title: t('账户'),
        dataIndex: 'email',
        width: isMobile ? 240 : 280,
        render: (_, record) => (
          <div className='flex flex-col gap-1 min-w-0'>
            <Text
              strong
              ellipsis={{ showTooltip: true }}
              style={{ maxWidth: isMobile ? 170 : 220 }}
            >
              {record.email}
            </Text>
            <Text size='small' type='tertiary' ellipsis={{ showTooltip: true }}>
              {getAccountSummary(record, t)}
            </Text>
          </div>
        ),
      },
      {
        title: t('API Key'),
        dataIndex: 'api_key',
        width: isMobile ? 220 : 260,
        render: (_, record) => (
          <div className='min-w-0'>
            {record.api_key ? (
              <Text
                size='small'
                copyable={{
                  content: record.api_key,
                  onCopy: () => showSuccess(t('API Key 已复制')),
                }}
                ellipsis={{ showTooltip: true }}
                style={{ maxWidth: isMobile ? 180 : 220 }}
              >
                {record.api_key}
              </Text>
            ) : (
              <Text size='small' type='tertiary'>
                -
              </Text>
            )}
          </div>
        ),
      },
      {
        title: t('状态'),
        dataIndex: 'status',
        width: isMobile ? 120 : 150,
        render: (value, record) => (
          <Space wrap spacing={4}>
            <Tag color={record.last_error ? 'red' : 'blue'}>{value || '-'}</Tag>
            {record.last_error ? <Tag color='red'>{t('异常')}</Tag> : null}
          </Space>
        ),
      },
      {
        title: t('套餐'),
        dataIndex: 'plan',
        width: isMobile ? 160 : 190,
        render: (_, record) => (
          <div className='flex flex-col gap-1 min-w-0'>
            <Space wrap spacing={4}>
              <Tag color='white'>{record.plan || '-'}</Tag>
              <Tag color='indigo'>{getPlanType(record, t)}</Tag>
            </Space>
            <Text size='small' type='tertiary'>
              {t('剩余请求')}: {getRequestRemain(record)}
            </Text>
          </div>
        ),
      },
      {
        title: t('操作'),
        dataIndex: 'id',
        width: isMobile ? 112 : 118,
        render: (_, record) => (
          <Space spacing={2} wrap={false}>
            <Tooltip content={t('查看详情')}>
              <Button
                size='small'
                theme='borderless'
                type='tertiary'
                icon={<IconEyeOpened />}
                onClick={(e) => {
                  e.stopPropagation();
                  setDetailRecord(record);
                }}
              />
            </Tooltip>
            <Tooltip content={t('执行同步')}>
              <Button
                size='small'
                theme='borderless'
                type='primary'
                icon={<IconRefresh />}
                loading={syncingId === record.id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSync(record);
                }}
              />
            </Tooltip>
            <Tooltip content={t('历史消耗')}>
              <Button
                size='small'
                theme='borderless'
                type='tertiary'
                icon={<IconHistory />}
                onClick={(e) => {
                  e.stopPropagation();
                  openHistory(record);
                }}
              />
            </Tooltip>
            <Tooltip content={t('编辑')}>
              <Button
                size='small'
                theme='borderless'
                type='tertiary'
                icon={<IconEdit />}
                onClick={(e) => {
                  e.stopPropagation();
                  openEdit(record);
                }}
              />
            </Tooltip>
            <Tooltip content={t('删除')}>
              <Button
                size='small'
                theme='borderless'
                type='danger'
                icon={<IconDelete />}
                onClick={(e) => {
                  e.stopPropagation();
                  confirmDelete(record);
                }}
              />
            </Tooltip>
          </Space>
        ),
      },
    ],
    [isMobile, syncingId, t],
  );

  const paginatedAccounts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAccounts.slice(start, start + pageSize);
  }, [currentPage, filteredAccounts, pageSize]);

  const rowSelection = useMemo(
    () => ({
      selectedRowKeys,
      onChange: (keys) => setSelectedRowKeys(keys),
    }),
    [selectedRowKeys],
  );

  const expandedRowRender = (record) => {
    const subscription = getSubscriptionData(record);
    const modelBreakdown = getModelBreakdown(record);
    const accountDescriptions = [
      {
        key: 'email',
        label: t('邮箱'),
        value: record.email || '-',
      },
      {
        key: 'account_id',
        label: 'accountId',
        value: record.account_id || subscription?.accountId || '-',
      },
      {
        key: 'status',
        label: t('状态'),
        value: record.status || '-',
      },
      {
        key: 'base_url',
        label: t('站点'),
        value: record.base_url || '-',
      },
    ];
    const planDescriptions = [
      {
        key: 'login_identity',
        label: t('登录标识'),
        value: `${record.email || '-'} / ${record.account_id || subscription?.accountId || '-'}`,
      },
      {
        key: 'api_key_name',
        label: t('Key 名称'),
        value: subscription?.apiKeyName || '-',
      },
      {
        key: 'plan_type',
        label: t('套餐类型'),
        value: getPlanType(record, t),
      },
      {
        key: 'request_limit',
        label: t('请求额度'),
        value: getRequestLimit(record) || 0,
      },
      {
        key: 'request_used',
        label: t('已用请求'),
        value: getUsedRequests(record),
      },
      {
        key: 'request_remain',
        label: t('剩余请求'),
        value: getRequestRemain(record),
      },
      {
        key: 'token_limit',
        label: t('Token额度'),
        value: getTokenLimitLabel(record, t),
      },
      {
        key: 'token_used',
        label: t('已用Tokens'),
        value: getUsedTokens(record),
      },
    ];

    return (
      <div
        className='rounded-xl px-4 py-3'
        style={{ background: 'var(--semi-color-fill-0)' }}
      >
        <div className='flex flex-col gap-4 lg:grid lg:grid-cols-[1.2fr_0.8fr]'>
          <div className='flex flex-col gap-4'>
            <div>
              <Text strong>{t('账户信息')}</Text>
              <div className='mt-2'>
                <Descriptions
                  data={accountDescriptions}
                  column={isMobile ? 1 : 2}
                  size='small'
                  rowSize='small'
                />
              </div>
            </div>

            <div>
              <Text strong>{t('认证信息')}</Text>
              <div className='mt-2'>
                <Descriptions
                  data={[
                    {
                      key: 'password',
                      label: t('密码'),
                      value: record.has_password ? t('已保存') : t('未保存'),
                    },
                    {
                      key: 'refresh_token',
                      label: 'refresh',
                      value: credentialLabel(
                        record.has_refresh_token,
                        record.masked_refresh_token,
                        t,
                      ),
                    },
                    {
                      key: 'access_token',
                      label: 'access',
                      value: credentialLabel(
                        record.has_access_token,
                        record.masked_access_token,
                        t,
                      ),
                    },
                    {
                      key: 'last_sync_at',
                      label: t('同步'),
                      value: formatTs(record.last_sync_at),
                    },
                  ]}
                  column={isMobile ? 1 : 2}
                  size='small'
                  rowSize='small'
                />
              </div>
            </div>
          </div>

          <div className='flex flex-col gap-4'>
            <div>
              <Text strong>{t('权益使用情况')}</Text>
              <div className='mt-2'>
                <Descriptions
                  data={planDescriptions}
                  column={isMobile ? 1 : 2}
                  size='small'
                  rowSize='small'
                />
              </div>
            </div>

            <div>
              <Text strong>{t('API Key')}</Text>
              <div className='mt-2 rounded-lg border border-[var(--semi-color-border)] px-3 py-2'>
                <div className='flex items-center gap-2 flex-wrap'>
                  <Text ellipsis={{ showTooltip: true }} style={{ maxWidth: isMobile ? 240 : 360 }}>
                    {record.api_key || '-'}
                  </Text>
                  {record.api_key ? (
                    <Button
                      size='small'
                      type='primary'
                      theme='light'
                      onClick={() => handleCopy(record.api_key, t('API Key 已复制'))}
                    >
                      {t('复制')}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            <div>
              <Text strong>{t('模型分布')}</Text>
              <div className='mt-2 flex flex-col gap-1 rounded-lg border border-[var(--semi-color-border)] px-3 py-2'>
                {modelBreakdown.length > 0 ? (
                  modelBreakdown.slice(0, 4).map((item, index) => (
                    <Text key={`${item?.model || 'model'}-${index}`} size='small' type='tertiary'>
                      {(item?.model || '-')} · {t('请求')} {Number(item?.requests || 0)} · Tokens {Number(item?.tokens || 0)}
                    </Text>
                  ))
                ) : (
                  <Text size='small' type='tertiary'>-</Text>
                )}
              </div>
            </div>

            <div className='flex items-center justify-between gap-2 flex-wrap'>
              <Text size='small' type={record.last_error ? 'danger' : 'tertiary'}>
                {record.last_error || t('无错误')}
              </Text>
              <Button
                size='small'
                theme='light'
                icon={<IconHistory />}
                onClick={(e) => {
                  e.stopPropagation();
                  openHistory(record);
                }}
              >
                {t('查看历史消耗')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <Modal
        title={editing ? t('编辑 EcomAgent 账户') : t('新增 EcomAgent 账户')}
        visible={visible}
        onOk={handleSave}
        onCancel={() => setVisible(false)}
        confirmLoading={saving}
        size='large'
      >
        <div className='flex flex-col gap-3'>
          <Text type='tertiary'>
            {t('账号密码和登录态二选一；如果你已有登录后的 session JSON，可直接粘贴导入。')}
          </Text>
          <div className='rounded-xl border border-[var(--semi-color-border)] p-3'>
            <div className='flex flex-col gap-3'>
              <div className='flex items-center justify-between gap-3 flex-wrap'>
                <Text strong>{t('录入方式')}</Text>
                <RadioGroup
                  type='button'
                  value={loginMode}
                  onChange={(e) => setLoginMode(e.target.value)}
                >
                  <Radio value='password'>{t('密码注册/登录')}</Radio>
                  <Radio value='token'>{t('Token 导入')}</Radio>
                  <Radio value='session'>{t('Session JSON 导入')}</Radio>
                </RadioGroup>
              </div>

              {loginMode === 'password' ? (
                <div className='flex flex-col gap-3'>
                  <Text size='small' type='tertiary'>
                    {t('用于自动注册、密码登录和后续 refresh_token 续期。')}
                  </Text>
                  <Input
                    value={form.email}
                    onChange={(value) => setForm((prev) => ({ ...prev, email: value }))}
                    placeholder={t('邮箱')}
                  />
                  <Input
                    value={form.password}
                    onChange={(value) =>
                      setForm((prev) => ({ ...prev, password: value }))
                    }
                    placeholder={editing ? t('密码，留空表示不修改') : t('密码')}
                  />
                </div>
              ) : null}

              {loginMode === 'token' ? (
                <div className='flex flex-col gap-3'>
                  <Text size='small' type='tertiary'>
                    {t('适合你已经拿到 accountId、access_token、refresh_token 的场景。')}
                  </Text>
                  <Input
                    value={form.email}
                    onChange={(value) => setForm((prev) => ({ ...prev, email: value }))}
                    placeholder={t('邮箱，可选')}
                  />
                  <Input
                    value={form.account_id}
                    onChange={(value) =>
                      setForm((prev) => ({ ...prev, account_id: value }))
                    }
                    placeholder={t('accountId，可选')}
                  />
                  <Input
                    value={form.access_token}
                    onChange={(value) =>
                      setForm((prev) => ({ ...prev, access_token: value }))
                    }
                    placeholder={t('access_token，可选')}
                  />
                  <Input
                    value={form.refresh_token}
                    onChange={(value) =>
                      setForm((prev) => ({ ...prev, refresh_token: value }))
                    }
                    placeholder={t('refresh_token，可选')}
                  />
                  <Input
                    value={String(form.access_token_expires_at || '')}
                    onChange={(value) =>
                      setForm((prev) => ({ ...prev, access_token_expires_at: value }))
                    }
                    placeholder={t('access_token 过期时间，可选')}
                  />
                </div>
              ) : null}

              {loginMode === 'session' ? (
                <div className='flex flex-col gap-3'>
                  <Text size='small' type='tertiary'>
                    {t('直接粘贴登录返回 JSON，会自动提取 email、accountId、access_token、refresh_token。')}
                  </Text>
                  <TextArea
                    autosize={{ minRows: 6, maxRows: 10 }}
                    value={form.session_json}
                    onChange={(value) =>
                      setForm((prev) => ({ ...prev, session_json: value }))
                    }
                    placeholder={t('会话 JSON，可直接粘贴登录返回')}
                  />
                </div>
              ) : null}
            </div>
          </div>
          <Input
            value={form.confirm_url}
            onChange={(value) =>
              setForm((prev) => ({ ...prev, confirm_url: value }))
            }
            placeholder={t('邮件确认链接，可后续补录')}
          />
          <Input
            value={form.base_url}
            onChange={(value) =>
              setForm((prev) => ({ ...prev, base_url: value }))
            }
            placeholder={t('EcomAgent Base URL')}
          />
          <Input
            value={form.supabase_auth_url}
            onChange={(value) =>
              setForm((prev) => ({ ...prev, supabase_auth_url: value }))
            }
            placeholder={t('Supabase Auth URL')}
          />
          <Input
            value={form.supabase_anon_key}
            onChange={(value) =>
              setForm((prev) => ({ ...prev, supabase_anon_key: value }))
            }
            placeholder={t('Supabase Anon Key')}
          />
        </div>
      </Modal>

      <SideSheet
        title={t('账户详情')}
        visible={Boolean(detailRecord)}
        onCancel={() => setDetailRecord(null)}
        width={isMobile ? '100%' : 520}
        footer={
          <div className='flex justify-end'>
            <Button onClick={() => setDetailRecord(null)}>{t('关闭')}</Button>
          </div>
        }
      >
        {detailRecord ? (
          <div className='flex flex-col gap-4'>
            <div className='grid grid-cols-1 gap-3'>
              <div>
                <Text type='tertiary'>{t('邮箱')}</Text>
                <div>{detailRecord.email || '-'}</div>
              </div>
              <div>
                <Text type='tertiary'>{t('登录标识')}</Text>
                <div>{detailRecord.email || '-'} / {detailRecord.account_id || '-'}</div>
              </div>
              <div>
                <Text type='tertiary'>accountId</Text>
                <div>{detailRecord.account_id || getSubscriptionData(detailRecord)?.accountId || '-'}</div>
              </div>
              <div>
                <Text type='tertiary'>{t('状态')}</Text>
                <div>{detailRecord.status || '-'}</div>
              </div>
              <div>
                <Text type='tertiary'>{t('注册时间')}</Text>
                <div>{formatTs(detailRecord.signup_at)}</div>
              </div>
              <div>
                <Text type='tertiary'>{t('登录')}</Text>
                <div>{formatTs(detailRecord.login_at)}</div>
              </div>
              <div>
                <Text type='tertiary'>{t('同步')}</Text>
                <div>{formatTs(detailRecord.last_sync_at)}</div>
              </div>
            </div>

            <div className='rounded-lg border border-[var(--semi-color-border)] p-3'>
              <Text strong>{t('权益使用情况')}</Text>
              <div className='mt-2 flex flex-col gap-1'>
                <Text size='small'>{usageSummary(detailRecord, t)}</Text>
                <Text size='small' type='tertiary'>
                  {t('剩余请求')}: {getRequestRemain(detailRecord)}
                </Text>
                <Text size='small' type='tertiary'>
                  {t('Key 名称')}: {getSubscriptionData(detailRecord)?.apiKeyName || '-'}
                </Text>
              </div>
            </div>

            <div className='rounded-lg border border-[var(--semi-color-border)] p-3'>
              <Text strong>{t('凭据')}</Text>
              <div className='mt-2 flex flex-col gap-2'>
                <Text size='small'>
                  {t('密码')}: {detailRecord.has_password ? t('已保存') : t('未保存')}
                </Text>
                <Text size='small'>
                  refresh: {credentialLabel(
                    detailRecord.has_refresh_token,
                    detailRecord.masked_refresh_token,
                    t,
                  )}
                </Text>
                <Text size='small'>
                  access: {credentialLabel(
                    detailRecord.has_access_token,
                    detailRecord.masked_access_token,
                    t,
                  )}
                </Text>
                <div className='flex flex-col gap-1'>
                  <Text size='small'>API Key</Text>
                  {detailRecord.api_key ? (
                    <div className='flex items-center gap-2 flex-wrap'>
                      <Text>{detailRecord.api_key}</Text>
                      <Button
                        size='small'
                        type='primary'
                        theme='light'
                        onClick={() => handleCopy(detailRecord.api_key, t('API Key 已复制'))}
                      >
                        {t('复制')}
                      </Button>
                    </div>
                  ) : (
                    <Text size='small' type='tertiary'>-</Text>
                  )}
                </div>
              </div>
            </div>

            <Collapse keepDOM>
              <Collapse.Panel header={t('模型分布')} itemKey='models'>
                <div className='flex flex-col gap-2'>
                  {getModelBreakdown(detailRecord).length > 0 ? (
                    getModelBreakdown(detailRecord).map((item, index) => (
                      <Text key={`${item?.model || 'model'}-${index}`} size='small'>
                        {(item?.model || '-')} · {t('请求')} {Number(item?.requests || 0)} · Tokens {Number(item?.tokens || 0)}
                      </Text>
                    ))
                  ) : (
                    <Text type='tertiary'>-</Text>
                  )}
                </div>
              </Collapse.Panel>
              <Collapse.Panel header={t('最近调用')} itemKey='logs'>
                <div className='flex flex-col gap-2'>
                  {getRecentLogs(detailRecord).length > 0 ? (
                    getRecentLogs(detailRecord).map((item, index) => (
                      <Text key={`${item?.timestamp || 'log'}-${index}`} size='small'>
                        {item?.timestamp || '-'} · {item?.model || '-'} · {t('状态')} {item?.status || '-'} · Tokens {Number(item?.tokens || 0)}
                      </Text>
                    ))
                  ) : (
                    <Text type='tertiary'>-</Text>
                  )}
                </div>
              </Collapse.Panel>
              <Collapse.Panel header={t('错误详情')} itemKey='error'>
                <Text>{detailRecord.last_error || t('无错误')}</Text>
              </Collapse.Panel>
            </Collapse>
          </div>
        ) : null}
      </SideSheet>

      <SideSheet
        title={t('历史消耗')}
        visible={Boolean(historyRecord)}
        onCancel={() => setHistoryRecord(null)}
        width={isMobile ? '100%' : 560}
        footer={
          <div className='flex justify-end'>
            <Button onClick={() => setHistoryRecord(null)}>{t('关闭')}</Button>
          </div>
        }
      >
        {historyRecord ? (
          <div className='flex flex-col gap-4'>
            <div>
              <Text strong>{historyRecord.email || '-'}</Text>
              <div className='mt-1'>
                <Text type='tertiary'>
                  accountId: {historyRecord.account_id || getSubscriptionData(historyRecord)?.accountId || '-'}
                </Text>
              </div>
            </div>
            <div className='flex flex-col gap-3'>
              {getRecentLogs(historyRecord).length > 0 ? (
                getRecentLogs(historyRecord)
                  .slice(
                    (historyPage - 1) * historyPageSize,
                    historyPage * historyPageSize,
                  )
                  .map((item, index) => (
                    <div
                      key={`${item?.timestamp || 'history'}-${index}`}
                      className='rounded-lg border border-[var(--semi-color-border)] p-3'
                    >
                      <div className='flex items-center justify-between gap-3 flex-wrap'>
                        <Text strong>{item?.model || '-'}</Text>
                        <Tag color={String(item?.status || '') === '200' ? 'green' : 'red'}>
                          {item?.status || '-'}
                        </Tag>
                      </div>
                      <div className='mt-2 flex flex-col gap-1'>
                        <Text size='small' type='tertiary'>
                          {t('时间')}: {item?.timestamp || '-'}
                        </Text>
                        <Text size='small' type='tertiary'>
                          Tokens: {Number(item?.tokens || 0)}
                        </Text>
                      </div>
                    </div>
                  ))
              ) : (
                <Text type='tertiary'>-</Text>
              )}
            </div>
            {getRecentLogs(historyRecord).length > historyPageSize ? (
              <Pagination
                currentPage={historyPage}
                pageSize={historyPageSize}
                total={getRecentLogs(historyRecord).length}
                onPageChange={setHistoryPage}
              />
            ) : null}
          </div>
        ) : null}
      </SideSheet>

      <div className='mt-[60px] px-2'>
        <CardPro
          type='type1'
          actionsArea={
            <div className='flex flex-col gap-3 w-full'>
              <div className='flex items-center justify-between gap-3 flex-wrap'>
                <div className='flex items-center gap-2 flex-wrap'>
                  <Input
                    showClear
                    value={keyword}
                    onChange={(value) => {
                      setKeyword(value);
                      setCurrentPage(1);
                    }}
                    placeholder={t('搜索邮箱 / accountId / 状态 / 套餐')}
                    style={{ width: isMobile ? '100%' : 280 }}
                  />
                  <Select
                    value={planFilter}
                    onChange={(value) => {
                      setPlanFilter(value || '');
                      setCurrentPage(1);
                    }}
                    optionList={[
                      { label: t('全部套餐'), value: '' },
                      ...PLAN_FILTER_OPTIONS.map((item) => ({
                        label: item,
                        value: item,
                      })),
                    ]}
                    style={{ width: isMobile ? '100%' : 180 }}
                  />
                  {selectedRowKeys.length > 0 ? (
                    <>
                      <Popconfirm
                        title={t('批量同步')}
                        content={t('确定要同步选中的 {{count}} 项吗？', {
                          count: selectedRowKeys.length,
                        })}
                        okText={t('批量同步')}
                        cancelText={t('取消')}
                        onConfirm={handleBatchSync}
                      >
                        <Button
                          loading={batchSyncing}
                          disabled={batchDeleting}
                        >
                          {t('批量同步')} ({selectedRowKeys.length})
                        </Button>
                      </Popconfirm>
                      <Popconfirm
                        title={t('确认删除')}
                        content={t(
                          '确定要删除选中的 {{count}} 项吗？此操作不可逆。',
                          { count: selectedRowKeys.length },
                        )}
                        okText={t('确认删除')}
                        cancelText={t('取消')}
                        onConfirm={handleBatchDelete}
                      >
                        <Button
                          type='danger'
                          loading={batchDeleting}
                          disabled={batchSyncing}
                        >
                          {t('批量删除')} ({selectedRowKeys.length})
                        </Button>
                      </Popconfirm>
                      <Button
                        type='tertiary'
                        disabled={batchSyncing || batchDeleting}
                        onClick={() => setSelectedRowKeys([])}
                      >
                        {t('取消选择')}
                      </Button>
                    </>
                  ) : null}
                  <Button theme='solid' onClick={openCreate}>
                    {t('新增账户')}
                  </Button>
                </div>
              </div>
            </div>
          }
          paginationArea={createCardProPagination({
            currentPage,
            pageSize,
            total: filteredAccounts.length,
            onPageChange: setCurrentPage,
            onPageSizeChange: (size) => {
              setPageSize(size);
              setCurrentPage(1);
            },
            isMobile,
            t,
          })}
          t={t}
        >
          <CardTable
            rowKey='id'
            loading={loading}
            columns={columns}
            dataSource={paginatedAccounts}
            rowSelection={rowSelection}
            expandedRowRender={expandedRowRender}
            expandRowByClick={true}
            rowExpandable={() => true}
            hidePagination={true}
            size='middle'
            scroll={isMobile ? { x: 760 } : { x: 960 }}
            empty={
              <Empty
                image={<IllustrationNoResult style={{ width: 150, height: 150 }} />}
                darkModeImage={
                  <IllustrationNoResultDark style={{ width: 150, height: 150 }} />
                }
                description={t('暂无 EcomAgent 账户')}
                style={{ padding: 30 }}
              />
            }
          />
        </CardPro>
      </div>
    </>
  );
};

export default EcomAgentPage;
