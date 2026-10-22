/**
 * Data layer for the AI Talent Match "Create / Send" drawer: one job version's
 * Assessment and AI Interview versions, the per-type version cap, creating the
 * next version, the version actions, and sending one version to candidates.
 *
 * Every call here is one the app already makes elsewhere — the Assessments
 * and AI Interviews pages for the version actions, Job Details' Create for the
 * duplicate, and the two share modals for the per-candidate invite — so the
 * drawer adds a presentation, not new business logic.
 *
 * Product rules (2026-10-12): at most MAX_VERSIONS[kind] versions per JD row
 * (one job version) per type, counted independently (an Assessment never uses
 * an AI Interview slot) — 5 of each, the backend's caps; EVERY version counts,
 * archived included; Create New Version duplicates the latest version as a new
 * Draft and never overwrites one; one version per send. An AI interview is
 * still ONE per job version: v1 is its only fresh create, and v2..v5 are clones
 * of it (the clone keeps the AI-xxx ID and takes the next V-number).
 */
import { assessmentService, type AssessmentResponse } from '@/lib/services/assessmentService';
import { aiInterviewService, isJdDisabled, JD_DISABLED_ACTION_MESSAGE, type AIInterviewResponse } from '@/lib/services/aiInterviewService';
import { listAllAssessments, MAX_ASSESSMENT_VERSIONS } from '@/lib/utils/jobAssessmentHierarchy';
import { getLocallyRevokedAssessmentIds, isAssessmentRevoked } from '@/lib/utils/assessmentUtils';
import {
  interviewDuplicateBlockedReason,
  interviewVersionOrdinal,
  MAX_INTERVIEW_VERSIONS,
} from '@/lib/utils/aiInterviewVersion';
import { resolveAIInterviewDraftResumeHref, aiInterviewConfigureHref } from '@/lib/utils/aiInterviewDraftResume';
import { formatISTDate } from '@/lib/utils/dateUtils';
import { modeFromConfig } from '@/lib/constants/aiInterviewMode';
import { ROUND_LABELS, ROUND_SHORT_LABELS } from '@/components/ai-interview/AIInterviewPicker';

export type InviteKind = 'assessment' | 'interview';

/** The cap, per type. Shares the Assessments page's constant so the two can
 *  never disagree. */
export const MAX_VERSIONS_PER_TYPE = MAX_ASSESSMENT_VERSIONS;

/** The version limit per job version (one JD row), per type: the
 *  Assessments page's cap, and the AI Interviews page's (the backend's
 *  MAX_INTERVIEW_VERSIONS — the versions of the job version's one interview). */
export const MAX_VERSIONS: Record<InviteKind, number> = {
  assessment: MAX_VERSIONS_PER_TYPE,
  interview: MAX_INTERVIEW_VERSIONS,
};

/** Why New version is off at the limit — the popup's note and its tooltip,
 *  worded the same for both types (the Invite to Assessment popup's). */
export const versionCapMessage = (kind: InviteKind): string =>
  `Maximum ${MAX_VERSIONS[kind]} versions reached. Manage existing versions to continue.`;

export const KIND_LABEL: Record<InviteKind, { singular: string; plural: string }> = {
  assessment: { singular: 'Assessment', plural: 'Assessments' },
  interview: { singular: 'AI Interview', plural: 'AI Interviews' },
};

export type VersionStatus = 'draft' | 'active' | 'completed' | 'archived' | 'cancelled';

/* The words the Assessments / AI Interviews lists already use, so a version
   reads the same here as on its own page (and StatusChip has a tone for each). */
const STATUS_LABEL: Record<VersionStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
  cancelled: 'Cancelled',
};

