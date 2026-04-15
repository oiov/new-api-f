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

import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  Table,
  Tag,
  Button,
  Typography,
  Toast,
  Space,
  Tooltip,
  Empty,
  Spin,
  Modal,
  SideSheet,
  Descriptions,
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { IconDownload, IconList, IconEyeOpened, IconMail } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { API, timestamp2string } from '../../helpers';
import { useIsMobile } from '../../hooks/common/useIsMobile';
import InvoiceRequestModal from './InvoiceRequestModal';
import { createCardProPagination } from '../../helpers/utils';
import CardTable from '../common/ui/CardTable';
import { UserContext } from '../../context/User';

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
const PDF_EXTENSION = /\.pdf(\?.*)?$/i;
const TOPUP_PAGE_SIZE = 10;

// 修复 mixed-content：HTTPS 页面强制 HTTPS 资源
function resolveUrl(url) {
  if (!url) return url;
  if (window.location.protocol === 'https:' && url.startsWith('http:')) {
    return url.replace(/^http:/, 'https:');
  }
  return url;
}

const InvoiceList = () => {
  const { t } = useTranslation();
  const [userState] = useContext(UserContext);
  const isMobile = useIsMobile();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const pageSize = 10;

  // 关联订单详情 SideSheet
  const [detailSheet, setDetailSheet] = useState({
    visible: false,
    invoice: null,
    topups: [],
    loading: false,
    topupPage: 1,
    topupPageSize: TOPUP_PAGE_SIZE,
    topupTotal: 0,
  });

  // 发票预览 SideSheet
  const [previewSheet, setPreviewSheet] = useState({ visible: false, url: '', isPdf: false });
  const [sendingInvoiceId, setSendingInvoiceId] = useState(null);

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
    window.open(resolveUrl(fileUrl), '_blank');
  };

  const handlePreview = (fileUrl) => {
    const safe = resolveUrl(fileUrl);
    const isPdf = PDF_EXTENSION.test(safe);
    if (isPdf || IMAGE_EXTENSIONS.test(safe)) {
      setPreviewSheet({ visible: true, url: safe, isPdf });
    } else {
      window.open(safe, '_blank');
    }
  };

  const boundEmail = String(userState?.user?.email || '').trim();

  const sendToBoundEmail = async (invoice) => {
    if (!invoice?.id || !boundEmail) {
      Toast.error(t('请先绑定邮箱后再发送发票'));
      return;
    }
    setSendingInvoiceId(invoice.id);
    try {
      const res = await API.post(`/api/user/invoice/${invoice.id}/send`);
      if (res.data?.success) {
        const nextStatus = res.data?.data?.invoice?.status || 'sent';
        setInvoices((prev) =>
          prev.map((item) =>
            item.id === invoice.id
              ? {
                  ...item,
                  status: nextStatus,
                  email: boundEmail,
                }
              : item,
          ),
        );
        Toast.success(
          t('发票已发送到绑定邮箱：{{email}}', {
            email: boundEmail,
          }),
        );
      } else {
        Toast.error(res.data?.message || t('发送失败'));
      }
    } catch (error) {
      Toast.error(error?.response?.data?.message || t('发送失败'));
    } finally {
      setSendingInvoiceId(null);
    }
  };

  const loadTopups = async (
    invoice,
    targetPage = 1,
    targetPageSize = detailSheet.topupPageSize,
  ) => {
    if (!invoice) return;

    setDetailSheet((prev) => ({
      ...prev,
      visible: true,
      invoice,
      loading: true,
    }));

    try {
      const res = await API.get(`/api/user/invoice/${invoice.id}/topups`, {
        params: { page: targetPage, page_size: targetPageSize },
      });
      if (res.data.success !== true) {
        throw new Error('failed');
      }

      const payload = res.data.data;
      let list = [];
      let total = 0;

      if (Array.isArray(payload)) {
        list = payload;
        total = payload.length;
      } else if (payload) {
        list = payload.items || payload.list || payload.topups || [];
        total = Number(payload.total ?? payload.count ?? list.length);
        if (!Number.isFinite(total)) {
          total = Array.isArray(list) ? list.length : 0;
        }
      }

      setDetailSheet((prev) => ({
        ...prev,
        topups: Array.isArray(list) ? list : [],
        topupTotal: total,
        topupPage: targetPage,
        topupPageSize: targetPageSize,
        loading: false,
      }));
    } catch {
      Toast.error(t('获取关联订单失败'));
      setDetailSheet((prev) => ({ ...prev, loading: false }));
    }
  };

  const openDetail = (invoice) => {
    loadTopups(invoice, 1, detailSheet.topupPageSize);
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
          return <Tooltip content={record.remark}>{tag}</Tooltip>;
        }
        return tag;
      },
    },
    {
      title: t('操作'),
      key: 'action',
      width: 170,
      render: (_, record) => (
        <Space wrap={isMobile} spacing={isMobile ? 8 : 6}>
          <Tooltip content={t('关联订单')}>
            <Button
              icon={<IconList />}
              size='small'
              onClick={() => openDetail(record)}
            >
              {isMobile ? t('详情') : null}
            </Button>
          </Tooltip>
          {(record.status === 'issued' || record.status === 'sent') && record.file_url && (
            <>
              <Tooltip content={t('预览发票')}>
                <Button
                  icon={<IconEyeOpened />}
                  size='small'
                  onClick={() => handlePreview(record.file_url)}
                >
                  {isMobile ? t('查看') : null}
                </Button>
              </Tooltip>
              <Tooltip content={t('下载发票')}>
                <Button
                  icon={<IconDownload />}
                  size='small'
                  onClick={() => handleDownload(record.file_url)}
                >
                  {isMobile ? t('下载') : null}
                </Button>
              </Tooltip>
            </>
          )}
          {record.status === 'issued' && (
            <Tooltip
              content={
                boundEmail
                  ? t('发送到已绑定邮箱')
                  : t('请先在个人设置中绑定邮箱')
              }
            >
              <Button
                icon={<IconMail />}
                size='small'
                disabled={!boundEmail}
                loading={sendingInvoiceId === record.id}
                onClick={() => sendToBoundEmail(record)}
              >
                {isMobile ? t('发送') : null}
              </Button>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  // 关联订单抽屉分页
  const topupTotal =
    detailSheet.topupTotal && detailSheet.topupTotal > 0
      ? detailSheet.topupTotal
      : detailSheet.topups.length;
  const topupPageData = detailSheet.topups;
  const detailInvoice = detailSheet.invoice;
  const invoiceStatusCfg =
    detailInvoice && (STATUS_CONFIG[detailInvoice.status] || { type: 'default', label: detailInvoice.status });
  const invoiceMeta = detailInvoice
    ? [
        { label: t('发票抬头'), value: detailInvoice.title || '—' },
        { label: t('税号'), value: detailInvoice.tax_id || '—' },
        {
          label: t('天眼查企业信息地址'),
          value: detailInvoice.company_info_url || '—',
        },
        { label: t('接收邮箱'), value: detailInvoice.email || '—' },
        {
          label: t('申请时间'),
          value: timestamp2string(detailInvoice.create_time) || '—',
        },
        {
          label: t('状态'),
          value: (
            <Tag color={invoiceStatusCfg?.type || 'default'}>
              {t(invoiceStatusCfg?.label || detailInvoice.status || '—')}
            </Tag>
          ),
        },
        {
          label: t('金额'),
          value: <Text strong>¥{Number(detailInvoice.amount || 0).toFixed(2)}</Text>,
        },
        {
          label: t('说明'),
          value:
            detailInvoice.remark ||
            detailInvoice.description ||
            <Text type='tertiary'>—</Text>,
        },
      ]
    : [];
  const topupPagination = createCardProPagination({
    currentPage: detailSheet.topupPage,
    pageSize: detailSheet.topupPageSize,
    total: topupTotal,
    onPageChange: (p) => {
      if (!detailInvoice) return;
      loadTopups(detailInvoice, p, detailSheet.topupPageSize);
    },
    onPageSizeChange: (size) => {
      if (!detailInvoice) return;
      loadTopups(detailInvoice, 1, size);
    },
    isMobile,
    t,
  });
  const listPagination = createCardProPagination({
    currentPage: page,
    pageSize,
    total,
    onPageChange: setPage,
    isMobile,
    t,
  });

  return (
    <div
      style={{
        paddingBottom: 32,
        paddingInline: isMobile ? 0 : 8,
      }}
    >
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

      <CardTable
        columns={columns}
        dataSource={invoices}
        rowKey='id'
        loading={loading}
        hidePagination
        empty={
          <Empty
            image={<IllustrationNoResult />}
            darkModeImage={<IllustrationNoResultDark />}
            description={t('暂无发票记录')}
          />
        }
      />
      {listPagination && (
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          {listPagination}
        </div>
      )}

      <InvoiceRequestModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => fetchInvoices(1)}
      />

      {/* 关联充值订单 — SideSheet 抽屉 */}
      <SideSheet
        title={
          detailSheet.invoice ? (
            <div style={{ lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{t('关联充值订单')}</div>
              <div style={{ fontSize: 13, color: 'var(--semi-color-text-1)', marginTop: 2 }}>
                <span style={{ marginRight: 16 }}>
                  {t('抬头')}：<strong>{detailSheet.invoice.title}</strong>
                </span>
                <span>
                  {t('金额')}：<strong>¥{Number(detailSheet.invoice.amount).toFixed(2)}</strong>
                </span>
              </div>
            </div>
          ) : t('关联充值订单')
        }
        visible={detailSheet.visible}
        onCancel={() => setDetailSheet((prev) => ({ ...prev, visible: false }))}
        placement='right'
        width={isMobile ? '100%' : 640}
        bodyStyle={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        footer={
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              borderTop: '1px solid var(--semi-color-border)',
            }}
          >
            <div>
              {topupPagination || (
                <Text type='tertiary' size='small'>
                  {t('共 {{n}} 条', { n: topupTotal })}
                </Text>
              )}
            </div>
            <Button onClick={() => setDetailSheet((prev) => ({ ...prev, visible: false }))}>
              {t('关闭')}
            </Button>
          </div>
        }
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {invoiceMeta.length > 0 && (
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--semi-color-border)',
                background: 'var(--semi-color-fill-0)',
              }}
            >
              <Descriptions
                data={invoiceMeta}
                column={1}
                size='small'
                rowSize='small'
                style={{ margin: 0 }}
              />
            </div>
          )}
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              padding: invoiceMeta.length > 0 ? '16px 20px' : '16px',
            }}
          >
            <Spin spinning={detailSheet.loading}>
              <Table
                columns={topupColumns}
                dataSource={topupPageData}
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
          </div>
        </div>
      </SideSheet>

      {/* 发票预览 Modal */}
      <Modal
        title={t('发票预览')}
        visible={previewSheet.visible}
        onCancel={() => setPreviewSheet({ visible: false, url: '', isPdf: false })}
        footer={
          <Button
            icon={<IconDownload />}
            onClick={() => handleDownload(previewSheet.url)}
          >
            {t('下载发票')}
          </Button>
        }
        width={isMobile ? '95vw' : 720}
        style={{ maxWidth: '95vw' }}
      >
        <div style={{ textAlign: 'center' }}>
          {previewSheet.isPdf ? (
            <iframe
              src={previewSheet.url}
              title='invoice-pdf'
              style={{ width: '100%', height: '70vh', border: 'none' }}
            />
          ) : (
            <img
              src={previewSheet.url}
              alt='invoice'
              style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
            />
          )}
        </div>
      </Modal>
    </div>
  );
};

export default InvoiceList;
