'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'next/navigation';
import { MessageSquare, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { API } from '@/lib/api';

function Chat2LinkContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    const id = searchParams.get('id');

    if (!token && !id) {
      setError(t('无效的链接'));
      setLoading(false);
      return;
    }

    const redirect = async () => {
      try {
        const params: Record<string, string> = {};
        if (token) params.token = token;
        if (id) params.id = id;

        const qs = new URLSearchParams(params).toString();
        const res = await API.get(`/api/chat2link?${qs}`);
        const data = res.data as { success: boolean; data?: string; message?: string };
        if (data.success && data.data) {
          window.location.href = data.data;
        } else {
          setError(data.message || t('获取链接失败'));
          setLoading(false);
        }
      } catch {
        setError(t('获取链接失败'));
        setLoading(false);
      }
    };

    redirect();
  }, [searchParams, t]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-sm w-full shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="size-5" />
            {t('跳转中')}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t('正在获取链接...')}</p>
            </div>
          ) : (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Chat2LinkPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="size-8 animate-spin" /></div>}>
      <Chat2LinkContent />
    </Suspense>
  );
}
