'use client';

import React, { useMemo } from 'react';
import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ModelPrice, VendorChip, QuotaTypeFilter } from '../types';
import { FilterGroup, FilterItem } from './filter-group';
import { VendorIcon } from './vendor-icon';

interface PricingSidebarProps {
  prices: ModelPrice[];
  activeVendor: string;
  setActiveVendor: (v: string) => void;
  groupFilter: string;
  setGroupFilter: (g: string) => void;
  filterQuotaType: QuotaTypeFilter;
  setFilterQuotaType: (q: QuotaTypeFilter) => void;
  filterTag: string;
  setFilterTag: (t: string) => void;
  usableGroup: Record<string, string>;
  groupRatio: Record<string, number>;
  allTags: string[];
  vendorChips: VendorChip[];
  loading: boolean;
  hasActiveFilter: boolean;
  onReset: () => void;
}

export function PricingSidebar(props: PricingSidebarProps) {
  const { t } = useTranslation();
  const {
    prices, activeVendor, setActiveVendor,
    groupFilter, setGroupFilter,
    filterQuotaType, setFilterQuotaType,
    filterTag, setFilterTag,
    usableGroup, groupRatio,
    allTags, vendorChips,
    loading, hasActiveFilter, onReset,
  } = props;

  const groupCounts = useMemo(() => {
    const map: Record<string, number> = {};
    prices.forEach((p) => { (p.enable_groups || []).forEach((g) => { map[g] = (map[g] || 0) + 1; }); });
    return map;
  }, [prices]);

  const tagCounts = useMemo(() => {
    const map: Record<string, number> = {};
    prices.forEach((p) => {
      (p.tags || '').split(',').map((s) => s.trim()).filter(Boolean).forEach((tag) => {
        map[tag] = (map[tag] || 0) + 1;
      });
    });
    return map;
  }, [prices]);

  if (loading) {
    return (
      <div className="w-[220px] shrink-0 space-y-3 pr-4">
        {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-7 rounded-lg" />)}
      </div>
    );
  }

  const allGroups = Object.keys(usableGroup).length > 0
    ? Object.keys(usableGroup)
    : Array.from(new Set(prices.flatMap((p) => p.enable_groups || []))).sort();

  return (
    <div className="w-[220px] shrink-0 pr-5 border-r border-border/60">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-border/60">
        <div className="flex items-center gap-2">
          <div className="w-[3px] h-4 rounded-full bg-primary shrink-0" />
          <span className="text-sm font-bold text-foreground">{t('筛选')}</span>
        </div>
        {hasActiveFilter && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={onReset} className="text-muted-foreground hover:text-foreground cursor-pointer p-1 rounded hover:bg-muted transition-colors">
                  <RotateCcw className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{t('重置筛选')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      <ScrollArea className="h-[calc(100vh-280px)]">
        <div className="space-y-1 pr-1">
          {/* Vendor */}
          <FilterGroup title={t('供应商')}>
            <FilterItem active={activeVendor === 'all'} onClick={() => setActiveVendor('all')} count={prices.length}>
              {t('全部供应商')}
            </FilterItem>
            {vendorChips.map((chip) => (
              <FilterItem key={chip.name} active={activeVendor === chip.name} onClick={() => setActiveVendor(chip.name)} count={chip.count}>
                <span className="flex items-center gap-1.5 min-w-0">
                  <VendorIcon icon={chip.icon} name={chip.name} size="xs" />
                  <span className="truncate">{chip.name}</span>
                </span>
              </FilterItem>
            ))}
          </FilterGroup>

          <Separator className="my-2" />

          {/* Group */}
          {allGroups.length > 0 && (
            <>
              <FilterGroup title={t('可用分组')}>
                <FilterItem active={groupFilter === 'all'} onClick={() => setGroupFilter('all')} count={prices.length}>
                  {t('全部分组')}
                </FilterItem>
                {allGroups.map((g) => {
                  const ratio = groupRatio[g];
                  return (
                    <FilterItem
                      key={g}
                      active={groupFilter === g}
                      onClick={() => setGroupFilter(g)}
                      count={groupCounts[g] || 0}
                      badge={ratio !== undefined ? (
                        <span className={cn(
                          'text-[10px] rounded px-1.5 py-0.5 font-semibold border',
                          groupFilter === g ? 'border-primary-foreground/30 text-primary-foreground/80' : 'border-border/60 text-muted-foreground',
                        )}>
                          {ratio}×
                        </span>
                      ) : undefined}
                    >
                      {g}
                    </FilterItem>
                  );
                })}
              </FilterGroup>
              <Separator className="my-2" />
            </>
          )}

          {/* Quota type */}
          <FilterGroup title={t('计费类型')}>
            <FilterItem active={filterQuotaType === 'all'} onClick={() => setFilterQuotaType('all')} count={prices.length}>{t('全部类型')}</FilterItem>
            <FilterItem active={filterQuotaType === 0} onClick={() => setFilterQuotaType(0)} count={prices.filter((p) => p.quota_type === 0).length}>{t('按量计费')}</FilterItem>
            <FilterItem active={filterQuotaType === 1} onClick={() => setFilterQuotaType(1)} count={prices.filter((p) => p.quota_type === 1).length}>{t('按次计费')}</FilterItem>
          </FilterGroup>

          {/* Tags */}
          {allTags.length > 0 && (
            <>
              <Separator className="my-2" />
              <FilterGroup title={t('标签')} defaultOpen={false}>
                <FilterItem active={filterTag === 'all'} onClick={() => setFilterTag('all')} count={prices.length}>{t('全部标签')}</FilterItem>
                {allTags.map((tag) => (
                  <FilterItem key={tag} active={filterTag === tag} onClick={() => setFilterTag(tag)} count={tagCounts[tag] || 0}>
                    {tag}
                  </FilterItem>
                ))}
              </FilterGroup>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