export interface InviteVersion {
  id: string;
  kind: InviteKind;
  /** What the version is called: the assessment's title (its "- Version N"
   *  suffix stripped), or the interview's position / job title. */
  name: string;
  version: number;
  status: VersionStatus;
  statusLabel: string;
  createdAt?: string;
  /** Null when the API does not return a count for this type. */
  questions: number | null;
  durationMinutes: number | null;
  invitations: number;
  /** The rounds it runs, as the version cards' chips name them. */
  rounds: { short: string; label: string }[];
  /** AI interviews only: Timed or Conversational. */
  mode?: string;
  createdBy?: string;
  /** Assessments: the API row itself, handed unchanged to the Share
   *  Assessment via Email step. */
  raw?: AssessmentResponse;
  /** AI interviews: the config itself, handed unchanged to the Send AI
   *  Interview via Email step. */
  config?: AIInterviewResponse;
  /** AI interviews: this is the job version's own interview — the one
   *  `findLiveConfigForJd` maps it to (see `loadInterviewVersions`). */
  mapped?: boolean;
  jdId: string;
  /** Only Active versions can take an invite. */
  sendable: boolean;
  /** Assessments: its invites were revoked — sealed against new ones, as the
   *  Assessments page's Share is (a duplicate starts a fresh round). */
  revoked?: boolean;
}

/* ── Loading ─────────────────────────────────────────────────────────── */

const stripVersionSuffix = (title: string) => title.replace(/\s*-\s*Version\s+\d+\s*$/i, '').trim();

function assessmentStatus(a: AssessmentResponse): VersionStatus {
  if ((a as { is_archived?: boolean }).is_archived) return 'archived';
  switch (String(a.status || '').toLowerCase()) {
    case 'published':
    case 'active':
      return 'active';
    case 'closed':
      return 'completed';
    case 'archived':
      return 'archived';
    default:
      return 'draft';
  }
}

function interviewStatus(c: AIInterviewResponse): VersionStatus {
  const s = String(c.status || '').toLowerCase();
  // Candidate-flow statuses are still live, published configs (AIInterviewPicker's rule).
  if (['published', 'invited', 'consent_pending', 'system_check', 'in_progress', 'scheduled'].includes(s)) return 'active';
  if (s === 'archived') return 'archived';
  if (s === 'completed') return 'completed';
  if (s === 'cancelled') return 'cancelled';
  return 'draft';
}

/** Newest version first. */
const byVersionDesc = (a: InviteVersion, b: InviteVersion) =>
  b.version - a.version || new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();

/** Every assessment version of this JD row, any status, archived included.
 *  Paged here rather than through `listAllAssessments`, which swallows a
 *  failed request into an empty list — that would read as "no assessment for
 *  this job" and offer to create v1 instead of saying the load failed. */
export async function loadAssessmentVersions(jdId: string): Promise<InviteVersion[]> {
  const rows: AssessmentResponse[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const response = await assessmentService.list({ jd_id: jdId, page, page_size: 100 });
    const items = response.items || [];
    rows.push(...items);
    if (items.length < 100 || rows.length >= (response.total ?? rows.length)) break;
  }
  const seen = new Set<string>();
  const revokedIds = getLocallyRevokedAssessmentIds();
  return rows
    .filter((a) => a.jd_id === jdId && (seen.has(a.id) ? false : (seen.add(a.id), true)))
    .map((a): InviteVersion => {
      const status = assessmentStatus(a);
      const revoked = isAssessmentRevoked(a, revokedIds);
      return {
        id: a.id,
        kind: 'assessment',
        name: stripVersionSuffix(a.title || '') || a.jd_title || 'Assessment',
        version: typeof a.version === 'number' ? a.version : 1,
        status,
        statusLabel: STATUS_LABEL[status],
        createdAt: a.created_at,
        // The assessment list does not return a question count.
        questions: null,
        durationMinutes: a.duration_minutes ?? null,
        invitations: a.invitations_count ?? 0,
        rounds: [
          a.hr_enabled ? { short: 'HR', label: 'HR Round' } : null,
          a.technical_enabled ? { short: 'TECH', label: 'Technical Round' } : null,
          a.coding_enabled ? { short: 'CODE', label: 'Coding Round' } : null,
        ].filter((r): r is { short: string; label: string } => !!r),
        createdBy: a.created_by_name,
        raw: a,
        jdId: a.jd_id,
        sendable: status === 'active' && !revoked,
        revoked,
      };
    })
    .sort(byVersionDesc);
}

