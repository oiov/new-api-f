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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Empty,
  Input,
  InputNumber,
  Space,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { useTranslation } from 'react-i18next';
import CardPro from '../../components/common/ui/CardPro';
import CardTable from '../../components/common/ui/CardTable';
import { API, showError, timestamp2string } from '../../helpers';
import { createCardProPagination } from '../../helpers/utils';
import { useIsMobile } from '../../hooks/common/useIsMobile';

const { Text } = Typography;

const DEFAULT_FILTERS = {
  keyword: '',
  userId: undefined,
  startDate: '',
  endDate: '',
};

const CheckinAdminPage = () => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [query, setQuery] = useState(DEFAULT_FILTERS);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/checkin/admin/records', {
        params: {
          page,
          page_size: pageSize,
          keyword: query.keyword?.trim() || undefined,
          user_id: query.userId || undefined,
          start_date: query.startDate?.trim() || undefined,
          end_date: query.endDate?.trim() || undefined,
        },
      });
      if (res.data?.success) {
        setRecords(res.data?.data?.items || []);
        setTotal(Number(res.data?.data?.total || 0));
        setStats(res.data?.data?.stats || null);
      } else {
        showError(res.data?.message || t('获取签到记录失败'));
      }
    } catch (error) {
      showError(error?.response?.data?.message || t('获取签到记录失败'));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, query, t]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const columns = useMemo(
    () => [
      {
        title: 'ID',
        dataIndex: 'id',
        key: 'id',
        width: 80,
      },
      {
        title: t('用户ID'),
        dataIndex: 'user_id',
        key: 'user_id',
        width: 100,
      },
      {
        title: t('用户名'),
        dataIndex: 'username',
        key: 'username',
      },
      {
        title: t('昵称'),
        dataIndex: 'display_name',
        key: 'display_name',
        render: (_, record) => record?.display_name || '-',
      },
      {
        title: t('签到日期'),
        dataIndex: 'checkin_date',
        key: 'checkin_date',
        render: (_, record) => (
          <Tag color='blue' shape='circle'>
            {record?.checkin_date || '-'}
          </Tag>
        ),
      },
      {
        title: t('奖励额度'),
        dataIndex: 'quota_awarded',
        key: 'quota_awarded',
      },
      {
        title: t('创建时间'),
        dataIndex: 'created_at',
        key: 'created_at',
        render: (_, record) =>
          record?.created_at ? timestamp2string(record.created_at) : '-',
      },
    ],
    [t],
  );

  const statsArea = (
    <div className='grid grid-cols-2 gap-3 md:grid-cols-4'>
      <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3'>
        <div className='text-xs text-gray-500'>{t('总签到次数')}</div>
        <div className='mt-1 text-xl font-semibold'>
          {Number(stats?.total_checkins || 0)}
        </div>
      </div>
      <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3'>
        <div className='text-xs text-gray-500'>{t('参与用户数')}</div>
        <div className='mt-1 text-xl font-semibold'>
          {Number(stats?.total_users || 0)}
        </div>
      </div>
      <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3'>
        <div className='text-xs text-gray-500'>{t('发放总额度')}</div>
        <div className='mt-1 text-xl font-semibold'>
          {Number(stats?.total_quota || 0)}
        </div>
      </div>
      <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3'>
        <div className='text-xs text-gray-500'>{t('今日签到次数')}</div>
        <div className='mt-1 text-xl font-semibold'>
          {Number(stats?.today_checkins || 0)}
        </div>
      </div>
    </div>
  );

  return (
    <div className='mt-[60px] px-2'>
      <CardPro
        type='type2'
        statsArea={statsArea}
        searchArea={
          <div className='flex flex-col gap-3'>
            <div className='flex flex-col gap-2 md:flex-row md:items-center md:justify-between'>
              <div>
                <div className='text-base font-semibold text-semi-color-text-0'>
                  {t('签到管理')}
                </div>
                <Text type='tertiary' size='small'>
                  {t('查看全部用户签到记录')}
                </Text>
              </div>
              <Button theme='outline' onClick={loadRecords} loading={loading}>
                {t('刷新')}
              </Button>
            </div>
            <Space wrap align='end'>
              <Input
                value={filters.keyword}
                onChange={(value) =>
                  setFilters((prev) => ({ ...prev, keyword: value }))
                }
                placeholder={t('搜索用户名或昵称')}
                showClear
                style={{ width: 220 }}
              />
              <InputNumber
                value={filters.userId}
                onChange={(value) =>
                  setFilters((prev) => ({ ...prev, userId: value }))
                }
                placeholder={t('用户ID')}
                min={1}
                style={{ width: 140 }}
              />
              <Input
                value={filters.startDate}
                onChange={(value) =>
                  setFilters((prev) => ({ ...prev, startDate: value }))
                }
                placeholder={t('开始日期')}
                showClear
                style={{ width: 160 }}
              />
              <Input
                value={filters.endDate}
                onChange={(value) =>
                  setFilters((prev) => ({ ...prev, endDate: value }))
                }
                placeholder={t('结束日期')}
                showClear
                style={{ width: 160 }}
              />
              <Button
                type='primary'
                onClick={() => {
                  setPage(1);
                  setQuery(filters);
                }}
              >
                {t('查询')}
              </Button>
              <Button
                theme='outline'
                onClick={() => {
                  setFilters(DEFAULT_FILTERS);
                  setPage(1);
                  setQuery(DEFAULT_FILTERS);
                }}
              >
                {t('重置筛选')}
              </Button>
            </Space>
          </div>
        }
        paginationArea={createCardProPagination({
          currentPage: page,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: (size) => {
            setPageSize(size);
            setPage(1);
          },
          isMobile,
          t,
        })}
        t={t}
      >
        <CardTable
          columns={columns}
          dataSource={records}
          loading={loading}
          rowKey='id'
          pagination={false}
          empty={
            <Empty
              image={<IllustrationNoResult />}
              darkModeImage={<IllustrationNoResultDark />}
              description={t('暂无签到记录')}
            />
          }
        />
      </CardPro>
    </div>
  );
};

export default CheckinAdminPage;
