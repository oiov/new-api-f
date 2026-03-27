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
  Empty,
  Form,
  SideSheet,
  Space,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { API, getLogOther, renderQuota, showError, showSuccess } from '../../../../helpers';
import {
  createCardProPagination,
  downloadTextAsFile,
  getTodayStartTimestamp,
} from '../../../../helpers/utils';
import { DATE_RANGE_PRESETS } from '../../../../constants/console.constants';
import { useIsMobile } from '../../../../hooks/common/useIsMobile';
import { getSubscriptionResourceType } from '../../../../helpers/subscriptionFormat';
import CardPro from '../../../common/ui/CardPro';
import CardTable from '../../../common/ui/CardTable';

const { Text } = Typography;

function formatTs(ts) {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString();
}

const SubscriptionConsumeLogsModal = ({
  visible,
  onCancel,
  initialFilter,
  planOptions,
  planMetaMap,
  endpoint = '/api/subscription/admin/consume_logs',
  title,
  allowUsernameFilter = true,
  t,
}) => {
  const isMobile = useIsMobile();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activePage, setActivePage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [logCount, setLogCount] = useState(0);
  const [summary, setSummary] = useState({});
  const [formApi, setFormApi] = useState(null);
  const [exporting, setExporting] = useState(false);

  const formInitValues = useMemo(
    () => ({
      subscription_id: initialFilter?.subscriptionId || '',
      plan_id: initialFilter?.planId || '',
      username: initialFilter?.username || '',
      dateRange: [
        new Date(getTodayStartTimestamp() * 1000),
        new Date(),
      ],
    }),
    [initialFilter],
  );

  const getFormValues = () => {
    const values = formApi ? formApi.getValues() : formInitValues;
    const dateRange = values.dateRange || [];
    return {
      subscription_id: values.subscription_id || '',
      plan_id: values.plan_id || '',
      username: values.username || '',
      start_timestamp: dateRange[0]
        ? Math.floor(new Date(dateRange[0]).getTime() / 1000)
        : 0,
      end_timestamp: dateRange[1]
        ? Math.floor(new Date(dateRange[1]).getTime() / 1000)
        : 0,
    };
  };

  const loadLogs = async (page = activePage, size = pageSize) => {
    setLoading(true);
    try {
      const values = getFormValues();
      const searchParams = new URLSearchParams({
        p: String(page),
        page_size: String(size),
        subscription_id: String(values.subscription_id || ''),
        plan_id: String(values.plan_id || ''),
        username: values.username || '',
        start_timestamp: String(values.start_timestamp || 0),
        end_timestamp: String(values.end_timestamp || 0),
      });
      const res = await API.get(
        `${endpoint}?${searchParams.toString()}`,
      );
      if (res.data?.success) {
        const data = res.data.data || {};
        setLogs(data.items || []);
        setActivePage(data.page || page);
        setPageSize(data.page_size || size);
        setLogCount(data.total || 0);
        setSummary(data.summary || {});
      } else {
        showError(res.data?.message || t('加载失败'));
      }
    } catch (e) {
      showError(t('请求失败'));
    } finally {
      setLoading(false);
    }
  };

  const buildSearchParams = (page, size) => {
    const values = getFormValues();
    return new URLSearchParams({
      p: String(page),
      page_size: String(size),
      subscription_id: String(values.subscription_id || ''),
      plan_id: String(values.plan_id || ''),
      username: values.username || '',
      start_timestamp: String(values.start_timestamp || 0),
      end_timestamp: String(values.end_timestamp || 0),
    });
  };

  useEffect(() => {
    if (!visible) return;
    setActivePage(1);
    formApi?.setValues(formInitValues);
    setTimeout(() => {
      loadLogs(1, pageSize);
    }, 0);
  }, [visible, formApi, formInitValues, pageSize]);

  const columns = useMemo(
    () => [
      {
        title: t('时间'),
        dataIndex: 'created_at',
        width: 180,
        render: (text) => formatTs(text),
      },
      {
        title: t('用户'),
        dataIndex: 'username',
        width: 120,
      },
      {
        title: t('模型'),
        dataIndex: 'model_name',
        width: 180,
      },
      {
        title: t('渠道'),
        width: 160,
        render: (_, record) => record?.channel_name || `#${record?.channel || '-'}`,
      },
      {
        title: t('订阅信息'),
        width: 200,
        render: (_, record) => {
          const other = getLogOther(record?.other) || {};
          return (
            <div className='text-xs text-gray-600'>
              <div>#{other?.subscription_id || '-'}</div>
              <div>#{other?.subscription_plan_id || '-'} {other?.subscription_plan_title || ''}</div>
            </div>
          );
        },
      },
      {
        title: t('消耗'),
        width: 180,
        render: (_, record) => {
          const other = getLogOther(record?.other) || {};
          const consumed = Number(other?.subscription_consumed || 0);
          const remain = other?.subscription_remain;
          const total = other?.subscription_total;
          const planId = Number(other?.subscription_plan_id || 0);
          const resourceType =
            getSubscriptionResourceType(planMetaMap?.get(planId)) || 'quota';
          return (
            <div className='text-xs text-gray-600'>
              <div>
                {t('本次')}:{' '}
                {consumed > 0
                  ? resourceType === 'request_count'
                    ? consumed
                    : renderQuota(consumed)
                  : '-'}
              </div>
              {total !== undefined && (
                <div>
                  {t('剩余')}:{' '}
                  {resourceType === 'request_count'
                    ? `${Number(remain || 0)} / ${Number(total || 0)}`
                    : `${renderQuota(remain || 0)} / ${renderQuota(total || 0)}`}
                </div>
              )}
            </div>
          );
        },
      },
      {
        title: t('请求ID'),
        dataIndex: 'request_id',
        width: 180,
        render: (text) => <Text type='tertiary' size='small'>{text || '-'}</Text>,
      },
    ],
    [planMetaMap, t],
  );

  const getRecordResourceType = (record) => {
    const other = getLogOther(record?.other) || {};
    if (other?.subscription_resource_type) {
      return getSubscriptionResourceType({
        resource_type: other.subscription_resource_type,
      });
    }
    const planId = Number(other?.subscription_plan_id || 0);
    return getSubscriptionResourceType(planMetaMap?.get(planId)) || 'quota';
  };

  const formatConsumedValue = (value, resourceType) => {
    if (resourceType === 'request_count') {
      return String(Number(value || 0));
    }
    return renderQuota(Number(value || 0));
  };

  const escapeCSVCell = (value) => {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
  };

  const exportLogs = async () => {
    setExporting(true);
    try {
      const exportPageSize = 100;
      let page = 1;
      let total = 0;
      const rows = [];

      do {
        const searchParams = buildSearchParams(page, exportPageSize);
        const res = await API.get(`${endpoint}?${searchParams.toString()}`);
        if (!res.data?.success) {
          throw new Error(res.data?.message || t('导出失败'));
        }
        const data = res.data.data || {};
        const items = data.items || [];
        total = Number(data.total || 0);
        rows.push(...items);
        page += 1;
        if (items.length === 0) break;
      } while (rows.length < total);

      const headers = [
        t('时间'),
        t('用户'),
        t('模型'),
        t('渠道'),
        'subscription_id',
        'subscription_plan_id',
        t('套餐名称'),
        t('资源类型'),
        t('本次消耗'),
        t('剩余'),
        t('总量'),
        'request_id',
      ];

      const lines = [
        headers.map(escapeCSVCell).join(','),
        ...rows.map((record) => {
          const other = getLogOther(record?.other) || {};
          const resourceType = getRecordResourceType(record);
          return [
            formatTs(record?.created_at),
            record?.username || '',
            record?.model_name || '',
            record?.channel_name || `#${record?.channel || '-'}`,
            other?.subscription_id || '',
            other?.subscription_plan_id || '',
            other?.subscription_plan_title || '',
            resourceType === 'request_count' ? 'request_count' : 'quota',
            formatConsumedValue(other?.subscription_consumed || 0, resourceType),
            formatConsumedValue(other?.subscription_remain || 0, resourceType),
            formatConsumedValue(other?.subscription_total || 0, resourceType),
            record?.request_id || '',
          ]
            .map(escapeCSVCell)
            .join(',');
        }),
      ];

      downloadTextAsFile(
        `\uFEFF${lines.join('\n')}`,
        `subscription-consume-logs-${new Date().toISOString().slice(0, 10)}.csv`,
      );
      showSuccess(t('导出成功'));
    } catch (error) {
      showError(error?.message || t('导出失败'));
    } finally {
      setExporting(false);
    }
  };

  const summaryCards = useMemo(
    () => [
      {
        key: 'success',
        title: t('成功请求'),
        total: Number(summary?.total_success_count || 0),
        today: Number(summary?.today_success_count || 0),
        sevenDay: Number(summary?.seven_day_success_count || 0),
        formatter: (value) => value,
      },
      {
        key: 'request',
        title: t('按次消耗'),
        total: Number(summary?.total_request_consumed || 0),
        today: Number(summary?.today_request_consumed || 0),
        sevenDay: Number(summary?.seven_day_request_consumed || 0),
        formatter: (value) => value,
      },
      {
        key: 'quota',
        title: t('额度消耗'),
        total: Number(summary?.total_quota_consumed || 0),
        today: Number(summary?.today_quota_consumed || 0),
        sevenDay: Number(summary?.seven_day_quota_consumed || 0),
        formatter: (value) => renderQuota(value),
      },
    ],
    [summary, t],
  );

  return (
    <SideSheet
      visible={visible}
      onCancel={onCancel}
      placement='right'
      width={isMobile ? '100%' : 1100}
      title={title || t('订阅消耗记录')}
      bodyStyle={{ padding: 0 }}
    >
      <div className='p-4'>
        <CardPro
          type='type1'
          actionsArea={
            <Space>
              <Button
                type='tertiary'
                theme='outline'
                loading={exporting}
                onClick={exportLogs}
              >
                {t('导出 CSV')}
              </Button>
            </Space>
          }
          descriptionArea={
            <div className='space-y-3'>
              <div className='flex items-center gap-2'>
                <Tag color='blue'>{t('订阅日志')}</Tag>
                <Text type='tertiary'>{t('支持查看全部订阅消耗，也可按订阅实例、套餐、用户过滤')}</Text>
              </div>
              <div className='grid grid-cols-1 gap-3 md:grid-cols-3'>
                {summaryCards.map((card) => (
                  <div
                    key={card.key}
                    className='rounded-lg border border-semi-color-border bg-semi-color-fill-0 p-3'
                  >
                    <div className='text-xs text-gray-500'>{card.title}</div>
                    <div className='mt-2 text-base font-semibold text-semi-color-text-0'>
                      {card.formatter(card.total)}
                    </div>
                    <div className='mt-2 flex flex-wrap gap-3 text-xs text-gray-500'>
                      <span>
                        {t('今天')}: {card.formatter(card.today)}
                      </span>
                      <span>
                        {t('近7日')}: {card.formatter(card.sevenDay)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          }
          searchArea={
            <Form
              initValues={formInitValues}
              getFormApi={setFormApi}
              onSubmit={() => loadLogs(1, pageSize)}
              allowEmpty
              className='w-full'
            >
              <div className='flex flex-col md:flex-row items-center gap-2 w-full'>
                <div className='w-full md:w-40'>
                  <Form.Input field='subscription_id' placeholder={t('订阅实例ID')} showClear />
                </div>
                <div className='w-full md:w-52'>
                  <Form.Select
                    field='plan_id'
                    placeholder={t('订阅套餐')}
                    optionList={[
                      { label: t('全部套餐'), value: '' },
                      ...(planOptions || []),
                    ]}
                    filter
                    showClear
                  />
                </div>
                {allowUsernameFilter && (
                  <div className='w-full md:w-40'>
                    <Form.Input field='username' placeholder={t('用户名')} showClear />
                  </div>
                )}
                <div className='w-full md:w-[340px]'>
                  <Form.DatePicker
                    field='dateRange'
                    type='dateTimeRange'
                    style={{ width: '100%' }}
                    presets={DATE_RANGE_PRESETS.map((preset) => ({
                      text: t(preset.text),
                      start: preset.start(),
                      end: preset.end(),
                    }))}
                  />
                </div>
                <div className='flex gap-2 w-full md:w-auto'>
                  <Button htmlType='submit' type='tertiary'>
                    {t('查询')}
                  </Button>
                  <Button
                    type='tertiary'
                    onClick={() => {
                      formApi?.setValues(formInitValues);
                      setTimeout(() => loadLogs(1, pageSize), 0);
                    }}
                  >
                    {t('重置')}
                  </Button>
                </div>
              </div>
            </Form>
          }
          paginationArea={createCardProPagination({
            currentPage: activePage,
            pageSize,
            total: logCount,
            onPageChange: (page) => loadLogs(page, pageSize),
            onPageSizeChange: (size) => loadLogs(1, size),
            isMobile,
            t,
          })}
          t={t}
        >
          <CardTable
            columns={columns}
            dataSource={logs}
            loading={loading}
            rowKey='id'
            pagination={false}
            hidePagination={true}
            scroll={{ x: 'max-content' }}
            empty={
              <Empty
                image={<IllustrationNoResult style={{ width: 150, height: 150 }} />}
                darkModeImage={
                  <IllustrationNoResultDark style={{ width: 150, height: 150 }} />
                }
                description={t('暂无订阅消耗记录')}
                style={{ padding: 30 }}
              />
            }
            size='middle'
          />
        </CardPro>
      </div>
    </SideSheet>
  );
};

export default SubscriptionConsumeLogsModal;
