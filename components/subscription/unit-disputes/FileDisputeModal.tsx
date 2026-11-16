'use client';

/**
 * File a Unit Dispute — two steps, no IDs or unit codes:
 *   1. Choose what to dispute: the units you used, in plain words (candidate,
 *      job / assessment, what happened, where the error came from).
 *   2. Tell us what went wrong: the recorded facts read-only, a heads-up on how
 *      the review team usually decides that kind of case, then reason + details.
 *
 * Records come from GET /disputes/records (backend services/dispute_records.py).
 */
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Shield } from 'lucide-react';
import { toast } from 'sonner';
import AppModal from '@/components/ui/app-modal';
import { Skeleton } from '@/components/ui/skeleton';
import { handleUnauthorized } from '@/lib/services/api';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import { formatIST } from '@/lib/utils/dateUtils';
import {
  DisputeRecordSummary,
  ErrorOriginBadge,
  REASON_OPTIONS,
  RefundOutlookNotice,
  UnitTypeIcon,
  type DisputeRecord,
} from './disputeRecord';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';
const PAGE_SIZE = 8;

const TYPE_FILTERS = [
  { value: '', label: 'All' },
  { value: 'AIU', label: 'AI Interviews' },
  { value: 'AS', label: 'Assessments' },
  { value: 'RS', label: 'Resume Scoring' },
];

const DESCRIPTION_EXAMPLES: Record<string, string> = {
  AIU: "For example: the candidate's video froze at question 3 and the interview couldn't continue.",
  AS: 'For example: the assessment page stopped loading halfway and the candidate lost their answers.',
  RS: 'For example: the same resume was scored twice for this job.',
};

/** Open / approved disputes per record — the API refuses another one for those. */
export type DisputeStateByRecord = Map<string, 'PENDING_REVIEW' | 'APPROVED'>;

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
  disputeStateByRecord: DisputeStateByRecord;
}

const authHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  return token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : null;
};

