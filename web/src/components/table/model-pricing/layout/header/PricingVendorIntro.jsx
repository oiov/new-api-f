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

import React, { useState, useMemo, useCallback, memo } from 'react';
import { Tag, Avatar, Button, Modal, Typography, Tooltip } from '@douyinfe/semi-ui';
import { IconInfoCircle, IconRefresh } from '@douyinfe/semi-icons';
import { getLobeHubIcon } from '../../../../../helpers/providerIcons';
import SearchActions from './SearchActions';

const { Paragraph, Text } = Typography;

const UNKNOWN_VENDOR = 'unknown';

// ---------- helpers ----------

const getVendorDisplayName = (vendorName, t) =>
  vendorName === UNKNOWN_VENDOR ? t('未知供应商') : vendorName;

const buildVendorInfo = (allModels, models, t) => {
  const vendorMap = new Map();
  let unknownCount = 0;

  const source = allModels.length > 0 ? allModels : models;
  source.forEach((model) => {
    if (model.vendor_name) {
      const cur = vendorMap.get(model.vendor_name);
      if (cur) {
        cur.count++;
      } else {
        vendorMap.set(model.vendor_name, {
          name: model.vendor_name,
          icon: model.vendor_icon || null,
          description: model.vendor_description || '',
          count: 1,
        });
      }
    } else {
      unknownCount++;
    }
  });

  const list = Array.from(vendorMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  if (unknownCount > 0) {
    list.push({
      name: UNKNOWN_VENDOR,
      icon: null,
      description: t(
        '包含来自未知或未标明供应商的AI模型，这些模型可能来自小型供应商或开源项目。',
      ),
      count: unknownCount,
    });
  }

  return list;
};

// ---------- sub-components ----------

/** 供应商图标容器 */
const VendorIconBox = ({ vendor, size = 40, accentColor, t }) => {
  const inner = useMemo(() => {
    if (!vendor) return null;
    if (vendor.icon) return getLobeHubIcon(vendor.icon, size - 8);
    return null;
  }, [vendor, size]);

  const initials = vendor
    ? vendor.name === UNKNOWN_VENDOR
      ? '?'
      : vendor.name.slice(0, 2).toUpperCase()
    : 'AI';

  return (
    <Tooltip content={vendor ? getVendorDisplayName(vendor.name, t) : ''}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 12,
          backgroundColor: accentColor + '18',
          border: `1.5px solid ${accentColor}30`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {inner || (
          <Avatar
            size='small'
            style={{
              backgroundColor: accentColor + '28',
              color: accentColor,
              fontWeight: 700,
              fontSize: size < 36 ? 10 : 13,
            }}
          >
            {initials}
          </Avatar>
        )}
      </div>
    </Tooltip>
  );
};

/** 轮播供应商图标行（全部供应商时） */
const VendorIconRow = ({ vendorInfo, maxShow = 6, accentColor, t }) => {
  const visible = vendorInfo.slice(0, maxShow);
  const remaining = vendorInfo.length - maxShow;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {visible.map((v) => (
        <VendorIconBox
          key={v.name}
          vendor={v}
          size={32}
          accentColor={accentColor}
          t={t}
        />
      ))}
      {remaining > 0 && (
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            backgroundColor: accentColor + '14',
            border: `1.5px solid ${accentColor}25`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 600,
            color: accentColor,
          }}
        >
          +{remaining}
        </div>
      )}
    </div>
  );
};

// ---------- main component ----------

