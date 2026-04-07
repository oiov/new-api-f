'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Filter, RotateCcw, Search } from 'lucide-react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui/pagination';
import { ScrollArea } from '@/components/ui/scroll-area';
import { API } from '@/lib/api';
import { renderQuota, formatTimestamp, cn } from '@/lib/utils';
import { toast } from 'sonner';

// ── helpers ────────────────────────────────────────────────────────────────

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

function getResourceType(planMeta: Record<number, { resource_type?: string }>, planId: number): 'quota' | 'request_count' {
  return planMeta[planId]?.resource_type === 'request_count' ? 'request_count' : 'quota';
}

function getTodayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
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

// ── types ──────────────────────────────────────────────────────────────────

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

export interface ConsumeLogsSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subscriptionId?: number;
  planId?: number;
  planOptions?: { label: string; value: number }[];
  planMeta?: Record<number, { resource_type?: string; title?: string }>;
}

// ── summary card ────────────────────────────────────────────────────────────

function SummaryCard({
  title, total, today, sevenDay, fmt,
}: {
  title: string; total: string; today: string; sevenDay: string; fmt?: (v: string) => string;
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

// ── main component ──────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export function ConsumeLogsSheet({
  open, onClose, title, subscriptionId, planId,
  planOptions = [], planMeta = {},
}: ConsumeLogsSheetProps) {
  const { t } = useTranslation();

  const [logs, setLogs] = useState<ConsumeLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<LogSummary>({});
  const [exporting, setExporting] = useState(false);

  // Filters
  const [filterSubId, setFilterSubId] = useState(subscriptionId ? String(subscriptionId) : '');
  const [filterPlanId, setFilterPlanId] = useState(planId ? String(planId) : 'all');
  const [startDt, setStartDt] = useState(toDatetimeLocal(getTodayStart()));
  const [endDt, setEndDt] = useState('');

  // Sync props on open
  useEffect(() => {
    if (open) {
      setFilterSubId(subscriptionId ? String(subscriptionId) : '');
      setFilterPlanId(planId ? String(planId) : 'all');
      setStartDt(toDatetimeLocal(getTodayStart()));
      setEndDt('');
      setPage(1);
    }
  }, [open, subscriptionId, planId]);

  const buildParams = useCallback((pg: number, pgSize = PAGE_SIZE) => {
    const params = new URLSearchParams({
      p: String(pg - 1),
      page_size: String(pgSize),
    });
    if (filterSubId.trim()) params.set('subscription_id', filterSubId.trim());
    if (filterPlanId && filterPlanId !== 'all') params.set('plan_id', filterPlanId);
    if (startDt) params.set('start_timestamp', String(fromDatetimeLocal(startDt)));
    if (endDt) params.set('end_timestamp', String(fromDatetimeLocal(endDt)));
    return params;
  }, [filterSubId, filterPlanId, startDt, endDt]);

  const loadLogs = useCallback(async (pg: number) => {
    setLoading(true);
    try {
      const res = await API.get(`/api/subscription/self/consume_logs?${buildParams(pg)}`);
      if (res.data?.success) {
        const d = res.data.data || {};
        setLogs(d.items || []);
        setTotal(d.total || 0);
        setSummary(d.summary || {});
        setPage(pg);
      } else {
        toast.error(res.data?.message || t('加载失败'));
      }
    } catch {
      toast.error(t('请求失败'));
    } finally {
      setLoading(false);
    }
  }, [buildParams, t]);

  useEffect(() => {
    if (open) loadLogs(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSearch = () => loadLogs(1);

  const handleReset = () => {
    setFilterSubId(subscriptionId ? String(subscriptionId) : '');
    setFilterPlanId(planId ? String(planId) : 'all');
    setStartDt(toDatetimeLocal(getTodayStart()));
    setEndDt('');
    setTimeout(() => loadLogs(1), 0);
  };

  // Quick date presets
  const applyPreset = (days: number) => {
    const end = Math.floor(Date.now() / 1000);
    const start = end - days * 86400;
    setStartDt(toDatetimeLocal(start));
    setEndDt(toDatetimeLocal(end));
  };

  // Export CSV
  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows: ConsumeLog[] = [];
      let pg = 1, fetchTotal = 0;
      do {
        const params = buildParams(pg, 100);
        const res = await API.get(`/api/subscription/self/consume_logs?${params}`);
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
          const rt = getResourceType(planMeta, pId);
          return [
            fmtTs(r.created_at), r.user_id, r.channel,
            other.subscription_id,
            (planMeta[pId]?.title || other.subscription_plan_title || (pId > 0 ? `#${pId}` : '-')),
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
      a.href = url; a.download = `consume-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click(); URL.revokeObjectURL(url);
      toast.success(t('导出成功'));
    } catch (e: unknown) {
      toast.error((e as Error)?.message || t('导出失败'));
    } finally {
      setExporting(false);
    }
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

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl p-0 flex flex-col"
      >
        {/* Header */}
        <SheetHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base">{title || t('订阅消耗记录')}</SheetTitle>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input
                  placeholder={t('订阅实例ID')}
                  value={filterSubId}
                  onChange={(e) => setFilterSubId(e.target.value)}
                  className="h-8 text-sm"
                />
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
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleReset}>
                  <RotateCcw className="size-3" />{t('重置')}
                </Button>
                <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSearch} disabled={loading}>
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
                    <TableHead className="text-xs w-20">{t('渠道')}</TableHead>
                    <TableHead className="text-xs">{t('订阅信息')}</TableHead>
                    <TableHead className="text-xs">{t('消耗')}</TableHead>
                    <TableHead className="text-xs hidden sm:table-cell">{t('请求ID')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        {[1, 2, 3, 4].map((j) => (
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
                      const rt = getResourceType(planMeta, pId);
                      const planTitle = String(planMeta[pId]?.title || other.subscription_plan_title || (pId > 0 ? `#${pId}` : '-'));
                      const consumed = Number(other.subscription_consumed || 0);
                      const remain = Number(other.subscription_remain ?? -1);
                      const tot = Number(other.subscription_total || 0);
                      return (
                        <TableRow key={log.id ?? idx} className="hover:bg-muted/30">
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {fmtTs(log.created_at)}
                          </TableCell>
                          <TableCell className="text-xs">
                            #{log.channel || '-'}
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="space-y-0.5">
                              <p className="text-muted-foreground">{t('订阅')}: #{subId > 0 ? subId : '-'}</p>
                              <p className="font-medium">{planTitle}</p>
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
                          <TableCell className="text-[10px] text-muted-foreground hidden sm:table-cell max-w-[120px] truncate">
                            {log.request_id || '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {total > PAGE_SIZE && (
              <Pagination
                currentPage={page}
                totalItems={total}
                pageSize={PAGE_SIZE}
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
