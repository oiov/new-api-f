'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ShieldX, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

export default function ForbiddenPage() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-6"
      >
        <div className="text-9xl font-bold text-muted-foreground/20 select-none">403</div>
        <ShieldX className="size-16 text-muted-foreground" />
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{t('访问被拒绝')}</h1>
          <p className="text-muted-foreground">{t('您没有权限访问此页面。')}</p>
        </div>
        <Link href="/">
          <Button>
            <Home className="size-4 mr-2" />
            {t('回到首页')}
          </Button>
        </Link>
      </motion.div>
    </div>
  );
}
