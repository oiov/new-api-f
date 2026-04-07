'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { BarChart3, Package, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { API } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useSystemStatus } from '@/context/status-context';
import { toast } from 'sonner';

import type { ModelPrice, Vendor, SubscriptionPlan, PlanWrapper, GroupMeta } from './types';
import { useUrlState } from './hooks/use-url-state';
import { StatCard } from './components/stat-card';
import { ModelPricingTab } from './components/model-pricing-tab';
import { PlansTab } from './components/plans-tab';

function PricingPageContent() {
  const { t } = useTranslation();
  const status = useSystemStatus();
  const { get, set } = useUrlState();

  const [prices, setPrices] = useState<ModelPrice[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [groupRatio, setGroupRatio] = useState<Record<string, number>>({});
  const [usableGroup, setUsableGroup] = useState<Record<string, string>>({});
  const [usableGroupMeta, setUsableGroupMeta] = useState<Record<string, GroupMeta>>({});
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [plansLoading, setPlansLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Tab state synced to URL (?tab=plans)
  const currentTab = get('tab') || 'models';
  const handleTabChange = (tab: string) => set({ tab: tab === 'models' ? null : tab });

  const loadPrices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/pricing');
      const data = res.data as {
        success: boolean;
        data: ModelPrice[];
        vendors?: Vendor[];
        group_ratio?: Record<string, number>;
        usable_group?: Record<string, string>;
        usable_group_meta?: Record<string, GroupMeta>;
      };
      if (data.success) {
        setPrices(data.data || []);
        setVendors(data.vendors || []);
        setGroupRatio(data.group_ratio || {});
        setUsableGroup(data.usable_group || {});
        setUsableGroupMeta(data.usable_group_meta || {});
      }
    } catch {
      toast.error(t('加载价格失败'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadPlans = useCallback(async () => {
    setPlansLoading(true);
    try {
      const res = await API.get('/api/subscription/plans', { skipErrorHandler: true } as never);
      if (res.data?.success) {
        const wrappers: PlanWrapper[] = res.data.data || [];
        setPlans(wrappers.map((w) => w.plan).filter(Boolean) as SubscriptionPlan[]);
      }
    } catch { /* plans are optional */ }
    finally { setPlansLoading(false); }
  }, []);

  useEffect(() => { loadPrices(); loadPlans(); }, [loadPrices, loadPlans]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadPrices(), loadPlans()]);
    setRefreshing(false);
  };

  const vendorCount = useMemo(() => {
    const fromPrices = new Set(prices.map((p) => p.vendor_name).filter(Boolean)).size;
    return fromPrices > 0 ? fromPrices : vendors.length;
  }, [prices, vendors]);
  const usableGroupCount = useMemo(() => Object.keys(usableGroup).length, [usableGroup]);
  const activePlanCount = useMemo(() => plans.filter((p) => p.enabled && !p.sold_out).length, [plans]);

  const statCards = [
    { label: t('全部模型'), value: loading ? '—' : String(prices.length), sub: t('已上线模型总数'), accent: undefined, onClick: () => handleTabChange('models') },
    { label: t('供应商'), value: loading ? '—' : String(vendorCount), sub: t('覆盖 AI 供应商数'), accent: 'text-blue-500', onClick: () => handleTabChange('models') },
    { label: t('可用分组'), value: loading ? '—' : String(usableGroupCount), sub: t('当前可用分组数'), accent: 'text-emerald-500', onClick: () => handleTabChange('models') },
    { label: t('可购套餐'), value: plansLoading ? '—' : String(activePlanCount), sub: t('当前在售套餐'), accent: 'text-primary', onClick: () => handleTabChange('plans') },
  ];

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-8 md:px-6 lg:px-8 lg:py-10 space-y-8 lg:space-y-10">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <BarChart3 className="size-5 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{t('价格中心')}</h1>
          </div>
          <p className="text-sm text-muted-foreground pl-[52px]">{t('按供应商浏览模型定价，查看套餐方案')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing || loading}
          className="cursor-pointer gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className={cn('size-4 transition-transform duration-500', (refreshing || loading) && 'animate-spin')} />
          {t('刷新')}
        </Button>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.06 }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {statCards.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 + 0.06 }}>
            <StatCard {...s} />
          </motion.div>
        ))}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.12 }}>
        <Tabs value={currentTab} onValueChange={handleTabChange}>
          <TabsList className="mb-6 h-auto min-h-10 flex-wrap gap-2 p-1">
            <TabsTrigger value="models" className="gap-2 text-sm">
              <BarChart3 className="size-4" />
              {t('模型定价')}
              {!loading && <span className="text-[10px] bg-muted rounded-full px-1.5 py-0.5 font-semibold">{prices.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="plans" className="gap-2 text-sm">
              <Package className="size-4" />
              {t('套餐方案')}
              {!plansLoading && plans.length > 0 && <span className="text-[10px] bg-muted rounded-full px-1.5 py-0.5 font-semibold">{plans.length}</span>}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="models" className="mt-0">
            <ModelPricingTab
              prices={prices}
              loading={loading}
              usableGroup={usableGroup}
              usableGroupMeta={usableGroupMeta}
              groupRatio={groupRatio}
              vendors={vendors}
            />
          </TabsContent>
          <TabsContent value="plans" className="mt-0">
            <PlansTab plans={plans} loading={plansLoading} status={status} />
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-[1400px] px-4 py-8 md:px-6 lg:px-8 lg:py-10" />}>
      <PricingPageContent />
    </Suspense>
  );
}
