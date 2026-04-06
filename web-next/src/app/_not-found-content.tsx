'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

export function NotFoundContent() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center gap-6"
      >
        <div className="text-9xl font-bold text-muted-foreground/20 select-none">
          404
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{t('页面未找到')}</h1>
          <p className="text-muted-foreground">
            {t('您访问的页面不存在或已被移除。')}
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => window.history.back()}>
            <ArrowLeft className="size-4 mr-2" />
            {t('返回上页')}
          </Button>
          <Link href="/">
            <Button>
              <Home className="size-4 mr-2" />
              {t('回到首页')}
            </Button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
