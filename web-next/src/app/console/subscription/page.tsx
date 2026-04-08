'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  BarChart3, BookOpen, ChevronDown, ChevronRight, Clock,
  Crown, FileText, History, Package, RefreshCw, ShieldCheck, Sparkles, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { AuthGuard } from '@/components/common/auth-guard';
import { ConsumeLogsSheet } from '@/components/subscription/consume-logs-sheet';
import { API } from '@/lib/api';
import { renderQuota, getCurrencySymbol, formatTimestamp, cn } from '@/lib/utils';
import { useSystemStatus } from '@/context/status-context';
import { toast } from 'sonner';
import type { SystemStatus } from '@/types';

// ── Animation variants ───────────────────────────────────────────────────────

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
};

// ── Types ───────────────────────────────────────────────────────────────────

interface SubscriptionPlan {
  id: number;
  title?: string;
  subtitle?: string;
  price_amount?: number;
  discount_price_amount?: number;
  discount_deadline?: number;
  has_active_discount?: boolean;
  effective_price_amount?: number;
  duration_unit?: string;
  duration_value?: number;
  custom_seconds?: number;
  reset_period?: string;
  quota_reset_period?: string;
  reset_custom_seconds?: number;
  quota_reset_custom_seconds?: number;
  resource_type?: string;
  amount_total?: number;
  total_amount?: number;
  amount_used?: number;
  request_count_total?: number;
  request_count_used?: number;
  upgrade_group?: string;
  max_purchase_per_user?: number;
  sale_limit_count?: number;
  sold_count?: number;
  remaining_sale_count?: number;
  sold_out?: boolean;
  enabled?: boolean;
  stripe_price_id?: string;
  creem_product_id?: string;
}

interface UserSubscription {
  id: number;
  plan_id?: number;
  status?: string;
  start_time?: number;
  end_time?: number;
  next_reset_time?: number;
  last_reset_time?: number;
  reset_period?: string;
  quota_reset_period?: string;
  reset_custom_seconds?: number;
  resource_type?: string;
  amount_total?: number;
  total_amount?: number;
  amount_used?: number;
  request_count_total?: number;
  request_count_used?: number;
  source?: string;
  upgrade_group?: string;
}

interface SubWrapper { subscription: UserSubscription }
interface PlanWrapper { plan: SubscriptionPlan }

interface PayMethod { type: string; name?: string }

// ── Format utilities ─────────────────────────────────────────────────────────

function getResetPeriodValue(plan: SubscriptionPlan | UserSubscription) {
  return (plan as UserSubscription).reset_period
    || (plan as SubscriptionPlan).quota_reset_period
    || 'never';
}

function formatDuration(plan: SubscriptionPlan, t: (k: string) => string): string {
  const unit = plan.duration_unit || 'month';
  const value = plan.duration_value || 1;
  if (unit === 'custom') {
    const s = plan.custom_seconds || 0;
    if (s >= 86400) return `${Math.floor(s / 86400)} ${t('天')}`;
    if (s >= 3600) return `${Math.floor(s / 3600)} ${t('小时')}`;
    return `${s} ${t('秒')}`;
  }
  const labels: Record<string, string> = {
    year: t('年'), month: t('个月'), week: t('周'), day: t('天'), hour: t('小时'),
  };
  return `${value} ${labels[unit] || unit}`;
}

function formatResetPeriod(plan: SubscriptionPlan | UserSubscription, t: (k: string) => string): string {
  const period = getResetPeriodValue(plan);
  if (period === 'never') return t('不重置');
  if (period === 'daily') return t('每天');
  if (period === 'weekly') return t('每周');
  if (period === 'monthly') return t('每月');
  if (period === 'yearly') return t('每年');
  if (period === 'custom') {
    const s = Number(
      (plan as UserSubscription).reset_period === 'custom'
        ? (plan as UserSubscription).reset_custom_seconds
        : (plan as SubscriptionPlan).quota_reset_custom_seconds ?? 0,
    );
    if (s >= 86400) return `${Math.floor(s / 86400)} ${t('天')}`;
    if (s >= 3600) return `${Math.floor(s / 3600)} ${t('小时')}`;
    return `${s} ${t('秒')}`;
  }
  return t('不重置');
}

function getResourceType(plan: SubscriptionPlan | UserSubscription): 'quota' | 'request_count' {
  return plan.resource_type === 'request_count' ? 'request_count' : 'quota';
}

function getUsageSummary(plan: SubscriptionPlan | UserSubscription) {
  if (getResourceType(plan) === 'request_count') {
    const total = Number(plan.request_count_total || 0);
    const used = Number(plan.request_count_used || 0);
    return { total, used, remain: total > 0 ? Math.max(0, total - used) : 0, unlimited: total <= 0 };
  }
  const total = Number(plan.amount_total ?? plan.total_amount ?? 0);
  const used = Number(plan.amount_used ?? 0);
  return { total, used, remain: total > 0 ? Math.max(0, total - used) : 0, unlimited: total <= 0 };
}

function isDiscountActive(plan: SubscriptionPlan, now = Date.now() / 1000): boolean {
  if (typeof plan.has_active_discount === 'boolean') return plan.has_active_discount;
  const orig = Number(plan.price_amount || 0);
  const disc = Number(plan.discount_price_amount || 0);
  const deadline = Number(plan.discount_deadline || 0);
  return disc > 0 && orig > 0 && disc < orig && deadline > now;
}

function getEffectivePrice(plan: SubscriptionPlan): number {
  if (plan.effective_price_amount !== undefined && plan.effective_price_amount !== null)
    return Number(plan.effective_price_amount);
  return isDiscountActive(plan) ? Number(plan.discount_price_amount || 0) : Number(plan.price_amount || 0);
}

