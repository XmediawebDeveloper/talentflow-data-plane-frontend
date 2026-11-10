'use client';

import React from 'react';
import { FolderOpen, Database, AlertTriangle, X } from 'lucide-react';
import { countBySource, type PickPartition } from '@/lib/utils/resumeSelection';

/* "Select From" footer: how many are picked from each source, and which picks
   won't be invited and why — the bottom count used to read 3 against "4
   selected" with nothing saying a resume had been dropped. */
export default function ResumeSelectionSummary({
  partition,
  onClear,
}: {
  partition: PickPartition;
  onClear: () => void;
}) {
  const total = partition.accepted.length + partition.noEmail.length + partition.duplicate.length;
  const picked = countBySource([...partition.accepted, ...partition.noEmail, ...partition.duplicate]);
  const skipped = partition.noEmail.length + partition.duplicate.length;
  if (total === 0) {
    return <span className="tf-meta">No resumes selected</span>;
  }
  const names = (list: { name: string }[]) => list.map((p) => p.name).join(', ');
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 tf-meta">
        <span className="font-medium text-gray-900 dark:text-slate-50">{total} selected</span>
        <span className="inline-flex items-center gap-1">
          <FolderOpen className="w-3.5 h-3.5 text-brand-orange" />
          My Resumes <span className="font-semibold tabular-nums">{picked.myResumes}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Database className="w-3.5 h-3.5 text-brand-cyan" />
          Shared Database <span className="font-semibold tabular-nums">{picked.sharedDb}</span>
        </span>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-0.5 text-brand-blue hover:underline"
        >
          <X className="w-3 h-3" />
          Clear selection
        </button>
      </div>
      {skipped > 0 && (
        <div className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0" />
          <span className="min-w-0 [overflow-wrap:anywhere]">
            {partition.accepted.length} will be invited, {skipped} skipped
            {partition.duplicate.length > 0 && <> — same email already listed: {names(partition.duplicate)}</>}
            {partition.noEmail.length > 0 && <>{partition.duplicate.length > 0 ? ';' : ' —'} no email: {names(partition.noEmail)}</>}
          </span>
        </div>
      )}
    </div>
  );
}
