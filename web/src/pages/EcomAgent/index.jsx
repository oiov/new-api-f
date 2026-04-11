import React, { useEffect, useMemo, useState } from 'react';
import {
  Banner,
  Button,
  Descriptions,
  Empty,
  Input,
  Modal,
  Popconfirm,
  SideSheet,
  Space,
  Tag,
  Tooltip,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IconDelete,
  IconEdit,
  IconEyeOpened,
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
  base_url: 'https://ecomagent.in',
  supabase_auth_url: 'https://zwggawnojtjiaklycfhc.supabase.co/auth/v1',
  supabase_anon_key:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3Z2dhd25vanRqaWFrbHljZmhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMzU3NDUsImV4cCI6MjA4NzYxMTc0NX0.-pQHomLNGWL7OvQpHL2_7T_NwI4wAzyNYMOknX_YJSE',
  confirm_url: '',
};

function credentialLabel(saved, maskedValue, t) {
  if (!saved) return t('未保存');
  return maskedValue || t('已保存');
}

function formatTs(ts) {
  if (!ts) return '-';
  return timestamp2string(ts);
}

function usageSummary(record, t) {
  return [
    `${t('套餐')}: ${record.plan || '-'}`,
    `${t('请求额度')}: ${record.request_limit || 0}`,
    `${t('Token额度')}: ${record.token_limit || 0}`,
    `${t('已用请求')}: ${record.usage_requests || 0}`,
    `${t('已用Tokens')}: ${record.usage_tokens || 0}`,
  ].join(' / ');
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
  const [form, setForm] = useState(defaultFormState);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

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

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(accounts.length / pageSize));
    if (currentPage > maxPage) {
      setCurrentPage(maxPage);
    }
  }, [accounts.length, currentPage, pageSize]);

  useEffect(() => {
    setSelectedRowKeys((prev) =>
      prev.filter((key) => accounts.some((account) => account.id === key)),
    );
  }, [accounts]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...defaultFormState });
    setVisible(true);
  };

  const openEdit = (record) => {
    setEditing(record);
    setForm({
      email: record.email || '',
      password: '',
      base_url: record.base_url || defaultFormState.base_url,
      supabase_auth_url:
        record.supabase_auth_url || defaultFormState.supabase_auth_url,
      supabase_anon_key:
        record.supabase_anon_key || defaultFormState.supabase_anon_key,
      confirm_url: record.confirm_url || '',
    });
    setVisible(true);
  };

  const handleSave = async () => {
    if (!form.email.trim()) {
      showError(t('邮箱不能为空'));
      return;
    }
    if (!editing && !form.password.trim()) {
      showError(t('密码不能为空'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        email: form.email.trim(),
        base_url: form.base_url.trim(),
        supabase_auth_url: form.supabase_auth_url.trim(),
        supabase_anon_key: form.supabase_anon_key.trim(),
        confirm_url: form.confirm_url.trim(),
      };
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
        width: 280,
        render: (_, record) => (
          <div className='flex flex-col gap-1 min-w-0'>
            <Text
              strong
              ellipsis={{ showTooltip: true }}
              style={{ maxWidth: isMobile ? 180 : 220 }}
            >
              {record.email}
            </Text>
            <Text size='small' type='tertiary'>
              accountId: {record.account_id || '-'}
            </Text>
            <Text size='small' type='tertiary'>
              {t('注册时间')}: {formatTs(record.signup_at)}
            </Text>
          </div>
        ),
      },
      {
        title: t('概览'),
        dataIndex: 'status',
        width: isMobile ? 300 : 420,
        render: (value, record) => (
          <div className='flex flex-col gap-2 min-w-0'>
            <div className='flex items-center gap-2 flex-wrap'>
              <Tag color={record.last_error ? 'red' : 'blue'}>
                {value || '-'}
              </Tag>
              {record.plan ? <Tag color='white'>{record.plan}</Tag> : null}
              <Tag color={record.has_api_key ? 'green' : 'grey'}>
                key {record.has_api_key ? t('已保存') : t('未保存')}
              </Tag>
              <Tag color={record.has_access_token ? 'cyan' : 'grey'}>
                access {record.has_access_token ? t('已保存') : t('未保存')}
              </Tag>
            </div>
            <Text
              size='small'
              type={record.last_error ? 'danger' : 'tertiary'}
              ellipsis={{ showTooltip: true }}
              style={{ maxWidth: isMobile ? 260 : 360 }}
            >
              {record.last_error || t('无错误')}
            </Text>
            <Text
              size='small'
              type='tertiary'
              ellipsis={{ showTooltip: true }}
              style={{ maxWidth: isMobile ? 260 : 360 }}
            >
              {usageSummary(record, t)}
            </Text>
            <Text size='small' type='tertiary'>
              {t('同步')}: {formatTs(record.last_sync_at)}
            </Text>
          </div>
        ),
      },
      {
        title: t('操作'),
        dataIndex: 'id',
        width: isMobile ? 132 : 148,
        render: (_, record) => (
          <Space wrap>
            <Tooltip content={t('查看详情')}>
              <Button
                size='small'
                theme='borderless'
                type='tertiary'
                icon={<IconEyeOpened />}
                onClick={() => setDetailRecord(record)}
              />
            </Tooltip>
            <Tooltip content={t('执行同步')}>
              <Button
                size='small'
                theme='borderless'
                type='primary'
                icon={<IconRefresh />}
                loading={syncingId === record.id}
                onClick={() => handleSync(record)}
              />
            </Tooltip>
            <Tooltip content={t('编辑')}>
              <Button
                size='small'
                theme='borderless'
                type='tertiary'
                icon={<IconEdit />}
                onClick={() => openEdit(record)}
              />
            </Tooltip>
            <Popconfirm
              title={t('确认删除')}
              content={record.email}
              okText={t('确认删除')}
              cancelText={t('取消')}
              onConfirm={() => handleDelete(record)}
            >
              <Tooltip content={t('删除')}>
                <Button
                  size='small'
                  theme='borderless'
                  type='danger'
                  icon={<IconDelete />}
                />
              </Tooltip>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [isMobile, syncingId, t],
  );

  const paginatedAccounts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return accounts.slice(start, start + pageSize);
  }, [accounts, currentPage, pageSize]);

  const rowSelection = useMemo(
    () => ({
      selectedRowKeys,
      onChange: (keys) => setSelectedRowKeys(keys),
    }),
    [selectedRowKeys],
  );

  const detailDescriptions = useMemo(() => {
    if (!detailRecord) return [];
    return [
      { key: 'email', label: t('邮箱'), value: detailRecord.email || '-' },
      { key: 'account_id', label: 'accountId', value: detailRecord.account_id || '-' },
      { key: 'status', label: t('状态'), value: detailRecord.status || '-' },
      { key: 'signup_at', label: t('注册时间'), value: formatTs(detailRecord.signup_at) },
      { key: 'confirmed_at', label: t('确认'), value: formatTs(detailRecord.confirmed_at) },
      { key: 'login_at', label: t('登录'), value: formatTs(detailRecord.login_at) },
      { key: 'sync_at', label: t('同步'), value: formatTs(detailRecord.last_sync_at) },
      {
        key: 'plan',
        label: t('权益使用情况'),
        value: usageSummary(detailRecord, t),
      },
      {
        key: 'password',
        label: t('密码'),
        value: detailRecord.has_password ? t('已保存') : t('未保存'),
      },
      {
        key: 'refresh',
        label: 'refresh',
        value: credentialLabel(
          detailRecord.has_refresh_token,
          detailRecord.masked_refresh_token,
          t,
        ),
      },
      {
        key: 'access',
        label: 'access',
        value: credentialLabel(
          detailRecord.has_access_token,
          detailRecord.masked_access_token,
          t,
        ),
      },
      {
        key: 'api_key',
        label: 'key',
        value: credentialLabel(
          detailRecord.has_api_key,
          detailRecord.masked_api_key,
          t,
        ),
      },
      {
        key: 'error',
        label: t('错误详情'),
        value: detailRecord.last_error || t('无错误'),
      },
    ];
  }, [detailRecord, t]);

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
        <Descriptions
          data={detailDescriptions}
          column={1}
          size='small'
          rowSize='small'
        />
      </SideSheet>

      <div className='mt-[60px] px-2'>
        <CardPro
          type='type1'
          descriptionArea={
            <div className='flex flex-col gap-2'>
              <Text strong>{t('EcomAgent 账户工厂')}</Text>
              <Text type='tertiary'>
                {t(
                  '在后台完成注册、确认、登录、refresh_token 刷新、按需生成 key 和额度采集，数据直接落库。',
                )}
              </Text>
            </div>
          }
          actionsArea={
            <div className='flex flex-col gap-3 w-full'>
              <Banner
                type='info'
                closeIcon={null}
                description={t(
                  '首次同步会自动注册并拿到 key；已有 key 的账号默认只刷新登录态和额度，不会无脑轮换。若邮箱确认链接暂时没有，可以先创建记录，后续补录 confirm_url 再点“执行同步”。',
                )}
              />
              <div className='flex items-center justify-between gap-3 flex-wrap'>
                <Text type='tertiary'>
                  {selectedRowKeys.length > 0
                    ? t('已选择 {{count}} 项', { count: selectedRowKeys.length })
                    : t('超级管理员在这里管理 EcomAgent 账号注册、登录状态与 key 配额。')}
                </Text>
                <div className='flex items-center gap-2 flex-wrap'>
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
            total: accounts.length,
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
            hidePagination={true}
            size='middle'
            scroll={isMobile ? { x: 860 } : { x: 980 }}
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
