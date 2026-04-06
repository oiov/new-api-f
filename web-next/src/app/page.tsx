'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Play, FileText, Github, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useSystemStatus } from '@/context/status-context';
import { useTheme } from 'next-themes';
import { API } from '@/lib/api';
import { copy } from '@/lib/utils';
import { toast } from 'sonner';

const HOME_PAGE_CACHE_KEY = 'home_page_content_cache_v2';
const HOME_PAGE_CACHE_TTL = 5 * 60 * 1000;

const API_ENDPOINTS = ['/v1', '/v1beta', '/v1/chat/completions'];

const PROVIDER_LOGOS = [
  { name: 'OpenAI', emoji: '🤖' },
  { name: 'Claude', emoji: '🔮' },
  { name: 'Gemini', emoji: '✨' },
  { name: 'Azure', emoji: '☁️' },
  { name: 'DeepSeek', emoji: '🐋' },
  { name: 'Qwen', emoji: '🌟' },
  { name: 'Mistral', emoji: '🌪️' },
  { name: 'Llama', emoji: '🦙' },
  { name: 'Cohere', emoji: '🧠' },
  { name: 'Bedrock', emoji: '🪨' },
  { name: 'Vertex', emoji: '🔺' },
  { name: 'Midjourney', emoji: '🎨' },
];

function readHomePageCache(): { content: string; timestamp: number } | null {
  try {
    const raw = localStorage.getItem(HOME_PAGE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { content: string; timestamp: number };
    if (
      typeof parsed?.content !== 'string' ||
      typeof parsed?.timestamp !== 'number'
    )
      return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeHomePageCache(content: string): void {
  localStorage.setItem(
    HOME_PAGE_CACHE_KEY,
    JSON.stringify({ content, timestamp: Date.now() }),
  );
}

async function parseMarkdownToHtml(content: string): Promise<string> {
  const { marked } = await import('marked');
  return marked.parse(content) as string;
}

export default function HomePage() {
  const { t, i18n } = useTranslation();
  const status = useSystemStatus();
  const { resolvedTheme } = useTheme();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [homePageContent, setHomePageContent] = useState('');
  const [homePageLoaded, setHomePageLoaded] = useState(false);
  const [endpointIndex, setEndpointIndex] = useState(0);

  const serverAddress = status?.server_address || (typeof window !== 'undefined' ? window.location.origin : '');
  const docsLink = status?.docs_link || '';
  const isDemoSite = status?.demo_site_enabled || false;
  const isChinese = i18n.language.startsWith('zh');

  const displayContent = useCallback(async () => {
    const cached = readHomePageCache();
    const hasFreshCache = cached && Date.now() - cached.timestamp <= HOME_PAGE_CACHE_TTL;

    if (cached) {
      setHomePageContent(cached.content);
      setHomePageLoaded(true);
    }

    if (hasFreshCache) return;

    try {
      const res = await API.get('/api/home_page_content');
      const { success, data } = res.data as { success: boolean; data: string };
      if (success) {
        let content = data;
        if (!data.startsWith('https://')) {
          content = await parseMarkdownToHtml(data);
        }
        setHomePageContent(content);
        writeHomePageCache(content);
      }
    } catch {
      // ignore
    } finally {
      setHomePageLoaded(true);
    }
  }, []);

  useEffect(() => {
    displayContent();
  }, [displayContent]);


  // Rotate endpoints
  useEffect(() => {
    const timer = setInterval(() => {
      setEndpointIndex((prev) => (prev + 1) % API_ENDPOINTS.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  // Sync iframe state
  useEffect(() => {
    if (homePageContent.startsWith('https://') && iframeRef.current) {
      try {
        iframeRef.current.contentWindow?.postMessage(
          { themeMode: resolvedTheme },
          '*',
        );
        iframeRef.current.contentWindow?.postMessage(
          { lang: i18n.language },
          '*',
        );
      } catch {
        // ignore
      }
    }
  }, [resolvedTheme, i18n.language, homePageContent]);

  const handleCopy = async () => {
    const ok = await copy(serverAddress);
    if (ok) toast.success(t('已复制到剪切板'));
  };

  const handleCloseNotice = () => { }; // kept for compat, notice now handled in header

  // If home page has custom content (URL or HTML)
  if (homePageLoaded && homePageContent) {
    if (homePageContent.startsWith('https://')) {
      return (
        <iframe
          ref={iframeRef}
          src={homePageContent}
          className="w-full border-0"
          style={{ height: 'calc(100vh - var(--header-height))' }}
          title="Home Content"
        />
      );
    }
    return (
      <div
        className="mt-0 prose prose-neutral dark:prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: homePageContent }}
      />
    );
  }

  // Default home page
  return (
    <div className="w-full overflow-x-hidden">

      {/* Hero section */}
      <div className="relative min-h-[calc(100vh-var(--header-height))] flex items-center justify-center overflow-hidden border-b">
        {/* Background decoration */}
        <div
          className="absolute inset-0 -z-10"
          aria-hidden="true"
        >
          <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        </div>

        <div className="container max-w-4xl mx-auto px-4 py-20 flex flex-col items-center text-center gap-8">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            {isDemoSite && status?.version && (
              <a
                href="https://github.com/fishxcode/fishxcode"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
              >
                <Github className="size-4" />
                <span>{status.version}</span>
                <ChevronRight className="size-3 opacity-60" />
              </a>
            )}
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className={`text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight ${isChinese ? 'tracking-wider' : ''}`}
          >
            {t('统一的')}
            <br />
            <span className="text-gradient">{t('大模型接口网关')}</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-base sm:text-lg text-muted-foreground max-w-xl"
          >
            {t('更好的价格，更好的稳定性，只需要将模型基址替换为：')}
          </motion.p>

          {/* Server address input */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex w-full max-w-lg items-center rounded-full border bg-background shadow-sm overflow-hidden"
          >
            <div className="flex-1 px-4 py-2.5 text-sm font-mono truncate text-muted-foreground">
              {serverAddress}
            </div>
            <div className="flex items-center border-l pr-1">
              <AnimatePresence mode="wait">
                <motion.span
                  key={endpointIndex}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="px-3 text-sm font-mono text-primary"
                >
                  {API_ENDPOINTS[endpointIndex]}
                </motion.span>
              </AnimatePresence>
              <Button
                size="icon"
                className="rounded-full size-8 shrink-0 mr-0.5"
                onClick={handleCopy}
                title={t('复制')}
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
          </motion.div>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="flex gap-3 flex-wrap justify-center"
          >
            <Link href="/console">
              <Button size="lg" className="rounded-full px-8">
                <Play className="size-4 mr-2" />
                {t('获取密钥')}
              </Button>
            </Link>
            {docsLink && !isDemoSite && (
              <a href={docsLink} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="lg" className="rounded-full px-8">
                  <FileText className="size-4 mr-2" />
                  {t('文档')}
                </Button>
              </a>
            )}
          </motion.div>

          {/* Provider logos */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="w-full mt-8"
          >
            <p className="text-sm text-muted-foreground mb-4">
              {t('支持众多的大模型供应商')}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
              {PROVIDER_LOGOS.map((provider) => (
                <div
                  key={provider.name}
                  className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
                >
                  <span>{provider.emoji}</span>
                  <span>{provider.name}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
