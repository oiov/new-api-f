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

import React, { useState, useEffect, useCallback } from 'react';
import {
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
  Badge,
  Spin,
  Empty,
  Upload,
  Divider,
  SideSheet,
  Pagination,
} from '@douyinfe/semi-ui';
import { IllustrationNoResult, IllustrationNoResultDark } from '@douyinfe/semi-illustrations';
import {
  IconSearch,
  IconDownload,
  IconMail,
  IconList,
  IconEyeOpened,
  IconUpload,
  IconEdit,
} from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { API, timestamp2string } from '../../helpers';
import { createCardProPagination } from '../../helpers/utils';
import { useIsMobile } from '../../hooks/common/useIsMobile';
import CardPro from '../common/ui/CardPro';
import CardTable from '../common/ui/CardTable';

const { Text } = Typography;
const { Option } = Select;

const STATUS_CONFIG = {
  pending: { color: 'orange', label: '审核中' },
  issued: { color: 'green', label: '已开具' },
  sent: { color: 'green', label: '已发送' },
  rejected: { color: 'red', label: '已拒绝' },
};

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i;
const PDF_EXTENSION = /\.pdf(\?.*)?$/i;

function resolveUrl(url) {
  if (!url) return url;
  if (window.location.protocol === 'https:' && url.startsWith('http:')) {
    return url.replace(/^http:/, 'https:');
  }
  return url;
}

const TOPUP_PAGE_SIZE = 10;

