'use client';

import { useState } from 'react';
import { Archive, ArchiveRestore, Trash2, Calendar, ChevronDown, Clock, Copy, Eye, Layers, ListChecks, Loader2, Mail, MoreVertical, Pencil, Plus, RefreshCw, Send, Timer, User } from 'lucide-react';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { VersionPill } from '@/components/assessments/AllAssessmentsTable';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { formatIST } from '@/lib/utils/dateUtils';
import { jdActionLockReason } from '@/lib/services/aiInterviewService';
import JobStatusBadge, { jobStatusBadgeKind } from '@/components/jobs/JobStatusBadge';
import {
  KIND_LABEL,
  MAX_VERSIONS,
  nextVersionNumber,
  versionCapMessage,
  versionActions,
  type VersionAction,
  type InviteKind,
  type InviteVersion,
  type VersionActionItem,
  type VersionPermissions,
  type VersionStatus,
} from './inviteVersions';

/* The version cards' status pill (JobAssessmentVersionPicker / JobInterviewVersionPicker). */
export const STATUS_PILL: Record<VersionStatus, string> = {
  active: 'bg-success-subtle text-success-strong ring-success-line',
  draft: 'bg-warning-subtle text-warning-strong ring-warning-line',
  completed: 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20',
  archived: 'bg-slate-100 text-gray-600 ring-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
  cancelled: 'bg-slate-100 text-gray-600 ring-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
};

/* The Assessments page's row-menu icons and colours, per action. */
const ACTION_ICON: Record<VersionAction, { Icon: typeof Eye; tone: string }> = {
  view: { Icon: Eye, tone: 'text-menu-icon-view' },
  edit: { Icon: Pencil, tone: 'text-menu-icon-edit' },
  publish: { Icon: Send, tone: 'text-menu-icon-activate' },
  duplicate: { Icon: Copy, tone: 'text-menu-icon-download' },
  pause: { Icon: Archive, tone: 'text-menu-icon-archive' },
  archive: { Icon: Archive, tone: 'text-menu-icon-archive' },
  unarchive: { Icon: ArchiveRestore, tone: 'text-menu-icon-archive' },
  delete: { Icon: Trash2, tone: 'text-destructive' },
};

/**
 * A version's title, as the version cards and the picked-version strip both
 * show it. An assessment names its job, then the version of each — "JD-245
 * Junior Software Test Engineer V2 - Assessment V1" — with the JD ID chip and
 * the job / assessment version pills in their usual colours; an AI interview
 * reads the same with "- AI Interview". One with no job keeps its own name. Pieces are
 * returned bare, to sit in the caller's wrapping flex row. `compact` is the
 * strip's smaller type.
 */
export function VersionTitle({ version: v, spansJobVersions = false, compact = false }: {
  version: InviteVersion;
  spansJobVersions?: boolean;
  compact?: boolean;
}) {
  const tone = `${compact ? 'text-sm font-medium' : 'text-sm sm:text-base font-semibold'} ${
    v.sendable ? 'text-gray-900 dark:text-slate-50' : 'text-gray-500 dark:text-slate-400'
  }`;
  /* An AI interview names its job the same way — "JD-245 Junior Software Test
     Engineer V2 - AI Interview V1" — with its linked job's Disabled /
     Archived / Draft badge after it (assessments carry theirs in the header). */
  const job = v.kind === 'assessment'
    ? (v.raw?.jd_title ? { code: v.raw.jd_short_id, title: v.raw.jd_title } : null)
    : (v.config?.jd_title ? { code: v.config.jd_short_id, title: v.config.jd_title } : null);
  const jdKind = v.kind === 'interview' ? jobStatusBadgeKind(v.config?.jd_status) : null;
  const jdBadge = jdKind ? <JobStatusBadge kind={jdKind} title={jdActionLockReason(v.config?.jd_status) ?? undefined} /> : null;
  if (job) {
    return (
      <>
        {job.code && <JobIdBadge className="flex-shrink-0">{job.code}</JobIdBadge>}
        <span className={`min-w-0 [overflow-wrap:anywhere] ${tone}`}>{job.title}</span>
        {v.jobVersion ? <VersionPill kind="job" version={v.jobVersion} /> : null}
        <span className={`whitespace-nowrap ${tone}`}>- {KIND_LABEL[v.kind].singular}</span>
        <VersionPill kind="assessment" version={v.version} />
        {jdBadge}
      </>
    );
  }
  return (
    <>
      <span className={`min-w-0 [overflow-wrap:anywhere] ${tone}`}>{v.name}</span>
      {spansJobVersions && v.jobVersion ? <VersionPill kind="job" version={v.jobVersion} label="Job" /> : null}
      <VersionPill kind="assessment" version={v.version} />
      {jdBadge}
    </>
  );
}

