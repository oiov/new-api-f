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

import React, { useEffect, useCallback } from 'react';
import { Layout, ImagePreview } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import PricingSidebar from './PricingSidebar';
import PricingContent from './content/PricingContent';
import ModelDetailSideSheet from '../modal/ModelDetailSideSheet';
import { useModelPricingData } from '../../../../hooks/model-pricing/useModelPricingData';
import { useIsMobile } from '../../../../hooks/common/useIsMobile';

// 从 URL params 读取定价页初始值
function readInitialValues(params) {
  const quota = params.get('quota');
  return {
    searchValue: params.get('q') || '',
    filterGroup: params.get('group') || 'all',
    // quota type 可能是数字 0/1，需要显式转换
    filterQuotaType: quota === '0' ? 0 : quota === '1' ? 1 : 'all',
    filterEndpointType: params.get('endpoint') || 'all',
    filterVendor: params.get('vendor') || 'all',
    filterTag: params.get('tag') || 'all',
    currency: params.get('currency') || 'USD',
    tokenUnit: params.get('unit') || 'M',
  };
}

const PricingPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialValues = React.useMemo(() => readInitialValues(searchParams), []);
  const pricingData = useModelPricingData(initialValues);
  const { Sider, Content } = Layout;
  const isMobile = useIsMobile();
  const { i18n } = useTranslation();
  const [showRatio, setShowRatio] = React.useState(false);
  const [viewMode, setViewMode] = React.useState(searchParams.get('view') || 'list');

  // 将当前筛选状态同步回 URL（保留其他 params，如 tab）
  const syncToUrl = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        // 支持 0/false 等 falsy 有效值；仅在等于默认值时删除
        const set = (key, val, def) => {
          if (val !== def && val !== undefined && val !== null) next.set(key, String(val));
          else next.delete(key);
        };
        set('q', pricingData.searchValue, '');
        set('group', pricingData.filterGroup, 'all');
        set('quota', pricingData.filterQuotaType, 'all');
        set('endpoint', pricingData.filterEndpointType, 'all');
        set('vendor', pricingData.filterVendor, 'all');
        set('tag', pricingData.filterTag, 'all');
        set('currency', pricingData.currency, 'USD');
        set('unit', pricingData.tokenUnit, 'M');
        set('view', viewMode, 'list');
        // PricingPage 只在 model-pricing tab 下渲染，确保 tab 参数被清除
        next.delete('tab');
        return next;
      },
      { replace: true },
    );
  }, [
    pricingData.searchValue,
    pricingData.filterGroup,
    pricingData.filterQuotaType,
    pricingData.filterEndpointType,
    pricingData.filterVendor,
    pricingData.filterTag,
    pricingData.currency,
    pricingData.tokenUnit,
    viewMode,
  ]);

  useEffect(() => {
    syncToUrl();
  }, [syncToUrl]);

  const allProps = {
    ...pricingData,
    showRatio,
    setShowRatio,
    viewMode,
    setViewMode,
    languageVersion: i18n.language,
  };

  return (
    <div>
      <Layout className='pricing-layout'>
        {!isMobile && (
          <Sider className='pricing-scroll-hide pricing-sidebar'>
            <PricingSidebar {...allProps} />
          </Sider>
        )}

        <Content className='pricing-scroll-hide pricing-content'>
          <PricingContent
            {...allProps}
            isMobile={isMobile}
            sidebarProps={allProps}
          />
        </Content>
      </Layout>

      <ImagePreview
        src={pricingData.modalImageUrl}
        visible={pricingData.isModalOpenurl}
        onVisibleChange={(visible) => pricingData.setIsModalOpenurl(visible)}
      />

      <ModelDetailSideSheet
        visible={pricingData.showModelDetail}
        onClose={pricingData.closeModelDetail}
        modelData={pricingData.selectedModel}
        groupRatio={pricingData.groupRatio}
        usableGroup={pricingData.usableGroup}
        currency={pricingData.currency}
        siteDisplayType={pricingData.siteDisplayType}
        tokenUnit={pricingData.tokenUnit}
        displayPrice={pricingData.displayPrice}
        showRatio={allProps.showRatio}
        vendorsMap={pricingData.vendorsMap}
        endpointMap={pricingData.endpointMap}
        autoGroups={pricingData.autoGroups}
        t={pricingData.t}
      />
    </div>
  );
};

export default PricingPage;
