'use client';

/**
 * Plain-language pieces for Unit Disputes: what a disputed unit was spent on,
 * what happened to that session, and where the error came from.
 *
 * The record is built server-side (backend services/dispute_records.py) from the
 * session and the activity (audit) log, so it is shown read-only — the tenant
 * can explain in the description, but can't change the recorded facts.
 */
import { ClipboardCheck, FileSearch, HelpCircle, Lock, ShieldAlert, ShieldCheck, Video, type LucideIcon } from 'lucide-react';
import { formatIST } from '@/lib/utils/dateUtils';

export type ErrorOrigin = 'SYSTEM' | 'TENANT' | 'NONE' | 'UNKNOWN';
export type RefundOutlook = 'likely' | 'unlikely' | 'review';

export interface DisputeRecord {
  id: string;
  unit_type: string;
  unit_label: string;
  units_consumed: number;
  consumed_at: string | null;
  consumed_by: string | null;
  candidate_name: string | null;
  candidate_email: string | null;
  title: string | null;
  reference: string | null;
  started_at: string | null;
  ended_at: string | null;
  outcome: string;
  outcome_detail: string | null;
  error_origin: ErrorOrigin;
  error_origin_label: string;
  error_code: string | null;
  refund_outlook: RefundOutlook;
  refund_hint: string;
  suggested_reason: string | null;
  disputable: boolean;
  not_disputable_reason: string | null;
}

export const UNIT_LABELS: Record<string, string> = {
  AIU: 'AI Interview',
  AS: 'Assessment',
  RS: 'Resume Scoring',
  RU: 'Resume Storage',
  max_seats: 'User Seat',
};

export const unitLabel = (unitType: string) => UNIT_LABELS[unitType] || unitType;

const UNIT_ICONS: Record<string, LucideIcon> = { AIU: Video, AS: ClipboardCheck, RS: FileSearch };

const UNIT_TONES: Record<string, string> = {
  AIU: 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20',
  AS: 'bg-brand-teal/10 text-brand-teal ring-brand-teal/20',
  RS: 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20',
};

/** Reasons the review team accepts — the API values stay the same, only the words change. */
export const REASON_OPTIONS = [
  { value: 'SYSTEM_ERROR', label: 'Platform error', hint: 'TalentFlow crashed, froze or failed to load' },
  { value: 'TECHNICAL_FAILURE', label: 'Technical problem', hint: "Audio, video, recording or scoring didn't work" },
  { value: 'INTERRUPTED', label: 'Session was interrupted', hint: 'It stopped before it could finish' },
  { value: 'BILLING_ERROR', label: 'Charged by mistake', hint: "Charged twice, or for something that didn't happen" },
];

export const reasonLabel = (reason: string) => REASON_OPTIONS.find(r => r.value === reason)?.label || reason;

export function UnitTypeIcon({ unitType, className = 'h-9 w-9' }: { unitType: string; className?: string }) {
  const Icon = UNIT_ICONS[unitType] || HelpCircle;
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-xl ring-1 ${UNIT_TONES[unitType] || 'bg-gray-100 text-gray-600 ring-gray-200'} ${className}`}>
      <Icon className="h-4 w-4" />
    </span>
  );
}

export function UnitTypeBadge({ unitType }: { unitType: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-2xs font-semibold ring-1 ${UNIT_TONES[unitType] || 'bg-gray-100 text-gray-700 ring-gray-200'}`}>
      {unitLabel(unitType)}
    </span>
  );
}

const ORIGIN_STYLE: Record<ErrorOrigin, { cls: string; label: string; Icon: LucideIcon }> = {
  SYSTEM: { cls: 'bg-destructive-subtle text-destructive ring-destructive-line', label: 'Platform error', Icon: ShieldAlert },
  TENANT: { cls: 'bg-warning-subtle text-warning-strong ring-warning-line', label: 'Candidate side', Icon: ShieldAlert },
  NONE: { cls: 'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700', label: 'No error', Icon: ShieldCheck },
  UNKNOWN: { cls: 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20', label: 'Not recorded', Icon: HelpCircle },
};

/** Where the problem came from, per the activity log. Platform errors are the ones usually refunded. */
export function ErrorOriginBadge({ origin }: { origin: ErrorOrigin | null | undefined }) {
  const s = ORIGIN_STYLE[(origin || 'UNKNOWN') as ErrorOrigin] || ORIGIN_STYLE.UNKNOWN;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-semibold ring-1 ${s.cls}`}>
      <s.Icon className="h-3 w-3" />
      {s.label}
    </span>
  );
}

const OUTLOOK: Record<RefundOutlook, { title: string; cls: string }> = {
  likely: { title: 'Likely to be approved', cls: 'border-success-line bg-success-subtle/60 text-success-strong' },
  unlikely: { title: 'Usually not refunded', cls: 'border-warning-line bg-warning-subtle/60 text-warning-strong' },
  review: { title: 'Needs a manual check', cls: 'border-brand-blue/20 bg-brand-blue/[0.05] text-brand-blue' },
};

export function RefundOutlookNotice({ record }: { record: DisputeRecord }) {
  const o = OUTLOOK[record.refund_outlook] || OUTLOOK.review;
  return (
    <div className={`rounded-xl border px-4 py-3 ${o.cls}`} role="note">
      <p className="text-sm font-semibold">{o.title}</p>
      <p className="mt-0.5 text-sm opacity-90">{record.refund_hint}</p>
    </div>
  );
}

const when = (v: string | null | undefined) => (v ? formatIST(v) : '—');

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <dt className="shrink-0 tf-body-secondary">{label}</dt>
      <dd className="min-w-0 text-right tf-row-name break-words">{children}</dd>
    </div>
  );
}

/** Read-only "What happened" panel. */
export function DisputeRecordSummary({ record, title = 'What happened' }: { record: DisputeRecord; title?: string }) {
  const units = record.units_consumed;
  return (
    <section className="overflow-hidden rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
      <header className="flex items-center justify-between gap-3 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 py-2.5">
        <p className="text-2xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500">{title}</p>
        <span className="inline-flex items-center gap-1 tf-micro-hint" title="Taken from the activity log. It can't be changed here — add anything else in your description.">
          <Lock className="h-3 w-3" /> From the activity log
        </span>
      </header>
      <div className="px-4 py-3">
        <div className="mb-2 flex items-center gap-3">
          <UnitTypeIcon unitType={record.unit_type} />
          <div className="min-w-0">
            <p className="tf-row-title">{record.unit_label} · {units} unit{units === 1 ? '' : 's'}</p>
            <p className="tf-meta">Used {when(record.consumed_at)}{record.consumed_by ? ` · by ${record.consumed_by}` : ''}</p>
          </div>
        </div>
        <dl className="divide-y divide-gray-100 dark:divide-slate-700/60">
          {(record.candidate_name || record.candidate_email) && (
            <Row label="Candidate">
              {record.candidate_name || '—'}
              {record.candidate_email && <span className="block tf-meta">{record.candidate_email}</span>}
            </Row>
          )}
          {record.title && <Row label={record.unit_type === 'AS' ? 'Assessment' : 'Job'}>{record.title}</Row>}
          {(record.started_at || record.ended_at) && (
            <Row label="Session">{when(record.started_at)} → {when(record.ended_at)}</Row>
          )}
          <Row label="What happened">
            {record.outcome}
            {record.outcome_detail && <span className="block tf-meta">{record.outcome_detail}</span>}
          </Row>
          <Row label="Error came from"><ErrorOriginBadge origin={record.error_origin} /></Row>
        </dl>
      </div>
    </section>
  );
}
