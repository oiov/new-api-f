'use client';

import React, { useState, useCallback, useEffect, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  Eye, EyeOff, UserPlus, Shield, Zap, CheckCircle2,
  Lock, ArrowLeft, Mail, Send,
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthRedirect } from '@/components/common/auth-guard';
import { useUser, persistUser } from '@/context/user-context';
import { useSystemStatus } from '@/context/status-context';
import { API, updateAPI } from '@/lib/api';
import { normalizeInviteCode, getLogo, getSystemName } from '@/lib/utils';
import { toast } from 'sonner';
import type { User } from '@/types';
import { AuthConfigNotice } from '@/components/auth/auth-config-notice';

const FEATURES = [
  { icon: Shield, key: '企业级安全，数据全程加密传输' },
  { icon: Zap, key: '支持 40+ 主流大模型，统一接入' },
  { icon: CheckCircle2, key: '稳定可靠，99.9% SLA 保障' },
];

function BrandPanel() {
  const { t } = useTranslation();
  const status = useSystemStatus();
  const systemName = getSystemName(status);
  const logoUrl = getLogo(status);

  return (
    <div className="relative hidden lg:flex flex-col justify-between p-10 overflow-hidden bg-gradient-to-br from-primary via-primary/95 to-[oklch(0.38_0.18_260)]">
      {/* 背景装饰 */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="absolute top-0 right-0 w-80 h-80 rounded-full bg-white/5 -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full bg-white/5 translate-y-1/2 -translate-x-1/2" />
        <div className="absolute top-1/2 left-1/2 w-96 h-96 rounded-full bg-white/3 -translate-x-1/2 -translate-y-1/2" />
        {/* 网格点 */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.07]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid-reg" width="32" height="32" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="white" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid-reg)" />
        </svg>
      </div>

      {/* Logo */}
      <div className="relative z-10 flex items-center gap-3">
        <div className="size-9 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-sm border border-white/20">
          <Image src={logoUrl} alt={systemName} width={22} height={22} className="object-contain" />
        </div>
        <span className="text-white font-bold text-lg tracking-tight">{systemName}</span>
      </div>

      {/* 主标语 */}
      <div className="relative z-10 space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-white leading-tight">
            {t('加入我们，开启')}
            <br />
            <span className="text-white/80">{t('AI 开发之旅')}</span>
          </h2>
          <p className="mt-3 text-white/60 text-sm leading-relaxed">
            {t('免费注册，即刻接入 40+ 主流大模型，快速构建 AI 应用。')}
          </p>
        </div>

        {/* 特性列表 */}
        <ul className="space-y-3">
          {FEATURES.map(({ icon: Icon, key }) => (
            <li key={key} className="flex items-center gap-3">
              <div className="size-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                <Icon className="size-3.5 text-white" />
              </div>
              <span className="text-white/80 text-sm">{t(key)}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 底部安全标识 */}
      <div className="relative z-10 flex items-center gap-2 text-white/40 text-xs">
        <Lock className="size-3" />
        <span>SSL 安全加密连接</span>
      </div>
    </div>
  );
}

function RegisterFormInner() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { dispatch } = useUser();
  const status = useSystemStatus();

  const [form, setForm] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    email: '',
    inviteCode: '',
    verificationCode: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    const affParam = searchParams.get('aff');
    if (affParam) {
      const code = normalizeInviteCode(affParam);
      setForm((prev) => ({ ...prev, inviteCode: code }));
      localStorage.setItem('aff', code);
    } else {
      const storedAff = localStorage.getItem('aff');
      if (storedAff) {
        setForm((prev) => ({ ...prev, inviteCode: storedAff }));
      }
    }
  }, [searchParams]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendCode = async () => {
    if (!form.email.trim()) {
      toast.error(t('请输入邮箱'));
      return;
    }
    setSendingCode(true);
    try {
      const res = await API.get(
        `/api/user/email_bind?email=${encodeURIComponent(form.email)}`,
      );
      const data = res.data as { success: boolean; message?: string };
      if (data.success) {
        toast.success(t('验证码已发送'));
        setCountdown(60);
      } else {
        toast.error(data.message || t('发送失败'));
      }
    } catch {
      toast.error(t('发送失败'));
    } finally {
      setSendingCode(false);
    }
  };

  const handleRegister = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error(t('两次密码不一致'));
      return;
    }
    setLoading(true);
    try {
      const payload: Record<string, string> = {
        username: form.username.trim(),
        password: form.password,
        aff_code: normalizeInviteCode(form.inviteCode),
      };
      if (status?.email_verification) {
        payload.email = form.email.trim();
        payload.verification_code = form.verificationCode.trim();
      }
      const res = await API.post('/api/user/register', payload);
      const data = res.data as { success: boolean; message?: string; data: User };
      if (data.success) {
        persistUser(data.data);
        dispatch({ type: 'login', payload: data.data });
        updateAPI();
        toast.success(t('注册成功'));
        router.replace('/console');
      } else {
        toast.error(data.message || t('注册失败'));
      }
    } catch {
      toast.error(t('注册失败，请稍后重试'));
    } finally {
      setLoading(false);
    }
  }, [form, dispatch, router, t, status]);

  // 注册被关闭
  if (status !== null && !status?.register_enabled) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm space-y-6 text-center"
      >
        <div className="size-16 rounded-2xl bg-muted flex items-center justify-center mx-auto">
          <Lock className="size-7 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-bold">{t('注册已关闭')}</h1>
          <p className="text-sm text-muted-foreground">{t('管理员关闭了注册功能，请联系管理员开通账号。')}</p>
        </div>
        <Link href="/login">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="size-4" />
            {t('返回登录')}
          </Button>
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-sm space-y-6"
    >
      {/* 标题 */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{t('创建账号')}</h1>
        <p className="text-sm text-muted-foreground">{t('免费注册，立即开始使用')}</p>
      </div>

      {/* 配置状态提示 */}
      <AuthConfigNotice mode="register" />

      {/* 表单 */}
      <form onSubmit={handleRegister} className="space-y-4">
        {/* 用户名 */}
        <div className="space-y-1.5">
          <Label htmlFor="username" className="text-sm font-medium">
            {t('用户名')}
          </Label>
          <Input
            id="username"
            type="text"
            placeholder={t('请输入用户名')}
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            autoComplete="username"
            autoFocus
            required
            className="h-10"
          />
        </div>

        {/* 邮箱 + 验证码（启用时显示） */}
        {status?.email_verification && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium">
                {t('邮箱')}
              </Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder={t('请输入邮箱')}
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    autoComplete="email"
                    required
                    className="h-10 pl-9"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSendCode}
                  disabled={sendingCode || countdown > 0}
                  className="h-10 shrink-0 gap-1.5 text-xs px-3"
                >
                  {sendingCode ? (
                    <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <Send className="size-3" />
                  )}
                  {countdown > 0 ? `${countdown}s` : t('获取验证码')}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="code" className="text-sm font-medium">
                {t('邮箱验证码')}
              </Label>
              <Input
                id="code"
                type="text"
                placeholder={t('请输入邮箱验证码')}
                value={form.verificationCode}
                onChange={(e) => setForm({ ...form, verificationCode: e.target.value })}
                autoComplete="one-time-code"
                required
                className="h-10 tracking-widest"
              />
            </div>
          </>
        )}

        {/* 密码 */}
        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-sm font-medium">
            {t('密码')}
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder={t('请设置密码')}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              autoComplete="new-password"
              required
              className="h-10 pr-10"
            />
            <button
              type="button"
              tabIndex={-1}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword
                ? <EyeOff className="size-4" />
                : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        {/* 确认密码 */}
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword" className="text-sm font-medium">
            {t('确认密码')}
          </Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder={t('请再次输入密码')}
            value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
            autoComplete="new-password"
            required
            className="h-10"
          />
        </div>

        {/* 邀请码 */}
        <div className="space-y-1.5">
          <Label htmlFor="inviteCode" className="text-sm font-medium text-muted-foreground">
            {t('邀请码')}
            <span className="ml-1 text-xs font-normal">({t('选填')})</span>
          </Label>
          <Input
            id="inviteCode"
            type="text"
            placeholder={t('请输入邀请码')}
            value={form.inviteCode}
            onChange={(e) => setForm({ ...form, inviteCode: e.target.value })}
            className="h-10"
          />
        </div>

        <Button type="submit" className="w-full h-10 gap-2" disabled={loading}>
          {loading ? (
            <>
              <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {t('注册中...')}
            </>
          ) : (
            <>
              <UserPlus className="size-4" />
              {t('立即注册')}
            </>
          )}
        </Button>
      </form>

      {/* 登录链接 */}
      <p className="text-center text-sm text-muted-foreground">
        {t('已有账号？')}{' '}
        <Link
          href="/login"
          className="text-primary font-medium hover:underline inline-flex items-center gap-0.5"
        >
          <ArrowLeft className="size-3" />
          {t('立即登录')}
        </Link>
      </p>

      {/* 安全标识（移动端显示） */}
      <p className="lg:hidden flex items-center justify-center gap-1.5 text-xs text-muted-foreground/60">
        <Lock className="size-3" />
        SSL 安全加密连接
      </p>
    </motion.div>
  );
}

function RegisterForm() {
  return (
    <Suspense fallback={
      <div className="w-full max-w-sm space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    }>
      <RegisterFormInner />
    </Suspense>
  );
}

export default function RegisterPage() {
  return (
    <AuthRedirect>
      <div className="min-h-[calc(100vh-var(--header-height))] grid lg:grid-cols-[45%_55%]">
        {/* 左侧品牌面板 */}
        <BrandPanel />

        {/* 右侧表单区域 */}
        <div className="flex items-center justify-center px-6 py-12 bg-background">
          <RegisterForm />
        </div>
      </div>
    </AuthRedirect>
  );
}
