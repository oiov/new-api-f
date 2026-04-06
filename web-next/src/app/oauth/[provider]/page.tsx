'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { API, updateAPI } from '@/lib/api';
import { useUser, persistUser } from '@/context/user-context';
import { toast } from 'sonner';
import type { User } from '@/types';

export default function OAuthCallbackPage() {
  const { t } = useTranslation();
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { dispatch } = useUser();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  const provider = params.provider as string;

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const token = searchParams.get('token');

    if (!code && !token) {
      setStatus('error');
      setMessage(t('无效的 OAuth 回调参数'));
      return;
    }

    const doCallback = async () => {
      try {
        let endpoint = '';
        const payload: Record<string, string> = {};

        if (token) {
          // Token-based auth (some providers use token directly)
          endpoint = `/api/oauth/${provider}`;
          payload.token = token;
        } else {
          endpoint = `/api/oauth/${provider}`;
          payload.code = code!;
          if (state) payload.state = state;
        }

        const res = await API.post(endpoint, payload);
        const data = res.data as { success: boolean; message?: string; data: User };

        if (data.success) {
          const user = data.data;
          persistUser(user);
          dispatch({ type: 'login', payload: user });
          updateAPI();
          setStatus('success');
          toast.success(t('登录成功'));
          setTimeout(() => router.replace('/console'), 1000);
        } else {
          setStatus('error');
          setMessage(data.message || t('OAuth 登录失败'));
        }
      } catch {
        setStatus('error');
        setMessage(t('OAuth 登录失败，请稍后重试'));
      }
    };

    doCallback();
  }, [provider, searchParams, dispatch, router, t]);

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-var(--header-height))] px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center space-y-4 max-w-sm"
      >
        {status === 'loading' && (
          <>
            <Loader2 className="size-12 mx-auto animate-spin text-primary" />
            <h2 className="text-xl font-semibold">{t('正在登录...')}</h2>
            <p className="text-muted-foreground text-sm">
              {t('正在处理 OAuth 登录，请稍候')}
            </p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle className="size-12 mx-auto text-green-500" />
            <h2 className="text-xl font-semibold">{t('登录成功')}</h2>
            <p className="text-muted-foreground text-sm">
              {t('正在跳转到控制台...')}
            </p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="size-12 mx-auto text-destructive" />
            <h2 className="text-xl font-semibold">{t('登录失败')}</h2>
            <p className="text-muted-foreground text-sm">{message}</p>
            <Link href="/login">
              <Button>{t('返回登录')}</Button>
            </Link>
          </>
        )}
      </motion.div>
    </div>
  );
}
