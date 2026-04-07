'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  CreditCard,
  Gift,
  RefreshCw,
  Wallet,
  CheckCircle,
  Clock,
  XCircle,
  ChevronDown,
  ChevronUp,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useUser, persistUser } from '@/context/user-context';
import { useSystemStatus } from '@/context/status-context';
import { API } from '@/lib/api';
import { formatQuota, formatTimestamp, getCurrencySymbol, formatTokensCompact, cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { User } from '@/types';

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface PayMethod {
  name: string;
  type: string;
  color?: string;
  min_topup?: string;
  icon?: string;
}

interface TopUpInfo {
  enable_online_topup: boolean;
  enable_stripe_topup: boolean;
  enable_creem_topup: boolean;
  enable_waffo_topup: boolean;
  pay_methods: PayMethod[];
  min_topup: number;
  stripe_min_topup: number;
  waffo_min_topup: number;
  amount_options: number[];
  discount: Record<number, number>;
}

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  pending: {
    label: '待支付',
    icon: Clock,
    className: 'bg-warning/10 text-warning border-warning/20',
  },
  success: {
    label: '已完成',
    icon: CheckCircle,
    className: 'bg-success/10 text-success border-success/20',
  },
  failed: {
    label: '已失败',
    icon: XCircle,
    className: 'bg-destructive/10 text-destructive border-destructive/20',
  },
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

// ─── Amount selector ──────────────────────────────────────────────────────────

function AmountSelector({
  options,
  discount,
  selected,
  onSelect,
  symbol,
  isTokens,
}: {
  options: number[];
  discount: Record<number, number>;
  selected: number | null;
  onSelect: (v: number) => void;
  symbol: string;
  isTokens: boolean;
}) {
  const { t } = useTranslation();

  if (options.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t('管理员未配置充值金额选项')}</p>
    );
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {options.map((opt) => {
        const disc = discount[opt];
        const isActive = selected === opt;
        return (
          <button
            key={opt}
            onClick={() => onSelect(opt)}
            className={cn(
              'relative rounded-xl border px-3 py-3 text-center transition-all duration-150 hover:border-primary/60',
              isActive
                ? 'border-primary bg-primary/5 ring-2 ring-primary ring-offset-1'
                : 'border-border/60 bg-card hover:bg-accent/30',
            )}
          >
            {disc && disc < 1 && (
              <span className="absolute -top-2 -right-1 text-[10px] font-bold bg-destructive text-destructive-foreground rounded-full px-1.5 py-0.5">
                {Math.round((1 - disc) * 100)}% OFF
              </span>
            )}
            {isTokens ? (
              <>
                <div className="text-base font-bold text-foreground">{opt.toLocaleString()}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{t('tokens')}</div>
              </>
            ) : (
              <div className="text-base font-bold text-foreground">{symbol}{opt}</div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Payment method selector ──────────────────────────────────────────────────

function PayMethodSelector({
  methods,
  selected,
  onSelect,
}: {
  methods: PayMethod[];
  selected: string;
  onSelect: (v: string) => void;
}) {
  if (methods.length === 0) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {methods.map((m) => {
        const isActive = selected === m.type;
        return (
          <button
            key={m.type}
            onClick={() => onSelect(m.type)}
            className={cn(
              'flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-all duration-150',
              isActive
                ? 'border-primary bg-primary/5 ring-2 ring-primary ring-offset-1'
                : 'border-border/60 bg-card hover:border-primary/40 hover:bg-accent/30',
            )}
          >
            <CreditCard className="size-4 text-muted-foreground shrink-0" />
            <span className="truncate">{m.name}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── TopUp history table ──────────────────────────────────────────────────────

function TopUpHistory({ symbol }: { symbol: string }) {
  const { t } = useTranslation();
  const [records, setRecords] = useState<TopUpRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expanded, setExpanded] = useState(true);

  // Filter states
  const [filterStatus, setFilterStatus] = useState<string>('success');
  const [filterMethod, setFilterMethod] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Pending filter values (applied on Search click)
  const [pendingStatus, setPendingStatus] = useState<string>('success');
  const [pendingMethod, setPendingMethod] = useState<string>('');
  const [pendingStart, setPendingStart] = useState<string>('');
  const [pendingEnd, setPendingEnd] = useState<string>('');

  const PAGE_SIZE = 10;

  const buildQuery = useCallback((currentPage: number, status: string, method: string, start: string, end: string) => {
    const params = new URLSearchParams();
    params.set('p', String(currentPage));
    params.set('page_size', String(PAGE_SIZE));
    if (status && status !== 'all') params.set('status', status);
    if (method.trim()) params.set('payment_method', method.trim());
    if (start) {
      const ts = Math.floor(new Date(start).getTime() / 1000);
      if (!isNaN(ts)) params.set('start_timestamp', String(ts));
    }
    if (end) {
      // end of day
      const ts = Math.floor(new Date(end + 'T23:59:59').getTime() / 1000);
      if (!isNaN(ts)) params.set('end_timestamp', String(ts));
    }
    return params.toString();
  }, []);

  const loadRecords = useCallback(async (
    currentPage = 1,
    status = filterStatus,
    method = filterMethod,
    start = startDate,
    end = endDate,
  ) => {
    if (currentPage === 1) setLoading(true); else setLoadingMore(true);
    try {
      const query = buildQuery(currentPage, status, method, start, end);
      const res = await API.get(`/api/user/topup/self?${query}`);
      const data = res.data as { success: boolean; data: { items: TopUpRecord[]; total: number } };
      if (data.success) {
        let items: TopUpRecord[] = data.data?.items || [];

        // Client-side filter as a safety net in case the backend ignores params
        if (status && status !== 'all') {
          items = items.filter((r) => r.status === status);
        }
        if (method.trim()) {
          items = items.filter((r) =>
            r.payment_method?.toLowerCase().includes(method.trim().toLowerCase())
          );
        }
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

  useEffect(() => { loadRecords(1, 'success', '', '', ''); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const applyFilters = () => {
    setFilterStatus(pendingStatus);
    setFilterMethod(pendingMethod);
    setStartDate(pendingStart);
    setEndDate(pendingEnd);
    setPage(1);
    loadRecords(1, pendingStatus, pendingMethod, pendingStart, pendingEnd);
  };

  const resetFilters = () => {
    setPendingStatus('success');
    setPendingMethod('');
    setPendingStart('');
    setPendingEnd('');
    setFilterStatus('success');
    setFilterMethod('');
    setStartDate('');
    setEndDate('');
    setPage(1);
    loadRecords(1, 'success', '', '', '');
  };

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
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
          {/* Filter bar */}
          <div className="px-4 pt-4 pb-3 border-b">
            <div className="flex flex-col sm:flex-row flex-wrap items-end gap-2">
              {/* Status filter */}
              <div className="flex flex-col gap-1 w-full sm:min-w-[110px] sm:w-auto">
                <label className="text-xs text-muted-foreground">{t('状态')}</label>
                <Select value={pendingStatus} onValueChange={setPendingStatus}>
                  <SelectTrigger className="h-8 text-xs w-full sm:w-auto">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('全部')}</SelectItem>
                    <SelectItem value="success">{t('已完成')}</SelectItem>
                    <SelectItem value="pending">{t('待支付')}</SelectItem>
                    <SelectItem value="failed">{t('已失败')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Payment method filter */}
              <div className="flex flex-col gap-1 w-full sm:min-w-[120px] sm:w-auto">
                <label className="text-xs text-muted-foreground">{t('支付方式')}</label>
                <Input
                  className="h-8 text-xs w-full sm:w-auto"
                  placeholder={t('全部')}
                  value={pendingMethod}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPendingMethod(e.target.value)}
                />
              </div>

              {/* Start date */}
              <div className="flex flex-col gap-1 w-full sm:min-w-[130px] sm:w-auto">
                <label className="text-xs text-muted-foreground">{t('开始日期')}</label>
                <Input
                  type="date"
                  className="h-8 text-xs w-full sm:w-auto"
                  value={pendingStart}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPendingStart(e.target.value)}
                />
              </div>

              {/* End date */}
              <div className="flex flex-col gap-1 w-full sm:min-w-[130px] sm:w-auto">
                <label className="text-xs text-muted-foreground">{t('结束日期')}</label>
                <Input
                  type="date"
                  className="h-8 text-xs w-full sm:w-auto"
                  value={pendingEnd}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPendingEnd(e.target.value)}
                />
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 sm:ml-auto w-full sm:w-auto">
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={resetFilters}>
                  {t('重置')}
                </Button>
                <Button size="sm" className="h-8 text-xs" onClick={applyFilters}>
                  <RefreshCw className="size-3 mr-1" />
                  {t('刷新')}
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
                ) : (
                  records.map((r) => (
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
                  ))
                )}
                {loadingMore && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-3 text-muted-foreground text-sm">
                      <RefreshCw className="size-4 animate-spin inline mr-2" />
                      {t('加载中...')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {hasMore && !loading && !loadingMore && records.length > 0 && (
              <div className="flex justify-center p-4 border-t">
                <Button variant="outline" size="sm" className="h-8" onClick={loadMore}>
                  {t('加载更多')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function TopUpContent() {
  const { t } = useTranslation();
  const { state: userState, dispatch } = useUser();
  const status = useSystemStatus();

  const [info, setInfo] = useState<TopUpInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(true);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [selectedMethod, setSelectedMethod] = useState('');
  const [paying, setPaying] = useState(false);

  const [redeemCode, setRedeemCode] = useState('');
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [refreshingUser, setRefreshingUser] = useState(false);

  const user = userState.user;
  const quota = user?.quota ?? 0;
  const symbol = getCurrencySymbol(status);
  const isTokens = status?.quota_display_type === 'TOKENS' || (!status?.quota_display_type && !status?.display_in_currency);

  const refreshUser = useCallback(async (silent = false) => {
    if (!silent) setRefreshingUser(true);
    try {
      const res = await API.get('/api/user/self');
      const data = res.data as { success: boolean; data: User };
      if (data.success) {
        persistUser(data.data);
        dispatch({ type: 'login', payload: data.data });
      }
    } catch { /* ignore */ }
    finally { setRefreshingUser(false); }
  }, [dispatch]);

  const loadInfo = useCallback(async () => {
    setInfoLoading(true);
    try {
      const res = await API.get('/api/user/topup/info');
      const data = res.data as { success: boolean; data: TopUpInfo };
      if (data.success && data.data) {
        setInfo(data.data);
        // Auto-select first method
        if (data.data.pay_methods?.length > 0 && !selectedMethod) {
          setSelectedMethod(data.data.pay_methods[0].type);
        }
        // Auto-select first amount option
        if (data.data.amount_options?.length > 0 && selectedAmount === null) {
          setSelectedAmount(data.data.amount_options[0]);
        }
      }
    } catch { /* ignore */ }
    finally { setInfoLoading(false); }
  }, [selectedMethod, selectedAmount]);

  useEffect(() => {
    refreshUser(true);
    loadInfo();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRedeem = async () => {
    if (!redeemCode.trim()) { toast.error(t('请输入兑换码')); return; }
    setRedeemLoading(true);
    try {
      const res = await API.post('/api/user/redeem', { key: redeemCode.trim() });
      const data = res.data as { success: boolean; message?: string };
      if (data.success) {
        toast.success(data.message || t('兑换成功'));
        setRedeemCode('');
        await refreshUser(true);
      } else {
        toast.error(data.message || t('兑换失败'));
      }
    } catch { toast.error(t('兑换失败')); }
    finally { setRedeemLoading(false); }
  };

  const handlePay = async () => {
    if (!selectedMethod) { toast.error(t('请选择支付方式')); return; }
    const amount = selectedAmount ?? 0;
    if (!amount || amount <= 0) { toast.error(t('请选择充值金额')); return; }

    if (info?.min_topup && amount < info.min_topup) {
      toast.error(`${t('最低充值额度为')} ${isTokens ? info.min_topup : `${symbol}${info.min_topup}`}`);
      return;
    }

    setPaying(true);
    try {
      const res = await API.post('/api/user/pay', {
        amount,
        payment_method: selectedMethod,
      });
      const data = res.data as { message: string; data?: Record<string, string>; url?: string };
      if (data.message === 'success') {
        if (data.data && Object.keys(data.data).length > 0) {
          // 易支付：构造表单 POST 到网关（data 和 url 同时存在，需先判断 data）
          const form = document.createElement('form');
          form.method = 'POST';
          form.action = data.url || '';
          if (!/Safari/.test(navigator.userAgent) || /Chrome/.test(navigator.userAgent)) form.target = '_blank';
          Object.entries(data.data).forEach(([key, val]) => {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = key;
            input.value = val;
            form.appendChild(input);
          });
          document.body.appendChild(form);
          form.submit();
          document.body.removeChild(form);
        } else if (data.url) {
          // Stripe / Creem 等直接跳转
          window.open(data.url, '_blank');
        }
        toast.success(t('正在跳转支付页面...'));
      } else {
        toast.error(typeof data.data === 'string' ? data.data : t('发起支付失败'));
      }
    } catch { toast.error(t('发起支付失败')); }
    finally { setPaying(false); }
  };

  const paymentEnabled = info && (
    info.enable_online_topup ||
    info.enable_stripe_topup ||
    info.enable_creem_topup ||
    info.enable_waffo_topup
  );

  return (
    <div className="space-y-6 pb-8">

      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-4">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Wallet className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">{t('充值兑换')}</h1>
            <p className="text-sm text-muted-foreground">{t('充值额度或使用兑换码')}</p>
          </div>
        </div>
      </motion.div>

      {/* Balance card */}
      <motion.div variants={itemVariants} initial="hidden" animate="show">
        <Card className="shadow-card overflow-hidden">
          <div className="relative px-5 py-5">
            {/* Background glow */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at 85% 50%, hsl(var(--primary) / 0.08) 0%, transparent 65%)' }}
              aria-hidden="true"
            />
            <div className="relative flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="size-1.5 rounded-full bg-success animate-pulse" aria-hidden="true" />
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('当前余额')}</p>
                </div>
                <p className="text-3xl font-bold tracking-tight text-foreground tabular-nums">
                  {formatQuota(quota, status)}
                </p>
                {status?.quota_display_type !== 'TOKENS' && (
                  <p className="text-xs font-mono text-muted-foreground mt-1 tabular-nums">
                    ≈ {formatTokensCompact(quota)} tokens
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1.5">{t('可用额度')}</p>
              </div>
              <div className="flex flex-col items-end gap-3">
                <div className="size-14 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 flex items-center justify-center">
                  <Wallet className="size-6 text-primary" />
                </div>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5"
                  onClick={() => refreshUser()} disabled={refreshingUser}>
                  <RefreshCw className={cn('size-3', refreshingUser && 'animate-spin')} />
                  {t('刷新')}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Payment system */}
      {infoLoading ? (
        <Card className="shadow-card">
          <CardContent className="pt-5 space-y-3">
            <Skeleton className="h-5 w-32" />
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
      ) : paymentEnabled ? (
        <motion.div variants={itemVariants} initial="hidden" animate="show">
          <Card className="shadow-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="size-4 text-primary" />
                {t('在线充值')}
              </CardTitle>
              <CardDescription>
                {info?.min_topup
                  ? `${t('最低充值')} ${isTokens ? `${info.min_topup} tokens` : `${symbol}${info.min_topup}`}`
                  : t('选择充值金额和支付方式')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Amount selection */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t('充值金额')}</Label>
                <AmountSelector
                  options={info?.amount_options || []}
                  discount={info?.discount || {}}
                  selected={selectedAmount}
                  onSelect={setSelectedAmount}
                  symbol={symbol}
                  isTokens={isTokens}
                />
              </div>

              {/* Payment method */}
              {info?.pay_methods && info.pay_methods.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t('支付方式')}</Label>
                  <PayMethodSelector
                    methods={info.pay_methods}
                    selected={selectedMethod}
                    onSelect={setSelectedMethod}
                  />
                </div>
              )}

              {/* Pay button */}
              <Button
                className="w-full h-11 text-sm gap-2 shadow-md shadow-primary/20"
                size="lg"
                onClick={handlePay}
                disabled={paying || !selectedAmount}
              >
                {paying ? (
                  <><RefreshCw className="size-4 animate-spin" />{t('处理中...')}</>
                ) : (
                  <><Zap className="size-4" />{t('立即充值')}</>
                )}
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      ) : null}

      {/* Redeem code */}
      <motion.div variants={itemVariants} initial="hidden" animate="show">
        <Card className="shadow-card">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Gift className="size-4 text-primary" />
              {t('兑换码充值')}
            </CardTitle>
            <CardDescription>{t('使用礼品兑换码兑换额度')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder={t('请输入兑换码')}
                value={redeemCode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRedeemCode(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleRedeem()}
                className="flex-1 h-9 font-mono"
              />
              <Button onClick={handleRedeem} disabled={redeemLoading} className="h-9 px-5">
                {redeemLoading ? <RefreshCw className="size-4 animate-spin" /> : t('兑换')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* TopUp history */}
      <motion.div variants={itemVariants} initial="hidden" animate="show">
        <TopUpHistory symbol={symbol} />
      </motion.div>
    </div>
  );
}

export default function TopUpPage() {
  return (
    <AuthGuard>
      <TopUpContent />
    </AuthGuard>
  );
}