/** Assessment versions listed before "+N more versions". */
const INITIAL_VISIBLE = 3;

/** "3 of 5 used" with its bar — the popup's version heading carries it. */
export function VersionUsage({ kind, used }: { kind: InviteKind; used: number }) {
  const max = MAX_VERSIONS[kind];
  const atCap = used >= max;
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="tf-meta whitespace-nowrap tabular-nums">{used} of {max} used</span>
      <div
        className="h-1.5 w-16 sm:w-24 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={used}
        aria-label={`${KIND_LABEL[kind].singular} versions used`}
      >
        <div className={`h-full rounded-full ${atCap ? 'bg-brand-orange' : 'bg-brand-blue'}`} style={{ width: `${Math.min(100, (used / max) * 100)}%` }} />
      </div>
    </div>
  );
}

/**
 * The popup's version cards — the existing Invite popups' card, one per
 * version of this job (any status: every one counts toward the cap). Only
 * an Active version can be picked (one per send); an AI interview Draft
 * offers Publish on its card (an assessment Draft does not); the rest of a
 * version's actions are in its ⋯ menu. Below the
 * cards, New version — or why not.
 */
export default function VersionList({
  kind,
  versions,
  allVersions,
  loading,
  error,
  onRetry,
  selectedId,
  onSelect,
  createBlocked,
  creating,
  onCreate,
  perms,
  busyId,
  onAction,
  hideDuplicate = false,
  spansJobVersions = false,
}: {
  kind: InviteKind;
  /** The cards to list. */
  versions: InviteVersion[];
  /** Every version of the type for this job version, when the list shows
   *  fewer (the AI popup lists only the mapped one): the usage count, the cap,
   *  the next version number, Latest and the ⋯ rules read these. */
  allVersions?: InviteVersion[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Why a new version cannot be made, or null. */
  createBlocked: string | null;
  creating: boolean;
  onCreate: () => void;
  perms: VersionPermissions;
  busyId: string | null;
  onAction: (version: InviteVersion, item: VersionActionItem) => void;
  /** Leave Duplicate out of the ⋯ menu (Job Details' Create / Send AI Interview). */
  hideDuplicate?: boolean;
  /** The cards span several job versions of one job (the Send Invite
   *  picker's Change version): each card names its job version, its ⋯ rules
   *  read its own job version's versions, and Latest is the newest overall.
   *  `allVersions` stays the picked job version's — usage, cap, New version. */
  spansJobVersions?: boolean;
}) {
  const label = KIND_LABEL[kind];
  const every = allVersions ?? versions;
  const used = every.length;
  const atCap = used >= MAX_VERSIONS[kind];
  const latestId = (spansJobVersions ? versions : every)[0]?.id;
  /** The versions a card's ⋯ rules are judged against: its own job version's. */
  const poolFor = (v: InviteVersion) => (spansJobVersions ? versions.filter((x) => x.jdId === v.jdId) : every);
  /* The New version / Create button (and its cap and Draft-gate notes): v1 is
     configured in a popup, later versions are a draft copy of the latest
     opened there. An AI interview is one per job version: v1 is its only
     fresh create, and New version duplicates it up to the cap, where the limit
     note takes the button's place — the same in both popups. */
  /* Both popups show the newest INITIAL_VISIBLE versions; the rest sit
     behind "+N more versions". */
  const [expanded, setExpanded] = useState(false);
  const limit = !expanded ? INITIAL_VISIBLE : versions.length;
  const shown = versions.slice(0, limit);
  const hiddenCount = Math.max(0, versions.length - INITIAL_VISIBLE);
  const pickHidden = !expanded && versions.slice(INITIAL_VISIBLE).some((v) => v.id === selectedId);

  if (loading) {
    return (
      <div className="space-y-2.5" aria-busy="true" aria-label={`Loading ${label.singular.toLowerCase()} versions`}>
        {[0, 1].map((i) => <div key={i} className="h-[74px] rounded-xl bg-gray-100 dark:bg-slate-800 animate-pulse" />)}
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-destructive-line bg-destructive-subtle px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-destructive min-w-0 [overflow-wrap:anywhere]">{error}</p>
        <Button variant="secondary" size="sm" onClick={onRetry} icon={<RefreshCw className="w-3.5 h-3.5" />}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {versions.length === 0 ? (
        /* The version cards' own empty state. */
        <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-700 py-8 flex flex-col items-center gap-1.5 text-center px-4">
          <div className="tf-label">
            {used === 0 ? `No ${label.singular.toLowerCase()} for this job yet` : `No live ${label.singular.toLowerCase()} for this job version`}
          </div>
          {used === 0 && (
            <div className="tf-meta">
              {kind === 'assessment'
                ? 'Create v1 — configure it here, and it appears in this list.'
                : 'Create v1 — set it up here, and it appears in this list.'}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2.5" role="radiogroup" aria-label={`${label.singular} versions`}>
          {shown.map((v) => {
            const selected = selectedId === v.id;
            const why = v.sendable
              ? undefined
              : v.revoked
                ? 'Invites for this version have been revoked. Create a new version to start fresh.'
                : v.kind === 'interview' && jdActionLockReason(v.config?.jd_status)
                  ? jdActionLockReason(v.config?.jd_status)!
                : v.status === 'draft' ? 'Publish this version to send it' : `${v.statusLabel} versions cannot be sent`;
            const pick = () => { if (v.sendable) onSelect(selected ? null : v.id); };
            const actions = versionActions(v, poolFor(v), perms).filter((a) => !(hideDuplicate && a.action === 'duplicate'));
            return (
              <div
                key={v.id}
                className={`flex flex-wrap sm:flex-nowrap items-center sm:gap-3 rounded-xl border sm:pr-3 transition-colors ${
                  selected
                    ? 'border-brand-blue/50 bg-brand-blue/[0.06] ring-1 ring-brand-blue/30'
                    : v.sendable
                      ? 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-brand-blue/30 hover:bg-brand-blue/5'
                      : 'border-gray-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40'
                }`}
              >
                {/* The pick is its own control, so Publish and ⋯ beside it
                    stay usable on a card that cannot be picked. */}
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-disabled={!v.sendable}
                  title={why}
                  onClick={pick}
                  className={`min-w-0 w-full sm:w-auto flex-1 flex items-start gap-3 px-3 sm:pl-4 sm:pr-0 pt-3.5 pb-2 sm:pb-3.5 text-left rounded-xl sm:rounded-r-none ${v.sendable ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  {/* Level with the title line, as on the version cards. */}
                  <span className="self-start h-6 flex items-center shrink-0">
                    <input
                      type="radio"
                      checked={selected}
                      disabled={!v.sendable}
                      readOnly
                      tabIndex={-1}
                      aria-hidden="true"
                      className="m-0 border-gray-300 pointer-events-none"
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 flex-wrap min-h-6">
                      <VersionTitle version={v} spansJobVersions={spansJobVersions} />
                      {v.id === latestId && (
                        /* The Job Openings version history's Latest chip
                           (JobVersionHistoryPanel), class for class. */
                        <span className="shrink-0 px-1.5 py-0.5 rounded-md text-2xs font-semibold uppercase tracking-wide text-white bg-brand-blue ring-1 ring-white/10">
                          Latest
                        </span>
                      )}
                    </span>
                    <span className="mt-1.5 flex items-center gap-x-4 gap-y-1 flex-wrap tf-meta">
                      {v.createdAt && <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{formatIST(v.createdAt)}</span>}
                      {v.mode && <span className="inline-flex items-center gap-1"><Timer className="w-3.5 h-3.5" />{v.mode}</span>}
                      {v.rounds.length > 0 && (
                        <span className="inline-flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5" />
                          {v.rounds.map((r) => (
                            <span key={r.short} title={r.label} className="tf-badge text-2xs bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">
                              {r.short}
                            </span>
                          ))}
                        </span>
                      )}
                      {!!v.durationMinutes && <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{v.durationMinutes} mins</span>}
                      {v.questions != null && <span className="inline-flex items-center gap-1"><ListChecks className="w-3.5 h-3.5" />{v.questions} questions</span>}
                      <span className="inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{v.invitations} sent</span>
                      {v.createdBy && (
                        <span className="inline-flex items-center gap-1 min-w-0"><User className="w-3.5 h-3.5 shrink-0" /><span className="truncate">Created by {v.createdBy}</span></span>
                      )}
                    </span>
                  </span>
                </button>
                {/* Status and actions: beside the text from `sm`, their own
                    row under it on a phone so the text keeps the width. */}
                <div className="w-full sm:w-auto flex items-center justify-end gap-2 px-3 pb-3 sm:p-0 shrink-0">
                <span className={`mr-auto sm:mr-0 inline-flex shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg ring-1 ${STATUS_PILL[v.status]}`}>{v.statusLabel}</span>
                {/* No Publish button on a Draft card in either popup; an AI
                    interview Draft is still published from its ⋯ menu. */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      disabled={busyId === v.id}
                      aria-label={`Actions for ${v.name} v${v.version}`}
                      className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 hover:text-brand-blue hover:border-brand-blue/30 hover:bg-brand-blue/5 disabled:opacity-50"
                    >
                      {busyId === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreVertical className="w-4 h-4" />}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {actions.map((item) => {
                      const { Icon, tone } = ACTION_ICON[item.action];
                      return (
                      <DropdownMenuItem
                        key={item.action}
                        disabled={!!item.disabledReason}
                        onSelect={() => onAction(v, item)}
                        className="flex items-start gap-2.5 text-sm"
                      >
                        <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${item.disabledReason ? 'text-gray-300' : tone}`} />
                        <span className="flex flex-col">
                          <span className={MENU_ITEM_SCALE_CLASS}>{item.label}</span>
                          {item.disabledReason && (
                            <span className="tf-micro-hint whitespace-normal">{item.disabledReason}</span>
                          )}
                        </span>
                      </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* +N: how many more versions there are, and the way to see them. */}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="tf-btn tf-btn-secondary gap-1.5 h-8 px-3 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-gray-700 dark:text-slate-300 hover:text-brand-blue hover:border-brand-blue/30 hover:bg-brand-blue/5 transition-colors whitespace-normal justify-start"
        >
          {expanded ? (
            'Show less'
          ) : (
            <>
              <span className="inline-flex items-center justify-center min-w-[1.75rem] px-1.5 py-0.5 rounded-md text-xs font-semibold tabular-nums text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20">
                +{hiddenCount}
              </span>
              more version{hiddenCount === 1 ? '' : 's'}
              {pickHidden && <span className="text-brand-blue">· 1 selected</span>}
            </>
          )}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      )}

      {atCap ? (
        <p role="status" className="rounded-lg border border-brand-orange/30 bg-brand-orange/10 px-3 py-2 text-xs font-medium text-brand-orange-deep">
          {versionCapMessage(kind)}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            type="button"
            onClick={onCreate}
            disabled={!!createBlocked || creating}
            title={createBlocked ?? undefined}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-brand-blue/30 text-xs font-medium text-brand-blue bg-white dark:bg-slate-900 hover:bg-brand-blue/5 disabled:border-gray-200 dark:disabled:border-slate-700 disabled:text-gray-400 disabled:hover:bg-transparent disabled:cursor-not-allowed"
          >
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            {used === 0 ? `Create ${label.singular} (v1)` : `New version (v${nextVersionNumber(every)})`}
          </button>
          {createBlocked && <span className="tf-meta">{createBlocked}</span>}
        </div>
      )}
    </div>
  );
}
