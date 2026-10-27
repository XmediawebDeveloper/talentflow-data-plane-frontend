'use client';

import { LayoutGrid, List } from 'lucide-react';

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
  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5 shrink-0 ${className}`}
    >
      <button
        type="button"
        onClick={() => onChange('list')}
        aria-pressed={value === 'list'}
        aria-label="List view"
        title="List view"
        className={`p-1 sm:p-2 rounded-md transition-colors ${
          value === 'list'
            ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
            : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-gray-50 dark:hover:bg-slate-800'
        }`}
      >
        <List className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      </button>
      <button
        type="button"
        onClick={() => onChange('grid')}
        aria-pressed={value === 'grid'}
        aria-label="Grid view"
        title="Grid view"
        className={`p-1 sm:p-2 rounded-md transition-colors ${
          value === 'grid'
            ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
            : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-gray-50 dark:hover:bg-slate-800'
        }`}
      >
        <LayoutGrid className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      </button>
    </div>
  );
}
