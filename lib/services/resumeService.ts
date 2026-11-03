/**
 * Resume Service
 */

import api, { handleApiError, dispatchUnitsConsumed } from './api';

/* Fired after any write that changes how many resumes a folder or pool holds
   — archive, unarchive, move, delete. Count badges live in several places
   (the Resume Database tab strip, the folder tree, All Resumes) and only some
   of them belong to the component that made the change, so they listen for
   this instead of each caller having to know about all of them. Bulk actions
   call the service once per resume; the timer folds that burst into one
   event so listeners refetch once. */
export const RESUMES_CHANGED_EVENT = 'resumes-changed';
let resumesChangedTimer: ReturnType<typeof setTimeout> | null = null;
export function dispatchResumesChanged() {
  if (typeof window === 'undefined') return;
  if (resumesChangedTimer) clearTimeout(resumesChangedTimer);
  resumesChangedTimer = setTimeout(() => {
    resumesChangedTimer = null;
    window.dispatchEvent(new CustomEvent(RESUMES_CHANGED_EVENT));
  }, 250);
}

/** GET /resumes/{id}/activity — see app/services/resume_activity.py. */
export interface ResumeActivitySection<T> {
  allowed: boolean;
  items: T[];
  error?: boolean;
}

export interface ResumeActivityScore {
  id: string;
  jd_id: string;
  jd_title: string | null;
  jd_job_id: string | null;
  jd_status: string | null;
  resume_id: string;
  resume_version: number;
  overall_score: number;
  overall_rating_10: number | null;
  match_status: string;
  run_count: number;
  scored_by_name: string;
  created_at: string | null;
}

export interface ResumeActivityTalentMatch {
  id: string;
  session_id: string;
  jd_id: string | null;
  jd_title: string | null;
  jd_job_id: string | null;
  resume_id: string;
  resume_version: number;
  final_score: number | null;
  status: string;
  /** This resume version has been scored against this job in Resume Scoring. */
  scored: boolean;
  run_by_name: string;
  created_at: string | null;
}

export interface ResumeActivityAssessment {
  id: string;
  assessment_id: string | null;
  assessment_title: string | null;
  assessment_deleted: boolean;
  attempt_id: string | null;
  candidate_display_id: string | null;
  resume_version: number | null;
  linked_by: 'resume' | 'email';
  status: string;
  score: number | null;
  passed: boolean | null;
  /** Section scores (%) — null when the section is off or not scored yet. */
  technical_score: number | null;
  coding_score: number | null;
  hiring_recommendation: string | null;
  integrity_status: string | null;
  invited_by_name: string | null;
  invited_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
}

export interface ResumeActivityInterview {
  id: string;
  config_id: string;
  config_display_id: string | null;
  title: string | null;
  display_id: string | null;
  resume_version: number | null;
  linked_by: 'resume' | 'email';
  status: string;
  ai_evaluation: Record<string, any>;
  risk_level: string | null;
  invited_by_name: string | null;
  invited_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
}

export interface ResumeActivity {
  resume_id: string;
  candidate_email: string | null;
  version_count: number;
  scores: ResumeActivitySection<ResumeActivityScore>;
  talent_matches: ResumeActivitySection<ResumeActivityTalentMatch>;
  assessments: ResumeActivitySection<ResumeActivityAssessment>;
  interviews: ResumeActivitySection<ResumeActivityInterview>;
}

