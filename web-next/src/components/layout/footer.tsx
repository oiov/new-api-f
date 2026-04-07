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
      <footer className="border-t border-border/60 bg-card/40 backdrop-blur-sm py-4 px-6">
        <div
          className="text-center text-sm text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: footerContent }}
        />
      </footer>
    );
  }

  return (
    <footer className="border-t border-border/60 bg-card/40 backdrop-blur-sm py-4 px-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-y-2 gap-x-6 text-sm text-muted-foreground">
        {/* Left: nav links */}
        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap justify-center sm:justify-start">
          <Link
            href="/user-agreement"
            className="hover:text-foreground transition-colors duration-150 cursor-pointer"
          >
            {t('用户协议')}
          </Link>
          <Link
            href="/privacy-policy"
            className="hover:text-foreground transition-colors duration-150 cursor-pointer"
          >
            {t('隐私政策')}
          </Link>
          <Link
            href="/contact"
            className="hover:text-foreground transition-colors duration-150 cursor-pointer"
          >
            {t('联系我们')}
          </Link>
        </div>

        {/* Right: powered by */}
        <div className="flex items-center gap-1 text-xs">
          <span>Powered by </span>
          <a
            href="https://github.com/fishxcode/fishxcode"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium hover:text-foreground transition-colors duration-150 cursor-pointer"
          >
            fishxcode
          </a>
          <span> © fishxcode</span>
        </div>
      </div>
    </footer>
  );
}
