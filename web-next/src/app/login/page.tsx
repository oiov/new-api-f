'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye, EyeOff, LogIn, Github, Lock,
  ArrowRight, KeyRound, ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Turnstile, { type BoundTurnstileObject } from 'react-turnstile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthRedirect } from '@/components/common/auth-guard';
import { useUser, persistUser } from '@/context/user-context';
import { useSystemStatus } from '@/context/status-context';
import {
  API, onGitHubOAuthClicked, onDiscordOAuthClicked,
  onLinuxDOOAuthClicked, onGoogleOAuthClicked, onOIDCClicked, updateAPI,
} from '@/lib/api';
import { normalizeInviteCode } from '@/lib/utils';
import { isPasskeySupported, prepareCredentialRequestOptions, buildAssertionResult } from '@/lib/passkey';
import { toast } from 'sonner';
import type { User } from '@/types';
import { AuthConfigNotice } from '@/components/auth/auth-config-notice';
import { BrandPanel } from '@/components/auth/brand-panel';

function OAuthButtons({ status }: { status: ReturnType<typeof useSystemStatus> }) {
  const hasOAuth = status?.github_oauth || status?.discord_oauth ||
    status?.linuxdo_oauth || status?.google_oauth || status?.oidc_enabled;
  if (!hasOAuth) return null;

  return (
    <div className="space-y-3">
      <div className="relative flex items-center gap-3">
        <div className="flex-1 h-px bg-border/60" />
        <span className="text-[11px] text-muted-foreground uppercase tracking-wider whitespace-nowrap px-1">
          第三方登录
        </span>
        <div className="flex-1 h-px bg-border/60" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {status?.github_oauth && (
          <Button variant="outline" size="sm"
            className="h-9 gap-2 text-xs"
            onClick={() => onGitHubOAuthClicked(status.github_client_id!)}>
            <Github className="size-3.5" />
            GitHub
          </Button>
        )}
        {status?.discord_oauth && (
          <Button variant="outline" size="sm"
            className="h-9 gap-2 text-xs"
            onClick={() => onDiscordOAuthClicked(status.discord_client_id!)}>
            Discord
          </Button>
        )}
        {status?.linuxdo_oauth && (
          <Button variant="outline" size="sm"
            className="h-9 gap-2 text-xs"
            onClick={() => onLinuxDOOAuthClicked(status.linuxdo_client_id!)}>
            LinuxDO
          </Button>
        )}
        {status?.google_oauth && (
          <Button variant="outline" size="sm"
            className="h-9 gap-2 text-xs"
            onClick={() => onGoogleOAuthClicked(status.google_client_id!)}>
            Google
          </Button>
        )}
        {status?.oidc_enabled && (
          <Button variant="outline" size="sm"
            className="h-9 gap-2 text-xs"
            onClick={() => onOIDCClicked(
              status.oidc_authorization_endpoint!,
              status.oidc_client_id!,
            )}>
            {status.oidc_display_name || 'SSO'}
          </Button>
        )}
      </div>
    </div>
  );
}

// 2FA 验证面板
function TwoFAPanel({
  onSuccess,
  onBack,
}: {
  onSuccess: (user: User) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (!code) { toast.error(t('请输入验证码')); return; }
    if (useBackup && code.length !== 8) { toast.error(t('备用码必须是8位')); return; }
    if (!useBackup && !/^\d{6}$/.test(code)) { toast.error(t('验证码必须是6位数字')); return; }

    setLoading(true);
    try {
      const res = await API.post('/api/user/login/2fa', { code });
      const data = res.data as { success: boolean; message?: string; data: User };
      if (data.success) {
        persistUser(data.data);
        updateAPI();
        toast.success(t('登录成功'));
        onSuccess(data.data);
      } else {
        toast.error(data.message || t('验证失败，请重试'));
      }
    } catch {
      toast.error(t('验证失败，请重试'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.3 }}
      className="w-full max-w-sm space-y-6"
    >
      {/* 标题 */}
      <div className="space-y-1">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="size-4 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('两步验证')}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {useBackup ? t('请输入备用码完成登录') : t('请输入认证器应用显示的验证码完成登录')}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="twofa-code" className="text-sm font-medium">
            {useBackup ? t('备用码') : t('验证码')}
          </Label>
          <Input
            id="twofa-code"
            type="text"
            inputMode={useBackup ? 'text' : 'numeric'}
            placeholder={useBackup ? t('请输入8位备用码') : t('请输入6位验证码')}
            value={code}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCode(e.target.value)}
            autoFocus
            maxLength={useBackup ? 8 : 6}
            className="h-10 text-center text-lg font-mono tracking-widest"
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleVerify()}
          />
        </div>

        <Button className="w-full h-10 gap-2" onClick={handleVerify} disabled={loading}>
          {loading ? (
            <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <ShieldCheck className="size-4" />
          )}
          {t('验证并登录')}
        </Button>

        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            className="text-primary hover:underline cursor-pointer"
            onClick={() => { setUseBackup(!useBackup); setCode(''); }}
          >
            {useBackup ? t('使用认证器验证码') : t('使用备用码')}
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
            onClick={onBack}
          >
            {t('返回登录')}
          </button>
        </div>

        <div className="rounded-lg bg-muted/40 border border-border/50 px-3 py-2.5 space-y-1">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {t('验证码每30秒更新一次')} · {t('如无法获取验证码，请使用备用码')} · {t('每个备用码只能使用一次')}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function LoginForm() {
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
      className="w-full max-w-sm space-y-6"
    >
      {/* 标题 */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{t('欢迎回来')}</h1>
        <p className="text-sm text-muted-foreground">{t('登录到您的账号以继续')}</p>
      </div>

      {/* 配置状态提示 */}
      <AuthConfigNotice mode="login" />

      {/* Passkey 登录按钮 */}
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

      {/* 表单 */}
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
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-sm font-medium">
              {t('密码')}
            </Label>
            <Link href="/reset" className="text-xs text-primary hover:underline">
              {t('忘记密码？')}
            </Link>
          </div>
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
              {showPassword
                ? <EyeOff className="size-4" />
                : <Eye className="size-4" />}
            </button>
          </div>
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

      {/* OAuth */}
      <OAuthButtons status={status} />

      {/* 注册链接 */}
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

      {/* 安全标识（移动端显示） */}
      <p className="lg:hidden flex items-center justify-center gap-1.5 text-xs text-muted-foreground/60">
        <Lock className="size-3" />
        SSL 安全加密连接
      </p>
    </motion.div>
  );
}

export default function LoginPage() {
  return (
    <AuthRedirect>
      <div className="min-h-[calc(100vh-var(--header-height))] grid lg:grid-cols-[45%_55%]">
        {/* 左侧品牌面板 */}
        <BrandPanel
          headline="统一的 AI API"
          subHeadline="接入平台"
          description="一个账号，接入所有主流大模型，让 AI 开发更简单。"
        />

        {/* 右侧表单区域 */}
        <div className="flex items-center justify-center px-6 py-12 bg-background">
          <LoginForm />
        </div>
      </div>
    </AuthRedirect>
  );
}
