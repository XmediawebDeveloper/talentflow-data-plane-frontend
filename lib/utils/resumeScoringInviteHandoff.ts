import { useMemo, useSyncExternalStore } from 'react';

/**
 * Resume Scoring / AI Talent Match → "create the assessment / AI interview
 * first" → back to where it started → invite.
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
 *
 * AI Talent Match runs the same round trip with `from=ai-talent-match`: the
 * record's `source` says which page started it (and so which page finishes
 * it), and the create pages name that page in their breadcrumb.
 */

export type InviteHandoffKind = 'assessment' | 'interview';

/** The page a create → invite round trip starts from (and returns to). */
export type InviteHandoffSource = 'resume-scoring' | 'ai-talent-match';

const SOURCES: Record<InviteHandoffSource, { label: string; path: string }> = {
  'resume-scoring': { label: 'Resume Scoring', path: '/recruitment/resume-scoring' },
  'ai-talent-match': { label: 'AI Talent Match', path: '/recruitment/ai-talent-match' },
};

export interface InviteHandoff {
  kind: InviteHandoffKind;
  /** Which page started it — absent on records saved before AI Talent Match
   *  had the flow, which were all Resume Scoring's. */
  source?: InviteHandoffSource;
  /** The JD (version) id the invite is for. */
  jdId: string;
  jdCode?: string;
  jdTitle: string;
  /** Score-row ids the invite goes to (AI Talent Match: candidate-row keys). */
  scoreIds: string[];
  /** How many people that is (a person can have several rows). */
  candidateCount: number;
  /** Which view to come back to, and its exact ticks. */
  view: 'job' | 'candidates' | 'results';
  selectedJobKeys?: string[];
  /** AI Talent Match: the rating pill that was on ('exact' / 'partial' /
   *  'no_match'), so the rows picked come back under the same filter. */
  ratingBand?: string | null;
  partialJobRows?: Record<string, string[]>;
  selectedScoredResumes?: string[];
  /**
   * Where the flow started: the landing page's bulk Actions ('list', the
   * default) or one candidate's scoring page ('detail'). A 'detail' hand-off
   * is finished by CandidateScoringDetailPage itself — the landing page
   * leaves it alone — and the create pages' breadcrumb names the candidate.
   */
  origin?: 'list' | 'detail';
  /** 'detail' only: the candidate's name. 'detail' (and AI Talent Match's
   *  results page): the page to come back to. */
  candidateName?: string;
  returnUrl?: string;
  createdAt: number;
}

const KEY = 'resumeScoringInviteHandoff';
/** A hand-off older than this is stale — a forgotten tab, not a flow. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export const RESUME_INVITE_PARAM = 'resume_invite';
export const RESUME_SCORING_RETURN_URL = `/recruitment/resume-scoring?${RESUME_INVITE_PARAM}=1`;
export const AI_TALENT_MATCH_RETURN_URL = `/recruitment/ai-talent-match?${RESUME_INVITE_PARAM}=1`;

/** The page's default "came back from a create" URL. */
export function inviteHandoffReturnUrl(source: InviteHandoffSource): string {
  return `${SOURCES[source].path}?${RESUME_INVITE_PARAM}=1`;
}

/** The create pages' `from` value, when it names a round-trip origin. */
export function readInviteHandoffSource(from: string | null | undefined): InviteHandoffSource | null {
  return from === 'resume-scoring' || from === 'ai-talent-match' ? from : null;
}

/* Other in-app pages a round trip may come back to: AI Talent Match opens
   a candidate on the resume page (`resumeNavSource = 'ai-talent-match'`),
   whose Invite runs the same create -> come back -> invite flow. */
const EXTRA_RETURN_PATHS: Record<InviteHandoffSource, string[]> = {
  'resume-scoring': [],
  'ai-talent-match': ['/recruitment/resume-view/'],
};

/** A `returnUrl` is followed only when it is that origin's own page (or one
 *  of the in-app pages it opens a candidate on). */
