'use client';

import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';

/* The AI Talent Match table's row-action button (JobDetailView's
   ROW_ACTION_BUTTON_CLASS, the same string) — its ⋮ and ▾. */
export const ROW_ACTION_BUTTON_CLASS =
  'inline-flex items-center justify-center p-2.5 rounded-lg border transition-all bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200 hover:border-gray-300 data-[state=open]:bg-gray-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed';
/* …and its open state — the ▾ of an expanded row. */
export const ROW_ACTION_BUTTON_ACTIVE_CLASS =
  'inline-flex items-center justify-center p-2.5 rounded-lg border transition-all bg-brand-blue/10 border-brand-blue/30 text-brand-blue';

/* The AI Talent Match table's ⋮ menu: its content and item classes. */
export const ROW_MENU_CONTENT_CLASS =
  'w-56 !rounded-lg !bg-white !py-1 !px-0 !shadow-xl [&_[role=menuitem][data-highlighted]]:!bg-gray-100 [&_[role=menuitem]:hover]:!bg-gray-100';
export const ROW_MENU_ITEM_CLASS = 'flex items-center gap-2.5 px-4 py-2.5 text-sm cursor-pointer';

/** ▾ — this row's details, open / closed (the row click does the same). */
export function RowDetailsToggle({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return (
    <IconButton bare label={expanded ? 'Hide details' : 'Show details'}
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={expanded ? ROW_ACTION_BUTTON_ACTIVE_CLASS : ROW_ACTION_BUTTON_CLASS}
    >
      <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
    </IconButton>
  );
}

/**
 * A row's remaining columns in a nested table under it — the AI Talent Match
 * table's expanded-row panel, so the main table needs no sideways scroll.
 */
export function RowDetailsPanel({ colSpan, fields }: { colSpan: number; fields: { label: string; value: ReactNode }[] }) {
  return (
    <tr className="bg-gray-50/60 dark:bg-slate-800/30">
      <td colSpan={colSpan} className="tf-td" onClick={(e) => e.stopPropagation()}>
        <div className="tf-panel overflow-x-auto">
          <table className="w-full">
            <thead className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
              <tr>
                {fields.map((f) => (
                  <th key={f.label} className="tf-th-cell text-left tf-th">{f.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {fields.map((f) => (
                  <td key={f.label} className="tf-td tf-body whitespace-nowrap">{f.value}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}