/** Every AI interview config, any status, archived included. The configs
 *  list has no JD filter, so it is read whole (live pages, then the archived
 *  ones) — the Invite to AI Interview dialog's own load. Also what "Browse all
 *  AI interviews" hands the shared AIInterviewPicker, which lists the active
 *  ones and needs the rest to number versions and group jobs. */
export async function loadAllInterviewConfigs(): Promise<AIInterviewResponse[]> {
  const { live, archived } = await aiInterviewService.listAllConfigsSplit();
  const seen = new Set<string>();
  return [...live, ...archived].filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
}

/** Every AI interview version of this JD row, any status, archived included,
 *  with the one the job version is MAPPED to marked: the live interview Job
 *  Details itself uses for this job version (`findLiveConfigForJd`). With no
 *  live one, the job version's newest Draft stands in, so it can still be
 *  edited and published from the popup. */
export async function loadInterviewVersions(jdId: string): Promise<InviteVersion[]> {
  const [all, live] = await Promise.all([loadAllInterviewConfigs(), aiInterviewService.findLiveConfigForJd(jdId)]);
  const ofJob = all.filter((c) => c.jd_id === jdId);
  return ofJob
    .map((c): InviteVersion => {
      const status = interviewStatus(c);
      return {
        id: c.id,
        kind: 'interview',
        name: c.position || c.jd_title || 'AI Interview',
        version: interviewVersionOrdinal(c, ofJob),
        status,
        statusLabel: STATUS_LABEL[status],
        createdAt: c.created_at,
        questions: typeof c.total_questions === 'number' && c.total_questions > 0 ? c.total_questions : null,
        durationMinutes: c.duration_minutes ?? null,
        invitations: c.invitations_count ?? 0,
        rounds: (c.rounds_config || [])
          .filter((r) => r.enabled !== false)
          .map((r) => ({ short: ROUND_SHORT_LABELS[r.type] || r.type, label: ROUND_LABELS[r.type] || r.type })),
        mode: modeFromConfig(c.special_instructions, c.duration_minutes) === 'flexible' ? 'Conversational' : 'Timed',
        createdBy: c.created_by_name,
        config: c,
        mapped: !!live && c.id === live.id,
        jdId: c.jd_id as string,
        sendable: status === 'active' && !isJdDisabled(c.jd_status),
      };
    })
    .sort(byVersionDesc);
}

/** What the Select Version step lists. Every version of either type, as
 *  assessments always have: several AI interview versions can be Active at once
 *  (each has its own invitations and lock), so the step no longer narrows an
 *  interview to the one the job version is mapped to. Only Active versions are
 *  `sendable`; the mapped one stays marked and is still the first pick. */
export function listedVersions(_kind: InviteKind, versions: InviteVersion[]): InviteVersion[] {
  return versions;
}

export const loadVersions = (kind: InviteKind, jdId: string) =>
  kind === 'assessment' ? loadAssessmentVersions(jdId) : loadInterviewVersions(jdId);

/* ── The cap and the create rules ───────────────────────────────────── */

export interface VersionPermissions {
  canCreate: boolean;
  canUpdate: boolean;
  canPublish: boolean;
  canArchive: boolean;
  canInvite: boolean;
  /** AI interview Draft's Delete (the AI Interviews page's delete permission). */
  canDelete?: boolean;
}

