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

import React, { forwardRef, useMemo, useState } from 'react';
import clsx from 'clsx';

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
  } = props;

  const [iframeReady, setIframeReady] = useState(false);

  const safeIframeProps = useMemo(() => {
    const {
      src: _src,
      title: _title,
      onLoad: _onLoad,
      ref: _ref,
      className: _className,
      ...rest
    } = iframeProps || {};
    return rest;
  }, [iframeProps]);

  const handleLoad = (event) => {
    setIframeReady(true);
    onLoad?.(event);
  };

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
      <iframe
        key={src}
        ref={ref}
        src={src}
        title={title}
        onLoad={handleLoad}
        className={clsx('w-full h-full border-none', iframeClassName)}
        {...safeIframeProps}
      />
    </div>
  );
});

export default IframeViewport;