const PricingVendorIntro = memo(
  ({
    filterVendor,
    models = [],
    allModels = [],
    t,
    selectedRowKeys = [],
    copyText,
    handleChange,
    handleCompositionStart,
    handleCompositionEnd,
    isMobile = false,
    searchValue = '',
    setShowFilterModal,
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
    languageVersion,
  }) => {
    const [descModalVisible, setDescModalVisible] = useState(false);
    const [descModalContent, setDescModalContent] = useState('');

    const vendorInfo = useMemo(
      () => buildVendorInfo(allModels, models, t),
      [allModels, models, t],
    );

    const isAllVendors = filterVendor === 'all';

    // 当前展示的供应商对象
    const currentVendor = useMemo(() => {
      if (isAllVendors) return null;
      return (
        vendorInfo.find((v) => v.name === filterVendor) || null
      );
    }, [isAllVendors, vendorInfo, filterVendor]);

    // 主题色
    const accentColor = isAllVendors ? '#6366f1' : '#10b981';

    // 标题
    const headerTitle = isAllVendors
      ? t('全部供应商')
      : currentVendor
        ? getVendorDisplayName(currentVendor.name, t)
        : filterVendor;

    // 描述
    const description = useMemo(() => {
      if (isAllVendors) {
        return t(
          '查看所有可用的AI模型供应商，包括众多知名供应商的模型。',
        );
      }
      if (!currentVendor) return '';
      return (
        currentVendor.description ||
        t('该供应商提供多种AI模型，适用于不同的应用场景。')
      );
    }, [isAllVendors, currentVendor, t]);

    const handleOpenDesc = useCallback(() => {
      setDescModalContent(description);
      setDescModalVisible(true);
    }, [description]);

    const modelCount = models.length;
    const vendorCount = useMemo(
      () => vendorInfo.length,
      [vendorInfo],
    );

    return (
      <>
        {/* ── 企业级标题区域 ── */}
        <div className='pricing-vendor-header'>
          {/* 左侧：图标 + 标题 + 描述 */}
          <div className='pricing-vendor-header-left'>
            {/* 图标区域 */}
            {isAllVendors ? (
              <VendorIconRow
                vendorInfo={vendorInfo}
                maxShow={isMobile ? 3 : 5}
                accentColor={accentColor}
                t={t}
              />
            ) : (
              <VendorIconBox
                vendor={currentVendor}
                size={44}
                accentColor={accentColor}
                t={t}
              />
            )}

            {/* 文字区域 */}
            <div className='pricing-vendor-header-text'>
              <div className='pricing-vendor-header-title-row'>
                <span className='pricing-vendor-header-title'>
                  {headerTitle}
                </span>
                {/* 模型数量 badge */}
                <Tag
                  shape='circle'
                  size='small'
                  style={{
                    backgroundColor: accentColor + '15',
                    color: accentColor,
                    border: `1px solid ${accentColor}30`,
                    fontWeight: 600,
                    fontSize: 11,
                  }}
                >
                  {t('共 {{count}} 个模型', { count: modelCount })}
                </Tag>
                {/* 全部供应商时显示供应商数量 */}
                {isAllVendors && vendorCount > 0 && (
                  <Tag
                    shape='circle'
                    size='small'
                    style={{
                      backgroundColor: 'var(--semi-color-bg-2)',
                      color: 'var(--semi-color-text-2)',
                      border: '1px solid var(--semi-color-border)',
                      fontWeight: 500,
                      fontSize: 11,
                    }}
                  >
                    {vendorCount} {t('供应商')}
                  </Tag>
                )}
              </div>

              {/* 描述 */}
              {description && (
                <div className='pricing-vendor-header-desc'>
                  <Text
                    type='tertiary'
                    size='small'
                    ellipsis={{ rows: 1, showTooltip: false }}
                    style={{ maxWidth: '100%' }}
                  >
                    {description}
                  </Text>
                  {description.length > 60 && (
                    <Button
                      size='small'
                      theme='borderless'
                      type='tertiary'
                      icon={<IconInfoCircle size='small' />}
                      onClick={handleOpenDesc}
                      style={{
                        padding: '0 4px',
                        height: 20,
                        flexShrink: 0,
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 右侧预留区 — 将来可加入操作按钮 */}
        </div>

        {/* ── 搜索 + 操作栏 ── */}
        <div className='pricing-search-actions'>
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

        {/* 描述弹窗 */}
        <Modal
          title={
            isAllVendors
              ? t('全部供应商')
              : getVendorDisplayName(currentVendor?.name || '', t)
          }
          visible={descModalVisible}
          onCancel={() => setDescModalVisible(false)}
          footer={null}
          width={isMobile ? '95%' : 560}
          bodyStyle={{ maxHeight: '60vh', overflowY: 'auto' }}
        >
          <Text style={{ fontSize: 14, lineHeight: '1.7' }}>
            {descModalContent}
          </Text>
        </Modal>
      </>
    );
  },
);

PricingVendorIntro.displayName = 'PricingVendorIntro';

export default PricingVendorIntro;
