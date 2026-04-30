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

import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  TextArea,
  Typography,
} from '@douyinfe/semi-ui';
import { renderQuotaWithAmount } from '../../../helpers/render';
import { API, renderQuota, showError, showSuccess, timestamp2string } from '../../../helpers';
import { downloadTextAsFile } from '../../../helpers/utils';
import { StatusContext } from '../../../context/Status';
import {
  parseSubscriptionRefundSettings,
  REFUND_TARGET_BALANCE,
  REFUND_TARGET_ORIGINAL_PAYMENT,
} from '../../../helpers/subscriptionRefund';

const { Text } = Typography;
const CALCULATION_MODE_DURATION = 'duration_ratio';
const CALCULATION_MODE_TOKEN = 'token_usage';

const getStatusMeta = (status, t) => {
  switch (status) {
    case 'approved':
      return { color: 'green', text: t('已批准') };
    case 'rejected':
      return { color: 'red', text: t('已拒绝') };
    case 'pending':
      return { color: 'orange', text: t('待审核') };
    default:
      return { color: 'grey', text: status || '--' };
  }
};

const getRefundTargetText = (target, t) => {
  switch (target) {
    case REFUND_TARGET_ORIGINAL_PAYMENT:
      return t('原有支付方式');
    case REFUND_TARGET_BALANCE:
    default:
      return t('账户余额');
  }
};

const getPayoutStatusMeta = (status, t) => {
  switch (status) {
    case 'paid':
      return { color: 'green', text: t('已打款') };
    case 'pending':
      return { color: 'orange', text: t('待打款') };
    default:
      return { color: 'grey', text: '-' };
  }
};

const getRequestPrimaryAmount = (record) => {
  if (record?.requested_refund_target === REFUND_TARGET_ORIGINAL_PAYMENT) {
    return renderQuotaWithAmount(Number(record?.requested_amount || 0));
  }
  return renderQuota(record?.requested_quota || 0);
};

const getApprovedPrimaryAmount = (record) => {
  if (record?.approved_refund_target === REFUND_TARGET_ORIGINAL_PAYMENT) {
    return renderQuotaWithAmount(Number(record?.approved_amount || 0));
  }
  return renderQuota(record?.approved_quota || 0);
};

