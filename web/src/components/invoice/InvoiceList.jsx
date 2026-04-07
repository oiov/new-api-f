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
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { IconDownload, IconMail } from '@douyinfe/semi-icons';
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

const InvoiceList = () => {
  const { t } = useTranslation();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const pageSize = 10;

  const fetchInvoices = useCallback(async (p = 1) => {
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
  }, [t]);

  useEffect(() => {
    fetchInvoices(page);
  }, [page, fetchInvoices]);

  const handleDownload = (fileUrl) => {
    window.open(fileUrl, '_blank');
  };

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
          {(record.status === 'issued' || record.status === 'sent') &&
            record.file_url && (
              <Tooltip content={t('下载发票')}>
                <Button
                  icon={<IconDownload />}
                  size='small'
                  onClick={() => handleDownload(record.file_url)}
                />
              </Tooltip>
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
    </div>
  );
};

export default InvoiceList;
