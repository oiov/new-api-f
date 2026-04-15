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
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Banner,
  Button,
  Collapse,
  Empty,
  Pagination,
  Select,
  SideSheet,
  Spin,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import {
  BadgeCheck,
  ChevronRight,
  CircleAlert,
  Clock3,
  Gift,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CardPro from '../../components/common/ui/CardPro';
import { StatusContext } from '../../context/Status';
import { API, showError, showSuccess, timestamp2string } from '../../helpers';
import { useIsMobile } from '../../hooks/common/useIsMobile';

const { Paragraph, Text } = Typography;
const HISTORY_PAGE_SIZE = 8;

const normalizeJoinSources = (raw) => {
  return String(raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const JOIN_SOURCE_LABELS = {
  manual: '本页手动报名',
  checkin: '报名后完成签到',
};

const resolveDisplayName = (item) => {
  return (
    item?.display_name ||
    item?.masked_name ||
    item?.username ||
    (item?.user_id ? `UID${item.user_id}` : '-')
  );
};

const resolveQualifiedStatus = (item, t) => {
  if (item?.qualified) {
    return t('已满足参与条件');
  }
  return t('已报名，待达标');
};

const buildDrawStatusText = (summary, t) => {
  const needParticipants = Number(summary?.need_participants || 0);
  const participantCount = Number(summary?.participant_count || 0);
  const missingParticipants = Math.max(needParticipants - participantCount, 0);
  const countReached = !!summary?.count_reached;
  const timeReached = !!summary?.time_reached;

  if (countReached && timeReached) {
    return t('已满足开奖条件');
  }
  if (countReached) {
    return t('已达人数，等待开奖');
  }
  if (timeReached) {
    return t('已到开奖时间，还差 {{count}} 人', { count: missingParticipants });
  }
  return t('还需 {{count}} 人，且等待开奖', { count: missingParticipants });
};

const renderRoundPublicTargets = (round, t) => {
  if (!round) return null;
  return (
    <div className='mt-3 flex flex-wrap gap-2'>
      <Tag color='cyan' type='light' shape='circle'>
        {t('最低参与人数')}: {Number(round?.min_participants || 0)}
      </Tag>
      <Tag color='violet' type='light' shape='circle'>
        {t('中奖人数')}: {Number(round?.winner_count || 0)}
      </Tag>
    </div>
  );
};

const buildRoundConditionTags = (round, joinSources, t) => {
  const tags = [
    {
      key: 'manual',
      color: 'blue',
      text: t('本页手动报名'),
    },
  ];

  joinSources
    .filter((source) => source === 'checkin')
    .forEach((source) => {
      tags.push({
        key: source,
        color: 'blue',
        text: t(JOIN_SOURCE_LABELS[source] || source),
      });
    });

  if (joinSources.includes('topup')) {
    tags.push({
      key: 'topup',
      color: 'orange',
      text: `${t('报名后')} ${t(
        round?.join_topup_scope === 'total' ? '累计充值' : '今日充值',
      )} · ${t(
        round?.join_topup_unit === 'token' ? 'Token' : '人民币',
      )} ≥ ${Number(round?.join_topup_min_money || 0)}`,
    });
  }

  if (joinSources.includes('consume')) {
    tags.push({
      key: 'consume',
      color: 'orange',
      text: `${t('报名后')} ${t(
        round?.join_daily_consume_scope === 'total' ? '累计消耗' : '今日消耗',
      )} · ${t(
        round?.join_daily_consume_threshold_unit === 'token'
          ? 'Token'
          : '人民币',
      )} ≥ ${Number(round?.join_daily_consume_min_money || 0)}`,
    });
  }

  return tags;
};

export default function ActivityLotteryPage() {
  const { t } = useTranslation();
  const [statusState] = useContext(StatusContext);
  const status = statusState?.status || {};
  const isMobile = useIsMobile();

  const [summaryLoading, setSummaryLoading] = useState(false);
  const [roundsLoading, setRoundsLoading] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [rounds, setRounds] = useState([]);
  const [joinPressed, setJoinPressed] = useState(false);
  const [rewardHighlight, setRewardHighlight] = useState(false);
  const [entriesByRound, setEntriesByRound] = useState({});
  const [entryLoadingByRound, setEntryLoadingByRound] = useState({});
  const [entryDrawerRound, setEntryDrawerRound] = useState(null);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historyPage, setHistoryPage] = useState(1);

  const loadSummary = useCallback(async () => {
    if (!status?.activity_lottery_enabled) return;
    setSummaryLoading(true);
    try {
      const res = await API.get('/api/activity/lottery/current');
      if (res?.data?.success) {
        setSummary(res.data.data || null);
      } else {
        setSummary(null);
      }
    } catch (error) {
      setSummary(null);
      showError(error?.response?.data?.message || t('获取抽奖信息失败'));
    } finally {
      setSummaryLoading(false);
    }
  }, [status?.activity_lottery_enabled, t]);

  const loadPublicRounds = useCallback(async () => {
    if (!status?.activity_lottery_enabled) return;
    setRoundsLoading(true);
    try {
      const res = await API.get('/api/activity/lottery/rounds', {
        params: { limit: 60 },
      });
      if (res?.data?.success) {
        setRounds(res.data?.data?.items || []);
      } else {
        setRounds([]);
      }
    } catch (error) {
      setRounds([]);
      showError(error?.response?.data?.message || t('获取历史期失败'));
    } finally {
      setRoundsLoading(false);
    }
  }, [status?.activity_lottery_enabled, t]);

  const joinCurrent = async () => {
    if (!status?.activity_lottery_enabled) return;
    setJoinLoading(true);
    try {
      const res = await API.post('/api/activity/lottery/join');
      if (res?.data?.success) {
        showSuccess(t('报名成功'));
        loadSummary();
      } else {
        showError(res?.data?.message || t('报名失败'));
      }
    } catch (error) {
      showError(error?.response?.data?.message || t('报名失败'));
    } finally {
      setJoinLoading(false);
    }
  };

  const loadRoundEntries = useCallback(
    async (roundId) => {
      const id = Number(roundId || 0);
      if (!id || entryLoadingByRound[id]) return;
      setEntryLoadingByRound((prev) => ({ ...prev, [id]: true }));
      try {
        const res = await API.get(`/api/activity/lottery/rounds/${id}/entries`);
        if (res?.data?.success) {
          setEntriesByRound((prev) => ({
            ...prev,
            [id]: Array.isArray(res?.data?.data?.items)
              ? res.data.data.items
              : [],
          }));
        } else {
          setEntriesByRound((prev) => ({ ...prev, [id]: [] }));
        }
      } catch (error) {
        setEntriesByRound((prev) => ({ ...prev, [id]: [] }));
        showError(error?.response?.data?.message || t('获取报名记录失败'));
      } finally {
        setEntryLoadingByRound((prev) => ({ ...prev, [id]: false }));
      }
    },
    [entryLoadingByRound, t],
  );

  useEffect(() => {
    if (!status?.activity_lottery_enabled) return;
    loadSummary();
    loadPublicRounds();
  }, [status?.activity_lottery_enabled, loadSummary, loadPublicRounds]);

  useEffect(() => {
    if (!summary?.prize) {
      setRewardHighlight(false);
      return undefined;
    }
    setRewardHighlight(true);
    const timer = window.setTimeout(() => {
      setRewardHighlight(false);
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [summary?.prize]);

  useEffect(() => {
    if (!status?.activity_lottery_enabled) return;
    const roundId = Number(summary?.round?.id || 0);
    if (!roundId || entriesByRound[roundId]) return;
    loadRoundEntries(roundId);
  }, [
    entriesByRound,
    loadRoundEntries,
    status?.activity_lottery_enabled,
    summary?.round?.id,
  ]);

  const currentRound = summary?.round || null;
  const winners = Array.isArray(summary?.winners) ? summary.winners : [];
  const joinSources = useMemo(
    () => normalizeJoinSources(currentRound?.join_sources || 'manual'),
    [currentRound?.join_sources],
  );
  const joinAllowed = !!summary?.join_allowed;
  const joined = !!summary?.joined;
  const qualified = !!summary?.qualified;
  const nowUnix = Math.floor(Date.now() / 1000);
  const signupNotStarted =
    !joinAllowed &&
    !joined &&
    currentRound?.status === 'open' &&
    Number(currentRound?.start_at || 0) > nowUnix;
  const drawStatusText = useMemo(
    () => buildDrawStatusText(summary, t),
    [summary, t],
  );
  const conditionTags = useMemo(
    () => buildRoundConditionTags(currentRound, joinSources, t),
    [currentRound, joinSources, t],
  );
  const summaryMetrics = useMemo(
    () => [
      {
        key: 'participants',
        title: t('有效参与'),
        value: `${Number(summary?.participant_count || 0)} / ${Number(
          summary?.need_participants || 0,
        )}`,
        icon: Users,
        tone: summary?.count_reached ? 'success' : 'default',
      },
      {
        key: 'signup',
        title: t('已报名'),
        value: Number(summary?.signup_count || 0),
        icon: BadgeCheck,
        tone: 'info',
      },
      {
        key: 'draw',
        title: t('开奖状态'),
        value: drawStatusText,
        icon: summary?.auto_draw_ready ? Trophy : Clock3,
        tone: summary?.auto_draw_ready ? 'success' : 'warning',
      },
    ],
    [drawStatusText, summary, t],
  );
  const historyRounds = useMemo(
    () =>
      (Array.isArray(rounds) ? rounds : []).filter((item) => {
        const round = item?.round;
        const list = Array.isArray(item?.winners) ? item.winners : [];
        return (
          (round?.status || '') === 'drawn' ||
          list.length > 0 ||
          Number(round?.drawn_at || 0) > 0
        );
      }),
    [rounds],
  );
  const filteredHistoryRounds = useMemo(() => {
    if (historyFilter === 'with_winners') {
      return historyRounds.filter(
        (item) => Array.isArray(item?.winners) && item.winners.length > 0,
      );
    }
    if (historyFilter === 'high_threshold') {
      return historyRounds.filter(
        (item) => Number(item?.round?.min_participants || 0) >= 10,
      );
    }
    return historyRounds;
  }, [historyFilter, historyRounds]);
  const historyPageCount = Math.max(
    Math.ceil(filteredHistoryRounds.length / HISTORY_PAGE_SIZE),
    1,
  );
  const pagedHistoryRounds = useMemo(() => {
    const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
    return filteredHistoryRounds.slice(start, start + HISTORY_PAGE_SIZE);
  }, [filteredHistoryRounds, historyPage]);

  useEffect(() => {
    if (historyPage > historyPageCount) {
      setHistoryPage(1);
    }
  }, [historyPage, historyPageCount]);

  const currentEntries = Array.isArray(entriesByRound[currentRound?.id])
    ? entriesByRound[currentRound?.id]
    : [];
  const currentEntryLoading = !!entryLoadingByRound[currentRound?.id];
  const drawerRoundId = Number(entryDrawerRound?.id || 0);
  const drawerEntries = Array.isArray(entriesByRound[drawerRoundId])
    ? entriesByRound[drawerRoundId]
    : [];
  const drawerEntryLoading = !!entryLoadingByRound[drawerRoundId];

  const openEntryDrawer = useCallback(
    (round) => {
      if (!round?.id) return;
      setEntryDrawerRound(round);
      loadRoundEntries(round.id);
    },
    [loadRoundEntries],
  );

  const closeEntryDrawer = useCallback(() => {
    setEntryDrawerRound(null);
  }, []);

  return (
    <div className='px-2'>
      <SideSheet
        title={entryDrawerRound?.title || t('全部报名用户')}
        visible={!!entryDrawerRound}
        width={isMobile ? '100%' : 720}
        onCancel={closeEntryDrawer}
        footer={
          <div
            className={`flex gap-3 ${
              isMobile
                ? 'flex-col items-stretch justify-start'
                : 'items-center justify-between'
            }`}
          >
            <Text type='secondary'>
              {t('全部报名用户')} · {Number(drawerEntries.length || 0)}
            </Text>
            <Button
              theme='outline'
              size='small'
              block={isMobile}
              loading={drawerEntryLoading}
              onClick={() => loadRoundEntries(drawerRoundId)}
              disabled={!drawerRoundId}
            >
              {t('刷新')}
            </Button>
          </div>
        }
        bodyStyle={{
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        }}
      >
        <div
          className={`border-b border-semi-color-border text-xs text-semi-color-text-2 ${
            isMobile ? 'px-4 py-3' : 'px-6 py-3'
          }`}
        >
          {entryDrawerRound?.start_at || entryDrawerRound?.end_at ? (
            <>
              {t('活动时间')}:{' '}
              {entryDrawerRound?.start_at
                ? timestamp2string(entryDrawerRound.start_at)
                : '--'}{' '}
              ~{' '}
              {entryDrawerRound?.end_at
                ? timestamp2string(entryDrawerRound.end_at)
                : '--'}
            </>
          ) : (
            t('报名记录')
          )}
        </div>
        <div className={`flex-1 overflow-y-auto ${isMobile ? 'px-4 py-3' : 'px-6 py-4'}`}>
          <Spin spinning={drawerEntryLoading}>
            {drawerEntries.length > 0 ? (
              isMobile ? (
                <div className='space-y-3'>
                  {drawerEntries.map((item, index) => (
                    <div
                      key={`${item?.id || ''}-${item?.created_at || ''}-${index}`}
                      className='rounded-2xl border border-semi-color-border bg-semi-color-fill-0 p-4 shadow-sm'
                    >
                      <div className='flex items-start justify-between gap-3'>
                        <div className='min-w-0 flex-1'>
                          <div className='text-xs text-semi-color-text-2'>
                            {t('报名用户')}
                          </div>
                          <Text
                            ellipsis={{ showTooltip: true }}
                            className='mt-1 block text-sm font-semibold text-semi-color-text-0'
                          >
                            {resolveDisplayName(item)}
                          </Text>
                        </div>
                        <Tag
                          color={item?.qualified ? 'green' : 'orange'}
                          type='light'
                          shape='circle'
                        >
                          {resolveQualifiedStatus(item, t)}
                        </Tag>
                      </div>
                      <div className='mt-3 rounded-xl bg-semi-color-bg-1 px-3 py-2'>
                        <div className='text-xs text-semi-color-text-2'>
                          {t('报名时间')}
                        </div>
                        <div className='mt-1 text-sm text-semi-color-text-1'>
                          {item?.created_at ? timestamp2string(item.created_at) : '-'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className='overflow-hidden rounded-2xl border border-semi-color-border bg-semi-color-fill-0'>
                  <div className='lottery-public-table lottery-public-table--header'>
                    <div>{t('报名用户')}</div>
                    <div>{t('报名时间')}</div>
                    <div>{t('参与状态')}</div>
                  </div>
                  {drawerEntries.map((item, index) => (
                    <div
                      key={`${item?.id || ''}-${item?.created_at || ''}-${index}`}
                      className='lottery-public-table'
                    >
                      <div className='min-w-0'>
                        <Text ellipsis={{ showTooltip: true }}>
                          {resolveDisplayName(item)}
                        </Text>
                      </div>
                      <div className='text-semi-color-text-1'>
                        {item?.created_at ? timestamp2string(item.created_at) : '-'}
                      </div>
                      <div>
                        <Tag
                          color={item?.qualified ? 'green' : 'orange'}
                          type='light'
                          shape='circle'
                        >
                          {resolveQualifiedStatus(item, t)}
                        </Tag>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className='rounded-2xl border border-dashed border-semi-color-border bg-semi-color-fill-0 px-4 py-10 text-sm text-semi-color-text-2'>
                {t('暂无报名记录')}
              </div>
            )}
          </Spin>
        </div>
      </SideSheet>
      <CardPro
        type='type2'
        searchArea={
          <div className='flex flex-col gap-3'>
            <Banner
              type='warning'
              bordered={false}
              closeIcon={null}
              description={t(
                '抽奖规则：每期都必须先手动报名；无论配置了哪种自动条件，报名后才开始按本期配置统计充值/消耗条件。满足“有效参与人数 ≥ 目标人数”且“到开奖时间”后，系统自动开奖并公示结果。',
              )}
            />
            <div className='activity-lottery-hero'>
              <div className='activity-lottery-hero__main'>
                <div className='activity-lottery-hero__eyebrow'>
                  <Sparkles size={14} />
                  <span>{t('当前活动抽奖')}</span>
                </div>
                <h2 className='activity-lottery-hero__title'>
                  {currentRound?.title || t('暂无进行中的期数')}
                </h2>
                <div className='activity-lottery-hero__desc'>
                  {currentRound?.start_at || currentRound?.end_at ? (
                    <>
                      <Clock3 size={15} />
                      <span>
                        {t('活动时间')}：
                        {currentRound?.start_at
                          ? timestamp2string(currentRound.start_at)
                          : '--'}{' '}
                        ~{' '}
                        {currentRound?.end_at
                          ? timestamp2string(currentRound.end_at)
                          : '--'}
                      </span>
                    </>
                  ) : (
                    <>
                      <CircleAlert size={15} />
                      <span>{t('当前暂无可公示的进行中期数')}</span>
                    </>
                  )}
                </div>
                <div className='activity-lottery-hero__chips'>
                  <Tag
                    color={summary?.auto_draw_ready ? 'green' : 'amber'}
                    type='light'
                    shape='circle'
                  >
                    {drawStatusText}
                  </Tag>
                  {joined ? (
                    <Tag
                      color='blue'
                      type='light'
                      shape='circle'
                      className='lottery-status-chip lottery-status-chip--joined'
                    >
                      {t('你已报名本期')}
                    </Tag>
                  ) : null}
                  {joined && !qualified ? (
                    <Tag color='orange' type='light' shape='circle'>
                      {t('已报名，待达标')}
                    </Tag>
                  ) : null}
                  {qualified ? (
                    <Tag color='green' type='light' shape='circle'>
                      {t('已满足参与条件')}
                    </Tag>
                  ) : null}
                  {summary?.is_winner ? (
                    <Tag
                      color='green'
                      type='light'
                      shape='circle'
                      className='lottery-status-chip lottery-status-chip--winner'
                    >
                      {t('你已中奖')}
                    </Tag>
                  ) : null}
                </div>
              </div>
              <div className='activity-lottery-hero__actions'>
                <div className='activity-lottery-hero__action-bar'>
                  <Button
                    theme='outline'
                    onClick={loadSummary}
                    loading={summaryLoading}
                  >
                    {t('刷新')}
                  </Button>
                  {joinAllowed && !joined ? (
                    <Button
                      type='primary'
                      className={`lottery-join-cta ${
                        joinPressed ? 'lottery-join-cta--pressed' : ''
                      }`}
                      onMouseDown={() => setJoinPressed(true)}
                      onMouseUp={() => setJoinPressed(false)}
                      onMouseLeave={() => setJoinPressed(false)}
                      onClick={joinCurrent}
                      loading={joinLoading}
                    >
                      {t('报名参与')}
                    </Button>
                  ) : null}
                  {signupNotStarted ? (
                    <Button type='primary' disabled>
                      {t('报名参与')}
                    </Button>
                  ) : null}
                </div>
                <div className='activity-lottery-hero__hint'>
                  {signupNotStarted && currentRound?.start_at
                    ? `${t('报名开始时间')}：${timestamp2string(currentRound.start_at)}`
                    : t(
                        '每期都必须先手动报名，报名后才会开始统计签到、充值或消耗条件。',
                      )}
                </div>
              </div>
            </div>
          </div>
        }
        t={t}
      >
        {!status?.activity_lottery_enabled ? (
          <Empty
            image={<IllustrationNoResult />}
            darkModeImage={<IllustrationNoResultDark />}
            description={t('活动抽奖未启用')}
          />
        ) : (
          <div className='space-y-4'>
            <Spin spinning={summaryLoading}>
              <div className='activity-lottery-summary-grid'>
                {summaryMetrics.map((metric) => {
                  const MetricIcon = metric.icon;
                  return (
                    <div
                      key={metric.key}
                      className={`activity-lottery-metric-card activity-lottery-metric-card--${metric.tone}`}
                    >
                      <div className='activity-lottery-metric-card__icon'>
                        <MetricIcon size={18} />
                      </div>
                      <div className='activity-lottery-metric-card__content'>
                        <div className='activity-lottery-metric-card__title'>
                          {metric.title}
                        </div>
                        <div className='activity-lottery-metric-card__value'>
                          {metric.value}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className='activity-lottery-main-grid'>
                <div className='activity-lottery-section-card activity-lottery-section-card--feature'>
                  <div className='activity-lottery-section-card__header'>
                    <div>
                      <div className='activity-lottery-section-card__eyebrow'>
                        {t('本期信息')}
                      </div>
                      <div className='activity-lottery-section-card__title'>
                        {t('开奖公示面板')}
                      </div>
                    </div>
                    {renderRoundPublicTargets(currentRound, t)}
                  </div>

                  {currentRound?.prize ? (
                    <div className='activity-lottery-highlight-card activity-lottery-highlight-card--prize'>
                      <div className='activity-lottery-highlight-card__icon'>
                        <Gift size={18} />
                      </div>
                      <div className='activity-lottery-highlight-card__body'>
                        <div className='activity-lottery-highlight-card__title'>
                          {t('本期奖品')}
                        </div>
                        <Paragraph
                          className='activity-lottery-highlight-card__text lottery-multiline-text'
                          ellipsis={{
                            rows: 4,
                            expandable: true,
                            showTooltip: true,
                          }}
                        >
                          {currentRound.prize}
                        </Paragraph>
                      </div>
                    </div>
                  ) : null}

                  {summary?.prize ? (
                    <div
                      className={`activity-lottery-highlight-card lottery-reward-panel ${
                        rewardHighlight ? 'lottery-reward-panel--active' : ''
                      }`}
                    >
                      <div className='activity-lottery-highlight-card__icon activity-lottery-highlight-card__icon--reward'>
                        <Trophy size={18} />
                      </div>
                      <div className='activity-lottery-highlight-card__body'>
                        <div className='activity-lottery-highlight-card__title'>
                          {t('中奖发放内容')}
                        </div>
                        <Paragraph
                          className='activity-lottery-highlight-card__text lottery-multiline-text'
                          ellipsis={{
                            rows: 4,
                            expandable: true,
                            showTooltip: true,
                          }}
                        >
                          {summary.prize}
                        </Paragraph>
                      </div>
                    </div>
                  ) : null}

                  {winners.length > 0 ? (
                    <div className='activity-lottery-winner-board'>
                      <div className='activity-lottery-winner-board__header'>
                        <div>
                          <div className='activity-lottery-section-card__eyebrow'>
                            {t('中奖公示')}
                          </div>
                          <div className='activity-lottery-section-card__title'>
                            {t('本期中奖名单')}
                          </div>
                        </div>
                        <Tag color='green' type='light' shape='circle'>
                          {t('已开奖')}
                        </Tag>
                      </div>
                      <div className='activity-lottery-winner-list'>
                        {winners.map((item, index) => (
                          <div
                            key={`${item?.id || ''}-${index}`}
                            className='activity-lottery-winner-card lottery-winner-item'
                          >
                            <div className='activity-lottery-winner-card__rank'>
                              {index + 1}
                            </div>
                            <div className='activity-lottery-winner-card__body'>
                              <Text
                                ellipsis={{ showTooltip: true }}
                                className='activity-lottery-winner-card__name'
                              >
                                {resolveDisplayName(item)}
                              </Text>
                              <div className='activity-lottery-winner-card__meta'>
                                {item?.created_at
                                  ? timestamp2string(item.created_at)
                                  : currentRound?.drawn_at
                                    ? timestamp2string(currentRound.drawn_at)
                                    : '-'}
                              </div>
                            </div>
                            <Tag
                              color={index === 0 ? 'amber' : 'green'}
                              type='light'
                              shape='circle'
                            >
                              {index === 0 ? t('优先展示') : t('已中奖')}
                            </Tag>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className='activity-lottery-empty-panel'>
                      <Trophy size={18} />
                      <span>{t('开奖后会在这里公示中奖名单')}</span>
                    </div>
                  )}
                </div>

                <div className='activity-lottery-side-stack'>
                  <div className='activity-lottery-section-card'>
                    <div className='activity-lottery-section-card__header'>
                      <div>
                        <div className='activity-lottery-section-card__eyebrow'>
                          {t('参与规则')}
                        </div>
                        <div className='activity-lottery-section-card__title'>
                          {t('如何获得抽奖资格')}
                        </div>
                      </div>
                    </div>
                    <div className='activity-lottery-condition-list'>
                      {conditionTags.map((item) => (
                        <div
                          key={item.key}
                          className='activity-lottery-condition-item'
                        >
                          <Tag color={item.color} type='solid' shape='circle'>
                            {item.key === 'manual' ? t('必需') : t('条件')}
                          </Tag>
                          <span>{item.text}</span>
                        </div>
                      ))}
                    </div>
                    <div className='activity-lottery-rule-note'>
                      <CircleAlert size={15} />
                      <span>
                        {t(
                          '系统只有在达到最低有效参与人数并到达开奖时间后，才会自动开奖并公示。',
                        )}
                      </span>
                    </div>
                  </div>

                  {currentRound?.id ? (
                    <div className='activity-lottery-section-card'>
                      <div className='activity-lottery-section-card__header'>
                        <div>
                          <div className='activity-lottery-section-card__eyebrow'>
                            {t('公开数据')}
                          </div>
                          <div className='activity-lottery-section-card__title'>
                            {t('报名用户列表')}
                          </div>
                        </div>
                        <Button
                          theme='outline'
                          size='small'
                          loading={
                            currentEntryLoading &&
                            Number(entryDrawerRound?.id || 0) ===
                              Number(currentRound.id || 0)
                          }
                          onClick={() => openEntryDrawer(currentRound)}
                          icon={<ChevronRight size={16} />}
                        >
                          {t('查看全部')}
                        </Button>
                      </div>
                      <div className='activity-lottery-signup-card'>
                        <div className='activity-lottery-signup-card__count'>
                          {Number(summary?.signup_count || currentEntries.length || 0)}
                        </div>
                        <div className='activity-lottery-signup-card__label'>
                          {t('当前已报名用户')}
                        </div>
                        <div className='activity-lottery-signup-card__hint'>
                          {t('点击查看可展开全部报名用户与报名时间')}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </Spin>

            <div className='activity-lottery-section-card activity-lottery-history-panel'>
              <div className='activity-lottery-history-toolbar'>
                <div>
                  <div className='activity-lottery-section-card__eyebrow'>
                    {t('历史档案')}
                  </div>
                  <div className='text-sm font-medium text-semi-color-text-0'>
                    {t('历史期公示')}
                  </div>
                  <div className='activity-lottery-history-toolbar__meta'>
                    {t('共 {{count}} 期', {
                      count: filteredHistoryRounds.length,
                    })}
                  </div>
                </div>
                <div className='activity-lottery-history-toolbar__actions'>
                  <Select
                    value={historyFilter}
                    onChange={(value) => {
                      setHistoryFilter(value);
                      setHistoryPage(1);
                    }}
                    optionList={[
                      { label: t('全部期数'), value: 'all' },
                      { label: t('仅看已开奖名单'), value: 'with_winners' },
                      { label: t('高门槛期数'), value: 'high_threshold' },
                    ]}
                    style={{ width: isMobile ? '100%' : 180 }}
                    size='small'
                  />
                  <Button
                    theme='outline'
                    size='small'
                    loading={roundsLoading}
                    onClick={loadPublicRounds}
                  >
                    {t('刷新')}
                  </Button>
                </div>
              </div>
              <Spin spinning={roundsLoading}>
                {filteredHistoryRounds.length > 0 ? (
                  <>
                    <div className='activity-lottery-history-list'>
                      <Collapse accordion className='mt-3'>
                        {pagedHistoryRounds.map((item) => {
                          const round = item?.round;
                          const list = Array.isArray(item?.winners)
                            ? item.winners
                            : [];
                          const roundEntries = Array.isArray(entriesByRound[round?.id])
                            ? entriesByRound[round?.id]
                            : [];
                          const roundEntryLoading = !!entryLoadingByRound[round?.id];
                          return (
                            <Collapse.Panel
                              key={round?.id || Math.random()}
                              itemKey={String(round?.id || '')}
                              header={
                                <div className='activity-lottery-history-header'>
                                  <div className='activity-lottery-history-header__main'>
                                    <div className='activity-lottery-history-header__title'>
                                      <Text ellipsis={{ showTooltip: true }}>
                                        {round?.title || `#${round?.id || '-'}`}
                                      </Text>
                                    </div>
                                    <div className='activity-lottery-history-header__meta'>
                                      <span>
                                        {t('开奖时间')}：
                                        {round?.drawn_at
                                          ? timestamp2string(round.drawn_at)
                                          : round?.end_at
                                            ? timestamp2string(round.end_at)
                                            : '--'}
                                      </span>
                                      <span>
                                        {t('已报名')} {Number(roundEntries.length || 0)}
                                      </span>
                                    </div>
                                  </div>
                                  <div className='activity-lottery-history-header__side'>
                                    <Tag color='cyan' type='light' shape='circle'>
                                      {t('最低参与人数')}{' '}
                                      {Number(round?.min_participants || 0)}
                                    </Tag>
                                    <Tag color='violet' type='light' shape='circle'>
                                      {t('中奖人数')}{' '}
                                      {Number(round?.winner_count || 0)}
                                    </Tag>
                                    <Tag
                                      color={list.length > 0 ? 'green' : 'grey'}
                                      type='light'
                                      shape='circle'
                                    >
                                      {list.length > 0
                                        ? t('已公示 {{count}} 人', {
                                            count: list.length,
                                          })
                                        : t('暂无中奖名单')}
                                    </Tag>
                                  </div>
                                </div>
                              }
                            >
                              <div className='space-y-3'>
                                {round?.prize ? (
                                  <div className='activity-lottery-history-card'>
                                    <div className='mb-2 font-medium text-semi-color-text-0'>
                                      {t('公示奖品')}
                                    </div>
                                    <Paragraph
                                      className='lottery-multiline-text'
                                      ellipsis={{
                                        rows: 3,
                                        expandable: true,
                                        showTooltip: true,
                                      }}
                                    >
                                      {round.prize}
                                    </Paragraph>
                                  </div>
                                ) : null}
                                {list.length > 0 ? (
                                  <div className='activity-lottery-history-winners'>
                                    {list.map((w, index) => (
                                      <div
                                        key={`${w?.id || ''}-${index}`}
                                        className='activity-lottery-history-winner'
                                      >
                                        <div className='activity-lottery-history-winner__rank'>
                                          {index + 1}
                                        </div>
                                        <div className='activity-lottery-history-winner__body'>
                                          <Text ellipsis={{ showTooltip: true }}>
                                            {resolveDisplayName(w)}
                                          </Text>
                                          <div className='activity-lottery-history-winner__time'>
                                            {w?.created_at
                                              ? timestamp2string(w.created_at)
                                              : round?.drawn_at
                                                ? timestamp2string(round.drawn_at)
                                                : '--'}
                                          </div>
                                        </div>
                                        <Tag
                                          color={index === 0 ? 'amber' : 'green'}
                                          type='light'
                                          shape='circle'
                                        >
                                          {t('已开奖')}
                                        </Tag>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className='rounded-2xl border border-dashed border-semi-color-border bg-semi-color-fill-0 px-4 py-6 text-sm text-semi-color-text-2'>
                                    {t('暂无中奖名单')}
                                  </div>
                                )}
                                <div className='activity-lottery-history-footer'>
                                  <div className='text-xs text-semi-color-text-2'>
                                    {t('全部报名用户')} · {Number(roundEntries.length || 0)}
                                  </div>
                                  <Button
                                    theme='outline'
                                    size='small'
                                    loading={
                                      roundEntryLoading &&
                                      Number(entryDrawerRound?.id || 0) ===
                                        Number(round?.id || 0)
                                    }
                                    onClick={() => openEntryDrawer(round)}
                                  >
                                    {t('查看全部')}
                                  </Button>
                                </div>
                              </div>
                            </Collapse.Panel>
                          );
                        })}
                      </Collapse>
                    </div>
                    {filteredHistoryRounds.length > HISTORY_PAGE_SIZE ? (
                      <div className='activity-lottery-history-pagination'>
                        <div className='activity-lottery-history-toolbar__meta'>
                          {t('第 {{page}} / {{total}} 页', {
                            page: historyPage,
                            total: historyPageCount,
                          })}
                        </div>
                        <Pagination
                          currentPage={historyPage}
                          pageSize={HISTORY_PAGE_SIZE}
                          total={filteredHistoryRounds.length}
                          onPageChange={setHistoryPage}
                          showSizeChanger={false}
                          size='small'
                        />
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className='mt-3 text-sm text-semi-color-text-2'>
                    {t('暂无历史期')}
                  </div>
                )}
              </Spin>
            </div>
          </div>
        )}
      </CardPro>
    </div>
  );
}