const renderRequestSubscriptionItems = (items, t) => {
  if (!Array.isArray(items) || items.length === 0) {
    return (
      <Text type='tertiary' size='small'>
        -
      </Text>
    );
  }

  return (
    <div className='space-y-2'>
      {items.map((item) => (
        <div
          key={item?.user_subscription_id}
          className='rounded-lg border border-semi-color-border bg-semi-color-fill-0 p-3'
        >
          <div className='flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between'>
            <div className='min-w-0'>
              <div className='font-medium'>
                {item?.plan_title || `#${item?.plan_id || '-'}`}
              </div>
              <Text type='tertiary' size='small'>
                #{item?.user_subscription_id} · {t('来源')} {item?.source || '-'}
              </Text>
              <Text type='tertiary' size='small' className='block'>
                {timestamp2string(item?.start_time)} ~ {timestamp2string(item?.end_time)}
              </Text>
            </div>
            <div className='text-left sm:text-right text-xs text-gray-600'>
              {item?.refund_order?.trade_no ? (
                <>
                  <div>
                    {t('支付单')} #{item.refund_order.order_id || '-'}
                  </div>
                  <div className='break-all'>{item.refund_order.trade_no}</div>
                  <div>
                    {t('充值单')} #{item.refund_order.topup_id || '-'}
                  </div>
                  <div>
                    {t('实付金额')} {renderQuotaWithAmount(Number(item.refund_order.money || 0))}
                  </div>
                  <div>
                    {t('支付方式')} {item.refund_order.payment_method || '-'}
                  </div>
                </>
              ) : (
                <div>{t('未匹配到支付订单')}</div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const SubscriptionConversionRequestsPanel = ({ t }) => {
  const EXPORT_PAGE_SIZE = 100;
  const [statusState] = useContext(StatusContext);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [items, setItems] = useState([]);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('pending');
  const [payoutStatus, setPayoutStatus] = useState('all');
  const [current, setCurrent] = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [approveVisible, setApproveVisible] = useState(false);
  const [rejectVisible, setRejectVisible] = useState(false);
  const [payoutVisible, setPayoutVisible] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [approvedRatio, setApprovedRatio] = useState('1');
  const [approvedQuota, setApprovedQuota] = useState('');
  const [approvedAmount, setApprovedAmount] = useState('');
  const [calculationSettlementMode, setCalculationSettlementMode] = useState(
    CALCULATION_MODE_DURATION,
  );
  const [approvedRefundTarget, setApprovedRefundTarget] = useState(
    REFUND_TARGET_BALANCE,
  );
  const [adminRemark, setAdminRemark] = useState('');
  const [rejectRemark, setRejectRemark] = useState('');
  const [payoutRemark, setPayoutRemark] = useState('');
  const refundSettings = useMemo(
    () =>
      parseSubscriptionRefundSettings(
        statusState?.status?.SubscriptionRefundSettings,
      ),
    [statusState?.status?.SubscriptionRefundSettings],
  );
  const defaultCalculationSettlementMode =
    refundSettings?.settlement_mode === CALCULATION_MODE_TOKEN
      ? CALCULATION_MODE_TOKEN
      : CALCULATION_MODE_DURATION;

  const itemsSummary = useMemo(
    () => ({
      pending: items.filter((item) => item?.status === 'pending').length,
      payoutPending: items.filter(
        (item) =>
          item?.status === 'approved' &&
          item?.approved_refund_target === REFUND_TARGET_ORIGINAL_PAYMENT &&
          item?.payout_status !== 'paid',
      ).length,
      completed: items.filter(
        (item) =>
          item?.status === 'rejected' ||
          (item?.status === 'approved' &&
            (item?.approved_refund_target !== REFUND_TARGET_ORIGINAL_PAYMENT ||
              item?.payout_status === 'paid')),
      ).length,
      total: items.length,
    }),
    [items],
  );

  const buildQueryParams = useCallback(
    (page = 1, pageSize = 50) => ({
      keyword: keyword.trim(),
      status: status === 'all' ? '' : status,
      payout_status: payoutStatus === 'all' ? '' : payoutStatus,
      p: page,
      page_size: pageSize,
    }),
    [keyword, payoutStatus, status],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/subscription/admin/conversion_requests', {
        params: buildQueryParams(0, 50),
      });
      if (res.data?.success) {
        setItems(res.data.data?.items || []);
      } else {
        showError(res.data?.message || t('加载失败'));
      }
    } catch {
      showError(t('加载失败'));
    } finally {
      setLoading(false);
    }
  }, [buildQueryParams, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openApprove = (item) => {
    setCurrent(item);
    setApprovedRatio(
      Number(item?.requested_ratio || 0) > 0
        ? String(item.requested_ratio)
        : '1',
    );
    setApprovedQuota('');
    setApprovedAmount('');
    setCalculationSettlementMode(defaultCalculationSettlementMode);
    setApprovedRefundTarget(
      item?.requested_refund_target || REFUND_TARGET_BALANCE,
    );
    setAdminRemark(item?.admin_remark || '');
    setApproveVisible(true);
  };

  const openDetail = (item) => {
    setCurrent(item);
    setDetailVisible(true);
  };

  const openReject = (item) => {
    setCurrent(item);
    setRejectRemark('');
    setRejectVisible(true);
  };

  const openPayout = (item) => {
    setCurrent(item);
    setPayoutRemark(item?.payout_remark || '');
    setPayoutVisible(true);
  };

  const handleApprove = async () => {
    if (!current?.id) return;
    const ratioValue = Number(approvedRatio);
    if (!Number.isFinite(ratioValue) || ratioValue <= 0) {
      showError(t('批准比例必须大于 0'));
      return;
    }

    const quotaValue = approvedQuota === '' ? 0 : Number(approvedQuota);
    const amountValue = approvedAmount === '' ? 0 : Number(approvedAmount);
    if (
      approvedRefundTarget === REFUND_TARGET_BALANCE &&
      (!Number.isFinite(quotaValue) || quotaValue < 0)
    ) {
      showError(t('最终增加余额额度不能小于 0'));
      return;
    }
    if (!Number.isFinite(amountValue) || amountValue < 0) {
      showError(t('最终金额不能小于 0'));
      return;
    }

    setApproving(true);
    try {
      const res = await API.post(
        `/api/subscription/admin/conversion_requests/${current.id}/approve`,
        {
          approved_ratio: ratioValue,
          approved_quota:
            approvedRefundTarget === REFUND_TARGET_BALANCE ? quotaValue : 0,
          approved_amount: amountValue,
          approved_refund_target: approvedRefundTarget,
          calculation_settlement_mode: calculationSettlementMode,
          admin_remark: adminRemark,
        },
      );
      if (res.data?.success) {
        showSuccess(
          approvedRefundTarget === REFUND_TARGET_ORIGINAL_PAYMENT
            ? t('已批准原路退款申请')
            : t('已批准并执行折算'),
        );
        setApproveVisible(false);
        await loadData();
      } else {
        showError(res.data?.message || t('审批失败'));
      }
    } catch {
      showError(t('审批失败'));
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!current?.id) return;
    if (!rejectRemark.trim()) {
      showError(t('请填写拒绝原因'));
      return;
    }
    setRejecting(true);
    try {
      const res = await API.post(
        `/api/subscription/admin/conversion_requests/${current.id}/reject`,
        {
          admin_remark: rejectRemark.trim(),
        },
      );
      if (res.data?.success) {
        showSuccess(t('已拒绝该申请'));
        setRejectVisible(false);
        await loadData();
      } else {
        showError(res.data?.message || t('操作失败'));
      }
    } catch {
      showError(t('操作失败'));
    } finally {
      setRejecting(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!current?.id) return;
    if (!payoutRemark.trim()) {
      showError(t('请填写打款流水或备注'));
      return;
    }
    setMarkingPaid(true);
    try {
      const res = await API.post(
        `/api/subscription/admin/conversion_requests/${current.id}/mark_paid`,
        {
          payout_remark: payoutRemark.trim(),
        },
      );
      if (res.data?.success) {
        showSuccess(t('已标记为已打款'));
        setPayoutVisible(false);
        await loadData();
      } else {
        showError(res.data?.message || t('操作失败'));
      }
    } catch {
      showError(t('操作失败'));
    } finally {
      setMarkingPaid(false);
    }
  };

  const escapeCSVCell = (value) => {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
  };

  const exportRequests = async () => {
    setExporting(true);
    try {
      let page = 0;
      let total = 0;
      const rows = [];

      do {
        const res = await API.get('/api/subscription/admin/conversion_requests', {
          params: buildQueryParams(page, EXPORT_PAGE_SIZE),
        });
        if (!res.data?.success) {
          throw new Error(res.data?.message || t('导出失败'));
        }
        const data = res.data.data || {};
        const pageItems = data.items || [];
        total = Number(data.total || 0);
        rows.push(...pageItems);
        page += 1;
        if (pageItems.length === 0) {
          break;
        }
      } while (rows.length < total);

      const headers = [
        'id',
        'user_id',
        'username',
        'status',
        'requested_refund_target',
        'approved_refund_target',
        'payout_status',
        'requested_amount',
        'requested_quota',
        'approved_amount',
        'approved_quota',
        'create_time',
        'approved_at',
        'payout_at',
        'admin_remark',
        'payout_remark',
      ];

      const lines = [
        headers.map(escapeCSVCell).join(','),
        ...rows.map((record) =>
          [
            record?.id || '',
            record?.user_id || '',
            record?.username || '',
            record?.status || '',
            record?.requested_refund_target || '',
            record?.approved_refund_target || '',
            record?.payout_status || '',
            Number(record?.requested_amount || 0).toFixed(2),
            record?.requested_quota || 0,
            Number(record?.approved_amount || 0).toFixed(2),
            record?.approved_quota || 0,
            record?.create_time ? timestamp2string(record.create_time) : '',
            record?.approved_at ? timestamp2string(record.approved_at) : '',
            record?.payout_at ? timestamp2string(record.payout_at) : '',
            record?.admin_remark || '',
            record?.payout_remark || '',
          ]
            .map(escapeCSVCell)
            .join(','),
        ),
      ];

      downloadTextAsFile(
        `\uFEFF${lines.join('\n')}`,
        `subscription-conversion-requests-${new Date().toISOString().slice(0, 10)}.csv`,
      );
      showSuccess(t('导出成功'));
    } catch (error) {
      showError(error?.message || t('导出失败'));
    } finally {
      setExporting(false);
    }
  };

  const columns = useMemo(
    () => [
      {
        title: t('申请信息'),
        width: 240,
        render: (text, record) => (
          <div className='min-w-0'>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='font-medium'>{record?.username || '-'}</span>
              <Text type='tertiary' size='small'>
                #{record?.id}
              </Text>
            </div>
            <Text type='tertiary' size='small' className='block'>
              {t('用户 ID')} {record?.user_id} · {(record?.subscription_items || []).length}{' '}
              {t('个套餐')}
            </Text>
            <Text type='tertiary' size='small' className='block'>
              {record?.create_time ? timestamp2string(record.create_time) : '-'}
            </Text>
          </div>
        ),
      },
      {
        title: t('处理状态'),
        width: 150,
        render: (_, record) => {
          const meta = getStatusMeta(record?.status, t);
          const payoutMeta = getPayoutStatusMeta(record?.payout_status, t);
          return (
            <div className='space-y-1'>
              <Tag color={meta.color} shape='circle' size='small'>
                {meta.text}
              </Tag>
              {record?.approved_refund_target === REFUND_TARGET_ORIGINAL_PAYMENT ? (
                <Tag color={payoutMeta.color} shape='circle' size='small'>
                  {payoutMeta.text}
                </Tag>
              ) : null}
            </div>
          );
        },
      },
      {
        title: t('申请内容'),
        render: (text, record) => (
          <div className='space-y-1'>
            <div className='font-medium'>{getRequestPrimaryAmount(record)}</div>
            <div className='flex flex-wrap gap-1'>
              <Tag color='blue' size='small'>
                {getRefundTargetText(record?.requested_refund_target, t)}
              </Tag>
              <Tag color='grey' size='small'>
                x{Number(record?.requested_ratio || 1).toFixed(2)}
              </Tag>
            </div>
          </div>
        ),
      },
      {
        title: t('核准结果'),
        render: (text, record) =>
          record?.status === 'approved' ? (
            <div className='space-y-1'>
              <div className='font-medium'>{getApprovedPrimaryAmount(record)}</div>
              <div className='flex flex-wrap gap-1'>
                <Tag color='green' size='small'>
                  {getRefundTargetText(record?.approved_refund_target, t)}
                </Tag>
                <Tag color='grey' size='small'>
                  x{Number(record?.approved_ratio || 1).toFixed(2)}
                </Tag>
              </div>
            </div>
          ) : (
            <Text type='tertiary' size='small'>
              {record?.status === 'pending' ? t('等待审核') : '-'}
            </Text>
          ),
      },
      {
        title: t('操作'),
        width: 220,
        render: (text, record) =>
          record?.status === 'pending' ? (
            <Space spacing={4} wrap>
              <Button size='small' theme='outline' onClick={() => openDetail(record)}>
                {t('查看')}
              </Button>
              <Button size='small' type='primary' onClick={() => openApprove(record)}>
                {t('批准')}
              </Button>
              <Button size='small' type='danger' onClick={() => openReject(record)}>
                {t('拒绝')}
              </Button>
            </Space>
          ) : (
            <div className='space-y-1'>
              <Space spacing={4} wrap>
                <Button size='small' theme='outline' onClick={() => openDetail(record)}>
                  {t('查看')}
                </Button>
                {record?.status === 'approved' &&
                record?.approved_refund_target === REFUND_TARGET_ORIGINAL_PAYMENT &&
                record?.payout_status !== 'paid' ? (
                  <Button
                    size='small'
                    type='primary'
                    theme='outline'
                    onClick={() => openPayout(record)}
                  >
                    {t('标记已打款')}
                  </Button>
                ) : null}
              </Space>
              <Text type='tertiary' size='small' className='block'>
                {record?.admin_remark || '-'}
              </Text>
            </div>
          ),
      },
    ],
    [t],
  );

  return (
    <>
      <Card
        className='!rounded-xl border border-semi-color-border shadow-sm'
        bodyStyle={{ padding: '20px' }}
      >
        <div className='mb-4 flex flex-col gap-4'>
          <div className='flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between'>
            <div>
              <div className='text-lg font-semibold'>{t('退款审核工作台')}</div>
              <Text type='tertiary' size='small'>
                {t('集中处理套餐转余额、原路退款审核与后续打款标记。')}
              </Text>
            </div>
            <Text type='tertiary' size='small'>
              {t('用户提交后原套餐会先被禁用；批准后作废原套餐，拒绝后恢复原套餐。')}
            </Text>
          </div>

          <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
            <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3'>
              <Text type='tertiary' size='small'>{t('当前列表')}</Text>
              <div className='mt-1 text-2xl font-semibold'>{itemsSummary.total}</div>
            </div>
            <div className='rounded-xl border border-orange-200 bg-orange-50 p-3'>
              <Text type='tertiary' size='small'>{t('待审核')}</Text>
              <div className='mt-1 text-2xl font-semibold text-orange-600'>{itemsSummary.pending}</div>
            </div>
            <div className='rounded-xl border border-blue-200 bg-blue-50 p-3'>
              <Text type='tertiary' size='small'>{t('待打款')}</Text>
              <div className='mt-1 text-2xl font-semibold text-blue-600'>{itemsSummary.payoutPending}</div>
            </div>
            <div className='rounded-xl border border-green-200 bg-green-50 p-3'>
              <Text type='tertiary' size='small'>{t('已闭环')}</Text>
              <div className='mt-1 text-2xl font-semibold text-green-600'>{itemsSummary.completed}</div>
            </div>
          </div>

          <Space wrap>
            <Input
              value={keyword}
              onChange={setKeyword}
              placeholder={t('搜索用户名 / 用户ID / 申请ID')}
              showClear
            />
            <Select
              value={status}
              onChange={setStatus}
              optionList={[
                { label: t('待审核'), value: 'pending' },
                { label: t('已批准'), value: 'approved' },
                { label: t('已拒绝'), value: 'rejected' },
                { label: t('全部状态'), value: 'all' },
              ]}
              style={{ width: 140 }}
            />
            <Select
              value={payoutStatus}
              onChange={setPayoutStatus}
              optionList={[
                { label: t('全部打款状态'), value: 'all' },
                { label: t('待打款'), value: 'pending' },
                { label: t('已打款'), value: 'paid' },
              ]}
              style={{ width: 140 }}
            />
            <Button theme='outline' onClick={exportRequests} loading={exporting}>
              {t('导出 CSV')}
            </Button>
            <Button theme='outline' onClick={loadData} loading={loading}>
              {t('刷新')}
            </Button>
          </Space>
        </div>

        <Table
          rowKey='id'
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={false}
          empty={t('暂无申请记录')}
        />
      </Card>

      <Modal
        title={t('退款申请详情')}
        visible={detailVisible}
        footer={null}
        onCancel={() => setDetailVisible(false)}
        width={720}
      >
        <div className='space-y-3'>
          <div className='rounded-lg bg-semi-color-fill-0 p-3 text-sm'>
            <div>
              {t('申请用户')}：{current?.username || '-'}
            </div>
            <div>
              {t('申请返还')}：
              {current?.requested_refund_target === REFUND_TARGET_ORIGINAL_PAYMENT
                ? renderQuotaWithAmount(Number(current?.requested_amount || 0))
                : renderQuota(current?.requested_quota || 0)}
            </div>
            <div>
              {t('退款去向')}：
              {getRefundTargetText(current?.requested_refund_target, t)}
            </div>
            <div>
              {t('状态')}：
              {current?.status ? getStatusMeta(current.status, t).text : '-'}
            </div>
            {current?.approved_refund_target === REFUND_TARGET_ORIGINAL_PAYMENT ? (
              <div>
                {t('打款状态')}：
                {getPayoutStatusMeta(current?.payout_status, t).text}
              </div>
            ) : null}
            <div>
              {t('申请时间')}：{timestamp2string(current?.create_time)}
            </div>
            {current?.payout_at ? (
              <div>
                {t('打款时间')}：{timestamp2string(current?.payout_at)}
              </div>
            ) : null}
            {current?.payout_remark ? (
              <div>
                {t('打款备注')}：{current.payout_remark}
              </div>
            ) : null}
            {current?.admin_remark ? (
              <div>
                {t('管理员备注')}：{current.admin_remark}
              </div>
            ) : null}
          </div>
          <div>
            <div className='mb-1 text-sm font-medium'>{t('命中套餐与关联订单')}</div>
            {renderRequestSubscriptionItems(current?.subscription_items, t)}
          </div>
        </div>
      </Modal>

      <Modal
        title={t('标记原路退款已打款')}
        visible={payoutVisible}
        onCancel={() => setPayoutVisible(false)}
        onOk={handleMarkPaid}
        confirmLoading={markingPaid}
        okText={t('确认已打款')}
        cancelText={t('取消')}
      >
        <div className='space-y-3'>
          <div className='rounded-lg bg-semi-color-fill-0 p-3 text-sm'>
            <div>
              {t('申请用户')}：{current?.username || '-'}
            </div>
            <div>
              {t('退款金额')}：{renderQuotaWithAmount(Number(current?.approved_amount || 0))}
            </div>
            <div>
              {t('退款去向')}：{t('原有支付方式')}
            </div>
          </div>
          <div>
            <div className='mb-1 text-sm'>{t('打款备注')}</div>
            <TextArea
              value={payoutRemark}
              onChange={setPayoutRemark}
              rows={4}
              placeholder={t('请填写打款流水、处理人或补充说明')}
            />
          </div>
        </div>
      </Modal>

      <Modal
        title={t('批准退款申请')}
        visible={approveVisible}
        onCancel={() => setApproveVisible(false)}
        onOk={handleApprove}
        confirmLoading={approving}
        okText={t('确认批准')}
        cancelText={t('取消')}
      >
        <div className='space-y-3'>
          <div className='rounded-lg bg-semi-color-fill-0 p-3 text-sm'>
            <div>
              {t('申请用户')}：{current?.username || '-'}
            </div>
            <div>
              {t('申请返还')}：
              {t('由管理员核算')}
            </div>
            <div className='text-semi-color-text-2'>
              {approvedRefundTarget === REFUND_TARGET_ORIGINAL_PAYMENT
                ? t('批准后会保留原套餐作废状态，并记录原路退款金额，需后续人工打款。')
                : t('批准后会直接增加余额，并保持原套餐作废状态。')}
            </div>
          </div>
          <div>
            <div className='mb-1 text-sm font-medium'>{t('命中套餐与关联订单')}</div>
            {renderRequestSubscriptionItems(current?.subscription_items, t)}
          </div>
          <div>
            <div className='mb-1 text-sm'>{t('退款去向')}</div>
            <Select
              value={approvedRefundTarget}
              onChange={setApprovedRefundTarget}
              optionList={[
                { label: t('账户余额'), value: REFUND_TARGET_BALANCE },
                {
                  label: t('原有支付方式'),
                  value: REFUND_TARGET_ORIGINAL_PAYMENT,
                },
              ]}
            />
          </div>
          <div>
            <div className='mb-1 text-sm'>{t('计算方式')}</div>
            <Select
              value={calculationSettlementMode}
              onChange={setCalculationSettlementMode}
              optionList={[
                { label: t('按使用天数计算'), value: CALCULATION_MODE_DURATION },
                { label: t('按额度消耗计算'), value: CALCULATION_MODE_TOKEN },
              ]}
            />
            <Text type='tertiary' size='small' className='mt-1 block'>
              {t('如未手动填写最终金额/额度，系统会按这里选择的方式自动核算。')}
            </Text>
          </div>
          <div>
            <div className='mb-1 text-sm'>{t('批准比例')}</div>
            <Input
              value={approvedRatio}
              onChange={setApprovedRatio}
              placeholder='1.00'
            />
          </div>
          <div>
            <div className='mb-1 text-sm'>{t('最终退款金额')}</div>
            <Input
              value={approvedAmount}
              onChange={setApprovedAmount}
              placeholder={t('留空则按计算方式自动核算')}
            />
          </div>
          {approvedRefundTarget === REFUND_TARGET_BALANCE ? (
            <div>
              <div className='mb-1 text-sm'>{t('最终增加余额额度')}</div>
              <Input
                value={approvedQuota}
                onChange={setApprovedQuota}
                placeholder={t('留空则按计算方式自动核算')}
              />
            </div>
          ) : null}
          <div>
            <div className='mb-1 text-sm'>{t('管理员备注')}</div>
            <TextArea
              value={adminRemark}
              onChange={setAdminRemark}
              rows={4}
            />
          </div>
        </div>
      </Modal>

      <Modal
        title={t('拒绝退款申请')}
        visible={rejectVisible}
        onCancel={() => setRejectVisible(false)}
        onOk={handleReject}
        confirmLoading={rejecting}
        okText={t('确认拒绝')}
        cancelText={t('取消')}
      >
        <div className='space-y-3'>
          <Text type='tertiary' size='small'>
            {t('拒绝后系统会恢复用户申请时被禁用的原套餐。')}
          </Text>
          <div>
            <div className='mb-1 text-sm font-medium'>{t('命中套餐与关联订单')}</div>
            {renderRequestSubscriptionItems(current?.subscription_items, t)}
          </div>
          <div>
            <div className='mb-1 text-sm'>{t('拒绝原因')}</div>
            <TextArea
              value={rejectRemark}
              onChange={setRejectRemark}
              rows={4}
            />
          </div>
        </div>
      </Modal>
    </>
  );
};

export default SubscriptionConversionRequestsPanel;
