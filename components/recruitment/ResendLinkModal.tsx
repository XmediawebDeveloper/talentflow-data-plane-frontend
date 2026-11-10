'use client';

import type { ReactNode } from 'react';
import { Clock, Info, Link2, Loader2, Mail, Send, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { VersionPill } from '@/components/assessments/AllAssessmentsTable';
import type { RevokeTarget } from '@/components/recruitment/RevokeLinkModal';

export interface ResendLinkModalProps {
  isOpen: boolean;
  /** "interview" | "assessment" — drives the title and copy. */
  kind: 'interview' | 'assessment';
  /** The candidate the new link goes to. */
  email?: string;
  /** Several candidates at once (the ticked ones): `count` will be resent.
   *  A count of 1 reads as that candidate's own resend (needs their email,
   *  from `email` or `targets`). */
  bulk?: { count: number };
  /** The links being resent, one entry per candidate: shown as Job ID · job
   *  name · version, one row per distinct job + version. */
  targets?: RevokeTarget[];
  /** When the new link expires — the original validity, from now. */
  expiry?: { durationLabel: string; dateLabel: string } | null;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The resend confirm shared by Recruitment → Assessments and Recruitment →
 * AI Interview — RevokeLinkModal's layout in brand blue: paper-plane disc +
 * title, the candidate's email (or, in bulk, how many), the "What will
 * happen?" list and a bordered Cancel / Resend footer.
 */
export default function ResendLinkModal({
  isOpen,
  kind,
  email,
  bulk: bulkProp,
  targets: targetsProp,
  expiry,
  onConfirm,
  onCancel,
  isLoading = false,
}: ResendLinkModalProps) {
  if (!isOpen) return null;

  /* A bulk resend of ONE candidate reads as that candidate's own resend. */
  const oneEmail = targetsProp?.find((t) => t.email)?.email ?? undefined;
  const oneSelected = bulkProp?.count === 1;
  const singleEmail = email ?? (oneSelected ? oneEmail : undefined);
  const bulk = oneSelected ? undefined : bulkProp;
  const targets = oneSelected ? undefined : targetsProp;

  const targetRows: (RevokeTarget & { links: number })[] = [];
  for (const t of targets ?? []) {
    if (!t.jobCode && !t.jobTitle && t.version == null) continue;
    const row = targetRows.find((r) => r.jobCode === t.jobCode && r.jobTitle === t.jobTitle && r.version === t.version);
    if (row) row.links += 1; else targetRows.push({ ...t, links: 1 });
  }
  const shownTargets = targetRows.slice(0, 4);
  const hiddenTargets = targetRows.length - shownTargets.length;

  const noun = kind === 'interview' ? 'Interview' : 'Assessment';
  const n = bulk?.count ?? 1;
  let title: string;
  let lead: ReactNode;
  let pill: string | null;
  let effects: { icon: typeof Link2; text: ReactNode }[];
  let confirmLabel: string;

  if (!bulk) {
    title = `Resend ${noun} Invitation?`;
    lead = <>A new {kind} link will be generated and sent to</>;
    pill = singleEmail ?? null;
    effects = [
      { icon: Link2, text: 'A new invitation link will be generated and sent to the candidate.' },
      { icon: Mail, text: 'The previous link will remain inactive.' },
      { icon: Clock, text: 'The resend activity will be recorded in the invite history.' },
    ];
    confirmLabel = 'Resend Invitation';
  } else {
    title = `Resend ${noun} Invitations?`;
    lead = <>New {kind} links will be generated and sent to the selected candidates.</>;
    pill = `${plural(n, 'candidate')} selected`;
    effects = [
      { icon: Link2, text: <>A new invitation link will be generated and sent to each of the {plural(n, 'selected candidate')}.</> },
      { icon: Mail, text: 'Their previous links will remain inactive.' },
      { icon: Clock, text: 'Each resend will be recorded in the invite history.' },
    ];
    confirmLabel = `Resend ${plural(n, 'Invitation')}`;
  }
  if (expiry && !bulk) {
    effects.push({
      icon: Timer,
      text: <>The new link will be valid for <strong>{expiry.durationLabel}</strong> — until <strong>{expiry.dateLabel}</strong> (same duration as the original invitation).</>,
    });
  }
  const nothingToSend = !!bulk && n === 0;

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-[10000] flex items-center justify-center p-4 sm:p-6">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="resend-link-title"
        className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-xl animate-scale-in max-h-[calc(100dvh-2rem)] flex flex-col tf-round-edges"
      >
        <div className="flex-1 min-h-0 px-5 sm:px-8 pt-7 sm:pt-8 pb-5 overflow-y-auto text-center">
          <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto rounded-full bg-brand-blue/10 flex items-center justify-center">
            <Send className="w-7 h-7 sm:w-8 sm:h-8 text-brand-blue" />
          </div>
          <h2 id="resend-link-title" className="mt-3 text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-50 leading-snug">
            {title}
          </h2>
          <div className="mt-2 tf-body-secondary sm:text-base leading-relaxed">
            <p>{lead}</p>
            {pill && (
              <span className={`inline-block max-w-full bg-brand-blue/10 text-brand-blue ${bulk ? 'mt-2 px-3 py-0.5 rounded-full font-semibold' : 'mt-2 px-3 py-1 rounded-lg font-semibold break-all'}`}>
                {pill}
              </span>
            )}
          </div>

          {/* Which job and version these links belong to */}
          {shownTargets.length > 0 && (
            <ul className="mt-4 text-left rounded-xl border border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-700/60">
              {shownTargets.map((t, i) => (
                <li key={i} className="flex items-center gap-2 px-3 py-2 min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5 min-w-0">
                    {t.jobCode && <JobIdBadge className="flex-shrink-0">{t.jobCode}</JobIdBadge>}
                    {t.jobTitle && <span className="min-w-0 text-sm font-medium text-gray-900 dark:text-slate-100 [overflow-wrap:anywhere]">{t.jobTitle}</span>}
                    {t.version != null && <VersionPill kind="assessment" version={t.version} label={noun} />}
                  </span>
                  {targetRows.length > 1 && (
                    <span className="ml-auto pl-2 tf-micro-hint whitespace-nowrap tabular-nums">{plural(t.links, 'candidate')}</span>
                  )}
                </li>
              ))}
              {hiddenTargets > 0 && (
                <li className="px-3 py-1.5 tf-micro-hint">+ {plural(hiddenTargets, 'more job / version', 'more jobs / versions')}</li>
              )}
            </ul>
          )}

          {/* What will happen */}
          <div className="mt-5 text-left rounded-xl border border-brand-blue/20 bg-brand-blue/5 px-3 sm:px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <Info className="w-5 h-5 shrink-0 text-brand-blue" />
              <p className="text-base font-bold text-brand-blue">What will happen?</p>
            </div>
            <ul className="mt-3 space-y-2.5">
              {effects.map(({ icon: Icon, text }, i) => (
                <li key={i} className="flex items-start gap-3 tf-body">
                  <span className="w-9 h-9 shrink-0 rounded-full bg-brand-blue/10 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-brand-blue" />
                  </span>
                  <span className="min-w-0 pt-2 sm:pt-1.5">{text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="px-5 sm:px-8 py-4 border-t border-gray-100 dark:border-slate-700/60 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 shrink-0">
          <Button variant="secondary" onClick={onCancel} disabled={isLoading} className="w-full sm:w-auto sm:min-w-[128px] px-6">
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={isLoading || nothingToSend} className="w-full sm:w-auto sm:min-w-[180px] px-6">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {isLoading ? 'Sending…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