export function safeInviteReturnUrl(url: string | null | undefined, source: InviteHandoffSource): string {
  const allowed = [SOURCES[source].path, ...EXTRA_RETURN_PATHS[source]];
  return url && allowed.some(p => url.startsWith(p)) ? url : inviteHandoffReturnUrl(source);
}

export interface InviteHandoffOrigin {
  source: InviteHandoffSource;
  /** "Resume Scoring" / "AI Talent Match" — the breadcrumb's second crumb. */
  label: string;
  /** The page's plain URL (no return marker). */
  path: string;
  /** Where to go back to — the validated `returnUrl`. */
  returnUrl: string;
  /** `&from=…&returnUrl=…`, for every in-flow URL rewrite. */
  query: string;
}

/**
 * What a create page needs to know about the page that sent it, read from
 * its own `from` / `returnUrl` query params — or null for any other entry.
 */
export function resolveInviteHandoffOrigin(
  from: string | null | undefined,
  returnUrl: string | null | undefined,
): InviteHandoffOrigin | null {
  const source = readInviteHandoffSource(from);
  if (!source) return null;
  const back = safeInviteReturnUrl(returnUrl, source);
  return {
    source,
    label: SOURCES[source].label,
    path: SOURCES[source].path,
    returnUrl: back,
    query: `&from=${source}&returnUrl=${encodeURIComponent(back)}`,
  };
}

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

/** The create page for `kind`, opened for this JD, returning to `source`
 *  (Resume Scoring by default) — or to `returnUrl`, a URL on that page such
 *  as one candidate's. */
export function buildCreateUrl(
  kind: InviteHandoffKind,
  jd: { id: string; title?: string },
  returnUrl?: string,
  source: InviteHandoffSource = 'resume-scoring',
): string {
  const p = new URLSearchParams({ jd_id: jd.id, from: source, returnUrl: safeInviteReturnUrl(returnUrl, source) });
  if (kind === 'assessment') {
    p.set('step', 'configure');
    if (jd.title) p.set('jd_title', jd.title);
    return `/recruitment/assessments/create?${p.toString()}`;
  }
  return `/recruitment/ai-interviews/jd-selection/ai-interview-config?${p.toString()}`;
}

/** A `returnUrl` is followed only when it is this app's Resume Scoring page. */
export function safeResumeScoringReturnUrl(url: string | null | undefined): string {
  return safeInviteReturnUrl(url, 'resume-scoring');
}

/** The current page's URL with the "came back from a create" marker added. */
export function withResumeInviteMarker(pathAndQuery: string): string {
  const [path, query = ''] = pathAndQuery.split('?');
  const p = new URLSearchParams(query);
  p.set(RESUME_INVITE_PARAM, '1');
  return `${path}?${p.toString()}`;
}

/**
 * The candidate crumb for the create pages' trail when the flow was started
 * from one candidate's page — `Dashboard › Resume Scoring › <candidate> ›
 * Create …` — or null. Read after mount (sessionStorage is client-only), so
 * the server render and the first client render agree.
 */
export function useHandoffCandidateCrumb(): { label: string; href: string } | null {
  // Snapshot = the raw stored string (stable between reads); the server
  // snapshot is null, so the server and the first client render agree.
  const raw = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return sessionStorage.getItem(KEY);
      } catch {
        return null;
      }
    },
    () => null,
  );
  return useMemo(() => {
    if (!raw) return null;
    const h = readInviteHandoff();
    return h?.origin === 'detail' && h.returnUrl
      ? { label: h.candidateName || 'Candidate', href: safeInviteReturnUrl(h.returnUrl, h.source ?? 'resume-scoring') }
      : null;
  }, [raw]);
}

/** "Continue — invite 3 candidates" for the creation flow's last screen. */
export function handoffContinueLabel(): string {
  const h = typeof window !== 'undefined' ? readInviteHandoff() : null;
  const n = h?.candidateCount ?? 0;
  return n > 0
    ? `Continue — invite ${n} candidate${n === 1 ? '' : 's'}`
    : `Continue to ${SOURCES[h?.source ?? 'resume-scoring'].label}`;
}
