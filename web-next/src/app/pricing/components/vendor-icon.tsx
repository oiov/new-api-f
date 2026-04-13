'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';

interface VendorIconProps {
  icon?: string;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

const sizeMap = {
  xs: 'size-4 text-[10px]',
  sm: 'size-5 text-[11px]',
  md: 'size-7 text-sm',
  lg: 'size-10 text-base',
};

export function VendorIcon({ icon, name, size = 'sm' }: VendorIconProps) {
  const [error, setError] = useState(false);
  const initial = name ? name.charAt(0).toUpperCase() : '?';

  if (!icon || error) {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-md font-bold shrink-0',
          'bg-muted text-muted-foreground border border-border/60',
          sizeMap[size],
        )}
      >
        {initial}
      </span>
    );
  }

  return (
    <img
      src={`https://registry.npmmirror.com/@lobehub/icons-static-png/latest/files/dark/${icon}.png`}
      alt={name || icon}
      onError={() => setError(true)}
      className={cn('rounded-md object-contain shrink-0', sizeMap[size])}
    />
  );
}
