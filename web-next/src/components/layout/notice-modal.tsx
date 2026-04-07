'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Megaphone, InboxIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { API } from '@/lib/api';
import type { Announcement } from '@/types';

async function parseMarkdown(content: string): Promise<string> {
  const { marked } = await import('marked');
  return marked.parse(content) as string;
}

function getAnnouncementKey(a: Announcement): string {
  return `${a.publishDate || ''}-${(a.content || '').slice(0, 30)}`;
}

function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 30) return `${days} 天前`;
  return date.toLocaleDateString();
}

function formatAbsTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const TYPE_STYLES: Record<string, string> = {
  default: 'bg-muted-foreground/25',
  ongoing: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-destructive',
};

interface NoticeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  announcements: Announcement[];
  defaultTab?: 'inApp' | 'system';
}

export function NoticeModal({
  open,
  onOpenChange,
  announcements,
  defaultTab = 'inApp',
}: NoticeModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [noticeHtml, setNoticeHtml] = useState('');
  const [noticeLoading, setNoticeLoading] = useState(false);
  const [renderedMap, setRenderedMap] = useState<Record<string, { html: string; extraHtml: string }>>({});

  // Unread tracking
  const unreadSet = useMemo(() => {
    try {
      const keys: string[] = JSON.parse(localStorage.getItem('notice_read_keys') ?? '[]') ?? [];
      return new Set(keys);
    } catch {
      return new Set<string>();
    }
  }, [open]); // recalculate on open

  const processedAnnouncements = useMemo(() =>
    announcements.slice(0, 20).map((item) => ({
      ...item,
      key: getAnnouncementKey(item),
      absTime: formatAbsTime(item.publishDate),
      relTime: getRelativeTime(item.publishDate),
      isUnread: !unreadSet.has(getAnnouncementKey(item)),
    })),
  [announcements, unreadSet]);

  // Fetch notice on open
  useEffect(() => {
    if (!open) return;
    setActiveTab(defaultTab);
    setNoticeLoading(true);
    API.get('/api/notice')
      .then(async (res) => {
        const { success, data } = res.data as { success: boolean; data: string };
        if (success && data?.trim()) {
          setNoticeHtml(await parseMarkdown(data));
        } else {
          setNoticeHtml('');
        }
      })
      .catch(() => setNoticeHtml(''))
      .finally(() => setNoticeLoading(false));
  }, [open, defaultTab]);

  // Render system announcement markdown when switching to system tab
  useEffect(() => {
    if (!open || activeTab !== 'system' || processedAnnouncements.length === 0) return;
    let cancelled = false;
    Promise.all(
      processedAnnouncements.map(async (item) => [
        item.key,
        {
          html: await parseMarkdown(item.content || ''),
          extraHtml: item.extra ? await parseMarkdown(item.extra) : '',
        },
      ] as const),
    ).then((entries) => {
      if (!cancelled) {
        setRenderedMap(Object.fromEntries(entries) as Record<string, { html: string; extraHtml: string }>);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [open, activeTab, processedAnnouncements]);

  // Mark all as read and close
  const handleClose = () => {
    if (announcements.length) {
      try {
        const existing: string[] = JSON.parse(localStorage.getItem('notice_read_keys') ?? '[]') ?? [];
        const merged = Array.from(new Set([...existing, ...announcements.map(getAnnouncementKey)]));
        localStorage.setItem('notice_read_keys', JSON.stringify(merged));
      } catch { /* ignore */ }
    }
    onOpenChange(false);
  };

  const handleCloseTodayNotice = () => {
    localStorage.setItem('notice_close_date', new Date().toDateString());
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/50">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-semibold">{t('系统公告')}</DialogTitle>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'inApp' | 'system')}>
              <TabsList className="h-7 text-xs">
                <TabsTrigger value="inApp" className="h-5.5 px-2.5 text-xs gap-1.5">
                  <Bell className="size-3" />
                  {t('通知')}
                </TabsTrigger>
                <TabsTrigger value="system" className="h-5.5 px-2.5 text-xs gap-1.5">
                  <Megaphone className="size-3" />
                  {t('系统公告')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </DialogHeader>

        <ScrollArea className="h-[55vh] min-h-[240px]">
          <div className="px-5 py-4">
            {/* 通知 tab */}
            {activeTab === 'inApp' && (
              noticeLoading ? (
                <div className="space-y-3 py-2">
                  {[90, 75, 85, 60, 80].map((w, i) => (
                    <Skeleton key={i} className="h-4 rounded" style={{ width: `${w}%` }} />
                  ))}
                </div>
              ) : noticeHtml ? (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none
                             prose-headings:text-foreground prose-p:text-muted-foreground
                             prose-p:leading-relaxed prose-li:text-muted-foreground
                             prose-a:text-primary"
                  dangerouslySetInnerHTML={{ __html: noticeHtml }}
                />
              ) : (
                <EmptyState label={t('暂无公告')} />
              )
            )}

            {/* 系统公告 tab */}
            {activeTab === 'system' && (
              processedAnnouncements.length === 0 ? (
                <EmptyState label={t('暂无系统公告')} />
              ) : (
                <div className="relative pl-5 space-y-0">
                  {/* vertical line */}
                  <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border/60" />
                  {processedAnnouncements.map((item, idx) => {
                    const rendered = renderedMap[item.key];
                    return (
                      <div key={idx} className="relative pb-5 last:pb-0">
                        {/* dot */}
                        <span
                          className={cn(
                            'absolute -left-[13px] top-1.5 size-3 rounded-full border-2 border-background',
                            TYPE_STYLES[item.type] ?? TYPE_STYLES.default,
                          )}
                        />
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="text-[11px] text-muted-foreground/70">
                            {item.relTime && `${item.relTime} · `}{item.absTime}
                          </span>
                          {item.isUnread && (
                            <span className="inline-flex items-center rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold text-primary uppercase tracking-wide">
                              NEW
                            </span>
                          )}
                        </div>
                        {rendered ? (
                          <div
                            className="prose prose-sm dark:prose-invert max-w-none
                                       prose-headings:text-foreground prose-p:text-foreground/85
                                       prose-p:my-0.5 prose-li:text-foreground/85"
                            dangerouslySetInnerHTML={{ __html: rendered.html }}
                          />
                        ) : (
                          <p className="text-sm text-foreground/85 leading-relaxed">{item.content}</p>
                        )}
                        {rendered?.extraHtml && (
                          <div
                            className="mt-1 text-xs text-muted-foreground prose prose-xs dark:prose-invert max-w-none"
                            dangerouslySetInnerHTML={{ __html: rendered.extraHtml }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border/40 bg-muted/30">
          <Button variant="ghost" size="sm" onClick={handleCloseTodayNotice} className="text-muted-foreground hover:text-foreground">
            {t('今日关闭')}
          </Button>
          <Button size="sm" onClick={handleClose}>
            {t('关闭公告')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
      <div className="size-12 rounded-xl bg-muted flex items-center justify-center">
        <InboxIcon className="size-6 text-muted-foreground/40" />
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

// ── Bell button with unread badge ──────────────────────────────────────────

interface NotificationBellProps {
  announcements: Announcement[];
  onClick: () => void;
}

export function NotificationBell({ announcements, onClick }: NotificationBellProps) {
  const { t } = useTranslation();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!announcements.length) { setUnreadCount(0); return; }
    try {
      const readKeys: string[] = JSON.parse(localStorage.getItem('notice_read_keys') ?? '[]') ?? [];
      const readSet = new Set(readKeys);
      setUnreadCount(announcements.filter((a) => !readSet.has(getAnnouncementKey(a))).length);
    } catch {
      setUnreadCount(0);
    }
  }, [announcements]);

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground hover:text-foreground"
        title={t('系统公告')}
        onClick={onClick}
      >
        <Bell className="size-4" />
      </Button>
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white pointer-events-none">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </div>
  );
}