function getSaleSummary(plan: SubscriptionPlan) {
  const saleLimit = Number(plan.sale_limit_count || 0);
  const sold = Number(plan.sold_count || 0);
  const remaining = saleLimit > 0
    ? Math.max(0, plan.remaining_sale_count !== undefined ? Number(plan.remaining_sale_count) : saleLimit - sold)
    : 0;
  const soldOut = typeof plan.sold_out === 'boolean'
    ? plan.sold_out
    : saleLimit > 0 && sold >= saleLimit;
  return { saleLimit, sold, remaining, soldOut, unlimited: saleLimit <= 0 };
}

function getResourceLabel(plan: SubscriptionPlan | UserSubscription, t: (k: string) => string): string {
  const isRC = getResourceType(plan) === 'request_count';
  const isPeriodic = getResetPeriodValue(plan) !== 'never';
  if (isRC) return isPeriodic ? t('每周期次数') : t('总次数');
  return isPeriodic ? t('每周期额度') : t('总额度');
}

function getBenefitText(plan: SubscriptionPlan, t: (k: string) => string): string {
  const summary = getUsageSummary(plan);
  const reset = formatResetPeriod(plan, t);
  if (summary.unlimited) return t('有效期内不限使用');
  const amount = getResourceType(plan) === 'request_count'
    ? `${summary.total} ${t('次')}`
    : renderQuota(summary.total);
  if (reset === t('不重置')) return `${t('有效期内共可用')} ${amount}`;
  return `${t('每个重置周期可用')} ${amount} · ${t('重置')} ${reset}`;
}

function displayQuota(summary: ReturnType<typeof getUsageSummary>, type: 'quota' | 'request_count', field: 'total' | 'used' | 'remain', t: (k: string) => string): string {
  if (summary.unlimited) return t('不限');
  const val = summary[field];
  return type === 'request_count' ? `${val} ${t('次')}` : renderQuota(val);
}

function getSubState(sub: UserSubscription): 'active' | 'cancelled' | 'expired' {
  const now = Date.now() / 1000;
  const isExpired = (sub.end_time || 0) < now;
  if (sub.status === 'active' && !isExpired) return 'active';
  if (sub.status === 'cancelled') return 'cancelled';
  return 'expired';
}

function formatNextReset(sub: UserSubscription, t: (k: string) => string): string {
  const next = Number(sub.next_reset_time || 0);
  if (next > 0) return formatTimestamp(next, 'YYYY-MM-DD HH:mm');
  const period = sub.reset_period || sub.quota_reset_period || 'never';
  if (period === 'never') return t('不重置');
  const now = Date.now() / 1000;
  const isActive = sub.status === 'active' && Number(sub.end_time || 0) > now;
  if (isActive && Number(sub.last_reset_time || 0) > 0) return t('到期前不再重置');
  return '--';
}

function getCurrencyRate(status?: SystemStatus): number {
  if (!status) return 1;
  if (status.quota_display_type === 'CNY') return status.usd_exchange_rate ?? 7;
  if (status.quota_display_type === 'CUSTOM') return status.custom_currency_exchange_rate ?? 1;
  return 1;
}

function formatPlanPrice(plan: SubscriptionPlan, status?: SystemStatus): string {
  const symbol = getCurrencySymbol(status);
  const rate = getCurrencyRate(status);
  const price = getEffectivePrice(plan) * rate;
  return `${symbol}${price.toFixed(Number.isInteger(price) ? 0 : 2)}`;
}

function formatOrigPrice(plan: SubscriptionPlan, status?: SystemStatus): string {
  const symbol = getCurrencySymbol(status);
  const rate = getCurrencyRate(status);
  const price = Number(plan.price_amount || 0) * rate;
  return `${symbol}${price.toFixed(Number.isInteger(price) ? 0 : 2)}`;
}

// ── Skeleton loader ──────────────────────────────────────────────────────────

function OverviewSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i} className="border-border/60 shadow-card">
          <CardContent className="p-4 space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-3 w-28" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Overview card ────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string; value: string; helper: string;
  icon: React.FC<{ className?: string }>; iconBg: string; iconColor: string;
}
function StatCard({ label, value, helper, icon: Icon, iconBg, iconColor }: StatCardProps) {
  return (
    <Card className="border border-border/60 bg-card shadow-card hover:shadow-card-hover transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-2 text-xl font-bold break-words text-foreground">{value}</p>
            <p className="mt-1.5 text-xs text-muted-foreground/80">{helper}</p>
          </div>
          <div className={`shrink-0 rounded-lg p-2 ${iconBg}`}>
            <Icon className={`size-4 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Guide section ────────────────────────────────────────────────────────────

function GuideSection({ t }: { t: (k: string) => string }) {
  const [open, setOpen] = useState<string | null>(null);
  const items = [
    {
      key: 'usage', title: t('使用说明'),
      content: [
        t('套餐购买成功后会立即生效，并进入"我的订阅"。生效中的套餐会直接参与后续请求结算。'),
        t('你可以在"我的订阅"中查看套餐详情、剩余额度/次数、下次重置时间，以及历史消耗记录。'),
        t('按次套餐统计的是成功请求次数；失败请求、鉴权失败、上游报错不会计入成功次数。'),
      ],
    },
    {
      key: 'billing', title: t('计费与扣费规则'),
      content: [
        t('如果你启用了订阅扣费，请求会优先尝试使用可用订阅；如果当前订阅不足，再按你的扣费偏好决定是否回退到钱包余额。'),
        t('按额度套餐会扣减额度余额；按次套餐会在请求成功后扣减成功次数。两种资源类型彼此独立，不会混算。'),
        t('带有重置周期的套餐，重置的是"当前周期可用权益"；重置周期从购买生效时间开始按 24 小时、7 天、1 个月、1 年等规则滚动计算；不重置的套餐会持续累计使用，直到到期或耗尽。'),
      ],
    },
    {
      key: 'multi', title: t('多个套餐如何生效'),
      content: [
        t('多个生效套餐可以同时存在。系统会按"最早到期优先"使用订阅权益，先消耗最早过期的套餐，再消耗后到期的套餐。'),
        t('按次套餐和按额度套餐不会互相覆盖。实际命中哪类套餐，取决于当前请求是否走订阅结算以及系统可用的订阅权益。'),
      ],
    },
  ];
  return (
    <div className="space-y-1">
      {items.map((item) => (
        <div key={item.key} className="border rounded-lg overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-accent/60 dark:hover:bg-accent/40 transition-colors"
            onClick={() => setOpen(open === item.key ? null : item.key)}
          >
            <span>{item.title}</span>
            <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open === item.key && 'rotate-180')} />
          </button>
          {open === item.key && (
            <div className="px-4 pb-4 space-y-2 border-t bg-muted/20">
              {item.content.map((line, i) => (
                <p key={i} className="text-sm text-muted-foreground leading-relaxed pt-1">{line}</p>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Subscription card ────────────────────────────────────────────────────────

interface SubCardProps {
  item: SubWrapper & {
    state: 'active' | 'cancelled' | 'expired';
    title: string;
    usageSummary: ReturnType<typeof getUsageSummary>;
    resourceType: 'quota' | 'request_count';
    usageLabel: string;
    remainingDays: number;
    planSubtitle?: string;
  };
  t: (k: string) => string;
  onViewLogs?: () => void;
}

function SubCard({ item, t, onViewLogs }: SubCardProps) {
  const [expanded, setExpanded] = useState(false);
  const sub = item.subscription;
  const { usageSummary, state, resourceType } = item;
  const usagePercent = usageSummary.unlimited ? 0
    : Math.min(100, Math.round((usageSummary.used / Math.max(usageSummary.total, 1)) * 100));
  const progressColor = usagePercent >= 85 ? 'bg-destructive' : usagePercent >= 60 ? 'bg-amber-500' : 'bg-emerald-500';

  const detailItems = [
    {
      label: t('有效期'), value: sub.end_time && sub.start_time
        ? `${formatTimestamp(sub.start_time, 'YYYY-MM-DD')} → ${formatTimestamp(sub.end_time, 'YYYY-MM-DD')}`
        : '--'
    },
    { label: t('套餐说明'), value: item.planSubtitle || t('暂无说明') },
    { label: t('生效时间'), value: formatTimestamp(sub.start_time ?? 0, 'YYYY-MM-DD HH:mm') },
    { label: t('到期时间'), value: formatTimestamp(sub.end_time ?? 0, 'YYYY-MM-DD HH:mm') },
    { label: resourceType === 'request_count' ? t('次数重置') : t('额度重置'), value: formatResetPeriod(sub, t) },
    { label: t('下次重置'), value: formatNextReset(sub, t) },
    { label: t('来源'), value: sub.source || '--' },
    { label: t('升级分组'), value: sub.upgrade_group || '--' },
    { label: item.usageLabel, value: `${displayQuota(usageSummary, resourceType, 'used', t)} / ${displayQuota(usageSummary, resourceType, 'total', t)}` },
  ];

  return (
    <div className={cn('border rounded-xl overflow-hidden', state === 'active' ? 'border-success/20' : 'border-border/50')}>
      <button
        className="w-full text-left p-4 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className={cn('shrink-0 rounded-lg p-2', state === 'active' ? 'bg-success/10' : 'bg-muted')}>
              <ShieldCheck className={cn('size-4', state === 'active' ? 'text-success' : 'text-muted-foreground/50')} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-sm">{item.title}</span>
                <Badge variant={state === 'active' ? 'default' : 'secondary'} className={cn('text-[10px] py-0 px-1.5 h-4', state === 'active' && 'bg-success/15 text-success border-success/25')}>
                  {state === 'active' ? t('生效') : state === 'cancelled' ? t('已作废') : t('已过期')}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('订阅')} #{sub.id || '--'}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="font-semibold text-sm">
              {t('剩余')} {displayQuota(usageSummary, resourceType, 'remain', t)}
            </p>
            <p className="text-xs text-muted-foreground">
              {state === 'active' ? `${t('还有')} ${item.remainingDays} ${t('天')}` : formatTimestamp(sub.end_time ?? 0, 'YYYY-MM-DD')}
            </p>
          </div>
          <ChevronDown className={cn('size-4 text-muted-foreground shrink-0 mt-0.5 transition-transform', expanded && 'rotate-180')} />
        </div>
        {state === 'active' && !usageSummary.unlimited && (
          <div className="mt-3 px-1">
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className={cn('h-full rounded-full transition-all', progressColor)} style={{ width: `${usagePercent}%` }} />
            </div>
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: t('到期时间'), value: formatTimestamp(sub.end_time ?? 0, 'YYYY-MM-DD') },
            { label: resourceType === 'request_count' ? t('次数重置') : t('额度重置'), value: formatResetPeriod(sub, t) },
            { label: item.usageLabel, value: `${displayQuota(usageSummary, resourceType, 'used', t)} / ${displayQuota(usageSummary, resourceType, 'total', t)}` },
            { label: t('已用进度'), value: usageSummary.unlimited ? t('不限') : `${usagePercent}%` },
          ].map((info) => (
            <div key={info.label} className="rounded-lg bg-muted/50 px-2 py-1.5 text-xs">
              <p className="text-muted-foreground">{info.label}</p>
              <p className="font-medium text-foreground mt-0.5">{info.value}</p>
            </div>
          ))}
        </div>
      </button>

      {expanded && (
        <div className="border-t px-4 pb-4 pt-3 space-y-3 bg-muted/10">
          {!usageSummary.unlimited && (
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                <span>{t('权益使用情况')}</span>
                <span>{t('已用')} {usagePercent}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className={cn('h-full rounded-full', progressColor)} style={{ width: `${usagePercent}%` }} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {detailItems.map((d) => (
              <div key={d.label} className="rounded-lg border bg-background p-3">
                <p className="text-xs text-muted-foreground">{d.label}</p>
                <p className="text-sm mt-1 break-all">{d.value}</p>
              </div>
            ))}
          </div>
          {onViewLogs && (
            <div className="flex justify-end pt-1">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={onViewLogs}>
                <FileText className="size-3" />
                {t('查看历史消耗')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Purchase dialog ──────────────────────────────────────────────────────────

interface PurchaseDialogProps {
  open: boolean;
  onClose: () => void;
  plan: SubscriptionPlan | null;
  purchaseCount: number;
  paying: boolean;
  epayMethods: PayMethod[];
  selectedEpayMethod: string;
  onSelectEpay: (v: string) => void;
  enableStripe: boolean;
  enableCreem: boolean;
  enableEpay: boolean;
  onPayStripe: () => void;
  onPayCreem: () => void;
  onPayEpay: () => void;
  status?: SystemStatus;
  t: (k: string) => string;
}

function PurchaseDialog({
  open, onClose, plan, purchaseCount, paying,
  epayMethods, selectedEpayMethod, onSelectEpay,
  enableStripe, enableCreem, enableEpay,
  onPayStripe, onPayCreem, onPayEpay,
  status, t,
}: PurchaseDialogProps) {
  if (!plan) return null;
  const limit = Number(plan.max_purchase_per_user || 0);
  const limitReached = limit > 0 && purchaseCount >= limit;
  const hasDiscount = isDiscountActive(plan);
  const hasStripe = enableStripe && !!plan.stripe_price_id && !hasDiscount;
  const hasCreem = enableCreem && !!plan.creem_product_id && !hasDiscount;
  const hasEpayBtn = enableEpay && epayMethods.length > 0;
  const hasAny = hasStripe || hasCreem || hasEpayBtn;
  const reset = formatResetPeriod(plan, t);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[95vw] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crown className="size-4" /> {t('购买订阅套餐')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pb-2">
          <div className="rounded-xl bg-muted/40 border p-4 space-y-3">
            <Row label={t('套餐名称')} value={plan.title || t('订阅套餐')} />
            <Row label={t('有效期')} value={formatDuration(plan, t)} />
            {reset !== t('不重置') && <Row label={t('重置周期')} value={reset} />}
            {getResourceType(plan) === 'request_count' ? (
              <Row label={getResourceLabel(plan, t)} value={Number(plan.request_count_total || 0) > 0 ? `${plan.request_count_total} ${t('次')}` : t('不限')} />
            ) : (
              <Row label={getResourceLabel(plan, t)} value={Number(plan.amount_total ?? plan.total_amount ?? 0) > 0 ? renderQuota(Number(plan.amount_total ?? plan.total_amount)) : t('不限')} />
            )}
            {plan.upgrade_group && <Row label={t('升级分组')} value={plan.upgrade_group} />}
            <Separator className="my-1" />
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-muted-foreground">{t('应付金额')}</span>
              <div className="text-right">
                {hasDiscount && (
                  <p className="text-xs text-muted-foreground line-through">{formatOrigPrice(plan, status)}</p>
                )}
                <p className="text-xl font-bold text-primary">{formatPlanPrice(plan, status)}</p>
              </div>
            </div>
          </div>

          {hasDiscount && (
            <div className="rounded-lg border border-success/20 bg-success/10 dark:bg-success/20 px-3 py-2 text-xs text-success">
              {t('当前套餐正在限时优惠中，优惠截止时间')}：{new Date(Number(plan.discount_deadline || 0) * 1000).toLocaleString()}
            </div>
          )}

          {limitReached && (
            <div className="rounded-lg border border-warning/20 bg-warning/10 dark:bg-warning/20 px-3 py-2 text-xs text-warning">
              {t('已达到购买上限')} ({purchaseCount}/{limit})
            </div>
          )}

          {hasAny ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{t('选择支付方式')}</p>
              {(hasStripe || hasCreem) && (
                <div className="flex gap-2">
                  {hasStripe && (
                    <Button variant="outline" className="flex-1" onClick={onPayStripe} disabled={paying || limitReached}>
                      Stripe
                    </Button>
                  )}
                  {hasCreem && (
                    <Button variant="outline" className="flex-1" onClick={onPayCreem} disabled={paying || limitReached}>
                      Creem
                    </Button>
                  )}
                </div>
              )}
              {hasEpayBtn && (
                <div className="flex gap-2">
                  <Select value={selectedEpayMethod} onValueChange={onSelectEpay}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={t('选择支付方式')} />
                    </SelectTrigger>
                    <SelectContent>
                      {epayMethods.map((m) => (
                        <SelectItem key={m.type} value={m.type}>{m.name || m.type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={onPayEpay} disabled={!selectedEpayMethod || paying || limitReached}>
                    {t('支付')}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">
              {t('管理员未开启在线支付功能，请联系管理员配置。')}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right break-all">{value}</span>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

function SubscriptionContent() {
  const { t } = useTranslation();
  const status = useSystemStatus();

  const [plans, setPlans] = useState<PlanWrapper[]>([]);
  const [allSubs, setAllSubs] = useState<SubWrapper[]>([]);
  const [billingPref, setBillingPref] = useState('subscription_first');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Payment config
  const [enableStripe, setEnableStripe] = useState(false);
  const [enableCreem, setEnableCreem] = useState(false);
  const [enableEpay, setEnableEpay] = useState(false);
  const [epayMethods, setEpayMethods] = useState<PayMethod[]>([]);

  // Purchase dialog
  const [buyPlan, setBuyPlan] = useState<PlanWrapper | null>(null);
  const [paying, setPaying] = useState(false);
  const [selectedEpay, setSelectedEpay] = useState('');

  // Tab + filter state
  const [subFilter, setSubFilter] = useState<'active' | 'history' | 'all'>('active');
  const [planSort, setPlanSort] = useState('recommended');

  // Consume logs sheet
  const [consumeFilter, setConsumeFilter] = useState<{ subscriptionId?: number; planId?: number; title?: string } | null>(null);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [plansRes, selfRes, infoRes] = await Promise.all([
        API.get('/api/subscription/plans'),
        API.get('/api/subscription/self'),
        API.get('/api/user/topup/info'),
      ]);

      if (plansRes.data?.success) setPlans(plansRes.data.data || []);

      if (selfRes.data?.success) {
        setBillingPref(selfRes.data.data?.billing_preference || 'subscription_first');
        setAllSubs(selfRes.data.data?.all_subscriptions || selfRes.data.data?.subscriptions || []);
      }

      if (infoRes.data?.success) {
        const d = infoRes.data.data || {};
        setEnableStripe(!!d.enable_stripe_topup);
        setEnableCreem(!!d.enable_creem_topup);
        setEnableEpay(!!d.enable_online_topup);
        let methods: PayMethod[] = [];
        try {
          methods = typeof d.pay_methods === 'string' ? JSON.parse(d.pay_methods) : (d.pay_methods || []);
          methods = methods.filter((m) => m.name && m.type && m.type !== 'stripe' && m.type !== 'creem');
        } catch { methods = []; }
        setEpayMethods(methods);
        if (methods.length > 0) setSelectedEpay(methods[0].type);
      }
    } catch {
      if (!silent) toast.error(t('加载失败'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAll(true);
    setRefreshing(false);
  };

  const updateBillingPref = async (pref: string) => {
    const prev = billingPref;
    setBillingPref(pref);
    try {
      const res = await API.put('/api/subscription/self/preference', { billing_preference: pref });
      if (res.data?.success) {
        toast.success(t('更新成功'));
        setBillingPref(res.data.data?.billing_preference || pref);
      } else {
        toast.error(res.data?.message || t('更新失败'));
        setBillingPref(prev);
      }
    } catch {
      toast.error(t('请求失败'));
      setBillingPref(prev);
    }
  };

  // Payment handlers
  const payStripe = async () => {
    if (!buyPlan?.plan?.stripe_price_id) return;
    setPaying(true);
    try {
      const res = await API.post('/api/subscription/stripe/pay', { plan_id: buyPlan.plan.id });
      if (res.data?.message === 'success') {
        window.open(res.data.data?.pay_link, '_blank');
        toast.success(t('已打开支付页面'));
        setBuyPlan(null);
      } else {
        toast.error(typeof res.data?.data === 'string' ? res.data.data : res.data?.message || t('支付失败'));
      }
    } catch { toast.error(t('支付请求失败')); }
    finally { setPaying(false); }
  };

  const payCreem = async () => {
    if (!buyPlan?.plan?.creem_product_id) return;
    setPaying(true);
    try {
      const res = await API.post('/api/subscription/creem/pay', { plan_id: buyPlan.plan.id });
      if (res.data?.message === 'success') {
        window.open(res.data.data?.checkout_url, '_blank');
        toast.success(t('已打开支付页面'));
        setBuyPlan(null);
      } else {
        toast.error(typeof res.data?.data === 'string' ? res.data.data : res.data?.message || t('支付失败'));
      }
    } catch { toast.error(t('支付请求失败')); }
    finally { setPaying(false); }
  };

  const payEpay = async () => {
    if (!selectedEpay || !buyPlan) return;
    setPaying(true);
    try {
      const res = await API.post('/api/subscription/epay/pay', {
        plan_id: buyPlan.plan.id,
        payment_method: selectedEpay,
      });
      if (res.data?.message === 'success') {
        const form = document.createElement('form');
        form.action = res.data.url;
        form.method = 'POST';
        if (!/Safari/.test(navigator.userAgent) || /Chrome/.test(navigator.userAgent)) form.target = '_blank';
        Object.entries(res.data.data || {}).forEach(([k, v]) => {
          const inp = document.createElement('input');
          inp.type = 'hidden'; inp.name = k; inp.value = String(v);
          form.appendChild(inp);
        });
        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);
        toast.success(t('已发起支付'));
        setBuyPlan(null);
      } else {
        toast.error(typeof res.data?.data === 'string' ? res.data.data : res.data?.message || t('支付失败'));
      }
    } catch { toast.error(t('支付请求失败')); }
    finally { setPaying(false); }
  };

  // Compute normalized subscriptions
  const planMap = useMemo(() => {
    const m = new Map<number, SubscriptionPlan>();
    plans.forEach((p) => { if (p.plan?.id) m.set(p.plan.id, p.plan); });
    return m;
  }, [plans]);

  const planTitleMap = useMemo(() => {
    const m = new Map<number, string>();
    plans.forEach((p) => { if (p.plan?.id) m.set(p.plan.id, p.plan.title || ''); });
    return m;
  }, [plans]);

  const planPurchaseCountMap = useMemo(() => {
    const m = new Map<number, number>();
    allSubs.forEach((s) => {
      const id = s.subscription?.plan_id;
      if (id) m.set(id, (m.get(id) || 0) + 1);
    });
    return m;
  }, [allSubs]);

  const normalizedSubs = useMemo(() =>
    allSubs.map((s, idx) => {
      const sub = s.subscription;
      const state = getSubState(sub);
      const usageSummary = getUsageSummary(sub);
      const resourceType = getResourceType(sub);
      const remainingDays = sub.end_time
        ? Math.max(0, Math.ceil((sub.end_time - Date.now() / 1000) / 86400))
        : 0;
      const plan = sub.plan_id ? planMap.get(sub.plan_id) : undefined;
      return {
        ...s,
        key: String(sub.id || idx),
        state,
        usageSummary,
        resourceType,
        usageLabel: getResourceLabel(sub, t),
        title: planTitleMap.get(sub.plan_id ?? 0) || `${t('订阅')} #${sub.id}`,
        remainingDays,
        planSubtitle: plan?.subtitle,
      };
    }).sort((a, b) => (b.subscription.end_time || 0) - (a.subscription.end_time || 0)),
    [allSubs, planMap, planTitleMap, t]);

  const activeSubs = useMemo(() => normalizedSubs.filter((s) => s.state === 'active'), [normalizedSubs]);
  const historySubs = useMemo(() => normalizedSubs.filter((s) => s.state !== 'active'), [normalizedSubs]);
  const visibleSubs = subFilter === 'history' ? historySubs : subFilter === 'all' ? normalizedSubs : activeSubs;

  const nextExpiring = useMemo(() =>
    [...activeSubs].sort((a, b) => (a.subscription.end_time || 0) - (b.subscription.end_time || 0))[0],
    [activeSubs]);

  const activeRemainSummary = useMemo(() => {
    let quotaRemain = 0, requestRemain = 0, quotaUnlimited = false, requestUnlimited = false;
    activeSubs.forEach((item) => {
      if (item.usageSummary.unlimited) {
        if (item.resourceType === 'request_count') requestUnlimited = true;
        else quotaUnlimited = true;
        return;
      }
      if (item.resourceType === 'request_count') requestRemain += item.usageSummary.remain;
      else quotaRemain += item.usageSummary.remain;
    });
    const parts = [];
    if (quotaUnlimited) parts.push(`${t('额度')} ${t('不限')}`);
    else if (quotaRemain > 0) parts.push(`${t('额度')} ${renderQuota(quotaRemain)}`);
    if (requestUnlimited) parts.push(`${t('次数')} ${t('不限')}`);
    else if (requestRemain > 0) parts.push(`${t('次数')} ${requestRemain}`);
    if (!parts.length) return activeSubs.length > 0 ? t('按套餐明细结算') : t('暂无生效订阅');
    return parts.join(' · ');
  }, [activeSubs, t]);

  const prefLabel = billingPref === 'subscription_only' ? t('仅用订阅')
    : billingPref === 'wallet_first' ? t('优先钱包')
      : billingPref === 'wallet_only' ? t('仅用钱包')
        : t('优先订阅');

  // Usage chart (aggregated across active subs)
  const usageMetrics = useMemo(() => {
    const quota = { total: 0, used: 0, remain: 0, unlimited: false };
    const req = { total: 0, used: 0, remain: 0, unlimited: false };
    activeSubs.forEach((item) => {
      const target = item.resourceType === 'request_count' ? req : quota;
      if (item.usageSummary.unlimited) { target.unlimited = true; return; }
      target.total += item.usageSummary.total;
      target.used += item.usageSummary.used;
      target.remain += item.usageSummary.remain;
    });
    return [
      {
        key: 'quota', title: t('额度消耗'), resourceType: 'quota' as const, ...quota,
        percent: quota.unlimited ? 0 : Math.min(100, Math.round(quota.used / Math.max(quota.total, 1) * 100)),
        totalText: quota.unlimited ? t('不限') : renderQuota(quota.total),
        usedText: quota.unlimited ? t('按实际调用') : renderQuota(quota.used),
        remainText: quota.unlimited ? t('不限') : renderQuota(quota.remain),
      },
      {
        key: 'request', title: t('次数消耗'), resourceType: 'request_count' as const, ...req,
        percent: req.unlimited ? 0 : Math.min(100, Math.round(req.used / Math.max(req.total, 1) * 100)),
        totalText: req.unlimited ? t('不限') : String(req.total),
        usedText: req.unlimited ? t('按实际调用') : String(req.used),
        remainText: req.unlimited ? t('不限') : String(req.remain),
      },
    ];
  }, [activeSubs, t]);

  // Plan options for ConsumeLogsSheet
  const planOptions = useMemo(() =>
    plans.map((p) => ({ label: p.plan?.title || `#${p.plan?.id}`, value: p.plan?.id ?? 0 })).filter((o) => o.value > 0),
    [plans]);

  const planMetaRecord = useMemo(() => {
    const m: Record<number, { resource_type?: string; title?: string }> = {};
    plans.forEach((p) => {
      if (p.plan?.id) m[p.plan.id] = { resource_type: p.plan.resource_type, title: p.plan.title };
    });
    return m;
  }, [plans]);

  // Sorted plans
  const sortedPlans = useMemo(() => {
    const arr = [...plans];
    arr.sort((a, b) => {
      const pa = a.plan || {}, pb = b.plan || {};
      if (planSort === 'price_asc') return Number(pa.price_amount || 0) - Number(pb.price_amount || 0);
      if (planSort === 'price_desc') return Number(pb.price_amount || 0) - Number(pa.price_amount || 0);
      if (planSort === 'value_desc') {
        const va = getUsageSummary(pa).unlimited ? Number.MAX_SAFE_INTEGER : getUsageSummary(pa).total;
        const vb = getUsageSummary(pb).unlimited ? Number.MAX_SAFE_INTEGER : getUsageSummary(pb).total;
        return vb - va;
      }
      // recommended: most purchased first, then price asc
      const ca = planPurchaseCountMap.get(pa.id || 0) || 0;
      const cb = planPurchaseCountMap.get(pb.id || 0) || 0;
      return cb !== ca ? cb - ca : Number(pa.price_amount || 0) - Number(pb.price_amount || 0);
    });
    return arr;
  }, [plans, planSort, planPurchaseCountMap]);

  const overviewItems = [
    {
      label: t('生效中的订阅'), value: String(activeSubs.length),
      helper: activeSubs.length > 0 ? t('正在提供模型权益') : t('当前暂无生效套餐'),
      icon: Zap, iconBg: 'bg-primary/10', iconColor: 'text-primary',
    },
    {
      label: t('历史订阅'), value: String(historySubs.length),
      helper: historySubs.length > 0 ? t('含已过期与已作废记录') : t('暂无历史记录'),
      icon: History, iconBg: 'bg-purple-500/10', iconColor: 'text-purple-600 dark:text-purple-400',
    },
    {
      label: t('最近到期'), value: nextExpiring ? `${nextExpiring.remainingDays}${t('天')}` : '--',
      helper: nextExpiring ? nextExpiring.title : t('暂无生效套餐'),
      icon: Clock, iconBg: 'bg-warning/10', iconColor: 'text-warning',
    },
    {
      label: t('当前权益概览'), value: activeRemainSummary,
      helper: prefLabel,
      icon: Crown, iconBg: 'bg-success/10', iconColor: 'text-success',
    },
  ];

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Package className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{t('我的订阅')}</h1>
            <p className="text-sm text-muted-foreground">{t('管理套餐权益与订阅计划')}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing || loading}>
          <RefreshCw className={cn('size-4 mr-2', refreshing && 'animate-spin')} />
          {t('刷新')}
        </Button>
      </motion.div>

      {/* Overview stats */}
      {loading ? <OverviewSkeleton /> : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
        >
          {overviewItems.map((item) => (
            <motion.div key={item.label} variants={itemVariants}>
              <StatCard {...item} />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Usage visualization */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
      >
        <Card className="border-border/60 shadow-card overflow-hidden">
          <div className="bg-primary/5 border-b border-border/60 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-primary/10 p-1.5">
                <BarChart3 className="size-4 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">{t('消耗额度可视化')}</p>
                <p className="text-xs text-muted-foreground">{t('聚合展示生效订阅的额度/次数使用进度，帮助你更快判断是否需要续费或加购。')}</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
            {loading ? (
              <>{[1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</>
            ) : usageMetrics.map((m) => (
              <div key={m.key} className="rounded-xl border bg-muted/20 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={cn('size-2.5 rounded-full', m.unlimited ? 'bg-success' : m.percent >= 85 ? 'bg-destructive' : m.percent >= 60 ? 'bg-warning' : 'bg-success')} />
                    <span className="font-medium text-sm">{m.title}</span>
                  </div>
                  <Badge variant="outline" className={cn('text-[10px]', m.percent >= 85 ? 'text-destructive border-destructive/30' : m.percent >= 60 ? 'text-warning border-warning/30' : 'text-success border-success/30')}>
                    {m.unlimited ? t('不限') : `${m.percent}%`}
                  </Badge>
                </div>
                {!m.unlimited && <Progress value={m.percent} className="h-2 mb-4" />}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {[
                    { label: t('总量'), val: m.totalText },
                    { label: t('已用'), val: m.usedText },
                    { label: t('剩余'), val: m.remainText },
                  ].map((c) => (
                    <div key={c.label} className="rounded-lg bg-background border px-2 py-2 text-center">
                      <p className="text-muted-foreground">{c.label}</p>
                      <p className="font-semibold mt-1">{c.val}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </motion.div>

      {/* Guide */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.18 }}
      >
        <Card className="border-border/60 shadow-card">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-3">
              <div className="rounded-lg bg-warning/10 p-1.5">
                <BookOpen className="size-3.5 text-warning" />
              </div>
              <p className="font-semibold text-sm">{t('使用说明与计费规则')}</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{t('下单前建议先阅读这里，了解套餐如何生效、如何扣费，以及多套餐并存时的处理方式。')}</p>
            <GuideSection t={t} />
          </CardContent>
        </Card>
      </motion.div>

      {/* Main tabs */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.25 }}
      >
        <Card className="border-border/60 shadow-card">
          <CardContent className="p-4 md:p-5">
            <Tabs defaultValue="my_subscriptions">
              <TabsList className="mb-4">
                <TabsTrigger value="my_subscriptions">
                  {t('我的订阅')} ({allSubs.length})
                </TabsTrigger>
                <TabsTrigger value="plan_list">
                  {t('套餐列表')} ({sortedPlans.length})
                </TabsTrigger>
              </TabsList>

              {/* My subscriptions */}
              <TabsContent value="my_subscriptions" className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    {(['active', 'history', 'all'] as const).map((f) => (
                      <Button
                        key={f}
                        variant={subFilter === f ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs px-3"
                        onClick={() => setSubFilter(f)}
                      >
                        {f === 'active' ? `${t('生效中')} (${activeSubs.length})`
                          : f === 'history' ? `${t('历史')} (${historySubs.length})`
                            : t('全部')}
                      </Button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline" size="sm"
                      className="h-7 text-xs gap-1.5"
                      onClick={() => setConsumeFilter({})}
                    >
                      <FileText className="size-3" />
                      {t('全部消耗')}
                    </Button>
                    <span className="text-xs text-muted-foreground shrink-0">{t('扣费偏好')}</span>
                    <Select value={billingPref} onValueChange={updateBillingPref}>
                      <SelectTrigger className="h-7 text-xs w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="subscription_first">{t('优先订阅')}</SelectItem>
                        <SelectItem value="wallet_first">{t('优先钱包')}</SelectItem>
                        <SelectItem value="subscription_only">{t('仅用订阅')}</SelectItem>
                        <SelectItem value="wallet_only">{t('仅用钱包')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {loading ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
                  </div>
                ) : visibleSubs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                    <div className="size-14 rounded-2xl bg-muted flex items-center justify-center">
                      <Package className="size-7 text-muted-foreground/40" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground/70">{subFilter === 'history' ? t('暂无历史订阅') : t('暂无生效订阅')}</p>
                      <p className="text-sm text-muted-foreground mt-1">{t('前往"套餐列表"选择适合的方案')}</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {visibleSubs.map((item) => (
                      <SubCard
                        key={item.key}
                        item={item}
                        t={t}
                        onViewLogs={() => setConsumeFilter({
                          subscriptionId: item.subscription.id,
                          planId: item.subscription.plan_id,
                          title: item.title,
                        })}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Plan list */}
              <TabsContent value="plan_list" className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-indigo-500/15 p-1.5">
                      <Package className="size-3.5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <p className="font-semibold text-sm">{t('可购买套餐')}</p>
                  </div>
                  <Select value={planSort} onValueChange={setPlanSort}>
                    <SelectTrigger className="h-7 text-xs w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recommended">{t('推荐优先')}</SelectItem>
                      <SelectItem value="price_asc">{t('价格从低到高')}</SelectItem>
                      <SelectItem value="price_desc">{t('价格从高到低')}</SelectItem>
                      <SelectItem value="value_desc">{t('权益从多到少')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {loading ? (
                  <Skeleton className="h-48 rounded-xl" />
                ) : sortedPlans.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                    <div className="size-14 rounded-2xl bg-muted flex items-center justify-center">
                      <Sparkles className="size-7 text-muted-foreground/40" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground/70">{t('暂无可购买套餐')}</p>
                      <p className="text-sm text-muted-foreground mt-1">{t('管理员暂未上架套餐，请稍后再试')}</p>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('套餐')}</TableHead>
                          <TableHead>{t('价格')}</TableHead>
                          <TableHead className="hidden md:table-cell">{t('核心权益')}</TableHead>
                          <TableHead className="hidden lg:table-cell">{t('规则')}</TableHead>
                          <TableHead className="text-right">{t('操作')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedPlans.map((pw, idx) => {
                          const plan = pw.plan || {};
                          const count = planPurchaseCountMap.get(plan.id || 0) || 0;
                          const limit = Number(plan.max_purchase_per_user || 0);
                          const reached = limit > 0 && count >= limit;
                          const sale = getSaleSummary(plan);
                          const disabled = reached || sale.soldOut || !plan.enabled;
                          const isPopular = planSort === 'recommended' && idx === 0 && sortedPlans.length > 1;
                          const hasDisc = isDiscountActive(plan);
                          return (
                            <TableRow key={plan.id || idx} className="hover:bg-muted/30">
                              <TableCell>
                                <div className="flex items-center gap-2.5">
                                  <div className={cn('shrink-0 rounded-lg p-1.5', isPopular ? 'bg-primary/15' : 'bg-muted')}>
                                    <Package className={cn('size-3.5', isPopular ? 'text-primary' : 'text-muted-foreground')} />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="font-medium text-sm">{plan.title || t('订阅套餐')}</span>
                                      {isPopular && <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 text-primary border-primary/30">{t('推荐')}</Badge>}
                                      {!plan.enabled && <Badge variant="destructive" className="text-[10px] py-0 px-1.5 h-4">{t('已下架')}</Badge>}
                                      {sale.soldOut && <Badge variant="destructive" className="text-[10px] py-0 px-1.5 h-4">{t('已售罄')}</Badge>}
                                      {reached && <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4">{t('已达上限')}</Badge>}
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate max-w-[180px]">{plan.subtitle}</p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="inline-flex flex-col">
                                  <span className="font-bold text-base text-primary">
                                    {formatPlanPrice(plan, status)}
                                  </span>
                                  {hasDisc && (
                                    <span className="text-xs text-muted-foreground line-through">{formatOrigPrice(plan, status)}</span>
                                  )}
                                  <span className="text-xs text-muted-foreground">{formatDuration(plan, t)}</span>
                                </div>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                <p className="text-sm">{getBenefitText(plan, t)}</p>
                                <p className="text-xs text-muted-foreground">{t('有效期')}：{formatDuration(plan, t)}</p>
                              </TableCell>
                              <TableCell className="hidden lg:table-cell">
                                <div className="flex flex-wrap gap-1">
                                  {limit > 0 && <Badge variant="outline" className="text-[10px]">{t('限购')} {limit}</Badge>}
                                  {!sale.unlimited && <Badge variant="outline" className="text-[10px]">{t('剩余')} {sale.remaining}</Badge>}
                                  {plan.upgrade_group && <Badge variant="outline" className="text-[10px]">{plan.upgrade_group}</Badge>}
                                  {!limit && !plan.upgrade_group && sale.sold <= 0 && <span className="text-xs text-muted-foreground">--</span>}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="sm"
                                  disabled={disabled}
                                  onClick={() => {
                                    if (epayMethods.length > 0) setSelectedEpay(epayMethods[0].type);
                                    setBuyPlan(pw);
                                  }}
                                >
                                  {disabled ? (sale.soldOut ? t('已售罄') : reached ? t('已达上限') : t('已下架')) : (
                                    <>{t('立即订阅')} <ChevronRight className="size-3 ml-1" /></>
                                  )}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Purchase dialog */}
        <PurchaseDialog
          open={!!buyPlan}
          onClose={() => setBuyPlan(null)}
          plan={buyPlan?.plan ?? null}
          purchaseCount={buyPlan?.plan?.id ? planPurchaseCountMap.get(buyPlan.plan.id) || 0 : 0}
          paying={paying}
          epayMethods={epayMethods}
          selectedEpayMethod={selectedEpay}
          onSelectEpay={setSelectedEpay}
          enableStripe={enableStripe}
          enableCreem={enableCreem}
          enableEpay={enableEpay}
          onPayStripe={payStripe}
          onPayCreem={payCreem}
          onPayEpay={payEpay}
          status={status}
          t={t}
        />

        {/* Consume logs sheet */}
        <ConsumeLogsSheet
          open={!!consumeFilter}
          onClose={() => setConsumeFilter(null)}
          title={consumeFilter?.title ? `${t('消耗记录')} · ${consumeFilter.title}` : t('全部订阅消耗记录')}
          subscriptionId={consumeFilter?.subscriptionId}
          planId={consumeFilter?.planId}
          planOptions={planOptions}
          planMeta={planMetaRecord}
        />
      </motion.div>
    </div>
  );
}

export default function SubscriptionPage() {
  return (
    <AuthGuard>
      <SubscriptionContent />
    </AuthGuard>
  );
}
