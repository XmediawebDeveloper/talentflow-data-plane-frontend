'use client';

import { Database, Edit3, FileSpreadsheet } from 'lucide-react';

/*
 * The one Manual / Upload Excel / Select From switcher for every invite popup —
 * ShareAssessmentModal, ShareAIInterviewModal and the bulk Create / Send
 * dialog's "Add candidates directly". Labels, icons, styling and the tab a
 * popup opens on live here only; change them here and every popup follows.
 */

export type InviteEntryMode = 'manual' | 'excel' | 'database';

/** Every invite popup opens on Manual, with one empty row ready to type into. */
export const DEFAULT_INVITE_ENTRY_MODE: InviteEntryMode = 'manual';

export const inviteEntryModeTabClass = (active: boolean) =>
  `flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${
    active
      ? 'bg-gray-100 dark:bg-slate-800 border-gray-400 dark:border-slate-500 text-gray-900 dark:text-slate-50 font-medium'
      : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800'
  } disabled:opacity-50 disabled:cursor-not-allowed`;

export default function InviteEntryModeTabs({
  mode,
  onManual,
  onExcel,
  onSelectFrom,
  disabled = false,
}: {
  mode: InviteEntryMode | null;
  onManual: () => void;
  onExcel: () => void;
  /** Omit to hide "Select From" (the bulk dialog picks from its own lists). */
  onSelectFrom?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={onManual} disabled={disabled} className={inviteEntryModeTabClass(mode === 'manual')}>
        <Edit3 className="w-4 h-4 text-brand-blue" aria-hidden="true" />
        Manual
      </button>
      <button type="button" onClick={onExcel} disabled={disabled} className={inviteEntryModeTabClass(mode === 'excel')}>
        <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        Upload Excel
      </button>
      {onSelectFrom && (
        <button type="button" onClick={onSelectFrom} disabled={disabled} className={inviteEntryModeTabClass(mode === 'database')}>
          <Database className="w-4 h-4 text-brand-orange" aria-hidden="true" />
          Select From
        </button>
      )}
    </div>
  );
}
