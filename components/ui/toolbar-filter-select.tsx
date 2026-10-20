'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * A toolbar filter dropdown styled EXACTLY as the Job Details "AI Talent Match
 * Results" tab's reference control (its "All Matches" select): a `bg-brand-blue/5`
 * rounded pill wrapping an `appearance-none h-7` native <select> that carries its
 * own chevron, so the filter selects on the sibling Job Details tabs (Scored
 * Resumes / Assessments Results / AI Interview Result) read identically to that
 * reference rather than as bordered boxes.
 *
 * Chrome only — the <option>s and the value/onChange wiring come from the caller,
 * so each tab keeps its own filter behaviour while sharing one look.
 */
export default function ToolbarFilterSelect({
  value,
  onChange,
  ariaLabel,
  children,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  /** The <option> elements. */
  children: React.ReactNode;
  className?: string;
}) {
  return (
    /* Below sm: the Job Openings mobile sort pill's size (p-0.5 + h-6, 12px),
       like SortByControl beside it; sm and up unchanged.
       max-sm:!text-xs because globals.css forces every <select> to 16px below 640px (iOS zoom guard), unlayered, which outranks a plain text-xs. */
    <div
      className={`inline-flex items-center bg-brand-blue/5 dark:bg-brand-blue/10 rounded-lg p-0.5 sm:p-1 transition-all ${className ?? ''}`}
    >
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={ariaLabel}
          className="appearance-none h-6 sm:h-7 pl-2 sm:pl-2.5 pr-7 sm:pr-8 bg-transparent rounded-md focus:outline-none focus:ring-2 focus:ring-brand-blue/40 max-sm:!text-xs sm:text-sm text-gray-700 dark:text-slate-300 cursor-pointer"
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-500 dark:text-slate-400" />
      </div>
    </div>
  );
}
