'use client';

import React from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { getGroupBillingBadgeClass, getGroupMeta, hueFromStr } from '../helpers';
import type { GroupMeta, VendorChip } from '../types';
import { VendorIcon } from './vendor-icon';

interface VendorGroupHeaderProps {
  activeVendor: string;
  vendorChips: VendorChip[];
  groupFilter: string;
  usableGroup: Record<string, string>;
  usableGroupMeta: Record<string, GroupMeta>;
  groupRatio: Record<string, number>;
  modelCount: number;
  setGroupFilter: (g: string) => void;
}

export function VendorGroupHeader({
  activeVendor, vendorChips, groupFilter,
  usableGroup, usableGroupMeta, groupRatio, modelCount, setGroupFilter,
}: VendorGroupHeaderProps) {
  const { t } = useTranslation();
  const selectedVendor = vendorChips.find((v) => v.name === activeVendor);
  const groupMeta = getGroupMeta(groupFilter, usableGroupMeta, usableGroup);
  const groupDesc = groupMeta.desc;
  const groupRat = groupRatio[groupFilter];
  const groupHue = hueFromStr(groupFilter || '');

  const GroupBillingBadge = ({
    billingType,
    billingLabel,
  }: {
    billingType?: string;
    billingLabel?: string;
  }) => {
    if (!billingLabel) return null;
    return (
      <Badge
        variant="secondary"
        className={cn('h-6 px-2 text-[11px] border font-medium', getGroupBillingBadgeClass(billingType))}
      >
        {billingLabel}
      </Badge>
    );
  };

  return (
    <div className="space-y-2">
      {/* Vendor banner */}
      <AnimatePresence mode="wait">
        {activeVendor !== 'all' && selectedVendor && (
          <motion.div
            key={`vendor-${activeVendor}`}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="rounded-2xl border px-5 py-4 bg-gradient-to-r from-primary/8 via-primary/4 to-transparent border-primary/20"
          >
            <div className="flex items-center gap-3.5">
              <div className="size-12 rounded-xl bg-background border border-border shadow-sm flex items-center justify-center shrink-0">
                <VendorIcon icon={selectedVendor.icon} name={selectedVendor.name} size="lg" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-base text-foreground">{selectedVendor.name}</h3>
                  <Badge variant="secondary" className="text-xs font-semibold">
                    {t('共 {{count}} 个模型', { count: modelCount })}
                  </Badge>
                </div>
                {selectedVendor.description && (
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{selectedVendor.description}</p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Group info banner */}
      <AnimatePresence mode="wait">
        {groupFilter !== 'all' && (
          <motion.div
            key={`group-${groupFilter}`}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="rounded-xl border px-4 py-3 flex items-center gap-3"
            style={{
              background: `linear-gradient(135deg, hsl(${groupHue},65%,50%,0.08) 0%, transparent 80%)`,
              borderColor: `hsl(${groupHue},60%,50%,0.2)`,
            }}
          >
            <div
              className="size-9 rounded-lg shrink-0 flex items-center justify-center overflow-hidden"
              style={{ backgroundColor: `hsl(${groupHue}, 62%, 50%)` }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: '-0.03em' }}>
                {groupFilter.slice(0, 2).toUpperCase()}
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm text-foreground">{groupFilter}</span>
                <GroupBillingBadge
                  billingType={groupMeta.billing_type}
                  billingLabel={groupMeta.billing_label}
                />
                {groupRat !== undefined && (
                  <span
                    className="text-[11px] font-bold rounded px-1.5 py-0.5 border"
                    style={{
                      color: `hsl(${groupHue},55%,40%)`,
                      borderColor: `hsl(${groupHue},55%,40%,0.3)`,
                      backgroundColor: `hsl(${groupHue},65%,50%,0.1)`,
                    }}
                  >
                    {t('倍率')} {groupRat}×
                  </span>
                )}
                <Badge variant="secondary" className="text-[11px]">
                  {t('共 {{count}} 个模型', { count: modelCount })}
                </Badge>
              </div>
              {groupDesc && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{groupDesc}</p>
              )}
            </div>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setGroupFilter('all')}
                    className="text-muted-foreground hover:text-foreground cursor-pointer p-1 rounded hover:bg-muted/60 transition-colors shrink-0"
                  >
                    <X className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left">{t('取消分组筛选')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
