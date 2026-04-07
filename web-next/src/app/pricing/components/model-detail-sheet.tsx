'use client';

import React from 'react';
import { ArrowUpRight, Cpu, Database, Info, Tag, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { fmtRatio } from '../helpers';
import type { ModelPrice } from '../types';
import { VendorIcon } from './vendor-icon';
import { CopyButton } from './copy-button';

interface ModelDetailSheetProps {
  model: ModelPrice | null;
  open: boolean;
  onClose: () => void;
}

export function ModelDetailSheet({ model, open, onClose }: ModelDetailSheetProps) {
  const { t } = useTranslation();
  if (!model) return null;

  const inputPrice = fmtRatio(model.model_ratio);
  const outputPrice = fmtRatio(model.model_ratio * model.completion_ratio);
  const isTokenBased = model.quota_type === 0;

  const metrics = [
    { label: t('输入价格'), value: inputPrice, unit: 'per 1K tokens', icon: ArrowUpRight, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
    { label: t('输出价格'), value: outputPrice, unit: 'per 1K tokens', icon: ArrowUpRight, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30' },
    { label: t('完成系数'), value: fmtRatio(model.completion_ratio, 4), unit: t('输出/输入 比值'), icon: Cpu, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/30' },
    { label: t('计费类型'), value: isTokenBased ? t('按量计费') : t('按次计费'), unit: isTokenBased ? t('Token 用量') : t('请求次数'), icon: Database, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/30' },
  ];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col gap-0 overflow-hidden">
        <div className="bg-muted/30 px-6 pt-6 pb-5 shrink-0 border-b">
          <SheetHeader>
            <div className="flex items-start gap-3">
              <div className={cn('shrink-0 size-10 rounded-xl flex items-center justify-center', 'bg-background border border-border shadow-sm')}>
                {model.vendor_icon || model.vendor_name
                  ? <VendorIcon icon={model.vendor_icon} name={model.vendor_name} size="md" />
                  : <Zap className="size-5 text-foreground/70" />}
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-sm font-medium text-muted-foreground mb-1">{t('模型详情')}</SheetTitle>
                <div className="flex items-start gap-2">
                  <p className="font-mono text-base font-bold break-all leading-snug">{model.model_name}</p>
                  <CopyButton text={model.model_name} className="mt-0.5 shrink-0" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {model.vendor_name && (
                <Badge variant="outline" className="text-xs gap-1.5">
                  <VendorIcon icon={model.vendor_icon} name={model.vendor_name} size="xs" />
                  {model.vendor_name}
                </Badge>
              )}
              <Badge variant={isTokenBased ? 'default' : 'secondary'} className="text-xs">
                {isTokenBased ? t('按量') : t('按次')}
              </Badge>
            </div>
          </SheetHeader>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-5 space-y-5">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t('价格参数')}</p>
              <div className="grid grid-cols-2 gap-3">
                {metrics.map((m) => (
                  <div key={m.label} className={cn('rounded-xl p-3.5', m.bg)}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <m.icon className={cn('size-3.5', m.color)} />
                      <span className="text-xs text-muted-foreground">{m.label}</span>
                    </div>
                    <p className={cn('font-mono text-lg font-bold', m.color)}>{m.value}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{m.unit}</p>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {(model.enable_groups || []).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t('可用分组')}</p>
                <div className="flex flex-wrap gap-2">
                  {(model.enable_groups || []).map((g) => (
                    <Badge key={g} variant="outline" className="text-sm px-3 py-1.5 gap-1.5">
                      <Tag className="size-3" />{g}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t('模型标识符')}</p>
              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2.5">
                <code className="font-mono text-sm flex-1 break-all text-foreground">{model.model_name}</code>
                <CopyButton text={model.model_name} />
              </div>
              <p className="text-xs text-muted-foreground mt-2">{t('在 API 请求中使用 model 字段传入此标识符')}</p>
            </div>

            <div className="flex items-start gap-2.5 rounded-lg border border-blue-200/60 bg-blue-50/60 dark:border-blue-800/40 dark:bg-blue-900/10 px-3.5 py-3 text-xs text-blue-700 dark:text-blue-300">
              <Info className="size-3.5 shrink-0 mt-0.5" />
              <span>{t('价格基于系统设定的倍率，实际费用以账户余额扣除为准。')}</span>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
