'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useSystemStatus } from '@/context/status-context';

export function Footer() {
  const { t } = useTranslation();
  const status = useSystemStatus();

  const footerContent = status?.footer;

  if (footerContent) {
    return (
      <footer className="border-t py-4 px-6">
        <div
          className="text-center text-sm text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: footerContent }}
        />
      </footer>
    );
  }

  return (
    <footer className="border-t py-4 px-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-4">
          <Link href="/user-agreement" className="hover:text-foreground transition-colors">
            {t('用户协议')}
          </Link>
          <Link href="/privacy-policy" className="hover:text-foreground transition-colors">
            {t('隐私政策')}
          </Link>
          <Link href="/contact" className="hover:text-foreground transition-colors">
            {t('联系我们')}
          </Link>
        </div>
        <div>
          <span>Powered by </span>
          <a
            href="https://github.com/fishxcode/fishxcode"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors font-medium"
          >
            fishxcode
          </a>
          <span> © fishxcode</span>
        </div>
      </div>
    </footer>
  );
}
