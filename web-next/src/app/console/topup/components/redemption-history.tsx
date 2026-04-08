'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Gift, Package, RefreshCw, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { API } from '@/lib/api';
import { formatTimestamp } from '@/lib/utils';
import { toast } from 'sonner';

interface RedemptionRecord {
  id: number;
  name: string;
  quota: number;
  redemption_type: string;
  subscription_plan_id: number;
  subscription_plan_title: string;
  redeemed_time: number;
}

const PAGE_SIZE = 10;

export function RedemptionHistory() {
  const { t } = useTranslation();
  const [records, setRecords]         = useState<RedemptionRecord[]>([]);
  const [loading, setLoading]         = useState(true);
  const [page, setPage]               = useState(1);
  const [hasMore, setHasMore]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expanded, setExpanded]       = useState(true);
  const [keyword, setKeyword]         = useState('');
  const [pendingKeyword, setPendingKeyword] = useState('');

  const loadRecords = useCallback(async (currentPage = 1, kw = keyword) => {
    if (currentPage === 1) setLoading(true); else setLoadingMore(true);
    try {
      const params = new URLSearchParams();
      params.set('p', String(currentPage));
      params.set('page_size', String(PAGE_SIZE));
      if (kw.trim()) params.set('keyword', kw.trim());
      const res = await API.get(`/api/user/redemption/history/self?${params}`);
      const data = res.data as { success: boolean; data: { items: RedemptionRecord[]; total: number } };
      if (data.success) {
        const items = data.data?.items || [];
        if (currentPage === 1) setRecords(items);
        else setRecords((prev) => [...prev, ...items]);
        setHasMore(items.length === PAGE_SIZE);
      }
    } catch {
      toast.error(t('加载兑换记录失败'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [t, keyword]);

  useEffect(() => { loadRecords(1, ''); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applySearch = () => {
    setKeyword(pendingKeyword);
    setPage(1);
    loadRecords(1, pendingKeyword);
  };

  const resetSearch = () => {
    setPendingKeyword(''); setKeyword('');
    setPage(1);
    loadRecords(1, '');
  };

  const loadMore = () => {
    const next = page + 1; setPage(next);
    loadRecords(next, keyword);
  };

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
      >
        <Gift className="size-3.5" />
        {t('兑换记录')}
        {expanded ? <ChevronUp className="size-3.5 ml-auto" /> : <ChevronDown className="size-3.5 ml-auto" />}
      </button>

      {expanded && (
        <Card className="shadow-card">
          <div className="px-4 pt-4 pb-3 border-b">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                className="h-8 text-xs flex-1"
                placeholder={t('搜索兑换码ID、套餐ID或兑换项')}
                value={pendingKeyword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPendingKeyword(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && applySearch()}
              />
              <div className="flex gap-2 sm:ml-0">
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={resetSearch}>
                  {t('重置')}
                </Button>
                <Button size="sm" className="h-8 text-xs" onClick={applySearch}>
                  <Search className="size-3 mr-1" />{t('搜索')}
                </Button>
              </div>
            </div>
          </div>

          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('兑换项')}</TableHead>
                  <TableHead>{t('类型')}</TableHead>
                  <TableHead>{t('兑换内容')}</TableHead>
                  <TableHead className="text-right">{t('兑换时间')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 4 }).map((__, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                      <Gift className="size-8 mx-auto mb-2 opacity-25" />
                      <p className="text-sm">{t('暂无兑换记录')}</p>
                    </TableCell>
                  </TableRow>
                ) : records.map((r) => (
                  <TableRow key={r.id} className="hover:bg-accent/60 dark:hover:bg-accent/40">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {r.redemption_type === 'subscription'
                          ? <Package className="size-3.5 text-muted-foreground shrink-0" />
                          : <Gift className="size-3.5 text-muted-foreground shrink-0" />
                        }
                        <span className="text-sm font-medium">{r.name || '-'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.redemption_type === 'subscription' ? (
                        <Badge className="bg-primary/10 text-primary border-primary/20 hover:opacity-100">
                          {t('套餐兑换')}
                        </Badge>
                      ) : (
                        <Badge className="bg-success/10 text-success border-success/20 hover:opacity-100">
                          {t('额度兑换')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.redemption_type === 'subscription'
                        ? (r.subscription_plan_title || `Plan #${r.subscription_plan_id}`)
                        : <span className="text-success font-medium">+{r.quota?.toLocaleString()}</span>
                      }
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground text-right whitespace-nowrap">
                      {formatTimestamp(r.redeemed_time)}
                    </TableCell>
                  </TableRow>
                ))}
                {loadingMore && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-3 text-muted-foreground text-sm">
                      <RefreshCw className="size-4 animate-spin inline mr-2" />{t('加载中...')}
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
