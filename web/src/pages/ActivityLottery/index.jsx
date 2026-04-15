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
  Space,
  Spin,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { Gift } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CardPro from '../../components/common/ui/CardPro';
import { StatusContext } from '../../context/Status';
import { API, showError, showSuccess, timestamp2string } from '../../helpers';

const { Paragraph, Text } = Typography;

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

export default function ActivityLotteryPage() {
  const { t } = useTranslation();
  const [statusState] = useContext(StatusContext);
  const status = statusState?.status || {};

  const [summaryLoading, setSummaryLoading] = useState(false);
  const [roundsLoading, setRoundsLoading] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [rounds, setRounds] = useState([]);
  const [joinPressed, setJoinPressed] = useState(false);
  const [rewardHighlight, setRewardHighlight] = useState(false);
  const [entriesByRound, setEntriesByRound] = useState({});
  const [entryLoadingByRound, setEntryLoadingByRound] = useState({});

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
        params: { limit: 10 },
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
  useEffect(() => {
    if (!status?.activity_lottery_enabled || historyRounds.length === 0) return;
    historyRounds.forEach((item) => {
      const roundId = Number(item?.round?.id || 0);
      if (!roundId || entriesByRound[roundId]) return;
      loadRoundEntries(roundId);
    });
  }, [
    entriesByRound,
    historyRounds,
    loadRoundEntries,
    status?.activity_lottery_enabled,
  ]);
  const currentEntries = Array.isArray(entriesByRound[currentRound?.id])
    ? entriesByRound[currentRound?.id]
    : [];
  const currentEntryLoading = !!entryLoadingByRound[currentRound?.id];

  return (
    <div className='px-2'>
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
            <div className='flex flex-col gap-2 md:flex-row md:items-center md:justify-between'>
              <div className='flex items-center gap-2'>
                <Gift size={18} className='text-amber-600' />
                <div className='text-base font-semibold text-semi-color-text-0'>
                  {t('活动抽奖')}
                </div>
              </div>
              <div className='flex flex-col items-start gap-1 md:items-end'>
                <Space wrap>
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
                      {t('报名参与')} · {t('未开始')}
                    </Button>
                  ) : null}
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
                      {t('已中奖')}
                    </Tag>
                  ) : null}
                </Space>
                {signupNotStarted && currentRound?.start_at ? (
                  <Text type='tertiary' size='small'>
                    {t('开始时间')}: {timestamp2string(currentRound.start_at)}
                  </Text>
                ) : null}
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
              <div className='rounded-[24px] border border-semi-color-border bg-semi-color-bg-0 p-4 md:p-5'>
                <div className='text-xs text-semi-color-text-2'>
                  {t('当前公示')}
                </div>
                <div className='mt-1 text-base font-semibold text-semi-color-text-0'>
                  <Text
                    ellipsis={{ showTooltip: true }}
                    style={{ maxWidth: '100%', display: 'block' }}
                  >
                    {currentRound?.title || t('暂无进行中的期数')}
                  </Text>
                </div>
                {currentRound?.start_at || currentRound?.end_at ? (
                  <div className='mt-2 text-xs text-semi-color-text-2'>
                    {t('活动时间')}:{' '}
                    {currentRound?.start_at
                      ? timestamp2string(currentRound.start_at)
                      : '--'}{' '}
                    ~{' '}
                    {currentRound?.end_at
                      ? timestamp2string(currentRound.end_at)
                      : '--'}
                  </div>
                ) : null}
                <div className='mt-3 flex flex-wrap gap-2'>
                  <Tag
                    color={summary?.count_reached ? 'green' : 'grey'}
                    type='light'
                    shape='circle'
                  >
                    {t('有效参与')}: {Number(summary?.participant_count || 0)} /{' '}
                    {Number(summary?.need_participants || 0)}
                  </Tag>
                  <Tag color='blue' type='light' shape='circle'>
                    {t('已报名')}: {Number(summary?.signup_count || 0)}
                  </Tag>
                  <Tag
                    color={summary?.time_reached ? 'green' : 'grey'}
                    type='light'
                    shape='circle'
                  >
                    {summary?.time_reached ? t('时间已到') : t('等待开奖')}
                  </Tag>
                  <Tag
                    color={summary?.auto_draw_ready ? 'green' : 'amber'}
                    type='light'
                    shape='circle'
                  >
                    {drawStatusText}
                  </Tag>
                </div>

                {currentRound?.prize ? (
                  <div className='mt-4 rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4'>
                    <div className='text-xs font-medium text-amber-800'>
                      {t('本期奖品')}
                    </div>
                    <Paragraph
                      className='mt-2 text-sm text-semi-color-text-0 lottery-multiline-text'
                      ellipsis={{ rows: 3, expandable: true, showTooltip: true }}
                    >
                      {currentRound.prize}
                    </Paragraph>
                  </div>
                ) : null}

                <div className='mt-4 rounded-2xl border border-semi-color-border bg-semi-color-fill-0 p-4'>
                  <div className='text-xs font-medium text-semi-color-text-1'>
                    {t('参与条件')}
                  </div>
                  <div className='mt-2 flex flex-wrap gap-2'>
                    <Tag color='blue' type='light' shape='circle'>
                      {t('本页手动报名')}
                    </Tag>
                    {joinSources
                      .filter((source) => source === 'checkin')
                      .map((source) => (
                      <Tag
                        key={source}
                        color='blue'
                        type='light'
                        shape='circle'
                      >
                        {t(JOIN_SOURCE_LABELS[source] || source)}
                      </Tag>
                      ))}
                    {joinSources.includes('topup') ? (
                      <Tag color='orange' type='light' shape='circle'>
                        {t('报名后')}{' '}
                        {t(
                          currentRound?.join_topup_scope === 'total'
                            ? '累计充值'
                            : '今日充值',
                        )}{' '}
                        ·{' '}
                        {t(
                          currentRound?.join_topup_unit === 'token'
                            ? 'Token'
                            : '人民币',
                        )}{' '}
                        ≥ {Number(currentRound?.join_topup_min_money || 0)}
                      </Tag>
                    ) : null}
                    {joinSources.includes('consume') ? (
                      <Tag color='orange' type='light' shape='circle'>
                        {t('报名后')}{' '}
                        {t(
                          currentRound?.join_daily_consume_scope === 'total'
                            ? '累计消耗'
                            : '今日消耗',
                        )}{' '}
                        ·{' '}
                        {t(
                          currentRound?.join_daily_consume_threshold_unit ===
                            'token'
                            ? 'Token'
                            : '人民币',
                        )}{' '}
                        ≥{' '}
                        {Number(
                          currentRound?.join_daily_consume_min_money || 0,
                        )}
                      </Tag>
                    ) : null}
                  </div>
                </div>

                {summary?.prize ? (
                  <div
                    className={`mt-4 rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4 lottery-reward-panel ${
                      rewardHighlight ? 'lottery-reward-panel--active' : ''
                    }`}
                  >
                    <div className='text-xs font-medium text-amber-800'>
                      {t('中奖发放内容')}
                    </div>
                    <Paragraph
                      className='mt-2 text-sm text-semi-color-text-0 lottery-multiline-text'
                      ellipsis={{ rows: 4, expandable: true, showTooltip: true }}
                    >
                      {summary.prize}
                    </Paragraph>
                  </div>
                ) : null}

                {winners.length > 0 ? (
                  <div className='mt-4'>
                    <div className='text-xs text-semi-color-text-2'>
                      {t('中奖公示')}
                    </div>
                    <div className='mt-2 overflow-hidden rounded-2xl border border-semi-color-border bg-semi-color-fill-0'>
                      <div className='lottery-public-table lottery-public-table--header'>
                        <div>{t('中奖者')}</div>
                        <div>{t('开奖时间')}</div>
                        <div>{t('状态')}</div>
                      </div>
                      {winners.map((item, index) => (
                        <div
                          key={`${item?.id || ''}-${index}`}
                          className='lottery-public-table lottery-winner-item'
                        >
                          <div className='min-w-0'>
                            <Text ellipsis={{ showTooltip: true }}>
                              {resolveDisplayName(item)}
                            </Text>
                          </div>
                          <div className='text-semi-color-text-1'>
                            {item?.created_at
                              ? timestamp2string(item.created_at)
                              : currentRound?.drawn_at
                                ? timestamp2string(currentRound.drawn_at)
                                : '-'}
                          </div>
                          <div>
                            <Tag color={index < 3 ? 'amber' : 'green'} type='light' shape='circle'>
                              {t('已开奖')}
                            </Tag>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {currentRound?.id ? (
                  <div className='mt-4'>
                    <div className='mb-2 flex items-center justify-between gap-2'>
                      <div className='text-xs text-semi-color-text-2'>
                        {t('全部报名用户')} · {Number(summary?.signup_count || currentEntries.length || 0)}
                      </div>
                      <Button
                        theme='borderless'
                        size='small'
                        loading={currentEntryLoading}
                        onClick={() => loadRoundEntries(currentRound.id)}
                      >
                        {t('刷新')}
                      </Button>
                    </div>
                    <Spin spinning={currentEntryLoading}>
                      {currentEntries.length > 0 ? (
                        <div className='overflow-hidden rounded-2xl border border-semi-color-border bg-semi-color-fill-0'>
                          <div className='lottery-public-table lottery-public-table--header'>
                            <div>{t('报名用户')}</div>
                            <div>{t('报名时间')}</div>
                            <div>{t('参与状态')}</div>
                          </div>
                          {currentEntries.map((item) => (
                            <div
                              key={`${item?.id || ''}-${item?.created_at || ''}`}
                              className='lottery-public-table'
                            >
                              <div className='min-w-0'>
                                <Text ellipsis={{ showTooltip: true }}>
                                  {resolveDisplayName(item)}
                                </Text>
                              </div>
                              <div className='text-semi-color-text-1'>
                                {item?.created_at
                                  ? timestamp2string(item.created_at)
                                  : '-'}
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
                      ) : (
                        <div className='rounded-2xl border border-dashed border-semi-color-border bg-semi-color-fill-0 px-4 py-6 text-sm text-semi-color-text-2'>
                          {t('暂无报名记录')}
                        </div>
                      )}
                    </Spin>
                  </div>
                ) : null}
              </div>
            </Spin>

            <div className='rounded-[24px] border border-semi-color-border bg-semi-color-bg-0 p-4 md:p-5'>
              <div className='flex items-center justify-between gap-2'>
                <div className='text-sm font-medium text-semi-color-text-0'>
                  {t('历史期公示')}
                </div>
                <Button
                  theme='outline'
                  size='small'
                  loading={roundsLoading}
                  onClick={loadPublicRounds}
                >
                  {t('刷新')}
                </Button>
              </div>
              <Spin spinning={roundsLoading}>
                {historyRounds.length > 0 ? (
                  <Collapse accordion className='mt-3'>
                    {historyRounds.map((item) => {
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
                            <div className='flex items-center justify-between gap-3 w-full'>
                              <div className='min-w-0 font-medium'>
                                <Text ellipsis={{ showTooltip: true }}>
                                  {round?.title || `#${round?.id || '-'}`}
                                </Text>
                              </div>
                              <div className='text-xs text-semi-color-text-2'>
                                {round?.end_at
                                  ? timestamp2string(round.end_at)
                                  : '--'}
                              </div>
                            </div>
                          }
                        >
                          <div className='space-y-3'>
                            {round?.prize ? (
                              <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3 text-sm text-semi-color-text-0'>
                                <div className='mb-2 font-medium'>
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
                              <div className='overflow-hidden rounded-2xl border border-semi-color-border bg-semi-color-fill-0'>
                                <div className='lottery-public-table lottery-public-table--header'>
                                  <div>{t('中奖者')}</div>
                                  <div>{t('开奖时间')}</div>
                                  <div>{t('状态')}</div>
                                </div>
                                {list.map((w, index) => (
                                  <div
                                    key={`${w?.id || ''}-${index}`}
                                    className='lottery-public-table lottery-winner-item'
                                  >
                                    <div className='min-w-0'>
                                      <Text ellipsis={{ showTooltip: true }}>
                                        {resolveDisplayName(w)}
                                      </Text>
                                    </div>
                                    <div className='text-semi-color-text-1'>
                                      {w?.created_at
                                        ? timestamp2string(w.created_at)
                                        : round?.drawn_at
                                          ? timestamp2string(round.drawn_at)
                                          : '--'}
                                    </div>
                                    <div>
                                      <Tag
                                        color={index < 3 ? 'amber' : 'green'}
                                        type='light'
                                        shape='circle'
                                      >
                                        {t('已开奖')}
                                      </Tag>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className='rounded-2xl border border-dashed border-semi-color-border bg-semi-color-fill-0 px-4 py-6 text-sm text-semi-color-text-2'>
                                {t('暂无中奖名单')}
                              </div>
                            )}
                            <div className='space-y-2'>
                              <div className='flex items-center justify-between gap-2'>
                                <div className='text-xs text-semi-color-text-2'>
                                  {t('全部报名用户')} · {Number(roundEntries.length || 0)}
                                </div>
                                <Button
                                  theme='borderless'
                                  size='small'
                                  loading={roundEntryLoading}
                                  onClick={() => loadRoundEntries(round?.id)}
                                >
                                  {t('刷新')}
                                </Button>
                              </div>
                              <Spin spinning={roundEntryLoading}>
                                {roundEntries.length > 0 ? (
                                  <div className='overflow-hidden rounded-2xl border border-semi-color-border bg-semi-color-fill-0'>
                                    <div className='lottery-public-table lottery-public-table--header'>
                                      <div>{t('报名用户')}</div>
                                      <div>{t('报名时间')}</div>
                                      <div>{t('参与状态')}</div>
                                    </div>
                                    {roundEntries.map((entry, index) => (
                                      <div
                                        key={`${entry?.id || ''}-${index}`}
                                        className='lottery-public-table'
                                      >
                                        <div className='min-w-0'>
                                          <Text ellipsis={{ showTooltip: true }}>
                                            {resolveDisplayName(entry)}
                                          </Text>
                                        </div>
                                        <div className='text-semi-color-text-1'>
                                          {entry?.created_at
                                            ? timestamp2string(entry.created_at)
                                            : '--'}
                                        </div>
                                        <div>
                                          <Tag
                                            color={entry?.qualified ? 'green' : 'orange'}
                                            type='light'
                                            shape='circle'
                                          >
                                            {resolveQualifiedStatus(entry, t)}
                                          </Tag>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className='rounded-2xl border border-dashed border-semi-color-border bg-semi-color-fill-0 px-4 py-6 text-sm text-semi-color-text-2'>
                                    {t('暂无报名记录')}
                                  </div>
                                )}
                              </Spin>
                            </div>
                          </div>
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
        )}
      </CardPro>
    </div>
  );
}
