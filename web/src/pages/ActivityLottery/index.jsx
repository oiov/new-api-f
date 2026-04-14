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

const { Text } = Typography;

const normalizeJoinSources = (raw) => {
  return String(raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const JOIN_SOURCE_LABELS = {
  manual: '用户点击参与',
  checkin: '签到成功自动参与',
  topup: '充值达标自动参与',
  consume: '消耗达标自动参与',
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
        showSuccess(t('参与成功'));
        loadSummary();
      } else {
        showError(res?.data?.message || t('参与失败'));
      }
    } catch (error) {
      showError(error?.response?.data?.message || t('参与失败'));
    } finally {
      setJoinLoading(false);
    }
  };

  useEffect(() => {
    if (!status?.activity_lottery_enabled) return;
    loadSummary();
    loadPublicRounds();
  }, [status?.activity_lottery_enabled, loadSummary, loadPublicRounds]);

  const currentRound = summary?.round || null;
  const winners = Array.isArray(summary?.winners) ? summary.winners : [];
  const joinSources = useMemo(
    () => normalizeJoinSources(currentRound?.join_sources || 'manual'),
    [currentRound?.join_sources],
  );
  const manualEnabled = joinSources.includes('manual');
  const joinAllowed = !!summary?.join_allowed;
  const joined = !!summary?.joined;

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
                '抽奖规则：需同时满足“参与人数 ≥ 目标人数”与“活动到期”，系统将自动开奖并公示打码信息。',
              )}
            />
            <div className='flex flex-col gap-2 md:flex-row md:items-center md:justify-between'>
              <div className='flex items-center gap-2'>
                <Gift size={18} className='text-amber-600' />
                <div className='text-base font-semibold text-semi-color-text-0'>
                  {t('活动抽奖')}
                </div>
              </div>
              <Space wrap>
                <Button
                  theme='outline'
                  onClick={loadSummary}
                  loading={summaryLoading}
                >
                  {t('刷新')}
                </Button>
                {manualEnabled && joinAllowed && !joined ? (
                  <Button
                    type='primary'
                    onClick={joinCurrent}
                    loading={joinLoading}
                  >
                    {t('参与活动')}
                  </Button>
                ) : null}
                {joined ? (
                  <Tag color='blue' type='light' shape='circle'>
                    {t('你已参与本期')}
                  </Tag>
                ) : null}
                {summary?.is_winner ? (
                  <Tag color='green' type='light' shape='circle'>
                    {t('已中奖')}
                  </Tag>
                ) : null}
              </Space>
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
                  {currentRound?.title || t('暂无进行中的期数')}
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
                    {t('人数')}: {Number(summary?.participant_count || 0)} /{' '}
                    {Number(summary?.need_participants || 0)}
                  </Tag>
                  <Tag
                    color={summary?.time_reached ? 'green' : 'grey'}
                    type='light'
                    shape='circle'
                  >
                    {summary?.time_reached ? t('时间已到') : t('等待到期')}
                  </Tag>
                  <Tag
                    color={summary?.auto_draw_ready ? 'green' : 'amber'}
                    type='light'
                    shape='circle'
                  >
                    {summary?.auto_draw_ready ? t('可自动开奖') : t('未满足')}
                  </Tag>
                </div>

                {currentRound?.prize ? (
                  <div className='mt-4 rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4'>
                    <div className='text-xs font-medium text-amber-800'>
                      {t('本期奖品')}
                    </div>
                    <div className='mt-2 whitespace-pre-wrap text-sm text-semi-color-text-0'>
                      {currentRound.prize}
                    </div>
                  </div>
                ) : null}

                <div className='mt-4 rounded-2xl border border-semi-color-border bg-semi-color-fill-0 p-4'>
                  <div className='text-xs font-medium text-semi-color-text-1'>
                    {t('参与条件')}
                  </div>
                  <div className='mt-2 flex flex-wrap gap-2'>
                    {joinSources.map((source) => (
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
                  <div className='mt-4 rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4'>
                    <div className='text-xs font-medium text-amber-800'>
                      {t('中奖发放内容')}
                    </div>
                    <div className='mt-2 whitespace-pre-wrap text-sm text-semi-color-text-0'>
                      {summary.prize}
                    </div>
                  </div>
                ) : (
                  <Text type='tertiary' size='small' className='mt-3 block'>
                    {t('中奖发放内容仅中奖者可见')}
                  </Text>
                )}

                <div className='mt-4'>
                  <div className='text-xs text-semi-color-text-2'>
                    {t('中奖公示')}
                  </div>
                  {winners.length > 0 ? (
                    <div className='mt-2 flex flex-col gap-2'>
                      {winners.map((item) => (
                        <div
                          key={`${item?.id || ''}-${item?.user_id || ''}`}
                          className='flex items-center justify-between rounded-xl border border-semi-color-border bg-semi-color-fill-0 px-3 py-2'
                        >
                          <div className='min-w-0'>
                            <div className='truncate text-sm font-medium text-semi-color-text-0'>
                              {item?.masked_name || '-'}
                            </div>
                            {item?.masked_email ? (
                              <div className='truncate text-[11px] text-semi-color-text-2'>
                                {item.masked_email}
                              </div>
                            ) : null}
                          </div>
                          <Tag color='green' type='light' shape='circle'>
                            {t('已开奖')}
                          </Tag>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className='mt-2 text-sm text-semi-color-text-2'>
                      {t('尚未开奖或暂无中奖名单')}
                    </div>
                  )}
                </div>
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
                {Array.isArray(rounds) && rounds.length > 0 ? (
                  <Collapse accordion className='mt-3'>
                    {rounds.map((item) => {
                      const round = item?.round;
                      const list = Array.isArray(item?.winners)
                        ? item.winners
                        : [];
                      return (
                        <Collapse.Panel
                          key={round?.id || Math.random()}
                          itemKey={String(round?.id || '')}
                          header={
                            <div className='flex items-center justify-between gap-3 w-full'>
                              <div className='font-medium'>
                                {round?.title || `#${round?.id || '-'}`}
                              </div>
                              <div className='text-xs text-semi-color-text-2'>
                                {round?.end_at
                                  ? timestamp2string(round.end_at)
                                  : '--'}
                              </div>
                            </div>
                          }
                        >
                          {list.length > 0 ? (
                            <div className='space-y-3'>
                              {round?.prize ? (
                                <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-3 text-sm text-semi-color-text-0'>
                                  <span className='font-medium'>
                                    {t('公示奖品')}：
                                  </span>
                                  <span className='whitespace-pre-wrap'>
                                    {round.prize}
                                  </span>
                                </div>
                              ) : null}
                              <div className='flex flex-wrap gap-2'>
                                {list.map((w) => (
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
        )}
      </CardPro>
    </div>
  );
}
