'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { API, updateAPI } from '@/lib/api';
import { persistUser } from '@/context/user-context';
import { toast } from 'sonner';
import type { User } from '@/types';

interface TwoFAPanelProps {
  onSuccess: (user: User) => void;
  onBack: () => void;
}

export function TwoFAPanel({ onSuccess, onBack }: TwoFAPanelProps) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (!code) { toast.error(t('请输入验证码')); return; }
    if (useBackup && code.length !== 8) { toast.error(t('备用码必须是8位')); return; }
    if (!useBackup && !/^\d{6}$/.test(code)) { toast.error(t('验证码必须是6位数字')); return; }

    setLoading(true);
    try {
      const res = await API.post('/api/user/login/2fa', { code });
      const data = res.data as { success: boolean; message?: string; data: User };
      if (data.success) {
        persistUser(data.data);
        updateAPI();
        toast.success(t('登录成功'));
        onSuccess(data.data);
      } else {
        toast.error(data.message || t('验证失败，请重试'));
      }
    } catch {
      toast.error(t('验证失败，请重试'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.3 }}
      className="w-full space-y-6"
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="size-4 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('两步验证')}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {useBackup ? t('请输入备用码完成登录') : t('请输入认证器应用显示的验证码完成登录')}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="twofa-code" className="text-sm font-medium">
            {useBackup ? t('备用码') : t('验证码')}
          </Label>
          <Input
            id="twofa-code"
            type="text"
            inputMode={useBackup ? 'text' : 'numeric'}
            placeholder={useBackup ? t('请输入8位备用码') : t('请输入6位验证码')}
            value={code}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCode(e.target.value)}
            autoFocus
            maxLength={useBackup ? 8 : 6}
            className="h-10 text-center text-lg font-mono tracking-widest"
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleVerify()}
          />
        </div>

        <Button className="w-full h-10 gap-2" onClick={handleVerify} disabled={loading}>
          {loading ? (
            <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <ShieldCheck className="size-4" />
          )}
          {t('验证并登录')}
        </Button>

        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            className="text-primary hover:underline cursor-pointer"
            onClick={() => { setUseBackup(!useBackup); setCode(''); }}
          >
            {useBackup ? t('使用认证器验证码') : t('使用备用码')}
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
            onClick={onBack}
          >
            {t('返回登录')}
          </button>
        </div>

        <div className="rounded-lg bg-muted/40 border border-border/50 px-3 py-2.5">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {t('验证码每30秒更新一次')} · {t('如无法获取验证码，请使用备用码')} · {t('每个备用码只能使用一次')}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