/** Why a new version cannot be made right now, or null when it can. */
export function createBlockedReason(
  versions: InviteVersion[],
  perms: VersionPermissions,
  kind: InviteKind,
  /** The version being copied. New version copies the latest, so it defaults to that. */
  source?: InviteVersion,
): string | null {
  if (!perms.canCreate) return `You do not have permission to create ${KIND_LABEL[kind].plural.toLowerCase()}`;
  if (versions.length >= MAX_VERSIONS[kind]) return versionCapMessage(kind);
  /* One unpublished version at a time — the Assessments page's Draft gate
     (a draft must be published before it is duplicated), applied to both
     types so a sixth draft cannot be stacked behind five. */
  const draft = versions.find((v) => v.status === 'draft');
  if (draft) return `Publish or finish Draft v${draft.version} before creating another version.`;
  /* The source follows the module's Duplicate rules (the Assessments and AI
     Interviews pages, and the backend's clone): not archived, and only once
     sent — until then it is still edited. New version copies the latest. */
  const copied = source ?? versions[0];
  if (copied) {
    if (copied.status === 'archived') return `Unarchive v${copied.version} to create a new version from it.`;
    if (!hasBeenSent(copied)) return `No candidates invited to v${copied.version} yet — edit it instead.`;
  }
  /* An AI interview's own clone rules on top (latest only, ...). */
  if (kind === 'interview' && copied) {
    if (copied.config) {
      const lineage = versions.flatMap((v) => (v.config ? [v.config] : []));
      const why = interviewDuplicateBlockedReason(copied.config, lineage, perms.canCreate);
      if (why) return why;
    }
  }
  return null;
}

/** The next version number a create would produce. */
export const nextVersionNumber = (versions: InviteVersion[]) =>
  versions.reduce((max, v) => Math.max(max, v.version), 0) + 1;

/** Where the full create flow lives, for a job with no version yet. Both
 *  carry `from=job-details`, so the create page's breadcrumb, Save as Draft,
 *  Discard and Publish all land back on this job's Job Details page. */
export function createPageHref(kind: InviteKind, jdId: string, jdTitle: string, returnUrl: string): string {
  return kind === 'assessment'
    ? `/recruitment/assessments/create?step=configure&jd_id=${encodeURIComponent(jdId)}` +
      `&from=job-details&jd_title=${encodeURIComponent(jdTitle)}&returnUrl=${encodeURIComponent(returnUrl)}`
    : `/recruitment/ai-interviews/jd-selection/ai-interview-config?jd_id=${encodeURIComponent(jdId)}&from=job-details`;
}

/**
 * Duplicate `source` as a new Draft - the next version. Both types use their
 * clone endpoint (Job Details' Create, the Assessments / AI Interviews pages'
 * Duplicate), so the same rules apply wherever it is triggered: the source must
 * have been invited, one draft per lineage, the version cap. For an interview the
 * clone keeps the AI-xxx ID and takes the next V-number.
 * Resolves to the new draft's id.
 */
export async function duplicateVersion(source: InviteVersion): Promise<string> {
  if (source.kind === 'assessment') {
    return (await assessmentService.clone(source.id)).cloned_id;
  }
  return (await aiInterviewService.clone(source.id)).cloned_id;
}

/* ── Version actions (the ⋯ menu) ───────────────────────────────────── */

export type VersionAction = 'view' | 'edit' | 'publish' | 'duplicate' | 'pause' | 'archive' | 'unarchive' | 'delete';

export interface VersionActionItem {
  action: VersionAction;
  label: string;
  /** Shown disabled, with this as the reason, instead of hidden. */
  disabledReason?: string;
  /** Needs an in-popup confirmation first. */
  confirm?: { title: string; message: string; confirmText: string; destructive?: boolean };
}

/** Sent = at least one invitation recorded for it — the API's own count,
 *  never the candidates ticked in the popup. */
export const hasBeenSent = (v: InviteVersion) => v.invitations > 0;

