'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// ── FilterGroup ────────────────────────────────────────────────────────────────

interface FilterGroupProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function FilterGroup({ title, children, defaultOpen = true }: FilterGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full py-1.5 text-left group"
      >
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">
          {title}
        </span>
        <ChevronDown className={cn('size-3.5 text-muted-foreground/60 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="pt-1 pb-3 space-y-0.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── FilterItem ────────────────────────────────────────────────────────────────

interface FilterItemProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
  badge?: React.ReactNode;
}

export function FilterItem({ active, onClick, children, count, badge }: FilterItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left transition-all duration-150 cursor-pointer',
        active
          ? 'bg-primary text-primary-foreground font-semibold'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <span className="flex-1 truncate">{children}</span>
      {badge && <span className={cn('shrink-0', active ? 'opacity-80' : '')}>{badge}</span>}
      {count !== undefined && (
        <span className={cn(
          'shrink-0 text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-semibold',
          active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground',
        )}>
          {count}
        </span>
      )}
    </button>
  );
}
