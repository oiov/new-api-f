'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, RefreshCw, Search, XCircle } from 'lucide-react';
import { AuthGuard } from '@/components/common/auth-guard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { API } from '@/lib/api';
import { formatQuota, formatTimestamp } from '@/lib/utils';
import { useSystemStatus } from '@/context/status-context';
import { toast } from 'sonner';
import { useIsAdmin } from '@/context/user-context';

interface ConversionRequest {
  id: number;
  user_id: number;
  username?: string;
  campaign_title?: string;
  status: 'pending' | 'approved' | 'rejected' | 'canceled';
  requested_ratio: number;
  requested_amount: number;
  requested_quota: number;
  approved_ratio: number;
  approved_amount: number;
  approved_quota: number;
  request_remark?: string;
  admin_remark?: string;
  create_time: number;
  update_time: number;
}

const STATUS_META: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: '待审核', variant: 'secondary' },
  approved: { label: '已批准', variant: 'default' },
  rejected: { label: '已拒绝', variant: 'destructive' },
  canceled: { label: '已取消', variant: 'outline' },
};

function AdminContent() {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();
  const status = useSystemStatus();

  const [items, setItems] = useState<ConversionRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [current, setCurrent] = useState<ConversionRequest | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approvedRatio, setApprovedRatio] = useState('1');
  const [approvedQuota, setApprovedQuota] = useState('');
  const [adminRemark, setAdminRemark] = useState('');
  const [rejectRemark, setRejectRemark] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/subscription/admin/conversion_requests', {
        params: {
          keyword: keyword.trim(),
          status: statusFilter === 'all' ? '' : statusFilter,
          p: 0,
          page_size: 50,
        },
      });
      if (res.data?.success) {
        setItems(res.data.data?.items || []);
      } else {
        toast.error(res.data?.message || t('加载失败'));
      }
    } catch {
      toast.error(t('加载失败'));
    } finally {
      setLoading(false);
    }
  }, [keyword, statusFilter, t]);

  useEffect(() => { if (isAdmin) loadData(); }, [isAdmin, loadData]);

  const openApprove = (item: ConversionRequest) => {
    setCurrent(item);
    setApprovedRatio(item.requested_ratio > 0 ? String(item.requested_ratio) : '1');
    setApprovedQuota(item.requested_quota > 0 ? String(item.requested_quota) : '');
    setAdminRemark(item.admin_remark || '');
    setApproveOpen(true);
  };

  const openReject = (item: ConversionRequest) => {
    setCurrent(item);
    setRejectRemark('');
    setRejectOpen(true);
  };

  const handleApprove = async () => {
    if (!current) return;
    setApproving(true);
    try {
      const res = await API.post(`/api/subscription/admin/conversion_requests/${current.id}/approve`, {
        approved_ratio: Number(approvedRatio || 0),
        approved_quota: Number(approvedQuota || 0),
        admin_remark: adminRemark,
      });
      if (res.data?.success) {
        toast.success(t('已批准并执行折算'));
        setApproveOpen(false);
        await loadData();
      } else {
        toast.error(res.data?.message || t('审批失败'));
      }
    } catch {
      toast.error(t('审批失败'));
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!current || !rejectRemark.trim()) {
      toast.error(t('请填写拒绝原因'));
      return;
    }
    setRejecting(true);
    try {
      const res = await API.post(`/api/subscription/admin/conversion_requests/${current.id}/reject`, {
        admin_remark: rejectRemark.trim(),
      });
      if (res.data?.success) {
        toast.success(t('已拒绝该申请'));
        setRejectOpen(false);
        await loadData();
      } else {
        toast.error(res.data?.message || t('操作失败'));
      }
    } catch {
      toast.error(t('操作失败'));
    } finally {
      setRejecting(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t('套餐转余额审核')}</h1>
          <p className="text-sm text-muted-foreground">{t('审核用户提交的套餐转余额申请，并可调整折算比例与最终到账余额。')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw className={`mr-2 size-4 ${loading ? 'animate-spin' : ''}`} />
          {t('刷新')}
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder={t('搜索用户名 / 用户ID / 申请ID')} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder={t('状态')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('全部状态')}</SelectItem>
                <SelectItem value="pending">{t('待审核')}</SelectItem>
                <SelectItem value="approved">{t('已批准')}</SelectItem>
                <SelectItem value="rejected">{t('已拒绝')}</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={loadData}>{t('查询')}</Button>
          </div>

          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>{t('用户')}</TableHead>
                  <TableHead>{t('状态')}</TableHead>
                  <TableHead>{t('申请返还')}</TableHead>
                  <TableHead>{t('批准返还')}</TableHead>
                  <TableHead>{t('申请时间')}</TableHead>
                  <TableHead>{t('操作')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const meta = STATUS_META[item.status] || STATUS_META.pending;
                  return (
                    <TableRow key={item.id}>
                      <TableCell>#{item.id}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{item.username || '-'}</p>
                          <p className="text-xs text-muted-foreground">UID {item.user_id}</p>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant={meta.variant}>{t(meta.label)}</Badge></TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p>{formatQuota(item.requested_quota, status)}</p>
                          <p className="text-xs text-muted-foreground">x{Number(item.requested_ratio || 1).toFixed(2)}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {item.status === 'approved'
                          ? <div className="space-y-1"><p>{formatQuota(item.approved_quota, status)}</p><p className="text-xs text-muted-foreground">x{Number(item.approved_ratio || 1).toFixed(2)}</p></div>
                          : '—'}
                      </TableCell>
                      <TableCell>{formatTimestamp(item.create_time, 'YYYY-MM-DD HH:mm')}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {item.status === 'pending' && (
                            <>
                              <Button size="sm" onClick={() => openApprove(item)}>
                                <CheckCircle2 className="mr-1 size-4" />
                                {t('批准')}
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => openReject(item)}>
                                <XCircle className="mr-1 size-4" />
                                {t('拒绝')}
                              </Button>
                            </>
                          )}
                          {item.status !== 'pending' && (
                            <span className="text-xs text-muted-foreground">{item.admin_remark || '—'}</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!items.length && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                      {loading ? t('加载中...') : t('暂无申请记录')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('批准转余额申请')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/40 p-3 text-sm">
              <p>{t('申请用户')}：{current?.username || '-'}</p>
              <p>{t('申请返还')}：{current ? formatQuota(current.requested_quota, status) : '—'}</p>
            </div>
            <div className="space-y-2">
              <Label>{t('批准比例')}</Label>
              <Input value={approvedRatio} onChange={(e) => setApprovedRatio(e.target.value)} placeholder="1.00" />
            </div>
            <div className="space-y-2">
              <Label>{t('最终增加余额额度')}</Label>
              <Input value={approvedQuota} onChange={(e) => setApprovedQuota(e.target.value)} placeholder={current ? String(current.requested_quota) : ''} />
            </div>
            <div className="space-y-2">
              <Label>{t('管理员备注')}</Label>
              <Textarea value={adminRemark} onChange={(e) => setAdminRemark(e.target.value)} rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>{t('取消')}</Button>
            <Button onClick={handleApprove} disabled={approving}>{approving ? t('处理中...') : t('确认批准')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('拒绝转余额申请')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{t('拒绝原因')}</Label>
            <Textarea value={rejectRemark} onChange={(e) => setRejectRemark(e.target.value)} rows={5} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>{t('取消')}</Button>
            <Button variant="destructive" onClick={handleReject} disabled={rejecting}>{rejecting ? t('处理中...') : t('确认拒绝')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function SubscriptionConversionAdminPage() {
  return (
    <AuthGuard>
      <AdminContent />
    </AuthGuard>
  );
}