const archiveItem = (v: InviteVersion, perms: VersionPermissions): VersionActionItem => ({
  action: 'archive',
  label: 'Archive',
  disabledReason: perms.canArchive ? undefined : 'You do not have permission to archive',
  confirm: {
    title: `Archive v${v.version}?`,
    /* Archiving never frees a slot: every version counts toward the limit. */
    message: v.kind === 'interview'
      ? `It can no longer be sent to candidates. You can unarchive it later. It still counts toward the ${MAX_VERSIONS.interview}-version limit.`
      : `It is hidden from invite lists. It still counts toward the ${MAX_VERSIONS_PER_TYPE}-version limit.`,
    confirmText: 'Archive',
    destructive: true,
  },
});

/** A Draft's Publish — the AI interview ⋯ menu's (the Invite to Assessment
 *  popup offers no Publish: a Draft there is View / Edit only). */
export function publishAction(v: InviteVersion, perms: VersionPermissions): VersionActionItem | null {
  if (v.status !== 'draft' || !perms.canPublish) return null;
  return {
    action: 'publish',
    label: 'Publish',
    disabledReason: v.kind === 'interview' && isJdDisabled(v.config?.jd_status) ? JD_DISABLED_ACTION_MESSAGE : undefined,
    confirm: {
      title: `Publish v${v.version}?`,
      message: `${v.name} v${v.version} becomes Active and can be sent to candidates.`,
      confirmText: 'Publish',
    },
  };
}

/**
 * A version's ⋯ menu.
 *
 * Assessments (the Invite to Assessment popup's rules):
 *   Active, never sent  → View, Edit, Archive
 *   Active, sent        → View, Archive   (no Edit: invited candidates would
 *                                          get a different test than later ones)
 *   Draft               → View, Edit
 *   Completed           → View, Archive
 *   Archived            → View, Unarchive (the Assessments page's restore)
 * No Pause and no Duplicate here — New version under the cards is how a
 * version is copied.
 *
 * AI interviews: a Draft offers the AI Interviews page's draft actions —
 * Continue Editing (the wizard popup, where it publishes), View Details,
 * Delete. An Active version: View, Edit (only while never sent), Duplicate
 * (only once sent), Archive. Any other status: View, Duplicate, Archive.
 */
export function versionActions(v: InviteVersion, versions: InviteVersion[], perms: VersionPermissions): VersionActionItem[] {
  const items = baseVersionActions(v, versions, perms);
  /* A disabled job's interviews stay viewable; every other action waits
     until the job is enabled again. */
  if (v.kind !== 'interview' || !isJdDisabled(v.config?.jd_status)) return items;
  return items.map((item) => (item.action === 'view' ? item : { ...item, disabledReason: JD_DISABLED_ACTION_MESSAGE }));
}

