'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Image, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AuthGuard } from '@/components/common/auth-guard';
import { API } from '@/lib/api';
import { formatTimestamp } from '@/lib/utils';
import { toast } from 'sonner';

interface MjLog {
  id: string;
  action: string;
  status: string;
  prompt: string;
  image_url: string;
  fail_reason: string;
  submit_time: number;
  start_time: number;
  finish_time: number;
  progress: string;
  channel_id: number;
}

const MJ_ACTIONS: Record<string, string> = {
  IMAGINE: '绘图',
  UPSCALE: '放大',
  VARIATION: '变体',
  REROLL: '重绘',
  DESCRIBE: '描述',
  BLEND: '混合',
  INPAINT: '局部重绘',
  ZOOM_OUT: '缩小',
  PAN_LEFT: '左移',
  PAN_RIGHT: '右移',
  PAN_UP: '上移',
  PAN_DOWN: '下移',
  FACE_CHANGE: '换脸',
};

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  SUCCESS: 'default',
  FAILURE: 'destructive',
  IN_PROGRESS: 'secondary',
  NOT_START: 'outline',
};

function MidjourneyContent() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<MjLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState({ action: '0', keyword: '' });

  const loadLogs = useCallback(async (currentPage = 0, reset = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        p: String(currentPage),
        page_size: '20',
      });
      if (filter.action !== '0') params.set('action', filter.action);
      if (filter.keyword) params.set('channel_id', filter.keyword);

      const res = await API.get(`/api/mj?${params.toString()}`);
      const data = res.data as { success: boolean; data: MjLog[] | { items: MjLog[] } };
      if (data.success) {
        const newLogs = Array.isArray(data.data) ? data.data : ((data.data as { items: MjLog[] })?.items || []);
        if (reset) {
          setLogs(newLogs);
        } else {
          setLogs((prev) => [...prev, ...newLogs]);
        }
        setHasMore(newLogs.length === 20);
      }
    } catch {
      toast.error(t('加载失败'));
    } finally {
      setLoading(false);
    }
  }, [filter, t]);

  useEffect(() => {
    setPage(0);
    loadLogs(0, true);
  }, [filter]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadLogs(nextPage);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Image className="size-6" />
          {t('绘图日志')}
        </h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setPage(0); loadLogs(0, true); }}
          disabled={loading}
        >
          <RefreshCw className={`size-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          {t('刷新')}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Select
          value={filter.action}
          onValueChange={(v) => setFilter({ ...filter, action: v })}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">{t('全部动作')}</SelectItem>
            {Object.entries(MJ_ACTIONS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{t(v)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder={t('渠道ID')}
          value={filter.keyword}
          onChange={(e) => setFilter({ ...filter, keyword: e.target.value })}
          className="w-32"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('时间')}</TableHead>
                <TableHead>{t('动作')}</TableHead>
                <TableHead>{t('状态')}</TableHead>
                <TableHead>{t('进度')}</TableHead>
                <TableHead className="max-w-[200px]">{t('提示词')}</TableHead>
                <TableHead>{t('图片')}</TableHead>
                <TableHead>{t('耗时')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <RefreshCw className="size-5 animate-spin mx-auto mb-2" />
                    {t('加载中...')}
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <Image className="size-8 mx-auto mb-2 opacity-30" />
                    {t('暂无绘图记录')}
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {log.submit_time ? formatTimestamp(log.submit_time) : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {t(MJ_ACTIONS[log.action] || log.action)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[log.status] || 'outline'}>
                        {t(log.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{log.progress || '-'}</TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">
                      {log.prompt || log.fail_reason || '-'}
                    </TableCell>
                    <TableCell>
                      {log.image_url ? (
                        <a href={log.image_url} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="sm">
                            <ExternalLink className="size-4" />
                          </Button>
                        </a>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-right">
                      {log.finish_time && log.submit_time
                        ? `${((log.finish_time - log.submit_time) / 1000).toFixed(1)}s`
                        : '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {hasMore && !loading && logs.length > 0 && (
            <div className="flex justify-center p-4 border-t">
              <Button variant="outline" onClick={handleLoadMore}>
                {t('加载更多')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function MidjourneyPage() {
  return (
    <AuthGuard>
      <MidjourneyContent />
    </AuthGuard>
  );
}
