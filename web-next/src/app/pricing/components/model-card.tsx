'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { fmtRatio, getGroupBillingBadgeClass, getGroupMeta, hueFromStr } from '../helpers';
import type { GroupMeta, ModelPrice } from '../types';
import { VendorIcon } from './vendor-icon';
import { CopyButton } from './copy-button';

interface ModelCardProps {
  model: ModelPrice;
  groupFilter: string;
  setGroupFilter: (g: string) => void;
  openDetail: (m: ModelPrice) => void;
  usableGroup: Record<string, string>;
  usableGroupMeta: Record<string, GroupMeta>;
}

function GroupBillingBadge({
  billingType,
  billingLabel,
  compact = false,
}: {
  billingType?: string;
  billingLabel?: string;
  compact?: boolean;
}) {
  if (!billingLabel) return null;
  return (
    <Badge
      variant="secondary"
      className={cn(
        'border font-medium',
        compact ? 'h-5 px-1.5 text-[10px]' : 'h-6 px-2 text-[11px]',
        getGroupBillingBadgeClass(billingType),
      )}
    >
      {billingLabel}
    </Badge>
  );
}

export function ModelCard({
  model, groupFilter, setGroupFilter, openDetail, usableGroup, usableGroupMeta,
}: ModelCardProps) {
  const { t } = useTranslation();
  const isTokenBased = model.quota_type === 0;
  const inputPrice = fmtRatio(model.model_ratio);
  const outputPrice = fmtRatio(model.model_ratio * model.completion_ratio);
  const hue = hueFromStr(model.model_name);
  const hasVendorIcon = Boolean(model.vendor_icon);
  const tagList = model.tags ? model.tags.split(',').map((s) => s.trim()).filter(Boolean) : [];

  return (
    <div
      onClick={() => openDetail(model)}
      className={cn(
        'group relative flex flex-col rounded-2xl border bg-card overflow-hidden',
        'cursor-pointer transition-all duration-200',
        'hover:border-primary/50 hover:shadow-lg hover:-translate-y-0.5',
      )}
    >
      <div className="p-4 flex flex-col gap-3 h-full">
        {/* Header: icon + name + copy */}
        <div className="flex items-start gap-3">
          <div
            className="size-11 rounded-xl shrink-0 flex items-center justify-center overflow-hidden border border-border/40"
            style={{ backgroundColor: hasVendorIcon ? undefined : `hsl(${hue}, 62%, 50%)` }}
          >
            {hasVendorIcon ? (
              <VendorIcon icon={model.vendor_icon} name={model.vendor_name} size="md" />
            ) : (
              <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1 }}>
                {model.model_name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-1">
              <span className="font-mono text-sm font-bold text-foreground truncate block leading-snug" title={model.model_name}>
                {model.model_name}
              </span>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <CopyButton text={model.model_name} />
              </span>
            </div>

            {isTokenBased ? (
              <div className="mt-1.5 space-y-0.5">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground/60 min-w-[24px]">{t('输入')}:</span>
                  <span className="font-mono font-semibold text-success">{inputPrice}</span>
                  <span className="text-muted-foreground/40 text-[10px]">/ 1K</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground/60 min-w-[24px]">{t('输出')}:</span>
                  <span className="font-mono font-semibold text-warning">{outputPrice}</span>
                  <span className="text-muted-foreground/40 text-[10px]">/ 1K</span>
                </div>
              </div>
            ) : (
              <div className="mt-1.5 text-xs flex items-center gap-1.5">
                <span className="text-muted-foreground/60">{t('价格')}:</span>
                <span className="font-mono font-semibold text-primary">{inputPrice}</span>
                <span className="text-muted-foreground/40 text-[10px]">/ {t('次')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        {model.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed -mt-1">
            {model.description}
          </p>
        )}

        {/* Billing badge + tags */}
        <div className="mt-auto flex items-center justify-between gap-1 flex-wrap pt-1">
          <span className={cn(
            'text-[11px] font-semibold rounded-md px-2 py-0.5 shrink-0',
            isTokenBased ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
          )}>
            {isTokenBased ? t('按量计费') : t('按次计费')}
          </span>
          {tagList.length > 0 && (
            <div className="flex gap-1 flex-wrap justify-end">
              {tagList.slice(0, 3).map((tag) => (
                <span key={tag} className="text-[10px] rounded px-1.5 py-0.5 bg-muted/70 text-muted-foreground border border-border/60">
                  {tag}
                </span>
              ))}
              {tagList.length > 3 && (
                <span className="text-[10px] rounded px-1.5 py-0.5 bg-muted/40 text-muted-foreground border border-border/50">
                  +{tagList.length - 3}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Groups */}
        {(model.enable_groups || []).length > 0 && (
          <div className="flex flex-wrap gap-1 pt-2 border-t border-border/50">
            {(model.enable_groups || []).slice(0, 4).map((g) => {
              const groupMeta = getGroupMeta(g, usableGroupMeta, usableGroup);
              return (
                <span
                  key={g}
                  onClick={(e) => { e.stopPropagation(); setGroupFilter(groupFilter === g ? 'all' : g); }}
                  className={cn(
                    'text-[10px] rounded px-1.5 py-0.5 border cursor-pointer transition-colors inline-flex items-center gap-1',
                    groupFilter === g
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/50 text-muted-foreground border-border/60 hover:border-foreground/30 hover:bg-muted',
                  )}
                >
                  {g}
                  <GroupBillingBadge
                    billingType={groupMeta.billing_type}
                    billingLabel={groupMeta.billing_label}
                    compact
                  />
                </span>
              );
            })}
            {(model.enable_groups || []).length > 4 && (
              <span className="text-[10px] rounded px-1.5 py-0.5 bg-muted/30 text-muted-foreground border border-border/50">
                +{(model.enable_groups || []).length - 4}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
