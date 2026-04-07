'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  FileText,
  RefreshCw,
  Search,
  Filter,
  TrendingUp,
  CreditCard,
  ArrowUpCircle,
  Settings,
  CalendarRange,
  Hash,
  X,
  Copy,
  CheckCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AuthGuard } from '@/components/common/auth-guard';
import { useSystemStatus } from '@/context/status-context';
import { API } from '@/lib/api';
import { formatTimestamp, formatQuota, formatTokensCompact, cn } from '@/lib/utils';
import { Pagination } from '@/components/ui/pagination';
import { toast } from 'sonner';
import type { UsageLog } from '@/types';

const containerVariants = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const itemVariants = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };

type TypeFilter = 'all' | '1' | '2' | '3';

interface LogPageInfo {
  page: number;
  page_size: number;
  total: number;
  items: UsageLog[];
}

const PAGE_SIZE = 50;

/** 将 date input 字符串（YYYY-MM-DD）转为 Unix 秒时间戳，end=true 时取当天末尾 */
function dateToTs(dateStr: string, end = false): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 0;
  if (end) d.setHours(23, 59, 59, 999);
  else d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

// ─── Stat filter card ─────────────────────────────────────────────────────────

function StatFilterCard({ label, value, icon: Icon, iconBg, iconColor, active, onClick }: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  active: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <motion.button
      variants={itemVariants}
      onClick={onClick}
      className={cn(
        'stat-card group cursor-pointer text-left w-full transition-all duration-150',
        active && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold mt-1 text-foreground">{value}</p>
        </div>
        <div className={cn('size-10 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110', iconBg)}>
          <Icon className={cn('size-5', iconColor)} />
        </div>
      </div>
      {active && (
        <div className="mt-2 flex items-center gap-1 text-xs text-primary font-medium">
          <Filter className="size-3" />
          {t('筛选中')}
        </div>
      )}
    </motion.button>
  );
}

// ─── Skeleton rows ────────────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: 8 }).map((__, j) => (
            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

// ─── Log type badge ───────────────────────────────────────────────────────────

function LogTypeBadge({ type }: { type: number }) {
  if (type === 1) {
    return (
      <Badge className="bg-success/10 text-success border-success/20 hover:bg-success/10">
        充值
      </Badge>
    );
  }
  if (type === 2) {
    return (
      <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
        消费
      </Badge>
    );
  }
  if (type === 3) {
    return (
      <Badge variant="outline">
        管理
      </Badge>
    );
  }
  return <Badge variant="secondary">{type}</Badge>;
}

// ─── Log detail dialog ────────────────────────────────────────────────────────

function CopyText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={copy}
      className="ml-1.5 inline-flex items-center text-muted-foreground hover:text-primary transition-colors"
      title="复制"
    >
      {copied ? <CheckCheck className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
    </button>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0">
      <span className="w-28 shrink-0 text-xs text-muted-foreground pt-0.5">{label}</span>
      <span className="flex-1 text-sm font-medium break-all">{children}</span>
    </div>
  );
}

