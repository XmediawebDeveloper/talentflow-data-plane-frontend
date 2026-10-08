/**
 * Resume Scoring → "create the assessment / AI interview first" → back to
 * Resume Scoring → invite.
 *
 * Inviting needs a published AI Assessment / a live AI Interview for the job.
 * When the job has none, Resume Scoring offers to create it. Before leaving,
 * the selection and what the recruiter was about to do are saved here; the
 * creation flow carries `from=resume-scoring` + `returnUrl` (so its
 * breadcrumb starts at Resume Scoring and its last step leads back), and on
 * return Resume Scoring reads this, puts the selection back and opens the
 * invite for those candidates.
 *
 * The URL (`?resume_invite=1`) says "came back from a create"; this record
 * says what to restore. sessionStorage: per tab, gone with the tab.
 */

export type InviteHandoffKind = 'assessment' | 'interview';

export interface InviteHandoff {
  kind: InviteHandoffKind;
  /** The JD (version) id the invite is for. */
  jdId: string;
  jdCode?: string;
  jdTitle: string;
  /** Score-row ids the invite goes to. */
  scoreIds: string[];
  /** How many people that is (a person can have several rows). */
  candidateCount: number;
  /** Which view to come back to, and its exact ticks. */
  view: 'job' | 'candidates';
  selectedJobKeys?: string[];
  partialJobRows?: Record<string, string[]>;
  selectedScoredResumes?: string[];
  createdAt: number;
}

const KEY = 'resumeScoringInviteHandoff';
/** A hand-off older than this is stale — a forgotten tab, not a flow. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export const RESUME_INVITE_PARAM = 'resume_invite';
export const RESUME_SCORING_RETURN_URL = `/recruitment/resume-scoring?${RESUME_INVITE_PARAM}=1`;

export function saveInviteHandoff(h: Omit<InviteHandoff, 'createdAt'>): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...h, createdAt: Date.now() }));
  } catch {
    /* storage blocked — the flow still works, only the auto-invite is lost */
  }
}

export function readInviteHandoff(): InviteHandoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const h = JSON.parse(raw) as InviteHandoff;
    if (!h?.jdId || !h.kind || Date.now() - (h.createdAt || 0) > MAX_AGE_MS) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return h;
  } catch {
    return null;
  }
}

export function clearInviteHandoff(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** The create page for `kind`, opened for this JD, returning to Resume Scoring. */
export function buildCreateUrl(kind: InviteHandoffKind, jd: { id: string; title?: string }): string {
  const p = new URLSearchParams({ jd_id: jd.id, from: 'resume-scoring', returnUrl: RESUME_SCORING_RETURN_URL });
  if (kind === 'assessment') {
    p.set('step', 'configure');
    if (jd.title) p.set('jd_title', jd.title);
    return `/recruitment/assessments/create?${p.toString()}`;
  }
  return `/recruitment/ai-interviews/jd-selection/ai-interview-config?${p.toString()}`;
}

/** A `returnUrl` is followed only when it is this app's Resume Scoring page. */
export function safeResumeScoringReturnUrl(url: string | null | undefined): string {
  return url && url.startsWith('/recruitment/resume-scoring') ? url : RESUME_SCORING_RETURN_URL;
}

/** "Continue — invite 3 candidates" for the creation flow's last screen. */
export function handoffContinueLabel(): string {
  const h = typeof window !== 'undefined' ? readInviteHandoff() : null;
  const n = h?.candidateCount ?? 0;
  return n > 0 ? `Continue — invite ${n} candidate${n === 1 ? '' : 's'}` : 'Continue to Resume Scoring';
}