function baseVersionActions(v: InviteVersion, versions: InviteVersion[], perms: VersionPermissions): VersionActionItem[] {
  const noUpdate = 'You do not have permission to edit';

  if (v.kind === 'assessment') {
    const items: VersionActionItem[] = [{ action: 'view', label: 'View' }];
    if (v.status === 'draft' || (v.status === 'active' && !hasBeenSent(v))) {
      items.push({ action: 'edit', label: 'Edit', disabledReason: perms.canUpdate ? undefined : noUpdate });
    }
    if (v.status === 'active' || v.status === 'completed') items.push(archiveItem(v, perms));
    if (v.status === 'archived') {
      items.push({
        action: 'unarchive',
        label: 'Unarchive',
        disabledReason: perms.canArchive ? undefined : 'You do not have permission to unarchive',
        confirm: {
          title: `Unarchive v${v.version}?`,
          message: 'It becomes Active again and can be sent to candidates.',
          confirmText: 'Unarchive',
        },
      });
    }
    return items;
  }

  if (v.status === 'draft') {
    return [
      { action: 'edit', label: 'Continue Editing', disabledReason: perms.canUpdate ? undefined : noUpdate },
      { action: 'view', label: 'View Details' },
      {
        action: 'delete',
        label: 'Delete',
        disabledReason: perms.canDelete ? undefined : 'You do not have permission to delete',
        confirm: {
          title: `Delete v${v.version}?`,
          message: `The ${v.name} v${v.version} draft is deleted. This cannot be undone.`,
          confirmText: 'Delete',
          destructive: true,
        },
      },
    ];
  }

  const items: VersionActionItem[] = [{ action: 'view', label: 'View' }];
  /* Edit: only while nobody has been invited to THIS version - the Assessment
     rule. A sent version is locked; Duplicate makes the next one. */
  if (v.status === 'active') {
    items.push({
      action: 'edit',
      label: 'Edit',
      disabledReason: !perms.canUpdate
        ? noUpdate
        : hasBeenSent(v)
          ? 'Cannot edit — this version has already been sent to candidates. Duplicate it to create a new version.'
          : undefined,
    });
  }
  /* Duplicate: only a sent version (an unsent one is edited), judged on this
     version's own invitations, then the shared draft / cap gate. */
  const blocked = !hasBeenSent(v) && v.status !== 'archived'
    ? 'No candidates invited yet — edit this version instead.'
    : createBlockedReason(versions, perms, v.kind, v);
  items.push({
    action: 'duplicate',
    label: 'Duplicate',
    disabledReason: blocked ?? undefined,
    confirm: {
      title: `Duplicate v${v.version}?`,
      message: `Creates v${nextVersionNumber(versions)} as a draft copy of v${v.version}. v${v.version} is not changed.`,
      confirmText: 'Duplicate',
    },
  });
  if (v.status !== 'archived') items.push(archiveItem(v, perms));
  else {
    /* The AI Interviews page's Unarchive: the server restores it to Draft
       or Active, whichever it was. */
    items.push({
      action: 'unarchive',
      label: 'Unarchive',
      disabledReason: perms.canArchive ? undefined : 'You do not have permission to unarchive',
      confirm: {
        title: `Unarchive v${v.version}?`,
        message: 'It leaves the archive and is restored to Draft or Active, as it was before.',
        confirmText: 'Unarchive',
      },
    });
  }
  return items;
}

/** An AI interview Draft's Delete — the AI Interviews page's. */
export async function deleteVersion(v: InviteVersion): Promise<void> {
  await aiInterviewService.delete(v.id);
}

/** Runs a non-navigating action. */
export async function runVersionAction(v: InviteVersion, action: 'publish' | 'pause' | 'archive' | 'unarchive'): Promise<void> {
  if (v.kind === 'assessment') {
    if (action === 'publish') await assessmentService.publish(v.id);
    else if (action === 'pause') await assessmentService.update(v.id, { status: 'closed' as never });
    else if (action === 'archive') await assessmentService.update(v.id, { status: 'archived' as never });
    // The Assessments page's Unarchive: straight back to published.
    else if (action === 'unarchive') await assessmentService.update(v.id, { status: 'published' });
    return;
  }
  if (action === 'publish') await aiInterviewService.publishConfig(v.id);
  else if (action === 'archive') await aiInterviewService.archive(v.id);
  // The AI Interviews page's Unarchive.
  else if (action === 'unarchive') await aiInterviewService.unarchive(v.id);
}

/** The assessment as it stands now, for the Invite to Assessment popup's
 *  View / Edit popups — read fresh rather than from the list row. Edit is
 *  re-checked against the ⋯ menu's own rule (Draft, or Active and never sent),
 *  so a version sent from elsewhere since the list loaded is not opened. */
export async function loadAssessmentForPopup(v: InviteVersion, action: 'view' | 'edit'): Promise<AssessmentResponse> {
  const a = await assessmentService.get(v.id);
  if (action === 'edit') {
    const status = assessmentStatus(a);
    if (!(status === 'draft' || (status === 'active' && (a.invitations_count ?? 0) === 0))) {
      throw new Error(`v${v.version} can no longer be edited. It has been sent to candidates or its status has changed.`);
    }
  }
  return a;
}

