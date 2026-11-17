'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, CircleCheck, Info, Loader2, SquarePen, Unlink, UserRound, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { VersionPill } from '@/components/assessments/AllAssessmentsTable';

/** One link being revoked: its job (ID + name) and the assessment /
 *  interview version it was sent for. */
export interface RevokeTarget {
  jobCode?: string | null;
  jobTitle?: string | null;
  version?: number | null;
  /** The candidate's email — lets a bulk revoke of ONE candidate read as
   *  that candidate's own revoke (the row's three-dot Revoke popup). */
  email?: string | null;
}

export interface RevokeLinkModalProps {
  isOpen: boolean;
  /** "interview" | "assessment" — drives the title and copy. */
  kind: 'interview' | 'assessment';
  /** The candidate the link was sent to. */
  email?: string;
  /** Many links at once instead of one candidate's:
   *  - `selected`: the ticked candidates (`count` of them can be revoked;
   *    `skippedCount` more were ticked but have started / finished / expired).
   *  - `pending`: every not-yet-opened link of one assessment / interview
   *    (`targetName`, not shown — the `targets` rows name it); `count` is
   *    null while it is being counted. */
  bulk?: {
    scope: 'selected' | 'pending';
    count: number | null;
    targetName?: string;
    skippedCount?: number;
  };
  /** The links being revoked, one entry per link (or one for the whole
   *  assessment / interview): shown as Job ID · job name · version, one row
   *  per distinct job + version, with how many links each when they differ. */
  targets?: RevokeTarget[];
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The revoke-link confirm shared by Recruitment → Assessments and Recruitment
 * → AI Interview: warning disc + title, the candidate's email (or, in bulk,
 * how many), the "What will happen?" list and a bordered Cancel / Revoke
 * footer. One candidate's link, the ticked candidates' links, and every
 * pending link of one assessment / interview all read the same way.
 */