export interface Resume {
  // NOTE: tenant_id / uploaded_by / file_name / version / version_count /
  // certifications are optional because this interface doubles as the type for the
  // camelCase UI view-models the recruitment pages build (see lib/types/types.ts,
  // which re-exports it). Those view-models never carry these backend-only fields.
  // Responses from the API itself always populate them.
  id: string;
  tenant_id?: string;
  uploaded_by?: string;
  uploaded_by_name?: string;
  folder_id?: string;
  folder_name?: string;
  candidate_name?: string;
  candidate_email?: string;  // Backend uses candidate_email
  email?: string;  // Alias for candidate_email
  phone?: string;
  current_title?: string;
  current_company?: string;
  previous_company?: string;
  skills: string[];
  technical_skills?: string[];
  soft_skills?: string[];
  // Education / experience come back from the backend in two shapes depending on
  // endpoint: a normalized array (used by list endpoints) and a richer "_details"
  // structure used by the candidate detail view. Legacy mock data also uses a
  // single string label (e.g. "Bachelor's Degree"); the union covers both.
  education: any[] | string;
  education_details?: any[];
  experience: any[] | string;
  experience_details?: any[];
  experience_years?: number;
  // Total experience in whole months — computed server-side the same way the
  // scorer computes it (overlapping roles merged, both boundary months
  // counted), so it never goes stale against a role still marked "Present"
  // the way a stored decimal would. Prefer this over experience_years for display.
  experience_months?: number;
  certifications?: any[];
  languages?: any[];
  location?: string;
  notice_period?: string;
  professional_summary?: string;
  extracted_text?: string;  // Full extracted content from resume
  file_name?: string;
  file_size?: number;  // In bytes
  file_size_kb?: number;
  file_type?: string;
  /**
   * Resume origin. The backend uses snake_case codes (manual_upload, bulk_upload,
   * api_import, ai_match); legacy UI/mock data still uses 'Manual' | 'TalentFlow'.
   * Both are accepted here so the shared `Resume` type covers transitional code.
   */
  source: 'manual_upload' | 'bulk_upload' | 'api_import' | 'ai_match' | 'Manual' | 'TalentFlow';
  version?: number;
  version_count?: number;  // Total versions for this candidate
  versions?: ResumeVersion[];   // Inline version history (populated by detail endpoints)
  is_duplicate?: boolean;
  is_archived?: boolean;  // Whether resume is archived
  archived_at?: string;  // When resume was archived
  // True when candidate_email matches an existing tenant team member's login
  // email. Uploads are blocked at the source now; this flags resumes stored
  // before that restriction existed so the UI can grey them out.
  is_tenant_user_email?: boolean;
  // Team assignment (recruiter id) — surfaced on internal-DB and my-resumes lists
  assigned_to?: string;
  created_at?: string;
  updated_at?: string;
  // Additional sections (snake_case from backend)
  projects?: any[];
  publications?: any[];
  awards?: any[];
  hobbies?: any[];
  references?: any[];
  volunteer_experience?: any[];
  achievements?: any[];
  // Social/Portfolio Links (snake_case from backend)
  linkedin_url?: string;
  github_url?: string;
  portfolio_url?: string;
  // Additional content
  objective?: string;
  additional_info?: string;

  // ---------------------------------------------------------------------------
  // CamelCase aliases — kept optional for backwards compatibility with older UI
  // code paths. New code should prefer the snake_case fields above. These will
  // be removed once the consumer sweep is complete.
  // ---------------------------------------------------------------------------
  /** @deprecated use candidate_name */
  candidateName?: string;
  /** @deprecated use candidate_name (legacy UI alias) */
  name?: string;
  /** @deprecated use current_title */
  title?: string;
  /** @deprecated use current_company */
  currentCompany?: string;
  /** @deprecated use previous_company */
  previousCompany?: string;
  /** @deprecated use notice_period */
  noticePeriod?: string;
  /** @deprecated use created_at */
  uploadDate?: string;
  /** @deprecated use updated_at */
  lastUpdated?: string;
  /** @deprecated use uploaded_by_name */
  uploadedBy?: string;
  /** @deprecated use folder_id */
  folderId?: string;
  /** @deprecated use version_count */
  versionCount?: number;
  /** @deprecated use assigned_to */
  assignedTo?: string;
  /** @deprecated use file_name */
  fileName?: string;
  /** @deprecated use file_type */
  fileType?: string;
  /** @deprecated use file_size_kb */
  fileSizeKb?: number;
  /** @deprecated use is_archived */
  isArchived?: boolean;
  /** @deprecated use archived_at */
  archivedAt?: string;
  /** @deprecated use is_tenant_user_email */
  isTenantUserEmail?: boolean;
  /** @deprecated use professional_summary */
  professionalSummary?: string;
  /** @deprecated use technical_skills */
  technicalSkills?: string[];
  /** @deprecated use soft_skills */
  softSkills?: string[];
  /** @deprecated use education_details */
  educationDetails?: any[];
  /** @deprecated use experience_details */
  experienceDetails?: any[];
  /** @deprecated use linkedin_url */
  linkedinUrl?: string;
  /** @deprecated use github_url */
  githubUrl?: string;
  /** @deprecated use portfolio_url */
  portfolioUrl?: string;
  /** @deprecated use additional_info */
  additionalInfo?: string;
  /** @deprecated use extracted_text */
  extractedText?: string;
  /** @deprecated use volunteer_experience */
  volunteerExperience?: any[];
  /** Legacy count field present on some list endpoints. */
  attachments?: number;
}

