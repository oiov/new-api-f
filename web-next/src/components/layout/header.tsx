'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'next-themes';
import {
  Moon,
  Sun,
  Monitor,
  LogOut,
  Settings,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  Globe,
  LayoutDashboard,
  Key,
  CreditCard,
  Sparkles,
  Crown,
} from 'lucide-react';
import { NotificationBell, NoticeModal } from '@/components/layout/notice-modal';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useUser, useIsAdmin, useIsLoggedIn } from '@/context/user-context';
import { useSystemStatus } from '@/context/status-context';
import { logoutUser } from '@/hooks/use-user-loader';
import { SUPPORTED_LANGUAGES } from '@/i18n/config';
import { getLogo, getSystemName, formatQuota, formatTokensCompact, cn } from '@/lib/utils';
import Image from 'next/image';

interface HeaderProps {
  onMobileMenuToggle?: () => void;
  drawerOpen?: boolean;
}

const NAV_LINKS = [
  { key: 'pricing', href: '/pricing', label: '价格方案' },
  { key: 'package', href: '/console/package', label: '服务套餐' },
  { key: 'status', href: '/status', label: '系统状态' },
] as const;

export function Header({ onMobileMenuToggle, drawerOpen }: HeaderProps) {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { state: userState, dispatch } = useUser();
  const isAdmin = useIsAdmin();
  const isLoggedIn = useIsLoggedIn();
  const status = useSystemStatus();

  const systemName = getSystemName(status);
  const logoUrl = getLogo(status);
  const quota = userState.user?.quota ?? 0;

  const handleLogout = async () => {
    await logoutUser();
    dispatch({ type: 'logout' });
    router.push('/');
  };

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('i18nextLng', lang);
  };

  const getUserInitials = () => {
    const name = userState.user?.display_name || userState.user?.username || 'U';
    return name.slice(0, 2).toUpperCase();
  };

  // Parse nav modules config
  const headerNavModules = React.useMemo(() => {
    const config = status?.HeaderNavModules;
    if (!config) return {} as Record<string, boolean | { visible?: boolean }>;
    try {
      return JSON.parse(config) as Record<string, boolean | { visible?: boolean }>;
    } catch {
      return {} as Record<string, boolean | { visible?: boolean }>;
    }
  }, [status?.HeaderNavModules]);

  const isModuleVisible = (key: string): boolean => {
    const mod = headerNavModules[key];
    if (mod === undefined) return true;
    if (typeof mod === 'boolean') return mod;
    return mod.visible !== false;
  };

  const [mounted, setMounted] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const announcements = status?.announcements ?? [];

  useEffect(() => setMounted(true), []);

  // Auto-open notice modal once per day if notice exists
  useEffect(() => {
    const lastClose = localStorage.getItem('notice_close_date');
    const today = new Date().toDateString();
    if (lastClose === today) return;
    // Delay slightly so page settles first
    const t = setTimeout(async () => {
      try {
        const { API: ApiModule } = await import('@/lib/api');
        const res = await ApiModule.get('/api/notice');
        const { success, data } = res.data as { success: boolean; data: string };
        if (success && data?.trim()) setNoticeOpen(true);
      } catch { /* ignore */ }
    }, 800);
    return () => clearTimeout(t);
  }, []);
  // Use Monitor on server/pre-hydration so server and client HTML match
  const ThemeIcon = !mounted ? Monitor : theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;

  return (
    <header className="sticky top-0 z-50 w-full">
      {/* 主 Header 栏 */}
      <div className="h-[var(--header-height)] bg-card/95 backdrop-blur-xl border-b border-border/60 flex items-center px-4 gap-3">

        {/* 移动端菜单按钮 */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden size-8 shrink-0"
          onClick={onMobileMenuToggle}
        >
          {drawerOpen ? <X className="size-4" /> : <Menu className="size-4" />}
        </Button>

        {/* Logo + 系统名 */}
        <Link
          href="/"
          className="flex items-center gap-2.5 shrink-0 group"
        >
          <div className="relative size-7 rounded-lg overflow-hidden bg-primary/10 flex items-center justify-center">
            <Image
              src={logoUrl}
              alt={systemName}
              fill
              sizes="28px"
              className="object-contain p-0.5"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
          <span className="font-bold text-[15px] tracking-tight hidden sm:block text-foreground group-hover:text-primary transition-colors">
            {systemName}
          </span>
        </Link>

        {/* 桌面端导航 */}
        <nav className="hidden md:flex items-center gap-0.5 ml-1">
          {NAV_LINKS.map(({ key, href, label }) => {
            if (!isModuleVisible(key)) return null;
            if (key === 'package' && !status?.subscription_enabled) return null;
            const isActive = pathname === href;
            return (
              <Link key={key} href={href}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-8 px-3 text-sm font-medium rounded-md',
                    isActive
                      ? 'text-primary bg-primary/8'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t(label)}
                </Button>
              </Link>
            );
          })}
          {isModuleVisible('docs') && status?.docs_link && (
            <Link href="/docs">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'h-8 px-3 text-sm font-medium rounded-md',
                  pathname === '/docs'
                    ? 'text-primary bg-primary/8'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t('开发文档')}
              </Button>
            </Link>
          )}
        </nav>

        <div className="flex-1" />

        {/* 右侧操作区 */}
        <div className="flex items-center gap-1.5">

          {/* 语言切换 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-foreground"
                title={t('切换语言')}
              >
                <Globe className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal pb-1">
                {t('选择语言')}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {SUPPORTED_LANGUAGES.map((lang) => (
                <DropdownMenuItem
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code)}
                  className={cn(
                    'text-sm',
                    i18n.language === lang.code
                      ? 'font-medium text-primary bg-primary/5'
                      : '',
                  )}
                >
                  {lang.nativeName}
                  {i18n.language === lang.code && (
                    <span className="ml-auto size-1.5 rounded-full bg-primary" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 主题切换 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-foreground"
                title={t('切换主题')}
              >
                <ThemeIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              {[
                { value: 'light', icon: Sun, label: '浅色' },
                { value: 'dark', icon: Moon, label: '深色' },
                { value: 'system', icon: Monitor, label: '跟随系统' },
              ].map(({ value, icon: Icon, label }) => (
                <DropdownMenuItem
                  key={value}
                  onClick={() => setTheme(value)}
                  className={cn(theme === value && 'text-primary font-medium bg-primary/5')}
                >
                  <Icon className="size-4 mr-2" />
                  {t(label)}
                  {theme === value && <span className="ml-auto size-1.5 rounded-full bg-primary" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 公告通知 */}
          <NotificationBell announcements={announcements} onClick={() => setNoticeOpen(true)} />

          {/* 分割线 */}
          <div className="w-px h-5 bg-border/60 mx-0.5" />

          {/* 用户区域 */}
          {isLoggedIn ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-8 px-2.5 flex items-center gap-2 rounded-lg group hover:bg-accent data-[state=open]:bg-accent data-[state=open]:ring-1 data-[state=open]:ring-primary/20 transition-all duration-150"
                >
                  <Avatar className="size-6 ring-1 ring-primary/25">
                    <AvatarFallback className="text-[10px] font-bold bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
                      {getUserInitials()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:block text-sm font-medium max-w-[80px] truncate">
                    {userState.user?.display_name || userState.user?.username}
                  </span>
                  <ChevronDown className="size-3 text-muted-foreground hidden sm:block transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={8}
                className="w-72 p-0 rounded-xl overflow-hidden border-border/50 shadow-[0_8px_32px_-4px_rgba(0,0,0,0.18),0_4px_12px_-4px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_-4px_rgba(0,0,0,0.5),0_4px_12px_-4px_rgba(0,0,0,0.3)] bg-popover/95 backdrop-blur-xl"
              >
                {/* 用户信息头部 */}
                <div className="relative px-4 pt-4 pb-3.5 border-b border-border/40 overflow-hidden">
                  <div
                    className="absolute -top-8 -right-8 size-36 rounded-full pointer-events-none"
                    style={{ background: 'radial-gradient(circle, hsl(var(--primary) / 0.1) 0%, transparent 70%)' }}
                    aria-hidden="true"
                  />
                  <div className="flex items-center gap-3 relative">
                    <Avatar className="size-10 ring-2 ring-primary/20 ring-offset-1 ring-offset-popover">
                      <AvatarFallback className="text-sm font-bold bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
                        {getUserInitials()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate tracking-tight">
                        {userState.user?.display_name || userState.user?.username}
                      </p>
                      {userState.user?.email && (
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {userState.user.email}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg border border-primary/15 bg-gradient-to-r from-primary/8 via-primary/5 to-transparent">
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full bg-primary/70 animate-pulse" aria-hidden="true" />
                        <span className="text-xs text-muted-foreground font-medium">{t('可用余额')}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-primary tabular-nums">
                          {formatQuota(quota, status)}
                        </div>
                        {status?.quota_display_type !== 'TOKENS' && quota > 0 && (
                          <div className="text-[10px] text-muted-foreground font-mono mt-0.5 tabular-nums">
                            {formatTokensCompact(quota)} tokens
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 导航菜单项 */}
                <div className="p-1.5 space-y-0.5">
                  {[
                    { href: '/console', icon: LayoutDashboard, label: '数据看板', iconBg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-100 dark:border-blue-900/50', iconColor: 'text-blue-600 dark:text-blue-400' },
                    { href: '/console/token', icon: Key, label: '令牌管理', iconBg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/50', iconColor: 'text-amber-600 dark:text-amber-400' },
                    { href: '/console/topup', icon: CreditCard, label: '充值兑换', iconBg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/50', iconColor: 'text-emerald-600 dark:text-emerald-400' },
                    { href: '/console/subscription', icon: Crown, label: '我的订阅', iconBg: 'bg-orange-50 dark:bg-orange-950/40 border-orange-100 dark:border-orange-900/50', iconColor: 'text-orange-600 dark:text-orange-400' },
                    { href: '/console/personal', icon: Settings, label: '个人设置', iconBg: 'bg-violet-50 dark:bg-violet-950/40 border-violet-100 dark:border-violet-900/50', iconColor: 'text-violet-600 dark:text-violet-400' },
                  ].map(({ href, icon: Icon, label, iconBg, iconColor }) => (
                    <DropdownMenuItem key={href} asChild>
                      <Link href={href} className="flex items-center gap-3 px-2.5 py-2 rounded-lg cursor-pointer group/item hover:bg-accent/80 focus:bg-accent/80 transition-all duration-150">
                        <div className={cn('size-8 rounded-lg flex items-center justify-center shrink-0 border group-hover/item:scale-105 group-hover/item:shadow-sm transition-all duration-150', iconBg)}>
                          <Icon className={cn('size-4', iconColor)} />
                        </div>
                        <span className="text-sm font-medium text-foreground/85 group-hover/item:text-foreground transition-colors truncate">{t(label)}</span>
                        <ChevronRight className="size-3.5 ml-auto text-muted-foreground/40 opacity-0 group-hover/item:opacity-100 -translate-x-1 group-hover/item:translate-x-0 transition-all duration-150" />
                      </Link>
                    </DropdownMenuItem>
                  ))}

                  {isAdmin && (
                    <>
                      <div className="flex items-center gap-2 px-2 py-1.5 mt-0.5">
                        <div className="flex-1 h-px bg-border/50" />
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 px-1">
                          {t('管理员')}
                        </span>
                        <div className="flex-1 h-px bg-border/50" />
                      </div>
                      <DropdownMenuItem asChild>
                        <Link href="/console/setting" className="flex items-center gap-3 px-2.5 py-2 rounded-lg cursor-pointer group/item hover:bg-accent/80 focus:bg-accent/80 transition-all duration-150">
                          <div className="size-8 rounded-lg flex items-center justify-center shrink-0 bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 group-hover/item:scale-105 group-hover/item:shadow-sm transition-all duration-150">
                            <Sparkles className="size-4 text-slate-600 dark:text-slate-300" />
                          </div>
                          <span className="text-sm font-medium text-foreground/85 group-hover/item:text-foreground transition-colors truncate">{t('系统设置')}</span>
                          <Badge variant="secondary" className="ml-auto text-[10px] py-0 px-1.5 h-4 bg-primary/10 text-primary border border-primary/20 font-semibold tracking-wide">Admin</Badge>
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                </div>

                <DropdownMenuSeparator className="my-0 bg-border/40" />
                <div className="p-1.5 pt-1">
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="flex items-center gap-3 px-2.5 py-2 rounded-lg cursor-pointer group/item text-destructive/80 hover:text-destructive focus:text-destructive focus:bg-destructive/8 hover:bg-destructive/6 transition-all duration-150"
                  >
                    <div className="size-8 rounded-lg flex items-center justify-center shrink-0 bg-red-50 dark:bg-red-950/40 border border-red-100/80 dark:border-red-900/40 group-hover/item:scale-105 transition-all duration-150">
                      <LogOut className="size-4 text-red-500" />
                    </div>
                    <span className="text-sm font-medium truncate">{t('退出登录')}</span>
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login">
                <Button variant="ghost" size="sm" className="h-8 text-sm">
                  {t('登录')}
                </Button>
              </Link>
              {status?.register_enabled && (
                <Link href="/register">
                  <Button size="sm" className="h-8 text-sm shadow-primary/20 shadow-md">
                    {t('免费注册')}
                  </Button>
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      <NoticeModal
        open={noticeOpen}
        onOpenChange={setNoticeOpen}
        announcements={announcements}
      />
    </header>
  );
}
