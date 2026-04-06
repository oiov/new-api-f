'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface PaginationProps {
  currentPage: number;   // 1-based
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  className?: string;
  showTotal?: boolean;
}

function buildPageList(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  pages.push(1);
  if (left > 2) pages.push('...');
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < total - 1) pages.push('...');
  pages.push(total);
  return pages;
}

export function Pagination({
  currentPage, totalItems, pageSize, onPageChange, disabled, className, showTotal = true,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const pages = buildPageList(currentPage, totalPages);

  if (totalPages <= 1 && totalItems === 0) return null;

  return (
    <div className={cn('flex items-center justify-between gap-4 px-1 py-3 flex-wrap', className)}>
      {showTotal && (
        <span className="text-xs text-muted-foreground shrink-0">
          共 <span className="font-medium text-foreground">{totalItems}</span> 条
        </span>
      )}
      <div className="flex items-center gap-1 ml-auto">
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          disabled={disabled || currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          aria-label="上一页"
        >
          <ChevronLeft className="size-4" />
        </Button>

        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`dots-${i}`} className="size-8 flex items-center justify-center text-muted-foreground">
              <MoreHorizontal className="size-4" />
            </span>
          ) : (
            <Button
              key={p}
              variant={p === currentPage ? 'default' : 'outline'}
              size="icon"
              className="size-8 text-xs"
              disabled={disabled}
              onClick={() => onPageChange(p)}
              aria-current={p === currentPage ? 'page' : undefined}
            >
              {p}
            </Button>
          )
        )}

        <Button
          variant="outline"
          size="icon"
          className="size-8"
          disabled={disabled || currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          aria-label="下一页"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
