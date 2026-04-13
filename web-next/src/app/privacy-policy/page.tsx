'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Shield, PackageOpen } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { API } from '@/lib/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

const CACHE_KEY = 'doc_privacy_policy';

function isUrl(content: string): boolean {
  try {
    new URL(content.trim());
    return true;
  } catch {
    return false;
  }
}

function isHtml(content: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(content);
}

function extractHtml(raw: string): { body: string; styles: string } {
  const tmp = document.createElement('div');
  tmp.innerHTML = raw;
  const styles = Array.from(tmp.querySelectorAll('style'))
    .map((s) => s.innerHTML)
    .join('\n');
  const bodyEl = tmp.querySelector('body');
  return { body: bodyEl ? bodyEl.innerHTML : raw, styles };
}

export default function PrivacyPolicyPage() {
  const { t } = useTranslation();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [htmlBody, setHtmlBody] = useState('');
  const styleRef = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    const cached = localStorage.getItem(CACHE_KEY) || '';
    if (cached) {
      setContent(cached);
      applyContent(cached);
      setLoading(false);
    }

    API.get('/api/privacy-policy')
      .then((res) => {
        const data = res.data as { success: boolean; data: string };
        if (data.success && data.data) {
          const raw = data.data;
          setContent(raw);
          applyContent(raw);
          localStorage.setItem(CACHE_KEY, raw);
        } else if (!cached) {
          setContent('');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyContent(raw: string) {
    if (isHtml(raw)) {
      const { body, styles } = extractHtml(raw);
      setHtmlBody(body);
      injectStyles(styles);
    } else {
      setHtmlBody('');
      removeStyles();
    }
  }

  function injectStyles(css: string) {
    if (!css) return;
    if (!styleRef.current) {
      styleRef.current = document.createElement('style');
      document.head.appendChild(styleRef.current);
    }
    styleRef.current.innerHTML = css;
  }

  function removeStyles() {
    if (styleRef.current) {
      styleRef.current.remove();
      styleRef.current = null;
    }
  }

  useEffect(() => () => removeStyles(), []);

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Shield className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">{t('隐私政策')}</h1>
          <p className="text-sm text-muted-foreground">{t('我们如何保护您的数据')}</p>
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {loading ? (
          <Card className="shadow-card">
            <CardContent className="pt-6 pb-6">
              <div className="space-y-3">
                {[100, 85, 92, 70, 95, 78, 88, 65].map((w, i) => (
                  <Skeleton key={i} className="h-4 rounded" style={{ width: `${w}%` }} />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : !content || !content.trim() ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="size-16 rounded-2xl bg-muted flex items-center justify-center">
              <PackageOpen className="size-8 text-muted-foreground/50" />
            </div>
            <div>
              <p className="font-medium text-foreground/70">{t('管理员未设置隐私政策内容')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('请联系管理员配置')}</p>
            </div>
          </div>
        ) : isUrl(content) ? (
          <iframe
            src={content.trim()}
            className="w-full rounded-xl border"
            style={{ height: 'calc(100vh - 200px)' }}
            title={t('隐私政策')}
          />
        ) : isHtml(content) ? (
          <Card className="shadow-card">
            <CardContent className="pt-6 pb-6">
              <div
                className="prose prose-sm dark:prose-invert max-w-none
                           prose-headings:font-semibold prose-headings:text-foreground
                           prose-p:text-muted-foreground prose-p:leading-relaxed
                           prose-li:text-muted-foreground prose-a:text-primary"
                dangerouslySetInnerHTML={{ __html: htmlBody }}
              />
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-card">
            <CardContent className="pt-6 pb-6">
              <div className="prose prose-sm dark:prose-invert max-w-none
                             prose-headings:font-semibold prose-headings:text-foreground
                             prose-p:text-muted-foreground prose-p:leading-relaxed
                             prose-li:text-muted-foreground prose-a:text-primary">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                  {content}
                </ReactMarkdown>
              </div>
            </CardContent>
          </Card>
        )}
      </motion.div>
    </div>
  );
}