/** Where AI interview View Details / Edit open (in a new tab, so the popup keeps its place). */
export async function versionHref(v: InviteVersion, action: 'view' | 'edit', jdTitle: string, returnUrl: string): Promise<string> {
  if (v.kind === 'assessment') {
    return action === 'view'
      ? `/recruitment/assessments/${v.id}`
      : `/recruitment/assessments/create?step=configure&jd_id=${encodeURIComponent(v.jdId)}&edit=${encodeURIComponent(v.id)}` +
        `&from=job-details&jd_title=${encodeURIComponent(jdTitle)}&returnUrl=${encodeURIComponent(returnUrl)}`;
  }
  if (action === 'view') return `/recruitment/ai-interviews/${v.id}`;
  // Only a draft resumes at its last step; a published version edits from Configure.
  return v.status === 'draft' ? resolveAIInterviewDraftResumeHref(v.id, v.jdId) : aiInterviewConfigureHref(v.id, v.jdId);
}

/* ── Sending ─────────────────────────────────────────────────────────── */

/** Where a candidate in the popup came from: the Job Details tab that opened it. */
export type InviteCandidateSource =
  | 'talent-match'
  | 'score-resume'
  | 'assessment-result'
  | 'interview-result';

/** The candidate list's group headings, in the order groups are listed. */
export const CANDIDATE_SOURCE_LABEL: Record<InviteCandidateSource, string> = {
  'talent-match': 'AI Talent Match Candidates',
  'score-resume': 'Score Resume Candidates',
  'assessment-result': 'Assessment Result Candidates',
  'interview-result': 'AI Interview Result Candidates',
};

/** The assessment invite_source recorded for a candidate ticked on that tab —
 *  the values the other invite flows already write ("AI Talent Match" for the
 *  direct send below, "Resume Scoring", and "JD" for Job Details' own invite). */
export const INVITE_SOURCE_BY_TAB: Record<InviteCandidateSource, string> = {
  'talent-match': 'AI Talent Match',
  'score-resume': 'Resume Scoring',
  'assessment-result': 'JD',
  'interview-result': 'JD',
};

export interface InviteCandidate {
  id: string;
  name: string;
  email: string;
  phone?: string;
  /** The AI Talent Match rating (1–10). */
  rating?: number;
  resumeId?: string;
  source?: InviteCandidateSource;
}

export type DeliveryMethod = 'email' | 'link';

export interface SendOptions {
  method: DeliveryMethod;
  message: string;
  expiryDays: number;
}

export type SendStatus = 'sent' | 'skipped' | 'failed';

export interface SendResult {
  candidateId: string;
  name: string;
  email: string;
  status: SendStatus;
  /** Why it was skipped or failed. */
  reason?: string;
  /** The candidate's own link, when the API returned one. */
  link?: string;
}

/* The share modals' error reading: a duplicate invite and a team member's
   email are told apart from a real failure. */
function classifyError(err: unknown): { status: SendStatus; reason: string } {
  const e = err as { response?: { status?: number; data?: Record<string, unknown> }; message?: string };
  const data = (e?.response?.data || {}) as { error?: string; detail?: unknown; message?: string };
  const detail = data.detail as { error?: string; message?: string } | string | undefined;
  const code = data.error || (typeof detail === 'object' ? detail?.error : '') || '';
  const message = e?.message || '';
  if (e?.response?.status === 409 || message.includes('status code 409') || message.includes('already been invited') || code === 'DUPLICATE_INVITATION' || message.includes('DUPLICATE_INVITATION')) {
    return { status: 'skipped', reason: 'Already invited to this version' };
  }
  if (code === 'TENANT_USER_EMAIL' || message.includes('TENANT_USER_EMAIL')) {
    return { status: 'failed', reason: 'Team member emails cannot be invited' };
  }
  const reason = (typeof detail === 'string' ? detail : detail?.message) || data.message || message || 'Unknown error';
  return { status: 'failed', reason };
}

