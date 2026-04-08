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

import React, {
  Suspense,
  lazy,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { API } from '../../helpers/api';
import { showError, copy, showSuccess } from '../../helpers/utils';
import { useIsMobile } from '../../hooks/common/useIsMobile';
import { API_ENDPOINTS } from '../../constants/common.constant';
import { StatusContext } from '../../context/Status';
import { useActualTheme } from '../../context/Theme';
import { useTranslation } from 'react-i18next';
import IframeViewport from '../../components/common/IframeViewport';
import SeoMeta from '../../components/common/seo/SeoMeta';
import {
  buildOrganizationJsonLd,
  buildServiceJsonLd,
  buildWebsiteJsonLd,
  getHomeSeo,
} from '../../helpers/seo';
const NoticeModal = lazy(() => import('../../components/layout/NoticeModal'));
const DefaultHomeLanding = lazy(() => import('./DefaultHomeLanding'));
const HOME_PAGE_CACHE_KEY = 'home_page_content_cache_v2';
const HOME_PAGE_CACHE_TTL = 5 * 60 * 1000;

async function parseMarkdownToHtml(content) {
  const { marked } = await import('marked');
  return marked.parse(content);
}

function readHomePageCache() {
  try {
    const raw = localStorage.getItem(HOME_PAGE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.content !== 'string' ||
      typeof parsed?.timestamp !== 'number'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeHomePageCache(content) {
  localStorage.setItem(
    HOME_PAGE_CACHE_KEY,
    JSON.stringify({
      content,
      timestamp: Date.now(),
    }),
  );
}

const Home = () => {
  const { t, i18n } = useTranslation();
  const [statusState] = useContext(StatusContext);
  const actualTheme = useActualTheme();
  const iframeRef = useRef(null);
  const [homePageContentLoaded, setHomePageContentLoaded] = useState(false);
  const [homePageContent, setHomePageContent] = useState('');
  const [noticeVisible, setNoticeVisible] = useState(false);
  const isMobile = useIsMobile();
  const isDemoSiteMode = statusState?.status?.demo_site_enabled || false;
  const docsLink = statusState?.status?.docs_link || '';
  const serverAddress =
    statusState?.status?.server_address || `${window.location.origin}`;
  const endpointItems = API_ENDPOINTS.map((e) => ({ value: e }));
  const [endpointIndex, setEndpointIndex] = useState(0);
  const seo = getHomeSeo(i18n.language);
  const seoJsonLd = [
    buildOrganizationJsonLd(),
    buildWebsiteJsonLd(i18n.language),
    buildServiceJsonLd(i18n.language),
  ];

  const syncIframeState = () => {
    try {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (!iframeWindow) {
        return;
      }
      iframeWindow.postMessage({ themeMode: actualTheme }, '*');
      iframeWindow.postMessage({ lang: i18n.language }, '*');
    } catch {
      // 跨域 iframe 无法稳定访问时直接忽略
    }
  };

  const displayHomePageContent = async () => {
    const cached = readHomePageCache();
    const hasFreshCache =
      cached && Date.now() - cached.timestamp <= HOME_PAGE_CACHE_TTL;

    if (cached) {
      setHomePageContent(cached.content);
      setHomePageContentLoaded(true);
    }

    if (hasFreshCache) {
      return;
    }

    try {
      const res = await API.get('/api/home_page_content');
      const { success, message, data } = res.data;
      if (success) {
        let content = data;
        if (!data.startsWith('https://')) {
          content = await parseMarkdownToHtml(data);
        }
        setHomePageContent(content);
        writeHomePageCache(content);
      } else if (!cached) {
        showError(message);
        setHomePageContent('加载首页内容失败...');
      }
    } catch (error) {
      if (!cached) {
        showError(error);
        setHomePageContent('加载首页内容失败...');
      }
    } finally {
      setHomePageContentLoaded(true);
    }
  };

  const handleCopyBaseURL = async () => {
    const ok = await copy(serverAddress);
    if (ok) {
      showSuccess(t('已复制到剪切板'));
    }
  };

  useEffect(() => {
    const checkNoticeAndShow = async () => {
      const lastCloseDate = localStorage.getItem('notice_close_date');
      const today = new Date().toDateString();
      if (lastCloseDate !== today) {
        // 后台为空时 NoticeModal 会自动 fallback 到默认文件，所以始终弹出
        try {
          await API.get('/api/notice');
        } catch (error) {
          console.error('获取公告失败:', error);
        }
        setNoticeVisible(true);
      }
    };

    checkNoticeAndShow();
  }, []);

  useEffect(() => {
    displayHomePageContent().then();
  }, []);

  useEffect(() => {
    if (homePageContent.startsWith('https://')) {
      syncIframeState();
    }
  }, [actualTheme, i18n.language, homePageContent]);

  useEffect(() => {
    const timer = setInterval(() => {
      setEndpointIndex((prev) => (prev + 1) % endpointItems.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [endpointItems.length]);

  return (
    <div className='w-full overflow-x-hidden'>
      <SeoMeta {...seo} jsonLd={seoJsonLd} />
      {noticeVisible && (
        <Suspense fallback={null}>
          <NoticeModal
            visible={noticeVisible}
            onClose={() => setNoticeVisible(false)}
            isMobile={isMobile}
          />
        </Suspense>
      )}
      {homePageContentLoaded && homePageContent === '' ? (
        <Suspense fallback={null}>
          <DefaultHomeLanding
            t={t}
            isMobile={isMobile}
            isChinese={i18n.language.startsWith('zh')}
            serverAddress={serverAddress}
            endpointItems={endpointItems}
            endpointIndex={endpointIndex}
            setEndpointIndex={setEndpointIndex}
            handleCopyBaseURL={handleCopyBaseURL}
            docsLink={docsLink}
            isDemoSiteMode={isDemoSiteMode}
            version={statusState?.status?.version}
          />
        </Suspense>
      ) : (
        <div className='overflow-x-hidden w-full'>
          {homePageContent.startsWith('https://') ? (
            <IframeViewport
              ref={iframeRef}
              src={homePageContent}
              enableCache={true}
              cacheKey='public-home-frame'
              title={t('首页内容框架')}
              onLoad={() => {
                syncIframeState();
              }}
              loadingText={t('页面加载中...')}
              timeoutText={t('首页内容加载较慢，你可以直接在新窗口打开。')}
              openInNewTabText={t('新窗口打开')}
              continueWaitingText={t('继续等待')}
            />
          ) : (
            <div
              className='mt-[60px]'
              dangerouslySetInnerHTML={{ __html: homePageContent }}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default Home;
