import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Tag,
  Button,
  Typography,
  Toast,
  Space,
  Tooltip,
  Popover,
  Empty,
  Modal,
  Spin,
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { IconDownload, IconList, IconEyeOpened } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { API, timestamp2string } from '../../helpers';
import InvoiceRequestModal from './InvoiceRequestModal';

const { Text } = Typography;

const STATUS_CONFIG = {
  pending: { type: 'warning', label: '审核中' },
  issued: { type: 'success', label: '已开具' },
  sent: { type: 'success', label: '已发送' },
  rejected: { type: 'danger', label: '已拒绝' },
};

const PAYMENT_METHOD_MAP = {
  stripe: 'Stripe',
  epay: '易支付',
  creem: 'Creem',
  waffo: 'Waffo',
  manual: '管理员充值',
};

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i;

const InvoiceList = () => {
  const { t } = useTranslation();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const pageSize = 10;

  // 关联订单详情弹窗
  const [detailModal, setDetailModal] = useState({
    visible: false,
    invoice: null,
    topups: [],
    loading: false,
  });

  // 发票图片预览弹窗
  const [previewModal, setPreviewModal] = useState({ visible: false, url: '' });

  const fetchInvoices = useCallback(
    async (p = 1) => {
      setLoading(true);
      try {
        const res = await API.get('/api/user/invoice', {
          params: { page: p, page_size: pageSize },
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
    },
    [t],
  );

  useEffect(() => {
    fetchInvoices(page);
  }, [page, fetchInvoices]);

  const handleDownload = (fileUrl) => {
    window.open(fileUrl, '_blank');
  };

  const handlePreview = (fileUrl) => {
    if (IMAGE_EXTENSIONS.test(fileUrl)) {
      setPreviewModal({ visible: true, url: fileUrl });
    } else {
      window.open(fileUrl, '_blank');
    }
  };

  const openDetail = async (invoice) => {
    setDetailModal({ visible: true, invoice, topups: [], loading: true });
    try {
      const res = await API.get(`/api/user/invoice/${invoice.id}/topups`);
      if (res.data.success === true) {
        setDetailModal((prev) => ({
          ...prev,
          topups: res.data.data || [],
          loading: false,
        }));
      } else {
        Toast.error(t('获取关联订单失败'));
        setDetailModal((prev) => ({ ...prev, loading: false }));
      }
    } catch {
      Toast.error(t('获取关联订单失败'));
      setDetailModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const topupColumns = [
    {
      title: t('充值时间'),
      dataIndex: 'complete_time',
      key: 'complete_time',
      render: (v) => timestamp2string(v),
    },
    {
      title: t('支付方式'),
      dataIndex: 'payment_method',
      key: 'payment_method',
      render: (v) => PAYMENT_METHOD_MAP[v] || v || '—',
    },
    {
      title: t('金额（元）'),
      dataIndex: 'money',
      key: 'money',
      render: (v) => <Text strong>¥{Number(v).toFixed(2)}</Text>,
    },
    {
      title: t('订单号'),
      dataIndex: 'trade_no',
      key: 'trade_no',
      render: (v) => (
        <Text ellipsis={{ showTooltip: true }} style={{ maxWidth: 200 }} copyable>
          {v || '—'}
        </Text>
      ),
    },
  ];

  const columns = [
    {
      title: t('申请时间'),
      dataIndex: 'create_time',
      key: 'create_time',
      render: (v) => timestamp2string(v),
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
      title: t('状态'),
      dataIndex: 'status',
      key: 'status',
      render: (status, record) => {
        const cfg = STATUS_CONFIG[status] || { type: 'default', label: status };
        const tag = <Tag color={cfg.type}>{t(cfg.label)}</Tag>;
        if (status === 'rejected' && record.remark) {
          return (
            <Popover content={record.remark} position='top'>
              {tag}
            </Popover>
          );
        }
        return tag;
      },
    },
    {
      title: t('接收邮箱'),
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: t('操作'),
      key: 'action',
      render: (_, record) => (
        <Space>
          <Tooltip content={t('关联订单')}>
            <Button
              icon={<IconList />}
              size='small'
              onClick={() => openDetail(record)}
            />
          </Tooltip>
          {(record.status === 'issued' || record.status === 'sent') &&
            record.file_url && (
              <>
                <Tooltip content={t('预览发票')}>
                  <Button
                    icon={<IconEyeOpened />}
                    size='small'
                    onClick={() => handlePreview(record.file_url)}
                  />
                </Tooltip>
                <Tooltip content={t('下载发票')}>
                  <Button
                    icon={<IconDownload />}
                    size='small'
                    onClick={() => handleDownload(record.file_url)}
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <Text strong style={{ fontSize: 16 }}>
          {t('我的发票')}
        </Text>
        <Button type='primary' onClick={() => setShowModal(true)}>
          {t('申请开票')}
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={invoices}
        rowKey='id'
        loading={loading}
        empty={
          <Empty
            image={<IllustrationNoResult />}
            darkModeImage={<IllustrationNoResultDark />}
            description={t('暂无发票记录')}
          />
        }
        pagination={{
          currentPage: page,
          total,
          pageSize,
          onChange: setPage,
          showTotal: true,
        }}
      />

      <InvoiceRequestModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => fetchInvoices(1)}
      />

      {/* 关联订单详情弹窗 */}
      <Modal
        title={t('关联充值订单')}
        visible={detailModal.visible}
        onCancel={() => setDetailModal((prev) => ({ ...prev, visible: false }))}
        footer={null}
        width={680}
        style={{ maxWidth: '95vw' }}
      >
        {detailModal.invoice && (
          <div style={{ marginBottom: 12 }}>
            <Space>
              <Text type='tertiary'>{t('发票抬头')}：</Text>
              <Text strong>{detailModal.invoice.title}</Text>
              <Text type='tertiary' style={{ marginLeft: 16 }}>
                {t('发票金额')}：
              </Text>
              <Text strong>¥{Number(detailModal.invoice.amount).toFixed(2)}</Text>
            </Space>
          </div>
        )}
        <Spin spinning={detailModal.loading}>
          <Table
            columns={topupColumns}
            dataSource={detailModal.topups}
            rowKey='id'
            pagination={false}
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
      </Modal>

      {/* 发票图片预览弹窗 */}
      <Modal
        title={t('发票预览')}
        visible={previewModal.visible}
        onCancel={() => setPreviewModal({ visible: false, url: '' })}
        footer={
          <Button
            icon={<IconDownload />}
            onClick={() => handleDownload(previewModal.url)}
          >
            {t('下载发票')}
          </Button>
        }
        width={700}
        style={{ maxWidth: '95vw' }}
      >
        <div style={{ textAlign: 'center' }}>
          <img
            src={previewModal.url}
            alt='invoice'
            style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
          />
        </div>
      </Modal>
    </div>
  );
};

export default InvoiceList;
