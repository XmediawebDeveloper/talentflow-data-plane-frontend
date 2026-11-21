'use client';

import * as React from 'react';
import { Search, X } from 'lucide-react';
import { cn } from './utils';
import { IconButton } from '@/components/ui/icon-button';

/**
 * Consolidated toolbar — search + filters + tabs + sort.
 * Mirrors the toolbar pattern from /recruitment/job-openings.
 *
 * Usage:
 *   <PageToolbar>
 *     <PageToolbar.Row>
 *       <PageToolbar.Search value={q} onChange={setQ} placeholder="Search..." />
 *       <PageToolbar.Filters>...</PageToolbar.Filters>
 *     </PageToolbar.Row>
 *     <PageToolbar.Tabs>...</PageToolbar.Tabs>
 *   </PageToolbar>
 */
export function PageToolbar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'tf-card p-3 sm:p-4 mb-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

function ToolbarRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3', className)}>
      {children}
    </div>
  );
}

export interface ToolbarSearchProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  /** Show the clear-X button when value is non-empty. Default true. */
  clearable?: boolean;
}

function ToolbarSearch({
  value,
  onChange,
  placeholder = 'Search...',
  className,
  clearable = true,
}: ToolbarSearchProps) {
  return (
    <div className={cn('relative flex-1 min-w-0', className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-slate-500 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-9 h-9 text-sm text-black dark:text-slate-100 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg placeholder:text-gray-500 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 transition"
      />
      {clearable && value && (
        <IconButton bare label="Clear search"
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-slate-400"
        >
          <X className="w-3.5 h-3.5" />
        </IconButton>
      )}
    </div>
  );
}

function ToolbarFilters({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('flex items-center gap-2 flex-wrap', className)}>{children}</div>;
}

export interface ToolbarTabsProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; count?: number }[];
  className?: string;
}

function ToolbarTabs<T extends string>({ value, onChange, options, className }: ToolbarTabsProps<T>) {
  return (
    <div
      className={cn(
        'mt-3 -mx-1 px-1 overflow-x-auto scrollbar-hide flex items-center gap-1.5',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn('tf-tab-pill', active && 'tf-tab-pill-active')}
          >
            {opt.label}
            {typeof opt.count === 'number' && (
              <span
                className={cn(
                  'ml-1.5 px-1.5 py-0.5 rounded text-2xs font-semibold',
                  active
                    ? 'bg-white/20 text-white'
                    : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-300',
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export interface ToolbarFilterButtonProps {
  active?: boolean;
  onClick?: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

function ToolbarFilterButton({
  active,
  onClick,
  icon,
  children,
  className,
}: ToolbarFilterButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors',
        active
          ? 'bg-brand-blue/10 text-brand-blue border-brand-blue/30 dark:bg-brand-blue/20 dark:border-brand-blue/40'
          : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-300 dark:border-slate-700 hover:border-gray-400 dark:hover:border-slate-600',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

PageToolbar.Row = ToolbarRow;
PageToolbar.Search = ToolbarSearch;
PageToolbar.Filters = ToolbarFilters;
PageToolbar.Tabs = ToolbarTabs;
PageToolbar.FilterButton = ToolbarFilterButton;
