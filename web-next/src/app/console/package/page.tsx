'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Package, RefreshCw, Check, Crown, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthGuard } from '@/components/common/auth-guard';
import { useUser, persistUser } from '@/context/user-context';
import { useSystemStatus } from '@/context/status-context';
import { API } from '@/lib/api';
import { formatQuota } from '@/lib/utils';
import { toast } from 'sonner';
import type { User } from '@/types';

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
  const { state: userState, dispatch } = useUser();
  const status = useSystemStatus();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState(true);

  const user = userState.user;

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Package className="size-6" />
          {t('套餐订阅')}
        </h1>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw className={`size-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          {t('刷新')}
        </Button>
      </div>

      {/* Current subscription */}
      {subscription && subscription.status === 1 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-primary">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Crown className="size-5 text-yellow-500" />
                  {t('当前套餐')}
                </CardTitle>
                <Badge>{t('订阅中')}</Badge>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">{t('套餐名称')}</span>
                <p className="font-medium mt-1">{subscription.plan_name}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t('到期时间')}</span>
                <p className="font-medium mt-1">
                  {new Date(subscription.end_time * 1000).toLocaleDateString()}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">{t('已用额度')}</span>
                <p className="font-medium mt-1">
                  {formatQuota(subscription.total_quota - subscription.remaining_quota, status)}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">{t('剩余额度')}</span>
                <p className="font-medium mt-1">
                  {formatQuota(subscription.remaining_quota, status)}
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Plans */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-muted rounded w-1/2" />
                <div className="h-4 bg-muted rounded w-3/4" />
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-1/3 mb-4" />
                <div className="space-y-2">
                  {[1, 2, 3].map((j) => <div key={j} className="h-4 bg-muted rounded" />)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : plans.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="size-12 text-muted-foreground mb-4 opacity-30" />
            <p className="text-muted-foreground">{t('暂无套餐可用')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.filter(p => p.status === 1).map((plan, idx) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <Card className="flex flex-col h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="size-5 text-primary" />
                    {plan.name}
                  </CardTitle>
                  {plan.description && (
                    <CardDescription>{plan.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="flex-1 space-y-4">
                  <div>
                    <span className="text-3xl font-bold">¥{(plan.price / 100).toFixed(2)}</span>
                    <span className="text-muted-foreground text-sm ml-1">
                      / {formatDuration(plan.duration)}
                    </span>
                  </div>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <Check className="size-4 text-green-500 shrink-0" />
                      <span>{t('额度')}: {formatQuota(plan.quota, status)}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="size-4 text-green-500 shrink-0" />
                      <span>{t('有效期')}: {formatDuration(plan.duration)}</span>
                    </li>
                    {plan.enable_group && (
                      <li className="flex items-center gap-2">
                        <Check className="size-4 text-green-500 shrink-0" />
                        <span>{t('专属分组')}: {plan.enable_group}</span>
                      </li>
                    )}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    onClick={() => handleSubscribe(plan.id)}
                  >
                    {t('立即订阅')}
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
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
