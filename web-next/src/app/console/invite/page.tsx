'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  Gift,
  Copy,
  Users,
  RefreshCw,
  ArrowRightLeft,
  Trophy,
  Medal,
  Crown,
  TrendingUp,
  Link2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AuthGuard } from '@/components/common/auth-guard';
import { useUser } from '@/context/user-context';
import { useSystemStatus } from '@/context/status-context';
import { API } from '@/lib/api';
import { copy, formatQuota, formatTokensCompact, cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AffInfo {
  aff_code: string;
  invite_count: number;
  aff_quota: number;
  aff_history_quota: number;
}

interface LeaderboardItem {
  display_name: string;
  aff_count: number;
  aff_history_quota: number;
}

interface InvitedUser {
  username: string;
  display_name?: string;
  created_at?: number;
}

interface RewardConfig {
  quota_reward_enabled?: boolean;
  quota_reward_percent?: number;
  register_reward_enabled?: boolean;
  register_reward_quota?: number;
}

interface AffDetails {
  aff_code?: string;
  invite_count?: number;
  aff_quota?: number;
  aff_history_quota?: number;
  config?: RewardConfig;
  leaderboard?: LeaderboardItem[];
  invited_users?: InvitedUser[];
}

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="size-4 text-yellow-500" />;
  if (rank === 2) return <Medal className="size-4 text-muted-foreground" />;
  if (rank === 3) return <Medal className="size-4 text-amber-700" />;
  return <span className="text-xs font-bold text-muted-foreground w-4 text-center">{rank}</span>;
}

