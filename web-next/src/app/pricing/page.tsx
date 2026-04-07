'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, RefreshCw, BarChart3, Copy, Check, ChevronRight,
  Package, Crown, Clock, X, Layers, Zap, Info, Tag,
  Database, ArrowUpRight, Cpu,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { API } from '@/lib/api';
import { renderQuota, getCurrencySymbol, cn } from '@/lib/utils';
import { useSystemStatus } from '@/context/status-context';
import { toast } from 'sonner';
import type { SystemStatus } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ModelPrice {
  model_name: string;
  quota_type: number;
  model_ratio: number;
  completion_ratio: number;
  enable_groups: string[];
  vendor_name?: string;
  vendor_icon?: string;
  vendor_description?: string;
  description?: string;
  tags?: string;
  supported_endpoint_types?: string[];
}

interface Vendor {
  id: string;
  name: string;
  icon?: string;
  description?: string;
}

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
  resource_type?: string;
  amount_total?: number;
  total_amount?: number;
  request_count_total?: number;
  max_purchase_per_user?: number;
  sale_limit_count?: number;
  sold_count?: number;
  remaining_sale_count?: number;
  sold_out?: boolean;
  upgrade_group?: string;
  enabled?: boolean;
}

interface PlanWrapper { plan: SubscriptionPlan }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRatio(ratio: number, digits = 6): string {
  if (ratio === undefined || ratio === null) return '—';
  if (ratio === 0) return '0';
  return ratio.toFixed(digits);
}

function isDiscountActive(plan: SubscriptionPlan): boolean {
  if (typeof plan.has_active_discount === 'boolean') return plan.has_active_discount;
  const orig = Number(plan.price_amount || 0);
  const disc = Number(plan.discount_price_amount || 0);
  const deadline = Number(plan.discount_deadline || 0);
  return disc > 0 && orig > 0 && disc < orig && deadline > Date.now() / 1000;
}

function getEffectivePrice(plan: SubscriptionPlan): number {
  if (plan.effective_price_amount !== undefined && plan.effective_price_amount !== null)
    return Number(plan.effective_price_amount);
  return isDiscountActive(plan)
    ? Number(plan.discount_price_amount || 0)
    : Number(plan.price_amount || 0);
}

function getSaleSummary(plan: SubscriptionPlan) {
  const saleLimit = Number(plan.sale_limit_count || 0);
  const sold = Number(plan.sold_count || 0);
  const remaining = saleLimit > 0
    ? Math.max(0, plan.remaining_sale_count !== undefined
      ? Number(plan.remaining_sale_count) : saleLimit - sold)
    : 0;
  const soldOut = typeof plan.sold_out === 'boolean'
    ? plan.sold_out : saleLimit > 0 && sold >= saleLimit;
  return { saleLimit, sold, remaining, soldOut, unlimited: saleLimit <= 0 };
}

function getCurrencyRate(status?: SystemStatus): number {
  if (!status) return 1;
  if (status.quota_display_type === 'CNY') return status.usd_exchange_rate ?? 7;
  if (status.quota_display_type === 'CUSTOM') return status.custom_currency_exchange_rate ?? 1;
  return 1;
}

function fmtPrice(amount: number, status?: SystemStatus): string {
  const symbol = getCurrencySymbol(status);
  const rate = getCurrencyRate(status);
  const price = amount * rate;
  return `${symbol}${price.toFixed(Number.isInteger(price) ? 0 : 2)}`;
}

