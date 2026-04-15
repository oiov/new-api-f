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
  Input,
  Pagination,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { IconRefresh, IconSearch } from '@douyinfe/semi-icons';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { API, renderGroup, showError, showSuccess } from '../../../helpers';

const { Text } = Typography;

function formatDateTime(timestamp) {
  if (!timestamp) return '--';
  return new Date(timestamp * 1000).toLocaleString();
}

function getPlanStatusMeta(status, t) {
  switch (status) {
    case 'active':
      return { color: 'green', text: t('进行中') };
    case 'completed':
      return { color: 'blue', text: t('已完成') };
    case 'cancelled':
      return { color: 'grey', text: t('已取消') };
    default:
      return { color: 'grey', text: status || '--' };
  }
}

const SubscriptionDayPassPlansPanel = ({ t }) => {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [cancellingId, setCancellingId] = useState(0);

  const loadData = async (
    nextPage = page,
    nextPageSize = pageSize,
    nextKeyword = keyword,
    nextStatus = statusFilter,
  ) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        p: String(nextPage),
        page_size: String(nextPageSize),
        keyword: String(nextKeyword || '').trim(),
        status: nextStatus === 'all' ? '' : nextStatus,
      });
      const res = await API.get(
        `/api/subscription/admin/day_pass_plans?${params.toString()}`,
      );
      if (res.data?.success) {
        const data = res.data.data || {};
        setItems(data.items || []);
        setPage(data.page || nextPage);
        setPageSize(data.page_size || nextPageSize);
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
    loadData(1, pageSize, keyword, statusFilter);
  }, [pageSize, statusFilter]);

  const summary = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        const status = item?.plan?.status;
        if (status === 'active') acc.active += 1;
        if (status === 'completed') acc.completed += 1;
        if (status === 'cancelled') acc.cancelled += 1;
        return acc;
      },
      { active: 0, completed: 0, cancelled: 0 },
    );
  }, [items]);

  const handleSearch = async () => {
    await loadData(1, pageSize, keyword, statusFilter);
  };

  const handleCancel = async (record) => {
    const planId = Number(record?.plan?.id || 0);
    if (planId <= 0) return;
    setCancellingId(planId);
    try {
      const res = await API.post(
        `/api/subscription/admin/day_pass_plans/${planId}/cancel`,
      );
      if (res.data?.success) {
        showSuccess(t('已取消'));
        await loadData(page, pageSize, keyword, statusFilter);
      } else {
        showError(res.data?.message || t('操作失败'));
      }
    } catch {
      showError(t('请求失败'));
    } finally {
      setCancellingId(0);
    }
  };

  const columns = useMemo(
    () => [
      {
        title: t('计划'),
        width: 120,
        render: (_, record) => (
          <div className='min-w-0'>
            <Text strong>#{record?.plan?.id || '--'}</Text>
            <div className='mt-0.5 text-xs text-semi-color-text-2'>
              {t('父订阅')} #{record?.plan?.parent_user_subscription_id || '--'}
            </div>
          </div>
        ),
      },
      {
        title: t('用户'),
        width: 150,
        render: (_, record) => (
          <div className='min-w-0'>
            <Text strong>{record?.username || '--'}</Text>
            <div className='mt-0.5 text-xs text-semi-color-text-2 truncate'>
              {record?.user_group ? renderGroup(record.user_group) : '--'}
            </div>
          </div>
        ),
      },
      {
        title: t('拆分配置'),
        width: 180,
        render: (_, record) => (
          <div className='text-sm'>
            <div>
              {t('共 {{count}} 天', {
                count: Number(record?.plan?.total_days || 0),
              })}
            </div>
            <div className='text-xs text-semi-color-text-2'>
              {t('每天 {{count}} 次', {
                count: Number(record?.plan?.request_count_per_day || 0),
              })}
            </div>
          </div>
        ),
      },
      {
        title: t('进度'),
        width: 140,
        render: (_, record) => (
          <div className='text-sm'>
            {t('已生成 {{count}} / {{total}} 天', {
              count: Number(record?.plan?.generated_days || 0),
              total: Number(record?.plan?.total_days || 0),
            })}
          </div>
        ),
      },
      {
        title: t('状态'),
        width: 100,
        render: (_, record) => {
          const meta = getPlanStatusMeta(record?.plan?.status, t);
          return (
            <Tag color={meta.color} shape='circle' size='small'>
              {meta.text}
            </Tag>
          );
        },
      },
      {
        title: t('下次生成'),
        width: 180,
        render: (_, record) => formatDateTime(record?.plan?.next_generate_at),
      },
      {
        title: t('操作'),
        width: 110,
        render: (_, record) => (
          <Button
            size='small'
            theme='borderless'
            type='danger'
            disabled={record?.plan?.status !== 'active'}
            loading={cancellingId === record?.plan?.id}
            onClick={() => handleCancel(record)}
          >
            {t('取消计划')}
          </Button>
        ),
      },
    ],
    [cancellingId, t],
  );

  const renderExpandedRow = (record) => {
    const parent = record?.parent_subscription;
    return (
      <div className='grid gap-3 p-2 lg:grid-cols-3'>
        <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3'>
          <div className='mb-2 text-xs font-medium text-semi-color-text-2'>
            {t('时间信息')}
          </div>
          <div className='space-y-1 text-xs text-semi-color-text-2'>
            <div>
              {t('开始日期')}：{record?.plan?.start_date || '--'}
            </div>
            <div>
              {t('结束日期')}：{record?.plan?.end_date || '--'}
            </div>
            <div>
              {t('上次生成')}：{formatDateTime(record?.plan?.last_generate_at)}
            </div>
            <div>
              {t('创建时间')}：{formatDateTime(record?.plan?.created_at)}
            </div>
          </div>
        </div>
        <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3'>
          <div className='mb-2 text-xs font-medium text-semi-color-text-2'>
            {t('父月卡信息')}
          </div>
          <div className='space-y-1 text-xs text-semi-color-text-2'>
            <div>
              {t('父订阅')}：#{parent?.id || '--'}
            </div>
            <div>
              {t('资源类型')}：{parent?.resource_type || '--'}
            </div>
            <div>
              {t('总次数')}：{Number(parent?.request_count_total || 0)}
            </div>
            <div>
              {t('已用次数')}：{Number(parent?.request_count_used || 0)}
            </div>
          </div>
        </div>
        <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3'>
          <div className='mb-2 text-xs font-medium text-semi-color-text-2'>
            {t('异常信息')}
          </div>
          <div className='text-xs text-semi-color-text-2 whitespace-pre-wrap break-words'>
            {record?.plan?.last_error || '--'}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className='space-y-3'>
      <div className='grid gap-3 md:grid-cols-3'>
        <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3 text-sm'>
          <div className='text-semi-color-text-2'>{t('进行中')}</div>
          <div className='mt-1 text-xl font-semibold'>{summary.active}</div>
        </div>
        <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3 text-sm'>
          <div className='text-semi-color-text-2'>{t('已完成')}</div>
          <div className='mt-1 text-xl font-semibold'>{summary.completed}</div>
        </div>
        <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3 text-sm'>
          <div className='text-semi-color-text-2'>{t('已取消')}</div>
          <div className='mt-1 text-xl font-semibold'>{summary.cancelled}</div>
        </div>
      </div>

      <Space wrap>
        <Input
          style={{ width: 260 }}
          value={keyword}
          placeholder={t('搜索计划ID / 用户 / 父订阅ID')}
          prefix={<IconSearch />}
          onChange={setKeyword}
          onEnterPress={handleSearch}
        />
        <Select
          style={{ width: 160 }}
          value={statusFilter}
          onChange={setStatusFilter}
          optionList={[
            { label: t('全部状态'), value: 'all' },
            { label: t('进行中'), value: 'active' },
            { label: t('已完成'), value: 'completed' },
            { label: t('已取消'), value: 'cancelled' },
          ]}
        />
        <Button icon={<IconSearch />} onClick={handleSearch}>
          {t('搜索')}
        </Button>
        <Button
          icon={<IconRefresh />}
          theme='light'
          onClick={() => loadData(page, pageSize, keyword, statusFilter)}
        >
          {t('刷新')}
        </Button>
      </Space>

      <Table
        columns={columns}
        dataSource={items}
        loading={loading}
        rowKey={(row) => row?.plan?.id}
        size='small'
        pagination={false}
        expandRowByClick
        expandedRowRender={renderExpandedRow}
        empty={
          <Empty
            image={<IllustrationNoResult style={{ width: 150, height: 150 }} />}
            darkModeImage={
              <IllustrationNoResultDark style={{ width: 150, height: 150 }} />
            }
            description={t('暂无拆分计划')}
            style={{ padding: 30 }}
          />
        }
      />

      <div className='flex justify-end'>
        <Pagination
          currentPage={page}
          pageSize={pageSize}
          total={total}
          showSizeChanger
          pageSizeOpts={[10, 20, 50, 100]}
          onPageChange={(nextPage) => {
            setPage(nextPage);
            loadData(nextPage, pageSize, keyword, statusFilter);
          }}
          onPageSizeChange={(nextSize) => {
            setPage(1);
            setPageSize(nextSize);
            loadData(1, nextSize, keyword, statusFilter);
          }}
        />
      </div>
    </div>
  );
};

export default SubscriptionDayPassPlansPanel;
