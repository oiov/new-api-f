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
  Collapse,
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

const ACTIVITY_LOTTERY_JOIN_SOURCE_LABELS = {
  manual: '用户点击参与',
  checkin: '签到成功自动参与',
  topup: '充值达标自动参与',
  consume: '消耗达标自动参与',
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
  mode = 'full', // 'full' | 'promo'
  showActivityLottery = true,
}) => {
  const isMobile = useIsMobile();
  const activityLotteryEnabled =
    !!showActivityLottery && !!status?.activity_lottery_enabled;
  const [loading, setLoading] = useState(false);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [lotteryLoading, setLotteryLoading] = useState(false);
  const [lotteryJoinLoading, setLotteryJoinLoading] = useState(false);
  const [lotterySummary, setLotterySummary] = useState(null);
  const [lotteryRoundsLoading, setLotteryRoundsLoading] = useState(false);
  const [lotteryRounds, setLotteryRounds] = useState([]);
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
        tone: 'text-semi-color-text-0',
        detail: `${renderNumber(Number(leaderboardStats?.today_quota || 0))} ${t('原始 Token')}`,
      },
      {
        key: 'total_users',
        label: t('累计签到人数'),
        value: Number(leaderboardStats?.total_users || 0),
        tone: 'text-semi-color-text-0',
        detail: t('覆盖全部签到用户'),
      },
      {
        key: 'total_quota',
        label: t('累计发放'),
        value: quotaToCNY(leaderboardStats?.total_quota || 0),
        tone: 'text-semi-color-text-0',
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

  const actionButtonText = !initialLoaded
    ? t('加载中...')
    : checkinData.stats?.checked_in_today
      ? t('今日已签到')
      : t('立即签到');

  const statusBadgeText = !initialLoaded
    ? t('状态加载中')
    : checkinData.stats?.checked_in_today
      ? t('今日已完成')
      : availabilityStatusText || t('待签到');

  const statusBadgeClass = !initialLoaded
    ? 'border-slate-200 bg-slate-50 text-slate-500'
    : checkinData.stats?.checked_in_today
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : checkinData.available_now
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-slate-200 bg-slate-50 text-slate-600';

  const headerSummaryText = !initialLoaded
    ? t('正在加载签到状态...')
    : checkinData.stats?.checked_in_today
      ? t('今日已签到，累计签到') +
        ` ${checkinData.stats?.total_checkins || 0} ` +
        t('天')
      : t('每日签到可获得随机额度奖励');

  const actionHelperText = checkinData.stats?.checked_in_today
    ? t('明天开放后可继续签到')
    : availabilityHintText || t('签到奖励将直接添加到您的账户余额');

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

  const resetLeaderboardState = () => {
    setLeaderboard([]);
    setLeaderboardTotal(0);
    setLeaderboardStats({
      today_checkins: 0,
      today_quota: 0,
      total_users: 0,
      total_quota: 0,
    });
    setTodayRecords([]);
  };

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
        resetLeaderboardState();
      }
    } catch (error) {
      showError(t('获取签到榜失败'));
      resetLeaderboardState();
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
        if (activityLotteryEnabled) {
          fetchActivityLotterySummary();
        }
        setTurnstileModalVisible(false);
      } else {
        if (!token && shouldTriggerTurnstile(message)) {
          if (!turnstileSiteKey) {
            showError(t('Turnstile 已启用但站点密钥为空'));
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

  const fetchActivityLotterySummary = async () => {
    if (!activityLotteryEnabled) return;
    setLotteryLoading(true);
    try {
      const res = await API.get('/api/activity/lottery/current');
      if (res?.data?.success) {
        setLotterySummary(res.data.data || null);
      } else {
        setLotterySummary(null);
      }
    } catch {
      setLotterySummary(null);
    } finally {
      setLotteryLoading(false);
    }
  };

  const fetchPublicLotteryRounds = async () => {
    if (!activityLotteryEnabled) return;
    setLotteryRoundsLoading(true);
    try {
      const res = await API.get('/api/activity/lottery/rounds', {
        params: { limit: 10 },
      });
      if (res?.data?.success) {
        setLotteryRounds(res.data?.data?.items || []);
      } else {
        setLotteryRounds([]);
      }
    } catch {
      setLotteryRounds([]);
    } finally {
      setLotteryRoundsLoading(false);
    }
  };

  const joinActivityLottery = async () => {
    if (!activityLotteryEnabled) return;
    setLotteryJoinLoading(true);
    try {
      const res = await API.post('/api/activity/lottery/join');
      if (res?.data?.success) {
        showSuccess(t('报名成功'));
        fetchActivityLotterySummary();
      } else {
        showError(res?.data?.message || t('报名失败'));
      }
    } catch (error) {
      showError(error?.response?.data?.message || t('报名失败'));
    } finally {
      setLotteryJoinLoading(false);
    }
  };

  useEffect(() => {
    if (mode !== 'full') return;
    if (status?.checkin_enabled) {
      fetchCheckinStatus(currentMonth);
    }
  }, [mode, status?.checkin_enabled, currentMonth]);

  useEffect(() => {
    if (mode !== 'full') return;
    if (status?.checkin_enabled) {
      fetchCheckinLeaderboard(leaderboardPage);
    }
  }, [mode, status?.checkin_enabled, leaderboardPage, leaderboardPageSize]);

  useEffect(() => {
    if (mode !== 'full') return;
    if (activityLotteryEnabled) {
      fetchActivityLotterySummary();
      fetchPublicLotteryRounds();
    }
  }, [mode, activityLotteryEnabled]);

  // promo 模式始终展示；full 模式若功能都未启用则给出明确提示，避免出现空白页
  if (mode === 'full' && !status?.checkin_enabled && !activityLotteryEnabled) {
    return <Empty description={t('签到功能未启用')} style={{ padding: 24 }} />;
  }

  // 日期渲染函数 - 显示签到状态和获得的额度
  const dateRender = (dateString, date) => {
    const safeDate =
      date instanceof Date && !Number.isNaN(date.getTime())
        ? date
        : new Date(dateString);
    if (Number.isNaN(safeDate.getTime())) return null;
    // 使用本地时间格式化，避免时区问题
    const year = safeDate.getFullYear();
    const month = String(safeDate.getMonth() + 1).padStart(2, '0');
    const day = String(safeDate.getDate()).padStart(2, '0');
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
    const rawLink = String(status?.subscription_promo_button_link || '').trim();
    const fallbackLink = 'https://fishxcode.com/pricing?currency=CNY';
    const link = rawLink || fallbackLink;
    if (!link) return;
    if (link.startsWith('/')) {
      window.location.href = link;
      return;
    }
    window.open(link, '_blank');
  };

  const subscriptionPromoEnabled =
    status?.subscription_promo_enabled === undefined
      ? true
      : !!status?.subscription_promo_enabled;

  const subscriptionPromoBadgeLeft =
    String(status?.subscription_promo_badge_left || '').trim() ||
    t('低价 Claude Codex 套餐');
  const subscriptionPromoBadgeRight =
    String(status?.subscription_promo_badge_right || '').trim() ||
    t('限时优惠');
  const subscriptionPromoTitle =
    String(status?.subscription_promo_title || '').trim() ||
    t('Claude / Codex 套餐当前5折热销中');
  const subscriptionPromoSubtitle =
    String(status?.subscription_promo_subtitle || '').trim() ||
    t('天卡、Lite 和轻量方案更适合先试再升级，成本更低，开通更快。');
  const subscriptionPromoButtonText =
    String(status?.subscription_promo_button_text || '').trim() ||
    t('查看低价套餐');

  const subscriptionPromoBanner = !subscriptionPromoEnabled ? null : (
    <div
      className={`${mode === 'promo' ? '' : 'mt-4 '}rounded-[22px] bg-[linear-gradient(90deg,rgba(236,253,245,0.98),rgba(255,255,255,0.96),rgba(239,246,255,0.96))] p-4 md:p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)] ring-1 ring-slate-200/60`.trim()}
    >
      <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm'>
              <Sparkles size={12} />
              {subscriptionPromoBadgeLeft}
            </span>
            <span className='inline-flex items-center rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-slate-600'>
              {subscriptionPromoBadgeRight}
            </span>
          </div>
          <div className='mt-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between'>
            <div className='min-w-0'>
              <div className='text-base font-semibold leading-6 text-semi-color-text-0 md:text-lg'>
                {subscriptionPromoTitle}
              </div>
              <div className='mt-1 text-sm leading-6 text-semi-color-text-1 whitespace-pre-wrap'>
                {subscriptionPromoSubtitle}
              </div>
            </div>
            <div className='flex shrink-0 items-center'>
              <Button
                theme='solid'
                type='primary'
                icon={<ArrowUpRight size={14} />}
                iconPosition='right'
                onClick={openPricingPage}
                className='!h-11 !rounded-xl !border-0 !bg-emerald-600 !px-4 !shadow-none hover:!bg-emerald-700'
              >
                {subscriptionPromoButtonText}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (mode === 'promo') {
    if (!subscriptionPromoBanner) return null;
    return <div className={className}>{subscriptionPromoBanner}</div>;
  }

  return (
    <Card
      className={`overflow-hidden border border-semi-color-border/80 !rounded-[28px] bg-white shadow-[0_20px_70px_rgba(15,23,42,0.05)] ${className}`.trim()}
    >
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

      <div className='checkin-compact-shell rounded-[20px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.98))] p-3'>
        <div className='flex flex-col gap-2.5 xl:flex-row xl:items-start xl:justify-between'>
          <div
            className='checkin-compact-header min-w-0 flex-1 cursor-pointer rounded-[16px] border border-white/80 bg-white/90 p-3 transition-colors hover:bg-white'
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            <div className='flex items-start gap-2.5'>
              <div className='checkin-compact-header__icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-[0_8px_18px_rgba(15,23,42,0.14)]'>
                <CalendarCheck size={16} />
              </div>
              <div className='min-w-0 flex-1'>
                <div className='flex flex-wrap items-center gap-2'>
                  <Typography.Text className='text-[16px] font-semibold tracking-[-0.02em] text-semi-color-text-0'>
                    {t('每日签到')}
                  </Typography.Text>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass}`}
                    aria-live='polite'
                  >
                    {statusBadgeText}
                  </span>
                  <span className='inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500'>
                    {formatLocalMonthKey().replace('-', '.')}
                  </span>
                </div>
                <div className='mt-1 text-[12px] leading-5 text-semi-color-text-1'>
                  {headerSummaryText}
                </div>
                {checkinScheduleText ? (
                  <div className='mt-1.5 inline-flex max-w-full items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600'>
                    <span className='truncate'>{checkinScheduleText}</span>
                  </div>
                ) : null}
                <div className='mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-semi-color-text-2'>
                  <span className='inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5'>
                    {t('累计签到')} {checkinData.stats?.total_checkins || 0}{' '}
                    {t('天')}
                  </span>
                  <span className='inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5'>
                    {t('本月获得')} {renderQuota(monthlyQuota, 6)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className='flex w-full shrink-0 flex-col gap-2 xl:w-[240px]'>
            <div className='checkin-compact-action rounded-[16px] border border-slate-200/80 bg-white p-3 shadow-sm'>
              <div className='flex items-center justify-between gap-3'>
                <div>
                  <div className='text-[12px] font-semibold text-semi-color-text-0'>
                    {t('今日操作')}
                  </div>
                  <div className='mt-1 text-[10px] leading-4 text-semi-color-text-2'>
                    {actionHelperText}
                  </div>
                </div>
                {isCollapsed ? (
                  <ChevronDown size={16} className='text-slate-400' />
                ) : (
                  <ChevronUp size={16} className='text-slate-400' />
                )}
              </div>
              <Button
                type='primary'
                theme='solid'
                block
                size='large'
                icon={<Gift size={16} />}
                onClick={() => doCheckin()}
                loading={checkinLoading || !initialLoaded}
                disabled={!initialLoaded || checkinData.stats?.checked_in_today}
                className='mt-2.5 !h-9 !rounded-lg !border-emerald-500 !bg-emerald-500 hover:!bg-emerald-600'
              >
                {actionButtonText}
              </Button>
            </div>
          </div>
        </div>

        {subscriptionPromoBanner}
      </div>

      {/* 可折叠内容 */}
      {mode === 'full' ? (
        <Collapsible isOpen={isCollapsed === false} keepDOM>
          <div className='checkin-compact-panel mt-3 rounded-[18px] border border-semi-color-border/80 bg-white p-2 shadow-[0_8px_20px_rgba(15,23,42,0.035)]'>
            <Tabs type='line'>
              {status?.checkin_enabled ? (
                <TabPane tab={t('签到概览')} itemKey='overview'>
                  <div className='pt-3 md:pt-4'>
                    <div className='mb-3 grid grid-cols-1 gap-2.5 md:mb-4 md:gap-3 lg:grid-cols-[minmax(0,1.35fr),minmax(0,0.65fr)]'>
                      <div className='rounded-[16px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.98))] p-3'>
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
                        <div className='mt-1.5 text-[12px] leading-5 text-semi-color-text-1'>
                          {availabilityHintText ||
                            t('每日签到可获得随机额度奖励')}
                        </div>
                        <div className='mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3'>
                          {overviewCards.map((item) => (
                            <div
                              key={item.key}
                              className='rounded-[14px] border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm'
                            >
                              <div className='text-[10px] text-semi-color-text-2'>
                                {item.label}
                              </div>
                              <div
                                className={`mt-1 text-[15px] font-semibold ${item.tone}`}
                              >
                                {item.value}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className='grid grid-cols-2 gap-2 lg:grid-cols-2'>
                        {leaderboardSummaryCards.map((item) => (
                          <div
                            key={item.key}
                            className='rounded-[14px] border border-slate-200/80 bg-slate-50/90 px-3 py-2.5'
                          >
                            <div className='text-[10px] text-semi-color-text-2'>
                              {item.label}
                            </div>
                            <div
                              className={`mt-1 text-[14px] font-semibold ${item.tone}`}
                            >
                              {item.value}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Spin spinning={loading}>
                      <div className='checkin-calendar overflow-hidden rounded-[16px] border border-semi-color-border/80 bg-semi-color-bg-0 shadow-sm'>
                        <style>{`
                  .checkin-calendar .semi-calendar {
                    font-size: 12px;
                  }
                  .checkin-calendar .semi-calendar-month-header {
                    padding: 6px 10px;
                  }
                  .checkin-calendar .semi-calendar-month-week-row {
                    height: 26px;
                  }
                  .checkin-calendar .semi-calendar-month-week-row th {
                    font-size: 11px;
                    padding: 4px 0;
                  }
                  .checkin-calendar .semi-calendar-month-grid-row {
                    height: auto;
                  }
                  .checkin-calendar .semi-calendar-month-grid-row td {
                    height: 52px;
                    padding: 1px;
                  }
                  .checkin-calendar .semi-calendar-month-grid-row-cell {
                    position: relative;
                    height: 100%;
                  }
                  .checkin-calendar .semi-calendar-month-grid-row-cell-day {
                    position: absolute;
                    top: 3px;
                    left: 50%;
                    transform: translateX(-50%);
                    font-size: 11px;
                    z-index: 1;
                  }
                  .checkin-calendar .semi-calendar-month-same {
                    background: transparent;
                  }
                  .checkin-calendar .semi-calendar-month-today .semi-calendar-month-grid-row-cell-day {
                    background: var(--semi-color-primary);
                    color: white;
                    border-radius: 50%;
                    width: 18px;
                    height: 18px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                  }
                `}</style>
                        <Calendar
                          mode='month'
                          onChange={handleMonthChange}
                          dateGridRender={dateRender}
                        />
                      </div>
                    </Spin>

                    <div className='checkin-compact-note mt-2.5 rounded-[14px] border border-slate-200/80 bg-slate-50/90 px-3 py-2'>
                      <div className='flex flex-wrap gap-x-3 gap-y-1 text-[10px] leading-4 text-semi-color-text-2'>
                        <span>{t('每日随机奖励')}</span>
                        <span>{t('奖励直接到账')}</span>
                        <span>{t('每日仅可签到一次')}</span>
                      </div>
                    </div>
                  </div>
                </TabPane>
              ) : null}

              {activityLotteryEnabled ? (
                <TabPane tab={t('活动抽奖')} itemKey='lottery'>
                  <div className='pt-5 md:pt-6'>
                    <div className='rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.96),rgba(255,255,255,0.98))] p-4 md:p-5'>
                      <div className='flex items-start justify-between gap-3'>
                        <div className='flex items-center gap-2'>
                          <Gift size={18} className='text-amber-600' />
                          <Typography.Text strong>
                            {t('活动抽奖')}
                          </Typography.Text>
                        </div>
                        <Tag color='amber' type='light' shape='circle'>
                          {t('公示')}
                        </Tag>
                      </div>
                      <div className='mt-2 text-sm text-semi-color-text-1'>
                        {t(
                          '规则：每期都必须先手动报名；无论配置了哪种自动条件，报名后才开始按本期配置统计充值或消耗条件，满足人数与到期时间后自动开奖。',
                        )}
                      </div>
                      <div className='mt-3 flex flex-wrap items-center gap-2'>
                        {lotterySummary?.join_allowed &&
                        !lotterySummary?.joined ? (
                          <Button
                            type='primary'
                            theme='solid'
                            loading={lotteryJoinLoading}
                            onClick={joinActivityLottery}
                          >
                            {t('报名参与')}
                          </Button>
                        ) : null}
                        {lotterySummary?.joined ? (
                          <Tag color='blue' type='light' shape='circle'>
                            {t('你已报名本期')}
                          </Tag>
                        ) : null}
                      </div>

                      <Spin spinning={lotteryLoading}>
                        <div className='mt-4 rounded-2xl border border-slate-200/80 bg-white p-4'>
                          <div className='text-xs text-semi-color-text-2'>
                            {t('当前公示')}
                          </div>
                          <div className='mt-1 text-base font-semibold text-semi-color-text-0'>
                            {lotterySummary?.round?.title ||
                              t('暂无进行中的期数')}
                          </div>
                          {lotterySummary?.round?.start_at ||
                          lotterySummary?.round?.end_at ? (
                            <div className='mt-2 text-xs text-semi-color-text-2'>
                              {t('活动时间')}:{' '}
                              {lotterySummary?.round?.start_at
                                ? formatCheckinDateTime(
                                    lotterySummary.round.start_at,
                                  )
                                : '--'}{' '}
                              ~{' '}
                              {lotterySummary?.round?.end_at
                                ? formatCheckinDateTime(
                                    lotterySummary.round.end_at,
                                  )
                                : '--'}
                            </div>
                          ) : null}
                          <div className='mt-2 flex flex-wrap gap-2'>
                            <Tag
                              color={
                                lotterySummary?.count_reached ? 'green' : 'grey'
                              }
                              type='light'
                              shape='circle'
                            >
                              {t('有效参与')}:{' '}
                              {Number(lotterySummary?.participant_count || 0)} /{' '}
                              {Number(lotterySummary?.need_participants || 0)}
                            </Tag>
                            <Tag color='blue' type='light' shape='circle'>
                              {t('已报名')}:{' '}
                              {Number(lotterySummary?.signup_count || 0)}
                            </Tag>
                            <Tag
                              color={
                                lotterySummary?.time_reached ? 'green' : 'grey'
                              }
                              type='light'
                              shape='circle'
                            >
                              {lotterySummary?.time_reached
                                ? t('时间已到')
                                : t('等待开奖')}
                            </Tag>
                            <Tag
                              color={
                                lotterySummary?.auto_draw_ready
                                  ? 'green'
                                  : 'amber'
                              }
                              type='light'
                              shape='circle'
                            >
                              {lotterySummary?.auto_draw_ready
                                ? t('可自动开奖')
                                : t('未满足')}
                            </Tag>
                            {lotterySummary?.joined ? (
                              <Tag color='blue' type='light' shape='circle'>
                                {t('已参与')}
                              </Tag>
                            ) : null}
                            {lotterySummary?.is_winner ? (
                              <Tag color='green' type='light' shape='circle'>
                                {t('已中奖')}
                              </Tag>
                            ) : null}
                          </div>
                          {lotterySummary?.round?.prize ? (
                            <div className='mt-4 rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4'>
                              <div className='text-xs font-medium text-amber-800'>
                                {t('本期奖品')}
                              </div>
                              <div className='mt-2 whitespace-pre-wrap text-sm text-semi-color-text-0'>
                                {lotterySummary.round.prize}
                              </div>
                            </div>
                          ) : null}
                          <div className='mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4'>
                            <div className='text-xs text-semi-color-text-2'>
                              {t('参与条件')}
                            </div>
                            <div className='mt-2 flex flex-wrap gap-2'>
                              {normalizeCheckinWeekdays(
                                lotterySummary?.round?.join_sources || 'manual',
                              ).map((source) => (
                                <Tag
                                  key={source}
                                  color='blue'
                                  type='light'
                                  shape='circle'
                                >
                                  {t(
                                    ACTIVITY_LOTTERY_JOIN_SOURCE_LABELS[
                                      source
                                    ] || source,
                                  )}
                                </Tag>
                              ))}
                              {normalizeCheckinWeekdays(
                                lotterySummary?.round?.join_sources || 'manual',
                              ).includes('topup') ? (
                                <Tag color='orange' type='light' shape='circle'>
                                  {t(
                                    lotterySummary?.round?.join_topup_scope ===
                                      'total'
                                      ? '累计充值'
                                      : '今日充值',
                                  )}{' '}
                                  ·{' '}
                                  {t(
                                    lotterySummary?.round?.join_topup_unit ===
                                      'token'
                                      ? 'Token'
                                      : '人民币',
                                  )}{' '}
                                  ≥{' '}
                                  {Number(
                                    lotterySummary?.round
                                      ?.join_topup_min_money || 0,
                                  )}
                                </Tag>
                              ) : null}
                              {normalizeCheckinWeekdays(
                                lotterySummary?.round?.join_sources || 'manual',
                              ).includes('consume') ? (
                                <Tag color='orange' type='light' shape='circle'>
                                  {t(
                                    lotterySummary?.round
                                      ?.join_daily_consume_scope === 'total'
                                      ? '累计消耗'
                                      : '今日消耗',
                                  )}{' '}
                                  ·{' '}
                                  {t(
                                    lotterySummary?.round
                                      ?.join_daily_consume_threshold_unit ===
                                      'token'
                                      ? 'Token'
                                      : '人民币',
                                  )}{' '}
                                  ≥{' '}
                                  {Number(
                                    lotterySummary?.round
                                      ?.join_daily_consume_min_money || 0,
                                  )}
                                </Tag>
                              ) : null}
                            </div>
                          </div>
                          {lotterySummary?.prize ? (
                            <div className='mt-3 text-sm text-semi-color-text-0 whitespace-pre-wrap'>
                              {t('中奖发放内容')}: {lotterySummary.prize}
                            </div>
                          ) : null}
                          {Array.isArray(lotterySummary?.winners) &&
                          lotterySummary.winners.length > 0 ? (
                            <div className='mt-4'>
                              <div className='text-xs text-semi-color-text-2'>
                                {t('中奖公示')}
                              </div>
                              <div className='mt-2 flex flex-col gap-2'>
                                {lotterySummary.winners.map((item) => (
                                  <div
                                    key={`${item?.id || ''}-${item?.user_id || ''}`}
                                    className='flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2'
                                  >
                                    <div className='text-sm font-medium'>
                                      <div className='flex flex-col'>
                                        <div>{item?.masked_name || '-'}</div>
                                        {item?.masked_email ? (
                                          <div className='text-[11px] text-semi-color-text-2'>
                                            {item.masked_email}
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                    <Tag
                                      color='green'
                                      type='light'
                                      shape='circle'
                                    >
                                      {t('已开奖')}
                                    </Tag>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className='mt-4 text-sm text-semi-color-text-2'>
                              {t('尚未开奖或暂无中奖名单')}
                            </div>
                          )}
                        </div>
                      </Spin>

                      <div className='mt-4 rounded-2xl border border-slate-200/80 bg-white p-4'>
                        <div className='flex items-center justify-between gap-2'>
                          <div className='text-sm font-medium text-semi-color-text-0'>
                            {t('历史期公示')}
                          </div>
                          <Button
                            theme='outline'
                            size='small'
                            loading={lotteryRoundsLoading}
                            onClick={fetchPublicLotteryRounds}
                          >
                            {t('刷新')}
                          </Button>
                        </div>
                        <Spin spinning={lotteryRoundsLoading}>
                          {Array.isArray(lotteryRounds) &&
                          lotteryRounds.length > 0 ? (
                            <Collapse accordion className='mt-3'>
                              {lotteryRounds.map((item) => {
                                const round = item?.round;
                                const winners = Array.isArray(item?.winners)
                                  ? item.winners
                                  : [];
                                return (
                                  <Collapse.Panel
                                    key={round?.id || Math.random()}
                                    itemKey={String(round?.id || '')}
                                    header={
                                      <div className='flex items-center justify-between gap-3 w-full'>
                                        <div className='font-medium'>
                                          {round?.title ||
                                            `#${round?.id || '-'}`}
                                        </div>
                                        <div className='text-xs text-semi-color-text-2'>
                                          {round?.end_at
                                            ? formatCheckinDateTime(
                                                round.end_at,
                                              )
                                            : '--'}
                                        </div>
                                      </div>
                                    }
                                  >
                                    {winners.length > 0 ? (
                                      <div className='flex flex-wrap gap-2'>
                                        {winners.map((w) => (
                                          <Tag
                                            key={`${w?.id || ''}-${w?.user_id || ''}`}
                                            color='green'
                                            type='light'
                                            shape='circle'
                                          >
                                            {w?.masked_name || '-'}
                                            {w?.masked_email
                                              ? ` (${w.masked_email})`
                                              : ''}
                                          </Tag>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className='text-sm text-semi-color-text-2'>
                                        {t('暂无中奖名单')}
                                      </div>
                                    )}
                                  </Collapse.Panel>
                                );
                              })}
                            </Collapse>
                          ) : (
                            <div className='mt-3 text-sm text-semi-color-text-2'>
                              {t('暂无历史期')}
                            </div>
                          )}
                        </Spin>
                      </div>
                    </div>
                  </div>
                </TabPane>
              ) : null}
              {status?.checkin_enabled ? (
                <TabPane tab={t('签到榜')} itemKey='leaderboard'>
                  <div className='pt-5 md:pt-6'>
                    <Spin spinning={leaderboardLoading}>
                      <div className='space-y-4 md:space-y-5'>
                        <div className='rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.98))] px-4 py-4 md:px-5'>
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
                              className='rounded-[22px] border border-slate-200/80 bg-slate-50/90 px-4 py-3.5'
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
                                    className={`rounded-[22px] border px-4 py-3.5 transition-colors hover:bg-semi-color-fill-1 md:px-5 md:py-4 ${
                                      isTopThree
                                        ? 'border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.92),rgba(255,255,255,0.98))]'
                                        : 'border-slate-200/80 bg-slate-50/75'
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
                                            {t('累计签到')}{' '}
                                            {item.total_checkins || 0} {t('天')}
                                          </span>
                                        </div>
                                      </div>
                                      <div className='text-right'>
                                        <div className='text-[11px] text-semi-color-text-2'>
                                          {t('累计获得')}
                                        </div>
                                        <div className='mt-1 inline-flex rounded-full bg-semi-color-fill-1 px-2.5 py-1 text-[12px] font-semibold leading-none text-semi-color-text-0'>
                                          {renderQuota(
                                            item.total_quota || 0,
                                            6,
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            {leaderboardTotal > leaderboardPageSize ? (
                              <div className='flex justify-center border-t border-semi-color-border/70 pt-4'>
                                <Pagination
                                  currentPage={leaderboardPage}
                                  pageSize={leaderboardPageSize}
                                  total={leaderboardTotal}
                                  showSizeChanger={false}
                                  size='small'
                                  onPageChange={(page) =>
                                    setLeaderboardPage(page)
                                  }
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
                  </div>
                </TabPane>
              ) : null}
              {todayRecords.length > 0 ? (
                <TabPane tab={t('今日签到')} itemKey='today-records'>
                  <div className='pt-5 md:pt-6'>
                    <Spin spinning={leaderboardLoading}>
                      <div className='space-y-4 md:space-y-5'>
                        <div className='rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.98))] px-4 py-4 md:px-5'>
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
                          className='overflow-hidden rounded-[24px] border border-semi-color-border/80 shadow-sm'
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
                  </div>
                </TabPane>
              ) : null}
            </Tabs>
          </div>
        </Collapsible>
      ) : null}
    </Card>
  );
};

export default CheckinCalendar;
