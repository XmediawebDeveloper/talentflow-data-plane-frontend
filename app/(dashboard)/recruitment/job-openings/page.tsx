'use client';

import { useState, useEffect } from 'react';
import { Loader2, AlertTriangle, X, Clock, GraduationCap, Factory, FolderOpen, FileSearch, ClipboardCheck, Users, Video, Info, ShieldCheck } from 'lucide-react';
import JobsListing from '@/components/JobsListing';
import JDEditBlockedModal from '@/components/JDEditBlockedModal';
import AITalentMatchConfirmModal from '@/components/AITalentMatchConfirmModal';
import AITalentMatchProgressPanel from '@/components/AITalentMatchProgressPanel';
import SelectSourceModal from '@/components/SelectSourceModal';
import ArchiveJobModal from '@/components/ArchiveJobModal';
import DisableJobModal from '@/components/DisableJobModal';
import { Job } from '@/lib/types/types';
import { jdService, JDListResponse } from '@/lib/services/jdService';
import { toast } from 'sonner';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import api from '@/lib/services/api';
import { usePlanLock } from '@/lib/hooks/usePlanFeature';
import { PLAN_LOCKED_MESSAGE } from '@/lib/types/planFeatures';
import { mapJDToJob, formatJobVersionLabel } from '@/lib/utils/jobOpeningDisplay';
import { getJDUsageModules, type JDUsageModule } from '@/lib/utils/jdUsageModules';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

type FilterStatus = 'all' | 'published' | 'draft' | 'closed' | 'disabled' | 'archived';

// Master-data quick links surfaced on the Job Openings page (moved here from the sidebar).
/**
 * The icon for one "Active in" entry in the cannot-delete dialog. Matched on
 * the label the usage summary already builds (e.g. "Resume Scoring (3)")
 * rather than a second parallel list of module keys, so a new module shows up
 * with the generic folder until it is added here — never as a missing icon.
 */
const usageModuleIcon = (label: string) => {
  const name = label.toLowerCase();
  if (name.includes('resume scoring')) return FileSearch;
  if (name.includes('assessment')) return ClipboardCheck;
  if (name.includes('talent match')) return Users;
  if (name.includes('interview')) return Video;
  return FolderOpen;
};


const JD_BATCH_SIZE = 100;

