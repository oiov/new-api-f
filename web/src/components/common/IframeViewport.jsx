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
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import { Button } from '@douyinfe/semi-ui';

const DEFAULT_TIMEOUT_MS = 4000;
const iframeCache = new Map();

function getOrigin(src) {
  if (!src) {
    return '';
  }

  try {
    return new URL(src, window.location.href).origin;
  } catch {
    return '';
  }
}

function ensureResourceHint(rel, href, crossOrigin) {
  if (!href) {
    return;
  }

  const selector = `link[rel="${rel}"][href="${href}"]`;
  let link = document.head.querySelector(selector);
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    link.href = href;
    if (crossOrigin) {
      link.crossOrigin = 'anonymous';
    }
    document.head.appendChild(link);
  }
}

function assignRef(ref, value) {
  if (!ref) {
    return;
  }

  if (typeof ref === 'function') {
    ref(value);
    return;
  }

  ref.current = value;
}

function applyIframeAttributes(iframe, {
  src,
  title,
  iframeClassName,
  loading,
  safeIframeProps,
}) {
  iframe.title = title || '';
  iframe.className = clsx('w-full h-full border-none', iframeClassName);
  iframe.setAttribute('loading', loading || 'eager');

  Object.entries(safeIframeProps || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false) {
      iframe.removeAttribute(key);
      return;
    }

    if (value === true) {
      iframe.setAttribute(key, '');
      return;
    }

    iframe.setAttribute(key, String(value));
  });

  if (iframe.src !== src) {
    iframe.src = src;
  }
}

const IframeViewport = forwardRef(function IframeViewport(props, ref) {
  const {
    src,
    title,
    onLoad,
    className,
    iframeClassName,
    iframeProps,
    loadingText = '页面加载中...',
    showLoading = true,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    timeoutText = '加载时间较长，你可以直接在新窗口打开。',
    openInNewTabText = '新窗口打开',
    continueWaitingText = '继续等待',
    loading = 'eager',
    enableCache = false,
    cacheKey,
  } = props;

  const containerRef = useRef(null);
  const iframeRef = useRef(null);
  const onLoadRef = useRef(onLoad);
  const [iframeReady, setIframeReady] = useState(false);
  const [showTimeoutFallback, setShowTimeoutFallback] = useState(false);
  const iframeOrigin = useMemo(() => getOrigin(src), [src]);
  const resolvedCacheKey = cacheKey || src;

  const safeIframeProps = useMemo(() => {
    const {
      src: _src,
      title: _title,
      onLoad: _onLoad,
      ref: _ref,
      className: _className,
      loading: _loading,
      ...rest
    } = iframeProps || {};
    return rest;
  }, [iframeProps]);

  useEffect(() => {
    onLoadRef.current = onLoad;
  }, [onLoad]);

  useEffect(() => {
    let iframe = null;
    let cachedEntry = null;
    const container = containerRef.current;

    if (!container || !src) {
      assignRef(ref, null);
      iframeRef.current = null;
      setIframeReady(false);
      return undefined;
    }

    if (enableCache && resolvedCacheKey) {
      cachedEntry = iframeCache.get(resolvedCacheKey);
    }

    if (cachedEntry?.iframe) {
      iframe = cachedEntry.iframe;
      setIframeReady(Boolean(cachedEntry.loaded));
    } else {
      iframe = document.createElement('iframe');
      iframe.style.border = 'none';
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      setIframeReady(false);

      if (enableCache && resolvedCacheKey) {
        iframeCache.set(resolvedCacheKey, {
          iframe,
          loaded: false,
        });
      }
    }

    applyIframeAttributes(iframe, {
      src,
      title,
      iframeClassName,
      loading,
      safeIframeProps,
    });

    const handleLoad = (event) => {
      setIframeReady(true);
      setShowTimeoutFallback(false);
      if (enableCache && resolvedCacheKey) {
        iframeCache.set(resolvedCacheKey, {
          iframe,
          loaded: true,
        });
      }
      onLoadRef.current?.(event);
    };

    iframe.addEventListener('load', handleLoad);
    container.replaceChildren(iframe);
    iframeRef.current = iframe;
    assignRef(ref, iframe);
    setShowTimeoutFallback(false);

    return () => {
      iframe.removeEventListener('load', handleLoad);
      if (!enableCache || !resolvedCacheKey) {
        iframe.remove();
      } else if (container.contains(iframe)) {
        container.removeChild(iframe);
      }
      iframeRef.current = null;
      assignRef(ref, null);
    };
  }, [
    enableCache,
    iframeClassName,
    loading,
    ref,
    resolvedCacheKey,
    safeIframeProps,
    src,
    title,
  ]);

  useEffect(() => {
    if (
      !iframeOrigin ||
      iframeOrigin === window.location.origin ||
      !src
    ) {
      return;
    }

    ensureResourceHint('dns-prefetch', iframeOrigin);
    ensureResourceHint('preconnect', iframeOrigin, true);
  }, [iframeOrigin, src]);

  useEffect(() => {
    if (!showLoading || iframeReady || !src || timeoutMs <= 0) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setShowTimeoutFallback(true);
    }, timeoutMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [iframeReady, showLoading, src, timeoutMs]);

  return (
    <div
      className={clsx('relative w-full iframe-viewport-dvh', className)}
      style={{ height: 'calc(100vh - 64px)' }}
    >
      <style>
        {`@supports (height: 100dvh){.iframe-viewport-dvh{height:calc(100dvh - 64px)!important;}}`}
      </style>
      {showLoading && !iframeReady && (
        <div className='absolute inset-0 z-10 flex items-center justify-center bg-semi-color-bg-0'>
          <div className='flex flex-col items-center gap-3 text-semi-color-text-2'>
            <div className='h-10 w-10 animate-spin rounded-full border-2 border-semi-color-border border-t-semi-color-primary' />
            <span>{loadingText}</span>
          </div>
        </div>
      )}
      {showTimeoutFallback && !iframeReady && (
        <div className='absolute inset-x-4 bottom-4 z-20 rounded-2xl border border-semi-color-border bg-semi-color-bg-0/95 p-4 shadow-lg backdrop-blur'>
          <div className='flex flex-col gap-3 text-sm text-semi-color-text-1 sm:flex-row sm:items-center sm:justify-between'>
            <span>{timeoutText}</span>
            <div className='flex items-center gap-2'>
              <Button
                theme='solid'
                type='primary'
                size='small'
                onClick={() => {
                  window.open(src, '_blank', 'noopener,noreferrer');
                }}
              >
                {openInNewTabText}
              </Button>
              <Button
                theme='borderless'
                type='tertiary'
                size='small'
                onClick={() => {
                  setShowTimeoutFallback(false);
                }}
              >
                {continueWaitingText}
              </Button>
            </div>
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        className='w-full h-full'
      />
    </div>
  );
});

export default IframeViewport;
