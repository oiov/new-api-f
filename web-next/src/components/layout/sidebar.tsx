'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Key,
  FileText,
  Image as ImageIcon,
  CreditCard,
  Gift,
  User,
  Radio,
  Layers,
  Users,
  Settings,
  Shield,
  Package,
  PackagePlus,
  ChevronLeft,
  Phone,
  Cpu,
  Server,
  RefreshCw,
  BookOpen,
  Crown,
  Receipt,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsAdmin, useIsRoot } from '@/context/user-context';
import { useSystemStatus } from '@/context/status-context';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  rootOnly?: boolean;
  hidden?: boolean;
  badge?: string;
  /** 高亮项：用金/暖色调让入口更醒目 */
  highlight?: boolean;
}

interface NavSection {
  title: string;
  sectionKey: string;
  items: NavItem[];
}

// 各分类对应的颜色系统
const SECTION_COLORS: Record<string, { text: string; bg: string; activeBg: string; dot: string }> = {
  chat: {
    text: 'text-violet-600 dark:text-violet-400',
    bg: 'bg-violet-50 dark:bg-violet-900/20',
    activeBg: 'bg-violet-100/60 dark:bg-violet-800/30',
    dot: 'bg-violet-500',
  },
  console: {
    text: 'text-primary',
    bg: 'bg-primary/10',
    activeBg: 'bg-primary/15',
    dot: 'bg-primary',
  },
  personal: {
    text: 'text-success',
    bg: 'bg-success/10',
    activeBg: 'bg-success/15',
    dot: 'bg-success',
  },
  public: {
    text: 'text-muted-foreground',
    bg: 'bg-muted',
    activeBg: 'bg-muted',
    dot: 'bg-muted-foreground',
  },
  admin: {
    text: 'text-gold',
    bg: 'bg-gold/10',
    activeBg: 'bg-gold/15',
    dot: 'bg-gold',
  },
};

function NavItemLink({
  item,
  collapsed,
  active,
  sectionKey,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
  sectionKey: string;
  onNavigate?: () => void;
}) {
  const colors = SECTION_COLORS[sectionKey] || SECTION_COLORS.console;

  const content = (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        'group relative flex items-center gap-3 rounded-2xl border text-[13px] font-medium transition-all duration-200',
        collapsed ? 'mx-1 justify-center px-0 py-3' : 'mx-2 px-3.5 py-3',
        active
          ? 'border-primary/25 bg-gradient-to-r from-primary/16 via-primary/10 to-transparent text-foreground shadow-[0_10px_30px_-18px_hsl(var(--primary)/0.65)]'
          : item.highlight
            ? 'border-amber-200/70 bg-amber-50/80 text-amber-700 hover:border-amber-300 hover:bg-amber-100/80 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-300 dark:hover:bg-amber-950/40'
            : 'border-transparent text-muted-foreground hover:border-border/70 hover:bg-background/80 hover:text-foreground hover:shadow-sm',
      )}
    >
      {/* 图标容器 */}
      <span
        className={cn(
          'shrink-0 flex items-center justify-center rounded-xl transition-all duration-200',
          collapsed ? 'size-9' : 'size-9',
          active
            ? cn(colors.text, 'bg-white shadow-sm dark:bg-background/80')
            : item.highlight
              ? 'bg-amber-100/80 text-amber-500 dark:bg-amber-950/40 dark:text-amber-300'
              : 'bg-muted/60 text-current group-hover:bg-background group-hover:shadow-sm',
        )}
      >
        {item.icon}
      </span>

      {!collapsed && (
        <>
          <span className="truncate leading-snug">{item.label}</span>
          {item.badge && (
            <span className="ml-auto rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
              {item.badge}
            </span>
          )}
          {/* 高亮项角标：非激活状态显示醒目小标记 */}
          {item.highlight && !active && (
            <span className="ml-auto rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold leading-none text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              重点
            </span>
          )}
        </>
      )}

      {/* 激活指示器 */}
      {active && !collapsed && (
        <span className={cn('ml-auto h-6 w-1 rounded-full shrink-0', colors.dot)} />
      )}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNavigate?: () => void;
}

