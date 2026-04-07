'use client';

import React from 'react';
import { Crown, Package } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import type { SystemStatus } from '@/types';
import type { SubscriptionPlan } from '../types';
import { PlanCard } from './plan-card';

interface PlansTabProps {
  plans: SubscriptionPlan[];
  loading: boolean;
  status?: SystemStatus;
}

export function PlansTab({ plans, loading, status }: PlansTabProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-80 rounded-2xl" />)}
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <div className="size-16 rounded-2xl bg-muted flex items-center justify-center">
          <Package className="size-8 text-muted-foreground/40" />
        </div>
        <div>
          <p className="font-semibold text-foreground/70">{t('暂无可购买套餐')}</p>
          <p className="text-sm text-muted-foreground mt-1.5">{t('管理员暂未上架套餐，请稍后再试')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-amber-200/70 bg-amber-50/50 dark:border-amber-800/40 dark:bg-amber-950/20 px-4 py-3.5 text-sm text-amber-700 dark:text-amber-300">
        <Crown className="size-4 shrink-0 mt-0.5" />
        <span>{t('购买套餐后可在「我的订阅」页面查看权益进度与消耗记录。')}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {plans.map((plan, i) => <PlanCard key={plan.id} plan={plan} status={status} index={i} />)}
      </div>
    </div>
  );
}
