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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Banner,
  Button,
  Collapsible,
  Empty,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  TabPane,
  Tabs,
  Tag,
  TextArea,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { useTranslation } from 'react-i18next';
import CardPro from '../../components/common/ui/CardPro';
import CardTable from '../../components/common/ui/CardTable';
import {
  API,
  showError,
  showInfo,
  showSuccess,
  timestamp2string,
} from '../../helpers';
import { renderNumber } from '../../helpers/render';
import { createCardProPagination } from '../../helpers/utils';
import { useIsMobile } from '../../hooks/common/useIsMobile';

const { Text } = Typography;
const CHECKIN_QUOTA_PER_CNY = 500000;
const TAB_RECORDS = 'records';
const TAB_AUTO_JOBS = 'auto-jobs';
const SHANGHAI_TIME_ZONE = 'Asia/Shanghai';

const DEFAULT_RECORD_FILTERS = {
  keyword: '',
  userId: undefined,
  startDate: '',
  endDate: '',
};

const DEFAULT_JOB_FILTERS = {
  targetDate: '',
  status: '',
};

const DEFAULT_CREATE_FORM = {
  name: '',
  targetDate: '',
  windowStartTime: '09:00',
  windowEndTime: '09:08',
  randomWindowMinutes: 8,
  userIds: [],
  manualUserIds: '',
};

const JOB_STATUS_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'scheduled', label: '待执行' },
  { value: 'running', label: '执行中' },
  { value: 'partial', label: '部分完成' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
];

const JOB_ITEM_STATUS_COLOR = {
  pending: 'grey',
  running: 'blue',
  success: 'green',
  failed: 'red',
  skipped: 'yellow',
  cancelled: 'grey',
};

const JOB_STATUS_COLOR = {
  scheduled: 'grey',
  running: 'blue',
  partial: 'yellow',
  completed: 'green',
  cancelled: 'grey',
};

const quotaToCNY = (quota) => {
  const value = Number(quota || 0);
  if (!Number.isFinite(value) || value <= 0) {
    return '¥0.00';
  }
  const cny = value / CHECKIN_QUOTA_PER_CNY;
  if (cny >= 1000) {
    return `¥${cny.toFixed(2)}`;
  }
  if (cny >= 1) {
    return `¥${cny.toFixed(3)}`;
  }
  return `¥${cny.toFixed(4)}`;
};

const formatDateInput = (date = new Date()) => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI_TIME_ZONE,
  }).format(date);
};

const parseTimeToSeconds = (value) => {
  const trimmed = String(value || '').trim();
  const parts = trimmed.split(':').map((part) => Number(part));
  if (![2, 3].includes(parts.length) || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }
  const [hours, minutes, seconds = 0] = parts;
  if (
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds;
};

const formatSeconds = (value) => {
  const total = Number(value || 0);
  if (!Number.isFinite(total) || total < 0) {
    return '-';
  }
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
};

const parseManualUserIds = (value) => {
  return Array.from(
    new Set(
      String(value || '')
        .split(/[\s,，]+/)
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0),
    ),
  );
};

const safeParseUserIds = (value) => {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0);
  }
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0);
  } catch {
    return [];
  }
};

const buildUserOption = (user) => {
  const labelParts = [
    user?.username || '',
    user?.email ? `(${user.email})` : '',
    Number.isFinite(Number(user?.id)) ? `#${user.id}` : '',
  ].filter(Boolean);
  return {
    value: Number(user?.id),
    label: labelParts.join(' '),
  };
};

const getJobStatusText = (status, t) => {
  const map = {
    scheduled: t('待执行'),
    running: t('执行中'),
    partial: t('部分完成'),
    completed: t('已完成'),
    cancelled: t('已取消'),
    pending: t('待执行'),
    success: t('成功'),
    failed: t('失败'),
    skipped: t('已跳过'),
  };
  return map[status] || status || '-';
};

const buildJobWindowText = (record) => {
  if (!record) {
    return '-';
  }
  return `${formatSeconds(record.window_start_seconds)} - ${formatSeconds(record.window_end_seconds)}`;
};

const buildRandomWindowText = (record, t) => {
  const seconds = Number(record?.random_window_seconds || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return t('无随机偏移');
  }
  if (seconds % 60 === 0) {
    return `${seconds / 60} ${t('分钟')}`;
  }
  return `${seconds} ${t('秒')}`;
};

const isJobCancellable = (record) => {
  const status = String(record?.status || '').trim();
  return status !== 'cancelled' && status !== 'completed';
};