const AdminInvoiceManager = () => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Issue modal
  const [issueModal, setIssueModal] = useState({ visible: false, record: null });
  const [issueSubmitting, setIssueSubmitting] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const issueFormApi = React.useRef(null);

  // Edit modal
  const [editModal, setEditModal] = useState({ visible: false, record: null });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editUploadedUrl, setEditUploadedUrl] = useState('');
  const [editUploading, setEditUploading] = useState(false);
  const editFormApi = React.useRef(null);

  // Reject modal
  const [rejectModal, setRejectModal] = useState({ visible: false, record: null });
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const rejectFormApi = React.useRef(null);

  // Send email modal
  const [sendModal, setSendModal] = useState({ visible: false, record: null });
  const [sendSubmitting, setSendSubmitting] = useState(false);
  const sendFormApi = React.useRef(null);

  // Detail SideSheet
  const [detailSheet, setDetailSheet] = useState({
    visible: false,
    record: null,
    topups: [],
    loading: false,
    topupPage: 1,
  });

  // Preview modal
  const [previewModal, setPreviewModal] = useState({ visible: false, url: '', isPdf: false });

  const PAYMENT_METHOD_MAP = {
    stripe: 'Stripe',
    epay: '易支付',
    creem: 'Creem',
    waffo: 'Waffo',
    manual: '管理员充值',
  };

  const openDetail = async (record) => {
    setDetailSheet({ visible: true, record, topups: [], loading: true, topupPage: 1 });
    try {
      const res = await API.get(`/api/invoice/admin/${record.id}/topups`);
      if (res.data.success === true) {
        setDetailSheet((prev) => ({ ...prev, topups: res.data.data || [], loading: false }));
      } else {
        Toast.error(t('获取关联订单失败'));
        setDetailSheet((prev) => ({ ...prev, loading: false }));
      }
    } catch {
      Toast.error(t('获取关联订单失败'));
      setDetailSheet((prev) => ({ ...prev, loading: false }));
    }
  };

  const handlePreview = (fileUrl) => {
    const safe = resolveUrl(fileUrl);
    const isPdf = PDF_EXTENSION.test(safe);
    if (isPdf || IMAGE_EXTENSIONS.test(safe)) {
      setPreviewModal({ visible: true, url: safe, isPdf });
    } else {
      window.open(safe, '_blank');
    }
  };

  const topupColumns = [
    {
      title: t('充值时间'),
      dataIndex: 'complete_time',
      key: 'complete_time',
      width: 160,
      render: (v) => <span style={{ whiteSpace: 'nowrap' }}>{timestamp2string(v)}</span>,
    },
    {
      title: t('支付方式'),
      dataIndex: 'payment_method',
      key: 'payment_method',
      width: 100,
      render: (v) => PAYMENT_METHOD_MAP[v] || v || '—',
    },
    {
      title: t('金额（元）'),
      dataIndex: 'money',
      key: 'money',
      width: 110,
      render: (v) => <Text strong>¥{Number(v).toFixed(2)}</Text>,
    },
    {
      title: t('订单号'),
      dataIndex: 'trade_no',
      key: 'trade_no',
      render: (v) => (
        <Text ellipsis={{ showTooltip: true }} style={{ maxWidth: 220 }} copyable>
          {v || '—'}
        </Text>
      ),
    },
  ];

  const fetchInvoices = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const res = await API.get('/api/invoice/admin', {
        params: { page: p, page_size: pageSize, keyword, status: statusFilter },
      });
      if (res.data.success === true) {
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

  const handleIssueSubmit = async () => {
    let values;
    try { values = await issueFormApi.current.validate(); } catch { return; }
    setIssueSubmitting(true);
    try {
      const res = await API.put(
        `/api/invoice/admin/${issueModal.record.id}/issue`,
        { file_url: values.file_url, remark: values.remark || '' },
      );
      if (res.data.success === true) {
        Toast.success(t('发票已开具，系统将自动发送邮件通知用户'));
        setIssueModal({ visible: false, record: null });
        setUploadedUrl('');
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

  const handleEditSubmit = async () => {
    let values;
    try { values = await editFormApi.current.validate(); } catch { return; }
    if (values.status === 'rejected' && !values.remark?.trim()) {
      Toast.error(t('拒绝状态时必须填写拒绝原因'));
      return;
    }
    setEditSubmitting(true);
    try {
      const res = await API.put(
        `/api/invoice/admin/${editModal.record.id}`,
        {
          title: values.title,
          tax_id: values.tax_id || '',
          email: values.email,
          file_url: values.file_url || '',
          remark: values.remark || '',
          status: values.status,
        },
      );
      if (res.data.success === true) {
        Toast.success(t('发票信息已更新'));
        setEditModal({ visible: false, record: null });
        setEditUploadedUrl('');
        fetchInvoices(page);
      } else {
        Toast.error(res.data.data || res.data.message || t('操作失败'));
      }
    } catch {
      Toast.error(t('操作失败，请稍后重试'));
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleRejectSubmit = async () => {
    let values;
    try { values = await rejectFormApi.current.validate(); } catch { return; }
    setRejectSubmitting(true);
    try {
      const res = await API.put(
        `/api/invoice/admin/${rejectModal.record.id}/reject`,
        { remark: values.remark },
      );
      if (res.data.success === true) {
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

  const handleSendEmail = async () => {
    let values;
    try { values = await sendFormApi.current.validate(); } catch { return; }
    setSendSubmitting(true);
    try {
      const res = await API.post(
        `/api/invoice/admin/${sendModal.record.id}/send`,
        { email: values.email || '' },
      );
      if (res.data.success === true) {
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
      width: 60,
    },
    {
      title: t('申请时间'),
      dataIndex: 'create_time',
      key: 'create_time',
      width: 150,
      render: (v) => <span style={{ whiteSpace: 'nowrap' }}>{timestamp2string(v)}</span>,
    },
    {
      title: t('用户'),
      dataIndex: 'username',
      key: 'username',
      width: 100,
      render: (v, r) => (
        <Text ellipsis={{ showTooltip: true }} style={{ maxWidth: 96 }}>
          {v || r.user_id}
        </Text>
      ),
    },
    {
      title: t('发票抬头'),
      dataIndex: 'title',
      key: 'title',
      width: 160,
      render: (v) => (
        <Text ellipsis={{ showTooltip: true }} style={{ maxWidth: 156 }}>
          {v}
        </Text>
      ),
    },
    {
      title: t('税号'),
      dataIndex: 'tax_id',
      key: 'tax_id',
      width: 160,
      render: (v) => v
        ? <Text ellipsis={{ showTooltip: true }} style={{ maxWidth: 156 }}>{v}</Text>
        : <Text type='tertiary'>—</Text>,
    },
    {
      title: t('金额（元）'),
      dataIndex: 'amount',
      key: 'amount',
      width: 100,
      render: (v) => <span style={{ whiteSpace: 'nowrap' }}><Text strong>¥{Number(v).toFixed(2)}</Text></span>,
    },
    {
      title: t('邮箱'),
      dataIndex: 'email',
      key: 'email',
      width: 180,
      render: (v) => (
        <Text ellipsis={{ showTooltip: true }} style={{ maxWidth: 176 }}>
          {v}
        </Text>
      ),
    },
    {
      title: t('状态'),
      dataIndex: 'status',
      key: 'status',
      width: 80,
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
      width: 230,
      render: (_, record) => (
        <Space spacing={4}>
          <Tooltip content={t('关联订单')}>
            <Button icon={<IconList />} size='small' onClick={() => openDetail(record)} />
          </Tooltip>
          <Tooltip content={t('编辑发票')}>
            <Button
              icon={<IconEdit />}
              size='small'
              onClick={() => {
                setEditUploadedUrl('');
                setEditModal({ visible: true, record });
              }}
            />
          </Tooltip>
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
          {(record.status === 'issued' || record.status === 'sent') && record.file_url && (
            <>
              <Tooltip content={t('预览')}>
                <Button
                  icon={<IconEyeOpened />}
                  size='small'
                  onClick={() => handlePreview(record.file_url)}
                />
              </Tooltip>
              <Tooltip content={t('下载')}>
                <Button
                  icon={<IconDownload />}
                  size='small'
                  onClick={() => window.open(resolveUrl(record.file_url), '_blank')}
                />
              </Tooltip>
            </>
          )}
          {(record.status === 'issued' || record.status === 'sent') && (
            <Tooltip content={t('发送邮件')}>
              <Button
                icon={<IconMail />}
                size='small'
                onClick={() => setSendModal({ visible: true, record })}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const statsArea = (
    <div className='flex items-center gap-3'>
      <Text strong style={{ fontSize: 16 }}>{t('发票管理')}</Text>
      {pendingCount > 0 && (
        <Badge count={pendingCount} type='danger'>
          <Tag color='orange'>{t('待处理')}</Tag>
        </Badge>
      )}
    </div>
  );

  const searchArea = (
    <div className='flex gap-2 flex-wrap'>
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
    </div>
  );

  const topupTotal = detailSheet.topups.length;
  const topupPageData = detailSheet.topups.slice(
    (detailSheet.topupPage - 1) * TOPUP_PAGE_SIZE,
    detailSheet.topupPage * TOPUP_PAGE_SIZE,
  );

  // 文件上传 helper（复用于开具/编辑两个 modal）
  const buildUploadProps = (formApiRef, setUploaded, setIsUploading) => ({
    accept: '.pdf,.png,.jpg,.jpeg,.webp',
    limit: 1,
    showUploadList: false,
    customRequest: async ({ file, onSuccess, onError }) => {
      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', file.fileInstance);
        const res = await API.post('/api/invoice/admin/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        if (res.data.success === true) {
          const url = res.data.data?.url || '';
          setUploaded(url);
          formApiRef.current?.setValue('file_url', url);
          Toast.success(t('文件上传成功'));
          onSuccess();
        } else {
          Toast.error(res.data.message || t('上传失败'));
          onError();
        }
      } catch {
        Toast.error(t('上传失败，请稍后重试'));
        onError();
      } finally {
        setIsUploading(false);
      }
    },
    draggable: true,
    dragMainText: t('点击或拖拽发票文件到此区域'),
    dragSubText: t('支持 PDF、PNG、JPG、WEBP，最大 20MB'),
    style: { width: '100%' },
  });

  return (
    <>
      <CardPro
        type='type2'
        statsArea={statsArea}
        searchArea={searchArea}
        paginationArea={createCardProPagination({
          currentPage: page,
          pageSize,
          total,
          onPageChange: setPage,
          isMobile,
          t,
        })}
        t={t}
      >
        <CardTable
          columns={columns}
          dataSource={invoices}
          rowKey='id'
          loading={loading}
          scroll={{ x: 1240 }}
          empty={
            <Empty
              image={<IllustrationNoResult />}
              darkModeImage={<IllustrationNoResultDark />}
              description={t('暂无发票记录')}
            />
          }
          hidePagination
        />
      </CardPro>

      {/* 开具发票 Modal */}
      <Modal
        title={t('开具发票')}
        visible={issueModal.visible}
        onCancel={() => { setIssueModal({ visible: false, record: null }); setUploadedUrl(''); }}
        onOk={handleIssueSubmit}
        okText={t('确认开具')}
        cancelText={t('取消')}
        confirmLoading={issueSubmitting}
        width={560}
      >
        {issueModal.record && (
          <div style={{
            marginBottom: 16,
            padding: '10px 12px',
            background: 'var(--semi-color-info-light-default)',
            borderRadius: 6,
            fontSize: 13,
          }}>
            {t('发票抬头')}：{issueModal.record.title}　{t('金额')}：¥{Number(issueModal.record.amount).toFixed(2)}
          </div>
        )}
        <Form getFormApi={(api) => (issueFormApi.current = api)} layout='vertical'>
          <div style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>{t('上传发票文件')}</div>
            <Upload {...buildUploadProps(issueFormApi, setUploadedUrl, setUploading)}>
              <Button icon={<IconUpload />} loading={uploading} disabled={uploading}>
                {uploading ? t('上传中...') : t('选择文件')}
              </Button>
            </Upload>
            {uploadedUrl && (
              <div style={{
                marginTop: 8, padding: '6px 10px',
                background: 'var(--semi-color-success-light-default)',
                borderRadius: 4, fontSize: 12,
                color: 'var(--semi-color-success)', wordBreak: 'break-all',
              }}>
                ✓ {uploadedUrl}
              </div>
            )}
          </div>
          <Divider style={{ margin: '12px 0', fontSize: 12, color: 'var(--semi-color-text-2)' }}>
            {t('或手动填写链接')}
          </Divider>
          <Form.Input
            field='file_url'
            label={t('发票文件链接')}
            placeholder={t('上传后自动填入，也可直接粘贴链接')}
            rules={[{ required: true, message: t('请上传文件或填写链接') }]}
          />
          <Form.TextArea
            field='remark'
            label={t('备注（选填）')}
            placeholder={t('可填写发票号等附加信息')}
            rows={2}
          />
        </Form>
      </Modal>

      {/* 编辑发票 Modal */}
      <Modal
        title={t('编辑发票信息')}
        visible={editModal.visible}
        onCancel={() => { setEditModal({ visible: false, record: null }); setEditUploadedUrl(''); }}
        onOk={handleEditSubmit}
        okText={t('保存')}
        cancelText={t('取消')}
        confirmLoading={editSubmitting}
        width={580}
      >
        {editModal.record && (
          <Form
            getFormApi={(api) => (editFormApi.current = api)}
            layout='vertical'
            initValues={{
              title: editModal.record.title,
              tax_id: editModal.record.tax_id || '',
              email: editModal.record.email,
              file_url: editModal.record.file_url || '',
              remark: editModal.record.remark || '',
              status: editModal.record.status,
            }}
          >
            <Form.Input
              field='title'
              label={t('发票抬头')}
              rules={[{ required: true, message: t('请填写发票抬头') }]}
            />
            <Form.Input
              field='tax_id'
              label={t('税号（选填）')}
              placeholder={t('企业纳税人识别号')}
            />
            <Form.Input
              field='email'
              label={t('接收邮箱')}
              rules={[
                { required: true, message: t('请填写邮箱') },
                { type: 'email', message: t('请输入有效邮箱') },
              ]}
            />
            <Form.Select field='status' label={t('状态')}>
              <Option value='pending'>{t('审核中')}</Option>
              <Option value='issued'>{t('已开具')}</Option>
              <Option value='sent'>{t('已发送')}</Option>
              <Option value='rejected'>{t('已拒绝')}</Option>
            </Form.Select>
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>{t('更换发票文件（选填）')}</div>
              <Upload {...buildUploadProps(editFormApi, setEditUploadedUrl, setEditUploading)}>
                <Button icon={<IconUpload />} loading={editUploading} disabled={editUploading}>
                  {editUploading ? t('上传中...') : t('选择文件')}
                </Button>
              </Upload>
              {editUploadedUrl && (
                <div style={{
                  marginTop: 8, padding: '6px 10px',
                  background: 'var(--semi-color-success-light-default)',
                  borderRadius: 4, fontSize: 12,
                  color: 'var(--semi-color-success)', wordBreak: 'break-all',
                }}>
                  ✓ {editUploadedUrl}
                </div>
              )}
            </div>
            <Form.Input
              field='file_url'
              label={t('发票文件链接')}
              placeholder={t('上传后自动填入，也可直接粘贴链接')}
            />
            <Form.TextArea
              field='remark'
              label={t('备注（选填）')}
              placeholder={t('可填写发票号、修改原因等')}
              rows={2}
            />
          </Form>
        )}
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

      {/* 关联充值订单 SideSheet */}
      <SideSheet
        title={
          detailSheet.record ? (
            <div style={{ lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{t('关联充值订单')}</div>
              <div style={{ fontSize: 13, color: 'var(--semi-color-text-1)', marginTop: 2 }}>
                <span style={{ marginRight: 16 }}>
                  {t('抬头')}：<strong>{detailSheet.record.title}</strong>
                </span>
                <span style={{ marginRight: 16 }}>
                  {t('金额')}：<strong>¥{Number(detailSheet.record.amount).toFixed(2)}</strong>
                </span>
                <span>{t('用户')}：{detailSheet.record.username || detailSheet.record.user_id}</span>
              </div>
            </div>
          ) : t('关联充值订单')
        }
        visible={detailSheet.visible}
        onCancel={() => setDetailSheet((prev) => ({ ...prev, visible: false }))}
        placement='right'
        width={isMobile ? '100%' : 680}
        style={{ display: 'flex', flexDirection: 'column' }}
        bodyStyle={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: 0 }}
        footer={
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', borderTop: '1px solid var(--semi-color-border)',
          }}>
            {topupTotal > TOPUP_PAGE_SIZE ? (
              <Pagination
                currentPage={detailSheet.topupPage}
                pageSize={TOPUP_PAGE_SIZE}
                total={topupTotal}
                onChange={(p) => setDetailSheet((prev) => ({ ...prev, topupPage: p }))}
                size='small'
                showTotal
              />
            ) : (
              <Text type='tertiary' size='small'>{t('共 {{n}} 条', { n: topupTotal })}</Text>
            )}
            <Button onClick={() => setDetailSheet((prev) => ({ ...prev, visible: false }))}>
              {t('关闭')}
            </Button>
          </div>
        }
      >
        <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          <Spin spinning={detailSheet.loading}>
            <CardTable
              columns={topupColumns}
              dataSource={topupPageData}
              rowKey='id'
              hidePagination
              size='small'
              empty={
                <Empty
                  image={<IllustrationNoResult />}
                  darkModeImage={<IllustrationNoResultDark />}
                  description={t('暂无关联订单')}
                />
              }
            />
          </Spin>
        </div>
      </SideSheet>

      {/* 发票预览 Modal */}
      <Modal
        title={t('发票预览')}
        visible={previewModal.visible}
        onCancel={() => setPreviewModal({ visible: false, url: '', isPdf: false })}
        footer={
          <Button
            icon={<IconDownload />}
            onClick={() => window.open(previewModal.url, '_blank')}
          >
            {t('下载发票')}
          </Button>
        }
        width={isMobile ? '95vw' : 760}
        style={{ maxWidth: '95vw' }}
      >
        <div style={{ textAlign: 'center' }}>
          {previewModal.isPdf ? (
            <iframe
              src={previewModal.url}
              title='invoice-pdf'
              style={{ width: '100%', height: '70vh', border: 'none' }}
            />
          ) : (
            <img
              src={previewModal.url}
              alt='invoice'
              style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
            />
          )}
        </div>
      </Modal>
    </>
  );
};

export default AdminInvoiceManager;
