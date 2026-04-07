'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Users, Search, Trash2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { formatTimestamp, formatQuota } from '@/lib/utils';
import { useSystemStatus } from '@/context/status-context';
import { Pagination } from '@/components/ui/pagination';
import { toast } from 'sonner';
import type { User } from '@/types';

const ROLE_MAP: Record<number, { labelKey: string; variant: 'default' | 'secondary' | 'outline' }> = {
  1: { labelKey: '普通用户', variant: 'secondary' },
  10: { labelKey: '管理员', variant: 'default' },
  100: { labelKey: 'Root', variant: 'default' },
};

const STATUS_MAP: Record<number, { labelKey: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  1: { labelKey: '正常', variant: 'default' },
  2: { labelKey: '已封禁', variant: 'destructive' },
};

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

function UserManageContent() {
  const { t } = useTranslation();
  const status = useSystemStatus();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const PAGE_SIZE = 20;

  // Confirm delete dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const loadUsers = useCallback(async (pg: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        p: String(pg - 1),
        page_size: String(PAGE_SIZE),
      });
      if (search.trim()) params.set('keyword', search.trim());

      const url = search.trim()
        ? `/api/user/search?${params.toString()}`
        : `/api/user/?${params.toString()}`;
      const res = await API.get(url);
      const data = res.data as { success: boolean; data: { items: User[]; total: number } | User[] };
      if (data.success) {
        const payload = Array.isArray(data.data)
          ? { items: data.data as User[], total: (data.data as User[]).length }
          : (data.data as { items: User[]; total: number });
        setUsers(payload.items ?? []);
        setTotalItems(payload.total ?? 0);
      }
    } catch {
      toast.error(t('加载失败'));
    } finally {
      setLoading(false);
    }
  }, [search, t]);

  useEffect(() => {
    setCurrentPage(1);
    loadUsers(1);
  }, [search]);

  const handleToggleStatus = async (user: User) => {
    const action = user.status === 1 ? 'disable' : 'enable';
    try {
      const res = await API.post('/api/user/manage', { id: user.id, action });
      const data = res.data as { success: boolean; message?: string; data: User };
      if (data.success) {
        setUsers((prev) =>
          prev.map((u) => u.id === user.id ? { ...u, status: data.data?.status ?? (action === 'enable' ? 1 : 2) } : u)
        );
        toast.success(action === 'enable' ? t('已启用') : t('已封禁'));
      } else {
        toast.error(data.message || t('操作失败'));
      }
    } catch {
      toast.error(t('操作失败'));
    }
  };

  const requestDelete = (id: number) => {
    setConfirmId(id);
    setConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (confirmId === null) return;
    setConfirmLoading(true);
    try {
      const res = await API.post('/api/user/manage', { id: confirmId, action: 'delete' });
      const data = res.data as { success: boolean; message?: string };
      if (data.success) {
        setUsers((prev) => prev.filter((u) => u.id !== confirmId));
        toast.success(t('已删除'));
      } else {
        toast.error(data.message || t('删除失败'));
      }
    } catch {
      toast.error(t('删除失败'));
    } finally {
      setConfirmLoading(false);
      setConfirmOpen(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Users className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">{t('用户管理')}</h1>
            <p className="text-sm text-muted-foreground">{t('管理平台注册用户')}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() => loadUsers(currentPage)}
          disabled={loading}
        >
          <RefreshCw className={`size-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          {t('刷新')}
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder={t('搜索用户名...')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {/* Table card */}
      <Card className="shadow-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>{t('用户名')}</TableHead>
                <TableHead>{t('邮箱')}</TableHead>
                <TableHead>{t('角色')}</TableHead>
                <TableHead>{t('状态')}</TableHead>
                <TableHead>{t('分组')}</TableHead>
                <TableHead className="text-right">{t('余额')}</TableHead>
                <TableHead className="text-right">{t('已用')}</TableHead>
                <TableHead>{t('注册时间')}</TableHead>
                <TableHead>{t('操作')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <SkeletonRows cols={10} />
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Users className="size-8 opacity-25" />
                      <span className="text-sm">{t('暂无用户')}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => {
                  const roleInfo = ROLE_MAP[user.role] || { labelKey: String(user.role), variant: 'outline' as const };
                  const statusInfo = STATUS_MAP[user.status] || { labelKey: String(user.status), variant: 'outline' as const };
                  return (
                    <TableRow key={user.id} className="hover:bg-accent/60 dark:hover:bg-accent/40">
                      <TableCell className="text-sm text-muted-foreground">{user.id}</TableCell>
                      <TableCell className="font-medium">{user.username}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{user.email || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={roleInfo.variant}>{t(roleInfo.labelKey)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusInfo.variant}>{t(statusInfo.labelKey)}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{user.group || '-'}</TableCell>
                      <TableCell className="text-sm text-right">{formatQuota(user.quota, status)}</TableCell>
                      <TableCell className="text-sm text-right">{formatQuota(user.used_quota, status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {user.created_time ? formatTimestamp(user.created_time) : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleStatus(user)}
                            title={user.status === 1 ? t('封禁') : t('启用')}
                          >
                            <ShieldCheck className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => requestDelete(user.id)}
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
          <Pagination
            currentPage={currentPage}
            totalItems={totalItems}
            pageSize={PAGE_SIZE}
            onPageChange={(pg) => { setCurrentPage(pg); loadUsers(pg); }}
            disabled={loading}
            className="px-4 border-t"
          />
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
              {t('删除用户')}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground pt-1">
              {t('确认删除该用户？此操作不可恢复。')}
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
    </div>
  );
}

export default function UserPage() {
  return (
    <AuthGuard requireAdmin>
      <UserManageContent />
    </AuthGuard>
  );
}