const CheckinAdminPage = () => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  const [activeTab, setActiveTab] = useState(TAB_RECORDS);

  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState(null);
  const [recordLoading, setRecordLoading] = useState(false);
  const [recordPage, setRecordPage] = useState(1);
  const [recordPageSize, setRecordPageSize] = useState(20);
  const [recordTotal, setRecordTotal] = useState(0);
  const [recordFilters, setRecordFilters] = useState(DEFAULT_RECORD_FILTERS);
  const [recordQuery, setRecordQuery] = useState(DEFAULT_RECORD_FILTERS);

  const [jobs, setJobs] = useState([]);
  const [jobLoading, setJobLoading] = useState(false);
  const [jobPage, setJobPage] = useState(1);
  const [jobPageSize, setJobPageSize] = useState(10);
  const [jobTotal, setJobTotal] = useState(0);
  const [jobFilters, setJobFilters] = useState(DEFAULT_JOB_FILTERS);
  const [jobQuery, setJobQuery] = useState(DEFAULT_JOB_FILTERS);
  const [selectedJobRowKeys, setSelectedJobRowKeys] = useState([]);

  const [createVisible, setCreateVisible] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createForm, setCreateForm] = useState({
    ...DEFAULT_CREATE_FORM,
    targetDate: formatDateInput(),
  });
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [userSearchOptions, setUserSearchOptions] = useState([]);
  const [selectedUserOptionMap, setSelectedUserOptionMap] = useState({});
  const [selectedUserPreviewOpen, setSelectedUserPreviewOpen] = useState(false);
  const searchTimerRef = useRef(null);

  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [detailPage, setDetailPage] = useState(1);
  const [detailPageSize, setDetailPageSize] = useState(10);

  const loadRecords = useCallback(async () => {
    setRecordLoading(true);
    try {
      const res = await API.get('/api/checkin/admin/records', {
        params: {
          page: recordPage,
          page_size: recordPageSize,
          keyword: recordQuery.keyword?.trim() || undefined,
          user_id: recordQuery.userId || undefined,
          start_date: recordQuery.startDate?.trim() || undefined,
          end_date: recordQuery.endDate?.trim() || undefined,
        },
      });
      if (res.data?.success) {
        setRecords(res.data?.data?.items || []);
        setRecordTotal(Number(res.data?.data?.total || 0));
        setStats(res.data?.data?.stats || null);
      } else {
        showError(res.data?.message || t('获取签到记录失败'));
      }
    } catch (error) {
      showError(error?.response?.data?.message || t('获取签到记录失败'));
    } finally {
      setRecordLoading(false);
    }
  }, [recordPage, recordPageSize, recordQuery, t]);

  const loadJobs = useCallback(async () => {
    setJobLoading(true);
    try {
      const res = await API.get('/api/checkin/admin/auto_jobs', {
        params: {
          page: jobPage,
          page_size: jobPageSize,
          target_date: jobQuery.targetDate?.trim() || undefined,
          status: jobQuery.status || undefined,
        },
      });
      if (res.data?.success) {
        setJobs(res.data?.data?.items || []);
        setJobTotal(Number(res.data?.data?.total || 0));
        setSelectedJobRowKeys((prev) =>
          prev.filter((id) => (res.data?.data?.items || []).some((item) => item?.id === id)),
        );
      } else {
        showError(res.data?.message || t('获取自动签到任务失败'));
      }
    } catch (error) {
      showError(error?.response?.data?.message || t('获取自动签到任务失败'));
    } finally {
      setJobLoading(false);
    }
  }, [jobPage, jobPageSize, jobQuery, t]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    if (activeTab === TAB_AUTO_JOBS) {
      loadJobs();
    }
  }, [activeTab, loadJobs]);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  const loadUserOptions = useCallback(
    async (keyword = '') => {
      setUserSearchLoading(true);
      try {
        const res = await API.get('/api/user/search', {
          params: {
            keyword: String(keyword || '').trim() || undefined,
            page: 1,
            page_size: 12,
          },
        });
        if (res.data?.success) {
          const items = res.data?.data?.items || [];
          const options = items.map(buildUserOption);
          setUserSearchOptions(options);
          setSelectedUserOptionMap((prev) => {
            const next = { ...prev };
            options.forEach((item) => {
              next[item.value] = item;
            });
            return next;
          });
        } else {
          showError(res.data?.message || t('搜索用户失败'));
        }
      } catch (error) {
        showError(error?.response?.data?.message || t('搜索用户失败'));
      } finally {
        setUserSearchLoading(false);
      }
    },
    [t],
  );

  const handleSearchUsers = useCallback(
    (keyword) => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
      searchTimerRef.current = setTimeout(() => {
        loadUserOptions(keyword);
      }, 300);
    },
    [loadUserOptions],
  );

  const handleOpenCreateModal = () => {
    setCreateForm({
      ...DEFAULT_CREATE_FORM,
      targetDate: formatDateInput(),
    });
    setUserSearchOptions([]);
    setSelectedUserOptionMap({});
    setSelectedUserPreviewOpen(false);
    setCreateVisible(true);
    loadUserOptions('');
  };

  const mergeSelectedUserIds = useCallback(
    (formState) => {
      const remoteUserIds = Array.isArray(formState?.userIds) ? formState.userIds : [];
      const manualUserIds = parseManualUserIds(formState?.manualUserIds);
      return Array.from(
        new Set(
          [...remoteUserIds, ...manualUserIds]
            .map((item) => Number(item))
            .filter((item) => Number.isInteger(item) && item > 0),
        ),
      );
    },
    [],
  );

  const handleCreateJob = async () => {
    const targetDate = String(createForm.targetDate || '').trim();
    const windowStartSeconds = parseTimeToSeconds(createForm.windowStartTime);
    const windowEndSeconds = parseTimeToSeconds(createForm.windowEndTime);
    if (!targetDate) {
      showInfo(t('请输入目标日期'));
      return;
    }
    if (windowStartSeconds === null || windowEndSeconds === null) {
      showInfo(t('请输入正确的时间格式'));
      return;
    }
    const mergedUserIds = mergeSelectedUserIds(createForm);
    if (!mergedUserIds.length) {
      showInfo(t('请至少选择一个用户'));
      return;
    }
    setCreateSubmitting(true);
    try {
      const res = await API.post('/api/checkin/admin/auto_jobs', {
        name: createForm.name?.trim() || '',
        target_date: targetDate,
        window_start_seconds: windowStartSeconds,
        window_end_seconds: windowEndSeconds,
        random_window_seconds: Number(createForm.randomWindowMinutes || 0) * 60,
        user_ids: mergedUserIds,
      });
      if (res.data?.success) {
        showSuccess(t('任务创建成功'));
        setCreateVisible(false);
        setActiveTab(TAB_AUTO_JOBS);
        setJobPage(1);
        await loadJobs();
      } else {
        showError(res.data?.message || t('创建自动签到任务失败'));
      }
    } catch (error) {
      showError(error?.response?.data?.message || t('创建自动签到任务失败'));
    } finally {
      setCreateSubmitting(false);
    }
  };

  const loadJobDetail = useCallback(
    async (jobId) => {
      if (!jobId) {
        return;
      }
      setDetailLoading(true);
      try {
        const res = await API.get(`/api/checkin/admin/auto_jobs/${jobId}`);
        if (res.data?.success) {
          setDetailData(res.data?.data || null);
          setDetailPage(1);
          setDetailVisible(true);
        } else {
          showError(res.data?.message || t('获取任务详情失败'));
        }
      } catch (error) {
        showError(error?.response?.data?.message || t('获取任务详情失败'));
      } finally {
        setDetailLoading(false);
      }
    },
    [t],
  );

  const handleCancelJob = useCallback(
    (record) => {
      if (!isJobCancellable(record)) {
        showInfo(t('当前任务状态不允许取消'));
        return;
      }
      Modal.confirm({
        title: t('取消任务'),
        content: t('取消后，未执行的签到用户将不再继续执行。'),
        okText: t('确认取消'),
        cancelText: t('再想想'),
        onOk: async () => {
          try {
            const res = await API.post(`/api/checkin/admin/auto_jobs/${record.id}/cancel`);
            if (res.data?.success) {
              showSuccess(t('任务已取消'));
              if (detailData?.job?.id === record.id) {
                setDetailVisible(false);
                setDetailData(null);
              }
              await loadJobs();
            } else {
              showError(res.data?.message || t('取消任务失败'));
            }
          } catch (error) {
            showError(error?.response?.data?.message || t('取消任务失败'));
          }
        },
      });
    },
    [detailData?.job?.id, loadJobs, t],
  );

  const handleBatchCancelJobs = useCallback(() => {
    const cancellableJobIds = jobs
      .filter((item) => selectedJobRowKeys.includes(item?.id) && isJobCancellable(item))
      .map((item) => item.id);

    if (!cancellableJobIds.length) {
      showInfo(t('请先选择要取消的任务'));
      return;
    }
    Modal.confirm({
      title: t('批量取消任务'),
      content: t('批量取消后，未执行的签到用户将不再继续执行。'),
      okText: t('确认取消'),
      cancelText: t('再想想'),
      onOk: async () => {
        let success = 0;
        let failed = 0;
        for (const jobId of cancellableJobIds) {
          try {
            const res = await API.post(`/api/checkin/admin/auto_jobs/${jobId}/cancel`);
            if (res.data?.success) {
              success += 1;
            } else {
              failed += 1;
            }
          } catch {
            failed += 1;
          }
        }
        if (success > 0) {
          showSuccess(
            t('批量取消完成，成功 {{success}} 个，失败 {{failed}} 个。', {
              success,
              failed,
            }),
          );
        } else {
          showError(t('批量取消任务失败'));
        }
        setSelectedJobRowKeys([]);
        await loadJobs();
      },
    });
  }, [jobs, loadJobs, selectedJobRowKeys, t]);

  const handleCopyUserIds = useCallback(async () => {
    const userIds = safeParseUserIds(detailData?.job?.user_ids_json);
    if (!userIds.length) {
      showInfo(t('暂无可复制的用户ID'));
      return;
    }
    try {
      await navigator.clipboard.writeText(userIds.join(','));
      showSuccess(t('用户ID已复制'));
    } catch {
      showError(t('复制失败'));
    }
  }, [detailData?.job?.user_ids_json, t]);

  const handleCloneJob = useCallback(
    (job) => {
      if (!job) {
        return;
      }
      const startSeconds = Number(job.window_start_seconds || 0);
      const endSeconds = Number(job.window_end_seconds || 0);
      const userIds = safeParseUserIds(job.user_ids_json);
      setCreateForm({
        name: job.name ? `${job.name} ${t('副本')}` : '',
        targetDate: formatDateInput(),
        windowStartTime: formatSeconds(startSeconds).slice(0, 5),
        windowEndTime: formatSeconds(endSeconds).slice(0, 5),
        randomWindowMinutes: Math.floor(Number(job.random_window_seconds || 0) / 60),
        userIds,
        manualUserIds: userIds.join(','),
      });
      const optionMap = {};
      userIds.forEach((id) => {
        optionMap[id] = { value: id, label: `#${id}` };
      });
      setSelectedUserOptionMap(optionMap);
      setUserSearchOptions(Object.values(optionMap));
      setSelectedUserPreviewOpen(true);
      setCreateVisible(true);
      loadUserOptions('');
    },
    [loadUserOptions, t],
  );

  const recordColumns = useMemo(
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
        render: (_, record) => {
          const quota = Number(record?.quota_awarded || 0);
          return (
            <div className='leading-tight'>
              <div className='font-semibold text-semi-color-text-0'>
                {quotaToCNY(quota)}
              </div>
              <div className='mt-1 text-xs text-semi-color-text-2'>
                {renderNumber(quota)} token
              </div>
            </div>
          );
        },
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

  const jobColumns = useMemo(
    () => [
      {
        title: 'ID',
        dataIndex: 'id',
        key: 'id',
        width: 80,
      },
      {
        title: t('任务名称'),
        dataIndex: 'name',
        key: 'name',
        render: (_, record) => record?.name || `#${record?.id || '-'}`,
      },
      {
        title: t('目标日期'),
        dataIndex: 'target_date',
        key: 'target_date',
        width: 120,
        render: (_, record) => (
          <Tag color='blue' shape='circle'>
            {record?.target_date || '-'}
          </Tag>
        ),
      },
      {
        title: t('时间窗口'),
        dataIndex: 'window_start_seconds',
        key: 'window',
        render: (_, record) => buildJobWindowText(record),
      },
      {
        title: t('随机偏移'),
        dataIndex: 'random_window_seconds',
        key: 'random_window_seconds',
        render: (_, record) => buildRandomWindowText(record, t),
      },
      {
        title: t('用户数'),
        dataIndex: 'item_count',
        key: 'item_count',
        width: 90,
      },
      {
        title: t('执行进度'),
        key: 'progress',
        render: (_, record) => (
          <div className='leading-tight'>
            <div className='font-medium text-semi-color-text-0'>
              {Number(record?.success_count || 0)} / {Number(record?.item_count || 0)}
            </div>
            <div className='mt-1 text-xs text-semi-color-text-2'>
              {t('失败')} {Number(record?.failed_count || 0)} / {t('跳过')}{' '}
              {Number(record?.skipped_count || 0)}
            </div>
          </div>
        ),
      },
      {
        title: t('状态'),
        dataIndex: 'status',
        key: 'status',
        width: 110,
        render: (_, record) => (
          <Tag color={JOB_STATUS_COLOR[record?.status] || 'grey'}>
            {getJobStatusText(record?.status, t)}
          </Tag>
        ),
      },
      {
        title: t('创建时间'),
        dataIndex: 'created_at',
        key: 'created_at',
        width: 180,
        render: (_, record) =>
          record?.created_at ? timestamp2string(record.created_at) : '-',
      },
      {
        title: t('操作'),
        key: 'actions',
        width: 190,
        render: (_, record) => (
          <Space wrap>
            <Button
              theme='outline'
              size='small'
              loading={detailLoading && detailData?.job?.id === record?.id}
              onClick={() => loadJobDetail(record?.id)}
            >
              {t('详情')}
            </Button>
            {record?.status !== 'cancelled' && record?.status !== 'completed' ? (
              <Button
                theme='light'
                type='danger'
                size='small'
                onClick={() => handleCancelJob(record)}
              >
                {t('取消')}
              </Button>
            ) : null}
          </Space>
        ),
      },
    ],
    [detailData?.job?.id, detailLoading, handleCancelJob, loadJobDetail, t],
  );

  const jobItemColumns = useMemo(
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
        title: t('计划时间'),
        dataIndex: 'scheduled_at',
        key: 'scheduled_at',
        render: (_, record) =>
          record?.scheduled_at ? timestamp2string(record.scheduled_at) : '-',
      },
      {
        title: t('执行时间'),
        dataIndex: 'executed_at',
        key: 'executed_at',
        render: (_, record) =>
          record?.executed_at ? timestamp2string(record.executed_at) : '-',
      },
      {
        title: t('状态'),
        dataIndex: 'status',
        key: 'status',
        render: (_, record) => (
          <Tag color={JOB_ITEM_STATUS_COLOR[record?.status] || 'grey'}>
            {getJobStatusText(record?.status, t)}
          </Tag>
        ),
      },
      {
        title: t('奖励额度'),
        dataIndex: 'quota_awarded',
        key: 'quota_awarded',
        render: (_, record) =>
          Number(record?.quota_awarded || 0) > 0
            ? `${quotaToCNY(record?.quota_awarded)} / ${renderNumber(record?.quota_awarded)} token`
            : '-',
      },
      {
        title: t('错误信息'),
        dataIndex: 'error_message',
        key: 'error_message',
        render: (_, record) => record?.error_message || '-',
      },
    ],
    [t],
  );

  const recordStatsArea = (
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
          {quotaToCNY(stats?.total_quota || 0)}
        </div>
        <div className='mt-1 text-xs text-semi-color-text-2'>
          {renderNumber(Number(stats?.total_quota || 0))} token
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

  const jobStats = useMemo(() => {
    return jobs.reduce(
      (acc, item) => {
        acc.scheduled += item?.status === 'scheduled' ? 1 : 0;
        acc.running += item?.status === 'running' ? 1 : 0;
        acc.completed += item?.status === 'completed' ? 1 : 0;
        acc.partial += item?.status === 'partial' ? 1 : 0;
        return acc;
      },
      {
        scheduled: 0,
        running: 0,
        completed: 0,
        partial: 0,
      },
    );
  }, [jobs]);

  const jobStatsArea = (
    <div className='grid grid-cols-2 gap-3 md:grid-cols-4'>
      <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3'>
        <div className='text-xs text-gray-500'>{t('任务总数')}</div>
        <div className='mt-1 text-xl font-semibold'>{Number(jobTotal || 0)}</div>
      </div>
      <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3'>
        <div className='text-xs text-gray-500'>{t('待执行')}</div>
        <div className='mt-1 text-xl font-semibold'>{jobStats.scheduled}</div>
      </div>
      <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3'>
        <div className='text-xs text-gray-500'>{t('执行中')}</div>
        <div className='mt-1 text-xl font-semibold'>{jobStats.running}</div>
      </div>
      <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3'>
        <div className='text-xs text-gray-500'>{t('已完成 / 部分完成')}</div>
        <div className='mt-1 text-xl font-semibold'>
          {jobStats.completed} / {jobStats.partial}
        </div>
      </div>
    </div>
  );

  const detailItems = detailData?.items || [];
  const pagedDetailItems = detailItems.slice(
    (detailPage - 1) * detailPageSize,
    detailPage * detailPageSize,
  );

  const selectedUserCount = useMemo(() => {
    return mergeSelectedUserIds(createForm).length;
  }, [createForm, mergeSelectedUserIds]);

  const selectedUserPreview = useMemo(() => {
    return mergeSelectedUserIds(createForm).slice(0, 50);
  }, [createForm, mergeSelectedUserIds]);

  const mergedUserOptions = useMemo(() => {
    const mergedMap = { ...selectedUserOptionMap };
    userSearchOptions.forEach((item) => {
      mergedMap[item.value] = item;
    });
    return Object.values(mergedMap);
  }, [selectedUserOptionMap, userSearchOptions]);

  const jobRowSelection = useMemo(
    () => ({
      selectedRowKeys: selectedJobRowKeys,
      getCheckboxProps: (record) => ({
        disabled: !isJobCancellable(record),
      }),
      onChange: (keys, rows) =>
        setSelectedJobRowKeys(
          (Array.isArray(rows) ? rows : []).filter((item) => isJobCancellable(item)).map((item) => item.id),
        ),
    }),
    [selectedJobRowKeys],
  );

  return (
    <div className='mt-[60px] px-2'>
      <Tabs
        type='card'
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key)}
      >
        <TabPane tab={t('签到记录')} itemKey={TAB_RECORDS}>
          <CardPro
            type='type2'
            statsArea={recordStatsArea}
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
                  <Button theme='outline' onClick={loadRecords} loading={recordLoading}>
                    {t('刷新')}
                  </Button>
                </div>
                <Space wrap align='end'>
                  <Input
                    value={recordFilters.keyword}
                    onChange={(value) =>
                      setRecordFilters((prev) => ({ ...prev, keyword: value }))
                    }
                    placeholder={t('搜索用户名或昵称')}
                    showClear
                    style={{ width: 220 }}
                  />
                  <InputNumber
                    value={recordFilters.userId}
                    onChange={(value) =>
                      setRecordFilters((prev) => ({ ...prev, userId: value }))
                    }
                    placeholder={t('用户ID')}
                    min={1}
                    style={{ width: 140 }}
                  />
                  <Input
                    value={recordFilters.startDate}
                    onChange={(value) =>
                      setRecordFilters((prev) => ({ ...prev, startDate: value }))
                    }
                    placeholder={t('开始日期')}
                    showClear
                    style={{ width: 160 }}
                  />
                  <Input
                    value={recordFilters.endDate}
                    onChange={(value) =>
                      setRecordFilters((prev) => ({ ...prev, endDate: value }))
                    }
                    placeholder={t('结束日期')}
                    showClear
                    style={{ width: 160 }}
                  />
                  <Button
                    type='primary'
                    onClick={() => {
                      setRecordPage(1);
                      setRecordQuery(recordFilters);
                    }}
                  >
                    {t('查询')}
                  </Button>
                  <Button
                    theme='outline'
                    onClick={() => {
                      setRecordFilters(DEFAULT_RECORD_FILTERS);
                      setRecordPage(1);
                      setRecordQuery(DEFAULT_RECORD_FILTERS);
                    }}
                  >
                    {t('重置筛选')}
                  </Button>
                </Space>
              </div>
            }
            paginationArea={createCardProPagination({
              currentPage: recordPage,
              pageSize: recordPageSize,
              total: recordTotal,
              onPageChange: setRecordPage,
              onPageSizeChange: (size) => {
                setRecordPageSize(size);
                setRecordPage(1);
              },
              isMobile,
              t,
            })}
            t={t}
          >
            <CardTable
              columns={recordColumns}
              dataSource={records}
              loading={recordLoading}
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
        </TabPane>

        <TabPane tab={t('自动签到任务')} itemKey={TAB_AUTO_JOBS}>
          <CardPro
            type='type2'
            statsArea={jobStatsArea}
            searchArea={
              <div className='flex flex-col gap-3'>
                <Banner
                  type='info'
                  bordered={false}
                  closeIcon={null}
                  description={t('自动签到任务的日期与时间按东八区（Asia/Shanghai）计算，并正常计入每日签到名额与统计。')}
                />
                <div className='flex flex-col gap-2 md:flex-row md:items-center md:justify-between'>
                  <div>
                    <div className='text-base font-semibold text-semi-color-text-0'>
                      {t('自动签到任务')}
                    </div>
                    <Text type='tertiary' size='small'>
                      {t('管理后台定时签到任务并查看执行明细')}
                    </Text>
                  </div>
                  <Space wrap>
                    <Button theme='outline' onClick={loadJobs} loading={jobLoading}>
                      {t('刷新')}
                    </Button>
                    <Button
                      theme='light'
                      type='danger'
                      disabled={!selectedJobRowKeys.length}
                      onClick={handleBatchCancelJobs}
                    >
                      {t('批量取消')}
                    </Button>
                    <Button type='primary' onClick={handleOpenCreateModal}>
                      {t('新建任务')}
                    </Button>
                  </Space>
                </div>
                <Space wrap align='end'>
                  <Input
                    value={jobFilters.targetDate}
                    onChange={(value) =>
                      setJobFilters((prev) => ({ ...prev, targetDate: value }))
                    }
                    placeholder={t('目标日期')}
                    showClear
                    style={{ width: 180 }}
                  />
                  <Select
                    value={jobFilters.status}
                    onChange={(value) =>
                      setJobFilters((prev) => ({ ...prev, status: value }))
                    }
                    optionList={JOB_STATUS_OPTIONS.map((item) => ({
                      label: t(item.label),
                      value: item.value,
                    }))}
                    placeholder={t('状态')}
                    style={{ width: 180 }}
                  />
                  <Button
                    type='primary'
                    onClick={() => {
                      setJobPage(1);
                      setJobQuery(jobFilters);
                    }}
                  >
                    {t('查询')}
                  </Button>
                  <Button
                    theme='outline'
                    onClick={() => {
                      setJobFilters(DEFAULT_JOB_FILTERS);
                      setJobPage(1);
                      setJobQuery(DEFAULT_JOB_FILTERS);
                    }}
                  >
                    {t('重置筛选')}
                  </Button>
                </Space>
              </div>
            }
            paginationArea={createCardProPagination({
              currentPage: jobPage,
              pageSize: jobPageSize,
              total: jobTotal,
              onPageChange: setJobPage,
              onPageSizeChange: (size) => {
                setJobPageSize(size);
                setJobPage(1);
              },
              isMobile,
              t,
            })}
            t={t}
          >
            <CardTable
              columns={jobColumns}
              dataSource={jobs}
              loading={jobLoading}
              rowKey='id'
              rowSelection={jobRowSelection}
              pagination={false}
              empty={
                <Empty
                  image={<IllustrationNoResult />}
                  darkModeImage={<IllustrationNoResultDark />}
                  description={t('暂无自动签到任务')}
                />
              }
            />
          </CardPro>
        </TabPane>
      </Tabs>

      <Modal
        title={t('创建自动签到任务')}
        visible={createVisible}
        onCancel={() => setCreateVisible(false)}
        onOk={handleCreateJob}
        okText={t('创建任务')}
        cancelText={t('取消')}
        confirmLoading={createSubmitting}
        width={760}
      >
        <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
          <div>
            <div className='mb-1 text-sm font-medium text-semi-color-text-0'>
              {t('任务名称')}
            </div>
            <Input
              value={createForm.name}
              onChange={(value) =>
                setCreateForm((prev) => ({ ...prev, name: value }))
              }
              placeholder={t('可选，方便后续识别')}
            />
          </div>
          <div>
            <div className='mb-1 text-sm font-medium text-semi-color-text-0'>
              {t('目标日期')}
            </div>
            <Input
              value={createForm.targetDate}
              onChange={(value) =>
                setCreateForm((prev) => ({ ...prev, targetDate: value }))
              }
              placeholder='YYYY-MM-DD'
            />
          </div>
          <div>
            <div className='mb-1 text-sm font-medium text-semi-color-text-0'>
              {t('开始时间')}
            </div>
            <Input
              value={createForm.windowStartTime}
              onChange={(value) =>
                setCreateForm((prev) => ({ ...prev, windowStartTime: value }))
              }
              placeholder='HH:mm'
            />
          </div>
          <div>
            <div className='mb-1 text-sm font-medium text-semi-color-text-0'>
              {t('结束时间')}
            </div>
            <Input
              value={createForm.windowEndTime}
              onChange={(value) =>
                setCreateForm((prev) => ({ ...prev, windowEndTime: value }))
              }
              placeholder='HH:mm'
            />
          </div>
          <div>
            <div className='mb-1 text-sm font-medium text-semi-color-text-0'>
              {t('随机偏移')}
            </div>
            <InputNumber
              value={createForm.randomWindowMinutes}
              min={0}
              max={1440}
              onChange={(value) =>
                setCreateForm((prev) => ({
                  ...prev,
                  randomWindowMinutes: Number(value || 0),
                }))
              }
              suffix={t('分钟')}
              style={{ width: '100%' }}
            />
          </div>
          <div className='rounded-xl border border-dashed border-semi-color-border bg-semi-color-fill-0 p-3'>
            <div className='text-sm font-medium text-semi-color-text-0'>
              {t('已选用户数')}
            </div>
            <div className='mt-1 text-2xl font-semibold text-semi-color-text-0'>
              {selectedUserCount}
            </div>
            <div className='mt-1 text-xs text-semi-color-text-2'>
              {t('自动签到会正常写入签到记录与统计')}
            </div>
          </div>
        </div>

        <div className='mt-4'>
          <div className='mb-1 text-sm font-medium text-semi-color-text-0'>
            {t('选择用户列表')}
          </div>
          <Select
            multiple
            filter={false}
            remote
            value={createForm.userIds}
            loading={userSearchLoading}
            optionList={mergedUserOptions}
            onSearch={handleSearchUsers}
            onDropdownVisibleChange={(visible) => {
              if (visible && !userSearchOptions.length) {
                loadUserOptions('');
              }
            }}
            onChange={(value) =>
              setCreateForm((prev) => ({
                ...prev,
                userIds: Array.isArray(value) ? value : [],
              }))
            }
            placeholder={t('搜索用户 ID / 用户名 / 邮箱')}
            autoClearSearchValue={false}
            searchPosition='dropdown'
            showClear
            style={{ width: '100%' }}
          />
        </div>

        <div className='mt-4'>
          <div className='mb-1 text-sm font-medium text-semi-color-text-0'>
            {t('手动补充用户ID')}
          </div>
          <TextArea
            value={createForm.manualUserIds}
            onChange={(value) =>
              setCreateForm((prev) => ({ ...prev, manualUserIds: value }))
            }
            autosize={{ minRows: 4, maxRows: 8 }}
            placeholder={t('支持逗号、空格或换行分隔')}
          />
        </div>
        <div className='mt-4 rounded-xl border border-dashed border-semi-color-border bg-semi-color-fill-0 p-3'>
          <div className='flex items-center justify-between gap-3'>
            <div>
              <div className='text-sm font-medium text-semi-color-text-0'>
                {t('已选用户预览')}
              </div>
              <div className='mt-1 text-xs text-semi-color-text-2'>
                {t('最多展示前 {{count}} 个用户ID，完整列表以提交内容为准。', {
                  count: 50,
                })}
              </div>
            </div>
            <Button
              theme='outline'
              size='small'
              onClick={() => setSelectedUserPreviewOpen((prev) => !prev)}
            >
              {selectedUserPreviewOpen ? t('收起') : t('展开')}
            </Button>
          </div>
          <Collapsible isOpen={selectedUserPreviewOpen} keepDOM>
            <div className='mt-3 flex flex-wrap gap-2'>
              {selectedUserPreview.length ? (
                selectedUserPreview.map((userId) => (
                  <Tag key={userId} color='grey'>
                    #{userId}
                  </Tag>
                ))
              ) : (
                <Text type='tertiary' size='small'>
                  {t('当前还未选择用户')}
                </Text>
              )}
            </div>
          </Collapsible>
        </div>
      </Modal>

      <Modal
        title={t('任务详情')}
        visible={detailVisible}
        onCancel={() => {
          setDetailVisible(false);
          setDetailData(null);
        }}
        footer={null}
        width={980}
      >
        {detailData?.job ? (
          <div className='flex flex-col gap-4'>
            <div className='grid grid-cols-2 gap-3 md:grid-cols-4'>
              <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3'>
                <div className='text-xs text-gray-500'>{t('任务名称')}</div>
                <div className='mt-1 text-sm font-semibold text-semi-color-text-0'>
                  {detailData.job?.name || `#${detailData.job?.id}`}
                </div>
              </div>
              <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3'>
                <div className='text-xs text-gray-500'>{t('目标日期')}</div>
                <div className='mt-1 text-sm font-semibold text-semi-color-text-0'>
                  {detailData.job?.target_date || '-'}
                </div>
              </div>
              <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3'>
                <div className='text-xs text-gray-500'>{t('时间窗口')}</div>
                <div className='mt-1 text-sm font-semibold text-semi-color-text-0'>
                  {buildJobWindowText(detailData.job)}
                </div>
              </div>
              <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3'>
                <div className='text-xs text-gray-500'>{t('随机偏移')}</div>
                <div className='mt-1 text-sm font-semibold text-semi-color-text-0'>
                  {buildRandomWindowText(detailData.job, t)}
                </div>
              </div>
            </div>

            <div className='grid grid-cols-2 gap-3 md:grid-cols-5'>
              <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3'>
                <div className='text-xs text-gray-500'>{t('用户数')}</div>
                <div className='mt-1 text-xl font-semibold'>
                  {Number(detailData.job?.item_count || 0)}
                </div>
              </div>
              <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3'>
                <div className='text-xs text-gray-500'>{t('成功')}</div>
                <div className='mt-1 text-xl font-semibold'>
                  {Number(detailData.job?.success_count || 0)}
                </div>
              </div>
              <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3'>
                <div className='text-xs text-gray-500'>{t('失败')}</div>
                <div className='mt-1 text-xl font-semibold'>
                  {Number(detailData.job?.failed_count || 0)}
                </div>
              </div>
              <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3'>
                <div className='text-xs text-gray-500'>{t('已跳过')}</div>
                <div className='mt-1 text-xl font-semibold'>
                  {Number(detailData.job?.skipped_count || 0)}
                </div>
              </div>
              <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3'>
                <div className='text-xs text-gray-500'>{t('状态')}</div>
                <div className='mt-2'>
                  <Tag color={JOB_STATUS_COLOR[detailData.job?.status] || 'grey'}>
                    {getJobStatusText(detailData.job?.status, t)}
                  </Tag>
                </div>
              </div>
            </div>

            <div className='flex flex-wrap gap-2'>
              <Button theme='outline' onClick={handleCopyUserIds}>
                {t('复制用户ID')}
              </Button>
              <Button type='primary' theme='light' onClick={() => handleCloneJob(detailData.job)}>
                {t('按此创建任务')}
              </Button>
              {detailData.job?.status !== 'cancelled' && detailData.job?.status !== 'completed' ? (
                <Button type='danger' theme='light' onClick={() => handleCancelJob(detailData.job)}>
                  {t('取消任务')}
                </Button>
              ) : null}
            </div>

            <div>
              <div className='mb-3 text-base font-semibold text-semi-color-text-0'>
                {t('执行明细')}
              </div>
              <CardTable
                columns={jobItemColumns}
                dataSource={pagedDetailItems}
                loading={detailLoading}
                rowKey='id'
                pagination={false}
                empty={
                  <Empty
                    image={<IllustrationNoResult />}
                    darkModeImage={<IllustrationNoResultDark />}
                    description={t('暂无执行明细')}
                  />
                }
              />
              <div className='mt-4'>
                {createCardProPagination({
                  currentPage: detailPage,
                  pageSize: detailPageSize,
                  total: detailItems.length,
                  onPageChange: setDetailPage,
                  onPageSizeChange: (size) => {
                    setDetailPageSize(size);
                    setDetailPage(1);
                  },
                  isMobile,
                  t,
                })}
              </div>
            </div>
          </div>
        ) : (
          <Empty
            image={<IllustrationNoResult />}
            darkModeImage={<IllustrationNoResultDark />}
            description={t('暂无任务详情')}
          />
        )}
      </Modal>
    </div>
  );
};

export default CheckinAdminPage;
