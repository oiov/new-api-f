'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PayMethod {
  name: string;
  type: string;
  color?: string;
  min_topup?: string;
  icon?: string;
}

export function AmountSelector({
  options,
  discount,
  selected,
  onSelect,
  symbol,
  isTokens,
}: {
  options: number[];
  discount: Record<number, number>;
  selected: number | null;
  onSelect: (v: number) => void;
  symbol: string;
  isTokens: boolean;
}) {
  const { t } = useTranslation();

  if (options.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t('管理员未配置充值金额选项')}</p>
    );
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {options.map((opt) => {
        const disc = discount[opt];
        const isActive = selected === opt;
        return (
          <button
            key={opt}
            onClick={() => onSelect(opt)}
            className={cn(
              'relative rounded-xl border px-3 py-3 text-center transition-all duration-150 hover:border-primary/60',
              isActive
                ? 'border-primary bg-primary/5 ring-2 ring-primary ring-offset-1'
                : 'border-border/60 bg-card hover:bg-accent/30',
            )}
          >
            {disc && disc < 1 && (
              <span className="absolute -top-2 -right-1 text-[10px] font-bold bg-destructive text-destructive-foreground rounded-full px-1.5 py-0.5">
                {Math.round((1 - disc) * 100)}% OFF
              </span>
            )}
            {isTokens ? (
              <>
                <div className="text-base font-bold text-foreground">{opt.toLocaleString()}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{t('tokens')}</div>
              </>
            ) : (
              <div className="text-base font-bold text-foreground">{symbol}{opt}</div>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function PayMethodSelector({
  methods,
  selected,
  onSelect,
}: {
  methods: PayMethod[];
  selected: string;
  onSelect: (v: string) => void;
}) {
  if (methods.length === 0) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {methods.map((m) => {
        const isActive = selected === m.type;
        return (
          <button
            key={m.type}
            onClick={() => onSelect(m.type)}
            className={cn(
              'flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-all duration-150',
              isActive
                ? 'border-primary bg-primary/5 ring-2 ring-primary ring-offset-1'
                : 'border-border/60 bg-card hover:border-primary/40 hover:bg-accent/30',
            )}
          >
            <CreditCard className="size-4 text-muted-foreground shrink-0" />
            <span className="truncate">{m.name}</span>
          </button>
        );
      })}
    </div>
  );
}
