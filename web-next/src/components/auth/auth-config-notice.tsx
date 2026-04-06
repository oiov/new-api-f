'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Info, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSystemStatus } from '@/context/status-context';

interface ConfigItem {
  label: string;
  value: string;
  type: 'success' | 'danger' | 'warning' | 'default';
}

function getLoginConfigItems(status: ReturnType<typeof useSystemStatus>, t: (k: string) => string): ConfigItem[] {
  if (!status) return [];

  const passwordLoginEnabled = status.password_login_enabled !== false;
  const registerEnabled = status.register_enabled !== false;
  const methods: string[] = [];

  if (passwordLoginEnabled) methods.push(t('密码'));
  if (status.github_oauth) methods.push('GitHub');
  if (status.google_oauth) methods.push('Google');
  if (status.discord_oauth) methods.push('Discord');
  if (status.linuxdo_oauth) methods.push('LinuxDO');
  if (status.oidc_enabled) methods.push(status.oidc_display_name || 'SSO');

  return [
    {
      label: t('密码登录'),
      value: passwordLoginEnabled ? t('已开启') : t('已关闭'),
      type: passwordLoginEnabled ? 'success' : 'danger',
    },
    {
      label: t('可用登录方式'),
      value: methods.length > 0 ? methods.join(' / ') : t('暂无可用登录方式'),
      type: methods.length > 0 ? 'default' : 'warning',
    },
    {
      label: t('注册入口'),
      value: registerEnabled ? t('开放') : t('已关闭'),
      type: registerEnabled ? 'success' : 'danger',
    },
    {
      label: t('附加要求'),
      value: [
        status.email_verification ? t('邮箱验证码') : null,
        status.invite_register_enabled ? t('邀请码') : null,
      ].filter(Boolean).join(' / ') || t('无'),
      type: 'default',
    },
  ];
}

function getRegisterConfigItems(status: ReturnType<typeof useSystemStatus>, t: (k: string) => string): ConfigItem[] {
  if (!status) return [];

  const registerEnabled = status.register_enabled !== false;
  const passwordRegisterEnabled = status.password_register_enabled !== false;
  const emailVerification = status.email_verification;
  const inviteRequired = status.invite_register_enabled;

  return [
    {
      label: t('注册入口'),
      value: registerEnabled ? t('开放') : t('已关闭'),
      type: registerEnabled ? 'success' : 'danger',
    },
    {
      label: t('密码注册'),
      value: registerEnabled && passwordRegisterEnabled ? t('已开启') : t('已关闭'),
      type: registerEnabled && passwordRegisterEnabled ? 'success' : 'danger',
    },
    {
      label: t('邮箱验证'),
      value: emailVerification ? t('必填') : t('不需要'),
      type: emailVerification ? 'warning' : 'default',
    },
    {
      label: t('邀请码'),
      value: inviteRequired ? t('必填') : t('选填'),
      type: inviteRequired ? 'warning' : 'default',
    },
  ];
}

const TYPE_COLORS = {
  success: {
    border: 'border-l-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    icon: CheckCircle2,
  },
  danger: {
    border: 'border-l-red-500',
    text: 'text-red-600 dark:text-red-400',
    icon: XCircle,
  },
  warning: {
    border: 'border-l-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
    icon: AlertTriangle,
  },
  default: {
    border: 'border-l-border',
    text: 'text-foreground',
    icon: null,
  },
};

interface AuthConfigNoticeProps {
  mode: 'login' | 'register';
}

export function AuthConfigNotice({ mode }: AuthConfigNoticeProps) {
  const { t } = useTranslation();
  const status = useSystemStatus();
  const [open, setOpen] = useState(false);

  if (!status) return null;

  const items = mode === 'login'
    ? getLoginConfigItems(status, t)
    : getRegisterConfigItems(status, t);

  if (!items.length) return null;

  const isWarning = mode === 'login'
    ? status.password_login_enabled === false
    : status.register_enabled === false;

  return (
    <div className={cn(
      'rounded-xl border text-sm overflow-hidden transition-all',
      isWarning
        ? 'border-amber-200/80 bg-amber-50/60 dark:border-amber-800/40 dark:bg-amber-900/10'
        : 'border-border/60 bg-muted/30',
    )}>
      {/* 头部 */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-3.5 py-2.5 text-left"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          <span className={cn(
            'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide',
            isWarning
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
              : 'bg-secondary text-muted-foreground',
          )}>
            {isWarning ? t('需注意') : t('已同步')}
          </span>
          <span className="text-xs font-medium text-foreground">
            {mode === 'login' ? t('当前登录配置') : t('当前注册配置')}
          </span>
        </div>
        <ChevronDown className={cn(
          'size-3.5 text-muted-foreground transition-transform duration-200',
          open && 'rotate-180',
        )} />
      </button>

      {/* 折叠区 */}
      {open && (
        <div className="px-3.5 pb-3 pt-0 border-t border-border/40">
          <div className="grid grid-cols-2 gap-1.5 mt-2.5">
            {items.map((item) => {
              const style = TYPE_COLORS[item.type];
              return (
                <div
                  key={item.label}
                  className={cn(
                    'rounded-lg px-2.5 py-2 border-l-2',
                    'bg-background/60 dark:bg-background/20',
                    style.border,
                  )}
                >
                  <p className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wide">{item.label}</p>
                  <p className={cn('text-xs font-semibold leading-tight', style.text)}>{item.value}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex items-start gap-1.5 rounded-lg px-2.5 py-2 bg-background/40">
            <Info className="size-3 shrink-0 mt-0.5 text-muted-foreground" />
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              {mode === 'login'
                ? t('如果某种登录方式没有出现，通常是因为管理员尚未开启对应配置')
                : t('如果注册被关闭，请联系管理员开通账号')
              }
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
