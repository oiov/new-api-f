'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Shield, Search } from 'lucide-react';
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
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { AuthGuard } from '@/components/common/auth-guard';
import { API } from '@/lib/api';
import { formatTimestamp } from '@/lib/utils';
import { Pagination } from '@/components/ui/pagination';
import { toast } from 'sonner';

interface AntiDistributionLog {
  id: number;
  created_at: number;
  layer: string;
  action: string;
  reason: string;
  request_host: string;
  origin_host: string;
  referer_host: string;
  method: string;
  path: string;
  client_ip: string;
  user_agent: string;
  request_id: string;
  matched_source: string;
}

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((__, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function ActionBadge({ action }: { action: string }) {
  const { t } = useTranslation();
  if (action === 'block') return <Badge variant="destructive">{t('已拦截')}</Badge>;
  if (action === 'log') return <Badge variant="outline">{t('仅记录')}</Badge>;
  return <Badge variant="secondary">{action}</Badge>;
}

function RiskControlContent() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<AntiDistributionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [layerFilter, setLayerFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const PAGE_SIZE = 20;

  const loadLogs = useCallback(async (pg: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        p: String(pg - 1),
        page_size: String(PAGE_SIZE),
      });
      if (actionFilter !== 'all') params.set('action', actionFilter);
      if (layerFilter !== 'all') params.set('layer', layerFilter);
      if (search.trim()) params.set('reason', search.trim());

      const res = await API.get(`/api/anti_distribution/logs?${params.toString()}`);
      const data = res.data as { success: boolean; data: { items: AntiDistributionLog[]; total: number } | AntiDistributionLog[] };
      if (data.success) {
        const payload = Array.isArray(data.data)
          ? { items: data.data as AntiDistributionLog[], total: (data.data as AntiDistributionLog[]).length }
          : (data.data as { items: AntiDistributionLog[]; total: number });
        setLogs(payload.items ?? []);
        setTotalItems(payload.total ?? 0);
      }
    } catch {
      toast.error(t('加载失败'));
    } finally {
      setLoading(false);
    }
  }, [search, actionFilter, layerFilter, t]);

  useEffect(() => {
    setCurrentPage(1);
    loadLogs(1);
  }, [search, actionFilter, layerFilter]);

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Shield className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">{t('反分发日志')}</h1>
            <p className="text-sm text-muted-foreground">{t('查看 API 分发拦截记录')}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() => loadLogs(currentPage)}
          disabled={loading}
        >
          <RefreshCw className={`size-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          {t('刷新')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder={t('搜索原因...')}
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            className="pl-9 w-48 h-9"
          />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-32 h-9 text-sm">
            <SelectValue placeholder={t('动作')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('全部动作')}</SelectItem>
            <SelectItem value="block">{t('已拦截')}</SelectItem>
            <SelectItem value="log">{t('仅记录')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={layerFilter} onValueChange={setLayerFilter}>
          <SelectTrigger className="w-32 h-9 text-sm">
            <SelectValue placeholder={t('层级')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('全部层级')}</SelectItem>
            <SelectItem value="request">Request</SelectItem>
            <SelectItem value="response">Response</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="shadow-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">ID</TableHead>
                <TableHead>{t('动作')}</TableHead>
                <TableHead>{t('原因')}</TableHead>
                <TableHead>{t('请求域名')}</TableHead>
                <TableHead>{t('来源 IP')}</TableHead>
                <TableHead>{t('路径')}</TableHead>
                <TableHead>{t('时间')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && logs.length === 0 ? (
                <SkeletonRows cols={7} />
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-14 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2.5">
                      <div className="size-12 rounded-full bg-muted flex items-center justify-center">
                        <Shield className="size-6 opacity-30" />
                      </div>
                      <p className="text-sm">{t('暂无反分发日志')}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id} className="hover:bg-accent/60 dark:hover:bg-accent/40">
                    <TableCell className="text-sm text-muted-foreground">{log.id}</TableCell>
                    <TableCell>
                      <ActionBadge action={log.action} />
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                        {log.reason || '-'}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm font-mono text-xs">
                      {log.request_host || '-'}
                    </TableCell>
                    <TableCell className="text-sm font-mono text-xs">
                      {log.client_ip || '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      <span className="font-mono text-xs">{log.method && log.path ? `${log.method} ${log.path}` : '-'}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {log.created_at ? formatTimestamp(log.created_at) : '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <Pagination
            currentPage={currentPage}
            totalItems={totalItems}
            pageSize={PAGE_SIZE}
            onPageChange={(pg) => { setCurrentPage(pg); loadLogs(pg); }}
            disabled={loading}
            className="px-4 border-t border-border/40"
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default function RiskControlPage() {
  return (
    <AuthGuard requireAdmin>
      <RiskControlContent />
    </AuthGuard>
  );
}
