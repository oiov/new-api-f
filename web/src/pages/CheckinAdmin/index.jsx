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

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Banner,
  Button,
  Collapsible,
  DatePicker,
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
const TAB_LOTTERY = 'lottery';
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

const DEFAULT_LOTTERY_FORM = {
  title: '',
  prize: '',
  prizeContent: '',
  joinSources: ['manual'],
  joinTopupMinMoney: 0,
  joinTopupScope: 'today',
  joinTopupUnit: 'money',
  joinDailyConsumeMinMoney: 0,
  joinDailyConsumeScope: 'today',
  joinDailyConsumeThresholdUnit: 'money',
  startAt: '',
  endAt: '',
  minParticipants: 200,
  winnerCount: 3,
  published: true,
};

const DEFAULT_LOTTERY_ENTRY_FILTERS = {
  keyword: '',
  source: '',
};

const ACTIVITY_LOTTERY_JOIN_SOURCE_OPTIONS = [
  { value: 'manual', label: '本页手动报名' },
  { value: 'checkin', label: '报名后完成签到' },
  { value: 'topup', label: '报名后充值达标' },
  { value: 'consume', label: '报名后消耗达标' },
];

const ACTIVITY_LOTTERY_SCOPE_OPTIONS = [
  { value: 'today', label: '今日' },
  { value: 'total', label: '累计' },
];

const ACTIVITY_LOTTERY_UNIT_OPTIONS = [
  { value: 'money', label: '人民币' },
  { value: 'token', label: 'Token' },
];

const renderEllipsisText = (value, maxWidth = 220) => {
  const text = String(value || '').trim();
  if (!text) return '-';
  return (
    <Text ellipsis={{ showTooltip: true }} style={{ maxWidth, display: 'block' }}>
      {text}
    </Text>
  );
};

const normalizeJoinSources = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const buildLotteryConditionSummary = (record, t) => {
  const joinSources = normalizeJoinSources(record?.join_sources || 'manual');
  const parts = joinSources
    .map((source) => {
      const option = ACTIVITY_LOTTERY_JOIN_SOURCE_OPTIONS.find(
        (item) => item.value === source,
      );
      return t(option?.label || source);
    })
    .filter(Boolean);
  if (joinSources.includes('topup')) {
    parts.push(
      `${t(record?.join_topup_scope === 'total' ? '累计充值' : '今日充值')} · ${t(
        record?.join_topup_unit === 'token' ? 'Token' : '人民币',
      )} ≥ ${Number(record?.join_topup_min_money || 0)}`,
    );
  }
  if (joinSources.includes('consume')) {
    parts.push(
      `${t(record?.join_daily_consume_scope === 'total' ? '累计消耗' : '今日消耗')} · ${t(
        record?.join_daily_consume_threshold_unit === 'token'
          ? 'Token'
          : '人民币',
      )} ≥ ${Number(record?.join_daily_consume_min_money || 0)}`,
    );
  }
  parts.push(`${t('人数')} ${Number(record?.participant_count || 0)} / ${Number(record?.min_participants || 0) || 0}`);
  return parts.join('；');
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
  if (
    ![2, 3].includes(parts.length) ||
    parts.some((part) => !Number.isFinite(part))
  ) {
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

const parseDateTimeToUnix = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes('T')
    ? trimmed
    : trimmed.replace(' ', 'T');
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) return null;
  return Math.floor(timestamp / 1000);
};

