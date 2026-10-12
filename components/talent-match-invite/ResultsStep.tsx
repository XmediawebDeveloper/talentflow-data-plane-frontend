'use client';

import { Check, Copy, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { SendResult, SendStatus } from './inviteVersions';

const STATUS_CHIP: Record<SendStatus, { label: string; className: string }> = {
  sent: { label: 'Sent', className: 'bg-success-subtle text-success ring-success-line' },
  skipped: { label: 'Skipped', className: 'bg-warning-subtle text-warning-strong ring-warning-line' },
  failed: { label: 'Failed', className: 'bg-destructive-subtle text-destructive ring-destructive-line' },
};

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error('Could not copy — your browser blocked clipboard access');
  }
}

/**
 * Step 4 — Results: each candidate's own outcome (sent, skipped as already
 * invited / no email, or failed with the reason), live while sending, with
 * their link to copy when the API returned one.
 */
export default function ResultsStep({
  results,
  total,
  sending,
}: {
  results: SendResult[];
  /** How many were being sent, for the progress line. */
  total: number;
  sending: boolean;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const count = (s: SendStatus) => results.filter((r) => r.status === s).length;
  const links = results.filter((r) => r.link);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2" aria-live="polite">
        {sending ? (
          <p className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
            <Loader2 className="w-4 h-4 animate-spin text-brand-blue" />
            Sending {results.length} of {total}…
          </p>
        ) : (
          <p className="text-sm text-gray-700 dark:text-slate-300">
            <span className="font-medium text-success">{count('sent')} sent</span>
            {count('skipped') > 0 && <> · <span className="font-medium text-warning-strong">{count('skipped')} skipped</span></>}
            {count('failed') > 0 && <> · <span className="font-medium text-destructive">{count('failed')} failed</span></>}
          </p>
        )}
        {!sending && links.length > 1 && (
          <button
            type="button"
            onClick={() => copy(links.map((r) => `${r.name} <${r.email}>: ${r.link}`).join('\n'), 'All links')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-blue hover:text-brand-blue-2 hover:underline underline-offset-2"
          >
            <Copy className="w-3.5 h-3.5" /> Copy all links
          </button>
        )}
      </div>

      <ul className="rounded-xl border border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-700/60 overflow-hidden">
        {results.map((r) => {
          const chip = STATUS_CHIP[r.status];
          return (
            <li key={r.candidateId} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-slate-50 truncate">{r.name}</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{r.email || 'No email'}</p>
                {r.reason && <p className="text-xs text-gray-600 dark:text-slate-400 mt-0.5 [overflow-wrap:anywhere]">{r.reason}</p>}
              </div>
              {r.link && (
                <button
                  type="button"
                  onClick={async () => { await copy(r.link as string, `Link for ${r.name}`); setCopiedId(r.candidateId); }}
                  aria-label={`Copy invitation link for ${r.name}`}
                  className="shrink-0 h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-slate-700 text-xs font-medium text-gray-700 dark:text-slate-300 hover:text-brand-blue hover:border-brand-blue/30"
                >
                  {copiedId === r.candidateId ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                  Link
                </button>
              )}
              <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${chip.className}`}>
                {chip.label}
              </span>
            </li>
          );
        })}
        {sending && results.length < total && (
          <li className="flex items-center gap-2 px-3 py-2.5 text-xs text-gray-500 dark:text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> {total - results.length} remaining…
          </li>
        )}
      </ul>
    </div>
  );
}
