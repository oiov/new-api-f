'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { BarChart3, Info, BookOpen, Tag } from 'lucide-react';
import { Header } from './header';
import { Sidebar } from './sidebar';
import { Footer } from './footer';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAppLoader } from '@/hooks/use-user-loader';
import { useSidebarCollapsed } from '@/hooks/use-sidebar';
import { useSystemStatus } from '@/context/status-context';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

// Pages where footer should be hidden
const PAGES_WITHOUT_FOOTER = [
  '/console/channel',
  '/console/log',
  '/console/redemption',
  '/console/user',
  '/console/token',
  '/console/midjourney',

  '/console/models',
  '/pricing',
];

function MobileNavSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const status = useSystemStatus();
  const pathname = usePathname();

  const navLinks = [
    { href: '/pricing', icon: BarChart3, label: t('价格方案') },
    { href: '/status', icon: Info, label: t('系统状态') },
    ...(status?.docs_link ? [{ href: '/docs', icon: BookOpen, label: t('开发文档') }] : []),
    ...(status?.subscription_enabled ? [{ href: '/console/package', icon: Tag, label: t('服务套餐') }] : []),
  ];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="left" className="w-64 p-0">
        <SheetHeader className="px-4 py-4 border-b border-border/60">
          <SheetTitle className="text-sm font-semibold text-muted-foreground">
            {t('导航')}
          </SheetTitle>
        </SheetHeader>
        <nav className="p-2 space-y-0.5">
          {navLinks.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                pathname === href
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
              )}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  useAppLoader();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { collapsed, toggleCollapsed } = useSidebarCollapsed();

  // Close drawer when navigating
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const isConsolePage = pathname.startsWith('/console');
  const isFullscreenPage =
    pathname.startsWith('/console/playground') ||
    pathname.startsWith('/console/chat') ||
    pathname === '/console/models';

  const showSidebar = isConsolePage;
  const showFooter = !PAGES_WITHOUT_FOOTER.includes(pathname) && !isFullscreenPage;

  const shouldHavePadding =
    isConsolePage &&
    !isFullscreenPage &&
    !pathname.startsWith('/console/chat');

  // Dynamic margin based on collapsed state
  const sidebarMargin = collapsed
    ? 'md:ml-[52px]'
    : 'md:ml-[224px]';

  return (
    <div className="flex flex-col min-h-screen app-bg">
      <Header
        onMobileMenuToggle={() => setDrawerOpen((prev) => !prev)}
        drawerOpen={drawerOpen}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Desktop sidebar */}
        {showSidebar && !isMobile && (
          <div className="shrink-0 fixed left-0 top-[var(--header-height)] z-30 hidden md:flex h-[calc(100vh-var(--header-height))]">
            <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
          </div>
        )}

        {/* Mobile sidebar (sheet) for console pages */}
        {showSidebar && (
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetContent side="left" className="p-0 w-56">
              <Sidebar
                collapsed={false}
                onToggleCollapsed={() => {}}
                onNavigate={() => setDrawerOpen(false)}
              />
            </SheetContent>
          </Sheet>
        )}

        {/* Mobile nav sheet for non-console pages */}
        {!showSidebar && (
          <MobileNavSheet open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        )}

        {/* Main content */}
        <main
          className={cn(
            'flex flex-col flex-1 min-h-[calc(100vh-var(--header-height))] overflow-auto',
            showSidebar && !isMobile && sidebarMargin,
            'transition-[margin] duration-300',
          )}
        >
          <div
            className={cn(
              'flex-1',
              shouldHavePadding && 'p-4 md:p-6',
            )}
          >
            {children}
          </div>

          {showFooter && <Footer />}
        </main>
      </div>
    </div>
  );
}
