import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Tag,
  Button,
  Typography,
  Toast,
  Space,
  Modal,
  Form,
  Input,
  Select,
  Tooltip,
  Popover,
  Badge,
  Card,
  Banner,
} from '@douyinfe/semi-ui';
import { IconSearch, IconDownload, IconMail } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { API, timestamp2string } from '../../helpers';

const { Text } = Typography;
const { Option } = Select;

const STATUS_CONFIG = {
  pending: { color: 'orange', label: '审核中' },
  issued: { color: 'green', label: '已开具' },
  sent: { color: 'green', label: '已发送' },
  rejected: { color: 'red', label: '已拒绝' },
};

const AdminInvoiceManager = () => {
  const { t } = useTranslation();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Filters
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Issue modal
  const [issueModal, setIssueModal] = useState({ visible: false, record: null });
  const [issueSubmitting, setIssueSubmitting] = useState(false);
  const issueFormApi = React.useRef(null);

  // Reject modal
  const [rejectModal, setRejectModal] = useState({ visible: false, record: null });
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const rejectFormApi = React.useRef(null);

  // Send email modal
  const [sendModal, setSendModal] = useState({ visible: false, record: null });
  const [sendSubmitting, setSendSubmitting] = useState(false);
  const sendFormApi = React.useRef(null);

  const fetchInvoices = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const res = await API.get('/api/user/invoice', {
        params: { page: p, page_size: pageSize, keyword, status: statusFilter },
      });
      if (res.data.message === 'success') {
        setInvoices(res.data.data?.items || []);
        setTotal(res.data.data?.total || 0);
      }
    } catch {
      Toast.error(t('获取发票列表失败'));
    } finally {
      setLoading(false);
    }
  }, [keyword, statusFilter, t]);

  useEffect(() => {
    fetchInvoices(page);
  }, [page, fetchInvoices]);

  // Issue invoice
  const handleIssueSubmit = async () => {
    let values;
    try {
      values = await issueFormApi.current.validate();
    } catch {
      return;
    }
    setIssueSubmitting(true);
    try {
      const res = await API.put(
        `/api/user/invoice/${issueModal.record.id}/issue`,
        { file_url: values.file_url, remark: values.remark || '' },
      );
      if (res.data.message === 'success') {
        Toast.success(t('发票已开具，系统将自动发送邮件通知用户'));
        setIssueModal({ visible: false, record: null });
        fetchInvoices(page);
      } else {
        Toast.error(res.data.data || t('操作失败'));
      }
    } catch {
      Toast.error(t('操作失败，请稍后重试'));
    } finally {
      setIssueSubmitting(false);
    }
  };

  // Reject invoice
  const handleRejectSubmit = async () => {
    let values;
    try {
      values = await rejectFormApi.current.validate();
    } catch {
      return;
    }
    setRejectSubmitting(true);
    try {
      const res = await API.put(
        `/api/user/invoice/${rejectModal.record.id}/reject`,
        { remark: values.remark },
      );
      if (res.data.message === 'success') {
        Toast.success(t('已拒绝该发票申请'));
        setRejectModal({ visible: false, record: null });
        fetchInvoices(page);
      } else {
        Toast.error(res.data.data || t('操作失败'));
      }
    } catch {
      Toast.error(t('操作失败，请稍后重试'));
    } finally {
      setRejectSubmitting(false);
    }
  };

  // Send email
  const handleSendEmail = async () => {
    let values;
    try {
      values = await sendFormApi.current.validate();
    } catch {
      return;
    }
    setSendSubmitting(true);
    try {
      const res = await API.post(
        `/api/user/invoice/${sendModal.record.id}/send`,
        { email: values.email || '' },
      );
      if (res.data.message === 'success') {
        Toast.success(res.data.data || t('邮件已发送'));
        setSendModal({ visible: false, record: null });
        fetchInvoices(page);
      } else {
        Toast.error(res.data.data || t('发送失败'));
      }
    } catch {
      Toast.error(t('发送失败，请稍后重试'));
    } finally {
      setSendSubmitting(false);
    }
  };

  const pendingCount = invoices.filter((i) => i.status === 'pending').length;

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 64,
    },
    {
      title: t('申请时间'),
      dataIndex: 'create_time',
      key: 'create_time',
      render: (v) => timestamp2string(v),
    },
    {
      title: t('用户'),
      dataIndex: 'username',
      key: 'username',
      render: (v, r) => (
        <span>
          {v || r.user_id}
        </span>
      ),
    },
    {
      title: t('发票抬头'),
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: t('税号'),
      dataIndex: 'tax_id',
      key: 'tax_id',
      render: (v) => v || <Text type='tertiary'>—</Text>,
    },
    {
      title: t('金额（元）'),
      dataIndex: 'amount',
      key: 'amount',
      render: (v) => <Text strong>¥{Number(v).toFixed(2)}</Text>,
    },
    {
      title: t('邮箱'),
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: t('状态'),
      dataIndex: 'status',
      key: 'status',
      render: (status, record) => {
        const cfg = STATUS_CONFIG[status] || { color: 'grey', label: status };
        const tag = <Tag color={cfg.color}>{t(cfg.label)}</Tag>;
        if (status === 'rejected' && record.remark) {
          return <Tooltip content={record.remark}>{tag}</Tooltip>;
        }
        return tag;
      },
    },
    {
      title: t('操作'),
      key: 'action',
      width: 160,
      render: (_, record) => (
        <Space>
          {record.status === 'pending' && (
            <>
              <Button
                type='primary'
                size='small'
                onClick={() => setIssueModal({ visible: true, record })}
              >
                {t('开具')}
              </Button>
              <Button
                type='danger'
                size='small'
                onClick={() => setRejectModal({ visible: true, record })}
              >
                {t('拒绝')}
              </Button>
            </>
          )}
          {(record.status === 'issued' || record.status === 'sent') && (
            <>
              {record.file_url && (
                <Tooltip content={t('下载发票')}>
                  <Button
                    icon={<IconDownload />}
                    size='small'
                    onClick={() => window.open(record.file_url, '_blank')}
                  />
                </Tooltip>
              )}
              <Tooltip content={t('发送邮件')}>
                <Button
                  icon={<IconMail />}
                  size='small'
                  onClick={() => setSendModal({ visible: true, record })}
                />
              </Tooltip>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* 筛选栏 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <Input
          prefix={<IconSearch />}
          placeholder={t('搜索抬头/用户名/邮箱')}
          value={keyword}
          onChange={setKeyword}
          style={{ width: 240 }}
          onEnterPress={() => { setPage(1); fetchInvoices(1); }}
        />
        <Select
          placeholder={t('全部状态')}
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); setPage(1); }}
          style={{ width: 140 }}
          showClear
        >
          <Option value='pending'>{t('审核中')}</Option>
          <Option value='issued'>{t('已开具')}</Option>
          <Option value='sent'>{t('已发送')}</Option>
          <Option value='rejected'>{t('已拒绝')}</Option>
        </Select>
        <Button onClick={() => { setPage(1); fetchInvoices(1); }}>{t('搜索')}</Button>
        {pendingCount > 0 && (
          <Badge count={pendingCount} type='danger' style={{ marginLeft: 8 }}>
            <Tag color='orange'>{t('待处理')}</Tag>
          </Badge>
        )}
      </div>

      <Table
        columns={columns}
        dataSource={invoices}
        rowKey='id'
        loading={loading}
        pagination={{
          currentPage: page,
          total,
          pageSize,
          onChange: setPage,
          showTotal: true,
        }}
        scroll={{ x: 900 }}
      />

      {/* 开具发票 Modal */}
      <Modal
        title={t('开具发票')}
        visible={issueModal.visible}
        onCancel={() => setIssueModal({ visible: false, record: null })}
        onOk={handleIssueSubmit}
        okText={t('确认开具')}
        cancelText={t('取消')}
        confirmLoading={issueSubmitting}
        width={520}
      >
        {issueModal.record && (
          <Banner
            type='info'
            description={`${t('发票抬头')}：${issueModal.record.title}，${t('金额')}：¥${Number(issueModal.record.amount).toFixed(2)}`}
            style={{ marginBottom: 16 }}
          />
        )}
        <Form getFormApi={(api) => (issueFormApi.current = api)} layout='vertical'>
          <Form.Input
            field='file_url'
            label={t('发票文件链接')}
            placeholder={t('请输入发票 PDF 或图片的可访问链接')}
            rules={[{ required: true, message: t('请输入文件链接') }]}
          />
          <Form.TextArea
            field='remark'
            label={t('备注（选填）')}
            placeholder={t('可填写发票号等附加信息')}
            rows={2}
          />
        </Form>
      </Modal>

      {/* 拒绝发票 Modal */}
      <Modal
        title={t('拒绝发票申请')}
        visible={rejectModal.visible}
        onCancel={() => setRejectModal({ visible: false, record: null })}
        onOk={handleRejectSubmit}
        okText={t('确认拒绝')}
        okType='danger'
        cancelText={t('取消')}
        confirmLoading={rejectSubmitting}
        width={480}
      >
        <Form getFormApi={(api) => (rejectFormApi.current = api)} layout='vertical'>
          <Form.TextArea
            field='remark'
            label={t('拒绝原因')}
            placeholder={t('请填写拒绝原因，将通知用户')}
            rules={[{ required: true, message: t('请填写拒绝原因') }]}
            rows={3}
          />
        </Form>
      </Modal>

      {/* 发送邮件 Modal */}
      <Modal
        title={t('发送发票邮件')}
        visible={sendModal.visible}
        onCancel={() => setSendModal({ visible: false, record: null })}
        onOk={handleSendEmail}
        okText={t('发送')}
        cancelText={t('取消')}
        confirmLoading={sendSubmitting}
        width={440}
      >
        <Form
          getFormApi={(api) => (sendFormApi.current = api)}
          layout='vertical'
          initValues={{ email: sendModal.record?.email || '' }}
        >
          <Form.Input
            field='email'
            label={t('接收邮箱')}
            placeholder={t('默认使用申请时填写的邮箱，可修改')}
            rules={[
              { required: true, message: t('请输入邮箱') },
              { type: 'email', message: t('请输入有效邮箱') },
            ]}
          />
        </Form>
      </Modal>
    </div>
  );
};

export default AdminInvoiceManager;
