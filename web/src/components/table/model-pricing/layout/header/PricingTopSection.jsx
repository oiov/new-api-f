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

import React, { useState, memo } from 'react';
import PricingFilterModal from '../../modal/PricingFilterModal';
import PricingVendorIntroWithSkeleton from './PricingVendorIntroWithSkeleton';
import SearchActions from './SearchActions';

const PricingTopSection = memo(
  ({
    selectedRowKeys,
    copyText,
    handleChange,
    handleCompositionStart,
    handleCompositionEnd,
    isMobile,
    sidebarProps,
    filterVendor,
    filterGroup,
    usableGroup,
    groupRatio,
    handleGroupClick,
    models,
    filteredModels,
    loading,
    searchValue,
    showWithRecharge,
    setShowWithRecharge,
    currency,
    setCurrency,
    siteDisplayType,
    showRatio,
    setShowRatio,
    viewMode,
    setViewMode,
    tokenUnit,
    setTokenUnit,
    t,
    languageVersion,
  }) => {
    const [showFilterModal, setShowFilterModal] = useState(false);

    return (
      <>
        {isMobile ? (
          <>
            <div className='w-full'>
              <SearchActions
                selectedRowKeys={selectedRowKeys}
                copyText={copyText}
                handleChange={handleChange}
                handleCompositionStart={handleCompositionStart}
                handleCompositionEnd={handleCompositionEnd}
                isMobile={isMobile}
                searchValue={searchValue}
                setShowFilterModal={setShowFilterModal}
                showWithRecharge={showWithRecharge}
                setShowWithRecharge={setShowWithRecharge}
                currency={currency}
                setCurrency={setCurrency}
                siteDisplayType={siteDisplayType}
                showRatio={showRatio}
                setShowRatio={setShowRatio}
                viewMode={viewMode}
                setViewMode={setViewMode}
                tokenUnit={tokenUnit}
                setTokenUnit={setTokenUnit}
                t={t}
                languageVersion={languageVersion}
              />
            </div>
            <PricingFilterModal
              visible={showFilterModal}
              onClose={() => setShowFilterModal(false)}
              sidebarProps={sidebarProps}
              t={t}
            />
          </>
        ) : (
          <PricingVendorIntroWithSkeleton
            loading={loading}
            filterVendor={filterVendor}
            filterGroup={filterGroup}
            usableGroup={usableGroup}
            groupRatio={groupRatio}
            handleGroupClick={handleGroupClick}
            models={filteredModels}
            allModels={models}
            t={t}
            selectedRowKeys={selectedRowKeys}
            copyText={copyText}
            handleChange={handleChange}
            handleCompositionStart={handleCompositionStart}
            handleCompositionEnd={handleCompositionEnd}
            isMobile={isMobile}
            searchValue={searchValue}
            setShowFilterModal={setShowFilterModal}
            showWithRecharge={showWithRecharge}
            setShowWithRecharge={setShowWithRecharge}
            currency={currency}
            setCurrency={setCurrency}
            siteDisplayType={siteDisplayType}
            showRatio={showRatio}
            setShowRatio={setShowRatio}
            viewMode={viewMode}
            setViewMode={setViewMode}
            tokenUnit={tokenUnit}
            setTokenUnit={setTokenUnit}
            languageVersion={languageVersion}
          />
        )}
      </>
    );
  },
);

PricingTopSection.displayName = 'PricingTopSection';

export default PricingTopSection;
