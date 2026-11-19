'use client';

import { Trash2 } from 'lucide-react';
import {
  RESUME_DELETED_BADGE_CLASS,
  RESUME_DELETED_BADGE_LABEL,
  RESUME_DELETED_ROW_MESSAGE,
} from '@/lib/permissions/resumeDelete';

export interface DeletedResumeRow {
  id: string;
  name?: string | null;
  email?: string | null;
}

/**
 * Placeholder rows for AI Talent Match results whose resume the account owner
 * deleted (2026-11-19). The match was erased (GDPR); only the candidate's name
 * and email remain, so these rows can't be opened, scored or invited. They are
 * kept out of the results list and shown here until the job is run again
 * (the next run removes them on the server).
 */
export default function DeletedResumeRows({ rows, className = '' }: { rows: DeletedResumeRow[]; className?: string }) {
  if (!rows.length) return null;
  return (
    <div
      className={`rounded-lg border border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800/40 ${className}`}
      role="note"
    >
      <div className="flex items-start gap-2 px-3 py-2 border-b border-gray-200 dark:border-slate-700">
        <Trash2 className="w-4 h-4 mt-0.5 shrink-0 text-gray-500 dark:text-slate-400" />
        <p className="text-xs text-gray-600 dark:text-slate-300">
          {RESUME_DELETED_ROW_MESSAGE} They will be removed from this list when you run AI Talent Match again.
        </p>
      </div>
      <ul className="divide-y divide-gray-200 dark:divide-slate-700">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
            <span className="font-medium text-gray-800 dark:text-slate-100">{r.name || 'Unknown'}</span>
            <span className="text-gray-500 dark:text-slate-400 break-all">{r.email || '-'}</span>
            <span className={`${RESUME_DELETED_BADGE_CLASS} ml-auto`} title={RESUME_DELETED_ROW_MESSAGE}>
              {RESUME_DELETED_BADGE_LABEL}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
