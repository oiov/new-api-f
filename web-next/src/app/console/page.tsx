'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  TrendingUp,
  Key,
  Wallet,
  Activity,
  BarChart3,
  RefreshCw,
  ArrowRight,
  Zap,
  Shield,
  Clock,
  ChevronRight,
  Users,
  FileText,
  MessageSquare,
  Settings,
  Package,
  Gift,
  ExternalLink,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AuthGuard } from '@/components/common/auth-guard';
import { useUser, persistUser } from '@/context/user-context';
import { useSystemStatus } from '@/context/status-context';
import { API } from '@/lib/api';
import { cn, getCurrencySymbol, formatTokensCompact } from '@/lib/utils';
import { toast } from 'sonner';
import type { User } from '@/types';

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

// ─── Stat card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: string | number;
  subValue?: string;
  icon: React.ElementType;
  description?: string;
  iconColor?: string;
  iconBg?: string;
  trend?: { value: number; label: string };
}

function StatCard({
  title,
  value,
  subValue,
  icon: Icon,
  description,
  iconColor = 'text-primary',
  iconBg = 'bg-primary/10',
  trend,
}: StatCardProps) {
  return (
    <motion.div variants={itemVariants} className="stat-card group cursor-default">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">
            {title}
          </p>
          <p className="text-2xl font-bold mt-1.5 tracking-tight text-foreground truncate">
            {value}
          </p>
          {subValue && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate font-mono">{subValue}</p>
          )}
          {description && (
            <p className="text-xs text-muted-foreground mt-1 truncate">{description}</p>
          )}
          {trend && (
            <div className="flex items-center gap-1 mt-2">
              <TrendingUp className="size-3 text-emerald-500" />
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                {trend.value > 0 ? '+' : ''}
                {trend.value}% {trend.label}
              </span>
            </div>
          )}
        </div>
        <div
          className={cn(
            'size-10 rounded-xl flex items-center justify-center shrink-0 ml-3',
            'transition-transform duration-200 group-hover:scale-110',
            iconBg,
          )}
        >
          <Icon className={cn('size-5', iconColor)} />
        </div>
      </div>
    </motion.div>
  );
}

// ─── Quick action card ────────────────────────────────────────────────────────

interface QuickAction {
  label: string;
  description: string;
  href: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  badge?: string;
  external?: boolean;
}

