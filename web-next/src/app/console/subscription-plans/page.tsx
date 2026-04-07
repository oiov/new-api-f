'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus, Pencil, RefreshCw, Package, Power, Search, FileText,
  MoreHorizontal, Filter, RotateCcw, Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Pagination } from '@/components/ui/pagination';
import { AuthGuard } from '@/components/common/auth-guard';
import { API } from '@/lib/api';
import { renderQuota, formatTimestamp, cn } from '@/lib/utils';
import { toast } from 'sonner';

// ── Types ────────────────────────────────────────────────────────────────────

interface SubscriptionPlan {
  id?: number;
  title?: string;
  subtitle?: string;
  price_amount?: number;
  discount_price_amount?: number;
  discount_deadline?: number;
  duration_unit?: string;
  duration_value?: number;
  custom_seconds?: number;
  quota_reset_period?: string;
  quota_reset_custom_seconds?: number;
  resource_type?: string;
  total_amount?: number;
  amount_total?: number;
  request_count_total?: number;
  max_purchase_per_user?: number;
  sale_limit_count?: number;
  sold_count?: number;
  remaining_sale_count?: number;
  sold_out?: boolean;
  upgrade_group?: string;
  sort_order?: number;
  stripe_price_id?: string;
  creem_product_id?: string;
  enabled?: boolean;
  updated_at?: number;
}

interface PlanWrapper { plan: SubscriptionPlan }

interface ConsumeLog {
  id?: number;
  created_at?: number;
  user_id?: number;
  channel?: number;
  request_id?: string;
  other?: unknown;
}

