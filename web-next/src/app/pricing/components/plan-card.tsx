'use client';

import React from 'react';
import { Check, ChevronRight, Layers, Package, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getCurrencySymbol } from '@/lib/utils';
import type { SystemStatus } from '@/types';
import {
  isDiscountActive, getEffectivePrice, getSaleSummary,
  fmtDuration, getCurrencyRate, getPlanRestrictionSummary, getPlanMetricItems,
} from '../helpers';
import type { SubscriptionPlan } from '../types';

function fmtPrice(amount: number, status?: SystemStatus): string {
  const symbol = getCurrencySymbol(status);
  const rate = getCurrencyRate(status);
  const price = amount * rate;
  return `${symbol}${price.toFixed(Number.isInteger(price) ? 0 : 2)}`;
}

interface PlanCardProps {
  plan: SubscriptionPlan;
  status?: SystemStatus;
  index: number;
}

export function PlanCard({ plan, status, index }: PlanCardProps) {
  const { t } = useTranslation();
  const hasDiscount = isDiscountActive(plan);
  const effectivePrice = getEffectivePrice(plan);
  const saleSummary = getSaleSummary(plan);
  const disabled = saleSummary.soldOut || !plan.enabled;
  const duration = fmtDuration(plan, t);
  const restrictions = getPlanRestrictionSummary(plan);
  const metricItems = getPlanMetricItems(plan, t);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.3 }}
      className={cn(
        'relative flex flex-col rounded-2xl border bg-card overflow-hidden transition-all duration-200',
        disabled ? 'opacity-50 pointer-events-none' : 'hover:border-primary/50 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer',
      )}
      onClick={() => { if (!disabled) window.location.href = '/console/subscription'; }}
    >
      {hasDiscount && (
        <div className="absolute top-0 right-0 z-10">
          <div className="bg-destructive text-destructive-foreground text-[10px] font-bold px-3 py-1 rounded-bl-xl">{t('限时优惠')}</div>
        </div>
      )}
      <div className="h-1 w-full bg-gradient-to-r from-primary/60 via-primary to-primary/60" />
      <div className="p-6 flex-1 space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Package className="size-4 text-primary" />
            </div>
            {!saleSummary.unlimited && (
              <span className="text-xs text-muted-foreground ml-auto">{t('剩余')} {saleSummary.remaining}</span>
            )}
          </div>
          <h3 className="font-bold text-lg mt-3">{plan.title || t('订阅套餐')}</h3>
          {plan.subtitle && <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{plan.subtitle}</p>}
        </div>

        <div className="rounded-xl bg-muted/40 px-4 py-3.5">
          <div className="flex items-end gap-1.5">
            <span className="text-3xl font-bold text-primary tabular-nums">{fmtPrice(effectivePrice, status)}</span>
            <span className="text-sm text-muted-foreground pb-0.5">/ {duration}</span>
          </div>
          {hasDiscount && <p className="text-xs text-muted-foreground line-through mt-1">{fmtPrice(Number(plan.price_amount || 0), status)}</p>}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {metricItems.map((item) => (
            <div key={item.label} className="rounded-xl border bg-muted/30 px-3 py-2.5">
              <p className="text-[11px] text-muted-foreground">{item.label}</p>
              <p className="mt-1 text-sm font-semibold leading-tight">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <div className="size-5 rounded-full bg-muted flex items-center justify-center shrink-0"><RefreshCw className="size-3" /></div>
            <span>{t('请求额度按重置周期滚动恢复')}</span>
          </div>
          {plan.upgrade_group && (
            <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <div className="size-5 rounded-full bg-muted flex items-center justify-center shrink-0"><Layers className="size-3" /></div>
              <span>{t('升级分组')}: <span className="font-medium text-foreground">{plan.upgrade_group}</span></span>
            </div>
          )}
          {(restrictions.groups.length > 0 || restrictions.models.length > 0 || restrictions.vendors.length > 0) && (
            <div className="flex items-start gap-2.5 text-sm">
              <div className="size-5 rounded-full bg-success/15 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="size-3 text-success" />
              </div>
              <div className="space-y-1 text-muted-foreground">
                {restrictions.groups.length > 0 && (
                  <p>{t('可用分组')}: <span className="text-foreground">{restrictions.groups.join(' / ')}</span></p>
                )}
                {restrictions.models.length > 0 && (
                  <p>{t('可用模型')}: <span className="text-foreground">{restrictions.models.slice(0, 3).join(' / ')}</span></p>
                )}
                {restrictions.vendors.length > 0 && (
                  <p>{t('可用供应商')}: <span className="text-foreground">{restrictions.vendors.join(' / ')}</span></p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="px-6 pb-6 pt-0">
        <Button className="w-full group" disabled={disabled}>
          {disabled
            ? (saleSummary.soldOut ? t('已售罄') : t('已下架'))
            : <span className="flex items-center gap-1.5">{t('立即订阅')}<ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" /></span>}
        </Button>
      </div>
    </motion.div>
  );
}
