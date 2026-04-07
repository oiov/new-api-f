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
    text: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    activeBg: 'bg-blue-100/60 dark:bg-blue-800/30',
    dot: 'bg-blue-500',
  },
  personal: {
    text: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    activeBg: 'bg-emerald-100/60 dark:bg-emerald-800/30',
    dot: 'bg-emerald-500',
  },
  public: {
    text: 'text-slate-500 dark:text-slate-400',
    bg: 'bg-slate-50 dark:bg-slate-800/30',
    activeBg: 'bg-slate-100/60 dark:bg-slate-700/30',
    dot: 'bg-slate-400',
  },
  admin: {
    text: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    activeBg: 'bg-orange-100/60 dark:bg-orange-800/30',
    dot: 'bg-orange-500',
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
        'flex items-center gap-2.5 rounded-lg text-[13px] font-medium transition-all duration-150',
        'mx-1.5',
        collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2',
        active
          ? cn('text-primary', colors.activeBg)
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
      )}
    >
      {/* 图标容器 */}
      <span
        className={cn(
          'shrink-0 flex items-center justify-center rounded-md transition-colors',
          collapsed ? 'size-5' : 'size-[18px]',
          active ? cn(colors.text, colors.bg) : 'text-current',
          active && !collapsed ? 'p-[3px]' : '',
        )}
      >
        {item.icon}
      </span>

      {!collapsed && (
        <>
          <span className="truncate leading-snug">{item.label}</span>
          {item.badge && (
            <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
              {item.badge}
            </span>
          )}
        </>
      )}

      {/* 激活指示器 */}
      {active && !collapsed && (
        <span className={cn('ml-auto size-1.5 rounded-full shrink-0', colors.dot)} />
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
            label: t('套餐管理'),
            href: '/console/package',
            icon: <Package className="size-full" />,
            hidden: !status?.subscription_enabled,
          },
          {
            label: t('我的订阅'),
            href: '/console/subscription',
            icon: <Crown className="size-full" />,
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
          'flex flex-col bg-sidebar border-r border-sidebar-border',
          'transition-all duration-300 ease-in-out overflow-hidden shrink-0',
          collapsed ? 'w-[var(--sidebar-collapsed-width)]' : 'w-[var(--sidebar-width)]',
        )}
        style={{ height: 'calc(100vh - var(--header-height))' }}
      >
        <ScrollArea className="flex-1 min-h-0 py-2">
          <div className="space-y-0.5">
            {filteredSections.map((section, sectionIdx) => (
              <div key={section.sectionKey}>
                {/* 分区分割线（非第一项） */}
                {sectionIdx > 0 && (
                  <div className="mx-3 my-2 h-px bg-border/50" />
                )}

                {/* 分区标题 */}
                {!collapsed && (
                  <div className="px-4 pt-1 pb-0.5">
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
        <div className="p-2 border-t border-sidebar-border/60">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleCollapsed}
                className={cn(
                  'w-full h-8 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent',
                  collapsed ? 'justify-center px-0' : 'justify-start gap-2 px-3',
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
