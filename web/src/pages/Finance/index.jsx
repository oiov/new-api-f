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

import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Empty,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Toast,
  Typography,
} from '@douyinfe/semi-ui';
import { IconRefresh } from '@douyinfe/semi-icons';
import { VChart } from '@visactor/react-vchart';
import { initVChartSemiTheme } from '@visactor/vchart-semi-theme';
import { useTranslation } from 'react-i18next';
import { API } from '../../helpers';
import { renderQuotaWithAmount } from '../../helpers/render';

const { Text, Title } = Typography;

const RANGE_OPTIONS = [
  { label: '近 7 天', value: '7d', days: 7 },
  { label: '近 30 天', value: '30d', days: 30 },
  { label: '近 90 天', value: '90d', days: 90 },
  { label: '近 365 天', value: '365d', days: 365 },
];

const GRANULARITY_OPTIONS = [
  { label: '按天', value: 'day' },
  { label: '按周', value: 'week' },
  { label: '按月', value: 'month' },
];

const ORDER_STATUS_COLORS = {
  pending: 'orange',
  success: 'green',
  failed: 'red',
  expired: 'grey',
};

const CHART_OPTION = {
  mode: 'desktop-browser',
};

const formatMoney = (value) => renderQuotaWithAmount(Number(value || 0));
const EMPTY_PLACEHOLDER = '—';

const formatDateTime = (timestamp, language) => {
  if (!timestamp) return EMPTY_PLACEHOLDER;
  return new Date(timestamp * 1000).toLocaleString(language || 'zh-CN', {
    hour12: false,
  });
};

const normalizeName = (name, labelMap) => labelMap[name] || name || '—';

