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

import React, { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';

const MarkdownRenderer = lazy(() => import('./MarkdownRenderer'));

function MarkdownFallback() {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '16px',
        color: 'var(--semi-color-text-2)',
      }}
    >
      <div
        style={{
          width: '16px',
          height: '16px',
          border: '2px solid var(--semi-color-border)',
          borderTop: '2px solid var(--semi-color-primary)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }}
      />
      {t('正在渲染...')}
    </div>
  );
}

const LazyMarkdownRenderer = (props) => {
  return (
    <Suspense fallback={<MarkdownFallback />}>
      <MarkdownRenderer {...props} />
    </Suspense>
  );
};

export default LazyMarkdownRenderer;
