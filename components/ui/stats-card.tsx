'use client';

import * as React from 'react';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import { cn } from './utils';

// Design tokens extracted from /recruitment/job-openings (master reference).
// Each tone bundles: container border + gradient, icon tile colors, sparkline color,
// hover border, drop shadow, and dark-mode equivalents.
const TONES = {
  blue: {
    container:
      'border-slate-300 bg-gradient-to-br from-white via-white to-blue-50/50 shadow-[0_10px_26px_-22px_rgba(37,99,235,0.35)] hover:border-brand-blue/40 hover:shadow-[0_16px_30px_-22px_rgba(37,99,235,0.45)] dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-blue-500/10 dark:hover:border-brand-blue/50',
    radial:
      'bg-[radial-gradient(circle_at_right,rgba(37,99,235,0.10),transparent_70%)] dark:bg-[radial-gradient(circle_at_right,rgba(37,99,235,0.25),transparent_70%)]',
    icon:
      'bg-blue-50 text-brand-blue ring-blue-100 dark:bg-blue-500/15 dark:ring-blue-400/30 dark:text-blue-300',
    sparkText: 'text-brand-blue/85',
    sparkId: 'spark-blue',
  },
  emerald: {
    container:
      'border-emerald-200/80 bg-gradient-to-br from-white via-white to-emerald-50/60 shadow-[0_10px_26px_-22px_rgba(22,163,74,0.28)] hover:border-emerald-300 hover:shadow-[0_16px_30px_-22px_rgba(22,163,74,0.38)] dark:border-emerald-500/40 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-500/10 dark:hover:border-emerald-400/60',
    radial:
      'bg-[radial-gradient(circle_at_right,rgba(34,197,94,0.12),transparent_70%)] dark:bg-[radial-gradient(circle_at_right,rgba(34,197,94,0.25),transparent_70%)]',
    icon:
      'bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-500/15 dark:ring-emerald-400/30 dark:text-emerald-300',
    sparkText: 'text-emerald-500/85',
    sparkId: 'spark-emerald',
  },
  orange: {
    container:
      'border-orange-200/80 bg-gradient-to-br from-white via-white to-orange-50/60 shadow-[0_10px_26px_-22px_rgba(249,115,22,0.28)] hover:border-orange-300 hover:shadow-[0_16px_30px_-22px_rgba(249,115,22,0.38)] dark:border-orange-500/40 dark:from-slate-900 dark:via-slate-900 dark:to-orange-500/10 dark:hover:border-orange-400/60',
    radial:
      'bg-[radial-gradient(circle_at_right,rgba(249,115,22,0.12),transparent_70%)] dark:bg-[radial-gradient(circle_at_right,rgba(249,115,22,0.25),transparent_70%)]',
    icon:
      'bg-orange-50 text-brand-orange-deep ring-orange-100 dark:bg-orange-500/15 dark:ring-orange-400/30 dark:text-orange-300',
    sparkText: 'text-orange-500/85',
    sparkId: 'spark-orange',
  },
  cyan: {
    container:
      'border-cyan-200/80 bg-gradient-to-br from-white via-white to-cyan-50/60 shadow-[0_10px_26px_-22px_rgba(6,182,212,0.28)] hover:border-cyan-300 hover:shadow-[0_16px_30px_-22px_rgba(6,182,212,0.38)] dark:border-cyan-500/40 dark:from-slate-900 dark:via-slate-900 dark:to-cyan-500/10 dark:hover:border-cyan-400/60',
    radial:
      'bg-[radial-gradient(circle_at_right,rgba(6,182,212,0.12),transparent_70%)] dark:bg-[radial-gradient(circle_at_right,rgba(6,182,212,0.25),transparent_70%)]',
    icon:
      'bg-cyan-50 text-brand-cyan ring-cyan-100 dark:bg-cyan-500/15 dark:ring-cyan-400/30 dark:text-cyan-300',
    sparkText: 'text-cyan-500/85',
    sparkId: 'spark-cyan',
  },
  violet: {
    container:
      'border-violet-200/80 bg-gradient-to-br from-white via-white to-violet-50/60 shadow-[0_10px_26px_-22px_rgba(139,92,246,0.28)] hover:border-violet-300 hover:shadow-[0_16px_30px_-22px_rgba(139,92,246,0.38)] dark:border-violet-500/40 dark:from-slate-900 dark:via-slate-900 dark:to-violet-500/10 dark:hover:border-violet-400/60',
    radial:
      'bg-[radial-gradient(circle_at_right,rgba(139,92,246,0.12),transparent_70%)] dark:bg-[radial-gradient(circle_at_right,rgba(139,92,246,0.25),transparent_70%)]',
    icon:
      'bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-500/15 dark:ring-violet-400/30 dark:text-violet-300',
    sparkText: 'text-violet-500/85',
    sparkId: 'spark-violet',
  },
  amber: {
    container:
      'border-amber-200/80 bg-gradient-to-br from-white via-white to-amber-50/60 shadow-[0_10px_26px_-22px_rgba(245,158,11,0.28)] hover:border-amber-300 hover:shadow-[0_16px_30px_-22px_rgba(245,158,11,0.38)] dark:border-amber-500/40 dark:from-slate-900 dark:via-slate-900 dark:to-amber-500/10 dark:hover:border-amber-400/60',
    radial:
      'bg-[radial-gradient(circle_at_right,rgba(245,158,11,0.12),transparent_70%)] dark:bg-[radial-gradient(circle_at_right,rgba(245,158,11,0.25),transparent_70%)]',
    icon:
      'bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-500/15 dark:ring-amber-400/30 dark:text-amber-300',
    sparkText: 'text-amber-500/85',
    sparkId: 'spark-amber',
  },
  rose: {
    container:
      'border-rose-200/80 bg-gradient-to-br from-white via-white to-rose-50/60 shadow-[0_10px_26px_-22px_rgba(244,63,94,0.28)] hover:border-rose-300 hover:shadow-[0_16px_30px_-22px_rgba(244,63,94,0.38)] dark:border-rose-500/40 dark:from-slate-900 dark:via-slate-900 dark:to-rose-500/10 dark:hover:border-rose-400/60',
    radial:
      'bg-[radial-gradient(circle_at_right,rgba(244,63,94,0.12),transparent_70%)] dark:bg-[radial-gradient(circle_at_right,rgba(244,63,94,0.25),transparent_70%)]',
    icon:
      'bg-rose-50 text-rose-600 ring-rose-100 dark:bg-rose-500/15 dark:ring-rose-400/30 dark:text-rose-300',
    sparkText: 'text-rose-500/85',
    sparkId: 'spark-rose',
  },
  neutral: {
    container:
      'border-brand-blue/15 bg-white shadow-sm shadow-slate-950/5 hover:border-brand-blue/35 hover:shadow-md dark:border-brand-blue/25 dark:bg-slate-900 dark:hover:border-brand-blue/40',
    radial: 'bg-transparent',
    icon:
      'bg-brand-blue/5 text-gray-700 ring-brand-blue/15 dark:bg-brand-blue/10 dark:ring-brand-blue/25 dark:text-slate-300',
    sparkText: 'text-gray-400',
    sparkId: 'spark-neutral',
  },
} as const;