const formatUnixToLocalInput = (unix) => {
  const value = Number(unix || 0);
  if (!Number.isFinite(value) || value <= 0) return '';
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
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

  const [lotteryRounds, setLotteryRounds] = useState([]);
  const [lotteryLoading, setLotteryLoading] = useState(false);
  const [lotteryPage, setLotteryPage] = useState(1);
  const [lotteryPageSize, setLotteryPageSize] = useState(10);
  const [lotteryTotal, setLotteryTotal] = useState(0);
  const [lotteryModalVisible, setLotteryModalVisible] = useState(false);
  const [lotterySubmitting, setLotterySubmitting] = useState(false);
  const [editingRound, setEditingRound] = useState(null);
  const [lotteryForm, setLotteryForm] = useState(DEFAULT_LOTTERY_FORM);
  const [lotteryEntryVisible, setLotteryEntryVisible] = useState(false);
  const [lotteryEntryLoading, setLotteryEntryLoading] = useState(false);
  const [lotteryEntries, setLotteryEntries] = useState([]);
  const [lotteryEntryPage, setLotteryEntryPage] = useState(1);
  const [lotteryEntryPageSize, setLotteryEntryPageSize] = useState(10);
  const [lotteryEntryTotal, setLotteryEntryTotal] = useState(0);
  const [lotteryEntryFilters, setLotteryEntryFilters] = useState(
    DEFAULT_LOTTERY_ENTRY_FILTERS,
  );
  const [lotteryEntryQuery, setLotteryEntryQuery] = useState(
    DEFAULT_LOTTERY_ENTRY_FILTERS,
  );
  const [selectedLotteryRound, setSelectedLotteryRound] = useState(null);

  const [createVisible, setCreateVisible] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [createForm, setCreateForm] = useState(DEFAULT_CREATE_FORM);
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
          prev.filter((id) =>
            (res.data?.data?.items || []).some((item) => item?.id === id),
          ),
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

  const loadLotteryRounds = useCallback(async () => {
    setLotteryLoading(true);
    try {
      const res = await API.get('/api/activity/lottery/admin/rounds', {
        params: {
          page: lotteryPage,
          page_size: lotteryPageSize,
        },
      });
      if (res.data?.success) {
        setLotteryRounds(res.data?.data?.items || []);
        setLotteryTotal(Number(res.data?.data?.total || 0));
      } else {
        showError(res.data?.message || t('获取抽奖期数失败'));
      }
    } catch (error) {
      showError(error?.response?.data?.message || t('获取抽奖期数失败'));
    } finally {
      setLotteryLoading(false);
    }
  }, [lotteryPage, lotteryPageSize, t]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    if (activeTab === TAB_AUTO_JOBS) {
      loadJobs();
    }
  }, [activeTab, loadJobs]);

  useEffect(() => {
    if (activeTab === TAB_LOTTERY) {
      loadLotteryRounds();
    }
  }, [activeTab, loadLotteryRounds]);

  const loadLotteryEntries = useCallback(async () => {
    if (!selectedLotteryRound?.id || !lotteryEntryVisible) return;
    setLotteryEntryLoading(true);
    try {
      const res = await API.get(
        `/api/activity/lottery/admin/rounds/${selectedLotteryRound.id}/entries`,
        {
          params: {
            page: lotteryEntryPage,
            page_size: lotteryEntryPageSize,
            keyword: lotteryEntryQuery.keyword?.trim() || undefined,
            source: lotteryEntryQuery.source || undefined,
          },
        },
      );
      if (res.data?.success) {
        setLotteryEntries(res.data?.data?.items || []);
        setLotteryEntryTotal(Number(res.data?.data?.total || 0));
      } else {
        showError(res.data?.message || t('获取报名记录失败'));
      }
    } catch (error) {
      showError(error?.response?.data?.message || t('获取报名记录失败'));
    } finally {
      setLotteryEntryLoading(false);
    }
  }, [
    lotteryEntryPage,
    lotteryEntryPageSize,
    lotteryEntryQuery,
    lotteryEntryVisible,
    selectedLotteryRound?.id,
    t,
  ]);

  useEffect(() => {
    if (lotteryEntryVisible && selectedLotteryRound?.id) {
      loadLotteryEntries();
    }
  }, [loadLotteryEntries, lotteryEntryVisible, selectedLotteryRound?.id]);

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
    setEditingJob(null);
    setCreateForm({
      ...DEFAULT_CREATE_FORM,
      targetDate: '',
    });
    setUserSearchOptions([]);
    setSelectedUserOptionMap({});
    setSelectedUserPreviewOpen(false);
    setCreateVisible(true);
    loadUserOptions('');
  };

  const handleOpenEditModal = (record) => {
    if (!record?.id) return;
    if (String(record?.status || '').trim() !== 'scheduled') {
      showInfo(t('仅支持修改待执行任务'));
      return;
    }

    const userIds = safeParseUserIds(record?.user_ids_json);
    setSelectedUserOptionMap(() => {
      const next = {};
      userIds.forEach((id) => {
        next[id] = { value: id, label: `#${id}` };
      });
      return next;
    });
    setUserSearchOptions([]);
    setSelectedUserPreviewOpen(false);
    setEditingJob(record);
    setCreateForm({
      ...DEFAULT_CREATE_FORM,
      name: record?.name || '',
      targetDate: record?.repeat_daily ? '' : record?.target_date || '',
      windowStartTime: formatSeconds(record?.window_start_seconds).slice(0, 5),
      windowEndTime: formatSeconds(record?.window_end_seconds).slice(0, 5),
      randomWindowMinutes: Number(record?.random_window_seconds || 0) / 60,
      userIds,
      manualUserIds: '',
    });
    setCreateVisible(true);
    loadUserOptions('');
  };

  const handleOpenLotteryCreateModal = () => {
    setEditingRound(null);
    setLotteryForm(DEFAULT_LOTTERY_FORM);
    setLotteryModalVisible(true);
  };

  const handleOpenLotteryEditModal = (record) => {
    if (!record?.id) return;
    setEditingRound(record);
    setLotteryForm({
      title: record?.title || '',
      prize: record?.prize || '',
      prizeContent: record?.prize_content || '',
      joinSources: normalizeJoinSources(record?.join_sources || 'manual'),
      joinTopupMinMoney: Number(record?.join_topup_min_money || 0),
      joinTopupScope: record?.join_topup_scope || 'today',
      joinTopupUnit: record?.join_topup_unit || 'money',
      joinDailyConsumeMinMoney: Number(
        record?.join_daily_consume_min_money || 0,
      ),
      joinDailyConsumeScope: record?.join_daily_consume_scope || 'today',
      joinDailyConsumeThresholdUnit:
        record?.join_daily_consume_threshold_unit || 'money',
      startAt: formatUnixToLocalInput(record?.start_at),
      endAt: formatUnixToLocalInput(record?.end_at),
      minParticipants: Number(record?.min_participants || 0),
      winnerCount: Number(record?.winner_count || 0),
      published: Boolean(record?.published),
    });
    setLotteryModalVisible(true);
  };

  const handleOpenLotteryEntries = (record) => {
    if (!record?.id) return;
    setSelectedLotteryRound(record);
    setLotteryEntryFilters(DEFAULT_LOTTERY_ENTRY_FILTERS);
    setLotteryEntryQuery(DEFAULT_LOTTERY_ENTRY_FILTERS);
    setLotteryEntryPage(1);
    setLotteryEntryPageSize(10);
    setLotteryEntryVisible(true);
  };

  const handleSubmitLotteryRound = async () => {
    const endAtUnix = parseDateTimeToUnix(lotteryForm.endAt);
    const startAtUnix = parseDateTimeToUnix(lotteryForm.startAt) || undefined;
    if (!String(lotteryForm.title || '').trim()) {
      showInfo(t('请输入标题'));
      return;
    }
    if (
      !Array.isArray(lotteryForm.joinSources) ||
      !lotteryForm.joinSources.length
    ) {
      showInfo(t('请至少选择一种参与动作'));
      return;
    }
    if (
      lotteryForm.joinSources.includes('topup') &&
      Number(lotteryForm.joinTopupMinMoney || 0) <= 0
    ) {
      showInfo(t('请填写有效的充值参与门槛'));
      return;
    }
    if (
      lotteryForm.joinSources.includes('consume') &&
      Number(lotteryForm.joinDailyConsumeMinMoney || 0) <= 0
    ) {
      showInfo(t('请填写有效的今日消耗参与门槛'));
      return;
    }
    if (!endAtUnix) {
      showInfo(t('请输入正确的结束时间'));
      return;
    }
    setLotterySubmitting(true);
    try {
      const payload = {
        title: String(lotteryForm.title || '').trim(),
        prize: String(lotteryForm.prize || '').trim(),
        prize_content: String(lotteryForm.prizeContent || '').trim(),
        join_sources: normalizeJoinSources(lotteryForm.joinSources).join(','),
        join_topup_min_money: Number(lotteryForm.joinTopupMinMoney || 0),
        join_topup_scope: lotteryForm.joinTopupScope || 'today',
        join_topup_unit: lotteryForm.joinTopupUnit || 'money',
        join_daily_consume_min_money: Number(
          lotteryForm.joinDailyConsumeMinMoney || 0,
        ),
        join_daily_consume_scope: lotteryForm.joinDailyConsumeScope || 'today',
        join_daily_consume_threshold_unit:
          lotteryForm.joinDailyConsumeThresholdUnit || 'money',
        start_at: startAtUnix ? Number(startAtUnix) : 0,
        end_at: Number(endAtUnix),
        min_participants: Number(lotteryForm.minParticipants || 0),
        winner_count: Number(lotteryForm.winnerCount || 0),
        published: Boolean(lotteryForm.published),
      };
      const res = editingRound?.id
        ? await API.put(
            `/api/activity/lottery/admin/rounds/${editingRound.id}`,
            payload,
          )
        : await API.post('/api/activity/lottery/admin/rounds', payload);

      if (res.data?.success) {
        showSuccess(t('保存成功'));
        setLotteryModalVisible(false);
        setEditingRound(null);
        await loadLotteryRounds();
      } else {
        showError(res.data?.message || t('保存失败'));
      }
    } catch (error) {
      showError(error?.response?.data?.message || t('保存失败'));
    } finally {
      setLotterySubmitting(false);
    }
  };

  const handleOpenLotteryRound = (record) => {
    if (!record?.id) return;
    Modal.confirm({
      title: t('发布并开启本期活动抽奖'),
      content: t(
        '开启后，本期活动抽奖将对外公示；用户可在活动时间内通过配置的参与动作参与。到期后若参与人数达标将自动开奖。',
      ),
      okText: t('确认开启'),
      cancelText: t('取消'),
      onOk: async () => {
        try {
          const res = await API.post(
            `/api/activity/lottery/admin/rounds/${record.id}/open`,
          );
          if (res.data?.success) {
            showSuccess(t('已开启'));
            await loadLotteryRounds();
          } else {
            showError(res.data?.message || t('操作失败'));
          }
        } catch (error) {
          showError(error?.response?.data?.message || t('操作失败'));
        }
      },
    });
  };

  const handleDrawLotteryRound = (record) => {
    if (!record?.id) return;
    Modal.confirm({
      title: t('手动开奖'),
      content: t('将按当前参与名单抽取中奖用户（信息会打码公示）。'),
      okText: t('确认开奖'),
      cancelText: t('取消'),
      onOk: async () => {
        try {
          const res = await API.post(
            `/api/activity/lottery/admin/rounds/${record.id}/draw`,
          );
          if (res.data?.success) {
            showSuccess(t('开奖完成'));
            await loadLotteryRounds();
          } else {
            showError(res.data?.message || t('开奖失败'));
          }
        } catch (error) {
          showError(error?.response?.data?.message || t('开奖失败'));
        }
      },
    });
  };

  const handleForceDrawLotteryRound = (record) => {
    if (!record?.id) return;
    Modal.confirm({
      title: t('强制开奖'),
      content: t(
        '强制开奖将忽略参与人数门槛和活动结束时间，按当前合格参与名单立即抽取中奖用户（信息会打码公示）。',
      ),
      okText: t('确认强制开奖'),
      cancelText: t('取消'),
      onOk: async () => {
        try {
          const res = await API.post(
            `/api/activity/lottery/admin/rounds/${record.id}/draw`,
            { force: true },
          );
          if (res.data?.success) {
            showSuccess(t('开奖完成'));
            await loadLotteryRounds();
          } else {
            showError(res.data?.message || t('开奖失败'));
          }
        } catch (error) {
          showError(error?.response?.data?.message || t('开奖失败'));
        }
      },
    });
  };

  const mergeSelectedUserIds = useCallback((formState) => {
    const remoteUserIds = Array.isArray(formState?.userIds)
      ? formState.userIds
      : [];
    const manualUserIds = parseManualUserIds(formState?.manualUserIds);
    return Array.from(
      new Set(
        [...remoteUserIds, ...manualUserIds]
          .map((item) => Number(item))
          .filter((item) => Number.isInteger(item) && item > 0),
      ),
    );
  }, []);

  const handleUpdateJob = async () => {
    const targetDate = String(createForm.targetDate || '').trim();
    const windowStartSeconds = parseTimeToSeconds(createForm.windowStartTime);
    const windowEndSeconds = parseTimeToSeconds(createForm.windowEndTime);
    if (!editingJob?.id) {
      showError(t('任务信息缺失'));
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
      const res = await API.put(
        `/api/checkin/admin/auto_jobs/${editingJob.id}`,
        {
          name: createForm.name?.trim() || '',
          enabled: Boolean(editingJob?.enabled),
          target_date: targetDate || '',
          window_start_seconds: windowStartSeconds,
          window_end_seconds: windowEndSeconds,
          random_window_seconds:
            Number(createForm.randomWindowMinutes || 0) * 60,
          user_ids: mergedUserIds,
        },
      );
      if (res.data?.success) {
        showSuccess(t('更新成功'));
        setCreateVisible(false);
        setEditingJob(null);
        await loadJobs();
      } else {
        showError(res.data?.message || t('更新失败'));
      }
    } catch (error) {
      showError(error?.response?.data?.message || t('更新失败'));
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleCreateJob = async () => {
    const targetDate = String(createForm.targetDate || '').trim();
    const windowStartSeconds = parseTimeToSeconds(createForm.windowStartTime);
    const windowEndSeconds = parseTimeToSeconds(createForm.windowEndTime);
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
        target_date: targetDate || '',
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
            const res = await API.post(
              `/api/checkin/admin/auto_jobs/${record.id}/cancel`,
            );
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
      .filter(
        (item) =>
          selectedJobRowKeys.includes(item?.id) && isJobCancellable(item),
      )
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
            const res = await API.post(
              `/api/checkin/admin/auto_jobs/${jobId}/cancel`,
            );
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
        randomWindowMinutes: Math.floor(
          Number(job.random_window_seconds || 0) / 60,
        ),
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
          <Tag color={record?.repeat_daily ? 'green' : 'blue'} shape='circle'>
            {record?.repeat_daily ? t('每天') : record?.target_date || '-'}
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
              {Number(record?.success_count || 0)} /{' '}
              {Number(record?.item_count || 0)}
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
            {String(record?.status || '').trim() === 'scheduled' ? (
              <Button
                theme='light'
                size='small'
                onClick={() => handleOpenEditModal(record)}
              >
                {t('修改')}
              </Button>
            ) : null}
            {record?.status !== 'cancelled' &&
            record?.status !== 'completed' ? (
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
        width: 220,
        render: (_, record) => renderEllipsisText(record?.error_message, 190),
      },
    ],
    [t],
  );

  const lotteryColumns = useMemo(
    () => [
      {
        title: 'ID',
        dataIndex: 'id',
        key: 'id',
        width: 80,
      },
      {
        title: t('标题'),
        dataIndex: 'title',
        key: 'title',
        width: 180,
        render: (_, record) =>
          renderEllipsisText(record?.title || `#${record?.id || '-'}`, 150),
      },
      {
        title: t('公示奖品'),
        dataIndex: 'prize',
        key: 'prize',
        width: 220,
        render: (_, record) => renderEllipsisText(record?.prize, 190),
      },
      {
        title: t('状态'),
        dataIndex: 'status',
        key: 'status',
        width: 110,
        render: (_, record) => {
          const status = String(record?.status || '').trim();
          const map = {
            draft: { color: 'grey', text: t('草稿') },
            open: { color: 'blue', text: t('进行中') },
            drawn: { color: 'green', text: t('已开奖') },
            expired: { color: 'grey', text: t('未达标结束') },
            closed: { color: 'grey', text: t('已结束') },
          };
          const item = map[status] || { color: 'grey', text: status || '-' };
          return (
            <Tag color={item.color} shape='circle'>
              {item.text}
            </Tag>
          );
        },
      },
      {
        title: t('公示'),
        dataIndex: 'published',
        key: 'published',
        width: 90,
        render: (_, record) => (
          <Tag
            color={record?.published ? 'green' : 'grey'}
            type='light'
            shape='circle'
          >
            {record?.published ? t('已开启') : t('关闭')}
          </Tag>
        ),
      },
      {
        title: t('活动时间'),
        key: 'time_range',
        width: 220,
        render: (_, record) => {
          const start = record?.start_at
            ? timestamp2string(record.start_at)
            : '-';
          const end = record?.end_at ? timestamp2string(record.end_at) : '-';
          return renderEllipsisText(`${start} ~ ${end}`, 200);
        },
      },
      {
        title: t('参与人数'),
        dataIndex: 'participant_count',
        key: 'participant_count',
        width: 120,
        render: (_, record) =>
          `${Number(record?.participant_count || 0)} / ${Number(record?.min_participants || 0) || '-'}`,
      },
      {
        title: t('条件'),
        key: 'conditions',
        width: 260,
        render: (_, record) =>
          renderEllipsisText(buildLotteryConditionSummary(record, t), 230),
      },
      {
        title: t('中奖人数'),
        dataIndex: 'winner_count',
        key: 'winner_count',
        width: 90,
      },
      {
        title: t('错误'),
        dataIndex: 'last_error',
        key: 'last_error',
        width: 180,
        render: (_, record) => renderEllipsisText(record?.last_error, 150),
      },
      {
        title: t('操作'),
        key: 'actions',
        width: 220,
        render: (_, record) => (
          <Space wrap>
            <Button
              theme='outline'
              size='small'
              onClick={() => handleOpenLotteryEditModal(record)}
            >
              {t('编辑')}
            </Button>
            <Button
              theme='outline'
              size='small'
              onClick={() => handleOpenLotteryEntries(record)}
            >
              {t('报名记录')}
            </Button>
            {String(record?.status || '').trim() !== 'open' ? (
              <Button
                theme='light'
                type='primary'
                size='small'
                onClick={() => handleOpenLotteryRound(record)}
              >
                {t('开启')}
              </Button>
            ) : null}
            <Button
              theme='light'
              type='danger'
              size='small'
              onClick={() => handleDrawLotteryRound(record)}
            >
              {t('开奖')}
            </Button>
            <Button
              theme='solid'
              type='danger'
              size='small'
              onClick={() => handleForceDrawLotteryRound(record)}
            >
              {t('强制开奖')}
            </Button>
          </Space>
        ),
      },
    ],
    [
      handleDrawLotteryRound,
      handleOpenLotteryEntries,
      handleOpenLotteryEditModal,
      handleOpenLotteryRound,
      t,
    ],
  );

  const lotteryEntryColumns = useMemo(
    () => [
      {
        title: t('用户信息'),
        key: 'user',
        width: 260,
        render: (_, record) => (
          <div>
            <div className='font-medium text-semi-color-text-0'>
              {renderEllipsisText(
                record?.display_name || record?.username || '-',
                220,
              )}
            </div>
            <div className='text-xs text-semi-color-text-2'>
              #{record?.user_id || '-'}
              {record?.username ? ' · ' : ''}
              {record?.username ? renderEllipsisText(record.username, 180) : ''}
            </div>
            {record?.email ? (
              <div className='text-xs text-semi-color-text-2'>
                {renderEllipsisText(record.email, 220)}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        title: t('来源'),
        dataIndex: 'source',
        key: 'source',
        width: 150,
        render: (_, record) => {
          const option = ACTIVITY_LOTTERY_JOIN_SOURCE_OPTIONS.find(
            (item) => item.value === record?.source,
          );
          return (
            <Tag color='blue' type='light' shape='circle'>
              {t(option?.label || record?.source || '-')}
            </Tag>
          );
        },
      },
      {
        title: t('报名时间'),
        dataIndex: 'created_at',
        key: 'created_at',
        width: 180,
        render: (_, record) =>
          record?.created_at ? timestamp2string(record.created_at) : '-',
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
        <div className='mt-1 text-xl font-semibold'>
          {Number(jobTotal || 0)}
        </div>
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
          (Array.isArray(rows) ? rows : [])
            .filter((item) => isJobCancellable(item))
            .map((item) => item.id),
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
                  <Button
                    theme='outline'
                    onClick={loadRecords}
                    loading={recordLoading}
                  >
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
                      setRecordFilters((prev) => ({
                        ...prev,
                        startDate: value,
                      }))
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
                  description={t(
                    '自动签到任务的日期与时间按东八区（Asia/Shanghai）计算，并正常计入每日签到名额与统计。',
                  )}
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
                    <Button
                      theme='outline'
                      onClick={loadJobs}
                      loading={jobLoading}
                    >
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

        <TabPane tab={t('活动抽奖')} itemKey={TAB_LOTTERY}>
          <CardPro
            type='type2'
            searchArea={
              <div className='flex flex-col gap-3'>
                <Banner
                  type='warning'
                  bordered={false}
                  closeIcon={null}
                  description={t(
                    '抽奖规则：用户每期都必须先手动报名；无论配置了哪种自动条件，报名后才开始按本期配置统计充值或消耗条件，满足“参与人数 ≥ 目标人数”且“活动到期”后自动开奖。',
                  )}
                />
                <div className='flex flex-col gap-2 md:flex-row md:items-center md:justify-between'>
                  <div>
                    <div className='text-base font-semibold text-semi-color-text-0'>
                      {t('活动抽奖管理')}
                    </div>
                    <Text type='tertiary' size='small'>
                      {t(
                        '每一期可独立配置奖品、参与动作、参与门槛、人数门槛与活动时间',
                      )}
                    </Text>
                  </div>
                  <Space wrap>
                    <Button
                      theme='outline'
                      onClick={loadLotteryRounds}
                      loading={lotteryLoading}
                    >
                      {t('刷新')}
                    </Button>
                    <Button
                      type='primary'
                      onClick={handleOpenLotteryCreateModal}
                    >
                      {t('新建期数')}
                    </Button>
                  </Space>
                </div>
              </div>
            }
            paginationArea={createCardProPagination({
              currentPage: lotteryPage,
              pageSize: lotteryPageSize,
              total: lotteryTotal,
              onPageChange: setLotteryPage,
              onPageSizeChange: (size) => {
                setLotteryPageSize(size);
                setLotteryPage(1);
              },
              isMobile,
              t,
            })}
            t={t}
          >
            <CardTable
              columns={lotteryColumns}
              dataSource={lotteryRounds}
              loading={lotteryLoading}
              rowKey='id'
              pagination={false}
              empty={
                <Empty
                  image={<IllustrationNoResult />}
                  darkModeImage={<IllustrationNoResultDark />}
                  description={t('暂无抽奖期数')}
                />
              }
            />
          </CardPro>
        </TabPane>
      </Tabs>

      <Modal
        title={editingJob?.id ? t('修改自动签到任务') : t('创建自动签到任务')}
        visible={createVisible}
        onCancel={() => {
          setCreateVisible(false);
          setEditingJob(null);
        }}
        onOk={editingJob?.id ? handleUpdateJob : handleCreateJob}
        okText={editingJob?.id ? t('保存') : t('创建任务')}
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
              placeholder={t('可选，留空表示每天')}
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
            filter
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
        title={
          selectedLotteryRound?.title
            ? `${t('报名记录')} · ${selectedLotteryRound.title}`
            : t('报名记录')
        }
        visible={lotteryEntryVisible}
        onCancel={() => {
          setLotteryEntryVisible(false);
          setSelectedLotteryRound(null);
          setLotteryEntries([]);
          setLotteryEntryTotal(0);
        }}
        footer={null}
        width={900}
      >
        <div className='flex flex-col gap-4'>
          <div className='grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr),180px,auto]'>
            <Input
              value={lotteryEntryFilters.keyword}
              onChange={(value) =>
                setLotteryEntryFilters((prev) => ({ ...prev, keyword: value }))
              }
              placeholder={t('搜索用户 ID / 用户名 / 邮箱')}
              showClear
            />
            <Select
              value={lotteryEntryFilters.source}
              optionList={[
                { value: '', label: t('全部') },
                ...ACTIVITY_LOTTERY_JOIN_SOURCE_OPTIONS.map((item) => ({
                  value: item.value,
                  label: t(item.label),
                })),
              ]}
              onChange={(value) =>
                setLotteryEntryFilters((prev) => ({
                  ...prev,
                  source: value || '',
                }))
              }
              placeholder={t('来源')}
              showClear
            />
            <Space wrap>
              <Button
                theme='outline'
                onClick={() => {
                  setLotteryEntryPage(1);
                  setLotteryEntryQuery({
                    keyword: lotteryEntryFilters.keyword?.trim() || '',
                    source: lotteryEntryFilters.source || '',
                  });
                }}
              >
                {t('筛选')}
              </Button>
              <Button
                theme='outline'
                onClick={() => {
                  setLotteryEntryFilters(DEFAULT_LOTTERY_ENTRY_FILTERS);
                  setLotteryEntryPage(1);
                  setLotteryEntryQuery(DEFAULT_LOTTERY_ENTRY_FILTERS);
                }}
              >
                {t('重置')}
              </Button>
            </Space>
          </div>

          <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3'>
            <div className='text-xs text-semi-color-text-2'>{t('参与人数')}</div>
            <div className='mt-1 text-xl font-semibold text-semi-color-text-0'>
              {Number(selectedLotteryRound?.participant_count || 0)} /{' '}
              {Number(selectedLotteryRound?.min_participants || 0) || '-'}
            </div>
          </div>

          <CardTable
            columns={lotteryEntryColumns}
            dataSource={lotteryEntries}
            loading={lotteryEntryLoading}
            rowKey='id'
            pagination={false}
            empty={
              <Empty
                image={<IllustrationNoResult />}
                darkModeImage={<IllustrationNoResultDark />}
                description={t('暂无报名记录')}
              />
            }
          />

          {createCardProPagination({
            currentPage: lotteryEntryPage,
            pageSize: lotteryEntryPageSize,
            total: lotteryEntryTotal,
            onPageChange: setLotteryEntryPage,
            onPageSizeChange: (size) => {
              setLotteryEntryPageSize(size);
              setLotteryEntryPage(1);
            },
            isMobile,
            t,
          })}
        </div>
      </Modal>

      <Modal
        title={editingRound?.id ? t('编辑抽奖期数') : t('新建抽奖期数')}
        visible={lotteryModalVisible}
        onCancel={() => {
          setLotteryModalVisible(false);
          setEditingRound(null);
        }}
        onOk={handleSubmitLotteryRound}
        okText={t('保存')}
        cancelText={t('取消')}
        confirmLoading={lotterySubmitting}
        width={760}
      >
        <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
          <div className='md:col-span-2'>
            <div className='mb-1 text-sm font-medium text-semi-color-text-0'>
              {t('标题')}
            </div>
            <Input
              value={lotteryForm.title}
              onChange={(value) =>
                setLotteryForm((prev) => ({ ...prev, title: value }))
              }
              placeholder={t('例如：第 1 期 活动抽奖')}
              showClear
            />
          </div>
          <div className='md:col-span-2'>
            <div className='mb-1 text-sm font-medium text-semi-color-text-0'>
              {t('公示奖品')}
            </div>
            <TextArea
              value={lotteryForm.prize}
              onChange={(value) =>
                setLotteryForm((prev) => ({ ...prev, prize: value }))
              }
              placeholder={t('前台会展示这个奖品说明')}
              autosize={{ minRows: 2, maxRows: 4 }}
            />
          </div>
          <div className='md:col-span-2'>
            <div className='mb-1 text-sm font-medium text-semi-color-text-0'>
              {t('中奖发放内容')}
            </div>
            <TextArea
              value={lotteryForm.prizeContent}
              onChange={(value) =>
                setLotteryForm((prev) => ({ ...prev, prizeContent: value }))
              }
              placeholder={t(
                '自动开奖后通过站内信发送给中奖用户；留空则回退为公示奖品',
              )}
              autosize={{ minRows: 2, maxRows: 6 }}
            />
          </div>
          <div className='md:col-span-2'>
            <div className='mb-1 text-sm font-medium text-semi-color-text-0'>
              {t('参与动作')}
            </div>
            <Select
              multiple
              value={lotteryForm.joinSources}
              onChange={(value) =>
                setLotteryForm((prev) => ({
                  ...prev,
                  joinSources: Array.isArray(value) ? value : [],
                }))
              }
              optionList={ACTIVITY_LOTTERY_JOIN_SOURCE_OPTIONS.map((item) => ({
                value: item.value,
                label: t(item.label),
              }))}
              placeholder={t('至少选择一种参与方式')}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <div className='mb-1 text-sm font-medium text-semi-color-text-0'>
              {t('开始时间')}
            </div>
            <DatePicker
              type='dateTime'
              value={
                lotteryForm.startAt
                  ? new Date(lotteryForm.startAt.replace(' ', 'T'))
                  : null
              }
              onChange={(value) =>
                setLotteryForm((prev) => ({
                  ...prev,
                  startAt: value
                    ? formatUnixToLocalInput(
                        Math.floor(
                          (value instanceof Date
                            ? value
                            : new Date(value)
                          ).getTime() / 1000,
                        ),
                      )
                    : '',
                }))
              }
              placeholder={t('可选')}
              style={{ width: '100%' }}
              showClear
            />
          </div>
          <div>
            <div className='mb-1 text-sm font-medium text-semi-color-text-0'>
              {t('结束时间')}
            </div>
            <DatePicker
              type='dateTime'
              value={
                lotteryForm.endAt
                  ? new Date(lotteryForm.endAt.replace(' ', 'T'))
                  : null
              }
              onChange={(value) =>
                setLotteryForm((prev) => ({
                  ...prev,
                  endAt: value
                    ? formatUnixToLocalInput(
                        Math.floor(
                          (value instanceof Date
                            ? value
                            : new Date(value)
                          ).getTime() / 1000,
                        ),
                      )
                    : '',
                }))
              }
              placeholder={t('必填')}
              style={{ width: '100%' }}
              showClear
            />
          </div>
          <div>
            <div className='mb-1 text-sm font-medium text-semi-color-text-0'>
              {t('充值自动参与条件')}
            </div>
            <div className='grid grid-cols-3 gap-2'>
              <Select
                value={lotteryForm.joinTopupScope}
                onChange={(value) =>
                  setLotteryForm((prev) => ({
                    ...prev,
                    joinTopupScope: value || 'today',
                  }))
                }
                optionList={ACTIVITY_LOTTERY_SCOPE_OPTIONS.map((item) => ({
                  value: item.value,
                  label: t(item.label),
                }))}
                disabled={!lotteryForm.joinSources.includes('topup')}
              />
              <Select
                value={lotteryForm.joinTopupUnit}
                onChange={(value) =>
                  setLotteryForm((prev) => ({
                    ...prev,
                    joinTopupUnit: value || 'money',
                  }))
                }
                optionList={ACTIVITY_LOTTERY_UNIT_OPTIONS.map((item) => ({
                  value: item.value,
                  label: t(item.label),
                }))}
                disabled={!lotteryForm.joinSources.includes('topup')}
              />
              <InputNumber
                value={lotteryForm.joinTopupMinMoney}
                onChange={(value) =>
                  setLotteryForm((prev) => ({
                    ...prev,
                    joinTopupMinMoney: Number(value || 0),
                  }))
                }
                min={0}
                disabled={!lotteryForm.joinSources.includes('topup')}
                placeholder={t('启用充值自动参与时必填')}
                style={{ width: '100%' }}
              />
            </div>
          </div>
          <div>
            <div className='mb-1 text-sm font-medium text-semi-color-text-0'>
              {t('消耗自动参与条件')}
            </div>
            <div className='grid grid-cols-3 gap-2'>
              <Select
                value={lotteryForm.joinDailyConsumeScope}
                onChange={(value) =>
                  setLotteryForm((prev) => ({
                    ...prev,
                    joinDailyConsumeScope: value || 'today',
                  }))
                }
                optionList={ACTIVITY_LOTTERY_SCOPE_OPTIONS.map((item) => ({
                  value: item.value,
                  label: t(item.label),
                }))}
                disabled={!lotteryForm.joinSources.includes('consume')}
              />
              <Select
                value={lotteryForm.joinDailyConsumeThresholdUnit}
                onChange={(value) =>
                  setLotteryForm((prev) => ({
                    ...prev,
                    joinDailyConsumeThresholdUnit: value || 'money',
                  }))
                }
                optionList={ACTIVITY_LOTTERY_UNIT_OPTIONS.map((item) => ({
                  value: item.value,
                  label: t(item.label),
                }))}
                disabled={!lotteryForm.joinSources.includes('consume')}
              />
              <InputNumber
                value={lotteryForm.joinDailyConsumeMinMoney}
                onChange={(value) =>
                  setLotteryForm((prev) => ({
                    ...prev,
                    joinDailyConsumeMinMoney: Number(value || 0),
                  }))
                }
                min={0}
                disabled={!lotteryForm.joinSources.includes('consume')}
                placeholder={t('启用消耗自动参与时必填')}
                style={{ width: '100%' }}
              />
            </div>
          </div>
          <div>
            <div className='mb-1 text-sm font-medium text-semi-color-text-0'>
              {t('最低参与人数')}
            </div>
            <InputNumber
              value={lotteryForm.minParticipants}
              onChange={(value) =>
                setLotteryForm((prev) => ({
                  ...prev,
                  minParticipants: Number(value || 0),
                }))
              }
              min={0}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <div className='mb-1 text-sm font-medium text-semi-color-text-0'>
              {t('中奖人数')}
            </div>
            <InputNumber
              value={lotteryForm.winnerCount}
              onChange={(value) =>
                setLotteryForm((prev) => ({
                  ...prev,
                  winnerCount: Number(value || 0),
                }))
              }
              min={1}
              style={{ width: '100%' }}
            />
          </div>
          <div className='md:col-span-2'>
            <div className='mb-1 text-sm font-medium text-semi-color-text-0'>
              {t('是否公示')}
            </div>
            <Select
              value={lotteryForm.published ? '1' : '0'}
              onChange={(value) =>
                setLotteryForm((prev) => ({
                  ...prev,
                  published: value === '1',
                }))
              }
              optionList={[
                { label: t('开启公示'), value: '1' },
                { label: t('关闭公示'), value: '0' },
              ]}
              style={{ width: '100%' }}
            />
          </div>
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
                  <Tag
                    color={JOB_STATUS_COLOR[detailData.job?.status] || 'grey'}
                  >
                    {getJobStatusText(detailData.job?.status, t)}
                  </Tag>
                </div>
              </div>
            </div>

            <div className='flex flex-wrap gap-2'>
              <Button theme='outline' onClick={handleCopyUserIds}>
                {t('复制用户ID')}
              </Button>
              <Button
                type='primary'
                theme='light'
                onClick={() => handleCloneJob(detailData.job)}
              >
                {t('按此创建任务')}
              </Button>
              {detailData.job?.status !== 'cancelled' &&
              detailData.job?.status !== 'completed' ? (
                <Button
                  type='danger'
                  theme='light'
                  onClick={() => handleCancelJob(detailData.job)}
                >
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
