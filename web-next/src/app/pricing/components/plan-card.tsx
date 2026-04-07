'use client';

import React from 'react';
import { Check, ChevronRight, Clock, Layers, Package } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getCurrencySymbol } from '@/lib/utils';
import type { SystemStatus } from '@/types';
import {
  isDiscountActive, getEffectivePrice, getSaleSummary,
  fmtBenefit, fmtDuration, getCurrencyRate,
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
  const benefit = fmtBenefit(plan, t);
  const duration = fmtDuration(plan, t);
  const isQuotaType = plan.resource_type !== 'request_count';

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

        <div className="space-y-2.5">
          <div className="flex items-start gap-2.5 text-sm">
            <div className="size-5 rounded-full bg-success/15 flex items-center justify-center shrink-0 mt-0.5">
              <Check className="size-3 text-success" />
            </div>
            <span>
              <span className="font-semibold">{benefit}</span>
              <span className="text-muted-foreground ml-1.5 text-xs">{isQuotaType ? t('额度') : t('请求次数')}</span>
            </span>
          </div>
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <div className="size-5 rounded-full bg-muted flex items-center justify-center shrink-0"><Clock className="size-3" /></div>
            <span>{t('有效期')} {duration}</span>
          </div>
          {plan.upgrade_group && (
            <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <div className="size-5 rounded-full bg-muted flex items-center justify-center shrink-0"><Layers className="size-3" /></div>
              <span>{t('升级分组')}: <span className="font-medium text-foreground">{plan.upgrade_group}</span></span>
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
