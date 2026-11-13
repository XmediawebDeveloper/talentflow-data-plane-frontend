/**
 * Create / Send at scale — the three backend APIs behind Job Details' Create /
 * Send popup when it lists the job's own candidates (AI Talent Match + Scored
 * Resumes) or the tenant's resume database (My Resumes / Shared Database —
 * the share step's "Select From"): one server-paged, filterable list; one
 * background send job; its progress and per-candidate results.
 *
 * Backend: app/routers/bulk_invites.py (+ app/services/bulk_invite.py).
 */
import api, { handleApiError } from './api';

/** The picker's tabs: the job's two lists, then the resume database. */
export type InviteCandidateSourceTab = 'talent-match' | 'score-resume' | 'my-resumes' | 'internal-db';
export type BulkInviteKind = 'assessment' | 'interview';
export type ServerMatchStatus = 'exact_match' | 'partial_match' | 'no_match';
export type InviteCandidateSort = 'best' | 'score' | 'rating' | 'name' | 'recent';

export interface InviteCandidateFilters {
  search?: string;
  match_status?: ServerMatchStatus;
  /** true = scored only, false = not scored only, undefined = both. */
  scored?: boolean;
  min_rating?: number;
  min_score?: number;
  /** Leave out candidates this version already has an invitation for. */
  exclude_invited?: boolean;
  /** My Resumes only: one of the user's folders. */
  folder_id?: string;
  sort?: InviteCandidateSort;
}

export interface ServerInviteCandidate {
  resume_id: string;
  name: string;
  email: string;
  phone: string;
  /** The resume's current title, when parsed. */
  title?: string | null;
  source: InviteCandidateSourceTab;
  /** AI Talent Match rating 1–10, when matched. */
  rating: number | null;
  match_score: number | null;
  /** The latest resume score for this job, or null when never scored. */
  score: { percent: number; match_status: ServerMatchStatus; scored_at: string | null } | null;
  already_invited: boolean;
  /** Scored Resumes only: the resume has since been archived — the server's
   *  other sources never list an archived resume in the first place, so this
   *  stays undefined (falsy) there. */
  archived?: boolean;
  /** This email belongs to an existing team member — never invitable, the
   *  same lockout Resume Database / AI Talent Match show. */
  is_tenant_user_email?: boolean;
  /** This resume's version and how many the candidate has, when the server sends them. */
  version?: number | null;
  version_count?: number | null;
}

export interface InviteCandidatesPage {
  items: ServerInviteCandidate[];
  /** Rows matching the current source + filters. */
  total: number;
  page: number;
  page_size: number;
  /** Unfiltered rows per source — the tab badges. */
  counts: Record<InviteCandidateSourceTab, number>;
}

export type BulkInviteSelection =
  | { mode: 'ids'; resume_ids: string[] }
  | ({ mode: 'filter'; source: InviteCandidateSourceTab; exclude_ids: string[] } & InviteCandidateFilters);

/** A candidate typed in (or read from a sheet), or ticked on the page that
 *  opened the popup (then with its resume and the list it was ticked on). */
export interface BulkExtraCandidate { name: string; email: string; phone?: string; resume_id?: string; invite_source?: string }

export interface BulkInviteRequest {
  kind: BulkInviteKind;
  version_id: string;
  selection: BulkInviteSelection;
  extra_candidates?: BulkExtraCandidate[];
  delivery?: 'email' | 'link';
  message?: string;
  expiry_days?: number;
  base_url?: string;
  /** How the send is named in the progress widget, kept on the server so
   *  any browser shows it. */
  jd_code?: string;
  job_version?: number;
  version_number?: number;
}