export default function RevokeLinkModal({
  isOpen,
  kind,
  email,
  bulk: bulkProp,
  targets: targetsProp,
  onConfirm,
  onCancel,
  isLoading = false,
}: RevokeLinkModalProps) {
  if (!isOpen) return null;

  /* Select-all / bulk that comes down to ONE candidate: the same popup the
     row's three-dot Revoke opens — that candidate's email, the single-link
     wording and "Revoke Link" — rather than "1 candidate selected". */
  /* Same for "revoke pending" when just one link is pending — once that
     candidate's email is known (without it, the pending popup stays). */
  const oneEmail = targetsProp?.find((t) => t.email)?.email ?? undefined;
  const oneSelected = bulkProp?.count === 1 && (bulkProp.scope === 'selected' || !!oneEmail);
  const singleEmail = email ?? (oneSelected ? oneEmail : undefined);
  const skippedOfOne = oneSelected ? bulkProp?.skippedCount ?? 0 : 0;
  const bulk = oneSelected ? undefined : bulkProp;
  const targets = oneSelected ? undefined : targetsProp;

  /* Distinct job + version rows, in first-seen order, with a link count. */
  const targetRows: (RevokeTarget & { links: number })[] = [];
  for (const t of targets ?? []) {
    if (!t.jobCode && !t.jobTitle && t.version == null) continue;
    const row = targetRows.find((r) => r.jobCode === t.jobCode && r.jobTitle === t.jobTitle && r.version === t.version);
    if (row) row.links += 1; else targetRows.push({ ...t, links: 1 });
  }
  const shownTargets = targetRows.slice(0, 4);
  const hiddenTargets = targetRows.length - shownTargets.length;

  const noun = kind === 'interview' ? 'Interview' : 'Assessment';
  const count = bulk?.count ?? null;
  const unaffected = { icon: CircleCheck, text: <>Candidates who are already in progress or have completed the {kind} will not be impacted and can finish.</> };

  let title: string;
  let lead: ReactNode;
  let pill: string | null;
  let effects: { icon: typeof Unlink; text: ReactNode }[];
  let confirmLabel: string;

  if (!bulk) {
    title = `Revoke ${noun} Link?`;
    lead = <>This will immediately expire the {kind} link sent to</>;
    pill = singleEmail ?? null;
    effects = [
      { icon: Unlink, text: `The current ${kind} link will be immediately deactivated.` },
      { icon: UserRound, text: `The candidate will not be able to access the ${kind} using this link.` },
      { icon: SquarePen, text: "You can edit the candidate's details and send a new invitation afterwards." },
    ];
    if (skippedOfOne) {
      effects.splice(2, 0, {
        icon: Info,
        text: <>{plural(skippedOfOne, 'other selected invitation')} {skippedOfOne === 1 ? 'has' : 'have'} already started, finished or expired and will be left as {skippedOfOne === 1 ? 'it is' : 'they are'}.</>,
      });
    }
    confirmLabel = 'Revoke Link';
  } else if (bulk.scope === 'selected') {
    const n = count ?? 0;
    title = `Revoke ${noun} Links?`;
    lead = <>This will immediately expire the {kind} links for the selected candidates.</>;
    pill = `${plural(n, 'candidate')} selected`;
    effects = [
      { icon: Unlink, text: <>The selected {plural(n, `${kind} link`)} will be immediately deactivated.</> },
      { icon: Users, text: <>Only candidates who have <strong>not yet started</strong> the {kind} will be affected.</> },
      unaffected,
      { icon: SquarePen, text: <>You can edit the affected candidates&apos; details and send a new {kind} invitation later.</> },
    ];
    if (bulk.skippedCount) {
      effects.splice(2, 0, {
        icon: Info,
        text: <>{plural(bulk.skippedCount, 'other selected invitation')} {bulk.skippedCount === 1 ? 'has' : 'have'} already started, finished or expired and will be left as {bulk.skippedCount === 1 ? 'it is' : 'they are'}.</>,
      });
    }
    confirmLabel = `Revoke ${plural(n, 'Link')}`;
  } else {
    title = `Revoke Pending ${noun} Links?`;
    /* Same lead and pill as the selected popups (the job / version rows
       below name the assessment / interview). */
    lead = <>This will immediately expire the {kind} links for the selected candidates.</>;
    pill = count === null ? 'Counting candidates…' : `${plural(count, 'candidate')} selected`;
    effects = [
      { icon: Unlink, text: count === null ? <>Every pending {kind} link will be immediately deactivated.</> : <>{plural(count, `pending ${kind} link`)} will be immediately deactivated.</> },
      { icon: Users, text: <>Only candidates who have <strong>not yet opened</strong> their invitation will be affected.</> },
      unaffected,
      { icon: SquarePen, text: <>You can edit the affected candidates&apos; details and send a new {kind} invitation later.</> },
    ];
    confirmLabel = count === null ? 'Revoke Links' : `Revoke ${plural(count, 'Link')}`;
  }
  const nothingToRevoke = !!bulk && count === 0;

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-[10000] flex items-center justify-center p-4 sm:p-6">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="revoke-link-title"
        className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-xl animate-scale-in max-h-[calc(100dvh-2rem)] flex flex-col tf-round-edges"
      >
        <div className="flex-1 min-h-0 px-5 sm:px-8 pt-7 sm:pt-8 pb-5 overflow-y-auto text-center">
          <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto rounded-full bg-destructive-subtle flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 sm:w-8 sm:h-8 text-destructive" />
          </div>
          <h2 id="revoke-link-title" className="mt-3 text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-50 leading-snug">
            {title}
          </h2>
          <div className="mt-2 tf-body-secondary sm:text-base leading-relaxed">
            <p>{lead}</p>
            {pill && (
              <span className={`inline-block max-w-full bg-destructive-subtle text-destructive ${bulk ? 'mt-2 px-3 py-0.5 rounded-full font-semibold' : 'mt-1 px-2 py-0.5 rounded-md font-medium break-all'}`}>
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
                    <span className="ml-auto pl-2 tf-micro-hint whitespace-nowrap tabular-nums">{plural(t.links, 'link')}</span>
                  )}
                </li>
              ))}
              {hiddenTargets > 0 && (
                <li className="px-3 py-1.5 tf-micro-hint">+ {plural(hiddenTargets, 'more job / version', 'more jobs / versions')}</li>
              )}
            </ul>
          )}

          {/* What will happen */}
          <div className="mt-5 text-left rounded-xl border border-destructive-line bg-destructive-subtle/60 px-3 sm:px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <Info className="w-5 h-5 shrink-0 text-destructive" />
              <p className="text-base font-bold text-destructive">What will happen?</p>
            </div>
            <ul className="mt-3 space-y-2.5">
              {effects.map(({ icon: Icon, text }, i) => (
                <li key={i} className="flex items-start gap-3 tf-body">
                  <span className="w-9 h-9 shrink-0 rounded-full bg-destructive-subtle flex items-center justify-center">
                    <Icon className="w-4 h-4 text-destructive" />
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
          <Button variant="destructive" onClick={onConfirm} disabled={isLoading || nothingToRevoke} className="w-full sm:w-auto sm:min-w-[160px] px-6">
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isLoading ? 'Revoking…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
