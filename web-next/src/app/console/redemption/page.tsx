'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Gift, Plus, Trash2, Copy, Search, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AuthGuard } from '@/components/common/auth-guard';
import { API } from '@/lib/api';
import { formatTimestamp, formatQuota, copy as copyText } from '@/lib/utils';
import { useSystemStatus } from '@/context/status-context';
import { toast } from 'sonner';

interface Redemption {
  id: number;
  name: string;
  key: string;
  status: number;
  quota: number;
  created_time: number;
  redeemed_time: number;
  user_id: number;
}

const STATUS_MAP: Record<number, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  1: { label: '未使用', variant: 'default' },
  2: { label: '已使用', variant: 'secondary' },
  3: { label: '已禁用', variant: 'destructive' },
};

function RedemptionContent() {
  const { t } = useTranslation();
  const status = useSystemStatus();
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 20;

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', quota: '', count: '1' });

  // Confirm delete dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const loadRedemptions = useCallback(async (currentPage = 0, reset = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        p: String(currentPage),
        page_size: String(PAGE_SIZE),
      });
      if (search) params.set('keyword', search);

      const res = await API.get(`/api/redemption?${params.toString()}`);
      const data = res.data as { success: boolean; data: Redemption[] | { items: Redemption[] } };
      if (data.success) {
        const newItems = Array.isArray(data.data) ? data.data : ((data.data as { items: Redemption[] })?.items || []);
        if (reset) {
          setRedemptions(newItems);
        } else {
          setRedemptions((prev) => [...prev, ...newItems]);
        }
        setHasMore(newItems.length === PAGE_SIZE);
      }
    } catch {
      toast.error(t('加载失败'));
    } finally {
      setLoading(false);
    }
  }, [search, t]);

  useEffect(() => {
    setPage(0);
    loadRedemptions(0, true);
  }, [search]);

  const requestDelete = (id: number) => {
    setConfirmId(id);
    setConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (confirmId === null) return;
    setConfirmLoading(true);
    try {
      const res = await API.delete(`/api/redemption/${confirmId}`);
      const data = res.data as { success: boolean };
      if (data.success) {
        setRedemptions((prev) => prev.filter((r) => r.id !== confirmId));
        toast.success(t('已删除'));
      }
    } catch {
      toast.error(t('删除失败'));
    } finally {
      setConfirmLoading(false);
      setConfirmOpen(false);
    }
  };

  const handleCopy = async (key: string) => {
    const ok = await copyText(key);
    if (ok) toast.success(t('已复制'));
  };

  const handleCreate = async () => {
    const quota = Number(createForm.quota);
    const count = Number(createForm.count);
    if (!createForm.name.trim()) {
      toast.error(t('请输入名称'));
      return;
    }
    if (!quota || quota <= 0) {
      toast.error(t('请输入有效额度'));
      return;
    }
    if (!count || count <= 0) {
      toast.error(t('请输入有效数量'));
      return;
    }
    setCreating(true);
    try {
      const res = await API.post('/api/redemption', {
        name: createForm.name.trim(),
        quota,
        count,
      });
      const data = res.data as { success: boolean; message?: string };
      if (data.success) {
        toast.success(t('创建成功'));
        setCreateOpen(false);
        setCreateForm({ name: '', quota: '', count: '1' });
        setPage(0);
        loadRedemptions(0, true);
      } else {
        toast.error(data.message || t('创建失败'));
      }
    } catch {
      toast.error(t('创建失败'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Gift className="size-6" />
          {t('兑换码管理')}
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setPage(0); loadRedemptions(0, true); }} disabled={loading}>
            <RefreshCw className={`size-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {t('刷新')}
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4 mr-2" />
            {t('创建兑换码')}
          </Button>
        </div>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder={t('搜索名称...')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>{t('名称')}</TableHead>
                <TableHead>{t('兑换码')}</TableHead>
                <TableHead>{t('状态')}</TableHead>
                <TableHead className="text-right">{t('额度')}</TableHead>
                <TableHead>{t('创建时间')}</TableHead>
                <TableHead>{t('使用时间')}</TableHead>
                <TableHead>{t('操作')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && redemptions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    <RefreshCw className="size-5 animate-spin mx-auto mb-2" />
                    {t('加载中...')}
                  </TableCell>
                </TableRow>
              ) : redemptions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    <Gift className="size-8 mx-auto mb-2 opacity-30" />
                    {t('暂无兑换码')}
                  </TableCell>
                </TableRow>
              ) : (
                redemptions.map((item) => {
                  const statusInfo = STATUS_MAP[item.status] || { label: String(item.status), variant: 'outline' as const };
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="text-sm text-muted-foreground">{item.id}</TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>
                        <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">
                          {item.key}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusInfo.variant}>{t(statusInfo.label)}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-right">{formatQuota(item.quota, status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {item.created_time ? formatTimestamp(item.created_time) : '-'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {item.redeemed_time ? formatTimestamp(item.redeemed_time) : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopy(item.key)}
                            title={t('复制')}
                          >
                            <Copy className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => requestDelete(item.id)}
                            title={t('删除')}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          {hasMore && !loading && redemptions.length > 0 && (
            <div className="flex justify-center p-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  const nextPage = page + 1;
                  setPage(nextPage);
                  loadRedemptions(nextPage);
                }}
              >
                {t('加载更多')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirm delete dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="size-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="size-4 text-destructive" />
              </div>
              {t('删除兑换码')}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground pt-1">
              {t('确认删除该兑换码？')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={confirmLoading}>
              {t('取消')}
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={confirmLoading} className="min-w-[72px]">
              {confirmLoading ? <RefreshCw className="size-4 animate-spin" /> : t('确认删除')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('创建兑换码')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="rc-name">{t('名称')}</Label>
              <Input
                id="rc-name"
                placeholder={t('请输入名称')}
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rc-quota">{t('额度')}</Label>
              <Input
                id="rc-quota"
                type="number"
                min={1}
                placeholder={t('请输入额度')}
                value={createForm.quota}
                onChange={(e) => setCreateForm((f) => ({ ...f, quota: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rc-count">{t('生成数量')}</Label>
              <Input
                id="rc-count"
                type="number"
                min={1}
                placeholder="1"
                value={createForm.count}
                onChange={(e) => setCreateForm((f) => ({ ...f, count: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              {t('取消')}
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? <RefreshCw className="size-4 mr-2 animate-spin" /> : null}
              {t('创建')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function RedemptionPage() {
  return (
    <AuthGuard requireAdmin>
      <RedemptionContent />
    </AuthGuard>
  );
}
