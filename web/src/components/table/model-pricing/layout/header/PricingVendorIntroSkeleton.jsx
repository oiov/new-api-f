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

import React, { memo } from 'react';
import { Skeleton } from '@douyinfe/semi-ui';

/**
 * 与新版 PricingVendorIntro 样式对齐的骨架屏
 */
const PricingVendorIntroSkeleton = memo(({ isAllVendors = false, isMobile = false }) => {
  return (
    <>
      {/* 标题区域骨架 */}
      <div className='pricing-vendor-header'>
        <div className='pricing-vendor-header-left'>
          {/* 图标区骨架 */}
          {isAllVendors ? (
            <div style={{ display: 'flex', gap: 6 }}>
              {Array.from({ length: isMobile ? 3 : 5 }).map((_, i) => (
                <Skeleton.Avatar
                  key={i}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    flexShrink: 0,
                  }}
                />
              ))}
            </div>
          ) : (
            <Skeleton.Avatar
              style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0 }}
            />
          )}

          {/* 文字区骨架 */}
          <div className='pricing-vendor-header-text'>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Skeleton.Title style={{ width: isAllVendors ? 100 : 80, height: 18 }} />
              <Skeleton.Paragraph
                rows={1}
                style={{ width: 90, height: 20, borderRadius: 999, margin: 0 }}
              />
            </div>
            <Skeleton.Paragraph
              rows={1}
              style={{ width: 220, height: 14, marginTop: 6 }}
            />
          </div>
        </div>
      </div>

      {/* 搜索栏骨架 */}
      <div className='pricing-search-actions'>
        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          <Skeleton.Input
            style={{ flex: 1, height: 32, borderRadius: 6 }}
          />
          <Skeleton.Button style={{ width: 72, height: 32, borderRadius: 6 }} />
          {isMobile && (
            <Skeleton.Button style={{ width: 72, height: 32, borderRadius: 6 }} />
          )}
        </div>
      </div>
    </>
  );
});

PricingVendorIntroSkeleton.displayName = 'PricingVendorIntroSkeleton';

export default PricingVendorIntroSkeleton;
