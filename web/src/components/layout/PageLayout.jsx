/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import { Layout } from '@douyinfe/semi-ui';
import App from '../../App';
import { ToastContainer } from 'react-toastify';
import React, { Suspense, lazy, useContext, useEffect, useState } from 'react';
import { useIsMobile } from '../../hooks/common/useIsMobile';
import { useSidebarCollapsed } from '../../hooks/common/useSidebarCollapsed';
import { useTranslation } from 'react-i18next';
import { API } from '../../helpers/api';
import { getLogo, showError } from '../../helpers/utils';
import {
  getStatusCacheAge,
  getUserData,
  readStatusData,
  setStatusData,
} from '../../helpers/data';
import { UserContext } from '../../context/User';
import { StatusContext } from '../../context/Status';
import { useLocation } from 'react-router-dom';
import { normalizeLanguage } from '../../i18n/language';
const { Sider, Content, Header } = Layout;
const HeaderBar = lazy(() => import('./headerbar'));
const FooterBar = lazy(() => import('./Footer'));
const SiderBar = lazy(() => import('./SiderBar'));
const STATUS_CACHE_MAX_AGE = 5 * 60 * 1000;
const SITE_URL = (
  import.meta.env.VITE_PUBLIC_SITE_URL || 'https://nbility.dev'
).replace(/\/$/, '');
const DEFAULT_PUBLIC_ICON = `${SITE_URL}/logo.svg`;
const DEFAULT_PUBLIC_TOUCH_ICON = `${SITE_URL}/logo.svg`;

