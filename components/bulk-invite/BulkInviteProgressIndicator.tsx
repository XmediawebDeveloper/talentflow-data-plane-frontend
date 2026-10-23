'use client';

import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, Send, X, XCircle } from 'lucide-react';
import { useBulkInviteProgress } from '@/contexts/BulkInviteProgressContext';
import { isBulkInviteActive } from '@/lib/services/bulkInviteService';
import BulkInviteResultsDialog from './BulkInviteResultsDialog';
import { bulkInviteStatusLine } from './BulkInviteProgressPanel';

/**
 * Floating card, bottom-left, for every bulk send this browser is following:
 * the counts while it runs, the outcome when it ends, View results, and
 * Dismiss once finished. Bottom-LEFT so it never sits on the bulk scoring
 * widget, which owns the bottom-right corner. Mounted once in the dashboard
 * layout; renders nothing when there is nothing to follow.
 */
export default function BulkInviteProgressIndicator() {
  const { jobs, dismiss, openResultsFor, setOpenResultsFor } = useBulkInviteProgress();
  const [collapsed, setCollapsed] = useState(false);
  const shown = jobs.filter((j) => !j.dismissed);
  const open = openResultsFor ? jobs.find((j) => j.job_id === openResultsFor) ?? null : null;
  if (shown.length === 0 && !open) return null;
  const running = shown.filter(isBulkInviteActive).length;

  return (
    <>
      {shown.length > 0 && (
        <div className="fixed bottom-4 left-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl shadow-black/10 overflow-hidden" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50">
            <p className="inline-flex items-center gap-2 text-xs font-semibold text-gray-900 dark:text-slate-50">
              <Send className="w-3.5 h-3.5 text-brand-blue" />
              {running > 0 ? `Sending invitations (${running})` : 'Invitations sent'}
            </p>
            <button type="button" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand' : 'Collapse'} className="h-7 w-7 inline-flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800">
              {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
          {!collapsed && (
            <ul className="max-h-64 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-800">
              {shown.map((job) => {
                const active = isBulkInviteActive(job);
                const pct = job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0;
                return (
                  <li key={job.job_id} className="px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-900 dark:text-slate-50 truncate">
                          {job.kind === 'assessment' ? 'Assessment' : 'AI Interview'}{job.version_label ? ` · ${job.version_label}` : ''}
                        </p>
                        {(job.jdCode || job.jdTitle) && (
                          <p className="text-2xs text-gray-500 dark:text-slate-400 truncate">{[job.jdCode, job.jdTitle].filter(Boolean).join(' · ')}</p>
                        )}
                      </div>
                      {!active && (
                        <button type="button" onClick={() => dismiss(job.job_id)} aria-label="Dismiss" className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-slate-800">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
                      <div className={`h-full rounded-full transition-[width] duration-500 ${job.status === 'failed' ? 'bg-destructive' : job.status === 'cancelled' ? 'bg-warning-strong' : 'bg-brand-blue'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <p className="inline-flex items-center gap-1.5 text-2xs text-gray-600 dark:text-slate-400 min-w-0 truncate">
                        {active ? <Loader2 className="w-3 h-3 animate-spin text-brand-blue shrink-0" />
                          : job.status === 'done' ? <CheckCircle2 className="w-3 h-3 text-success shrink-0" />
                          : <XCircle className="w-3 h-3 text-warning-strong shrink-0" />}
                        <span className="truncate">{bulkInviteStatusLine(job)}</span>
                      </p>
                      <button type="button" onClick={() => setOpenResultsFor(job.job_id)} className="shrink-0 text-2xs font-medium text-brand-blue hover:underline underline-offset-2">
                        View results
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      {open && <BulkInviteResultsDialog job={open} onClose={() => setOpenResultsFor(null)} />}
    </>
  );
}
