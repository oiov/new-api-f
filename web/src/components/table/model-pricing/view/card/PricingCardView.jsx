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

import React from 'react';
import {
  Card,
  Tag,
  Tooltip,
  Checkbox,
  Empty,
  Pagination,
  Button,
} from '@douyinfe/semi-ui';
import { IconHelpCircle } from '@douyinfe/semi-icons';
import { Copy } from 'lucide-react';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import {
  stringToColor,
  calculateModelPrice,
  getModelPriceItems,
} from '../../../../../helpers';
import { getLobeHubIcon } from '../../../../../helpers/providerIcons';
import PricingCardSkeleton from './PricingCardSkeleton';
import { useMinimumLoadingTime } from '../../../../../hooks/common/useMinimumLoadingTime';
import { renderLimitedItems } from '../../../../common/ui/RenderUtils';
import { useIsMobile } from '../../../../../hooks/common/useIsMobile';

const getModelKey = (model) => model.key ?? model.model_name ?? model.id;

/** 价格类型对应的颜色（输入/输出/缓存分色展示） */
const PRICE_COLORS = {
  input: '#10b981',
  completion: '#f59e0b',
  cache: '#6366f1',
  'create-cache': '#8b5cf6',
  image: '#06b6d4',
  'audio-input': '#ec4899',
  'audio-output': '#f97316',
  'input-ratio': '#10b981',
  'completion-ratio': '#f59e0b',
  'cache-ratio': '#6366f1',
  'create-cache-ratio': '#8b5cf6',
  'image-ratio': '#06b6d4',
  'audio-input-ratio': '#ec4899',
  'audio-output-ratio': '#f97316',
  fixed: 'var(--semi-color-primary)',
};

/** 模型图标容器 */
const ModelIconBox = ({ model }) => {
  const size = 44;

  const inner = (() => {
    if (model?.icon) return getLobeHubIcon(model.icon, 26);
    if (model?.vendor_icon) return getLobeHubIcon(model.vendor_icon, 26);
    return null;
  })();

  const initials = model?.model_name
    ? model.model_name.slice(0, 2).toUpperCase()
    : '?';

  // 从模型名生成确定性色调
  const hue = model?.model_name
    ? [...model.model_name].reduce((s, c) => s + c.charCodeAt(0), 0) % 360
    : 220;

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        backgroundColor: inner
          ? 'var(--semi-color-bg-2)'
          : `hsl(${hue}, 65%, 50%)`,
        border: inner ? '1px solid var(--semi-color-border)' : 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {inner || (
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#fff',
            letterSpacing: '-0.03em',
            lineHeight: 1,
          }}
        >
          {initials}
        </span>
      )}
    </div>
  );
};

/** 计费类型 / 自定义标签行 */
const ModelTags = ({ record, t }) => {
  let billingTag = null;
  if (record.quota_type === 1) {
    billingTag = (
      <Tag
        key='billing'
        shape='circle'
        color={record.billing_unit === 'second' ? 'orange' : 'teal'}
        size='small'
      >
        {record.billing_unit === 'second' ? t('按秒计费') : t('按次计费')}
      </Tag>
    );
  } else if (record.quota_type === 0) {
    billingTag = (
      <Tag key='billing' shape='circle' color='violet' size='small'>
        {t('按量计费')}
      </Tag>
    );
  }

  const customTags = record.tags
    ? record.tags
        .split(',')
        .filter(Boolean)
        .map((tg, idx) => (
          <Tag
            key={`custom-${idx}`}
            shape='circle'
            color={stringToColor(tg)}
            size='small'
          >
            {tg}
          </Tag>
        ))
    : [];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 4,
      }}
    >
      <div>{billingTag}</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {customTags.length > 0 &&
          renderLimitedItems({
            items: customTags.map((tag, idx) => ({
              key: `custom-${idx}`,
              element: tag,
            })),
            renderItem: (item) => item.element,
            maxDisplay: 3,
          })}
      </div>
    </div>
  );
};

/** 价格信息区块 */
const PriceBlock = ({ priceData, siteDisplayType, t }) => {
  const items = getModelPriceItems(priceData, t, siteDisplayType);
  if (!items || items.length === 0) return null;

  return (
    <div
      style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 2 }}
    >
      {items.map((item) => (
        <div
          key={item.key}
          style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}
        >
          <span className='pricing-price-label'>{item.label}:</span>
          <span
            style={{
              color: PRICE_COLORS[item.key] || 'var(--semi-color-text-2)',
              fontWeight: 600,
              fontSize: 12,
              letterSpacing: '-0.01em',
            }}
          >
            {item.value}
            <span className='pricing-price-suffix'>{item.suffix}</span>
          </span>
        </div>
      ))}
    </div>
  );
};

const getModelVendorName = (model, t) =>
  model?.vendor_name || model?.owned_by || t('未知供应商');