function LogDetailDialog({
  log,
  open,
  onClose,
  status,
}: {
  log: UsageLog | null;
  open: boolean;
  onClose: () => void;
  status: ReturnType<typeof useSystemStatus>;
}) {
  const { t } = useTranslation();
  if (!log) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4 text-primary" />
            {t('日志详情')}
            <span className="text-xs text-muted-foreground font-normal ml-1">#{log.id}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="mt-1">
          <DetailRow label={t('时间')}>
            {formatTimestamp(log.created_at)}
          </DetailRow>
          <DetailRow label={t('类型')}>
            <LogTypeBadge type={log.type} />
          </DetailRow>
          <DetailRow label={t('令牌名称')}>
            {log.token_name || '-'}
          </DetailRow>
          <DetailRow label={t('模型')}>
            {log.model_name || '-'}
          </DetailRow>
          {log.channel_name && (
            <DetailRow label={t('渠道')}>
              {log.channel_name}
              {log.channel_id ? <span className="text-xs text-muted-foreground ml-1">(#{log.channel_id})</span> : null}
            </DetailRow>
          )}
          <DetailRow label={t('提示词 Token')}>
            {log.prompt_tokens ?? '-'}
          </DetailRow>
          <DetailRow label={t('补全 Token')}>
            {log.completion_tokens ?? '-'}
          </DetailRow>
          <DetailRow label={t('额度')}>
            <span>{formatQuota(log.quota, status)}</span>
            {status?.quota_display_type !== 'TOKENS' && log.quota > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground font-mono">({formatTokensCompact(log.quota)} tokens)</span>
            )}
          </DetailRow>
          {log.multiplier != null && log.multiplier !== 0 && (
            <DetailRow label={t('倍率')}>
              {log.multiplier}
            </DetailRow>
          )}
          {log.user_quota_after != null && (
            <DetailRow label={t('剩余额度')}>
              <span>{formatQuota(log.user_quota_after, status)}</span>
              {status?.quota_display_type !== 'TOKENS' && log.user_quota_after > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground font-mono">({formatTokensCompact(log.user_quota_after)} tokens)</span>
              )}
            </DetailRow>
          )}
          <DetailRow label={t('用时(s)')}>
            {log.use_time ? (log.use_time / 1000).toFixed(2) : '-'}
          </DetailRow>
          {log.elapsed_time != null && log.elapsed_time > 0 && (
            <DetailRow label={t('首字延迟(ms)')}>
              {log.elapsed_time}
            </DetailRow>
          )}
          <DetailRow label={t('流式')}>
            {log.is_stream ? t('是') : t('否')}
          </DetailRow>
          {log.ip && (
            <DetailRow label="IP">
              {log.ip}
            </DetailRow>
          )}
          {log.request_id && (
            <DetailRow label={t('请求 ID')}>
              <span className="font-mono text-xs">{log.request_id}</span>
              <CopyText text={log.request_id} />
            </DetailRow>
          )}
          {log.content && (
            <DetailRow label={t('内容')}>
              <span className="text-xs text-muted-foreground whitespace-pre-wrap">{log.content}</span>
            </DetailRow>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main content ─────────────────────────────────────────────────────────────

function LogContent() {
  const { t } = useTranslation();
  const status = useSystemStatus();

  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<UsageLog | null>(null);

  // Filter state
  const [modelName, setModelName] = useState('');
  const [tokenName, setTokenName] = useState('');
  const [requestId, setRequestId] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Type sub-counts derived from loaded items (approximate within loaded window)
  const consumeCount = logs.filter(l => l.type === 2).length;
  const rechargeCount = logs.filter(l => l.type === 1).length;
  const adminCount = logs.filter(l => l.type === 3).length;

  const buildParams = useCallback((currentPage: number) => {
    const params = new URLSearchParams({
      p: String(currentPage),
      page_size: String(PAGE_SIZE),
    });
    if (modelName) params.set('model_name', modelName);
    if (typeFilter !== 'all') params.set('type', typeFilter);
    if (tokenName) params.set('token_name', tokenName);
    if (requestId) params.set('request_id', requestId);
    const startTs = dateToTs(startDate, false);
    const endTs = dateToTs(endDate, true);
    if (startTs > 0) params.set('start_timestamp', String(startTs));
    if (endTs > 0) params.set('end_timestamp', String(endTs));
    return params;
  }, [modelName, typeFilter, tokenName, requestId, startDate, endDate]);

  const loadLogs = useCallback(async (pg: number) => {
    setLoading(true);
    try {
      const params = buildParams(pg);
      const res = await API.get(`/api/log/self?${params.toString()}`);
      const data = res.data as { success: boolean; data: LogPageInfo };
      if (data.success) {
        setLogs(data.data?.items || []);
        setTotal(data.data?.total ?? 0);
      } else {
        toast.error(t('加载日志失败'));
      }
    } catch {
      toast.error(t('加载日志失败'));
    } finally {
      setLoading(false);
    }
  }, [buildParams, t]);

  // Reset & reload on filter change
  useEffect(() => {
    setCurrentPage(1);
    loadLogs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelName, tokenName, requestId, typeFilter, startDate, endDate]);

  const handleRefresh = () => {
    loadLogs(currentPage);
  };

  const toggleCardFilter = (val: TypeFilter) => {
    setTypeFilter(prev => (prev === val ? 'all' : val));
  };

  const hasFilter = modelName !== '' || tokenName !== '' || requestId !== '' || typeFilter !== 'all' || startDate !== '' || endDate !== '';

  const clearFilters = () => {
    setModelName('');
    setTokenName('');
    setRequestId('');
    setTypeFilter('all');
    setStartDate('');
    setEndDate('');
  };

  return (
    <div className="space-y-6 pb-8">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-4">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <FileText className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">{t('使用日志')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('查看 API 调用和账户变动记录')}
              {total > 0 && !loading && (
                <span className="ml-2 text-xs text-primary font-medium">
                  共 {total.toLocaleString()} 条
                </span>
              )}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={handleRefresh}
          disabled={loading}
        >
          <RefreshCw className={cn('size-4 mr-2', loading && 'animate-spin')} />
          {t('刷新')}
        </Button>
      </motion.div>

      {/* Stat filter cards */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <StatFilterCard
          label={t('全部记录')}
          value={loading ? '—' : total.toLocaleString()}
          icon={TrendingUp}
          iconBg="bg-primary/10"
          iconColor="text-primary"
          active={typeFilter === 'all'}
          onClick={() => setTypeFilter('all')}
        />
        <StatFilterCard
          label={t('消费')}
          value={loading ? '—' : consumeCount}
          icon={CreditCard}
          iconBg="bg-primary/10"
          iconColor="text-primary"
          active={typeFilter === '2'}
          onClick={() => toggleCardFilter('2')}
        />
        <StatFilterCard
          label={t('充值')}
          value={loading ? '—' : rechargeCount}
          icon={ArrowUpCircle}
          iconBg="bg-success/10"
          iconColor="text-success"
          active={typeFilter === '1'}
          onClick={() => toggleCardFilter('1')}
        />
        <StatFilterCard
          label={t('管理')}
          value={loading ? '—' : adminCount}
          icon={Settings}
          iconBg="bg-violet-50 dark:bg-violet-900/20"
          iconColor="text-violet-600 dark:text-violet-400"
          active={typeFilter === '3'}
          onClick={() => toggleCardFilter('3')}
        />
      </motion.div>

      {/* Toolbar / filters */}
      <div className="space-y-2">
        {/* Row 1: search inputs + type select */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder={t('模型名称')}
              value={modelName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setModelName(e.target.value)}
              className="pl-9 w-44 h-9"
            />
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder={t('令牌名称')}
              value={tokenName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTokenName(e.target.value)}
              className="pl-9 w-44 h-9"
            />
          </div>
          <div className="relative">
            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder={t('请求 ID')}
              value={requestId}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRequestId(e.target.value)}
              className="pl-9 w-52 h-9 font-mono text-xs"
            />
          </div>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
            <SelectTrigger className="w-32 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('全部类型')}</SelectItem>
              <SelectItem value="1">{t('充值')}</SelectItem>
              <SelectItem value="2">{t('消费')}</SelectItem>
              <SelectItem value="3">{t('管理')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Row 2: date range */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarRange className="size-4" />
            <span className="text-xs">{t('时间范围')}</span>
          </div>
          <Input
            type="date"
            value={startDate}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStartDate(e.target.value)}
            className="w-40 h-9 text-sm"
            max={endDate || undefined}
          />
          <span className="text-muted-foreground text-sm">—</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEndDate(e.target.value)}
            className="w-40 h-9 text-sm"
            min={startDate || undefined}
          />
          {hasFilter && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1.5 text-muted-foreground"
              onClick={clearFilters}
            >
              <X className="size-3.5" />
              {t('清除筛选')}
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
      >
        <Card className="shadow-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('时间')}</TableHead>
                  <TableHead>{t('类型')}</TableHead>
                  <TableHead>{t('令牌')}</TableHead>
                  <TableHead>{t('模型')}</TableHead>
                  <TableHead className="text-right">{t('提示词 Token')}</TableHead>
                  <TableHead className="text-right">{t('补全 Token')}</TableHead>
                  <TableHead className="text-right">{t('额度')}</TableHead>
                  <TableHead className="text-right">{t('用时(s)')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <SkeletonRows />
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-14 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2.5">
                        <div className="size-12 rounded-full bg-muted flex items-center justify-center">
                          <FileText className="size-6 opacity-30" />
                        </div>
                        <p className="text-sm">{t('暂无日志')}</p>
                        {hasFilter && (
                          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs h-7">
                            {t('清除筛选条件')}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow
                      key={log.id}
                      className="hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => setSelectedLog(log)}
                    >
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatTimestamp(log.created_at)}
                      </TableCell>
                      <TableCell>
                        <LogTypeBadge type={log.type} />
                      </TableCell>
                      <TableCell className="text-sm">{log.token_name || '-'}</TableCell>
                      <TableCell className="text-sm">{log.model_name || '-'}</TableCell>
                      <TableCell className="text-sm text-right">{log.prompt_tokens ?? '-'}</TableCell>
                      <TableCell className="text-sm text-right">{log.completion_tokens ?? '-'}</TableCell>
                      <TableCell className="text-sm text-right">
                        <div>{formatQuota(log.quota, status)}</div>
                        {status?.quota_display_type !== 'TOKENS' && log.quota > 0 && (
                          <div className="text-xs text-muted-foreground font-mono">{formatTokensCompact(log.quota)}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-right">
                        {log.use_time ? (log.use_time / 1000).toFixed(2) : '-'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <Pagination
              currentPage={currentPage}
              totalItems={total}
              pageSize={PAGE_SIZE}
              onPageChange={(pg) => { setCurrentPage(pg); loadLogs(pg); }}
              disabled={loading}
              className="px-4 border-t"
            />
          </CardContent>
        </Card>
      </motion.div>

      <LogDetailDialog
        log={selectedLog}
        open={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        status={status}
      />
    </div>
  );
}

export default function LogPage() {
  return (
    <AuthGuard>
      <LogContent />
    </AuthGuard>
  );
}