// Loading skeleton for Job Openings — mirrors the real overview JobsListing
// renders: the white rounded card shell, breadcrumb, header (icon + title +
// subtitle + Config/Create buttons) and the 4-up stat-card grid (Total Jobs /
// Published / Drafts / Archived). Kept inline (no separate file) so it sits
// beside the layout it shadows and can't drift from it.
function JobOpeningsSkeleton() {
  return (
    <main className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
          {/* Breadcrumb */}
          <div className="mb-4 md:mb-6 h-4 w-56 rounded bg-gray-200 animate-pulse" />

          {/* Header */}
          <div className="mb-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
              <div className="flex items-start gap-3">
                <div className="hidden sm:block h-9 w-9 rounded-lg bg-gray-200 animate-pulse" />
                <div className="space-y-2">
                  <div className="h-6 w-40 rounded bg-gray-200 animate-pulse" />
                  <div className="h-4 w-56 rounded bg-gray-100 animate-pulse" />
                </div>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                <div className="h-9 w-full sm:w-28 rounded-lg bg-gray-100 animate-pulse" />
                <div className="h-9 w-full sm:w-36 rounded-lg bg-gray-200 animate-pulse" />
              </div>
            </div>

            {/* Stat cards — 4-up grid (matches StatsCardGrid columns=4) */}
            <div className="grid gap-2.5 sm:gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="relative overflow-hidden rounded-xl border border-gray-200 bg-white px-3.5 py-3.5 sm:px-4 sm:py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-2.5">
                      <div className="h-9 w-9 shrink-0 rounded-lg bg-gray-200 animate-pulse" />
                      <div className="space-y-2 pt-0.5">
                        <div className="h-3.5 w-20 rounded bg-gray-200 animate-pulse" />
                        <div className="h-6 w-12 rounded bg-gray-200 animate-pulse" />
                      </div>
                    </div>
                    <div className="h-7 w-7 shrink-0 rounded-lg bg-gray-100 animate-pulse" />
                  </div>
                  <div className="mt-3 h-5 w-20 rounded-full bg-gray-100 animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function JobOpeningsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  // Total/Published/Draft/Archived, precomputed server-side (page 1 of the same
  // `/jd` call) so the stat cards can show the right number immediately. `jobs`
  // itself still fills in two steps below (page 1, then the rest in parallel) —
  // without this, the cards read page 1's partial tally first and then jump to
  // the correct one once every page has landed. `jobsFullyLoaded` marks the
  // point where `jobs` itself is complete and can take over as the live source
  // (so a publish/archive/delete action keeps updating the cards instantly,
  // the way it did before this existed) — the handover is silent because by
  // then the two sources agree.
  const [statusCounts, setStatusCounts] = useState<JDListResponse['status_counts']>(null);
  const [jobsFullyLoaded, setJobsFullyLoaded] = useState(false);
  const [quotaInfo, setQuotaInfo] = useState<{ remaining: number; limit: number; used: number } | undefined>();
  const [activeFilter, setActiveFilter] = useState<FilterStatus>('all');
  /* The modules holding the JD, not pre-formatted strings: the dialog draws
     each one with its own dashboard icon and count, so it needs the parts. */
  const [editWarningDialog, setEditWarningDialog] = useState<{
    open: boolean;
    jobTitle: string;
    modules: JDUsageModule[];
    reason?: string;
    jobId?: string;
    creating?: boolean;
    versionNumber?: number;
  }>({ open: false, jobTitle: '', modules: [] });
  const [deleteWarningDialog, setDeleteWarningDialog] = useState<{
    open: boolean;
    jobTitle: string;
    usageDetails: string[];
  }>({ open: false, jobTitle: '', usageDetails: [] });
  /* `disabling` keeps the confirmation on screen — buttons locked, spinner on
     the action — while the status write is in flight, rather than closing on
     click and leaving the row unchanged until the response lands. */
  const [disableDialog, setDisableDialog] = useState<{
    open: boolean;
    job: Job | null;
    disabling: boolean;
  }>({ open: false, job: null, disabling: false });
  /* Archiving is confirmed, never immediate. `busy` keeps the modal open with a
     spinner while the request is in flight, so a slow save cannot be clicked
     twice or read as nothing having happened. */
  const [archiveDialog, setArchiveDialog] = useState<{
    open: boolean;
    job: Job | null;
    busy: boolean;
  }>({ open: false, job: null, busy: false });
  const router = useRouter();
  const searchParams = useSearchParams();
  const dialog = useGlobalDialog();
  const { user, isTenantAdmin, hasPermission } = useAuth();
  const canManageMasters = hasPermission('canManageSettings');

  // "?view=list" is a one-shot instruction from the JD flow's "View All Jobs":
  // open the full list with every job showing, rather than the stat-tile overview
  // or whatever narrowed view was last persisted. Captured on the first render so
  // it stays stable for this mount, then stripped from the URL below.
  const [forceListView] = useState(() => searchParams.get('view') === 'list');

  // Landing at a restored scroll offset would drop the recruiter into the middle
  // of the list they just asked to see from the top — and the newest JD sorts
  // first. Drop the saved offset before the restore effect can read it (it is
  // gated on !loading, so it has not run yet on this mount).
  useEffect(() => {
    if (!forceListView) return;
    try { sessionStorage.removeItem('listScroll:job-openings'); } catch { /* ignore */ }
  }, [forceListView]);

  // Strip the param once consumed, so a later back-navigation from job-details
  // restores the recruiter's own view instead of resetting it all over again.
  useEffect(() => {
    if (searchParams.get('view') !== 'list') return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete('view');
    const query = next.toString();
    router.replace(`/recruitment/job-openings${query ? `?${query}` : ''}`, { scroll: false });
  }, [searchParams, router]);

  // Restore/persist the list's view state + scroll position so returning from a
  // job-details page lands the user exactly where they left off. The outer div
  // below is the outermost root that owns the scroll container, so the scroll
  // ref is attached here (JobsListing renders inside it).
  const rootRef = useScrollRestoration('job-openings', !loading);
  useListStatePersistence(
    'job-openings',
    { activeFilter },
    (s) => {
      if (typeof s.activeFilter === 'string') setActiveFilter(s.activeFilter as FilterStatus);
    },
  );

  // Sync filter with URL parameter
  useEffect(() => {
    const statusFromUrl = searchParams.get('status') as FilterStatus | null;
    if (statusFromUrl && ['published', 'draft', 'closed', 'disabled', 'archived'].includes(statusFromUrl)) {
      setActiveFilter(statusFromUrl);
    } else {
      setActiveFilter('all');
    }
  }, [searchParams]);

  // Handle deep link to specific JD from notifications
  useEffect(() => {
    const jdIdFromUrl = searchParams.get('jd_id');
    if (jdIdFromUrl) {
      // Navigate to the job details page
      router.replace(`/recruitment/job-details?id=${jdIdFromUrl}`);
    }
  }, [searchParams, router]);

  // Re-fetch jobs and quota when user changes
  useEffect(() => {
    if (user) {
      fetchJobs();
      fetchQuotaInfo();
    }
  }, [user?.id]);

  const fetchQuotaInfo = async () => {
    try {
      const response = await api.get('/usage/quota-status');
      if (response.data?.status === 'success' && response.data.data?.quotas?.max_jobs) {
        const maxJobs = response.data.data.quotas.max_jobs;
        setQuotaInfo({
          remaining: maxJobs.total_remaining || 0,
          limit: (maxJobs.subscription?.limit || 0) + (maxJobs.addon?.total_purchased || 0),
          used: maxJobs.subscription?.used || 0,
        });
      }
    } catch (error) {
      console.error('Failed to fetch quota info:', error);
    }
  };

  const fetchJobs = async () => {
    setLoading(true);
    setJobsFullyLoaded(false);
    // Pull "my JDs" in smaller pages. The previous page_size=total request
    // produced oversized responses and browser transport failures upstream.
    let firstPage;
    try {
      firstPage = await jdService.list({
        page: 1,
        page_size: JD_BATCH_SIZE,
        source: 'my-jds',
      });

      /* One mapping for every surface that lists JDs — this page and the Apply
         to Job dialog both build their rows with it, so neither can end up
         missing a field the other shows (publish count, lineage version,
         experience). Paint the first page IMMEDIATELY so the user sees jobs
         instead of waiting for every remaining page to load sequentially.
         `?? []` guards a backend response without an `items` array — otherwise
         `.map` would throw and (crucially) leave the page stuck on the skeleton. */
      setJobs((firstPage.items ?? []).map(mapJDToJob));
      // Precomputed on this same call — see fetchJobs' jobsFullyLoaded comment.
      setStatusCounts(firstPage.status_counts ?? null);
    } catch (error) {
      // First-page failure (or a bad shape) is a real load failure — surface it.
      // The `finally` below still clears the skeleton so the page never hangs.
      console.error('Failed to fetch jobs:', error);
      toast.error('Failed to load job openings');
      return;
    } finally {
      // ALWAYS drop the skeleton after the first page attempt, success or not —
      // this is the guarantee that the page can never be stuck showing only the
      // skeleton with no data.
      setLoading(false);
    }

    // Fetch any remaining pages in PARALLEL (not one after another) so the full
    // list — and the accurate overview counts — arrive as fast as possible. A
    // page that fails is skipped rather than wiping the jobs already on screen.
    const totalPages = Math.max(
      firstPage.total_pages || Math.ceil(firstPage.total / JD_BATCH_SIZE),
      1
    );
    if (totalPages <= 1) {
      setJobsFullyLoaded(true);
      return;
    }

    const restPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
    const results = await Promise.allSettled(
      restPages.map((page) =>
        jdService.list({ page, page_size: JD_BATCH_SIZE, source: 'my-jds' })
      )
    );
    const restJobs = results.flatMap((r) =>
      r.status === 'fulfilled' ? (r.value.items ?? []).map(mapJDToJob) : []
    );
    if (restJobs.length) {
      setJobs((prev) => [...prev, ...restJobs]);
    }
    // `jobs` now has every page (or every page that didn't fail) — the stat
    // cards can safely switch from `statusCounts` to their own live tally.
    setJobsFullyLoaded(true);
  };

  const mapStatus = (status: string): 'Published' | 'Draft' | 'Closed' | 'Archived' | 'Disabled' => {
    const statusMap: Record<string, 'Published' | 'Draft' | 'Closed' | 'Archived' | 'Disabled'> = {
      'published': 'Published',
      'active': 'Published',
      'draft': 'Draft',
      'closed': 'Closed',
      'archived': 'Archived',
      'disabled': 'Disabled',
    };
    return statusMap[status?.toLowerCase()] || 'Draft';
  };

  const handleCreateNew = () => {
    // Always start a BRAND-NEW JD — never resume the last autosaved draft.
    // The jd-creation route segment is cached by the App Router, so a bare
    // "/recruitment/jd-creation" push reuses the previous in-progress form
    // state (step 2, autosaved draft id, extracted data). A unique `new` nonce
    // makes each click a distinct URL → fresh segment → the page remounts the
    // form clean. (Existing drafts are still resumable via Edit, which passes ?id.)
    router.push(`/recruitment/jd-creation?new=${Date.now()}`);
  };

  const handleViewJob = (job: Job) => {
    // Draft JDs go directly to jd-creation. No `&stage=` here — `job.creation_stage`
    // is whatever this LIST last fetched, which goes stale the moment the recruiter
    // advances the draft's stage in a jd-creation tab/session without this page
    // re-fetching (its own effect only re-runs on `user?.id` changing, not on every
    // return visit). jd-creation always does its own fresh `jdService.get(id)` on
    // load and resumes at THAT record's `creation_stage` when the URL carries none —
    // see `memoizedEditingJD` in jd-creation/page.tsx, and the confirmed mechanic in
    // JDCreation.tsx's own comments: "a JD opened with ?stage=create in the link
    // lands on Step 1" regardless of what extraction the record actually has. Passing
    // a stale stage here reopened an already-extracted draft back on Step 1, with the
    // entered data invisible (not lost — just on a step this URL insisted on showing
    // instead of the one the record was on).
    if (job.status === 'Draft') {
      router.push(`/recruitment/jd-creation?id=${job.id}`);
    } else {
      router.push(`/recruitment/job-details?id=${job.id}`);
    }
  };

  const handleViewApplicants = (job: Job) => {
    router.push(`/recruitment/job-details?id=${job.id}&tab=scored-resumes`);
  };

  /* AI Talent Match and Score Resumes open IN PLACE on this list — like
     Disable / Archive / Delete — with the same pieces the job's own page uses:
     the "Run AI Match?" confirm then the progress panel, and the "Select
     Applicants to Score" popup. Results link through to that job's tab. */
  const [aiMatchConfirmJob, setAiMatchConfirmJob] = useState<Job | null>(null);
  const [aiMatchRunJob, setAiMatchRunJob] = useState<Job | null>(null);
  const [scoreResumesJob, setScoreResumesJob] = useState<Job | null>(null);

  // Plan-gated row actions stay in the menu, disabled with the plan hover.
  const { isPlanLocked } = usePlanLock();

  const handleAIMatch = (job: Job) => {
    setAiMatchConfirmJob(job);
  };

  const handleScoreResumes = (job: Job) => {
    setScoreResumesJob(job);
  };

  const handleUpdateJobStatus = async (jobId: string, status: string) => {
    try {
      await jdService.updateStatus(jobId, status);
      setJobs(prev => prev.map(job =>
        job.id === jobId ? { ...job, status: mapStatus(status) } : job
      ));
      markVersionStatus(jobId, status.toLowerCase());
      toast.success('Job status updated');
    } catch (error) {
      toast.error('Failed to update job status');
    }
  };

  const handleEditJob = async (job: Job) => {
    // For Draft JDs, open at the stage where they left off. No `&stage=` — see
    // the same note on handleViewJob above; this list's `job.creation_stage`
    // can be stale, and jd-creation's own fresh fetch is the source of truth.
    if (job.status === 'Draft') {
      router.push(`/recruitment/jd-creation?id=${job.id}`);
      return;
    }

    // For Published JDs, check if modules are in use before allowing edit
    try {
      const usageStatus = await jdService.getUsageStatus(job.id);

      /* Derived from whatever the endpoint reports rather than a hand-listed
         set, and blocked on either signal — used in any module, or an explicit
         backend refusal. Matches the JD detail page exactly, so the same JD
         cannot be editable from one screen and blocked from another. */
      const modules = getJDUsageModules(usageStatus?.usage);
      if (modules.length > 0 || usageStatus?.can_edit === false) {
        setEditWarningDialog({
          open: true,
          jobId: job.id,
          jobTitle: job.title,
          modules,
          reason: usageStatus?.edit_restriction_reason,
          creating: false,
          versionNumber: job.versionNumber,
        });
        return;
      }

      // JD not in use - allow edit
      router.push(`/recruitment/jd-creation?id=${job.id}&stage=create`);
    } catch (error) {
      console.error('Failed to check JD usage status:', error);
      // If usage check fails, allow navigation (backend will validate on save)
      router.push(`/recruitment/jd-creation?id=${job.id}&stage=create`);
    }
  };

  // Version control: editing an in-use JD forks it into a NEW independent version
  // (a fresh DRAFT copy with its own id) instead of mutating the in-use one. The
  // editor then opens on the new version; the previous version keeps all its
  // assessments/interviews/scores untouched.
  const handleCreateNewVersion = async () => {
    const sourceId = editWarningDialog.jobId;
    if (!sourceId) return;
    setEditWarningDialog(prev => ({ ...prev, creating: true }));
    try {
      const newJd = await jdService.createNewVersion(sourceId);
      setEditWarningDialog({ open: false, jobTitle: '', modules: [] });
      toast.success('New version created', {
        description: `Version ${(newJd as any).version_number ?? ''} created as a new draft. Edit and publish it independently.`,
      });
      // Start on Step 1 with ALL the source JD's data pre-filled (title, JD
      // text, extracted skills/experience/etc.). The no-change-no-LLM guard
      // keeps that data intact through the steps until the recruiter edits it.
      router.push(`/recruitment/jd-creation?id=${newJd.id}&stage=create`);
    } catch (error) {
      console.error('Failed to create new JD version:', error);
      setEditWarningDialog(prev => ({ ...prev, creating: false }));
      toast.error('Could not create new version', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  const handlePublishJob = async (job: Job) => {
    try {
      // Use publish endpoint which tracks quota/units
      await jdService.publish(job.id);
      setJobs(prev => prev.map(j =>
        j.id === job.id ? { ...j, status: 'Published', postedDate: new Date().toISOString() } : j
      ));
      markVersionStatus(job.id, 'published');
      toast.success(`"${job.title}" is now live!`);
    } catch (error: any) {
      // Check if this is a quota exceeded error
      const quotaError = error?.response?.data?.detail;
      if (quotaError && (quotaError.error === 'QUOTA_EXHAUSTED' || quotaError.error === 'QUOTA_INSUFFICIENT')) {
        toast.error('Job publishing quota exhausted. Please upgrade your plan.');
      } else {
        toast.error('Failed to publish job');
      }
    }
  };

  /* Statuses we have successfully written, by JD version id.
   *
   * The main list rows re-render from `jobs` below, but the View Versions table
   * renders from a separately fetched, cached lineage that knows nothing about
   * an action taken since it loaded — so an archived or disabled version kept
   * showing its old badge until the panel was reopened. Each entry is written
   * ONLY after the backend confirmed the change, so the badge can never claim a
   * status the database does not hold.
   *
   * Keyed by version id, so one row moves and its siblings do not. */
  const [versionStatusOverrides, setVersionStatusOverrides] = useState<Record<string, string>>({});
  const markVersionStatus = (versionId: string, status: string) =>
    setVersionStatusOverrides(prev => ({ ...prev, [versionId]: status }));

  const closeDisableDialog = () => setDisableDialog({ open: false, job: null, disabling: false });

  const handleDisableJob = (job: Job) => {
    // Show confirmation dialog instead of directly disabling
    setDisableDialog({ open: true, job, disabling: false });
  };

  const confirmDisableJob = async () => {
    const job = disableDialog.job;
    if (!job || disableDialog.disabling) return;

    setDisableDialog(prev => ({ ...prev, disabling: true }));
    try {
      await jdService.updateStatus(job.id, 'disabled');
      setJobs(prev => prev.map(j =>
        j.id === job.id ? { ...j, status: 'Disabled' } : j
      ));
      markVersionStatus(job.id, 'disabled');
      toast.info(`"${job.title}" has been disabled`);
      closeDisableDialog();
    } catch (error) {
      toast.error('Failed to disable job');
      // Stay open so the recruiter can retry — closing here would look like
      // the disable went through.
      setDisableDialog(prev => ({ ...prev, disabling: false }));
    }
  };

  const handleRepublishJob = async (job: Job) => {
    try {
      await jdService.updateStatus(job.id, 'published');
      setJobs(prev => prev.map(j =>
        j.id === job.id ? { ...j, status: 'Published' } : j
      ));
      markVersionStatus(job.id, 'published');
      toast.success(`"${job.title}" has been republished`);
    } catch (error) {
      toast.error('Failed to republish job');
    }
  };

  /* Every archive trigger on this page — the list row menu, the grid card menu
     and the version-history rows — is handed THIS, not the archive itself, so
     none of them can archive without the confirm. The work moved to
     `confirmArchiveJob` below, which only the modal calls. */
  const requestArchiveJob = (job: Job) => {
    setArchiveDialog({ open: true, job, busy: false });
  };

  const confirmArchiveJob = async () => {
    const job = archiveDialog.job;
    if (!job) return;
    setArchiveDialog(prev => ({ ...prev, busy: true }));
    try {
      await jdService.updateStatus(job.id, 'archived');
      setJobs(prev => prev.map(j =>
        j.id === job.id ? { ...j, status: 'Archived' } : j
      ));
      markVersionStatus(job.id, 'archived');
      toast.success(`"${job.title}" has been archived`);
      setArchiveDialog({ open: false, job: null, busy: false });
    } catch (error) {
      toast.error('Failed to archive job');
      /* Left open on failure — closing it would look like the archive worked. */
      setArchiveDialog(prev => ({ ...prev, busy: false }));
    }
  };

  const handleUnarchiveJob = async (job: Job) => {
    try {
      await jdService.updateStatus(job.id, 'published');
      setJobs(prev => prev.map(j =>
        j.id === job.id ? { ...j, status: 'Published' } : j
      ));
      markVersionStatus(job.id, 'published');
      toast.success(`"${job.title}" has been unarchived and published`);
    } catch (error) {
      toast.error('Failed to unarchive job');
    }
  };

  const handleDeleteJob = async (job: Job) => {
    // Check if JD is in use before allowing delete
    try {
      const usageStatus = await jdService.getUsageStatus(job.id);
      if (usageStatus && usageStatus.is_used) {
        const usageDetails = [
          usageStatus.usage?.resume_scores_count ? `Resume Scoring (${usageStatus.usage.resume_scores_count})` : '',
          usageStatus.usage?.assessments_count ? `Assessments (${usageStatus.usage.assessments_count})` : '',
          usageStatus.usage?.ai_matches_count ? `AI Talent Match (${usageStatus.usage.ai_matches_count})` : '',
          usageStatus.usage?.ai_interview_count ? `AI Interview (${usageStatus.usage.ai_interview_count})` : ''
        ].filter(Boolean) as string[];
        setDeleteWarningDialog({ open: true, jobTitle: job.title, usageDetails });
        return;
      }
    } catch (error) {
      console.error('Failed to check JD usage status:', error);
    }
    if (!await dialog.confirm({
      title: 'Delete Job Opening',
      message: 'Are you sure you want to delete this job opening?\nThis action cannot be undone.',
      variant: 'delete',
      confirmText: 'Delete Job Opening',
      item: {
        label: 'JOB OPENING',
        name: [job.job_id, job.title].filter(Boolean).join(' – ') || job.title,
        badge: job.versionNumber ? `V${job.versionNumber}` : undefined,
      },
      warningNote: 'Deleting this job opening will permanently remove it from your job openings and cannot be restored.',
    })) return;
    try {
      await jdService.delete(job.id);
      setJobs(prev => prev.filter(j => j.id !== job.id));
      toast.success(`"${job.title}" has been deleted`);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete job');
    }
  };

  // Bulk delete: JobsListing has already shown a single confirmation. Delete each
  // selected job, skipping any that are in use (same rule as single delete), and
  // report a summary. Runs sequentially to keep error handling clear.
  const handleBulkDeleteJobs = async (jobsToDelete: Job[]) => {
    const deletedIds: string[] = [];
    const skipped: string[] = [];
    let failed = 0;

    for (const job of jobsToDelete) {
      try {
        const usageStatus = await jdService.getUsageStatus(job.id);
        if (usageStatus && usageStatus.is_used) {
          skipped.push(job.title);
          continue;
        }
      } catch (error) {
        // Usage check failed — let the backend validate on delete rather than block.
        console.error('Failed to check JD usage status during bulk delete:', error);
      }
      try {
        await jdService.delete(job.id);
        deletedIds.push(job.id);
      } catch (error) {
        failed++;
      }
    }

    if (deletedIds.length > 0) {
      setJobs(prev => prev.filter(j => !deletedIds.includes(j.id)));
    }

    if (deletedIds.length > 0 && skipped.length === 0 && failed === 0) {
      toast.success(`${deletedIds.length} job(s) deleted`);
    } else {
      const summary = [
        deletedIds.length ? `${deletedIds.length} deleted` : '',
        skipped.length ? `${skipped.length} skipped (in use)` : '',
        failed ? `${failed} failed` : '',
      ].filter(Boolean).join(' · ');
      if (deletedIds.length > 0) {
        toast.success(summary || 'Done');
      } else {
        toast.error(summary || 'No jobs deleted');
      }
    }
  };

  if (loading) {
    // Skeleton instead of a spinner during the initial fetch, matching the
    // route-level loading.tsx so the load reads as one continuous skeleton.
    return <JobOpeningsSkeleton />;
  }

  return (
    <div ref={rootRef} className="relative flex-1 flex flex-col overflow-x-clip bg-slate-50">
      <JobsListing
        jobs={jobs}
        statusCounts={statusCounts}
        jobsFullyLoaded={jobsFullyLoaded}
        onCreateNew={handleCreateNew}
        onCreateNewDisabled={!(hasPermission('canCreateJD') || isTenantAdmin)}
        onViewJob={handleViewJob}
        onViewApplicants={handleViewApplicants}
        onAIMatch={handleAIMatch}
        onAIMatchDisabled={isPlanLocked('ai_talent_match') || !(hasPermission('canRunAiMatch') || isTenantAdmin)}
        onAIMatchDisabledReason={isPlanLocked('ai_talent_match') ? PLAN_LOCKED_MESSAGE : undefined}
        onScoreResumes={handleScoreResumes}
        onScoreResumesDisabled={isPlanLocked('resume_scoring') || !(hasPermission('canRunScoring') || isTenantAdmin)}
        onScoreResumesDisabledReason={isPlanLocked('resume_scoring') ? PLAN_LOCKED_MESSAGE : undefined}
        onUpdateJobStatus={handleUpdateJobStatus}
        onEditJob={handleEditJob}
        onPublishJob={handlePublishJob}
        versionStatusOverrides={versionStatusOverrides}
        onDisableJob={handleDisableJob}
        onRepublishJob={handleRepublishJob}
        onArchiveJob={requestArchiveJob}
        onUnarchiveJob={handleUnarchiveJob}
        onDeleteJob={handleDeleteJob}
        onBulkDelete={handleBulkDeleteJobs}
        quotaInfo={quotaInfo}
        initialStatusFilter={activeFilter}
        forceListView={forceListView}
        configHref={canManageMasters ? '/recruitment/job-openings/config' : undefined}
      />

      {/* Archive confirm — the same component the Job Details page renders, so
          the warning cannot differ depending on where the archive started. */}
      <ArchiveJobModal
        isOpen={archiveDialog.open}
        jobLabel={archiveDialog.job ? formatJobVersionLabel(archiveDialog.job) : ''}
        isLoading={archiveDialog.busy}
        onConfirm={confirmArchiveJob}
        onCancel={() => setArchiveDialog({ open: false, job: null, busy: false })}
      />

      {/* Edit Warning Dialog — same component the JD detail page uses, so the
          grid and list views cannot drift from it again. */}
      {/* AI Talent Match — confirm, then the progress panel, on this page */}
      <AITalentMatchConfirmModal
        isOpen={!!aiMatchConfirmJob}
        jobTitle={aiMatchConfirmJob ? formatJobVersionLabel(aiMatchConfirmJob) : ''}
        job={aiMatchConfirmJob}
        onConfirm={() => { setAiMatchRunJob(aiMatchConfirmJob); setAiMatchConfirmJob(null); }}
        onCancel={() => setAiMatchConfirmJob(null)}
      />
      {aiMatchRunJob && (
        <AITalentMatchProgressPanel
          jobTitle={aiMatchRunJob.title}
          jobId={aiMatchRunJob.id}
          onComplete={(results) => {
            const job = aiMatchRunJob;
            setAiMatchRunJob(null);
            toast.success(`AI Talent Match completed for "${job.title}" — ${results.length} matching candidate${results.length === 1 ? '' : 's'}.`, {
              action: { label: 'View results', onClick: () => router.push(`/recruitment/job-details?id=${job.id}&tab=ai-talent-match`) },
            });
          }}
          onError={(error) => {
            setAiMatchRunJob(null);
            toast.error(error || 'Failed to run AI Talent Match');
          }}
        />
      )}

      {/* Score Resumes — the "Select Applicants to Score" popup, on this page */}
      {scoreResumesJob && (
        <SelectSourceModal
          jobTitle={scoreResumesJob.title}
          jobId={scoreResumesJob.id}
          jobShortId={scoreResumesJob.job_id}
          jobVersion={scoreResumesJob.versionNumber && scoreResumesJob.versionNumber > 0 ? scoreResumesJob.versionNumber : null}
          onClose={() => setScoreResumesJob(null)}
          onScoringFinished={() => {
            const job = scoreResumesJob;
            toast.success(`Scoring finished for "${job.title}".`, {
              action: { label: 'View scored resumes', onClick: () => router.push(`/recruitment/job-details?id=${job.id}&tab=scored-resumes`) },
            });
          }}
          onScoringComplete={() => setScoreResumesJob(null)}
          onViewResult={(item) => {
            const job = scoreResumesJob;
            setScoreResumesJob(null);
            router.push(`/recruitment/job-details?id=${job.id}&tab=scored-resumes&resume=${encodeURIComponent(item.resumeId)}`);
          }}
        />
      )}

      <JDEditBlockedModal
        open={editWarningDialog.open}
        modules={editWarningDialog.modules}
        reason={editWarningDialog.reason}
        jdId={editWarningDialog.jobId}
        creating={!!editWarningDialog.creating}
        atMaxVersions={(editWarningDialog.versionNumber ?? 1) >= 5}
        onClose={() => setEditWarningDialog({ open: false, jobTitle: '', modules: [] })}
        onCreateNewVersion={handleCreateNewVersion}
      />

      {/* Delete Warning Dialog - shown when JD is in use */}
      <AlertDialog open={deleteWarningDialog.open} onOpenChange={(open) => setDeleteWarningDialog(prev => ({ ...prev, open }))}>
        <AlertDialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto">
          <AlertDialogHeader>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-red-100 ring-4 ring-red-50 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 sm:w-7 sm:h-7 text-red-600 fill-red-600/15" />
              </div>
              <div className="flex-1 pt-1">
                <AlertDialogTitle className="text-lg sm:text-xl font-bold text-gray-900">
                  Cannot Delete Job Description
                </AlertDialogTitle>
                <AlertDialogDescription className="mt-1 text-sm text-gray-500">
                  This job description is actively used and cannot be deleted.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>

          <div className="mt-4 space-y-3.5">
            {/* Where it's in use — the modules themselves, two to a row, each
                named with its own icon and count rather than a bare chip. */}
            <div className="rounded-xl border border-red-200 bg-red-50/70 p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-red-100 flex items-center justify-center">
                  <FolderOpen className="w-4 h-4 text-red-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold uppercase tracking-wide text-red-600">Active in</p>
                  <p className="text-sm text-gray-700">
                    This job description is linked to the following active modules.
                  </p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {deleteWarningDialog.usageDetails.map((usage, index) => {
                  const UsageIcon = usageModuleIcon(usage);
                  return (
                    <span
                      key={index}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-full text-sm font-semibold bg-white border border-red-200 text-red-700 shadow-sm"
                    >
                      <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                      <UsageIcon className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{usage}</span>
                    </span>
                  );
                })}
              </div>
            </div>

            {/* What that means, and what to do instead. */}
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-brand-blue flex items-center justify-center">
                  <Info className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-gray-700">
                    <span className="font-bold text-brand-blue">&quot;{deleteWarningDialog.jobTitle}&quot;</span> is linked to the active modules above.
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    Deleting it could affect existing data and processes.
                  </p>
                </div>
              </div>

              <div className="my-3 border-t border-dashed border-blue-200" />

              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-9 h-9 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-brand-blue" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-gray-700">
                    <span className="font-bold text-brand-blue">We recommend disabling</span> the job description instead.
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    This will stop new applications while keeping existing data safe.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <AlertDialogFooter className="mt-5 flex gap-2 sm:justify-end">
            <AlertDialogAction
              onClick={() => setDeleteWarningDialog({ open: false, jobTitle: '', usageDetails: [] })}
              className="w-full sm:w-auto bg-gray-900 hover:bg-gray-800 text-white text-sm"
            >
              I Understand
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disable Job Confirmation Dialog — the same component the Job Details
          page and the JD list sheet render. */}
      <DisableJobModal
        isOpen={disableDialog.open}
        jobLabel={disableDialog.job ? formatJobVersionLabel(disableDialog.job) : ''}
        isLoading={disableDialog.disabling}
        onCancel={closeDisableDialog}
        onConfirm={confirmDisableJob}
      />
    </div>
  );
}