export type StatsCardTone = keyof typeof TONES;

// A handful of sparkline paths so cards visually vary; consumer may override.
const SPARK_PATHS = [
  'M4 27C12 26 15 20 22 20C29 20 31 23 38 18C45 13 49 17 56 14C63 11 66 4 84 4',
  'M4 25C11 25 14 16 21 16C30 16 32 22 40 22C50 22 50 10 58 10C67 10 71 17 84 5',
  'M4 27C14 27 15 18 24 18C31 18 30 22 38 22C46 22 47 12 55 12C64 12 67 4 84 4',
  'M4 28C14 23 19 25 28 22C35 19 39 21 45 16C52 11 57 15 64 12C72 9 76 4 84 4',
];

export interface StatsCardProps {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  tone?: StatsCardTone;
  /** Show the decorative sparkline at the bottom-right. Default: true. */
  sparkline?: boolean;
  /** Override the sparkline path (advanced). */
  sparkPath?: string;
  /** Pick which built-in sparkline variant (0–3) to draw. */
  sparkVariant?: 0 | 1 | 2 | 3;
  /** Optional click target — when set the card becomes a button. */
  onClick?: () => void;
  active?: boolean;
  showClickArrow?: boolean;
  className?: string;
  /** Render extra content under the value (e.g. trend chip). */
  children?: React.ReactNode;
  /** Hover tooltip explaining what the numbers mean. */
  title?: string;
}

