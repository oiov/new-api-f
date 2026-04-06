'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Settings, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { API } from '@/lib/api';
import { toast } from 'sonner';

export default function SetupPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    username: 'root',
    password: '',
    confirm_password: '',
  });

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.password) {
      toast.error(t('请输入密码'));
      return;
    }
    if (form.password !== form.confirm_password) {
      toast.error(t('两次密码不一致'));
      return;
    }
    setLoading(true);
    try {
      const res = await API.post('/api/setup', {
        username: form.username,
        password: form.password,
      });
      const data = res.data as { success: boolean; message?: string };
      if (data.success) {
        setDone(true);
        setTimeout(() => router.replace('/login'), 2000);
      } else {
        toast.error(data.message || t('初始化失败'));
      }
    } catch {
      toast.error(t('初始化失败'));
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-4"
        >
          <CheckCircle className="size-16 text-green-500 mx-auto" />
          <h2 className="text-2xl font-bold">{t('初始化成功')}</h2>
          <p className="text-muted-foreground">{t('正在跳转到登录页面...')}</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <Card className="shadow-card">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-primary/10">
              <Settings className="size-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">{t('系统初始化')}</CardTitle>
            <CardDescription>
              {t('欢迎使用 fishxcode，请设置管理员账号以完成初始化。')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSetup} className="space-y-4">
              <div className="space-y-2">
                <Label>{t('管理员用户名')}</Label>
                <Input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="root"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('管理员密码')}</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={t('请设置管理员密码')}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('确认密码')}</Label>
                <Input
                  type="password"
                  value={form.confirm_password}
                  onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
                  placeholder={t('请再次输入密码')}
                />
              </div>
              <Button type="submit" className="w-full h-10 gap-2" disabled={loading}>
                {loading ? (
                  <>
                    <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    {t('初始化中...')}
                  </>
                ) : (
                  <>
                    <Settings className="size-4" />
                    {t('完成初始化')}
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
