'use client';

import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  onClick?: () => void;
}

export function StatCard({ label, value, sub, accent, onClick }: StatCardProps) {
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
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className={cn('text-2xl font-bold mt-1.5 tabular-nums', accent || 'text-foreground')}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
      {onClick && (
        <p className="text-[10px] text-muted-foreground/50 mt-1.5 flex items-center gap-0.5">
          <ChevronRight className="size-2.5" />
          <span>点击查看</span>
        </p>
      )}
    </div>
  );
}