export function StatsCard({
  label,
  value,
  icon: Icon,
  tone = 'blue',
  sparkline = true,
  sparkPath,
  sparkVariant = 0,
  onClick,
  active = false,
  showClickArrow = false,
  className,
  children,
  title,
}: StatsCardProps) {
  const t = TONES[tone];
  const path = sparkPath ?? SPARK_PATHS[sparkVariant];
  // Unique gradient id per render to avoid SVG defs collisions when the same tone repeats.
  const gradId = React.useId();

  const content = (
    <>
      <div className={cn('absolute inset-y-0 right-0 w-20', t.radial)} aria-hidden />
      <div className="relative flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-2.5">
          <div
            className={cn(
              'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ring-1 shadow-sm',
              t.icon,
              active && 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/30',
            )}
          >
            <Icon className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm sm:text-xs lg:text-sm font-medium text-slate-700 dark:text-slate-300">{label}</p>
            <div className="mt-0.5 text-2xl sm:text-xl lg:text-[1.75rem] font-semibold tracking-tight text-slate-950 dark:text-slate-50">
              {value}
            </div>
            {children}
          </div>
        </div>
      </div>
      {sparkline && (
        <div className="relative mt-2.5 flex items-end justify-end">
          <svg viewBox="0 0 88 34" className={cn('h-7 w-20', t.sparkText)} aria-hidden="true">
            <path d={path} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <path d={`${path}V34H4Z`} fill={`url(#${gradId})`} opacity="0.18" />
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="currentColor" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      )}
      {onClick && showClickArrow && (
        <span
          className={cn(
            'absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg border transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5',
            active
              ? 'border-brand-blue/25 bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
              : 'border-brand-blue/15 bg-white text-gray-500 shadow-sm group-hover:border-brand-blue/30 group-hover:text-brand-blue dark:border-brand-blue/25 dark:bg-slate-900 dark:text-slate-400 dark:group-hover:text-blue-300',
          )}
          aria-hidden="true"
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      )}
    </>
  );

  const baseClass = cn(
    'group relative overflow-hidden rounded-xl border px-3.5 py-3.5 sm:px-4 sm:py-4 transition-[box-shadow,border-color] duration-200',
    t.container,
    active && 'border-brand-blue/55 bg-brand-blue/5 shadow-md shadow-brand-blue/10 ring-1 ring-brand-blue/20 hover:border-brand-blue/65 dark:border-brand-blue/50 dark:bg-brand-blue/10 dark:ring-brand-blue/25',
    onClick && 'cursor-pointer pr-12 text-left',
    className,
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={baseClass} title={title}>
        {content}
      </button>
    );
  }
  return <div className={baseClass} title={title}>{content}</div>;
}

/** Standard responsive grid for arranging StatsCard rows. */
export function StatsCardGrid({
  children,
  className,
  columns = 4,
}: {
  children: React.ReactNode;
  className?: string;
  /** Max columns at xl. Auto-adjusts down on smaller screens. */
  columns?: 2 | 3 | 4 | 5;
}) {
  const colClass =
    columns === 2
      ? 'grid-cols-1 sm:grid-cols-2'
      : columns === 3
        ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
        : columns === 5
          // Five tiles take the app's existing five-up ladder (Dashboard's
          // overview row): 1 / 2 / 3 / 5, with the md step so a five-card row
          // never leaves a single orphan on a tablet.
          ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5'
          : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4';
  return <div className={cn('grid gap-2.5 sm:gap-3 mb-5', colClass, className)}>{children}</div>;
}