const PageLayout = () => {
  const [userState, userDispatch] = useContext(UserContext);
  const [, statusDispatch] = useContext(StatusContext);
  const isMobile = useIsMobile();
  const [collapsed, , setCollapsed] = useSidebarCollapsed();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { i18n } = useTranslation();
  const location = useLocation();

  const cardProPages = [
    '/console/channel',
    '/console/ecomagent',
    '/console/log',
    '/console/redemption',
    '/console/user',
    '/console/token',
    '/console/midjourney',
    '/console/task',
    '/console/models',
    '/console/invoice-admin',
    '/console/r2-storage',
    '/pricing',
  ];

  const shouldHideFooter = cardProPages.includes(location.pathname);

  const shouldInnerPadding =
    location.pathname.includes('/console') &&
    !location.pathname.startsWith('/console/chat') &&
    location.pathname !== '/console/playground' &&
    location.pathname !== '/console/models';

  const enablePageScrollRoutes = [
    '/console/topup',
    '/console/package',
    '/console/invoice',
    '/console/activity-lottery',
  ];
  const shouldEnablePageScroll = enablePageScrollRoutes.includes(
    location.pathname,
  );

  const isConsoleRoute = location.pathname.startsWith('/console');
  const showSider = isConsoleRoute && (!isMobile || drawerOpen);

  const setHeadIcon = (rel, href) => {
    const linkElement = document.head.querySelector(`link[rel="${rel}"]`);
    if (linkElement) {
      linkElement.href = href;
      return;
    }

    const newLink = document.createElement('link');
    newLink.setAttribute('rel', rel);
    newLink.setAttribute('href', href);
    document.head.appendChild(newLink);
  };

  const applyBranding = (status) => {
    if (!isConsoleRoute) {
      setHeadIcon('icon', DEFAULT_PUBLIC_ICON);
      setHeadIcon('shortcut icon', DEFAULT_PUBLIC_ICON);
      setHeadIcon('apple-touch-icon', DEFAULT_PUBLIC_TOUCH_ICON);
      return;
    }

    const logo = status?.logo || getLogo();
    if (!logo) return;

    setHeadIcon('icon', logo);
    setHeadIcon('shortcut icon', logo);
    setHeadIcon('apple-touch-icon', logo);
  };

  useEffect(() => {
    if (isMobile && drawerOpen && collapsed) {
      setCollapsed(false);
    }
  }, [isMobile, drawerOpen, collapsed, setCollapsed]);

  const loadUser = () => {
    const data = getUserData();
    if (data) {
      userDispatch({ type: 'login', payload: data });
    }
  };

  const loadStatus = async () => {
    try {
      const res = await API.get('/api/status');
      const { success, data } = res.data;
      if (success) {
        statusDispatch({ type: 'set', payload: data });
        setStatusData(data);
        applyBranding(data);
      } else {
        showError('Unable to connect to server');
      }
    } catch (error) {
      showError('Failed to load status');
    }
  };

  useEffect(() => {
    loadUser();

    const cachedStatus = readStatusData();
    if (cachedStatus) {
      statusDispatch({ type: 'set', payload: cachedStatus });
      applyBranding(cachedStatus);
    } else {
      applyBranding();
    }

    const cacheAge = getStatusCacheAge();
    const refreshDelay =
      cachedStatus && cacheAge <= STATUS_CACHE_MAX_AGE ? 300 : 0;
    const refreshTask = window.setTimeout(() => {
      loadStatus().catch(console.error);
    }, refreshDelay);

    return () => {
      window.clearTimeout(refreshTask);
    };
  }, [isConsoleRoute]);

  useEffect(() => {
    let preferredLang;

    if (userState?.user?.setting) {
      try {
        const settings = JSON.parse(userState.user.setting);
        preferredLang = normalizeLanguage(settings.language);
      } catch (e) {
        // Ignore parse errors
      }
    }

    if (!preferredLang) {
      const savedLang = localStorage.getItem('i18nextLng');
      if (savedLang) {
        preferredLang = normalizeLanguage(savedLang);
      }
    }

    if (preferredLang) {
      localStorage.setItem('i18nextLng', preferredLang);
      if (
        typeof i18n?.changeLanguage === 'function' &&
        preferredLang !== normalizeLanguage(i18n.language)
      ) {
        i18n.changeLanguage(preferredLang);
      }
    }
  }, [i18n, userState?.user?.setting]);

  return (
    <Layout
      className='app-layout'
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: isMobile || shouldEnablePageScroll ? 'visible' : 'hidden',
      }}
    >
      <Header
        style={{
          padding: 0,
          height: 'auto',
          lineHeight: 'normal',
          position: 'fixed',
          width: '100%',
          top: 0,
          zIndex: 100,
        }}
      >
        <Suspense fallback={<div style={{ height: '64px' }} />}>
          <HeaderBar
            onMobileMenuToggle={() => setDrawerOpen((prev) => !prev)}
            drawerOpen={drawerOpen}
          />
        </Suspense>
      </Header>
      <Layout
        style={{
          overflow: isMobile || shouldEnablePageScroll ? 'visible' : 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {showSider && (
          <Sider
            className='app-sider'
            style={{
              position: 'fixed',
              left: 0,
              top: '64px',
              zIndex: 99,
              border: 'none',
              paddingRight: '0',
              width: 'var(--sidebar-current-width)',
            }}
          >
            <Suspense fallback={null}>
              <SiderBar
                onNavigate={() => {
                  if (isMobile) setDrawerOpen(false);
                }}
              />
            </Suspense>
          </Sider>
        )}
        <Layout
          style={{
            marginLeft: isMobile
              ? '0'
              : showSider
                ? 'var(--sidebar-current-width)'
                : '0',
            flex: '1 1 auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Content
            style={{
              flex: '1 0 auto',
              overflowY: isMobile
                ? 'visible'
                : shouldEnablePageScroll
                  ? 'auto'
                  : 'hidden',
              WebkitOverflowScrolling: 'touch',
              padding: shouldInnerPadding ? (isMobile ? '5px' : '24px') : '0',
              paddingTop: shouldEnablePageScroll
                ? isMobile
                  ? '76px'
                  : '88px'
                : undefined,
              position: 'relative',
            }}
          >
            <App />
          </Content>
          {!shouldHideFooter && (
            <Layout.Footer
              style={{
                flex: '0 0 auto',
                width: '100%',
              }}
            >
              <Suspense fallback={null}>
                <FooterBar />
              </Suspense>
            </Layout.Footer>
          )}
        </Layout>
      </Layout>
      <ToastContainer />
    </Layout>
  );
};

export default PageLayout;
