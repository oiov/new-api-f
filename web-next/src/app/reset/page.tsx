'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Mail, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { API } from '@/lib/api';
import { toast } from 'sonner';

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error(t('请输入邮箱'));
      return;
    }
    setLoading(true);
    try {
      const res = await API.get(
        `/api/user/reset?email=${encodeURIComponent(email.trim())}`,
      );
      const data = res.data as { success: boolean; message?: string };
      if (data.success) {
        setSent(true);
        toast.success(t('重置邮件已发送，请查收'));
      } else {
        toast.error(data.message || t('发送失败'));
      }
    } catch {
      toast.error(t('发送失败，请稍后重试'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-var(--header-height))] px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <Card className="shadow-card">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 size-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Mail className="size-9 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold">{t('重置密码')}</CardTitle>
            <CardDescription className="mt-1">
              {t('输入您的注册邮箱，我们将发送重置链接')}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {sent ? (
              <div className="text-center space-y-4">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                  className="mx-auto size-16 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center"
                >
                  <Mail className="size-8 text-emerald-600 dark:text-emerald-400" />
                </motion.div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">{t('邮件已发送！')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('重置邮件已发送到')} <strong className="text-foreground">{email}</strong>，{t('请检查您的邮箱')}
                  </p>
                </div>
                <Link href="/login">
                  <Button variant="outline" className="w-full mt-2">
                    <ArrowLeft className="size-4 mr-2" />
                    {t('返回登录')}
                  </Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t('邮箱')}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('请输入注册邮箱')}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      {t('发送中...')}
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Mail className="size-4" />
                      {t('发送重置邮件')}
                    </span>
                  )}
                </Button>
                <Link href="/login">
                  <Button variant="ghost" className="w-full">
                    <ArrowLeft className="size-4 mr-2" />
                    {t('返回登录')}
                  </Button>
                </Link>
              </form>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
