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
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LabelList,
} from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AuthGuard } from '@/components/common/auth-guard';
import { useUser, persistUser } from '@/context/user-context';
import { useSystemStatus } from '@/context/status-context';
import { API } from '@/lib/api';
import { cn, getCurrencySymbol, formatTokensCompact } from '@/lib/utils';
import { toast } from 'sonner';
import type { User, UsageLog } from '@/types';

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
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
              <TrendingUp className="size-3 text-success" />
              <span className="text-xs text-success font-medium">
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
    if (typeof parsed === 'object') return [parsed];
  } catch {
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

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

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

// ─── Chart data helpers ───────────────────────────────────────────────────────

interface DailyPoint {
  date: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  tokens: number;
  quota: number;
  totalLatency: number;
  latencyCount: number;
  avgLatency: number;
}
interface ModelPoint { model: string; count: number; tokens: number; quota: number }

const CHART_PALETTE = [
  '#6366f1', '#8b5cf6', '#0ea5e9', '#10b981',
  '#f59e0b', '#f43f5e', '#ec4899', '#14b8a6',
];

function processLogData(logs: UsageLog[], days: number): { daily: DailyPoint[]; models: ModelPoint[] } {
  const now = new Date();
  const dailyMap: Record<string, DailyPoint> = {};
  const modelMap: Record<string, { count: number; tokens: number; quota: number }> = {};

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const k = d.toISOString().slice(5, 10);
    dailyMap[k] = { date: k, requests: 0, promptTokens: 0, completionTokens: 0, tokens: 0, quota: 0, totalLatency: 0, latencyCount: 0, avgLatency: 0 };
  }

  for (const log of logs) {
    const k = new Date(log.created_at * 1000).toISOString().slice(5, 10);
    if (dailyMap[k]) {
      dailyMap[k].requests++;
      const pt = log.prompt_tokens ?? 0;
      const ct = log.completion_tokens ?? 0;
      dailyMap[k].promptTokens += pt;
      dailyMap[k].completionTokens += ct;
      dailyMap[k].tokens += pt + ct;
      dailyMap[k].quota += log.quota ?? 0;
      if (log.use_time > 0) {
        dailyMap[k].totalLatency += log.use_time;
        dailyMap[k].latencyCount++;
      }
    }
    const m = log.model_name;
    if (m) {
      if (!modelMap[m]) modelMap[m] = { count: 0, tokens: 0, quota: 0 };
      modelMap[m].count++;
      modelMap[m].tokens += (log.prompt_tokens ?? 0) + (log.completion_tokens ?? 0);
      modelMap[m].quota += log.quota ?? 0;
    }
  }

  const daily = Object.values(dailyMap).map((d) => ({
    ...d,
    avgLatency: d.latencyCount > 0 ? Math.round(d.totalLatency / d.latencyCount) : 0,
  }));

  const models = Object.entries(modelMap)
    .map(([model, d]) => ({
      model: model.length > 20 ? model.slice(0, 18) + '…' : model,
      count: d.count,
      tokens: d.tokens,
      quota: d.quota,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return { daily, models };
}

// ─── Chart section ────────────────────────────────────────────────────────────

type MetricKey = 'requests' | 'tokens' | 'quota' | 'latency';

function ChartSection() {
  const { t } = useTranslation();
  const status = useSystemStatus();
  const [rangeDays, setRangeDays] = useState<7 | 14 | 30>(7);
  const [metric, setMetric] = useState<MetricKey>('requests');
  const [chartData, setChartData] = useState<{ daily: DailyPoint[]; models: ModelPoint[] } | null>(null);
  const [chartLoading, setChartLoading] = useState(true);

  const loadChartData = useCallback(async (days: number) => {
    setChartLoading(true);
    try {
      const startTs = Math.floor(Date.now() / 1000) - days * 86400;
      const res = await API.get(`/api/log/self?p=1&page_size=2000&type=2&start_timestamp=${startTs}`);
      const body = res.data as { success: boolean; data: { items: UsageLog[] } };
      if (body.success) {
        setChartData(processLogData(body.data?.items ?? [], days));
      }
    } catch {
      // silently ignore — charts are non-critical
    } finally {
      setChartLoading(false);
    }
  }, []);

  useEffect(() => { loadChartData(rangeDays); }, [rangeDays, loadChartData]);

  // ── KPI computations ──────────────────────────────────────────────────────
  const daily = chartData?.daily ?? [];
  const models = chartData?.models ?? [];
  const totalReqs = daily.reduce((s, d) => s + d.requests, 0);
  const totalToks = daily.reduce((s, d) => s + d.tokens, 0);
  const activeDaysWithLatency = daily.filter((d) => d.latencyCount > 0);
  const globalAvgLatency = activeDaysWithLatency.length > 0
    ? Math.round(activeDaysWithLatency.reduce((s, d) => s + d.avgLatency, 0) / activeDaysWithLatency.length)
    : 0;
  const tokPerReq = totalReqs > 0 ? Math.round(totalToks / totalReqs) : 0;
  const dailyAvgReqs = Math.round(totalReqs / rangeDays);
  const peakDay = daily.reduce(
    (best, d) => (d.requests > best.requests ? d : best),
    { date: '', requests: 0 } as { date: string; requests: number },
  );

  // ── Metric tab config ─────────────────────────────────────────────────────
  const metricTabs: { key: MetricKey; label: string; color: string }[] = [
    { key: 'requests', label: t('请求次数'), color: '#6366f1' },
    { key: 'tokens',   label: t('Token 明细'), color: '#8b5cf6' },
    { key: 'quota',    label: t('额度消耗'), color: '#10b981' },
    { key: 'latency',  label: t('平均延迟'), color: '#f59e0b' },
  ];
  const activeTab = metricTabs.find((m) => m.key === metric)!;

  const tooltipStyle = {
    background: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
    fontSize: '12px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
  } as const;
  const labelStyle = { color: 'hsl(var(--foreground))', fontWeight: 600 } as const;

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <BarChart3 className="size-3.5" />
          {t('使用分析')}
        </h2>
        <div className="flex items-center gap-0.5 bg-muted/60 rounded-lg p-0.5">
          {([7, 14, 30] as const).map((d) => (
            <button
              key={d}
              onClick={() => setRangeDays(d)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150 cursor-pointer',
                rangeDays === d
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t('近')} {d} {t('天')}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI mini cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {([
          {
            label: t('日均请求'),
            value: totalReqs > 0 ? dailyAvgReqs.toLocaleString() : '—',
            sub: totalReqs > 0 ? t('次/天') : '',
          },
          {
            label: t('总 Token'),
            value: totalToks > 0 ? formatCompact(totalToks) : '—',
            sub: totalToks > 0 ? 'tokens' : '',
          },
          {
            label: t('平均延迟'),
            value: globalAvgLatency > 0 ? globalAvgLatency.toLocaleString() : '—',
            sub: globalAvgLatency > 0 ? 'ms' : '',
          },
          {
            label: t('Token/次'),
            value: tokPerReq > 0 ? formatCompact(tokPerReq) : '—',
            sub: tokPerReq > 0 ? t('平均') : '',
          },
        ] as { label: string; value: string; sub: string }[]).map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-border/60 bg-card px-3.5 py-3"
          >
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
              {kpi.label}
            </p>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold tabular-nums">{kpi.value}</span>
              {kpi.sub && <span className="text-[10px] text-muted-foreground">{kpi.sub}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* ── Metric tabs ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg p-0.5 mb-4 w-fit overflow-x-auto">
        {metricTabs.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 cursor-pointer whitespace-nowrap',
              metric === m.key
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* ── Charts grid: area chart (2/3) + donut (1/3) ─────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3 mb-4">

        {/* Area chart */}
        <Card className="shadow-card lg:col-span-2 border-border/60">
          <CardContent className="pt-4 pb-3">
            {/* Summary inline stats */}
            {!chartLoading && (
              <div className="flex items-center gap-4 mb-3 flex-wrap">
                {metric === 'requests' && (
                  <>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium leading-none mb-0.5">{t('总请求')}</p>
                      <p className="text-lg font-bold tabular-nums">{totalReqs.toLocaleString()}</p>
                    </div>
                    {peakDay.requests > 0 && (
                      <>
                        <div className="h-6 w-px bg-border/50 hidden sm:block" />
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium leading-none mb-0.5">{t('峰值日')}</p>
                          <p className="text-lg font-bold tabular-nums">{peakDay.date}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium leading-none mb-0.5">{t('峰值次数')}</p>
                          <p className="text-lg font-bold tabular-nums">{peakDay.requests}</p>
                        </div>
                      </>
                    )}
                  </>
                )}
                {metric === 'tokens' && (
                  <>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium leading-none mb-0.5">{t('输入 Token')}</p>
                      <p className="text-lg font-bold tabular-nums">{formatCompact(daily.reduce((s, d) => s + d.promptTokens, 0))}</p>
                    </div>
                    <div className="h-6 w-px bg-border/50 hidden sm:block" />
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium leading-none mb-0.5">{t('输出 Token')}</p>
                      <p className="text-lg font-bold tabular-nums">{formatCompact(daily.reduce((s, d) => s + d.completionTokens, 0))}</p>
                    </div>
                  </>
                )}
                {metric === 'quota' && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium leading-none mb-0.5">{t('总消耗')}</p>
                    <p className="text-lg font-bold tabular-nums">{formatQuotaCompact(daily.reduce((s, d) => s + d.quota, 0), status)}</p>
                  </div>
                )}
                {metric === 'latency' && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium leading-none mb-0.5">{t('平均延迟')}</p>
                    <p className="text-lg font-bold tabular-nums">{globalAvgLatency > 0 ? `${globalAvgLatency} ms` : '—'}</p>
                  </div>
                )}
              </div>
            )}

            {chartLoading ? (
              <Skeleton className="h-[160px] w-full rounded-lg" />
            ) : metric === 'tokens' ? (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={daily} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                  <defs>
                    <linearGradient id="grad-prompt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="grad-comp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.12)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={32} tickFormatter={(v: number) => formatCompact(v)} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} formatter={(v: number, name: string) => [`${formatCompact(v)} tokens`, name]} />
                  <Area type="monotone" dataKey="promptTokens" name={t('输入')} stroke="#6366f1" strokeWidth={2} fill="url(#grad-prompt)" dot={false} stackId="tok" activeDot={{ r: 3, strokeWidth: 0, fill: '#6366f1' }} />
                  <Area type="monotone" dataKey="completionTokens" name={t('输出')} stroke="#8b5cf6" strokeWidth={2} fill="url(#grad-comp)" dot={false} stackId="tok" activeDot={{ r: 3, strokeWidth: 0, fill: '#8b5cf6' }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={daily} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                  <defs>
                    <linearGradient id="grad-single" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={activeTab.color} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={activeTab.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.12)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                    width={metric === 'quota' ? 40 : 28}
                    tickFormatter={(v: number) =>
                      metric === 'quota' ? formatQuotaCompact(v, status) :
                      metric === 'latency' ? `${v}` :
                      formatCompact(v)
                    }
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={labelStyle}
                    itemStyle={{ color: activeTab.color }}
                    formatter={(v: number, name: string) => {
                      if (metric === 'quota') return [formatQuotaCompact(v, status), name];
                      if (metric === 'latency') return [`${v} ms`, name];
                      return [`${v.toLocaleString()} ${t('次')}`, name];
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey={metric === 'latency' ? 'avgLatency' : metric}
                    stroke={activeTab.color}
                    strokeWidth={2}
                    fill="url(#grad-single)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0, fill: activeTab.color }}
                    name={activeTab.label}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Donut model distribution chart */}
        <Card className="shadow-card border-border/60">
          <CardContent className="pt-4">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-3">
              {t('模型调用分布')}
            </p>

            {chartLoading ? (
              <div className="space-y-3">
                <div className="flex justify-center">
                  <Skeleton className="rounded-full" style={{ width: 108, height: 108 }} />
                </div>
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-3 w-full" />
                ))}
              </div>
            ) : !models.length ? (
              <div className="flex flex-col items-center justify-center h-[160px] text-muted-foreground">
                <BarChart3 className="size-8 mb-2 opacity-20" />
                <p className="text-xs">{t('暂无调用数据')}</p>
                <p className="text-[10px] mt-1 opacity-60">{t('发起 API 调用后在此查看')}</p>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={110}>
                  <PieChart>
                    <Pie
                      data={models}
                      cx="50%"
                      cy="50%"
                      innerRadius={34}
                      outerRadius={52}
                      paddingAngle={2}
                      dataKey="count"
                      nameKey="model"
                      strokeWidth={0}
                    >
                      {models.map((_, i) => (
                        <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '11px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      }}
                      formatter={(v: number, _name, props) => [
                        `${v} ${t('次')}`,
                        (props as { payload?: ModelPoint }).payload?.model ?? '',
                      ]}
                      labelFormatter={() => ''}
                    />
                  </PieChart>
                </ResponsiveContainer>

                <div className="space-y-1.5 mt-1">
                  {models.slice(0, 5).map((m, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="size-2 rounded-full shrink-0"
                          style={{ background: CHART_PALETTE[i % CHART_PALETTE.length] }}
                        />
                        <span className="truncate text-muted-foreground">{m.model}</span>
                      </div>
                      <span className="font-semibold tabular-nums shrink-0 ml-2">{m.count}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Top models horizontal bar chart ──────────────────────────────────── */}
      {!chartLoading && models.length > 0 && (
        <Card className="shadow-card border-border/60">
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-4">
              {t('模型排行')}
            </p>
            <ResponsiveContainer width="100%" height={Math.min(models.length, 6) * 32 + 8}>
              <BarChart
                layout="vertical"
                data={models.slice(0, 6)}
                margin={{ top: 0, right: 52, bottom: 0, left: 0 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="model"
                  width={130}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '11px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  }}
                  formatter={(v: number) => [`${v} ${t('次')}`, t('调用次数')]}
                  labelFormatter={() => ''}
                  cursor={{ fill: 'rgba(128,128,128,0.06)' }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={18}>
                  {models.slice(0, 6).map((_, i) => (
                    <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                  ))}
                  <LabelList
                    dataKey="count"
                    position="right"
                    style={{ fontSize: 11, fontWeight: 600, fill: 'hsl(var(--foreground))' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
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

  const chatLinks = useMemo(() => parseChatLinks(status?.chat_links), [status?.chat_links]);

  const quickActions: QuickAction[] = useMemo(() => {
    const base: QuickAction[] = [
      {
        label: t('令牌管理'),
        description: t('创建和管理 API 令牌'),
        href: '/console/token',
        icon: Key,
        iconColor: 'text-warning',
        iconBg: 'bg-warning/10',
      },
      {
        label: t('使用日志'),
        description: t('查看 API 调用记录'),
        href: '/console/log',
        icon: FileText,
        iconColor: 'text-primary',
        iconBg: 'bg-primary/10',
      },
      {
        label: t('充值额度'),
        description: t('购买或兑换使用额度'),
        href: '/console/topup',
        icon: Wallet,
        iconColor: 'text-success',
        iconBg: 'bg-success/10',
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
        iconColor: 'text-muted-foreground',
        iconBg: 'bg-muted',
      },
    ];

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
          iconColor="text-primary"
          iconBg="bg-primary/10"
        />
        <StatCard
          title={t('累计消耗')}
          value={formatQuotaCompact(usedQuota, status)}
          subValue={status?.quota_display_type !== 'TOKENS' ? `${formatTokensCompact(usedQuota)} tokens` : undefined}
          icon={TrendingUp}
          description={t('历史使用总量')}
          iconColor="text-success"
          iconBg="bg-success/10"
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
          iconColor="text-warning"
          iconBg="bg-warning/10"
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

      {/* ── 使用分析图表 ─────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
      >
        <ChartSection />
      </motion.div>

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