function fmtDuration(plan: SubscriptionPlan, t: (k: string) => string): string {
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

function fmtBenefit(plan: SubscriptionPlan, t: (k: string) => string): string {
  if (plan.resource_type === 'request_count') {
    const n = Number(plan.request_count_total || 0);
    return n > 0 ? `${n} ${t('次')}` : t('不限次数');
  }
  const total = Number(plan.amount_total ?? plan.total_amount ?? 0);
  return total > 0 ? renderQuota(total) : t('不限额度');
}

// ── VendorIcon ────────────────────────────────────────────────────────────────

function VendorIcon({ icon, name, size = 'sm' }: { icon?: string; name?: string; size?: 'xs' | 'sm' | 'md' }) {
  const [error, setError] = useState(false);

  const sizeMap = {
    xs: 'size-4 text-[10px]',
    sm: 'size-5 text-[11px]',
    md: 'size-7 text-sm',
  };

  const initial = name ? name.charAt(0).toUpperCase() : '?';

  if (!icon || error) {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-md font-bold shrink-0',
          'bg-muted text-muted-foreground border border-border/60',
          sizeMap[size],
        )}
      >
        {initial}
      </span>
    );
  }

  return (
    <img
      src={`https://registry.npmmirror.com/@lobehub/icons-static-png/latest/files/dark/${icon}.png`}
      alt={name || icon}
      onError={() => setError(true)}
      className={cn('rounded-md object-contain shrink-0', sizeMap[size])}
    />
  );
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ text, className }: { text: string; className?: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast.success(t('已复制'), { description: text, duration: 1500 });
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleCopy}
            className={cn(
              'inline-flex items-center justify-center rounded size-6',
              'text-muted-foreground/50 hover:text-foreground hover:bg-muted',
              'transition-all duration-150 cursor-pointer flex-shrink-0',
              className,
            )}
          >
            <AnimatePresence mode="wait" initial={false}>
              {copied ? (
                <motion.span
                  key="check"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <Check className="size-3 text-success" />
                </motion.span>
              ) : (
                <motion.span
                  key="copy"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <Copy className="size-3" />
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">{copied ? t('已复制！') : t('复制模型名')}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Model Detail Sheet ────────────────────────────────────────────────────────

function ModelDetailSheet({
  model,
  open,
  onClose,
}: {
  model: ModelPrice | null;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  if (!model) return null;

  const inputPrice = fmtRatio(model.model_ratio);
  const outputPrice = fmtRatio(model.model_ratio * model.completion_ratio);
  const isTokenBased = model.quota_type === 0;

  const metrics = [
    {
      label: t('输入价格'),
      value: inputPrice,
      unit: 'per 1K tokens',
      icon: ArrowUpRight,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    },
    {
      label: t('输出价格'),
      value: outputPrice,
      unit: 'per 1K tokens',
      icon: ArrowUpRight,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950/30',
    },
    {
      label: t('完成系数'),
      value: fmtRatio(model.completion_ratio, 4),
      unit: t('输出/输入 比值'),
      icon: Cpu,
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-50 dark:bg-purple-950/30',
    },
    {
      label: t('计费类型'),
      value: isTokenBased ? t('按量计费') : t('按次计费'),
      unit: isTokenBased ? t('Token 用量') : t('请求次数'),
      icon: Database,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950/30',
    },
  ];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col gap-0 overflow-hidden">
        {/* Header */}
        <div className="bg-muted/30 px-6 pt-6 pb-5 shrink-0 border-b">
          <SheetHeader>
            <div className="flex items-start gap-3">
              <div className={cn(
                'shrink-0 size-10 rounded-xl flex items-center justify-center',
                'bg-background border border-border shadow-sm',
              )}>
                {model.vendor_icon || model.vendor_name ? (
                  <VendorIcon icon={model.vendor_icon} name={model.vendor_name} size="md" />
                ) : (
                  <Zap className="size-5 text-foreground/70" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-sm font-medium text-muted-foreground mb-1">
                  {t('模型详情')}
                </SheetTitle>
                <div className="flex items-start gap-2">
                  <p className="font-mono text-base font-bold break-all leading-snug">
                    {model.model_name}
                  </p>
                  <CopyButton text={model.model_name} className="mt-0.5 shrink-0" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {model.vendor_name && (
                <Badge variant="outline" className="text-xs gap-1.5">
                  <VendorIcon icon={model.vendor_icon} name={model.vendor_name} size="xs" />
                  {model.vendor_name}
                </Badge>
              )}
              <Badge variant={isTokenBased ? 'default' : 'secondary'} className="text-xs">
                {isTokenBased ? t('按量') : t('按次')}
              </Badge>
            </div>
          </SheetHeader>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-5 space-y-5">
            {/* Metrics grid */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {t('价格参数')}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {metrics.map((m) => (
                  <div key={m.label} className={cn('rounded-xl p-3.5', m.bg)}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <m.icon className={cn('size-3.5', m.color)} />
                      <span className="text-xs text-muted-foreground">{m.label}</span>
                    </div>
                    <p className={cn('font-mono text-lg font-bold', m.color)}>{m.value}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{m.unit}</p>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Groups */}
            {(model.enable_groups || []).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  {t('可用分组')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(model.enable_groups || []).map((g) => (
                    <Badge key={g} variant="outline" className="text-sm px-3 py-1.5 gap-1.5">
                      <Tag className="size-3" />
                      {g}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Copy section */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {t('模型标识符')}
              </p>
              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2.5">
                <code className="font-mono text-sm flex-1 break-all text-foreground">
                  {model.model_name}
                </code>
                <CopyButton text={model.model_name} />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {t('在 API 请求中使用 model 字段传入此标识符')}
              </p>
            </div>

            {/* Pricing note */}
            <div className="flex items-start gap-2.5 rounded-lg border border-blue-200/60 bg-blue-50/60 dark:border-blue-800/40 dark:bg-blue-900/10 px-3.5 py-3 text-xs text-blue-700 dark:text-blue-300">
              <Info className="size-3.5 shrink-0 mt-0.5" />
              <span>{t('价格基于系统设定的倍率，实际费用以账户余额扣除为准。')}</span>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div className="rounded-2xl border bg-card px-5 py-4 transition-shadow hover:shadow-sm">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className={cn('text-2xl font-bold mt-1.5 tabular-nums', accent || 'text-foreground')}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

// ── Model Pricing Tab ─────────────────────────────────────────────────────────

function ModelPricingTab({ prices, loading }: { prices: ModelPrice[]; loading: boolean }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [activeVendor, setActiveVendor] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [selectedModel, setSelectedModel] = useState<ModelPrice | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const allGroups = useMemo(() => {
    const groups = new Set<string>();
    prices.forEach((p) => (p.enable_groups || []).forEach((g) => groups.add(g)));
    return Array.from(groups).sort();
  }, [prices]);

  // Derive vendor list from prices
  const vendorChips = useMemo(() => {
    const map = new Map<string, { name: string; icon?: string; count: number }>();
    prices.forEach((p) => {
      const key = p.vendor_name || '';
      if (!key) return;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, { name: key, icon: p.vendor_icon, count: 1 });
      }
    });
    const chips = Array.from(map.values()).sort((a, b) => b.count - a.count);
    return chips;
  }, [prices]);

  const filteredPrices = useMemo(() => {
    let list = prices;
    if (activeVendor !== 'all') {
      list = list.filter((p) => p.vendor_name === activeVendor);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.model_name.toLowerCase().includes(q));
    }
    if (groupFilter && groupFilter !== 'all') {
      list = list.filter((p) => (p.enable_groups || []).includes(groupFilter));
    }
    return list;
  }, [prices, activeVendor, search, groupFilter]);

  const openDetail = (model: ModelPrice) => {
    setSelectedModel(model);
    setSheetOpen(true);
  };

  return (
    <>
      <div className="space-y-4">
        {/* Vendor chips */}
        <ScrollArea className="w-full">
          <div className="flex gap-2 pb-2">
            {/* All chip */}
            <button
              onClick={() => setActiveVendor('all')}
              className={cn(
                'inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium',
                'transition-all duration-200 cursor-pointer border whitespace-nowrap select-none',
                activeVendor === 'all'
                  ? 'bg-foreground text-background border-foreground shadow-sm'
                  : 'bg-card text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground hover:bg-muted/50',
              )}
            >
              <span className={cn(
                'size-1.5 rounded-full flex-shrink-0',
                activeVendor === 'all' ? 'bg-background/80' : 'bg-foreground/50',
              )} />
              {t('全部')}
              <span className={cn(
                'text-[10px] rounded-full px-1.5 min-w-[20px] text-center font-semibold',
                activeVendor === 'all' ? 'bg-white/25 text-white' : 'bg-muted text-muted-foreground',
              )}>
                {prices.length}
              </span>
            </button>

            {vendorChips.map((chip) => (
              <button
                key={chip.name}
                onClick={() => setActiveVendor(chip.name)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium',
                  'transition-all duration-200 cursor-pointer border whitespace-nowrap select-none',
                  activeVendor === chip.name
                    ? 'bg-foreground text-background border-foreground shadow-sm'
                    : 'bg-card text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground hover:bg-muted/50',
                )}
              >
                <VendorIcon icon={chip.icon} name={chip.name} size="xs" />
                {chip.name}
                <span className={cn(
                  'text-[10px] rounded-full px-1.5 min-w-[20px] text-center font-semibold',
                  activeVendor === chip.name ? 'bg-white/25 text-white' : 'bg-muted text-muted-foreground',
                )}>
                  {chip.count}
                </span>
              </button>
            ))}
          </div>
          <ScrollBar orientation="horizontal" className="h-1" />
        </ScrollArea>

        {/* Controls row */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={t('搜索模型名称...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-card"
            />
            {search && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer p-0.5 rounded"
                onClick={() => setSearch('')}
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {allGroups.length > 0 && (
            <Select value={groupFilter} onValueChange={setGroupFilter}>
              <SelectTrigger className="w-full sm:w-44 bg-card">
                <Layers className="size-3.5 text-muted-foreground mr-1" />
                <SelectValue placeholder={t('全部分组')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('全部分组')}</SelectItem>
                {allGroups.map((g) => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="flex items-center gap-1.5 rounded-lg border bg-muted/50 px-3 h-10 text-sm text-muted-foreground whitespace-nowrap self-stretch sm:self-auto">
            <BarChart3 className="size-3.5" />
            <span className="font-semibold text-foreground">{filteredPrices.length}</span>
            {t('个模型')}
          </div>
        </div>

        {/* Hint */}
        <div className="flex items-start gap-2.5 rounded-xl border border-blue-200/70 bg-blue-50/50 dark:border-blue-800/40 dark:bg-blue-950/20 px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
          <Info className="size-4 shrink-0 mt-0.5" />
          <span>
            {t('点击任意行可查看完整模型详情。价格基于系统倍率，实际费用以账户扣除为准。')}
          </span>
        </div>

        {/* Table */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground min-w-[180px]">{t('模型名称')}</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground w-36">{t('供应商')}</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground w-20">{t('类型')}</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground w-40">{t('输入 / 1K tokens')}</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground w-40">{t('输出 / 1K tokens')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">{t('可用分组')}</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground w-16"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td colSpan={7} className="px-4 py-2.5">
                        <Skeleton className="h-9 rounded-lg" />
                      </td>
                    </tr>
                  ))
                ) : filteredPrices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16 text-muted-foreground">
                      <div className="flex flex-col items-center gap-3">
                        <div className="size-12 rounded-2xl bg-muted flex items-center justify-center">
                          <BarChart3 className="size-6 opacity-30" />
                        </div>
                        <p className="text-sm">
                          {search || groupFilter !== 'all' ? t('未找到匹配的模型') : t('该分类暂无数据')}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredPrices.map((price, idx) => (
                    <motion.tr
                      key={price.model_name}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(idx * 0.003, 0.25) }}
                      onClick={() => openDetail(price)}
                      className="border-b last:border-0 group hover:bg-muted/40 dark:hover:bg-muted/20 transition-colors cursor-pointer"
                    >
                      {/* Model name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="font-mono text-sm font-medium truncate max-w-[220px]"
                            title={price.model_name}
                          >
                            {price.model_name}
                          </span>
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <CopyButton text={price.model_name} />
                          </span>
                        </div>
                      </td>

                      {/* Vendor */}
                      <td className="px-3 py-3">
                        {price.vendor_name ? (
                          <div className="flex items-center gap-1.5">
                            <VendorIcon icon={price.vendor_icon} name={price.vendor_name} size="xs" />
                            <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                              {price.vendor_name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">-</span>
                        )}
                      </td>

                      {/* Type */}
                      <td className="px-3 py-3">
                        <span className={cn(
                          'text-xs font-medium rounded-md px-2 py-0.5',
                          price.quota_type === 0
                            ? 'bg-primary/10 text-primary'
                            : 'bg-muted text-muted-foreground',
                        )}>
                          {price.quota_type === 0 ? t('按量') : t('按次')}
                        </span>
                      </td>

                      {/* Input price */}
                      <td className="px-4 py-3 text-right">
                        <span className="font-mono text-sm tabular-nums text-emerald-700 dark:text-emerald-400 font-medium">
                          {fmtRatio(price.model_ratio)}
                        </span>
                      </td>

                      {/* Output price */}
                      <td className="px-4 py-3 text-right">
                        <span className="font-mono text-sm tabular-nums text-blue-700 dark:text-blue-400 font-medium">
                          {fmtRatio(price.model_ratio * price.completion_ratio)}
                        </span>
                      </td>

                      {/* Groups */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(price.enable_groups || []).slice(0, 3).map((g) => (
                            <span
                              key={g}
                              onClick={(e) => { e.stopPropagation(); setGroupFilter(groupFilter === g ? 'all' : g); }}
                              className={cn(
                                'text-[11px] rounded-md px-1.5 py-0.5 border cursor-pointer transition-colors',
                                groupFilter === g
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-muted/60 text-muted-foreground border-border hover:bg-muted',
                              )}
                            >
                              {g}
                            </span>
                          ))}
                          {(price.enable_groups || []).length > 3 && (
                            <span className="text-[11px] rounded-md px-1.5 py-0.5 bg-muted/40 text-muted-foreground border border-border">
                              +{(price.enable_groups || []).length - 3}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Arrow */}
                      <td className="px-4 py-3 text-right">
                        <ChevronRight className="size-4 text-muted-foreground/40 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all ml-auto" />
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>

      <ModelDetailSheet
        model={selectedModel}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}

// ── Plan Card ─────────────────────────────────────────────────────────────────

function PlanCard({ plan, status, index }: {
  plan: SubscriptionPlan; status?: SystemStatus; index: number;
}) {
  const { t } = useTranslation();
  const hasDiscount = isDiscountActive(plan);
  const effectivePrice = getEffectivePrice(plan);
  const saleSummary = getSaleSummary(plan);
  const disabled = saleSummary.soldOut || !plan.enabled;
  const benefit = fmtBenefit(plan, t);
  const duration = fmtDuration(plan, t);
  const isQuotaType = plan.resource_type !== 'request_count';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.3 }}
      className={cn(
        'relative flex flex-col rounded-2xl border bg-card overflow-hidden',
        'transition-all duration-200',
        disabled
          ? 'opacity-50 pointer-events-none'
          : 'hover:border-primary/50 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer',
      )}
      onClick={() => { if (!disabled) window.location.href = '/console/subscription'; }}
    >
      {hasDiscount && (
        <div className="absolute top-0 right-0 z-10">
          <div className="bg-destructive text-destructive-foreground text-[10px] font-bold px-3 py-1 rounded-bl-xl">
            {t('限时优惠')}
          </div>
        </div>
      )}

      {/* Top accent bar */}
      <div className="h-1 w-full bg-gradient-to-r from-primary/60 via-primary to-primary/60" />

      <div className="p-6 flex-1 space-y-5">
        {/* Name + badge */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Package className="size-4 text-primary" />
            </div>
            {!saleSummary.unlimited && (
              <span className="text-xs text-muted-foreground ml-auto">
                {t('剩余')} {saleSummary.remaining}
              </span>
            )}
          </div>
          <h3 className="font-bold text-lg mt-3">{plan.title || t('订阅套餐')}</h3>
          {plan.subtitle && (
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{plan.subtitle}</p>
          )}
        </div>

        {/* Price block */}
        <div className="rounded-xl bg-muted/40 px-4 py-3.5">
          <div className="flex items-end gap-1.5">
            <span className="text-3xl font-bold text-primary tabular-nums">
              {fmtPrice(effectivePrice, status)}
            </span>
            <span className="text-sm text-muted-foreground pb-0.5">/ {duration}</span>
          </div>
          {hasDiscount && (
            <p className="text-xs text-muted-foreground line-through mt-1">
              {fmtPrice(Number(plan.price_amount || 0), status)}
            </p>
          )}
        </div>

        {/* Benefits */}
        <div className="space-y-2.5">
          <div className="flex items-start gap-2.5 text-sm">
            <div className="size-5 rounded-full bg-success/15 flex items-center justify-center shrink-0 mt-0.5">
              <Check className="size-3 text-success" />
            </div>
            <span>
              <span className="font-semibold">{benefit}</span>
              <span className="text-muted-foreground ml-1.5 text-xs">
                {isQuotaType ? t('额度') : t('请求次数')}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <div className="size-5 rounded-full bg-muted flex items-center justify-center shrink-0">
              <Clock className="size-3" />
            </div>
            <span>{t('有效期')} {duration}</span>
          </div>

          {plan.upgrade_group && (
            <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <div className="size-5 rounded-full bg-muted flex items-center justify-center shrink-0">
                <Layers className="size-3" />
              </div>
              <span>
                {t('升级分组')}: <span className="font-medium text-foreground">{plan.upgrade_group}</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* CTA */}
      <div className="px-6 pb-6 pt-0">
        <Button className="w-full group" disabled={disabled}>
          {disabled
            ? (saleSummary.soldOut ? t('已售罄') : t('已下架'))
            : (
              <span className="flex items-center gap-1.5">
                {t('立即订阅')}
                <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            )}
        </Button>
      </div>
    </motion.div>
  );
}

// ── Plans Tab ─────────────────────────────────────────────────────────────────

function PlansTab({ plans, loading, status }: {
  plans: SubscriptionPlan[];
  loading: boolean;
  status?: SystemStatus;
}) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-80 rounded-2xl" />)}
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <div className="size-16 rounded-2xl bg-muted flex items-center justify-center">
          <Package className="size-8 text-muted-foreground/40" />
        </div>
        <div>
          <p className="font-semibold text-foreground/70">{t('暂无可购买套餐')}</p>
          <p className="text-sm text-muted-foreground mt-1.5">{t('管理员暂未上架套餐，请稍后再试')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-amber-200/70 bg-amber-50/50 dark:border-amber-800/40 dark:bg-amber-950/20 px-4 py-3.5 text-sm text-amber-700 dark:text-amber-300">
        <Crown className="size-4 shrink-0 mt-0.5" />
        <span>{t('购买套餐后可在「我的订阅」页面查看权益进度与消耗记录。')}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {plans.map((plan, i) => (
          <PlanCard key={plan.id} plan={plan} status={status} index={i} />
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const { t } = useTranslation();
  const status = useSystemStatus();
  const [prices, setPrices] = useState<ModelPrice[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [groupRatio, setGroupRatio] = useState<Record<string, number>>({});
  const [usableGroup, setUsableGroup] = useState<Record<string, string>>({});
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [plansLoading, setPlansLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadPrices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/pricing');
      const data = res.data as {
        success: boolean;
        data: ModelPrice[];
        vendors?: Vendor[];
        group_ratio?: Record<string, number>;
        usable_group?: Record<string, string>;
      };
      if (data.success) {
        setPrices(data.data || []);
        setVendors(data.vendors || []);
        setGroupRatio(data.group_ratio || {});
        setUsableGroup(data.usable_group || {});
      }
    } catch {
      toast.error(t('加载价格失败'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadPlans = useCallback(async () => {
    setPlansLoading(true);
    try {
      const res = await API.get('/api/subscription/plans', { skipErrorHandler: true } as never);
      if (res.data?.success) {
        const wrappers: PlanWrapper[] = res.data.data || [];
        setPlans(wrappers.map((w) => w.plan).filter(Boolean) as SubscriptionPlan[]);
      }
    } catch { /* Plans are optional on the public pricing page */ }
    finally { setPlansLoading(false); }
  }, []);

  useEffect(() => {
    loadPrices();
    loadPlans();
  }, [loadPrices, loadPlans]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadPrices(), loadPlans()]);
    setRefreshing(false);
  };

  // Dynamic stat cards
  const vendorCount = useMemo(() => {
    const names = new Set(prices.map((p) => p.vendor_name).filter(Boolean));
    return names.size;
  }, [prices]);

  const usableGroupCount = useMemo(() => Object.keys(usableGroup).length, [usableGroup]);

  const activePlanCount = useMemo(
    () => plans.filter((p) => p.enabled && !p.sold_out).length,
    [plans],
  );

  const statCards = [
    {
      label: t('全部模型'),
      value: loading ? '—' : String(prices.length),
      sub: t('已上线模型总数'),
      accent: undefined,
    },
    {
      label: t('供应商'),
      value: loading ? '—' : String(vendorCount),
      sub: t('覆盖 AI 供应商数'),
      accent: 'text-blue-500',
    },
    {
      label: t('可用分组'),
      value: loading ? '—' : String(usableGroupCount),
      sub: t('当前可用分组数'),
      accent: 'text-emerald-500',
    },
    {
      label: t('可购套餐'),
      value: plansLoading ? '—' : String(activePlanCount),
      sub: t('当前在售套餐'),
      accent: 'text-primary',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-7">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <BarChart3 className="size-5 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{t('价格中心')}</h1>
          </div>
          <p className="text-sm text-muted-foreground pl-[52px]">
            {t('按供应商浏览模型定价，查看套餐方案')}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="cursor-pointer gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className={cn('size-4 transition-transform duration-500', (refreshing || loading) && 'animate-spin')} />
          {t('刷新')}
        </Button>
      </motion.div>

      {/* Stat cards */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.06 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      >
        {statCards.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 + 0.06 }}
          >
            <StatCard {...s} />
          </motion.div>
        ))}
      </motion.div>

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.12 }}
      >
        <Tabs defaultValue="models">
          <TabsList className="h-10 mb-6">
            <TabsTrigger value="models" className="gap-2 text-sm">
              <BarChart3 className="size-4" />
              {t('模型定价')}
              {!loading && (
                <span className="text-[10px] bg-muted rounded-full px-1.5 py-0.5 font-semibold">
                  {prices.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="plans" className="gap-2 text-sm">
              <Package className="size-4" />
              {t('套餐方案')}
              {!plansLoading && plans.length > 0 && (
                <span className="text-[10px] bg-muted rounded-full px-1.5 py-0.5 font-semibold">
                  {plans.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="models">
            <ModelPricingTab prices={prices} loading={loading} />
          </TabsContent>

          <TabsContent value="plans">
            <PlansTab plans={plans} loading={plansLoading} status={status} />
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}
