'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, LogIn, Lock, ArrowRight, KeyRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Turnstile, { type BoundTurnstileObject } from 'react-turnstile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUser, persistUser } from '@/context/user-context';
import { useSystemStatus } from '@/context/status-context';
import { API, updateAPI } from '@/lib/api';
import { normalizeInviteCode } from '@/lib/utils';
import { isPasskeySupported, prepareCredentialRequestOptions, buildAssertionResult } from '@/lib/passkey';
import { toast } from 'sonner';
import type { User } from '@/types';
import { AuthConfigNotice } from '@/components/auth/auth-config-notice';
import { OAuthButtons } from './oauth-buttons';
import { TwoFAPanel } from './two-fa-panel';

export function LoginForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const { dispatch } = useUser();
  const status = useSystemStatus();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [show2FA, setShow2FA] = useState(false);
  const turnstileRef = useRef<BoundTurnstileObject | null>(null);

  useEffect(() => {
    isPasskeySupported()
      .then(setPasskeySupported)
      .catch(() => setPasskeySupported(false));
  }, []);

  const handleLoginSuccess = useCallback((user: User) => {
    persistUser(user);
    dispatch({ type: 'login', payload: user });
    updateAPI();
    toast.success(t('登录成功'));
    const aff = normalizeInviteCode(localStorage.getItem('aff'));
    if (aff) localStorage.setItem('aff', aff);
    router.replace('/console');
  }, [dispatch, router, t]);

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast.error(t('请填写用户名和密码'));
      return;
    }
    if (status?.turnstile_check && !turnstileToken) {
      toast.error(t('请稍后几秒重试，Turnstile 正在检查用户环境'));
      return;
    }
    setLoading(true);
    try {
      const url = status?.turnstile_check
        ? `/api/user/login?turnstile=${turnstileToken}`
        : '/api/user/login';
      const res = await API.post(url, {
        username: username.trim(),
        password: password.trim(),
      });
      const data = res.data as { success: boolean; message?: string; data: User & { require_2fa?: boolean } };
      if (data.success) {
        if (data.data?.require_2fa) {
          setShow2FA(true);
          setLoading(false);
          return;
        }
        handleLoginSuccess(data.data);
      } else {
        toast.error(data.message || t('登录失败'));
        if (status?.turnstile_check) {
          setTurnstileToken('');
          turnstileRef.current?.reset();
        }
      }
    } catch {
      toast.error(t('登录失败，请稍后重试'));
    } finally {
      setLoading(false);
    }
  }, [username, password, turnstileToken, status, handleLoginSuccess, t]);

  const handlePasskeyLogin = async () => {
    if (!passkeySupported || !window.PublicKeyCredential) {
      toast.error(t('当前浏览器不支持 Passkey'));
      return;
    }
    setPasskeyLoading(true);
    try {
      const beginRes = await API.post('/api/user/passkey/login/begin');
      const { success, message, data } = beginRes.data as { success: boolean; message?: string; data: unknown };
      if (!success) { toast.error(message || t('无法发起 Passkey 登录')); return; }

      const options = prepareCredentialRequestOptions(data);
      const assertion = await navigator.credentials.get({ publicKey: options }) as PublicKeyCredential | null;
      const payload = buildAssertionResult(assertion);
      if (!payload) { toast.error(t('Passkey 验证失败，请重试')); return; }

      const finishRes = await API.post('/api/user/passkey/login/finish', payload);
      const finish = finishRes.data as { success: boolean; message?: string; data: User };
      if (finish.success) {
        handleLoginSuccess(finish.data);
      } else {
        toast.error(finish.message || t('Passkey 登录失败，请重试'));
      }
    } catch (err) {
      const e = err as { name?: string };
      if (e?.name === 'AbortError' || e?.name === 'NotAllowedError') {
        toast.info(t('已取消 Passkey 登录'));
      } else {
        toast.error(t('Passkey 登录失败，请重试'));
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  if (show2FA) {
    return (
      <AnimatePresence mode="wait">
        <TwoFAPanel
          key="2fa"
          onSuccess={(user) => {
            dispatch({ type: 'login', payload: user });
            const aff = normalizeInviteCode(localStorage.getItem('aff'));
            if (aff) localStorage.setItem('aff', aff);
            router.replace('/console');
          }}
          onBack={() => { setShow2FA(false); setPassword(''); }}
        />
      </AnimatePresence>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full space-y-6"
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{t('欢迎回来')}</h1>
        <p className="text-sm text-muted-foreground">{t('登录到您的账号以继续')}</p>
      </div>

      <AuthConfigNotice mode="login" />

      {status?.passkey_login && passkeySupported && (
        <Button
          type="button"
          variant="outline"
          className="w-full h-10 gap-2"
          onClick={handlePasskeyLogin}
          disabled={passkeyLoading}
        >
          {passkeyLoading ? (
            <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <KeyRound className="size-4" />
          )}
          {t('使用 Passkey 登录')}
        </Button>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="username" className="text-sm font-medium">
            {t('用户名 / 邮箱')}
          </Label>
          <Input
            id="username"
            type="text"
            placeholder={t('请输入用户名或邮箱')}
            value={username}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
            className="h-10"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-sm font-medium">
            {t('密码')}
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder={t('请输入密码')}
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="h-10 pr-10"
            />
            <button
              type="button"
              tabIndex={-1}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

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
              {t('登录中...')}
            </>
          ) : (
            <>
              <LogIn className="size-4" />
              {t('登录')}
            </>
          )}
        </Button>
      </form>

      <OAuthButtons status={status} />

      {status?.register_enabled && (
        <p className="text-center text-sm text-muted-foreground">
          {t('还没有账号？')}{' '}
          <Link
            href="/register"
            className="text-primary font-medium hover:underline inline-flex items-center gap-0.5"
          >
            {t('立即注册')}
            <ArrowRight className="size-3" />
          </Link>
        </p>
      )}

      <p className="lg:hidden flex items-center justify-center gap-1.5 text-xs text-muted-foreground/60">
        <Lock className="size-3" />
        SSL 安全加密连接
      </p>
    </motion.div>
  );
}
