'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Cpu, Search, Plus, Trash2, Edit } from 'lucide-react';
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
import { AuthGuard } from '@/components/common/auth-guard';
import { API } from '@/lib/api';
import { toast } from 'sonner';

interface ModelInfo {
  id: string;
  name?: string;
  owned_by?: string;
  type?: string;
  quota_type?: number;
  model_ratio?: number;
  completion_ratio?: number;
  enable_groups?: string[];
  tags?: string[];
}

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
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

function ModelsContent() {
  const { t } = useTranslation();
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/models/');
      const data = res.data as { success: boolean; data: { items: ModelInfo[]; total: number } | ModelInfo[] };
      if (data.success) {
        setModels(Array.isArray(data.data) ? data.data : (data.data?.items || []));
      }
    } catch {
      toast.error(t('加载失败'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const filteredModels = models.filter(
    (m) => !search || m.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Cpu className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">{t('模型管理')}</h1>
            <p className="text-sm text-muted-foreground">{t('配置模型计费比率与可用分组')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-9" onClick={loadModels} disabled={loading}>
            <RefreshCw className={`size-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {t('刷新')}
          </Button>
          <Button size="sm" className="h-9">
            <Plus className="size-4 mr-2" />
            {t('添加模型')}
          </Button>
        </div>
      </div>

      {/* Search + count */}
      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder={t('搜索模型名称...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        {!loading && (
          <Badge variant="secondary" className="shrink-0">
            {filteredModels.length} {t('个模型')}
          </Badge>
        )}
      </div>

      {/* Table card */}
      <Card className="shadow-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('模型ID')}</TableHead>
                <TableHead>{t('类型')}</TableHead>
                <TableHead>{t('计费类型')}</TableHead>
                <TableHead className="text-right">{t('输入比率')}</TableHead>
                <TableHead className="text-right">{t('输出比率')}</TableHead>
                <TableHead>{t('可用分组')}</TableHead>
                <TableHead>{t('操作')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <SkeletonRows cols={7} />
              ) : filteredModels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Cpu className="size-8 opacity-25" />
                      <span className="text-sm">
                        {search ? t('未找到匹配模型') : t('暂无模型')}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredModels.map((model) => (
                  <TableRow key={model.id} className="hover:bg-accent/60 dark:hover:bg-accent/40">
                    <TableCell className="font-mono text-sm font-medium">{model.id}</TableCell>
                    <TableCell className="text-sm">{model.owned_by || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={model.quota_type === 0 ? 'default' : 'secondary'}>
                        {model.quota_type === 0 ? t('按量') : t('按次')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {model.model_ratio?.toFixed(6) ?? '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {model.model_ratio && model.completion_ratio
                        ? (model.model_ratio * model.completion_ratio).toFixed(6)
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(model.enable_groups || []).slice(0, 3).map((g) => (
                          <Badge key={g} variant="outline" className="text-xs">{g}</Badge>
                        ))}
                        {(model.enable_groups || []).length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{(model.enable_groups || []).length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm">
                          <Edit className="size-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ModelsPage() {
  return (
    <AuthGuard requireAdmin>
      <ModelsContent />
    </AuthGuard>
  );
}
