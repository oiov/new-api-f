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
  Avatar,
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
  formatPriceInfo,
} from '../../../../../helpers';
import { getLobeHubIcon } from '../../../../../helpers/providerIcons';
import PricingCardSkeleton from './PricingCardSkeleton';
import { useMinimumLoadingTime } from '../../../../../hooks/common/useMinimumLoadingTime';
import { renderLimitedItems } from '../../../../common/ui/RenderUtils';
import { useIsMobile } from '../../../../../hooks/common/useIsMobile';

const getModelKey = (model) => model.key ?? model.model_name ?? model.id;

/** 模型图标容器 */
const ModelIconBox = ({ model }) => {
  const size = 40;

  const inner = (() => {
    if (model?.icon) return getLobeHubIcon(model.icon, 24);
    if (model?.vendor_icon) return getLobeHubIcon(model.vendor_icon, 24);
    return null;
  })();

  const initials = model?.model_name
    ? model.model_name.slice(0, 2).toUpperCase()
    : '?';

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        backgroundColor: 'var(--semi-color-bg-2)',
        border: '1px solid var(--semi-color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {inner || (
        <Avatar
          size='extra-small'
          style={{
            width: size - 8,
            height: size - 8,
            borderRadius: 8,
            backgroundColor: 'var(--semi-color-primary-light-default)',
            color: 'var(--semi-color-primary)',
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {initials}
        </Avatar>
      )}
    </div>
  );
};

/** 计费类型 / 自定义标签行 */
const ModelTags = ({ record, t }) => {
  let billingTag = null;
  if (record.quota_type === 1) {
    billingTag = (
      <Tag key='billing' shape='circle' color='teal' size='small'>
        {t('按次计费')}
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
  const items = formatPriceInfo(priceData, t, siteDisplayType);
  if (!items || items.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        marginTop: 4,
      }}
    >
      {items}
    </div>
  );
};

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
  const paginatedModels = filteredModels.slice(startIndex, startIndex + pageSize);

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
      <PricingCardSkeleton rowSelection={!!rowSelection} showRatio={showRatio} />
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
    <div style={{ padding: '8px 8px 0' }}>
      {/* 模型卡片网格 */}
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

          return (
            <Card
              key={modelKey || index}
              className='pricing-model-card'
              style={{
                borderColor: isSelected
                  ? 'var(--semi-color-primary)'
                  : 'var(--semi-color-border)',
                backgroundColor: isSelected
                  ? 'var(--semi-color-primary-light-default)'
                  : 'var(--semi-color-bg-1)',
              }}
              bodyStyle={{ padding: 12 }}
              onClick={() => openModelDetail && openModelDetail(model)}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  gap: 10,
                }}
              >
                {/* ── 头部：图标 + 名称 + 操作 ── */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                  }}
                >
                  <ModelIconBox model={model} />

                  {/* 名称 + 价格摘要 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 13,
                        color: 'var(--semi-color-text-0)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        lineHeight: '1.4',
                      }}
                      title={model.model_name}
                    >
                      {model.model_name}
                    </div>
                    {/* 价格信息（紧凑显示） */}
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
                      lineHeight: '1.5',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {model.description}
                  </p>
                )}

                {/* ── 底部：标签 ── */}
                <div style={{ marginTop: 'auto' }}>
                  <ModelTags record={model} t={t} />
                </div>

                {/* ── 倍率信息（可选）── */}
                {showRatio && (
                  <div
                    style={{
                      paddingTop: 8,
                      borderTop: '1px solid var(--semi-color-border)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        marginBottom: 6,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: 'var(--semi-color-text-1)',
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
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: 4,
                        fontSize: 11,
                        color: 'var(--semi-color-text-1)',
                      }}
                    >
                      <span>
                        {t('模型')}:{' '}
                        {model.quota_type === 0 ? model.model_ratio : t('无')}
                      </span>
                      <span>
                        {t('补全')}:{' '}
                        {model.quota_type === 0
                          ? parseFloat(model.completion_ratio.toFixed(3))
                          : t('无')}
                      </span>
                      <span>
                        {t('分组')}: {priceData?.usedGroupRatio ?? '-'}
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
            paddingTop: 16,
            paddingBottom: 16,
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
