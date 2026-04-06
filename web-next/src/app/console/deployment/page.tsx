'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Server, Plus, Trash2, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
import { formatTimestamp } from '@/lib/utils';
import { toast } from 'sonner';

interface Deployment {
  id: number;
  name: string;
  model: string;
  status: number;
  channel_id: number;
  created_time: number;
  expire_time: number;
  endpoint: string;
  config: string;
}

const STATUS_MAP: Record<number, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  1: { label: '运行中', variant: 'default' },
  2: { label: '已停止', variant: 'secondary' },
  3: { label: '错误', variant: 'destructive' },
};

function DeploymentContent() {
  const { t } = useTranslation();
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDeployments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/deployments/');
      const data = res.data as { success: boolean; data: { items: Deployment[]; total: number } | Deployment[] };
      if (data.success) {
        setDeployments(Array.isArray(data.data) ? data.data : (data.data?.items || []));
      }
    } catch {
      toast.error(t('加载失败'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadDeployments();
  }, [loadDeployments]);

  const handleDelete = async (id: number) => {
    if (!confirm(t('确认删除该部署？'))) return;
    try {
      const res = await API.delete(`/api/deployments/${id}`);
      const data = res.data as { success: boolean };
      if (data.success) {
        setDeployments((prev) => prev.filter((d) => d.id !== id));
        toast.success(t('已删除'));
      }
    } catch {
      toast.error(t('删除失败'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Server className="size-6" />
          {t('模型部署')}
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadDeployments} disabled={loading}>
            <RefreshCw className={`size-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {t('刷新')}
          </Button>
          <Button size="sm">
            <Plus className="size-4 mr-2" />
            {t('创建部署')}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>{t('名称')}</TableHead>
                <TableHead>{t('模型')}</TableHead>
                <TableHead>{t('状态')}</TableHead>
                <TableHead>{t('渠道ID')}</TableHead>
                <TableHead>{t('创建时间')}</TableHead>
                <TableHead>{t('到期时间')}</TableHead>
                <TableHead>{t('操作')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    <RefreshCw className="size-5 animate-spin mx-auto mb-2" />
                    {t('加载中...')}
                  </TableCell>
                </TableRow>
              ) : deployments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    <Server className="size-8 mx-auto mb-2 opacity-30" />
                    {t('暂无部署')}
                  </TableCell>
                </TableRow>
              ) : (
                deployments.map((dep) => {
                  const statusInfo = STATUS_MAP[dep.status] || { label: String(dep.status), variant: 'outline' as const };
                  return (
                    <TableRow key={dep.id}>
                      <TableCell className="text-sm text-muted-foreground">{dep.id}</TableCell>
                      <TableCell className="font-medium">{dep.name}</TableCell>
                      <TableCell className="font-mono text-sm">{dep.model}</TableCell>
                      <TableCell>
                        <Badge variant={statusInfo.variant}>{t(statusInfo.label)}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{dep.channel_id}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {dep.created_time ? formatTimestamp(dep.created_time) : '-'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {dep.expire_time ? formatTimestamp(dep.expire_time) : t('永久')}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm">
                            <Edit className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(dep.id)}
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
        </CardContent>
      </Card>
    </div>
  );
}

export default function DeploymentPage() {
  return (
    <AuthGuard requireAdmin>
      <DeploymentContent />
    </AuthGuard>
  );
}
