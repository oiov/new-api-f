'use client';

import React, { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  Eye, EyeOff, UserPlus, Lock, ArrowLeft, Mail, Send,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Turnstile, { type BoundTurnstileObject } from 'react-turnstile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthRedirect } from '@/components/common/auth-guard';
import { useUser, persistUser } from '@/context/user-context';
import { useSystemStatus } from '@/context/status-context';
import { API, updateAPI } from '@/lib/api';
import { normalizeInviteCode } from '@/lib/utils';
import { toast } from 'sonner';
import type { User } from '@/types';
import { AuthConfigNotice } from '@/components/auth/auth-config-notice';
import { BrandPanel } from '@/components/auth/brand-panel';

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
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileRef = useRef<BoundTurnstileObject | null>(null);

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
    if (status?.turnstile_check && !turnstileToken) {
      toast.error(t('请稍后几秒重试，Turnstile 正在检查用户环境'));
      return;
    }
    setSendingCode(true);
    try {
      const url = status?.turnstile_check
        ? `/api/verification?email=${encodeURIComponent(form.email)}&turnstile=${turnstileToken}`
        : `/api/verification?email=${encodeURIComponent(form.email)}`;
      const res = await API.get(url);
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
    if (status?.turnstile_check && !turnstileToken) {
      toast.error(t('请稍后几秒重试，Turnstile 正在检查用户环境'));
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
      const url = status?.turnstile_check
        ? `/api/user/register?turnstile=${turnstileToken}`
        : '/api/user/register';
      const res = await API.post(url, payload);
      const data = res.data as { success: boolean; message?: string; data: User };
      if (data.success) {
        persistUser(data.data);
        dispatch({ type: 'login', payload: data.data });
        updateAPI();
        toast.success(t('注册成功'));
        router.replace('/console');
      } else {
        toast.error(data.message || t('注册失败'));
        if (status?.turnstile_check) {
          setTurnstileToken('');
          turnstileRef.current?.reset();
        }
      }
    } catch {
      toast.error(t('注册失败，请稍后重试'));
    } finally {
      setLoading(false);
    }
  }, [form, dispatch, router, t, status, turnstileToken]);

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
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
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

        {/* Turnstile */}
        {status?.turnstile_check && status.turnstile_site_key && (
          <div className="flex justify-center">
            <Turnstile
              sitekey={status.turnstile_site_key}
              onVerify={(token, bound) => {
                setTurnstileToken(token);
                turnstileRef.current = bound;
              }}
              onExpire={(_token, bound) => {
                setTurnstileToken('');
                turnstileRef.current = bound;
              }}
            />
          </div>
        )}

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
        <BrandPanel
          headline="加入我们，开启"
          subHeadline="AI 开发之旅"
          description="免费注册，即刻接入 40+ 主流大模型，快速构建 AI 应用。"
        />

        {/* 右侧表单区域 */}
        <div className="flex items-center justify-center px-6 py-12 bg-background">
          <RegisterForm />
        </div>
      </div>
    </AuthRedirect>
  );
}
