'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Clock, CheckCircle, XCircle, RefreshCw, ChevronDown, ChevronUp, CreditCard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { API } from '@/lib/api';
import { formatTimestamp, cn } from '@/lib/utils';
import { toast } from 'sonner';

interface TopUpRecord {
  id: number;
  user_id: number;
  amount: number;
  money: number;
  trade_no: string;
  payment_method: string;
  create_time: number;
  status: string;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  pending: { label: '待支付', icon: Clock,        className: 'bg-warning/10 text-warning border-warning/20' },
  success: { label: '已完成', icon: CheckCircle,  className: 'bg-success/10 text-success border-success/20' },
  failed:  { label: '已失败', icon: XCircle,      className: 'bg-destructive/10 text-destructive border-destructive/20' },
};

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <Badge className={cn('hover:opacity-100', cfg.className)}>
      <Icon className="size-3 mr-1" />
      {t(cfg.label)}
    </Badge>
  );
}

const PAGE_SIZE = 10;

export function TopUpHistory({ symbol }: { symbol: string }) {
  const { t } = useTranslation();
  const [records, setRecords]         = useState<TopUpRecord[]>([]);
  const [loading, setLoading]         = useState(true);
  const [page, setPage]               = useState(1);
  const [hasMore, setHasMore]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expanded, setExpanded]       = useState(true);

  const [filterStatus, setFilterStatus]   = useState('success');
  const [filterMethod, setFilterMethod]   = useState('');
  const [startDate, setStartDate]         = useState('');
  const [endDate, setEndDate]             = useState('');
  const [pendingStatus, setPendingStatus] = useState('success');
  const [pendingMethod, setPendingMethod] = useState('');
  const [pendingStart, setPendingStart]   = useState('');
  const [pendingEnd, setPendingEnd]       = useState('');

  const buildQuery = useCallback((p: number, status: string, method: string, start: string, end: string) => {
    const params = new URLSearchParams();
    params.set('p', String(p));
    params.set('page_size', String(PAGE_SIZE));
    if (status && status !== 'all') params.set('status', status);
    if (method.trim()) params.set('keyword', method.trim());
    if (start) {
      const ts = Math.floor(new Date(start).getTime() / 1000);
      if (!isNaN(ts)) params.set('start_timestamp', String(ts));
    }
    if (end) {
      const ts = Math.floor(new Date(end + 'T23:59:59').getTime() / 1000);
      if (!isNaN(ts)) params.set('end_timestamp', String(ts));
    }
    return params.toString();
  }, []);

  const loadRecords = useCallback(async (
    currentPage = 1, status = filterStatus, method = filterMethod,
    start = startDate, end = endDate,
  ) => {
    if (currentPage === 1) setLoading(true); else setLoadingMore(true);
    try {
      const query = buildQuery(currentPage, status, method, start, end);
      const res = await API.get(`/api/user/topup/self?${query}`);
      const data = res.data as { success: boolean; data: { items: TopUpRecord[]; total: number } };
      if (data.success) {
        let items: TopUpRecord[] = data.data?.items || [];
        // Client-side safety-net filter
        if (status && status !== 'all') items = items.filter((r) => r.status === status);
        if (method.trim()) items = items.filter((r) =>
          r.payment_method?.toLowerCase().includes(method.trim().toLowerCase()));
        if (start) {
          const ts = Math.floor(new Date(start).getTime() / 1000);
          if (!isNaN(ts)) items = items.filter((r) => r.create_time >= ts);
        }
        if (end) {
          const ts = Math.floor(new Date(end + 'T23:59:59').getTime() / 1000);
          if (!isNaN(ts)) items = items.filter((r) => r.create_time <= ts);
        }
        if (currentPage === 1) setRecords(items);
        else setRecords((prev) => [...prev, ...items]);
        setHasMore((data.data?.items || []).length === PAGE_SIZE);
      }
    } catch {
      toast.error(t('加载充值记录失败'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [t, filterStatus, filterMethod, startDate, endDate, buildQuery]);

  useEffect(() => { loadRecords(1, 'success', '', '', ''); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applyFilters = () => {
    setFilterStatus(pendingStatus); setFilterMethod(pendingMethod);
    setStartDate(pendingStart); setEndDate(pendingEnd);
    setPage(1);
    loadRecords(1, pendingStatus, pendingMethod, pendingStart, pendingEnd);
  };

  const resetFilters = () => {
    setPendingStatus('success'); setPendingMethod(''); setPendingStart(''); setPendingEnd('');
    setFilterStatus('success'); setFilterMethod(''); setStartDate(''); setEndDate('');
    setPage(1);
    loadRecords(1, 'success', '', '', '');
  };

  const loadMore = () => {
    const next = page + 1; setPage(next);
    loadRecords(next, filterStatus, filterMethod, startDate, endDate);
  };

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
      >
        <Clock className="size-3.5" />
        {t('充值记录')}
        {expanded ? <ChevronUp className="size-3.5 ml-auto" /> : <ChevronDown className="size-3.5 ml-auto" />}
      </button>

      {expanded && (
        <Card className="shadow-card">
          <div className="px-4 pt-4 pb-3 border-b">
            <div className="flex flex-col sm:flex-row flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1 w-full sm:min-w-[110px] sm:w-auto">
                <label className="text-xs text-muted-foreground">{t('状态')}</label>
                <Select value={pendingStatus} onValueChange={setPendingStatus}>
                  <SelectTrigger className="h-8 text-xs w-full sm:w-auto"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('全部')}</SelectItem>
                    <SelectItem value="success">{t('已完成')}</SelectItem>
                    <SelectItem value="pending">{t('待支付')}</SelectItem>
                    <SelectItem value="failed">{t('已失败')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1 w-full sm:min-w-[120px] sm:w-auto">
                <label className="text-xs text-muted-foreground">{t('支付方式')}</label>
                <Input className="h-8 text-xs" placeholder={t('全部')}
                  value={pendingMethod}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPendingMethod(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1 w-full sm:min-w-[130px] sm:w-auto">
                <label className="text-xs text-muted-foreground">{t('开始日期')}</label>
                <Input type="date" className="h-8 text-xs" value={pendingStart}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPendingStart(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1 w-full sm:min-w-[130px] sm:w-auto">
                <label className="text-xs text-muted-foreground">{t('结束日期')}</label>
                <Input type="date" className="h-8 text-xs" value={pendingEnd}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPendingEnd(e.target.value)} />
              </div>
              <div className="flex gap-2 sm:ml-auto w-full sm:w-auto">
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={resetFilters}>{t('重置')}</Button>
                <Button size="sm" className="h-8 text-xs" onClick={applyFilters}>
                  <RefreshCw className="size-3 mr-1" />{t('刷新')}
                </Button>
              </div>
            </div>
          </div>

          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('时间')}</TableHead>
                  <TableHead>{t('订单号')}</TableHead>
                  <TableHead>{t('支付方式')}</TableHead>
                  <TableHead className="text-right">{t('金额')}</TableHead>
                  <TableHead className="text-right">{t('额度')}</TableHead>
                  <TableHead>{t('状态')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                      <CreditCard className="size-8 mx-auto mb-2 opacity-25" />
                      <p className="text-sm">{t('暂无充值记录')}</p>
                    </TableCell>
                  </TableRow>
                ) : records.map((r) => (
                  <TableRow key={r.id} className="hover:bg-accent/60 dark:hover:bg-accent/40">
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatTimestamp(r.create_time)}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground max-w-[120px] truncate">
                      {r.trade_no}
                    </TableCell>
                    <TableCell className="text-sm capitalize">{r.payment_method || '-'}</TableCell>
                    <TableCell className="text-sm text-right font-medium">
                      {symbol}{r.money?.toFixed(2) ?? '-'}
                    </TableCell>
                    <TableCell className="text-sm text-right text-primary font-medium">
                      +{r.amount?.toLocaleString()}
                    </TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                  </TableRow>
                ))}
                {loadingMore && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-3 text-muted-foreground text-sm">
                      <RefreshCw className="size-4 animate-spin inline mr-2" />{t('加载中...')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {hasMore && !loading && !loadingMore && records.length > 0 && (
              <div className="flex justify-center p-4 border-t">
                <Button variant="outline" size="sm" className="h-8" onClick={loadMore}>{t('加载更多')}</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
