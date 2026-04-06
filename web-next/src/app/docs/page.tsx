'use client';

import { useTranslation } from 'react-i18next';
import { BookOpen, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSystemStatus } from '@/context/status-context';

export default function DocsPage() {
  const { t } = useTranslation();
  const status = useSystemStatus();

  // status 未加载完时不渲染，避免闪烁占位卡片
  if (status === null) {
    return null;
  }

  if (status?.docs_link) {
    return (
      <div className="fixed inset-0 top-[var(--header-height)] flex flex-col">
        <iframe
          src={status.docs_link}
          className="flex-1 w-full border-none"
          title={t('文档')}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <BookOpen className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">{t('文档')}</h1>
          <p className="text-sm text-muted-foreground">{t('API 使用指南')}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-card p-6 space-y-3 shadow-card">
        <p className="text-sm font-semibold">{t('API 文档')}</p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t('我们的 API 完全兼容 OpenAI API 格式，您可以直接使用 OpenAI 的 SDK 或客户端进行调用。')}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('管理员暂未配置文档链接，请联系管理员。')}
        </p>
      </div>
    </div>
  );
}
