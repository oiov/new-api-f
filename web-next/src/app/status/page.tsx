'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Info, RefreshCw, ExternalLink, Github } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSystemStatus } from '@/context/status-context';
import { API } from '@/lib/api';

const ABOUT_CACHE_KEY = 'about_cache_v2';
const ABOUT_CACHE_TTL = 10 * 60 * 1000;

function readAboutCache(): { content: string; timestamp: number } | null {
  try {
    const raw = localStorage.getItem(ABOUT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { content: string; timestamp: number };
    if (typeof parsed?.content !== 'string' || typeof parsed?.timestamp !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeAboutCache(content: string): void {
  localStorage.setItem(ABOUT_CACHE_KEY, JSON.stringify({ content, timestamp: Date.now() }));
}

export default function StatusPage() {
  const { t } = useTranslation();
  const status = useSystemStatus();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [aboutContent, setAboutContent] = useState('');
  const [isIframe, setIsIframe] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const currentYear = new Date().getFullYear();

  const loadAbout = async (force = false) => {
    setLoading(true);
    try {
      const cached = readAboutCache();
      const hasFreshCache = cached && Date.now() - cached.timestamp <= ABOUT_CACHE_TTL;

      if (cached && !force) {
        applyContent(cached.content);
        setLoaded(true);
        if (hasFreshCache) { setLoading(false); return; }
      }

      const res = await API.get('/api/about');
      const data = res.data as { success: boolean; data: string };
      if (data.success && data.data) {
        const raw = data.data;
        let processed: string;
        if (raw.startsWith('https://') || raw.startsWith('http://')) {
          processed = raw;
        } else {
          const { marked } = await import('marked');
          processed = await marked.parse(raw) as string;
        }
        writeAboutCache(processed);
        applyContent(processed);
      }
    } catch {
      // ignore
    } finally {
      setLoaded(true);
      setLoading(false);
    }
  };

  const applyContent = (content: string) => {
    if (content.startsWith('https://') || content.startsWith('http://')) {
      setIsIframe(true);
      setAboutContent(content);
    } else {
      setIsIframe(false);
      setAboutContent(content);
    }
  };

  useEffect(() => {
    loadAbout();
  }, []);

  // If iframe, show fullscreen iframe
  if (isIframe && aboutContent) {
    return (
      <div className="fixed inset-0 top-[var(--header-height)] flex flex-col">
        <iframe
          ref={iframeRef}
          src={aboutContent}
          className="flex-1 w-full border-none"
          title="About"
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 space-y-6">
      {/* 页面头部 */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Info className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{t('关于')}</h1>
            <p className="text-sm text-muted-foreground">{status?.system_name || 'fishxcode'}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadAbout(true)}
          disabled={loading}
          className="h-8 gap-1.5 text-xs cursor-pointer disabled:cursor-not-allowed"
        >
          <RefreshCw className={`size-3.5 transition-transform duration-300 ${loading ? 'animate-spin' : ''}`} />
          {t('刷新')}
        </Button>
      </motion.div>

      {/* 内容区 */}
      {loaded && aboutContent && !isIframe ? (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="shadow-card">
            <CardContent className="pt-6">
              <div
                className="prose prose-sm dark:prose-invert max-w-none leading-relaxed"
                dangerouslySetInnerHTML={{ __html: aboutContent }}
              />
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        /* 默认关于卡片 */
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {status?.system_name || 'fishxcode'}
                {status?.version && (
                  <Badge variant="outline" className="text-xs font-mono">
                    v{status.version}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t('本系统基于')} <strong className="text-foreground">fishxcode</strong> {t('构建，是一个统一的 AI API 网关，支持 40+ 上游 AI 服务提供商。')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('可在管理员设置页面配置关于内容，支持 Markdown 及外链 iframe。')}
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/60">
                <a
                  href="https://github.com/fishxcode/fishxcode"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                >
                  <Github className="size-3.5" />
                  fishxcode/fishxcode
                </a>
                <span className="text-xs text-muted-foreground">
                  © {currentYear} fishxcodeby fishxcode
                </span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