/** The AI share modal's [deadline date] placeholder, filled the same way. */
const resolveMessage = (message: string, expiryDays: number) =>
  message.trim()
    ? message.replace('[deadline date]', expiryDays > 0
        ? formatISTDate(new Date(Date.now() + expiryDays * 86400000).toISOString())
        : 'no specific deadline')
    : undefined;

/**
 * Sends ONE version to each candidate, one at a time, and reports each
 * candidate's own outcome — the endpoints the share modals call per
 * candidate. A candidate with no email, or one whose email repeats an earlier
 * row, is skipped rather than sent twice.
 */
export async function sendVersion(
  version: InviteVersion,
  candidates: InviteCandidate[],
  options: SendOptions,
  onProgress?: (done: number, total: number, result: SendResult) => void,
): Promise<SendResult[]> {
  const results: SendResult[] = [];
  const seenEmails = new Set<string>();
  const message = resolveMessage(options.message, options.expiryDays);
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : undefined;

  for (const c of candidates) {
    const email = (c.email || '').trim();
    const base = { candidateId: c.id, name: c.name, email };
    let result: SendResult;
    if (!email) {
      result = { ...base, status: 'skipped', reason: 'No email address' };
    } else if (seenEmails.has(email.toLowerCase())) {
      result = { ...base, status: 'skipped', reason: 'Same email as another selected candidate' };
    } else {
      seenEmails.add(email.toLowerCase());
      try {
        if (version.kind === 'assessment') {
          const r = await assessmentService.invite(version.id, {
            candidate_name: c.name,
            candidate_email: email,
            candidate_phone: c.phone || undefined,
            invite_source: 'AI Talent Match',
            resume_id: c.resumeId,
            custom_message: message,
            expiry_days: options.expiryDays,
          });
          result = r.status === 'failed'
            ? { ...base, status: 'failed', reason: 'The email could not be delivered — check the address' }
            : { ...base, status: 'sent', link: r.invitation_link };
        } else if (options.method === 'link') {
          const r = await aiInterviewService.createInviteLink(version.id, {
            candidate_name: c.name,
            candidate_email: email,
            expiry_days: options.expiryDays,
          });
          result = { ...base, status: 'sent', link: r.link };
        } else {
          const r = await aiInterviewService.inviteCandidate(version.id, {
            candidate_name: c.name,
            candidate_email: email,
            resume_id: c.resumeId,
            custom_message: message,
            expiry_days: options.expiryDays,
            base_url: baseUrl,
          });
          result = { ...base, status: 'sent', link: r.interview_link };
        }
      } catch (err) {
        result = { ...base, ...classifyError(err) };
      }
    }
    results.push(result);
    onProgress?.(results.length, candidates.length, result);
  }
  return results;
}

/* ── Browse all assessments ──────────────────────────────────────────── */

/**
 * "Browse all assessments instead": every ACTIVE assessment across all jobs —
 * the original Job Details browse list, rule for rule: published, not
 * archived, not revoked (a revoked assessment is sealed against new invites),
 * each once. The rows are the API's own, for the shared AssessmentPicker.
 */
export async function loadBrowseAssessments(): Promise<AssessmentResponse[]> {
  const all = await listAllAssessments({ status: 'published' });
  const revokedIds = getLocallyRevokedAssessmentIds();
  const seen = new Set<string>();
  return all
    .filter((a) => ['published', 'active'].includes(String(a.status || '').toLowerCase()))
    .filter((a) => !(a as { is_archived?: boolean }).is_archived && !isAssessmentRevoked(a, revokedIds))
    .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
}
