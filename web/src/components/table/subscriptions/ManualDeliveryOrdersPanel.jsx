import React, { useEffect, useMemo, useState } from 'react';
import {
  Banner,
  Button,
  Empty,
  Input,
  Modal,
  Pagination,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import ManualDeliveryModal from './modals/ManualDeliveryModal';
import { API, showError, showSuccess } from '../../../helpers';

const { Text } = Typography;

function formatDateTime(timestamp) {
  if (!timestamp) return '--';
  return new Date(timestamp * 1000).toLocaleString();
}

function getFulfillmentStatusMeta(status, t) {
  switch (status) {
    case 'pending_delivery':
      return { color: 'orange', text: t('待发放') };
    case 'delivered':
      return { color: 'green', text: t('已发放') };
    case 'rejected':
      return { color: 'red', text: t('已拒绝') };
    default:
      return { color: 'grey', text: status || '--' };
  }
}

const ManualDeliveryOrdersPanel = ({ t }) => {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editingRecord, setEditingRecord] = useState(null);

  const loadData = async (nextPage = page, nextSize = pageSize) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        p: String(nextPage),
        page_size: String(nextSize),
        keyword: keyword.trim(),
        fulfillment_status: statusFilter === 'all' ? '' : statusFilter,
      });
      const res = await API.get(
        `/api/subscription/admin/manual_orders?${params.toString()}`,
      );
      if (res.data?.success) {
        const data = res.data.data || {};
        setItems(data.items || []);
        setPage(data.page || nextPage);
        setPageSize(data.page_size || nextSize);
        setTotal(data.total || 0);
      } else {
        showError(res.data?.message || t('加载失败'));
      }
    } catch {
      showError(t('请求失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(1, pageSize);
  }, []);

  const handleReject = (record) => {
    let nextRemark = record?.order?.delivery_admin_remark || '';
    Modal.confirm({
      title: t('确认拒绝该发放申请？'),
      content: (
        <div className='space-y-3'>
          <div>{t('拒绝后订单会保留为已拒绝状态，用户不会收到交付信息。')}</div>
          <Input.TextArea
            defaultValue={nextRemark}
            onChange={(value) => {
              nextRemark = value;
            }}
            autosize={{ minRows: 3, maxRows: 5 }}
            placeholder={t('请填写拒绝原因，用户可见')}
          />
        </div>
      ),
      okText: t('确认拒绝'),
      cancelText: t('取消'),
      okButtonProps: { type: 'danger' },
      onOk: async () => {
        try {
          const res = await API.post(
            `/api/subscription/admin/manual_orders/${record?.order?.id}/reject`,
            { admin_remark: String(nextRemark || '').trim() },
          );
          if (res.data?.success) {
            showSuccess(t('已拒绝'));
            await loadData();
          } else {
            showError(res.data?.message || t('操作失败'));
          }
        } catch {
          showError(t('请求失败'));
        }
      },
    });
  };

  const columns = useMemo(
    () => [
      {
        title: t('订单'),
        dataIndex: 'order',
        render: (order) => (
          <div className='space-y-1'>
            <Text strong>#{order?.id || '--'}</Text>
            <div className='text-xs text-semi-color-text-2'>{order?.trade_no || '--'}</div>
          </div>
        ),
      },
      {
        title: t('用户'),
        render: (_, record) => (
          <div className='space-y-1'>
            <Text strong>{record?.username || '--'}</Text>
            <div className='text-xs text-semi-color-text-2'>
              {record?.user_group || '--'}
            </div>
          </div>
        ),
      },
      {
        title: t('套餐'),
        render: (_, record) => (
          <div className='space-y-1'>
            <Text strong>{record?.order?.plan_title || record?.plan?.title || '--'}</Text>
            <div className='text-xs text-semi-color-text-2'>
              {record?.plan?.subtitle || '--'}
            </div>
          </div>
        ),
      },
      {
        title: t('支付'),
        render: (_, record) => (
          <div className='space-y-1'>
            <Text>
              {record?.refund_order?.money || record?.order?.money || 0}
            </Text>
            <div className='text-xs text-semi-color-text-2'>
              {record?.refund_order?.payment_method || record?.order?.payment_method || '--'}
            </div>
          </div>
        ),
      },
      {
        title: t('状态'),
        render: (_, record) => {
          const meta = getFulfillmentStatusMeta(
            record?.order?.fulfillment_status,
            t,
          );
          return (
            <Tag color={meta.color} shape='circle' size='small'>
              {meta.text}
            </Tag>
          );
        },
      },
      {
        title: t('时间'),
        render: (_, record) => (
          <div className='space-y-1 text-xs text-semi-color-text-2'>
            <div>
              {t('支付')}：{formatDateTime(record?.order?.complete_time)}
            </div>
            <div>
              {t('处理')}：{formatDateTime(record?.order?.delivered_at)}
            </div>
          </div>
        ),
      },
      {
        title: t('操作'),
        render: (_, record) => {
          const delivered = record?.order?.fulfillment_status === 'delivered';
          const rejected = record?.order?.fulfillment_status === 'rejected';
          return (
            <Space>
              <Button
                size='small'
                type='primary'
                theme='solid'
                disabled={delivered}
                onClick={() => setEditingRecord(record)}
              >
                {delivered ? t('已发放') : rejected ? t('重新发放') : t('去发放')}
              </Button>
              <Button
                size='small'
                type='danger'
                theme='outline'
                disabled={delivered}
                onClick={() => handleReject(record)}
              >
                {rejected ? t('更新拒绝') : t('拒绝')}
              </Button>
            </Space>
          );
        },
      },
    ],
    [t],
  );

  return (
    <>
      <ManualDeliveryModal
        visible={!!editingRecord}
        onCancel={() => setEditingRecord(null)}
        record={editingRecord}
        t={t}
        onSuccess={async () => {
          setEditingRecord(null);
          await loadData();
        }}
      />

      <div className='space-y-3'>
        <Banner
          type='info'
          closeIcon={null}
          description={t(
            '人工发放套餐支付成功后不会自动开通，需要管理员填写交付信息后完成发放。',
          )}
        />

        <div className='flex flex-col gap-2 rounded-2xl border border-semi-color-border bg-semi-color-fill-0 p-3 lg:flex-row lg:items-center'>
          <Input
            value={keyword}
            onChange={setKeyword}
            showClear
            placeholder={t('搜索订单号 / 用户名 / 套餐名')}
            className='min-w-0 flex-1'
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 180 }}
            optionList={[
              { value: 'all', label: t('全部状态') },
              { value: 'pending_delivery', label: t('待发放') },
              { value: 'delivered', label: t('已发放') },
              { value: 'rejected', label: t('已拒绝') },
            ]}
          />
          <Button
            theme='solid'
            type='primary'
            onClick={() => loadData(1, pageSize)}
          >
            {t('搜索')}
          </Button>
        </div>

        <div className='rounded-2xl border border-semi-color-border bg-white p-1 dark:bg-semi-color-bg-0'>
          <Table
            rowKey={(record) =>
              String(record?.order?.id || record?.order?.trade_no || '')
            }
            dataSource={items}
            columns={columns}
            loading={loading}
            pagination={false}
            empty={
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                title={t('暂无人工发放订单')}
              />
            }
          />
        </div>

        <div className='flex justify-end'>
          <Pagination
            currentPage={page}
            pageSize={pageSize}
            total={total}
            pageSizeOpts={[10, 20, 50]}
            onPageChange={(nextPage) => loadData(nextPage, pageSize)}
            onPageSizeChange={(nextSize) => loadData(1, nextSize)}
          />
        </div>
      </div>
    </>
  );
};

export default ManualDeliveryOrdersPanel;
