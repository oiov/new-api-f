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

import React, { useEffect, useRef, useState } from 'react';
import { API, showError } from '../../helpers';
import { Empty } from '@douyinfe/semi-ui';
import {
  IllustrationConstruction,
  IllustrationConstructionDark,
} from '@douyinfe/semi-illustrations';
import { useTranslation } from 'react-i18next';
import { useActualTheme } from '../../context/Theme';
import IframeViewport from '../../components/common/IframeViewport';
import SeoMeta from '../../components/common/seo/SeoMeta';
import { getStatusSeo } from '../../helpers/seo';

const ABOUT_CACHE_KEY = 'about_cache_v2';
const ABOUT_CACHE_TTL = 10 * 60 * 1000;

async function parseMarkdownToHtml(content) {
  const { marked } = await import('marked');
  return marked.parse(content);
}

function readAboutCache() {
  try {
    const raw = localStorage.getItem(ABOUT_CACHE_KEY);
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

function writeAboutCache(content) {
  localStorage.setItem(
    ABOUT_CACHE_KEY,
    JSON.stringify({
      content,
      timestamp: Date.now(),
    }),
  );
}

const About = () => {
  const { t, i18n } = useTranslation();
  const actualTheme = useActualTheme();
  const iframeRef = useRef(null);
  const [about, setAbout] = useState('');
  const [aboutLoaded, setAboutLoaded] = useState(false);
  const currentYear = new Date().getFullYear();
  const seo = getStatusSeo(i18n.language);

  const syncIframeState = () => {
    try {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (!iframeWindow) {
        return;
      }
      iframeWindow.postMessage({ themeMode: actualTheme }, '*');
      iframeWindow.postMessage({ lang: i18n.language }, '*');
    } catch {
      // 关于页允许跨域 iframe，这里无法访问时直接忽略
    }
  };

  const displayAbout = async () => {
    const cached = readAboutCache();
    const hasFreshCache = cached && Date.now() - cached.timestamp <= ABOUT_CACHE_TTL;

    if (cached) {
      setAbout(cached.content);
      setAboutLoaded(true);
    }

    if (hasFreshCache) {
      return;
    }

    try {
      const res = await API.get('/api/about');
      const { success, message, data } = res.data;
      if (success) {
        let aboutContent = data;
        if (!data.startsWith('https://')) {
          aboutContent = await parseMarkdownToHtml(data);
        }
        setAbout(aboutContent);
        writeAboutCache(aboutContent);
      } else if (!cached) {
        showError(message);
        setAbout(t('加载关于内容失败...'));
      }
    } catch (error) {
      if (!cached) {
        showError(error);
        setAbout(t('加载关于内容失败...'));
      }
    } finally {
      setAboutLoaded(true);
    }
  };

  useEffect(() => {
    displayAbout().then();
  }, []);

  useEffect(() => {
    if (about.startsWith('https://')) {
      syncIframeState();
    }
  }, [about, actualTheme, i18n.language]);

  const emptyStyle = {
    padding: '24px',
  };

  const customDescription = (
    <div style={{ textAlign: 'center' }}>
      <p>{t('可在设置页面设置关于内容，支持 HTML & Markdown')}</p>
      {t('New API项目仓库地址：')}
      <a
        href='https://github.com/QuantumNous/new-api'
        target='_blank'
        rel='noopener noreferrer'
        className='!text-semi-color-primary'
      >
        https://github.com/QuantumNous/new-api
      </a>
      <p>
        <a
          href='https://github.com/QuantumNous/new-api'
          target='_blank'
          rel='noopener noreferrer'
          className='!text-semi-color-primary'
        >
          {t('NewAPI')}
        </a>{' '}
        {t('© {{currentYear}}', { currentYear })}{' '}
        <a
          href='https://github.com/QuantumNous'
          target='_blank'
          rel='noopener noreferrer'
          className='!text-semi-color-primary'
        >
          {t('QuantumNous')}
        </a>{' '}
        {t('| 基于')}{' '}
        <a
          href='https://github.com/songquanpeng/one-api/releases/tag/v0.5.4'
          target='_blank'
          rel='noopener noreferrer'
          className='!text-semi-color-primary'
        >
          {t('One API v0.5.4')}
        </a>{' '}
        {t('© 2023')}{' '}
        <a
          href='https://github.com/songquanpeng'
          target='_blank'
          rel='noopener noreferrer'
          className='!text-semi-color-primary'
        >
          {t('JustSong')}
        </a>
      </p>
      <p>
        {t('本项目根据')}
        <a
          href='https://github.com/songquanpeng/one-api/blob/v0.5.4/LICENSE'
          target='_blank'
          rel='noopener noreferrer'
          className='!text-semi-color-primary'
        >
          {t('MIT许可证')}
        </a>
        {t('授权，需在遵守')}
        <a
          href='https://www.gnu.org/licenses/agpl-3.0.html'
          target='_blank'
          rel='noopener noreferrer'
          className='!text-semi-color-primary'
        >
          {t('AGPL v3.0协议')}
        </a>
        {t('的前提下使用。')}
      </p>
    </div>
  );

  return (
    <>
      <SeoMeta {...seo} />
      {about.startsWith('https://') ? (
        <IframeViewport
          ref={iframeRef}
          src={about}
          enableCache={true}
          cacheKey='public-status-frame'
          title={t('关于内容框架')}
          onLoad={() => {
            syncIframeState();
          }}
          loadingText={t('页面加载中...')}
          timeoutText={t('状态页面加载较慢，你可以直接在新窗口打开。')}
          openInNewTabText={t('新窗口打开')}
          continueWaitingText={t('继续等待')}
          className='px-2'
        />
      ) : (
        <div className='mt-[60px] px-2'>
          {aboutLoaded && about === '' ? (
            <div className='flex justify-center items-center h-screen p-8'>
              <Empty
                image={
                  <IllustrationConstruction style={{ width: 150, height: 150 }} />
                }
                darkModeImage={
                  <IllustrationConstructionDark
                    style={{ width: 150, height: 150 }}
                  />
                }
                description={t('管理员暂时未设置任何关于内容')}
                style={emptyStyle}
              >
                {customDescription}
              </Empty>
            </div>
          ) : (
            <div
              style={{ fontSize: 'larger' }}
              dangerouslySetInnerHTML={{ __html: about }}
            ></div>
          )}
        </div>
      )}
    </>
  );
};

export default About;