export interface ResumeVersion {
  id: string;
  version: number;
  file_name?: string;
  file_size_kb?: number;
  uploaded_by?: string;
  uploaded_by_name?: string;
  /** Optional because mock data and some legacy endpoints omit it. */
  created_at?: string;
  // Optional: full extracted text for this version (populated by version-detail endpoint)
  extracted_text?: string;
  // Legacy camelCase aliases — see Resume above.
  /** @deprecated use file_name */
  fileName?: string;
  /** @deprecated use created_at */
  uploadDate?: string;
  /** @deprecated use uploaded_by_name */
  uploadedBy?: string;
  /** @deprecated use extracted_text */
  extractedText?: string;
  /** Display name (often candidate name + version) populated by some endpoints. */
  name?: string;
  /** Human-readable file size string ("2.4 MB"). */
  size?: string;
  // Optional per-version snapshot fields produced by detail/version endpoints
  // and used by legacy version-history UI.
  skills?: string[];
  technicalSkills?: string[];
  experience?: any;
  education?: any;
  certifications?: any[];
  currentTitle?: string;
  currentCompany?: string;
  location?: string;
  professionalSummary?: string;
}

export interface ResumeListResponse {
  items: Resume[];
  total: number;
  // Rows actually stored for this view, including superseded versions kept
  // for history - `total` above counts latest versions only.
  total_including_versions?: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface UploadItemStatus {
  file_name: string;
  status: 'pending' | 'processing' | 'completed' | 'duplicated' | 'versioned' | 'error';
  candidate_name?: string;
  error_message?: string;
  existing_location?: string;
  version_info?: string;
  resume_id?: string;
}

export interface UploadBatchResponse {
  id: string;
  batch_name?: string;
  total_files: number;
  completed: number;
  pending: number;
  duplicates: number;
  versions: number;
  errors: number;
  // Items cancelled by the user (batch cancel or per-file cancel). The backend has
  // tracked this since the add_cancelled_to_resume_upload_batches migration and returns
  // it from both batch endpoints (routers/resumes.py); it was simply never declared here,
  // so the three read sites in my-resumes/page.tsx failed to compile. Optional because
  // batches created before that migration predate the column.
  cancelled?: number;
  status: string;
  items: UploadItemStatus[];
  created_at: string;
  completed_at?: string;
}

export interface Folder {
  id: string;
  name: string;
  parent_id?: string;
  resume_count: number;
  children: Folder[];
  created_at: string;
}

export interface ResumeSearchParams {
  source?: 'my-resumes' | 'internal-db';
  folder_id?: string;
  search?: string;
  skills?: string;
  experience_min?: number;
  experience_max?: number;
  location?: string;
  education?: string;
  current_company?: string;
  previous_company?: string;
  notice_period?: string;
  uploaded_by_name?: string;
  upload_date_from?: string;
  upload_date_to?: string;
  source_type?: string;
  page?: number;
  page_size?: number;
  sort_by?: string;
  include_archived?: boolean;
}

export const resumeService = {
  /**
   * List resumes with filters
   */
  async list(params?: ResumeSearchParams): Promise<ResumeListResponse> {
    try {
      const response = await api.get<ResumeListResponse>('/resumes', { params });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Fire-and-forget: ask the backend to reconcile the admin API's RU usage
   * with our actual active resume count. Safe to call on every page mount —
   * the endpoint is idempotent and returns delta=0 when already in sync.
   */
  async reconcileUsage(): Promise<void> {
    try {
      await api.post('/resumes/usage/reconcile');
    } catch {
      // Reconciliation is best-effort; never block the page on it.
    }
  },

  /**
   * Get single resume by ID.
   *
   * `logView` is a no-op now — viewing a resume is no longer recorded in the
   * Audit Log at all, by any caller. The parameter (and the `log_view` query
   * param it sends) is kept only so existing call sites — Resume Details, the
   * scoring detail page's "View Resume" — don't need to change.
   */
  async get(id: string, logView: boolean = false): Promise<Resume> {
    try {
      const response = await api.get<Resume>(`/resumes/${id}`, {
        params: logView ? { log_view: true } : undefined,
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Alias for `get(id)` — kept for legacy call sites that follow the
   * `<entity>Service.getById(id)` convention used by other services.
   */
  async getById(id: string): Promise<Resume> {
    return this.get(id);
  },

  /**
   * Upload single resume (async processing with Celery)
   * Consumes 1 Resume Upload Unit
   *
   * Returns immediately with batch ID, then polls for completion.
   * This eliminates the 2-minute wait time for large files.
   */
  async upload(file: File, folderId?: string): Promise<Resume> {
    const formData = new FormData();
    formData.append('file', file);
    // Only append folder_id if it's provided and not an empty string
    if (folderId && folderId.trim() !== '') {
      formData.append('folder_id', folderId);
    }

    // Call endpoint which returns batch response
    const response = await api.post<UploadBatchResponse>('/resumes/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    const batchId = response.data.id;
    let batch = response.data;

    // If already completed (synchronous upload), skip polling
    if (batch.pending === 0) {
      // Dispatch event to refresh header quota display
      dispatchUnitsConsumed();

      // Check for errors
      if (batch.errors > 0 && batch.items && batch.items.length > 0) {
        const errorItem = batch.items[0];
        throw new Error(errorItem.error_message || 'Failed to process resume');
      }

      // Extract resume from completed batch item
      if (batch.items && batch.items.length > 0) {
        const item = batch.items[0];
        if (item.resume_id) {
          const resume = await this.get(item.resume_id);
          return resume;
        }
      }
    }

    // Poll for completion (max 5 minutes) - only if not already completed
    const maxAttempts = 300; // 300 * 1000ms = 5 minutes
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second

      batch = await this.getBatchStatus(batchId);

      // Check if processing is complete
      if (batch.pending === 0) {
        // Dispatch event to refresh header quota display
        dispatchUnitsConsumed();

        // Check for errors
        if (batch.errors > 0 && batch.items && batch.items.length > 0) {
          const errorItem = batch.items[0];
          throw new Error(errorItem.error_message || 'Failed to process resume');
        }

        // Check for duplicates
        if (batch.duplicates > 0) {
          throw new Error('Duplicate resume detected');
        }

        // Extract resume from completed batch item
        if (batch.items && batch.items.length > 0) {
          const item = batch.items[0];

          // If we have a resume_id, fetch the full resume details
          if (item.resume_id) {
            const resume = await this.get(item.resume_id);
            return resume;
          } else {
            // Construct resume from batch item data
            return {
              id: item.resume_id || '',
              candidate_name: item.candidate_name || file.name.replace(/\.[^/.]+$/, ''),
              file_name: file.name,
              skills: [],
              education: [],
              experience: [],
              certifications: [],
              version: 1,
              version_count: 1,
              is_duplicate: false,
              source: 'manual_upload',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as Resume;
          }
        }

        throw new Error('Resume processed but no data returned');
      }

      attempts++;
    }

    throw new Error('Resume upload timed out after 5 minutes');
  },

  /**
   * Upload multiple resumes
   * Consumes 1 Resume Upload Unit per file
   */
  async uploadBulk(files: File[], folderId?: string): Promise<UploadBatchResponse> {
    try {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('files', file);
      });
      // Only append folder_id if it's provided and not an empty string
      if (folderId && folderId.trim() !== '') {
        formData.append('folder_id', folderId);
      }

      const response = await api.post<UploadBatchResponse>('/resumes/upload/bulk', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      // Dispatch event to refresh header quota display
      dispatchUnitsConsumed();
      dispatchResumesChanged();
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get upload batch status
   */
  async getBatchStatus(batchId: string): Promise<UploadBatchResponse> {
    try {
      const response = await api.get<UploadBatchResponse>(`/resumes/upload/batch/${batchId}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * List all upload batches
   */
  async listUploadBatches(limit: number = 20, onlyProcessing: boolean = false): Promise<any> {
    try {
      const response = await api.get(`/resumes/upload/batches?limit=${limit}&only_processing=${onlyProcessing}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Retry stuck/failed items in a batch.
   * Unit deduction on retry is handled by the backend:
   *   - If a unit was already deducted for this item (e.g. stuck/processing) → unit is NOT charged again
   *   - If no unit was deducted yet (e.g. item failed before charge) → 1 unit IS deducted on retry
   */
  async retryItem(batchId: string, itemId: string): Promise<any> {
    try {
      const response = await api.post(`/resumes/upload/batch/${batchId}/item/${itemId}/retry`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  async cancelItem(batchId: string, itemId: string): Promise<any> {
    try {
      const response = await api.post(`/resumes/upload/batch/${batchId}/item/${itemId}/cancel`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Retry all failed/stuck items in a batch.
   * Same unit deduction logic as retryItem — backend charges only for items
   * that had no unit previously deducted.
   */
  async retryBatchItems(batchId: string): Promise<any> {
    try {
      const response = await api.post(`/resumes/upload/batch/${batchId}/retry`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Cancel all pending items in a batch and refund their units
   */
  async cancelBatch(batchId: string): Promise<any> {
    try {
      const response = await api.post(`/resumes/upload/batch/${batchId}/cancel`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Delete all completed upload batches (where pending = 0)
   */
  async deleteCompletedBatches(): Promise<any> {
    try {
      const response = await api.delete('/resumes/upload/batches/completed');
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Resolve duplicate (for batch uploads)
   */
  async resolveDuplicate(batchItemId: string, action: 'discard' | 'overwrite' | 'version') {
    try {
      const response = await api.post('/resumes/upload/resolve-duplicate', {
        batch_item_id: batchItemId,
        action,
      });
      // 'overwrite'/'version' consume a unit (and 'version' also credits one
      // back for the version it supersedes) — refresh the header immediately
      // rather than leaving it stale until the next unrelated trigger.
      if (action !== 'discard') dispatchUnitsConsumed();
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Resolve duplicate and upload (for single file uploads)
   */
  async resolveDuplicateAndUpload(
    file: File,
    existingResumeId: string,
    action: 'discard' | 'overwrite' | 'version',
    folderId?: string
  ): Promise<Resume> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('existing_resume_id', existingResumeId);
    formData.append('action', action);
    // Only append folder_id if it's provided and not an empty string
    if (folderId && folderId.trim() !== '') {
      formData.append('folder_id', folderId);
    }

    const response = await api.post<Resume>('/resumes/upload/resolve-duplicate-upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    // Same reasoning as resolveDuplicate above.
    if (action !== 'discard') dispatchUnitsConsumed();
    return response.data;
  },

  /**
   * Move resume to folder.
   *
   * `skipAudit` is for the internal move that archive/unarchive makes as a
   * side effect (filing the resume into/out of "Archived Resumes" — see
   * handleArchiveResumes/handleUnarchiveResumes in my-resumes/page.tsx),
   * not a move the recruiter asked for. Without it the audit trail's only
   * row for an archive click was "Resume moved" — the wrong action name —
   * since the archive endpoint itself logs its own "Resume archived" row.
   * A real "Move to folder" call leaves this false and logs normally.
   */
  async move(resumeId: string, folderId?: string, skipAudit = false): Promise<void> {
    try {
      await api.put(`/resumes/${resumeId}/move`, { folder_id: folderId, skip_audit: skipAudit });
      // A move into or out of Archived Resumes also flips the archived flag
      // server-side, so pool totals can change, not just folder badges.
      dispatchResumesChanged();
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Delete resume
   */
  async delete(id: string): Promise<void> {
    try {
      await api.delete(`/resumes/${id}`);
      dispatchUnitsConsumed();
      dispatchResumesChanged();
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get resume versions
   */
  async getVersions(resumeId: string) {
    try {
      const response = await api.get(`/resumes/${resumeId}/versions`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Candidate Activity for the Resume View page: scores, AI Talent Match,
   * AI Assessment and AI Interview invites across all the candidate's
   * versions. Sections the user may not read come back `allowed: false`.
   */
  async getActivity(resumeId: string): Promise<ResumeActivity> {
    try {
      const response = await api.get<ResumeActivity>(`/resumes/${resumeId}/activity`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Download resume
   */
  async download(resumeId: string): Promise<Blob> {
    try {
      const response = await api.get(`/resumes/${resumeId}/download`, {
        responseType: 'blob',
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Preview resume (converts DOCX to PDF for viewing)
   */
  async preview(resumeId: string): Promise<Blob> {
    try {
      const response = await api.get(`/resumes/${resumeId}/preview`, {
        responseType: 'blob',
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Download a specific version of a resume
   */
  async downloadVersion(resumeId: string, versionId: string): Promise<Blob> {
    try {
      const response = await api.get(`/resumes/${resumeId}/versions/${versionId}/download`, {
        responseType: 'blob',
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Share resume via email
   */
  async share(resumeId: string, toEmail: string, customMessage?: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await api.post(`/resumes/${resumeId}/share`, {
        to_email: toEmail,
        custom_message: customMessage,
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Archive or unarchive a resume
   */
  async archive(resumeId: string, isArchived: boolean): Promise<{ message: string; is_archived: boolean }> {
    try {
      const response = await api.put(`/resumes/${resumeId}/archive`, {
        is_archived: isArchived,
      });
      // Archiving/unarchiving moves the resume in or out of RU's active
      // count server-side — refresh the header immediately.
      dispatchUnitsConsumed();
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },
};

export interface FolderDeletionInfo {
  folder_id: string;
  folder_name: string;
  parent_id: string | null;
  direct_resume_count: number;
  subfolder_count: number;
  subfolder_details: { id: string; name: string; resume_count: number }[];
  subfolder_resume_count: number;
  total_resume_count: number;
}

export interface FolderDeleteResult {
  deleted_folders: number;
  moved_resumes: number;
  deleted_resumes: number;
}

export const folderService = {
  /**
   * List all folders.
   *
   * `uploaded_by_name` scopes each folder's `resume_count` to that uploader
   * (same partial match the resume list's own Uploaded By filter uses) — so
   * when that filter is active, a folder's badge equals what opening that
   * folder under the same filter actually lists, instead of staying at the
   * folder's unfiltered total.
   */
  async list(params?: { uploaded_by_name?: string }): Promise<Folder[]> {
    try {
      const response = await api.get<Folder[]>('/folders', { params });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get single folder
   */
  async get(id: string): Promise<Folder> {
    try {
      const response = await api.get<Folder>(`/folders/${id}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get deletion info for a folder (subfolder/resume counts)
   */
  async getDeletionInfo(id: string): Promise<FolderDeletionInfo> {
    try {
      const response = await api.get<FolderDeletionInfo>(`/folders/${id}/deletion-info`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Create folder
   */
  async create(name: string, parentId?: string): Promise<Folder> {
    try {
      console.log('[folderService] Creating folder:', { name, parent_id: parentId });
      const response = await api.post<Folder>('/folders', { name, parent_id: parentId });
      console.log('[folderService] Folder created:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('[folderService] Error creating folder:', error?.response?.data || error);
      throw error; // Re-throw original error to preserve response data
    }
  },

  /**
   * Update folder
   */
  async update(id: string, data: { name?: string; parent_id?: string }): Promise<Folder> {
    try {
      const response = await api.put<Folder>(`/folders/${id}`, data);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Delete folder with optional subfolder/resume handling
   */
  async delete(
    id: string,
    moveResumesTo?: string,
    deleteSubfolders?: boolean,
    deleteResumes?: boolean,
  ): Promise<FolderDeleteResult> {
    try {
      const response = await api.delete<FolderDeleteResult>(`/folders/${id}`, {
        params: {
          move_resumes_to: moveResumesTo,
          delete_subfolders: deleteSubfolders || undefined,
          delete_resumes: deleteResumes || undefined,
        },
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },
};

/* ── The one Archived Resumes folder ─────────────────────────────────────
   Every archive — My Resumes (row, card, bulk), Search Resume, the table's
   own fallback — files the resume into this single top-level folder.

   It used to be created by whichever My Resumes fetch first noticed it
   missing; a browser refresh runs two of those fetches at once, both saw no
   folder, and both created one — the duplicate "Archived Resumes" under
   System Folders. `ensureArchivedFolder` is single-flight (concurrent callers
   share one request) and also heals a tenant that already has duplicates:
   the folder holding the most resumes (oldest on a tie) is kept, and each
   extra one is deleted with its resumes moved into it, so no archived resume
   is left behind in a folder the tree no longer shows. */
export const ARCHIVED_FOLDER_NAME = 'Archived Resumes';
const ARCHIVED_PREV_FOLDER_KEY = 'archivedResumePrevFolder';

export const isArchivedFolder = (f: { name: string; parent_id?: string | null; parentId?: string | null }) =>
  f.name === ARCHIVED_FOLDER_NAME && !f.parent_id && !f.parentId;

let ensureArchivedFolderInFlight: Promise<Folder> | null = null;

export function ensureArchivedFolder(): Promise<Folder> {
  if (!ensureArchivedFolderInFlight) {
    ensureArchivedFolderInFlight = (async () => {
      const all = await folderService.list();
      const archived = all.filter(isArchivedFolder);
      if (archived.length === 0) return folderService.create(ARCHIVED_FOLDER_NAME);
      const [keep, ...extras] = [...archived].sort(
        (a, b) =>
          (b.resume_count || 0) - (a.resume_count || 0) ||
          String(a.created_at).localeCompare(String(b.created_at)),
      );
      for (const extra of extras) {
        try {
          await folderService.delete(extra.id, keep.id);
        } catch (error) {
          console.error('[folderService] Failed to merge duplicate Archived Resumes folder:', error);
        }
      }
      if (extras.length) dispatchResumesChanged();
      return keep;
    })().finally(() => {
      ensureArchivedFolderInFlight = null;
    });
  }
  return ensureArchivedFolderInFlight;
}

/**
 * Archive a resume the same way from anywhere: flag it, file it into the
 * shared Archived Resumes folder, and remember where it came from so
 * Unarchive (My Resumes) can put it back. `fromFolderId` is the folder it sits
 * in now, when the caller knows it.
 */
export async function archiveResumeToArchivedFolder(
  resumeId: string,
  fromFolderId?: string | null,
  archivedFolderId?: string,
): Promise<string> {
  const folderId = archivedFolderId ?? (await ensureArchivedFolder()).id;
  if (fromFolderId && fromFolderId !== folderId) {
    try {
      const stash = JSON.parse(localStorage.getItem(ARCHIVED_PREV_FOLDER_KEY) || '{}');
      stash[resumeId] = fromFolderId;
      localStorage.setItem(ARCHIVED_PREV_FOLDER_KEY, JSON.stringify(stash));
    } catch {
      // localStorage unavailable / quota — unarchive will default to Root.
    }
  }
  // skipAudit on the move: the archive endpoint logs "Resume archived"
  // itself; this filing move is a side effect, not a folder move.
  await resumeService.archive(resumeId, true);
  await resumeService.move(resumeId, folderId, true);
  return folderId;
}

export default resumeService;