// ─────────────────────────────────────────────

const PricingCardView = ({
  filteredModels,
  loading,
  rowSelection,
  pageSize,
  setPageSize,
  currentPage,
  setCurrentPage,
  selectedGroup,
  groupRatio,
  copyText,
  setModalImageUrl,
  setIsModalOpenurl,
  currency,
  siteDisplayType,
  tokenUnit,
  displayPrice,
  showRatio,
  t,
  selectedRowKeys = [],
  setSelectedRowKeys,
  openModelDetail,
}) => {
  const showSkeleton = useMinimumLoadingTime(loading);
  const isMobile = useIsMobile();

  const startIndex = (currentPage - 1) * pageSize;
  const paginatedModels = filteredModels.slice(
    startIndex,
    startIndex + pageSize,
  );

  const handleCheckboxChange = (model, checked) => {
    if (!setSelectedRowKeys) return;
    const modelKey = getModelKey(model);
    const newKeys = checked
      ? Array.from(new Set([...selectedRowKeys, modelKey]))
      : selectedRowKeys.filter((k) => k !== modelKey);
    setSelectedRowKeys(newKeys);
    rowSelection?.onChange?.(newKeys, null);
  };

  if (showSkeleton) {
    return (
      <PricingCardSkeleton
        rowSelection={!!rowSelection}
        showRatio={showRatio}
      />
    );
  }

  if (!filteredModels || filteredModels.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '80px 0',
        }}
      >
        <Empty
          image={<IllustrationNoResult style={{ width: 150, height: 150 }} />}
          darkModeImage={
            <IllustrationNoResultDark style={{ width: 150, height: 150 }} />
          }
          description={t('搜索无结果')}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: '14px 14px 0' }}>
      <div className='pricing-card-grid'>
        {paginatedModels.map((model, index) => {
          const modelKey = getModelKey(model);
          const isSelected = selectedRowKeys.includes(modelKey);

          const priceData = calculateModelPrice({
            record: model,
            selectedGroup,
            groupRatio,
            tokenUnit,
            displayPrice,
            currency,
            quotaDisplayType: siteDisplayType,
          });

          const hue = model?.model_name
            ? [...model.model_name].reduce((s, c) => s + c.charCodeAt(0), 0) % 360
            : 220;

          const accentColor = `hsl(${hue}, 65%, 52%)`;

          return (
            <Card
              key={modelKey || index}
              className={`pricing-model-card${isSelected ? ' pricing-model-card--selected' : ''}`}
              style={{
                '--card-accent': isSelected
                  ? 'var(--semi-color-primary)'
                  : accentColor,
              }}
              bodyStyle={{ padding: '16px 18px' }}
              onClick={() => openModelDetail && openModelDetail(model)}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                  }}
                >
                  <ModelIconBox model={model} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className='pricing-model-card__chips'>
                      <Tag color='white' shape='circle' size='small'>
                        {getModelVendorName(model, t)}
                      </Tag>
                      {model?.group && (
                        <Tag color='blue' shape='circle' size='small'>
                          {model.group}
                        </Tag>
                      )}
                    </div>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 15,
                        color: 'var(--semi-color-text-0)',
                        lineHeight: '1.4',
                        letterSpacing: '-0.2px',
                        wordBreak: 'break-word',
                      }}
                      title={model.model_name}
                      className='pricing-model-card__title'
                    >
                      {model.model_name}
                    </div>
                    <PriceBlock
                      priceData={priceData}
                      siteDisplayType={siteDisplayType}
                      t={t}
                    />
                  </div>

                  {/* 右侧操作区 */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      flexShrink: 0,
                    }}
                  >
                    <Button
                      size='small'
                      theme='borderless'
                      type='tertiary'
                      icon={<Copy size={12} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        copyText(model.model_name);
                      }}
                    />
                    {rowSelection && (
                      <Checkbox
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleCheckboxChange(model, e.target.checked);
                        }}
                      />
                    )}
                  </div>
                </div>

                {/* ── 描述（可选）── */}
                {model.description && (
                  <p
                    style={{
                      fontSize: 12,
                      color: 'var(--semi-color-text-2)',
                      margin: 0,
                      lineHeight: '1.6',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      minHeight: 38,
                    }}
                  >
                    {model.description}
                  </p>
                )}

                <div className='pricing-model-card__meta-grid'>
                  <div
                    className='pricing-model-card__meta-item'
                    style={{
                      borderRadius: 12,
                      padding: '8px 10px',
                      background:
                        'color-mix(in srgb, var(--semi-color-fill-0) 82%, #ffffff 18%)',
                      border:
                        '1px solid color-mix(in srgb, var(--semi-color-border) 72%, transparent 28%)',
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--semi-color-text-3)' }}>{t('计费类型')}</div>
                    <div
                      style={{
                        marginTop: 3,
                        fontSize: 12,
                        fontWeight: 700,
                        color: 'var(--semi-color-text-0)',
                      }}
                    >
                      {model?.quota_type === 1
                        ? model?.billing_unit === 'second'
                          ? t('按秒计费')
                          : t('按次计费')
                        : t('按量计费')}
                    </div>
                  </div>
                  <div
                    className='pricing-model-card__meta-item'
                    style={{
                      borderRadius: 12,
                      padding: '8px 10px',
                      background:
                        'color-mix(in srgb, var(--semi-color-fill-0) 82%, #ffffff 18%)',
                      border:
                        '1px solid color-mix(in srgb, var(--semi-color-border) 72%, transparent 28%)',
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--semi-color-text-3)' }}>{t('访问范围')}</div>
                    <div
                      style={{
                        marginTop: 3,
                        fontSize: 12,
                        fontWeight: 700,
                        color: 'var(--semi-color-text-0)',
                        wordBreak: 'break-word',
                      }}
                      title={model?.group || t('全部分组')}
                    >
                      {model?.group || t('全部分组')}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 'auto' }}>
                  <ModelTags record={model} t={t} />
                </div>

                {showRatio && (
                  <div
                    style={{
                      padding: '12px 14px',
                      border:
                        '1px solid color-mix(in srgb, var(--semi-color-border) 76%, transparent 24%)',
                      borderRadius: 16,
                      background:
                        'linear-gradient(135deg, color-mix(in srgb, var(--semi-color-fill-0) 80%, #ffffff 20%) 0%, color-mix(in srgb, var(--semi-color-primary-light-default) 30%, transparent 70%) 100%)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        marginBottom: 10,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: 'var(--semi-color-text-1)',
                          letterSpacing: '0.2px',
                        }}
                      >
                        {t('倍率信息')}
                      </span>
                      <Tooltip content={t('倍率是为了方便换算不同价格的模型')}>
                        <IconHelpCircle
                          style={{
                            color: 'var(--semi-color-primary)',
                            cursor: 'pointer',
                          }}
                          size='small'
                          onClick={(e) => {
                            e.stopPropagation();
                            setModalImageUrl('/ratio.png');
                            setIsModalOpenurl(true);
                          }}
                        />
                      </Tooltip>
                    </div>
                    <div className='pricing-model-card__ratio-grid'>
                      <span
                        className='pricing-model-card__ratio-item'
                        style={{
                          color: '#10b981',
                          fontWeight: 500,
                          borderRadius: 12,
                          background:
                            'color-mix(in srgb, var(--semi-color-bg-0) 86%, #ffffff 14%)',
                          padding: '8px 10px',
                        }}
                      >
                        {t('模型')}:{' '}
                        <span
                          style={{
                            color: 'var(--semi-color-text-1)',
                            fontWeight: 700,
                          }}
                        >
                          {model.quota_type === 0 ? model.model_ratio : t('无')}
                        </span>
                      </span>
                      <span
                        className='pricing-model-card__ratio-item'
                        style={{
                          color: '#f59e0b',
                          fontWeight: 500,
                          borderRadius: 12,
                          background:
                            'color-mix(in srgb, var(--semi-color-bg-0) 86%, #ffffff 14%)',
                          padding: '8px 10px',
                        }}
                      >
                        {t('补全')}:{' '}
                        <span
                          style={{
                            color: 'var(--semi-color-text-1)',
                            fontWeight: 700,
                          }}
                        >
                          {model.quota_type === 0
                            ? parseFloat(model.completion_ratio.toFixed(3))
                            : t('无')}
                        </span>
                      </span>
                      <span
                        className='pricing-model-card__ratio-item'
                        style={{
                          color: '#6366f1',
                          fontWeight: 500,
                          borderRadius: 12,
                          background:
                            'color-mix(in srgb, var(--semi-color-bg-0) 86%, #ffffff 14%)',
                          padding: '8px 10px',
                        }}
                      >
                        {t('分组')}:{' '}
                        <span
                          style={{
                            color: 'var(--semi-color-text-1)',
                            fontWeight: 700,
                          }}
                        >
                          {priceData?.usedGroupRatio ?? '-'}
                        </span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* 分页 */}
      {filteredModels.length > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: 24,
            paddingTop: 18,
            paddingBottom: 20,
            borderTop: '1px solid var(--semi-color-border)',
          }}
        >
          <Pagination
            currentPage={currentPage}
            pageSize={pageSize}
            total={filteredModels.length}
            showSizeChanger={true}
            pageSizeOptions={[10, 20, 50, 100]}
            size={isMobile ? 'small' : 'default'}
            showQuickJumper={!isMobile}
            onPageChange={(page) => setCurrentPage(page)}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
          />
        </div>
      )}
    </div>
  );
};

export default PricingCardView;
