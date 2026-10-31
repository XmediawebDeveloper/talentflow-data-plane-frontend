'use client';

import { FileText } from 'lucide-react';
import { formatISTDate } from '@/lib/utils/dateUtils';

export interface AIInterviewConfigSummaryCardProps {
  title: string;
  /** Ordinal within its job version (1, 2, ...) — omitted while the lineage
   *  that derives it is still loading. */
  version?: number;
  createdAt?: string;
  totalQuestions?: number;
  durationMinutes?: number;
}

/**
 * The "what you're about to act on" card shown inside the archive and delete
 * confirms for an AI interview configuration — icon + "AI INTERVIEW
 * CONFIGURATION" label + title + a Version / Created / Questions / Minutes
 * meta line. Shared by both dialogs so the summary cannot drift between them.
 */
export default function AIInterviewConfigSummaryCard({
  title,
  version,
  createdAt,
  totalQuestions,
  durationMinutes,
}: AIInterviewConfigSummaryCardProps) {
  const metaParts = [
    version ? `Version ${version}` : null,
    createdAt ? `Created on ${formatISTDate(createdAt)}` : null,
    typeof totalQuestions === 'number' ? `${totalQuestions} Question${totalQuestions === 1 ? '' : 's'}` : null,
    typeof durationMinutes === 'number' ? `${durationMinutes} Minutes` : null,
  ].filter((part): part is string => !!part);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 px-4 py-3.5 flex items-start gap-3">
      <div className="w-10 h-10 shrink-0 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
        <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-2xs font-semibold tracking-wide text-gray-500 dark:text-slate-400 uppercase">
          AI Interview Configuration
        </p>
        <p className="mt-0.5 text-sm sm:text-base font-bold text-gray-900 dark:text-slate-100 truncate">{title}</p>
        {metaParts.length > 0 && (
          <p className="mt-1 tf-body-muted">
            {metaParts.map((part, i) => (
              <span key={part}>
                {i > 0 && <span className="mx-1.5 text-gray-300 dark:text-slate-600">|</span>}
                {part}
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}
