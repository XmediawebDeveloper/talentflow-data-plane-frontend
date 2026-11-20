'use client';

import { useEffect } from 'react';
import { LayoutGrid, List } from 'lucide-react';
import { useIsMobile } from './use-mobile';
import { IconButton } from '@/components/ui/icon-button';

export type ListDisplayMode = 'list' | 'grid';

/**
 * Shared List/Grid switch for candidate-style tables app-wide (Scored Resumes,
 * Assessment Results, AI Interview Results, AI Talent Match, AI Interview
 * Candidate Results, …) so every list that offers a card view uses the same
 * control rather than each growing its own.
 *
 * Below sm the buttons shrink (p-1, 14px icons) so the switch is 28px tall (36px from sm up, the toolbar's h-9 band) —
 * the height of the toolbar pills on the Job Openings mobile layout. Callers
 * that pin a desktop height pass it as `sm:h-9`.
 */
export default function ListViewToggle({
  value,
  onChange,
  className = '',
}: {
  value: ListDisplayMode;
  onChange: (mode: ListDisplayMode) => void;
  className?: string;
}) {
  /* Mobile (< md) is list-only: the switch is hidden there, so a grid choice
     carried over from a wider screen (or restored state) falls back to list. */
  const isMobile = useIsMobile();
  useEffect(() => {
    if (isMobile && value === 'grid') onChange('list');
  }, [isMobile, value, onChange]);

  return (
    <div
      /* Hook for page toolbars' phone layout (globals.css, `.tf-jobs-toolbar`). */
      data-list-view-toggle=""
      className={`inline-flex items-center gap-0.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5 shrink-0 ${className} max-md:!hidden`}
    >
      <IconButton bare label="List view"
        type="button"
        onClick={() => onChange('list')}
        aria-pressed={value === 'list'}
        className={`p-1 sm:p-2 rounded-md transition-colors ${
          value === 'list'
            ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
            : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-gray-50 dark:hover:bg-slate-800'
        }`}
      >
        <List className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      </IconButton>
      <IconButton bare label="Grid view"
        type="button"
        onClick={() => onChange('grid')}
        aria-pressed={value === 'grid'}
        className={`p-1 sm:p-2 rounded-md transition-colors ${
          value === 'grid'
            ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
            : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-gray-50 dark:hover:bg-slate-800'
        }`}
      >
        <LayoutGrid className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      </IconButton>
    </div>
  );
}
