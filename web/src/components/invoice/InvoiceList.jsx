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
  Table,
  Tag,
  Button,
  Typography,
  Toast,
  Space,
  Tooltip,
  Popover,
  Empty,
  Spin,
  Modal,
  SideSheet,
  Pagination,
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { IconDownload, IconList, IconEyeOpened } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { API, timestamp2string } from '../../helpers';
import { useIsMobile } from '../../hooks/common/useIsMobile';
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
  });

  // 发票预览 SideSheet
  const [previewSheet, setPreviewSheet] = useState({ visible: false, url: '', isPdf: false });

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

  const openDetail = async (invoice) => {
    setDetailSheet({ visible: true, invoice, topups: [], loading: true, topupPage: 1 });
    try {
      const res = await API.get(`/api/user/invoice/${invoice.id}/topups`);
      if (res.data.success === true) {
        setDetailSheet((prev) => ({
          ...prev,
          topups: res.data.data || [],
          loading: false,
        }));
      } else {
        Toast.error(t('获取关联订单失败'));
        setDetailSheet((prev) => ({ ...prev, loading: false }));
      }
    } catch {
      Toast.error(t('获取关联订单失败'));
      setDetailSheet((prev) => ({ ...prev, loading: false }));
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

  // 关联订单抽屉分页
  const topupTotal = detailSheet.topups.length;
  const topupPageData = detailSheet.topups.slice(
    (detailSheet.topupPage - 1) * TOPUP_PAGE_SIZE,
    detailSheet.topupPage * TOPUP_PAGE_SIZE,
  );

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
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            borderTop: '1px solid var(--semi-color-border)',
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