export function Sidebar({ collapsed, onToggleCollapsed, onNavigate }: SidebarProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const isAdmin = useIsAdmin();
  const isRoot = useIsRoot();
  const status = useSystemStatus();

  const drawingEnabled =
    typeof window !== 'undefined'
      ? localStorage.getItem('enable_drawing') === 'true'
      : false;
  const sections: NavSection[] = useMemo(
    () => [
      {
        title: t('控制台'),
        sectionKey: 'console',
        items: [
          {
            label: t('数据看板'),
            href: '/console',
            icon: <LayoutDashboard className="size-full" />,
            hidden: false,
          },
          {
            label: t('我的订阅'),
            href: '/console/subscription',
            icon: <Crown className="size-full" />,
            highlight: true,
          },
          {
            label: t('套餐管理'),
            href: '/console/package',
            icon: <Package className="size-full" />,
            hidden: !status?.subscription_enabled,
            highlight: true,
          },
          {
            label: t('令牌管理'),
            href: '/console/token',
            icon: <Key className="size-full" />,
          },
          {
            label: t('使用日志'),
            href: '/console/log',
            icon: <FileText className="size-full" />,
          },
          {
            label: t('绘图日志'),
            href: '/console/midjourney',
            icon: <ImageIcon className="size-full" />,
            hidden: !drawingEnabled,
          },

        ],
      },
      {
        title: t('个人中心'),
        sectionKey: 'personal',
        items: [
          {
            label: t('充值兑换'),
            href: '/console/topup',
            icon: <CreditCard className="size-full" />,
          },
          {
            label: t('发票管理'),
            href: '/console/invoice',
            icon: <FileText className="size-full" />,
          },
          {
            label: t('邀请拉新'),
            href: '/console/invite',
            icon: <Gift className="size-full" />,
          },
          {
            label: t('个人设置'),
            href: '/console/personal',
            icon: <User className="size-full" />,
          },
        ],
      },
      {
        title: t('公开入口'),
        sectionKey: 'public',
        items: [
          {
            label: t('系统状态'),
            href: '/status',
            icon: <Radio className="size-full" />,
          },
          {
            label: t('联系我们'),
            href: '/contact',
            icon: <Phone className="size-full" />,
          },
        ],
      },
      {
        title: t('管理员'),
        sectionKey: 'admin',
        items: [
          {
            label: t('渠道管理'),
            href: '/console/channel',
            icon: <Layers className="size-full" />,
            adminOnly: true,
          },
          {
            label: t('套餐配置'),
            href: '/console/subscription-plans',
            icon: <PackagePlus className="size-full" />,
            adminOnly: true,
          },
          {
            label: t('模型管理'),
            href: '/console/models',
            icon: <Cpu className="size-full" />,
            adminOnly: true,
          },
          {
            label: t('模型部署'),
            href: '/console/deployment',
            icon: <Server className="size-full" />,
            adminOnly: true,
          },
          {
            label: t('礼品兑换'),
            href: '/console/redemption',
            icon: <BookOpen className="size-full" />,
            adminOnly: true,
          },
          {
            label: t('用户管理'),
            href: '/console/user',
            icon: <Users className="size-full" />,
            adminOnly: true,
          },
          {
            label: t('系统设置'),
            href: '/console/setting',
            icon: <Settings className="size-full" />,
            rootOnly: true,
          },
          {
            label: t('风险封控'),
            href: '/console/risk-control',
            icon: <Shield className="size-full" />,
            adminOnly: true,
          },
          {
            label: t('发票开具'),
            href: '/console/invoice-admin',
            icon: <Receipt className="size-full" />,
            adminOnly: true,
          },
        ],
      },
    ],
    [t, drawingEnabled, status?.subscription_enabled],
  );

  const isActive = (href: string) => {
    if (href === '/console') return pathname === '/console';
    return pathname.startsWith(href);
  };

  const filteredSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.hidden) return false;
        if (item.rootOnly && !isRoot) return false;
        if (item.adminOnly && !isAdmin) return false;
        return true;
      }),
    }))
    .filter((section) => {
      if (section.sectionKey === 'admin') return isAdmin;
      return section.items.length > 0;
    });

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        className={cn(
          'flex shrink-0 flex-col overflow-hidden rounded-[28px] border border-sidebar-border/70 bg-sidebar/92 shadow-[0_20px_50px_-28px_rgba(0,0,0,0.28)] backdrop-blur-xl',
          'transition-all duration-300 ease-in-out',
          collapsed ? 'w-[var(--sidebar-collapsed-width)]' : 'w-[var(--sidebar-width)]',
        )}
        style={{ height: 'calc(100vh - var(--header-height) - 24px)' }}
      >
        <div className={cn('border-b border-sidebar-border/60', collapsed ? 'px-2 py-3' : 'px-3 pb-3 pt-4')}>
          {collapsed ? (
            <div className="flex justify-center">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="size-4" />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-primary/15 bg-[linear-gradient(135deg,hsl(var(--primary)/0.12),transparent_70%)] px-3.5 py-3.5">
              <div className="flex items-start gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-background/85 text-primary shadow-sm">
                  <Sparkles className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold tracking-tight text-foreground">{t('控制台工作区')}</p>
                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{t('高频入口已前置，重要页面会保持更强视觉权重')}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <ScrollArea className="min-h-0 flex-1 py-3">
          <div className="space-y-1.5">
            {filteredSections.map((section, sectionIdx) => (
              <div key={section.sectionKey}>
                {/* 分区分割线（非第一项） */}
                {sectionIdx > 0 && (
                  <div className="mx-4 my-3 h-px bg-border/50" />
                )}

                {/* 分区标题 */}
                {!collapsed && (
                  <div className="px-4 pb-1 pt-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                      {section.title}
                    </span>
                  </div>
                )}

                {/* 导航项 */}
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <NavItemLink
                      key={item.href}
                      item={item}
                      collapsed={collapsed}
                      active={isActive(item.href)}
                      sectionKey={section.sectionKey}
                      onNavigate={onNavigate}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* 收起按钮 */}
        <div className="border-t border-sidebar-border/60 p-2.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={onToggleCollapsed}
                className={cn(
                  'h-10 w-full rounded-2xl border-border/60 bg-background/70 text-muted-foreground hover:bg-background hover:text-foreground',
                  collapsed ? 'justify-center px-0' : 'justify-start gap-2 px-3.5',
                )}
              >
                <ChevronLeft
                  className={cn(
                    'size-4 shrink-0 transition-transform duration-300',
                    collapsed && 'rotate-180',
                  )}
                />
                {!collapsed && (
                  <span className="text-xs">{t('收起')}</span>
                )}
              </Button>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right" className="text-xs">
                {t('展开侧边栏')}
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