function QuickActionCard({ action }: { action: QuickAction }) {
  const inner = (
    <div className="group flex items-center gap-3 p-3.5 rounded-xl border border-border/60 bg-card hover:border-primary/30 hover:bg-accent/30 transition-all duration-200 cursor-pointer h-full">
      <div
        className={cn(
          'size-9 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105',
          action.iconBg,
        )}
      >
        <action.icon className={cn('size-4', action.iconColor)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-foreground truncate">{action.label}</p>
          {action.badge && (
            <Badge variant="secondary" className="text-[10px] py-0 h-4">
              {action.badge}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{action.description}</p>
      </div>
      {action.external ? (
        <ExternalLink className="size-3.5 text-muted-foreground/50 shrink-0 group-hover:text-primary transition-all" />
      ) : (
        <ChevronRight className="size-4 text-muted-foreground/50 shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
      )}
    </div>
  );

  if (action.external) {
    return (
      <motion.div variants={itemVariants}>
        <a href={action.href} target="_blank" rel="noopener noreferrer">
          {inner}
        </a>
      </motion.div>
    );
  }

  return (
    <motion.div variants={itemVariants}>
      <Link href={action.href}>{inner}</Link>
    </motion.div>
  );
}

// ─── Chat link section ────────────────────────────────────────────────────────

interface ChatLinkItem {
  name?: string;
  url?: string;
}

function parseChatLinks(raw?: string): ChatLinkItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    // 兼容单对象格式
    if (typeof parsed === 'object') return [parsed];
  } catch {
    // 兼容纯 URL 字符串
    if (raw.startsWith('http')) return [{ name: '聊天', url: raw }];
  }
  return [];
}

function ChatLinksSection({ chatLinks }: { chatLinks: ChatLinkItem[] }) {
  const { t } = useTranslation();
  if (chatLinks.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <MessageSquare className="size-3.5" />
          {t('在线对话')}
        </h2>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {chatLinks.map((link, i) => (
          <motion.div key={i} variants={itemVariants}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 p-3.5 rounded-xl border border-border/60 bg-card hover:border-violet-400/40 hover:bg-violet-50/30 dark:hover:bg-violet-900/10 transition-all duration-200 cursor-pointer"
            >
              <div className="size-9 rounded-lg bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105">
                <MessageSquare className="size-4 text-violet-600 dark:text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {link.name || t('AI 对话')}
                </p>
                <p className="text-xs text-muted-foreground truncate">{t('点击打开对话界面')}</p>
              </div>
              <ExternalLink className="size-3.5 text-muted-foreground/50 shrink-0 group-hover:text-violet-500 transition-colors" />
            </a>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Format helpers ───────────────────────────────────────────────────────────

/** 简洁数字：1234567 → 1.23M，999 → 999 */
function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

/** 货币格式：保留 4 位小数，去掉尾部 0，符号动态取自 status */
function formatCurrencyCompact(quota: number, status?: ReturnType<typeof useSystemStatus>): string {
  const quotaPerUnit = status?.quota_per_unit ?? 500000;
  const usdVal = quota / quotaPerUnit;
  let val = usdVal;
  switch (status?.quota_display_type) {
    case 'CNY': val = usdVal * (status.usd_exchange_rate ?? 1); break;
    case 'CUSTOM': val = usdVal * (status.custom_currency_exchange_rate ?? 1); break;
  }
  const symbol = getCurrencySymbol(status);
  if (val === 0) return `${symbol}0`;
  if (val < 0.0001) return `< ${symbol}0.0001`;
  const s = val.toFixed(4).replace(/\.?0+$/, '');
  return `${symbol}${s}`;
}

function formatQuotaCompact(quota: number, status?: ReturnType<typeof useSystemStatus>): string {
  const type = status?.quota_display_type;
  if (type === 'TOKENS' || (!type && !status?.display_in_currency)) return formatCompact(quota);
  return formatCurrencyCompact(quota, status);
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function DashboardContent() {
  const { t, i18n } = useTranslation();
  const { state: userState, dispatch } = useUser();
  const status = useSystemStatus();
  const [loading, setLoading] = useState(false);

  const user = userState.user;
  const remainQuota = user?.quota ?? 0;
  const usedQuota = user?.used_quota ?? 0;
  const requestCount = user?.request_count ?? 0;

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/user/self');
      const data = res.data as { success: boolean; data: User };
      if (data.success) {
        persistUser(data.data);
        dispatch({ type: 'login', payload: data.data });
      }
    } catch {
      toast.error(t('刷新失败'));
    } finally {
      setLoading(false);
    }
  }, [dispatch, t]);

  useEffect(() => {
    loadStats();
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const totalQuota = remainQuota + usedQuota;
  const usagePercent = totalQuota > 0 ? Math.round((usedQuota / totalQuota) * 100) : 0;

  // Parse chat links from system status
  const chatLinks = useMemo(() => parseChatLinks(status?.chat_links), [status?.chat_links]);

  const quickActions: QuickAction[] = useMemo(() => {
    const base: QuickAction[] = [
      {
        label: t('令牌管理'),
        description: t('创建和管理 API 令牌'),
        href: '/console/token',
        icon: Key,
        iconColor: 'text-amber-600 dark:text-amber-400',
        iconBg: 'bg-amber-50 dark:bg-amber-900/20',
      },
      {
        label: t('使用日志'),
        description: t('查看 API 调用记录'),
        href: '/console/log',
        icon: FileText,
        iconColor: 'text-blue-600 dark:text-blue-400',
        iconBg: 'bg-blue-50 dark:bg-blue-900/20',
      },
      {
        label: t('充值额度'),
        description: t('购买或兑换使用额度'),
        href: '/console/topup',
        icon: Wallet,
        iconColor: 'text-emerald-600 dark:text-emerald-400',
        iconBg: 'bg-emerald-50 dark:bg-emerald-900/20',
      },
      {
        label: t('邀请好友'),
        description: t('邀请好友注册获得奖励'),
        href: '/console/invite',
        icon: Users,
        iconColor: 'text-pink-600 dark:text-pink-400',
        iconBg: 'bg-pink-50 dark:bg-pink-900/20',
      },
      {
        label: t('模型定价'),
        description: t('查看各模型的调用价格'),
        href: '/pricing',
        icon: BarChart3,
        iconColor: 'text-cyan-600 dark:text-cyan-400',
        iconBg: 'bg-cyan-50 dark:bg-cyan-900/20',
      },
      {
        label: t('个人设置'),
        description: t('修改密码、绑定账号'),
        href: '/console/personal',
        icon: Settings,
        iconColor: 'text-slate-600 dark:text-slate-400',
        iconBg: 'bg-slate-100 dark:bg-slate-800',
      },
    ];

    // 仅当订阅开启时插入套餐
    if (status?.subscription_enabled) {
      base.splice(2, 0, {
        label: t('我的套餐'),
        description: t('查看订阅状态和用量'),
        href: '/console/package',
        icon: Package,
        iconColor: 'text-violet-600 dark:text-violet-400',
        iconBg: 'bg-violet-50 dark:bg-violet-900/20',
      });
    }

    // 兑换码入口（仅付费功能开启时）
    if (status?.payment_enabled) {
      base.push({
        label: t('兑换码'),
        description: t('使用礼品兑换码充值'),
        href: '/console/topup',
        icon: Gift,
        iconColor: 'text-rose-600 dark:text-rose-400',
        iconBg: 'bg-rose-50 dark:bg-rose-900/20',
      });
    }

    return base;
  }, [t, status?.subscription_enabled, status?.payment_enabled]);

  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 6 ? '深夜好' : hour < 12 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';

  return (
    <div className="space-y-6 pb-8">

      {/* 欢迎区 */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-start justify-between"
      >
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <span>{t(greeting)}，</span>
            <span className="text-primary">{user?.display_name || user?.username || t('用户')}</span>
            <span>👋</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('今天是')}{' '}
            {now.toLocaleDateString(i18n.language, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'long',
            })}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadStats}
          disabled={loading}
          className="h-8 gap-1.5 text-xs"
        >
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          {t('刷新数据')}
        </Button>
      </motion.div>

      {/* 统计卡片 */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <StatCard
          title={t('剩余额度')}
          value={formatQuotaCompact(remainQuota, status)}
          subValue={status?.quota_display_type !== 'TOKENS' ? `${formatTokensCompact(remainQuota)} tokens` : undefined}
          icon={Wallet}
          description={t('当前可用余额')}
          iconColor="text-blue-600 dark:text-blue-400"
          iconBg="bg-blue-50 dark:bg-blue-900/20"
        />
        <StatCard
          title={t('累计消耗')}
          value={formatQuotaCompact(usedQuota, status)}
          subValue={status?.quota_display_type !== 'TOKENS' ? `${formatTokensCompact(usedQuota)} tokens` : undefined}
          icon={TrendingUp}
          description={t('历史使用总量')}
          iconColor="text-emerald-600 dark:text-emerald-400"
          iconBg="bg-emerald-50 dark:bg-emerald-900/20"
        />
        <StatCard
          title={t('请求次数')}
          value={formatCompact(requestCount)}
          icon={Activity}
          description={t('累计 API 调用次数')}
          iconColor="text-violet-600 dark:text-violet-400"
          iconBg="bg-violet-50 dark:bg-violet-900/20"
        />
        <StatCard
          title={t('用户分组')}
          value={user?.group || t('默认')}
          icon={Shield}
          description={t('当前账户权限等级')}
          iconColor="text-amber-600 dark:text-amber-400"
          iconBg="bg-amber-50 dark:bg-amber-900/20"
        />
      </motion.div>

      {/* 使用情况进度 */}
      {totalQuota > 0 && (
        <motion.div variants={itemVariants} initial="hidden" animate="show">
          <Card className="shadow-card border-border/60">
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <Zap className="size-4 text-primary" />
                  <span className="text-sm font-semibold">{t('额度使用情况')}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{t('已用')} {formatQuotaCompact(usedQuota, status)}</span>
                  <span className="text-border">|</span>
                  <span>{t('总计')} {formatQuotaCompact(totalQuota, status)}</span>
                  <span className="font-bold text-primary">{usagePercent}%</span>
                </div>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${usagePercent}%` }}
                  transition={{ duration: 0.8, delay: 0.3, ease: 'easeOut' }}
                  className={cn(
                    'h-full rounded-full',
                    usagePercent > 80
                      ? 'bg-destructive'
                      : usagePercent > 60
                      ? 'bg-warning'
                      : 'bg-primary',
                  )}
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* 聊天链接（有配置时展示） */}
      {chatLinks.length > 0 && (
        <motion.div variants={containerVariants} initial="hidden" animate="show">
          <ChatLinksSection chatLinks={chatLinks} />
        </motion.div>
      )}

      {/* 快速操作 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {t('快速操作')}
          </h2>
        </div>
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {quickActions.map((action) => (
            <QuickActionCard key={action.href + action.label} action={action} />
          ))}
        </motion.div>
      </div>

      {/* 底部信息栏 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="flex items-center justify-between px-1"
      >
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3" />
          <span>
            {t('数据更新于')}{' '}
            {now.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <Link href="/console/log">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs gap-1 text-muted-foreground hover:text-primary"
          >
            {t('查看完整日志')}
            <ArrowRight className="size-3" />
          </Button>
        </Link>
      </motion.div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}
