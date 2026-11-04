'use client';

// TEMP preview page — the bulk invite results popup in every state, on fake
// data (no API calls). Delete after the visual check.
import { useEffect, useLayoutEffect, useState } from 'react';
import BulkInviteResultsDialog from '@/components/bulk-invite/BulkInviteResultsDialog';
import BulkInviteProgressPanel from '@/components/bulk-invite/BulkInviteProgressPanel';
import { Button } from '@/components/ui/button';
import { useBulkInviteProgress, type TrackedBulkInvite } from '@/contexts/BulkInviteProgressContext';
import {
  bulkInviteService,
  type BulkInviteItemStatus,
  type BulkInviteJob,
  type BulkInviteResultRow,
} from '@/lib/services/bulkInviteService';

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const base = (over: Partial<BulkInviteJob> & Pick<BulkInviteJob, 'job_id'>): BulkInviteJob => ({
  jd_id: 'preview-jd',
  kind: 'assessment',
  version_id: 'preview-version',
  version_label: 'Senior AI Engineer - Assessment - Version 1',
  delivery: 'email',
  status: 'done',
  total: 0, sent: 0, skipped: 0, failed: 0, processed: 0, remaining: 0,
  error_message: null,
  created_at: ago(3), started_at: ago(3), completed_at: ago(1),
  ...over,
});

interface Fixture { label: string; note: string; job: BulkInviteJob; jdCode: string; jdTitle: string }
const FIXTURES: Fixture[] = [
  {
    label: 'Completed — 1 sent', note: 'Your screenshot',
    jdCode: 'JD-343', jdTitle: 'Senior AI Engineer',
    job: base({ job_id: 'preview-done-one', total: 1, sent: 1, processed: 1 }),
  },
  {
    label: 'Completed — sent, skipped, failed', note: 'Mixed outcome, many rows',
    jdCode: 'JD-328', jdTitle: 'AI Developer',
    job: base({ job_id: 'preview-done-mixed', total: 24, sent: 18, skipped: 4, failed: 2, processed: 24, version_label: 'AI Developer - Assessment - Version 2' }),
  },
  {
    label: 'Running — AI Interview', note: 'Progress moves every few seconds',
    jdCode: 'JD-328', jdTitle: 'AI Developer',
    job: base({ job_id: 'preview-running', kind: 'interview', status: 'running', total: 40, sent: 14, skipped: 2, processed: 16, remaining: 24, completed_at: null, version_label: 'AI Interview V1' }),
  },
  {
    label: 'Copy-link send', note: 'delivery = link (Copy all links)',
    jdCode: 'JD-339', jdTitle: 'Food Tester',
    job: base({ job_id: 'preview-links', delivery: 'link', total: 5, sent: 5, processed: 5, version_label: 'Food Tester - Assessment - Version 1' }),
  },
  {
    label: 'Cancelled', note: 'Stopped part way',
    jdCode: 'JD-245', jdTitle: 'Junior Software Test Engineer',
    job: base({ job_id: 'preview-cancelled', status: 'cancelled', total: 30, sent: 9, processed: 9, remaining: 21 }),
  },
  {
    label: 'Failed', note: 'Job-level error',
    jdCode: 'JD-245', jdTitle: 'Junior Software Test Engineer',
    job: base({ job_id: 'preview-failed', status: 'failed', total: 12, sent: 3, failed: 9, processed: 12, error_message: 'Email provider rejected the batch (SMTP 550).' }),
  },
  {
    label: 'Queued too long', note: 'No worker picked it up (> 2 min)',
    jdCode: 'JD-343', jdTitle: 'Senior AI Engineer',
    job: base({ job_id: 'preview-queued', status: 'queued', total: 8, remaining: 8, created_at: ago(6), started_at: null, completed_at: null }),
  },
];
const byId = new Map(FIXTURES.map((f) => [f.job.job_id, f]));

const NAMES = ['Kamarajan K', 'Priya Sharma', 'Arun Kumar', 'Divya R', 'Mohammed Faiz', 'Lakshmi Narayanan', 'Sneha Iyer', 'Rahul Verma', 'Anitha S', 'Karthik Raja'];
const REASON: Record<BulkInviteItemStatus, string> = {
  sent: 'Invitation sent successfully.',
  skipped: 'Already invited to this version.',
  failed: 'Mailbox does not exist.',
  queued: 'Waiting to be sent.',
  processing: 'Sending…',
};

/* The running fixture advances with the clock, looping. */
const startedAt = Date.now();
const live = (job: BulkInviteJob): BulkInviteJob => {
  if (job.status !== 'running') return job;
  const processed = 16 + (Math.floor((Date.now() - startedAt) / 2500) % (job.total - 16));
  const skipped = 2;
  return { ...job, processed, sent: processed - skipped, skipped, remaining: job.total - processed };
};

