'use client';

import { CheckCircle, Play, Timer } from 'lucide-react';

/**
 * The Started / Completed lines of a results Timeline, with the same icons
 * and tones the Assessment and AI Interview result tables use (orange Play,
 * green tick), so every Timeline column and grid-card footer reads alike.
 */
export default function TimelineStamps({
  startedAt,
  completedAt,
  format,
  duration,
  className = '',
}: {
  startedAt?: string | null;
  completedAt?: string | null;
  /** Date formatter of the host table (formatIST, formatTimelineDate, …). */
  format: (iso: string) => string;
  /** Optional duration line, shown with a timer icon. */
  duration?: string | null;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-0.5 text-xs ${className}`}>
      {startedAt && (
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <Play className="w-3 h-3 shrink-0 text-brand-orange-deep" />
          <span>Started: {format(startedAt)}</span>
        </span>
      )}
      {completedAt && (
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <CheckCircle className="w-3 h-3 shrink-0 text-success" />
          <span>Completed: {format(completedAt)}</span>
        </span>
      )}
      {!startedAt && !completedAt && <span>—</span>}
      {duration && (
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <Timer className="w-3 h-3 shrink-0 text-gray-400" />
          <span><span className="text-gray-400 dark:text-slate-500">Duration:</span> {duration}</span>
        </span>
      )}
    </div>
  );
}