const FinancePage = () => {
  const { t, i18n } = useTranslation();
  const [rangeKey, setRangeKey] = useState('30d');
  const [granularity, setGranularity] = useState('day');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  useEffect(() => {
    initVChartSemiTheme({
      isWatchingThemeSwitch: true,
    });
  }, []);

  const loadData = async (nextRangeKey = rangeKey, nextGranularity = granularity) => {
    const range = RANGE_OPTIONS.find((item) => item.value === nextRangeKey) || RANGE_OPTIONS[1];
    const endTimestamp = Math.floor(Date.now() / 1000);
    const startTimestamp = endTimestamp - range.days * 24 * 60 * 60;

    setLoading(true);
    try {
      const res = await API.get('/api/finance/overview', {
        params: {
          start_timestamp: startTimestamp,
          end_timestamp: endTimestamp,
          granularity: nextGranularity,
        },
      });
      const { success, message, data: responseData } = res.data;
      if (!success) {
        Toast.error(message || t('获取财务数据失败'));
        return;
      }
      setData(responseData);
    } catch (error) {
      Toast.error(t('获取财务数据失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const paymentMethodLabels = useMemo(
    () => ({
      stripe: 'Stripe',
      epay: t('易支付'),
      creem: 'Creem',
      waffo: 'Waffo',
      manual: t('管理员充值'),
      unknown: t('未知'),
    }),
    [t],
  );

  const invoiceStatusLabels = useMemo(
    () => ({
      pending: t('待处理'),
      issued: t('已开具'),
      sent: t('已发送'),
      rejected: t('已拒绝'),
    }),
    [t],
  );

  const orderStatusLabels = useMemo(
    () => ({
      pending: t('待处理'),
      success: t('成功'),
      failed: t('失败'),
      expired: t('已过期'),
    }),
    [t],
  );

  const formatCount = useMemo(() => {
    const formatter = new Intl.NumberFormat(i18n.language || 'zh-CN');
    return (value) => formatter.format(Number(value || 0));
  }, [i18n.language]);

  const formatMoneyValue = useMemo(() => {
    return (value) => formatMoney(value);
  }, []);

  const buildTooltipRow = (key, value) => ({
    key,
    value: value || EMPTY_PLACEHOLDER,
  });

  const summaryCards = useMemo(() => {
    const summary = data?.summary || {};
    return [
      {
        key: 'revenue',
        title: t('总收入'),
        value: formatMoney(summary.total_revenue),
        hint: t('成功充值订单累计金额'),
      },
      {
        key: 'orders',
        title: t('成功订单'),
        value: String(summary.successful_topup_count || 0),
        hint: t('当前筛选窗口内成功支付的充值单数'),
      },
      {
        key: 'average',
        title: t('客单价'),
        value: formatMoney(summary.average_order_value),
        hint: t('总收入 / 成功订单数'),
      },
      {
        key: 'pendingInvoice',
        title: t('待开票金额'),
        value: formatMoney(summary.pending_invoice_amount),
        hint: t('待处理发票申请总额'),
      },
      {
        key: 'issuedInvoice',
        title: t('已开票金额'),
        value: formatMoney(summary.issued_invoice_amount),
        hint: t('已开具或已发送发票总额'),
      },
      {
        key: 'invoiceCount',
        title: t('发票申请数'),
        value: String(summary.invoice_count || 0),
        hint: t('当前窗口内创建的发票申请数量'),
      },
    ];
  }, [data, t]);

  const revenueTrendValues = useMemo(() => {
    const values = data?.revenue_trend || [];
    if (values.length > 0) return values;
    return [{ label: t('无数据'), revenue_amount: 0, invoice_amount: 0, order_count: 0 }];
  }, [data, t]);

  const paymentValues = useMemo(() => {
    const values = (data?.payment_methods || []).map((item) => ({
      ...item,
      name: normalizeName(item.name, paymentMethodLabels),
    }));
    if (values.length > 0) return values;
    return [{ name: t('无数据'), value: 0, count: 0 }];
  }, [data, paymentMethodLabels, t]);

  const invoiceStatusValues = useMemo(() => {
    const values = (data?.invoice_status || []).map((item) => ({
      ...item,
      name: normalizeName(item.name, invoiceStatusLabels),
    }));
    if (values.length > 0) return values;
    return [{ name: t('无数据'), amount: 0, count: 0 }];
  }, [data, invoiceStatusLabels, t]);

  const topUserValues = useMemo(() => {
    const values = (data?.top_users || []).map((item) => ({
      ...item,
      name: item.display_name || item.username || `#${item.user_id}`,
    }));
    if (values.length > 0) return values;
    return [{ name: t('无数据'), revenue: 0, order_count: 0 }];
  }, [data, t]);

  const revenueSpec = useMemo(
    () => ({
      type: 'line',
      data: [{ id: 'revenue', values: revenueTrendValues }],
      xField: 'label',
      yField: 'revenue_amount',
      point: { visible: true },
      smooth: true,
      title: { visible: true, text: t('收入趋势') },
      tooltip: {
        dimension: {
          content: [
            {
              key: () => t('时间'),
              value: (datum) => datum?.label || EMPTY_PLACEHOLDER,
            },
            {
              key: () => t('总收入'),
              value: (datum) => formatMoneyValue(datum?.revenue_amount),
            },
            {
              key: () => t('开票金额'),
              value: (datum) => formatMoneyValue(datum?.invoice_amount),
            },
            {
              key: () => t('成功订单'),
              value: (datum) => formatCount(datum?.order_count),
            },
          ],
        },
      },
      axes: [
        { orient: 'bottom', label: { visible: true } },
        {
          orient: 'left',
          label: {
            visible: true,
            formatMethod: (value) => formatMoneyValue(value),
          },
        },
      ],
    }),
    [formatCount, formatMoneyValue, revenueTrendValues, t],
  );

  const invoiceTrendSpec = useMemo(
    () => ({
      type: 'bar',
      data: [{ id: 'invoice', values: revenueTrendValues }],
      xField: 'label',
      yField: 'invoice_amount',
      title: { visible: true, text: t('开票金额趋势') },
      tooltip: {
        mark: {
          content: [
            buildTooltipRow(t('时间'), ''),
            buildTooltipRow(t('开票金额'), ''),
          ],
          updateContent: (items) => {
            if (!Array.isArray(items) || items.length === 0) {
              return items;
            }
            const datum = items[0]?.datum || {};
            return [
              buildTooltipRow(t('时间'), datum.label || EMPTY_PLACEHOLDER),
              buildTooltipRow(t('开票金额'), formatMoneyValue(datum.invoice_amount)),
            ];
          },
        },
      },
      axes: [
        { orient: 'bottom', label: { visible: true } },
        {
          orient: 'left',
          label: {
            visible: true,
            formatMethod: (value) => formatMoneyValue(value),
          },
        },
      ],
    }),
    [formatMoneyValue, revenueTrendValues, t],
  );

  const paymentSpec = useMemo(
    () => ({
      type: 'pie',
      data: [{ id: 'payment', values: paymentValues }],
      outerRadius: 0.78,
      innerRadius: 0.48,
      valueField: 'value',
      categoryField: 'name',
      title: { visible: true, text: t('支付方式分布') },
      legends: { visible: true, orient: 'left' },
      label: { visible: true },
      tooltip: {
        mark: {
          content: [
            {
              key: () => t('支付方式'),
              value: (datum) => datum?.name || EMPTY_PLACEHOLDER,
            },
            {
              key: () => t('金额'),
              value: (datum) => formatMoneyValue(datum?.value),
            },
            {
              key: () => t('成功订单'),
              value: (datum) => formatCount(datum?.count),
            },
          ],
        },
      },
    }),
    [formatCount, formatMoneyValue, paymentValues, t],
  );

  const userRankingSpec = useMemo(
    () => ({
      type: 'bar',
      data: [{ id: 'users', values: topUserValues }],
      xField: 'name',
      yField: 'revenue',
      title: { visible: true, text: t('用户收入排行') },
      tooltip: {
        mark: {
          content: [
            {
              key: () => t('用户'),
              value: (datum) => datum?.name || EMPTY_PLACEHOLDER,
            },
            {
              key: () => t('总收入'),
              value: (datum) => formatMoneyValue(datum?.revenue),
            },
            {
              key: () => t('成功订单'),
              value: (datum) => formatCount(datum?.order_count),
            },
          ],
        },
      },
      axes: [
        { orient: 'bottom', label: { visible: true, autoRotate: true } },
        {
          orient: 'left',
          label: {
            visible: true,
            formatMethod: (value) => formatMoneyValue(value),
          },
        },
      ],
    }),
    [formatCount, formatMoneyValue, t, topUserValues],
  );

  const invoiceStatusSpec = useMemo(
    () => ({
      type: 'bar',
      data: [{ id: 'status', values: invoiceStatusValues }],
      xField: 'name',
      yField: 'amount',
      title: { visible: true, text: t('发票状态分布') },
      tooltip: {
        mark: {
          content: [
            {
              key: () => t('状态'),
              value: (datum) => datum?.name || EMPTY_PLACEHOLDER,
            },
            {
              key: () => t('金额'),
              value: (datum) => formatMoneyValue(datum?.amount),
            },
            {
              key: () => t('发票申请数'),
              value: (datum) => formatCount(datum?.count),
            },
          ],
        },
      },
      axes: [
        { orient: 'bottom', label: { visible: true } },
        {
          orient: 'left',
          label: {
            visible: true,
            formatMethod: (value) => formatMoneyValue(value),
          },
        },
      ],
    }),
    [formatCount, formatMoneyValue, invoiceStatusValues, t],
  );

  const columns = useMemo(
    () => [
      {
        title: t('完成时间'),
        dataIndex: 'complete_time',
        render: (value) => formatDateTime(value, i18n.language),
      },
      {
        title: t('用户'),
        dataIndex: 'username',
        render: (value, record) => value || `#${record.user_id}`,
      },
      {
        title: t('支付方式'),
        dataIndex: 'payment_method',
        render: (value) => normalizeName(value, paymentMethodLabels),
      },
      {
        title: t('金额'),
        dataIndex: 'money',
        render: (value) => <Text strong>{formatMoney(value)}</Text>,
      },
      {
        title: t('状态'),
        dataIndex: 'status',
        render: (value) => (
          <Tag color={ORDER_STATUS_COLORS[value] || 'grey'}>
            {orderStatusLabels[value] || value || EMPTY_PLACEHOLDER}
          </Tag>
        ),
      },
      {
        title: t('订单号'),
        dataIndex: 'trade_no',
        render: (value) => (
          <Text copyable ellipsis={{ showTooltip: true }} style={{ maxWidth: 220 }}>
            {value || EMPTY_PLACEHOLDER}
          </Text>
        ),
      },
    ],
    [i18n.language, orderStatusLabels, paymentMethodLabels, t],
  );

  return (
    <div className='mt-[60px] space-y-4 px-2 pb-6'>
      <Card bordered={false} bodyStyle={{ padding: 20 }}>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
          <div>
            <Title heading={4} style={{ margin: 0 }}>
              {t('财务中心')}
            </Title>
            <Text type='secondary'>
              {t('聚合充值、发票与订单数据，提供多维度可视化分析。')}
            </Text>
          </div>
          <Space wrap>
            <Select
              value={rangeKey}
              style={{ width: 132 }}
              optionList={RANGE_OPTIONS.map((item) => ({
                label: t(item.label),
                value: item.value,
              }))}
              onChange={(value) => {
                setRangeKey(value);
                loadData(value, granularity);
              }}
            />
            <Select
              value={granularity}
              style={{ width: 120 }}
              optionList={GRANULARITY_OPTIONS.map((item) => ({
                label: t(item.label),
                value: item.value,
              }))}
              onChange={(value) => {
                setGranularity(value);
                loadData(rangeKey, value);
              }}
            />
            <Button
              icon={<IconRefresh />}
              onClick={() => loadData()}
              loading={loading}
            >
              {t('刷新')}
            </Button>
          </Space>
        </div>
      </Card>

      <Spin spinning={loading}>
        <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3'>
          {summaryCards.map((item) => (
            <Card key={item.key} bordered={false} bodyStyle={{ padding: 20 }}>
              <Text type='secondary'>{item.title}</Text>
              <div className='mt-3 text-3xl font-semibold tracking-tight'>
                {item.value}
              </div>
              <div className='mt-2 text-sm text-[var(--semi-color-text-2)]'>
                {item.hint}
              </div>
            </Card>
          ))}
        </div>

        {!data ? (
          <Card bordered={false} bodyStyle={{ padding: 40 }}>
            <Empty description={t('暂无财务数据')} />
          </Card>
        ) : (
          <>
            <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
              <Card bordered={false} bodyStyle={{ padding: 20 }}>
                <VChart spec={revenueSpec} option={CHART_OPTION} />
              </Card>
              <Card bordered={false} bodyStyle={{ padding: 20 }}>
                <VChart spec={invoiceTrendSpec} option={CHART_OPTION} />
              </Card>
              <Card bordered={false} bodyStyle={{ padding: 20 }}>
                <VChart spec={paymentSpec} option={CHART_OPTION} />
              </Card>
              <Card bordered={false} bodyStyle={{ padding: 20 }}>
                <VChart spec={invoiceStatusSpec} option={CHART_OPTION} />
              </Card>
            </div>

            <div className='grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1fr]'>
              <Card bordered={false} bodyStyle={{ padding: 20 }}>
                <VChart spec={userRankingSpec} option={CHART_OPTION} />
              </Card>
              <Card bordered={false} bodyStyle={{ padding: 20 }}>
                <div className='mb-4'>
                  <Title heading={6} style={{ margin: 0 }}>
                    {t('最近订单')}
                  </Title>
                  <Text type='secondary'>
                    {t('展示当前筛选窗口内最近完成的充值订单。')}
                  </Text>
                </div>
                <Table
                  rowKey='id'
                  columns={columns}
                  dataSource={data.recent_orders || []}
                  pagination={false}
                  size='small'
                  empty={t('暂无订单')}
                />
              </Card>
            </div>
          </>
        )}
      </Spin>
    </div>
  );
};

export default FinancePage;
