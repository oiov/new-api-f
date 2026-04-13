import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  DatePicker,
  Empty,
  Input,
  Modal,
  Pagination,
  Select,
  Space,
  Table,
  Tag,
  TextArea,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IconInfoCircle,
  IconRefresh,
  IconSearch,
} from '@douyinfe/semi-icons';
import ManualDeliveryModal from './modals/ManualDeliveryModal';
import { API, showError, showSuccess } from '../../../helpers';
import { useIsMobile } from '../../../hooks/common/useIsMobile';
import { DATE_RANGE_PRESETS } from '../../../constants/console.constants';

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

function getRefundStatusMeta(record, t) {
  const refunded = Boolean(record?.order?.refund_to_quota);
  const amount = Number(record?.order?.refund_quota_amount || 0);
  if (!refunded) {
    return { color: 'grey', text: t('未补回'), amount: 0 };
  }
  return { color: 'green', text: t('已补回'), amount };
}

const ManualDeliveryOrdersPanel = ({ t }) => {
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [refundFilter, setRefundFilter] = useState('all');
  const [timeField, setTimeField] = useState('complete_time');
  const [dateRange, setDateRange] = useState([]);
  const [editingRecord, setEditingRecord] = useState(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectRecord, setRejectRecord] = useState(null);
  const [rejectRemark, setRejectRemark] = useState('');
  const [rejectRefundToQuota, setRejectRefundToQuota] = useState(false);

  const summary = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        const status = item?.order?.fulfillment_status;
        if (status === 'pending_delivery') acc.pending += 1;
        if (status === 'delivered') acc.delivered += 1;
        if (status === 'rejected') acc.rejected += 1;
        if (item?.order?.refund_to_quota) acc.refunded += 1;
        return acc;
      },
      { pending: 0, delivered: 0, rejected: 0, refunded: 0 },
    );
  }, [items]);

  const loadData = async (nextPage = page, nextSize = pageSize) => {
    setLoading(true);
    try {
      const [startTime, endTime] =
        Array.isArray(dateRange) && dateRange.length === 2 ? dateRange : [];
      const params = new URLSearchParams({
        p: String(nextPage),
        page_size: String(nextSize),
        keyword: keyword.trim(),
        fulfillment_status: statusFilter === 'all' ? '' : statusFilter,
        refund_status: refundFilter === 'all' ? '' : refundFilter,
        time_field: timeField,
        start_timestamp: startTime ? String(Date.parse(startTime) / 1000) : '',
        end_timestamp: endTime ? String(Date.parse(endTime) / 1000) : '',
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
  }, [statusFilter, refundFilter, timeField, dateRange]);

  const handleReject = (record) => {
    setRejectRecord(record);
    setRejectRemark(record?.order?.delivery_admin_remark || '');
    setRejectRefundToQuota(Boolean(record?.order?.refund_to_quota));
  };

  const handleRejectSubmit = async () => {
    if (!rejectRecord?.order?.id) return;
    setRejecting(true);
    try {
      const res = await API.post(
        `/api/subscription/admin/manual_orders/${rejectRecord.order.id}/reject`,
        {
          admin_remark: String(rejectRemark || '').trim(),
          refund_to_quota: rejectRefundToQuota,
        },
      );
      if (res.data?.success) {
        showSuccess(t('已拒绝'));
        setRejectRecord(null);
        setRejectRemark('');
        setRejectRefundToQuota(false);
        await loadData();
      } else {
        showError(res.data?.message || t('操作失败'));
      }
    } catch {
      showError(t('请求失败'));
    } finally {
      setRejecting(false);
    }
  };

  const closeRejectModal = () => {
    if (rejecting) return;
    setRejectRecord(null);
    setRejectRemark('');
    setRejectRefundToQuota(false);
  };

  const renderExpandedRow = (record) => {
    const refundMeta = getRefundStatusMeta(record, t);

    return (
      <div className='grid gap-2 p-1 lg:grid-cols-3'>
        <div className='rounded-lg border border-semi-color-border bg-semi-color-fill-0 p-3'>
          <div className='mb-2 text-[12px] font-medium text-semi-color-text-2'>
            {t('订单信息')}
          </div>
          <div className='space-y-1 text-xs text-semi-color-text-2'>
            <div>
              {t('订单号')} #{record?.order?.id || '--'}
            </div>
            <div className='break-all'>{record?.order?.trade_no || '--'}</div>
            <div>
              {t('关联订阅')} #{record?.user_subscription_id || '--'}
            </div>
            <div>
              {t('支付方式')}{' '}
              {record?.refund_order?.payment_method ||
                record?.order?.payment_method ||
                '--'}
            </div>
          </div>
        </div>

        <div className='rounded-lg border border-semi-color-border bg-semi-color-fill-0 p-3'>
          <div className='mb-2 text-[12px] font-medium text-semi-color-text-2'>
            {t('金额与补回')}
          </div>
          <div className='space-y-1 text-xs text-semi-color-text-2'>
            <div>
              {t('支付金额')} {record?.refund_order?.money || record?.order?.money || 0}
            </div>
            <div>
              {t('补额度')}：{refundMeta.text}
            </div>
            {refundMeta.amount > 0 ? (
              <div>
                {t('补回数量')} {refundMeta.amount}
              </div>
            ) : null}
            <div>
              {t('处理时间')}：{formatDateTime(record?.order?.delivered_at)}
            </div>
          </div>
        </div>

        <div className='rounded-lg border border-semi-color-border bg-semi-color-fill-0 p-3'>
          <div className='mb-2 text-[12px] font-medium text-semi-color-text-2'>
            {t('处理备注')}
          </div>
          <div className='text-xs text-semi-color-text-2 whitespace-pre-wrap break-words'>
            {record?.order?.delivery_admin_remark || '--'}
          </div>
        </div>
      </div>
    );
  };

  const columns = useMemo(
    () => [
      {
        title: t('订单'),
        dataIndex: 'order',
        width: 160,
        render: (order) => (
          <div className='min-w-0'>
            <Text strong>#{order?.id || '--'}</Text>
            <div className='mt-0.5 text-xs text-semi-color-text-2 break-all'>
              {order?.trade_no || '--'}
            </div>
          </div>
        ),
      },
      {
        title: t('用户'),
        width: 140,
        render: (_, record) => (
          <div className='min-w-0'>
            <Text strong>{record?.username || '--'}</Text>
            <div className='mt-0.5 text-xs text-semi-color-text-2 truncate'>
              {record?.user_group || '--'}
            </div>
          </div>
        ),
      },
      {
        title: t('套餐'),
        width: 180,
        render: (_, record) => (
          <div className='min-w-0'>
            <Text strong>{record?.order?.plan_title || record?.plan?.title || '--'}</Text>
            <div className='mt-0.5 text-xs text-semi-color-text-2 truncate'>
              #{record?.user_subscription_id || '--'}
            </div>
          </div>
        ),
      },
      {
        title: t('状态'),
        width: 104,
        render: (_, record) => (
          <div className='space-y-1'>
            <Tag
              color={getFulfillmentStatusMeta(record?.order?.fulfillment_status, t).color}
              shape='circle'
              size='small'
            >
              {getFulfillmentStatusMeta(record?.order?.fulfillment_status, t).text}
            </Tag>
            <Tag
              color={getRefundStatusMeta(record, t).color}
              shape='circle'
              size='small'
            >
              {getRefundStatusMeta(record, t).text}
            </Tag>
          </div>
        ),
      },
      {
        title: t('时间'),
        width: 156,
        render: (_, record) => (
          <div className='text-xs text-semi-color-text-2'>
            <div>{formatDateTime(record?.order?.complete_time)}</div>
            <div className='mt-0.5'>{formatDateTime(record?.order?.delivered_at)}</div>
          </div>
        ),
      },
      {
        title: t('操作'),
        width: 132,
        render: (_, record) => {
          const delivered = record?.order?.fulfillment_status === 'delivered';
          const rejected = record?.order?.fulfillment_status === 'rejected';
          return (
            <Space spacing={4} wrap>
              <Button
                size='small'
                type='primary'
                theme='solid'
                style={{ paddingLeft: 10, paddingRight: 10 }}
                onClick={() => setEditingRecord(record)}
              >
                {delivered
                  ? t('查看发放')
                  : rejected
                    ? t('重新发放')
                    : t('去发放')}
              </Button>
              <Button
                size='small'
                type='danger'
                theme='outline'
                style={{ paddingLeft: 10, paddingRight: 10 }}
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
      <Modal
        title={t('确认拒绝该发放申请？')}
        visible={!!rejectRecord}
        onCancel={closeRejectModal}
        onOk={handleRejectSubmit}
        confirmLoading={rejecting}
        okText={t('确认拒绝')}
        cancelText={t('取消')}
        okButtonProps={{ type: 'danger' }}
      >
        <div className='space-y-3'>
          <div>{t('拒绝后订单会保留为已拒绝状态，用户不会收到交付信息。')}</div>
          <TextArea
            value={rejectRemark}
            onChange={setRejectRemark}
            autosize={{ minRows: 3, maxRows: 5 }}
            placeholder={t('请填写拒绝原因，用户可见')}
          />
          <Checkbox
            checked={rejectRefundToQuota}
            disabled={
              Boolean(rejectRecord?.order?.refund_to_quota) &&
              Number(rejectRecord?.order?.refund_quota_amount || 0) > 0
            }
            onChange={(event) => {
              setRejectRefundToQuota(Boolean(event?.target?.checked));
            }}
          >
            {t('将付款返还到用户账户钱包余额')}
          </Checkbox>
          {Boolean(rejectRecord?.order?.refund_to_quota) &&
          Number(rejectRecord?.order?.refund_quota_amount || 0) > 0 ? (
            <Text type='tertiary' size='small'>
              {t('该订单已返还 {{amount}} 额度到用户账户钱包余额，重复拒绝不会再次返还。', {
                amount: Number(rejectRecord?.order?.refund_quota_amount || 0),
              })}
            </Text>
          ) : null}
        </div>
      </Modal>

      <div className='space-y-2'>
        <div className='flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2'>
          <div className='flex min-w-0 items-center gap-2 text-sm text-semi-color-text-1'>
            <IconInfoCircle style={{ color: 'var(--semi-color-info)' }} />
            <span className='truncate'>
              {t('支付成功后不会自动开通，需要管理员补充交付信息后再发放。')}
            </span>
          </div>
          <div className='flex flex-wrap items-center gap-1'>
            <Tag size='small' color='orange' shape='circle'>
              {t('待发放')} {summary.pending}
            </Tag>
            <Tag size='small' color='green' shape='circle'>
              {t('已发放')} {summary.delivered}
            </Tag>
            <Tag size='small' color='red' shape='circle'>
              {t('已拒绝')} {summary.rejected}
            </Tag>
          </div>
        </div>

        <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-2.5'>
          <div className='flex flex-col gap-2 xl:flex-row xl:items-center'>
            <Input
              value={keyword}
              onChange={setKeyword}
              showClear
              prefix={<IconSearch />}
              placeholder={t('搜索订单号 / 用户名 / 套餐名')}
              className='min-w-0 xl:max-w-[280px]'
              size='small'
              onEnterPress={() => loadData(1, pageSize)}
            />
            <div className='grid min-w-0 flex-1 grid-cols-2 gap-2 md:grid-cols-4'>
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                size='small'
                optionList={[
                  { value: 'all', label: t('全部状态') },
                  { value: 'pending_delivery', label: t('待发放') },
                  { value: 'delivered', label: t('已发放') },
                  { value: 'rejected', label: t('已拒绝') },
                ]}
              />
              <Select
                value={refundFilter}
                onChange={setRefundFilter}
                size='small'
                optionList={[
                  { value: 'all', label: t('全部补回') },
                  { value: 'refunded', label: t('已补回') },
                  { value: 'not_refunded', label: t('未补回') },
                ]}
              />
              <Select
                value={timeField}
                onChange={setTimeField}
                size='small'
                optionList={[
                  { value: 'complete_time', label: t('支付时间') },
                  { value: 'delivered_at', label: t('处理时间') },
                  { value: 'created_at', label: t('创建时间') },
                ]}
              />
              <DatePicker
                type='dateTimeRange'
                value={dateRange}
                onChange={setDateRange}
                size='small'
                placeholder={[t('开始时间'), t('结束时间')]}
                presets={DATE_RANGE_PRESETS.map((preset) => ({
                  text: t(preset.text),
                  start: preset.start(),
                  end: preset.end(),
                }))}
              />
            </div>
            <Space spacing={4}>
              <Button
                theme='solid'
                type='primary'
                size='small'
                onClick={() => loadData(1, pageSize)}
              >
                {t('搜索')}
              </Button>
              <Button
                theme='outline'
                type='tertiary'
                size='small'
                icon={<IconRefresh />}
                onClick={() => {
                  const shouldSearchImmediately =
                    statusFilter === 'all' &&
                    refundFilter === 'all' &&
                    timeField === 'complete_time' &&
                    (!Array.isArray(dateRange) || dateRange.length === 0);
                  setKeyword('');
                  setStatusFilter('all');
                  setRefundFilter('all');
                  setTimeField('complete_time');
                  setDateRange([]);
                  if (shouldSearchImmediately) {
                    loadData(1, pageSize);
                  }
                }}
              />
            </Space>
          </div>
        </div>

        <div className='rounded-xl border border-semi-color-border bg-white p-1 dark:bg-semi-color-bg-0'>
          {isMobile ? (
            loading ? (
              <div className='p-4 text-center text-sm text-semi-color-text-2'>
                {t('加载中...')}
              </div>
            ) : items.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                title={t('暂无人工发放订单')}
              />
            ) : (
              <div className='space-y-3 p-2'>
                {items.map((record) => {
                  const delivered =
                    record?.order?.fulfillment_status === 'delivered';
                  const rejected =
                    record?.order?.fulfillment_status === 'rejected';
                  const meta = getFulfillmentStatusMeta(record?.order?.fulfillment_status, t);
                  const refundMeta = getRefundStatusMeta(record, t);
                  return (
                    <div
                      key={String(
                        record?.order?.id || record?.order?.trade_no || '',
                      )}
                      className='rounded-xl border border-semi-color-border bg-white p-3 shadow-sm'
                    >
                      <div className='mb-2 flex items-start justify-between gap-3'>
                        <div className='min-w-0'>
                          <Text strong>{record?.order?.plan_title || '--'}</Text>
                          <div className='text-xs text-semi-color-text-2'>
                            #{record?.order?.id || '--'} ·{' '}
                            {record?.order?.trade_no || '--'}
                          </div>
                          <div className='text-xs text-semi-color-text-2'>
                            {record?.username || '--'} / {record?.user_group || '--'}
                          </div>
                        </div>
                        <div className='flex flex-col gap-1'>
                          <Tag color={meta.color} shape='circle' size='small'>
                            {meta.text}
                          </Tag>
                          <Tag color={refundMeta.color} shape='circle' size='small'>
                            {refundMeta.text}
                          </Tag>
                        </div>
                      </div>
                      <div className='space-y-1 text-sm text-semi-color-text-2'>
                        <div>
                          {t('支付')} {record?.refund_order?.money || record?.order?.money || 0}{' '}
                          ·{' '}
                          {record?.refund_order?.payment_method ||
                            record?.order?.payment_method ||
                            '--'}
                        </div>
                        <div>
                          {t('处理')}：{formatDateTime(record?.order?.delivered_at)}
                        </div>
                        <div>
                          {t('备注')}：{record?.order?.delivery_admin_remark || '--'}
                        </div>
                      </div>
                      <div className='mt-3 flex gap-2'>
                        <Button
                          size='small'
                          type='primary'
                          theme='solid'
                          onClick={() => setEditingRecord(record)}
                        >
                          {delivered
                            ? t('查看发放')
                            : rejected
                              ? t('重新发放')
                              : t('去发放')}
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
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <Table
              rowKey={(record) =>
                String(record?.order?.id || record?.order?.trade_no || '')
              }
              dataSource={items}
              columns={columns}
              loading={loading}
              pagination={false}
              size='small'
              expandRowByClick
              expandedRowRender={renderExpandedRow}
              style={{ width: '100%' }}
              scroll={isMobile ? { x: 'max-content' } : undefined}
              rowClassName={() => 'manual-delivery-order-row'}
              empty={
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  title={t('暂无人工发放订单')}
                />
              }
            />
          )}
        </div>

        <div className='flex justify-end pt-1'>
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
