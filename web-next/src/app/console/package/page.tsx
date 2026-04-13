'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  Package,
  RefreshCw,
  Check,
  Crown,
  Zap,
  Calendar,
  Layers,
  BadgeCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { AuthGuard } from '@/components/common/auth-guard';
import { useUser, persistUser } from '@/context/user-context';
import { useSystemStatus } from '@/context/status-context';
import { API } from '@/lib/api';
import { formatQuota, cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { User } from '@/types';

const containerVariants = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
};

interface Plan {
  id: number;
  name: string;
  description: string;
  price: number;
  quota: number;
  duration: number;
  status: number;
  enable_group?: string;
}

interface UserSubscription {
  id: number;
  plan_id: number;
  plan_name: string;
  status: number;
  start_time: number;
  end_time: number;
  remaining_quota: number;
  total_quota: number;
}

function PackageContent() {
  const { t } = useTranslation();
  const { dispatch } = useUser();
  const status = useSystemStatus();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, subRes] = await Promise.all([
        API.get('/api/subscription/plans'),
        API.get('/api/subscription/self').catch(() => null),
      ]);

      const plansData = plansRes.data as { success: boolean; data: Plan[] };
      if (plansData.success) {
        setPlans(plansData.data || []);
      }

      if (subRes) {
        const subData = subRes.data as { success: boolean; data: UserSubscription };
        if (subData.success && subData.data) {
          setSubscription(subData.data);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await API.get('/api/user/self');
      const data = res.data as { success: boolean; data: User };
      if (data.success) {
        persistUser(data.data);
        dispatch({ type: 'login', payload: data.data });
      }
    } catch {
      // ignore
    }
  }, [dispatch]);

  useEffect(() => {
    loadData();
    refreshUser();
  }, [loadData, refreshUser]);

  const handleSubscribe = async (planId: number) => {
    try {
      const res = await API.post('/api/subscription/pay', { plan_id: planId });
      const data = res.data as { success: boolean; data?: string; message?: string };
      if (data.success && data.data) {
        window.location.href = data.data;
      } else {
        toast.error(data.message || t('订阅失败'));
      }
    } catch {
      toast.error(t('订阅失败'));
    }
  };

  const formatDuration = (days: number) => {
    if (days >= 365 && days % 365 === 0) return `${days / 365} ${t('年')}`;
    if (days >= 30 && days % 30 === 0) return `${days / 30} ${t('个月')}`;
    return `${days} ${t('天')}`;
  };

  const activeSubscription = subscription && subscription.status === 1 ? subscription : null;
  const usedQuota = activeSubscription
    ? activeSubscription.total_quota - activeSubscription.remaining_quota
    : 0;
  const usagePercent = activeSubscription && activeSubscription.total_quota > 0
    ? Math.min(100, Math.round((usedQuota / activeSubscription.total_quota) * 100))
    : 0;

  const activePlans = plans.filter((p) => p.status === 1);

  return (
    <div className="space-y-6 pb-8">

      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Package className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold leading-tight">{t('我的套餐')}</h1>
              <p className="text-sm text-muted-foreground">{t('查看和管理你的订阅套餐')}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            {t('刷新')}
          </Button>
        </div>
      </motion.div>

      {/* Active subscription hero card */}
      {activeSubscription && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        >
          <Card className="shadow-card overflow-hidden">
            <div className="relative px-5 py-5">
              {/* Gradient background */}
              <div
                className="absolute inset-0 pointer-events-none bg-gradient-to-br from-primary/10 via-primary/5 to-transparent"
                aria-hidden="true"
              />
              <div className="relative space-y-4">
                {/* Header row */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                      <Crown className="size-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          {t('当前订阅')}
                        </p>
                        <Badge className="bg-success/10 text-success border-success/20 hover:bg-success/10 text-[10px] px-1.5 py-0">
                          <BadgeCheck className="size-2.5 mr-1" />
                          {t('订阅中')}
                        </Badge>
                      </div>
                      <p className="text-lg font-bold mt-0.5 tracking-tight">
                        {activeSubscription.plan_name}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">{t('到期时间')}</p>
                    <p className="text-sm font-semibold mt-0.5 flex items-center gap-1 justify-end">
                      <Calendar className="size-3.5 text-muted-foreground" />
                      {new Date(activeSubscription.end_time * 1000).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {/* Usage progress */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{t('额度使用')}</span>
                    <span className="font-medium tabular-nums">{usagePercent}%</span>
                  </div>
                  <Progress value={usagePercent} className="h-2" />
                  <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
                    <span>
                      {t('已用')}：{formatQuota(usedQuota, status)}
                    </span>
                    <span>
                      {t('剩余')}：{formatQuota(activeSubscription.remaining_quota, status)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Plans section label */}
      <div>
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <Layers className="size-3.5" />
          {t('可选套餐')}
        </p>

        {/* Plan cards */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-5 bg-muted rounded w-1/2" />
                  <div className="h-3.5 bg-muted rounded w-3/4 mt-1" />
                </CardHeader>
                <CardContent>
                  <div className="h-8 bg-muted rounded w-1/3 mb-4" />
                  <div className="space-y-2">
                    {[1, 2, 3].map((j) => (
                      <div key={j} className="h-3.5 bg-muted rounded" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : activePlans.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-14">
              <div className="size-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <Package className="size-7 text-muted-foreground opacity-40" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">{t('暂无套餐可用')}</p>
              <p className="text-xs text-muted-foreground/60 mt-1">{t('管理员尚未配置套餐，请稍后再试')}</p>
            </CardContent>
          </Card>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {activePlans.map((plan) => {
              const isCurrentPlan = activeSubscription?.plan_id === plan.id;
              return (
                <motion.div key={plan.id} variants={itemVariants}>
                  <Card
                    className={cn(
                      'flex flex-col h-full border-border/60 transition-all duration-200',
                      'hover:border-primary/40 hover:shadow-card-hover',
                      isCurrentPlan && 'ring-2 ring-primary border-primary/60',
                    )}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Zap className="size-4 text-primary shrink-0" />
                          {plan.name}
                        </CardTitle>
                        {isCurrentPlan && (
                          <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/10 shrink-0 text-[10px]">
                            {t('当前套餐')}
                          </Badge>
                        )}
                      </div>
                      {plan.description && (
                        <CardDescription className="text-xs leading-relaxed">
                          {plan.description}
                        </CardDescription>
                      )}
                    </CardHeader>

                    {/* Price area */}
                    <div className="px-6 py-3 bg-accent/40 border-y border-border/40">
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold tracking-tight">
                          ¥{(plan.price / 100).toFixed(2)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          / {formatDuration(plan.duration)}
                        </span>
                      </div>
                    </div>

                    <CardContent className="flex-1 pt-4 pb-4">
                      <ul className="space-y-2">
                        <li className="flex items-center gap-2 text-sm">
                          <span className="size-4 rounded-full bg-success/10 flex items-center justify-center shrink-0">
                            <Check className="size-2.5 text-success" />
                          </span>
                          <span>
                            {t('额度')}：{formatQuota(plan.quota, status)}
                          </span>
                        </li>
                        <li className="flex items-center gap-2 text-sm">
                          <span className="size-4 rounded-full bg-success/10 flex items-center justify-center shrink-0">
                            <Check className="size-2.5 text-success" />
                          </span>
                          <span>
                            {t('有效期')}：{formatDuration(plan.duration)}
                          </span>
                        </li>
                        {plan.enable_group && (
                          <li className="flex items-center gap-2 text-sm">
                            <span className="size-4 rounded-full bg-success/10 flex items-center justify-center shrink-0">
                              <Check className="size-2.5 text-success" />
                            </span>
                            <span>
                              {t('专属分组')}：{plan.enable_group}
                            </span>
                          </li>
                        )}
                      </ul>
                    </CardContent>

                    <CardFooter className="pt-0">
                      <Button
                        className="w-full"
                        variant={isCurrentPlan ? 'outline' : 'default'}
                        onClick={() => handleSubscribe(plan.id)}
                      >
                        {isCurrentPlan ? t('续订套餐') : t('立即订阅')}
                      </Button>
                    </CardFooter>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>
    </div>
  );
}

export default function PackagePage() {
  return (
    <AuthGuard>
      <PackageContent />
    </AuthGuard>
  );
}
