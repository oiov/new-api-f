'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { CreditCard, Gift, RefreshCw, Wallet, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AuthGuard } from '@/components/common/auth-guard';
import { useUser, persistUser } from '@/context/user-context';
import { useSystemStatus } from '@/context/status-context';
import { API } from '@/lib/api';
import { formatQuota, getCurrencySymbol, formatTokensCompact, cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { User } from '@/types';
import { AmountSelector, PayMethodSelector } from './components/amount-selector';
import type { PayMethod } from './components/amount-selector';
import { TopUpHistory } from './components/topup-history';
import { RedemptionHistory } from './components/redemption-history';

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

interface TopUpInfo {
  enable_online_topup: boolean;
  enable_stripe_topup: boolean;
  enable_creem_topup: boolean;
  enable_waffo_topup: boolean;
  pay_methods: PayMethod[];
  min_topup: number;
  stripe_min_topup: number;
  waffo_min_topup: number;
  amount_options: number[];
  discount: Record<number, number>;
}

function TopUpContent() {
  const { t } = useTranslation();
  const { state: userState, dispatch } = useUser();
  const status = useSystemStatus();

  const [info, setInfo]                       = useState<TopUpInfo | null>(null);
  const [infoLoading, setInfoLoading]         = useState(true);
  const [selectedAmount, setSelectedAmount]   = useState<number | null>(null);
  const [selectedMethod, setSelectedMethod]   = useState('');
  const [paying, setPaying]                   = useState(false);
  const [redeemCode, setRedeemCode]           = useState('');
  const [redeemLoading, setRedeemLoading]     = useState(false);
  const [refreshingUser, setRefreshingUser]   = useState(false);

  const user  = userState.user;
  const quota = user?.quota ?? 0;
  const symbol    = getCurrencySymbol(status);
  const isTokens  = status?.quota_display_type === 'TOKENS' || (!status?.quota_display_type && !status?.display_in_currency);

  const refreshUser = useCallback(async (silent = false) => {
    if (!silent) setRefreshingUser(true);
    try {
      const res = await API.get('/api/user/self');
      const data = res.data as { success: boolean; data: User };
      if (data.success) {
        persistUser(data.data);
        dispatch({ type: 'login', payload: data.data });
      }
    } catch { /* ignore */ }
    finally { setRefreshingUser(false); }
  }, [dispatch]);

  const loadInfo = useCallback(async () => {
    setInfoLoading(true);
    try {
      const res = await API.get('/api/user/topup/info');
      const data = res.data as { success: boolean; data: TopUpInfo };
      if (data.success && data.data) {
        setInfo(data.data);
        if (data.data.pay_methods?.length > 0 && !selectedMethod) {
          setSelectedMethod(data.data.pay_methods[0].type);
        }
        if (data.data.amount_options?.length > 0 && selectedAmount === null) {
          setSelectedAmount(data.data.amount_options[0]);
        }
      }
    } catch { /* ignore */ }
    finally { setInfoLoading(false); }
  }, [selectedMethod, selectedAmount]);

  useEffect(() => {
    refreshUser(true);
    loadInfo();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRedeem = async () => {
    if (!redeemCode.trim()) { toast.error(t('请输入兑换码')); return; }
    setRedeemLoading(true);
    try {
      const res = await API.post('/api/user/topup', { key: redeemCode.trim() });
      const data = res.data as {
        success: boolean;
        message?: string;
        data?: number | { subscription_plan_title?: string; subscription_plan_id?: number };
      };
      if (data.success) {
        if (typeof data.data === 'number') {
          toast.success(t('兑换成功！获得 {{amount}} 额度', { amount: data.data.toLocaleString() }));
        } else if (data.data && typeof data.data === 'object') {
          const planLabel = data.data.subscription_plan_title
            || (data.data.subscription_plan_id ? `#${data.data.subscription_plan_id}` : t('订阅套餐'));
          toast.success(t('兑换成功！已激活套餐：{{plan}}', { plan: planLabel }));
        } else {
          toast.success(t('兑换成功'));
        }
        setRedeemCode('');
        await refreshUser(true);
      } else {
        toast.error(data.message || t('兑换失败'));
      }
    } catch { toast.error(t('兑换失败')); }
    finally { setRedeemLoading(false); }
  };

  const handlePay = async () => {
    if (!selectedMethod) { toast.error(t('请选择支付方式')); return; }
    const amount = selectedAmount ?? 0;
    if (!amount || amount <= 0) { toast.error(t('请选择充值金额')); return; }
    if (info?.min_topup && amount < info.min_topup) {
      toast.error(`${t('最低充值额度为')} ${isTokens ? info.min_topup : `${symbol}${info.min_topup}`}`);
      return;
    }
    setPaying(true);
    try {
      const res = await API.post('/api/user/pay', { amount, payment_method: selectedMethod });
      const data = res.data as { message: string; data?: Record<string, string>; url?: string };
      if (data.message === 'success') {
        if (data.data && Object.keys(data.data).length > 0) {
          const form = document.createElement('form');
          form.method = 'POST';
          form.action = data.url || '';
          if (!/Safari/.test(navigator.userAgent) || /Chrome/.test(navigator.userAgent)) form.target = '_blank';
          Object.entries(data.data).forEach(([key, val]) => {
            const input = document.createElement('input');
            input.type = 'hidden'; input.name = key; input.value = val;
            form.appendChild(input);
          });
          document.body.appendChild(form);
          form.submit();
          document.body.removeChild(form);
        } else if (data.url) {
          window.open(data.url, '_blank');
        }
        toast.success(t('正在跳转支付页面...'));
      } else {
        toast.error(typeof data.data === 'string' ? data.data : t('发起支付失败'));
      }
    } catch { toast.error(t('发起支付失败')); }
    finally { setPaying(false); }
  };

  const paymentEnabled = info && (
    info.enable_online_topup || info.enable_stripe_topup ||
    info.enable_creem_topup  || info.enable_waffo_topup
  );

  return (
    <div className="space-y-6 pb-8">

      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex items-center gap-4"
      >
        <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Wallet className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold leading-tight">{t('充值兑换')}</h1>
          <p className="text-sm text-muted-foreground">{t('充值额度或使用兑换码')}</p>
        </div>
      </motion.div>

      {/* Balance card */}
      <motion.div variants={itemVariants} initial="hidden" animate="show">
        <Card className="shadow-card overflow-hidden">
          <div className="relative px-5 py-5">
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at 85% 50%, hsl(var(--primary) / 0.08) 0%, transparent 65%)' }}
              aria-hidden="true"
            />
            <div className="relative flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="size-1.5 rounded-full bg-success animate-pulse" aria-hidden="true" />
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('当前余额')}</p>
                </div>
                <p className="text-3xl font-bold tracking-tight text-foreground tabular-nums">
                  {formatQuota(quota, status)}
                </p>
                {status?.quota_display_type !== 'TOKENS' && (
                  <p className="text-xs font-mono text-muted-foreground mt-1 tabular-nums">
                    ≈ {formatTokensCompact(quota)} tokens
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1.5">{t('可用额度')}</p>
              </div>
              <div className="flex flex-col items-end gap-3">
                <div className="size-14 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 flex items-center justify-center">
                  <Wallet className="size-6 text-primary" />
                </div>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5"
                  onClick={() => refreshUser()} disabled={refreshingUser}>
                  <RefreshCw className={cn('size-3', refreshingUser && 'animate-spin')} />
                  {t('刷新')}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Payment system */}
      {infoLoading ? (
        <Card className="shadow-card">
          <CardContent className="pt-5 space-y-3">
            <Skeleton className="h-5 w-32" />
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
      ) : paymentEnabled ? (
        <motion.div variants={itemVariants} initial="hidden" animate="show">
          <Card className="shadow-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="size-4 text-primary" />
                {t('在线充值')}
              </CardTitle>
              <CardDescription>
                {info?.min_topup
                  ? `${t('最低充值')} ${isTokens ? `${info.min_topup} tokens` : `${symbol}${info.min_topup}`}`
                  : t('选择充值金额和支付方式')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t('充值金额')}</Label>
                <AmountSelector
                  options={info?.amount_options || []}
                  discount={info?.discount || {}}
                  selected={selectedAmount}
                  onSelect={setSelectedAmount}
                  symbol={symbol}
                  isTokens={isTokens}
                />
              </div>
              {info?.pay_methods && info.pay_methods.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t('支付方式')}</Label>
                  <PayMethodSelector
                    methods={info.pay_methods}
                    selected={selectedMethod}
                    onSelect={setSelectedMethod}
                  />
                </div>
              )}
              <Button
                className="w-full h-11 text-sm gap-2 shadow-md shadow-primary/20"
                size="lg"
                onClick={handlePay}
                disabled={paying || !selectedAmount}
              >
                {paying
                  ? <><RefreshCw className="size-4 animate-spin" />{t('处理中...')}</>
                  : <><Zap className="size-4" />{t('立即充值')}</>
                }
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      ) : null}

      {/* Redeem code */}
      <motion.div variants={itemVariants} initial="hidden" animate="show">
        <Card className="shadow-card">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Gift className="size-4 text-primary" />
              {t('兑换码充值')}
            </CardTitle>
            <CardDescription>{t('使用礼品兑换码兑换额度')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder={t('请输入兑换码')}
                value={redeemCode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRedeemCode(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleRedeem()}
                className="flex-1 h-9 font-mono"
              />
              <Button onClick={handleRedeem} disabled={redeemLoading} className="h-9 px-5">
                {redeemLoading ? <RefreshCw className="size-4 animate-spin" /> : t('兑换')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Histories */}
      <motion.div variants={itemVariants} initial="hidden" animate="show" className="space-y-6">
        <TopUpHistory symbol={symbol} />
        <RedemptionHistory />
      </motion.div>

    </div>
  );
}

export default function TopUpPage() {
  return (
    <AuthGuard>
      <TopUpContent />
    </AuthGuard>
  );
}