interface LogSummary {
  total_success_count?: number;
  today_success_count?: number;
  seven_day_success_count?: number;
  total_request_consumed?: number;
  today_request_consumed?: number;
  seven_day_request_consumed?: number;
  total_quota_consumed?: number;
  today_quota_consumed?: number;
  seven_day_quota_consumed?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function emptyPlan(): SubscriptionPlan {
  return {
    title: '', subtitle: '',
    price_amount: 0, discount_price_amount: 0, discount_deadline: 0,
    duration_unit: 'month', duration_value: 1, custom_seconds: 0,
    quota_reset_period: 'never', quota_reset_custom_seconds: 0,
    resource_type: 'quota', total_amount: 0, request_count_total: 0,
    max_purchase_per_user: 0, sale_limit_count: 0,
    upgrade_group: '', sort_order: 0,
    stripe_price_id: '', creem_product_id: '',
    enabled: true,
  };
}

function toDatetimeLocal(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(s: string): number {
  if (!s) return 0;
  return Math.floor(new Date(s).getTime() / 1000);
}

function getTodayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function parseOther(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  try { return JSON.parse(raw as string); } catch { return {}; }
}

function fmtTs(ts: number | undefined) {
  if (!ts) return '-';
  return formatTimestamp(ts, 'YYYY-MM-DD HH:mm:ss');
}

function fmtConsumed(value: number, resourceType: 'quota' | 'request_count') {
  if (value <= 0) return '-';
  return resourceType === 'request_count' ? String(value) : renderQuota(value);
}

function fmtDuration(plan: SubscriptionPlan, t: (k: string) => string): string {
  const unit = plan.duration_unit || 'month';
  const value = plan.duration_value || 1;
  if (unit === 'custom') {
    const s = plan.custom_seconds || 0;
    if (s >= 86400) return `${Math.floor(s / 86400)}${t('天')}`;
    if (s >= 3600) return `${Math.floor(s / 3600)}${t('小时')}`;
    return `${s}${t('秒')}`;
  }
  const labels: Record<string, string> = {
    year: t('年'), month: t('个月'), week: t('周'), day: t('天'), hour: t('小时'),
  };
  return `${value}${labels[unit] || unit}`;
}

function fmtBenefit(plan: SubscriptionPlan, t: (k: string) => string): string {
  if (plan.resource_type === 'request_count') {
    const n = Number(plan.request_count_total || 0);
    return n > 0 ? `${n} ${t('次')}` : t('不限次数');
  }
  const total = Number(plan.total_amount ?? plan.amount_total ?? 0);
  return total > 0 ? renderQuota(total) : t('不限额度');
}

function fmtReset(plan: SubscriptionPlan, t: (k: string) => string): string {
  const p = plan.quota_reset_period || 'never';
  if (p === 'never') return t('不重置');
  if (p === 'daily') return t('每天');
  if (p === 'weekly') return t('每周');
  if (p === 'monthly') return t('每月');
  if (p === 'custom') {
    const s = Number(plan.quota_reset_custom_seconds || 0);
    if (s >= 86400) return `${Math.floor(s / 86400)}${t('天')}`;
    if (s >= 3600) return `${Math.floor(s / 3600)}${t('小时')}`;
    return `${s}${t('秒')}`;
  }
  return t('不重置');
}

// ── Small UI helpers ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function FormRow({ label, children, required, hint }: {
  label: string; children: React.ReactNode; required?: boolean; hint?: string;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] sm:grid-cols-[160px_1fr] gap-3 items-start">
      <div className="pt-1.5">
        <Label className="text-sm text-muted-foreground leading-none">
          {label}{required && <span className="text-destructive ml-0.5">*</span>}
        </Label>
        {hint && <p className="text-[10px] text-muted-foreground/60 mt-0.5 leading-relaxed">{hint}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ── Admin Consume Logs Sheet ──────────────────────────────────────────────────

const LOG_PAGE_SIZE = 20;

interface AdminConsumeLogsSheetProps {
  open: boolean;
  onClose: () => void;
  planId?: number;
  planTitle?: string;
  plans: SubscriptionPlan[];
}

function SummaryCard({ title, total, today, sevenDay }: {
  title: string; total: string; today: string; sevenDay: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="text-lg font-bold mt-1.5">{total}</p>
      <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
        <span>{t('今天')}: {today}</span>
        <span>{t('近7日')}: {sevenDay}</span>
      </div>
    </div>
  );
}

function AdminConsumeLogsSheet({ open, onClose, planId, planTitle, plans }: AdminConsumeLogsSheetProps) {
  const { t } = useTranslation();

  const [logs, setLogs] = useState<ConsumeLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<LogSummary>({});
  const [exporting, setExporting] = useState(false);

  const [filterPlanId, setFilterPlanId] = useState(planId ? String(planId) : 'all');
  const [filterUserId, setFilterUserId] = useState('');
  const [filterSubId, setFilterSubId] = useState('');
  const [startDt, setStartDt] = useState(toDatetimeLocal(getTodayStart()));
  const [endDt, setEndDt] = useState('');

  useEffect(() => {
    if (open) {
      setFilterPlanId(planId ? String(planId) : 'all');
      setFilterUserId('');
      setFilterSubId('');
      setStartDt(toDatetimeLocal(getTodayStart()));
      setEndDt('');
      setPage(1);
    }
  }, [open, planId]);

  const buildParams = useCallback((pg: number, pgSize = LOG_PAGE_SIZE) => {
    const params = new URLSearchParams({ p: String(pg - 1), page_size: String(pgSize) });
    if (filterPlanId && filterPlanId !== 'all') params.set('plan_id', filterPlanId);
    if (filterUserId.trim()) params.set('user_id', filterUserId.trim());
    if (filterSubId.trim()) params.set('subscription_id', filterSubId.trim());
    if (startDt) params.set('start_timestamp', String(fromDatetimeLocal(startDt)));
    if (endDt) params.set('end_timestamp', String(fromDatetimeLocal(endDt)));
    return params;
  }, [filterPlanId, filterUserId, filterSubId, startDt, endDt]);

  const loadLogs = useCallback(async (pg: number) => {
    setLoading(true);
    try {
      const res = await API.get(`/api/subscription/admin/consume_logs?${buildParams(pg)}`);
      if (res.data?.success) {
        const d = res.data.data || {};
        setLogs(d.items || []);
        setTotal(d.total || 0);
        setSummary(d.summary || {});
        setPage(pg);
      } else {
        toast.error(res.data?.message || t('加载失败'));
      }
    } catch { toast.error(t('请求失败')); }
    finally { setLoading(false); }
  }, [buildParams, t]);

  useEffect(() => {
    if (open) loadLogs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const applyPreset = (days: number) => {
    const end = Math.floor(Date.now() / 1000);
    const start = end - days * 86400;
    setStartDt(toDatetimeLocal(start));
    setEndDt(toDatetimeLocal(end));
  };

  const planMetaRecord: Record<number, { resource_type?: string; title?: string }> = {};
  plans.forEach((p) => {
    if (p.id) planMetaRecord[p.id] = { resource_type: p.resource_type, title: p.title };
  });

  const getResourceType = (pId: number): 'quota' | 'request_count' =>
    planMetaRecord[pId]?.resource_type === 'request_count' ? 'request_count' : 'quota';

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows: ConsumeLog[] = [];
      let pg = 1, fetchTotal = 0;
      do {
        const params = buildParams(pg, 100);
        const res = await API.get(`/api/subscription/admin/consume_logs?${params}`);
        if (!res.data?.success) throw new Error(res.data?.message || t('导出失败'));
        const d = res.data.data || {};
        rows.push(...(d.items || []));
        fetchTotal = Number(d.total || 0);
        pg++;
        if ((d.items || []).length === 0) break;
      } while (rows.length < fetchTotal);

      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const headers = [t('时间'), 'user_id', 'channel_id', 'subscription_id', t('套餐'), t('资源类型'), t('本次消耗'), t('剩余'), t('总量'), 'request_id'];
      const lines = [
        headers.map(esc).join(','),
        ...rows.map((r) => {
          const other = parseOther(r.other);
          const pId = Number(other.subscription_plan_id || 0);
          const rt = getResourceType(pId);
          return [
            fmtTs(r.created_at), r.user_id, r.channel,
            other.subscription_id,
            (planMetaRecord[pId]?.title || other.subscription_plan_title || (pId > 0 ? `#${pId}` : '-')),
            rt,
            fmtConsumed(Number(other.subscription_consumed || 0), rt),
            fmtConsumed(Number(other.subscription_remain || 0), rt),
            fmtConsumed(Number(other.subscription_total || 0), rt),
            r.request_id,
          ].map(esc).join(',');
        }),
      ];

      const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `admin-consume-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click(); URL.revokeObjectURL(url);
      toast.success(t('导出成功'));
    } catch (e: unknown) {
      toast.error((e as Error)?.message || t('导出失败'));
    } finally { setExporting(false); }
  };

  const summaryCards = [
    {
      key: 'success', title: t('成功请求'),
      total: String(summary.total_success_count || 0),
      today: String(summary.today_success_count || 0),
      sevenDay: String(summary.seven_day_success_count || 0),
    },
    {
      key: 'req', title: t('按次消耗'),
      total: String(summary.total_request_consumed || 0),
      today: String(summary.today_request_consumed || 0),
      sevenDay: String(summary.seven_day_request_consumed || 0),
    },
    {
      key: 'quota', title: t('额度消耗'),
      total: renderQuota(Number(summary.total_quota_consumed || 0)),
      today: renderQuota(Number(summary.today_quota_consumed || 0)),
      sevenDay: renderQuota(Number(summary.seven_day_quota_consumed || 0)),
    },
  ];

  const planOptions = plans.filter((p) => p.id).map((p) => ({
    label: p.title || `#${p.id}`,
    value: p.id!,
  }));

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base">
              {planTitle ? `${t('消耗详情')} · ${planTitle}` : t('全部消耗详情')}
            </SheetTitle>
            <Button
              variant="outline" size="sm"
              onClick={exportCsv} disabled={exporting}
              className="h-7 text-xs gap-1.5 mr-6"
            >
              <Download className="size-3" />
              {t('导出 CSV')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('仅展示必要的 ID 与消耗数据')}</p>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-5 py-4 space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {summaryCards.map((c) => (
                <SummaryCard key={c.key} title={c.title} total={c.total} today={c.today} sevenDay={c.sevenDay} />
              ))}
            </div>

            {/* Filters */}
            <div className="rounded-xl border bg-muted/10 p-3 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Filter className="size-3" /> {t('筛选条件')}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Select value={filterPlanId} onValueChange={setFilterPlanId}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder={t('全部套餐')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('全部套餐')}</SelectItem>
                    {planOptions.map((p) => (
                      <SelectItem key={p.value} value={String(p.value)}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder={t('用户 ID')}
                  value={filterUserId}
                  onChange={(e) => setFilterUserId(e.target.value)}
                  className="h-8 text-sm"
                />
                <Input
                  placeholder={t('订阅实例ID')}
                  value={filterSubId}
                  onChange={(e) => setFilterSubId(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">{t('开始时间')}</p>
                  <Input
                    type="datetime-local"
                    value={startDt}
                    onChange={(e) => setStartDt(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">{t('结束时间')}</p>
                  <Input
                    type="datetime-local"
                    value={endDt}
                    onChange={(e) => setEndDt(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { label: t('今天'), days: 1 },
                  { label: t('近7天'), days: 7 },
                  { label: t('近30天'), days: 30 },
                ].map((p) => (
                  <Button
                    key={p.label} variant="outline" size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => applyPreset(p.days)}
                  >
                    {p.label}
                  </Button>
                ))}
                <div className="flex-1" />
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"
                  onClick={() => {
                    setFilterPlanId(planId ? String(planId) : 'all');
                    setFilterUserId('');
                    setFilterSubId('');
                    setStartDt(toDatetimeLocal(getTodayStart()));
                    setEndDt('');
                    setTimeout(() => loadLogs(1), 0);
                  }}>
                  <RotateCcw className="size-3" />{t('重置')}
                </Button>
                <Button size="sm" className="h-7 text-xs gap-1" onClick={() => loadLogs(1)} disabled={loading}>
                  <Search className="size-3" />{t('查询')}
                </Button>
              </div>
            </div>

            {/* Table */}
            <div className="rounded-xl border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-36">{t('时间')}</TableHead>
                    <TableHead className="text-xs w-16">{t('用户')}</TableHead>
                    <TableHead className="text-xs w-16">{t('渠道')}</TableHead>
                    <TableHead className="text-xs">{t('订阅信息')}</TableHead>
                    <TableHead className="text-xs">{t('消耗')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        {[1, 2, 3, 4, 5].map((j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-sm text-muted-foreground">
                        {t('暂无订阅消耗记录')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log, idx) => {
                      const other = parseOther(log.other);
                      const pId = Number(other.subscription_plan_id || 0);
                      const subId = Number(other.subscription_id || 0);
                      const rt = getResourceType(pId);
                      const planTitle2 = String(planMetaRecord[pId]?.title || other.subscription_plan_title || (pId > 0 ? `#${pId}` : '-'));
                      const consumed = Number(other.subscription_consumed || 0);
                      const remain = Number(other.subscription_remain ?? -1);
                      const tot = Number(other.subscription_total || 0);
                      return (
                        <TableRow key={log.id ?? idx} className="hover:bg-muted/30">
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {fmtTs(log.created_at)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            #{log.user_id || '-'}
                          </TableCell>
                          <TableCell className="text-xs">
                            #{log.channel || '-'}
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="space-y-0.5">
                              <p className="text-muted-foreground">{t('订阅')}: #{subId > 0 ? subId : '-'}</p>
                              <p className="font-medium">{planTitle2}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="space-y-0.5">
                              <p className={cn('font-medium', consumed > 0 && 'text-warning')}>
                                -{fmtConsumed(consumed, rt)}
                              </p>
                              {remain >= 0 && tot > 0 && (
                                <p className="text-muted-foreground">
                                  {fmtConsumed(remain, rt)} / {fmtConsumed(tot, rt)}
                                </p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {total > LOG_PAGE_SIZE && (
              <Pagination
                currentPage={page}
                totalItems={total}
                pageSize={LOG_PAGE_SIZE}
                onPageChange={(pg) => loadLogs(pg)}
                disabled={loading}
              />
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ── Plan form sheet ───────────────────────────────────────────────────────────

interface PlanFormSheetProps {
  open: boolean;
  onClose: () => void;
  initial: SubscriptionPlan | null;
  onSaved: () => void;
}

function PlanFormSheet({ open, onClose, initial, onSaved }: PlanFormSheetProps) {
  const { t } = useTranslation();
  const isNew = !initial?.id;
  const [form, setForm] = useState<SubscriptionPlan>(emptyPlan());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(initial ? { ...initial } : emptyPlan());
  }, [open, initial]);

  const set = (key: keyof SubscriptionPlan) => (val: unknown) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const setNum = (key: keyof SubscriptionPlan) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value === '' ? 0 : Number(e.target.value) }));

  const setStr = (key: keyof SubscriptionPlan) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSave = async () => {
    if (!form.title?.trim()) { toast.error(t('套餐名称不能为空')); return; }
    setSaving(true);
    try {
      const payload = { plan: form };
      const res = isNew
        ? await API.post('/api/subscription/admin/plans', payload)
        : await API.put(`/api/subscription/admin/plans/${initial!.id}`, payload);
      if (res.data?.success) {
        toast.success(isNew ? t('创建成功') : t('更新成功'));
        onSaved();
        onClose();
      } else {
        toast.error(res.data?.message || t('操作失败'));
      }
    } catch { toast.error(t('请求失败')); }
    finally { setSaving(false); }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <SheetTitle className="text-base">
            {isNew ? t('新增套餐') : `${t('编辑套餐')} · ${initial?.title || ''}`}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-5 py-4 space-y-5">

            {/* 基本信息 */}
            <Section title={t('基本信息')}>
              <FormRow label={t('套餐名称')} required>
                <Input value={form.title || ''} onChange={setStr('title')}
                  placeholder={t('如：专业版月套餐')} className="h-8 text-sm" />
              </FormRow>
              <FormRow label={t('套餐说明')}>
                <Textarea value={form.subtitle || ''} onChange={setStr('subtitle')}
                  placeholder={t('可选，展示给用户的说明文字')}
                  className="text-sm min-h-[64px] resize-none" />
              </FormRow>
              <FormRow label={t('状态')}>
                <div className="flex items-center gap-2 h-8">
                  <Switch checked={!!form.enabled} onCheckedChange={set('enabled')} />
                  <span className="text-sm text-muted-foreground">
                    {form.enabled ? t('上架中') : t('已下架')}
                  </span>
                </div>
              </FormRow>
              <FormRow label={t('排序权重')} hint={t('数值越小越靠前')}>
                <Input type="number" value={form.sort_order ?? 0} onChange={setNum('sort_order')}
                  className="h-8 text-sm w-24" />
              </FormRow>
            </Section>

            <Separator />

            {/* 价格与有效期 */}
            <Section title={t('价格与有效期')}>
              <FormRow label={t('售价（USD）')} required>
                <Input type="number" step="0.01" min={0}
                  value={form.price_amount ?? 0} onChange={setNum('price_amount')}
                  className="h-8 text-sm" />
              </FormRow>
              <FormRow label={t('折扣价（USD）')} hint={t('0 表示不启用折扣')}>
                <Input type="number" step="0.01" min={0}
                  value={form.discount_price_amount ?? 0} onChange={setNum('discount_price_amount')}
                  className="h-8 text-sm" />
              </FormRow>
              {Number(form.discount_price_amount || 0) > 0 && (
                <FormRow label={t('折扣截止时间')}>
                  <Input
                    type="datetime-local"
                    value={toDatetimeLocal(form.discount_deadline || 0)}
                    onChange={(e) => setForm((prev) => ({ ...prev, discount_deadline: fromDatetimeLocal(e.target.value) }))}
                    className="h-8 text-sm"
                  />
                </FormRow>
              )}
              <FormRow label={t('有效期')}>
                <div className="flex gap-2">
                  <Select value={form.duration_unit || 'month'} onValueChange={set('duration_unit')}>
                    <SelectTrigger className="h-8 text-sm w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hour">{t('小时')}</SelectItem>
                      <SelectItem value="day">{t('天')}</SelectItem>
                      <SelectItem value="week">{t('周')}</SelectItem>
                      <SelectItem value="month">{t('月')}</SelectItem>
                      <SelectItem value="year">{t('年')}</SelectItem>
                      <SelectItem value="custom">{t('自定义（秒）')}</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.duration_unit !== 'custom' ? (
                    <Input type="number" min={1}
                      value={form.duration_value ?? 1} onChange={setNum('duration_value')}
                      className="h-8 text-sm w-20" />
                  ) : (
                    <Input type="number" min={0}
                      value={form.custom_seconds ?? 0} onChange={setNum('custom_seconds')}
                      className="h-8 text-sm flex-1" placeholder={t('总秒数')} />
                  )}
                </div>
              </FormRow>
            </Section>

            <Separator />

            {/* 权益配置 */}
            <Section title={t('权益配置')}>
              <FormRow label={t('资源类型')}>
                <Select value={form.resource_type || 'quota'} onValueChange={set('resource_type')}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quota">{t('按额度（Token）')}</SelectItem>
                    <SelectItem value="request_count">{t('按次数（请求次数）')}</SelectItem>
                  </SelectContent>
                </Select>
              </FormRow>
              {form.resource_type === 'request_count' ? (
                <FormRow label={t('总次数')} hint={t('0 表示不限次数')}>
                  <Input type="number" min={0}
                    value={form.request_count_total ?? 0} onChange={setNum('request_count_total')}
                    className="h-8 text-sm" />
                </FormRow>
              ) : (
                <FormRow label={t('总额度')} hint={t('0 表示不限额度，单位同系统设置')}>
                  <Input type="number" min={0}
                    value={form.total_amount ?? (form.amount_total ?? 0)}
                    onChange={(e) => {
                      const v = e.target.value === '' ? 0 : Number(e.target.value);
                      setForm((prev) => ({ ...prev, total_amount: v, amount_total: v }));
                    }}
                    className="h-8 text-sm" />
                </FormRow>
              )}
              <FormRow label={t('重置周期')}>
                <div className="flex gap-2">
                  <Select value={form.quota_reset_period || 'never'} onValueChange={set('quota_reset_period')}>
                    <SelectTrigger className="h-8 text-sm w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="never">{t('不重置')}</SelectItem>
                      <SelectItem value="daily">{t('每天')}</SelectItem>
                      <SelectItem value="weekly">{t('每周')}</SelectItem>
                      <SelectItem value="monthly">{t('每月')}</SelectItem>
                      <SelectItem value="custom">{t('自定义（秒）')}</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.quota_reset_period === 'custom' && (
                    <Input type="number" min={0}
                      value={form.quota_reset_custom_seconds ?? 0}
                      onChange={setNum('quota_reset_custom_seconds')}
                      className="h-8 text-sm flex-1" placeholder={t('秒数')} />
                  )}
                </div>
              </FormRow>
            </Section>

            <Separator />

            {/* 销售规则 */}
            <Section title={t('销售规则')}>
              <FormRow label={t('每人限购')} hint={t('0 表示不限')}>
                <Input type="number" min={0}
                  value={form.max_purchase_per_user ?? 0} onChange={setNum('max_purchase_per_user')}
                  className="h-8 text-sm w-32" />
              </FormRow>
              <FormRow label={t('总销售上限')} hint={t('0 表示不限')}>
                <Input type="number" min={0}
                  value={form.sale_limit_count ?? 0} onChange={setNum('sale_limit_count')}
                  className="h-8 text-sm w-32" />
              </FormRow>
              <FormRow label={t('升级分组')} hint={t('相同分组内只能持有一个有效订阅')}>
                <Input value={form.upgrade_group || ''} onChange={setStr('upgrade_group')}
                  placeholder={t('如：pro（可选）')} className="h-8 text-sm" />
              </FormRow>
            </Section>

            <Separator />

            {/* 支付集成 */}
            <Section title={t('支付集成')}>
              <FormRow label="Stripe Price ID">
                <Input value={form.stripe_price_id || ''} onChange={setStr('stripe_price_id')}
                  placeholder="price_xxxxxxxxxxxxxxxxxx"
                  className="h-8 text-sm font-mono" />
              </FormRow>
              <FormRow label="Creem Product ID">
                <Input value={form.creem_product_id || ''} onChange={setStr('creem_product_id')}
                  placeholder="prod_xxxxxxxxxxxxxxxxxx"
                  className="h-8 text-sm font-mono" />
              </FormRow>
            </Section>

          </div>
        </ScrollArea>

        <div className="px-5 py-3 border-t shrink-0 flex justify-end gap-2 bg-muted/20">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>{t('取消')}</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving && <RefreshCw className="size-3.5 animate-spin mr-1.5" />}
            {isNew ? t('创建套餐') : t('保存修改')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Mobile plan card ──────────────────────────────────────────────────────────

function PlanCard({
  pw, onEdit, onToggle, onViewLogs, toggling,
}: {
  pw: PlanWrapper;
  onEdit: (p: SubscriptionPlan) => void;
  onToggle: (p: SubscriptionPlan) => void;
  onViewLogs: (p: SubscriptionPlan) => void;
  toggling: boolean;
}) {
  const { t } = useTranslation();
  const p = pw.plan || {};
  const hasDisc = Number(p.discount_price_amount || 0) > 0;
  const hasStripe = !!p.stripe_price_id;
  const hasCreem = !!p.creem_product_id;
  const saleLimit = Number(p.sale_limit_count || 0);
  const sold = Number(p.sold_count || 0);

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">#{p.id}</span>
            <Badge
              variant={p.enabled ? 'default' : 'secondary'}
              className={cn(
                'text-[10px] py-0 px-1.5 h-4',
                p.enabled && 'bg-success/15 text-success border-success/25',
              )}
            >
              {p.enabled ? t('上架') : t('下架')}
            </Badge>
          </div>
          <p className="font-semibold mt-1 truncate">{p.title || '-'}</p>
          {p.subtitle && <p className="text-xs text-muted-foreground truncate">{p.subtitle}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-base">${Number(p.price_amount || 0).toFixed(2)}</p>
          {hasDisc && (
            <p className="text-[11px] text-success">
              {t('折')} ${Number(p.discount_price_amount).toFixed(2)}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">{t('有效期')}</p>
          <p className="font-medium mt-0.5">{fmtDuration(p, t)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('权益')}</p>
          <p className="font-medium mt-0.5">{fmtBenefit(p, t)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('重置')}</p>
          <p className="font-medium mt-0.5">{fmtReset(p, t)}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {saleLimit > 0 ? (
          <span>{sold}/{saleLimit} {t('已售')}</span>
        ) : (
          <span>{sold} {t('已售')}</span>
        )}
        {(hasStripe || hasCreem) && (
          <>
            <span>·</span>
            {hasStripe && <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">Stripe</Badge>}
            {hasCreem && <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">Creem</Badge>}
          </>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1 border-t">
        <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => onEdit(p)}>
          <Pencil className="size-3 mr-1" />{t('编辑')}
        </Button>
        <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => onViewLogs(p)}>
          <FileText className="size-3 mr-1" />{t('消耗详情')}
        </Button>
        <Button
          variant={p.enabled ? 'outline' : 'default'}
          size="sm"
          className={cn('flex-1 h-7 text-xs', p.enabled && 'text-warning border-warning/30 hover:bg-warning/10')}
          onClick={() => onToggle(p)}
          disabled={toggling}
        >
          <Power className="size-3 mr-1" />
          {toggling ? t('处理中...') : p.enabled ? t('下架') : t('上架')}
        </Button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function SubscriptionPlansContent() {
  const { t } = useTranslation();
  const [plans, setPlans] = useState<PlanWrapper[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<Set<number>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SubscriptionPlan | null>(null);
  const [search, setSearch] = useState('');

  // Consume logs sheet
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsFilter, setLogsFilter] = useState<{ planId?: number; planTitle?: string }>({});

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/subscription/admin/plans');
      if (res.data?.success) {
        setPlans(res.data.data || []);
      } else {
        toast.error(res.data?.message || t('加载失败'));
      }
    } catch { toast.error(t('加载失败')); }
    finally { setLoading(false); }
  }, [t]);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  const handleToggle = async (plan: SubscriptionPlan) => {
    const id = plan.id!;
    const newEnabled = !plan.enabled;
    setToggling((prev) => new Set([...prev, id]));
    try {
      const res = await API.patch(`/api/subscription/admin/plans/${id}`, { enabled: newEnabled });
      if (res.data?.success) {
        toast.success(newEnabled ? t('已上架') : t('已下架'));
        setPlans((prev) => prev.map((pw) =>
          pw.plan?.id === id ? { plan: { ...pw.plan, enabled: newEnabled } } : pw,
        ));
      } else {
        toast.error(res.data?.message || t('操作失败'));
      }
    } catch { toast.error(t('操作失败')); }
    finally { setToggling((prev) => { const s = new Set(prev); s.delete(id); return s; }); }
  };

  const openCreate = () => { setEditTarget(null); setSheetOpen(true); };
  const openEdit = (plan: SubscriptionPlan) => { setEditTarget(plan); setSheetOpen(true); };
  const openLogs = (plan?: SubscriptionPlan) => {
    setLogsFilter(plan ? { planId: plan.id, planTitle: plan.title } : {});
    setLogsOpen(true);
  };

  const filtered = plans.filter((pw) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const p = pw.plan || {};
    return (
      String(p.id || '').includes(q) ||
      (p.title || '').toLowerCase().includes(q) ||
      (p.subtitle || '').toLowerCase().includes(q)
    );
  });

  const total = plans.length;
  const enabledCount = plans.filter((pw) => pw.plan?.enabled).length;
  const allPlans = plans.map((pw) => pw.plan || {});

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-gold/10 flex items-center justify-center shrink-0">
            <Package className="size-5 text-gold" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{t('套餐配置')}</h1>
            <p className="text-sm text-muted-foreground">{t('管理订阅套餐的创建、价格与上下架状态')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadPlans} disabled={loading} className="hidden sm:flex">
            <RefreshCw className={cn('size-4 mr-1.5', loading && 'animate-spin')} />
            {t('刷新')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => openLogs()} className="hidden sm:flex">
            <FileText className="size-4 mr-1.5" />
            {t('全部消耗')}
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4 mr-1.5" />
            <span className="hidden sm:inline">{t('新增套餐')}</span>
            <span className="sm:hidden">{t('新增')}</span>
          </Button>
        </div>
      </div>

      {/* Stats row */}
      {!loading && (
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>{t('共')} <strong className="text-foreground">{total}</strong> {t('个套餐')}</span>
          <span>·</span>
          <span className="text-success">
            <strong>{enabledCount}</strong> {t('上架中')}
          </span>
          <span>·</span>
          <span className="text-muted-foreground">
            <strong>{total - enabledCount}</strong> {t('已下架')}
          </span>
        </div>
      )}

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder={t('搜索套餐名称或 ID')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm pl-8"
          />
        </div>
        {/* Mobile buttons */}
        <Button variant="outline" size="sm" onClick={loadPlans} disabled={loading} className="sm:hidden">
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
        </Button>
        <Button variant="outline" size="sm" onClick={() => openLogs()} className="sm:hidden">
          <FileText className="size-4" />
        </Button>
      </div>

      {/* Mobile card grid */}
      <div className="md:hidden">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="size-14 rounded-2xl bg-muted flex items-center justify-center">
              <Package className="size-7 text-muted-foreground/40" />
            </div>
            <div>
              <p className="font-medium text-foreground/70">
                {search ? t('没有匹配的套餐') : t('暂无套餐')}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {search ? t('尝试修改搜索关键词') : t('点击「新增套餐」创建第一个订阅套餐')}
              </p>
            </div>
            {!search && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="size-4 mr-1.5" />{t('新增套餐')}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((pw) => (
              <PlanCard
                key={pw.plan?.id}
                pw={pw}
                onEdit={openEdit}
                onToggle={handleToggle}
                onViewLogs={openLogs}
                toggling={toggling.has(pw.plan?.id!)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Desktop table */}
      <Card className="border-0 shadow-sm overflow-hidden hidden md:block">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <div className="size-14 rounded-2xl bg-muted flex items-center justify-center">
                <Package className="size-7 text-muted-foreground/40" />
              </div>
              <div>
                <p className="font-medium text-foreground/70">
                  {search ? t('没有匹配的套餐') : t('暂无套餐')}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {search ? t('尝试修改搜索关键词') : t('点击「新增套餐」创建第一个订阅套餐')}
                </p>
              </div>
              {!search && (
                <Button size="sm" onClick={openCreate}>
                  <Plus className="size-4 mr-1.5" />{t('新增套餐')}
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs w-12">ID</TableHead>
                  <TableHead className="text-xs">{t('套餐名称')}</TableHead>
                  <TableHead className="text-xs">{t('价格')}</TableHead>
                  <TableHead className="text-xs">{t('有效期')}</TableHead>
                  <TableHead className="text-xs">{t('权益')}</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">{t('重置')}</TableHead>
                  <TableHead className="text-xs hidden xl:table-cell">{t('销售')}</TableHead>
                  <TableHead className="text-xs hidden xl:table-cell">{t('支付')}</TableHead>
                  <TableHead className="text-xs">{t('状态')}</TableHead>
                  <TableHead className="text-xs text-right w-24">{t('操作')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((pw) => {
                  const p = pw.plan || {};
                  const isToggling = toggling.has(p.id!);
                  const saleLimit = Number(p.sale_limit_count || 0);
                  const sold = Number(p.sold_count || 0);
                  const hasDisc = Number(p.discount_price_amount || 0) > 0;
                  const hasStripe = !!p.stripe_price_id;
                  const hasCreem = !!p.creem_product_id;

                  return (
                    <TableRow key={p.id} className="hover:bg-muted/30">
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        #{p.id}
                      </TableCell>
                      <TableCell className="max-w-[180px]">
                        <p className="text-sm font-medium truncate">{p.title || '-'}</p>
                        {p.subtitle && (
                          <p className="text-xs text-muted-foreground truncate">{p.subtitle}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-semibold">
                            ${Number(p.price_amount || 0).toFixed(2)}
                          </p>
                          {hasDisc && (
                            <p className="text-[11px] text-success">
                              {t('折')} ${Number(p.discount_price_amount).toFixed(2)}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{fmtDuration(p, t)}</TableCell>
                      <TableCell>
                        <p className="text-sm">{fmtBenefit(p, t)}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {p.resource_type === 'request_count' ? t('按次') : t('按额度')}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm hidden lg:table-cell">
                        {fmtReset(p, t)}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          {saleLimit > 0 ? (
                            <p>{sold}/{saleLimit} {t('已售')}</p>
                          ) : (
                            <p>{sold} {t('已售')}</p>
                          )}
                          {Number(p.max_purchase_per_user || 0) > 0 && (
                            <p>{t('限购')} {p.max_purchase_per_user}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {hasStripe && (
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">Stripe</Badge>
                          )}
                          {hasCreem && (
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">Creem</Badge>
                          )}
                          {!hasStripe && !hasCreem && (
                            <span className="text-xs text-muted-foreground">ePay</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={p.enabled ? 'default' : 'secondary'}
                          className={cn(
                            'text-[10px] py-0 px-1.5 h-4',
                            p.enabled && 'bg-success/15 text-success border-success/25',
                          )}
                        >
                          {p.enabled ? t('上架') : t('下架')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-7">
                              <MoreHorizontal className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-36">
                            <DropdownMenuItem onClick={() => openEdit(p)}>
                              <Pencil className="size-3.5 mr-2" />
                              {t('编辑')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openLogs(p)}>
                              <FileText className="size-3.5 mr-2" />
                              {t('消耗详情')}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleToggle(p)}
                              disabled={isToggling}
                              className={p.enabled
                                ? 'text-warning focus:text-warning'
                                : 'text-success focus:text-success'}
                            >
                              <Power className="size-3.5 mr-2" />
                              {isToggling
                                ? t('处理中...')
                                : p.enabled ? t('下架套餐') : t('上架套餐')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Form sheet */}
      <PlanFormSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        initial={editTarget}
        onSaved={loadPlans}
      />

      {/* Admin consume logs sheet */}
      <AdminConsumeLogsSheet
        open={logsOpen}
        onClose={() => setLogsOpen(false)}
        planId={logsFilter.planId}
        planTitle={logsFilter.planTitle}
        plans={allPlans}
      />
    </div>
  );
}

export default function SubscriptionPlansPage() {
  return (
    <AuthGuard requireAdmin>
      <SubscriptionPlansContent />
    </AuthGuard>
  );
}
