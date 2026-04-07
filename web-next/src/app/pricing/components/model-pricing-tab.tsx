'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  BarChart3, ChevronRight, Info, LayoutGrid, Layers, List, RotateCcw, Search, X,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Pagination } from '@/components/ui/pagination';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { fmtRatio } from '../helpers';
import { useUrlState } from '../hooks/use-url-state';
import type { ModelPrice, Vendor, QuotaTypeFilter, ViewMode, VendorChip } from '../types';
import { CopyButton } from './copy-button';
import { ModelCard } from './model-card';
import { ModelDetailSheet } from './model-detail-sheet';
import { PricingSidebar } from './pricing-sidebar';
import { VendorGroupHeader } from './vendor-group-header';
import { VendorIcon } from './vendor-icon';

const PAGE_SIZE = 20;

interface ModelPricingTabProps {
  prices: ModelPrice[];
  loading: boolean;
  usableGroup: Record<string, string>;
  groupRatio: Record<string, number>;
  vendors: Vendor[];
}

export function ModelPricingTab({
  prices, loading, usableGroup, groupRatio, vendors,
}: ModelPricingTabProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { get, set } = useUrlState();

  // ── URL-synced state ──────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>(get('view') === 'table' ? 'table' : 'card');
  const [search, setSearch] = useState(get('q'));
  const [activeVendor, setActiveVendor] = useState(get('vendor') || 'all');
  const [groupFilter, setGroupFilter] = useState(get('group') || 'all');
  const [filterQuotaType, setFilterQuotaType] = useState<QuotaTypeFilter>(() => {
    const v = get('type');
    if (v === '0') return 0;
    if (v === '1') return 1;
    return 'all';
  });
  const [filterTag, setFilterTag] = useState(get('tag') || 'all');
  const [page, setPage] = useState(Number(get('page')) || 1);
  const [selectedModel, setSelectedModel] = useState<ModelPrice | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => set({ q: val || null, page: null }), 400);
  };

  const handleSetViewMode = (v: ViewMode) => { setViewMode(v); set({ view: v === 'card' ? null : v }); };
  const handleSetActiveVendor = (v: string) => { setActiveVendor(v); setPage(1); set({ vendor: v === 'all' ? null : v, page: null }); };
  const handleSetGroupFilter = (g: string) => { setGroupFilter(g); setPage(1); set({ group: g === 'all' ? null : g, page: null }); };
  const handleSetFilterQuotaType = (q: QuotaTypeFilter) => { setFilterQuotaType(q); setPage(1); set({ type: q === 'all' ? null : String(q), page: null }); };
  const handleSetFilterTag = (tag: string) => { setFilterTag(tag); setPage(1); set({ tag: tag === 'all' ? null : tag, page: null }); };
  const handleSetPage = (p: number) => { setPage(p); set({ page: p <= 1 ? null : String(p) }); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  // ── Derived data ──────────────────────────────────────────────────────────
  const vendorChips: VendorChip[] = useMemo(() => {
    const map = new Map<string, VendorChip>();
    prices.forEach((p) => {
      const key = p.vendor_name || '';
      if (!key) return;
      const ex = map.get(key);
      if (ex) ex.count += 1;
      else map.set(key, { name: key, icon: p.vendor_icon, count: 1, description: p.vendor_description });
    });
    if (map.size === 0 && vendors.length > 0) {
      vendors.forEach((v) => map.set(v.name, { name: v.name, icon: v.icon, count: 0, description: v.description }));
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [prices, vendors]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    prices.forEach((p) => { if (p.tags) p.tags.split(',').map((s) => s.trim()).filter(Boolean).forEach((tag) => tags.add(tag)); });
    return Array.from(tags).sort();
  }, [prices]);

  const filteredPrices = useMemo(() => {
    let list = prices;
    if (activeVendor !== 'all') list = list.filter((p) => p.vendor_name === activeVendor);
    if (search) { const q = search.toLowerCase(); list = list.filter((p) => p.model_name.toLowerCase().includes(q)); }
    if (groupFilter !== 'all') list = list.filter((p) => (p.enable_groups || []).includes(groupFilter));
    if (filterQuotaType !== 'all') list = list.filter((p) => p.quota_type === filterQuotaType);
    if (filterTag !== 'all') list = list.filter((p) => (p.tags || '').split(',').map((s) => s.trim()).includes(filterTag));
    return list;
  }, [prices, activeVendor, search, groupFilter, filterQuotaType, filterTag]);

  const paginatedPrices = useMemo(
    () => filteredPrices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredPrices, page],
  );

  const hasActiveFilter = activeVendor !== 'all' || groupFilter !== 'all' ||
    filterQuotaType !== 'all' || filterTag !== 'all' || search !== '';

  const handleReset = useCallback(() => {
    setActiveVendor('all'); setGroupFilter('all'); setFilterQuotaType('all');
    setFilterTag('all'); setSearch(''); setPage(1);
    set({ vendor: null, group: null, type: null, tag: null, q: null, page: null });
  }, [set]);

  const openDetail = (model: ModelPrice) => { setSelectedModel(model); setSheetOpen(true); };

  return (
    <>
      <div className={cn('flex gap-0', isMobile ? 'flex-col' : 'flex-row items-start')}>
        {/* Sidebar */}
        {!isMobile && (
          <PricingSidebar
            prices={prices}
            activeVendor={activeVendor} setActiveVendor={handleSetActiveVendor}
            groupFilter={groupFilter} setGroupFilter={handleSetGroupFilter}
            filterQuotaType={filterQuotaType} setFilterQuotaType={handleSetFilterQuotaType}
            filterTag={filterTag} setFilterTag={handleSetFilterTag}
            usableGroup={usableGroup} groupRatio={groupRatio}
            allTags={allTags} vendorChips={vendorChips}
            loading={loading} hasActiveFilter={hasActiveFilter} onReset={handleReset}
          />
        )}

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-3">
          <VendorGroupHeader
            activeVendor={activeVendor} vendorChips={vendorChips}
            groupFilter={groupFilter} usableGroup={usableGroup} groupRatio={groupRatio}
            modelCount={filteredPrices.length} setGroupFilter={handleSetGroupFilter}
          />

          {/* Mobile vendor chips */}
          {isMobile && (
            <ScrollArea className="w-full">
              <div className="flex gap-2 pb-1">
                {[{ name: 'all', label: t('全部'), count: prices.length }, ...vendorChips.map((c) => ({ name: c.name, label: c.name, count: c.count, icon: c.icon }))].map((chip) => (
                  <button
                    key={chip.name}
                    onClick={() => handleSetActiveVendor(chip.name)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap border transition-all duration-150 cursor-pointer',
                      activeVendor === chip.name
                        ? 'bg-foreground text-background border-foreground'
                        : 'bg-card text-muted-foreground border-border hover:border-foreground/40',
                    )}
                  >
                    {'icon' in chip && <VendorIcon icon={chip.icon} name={chip.name} size="xs" />}
                    {chip.label}
                    <span className={cn('text-[10px] rounded-full px-1 font-semibold', activeVendor === chip.name ? 'bg-white/20 text-white' : 'bg-muted')}>
                      {chip.count}
                    </span>
                  </button>
                ))}
              </div>
              <ScrollBar orientation="horizontal" className="h-0.5" />
            </ScrollArea>
          )}

          {/* Controls */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <Input placeholder={t('搜索模型名称...')} value={search} onChange={(e) => handleSearchChange(e.target.value)} className="pl-9 bg-card" />
              {search && (
                <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer p-0.5 rounded" onClick={() => handleSearchChange('')}>
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            {isMobile && Object.keys(usableGroup).length > 0 && (
              <Select value={groupFilter} onValueChange={handleSetGroupFilter}>
                <SelectTrigger className="w-full sm:w-44 bg-card">
                  <Layers className="size-3.5 text-muted-foreground mr-1" />
                  <SelectValue placeholder={t('全部分组')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('全部分组')}</SelectItem>
                  {Object.keys(usableGroup).map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            <div className="flex items-center rounded-lg border bg-muted/40 p-1 gap-1 self-stretch sm:self-auto shrink-0">
              {(['card', 'table'] as ViewMode[]).map((mode) => (
                <TooltipProvider key={mode}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleSetViewMode(mode)}
                        className={cn('flex items-center justify-center size-8 rounded-md transition-all duration-150 cursor-pointer', viewMode === mode ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
                      >
                        {mode === 'card' ? <LayoutGrid className="size-4" /> : <List className="size-4" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{mode === 'card' ? t('卡片视图') : t('表格视图')}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>

            <div className="flex items-center gap-1.5 rounded-lg border bg-muted/40 px-3 h-10 text-sm text-muted-foreground whitespace-nowrap self-stretch sm:self-auto shrink-0">
              <BarChart3 className="size-3.5" />
              <span className="font-semibold text-foreground">{filteredPrices.length}</span>
              {t('个模型')}
            </div>
          </div>

          {/* Hint */}
          <div className="flex items-start gap-2.5 rounded-xl border border-blue-200/70 bg-blue-50/50 dark:border-blue-800/40 dark:bg-blue-950/20 px-4 py-2.5 text-sm text-blue-700 dark:text-blue-300">
            <Info className="size-4 shrink-0 mt-0.5" />
            <span>{t('点击任意行可查看完整模型详情。价格基于系统倍率，实际费用以账户扣除为准。')}</span>
          </div>

          {/* Card View */}
          {viewMode === 'card' && (
            <motion.div key="card-grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-[160px] rounded-2xl" />)}
                </div>
              ) : filteredPrices.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                  <div className="size-14 rounded-2xl bg-muted flex items-center justify-center">
                    <BarChart3 className="size-7 opacity-30" />
                  </div>
                  <p className="text-sm text-muted-foreground">{search || groupFilter !== 'all' ? t('未找到匹配的模型') : t('该分类暂无数据')}</p>
                  {hasActiveFilter && (
                    <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1.5 text-xs cursor-pointer">
                      <RotateCcw className="size-3.5" />{t('重置筛选')}
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {paginatedPrices.map((model) => (
                      <ModelCard key={model.model_name} model={model} groupFilter={groupFilter} setGroupFilter={handleSetGroupFilter} openDetail={openDetail} />
                    ))}
                  </div>
                  {filteredPrices.length > PAGE_SIZE && (
                    <div className="mt-4 border-t border-border/50 pt-2">
                      <Pagination currentPage={page} totalItems={filteredPrices.length} pageSize={PAGE_SIZE} onPageChange={handleSetPage} showTotal />
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}

          {/* Table View */}
          {viewMode === 'table' && (
            <motion.div key="table" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
              <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground min-w-[180px]">{t('模型名称')}</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground w-36">{t('供应商')}</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground w-20">{t('类型')}</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground w-40">{t('输入 / 1K tokens')}</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground w-40">{t('输出 / 1K tokens')}</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">{t('可用分组')}</th>
                      <th className="w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td colSpan={7} className="px-4 py-2.5"><Skeleton className="h-9 rounded-lg" /></td>
                        </tr>
                      ))
                    ) : filteredPrices.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-16 text-sm text-muted-foreground">{t('暂无数据')}</td></tr>
                    ) : (
                      filteredPrices.map((price, idx) => (
                        <motion.tr
                          key={price.model_name}
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(idx * 0.003, 0.25) }}
                          onClick={() => openDetail(price)}
                          className="border-b last:border-0 group hover:bg-muted/40 dark:hover:bg-muted/20 transition-colors cursor-pointer"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono text-sm font-medium truncate max-w-[220px]" title={price.model_name}>{price.model_name}</span>
                              <span className="opacity-0 group-hover:opacity-100 transition-opacity"><CopyButton text={price.model_name} /></span>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            {price.vendor_name
                              ? <div className="flex items-center gap-1.5"><VendorIcon icon={price.vendor_icon} name={price.vendor_name} size="xs" /><span className="text-xs text-muted-foreground truncate max-w-[100px]">{price.vendor_name}</span></div>
                              : <span className="text-xs text-muted-foreground/50">-</span>}
                          </td>
                          <td className="px-3 py-3">
                            <span className={cn('text-xs font-medium rounded-md px-2 py-0.5', price.quota_type === 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                              {price.quota_type === 0 ? t('按量') : t('按次')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right"><span className="font-mono text-sm tabular-nums text-emerald-700 dark:text-emerald-400 font-medium">{fmtRatio(price.model_ratio)}</span></td>
                          <td className="px-4 py-3 text-right"><span className="font-mono text-sm tabular-nums text-amber-700 dark:text-amber-400 font-medium">{fmtRatio(price.model_ratio * price.completion_ratio)}</span></td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {(price.enable_groups || []).slice(0, 3).map((g) => (
                                <span key={g} onClick={(e) => { e.stopPropagation(); handleSetGroupFilter(groupFilter === g ? 'all' : g); }}
                                  className={cn('text-[11px] rounded-md px-1.5 py-0.5 border cursor-pointer transition-colors', groupFilter === g ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/60 text-muted-foreground border-border hover:bg-muted')}>
                                  {g}
                                </span>
                              ))}
                              {(price.enable_groups || []).length > 3 && (
                                <span className="text-[11px] rounded-md px-1.5 py-0.5 bg-muted/40 text-muted-foreground border border-border">
                                  +{(price.enable_groups || []).length - 3}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <ChevronRight className="size-4 text-muted-foreground/40 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all ml-auto" />
                          </td>
                        </motion.tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <ModelDetailSheet model={selectedModel} open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