export default function FileDisputeModal({ open, onClose, onSubmitted, disputeStateByRecord }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [records, setRecords] = useState<DisputeRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selected, setSelected] = useState<DisputeRecord | null>(null);
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [units, setUnits] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = useCallback(async (nextPage: number, unitType: string) => {
    const headers = authHeaders();
    if (!headers) return;
    setLoading(true);
    setLoadError(null);
    try {
      const qs = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(nextPage * PAGE_SIZE) });
      if (unitType) qs.set('unit_type', unitType);
      const res = await fetch(`${API_URL}/disputes/records?${qs}`, { headers });
      if (res.status === 401) { handleUnauthorized(); return; }
      if (res.status === 403) { setLoadError("You don't have permission to file disputes."); return; }
      if (!res.ok) throw new Error('load failed');
      const body = await res.json();
      setRecords(body.data?.items || []);
      setTotal(body.data?.total || 0);
      setPage(nextPage);
    } catch {
      setLoadError("We couldn't load your usage. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setSelected(null);
    load(0, typeFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const reset = () => {
    setStep(1);
    setSelected(null);
    setReason('');
    setDescription('');
    setUnits('');
    setAcknowledged(false);
    setRecords([]);
    setTypeFilter('');
  };

  const close = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const choose = (r: DisputeRecord) => {
    setSelected(r);
    setReason(r.suggested_reason || '');
    setUnits(String(r.units_consumed));
    setAcknowledged(false);
    setStep(2);
  };

  const needsAck = selected?.refund_outlook === 'unlikely';
  const multiUnit = (selected?.units_consumed || 0) > 1;
  const unitsNum = parseFloat(units);
  const unitsValid = !multiUnit || (!isNaN(unitsNum) && unitsNum > 0 && unitsNum <= (selected?.units_consumed || 0));
  const canSubmit = !!selected && !!reason && description.trim().length >= 10 && unitsValid && (!needsAck || acknowledged);

  const submit = async () => {
    if (!selected || !canSubmit) return;
    const headers = authHeaders();
    if (!headers) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/disputes/request-refund`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          consumption_log_id: selected.id,
          unit_type: selected.unit_type,
          units_to_refund: multiUnit ? unitsNum : selected.units_consumed,
          reason,
          description: description.trim(),
        }),
      });
      if (res.status === 401) { handleUnauthorized(); return; }
      if (res.status === 403) { toast.error("You don't have permission to file disputes."); return; }
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        const raw = err?.detail;
        const detail: string = Array.isArray(raw)
          ? raw.map((d: { msg?: string }) => d?.msg).filter(Boolean).join('; ')
          : typeof raw === 'string' ? raw : '';
        if (/already exists|duplicate/i.test(detail)) {
          toast.error('A dispute is already open for this. You can follow it in the list.');
          reset();
          onSubmitted();
          return;
        }
        throw new Error(detail || 'submit failed');
      }
      toast.success("Dispute sent. We'll review it within 2–3 business days.");
      reset();
      onSubmitted();
    } catch (e) {
      toast.error(friendlyErrorMessage(e, "Couldn't send the dispute. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const stepOne = (
    <>
      <p className="mb-3 tf-body-secondary">Pick the interview, assessment or scoring you were charged for and want reviewed.</p>

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Show">
        {TYPE_FILTERS.map(f => (
          <button
            key={f.value || 'all'}
            type="button"
            role="tab"
            aria-selected={typeFilter === f.value}
            onClick={() => { setTypeFilter(f.value); load(0, f.value); }}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors ${
              typeFilter === f.value
                ? 'bg-brand-blue text-white ring-brand-blue'
                : 'bg-white text-gray-600 ring-gray-200 hover:text-brand-blue hover:ring-brand-blue/30 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="tf-panel flex gap-3 p-3">
              <Skeleton className="h-9 w-9 rounded-xl" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && loadError && (
        <div className="rounded-xl border border-destructive-line bg-destructive-subtle/70 px-4 py-3 text-sm text-destructive">{loadError}</div>
      )}

      {!loading && !loadError && records.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-10 text-center">
          <Shield className="mx-auto mb-2 h-8 w-8 text-gray-300" />
          <p className="tf-body-muted">Nothing to dispute here yet. Units show up after they're used.</p>
        </div>
      )}

      {!loading && !loadError && records.length > 0 && (
        <ul className="space-y-2">
          {records.map(r => {
            const state = disputeStateByRecord.get(r.id);
            const blockedText = !r.disputable ? "Can't be disputed" : state === 'APPROVED' ? 'Already refunded' : state ? 'Dispute open' : null;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => !blockedText && choose(r)}
                  aria-disabled={!!blockedText}
                  title={!r.disputable ? r.not_disputable_reason || undefined : blockedText || undefined}
                  className={`group flex w-full gap-3 rounded-xl border p-3 text-left transition-all ${
                    blockedText
                      ? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-60 dark:border-slate-700 dark:bg-slate-800/50'
                      : 'border-gray-200 bg-white hover:-translate-y-0.5 hover:border-brand-blue/30 hover:bg-brand-blue/[0.03] dark:border-slate-700 dark:bg-slate-900'
                  }`}
                >
                  <UnitTypeIcon unitType={r.unit_type} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                      <span className="tf-row-title">
                        {r.unit_label}{r.candidate_name ? ` · ${r.candidate_name}` : ''}
                      </span>
                      <span className="tf-meta whitespace-nowrap">{r.consumed_at ? formatIST(r.consumed_at) : ''}</span>
                    </span>
                    {r.title && <span className="block truncate tf-meta">{r.title}</span>}
                    <span className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="tf-body-secondary">{r.outcome}</span>
                      <ErrorOriginBadge origin={r.error_origin} />
                      {r.units_consumed !== 1 && <span className="tf-meta">· {r.units_consumed} units</span>}
                    </span>
                  </span>
                  {blockedText ? (
                    <span className="self-center whitespace-nowrap tf-meta">{blockedText}</span>
                  ) : (
                    <ChevronRight className="h-4 w-4 self-center text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-blue" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!loading && total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between border-t border-gray-100 dark:border-slate-700/60 pt-3">
          <p className="tf-meta">Page {page + 1} of {totalPages}</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => load(page - 1, typeFilter)} disabled={page === 0}
              aria-label="Previous page"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-slate-700 text-gray-600 disabled:cursor-not-allowed disabled:opacity-50">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => load(page + 1, typeFilter)} disabled={page + 1 >= totalPages}
              aria-label="Next page"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-slate-700 text-gray-600 disabled:cursor-not-allowed disabled:opacity-50">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );

  const stepTwo = selected && (
    <div className="space-y-5">
      <DisputeRecordSummary record={selected} />
      <RefundOutlookNotice record={selected} />

      <fieldset>
        <legend className="mb-2 tf-label">Why should these units be returned? <span className="text-brand-orange">*</span></legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {REASON_OPTIONS.map(o => (
            <label
              key={o.value}
              className={`flex cursor-pointer gap-2.5 rounded-xl border p-3 transition-colors ${
                reason === o.value
                  ? 'border-brand-blue/40 bg-brand-blue/[0.05] ring-1 ring-brand-blue/20'
                  : 'border-gray-200 hover:border-brand-blue/25 dark:border-slate-700'
              }`}
            >
              <input type="radio" name="dispute-reason" value={o.value} checked={reason === o.value}
                onChange={() => setReason(o.value)} className="mt-0.5 accent-brand-blue" />
              <span>
                <span className="block tf-row-title">{o.label}</span>
                <span className="block tf-meta">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="mb-2 block tf-label">What went wrong? <span className="text-brand-orange">*</span></span>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder={DESCRIPTION_EXAMPLES[selected.unit_type] || 'Tell us what happened.'}
          rows={4}
          maxLength={1000}
          className="tf-textarea resize-none rounded-xl py-2.5"
        />
        <span className="mt-1 flex justify-between tf-hint">
          <span>{description.trim().length < 10 ? 'At least 10 characters' : 'Thanks — the more detail, the faster the review'}</span>
          <span>{description.length}/1000</span>
        </span>
      </label>

      {multiUnit ? (
        <label className="block">
          <span className="mb-2 block tf-label">How many units should be returned? <span className="text-brand-orange">*</span></span>
          <input type="number" value={units} onChange={e => setUnits(e.target.value)}
            min={0.01} max={selected.units_consumed} step={0.01} className="tf-input rounded-xl" />
          <span className="mt-1 block tf-hint">Up to {selected.units_consumed} (what was used)</span>
        </label>
      ) : (
        <p className="tf-body-secondary">If approved, <strong>1 {selected.unit_label} unit</strong> goes back to your balance.</p>
      )}

      {needsAck && (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-warning-line bg-warning-subtle/40 p-3">
          <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)}
            className="mt-0.5 accent-brand-blue" />
          <span className="text-sm text-gray-700 dark:text-slate-300">
            I understand this will probably not be refunded, and I still want it reviewed.
          </span>
        </label>
      )}
    </div>
  );

  return (
    <AppModal
      open={open}
      onCancel={close}
      size="md"
      mobileSheet
      icon={<Shield className="h-5 w-5" />}
      title="File a Unit Dispute"
      subtitle={step === 1 ? 'Step 1 of 2 · Choose what to dispute' : 'Step 2 of 2 · Tell us what went wrong'}
      cancelDisabled={submitting}
      actions={step === 2 ? [
        { label: 'Back', variant: 'secondary', onClick: () => setStep(1), icon: <ArrowLeft className="h-4 w-4" />, disabled: submitting },
        {
          label: 'Send dispute',
          onClick: submit,
          disabled: !canSubmit,
          loading: submitting,
          title: !canSubmit
            ? (needsAck && !acknowledged ? 'Tick the box above to send it anyway' : 'Choose a reason and describe what went wrong')
            : undefined,
        },
      ] : undefined}
    >
      {step === 1 ? stepOne : stepTwo}
    </AppModal>
  );
}