/** The popup's Review step: the send as it stands, plus the rows unticked there. */
export interface BulkInviteReviewRequest {
  kind: BulkInviteKind;
  version_id: string;
  selection: BulkInviteSelection;
  extra_candidates?: BulkExtraCandidate[];
  /** `key`s of the rows unticked in the review. */
  left_out?: string[];
  view?: BulkInviteReviewStatus | 'all';
  group?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export type BulkInviteReviewStatus = 'invite' | 'skipped' | 'left_out';

export interface BulkInviteReviewRow {
  /** The resume, else `email:<address>` — what `left_out` takes. */
  key: string;
  resume_id: string | null;
  name: string;
  email: string;
  /** From a list's selection, or an extra (page-ticked / typed / Excel). */
  origin: 'list' | 'extra';
  source: InviteCandidateSourceTab | 'extra';
  /** Where the row came from, as shown (AI Talent Match, Manual, …). */
  group: string;
  status: BulkInviteReviewStatus;
  reason: string | null;
}

export interface BulkInviteReviewPage {
  items: BulkInviteReviewRow[];
  /** Rows matching view + group + search. */
  total: number;
  page: number;
  page_size: number;
  /** The whole send, by status. */
  counts: { all: number } & Record<BulkInviteReviewStatus, number>;
  groups: { label: string; count: number }[];
}

export type BulkInviteJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled' | 'paused';
export type BulkInviteItemStatus = 'queued' | 'processing' | 'sent' | 'skipped' | 'failed';

export interface BulkInviteJob {
  job_id: string;
  jd_id: string;
  kind: BulkInviteKind;
  version_id: string;
  version_label: string | null;
  delivery: 'email' | 'link';
  status: BulkInviteJobStatus;
  total: number;
  sent: number;
  skipped: number;
  failed: number;
  processed: number;
  remaining: number;
  error_message: string | null;
  created_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  /** Only on the start response: rows the worker will actually send. */
  queued?: number;
  /** 'resend': a fresh link to existing invites (bulk Resend). */
  mode?: 'invite' | 'resend';
  /** Names kept on the send (any browser can show them). */
  jd_code?: string | null;
  jd_title?: string | null;
  job_version?: number | null;
  version_number?: number | null;
  sender_name?: string | null;
  user_id?: string;
  expiry_days?: number | null;
  /** Why it is paused ('mail_down' | 'version' | 'access' | 'stalled') and the sentence shown. */
  paused_kind?: string | null;
  paused_reason?: string | null;
  /** Live state from the server. */
  processing?: number;
  is_sending?: boolean;
  waiting_turn?: boolean;
  stalled?: boolean;
  eta_seconds?: number | null;
  retryable_failed?: number;
  cancelled_unsent?: number;
  /** This user may cancel / retry / edit / resume it. */
  can_manage?: boolean;
  can_resume?: boolean;
}

export interface BulkInviteResultRow {
  id: string;
  resume_id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  source: InviteCandidateSourceTab | 'extra' | null;
  invite_source: string | null;
  status: BulkInviteItemStatus;
  reason: string | null;
  link: string | null;
  invitation_id: string | null;
  processed_at: string | null;
  /** Retry would send it again unchanged (a mail hiccup, or cancelled). */
  can_retry?: boolean;
  /** Still waiting in the queue — Cancel stops just this candidate. */
  can_cancel?: boolean;
  /** Edit can fix it (wrong / missing address, failed). */
  can_edit?: boolean;
  /** Edit & send: the address before it was corrected, by whom, when. */
  original_email?: string | null;
  edited_by_name?: string | null;
  edited_at?: string | null;
  attempts?: number;
}

export interface BulkInviteResultsPage {
  job: BulkInviteJob;
  items: BulkInviteResultRow[];
  total: number;
  page: number;
  page_size: number;
}

export const SERVER_MATCH_LABEL: Record<ServerMatchStatus, string> = {
  exact_match: 'Exact Match',
  partial_match: 'Partial Match',
  no_match: 'No Match',
};

/** The API error with its HTTP status kept (a 404 means the send is gone). */
export type BulkInviteApiError = Error & { status?: number };
const apiError = (error: unknown): BulkInviteApiError => {
  const e: BulkInviteApiError = new Error(handleApiError(error));
  e.status = (error as { response?: { status?: number } })?.response?.status;
  return e;
};

export const bulkInviteService = {
  async listCandidates(
    jdId: string,
    params: InviteCandidateFilters & {
      source: InviteCandidateSourceTab;
      kind: BulkInviteKind;
      version_id?: string | null;
      page?: number;
      page_size?: number;
    },
    signal?: AbortSignal,
  ): Promise<InviteCandidatesPage> {
    try {
      const { version_id, ...rest } = params;
      const response = await api.get<InviteCandidatesPage>(`/jd/${jdId}/invite-candidates`, {
        params: { ...rest, version_id: version_id || undefined },
        signal,
        // Each page is its own request; the shared-GET dedupe would hand a
        // second tab the first tab's page.
        dedupe: false,
      });
      return response.data;
    } catch (error) {
      throw apiError(error);
    }
  },

  async start(jdId: string, body: BulkInviteRequest): Promise<BulkInviteJob> {
    try {
      const response = await api.post<BulkInviteJob>(`/jd/${jdId}/bulk-invites`, {
        ...body,
        base_url: body.base_url ?? (typeof window !== 'undefined' ? window.location.origin : undefined),
      });
      return response.data;
    } catch (error) {
      throw apiError(error);
    }
  },

  /** What Send would do, row by row — nothing is sent. */
  async review(jdId: string, body: BulkInviteReviewRequest, signal?: AbortSignal): Promise<BulkInviteReviewPage> {
    try {
      const response = await api.post<BulkInviteReviewPage>(`/jd/${jdId}/bulk-invites/review`, body, { signal });
      return response.data;
    } catch (error) {
      throw apiError(error);
    }
  },

  async listForJd(jdId: string, params?: { limit?: number; active_only?: boolean }): Promise<BulkInviteJob[]> {
    try {
      const response = await api.get<{ items: BulkInviteJob[] }>(`/jd/${jdId}/bulk-invites`, { params });
      return response.data.items || [];
    } catch (error) {
      throw apiError(error);
    }
  },

  async get(jobId: string, signal?: AbortSignal): Promise<BulkInviteJob> {
    try {
      const response = await api.get<BulkInviteJob>(`/bulk-invites/${jobId}`, { signal, dedupe: false });
      return response.data;
    } catch (error) {
      throw apiError(error);
    }
  },

  async results(
    jobId: string,
    params?: { status?: BulkInviteItemStatus | 'remaining'; search?: string; page?: number; page_size?: number; actionable?: boolean },
    signal?: AbortSignal,
  ): Promise<BulkInviteResultsPage> {
    try {
      const response = await api.get<BulkInviteResultsPage>(`/bulk-invites/${jobId}/results`, {
        params,
        signal,
        dedupe: false,
      });
      return response.data;
    } catch (error) {
      throw apiError(error);
    }
  },

  /** My sends of the last day, plus any still running or paused — the
   *  progress widget on any browser. */
  async mine(): Promise<BulkInviteJob[]> {
    try {
      const response = await api.get<{ items: BulkInviteJob[] }>('/bulk-invites/mine', { dedupe: false });
      return response.data.items || [];
    } catch (error) {
      throw apiError(error);
    }
  },

  /** Failed (fixable by retrying) and cancelled candidates back into the same
   *  send. No ids: all of them. */
  async retry(jobId: string, itemIds?: string[]): Promise<BulkInviteJob & { requeued: number }> {
    try {
      const response = await api.post<BulkInviteJob & { requeued: number }>(`/bulk-invites/${jobId}/retry`, { item_ids: itemIds?.length ? itemIds : undefined });
      return response.data;
    } catch (error) {
      throw apiError(error);
    }
  },

  /** Edit one candidate and send them (the invite only, never the resume). */
  async editItem(jobId: string, itemId: string, body: { name: string; email: string; phone?: string }): Promise<{ job: BulkInviteJob; item: BulkInviteResultRow }> {
    try {
      const response = await api.patch<{ job: BulkInviteJob; item: BulkInviteResultRow }>(`/bulk-invites/${jobId}/items/${itemId}`, body);
      return response.data;
    } catch (error) {
      throw apiError(error);
    }
  },

  async resume(jobId: string): Promise<BulkInviteJob> {
    try {
      const response = await api.post<BulkInviteJob>(`/bulk-invites/${jobId}/resume`);
      return response.data;
    } catch (error) {
      throw apiError(error);
    }
  },

  /** Bulk Resend from the invite lists: one background send per version. */
  async resend(kind: BulkInviteKind, invitationIds: string[]): Promise<BulkInviteJob[]> {
    try {
      const response = await api.post<{ items: BulkInviteJob[] }>('/bulk-invites/resend', {
        kind,
        invitation_ids: invitationIds,
        base_url: typeof window !== 'undefined' ? window.location.origin : undefined,
      });
      return response.data.items || [];
    } catch (error) {
      throw apiError(error);
    }
  },

  /** Cancel ONE candidate still waiting in the queue; the rest carry on. */
  async cancelItem(jobId: string, itemId: string): Promise<{ job: BulkInviteJob; item: BulkInviteResultRow | null }> {
    try {
      const response = await api.post<{ job: BulkInviteJob; item: BulkInviteResultRow | null }>(`/bulk-invites/${jobId}/items/${itemId}/cancel`);
      return response.data;
    } catch (error) {
      throw apiError(error);
    }
  },

  async cancel(jobId: string): Promise<BulkInviteJob> {
    try {
      const response = await api.post<BulkInviteJob>(`/bulk-invites/${jobId}/cancel`);
      return response.data;
    } catch (error) {
      throw apiError(error);
    }
  },
};

/** A run still being worked through. */
export const isBulkInviteActive = (job: Pick<BulkInviteJob, 'status'>) =>
  job.status === 'queued' || job.status === 'running';

/** Needs someone to look: paused, stopped moving, stopped with an error, or
 *  finished with failures. */
export const bulkInviteNeedsLook = (job: Pick<BulkInviteJob, 'status' | 'failed' | 'stalled'>) =>
  job.status === 'paused' || job.status === 'failed' || !!job.stalled || (job.failed ?? 0) > 0;

/** "about 14 min left" / "less than a minute left". */
export const formatTimeLeft = (seconds?: number | null): string | null => {
  if (seconds == null || seconds <= 0) return null;
  if (seconds < 60) return 'less than a minute left';
  const min = Math.round(seconds / 60);
  if (min < 60) return `about ${min} min left`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `about ${h} h${m ? ` ${m} min` : ''} left`;
};