function InviteContent() {
  const { t } = useTranslation();
  const { state: userState } = useUser();
  const status = useSystemStatus();
  const user = userState.user;

  const [affInfo, setAffInfo] = useState<AffInfo | null>(null);
  const [details, setDetails] = useState<AffDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [transferring, setTransferring] = useState(false);
  const [leaderboardExpanded, setLeaderboardExpanded] = useState(true);
  const [usersExpanded, setUsersExpanded] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [basicRes, detailRes] = await Promise.allSettled([
        API.get('/api/user/aff'),
        API.get('/api/user/aff/details'),
      ]);

      if (basicRes.status === 'fulfilled') {
        const d = basicRes.value.data as { success: boolean; data: AffInfo };
        if (d.success && d.data) setAffInfo(d.data);
      }

      if (detailRes.status === 'fulfilled') {
        const d = detailRes.value.data as { success: boolean; data: AffDetails };
        if (d.success && d.data) setDetails(d.data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const affCode = affInfo?.aff_code || details?.aff_code || user?.aff_code || '';
  const inviteLink = affCode ? `${typeof window !== 'undefined' ? window.location.origin : ''}/register?aff=${affCode}` : '';
  const inviteCount = affInfo?.invite_count ?? details?.invite_count ?? 0;
  const pendingQuota = affInfo?.aff_quota ?? details?.aff_quota ?? 0;
  const historyQuota = affInfo?.aff_history_quota ?? details?.aff_history_quota ?? 0;
  const leaderboard = details?.leaderboard ?? [];
  const invitedUsers = details?.invited_users ?? [];
  const rewardConfig = details?.config;

  const handleCopy = async (text: string) => {
    const ok = await copy(text);
    if (ok) toast.success(t('已复制到剪切板'));
  };

  const handleTransfer = async () => {
    if (pendingQuota <= 0) { toast.error(t('没有可划转的余额')); return; }
    setTransferring(true);
    try {
      const res = await API.post('/api/user/aff/transfer', { quota: pendingQuota });
      const data = res.data as { success: boolean; message?: string };
      if (data.success) {
        toast.success(data.message || t('划转成功'));
        await loadAll();
      } else {
        toast.error(data.message || t('划转失败'));
      }
    } catch {
      toast.error(t('划转失败'));
    } finally {
      setTransferring(false);
    }
  };

  return (
    <div className="space-y-6 pb-8">

      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
      >
        <div className="flex items-center gap-4">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Gift className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">{t('邀请拉新')}</h1>
            <p className="text-sm text-muted-foreground">{t('邀请好友注册，共同获得专属奖励')}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="size-8" onClick={loadAll} disabled={loading}>
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
        </Button>
      </motion.div>

      {/* Reward config notice */}
      {rewardConfig && (rewardConfig.quota_reward_enabled || rewardConfig.register_reward_enabled) && (
        <motion.div variants={itemVariants} initial="hidden" animate="show">
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 flex items-start gap-3">
            <Sparkles className="size-4 text-primary shrink-0 mt-0.5" />
            <div className="text-sm text-foreground space-y-0.5">
              {rewardConfig.register_reward_enabled && rewardConfig.register_reward_quota != null && (
                <p>
                  {t('好友注册奖励')}：<span className="font-semibold text-primary">
                    +{formatQuota(rewardConfig.register_reward_quota, status)}
                  </span>
                </p>
              )}
              {rewardConfig.quota_reward_enabled && rewardConfig.quota_reward_percent != null && (
                <p>
                  {t('好友消费返佣')}：<span className="font-semibold text-primary">
                    {rewardConfig.quota_reward_percent}%
                  </span>
                </p>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Hero: invite code + link */}
      <motion.div variants={itemVariants} initial="hidden" animate="show">
        <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/8 via-primary/4 to-transparent p-6">
          {/* decorative circles */}
          <div className="absolute -top-8 -right-8 size-40 rounded-full bg-primary/8 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-6 -left-6 size-28 rounded-full bg-primary/6 blur-xl pointer-events-none" />

          <div className="relative space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <Gift className="size-4" />
              <span className="text-sm font-semibold uppercase tracking-wide">{t('我的邀请码')}</span>
            </div>

            {/* Invite code */}
            <div className="flex gap-2">
              {loading ? (
                <Skeleton className="h-10 flex-1" />
              ) : (
                <Input
                  value={affCode}
                  readOnly
                  className="font-mono text-base font-bold h-10 bg-background/70 border-primary/30 tracking-widest"
                />
              )}
              <Button
                variant="outline"
                className="h-10 shrink-0 gap-2 border-primary/30 hover:border-primary/60"
                onClick={() => handleCopy(affCode)}
                disabled={!affCode || loading}
              >
                <Copy className="size-4" />
                {t('复制码')}
              </Button>
            </div>

            {/* Invite link */}
            <div className="flex gap-2">
              {loading ? (
                <Skeleton className="h-9 flex-1" />
              ) : (
                <Input
                  value={inviteLink}
                  readOnly
                  className="text-xs h-9 bg-background/70 border-primary/20 text-muted-foreground"
                />
              )}
              <Button
                variant="default"
                className="h-9 shrink-0 gap-2"
                onClick={() => handleCopy(inviteLink)}
                disabled={!inviteLink || loading}
              >
                <Link2 className="size-3.5" />
                {t('复制链接')}
              </Button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stats grid */}
      <motion.div variants={itemVariants} initial="hidden" animate="show">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Invited count */}
          <div className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('已邀请人数')}</p>
              <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="size-4 text-primary" />
              </div>
            </div>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-3xl font-bold text-foreground">{inviteCount}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">{t('位好友通过您的链接注册')}</p>
          </div>

          {/* Pending quota */}
          <div className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('待转余额')}</p>
              <div className="size-8 rounded-lg bg-warning/10 flex items-center justify-center">
                <TrendingUp className="size-4 text-warning" />
              </div>
            </div>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <p className="text-2xl font-bold text-foreground">{formatQuota(pendingQuota, status)}</p>
                {status?.quota_display_type !== 'TOKENS' && pendingQuota > 0 && (
                  <p className="text-xs text-muted-foreground font-mono">{formatTokensCompact(pendingQuota)} tokens</p>
                )}
              </>
            )}
            <div className="mt-2">
              <Button
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={handleTransfer}
                disabled={transferring || loading || pendingQuota <= 0}
              >
                <ArrowRightLeft className="size-3" />
                {transferring ? t('划转中...') : t('划转到余额')}
              </Button>
            </div>
          </div>

          {/* History quota */}
          <div className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('累计已转')}</p>
              <div className="size-8 rounded-lg bg-success/10 flex items-center justify-center">
                <UserCheck className="size-4 text-success" />
              </div>
            </div>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <p className="text-2xl font-bold text-foreground">{formatQuota(historyQuota, status)}</p>
                {status?.quota_display_type !== 'TOKENS' && historyQuota > 0 && (
                  <p className="text-xs text-muted-foreground font-mono">{formatTokensCompact(historyQuota)} tokens</p>
                )}
              </>
            )}
            <p className="text-xs text-muted-foreground mt-1">{t('历史累计奖励额度')}</p>
          </div>
        </div>
      </motion.div>

      {/* Leaderboard */}
      <motion.div variants={itemVariants} initial="hidden" animate="show">
        <button
          onClick={() => setLeaderboardExpanded((v) => !v)}
          className="flex items-center gap-2 mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors w-full"
        >
          <Trophy className="size-3.5 text-yellow-500" />
          {t('邀请排行榜')}
          {leaderboard.length > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs py-0 h-4">{leaderboard.length}</Badge>
          )}
          {leaderboardExpanded ? (
            <ChevronUp className="size-3.5 ml-auto" />
          ) : (
            <ChevronDown className="size-3.5 ml-auto" />
          )}
        </button>

        {leaderboardExpanded && (
          <Card className="shadow-card">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="size-6 rounded-full" />
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                  ))}
                </div>
              ) : leaderboard.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Trophy className="size-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">{t('排行榜暂无数据')}</p>
                  <p className="text-xs mt-1">{t('快来邀请好友，成为第一名吧')}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 text-center">{t('排名')}</TableHead>
                      <TableHead>{t('用户')}</TableHead>
                      <TableHead className="text-right">{t('邀请人数')}</TableHead>
                      <TableHead className="text-right">{t('累计奖励')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaderboard.map((item, idx) => (
                      <TableRow
                        key={idx}
                        className={cn(
                          'hover:bg-accent/60 dark:hover:bg-accent/40',
                          idx === 0 && 'bg-yellow-500/5',
                          idx === 1 && 'bg-slate-500/5',
                          idx === 2 && 'bg-amber-700/5',
                        )}
                      >
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center">
                            <RankIcon rank={idx + 1} />
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={cn(
                            'text-sm font-medium',
                            idx < 3 && 'font-semibold',
                          )}>
                            {item.display_name || t('用户')}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary" className="ml-auto">
                            {item.aff_count} {t('人')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="text-sm font-semibold text-primary">
                            {formatQuota(item.aff_history_quota, status)}
                          </div>
                          {status?.quota_display_type !== 'TOKENS' && item.aff_history_quota > 0 && (
                            <div className="text-[10px] text-muted-foreground font-mono">
                              {formatTokensCompact(item.aff_history_quota)}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </motion.div>

      {/* Invited users */}
      {(invitedUsers.length > 0 || loading) && (
        <motion.div variants={itemVariants} initial="hidden" animate="show">
          <button
            onClick={() => setUsersExpanded((v) => !v)}
            className="flex items-center gap-2 mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors w-full"
          >
            <Users className="size-3.5" />
            {t('已邀请用户')}
            {invitedUsers.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs py-0 h-4">{invitedUsers.length}</Badge>
            )}
            {usersExpanded ? (
              <ChevronUp className="size-3.5 ml-auto" />
            ) : (
              <ChevronDown className="size-3.5 ml-auto" />
            )}
          </button>

          {usersExpanded && (
            <Card className="shadow-card">
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-4 space-y-2">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('用户名')}</TableHead>
                        <TableHead>{t('昵称')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invitedUsers.map((u, i) => (
                        <TableRow key={i} className="hover:bg-accent/60 dark:hover:bg-accent/40">
                          <TableCell className="text-sm font-mono">{u.username}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{u.display_name || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}
    </div>
  );
}

export default function InvitePage() {
  return (
    <AuthGuard>
      <InviteContent />
    </AuthGuard>
  );
}
