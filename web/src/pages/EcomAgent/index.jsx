import React, { useEffect, useMemo, useState } from 'react';
import {
  Banner,
  Button,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { API, showError, showSuccess, timestamp2string } from '../../helpers';
import CardPro from '../../components/common/ui/CardPro';

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

function credentialLabel(saved, maskedValue) {
  if (!saved) return '未保存';
  return maskedValue || '已保存';
}

function formatTs(ts) {
  if (!ts) return '-';
  return timestamp2string(ts);
}

const EcomAgentPage = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState(null);
  const [visible, setVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultFormState);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/ecomagent/accounts');
      if (res.data.success) {
        setAccounts(res.data.data || []);
      } else {
        showError(res.data.message || '加载失败');
      }
    } catch (error) {
      showError(error?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

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
      showError('邮箱不能为空');
      return;
    }
    if (!editing && !form.password.trim()) {
      showError('密码不能为空');
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
        showSuccess(editing ? '更新成功' : '创建成功');
        setVisible(false);
        await loadAccounts();
      } else {
        showError(res.data.message || '保存失败');
      }
    } catch (error) {
      showError(error?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async (record) => {
    setSyncingId(record.id);
    try {
      const res = await API.post(`/api/ecomagent/accounts/${record.id}/sync`);
      if (res.data.success) {
        showSuccess('同步完成');
      } else {
        showError(res.data.message || '同步失败');
      }
      await loadAccounts();
    } catch (error) {
      showError(error?.message || '同步失败');
      await loadAccounts();
    } finally {
      setSyncingId(null);
    }
  };

  const handleDelete = async (record) => {
    try {
      const res = await API.delete(`/api/ecomagent/accounts/${record.id}`);
      if (res.data.success) {
        showSuccess('删除成功');
        await loadAccounts();
      } else {
        showError(res.data.message || '删除失败');
      }
    } catch (error) {
      showError(error?.message || '删除失败');
    }
  };

  const columns = useMemo(
    () => [
      {
        title: '邮箱',
        dataIndex: 'email',
        render: (_, record) => (
          <div className='flex flex-col gap-1'>
            <Text strong>{record.email}</Text>
            <Text size='small' type='tertiary'>
              accountId: {record.account_id || '-'}
            </Text>
          </div>
        ),
      },
      {
        title: '状态',
        dataIndex: 'status',
        render: (value, record) => (
          <div className='flex flex-col gap-1'>
            <Tag color={record.last_error ? 'red' : 'blue'}>{value || '-'}</Tag>
            <Text size='small' type='tertiary'>
              {record.last_error || '无错误'}
            </Text>
          </div>
        ),
      },
      {
        title: '凭证',
        dataIndex: 'masked_api_key',
        render: (_, record) => (
          <div className='flex flex-col gap-1'>
            <Text>密码: {record.has_password ? '已保存' : '未保存'}</Text>
            <Text>
              refresh: {credentialLabel(record.has_refresh_token, record.masked_refresh_token)}
            </Text>
            <Text>
              access: {credentialLabel(record.has_access_token, record.masked_access_token)}
            </Text>
            <Text>key: {credentialLabel(record.has_api_key, record.masked_api_key)}</Text>
          </div>
        ),
      },
      {
        title: '额度',
        dataIndex: 'request_limit',
        render: (_, record) => (
          <div className='flex flex-col gap-1'>
            <Text>套餐: {record.plan || '-'}</Text>
            <Text>请求额度: {record.request_limit || 0}</Text>
            <Text>Token额度: {record.token_limit || 0}</Text>
            <Text>已用请求: {record.usage_requests || 0}</Text>
            <Text>已用Tokens: {record.usage_tokens || 0}</Text>
          </div>
        ),
      },
      {
        title: '时间',
        dataIndex: 'updated_time',
        render: (_, record) => (
          <div className='flex flex-col gap-1'>
            <Text size='small'>注册: {formatTs(record.signup_at)}</Text>
            <Text size='small'>确认: {formatTs(record.confirmed_at)}</Text>
            <Text size='small'>登录: {formatTs(record.login_at)}</Text>
            <Text size='small'>同步: {formatTs(record.last_sync_at)}</Text>
          </div>
        ),
      },
      {
        title: '操作',
        dataIndex: 'id',
        width: 240,
        render: (_, record) => (
          <Space wrap>
            <Button
              size='small'
              theme='solid'
              loading={syncingId === record.id}
              onClick={() => handleSync(record)}
            >
              执行同步
            </Button>
            <Button size='small' onClick={() => openEdit(record)}>
              编辑
            </Button>
            <Popconfirm
              title='确认删除该记录？'
              onConfirm={() => handleDelete(record)}
            >
              <Button size='small' type='danger'>
                删除
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [syncingId],
  );

  return (
    <>
      <Modal
        title={editing ? '编辑 EcomAgent 账户' : '新增 EcomAgent 账户'}
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
            placeholder='邮箱'
          />
          <Input
            value={form.password}
            onChange={(value) =>
              setForm((prev) => ({ ...prev, password: value }))
            }
            placeholder={editing ? '密码，留空表示不修改' : '密码'}
          />
          <Input
            value={form.confirm_url}
            onChange={(value) =>
              setForm((prev) => ({ ...prev, confirm_url: value }))
            }
            placeholder='邮件确认链接，可后续补录'
          />
          <Input
            value={form.base_url}
            onChange={(value) =>
              setForm((prev) => ({ ...prev, base_url: value }))
            }
            placeholder='EcomAgent Base URL'
          />
          <Input
            value={form.supabase_auth_url}
            onChange={(value) =>
              setForm((prev) => ({ ...prev, supabase_auth_url: value }))
            }
            placeholder='Supabase Auth URL'
          />
          <Input
            value={form.supabase_anon_key}
            onChange={(value) =>
              setForm((prev) => ({ ...prev, supabase_anon_key: value }))
            }
            placeholder='Supabase Anon Key'
          />
        </div>
      </Modal>

      <div className='mt-[60px] px-2'>
        <CardPro
          type='type1'
          descriptionArea={
            <div className='flex flex-col gap-2'>
              <Text strong>EcomAgent 账户工厂</Text>
              <Text type='tertiary'>
                在后台完成注册、确认、登录、refresh_token 刷新、按需生成 key 和额度采集，数据直接落库。
              </Text>
            </div>
          }
          actionsArea={
            <div className='flex flex-col gap-3 w-full'>
              <Banner
                type='info'
                closeIcon={null}
                description='首次同步会自动注册并拿到 key；已有 key 的账号默认只刷新登录态和额度，不会无脑轮换。若邮箱确认链接暂时没有，可以先创建记录，后续补录 confirm_url 再点“执行同步”。'
              />
              <div>
                <Button theme='solid' onClick={openCreate}>
                  新增账户
                </Button>
              </div>
            </div>
          }
        >
          <Table
            rowKey='id'
            loading={loading}
            columns={columns}
            dataSource={accounts}
            pagination={false}
          />
        </CardPro>
      </div>
    </>
  );
};

export default EcomAgentPage;
