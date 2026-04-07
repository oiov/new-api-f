'use client';

import React from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  iconBg?: string;
  iconColor?: string;
  onClick?: () => void;
}

export function StatCard({ label, value, sub, icon: Icon, iconBg, iconColor, onClick }: StatCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-2xl border bg-card px-5 py-4 transition-all duration-200',
        onClick
          ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-primary/40 active:scale-[0.98]'
          : 'hover:shadow-sm',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <p className="text-2xl font-bold mt-1.5 tabular-nums text-foreground">{value}</p>
          {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
          {onClick && (
            <p className="text-[10px] text-muted-foreground/50 mt-1.5 flex items-center gap-0.5">
              <ChevronRight className="size-2.5" />
              <span>点击查看</span>
            </p>
          )}
        </div>
        {Icon && (
          <div className={cn('size-10 rounded-xl flex items-center justify-center shrink-0', iconBg || 'bg-primary/10')}>
            <Icon className={cn('size-5', iconColor || 'text-primary')} />
          </div>
        )}
      </div>
    </div>
  );
}
