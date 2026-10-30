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

export type BulkInviteJobStatus ='queued' | 'running' | 'done' | 'failed' | 'cancelled';
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
      throw new Error(handleApiError(error));
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
      throw new Error(handleApiError(error));
    }
  },

  /** What Send would do, row by row — nothing is sent. */
  async review(jdId: string, body: BulkInviteReviewRequest, signal?: AbortSignal): Promise<BulkInviteReviewPage> {
    try {
      const response = await api.post<BulkInviteReviewPage>(`/jd/${jdId}/bulk-invites/review`, body, { signal });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  async listForJd(jdId: string, params?: { limit?: number; active_only?: boolean }): Promise<BulkInviteJob[]> {
    try {
      const response = await api.get<{ items: BulkInviteJob[] }>(`/jd/${jdId}/bulk-invites`, { params });
      return response.data.items || [];
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  async get(jobId: string, signal?: AbortSignal): Promise<BulkInviteJob> {
    try {
      const response = await api.get<BulkInviteJob>(`/bulk-invites/${jobId}`, { signal, dedupe: false });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  async results(
    jobId: string,
    params?: { status?: BulkInviteItemStatus; search?: string; page?: number; page_size?: number },
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
      throw new Error(handleApiError(error));
    }
  },

  async cancel(jobId: string): Promise<BulkInviteJob> {
    try {
      const response = await api.post<BulkInviteJob>(`/bulk-invites/${jobId}/cancel`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },
};

/** A run still being worked through. */
export const isBulkInviteActive = (job: Pick<BulkInviteJob, 'status'>) =>
  job.status === 'queued' || job.status === 'running';
