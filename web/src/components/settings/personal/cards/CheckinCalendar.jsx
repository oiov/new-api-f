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

import React, { useState, useEffect, useMemo } from 'react';
import {
  Card,
  Calendar,
  Button,
  Typography,
  Avatar,
  Spin,
  Tooltip,
  Collapsible,
  Modal,
  Tabs,
  TabPane,
  Empty,
  Pagination,
  Table,
  Tag,
} from '@douyinfe/semi-ui';
import {
  CalendarCheck,
  Gift,
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ArrowUpRight,
} from 'lucide-react';
import Turnstile from 'react-turnstile';
import {
  API,
  showError,
  showSuccess,
  renderQuota,
  renderNumber,
} from '../../../../helpers';
import { useIsMobile } from '../../../../hooks/common/useIsMobile';

const CHECKIN_QUOTA_PER_CNY = 500000;
const CHECKIN_WEEKDAY_LABELS = {
  0: '周日',
  1: '周一',
  2: '周二',
  3: '周三',
  4: '周四',
  5: '周五',
  6: '周六',
};

const normalizeCheckinWeekdays = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const formatCheckinTime = (seconds) => {
  const safeSeconds = Number(seconds || 0);
  const normalized = Math.max(0, Math.min(86399, safeSeconds));
  const hours = String(Math.floor(normalized / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((normalized % 3600) / 60)).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const formatCheckinDateTime = (timestamp) => {
  const value = Number(timestamp || 0);
  if (!Number.isFinite(value) || value <= 0) {
    return '--';
  }
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hours}:${minutes}`;
};

const quotaToCNY = (quota) => {
  const value = Number(quota || 0);
  if (!Number.isFinite(value) || value <= 0) {
    return '¥0.00';
  }
  const amount = value / CHECKIN_QUOTA_PER_CNY;
  if (amount >= 1000) {
    return `¥${amount.toFixed(2)}`;
  }
  if (amount >= 1) {
    return `¥${amount.toFixed(3)}`;
  }
  return `¥${amount.toFixed(4)}`;
};

const formatLocalMonthKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const CheckinCalendar = ({
  t,
  status,
  turnstileEnabled,
  turnstileSiteKey,
  className = '',
}) => {
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(false);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [turnstileModalVisible, setTurnstileModalVisible] = useState(false);
  const [turnstileWidgetKey, setTurnstileWidgetKey] = useState(0);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [todayRecords, setTodayRecords] = useState([]);
  const [leaderboardLimit, setLeaderboardLimit] = useState(100);
  const [leaderboardPage, setLeaderboardPage] = useState(1);
  const [leaderboardPageSize] = useState(10);
  const [leaderboardTotal, setLeaderboardTotal] = useState(0);
  const [leaderboardStats, setLeaderboardStats] = useState({
    today_checkins: 0,
    today_quota: 0,
    total_users: 0,
    total_quota: 0,
  });
  const [checkinData, setCheckinData] = useState({
    enabled: false,
    stats: {
      checked_in_today: false,
      total_checkins: 0,
      total_quota: 0,
      checkin_count: 0,
      records: [],
    },
  });
  const [currentMonth, setCurrentMonth] = useState(formatLocalMonthKey());
  // 初始加载状态，用于避免折叠状态闪烁
  const [initialLoaded, setInitialLoaded] = useState(false);
  // 折叠状态：null 表示未确定（等待首次加载）
  const [isCollapsed, setIsCollapsed] = useState(null);

  // 创建日期到额度的映射，方便快速查找
  const checkinRecordsMap = useMemo(() => {
    const map = {};
    const records = checkinData.stats?.records || [];
    records.forEach((record) => {
      map[record.checkin_date] = record.quota_awarded;
    });
    return map;
  }, [checkinData.stats?.records]);

  // 计算本月获得的额度
  const monthlyQuota = useMemo(() => {
    const records = checkinData.stats?.records || [];
    return records.reduce(
      (sum, record) => sum + (record.quota_awarded || 0),
      0,
    );
  }, [checkinData.stats?.records]);

  const leaderboardRange = useMemo(() => {
    const safeTotal =
      leaderboardTotal > 0
        ? leaderboardTotal
        : leaderboard.length > 0
          ? (leaderboardPage - 1) * leaderboardPageSize + leaderboard.length
          : 0;

    if (safeTotal <= 0) {
      return { start: 0, end: 0 };
    }
    const start = (leaderboardPage - 1) * leaderboardPageSize + 1;
    const end = Math.min(leaderboardPage * leaderboardPageSize, safeTotal);
    return { start, end };
  }, [leaderboard, leaderboardPage, leaderboardPageSize, leaderboardTotal]);

  const leaderboardSummaryCards = useMemo(
    () => [
      {
        key: 'today_checkins',
        label: t('今日签到人数'),
        value: Number(leaderboardStats?.today_checkins || 0),
        tone: 'text-emerald-600',
        detail:
          t('今日签到次数') +
          ` ${Number(leaderboardStats?.today_checkins || 0)}`,
      },
      {
        key: 'today_quota',
        label: t('今日发放'),
        value: quotaToCNY(leaderboardStats?.today_quota || 0),
        tone: 'text-sky-600',
        detail: `${renderNumber(Number(leaderboardStats?.today_quota || 0))} ${t('原始 Token')}`,
      },
      {
        key: 'total_users',
        label: t('累计签到人数'),
        value: Number(leaderboardStats?.total_users || 0),
        tone: 'text-violet-600',
        detail: t('覆盖全部签到用户'),
      },
      {
        key: 'total_quota',
        label: t('累计发放'),
        value: quotaToCNY(leaderboardStats?.total_quota || 0),
        tone: 'text-amber-600',
        detail: `${renderNumber(Number(leaderboardStats?.total_quota || 0))} ${t('原始 Token')}`,
      },
    ],
    [leaderboardStats, leaderboardTotal, t],
  );

  const overviewCards = useMemo(
    () => [
      {
        key: 'total_checkins',
        label: t('累计签到'),
        value: checkinData.stats?.total_checkins || 0,
        tone: 'text-green-600',
        detail: t('全部时间累计签到天数'),
      },
      {
        key: 'month_quota',
        label: t('本月获得'),
        value: renderQuota(monthlyQuota, 6),
        tone: 'text-orange-600',
        detail: t('当前月份签到奖励汇总'),
      },
      {
        key: 'total_quota',
        label: t('累计获得'),
        value: renderQuota(checkinData.stats?.total_quota || 0, 6),
        tone: 'text-blue-600',
        detail: t('全部时间累计签到奖励'),
      },
    ],
    [
      checkinData.stats?.total_checkins,
      checkinData.stats?.total_quota,
      monthlyQuota,
      t,
    ],
  );

  const checkinScheduleText = useMemo(() => {
    const weekdays = normalizeCheckinWeekdays(
      status?.['checkin_setting.open_weekdays'],
    );
    const weekdayText = weekdays
      .map((item) => CHECKIN_WEEKDAY_LABELS[item])
      .filter(Boolean)
      .map((label) => t(label))
      .join('、');
    const startSeconds = Number(status?.['checkin_setting.open_start_seconds']);
    const endSeconds = Number(status?.['checkin_setting.open_end_seconds']);
    const parts = [];

    if (weekdayText) {
      parts.push(weekdayText);
    }
    if (Number.isFinite(startSeconds) && Number.isFinite(endSeconds)) {
      parts.push(
        `${formatCheckinTime(startSeconds)} - ${formatCheckinTime(endSeconds)}`,
      );
    }

    if (!parts.length) {
      return '';
    }
    return t('签到开放时间：{{schedule}}', {
      schedule: parts.join(' · '),
    });
  }, [status, t]);

  const availabilityStatusText = useMemo(() => {
    if (!initialLoaded) {
      return '';
    }
    return checkinData.available_now ? t('可立即签到') : t('当前未开放');
  }, [checkinData.available_now, initialLoaded, t]);

  const availabilityHintText = useMemo(() => {
    if (!initialLoaded) {
      return '';
    }
    const parts = [];
    if (checkinScheduleText) {
      parts.push(checkinScheduleText);
    }
    return parts.join(' · ');
  }, [checkinScheduleText, initialLoaded, t]);

  const todayRecordsColumns = useMemo(
    () => [
      {
        title: t('用户'),
        dataIndex: 'display_name',
        render: (text) => (
          <div className='font-medium text-semi-color-text-0'>
            {text || t('匿名用户')}
          </div>
        ),
      },
      {
        title: isMobile ? t('Token') : t('签到 Token'),
        dataIndex: 'quota_awarded',
        width: 160,
        render: (value) => renderNumber(Number(value || 0)),
      },
      {
        title: isMobile ? t('金额') : t('签到额度'),
        dataIndex: 'quota_awarded',
        width: 140,
        render: (value) => quotaToCNY(value || 0),
      },
      {
        title: isMobile ? t('时间') : t('签到时间'),
        dataIndex: 'checked_in_at',
        width: 180,
        render: (value, record) =>
          value || formatCheckinDateTime(record?.created_at),
      },
      {
        title: isMobile ? t('总签到') : t('历史总签到次数'),
        dataIndex: 'total_checkins',
        width: 160,
        render: (value) => Number(value || 0),
      },
      {
        title: isMobile ? t('历史Token') : t('历史签到 Token'),
        dataIndex: 'total_quota',
        width: 160,
        render: (value) => renderNumber(Number(value || 0)),
      },
      {
        title: isMobile ? t('历史金额') : t('历史签到金额'),
        dataIndex: 'total_quota',
        width: 160,
        render: (value) => quotaToCNY(value || 0),
      },
    ],
    [isMobile, t],
  );

  const fetchCheckinLeaderboard = async (page = leaderboardPage) => {
    setLeaderboardLoading(true);
    try {
      const res = await API.get('/api/user/checkin/leaderboard', {
        params: {
          page,
          page_size: leaderboardPageSize,
        },
      });
      const { success, data, message } = res.data;
      if (success) {
        const nextItems = Array.isArray(data?.items) ? data.items : [];
        const nextPage = Number(data?.page || page);
        const nextTotal = Number(data?.total || 0);
        setLeaderboardLimit(Number(data?.limit || 100));
        setLeaderboard(nextItems);
        setTodayRecords(
          Array.isArray(data?.today_records) ? data.today_records : [],
        );
        setLeaderboardPage(nextPage);
        setLeaderboardStats({
          today_checkins: Number(data?.today_checkins || 0),
          today_quota: Number(data?.today_quota || 0),
          total_users: Number(data?.total_users || 0),
          total_quota: Number(data?.total_quota || 0),
        });
        setLeaderboardTotal(
          nextTotal > 0
            ? nextTotal
            : nextItems.length > 0
              ? (nextPage - 1) * leaderboardPageSize + nextItems.length
              : 0,
        );
      } else {
        showError(message || t('获取签到榜失败'));
        setTodayRecords([]);
      }
    } catch (error) {
      showError(t('获取签到榜失败'));
      setTodayRecords([]);
    } finally {
      setLeaderboardLoading(false);
    }
  };

  // 获取签到状态
  const fetchCheckinStatus = async (month) => {
    const isFirstLoad = !initialLoaded;
    setLoading(true);
    try {
      const res = await API.get(`/api/user/checkin?month=${month}`);
      const { success, data, message } = res.data;
      if (success) {
        setCheckinData(data);
        // 首次加载时，根据签到状态设置折叠状态
        if (isFirstLoad) {
          setIsCollapsed(data.stats?.checked_in_today ?? false);
          setInitialLoaded(true);
        }
      } else {
        showError(message || t('获取签到状态失败'));
        if (isFirstLoad) {
          setIsCollapsed(false);
          setInitialLoaded(true);
        }
      }
    } catch (error) {
      showError(t('获取签到状态失败'));
      if (isFirstLoad) {
        setIsCollapsed(false);
        setInitialLoaded(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const postCheckin = async (token) => {
    const url = token
      ? `/api/user/checkin?turnstile=${encodeURIComponent(token)}`
      : '/api/user/checkin';
    return API.post(url);
  };

  const shouldTriggerTurnstile = (message) => {
    if (!turnstileEnabled) return false;
    if (typeof message !== 'string') return true;
    return message.includes('Turnstile');
  };

  const doCheckin = async (token) => {
    setCheckinLoading(true);
    try {
      const res = await postCheckin(token);
      const { success, data, message } = res.data;
      if (success) {
        showSuccess(
          t('签到成功！获得') + ' ' + renderQuota(data.quota_awarded),
        );
        // 刷新签到状态
        fetchCheckinStatus(currentMonth);
        fetchCheckinLeaderboard(leaderboardPage);
        setTurnstileModalVisible(false);
      } else {
        if (!token && shouldTriggerTurnstile(message)) {
          if (!turnstileSiteKey) {
            showError('Turnstile is enabled but site key is empty.');
            return;
          }
          setTurnstileModalVisible(true);
          return;
        }
        if (token && shouldTriggerTurnstile(message)) {
          setTurnstileWidgetKey((v) => v + 1);
        }
        showError(message || t('签到失败'));
      }
    } catch (error) {
      showError(t('签到失败'));
    } finally {
      setCheckinLoading(false);
    }
  };

  useEffect(() => {
    if (status?.checkin_enabled) {
      fetchCheckinStatus(currentMonth);
    }
  }, [status?.checkin_enabled, currentMonth]);

  useEffect(() => {
    if (status?.checkin_enabled) {
      fetchCheckinLeaderboard(leaderboardPage);
    }
  }, [status?.checkin_enabled, leaderboardPage, leaderboardPageSize]);

  // 如果签到功能未启用，不显示组件
  if (!status?.checkin_enabled) {
    return null;
  }

  // 日期渲染函数 - 显示签到状态和获得的额度
  const dateRender = (dateString) => {
    // Semi Calendar 传入的 dateString 是 Date.toString() 格式
    // 需要转换为 YYYY-MM-DD 格式来匹配后端数据
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return null;
    }
    // 使用本地时间格式化，避免时区问题
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`; // YYYY-MM-DD
    const quotaAwarded = checkinRecordsMap[formattedDate];
    const isCheckedIn = quotaAwarded !== undefined;

    if (isCheckedIn) {
      return (
        <Tooltip
          content={`${t('获得')} ${renderQuota(quotaAwarded)}`}
          position='top'
        >
          <div className='absolute inset-0 flex flex-col items-center justify-center cursor-pointer'>
            <div className='w-6 h-6 rounded-full bg-green-500 flex items-center justify-center mb-0.5 shadow-sm'>
              <Check size={14} className='text-white' strokeWidth={3} />
            </div>
            <div className='text-[10px] font-medium text-green-600 dark:text-green-400 leading-none'>
              {renderQuota(quotaAwarded)}
            </div>
          </div>
        </Tooltip>
      );
    }
    return null;
  };

  // 处理月份变化
  const handleMonthChange = (date) => {
    const month = formatLocalMonthKey(date);
    setCurrentMonth(month);
  };

  const openPricingPage = () => {
    window.open('https://nbility.dev/pricing?currency=CNY', '_blank');
  };

  return (
    <Card className={`!rounded-2xl ${className}`.trim()}>
      <Modal
        title={t('安全验证')}
        visible={turnstileModalVisible}
        footer={null}
        centered
        onCancel={() => {
          setTurnstileModalVisible(false);
          setTurnstileWidgetKey((v) => v + 1);
        }}
      >
        <div className='flex justify-center py-2'>
          <Turnstile
            key={turnstileWidgetKey}
            sitekey={turnstileSiteKey}
            onVerify={(token) => {
              doCheckin(token);
            }}
            onExpire={() => {
              setTurnstileWidgetKey((v) => v + 1);
            }}
          />
        </div>
      </Modal>

      {/* 卡片头部 */}
      <div className='flex items-center justify-between gap-3'>
        <div
          className='flex items-center flex-1 cursor-pointer'
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <Avatar size='small' color='green' className='mr-3 shadow-md'>
            <CalendarCheck size={16} />
          </Avatar>
          <div className='flex-1'>
            <div className='flex items-center gap-2'>
              <Typography.Text className='text-lg font-medium'>
                {t('每日签到')}
              </Typography.Text>
              {isCollapsed ? (
                <ChevronDown size={16} className='text-gray-400' />
              ) : (
                <ChevronUp size={16} className='text-gray-400' />
              )}
            </div>
            <div className='text-xs text-gray-500 dark:text-gray-400'>
              {!initialLoaded
                ? t('正在加载签到状态...')
                : checkinData.stats?.checked_in_today
                  ? t('今日已签到，累计签到') +
                    ` ${checkinData.stats?.total_checkins || 0} ` +
                    t('天')
                  : t('每日签到可获得随机额度奖励')}
            </div>
            {checkinScheduleText ? (
              <div className='mt-1 text-xs text-emerald-600 dark:text-emerald-400'>
                {checkinScheduleText}
              </div>
            ) : null}
          </div>
        </div>
        <Button
          type='primary'
          theme='solid'
          icon={<Gift size={16} />}
          onClick={() => doCheckin()}
          loading={checkinLoading || !initialLoaded}
          disabled={!initialLoaded || checkinData.stats?.checked_in_today}
          className='!bg-green-600 hover:!bg-green-700'
        >
          {!initialLoaded
            ? t('加载中...')
            : checkinData.stats?.checked_in_today
              ? t('今日已签到')
              : t('立即签到')}
        </Button>
      </div>

      <div className='mt-3 rounded-2xl border border-amber-200/70 bg-[linear-gradient(135deg,rgba(251,191,36,0.12),rgba(255,255,255,0.96))] px-3 py-3 shadow-sm dark:border-amber-400/20 dark:bg-[linear-gradient(135deg,rgba(251,191,36,0.12),rgba(17,24,39,0.95))]'>
        <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
          <div className='min-w-0'>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300'>
                <Sparkles size={12} />
                {t('低价 Claude Codex 套餐')}
              </span>
              <span className='text-[11px] font-medium text-rose-500'>
                {t('限时优惠')}
              </span>
            </div>
            <div className='mt-2 text-sm text-semi-color-text-0'>
              {t('限时优惠进行中，想先体验可以先看天卡和轻量套餐。')}
            </div>
          </div>
          <Button
            theme='solid'
            type='primary'
            icon={<ArrowUpRight size={14} />}
            iconPosition='right'
            onClick={openPricingPage}
            className='!bg-amber-500 hover:!bg-amber-600 !border-amber-500'
          >
            {t('去看看套餐')}
          </Button>
        </div>
      </div>

      {/* 可折叠内容 */}
      <Collapsible isOpen={isCollapsed === false} keepDOM>
        <div className='mt-5 md:mt-6'>
          <Tabs type='line'>
            <TabPane tab={t('签到概览')} itemKey='overview'>
              <div className='mb-5 grid grid-cols-1 gap-4 md:mb-6 md:gap-5 lg:grid-cols-[minmax(0,1.3fr),minmax(0,0.7fr)]'>
                <div className='rounded-2xl border border-semi-color-border bg-[linear-gradient(135deg,rgba(34,197,94,0.08),rgba(59,130,246,0.03))] p-4 md:p-5'>
                  <div className='flex flex-wrap items-center gap-2.5'>
                    <Typography.Text strong>
                      {t('今日开放状态：{{status}}', {
                        status: availabilityStatusText || '--',
                      })}
                    </Typography.Text>
                    <Tag
                      color={checkinData.available_now ? 'green' : 'grey'}
                      shape='circle'
                      type='light'
                    >
                      {availabilityStatusText || '--'}
                    </Tag>
                  </div>
                  <div className='mt-3 text-sm leading-6 text-semi-color-text-1'>
                    {availabilityHintText || t('每日签到可获得随机额度奖励')}
                  </div>
                  <div className='mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:mt-5 md:grid-cols-3 md:gap-4'>
                    {overviewCards.map((item) => (
                      <div
                        key={item.key}
                        className='rounded-xl border border-semi-color-border bg-semi-color-bg-0 px-4 py-3.5'
                      >
                        <div className='text-[12px] text-semi-color-text-2'>
                          {item.label}
                        </div>
                        <div
                          className={`mt-1.5 text-lg font-semibold ${item.tone}`}
                        >
                          {item.value}
                        </div>
                        <div className='mt-1.5 text-[11px] leading-5 text-semi-color-text-2'>
                          {item.detail}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className='grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-2'>
                  {leaderboardSummaryCards.map((item) => (
                    <div
                      key={item.key}
                      className='rounded-2xl border border-semi-color-border bg-semi-color-fill-0 px-4 py-4'
                    >
                      <div className='text-[11px] text-semi-color-text-2'>
                        {item.label}
                      </div>
                      <div
                        className={`mt-1.5 text-base font-semibold ${item.tone}`}
                      >
                        {item.value}
                      </div>
                      <div className='mt-1.5 text-[11px] leading-5 text-semi-color-text-2'>
                        {item.detail}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Spin spinning={loading}>
                <div className='checkin-calendar overflow-hidden rounded-2xl border border-semi-color-border bg-semi-color-bg-0 shadow-sm'>
                  <style>{`
                  .checkin-calendar .semi-calendar {
                    font-size: 13px;
                  }
                  .checkin-calendar .semi-calendar-month-header {
                    padding: 8px 12px;
                  }
                  .checkin-calendar .semi-calendar-month-week-row {
                    height: 28px;
                  }
                  .checkin-calendar .semi-calendar-month-week-row th {
                    font-size: 12px;
                    padding: 4px 0;
                  }
                  .checkin-calendar .semi-calendar-month-grid-row {
                    height: auto;
                  }
                  .checkin-calendar .semi-calendar-month-grid-row td {
                    height: 56px;
                    padding: 2px;
                  }
                  .checkin-calendar .semi-calendar-month-grid-row-cell {
                    position: relative;
                    height: 100%;
                  }
                  .checkin-calendar .semi-calendar-month-grid-row-cell-day {
                    position: absolute;
                    top: 4px;
                    left: 50%;
                    transform: translateX(-50%);
                    font-size: 12px;
                    z-index: 1;
                  }
                  .checkin-calendar .semi-calendar-month-same {
                    background: transparent;
                  }
                  .checkin-calendar .semi-calendar-month-today .semi-calendar-month-grid-row-cell-day {
                    background: var(--semi-color-primary);
                    color: white;
                    border-radius: 50%;
                    width: 20px;
                    height: 20px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                  }
                `}</style>
                  <Calendar
                    mode='month'
                    onChange={handleMonthChange}
                    dateGridRender={(dateString, date) =>
                      dateRender(dateString)
                    }
                  />
                </div>
              </Spin>

              <div className='mt-4 rounded-xl bg-slate-50 p-4 dark:bg-slate-800 md:mt-5'>
                <Typography.Text type='tertiary' className='text-xs'>
                  <ul className='list-disc list-inside space-y-1 leading-6'>
                    <li>{t('每日签到可获得随机额度奖励')}</li>
                    <li>{t('签到奖励将直接添加到您的账户余额')}</li>
                    <li>{t('每日仅可签到一次，请勿重复签到')}</li>
                  </ul>
                </Typography.Text>
              </div>
            </TabPane>
            <TabPane tab={t('签到榜')} itemKey='leaderboard'>
              <Spin spinning={leaderboardLoading}>
                <div className='space-y-4 md:space-y-5'>
                  <div className='rounded-2xl border border-semi-color-border bg-[linear-gradient(135deg,rgba(16,185,129,0.06),rgba(59,130,246,0.04))] px-4 py-4 md:px-5'>
                    <div className='flex flex-wrap items-start justify-between gap-3'>
                      <div className='min-w-0'>
                        <div className='text-[13px] font-semibold leading-none text-semi-color-text-0'>
                          {t('签到达人榜')}
                        </div>
                        <div className='mt-1 text-[11px] text-semi-color-text-2'>
                          {t('仅展示前 {{count}} 位', {
                            count: leaderboardLimit,
                          })}
                        </div>
                      </div>
                      <div className='rounded-xl bg-white/70 px-3 py-2 text-right shadow-sm dark:bg-black/10'>
                        <div className='text-[11px] text-semi-color-text-2'>
                          {leaderboardTotal > 0
                            ? t(
                                '当前展示第 {{start}} - {{end}} 位，共 {{total}} 位',
                                {
                                  start: leaderboardRange.start,
                                  end: leaderboardRange.end,
                                  total:
                                    leaderboardTotal > 0
                                      ? leaderboardTotal
                                      : leaderboardRange.end,
                                },
                              )
                            : t('暂无排行榜数据')}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className='grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4'>
                    {leaderboardSummaryCards.map((item) => (
                      <div
                        key={`leaderboard-${item.key}`}
                        className='rounded-2xl border border-semi-color-border bg-semi-color-fill-0 px-4 py-3.5'
                      >
                        <div className='text-[11px] text-semi-color-text-2'>
                          {item.label}
                        </div>
                        <div
                          className={`mt-1.5 text-sm font-semibold ${item.tone}`}
                        >
                          {item.value}
                        </div>
                        <div className='mt-1.5 text-[11px] leading-5 text-semi-color-text-2'>
                          {item.detail}
                        </div>
                      </div>
                    ))}
                  </div>
                  {leaderboard.length > 0 ? (
                    <>
                      <div className='space-y-3'>
                        {leaderboard.map((item, index) => {
                          const rank =
                            (leaderboardPage - 1) * leaderboardPageSize +
                            index +
                            1;
                          const isTopThree = rank <= 3;
                          return (
                            <div
                              key={`${item.display_name || 'anonymous'}-${rank}`}
                              className={`rounded-2xl border px-4 py-3.5 transition-colors hover:bg-semi-color-fill-1 md:px-5 md:py-4 ${
                                isTopThree
                                  ? 'border-emerald-200 bg-[linear-gradient(135deg,rgba(16,185,129,0.06),rgba(255,255,255,0.96))]'
                                  : 'border-semi-color-border bg-semi-color-fill-0'
                              }`}
                            >
                              <div className='grid grid-cols-[auto,minmax(0,1fr),auto] items-center gap-3'>
                                <div
                                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                                    isTopThree
                                      ? 'bg-emerald-500 text-white shadow-sm'
                                      : 'bg-semi-color-fill-1 text-semi-color-text-0'
                                  }`}
                                >
                                  {rank}
                                </div>
                                <div className='min-w-0'>
                                  <div className='truncate text-[13px] font-semibold leading-none text-semi-color-text-0'>
                                    {item.display_name || t('匿名用户')}
                                  </div>
                                  <div className='mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-semi-color-text-2'>
                                    <span className='rounded-full bg-semi-color-fill-1 px-2 py-0.5 leading-none'>
                                      {t('累计签到')} {item.total_checkins || 0}{' '}
                                      {t('天')}
                                    </span>
                                  </div>
                                </div>
                                <div className='text-right'>
                                  <div className='text-[11px] text-semi-color-text-2'>
                                    {t('累计获得')}
                                  </div>
                                  <div className='mt-1 inline-flex rounded-full bg-semi-color-fill-1 px-2.5 py-1 text-[12px] font-semibold leading-none text-semi-color-text-0'>
                                    {renderQuota(item.total_quota || 0, 6)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {leaderboardTotal > leaderboardPageSize ? (
                        <div className='flex justify-center border-t border-semi-color-border pt-4'>
                          <Pagination
                            currentPage={leaderboardPage}
                            pageSize={leaderboardPageSize}
                            total={leaderboardTotal}
                            showSizeChanger={false}
                            size='small'
                            onPageChange={(page) => setLeaderboardPage(page)}
                          />
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      title={t('暂无排行榜数据')}
                      description={t(
                        '当站内出现签到数据后，将展示前 {{count}} 名用户',
                        {
                          count: leaderboardLimit,
                        },
                      )}
                    />
                  )}
                </div>
              </Spin>
            </TabPane>
            {todayRecords.length > 0 ? (
              <TabPane tab={t('今日签到')} itemKey='today-records'>
                <Spin spinning={leaderboardLoading}>
                  <div className='space-y-4 md:space-y-5'>
                    <div className='rounded-2xl border border-semi-color-border bg-[linear-gradient(135deg,rgba(34,197,94,0.06),rgba(59,130,246,0.04))] px-4 py-4 md:px-5'>
                      <div>
                        <div className='text-[14px] font-semibold text-semi-color-text-0'>
                          {t('今日签到列表')}
                        </div>
                        <div className='mt-1 text-[12px] text-semi-color-text-2'>
                          {t('最新签到用户与奖励发放情况')}
                        </div>
                      </div>
                    </div>

                    <Card
                      bodyStyle={{ padding: 0 }}
                      className='overflow-hidden rounded-2xl'
                    >
                      <Table
                        columns={todayRecordsColumns}
                        dataSource={todayRecords}
                        rowKey={(record, index) =>
                          `${record?.display_name || 'anonymous'}-${record?.created_at || index}`
                        }
                        pagination={false}
                        size='small'
                      />
                    </Card>
                  </div>
                </Spin>
              </TabPane>
            ) : null}
          </Tabs>
        </div>
      </Collapsible>
    </Card>
  );
};

export default CheckinCalendar;