const rowsOf = (job: BulkInviteJob): BulkInviteResultRow[] => {
  const statuses: BulkInviteItemStatus[] = [
    ...Array<BulkInviteItemStatus>(job.sent).fill('sent'),
    ...Array<BulkInviteItemStatus>(job.skipped).fill('skipped'),
    ...Array<BulkInviteItemStatus>(job.failed).fill('failed'),
    ...Array.from({ length: job.remaining }, (_, i): BulkInviteItemStatus => (i === 0 && job.status === 'running' ? 'processing' : 'queued')),
  ];
  return statuses.map((status, i) => {
    const name = i === 0 && job.job_id === 'preview-done-one' ? 'Kamarajan K' : `${NAMES[i % NAMES.length]}${i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ''}`;
    const email = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@email.com`;
    return {
      id: `${job.job_id}-${i}`,
      resume_id: `resume-${i}`,
      name, email, phone: null,
      source: 'score-resume', invite_source: 'Resume Scoring',
      status,
      reason: REASON[status],
      link: status === 'sent' && job.delivery === 'link' ? `https://example.com/invite/${job.job_id}/${i}` : null,
      invitation_id: status === 'sent' ? `inv-${i}` : null,
      processed_at: status === 'queued' ? null : ago(1),
    };
  });
};

/* The service, answered from the fixtures for preview ids only. */
const original = { get: bulkInviteService.get, results: bulkInviteService.results, cancel: bulkInviteService.cancel };
const patch = () => {
  bulkInviteService.get = async (id, signal) => {
    const f = byId.get(id);
    return f ? live(f.job) : original.get(id, signal);
  };
  bulkInviteService.results = async (id, params, signal) => {
    const f = byId.get(id);
    if (!f) return original.results(id, params, signal);
    const job = live(f.job);
    const q = (params?.search || '').toLowerCase();
    const all = rowsOf(job).filter((r) =>
      (!params?.status || (params.status === 'remaining' ? r.status === 'queued' || r.status === 'processing' : r.status === params.status))
      && (!q || `${r.name} ${r.email}`.toLowerCase().includes(q)));
    const size = params?.page_size ?? 50;
    const page = params?.page ?? 1;
    return { job, items: all.slice((page - 1) * size, page * size), total: all.length, page, page_size: size };
  };
  bulkInviteService.cancel = async (id) => {
    const f = byId.get(id);
    return f ? { ...live(f.job), status: 'cancelled' } : original.cancel(id);
  };
};
const restore = () => Object.assign(bulkInviteService, original);
patch();

export default function Page() {
  const tracker = useBulkInviteProgress();
  const [open, setOpen] = useState<Fixture | null>(null);
  const [inline, setInline] = useState<Fixture>(FIXTURES[1]);

  /* Layout effect: re-patched before any panel's fetch effect runs. Leaving
     the page puts the real service back and drops the preview runs from the
     floating card (finished first, so nothing keeps polling them). */
  useLayoutEffect(() => {
    patch();
    return () => {
      FIXTURES.forEach((f) => {
        tracker.sync({ ...f.job, status: 'cancelled' });
        tracker.dismiss(f.job.job_id);
      });
      restore();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* The compact panel stands in for the invite popup: its run is "in the
     popup", so the floating card leaves it out, as it does for the real one. */
  const inlineId = inline.job.job_id;
  const setInPopup = tracker.setInPopup;
  useEffect(() => {
    setInPopup(inlineId, true);
    return () => setInPopup(inlineId, false);
  }, [inlineId, setInPopup]);

  const asTracked = (f: Fixture): TrackedBulkInvite => ({ ...live(f.job), jdCode: f.jdCode, jdTitle: f.jdTitle, trackedAt: new Date().toISOString() });

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="tf-section-title sm:text-lg">Bulk invite results — preview</h1>
        <p className="tf-meta">Temporary page with fake data. Each button opens the popup from your screenshot in that state.</p>
      </div>

      <section className="tf-panel p-4 space-y-3">
        <h2 className="tf-row-title">1. Results popup (BulkInviteResultsDialog)</h2>
        <p className="tf-meta">Opened from the floating progress card&apos;s &quot;View results&quot;, on any page.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {FIXTURES.map((f) => (
            <button
              key={f.job.job_id}
              type="button"
              onClick={() => setOpen(f)}
              className="text-left rounded-lg border border-gray-200 dark:border-slate-700 px-3 py-2.5 hover:border-brand-blue/40 hover:bg-brand-blue/5"
            >
              <span className="block text-sm font-medium text-gray-900 dark:text-slate-50">{f.label}</span>
              <span className="block tf-meta">{f.note}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="tf-panel p-4 space-y-3">
        <h2 className="tf-row-title">2. Floating progress card (bottom right)</h2>
        <p className="tf-meta">What Minimize in the invite popup hands the send to.</p>
        <Button variant="primary" size="sm" onClick={() => FIXTURES.slice(1, 4).forEach((f) => tracker.track(live(f.job), { jdCode: f.jdCode, jdTitle: f.jdTitle }))}>
          Show floating card
        </Button>
      </section>

      <section className="tf-panel p-4 space-y-3">
        <h2 className="tf-row-title">3. Inside the invite popup after Send (compact panel)</h2>
        <div className="flex flex-wrap gap-2">
          {FIXTURES.map((f) => (
            <Button key={f.job.job_id} variant={inline === f ? 'primary' : 'secondary'} size="sm" onClick={() => setInline(f)}>{f.label}</Button>
          ))}
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-4 sm:p-6 bg-slate-50/70 dark:bg-slate-950/30">
          <BulkInviteProgressPanel key={inline.job.job_id} jobId={inline.job.job_id} initialJob={live(inline.job)} compact />
        </div>
      </section>

      {open && <BulkInviteResultsDialog job={asTracked(open)} onClose={() => setOpen(null)} />}
    </div>
  );
}
