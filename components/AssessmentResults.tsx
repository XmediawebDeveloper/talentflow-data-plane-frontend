import { ArrowLeft, User, Clock, Award, CheckCircle, XCircle, ChevronUp, FileText, TrendingUp, Calendar, Briefcase, AlertCircle, Info, Filter, Layers, ArrowUpDown, ChevronLeft, ChevronRight, Loader2, Mail, Phone, BarChart3, SlidersHorizontal, Columns3, Trash2, Users, Download, X, Play, CheckSquare, Eye } from 'lucide-react';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { assessmentService, jdService } from '@/lib/services';
import { formatISTDate, formatISTWithSeconds } from '@/lib/utils/dateUtils';
import JobIdBadge from './jobs/JobIdBadge';
import { toast } from 'sonner';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import {
  calculateFinalResult,
  QuestionScore,
  FinalAssessmentResult,
  getScoringBreakdown
} from '@/lib/utils/assessmentScoring';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import RecordPager from '@/components/RecordPager';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import { Skeleton } from '@/components/ui/skeleton';
import AssessmentResultsSkeleton from '@/components/AssessmentResultsSkeleton';
import { TABLE_EMPTY_PANEL_CLASS } from '@/lib/constants/tableEmptyPanel';
import EmptySearchIllustration from '@/components/ui/empty-search-illustration';
import { Button } from '@/components/ui/button';
import { currentResultReturnTo, rememberResultReturn, resultReturnQuery } from '@/lib/utils/resultReturnContext';
import { Badge } from '@/components/ui/badge';
import ListToolbar from '@/components/ui/list-toolbar';
import ListFilterPanel from '@/components/ui/list-filter-panel';
import { InviteSourceValue } from '@/components/AIInterviewInviteTable';

interface AssessmentResultsProps {
  onBack: () => void;
  assessmentId: string;
  assessmentTitle: string;
  assessmentVersion?: number | null;
  jdTitle?: string;
  /** The JD row this assessment was authored against — the entry point to the
   *  job's version lineage, which is what the Job Version selector lists. */
  jdId?: string;
  /** Human-readable Job ID (JD-001), shown at the head of the page. */
  jdShortId?: string;
  /** The job version this assessment was authored against. Only a fallback:
   *  the scope is normally read from the lineage. */
  jdVersion?: number | null;
  /**
   * Which job version the page opens on, as the link that sent the recruiter
   * here named it (`?job_version_id=`).
   *
   * A JD ROW ID selects that one job version — the Assessment Versions table's
   * Results icon passes the row it sits under, so the page opens reporting that
   * version's candidates. The literal `'all'` asks for the whole job, which is
   * what the Job List row's Results button passes. `null` is an arrival that
   * named nothing (a deep link, the details view's Results button): the page
   * keeps the scope it restores, else All Versions.
   *
   * It is the page's OPENING SELECTION, not a pin: the same view is rendered
   * either way — both version selectors are there, showing what the link asked
   * for — and the recruiter can widen or change it from the controls. The two
   * entry points differ in what they preselect, never in what they show.
   *
   * An id the JD's lineage does not return resolves to nothing and reads as
   * All Versions, the same way a stale restored selection does — a scope the
   * job cannot honour must not render as an empty table.
   */
  jobVersionScope?: string | null;
  /**
   * Which assessment version the page opens on (`?assessment_version=`), the
   * companion to `jobVersionScope` — the Results icon names the row's own
   * revision alongside the row's job version, so the page opens on exactly the
   * job-version × assessment-version pair the recruiter clicked.
   *
   * A version NUMBER as a string, or the literal `'all'` (the Job List row's
   * Result button, which asks for every revision). `null` names nothing and
   * leaves the page on what it restores, else All Assessment Versions.
   *
   * A version the current job-version scope does not hold reads as All
   * Assessment Versions — see `effectiveAssessmentVersion`.
   */
  assessmentVersionScope?: string | null;
  /**
   * Rendered INSIDE a host page that already draws the chrome, rather than as
   * the results route's own page.
   *
   * The assessment details page's Results tab is that host: its card, its
   * breadcrumb and its record pager are already on screen, so this view drops
   * its own (they would be a second breadcrumb inside a second card) and keeps
   * everything that is the results themselves — the stat cards, the two version
   * scopes, the filters, the table, the exports.
   *
   * One component either way. The tab is not a summary of the results page: it
   * IS the results page, minus the frame the host has already drawn.
   */
  embedded?: boolean;
  canDownloadPDF?: boolean;
  canBatchDownload?: boolean;
  prevId?: string | null;
  nextId?: string | null;
  currentIndex?: number;
  totalCount?: number;
}

/** The canonical "Go to [input] · Previous · page/total · Next" control from
 *  components/Pagination.tsx, reused inline since this table's pagination
 *  footer also carries a "First"/"Last" pair and page-size-driven export
 *  wiring that don't fit that component's props as-is. */
function InlinePageNav({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (page: number) => void }) {
  const [goToPage, setGoToPage] = useState(String(page));
  useEffect(() => {
    setGoToPage(String(page));
  }, [page]);

  const commitGoToPage = () => {
    const target = Math.round(Number(goToPage));
    if (Number.isFinite(target) && target >= 1 && target <= totalPages) {
      onPageChange(target);
    } else {
      setGoToPage(String(page));
    }
  };

  const navBtnClass =
    "inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors";

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
      <div className="flex items-center gap-1.5">
        <span className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Go to</span>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={goToPage}
          onChange={(e) => setGoToPage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
              commitGoToPage();
            }
          }}
          onBlur={commitGoToPage}
          aria-label="Go to page"
          className="w-14 h-8 sm:h-9 px-2 text-sm text-center border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white text-gray-900"
        />
      </div>

      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        className={navBtnClass}
        aria-label="Previous page" title="Previous page"
      >
        <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      </button>

      <span className="text-sm font-medium text-gray-700 px-1 whitespace-nowrap">
        <span className="text-brand-blue font-semibold">{page}</span> / {totalPages}
      </span>

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        className={navBtnClass}
        aria-label="Next page" title="Next page"
      >
        <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      </button>
    </div>
  );
}

interface CandidateResult {
  id: string;
  invitation_id: string;  // For pending candidates without attempt
  candidateDisplayId?: string;  // Per-tenant candidate ID (CID-01, CID-02, ...)
  name: string;
  email: string;
  phone?: string;
  inviteSource?: 'resume' | 'email';
  avatar?: string;
  score: number;
  totalScore: number;
  percentage: number;
  tech_score?: number;  // Technical round score percentage
  coding_score?: number; // Coding round score percentage
  hr_score?: number; // HR round score percentage
  status: 'Completed' | 'In Progress' | 'Pending';
  scoring_status?: string;  // "pending", "processing", "completed", "error"
  completedDate: string;
  duration: string;
  sent_at?: string;
  started_at?: string;
  completed_at?: string;
  created_at?: string;
  sections: SectionResult[];
  round: number; // Added round tracking
  roundName?: string; // Optional round name
  /** The assessment this attempt belongs to. Rows can span several assessments
   *  now that the page reports a whole JD, so every per-row call (details,
   *  PDF, delete) is addressed with this rather than with the page's own id. */
  assessmentId: string;
  /** The job version that assessment was authored against. */
  jobVersion?: number;
  /** That assessment's OWN version — which revision of the assessment this
   *  candidate actually sat. Undefined where the record carries none, which
   *  the column shows as a dash rather than inventing a v1. */
  assessmentVersion?: number;
}

/** One entry in the Job Version selector: a version of the JD and the
 *  assessments authored against it. A version with no assessments still
 *  appears — the JD has that version whether or not anyone was assessed on
 *  it — and simply selects an empty result set. */
interface JobVersionScope {
  versionNumber: number;
  assessmentIds: string[];
}

/** All of a scoped assessment's results are fetched in one request and paged
 *  client-side, because a page of a merged set cannot be asked for per
 *  assessment. Matches the fan-out page size the Assessments page uses for its
 *  own cross-assessment result tabs. */
const RESULTS_FETCH_PAGE_SIZE = 1000;

interface AssessmentDetails {
  hr_enabled: boolean;
  technical_enabled: boolean;
  coding_enabled: boolean;
  hr_percentage?: number;
  technical_percentage?: number;
  coding_percentage?: number;
  passing_threshold?: number;
}

interface SectionResult {
  name: string;
  score: number;
  totalScore: number;
  percentage: number;
  questions: QuestionResult[];
}

interface QuestionResult {
  question: string;
  candidateAnswer: string;
  correctAnswer?: string;
  score: number;
  maxScore: number;
  feedback: string;
  type: 'multiple-choice' | 'text' | 'coding';
}

export default function AssessmentResults({ onBack, assessmentId, assessmentTitle, assessmentVersion, jdTitle, jdId, jdShortId, jdVersion, jobVersionScope = null, assessmentVersionScope = null, embedded = false, canDownloadPDF = false, canBatchDownload = false, prevId, nextId, currentIndex, totalCount }: AssessmentResultsProps) {
  const router = useRouter();
  const dialog = useGlobalDialog();
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [candidateResults, setCandidateResults] = useState<CandidateResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const initialLoadDone = useRef(false);
  const [apiStats, setApiStats] = useState<{ completed_count: number; in_progress_count: number; pending_count: number; average_score: number | null }>({ completed_count: 0, in_progress_count: 0, pending_count: 0, average_score: null });
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);

  // AS-25: PDF download state
  const [downloadingPDF, setDownloadingPDF] = useState<string | null>(null);

  // AS-26: Bulk PDF download state
  const [downloadingBulkPDF, setDownloadingBulkPDF] = useState(false);

  // AS-23: Search, Sort, and Pagination state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'name' | 'score' | 'status' | 'date'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState<'all' | 'Completed' | 'In Progress' | 'Pending'>('all');
  // Two-step view: 'cards' shows only the 4 stat tiles; 'list' shows search,
  // filters, and the candidate table. Mirrors the Job Openings page pattern
  // — a fresh visit lands on cards; clicking a stat card drills into the list
  // with the matching status filter applied.
  const [pageView, setPageView] = useState<'cards' | 'list'>('cards');
  const openCandidateList = (filter: 'all' | 'Completed' | 'In Progress' | 'Pending') => {
    setStatusFilter(filter);
    setCurrentPage(1);
    setPageView('list');
  };

  // Assessment details (which rounds are enabled)
  const [assessmentDetails, setAssessmentDetails] = useState<AssessmentDetails | null>(null);

  // Round-based filtering with dropdown options (HR removed - only Tech and Coding)
  const [roundFilters, setRoundFilters] = useState<{
    technical?: 'all' | '50-70' | '70-90' | '90+';
    coding?: 'all' | '50-70' | '70-90' | '90+';
  }>({});

  // Pass/Fail filter
  const [passFailFilter, setPassFailFilter] = useState<'all' | 'pass' | 'fail'>('all');

  // Date range filter (submitted/completed date)
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // AS-24: Column customization
  const COLUMN_PREFERENCES_KEY = 'assessment_results_columns_v2';
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  // The toolbar's More Filters panel, which holds every filter.
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  // Export format modal state
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStep, setExportStep] = useState<'format' | 'scope'>('format');
  const [selectedFormat, setSelectedFormat] = useState<'csv' | 'excel'>('excel');
  // In-flight feedback so the recruiter sees a spinner while a large
  // server-side export streams down. Toast.loading is used to surface a
  // persistent indicator that gets dismissed with success/error.
  const [isExporting, setIsExporting] = useState(false);

  interface ColumnConfig {
    id: string;
    label: string;
    enabled: boolean;
  }

  // Dynamic columns based on assessment details
  const getDefaultColumns = (): ColumnConfig[] => {
    /* The order the table draws its columns in, so the column picker lists
       them the same way: who the candidate is, how they were invited and where
       their result stands, their scores and timeline, then the job / version
       detail and completion columns. */
    const baseColumns: ColumnConfig[] = [
      { id: 'candidate', label: 'Candidate', enabled: true },
      { id: 'email', label: 'Email', enabled: true },
      { id: 'phone', label: 'Phone', enabled: true },
      { id: 'inviteSource', label: 'Invite Source', enabled: true },
      { id: 'status', label: 'Result Status', enabled: true },
    ];

    // Add score columns only if those rounds are enabled for this assessment
    if (assessmentDetails?.technical_enabled) {
      baseColumns.push({ id: 'techScore', label: 'Tech Score', enabled: true });
    }
    if (assessmentDetails?.coding_enabled) {
      baseColumns.push({ id: 'codingScore', label: 'Coding Score', enabled: true });
    }

    baseColumns.push(
      { id: 'timeline', label: 'Timeline', enabled: true },
      { id: 'cid', label: 'CID', enabled: true },
      { id: 'jdId', label: 'JD ID', enabled: true },
      { id: 'jdTitle', label: 'JD Title', enabled: true },
      { id: 'jobVersion', label: 'Job Version', enabled: true },
      /* Beside the job version, in the order the two read as a pair: which
         version of the JOB the assessment belongs to, then which version of the
         ASSESSMENT the candidate sat. A column added here is enabled for
         everyone, including recruiters with saved preferences — the merge below
         only carries over the `enabled` flag of ids a saved set already had. */
      { id: 'assessmentVersion', label: 'Assessment Version', enabled: true },
      { id: 'completed', label: 'Completed', enabled: true },
      { id: 'duration', label: 'Duration', enabled: true }
    );

    return baseColumns;
  };

  const [columns, setColumns] = useState<ColumnConfig[]>([]);

  // Update columns when assessmentDetails changes
  useEffect(() => {
    const newDefaultColumns = getDefaultColumns();
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(COLUMN_PREFERENCES_KEY);
        if (saved) {
          const savedColumns = JSON.parse(saved) as ColumnConfig[];
          setColumns(newDefaultColumns.map(defaultCol => {
            const savedCol = savedColumns.find(sc => sc.id === defaultCol.id);
            return savedCol ? { ...defaultCol, enabled: savedCol.enabled } : defaultCol;
          }));
        } else {
          setColumns(newDefaultColumns);
        }
      } catch (error) {
        console.error('Failed to load column preferences:', error);
        setColumns(newDefaultColumns);
      }
    } else {
      setColumns(newDefaultColumns);
    }
  }, [assessmentDetails]);

  // AS-24: Save column preferences to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(COLUMN_PREFERENCES_KEY, JSON.stringify(columns));
    } catch (error) {
      console.error('Failed to save column preferences:', error);
    }
  }, [columns]);

  const handleToggleColumn = (columnId: string) => {
    setColumns(columns.map(col =>
      col.id === columnId ? { ...col, enabled: !col.enabled } : col
    ));
  };

  const isColumnEnabled = (columnId: string) => {
    return columns.find(c => c.id === columnId)?.enabled ?? true;
  };

  const enabledColumnsCount = columns.filter(c => c.enabled).length;

  // Check if columns are customized (different from default)
  const areColumnsCustomized = () => {
    if (columns.length === 0) return false;
    // Check if any column is disabled
    return columns.some(col => !col.enabled);
  };

  // Fetch assessment details to determine enabled rounds
  useEffect(() => {
    const fetchAssessmentDetails = async () => {
      try {
        const details = await assessmentService.get(assessmentId);
        setAssessmentDetails({
          hr_enabled: details.hr_enabled || false,
          technical_enabled: details.technical_enabled || false,
          coding_enabled: details.coding_enabled || false,
          hr_percentage: details.hr_percentage,
          technical_percentage: details.technical_percentage,
          coding_percentage: details.coding_percentage,
          passing_threshold: (details as any).passing_threshold ?? 70,
        });
      } catch (error) {
        console.error('Failed to fetch assessment details:', error);
      }
    };
    fetchAssessmentDetails();
  }, [assessmentId]);

  /* ── Job Version scope ────────────────────────────────────────────────────
     Results belong to an assessment, and an assessment is authored against one
     version of a JD — so "the results for this job" is the union of the
     results of every assessment in the JD's lineage, and a single job version
     is the subset authored against that version. The selector defaults to All
     Versions: the page reports the job, not whichever version the recruiter
     happened to arrive through.

     Nothing here is hardcoded. The versions come from the JD's own lineage
     endpoint (`/jd/{id}/lineage` — every republish is its own JD row with its
     own version number), and each version is asked for its assessments, which
     is the same per-version fan-out the Assessments page's version panel runs.
     Asking per version rather than once for the page's own `jd_id` is what
     finds the assessments authored against the OTHER versions: the list
     endpoint matches `jd_id` exactly, so one request only ever answers for one
     version of the job. */
  const [jobVersionScopes, setJobVersionScopes] = useState<JobVersionScope[]>([]);
  /**
   * Each scoped assessment's OWN version — `AssessmentResponse.version`, which
   * the backend increments on every edit/publish of that assessment.
   *
   * Read from the same per-version `list({ jd_id })` replies the scope is built
   * from, so the Assessment Version column costs no request of its own and can
   * never disagree with the assessment it names. Distinct from the JOB version
   * beside it: one is which version of the JOB the assessment was authored
   * against, this is which version of the ASSESSMENT the candidate sat.
   */
  const [assessmentVersionByAssessmentId, setAssessmentVersionByAssessmentId] = useState<Map<string, number>>(new Map());
  const [selectedJobVersion, setSelectedJobVersion] = useState<'all' | number>('all');
  /**
   * The Assessment Version scope, beside the Job Version one.
   *
   * A job version can hold several assessments, and each of those is itself
   * revised — so "which candidates sat v3 of the assessment" is a question the
   * Job Version selector cannot answer on its own. It narrows WITHIN the job
   * version scope rather than beside it: the options are the assessment
   * versions the current job-version selection actually contains, so the pair
   * reads as one path down the hierarchy (job → job version → assessment
   * version) and can never select a combination the job does not have.
   *
   * Opens on what the link named (`?assessment_version=`) when it named one.
   * Unlike the job version beside it this needs no lineage to resolve — the
   * parameter IS the version number — so it is read straight into the initial
   * state rather than applied from the effect below. A value the scope turns
   * out not to hold still reads as All (`effectiveAssessmentVersion`).
   */
  const [selectedAssessmentVersion, setSelectedAssessmentVersion] = useState<'all' | number>(() => {
    if (!assessmentVersionScope || assessmentVersionScope === 'all') return 'all';
    const named = Number(assessmentVersionScope);
    return Number.isFinite(named) && named > 0 ? named : 'all';
  });
  /* Results wait for the scope, so the first fetch is already the full set —
     otherwise the page would render this assessment's rows and then replace
     them, which is the flicker the version selector must not introduce. */
  const [jobVersionsLoaded, setJobVersionsLoaded] = useState(false);

  /* An arrival that NAMED its scope beats the restored one — the same
     precedence the assessments list gives `?tab=` over its own snapshot. The
     recruiter has just clicked a specific Results button; landing them on
     whichever version they last left this page on would answer a different
     question from the one they asked. Applied once, so changing the selector
     afterwards is not undone by a re-render. */
  const namesJobVersionScope = !!jobVersionScope;
  const namesAssessmentVersionScope = !!assessmentVersionScope;
  const jobVersionScopeApplied = useRef(false);

  useEffect(() => {
    let cancelled = false;

    /** Honour `?job_version_id=` once the lineage can resolve it to a version.
     *
     *  Defined inside the effect because that is its only caller — hoisted out,
     *  it is a new function on every render and so either a missing dependency
     *  or a reason for the effect to re-run on each one. */
    const applyJobVersionScope = (versionNumberByJdId: Map<string, number>) => {
      if (!jobVersionScope || jobVersionScopeApplied.current) return;
      jobVersionScopeApplied.current = true;
      if (jobVersionScope === 'all') {
        setSelectedJobVersion('all');
        return;
      }
      /* The JD row the link named, resolved through the job's own lineage. The
         page's own `jdId`/`jdVersion` answer for it when the lineage could not —
         the version row's Results button opens an assessment of that very
         version, so the two are the same JD row in the ordinary case. */
      const named =
        versionNumberByJdId.get(jobVersionScope)
        ?? (jobVersionScope === jdId ? jdVersion ?? undefined : undefined);
      /* A version the job does not have stays on All Versions rather than
         rendering an empty table for something that isn't there. */
      if (named !== undefined) setSelectedJobVersion(named);
    };

    /* The page's own assessment, on the version it was authored against.
       Whatever fails below, the page still shows the results it showed
       before — degraded to one version, never empty. */
    const ownScope: JobVersionScope[] = [{
      versionNumber: jdVersion ?? 1,
      assessmentIds: [assessmentId],
    }];
    /* The one assessment version the page knows without any lineage: its own.
       Whatever fails below, the Assessment Version column still names the rows
       it can rather than going blank. */
    const ownAssessmentVersions = () =>
      assessmentVersion != null
        ? new Map<string, number>([[assessmentId, assessmentVersion]])
        : new Map<string, number>();
    const loadJobVersions = async () => {
      if (!jdId) {
        if (!cancelled) {
          setJobVersionScopes(ownScope);
          setAssessmentVersionByAssessmentId(ownAssessmentVersions());
          applyJobVersionScope(new Map());
          setJobVersionsLoaded(true);
        }
        return;
      }
      try {
        let lineage: { id: string; version_number: number }[] = [];
        try {
          lineage = await jdService.getLineageVersions(jdId);
        } catch (error) {
          console.warn('[TalentFlow] Failed to load JD lineage for the Job Version selector:', error);
        }

        const versionIds = lineage.length
          ? [...new Set([jdId, ...lineage.map(v => v.id).filter(Boolean)])]
          : [jdId];
        const versionNumberByJdId = new Map(lineage.map(v => [v.id, v.version_number]));

        const responses = await Promise.all(
          versionIds.map(versionId =>
            assessmentService
              .list({ jd_id: versionId, page_size: 50 })
              /* One version failing must not lose the others — it contributes
                 nothing and the rest of the merge stands. */
              .catch(() => ({ items: [] })),
          ),
        );
        if (cancelled) return;

        /* Deduped by assessment id: if the endpoint ever widens a `jd_id`
           filter to the lineage, the extra copies arrive as duplicates.

           Which version an assessment belongs to is resolved from the JD ROW
           it points at — that row's lineage `version_number` — and only then
           from the assessment's `jd_version`. That field is a snapshot the
           backend stamps at creation, and it comes back as 1 for assessments
           authored against a later version, so reading it first labelled every
           row V1. Same precedence as `AssessmentVersionHistoryPanel.jobVersionOf`
           and `AssessmentDetailsView` — id first, number second. */
        const versionByAssessmentId = new Map<string, number>();
        /* The assessments' own versions, off the very rows being merged — see
           `assessmentVersionByAssessmentId`. Only set where the record carries
           one: a missing version is reported as a dash rather than as v1. */
        const assessmentVersionById = new Map<string, number>();
        responses.forEach((response, index) => {
          for (const row of (response.items || [])) {
            if (!row?.id) continue;
            versionByAssessmentId.set(
              row.id,
              versionNumberByJdId.get(row.jd_id ?? versionIds[index])
                ?? versionNumberByJdId.get(versionIds[index])
                ?? row.jd_version
                ?? 1,
            );
            if (typeof row.version === 'number') assessmentVersionById.set(row.id, row.version);
          }
        });
        // The assessment the page was opened on is always in scope.
        if (!versionByAssessmentId.has(assessmentId)) {
          versionByAssessmentId.set(assessmentId, versionNumberByJdId.get(jdId) ?? jdVersion ?? 1);
        }
        /* Same for its own version, which the page already holds from the
           record it was opened with (`assessmentVersion`, the number the header
           badges). Only a fallback: where the list reply carried the row, that
           is what was used above. */
        if (!assessmentVersionById.has(assessmentId) && assessmentVersion != null) {
          assessmentVersionById.set(assessmentId, assessmentVersion);
        }
        setAssessmentVersionByAssessmentId(assessmentVersionById);

        /* Every version the JD actually has, plus any version an assessment
           names that the lineage did not return. A version with no assessments
           is still a version of this job and belongs in the dropdown. */
        const versionNumbers = [...new Set([
          ...lineage.map(v => v.version_number),
          ...versionByAssessmentId.values(),
        ])].sort((a, b) => a - b);

        setJobVersionScopes(versionNumbers.map(versionNumber => ({
          versionNumber,
          assessmentIds: [...versionByAssessmentId.entries()]
            .filter(([, version]) => version === versionNumber)
            .map(([id]) => id),
        })));
        /* Now that the lineage can name the version the link asked for. Set
           before `jobVersionsLoaded`, so the results fetch below runs once, on
           the scope the recruiter actually clicked — rather than fetching the
           whole job and replacing it a moment later. */
        applyJobVersionScope(versionNumberByJdId);
      } catch (error) {
        console.warn('[TalentFlow] Failed to resolve the job versions for these results:', error);
        if (!cancelled) {
          setJobVersionScopes(ownScope);
          setAssessmentVersionByAssessmentId(ownAssessmentVersions());
          applyJobVersionScope(new Map());
        }
      } finally {
        if (!cancelled) setJobVersionsLoaded(true);
      }
    };

    loadJobVersions();
    return () => { cancelled = true; };
  }, [assessmentId, jdId, jdVersion, assessmentVersion, jobVersionScope]);

  /** Which job version each scoped assessment was authored against — what
   *  stamps a merged row with the version it belongs to. */
  const jobVersionByAssessmentId = useMemo(() => {
    const byId = new Map<string, number>();
    for (const scope of jobVersionScopes) {
      for (const id of scope.assessmentIds) byId.set(id, scope.versionNumber);
    }
    return byId;
  }, [jobVersionScopes]);

  /* The selection the page can actually honour. A restored selection — or one
     left over from before a version went away — that the JD no longer has
     reads as All Versions rather than as an empty table for a version that
     isn't there. Derived rather than corrected in state, so the selector and
     the rows can never disagree for a render. */
  const effectiveJobVersion: 'all' | number =
    selectedJobVersion !== 'all'
    && jobVersionsLoaded
    && !jobVersionScopes.some(scope => scope.versionNumber === selectedJobVersion)
      ? 'all'
      : selectedJobVersion;

  /**
   * Whether the version scopes are offered at all.
   *
   * A dropdown earns its place only where there is something to choose between.
   * A page opened for ONE assessment — the in-page view reached from an
   * assessment's details, which is given no JD to walk — has none: its job has
   * exactly one scope entry, so "All Versions" and "Job Version V1" selected the
   * same rows, a control that looked like a filter and filtered nothing.
   *
   * `> 1`, not `> 0`, is what covers that without a flag for it. The count comes
   * from the scope itself, so a job that genuinely has one version hides the
   * control too — there is nothing there to choose either.
   *
   * It does NOT depend on which version the link named. Both entry points — the
   * Job List row's Result and the Assessment Versions table's Results icon —
   * land on the same view with the same controls; they differ only in what those
   * controls open on, so a recruiter who arrived from one assessment version can
   * read the selection that produced their rows and widen it in place.
   *
   * The count does not move with the selection (it is read from the job-version
   * scope, not from the narrowed set), so a dropdown cannot vanish under the
   * recruiter the moment they use it.
   */
  const showsJobVersionSelect = jobVersionScopes.length > 1;

  /** The assessments the JOB VERSION selection covers, before the assessment
   *  version narrows it. */
  const jobScopedAssessmentIds = useMemo(() => {
    if (effectiveJobVersion === 'all') {
      return [...new Set(jobVersionScopes.flatMap(scope => scope.assessmentIds))];
    }
    /* By the version NUMBER, which is what the selector holds — a link that
       named a JD row id was resolved to this number on arrival, so a selection
       made here and one arrived with are the same thing and cannot read
       differently. */
    return jobVersionScopes.find(scope => scope.versionNumber === effectiveJobVersion)?.assessmentIds ?? [];
  }, [jobVersionScopes, effectiveJobVersion]);

  /**
   * The assessment versions the Assessment Version selector offers: the
   * versions present in the job-version scope above, ascending.
   *
   * Read off the assessments themselves, so picking Job Version V2 leaves only
   * the revisions V2's assessments actually have. Nothing is listed that the
   * current scope cannot produce a row for.
   */
  const assessmentVersionOptions = useMemo(() => {
    const versions = new Set<number>();
    for (const id of jobScopedAssessmentIds) {
      const version = assessmentVersionByAssessmentId.get(id);
      if (version != null) versions.add(version);
    }
    return [...versions].sort((a, b) => a - b);
  }, [jobScopedAssessmentIds, assessmentVersionByAssessmentId]);

  /* Same rule as `effectiveJobVersion`: a selection the current scope cannot
     honour — one left from before the job version changed, restored from a
     previous visit, or named by a link whose job version holds no such revision
     — reads as All rather than as an empty table. */
  const effectiveAssessmentVersion: 'all' | number =
    selectedAssessmentVersion !== 'all'
    && jobVersionsLoaded
    && !assessmentVersionOptions.includes(selectedAssessmentVersion)
      ? 'all'
      : selectedAssessmentVersion;

  /** The Assessment Version scope, on the same rule as the job version's: a
   *  choice only where the scope holds more than one revision. A single
   *  revision made "All Assessment Versions" and "Assessment V1" the same set.
   *  See `showsJobVersionSelect`. */
  const showsAssessmentVersionSelect = assessmentVersionOptions.length > 1;

  /* The More Filters badge: one per filter in the panel that is narrowing the
     list. The date range counts once, From and To together. A version scope
     counts only where its select is on offer. `roundFilters` values, not keys:
     picking "All" leaves the key behind as `undefined`. */
  const activeFilterCount =
    (showsJobVersionSelect && effectiveJobVersion !== 'all' ? 1 : 0) +
    (showsAssessmentVersionSelect && effectiveAssessmentVersion !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (passFailFilter !== 'all' ? 1 : 0) +
    Object.values(roundFilters).filter(Boolean).length +
    (dateFrom || dateTo ? 1 : 0);
  /* What the panel's Clear All resets — the same set, and the same handler,
     the filter row's Clear button always had (search included). */
  const hasAnyFilterOrSearch =
    Object.keys(roundFilters).length > 0 || !!searchQuery || statusFilter !== 'all' ||
    passFailFilter !== 'all' || !!dateFrom || !!dateTo;
  const clearAllFilters = () => {
    setRoundFilters({});
    setSearchQuery('');
    setStatusFilter('all');
    setPassFailFilter('all');
    setDateFrom('');
    setDateTo('');
    setCurrentPage(1);
  };

  /** The assessments whose results the current selection covers. */
  const scopedAssessmentIds = useMemo(() => {
    if (effectiveAssessmentVersion === 'all') return jobScopedAssessmentIds;
    /* Narrowed by the assessments' own versions rather than by filtering rows
       after the fact: the scope IS the set of assessments fetched, so the stat
       cards, the tally, the export and the table all answer for the same
       selection — exactly as they do for the job version. */
    return jobScopedAssessmentIds.filter(
      id => assessmentVersionByAssessmentId.get(id) === effectiveAssessmentVersion,
    );
  }, [jobScopedAssessmentIds, assessmentVersionByAssessmentId, effectiveAssessmentVersion]);

  /* A stable dependency for the results fetch: the effect must re-run when the
     scope's CONTENTS change, not every time the memo mints a new array. */
  const scopeKey = scopedAssessmentIds.join(',');


  /* Out-of-order replies are the other way a version switch shows stale rows:
     All Versions fans out over more assessments than one version does, so a
     slow "all" can land after the fast "V2" that replaced it. Only the newest
     request is allowed to write. */
  const resultsRequestRef = useRef(0);

  // Persist the list's view state + scroll so returning from a candidate's
  // details lands the recruiter exactly where they left off. Keyed per
  // assessment so different assessments keep independent filters/scroll.
  /* Its own snapshot when embedded: the tab and the full route are two places
     the same assessment's results are read, each inside a different scroll
     container, so sharing one key would have the tab restore the route's scroll
     offset into a page that is nothing like it. */
  const persistKey = `assessment-results:${assessmentId}${embedded ? ':embedded' : ''}`;
  const rootRef = useScrollRestoration<HTMLDivElement>(persistKey, !isLoading, [pageView]);
  useListStatePersistence(
    persistKey,
    { pageView, statusFilter, searchQuery, sortField, sortDirection, currentPage, passFailFilter, dateFrom, dateTo, roundFilters, selectedJobVersion, selectedAssessmentVersion },
    (s) => {
      if (s.pageView === 'cards' || s.pageView === 'list') setPageView(s.pageView);
      /* Everything else restores as before. The job version does not when the
         link named one: the snapshot is for "I opened a candidate and came
         back", while a Results button that named its scope has just asked for
         a specific job version — or for all of them — and restoring the last
         visit's selection over it would answer the wrong question. */
      if (!namesJobVersionScope && (s.selectedJobVersion === 'all' || typeof s.selectedJobVersion === 'number')) {
        setSelectedJobVersion(s.selectedJobVersion);
      }
      /* And not when the link named an assessment version either, for exactly
         the same reason: the Results icon has just asked for one revision — or
         the Job List row for all of them — and the last visit's selection would
         answer a different question. */
      if (!namesAssessmentVersionScope && (s.selectedAssessmentVersion === 'all' || typeof s.selectedAssessmentVersion === 'number')) {
        setSelectedAssessmentVersion(s.selectedAssessmentVersion);
      }
      if (typeof s.statusFilter === 'string') setStatusFilter(s.statusFilter as typeof statusFilter);
      if (typeof s.searchQuery === 'string') setSearchQuery(s.searchQuery);
      if (typeof s.sortField === 'string') setSortField(s.sortField as typeof sortField);
      if (s.sortDirection === 'asc' || s.sortDirection === 'desc') setSortDirection(s.sortDirection);
      if (typeof s.currentPage === 'number') setCurrentPage(s.currentPage);
      if (typeof s.passFailFilter === 'string') setPassFailFilter(s.passFailFilter as typeof passFailFilter);
      if (typeof s.dateFrom === 'string') setDateFrom(s.dateFrom);
      if (typeof s.dateTo === 'string') setDateTo(s.dateTo);
      if (s.roundFilters && typeof s.roundFilters === 'object') setRoundFilters(s.roundFilters as typeof roundFilters);
    },
  );

  /* Fetch the results of every assessment in scope and merge them.
     The server-side filters still go out with each request — one per scoped
     assessment, in parallel — so search, status, pass/fail and the date range
     are answered by the backend exactly as before. What moved to the client is
     PAGING: a page of a merged set cannot be asked for per assessment, so each
     request asks for the whole (filtered) set and the table pages over it. */
  useEffect(() => {
    /* Wait for the scope. Fetching this assessment first and the job's other
       versions a moment later is precisely the flicker the selector must not
       have. */
    if (!jobVersionsLoaded) return;
    const requestId = ++resultsRequestRef.current;
    const fetchResults = async () => {
      if (!initialLoadDone.current) {
        setIsLoading(true);
      } else {
        setIsFetching(true);
      }
      try {
        // Build server-side filter parameters
        const params: any = {
          page: 1,
          page_size: RESULTS_FETCH_PAGE_SIZE,
        };

        // Add server-supported filters
        if (searchQuery.trim()) {
          params.search = searchQuery.trim();
        }

        /* NOT `status_filter`. The status is filtered in the browser instead —
           see `filteredCandidates` — because the summary cards are counted from
           what this fetch returns.
           Sent to the server, picking the In Progress card narrowed the fetch to
           in-progress attempts, and then every card recounted that narrowed set:
           Total Candidates fell from 4 to 0 beside an In Progress card reading 0,
           and Completed and Not Started emptied with it. The cards describe the
           CONTEXT (this job, job version or assessment); only the table is meant
           to answer the status selection. Keeping the whole set here is what lets
           the four counts stay put while the rows below narrow — and it makes a
           card click instant, since there is nothing to refetch. */

        // Pass/Fail filter (convert to score filter)
        if (passFailFilter === 'pass') {
          params.passed = true;
        } else if (passFailFilter === 'fail') {
          params.passed = false;
        }

        // Date range filter — append time so FastAPI parses as valid datetime
        if (dateFrom) params.date_from = `${dateFrom}T00:00:00`;
        if (dateTo) params.date_to = `${dateTo}T23:59:59`;

        const responses = await Promise.all(
          scopedAssessmentIds.map(id =>
            assessmentService
              .listResults(id, params)
              .then(response => ({ id, response }))
              /* One assessment being unavailable must not empty the page —
                 the rest of the job's versions still list. */
              .catch(error => {
                console.warn('[TalentFlow] Failed to load results for an assessment in scope:', error);
                return { id, response: null };
              }),
          ),
        );
        // A reply from a selection the user has already moved off must not land.
        if (requestId !== resultsRequestRef.current) return;

        // A job version with no assessments has no results — an empty table,
        // not the previous selection's rows left standing.
        if (responses.length === 0) {
          setCandidateResults([]);
          setApiStats({ completed_count: 0, in_progress_count: 0, pending_count: 0, average_score: null });
        } else {
          // Map API response to component format
          const mapped: CandidateResult[] = responses.flatMap(({ id: sourceAssessmentId, response }) => (response?.items ?? []).map((item: any) => {
            // Determine status: attempt status + scoring status
            const scoringStatus: string = item.scoring_status || 'pending';
            let status: 'Completed' | 'In Progress' | 'Pending' = 'Completed';
            if (item.status === 'pending') {
              status = 'Pending';
            } else if (item.status === 'in_progress') {
              status = 'In Progress';
            } else if (item.status === 'completed') {
              // Attempt done — but only show Completed once AI scoring is also done
              status = scoringStatus === 'completed' ? 'Completed' : 'In Progress';
            }

            // Hide scores while AI scoring is still running.
            // Round at the data source so every render site (table cells,
            // mobile card view, hover popovers, exports) shows the same
            // whole-number percentage. Recruiters were seeing 69.23% on the
            // Results page and 69% in the Track Invites popup; rounding here
            // keeps it consistent everywhere.
            const scoringDone = scoringStatus === 'completed';
            const tech_score = scoringDone && item.technical_score != null ? Math.round(Number(item.technical_score)) : undefined;
            const coding_score = scoringDone && item.coding_score != null ? Math.round(Number(item.coding_score)) : undefined;
            const hr_score = scoringDone && item.hr_score != null ? Math.round(Number(item.hr_score)) : undefined;

            // Format duration properly
            let duration = '-';
            if (item.time_spent_seconds && item.time_spent_seconds > 0) {
              const minutes = Math.floor(item.time_spent_seconds / 60);
              const seconds = item.time_spent_seconds % 60;
              if (minutes > 0) {
                duration = `${minutes}m ${seconds}s`;
              } else {
                duration = `${seconds}s`;
              }
            } else if (status === 'Pending') {
              duration = '-';
            } else if (status === 'In Progress') {
              duration = 'In Progress';
            }

            return {
              id: item.id || item.invitation_id,  // Use invitation_id for pending
              invitation_id: item.invitation_id,
              candidateDisplayId: item.candidate_display_id,
              name: item.candidate_name || 'Unknown',
              email: item.candidate_email || '',
              phone: item.candidate_phone || '',
              // How the candidate was actually invited — resume_id is stored
              // only for invites sent from a resume. See assessmentInviteSource.
              inviteSource: item.resume_id ? 'resume' : 'email',
              score: scoringDone ? Number(item.overall_score) || 0 : 0,
              totalScore: 100,
              percentage: scoringDone ? Number(item.overall_score) || 0 : 0,
              tech_score,
              coding_score,
              hr_score,
              status,
              scoring_status: scoringStatus,
              sent_at: item.sent_at || undefined,
              started_at: item.started_at || undefined,
              completed_at: item.completed_at || undefined,
              created_at: item.created_at || undefined,
              completedDate: (() => {
                const dateStr = item.completed_at || item.started_at;
                if (!dateStr) return status === 'Pending' ? 'Not started' : 'N/A';
                return formatISTDate(dateStr);
              })(),
              duration,
              sections: [
                assessmentDetails?.technical_enabled && tech_score != null && {
                  name: 'Technical Section',
                  score: tech_score,
                  totalScore: 100,
                  percentage: tech_score,
                  questions: []
                },
                assessmentDetails?.coding_enabled && coding_score != null && {
                  name: 'Coding Section',
                  score: coding_score,
                  totalScore: 100,
                  percentage: coding_score,
                  questions: []
                }
              ].filter(Boolean) as SectionResult[],
              round: 1,
              roundName: 'Round 1',
              /* Which assessment this attempt came from. Rows can span the
                 job's versions, so every per-row call is addressed with this. */
              assessmentId: sourceAssessmentId,
              jobVersion: jobVersionByAssessmentId.get(sourceAssessmentId),
              /* Stamped per row like the job version beside it, from the same
                 assessment record — so under All Versions each row reports the
                 assessment revision its own candidate sat. */
              assessmentVersion: assessmentVersionByAssessmentId.get(sourceAssessmentId),
            };
          }));

          /* Newest first, across the merged set. Attempts arrive grouped by
             assessment, and the column sort below is stable, so without a base
             order the rows of one version would sit in a block above another's
             whenever the sort key ties. */
          mapped.sort((a, b) => {
            const at = new Date(a.completed_at || a.started_at || a.created_at || 0).getTime();
            const bt = new Date(b.completed_at || b.started_at || b.created_at || 0).getTime();
            return bt - at;
          });
          setCandidateResults(mapped);

          /* Stats over the whole scoped set, from the mapped rows so
             "processing" attempts show as In Progress. The rows are the full
             filtered set now (paging is client-side), so these count every
             candidate in scope rather than the page's worth. */
          const completed = mapped.filter((c: CandidateResult) => c.status === 'Completed');
          setApiStats({
            completed_count: completed.length,
            in_progress_count: mapped.filter((c: CandidateResult) => c.status === 'In Progress').length,
            pending_count: mapped.filter((c: CandidateResult) => c.status === 'Pending').length,
            average_score: completed.length
              ? Math.round(completed.reduce((sum, c) => sum + c.percentage, 0) / completed.length)
              : null,
          });
        }
      } catch (error) {
        console.error('Failed to fetch assessment results:', error);
        if (requestId !== resultsRequestRef.current) return;
        // Keep empty results on error
        setCandidateResults([]);
      } finally {
        if (requestId === resultsRequestRef.current) {
          setIsLoading(false);
          setIsFetching(false);
          initialLoadDone.current = true;
        }
      }
    };

    fetchResults();
    /* `statusFilter` is deliberately absent: it no longer goes to the server, so
       a status card click must not refetch — refetching is what replaced the
       full set the cards are counted from. */
  }, [jobVersionsLoaded, scopeKey, jobVersionByAssessmentId, assessmentVersionByAssessmentId, searchQuery, passFailFilter, dateFrom, dateTo]);

  // Canonical status → Badge variant (shared mapping so statuses don't drift).
  const getStatusVariant = (status: string): 'success' | 'info' | 'warning' | 'muted' | 'destructive' => {
    switch (status) {
      case 'Completed': return 'success';
      case 'In Progress': return 'info';
      case 'Pending': return 'warning';
      case 'Failed':
      case 'Abandoned': return 'destructive';
      default: return 'muted';
    }
  };

  /** What a result status reads as on screen.
   *
   *  'Pending' is the STORED value and stays one: it is what `statusFilter`
   *  compares against, what the summary card's drill-in passes, what gates the
   *  row from opening a result it has no attempt for, and what the API takes as
   *  `status_filter=pending`. Renaming the value would have had to be matched in
   *  every one of those places and in the backend. What changes is the reading —
   *  "Not Started", which is what the state means: invited, never begun. One
   *  constant, so the card, the badge and the filter option cannot drift apart. */
  const PENDING_STATUS_LABEL = 'Not Started';
  const statusLabel = (status: CandidateResult['status']) =>
    status === 'Pending' ? PENDING_STATUS_LABEL : status;

  const formatTimelineDate = (dateStr: string | undefined) => {
    if (!dateStr) return '';
    // Timeline shows precise event times (incl. seconds) for assessment timing.
    return formatISTWithSeconds(dateStr);
  };

  const getTimelineSummary = (candidate: CandidateResult) => {
    const entries: string[] = [];
    if (candidate.sent_at) entries.push(`Sent: ${formatTimelineDate(candidate.sent_at)}`);
    if (candidate.started_at) entries.push(`Started: ${formatTimelineDate(candidate.started_at)}`);
    if (candidate.completed_at) entries.push(`Completed: ${formatTimelineDate(candidate.completed_at)}`);
    if (entries.length === 0) {
      entries.push(candidate.created_at ? `Created: ${formatTimelineDate(candidate.created_at)}` : '-');
    }
    return entries.join(' | ');
  };

  const canDownloadResultPdf = (candidate: CandidateResult): boolean => {
    return candidate.status === 'Completed' && candidate.scoring_status === 'completed';
  };

  // Handle delete result
  const handleDeleteResult = async (resultId: string, candidateName: string) => {
    if (!await dialog.confirm({
      title: 'Delete Result',
      message: 'Are you sure you want to delete this result?\nThis action cannot be undone.',
      variant: 'delete',
      confirmText: 'Delete Result',
      item: { label: 'CANDIDATE RESULT', name: candidateName },
      warningNote: 'Deleting this result will permanently remove it and cannot be restored.',
    })) {
      return;
    }
    setIsDeleting(resultId);
    try {
      const deletedCandidate = candidateResults.find(c => c.id === resultId);
      // The row's own assessment — rows can span the job's versions.
      await assessmentService.deleteResult(deletedCandidate?.assessmentId ?? assessmentId, resultId);
      // Remove from local state
      setCandidateResults(prev => prev.filter(c => c.id !== resultId));
      // Update stats
      if (deletedCandidate) {
        setApiStats(prev => ({
          ...prev,
          completed_count: Math.max(0, prev.completed_count - (deletedCandidate.status === 'Completed' ? 1 : 0)),
          in_progress_count: Math.max(0, prev.in_progress_count - (deletedCandidate.status === 'In Progress' ? 1 : 0)),
          pending_count: Math.max(0, prev.pending_count - (deletedCandidate.status === 'Pending' ? 1 : 0)),
        }));
      }
      toast.success(`Result for ${candidateName} deleted successfully.`);
    } catch (error: any) {
      console.error('Failed to delete result:', error);
      const msg = error?.message || 'Failed to delete result. Please try again.';
      toast.error(msg);
    } finally {
      setIsDeleting(null);
    }
  };

  // Handle row selection
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      // The rows on screen — the header checkbox is checked against this page.
      setSelectedRows(paginatedCandidates.map(c => c.id));
    } else {
      setSelectedRows([]);
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedRows(prev => [...prev, id]);
    } else {
      setSelectedRows(prev => prev.filter(rowId => rowId !== id));
    }
  };

  // AS-25: Handle PDF download for individual candidate result
  const handleDownloadPDF = async (candidateId: string, candidateDisplayId?: string) => {
    if (downloadingPDF) return;

    const candidate = candidateResults.find(c => c.id === candidateId);
    if (!candidate || !canDownloadResultPdf(candidate)) {
      toast.error('PDF is available only after scoring is completed.');
      return;
    }

    setDownloadingPDF(candidateId);
    try {
      // The row's own assessment — rows can span the job's versions.
      const blob = await assessmentService.exportPDF(candidate.assessmentId, candidateId);

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeIdentifier = candidateDisplayId?.replace(/[^a-zA-Z0-9]/g, '_') || `CID_${candidateId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const safeJdTitle = jdTitle?.replace(/[^a-zA-Z0-9]/g, '_') || 'Assessment';
      const pdfTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      link.download = `${safeIdentifier}_${safeJdTitle}_${pdfTimestamp}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download PDF:', error);
      toast.error('Failed to download PDF report. Please try again.');
    } finally {
      setDownloadingPDF(null);
    }
  };

  // AS-26: Handle bulk PDF download as ZIP
  const handleDownloadBulkPDFs = async () => {
    if (downloadingBulkPDF || selectedRows.length === 0) return;

    const eligibleCandidates = candidateResults.filter(c => selectedRows.includes(c.id) && canDownloadResultPdf(c));
    if (eligibleCandidates.length === 0) {
      toast.error('Select at least one fully scored result to download PDFs.');
      return;
    }

    if (eligibleCandidates.length !== selectedRows.length) {
      toast.info(`${selectedRows.length - eligibleCandidates.length} result(s) were skipped because scoring is not completed yet.`);
    }

    setDownloadingBulkPDF(true);
    try {
      /* The endpoint takes result ids belonging to ONE assessment, and a
         selection can span the job's versions — so the rows are grouped by the
         assessment they came from and each group asked for its own archive.
         A selection within one version is a single request, exactly as before. */
      const byAssessment = new Map<string, string[]>();
      for (const candidate of eligibleCandidates) {
        const ids = byAssessment.get(candidate.assessmentId) ?? [];
        ids.push(candidate.id);
        byAssessment.set(candidate.assessmentId, ids);
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const safeJd = jdTitle?.replace(/[^a-zA-Z0-9]/g, '_') || assessmentTitle.replace(/\s+/g, '_');

      for (const [sourceAssessmentId, resultIds] of byAssessment) {
        const blob = await assessmentService.exportResultsBulkPDFs(sourceAssessmentId, resultIds);

        // Create download link
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        /* One archive per job version when the selection spans several, named
           for it so the recruiter can tell them apart. */
        const version = jobVersionByAssessmentId.get(sourceAssessmentId);
        const versionSuffix = byAssessment.size > 1 && version != null ? `_v${version}` : '';
        link.download = `${safeJd}${versionSuffix}_Reports_${timestamp}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Failed to download bulk PDFs:', error);
      toast.error('Failed to download PDF reports. Please try again.');
    } finally {
      setDownloadingBulkPDF(false);
    }
  };

  // Handle format selection - move to scope selection
  const handleFormatSelect = (format: 'csv' | 'excel') => {
    setSelectedFormat(format);
    setExportStep('scope');
  };

  /** The server-side filters an export carries, as the endpoint takes them. */
  type ExportFilters = {
    search?: string;
    status_filter?: string;
    passed?: boolean;
    result_ids?: string[];
  };

  /** The rows of an export, grouped by the assessment each came from. */
  const groupRowsByAssessment = (rows: CandidateResult[]) => {
    const groups = new Map<string, string[]>();
    for (const row of rows) {
      const ids = groups.get(row.assessmentId) ?? [];
      ids.push(row.id);
      groups.set(row.assessmentId, ids);
    }
    return groups;
  };

  /**
   * Download an export of the current scope.
   *
   * The endpoint exports ONE assessment, and under All Versions the table's
   * rows come from several — so the export is asked per assessment and the
   * files named for their job version. A scope of one assessment is a single
   * file with the name it has always had, which is every scope that existed
   * before the Job Version selector.
   *
   * `null` for a group's ids means "everything this assessment has that the
   * filters match"; a list of ids pins the export to exactly those rows.
   */
  const downloadScopedExport = async (
    groups: Map<string, string[] | null>,
    baseFilters: ExportFilters,
    fileLabel: string,
  ) => {
    const enabledColumnIds = columns.filter(col => col.enabled).map(col => col.id);
    const sorting = { sort_by: sortField, sort_order: sortDirection };
    console.log('[EXPORT] Exporting columns:', enabledColumnIds, 'from assessments:', [...groups.keys()]);
    const extension = selectedFormat === 'csv' ? 'csv' : 'xlsx';
    const stamp = new Date().toISOString().slice(0, 10);

    for (const [sourceAssessmentId, resultIds] of groups) {
      const filters: ExportFilters = { ...baseFilters };
      if (resultIds) filters.result_ids = resultIds;

      const blob = await assessmentService.exportResults(
        sourceAssessmentId,
        selectedFormat,
        false,
        enabledColumnIds,
        filters,
        sorting
      );

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const version = jobVersionByAssessmentId.get(sourceAssessmentId);
      const versionSuffix = groups.size > 1 && version != null ? `_v${version}` : '';
      link.download = `${assessmentTitle.replace(/\s+/g, '_')}${versionSuffix}_${fileLabel}_${stamp}.${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }
  };

  // Export current page only
  const handleExportCurrentPage = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const _toastId = toast.loading('Preparing export… this may take a moment for large datasets.');
    try {
      // Get current page candidates
      const currentPageCandidates = paginatedCandidates;

      // Build filters object (same as all filtered)
      const filters: ExportFilters = {};
      if (searchQuery.trim()) filters.search = searchQuery.trim();
      if (statusFilter !== 'all') filters.status_filter = statusFilter.toLowerCase().replace(' ', '_');
      if (passFailFilter === 'pass') filters.passed = true;
      else if (passFailFilter === 'fail') filters.passed = false;

      /* Pinned to the rows on screen: paging is client-side now, so the page
         the recruiter is looking at is something only the client can name. */
      await downloadScopedExport(
        groupRowsByAssessment(currentPageCandidates),
        filters,
        'CurrentPage'
      );

      const formatName = selectedFormat === 'csv' ? 'CSV' : 'Excel';
      toast.success(`Current page exported to ${formatName} successfully! (${currentPageCandidates.length} results)`, { id: _toastId });
      setShowExportModal(false);
      setExportStep('format');
    } catch (error) {
      console.error('Failed to export current page:', error);
      toast.error('Failed to export results. Please try again.', { id: _toastId });
    } finally {
      setIsExporting(false);
    }
  };

  // Export all filtered results
  const handleExportAllFiltered = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const _toastId = toast.loading('Preparing export of all filtered results…');
    try {
      // Build filters object
      const filters: ExportFilters = {};
      if (searchQuery.trim()) filters.search = searchQuery.trim();
      if (statusFilter !== 'all') filters.status_filter = statusFilter.toLowerCase().replace(' ', '_');
      if (passFailFilter === 'pass') filters.passed = true;
      else if (passFailFilter === 'fail') filters.passed = false;

      console.log('[EXPORT] Filters:', filters);

      /* Every assessment in scope, each exporting everything the filters
         match — which under All Versions is the whole job, not just the
         version the page was opened on. */
      await downloadScopedExport(
        new Map(scopedAssessmentIds.map(id => [id, null])),
        filters,
        'AllResults'
      );

      const formatName = selectedFormat === 'csv' ? 'CSV' : 'Excel';
      toast.success(`All filtered results exported to ${formatName} successfully! (${filteredCandidates.length} results including in-progress)`, { id: _toastId });
      setShowExportModal(false);
      setExportStep('format');
    } catch (error) {
      console.error('Failed to export all results:', error);
      toast.error('Failed to export results. Please try again.', { id: _toastId });
    } finally {
      setIsExporting(false);
    }
  };

  // Export only the selected candidates
  const handleExportSelected = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const _toastId = toast.loading('Preparing export of selected results…');
    try {
      /* The selected rows, asked of the assessments they actually belong to —
         a selection can span the job's versions. */
      await downloadScopedExport(
        groupRowsByAssessment(candidateResults.filter(c => selectedRows.includes(c.id))),
        {},
        'Selected'
      );

      const formatName = selectedFormat === 'csv' ? 'CSV' : 'Excel';
      toast.success(`${selectedRows.length} selected candidate${selectedRows.length > 1 ? 's' : ''} exported to ${formatName} successfully!`, { id: _toastId });
      setShowExportModal(false);
      setExportStep('format');
    } catch (error) {
      console.error('Failed to export selected candidates:', error);
      toast.error('Failed to export results. Please try again.', { id: _toastId });
    } finally {
      setIsExporting(false);
    }
  };

  const getScoreColor = (percentage: number) => {
    if (percentage >= 80) return 'text-success';
    if (percentage >= 60) return 'text-brand-blue';
    if (percentage >= 40) return 'text-brand-orange-deep';
    return 'text-destructive';
  };

  const passingThreshold = assessmentDetails?.passing_threshold ?? 70;

  const getMobileOverallScore = (candidate: CandidateResult) => {
    if (candidate.status !== 'Completed' || candidate.scoring_status !== 'completed') return null;
    return candidate.percentage;
  };

  const getMobilePassFail = (candidate: CandidateResult) => {
    const overallScore = getMobileOverallScore(candidate);
    if (overallScore === null) return null;
    const passingThreshold = assessmentDetails?.passing_threshold ?? 70;
    return overallScore >= passingThreshold ? 'Pass' : 'Fail';
  };

  // Reset to page 1 when filters change (MUST be before any early returns)
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, passFailFilter, roundFilters, dateFrom, dateTo, selectedJobVersion, selectedAssessmentVersion]);

  // Use API results only (no mock data)
  const displayResults = candidateResults;

  // Loading state
  if (isLoading) {
    return <AssessmentResultsSkeleton />;
  }

  // AS-23: Handle sort toggle
  const handleSort = (field: 'name' | 'score' | 'status' | 'date') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    // Note: Page reset handled by filter change effect above
  };

  // Server has already applied: search, status filter, pass/fail filter
  // Only apply client-side filters that server doesn't support (round-based percentage ranges)
  let filteredCandidates = displayResults;

  /* Status filtering (CLIENT-SIDE, moved off the request).
     What the status cards and the Status dropdown select. It narrows the ROWS
     only — `displayResults` above is the whole scoped set and stays that way,
     which is what the summary cards are counted from. Same comparison the counts
     below make, against the same stored values ('Pending' included — see
     `statusLabel`), so the card's number and the rows it opens cannot disagree. */
  if (statusFilter !== 'all') {
    filteredCandidates = filteredCandidates.filter(candidate => candidate.status === statusFilter);
  }

  // Round-based filtering with percentage ranges (CLIENT-SIDE ONLY)
  if (Object.keys(roundFilters).length > 0) {
    filteredCandidates = filteredCandidates.filter(candidate => {
      // Check if candidate meets ALL specified round filters (HR removed - only Tech and Coding)
      let meetsAllFilters = true;

      // Check Technical round filter
      if (roundFilters.technical !== undefined && roundFilters.technical !== 'all') {
        const techScore = candidate.tech_score;
        if (techScore === undefined) {
          meetsAllFilters = false;
        } else {
          const range = roundFilters.technical;
          if (range === '50-70' && !(techScore > 50 && techScore < 70)) {
            meetsAllFilters = false;
          } else if (range === '70-90' && !(techScore >= 70 && techScore < 90)) {
            meetsAllFilters = false;
          } else if (range === '90+' && techScore < 90) {
            meetsAllFilters = false;
          }
        }
      }

      // Check Coding round filter
      if (roundFilters.coding !== undefined && roundFilters.coding !== 'all') {
        const codingScore = candidate.coding_score;
        if (codingScore === undefined) {
          meetsAllFilters = false;
        } else {
          const range = roundFilters.coding;
          if (range === '50-70' && !(codingScore > 50 && codingScore < 70)) {
            meetsAllFilters = false;
          } else if (range === '70-90' && !(codingScore >= 70 && codingScore < 90)) {
            meetsAllFilters = false;
          } else if (range === '90+' && codingScore < 90) {
            meetsAllFilters = false;
          }
        }
      }

      return meetsAllFilters;
    });
  }

  // Client-side sort (applied to the whole scoped set, which is then paged)
  filteredCandidates = [...filteredCandidates].sort((a, b) => {
    let comparison = 0;
    switch (sortField) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'score':
        comparison = a.percentage - b.percentage;
        break;
      case 'status':
        comparison = a.status.localeCompare(b.status);
        break;
      case 'date':
        comparison = new Date(a.completedDate).getTime() - new Date(b.completedDate).getTime();
        break;
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  /* Paged on the client: the rows are the merged, filtered results of every
     assessment in scope, which no single server page can express. */
  const totalItems = filteredCandidates.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  /* A page number the current set can honour. A restored page, or one the user
     was on when a narrower Job Version was picked, can sit past the end — the
     table shows the last page rather than an empty one. */
  const safePage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safePage - 1) * pageSize;
  const paginatedCandidates = filteredCandidates.slice(pageStartIndex, pageStartIndex + pageSize);

  // Open a candidate's result details. Stores the visible (non-Pending) order
  // first so the details view can offer Prev/Next between candidates. Used by
  // the row/card click AND the View Details button.
  const viewCandidateDetails = (candidate: CandidateResult) => {
    // A Pending candidate was invited but never started, so no attempt record
    // exists and `candidate.id` is the invitation id (see the mapping above).
    // Passing that to the details route asks the API for a result that isn't
    // there, which came back as a bare "Result not found" console error.
    if (candidate.status === 'Pending') {
      toast.info('This candidate has not started the assessment yet');
      return;
    }
    try {
      /* Scoped to the candidate's own assessment: the details route pages
         Prev/Next within one assessment id, so a list spanning the job's
         versions would ask that assessment for attempts it does not have.
         Same rule the Assessments page's cross-assessment results tab uses. */
      sessionStorage.setItem('assessmentResultNavList', JSON.stringify(
        paginatedCandidates
          .filter(c => c.status !== 'Pending' && c.assessmentId === candidate.assessmentId)
          .map(c => ({ id: c.id, cid: c.candidateDisplayId || '' }))
      ));
    } catch { /* ignore quota errors */ }
    /* The details route is the CANDIDATE's assessment, which under a widened
       version scope is not this page's. So this page names itself as the way
       back: its own path (the Results tab when embedded in an assessment's
       page) and its title — see resultReturnContext. */
    const returnTo = currentResultReturnTo(embedded ? 'results' : undefined);
    rememberResultReturn(returnTo);
    router.push(
      `/recruitment/assessments/${candidate.assessmentId}/results/details?candidate_id=${candidate.id}${candidate.candidateDisplayId ? `&cid=${encodeURIComponent(candidate.candidateDisplayId)}` : ''}`
      + resultReturnQuery(returnTo, assessmentTitle),
    );
  };

  const startIndex = pageStartIndex;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  /* The summary cards' numbers, over the WHOLE scoped set — `candidateResults`,
     never `filteredCandidates`.
     These describe the context the page is reporting on (the job, or the one job
     version / assessment it is pinned to), so selecting a status must not move
     them: that is the bug this page had, where clicking In Progress recounted
     every card against the narrowed list and Total Candidates dropped to 0.
     `apiStats` is the same tally taken as the rows were merged (and kept in step
     when one is deleted); the fallback counts the rows directly, for the render
     before it lands. Both now read the unfiltered set, so the two branches agree
     whichever one answers. */
  const completedCount = candidateResults.length > 0 ? apiStats.completed_count : candidateResults.filter(c => c.status === 'Completed').length;
  const inProgressCount = candidateResults.length > 0 ? apiStats.in_progress_count : candidateResults.filter(c => c.status === 'In Progress').length;
  const pendingCount = candidateResults.length > 0 ? apiStats.pending_count : candidateResults.filter(c => c.status === 'Pending').length;
  const stickyHeaderClass = 'bg-slate-50';

  return (
    /* The page frame — the app's standard padded white card on the results
       ROUTE, and nothing at all when embedded, where the host has already drawn
       one around this view. The nesting is kept either way so the content tree
       below is the one tree, never a second copy written for the tab. */
    <div ref={rootRef} className={embedded ? undefined : 'flex-1 overflow-x-clip bg-slate-50'}>
      <div className={embedded ? undefined : 'mx-auto w-full max-w-[1400px]'}>
        <div className={embedded ? undefined : 'p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl'}>
          {/* Previous / Next assessment navigation rides inside the breadcrumb
              bar, as on job-details, so users can step through assessments
              without going back to the list — and without it scrolling away
              from the pinned crumb.

              Both are the HOST's when embedded: the details page has its own
              breadcrumb and its own pager over the same records, and a second
              pair inside its card would step two different ways at once. */}
          {!embedded && (
          <PageBreadcrumb
            className="mb-4 md:mb-6"
            items={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'Assessments', href: '/recruitment/assessments' },
              // Name the assessment these results belong to, not just "Results".
              ...(assessmentTitle ? [{ label: assessmentTitle }] : [{ label: 'Results' }]),
            ]}
            actions={
              <RecordPager
                currentIndex={currentIndex}
                totalCount={totalCount}
                onPrev={prevId ? () => router.push(`/recruitment/assessments/${prevId}/results`) : undefined}
                onNext={nextId ? () => router.push(`/recruitment/assessments/${nextId}/results`) : undefined}
              />
            }
          />
          )}
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div className="min-w-0">
              {/* The job these results belong to: [JD-001] Backend Developer.
                  The page reports the JD across every version of it by default,
                  so the job — not the assessment the recruiter arrived through —
                  is what names it. The assessment itself stays on the
                  breadcrumb, and the two version scopes live with the search
                  field below, beside the filters they belong with.

                  Dropped when embedded: the host page's own header already
                  names this job, with the same badge, directly above the tab. */}
              {!embedded && (
              <div className="flex items-center gap-2 flex-wrap">
                {jdShortId && (
                  /* The app's one Job ID badge — see JobIdBadge. */
                  <JobIdBadge className="flex-shrink-0">{jdShortId}</JobIdBadge>
                )}
                <h1 className="min-w-0 text-base sm:text-lg md:text-xl font-semibold text-gray-900 truncate tracking-tight">
                  {jdTitle || assessmentTitle}
                </h1>
              </div>
              )}
            </div>
            {/* Outside the list view only: in the list, Download PDF and Export
                Results sit in the Candidate Results toolbar, after More
                Filters. The cards view has no toolbar, so it keeps them here. */}
            {pageView !== 'list' && (
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {/* AS-26: Bulk PDF Download Button — only for users with download_pdf permission */}
              {canBatchDownload && selectedRows.length > 0 && (
                <Button
                  variant="primary"
                  onClick={handleDownloadBulkPDFs}
                  disabled={downloadingBulkPDF}
                  className="whitespace-nowrap"
                  icon={downloadingBulkPDF ? (
                    <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 sm:w-5 sm:h-5" />
                  )}
                >
                  <span className="hidden sm:inline">{downloadingBulkPDF ? 'Downloading...' : `Download PDFs (${selectedRows.length})`}</span>
                  <span className="sm:hidden">{downloadingBulkPDF ? '...' : `PDFs (${selectedRows.length})`}</span>
                </Button>
              )}
              <Button
                variant="primary"
                onClick={() => setShowExportModal(true)}
                className="whitespace-nowrap"
                icon={<FileText className="w-4 h-4 sm:w-5 sm:h-5" />}
              >
                Export
              </Button>

            </div>
            )}
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
          <button
            type="button"
            onClick={() => openCandidateList('all')}
            className="text-left bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 transition-all"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-gray-600 text-xs sm:text-sm mb-1">Total Candidates</div>
                {/* The scoped set, not the filtered one: `displayResults` is
                    every candidate of this job / job version / assessment. The
                    card's own click clears the status filter, so it is both the
                    total and the way back to all of them. */}
                <div className="text-xl sm:text-2xl text-gray-900 tracking-tight">{displayResults.length}</div>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex shrink-0 items-center justify-center">
                <Users className="w-5 h-5 sm:w-6 sm:h-6 text-brand-blue" />
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => openCandidateList('In Progress')}
            className="text-left bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4 hover:border-brand-cyan/40 hover:shadow-md hover:shadow-brand-cyan/10 transition-all"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-gray-600 text-xs sm:text-sm mb-1">In Progress</div>
                <div className="text-xl sm:text-2xl text-brand-cyan tracking-tight">{inProgressCount}</div>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/20 flex shrink-0 items-center justify-center">
                <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 text-brand-cyan" />
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => openCandidateList('Completed')}
            className="text-left bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4 hover:border-green-300 hover:shadow-md hover:shadow-green-500/10 transition-all"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-gray-600 text-xs sm:text-sm mb-1">Completed</div>
                <div className="text-xl sm:text-2xl text-green-600 tracking-tight">{completedCount}</div>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-green-100 to-green-50 ring-1 ring-green-200 flex shrink-0 items-center justify-center">
                <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
              </div>
            </div>
          </button>

          <button
            type="button"
            /* The STORED status stays 'Pending' — it is what the status filter,
               the row gates and the API's own `status_filter` all match on. Only
               the label the recruiter reads changes. */
            onClick={() => openCandidateList('Pending')}
            className="text-left bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4 hover:border-brand-orange/40 hover:shadow-md hover:shadow-brand-orange/10 transition-all"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-gray-600 text-xs sm:text-sm mb-1">{PENDING_STATUS_LABEL}</div>
                <div className="text-xl sm:text-2xl text-brand-orange-deep tracking-tight">{pendingCount}</div>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-brand-orange/10 to-brand-orange/5 ring-1 ring-brand-orange/20 flex shrink-0 items-center justify-center">
                <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-brand-orange-deep" />
              </div>
            </div>
          </button>
        </div>

        {pageView === 'list' && (
        <>
        {/* The candidate tally used to sit on a row of its own here, above the
            search bar, with nothing beside it. It now reads at the right of the
            "Candidate Results" heading it counts — see the table card's header
            below — which is where it says what it is without needing a row. */}

        {/* AS-23: Search and Filter Bar.
            One row, left to right: Search → More Filters → Columns →
            Download PDF → Export — the shared `ListToolbar`, as on the
            AI Interview results page and the Assessments tabs. Every filter the row used to
            hold (the two version scopes, Status, Result, the Tech / Coding
            score bands, the From / To dates) now opens in the More Filters
            panel under it; the Columns picker is its own button beside it.
            The filters commit as they change, exactly as they did on the row,
            so the panel's footer is Clear All + Done rather than an Apply. */}
        <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4 mb-3 sm:mb-4">
          <ListToolbar
            searchValue={searchQuery}
            /* Keystroke-by-keystroke, as the search field always was. */
            searchDebounceMs={0}
            onSearchChange={(value) => {
              setSearchQuery(value);
              setCurrentPage(1);
            }}
            searchPlaceholder="Search by name, email, phone, or JD title..."
            /* Tablet: a fixed 256px, controls at the far end, as before.
               Desktop: the box grows toward 576px from a 320px floor and the
               controls follow straight after it, evenly spaced, so the row
               reads as one group with no hole after the search. */
            searchClassName="sm:flex-none sm:w-64 lg:flex-1 lg:w-auto lg:min-w-[20rem] lg:max-w-xl"
            controlsFollowSearch
            onToggleFilters={() => setShowMoreFilters((open) => !open)}
            filtersOpen={showMoreFilters}
            activeFilterCount={activeFilterCount}
            filtersApplied={activeFilterCount > 0}
            afterFiltersActions={
              /* AS-24: Customize Columns — its own button, right of More
                 Filters, rather than a field inside that panel. Same toggle,
                 same picker. The picker opens from the button's right edge, at every
                 width: once the row wraps, the button sits mid-row beside
                 Filters, where a left-anchored menu ran off a 320–375px
                 screen (measured). */
              <div className="relative">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowColumnSelector(!showColumnSelector)}
                  aria-expanded={showColumnSelector}
                  aria-haspopup="dialog"
                  aria-controls="assessment-results-column-selector"
                  icon={<Columns3 className="w-4 h-4" />}
                  className="whitespace-nowrap !h-[38px] !text-sm"
                >
                  Customize Columns ({enabledColumnsCount})
                </Button>
                {showColumnSelector && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowColumnSelector(false)}
                    ></div>
                    <div
                      id="assessment-results-column-selector"
                      role="dialog"
                      aria-label="Select visible result columns"
                      className="absolute right-0 top-full mt-2 w-56 sm:w-64 max-w-[calc(100vw-1.5rem)] bg-white rounded-lg shadow-xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] py-2 z-20 max-h-80 sm:max-h-96 overflow-y-auto"
                    >
                      <div className="px-3 sm:px-4 py-2 border-b border-gray-100">
                        <div className="text-xs sm:text-sm font-medium text-gray-900">Select Columns</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {enabledColumnsCount} of {columns.length} selected
                        </div>
                      </div>
                      {columns.map((column) => (
                        <label
                          key={column.id}
                          className="flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 hover:bg-brand-blue/5 hover:text-brand-blue transition-colors cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={column.enabled}
                            onChange={() => handleToggleColumn(column.id)}
                            className="w-4 h-4 text-brand-blue rounded border-gray-300 focus:ring-brand-blue/40"
                          />
                          <span className="text-xs sm:text-sm text-gray-700">{column.label}</span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
            }
            className="mb-0"
          >
            {/* AS-26: Bulk PDF download — only for users with the download_pdf
                permission. Always on the row for them; it acts on the ticked
                rows, so it is disabled until at least one is ticked. */}
            {canBatchDownload && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleDownloadBulkPDFs}
                disabled={downloadingBulkPDF || selectedRows.length === 0}
                title={selectedRows.length === 0 ? 'Select candidates to download their PDF reports' : undefined}
                className="whitespace-nowrap !h-[38px] !text-sm"
                icon={downloadingBulkPDF ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
              >
                {downloadingBulkPDF
                  ? 'Downloading...'
                  : `Download PDF${selectedRows.length > 0 ? ` (${selectedRows.length})` : ''}`}
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowExportModal(true)}
              className="whitespace-nowrap !h-[38px] !text-sm"
              icon={<FileText className="w-4 h-4" />}
            >
              Export
            </Button>
          </ListToolbar>

          {showMoreFilters && (
            <ListFilterPanel
              footer={
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={clearAllFilters}
                    disabled={!hasAnyFilterOrSearch}
                    icon={<X className="w-4 h-4" />}
                  >
                    Clear All
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => setShowMoreFilters(false)}>
                    Done
                  </Button>
                </>
              }
            >
              {/* The two version scopes — each rendered only where it is a
                  choice the recruiter actually has (see
                  `showsJobVersionSelect`). */}
              {showsJobVersionSelect && (
                <div>
                  <label htmlFor="assessment-results-job-version" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">Job Version</label>
                  <select
                    id="assessment-results-job-version"
                    value={effectiveJobVersion === 'all' ? 'all' : String(effectiveJobVersion)}
                    onChange={(e) => {
                      setSelectedJobVersion(e.target.value === 'all' ? 'all' : Number(e.target.value));
                      setCurrentPage(1);
                      /* A selection made under the old scope would go on driving
                         the bulk actions for rows that are no longer listed. */
                      setSelectedRows([]);
                    }}
                    disabled={!jobVersionsLoaded}
                    className="w-full min-w-0 h-9 px-3 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="all">All Versions</option>
                    {jobVersionScopes.map(scope => (
                      <option key={scope.versionNumber} value={scope.versionNumber}>
                        Job Version V{scope.versionNumber}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {showsAssessmentVersionSelect && (
                <div>
                  <label htmlFor="assessment-results-assessment-version" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">Assessment Version</label>
                  <select
                    id="assessment-results-assessment-version"
                    value={effectiveAssessmentVersion === 'all' ? 'all' : String(effectiveAssessmentVersion)}
                    onChange={(e) => {
                      setSelectedAssessmentVersion(e.target.value === 'all' ? 'all' : Number(e.target.value));
                      setCurrentPage(1);
                      /* Same reason as the job version's above. */
                      setSelectedRows([]);
                    }}
                    disabled={!jobVersionsLoaded}
                    className="w-full min-w-0 h-9 px-3 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="all">All Assessment Versions</option>
                    {assessmentVersionOptions.map(version => (
                      <option key={version} value={version}>
                        Assessment V{version}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Status Filter */}
              <div>
                <label htmlFor="assessment-results-status-filter" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">Status</label>
                <select
                  id="assessment-results-status-filter"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value as 'all' | 'Completed' | 'In Progress' | 'Pending');
                    setCurrentPage(1);
                  }}
                  className="w-full min-w-0 h-9 px-3 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
                >
                  <option value="all">All</option>
                  <option value="Completed">Completed</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Pending">{PENDING_STATUS_LABEL}</option>
                </select>
              </div>

              {/* Pass/Fail Filter */}
              <div>
                <label htmlFor="assessment-results-pass-fail-filter" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">Result</label>
                <select
                  id="assessment-results-pass-fail-filter"
                  value={passFailFilter}
                  onChange={(e) => {
                    setPassFailFilter(e.target.value as 'all' | 'pass' | 'fail');
                    setCurrentPage(1);
                  }}
                  className="w-full min-w-0 h-9 px-3 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
                >
                  <option value="all">All</option>
                  <option value="pass">Pass</option>
                  <option value="fail">Fail</option>
                </select>
              </div>

              {/* Round-based Filters */}
              {assessmentDetails?.technical_enabled && (
                <div>
                  <label htmlFor="assessment-results-tech-filter" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">Tech Score</label>
                  <select
                    id="assessment-results-tech-filter"
                    value={roundFilters.technical || 'all'}
                    onChange={(e) => {
                      const value = e.target.value as 'all' | '50-70' | '70-90' | '90+';
                      setRoundFilters(prev => value === 'all' ? { ...prev, technical: undefined } : { ...prev, technical: value });
                      setCurrentPage(1);
                    }}
                    className="w-full min-w-0 h-9 px-3 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
                  >
                    <option value="all">All</option>
                    <option value="50-70">50-70%</option>
                    <option value="70-90">70-90%</option>
                    <option value="90+">90%+</option>
                  </select>
                </div>
              )}

              {assessmentDetails?.coding_enabled && (
                <div>
                  <label htmlFor="assessment-results-coding-filter" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">Coding Score</label>
                  <select
                    id="assessment-results-coding-filter"
                    value={roundFilters.coding || 'all'}
                    onChange={(e) => {
                      const value = e.target.value as 'all' | '50-70' | '70-90' | '90+';
                      setRoundFilters(prev => value === 'all' ? { ...prev, coding: undefined } : { ...prev, coding: value });
                      setCurrentPage(1);
                    }}
                    className="w-full min-w-0 h-9 px-3 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
                  >
                    <option value="all">All</option>
                    <option value="50-70">50-70%</option>
                    <option value="70-90">70-90%</option>
                    <option value="90+">90%+</option>
                  </select>
                </div>
              )}

              {/* Date range — From / To, each bounding the other. */}
              <div className="sm:col-span-2">
                <label htmlFor="assessment-results-date-from" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">Date</label>
                <div className="flex flex-col min-[400px]:flex-row min-[400px]:items-center gap-2">
                  <input
                    id="assessment-results-date-from"
                    type="date"
                    value={dateFrom}
                    max={dateTo || undefined}
                    onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }}
                    className="w-full min-w-0 h-9 px-3 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue min-[400px]:flex-1"
                    title="From date"
                    aria-label="Filter from date"
                  />
                  <span className="text-xs text-gray-400 flex-shrink-0">to</span>
                  <input
                    id="assessment-results-date-to"
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }}
                    className="w-full min-w-0 h-9 px-3 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue min-[400px]:flex-1"
                    title="To date"
                    aria-label="Filter to date"
                  />
                </div>
              </div>
            </ListFilterPanel>
          )}
        </div>

        {/* Candidates Results Table */}
        <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 bg-slate-50 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="truncate text-sm sm:text-base font-medium text-gray-900 tracking-tight">Candidate Results</h2>
              {isFetching && (
                <Loader2 className="w-4 h-4 text-brand-blue animate-spin flex-shrink-0" />
              )}
            </div>
            {/* The heading's right slot: how many candidates it is listing, and
                how many of them are ticked. The tally moved here from its own
                row above the search bar — beside the heading it counts, it needs
                no label to say what it is. Both parts stay on one line
                (`whitespace-nowrap`) and the group never shrinks, so on a phone
                the heading gives way before the numbers do. */}
            <div className="flex items-center gap-2 flex-shrink-0 text-xs sm:text-sm text-gray-500">
              {selectedRows.length > 0 && (
                <>
                  <span className="whitespace-nowrap">{selectedRows.length} selected</span>
                  <span aria-hidden="true" className="text-gray-300">·</span>
                </>
              )}
              <span className="whitespace-nowrap">
                {totalItems} {totalItems === 1 ? 'candidate' : 'candidates'}
              </span>
            </div>
          </div>
          <div className="xl:hidden divide-y divide-gray-100">
            {paginatedCandidates.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="flex flex-col items-center">
                  <Users className="w-12 h-12 text-gray-300 mb-3" />
                  {searchQuery || Object.keys(roundFilters).length > 0 || statusFilter !== 'all' || passFailFilter !== 'all' ? (
                    <>
                      <p className="text-gray-600 mb-1">No candidates match your search criteria</p>
                      <p className="text-sm text-gray-500">Try adjusting your filters or search query</p>
                    </>
                  ) : (
                    <>
                      <p className="text-gray-600 mb-1">No candidates have completed this assessment yet</p>
                      <p className="text-sm text-gray-500">Share the assessment link to invite candidates</p>
                    </>
                  )}
                </div>
              </div>
            ) : (
              paginatedCandidates.map((candidate) => {
                const overallScore = getMobileOverallScore(candidate);
                const passFail = getMobilePassFail(candidate);
                return (
                  <div
                    key={candidate.id}
                    onClick={() => viewCandidateDetails(candidate)}
                    className="p-4 space-y-3 cursor-pointer hover:bg-brand-blue/5 transition-colors"
                    role="article"
                    aria-label={`Candidate result for ${candidate.name || 'Unknown'}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedRows.includes(candidate.id)}
                        onChange={(e) => handleSelectRow(candidate.id, e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 w-4 h-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="w-9 h-9 rounded-full bg-brand-blue ring-1 ring-white/10 shadow-sm shadow-brand-blue/25 flex items-center justify-center text-white text-xs shrink-0">
                                {(candidate.name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2)}
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">{candidate.name || 'Unknown'}</div>
                                <div className="text-xs text-gray-500 truncate">{candidate.email || '-'}</div>
                              </div>
                            </div>
                          </div>
                          <Badge variant={getStatusVariant(candidate.status)} className="shrink-0">
                            {statusLabel(candidate.status)}
                          </Badge>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-lg bg-gray-50 p-2 col-span-2">
                            <div className="text-gray-500">JD</div>
                            <div className="text-gray-800 truncate">{jdTitle || 'N/A'}</div>
                          </div>
                          <div className="rounded-lg bg-gray-50 p-2">
                            <div className="text-gray-500">Score</div>
                            <div className={overallScore !== null ? `font-semibold ${getScoreColor(overallScore)}` : 'text-gray-400'}>
                              {overallScore !== null ? `${overallScore}%` : '-'}
                            </div>
                          </div>
                          <div className="rounded-lg bg-gray-50 p-2">
                            <div className="text-gray-500">Pass / Fail</div>
                            {passFail ? (
                              <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium mt-1 ${passFail === 'Pass' ? 'bg-success-subtle text-success' : 'bg-destructive-subtle text-destructive'}`}>
                                {passFail}
                              </span>
                            ) : (
                              <div className="text-gray-400">-</div>
                            )}
                          </div>
                          <div className="rounded-lg bg-gray-50 p-2">
                            <div className="text-gray-500">Date</div>
                            <div className="text-gray-700">{candidate.completedDate}</div>
                          </div>
                          <div className="rounded-lg bg-gray-50 p-2">
                            <div className="text-gray-500">CID</div>
                            <div className="font-mono text-brand-blue">{candidate.candidateDisplayId || '-'}</div>
                          </div>
                          <div className="rounded-lg bg-gray-50 p-2">
                            <div className="text-gray-500">Invite Source</div>
                            <div className="text-gray-700 mt-1">
                              <InviteSourceValue inv={{ invite_source: candidate.inviteSource }} iconClassName="w-3 h-3" />
                            </div>
                          </div>
                          <div className="rounded-lg bg-gray-50 p-2">
                            <div className="text-gray-500">Duration</div>
                            <div className="text-gray-700">{candidate.duration}</div>
                          </div>
                          {assessmentDetails?.technical_enabled && (
                            <div className="rounded-lg bg-gray-50 p-2">
                              <div className="text-gray-500">Tech</div>
                              <div className={candidate.tech_score !== undefined ? (candidate.tech_score >= passingThreshold ? 'text-success' : 'text-destructive') : 'text-gray-400'}>
                                {candidate.tech_score !== undefined ? `${candidate.tech_score}%` : '-'}
                              </div>
                            </div>
                          )}
                          {assessmentDetails?.coding_enabled && (
                            <div className="rounded-lg bg-gray-50 p-2">
                              <div className="text-gray-500">Coding</div>
                              <div className={candidate.coding_score !== undefined ? (candidate.coding_score >= passingThreshold ? 'text-success' : 'text-destructive') : 'text-gray-400'}>
                                {candidate.coding_score !== undefined ? `${candidate.coding_score}%` : '-'}
                              </div>
                            </div>
                          )}
                        </div>

                        {candidate.phone && (
                          <div className="mt-2 text-xs text-gray-500">Phone: {candidate.phone}</div>
                        )}

                        <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => viewCandidateDetails(candidate)}
                            className="w-9 h-9 px-0"
                            title="View Details"
                            aria-label={`View details for ${candidate.name || 'candidate'}`}
                          >
                            <Eye className="w-3.5 h-3.5 shrink-0" />
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleDownloadPDF(candidate.id, candidate.candidateDisplayId)}
                            disabled={downloadingPDF === candidate.id}
                            className="w-9 h-9 px-0"
                            title="Download PDF Report"
                            aria-label={`Download PDF report for ${candidate.name || 'candidate'}`}
                          >
                            {downloadingPDF === candidate.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Download className="w-3 h-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="hidden xl:block tf-table-shell">
            {/* 2264px + the Assessment Version column's own w-40 (160px).
                The table is `table-fixed` over fixed per-column widths, so the
                floor has to grow with the columns — left at 2264 the browser
                would squeeze every column to fit instead of letting the shell
                scroll, which is how one added column narrows all the others.

                WITH NO ROWS the floor is dropped, along with the header that
                carries the per-column widths. A 2424px table holding one empty
                cell centred that cell across 2424px — the icon and the message
                sat around x=1200, off the side of the screen, behind a
                horizontal scrollbar that existed only to reach them. Nothing to
                lay out means nothing to be wide for: the table becomes as wide
                as the shell, `TABLE_EMPTY_PANEL_CLASS` centres in it, and the scrollbar
                goes away. */}
            <table className={`w-full [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap [&_td]:align-middle ${paginatedCandidates.length === 0 ? '' : 'min-w-[2424px] table-fixed'}`}>
              {paginatedCandidates.length > 0 && (
              <thead className="bg-slate-50 border-b border-gray-100">
                <tr>
                  <th className={`px-4 py-3 w-10 tf-sticky-col-left ${stickyHeaderClass}`}>
                    <input
                      type="checkbox"
                      checked={selectedRows.length === paginatedCandidates.length && paginatedCandidates.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40"
                    />
                  </th>
                  {isColumnEnabled('candidate') && (
                    <th
                      className={`w-48 text-left px-4 py-3 text-xs text-gray-600 cursor-pointer hover:bg-brand-blue/5 ${stickyHeaderClass}`}
                      onClick={() => handleSort('name')}
                    >
                      <div className="flex items-center gap-1">
                        Candidate
                        <ArrowUpDown className={`w-3 h-3 ${sortField === 'name' ? 'text-brand-blue' : 'text-gray-400'}`} />
                      </div>
                    </th>
                  )}
                  {isColumnEnabled('email') && (
                    <th className={`w-64 text-left px-4 py-3 text-xs text-gray-600 ${stickyHeaderClass}`}>
                      <div className="flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        Email
                      </div>
                    </th>
                  )}
                  {isColumnEnabled('phone') && (
                    <th className={`w-36 text-left px-4 py-3 text-xs text-gray-600 ${stickyHeaderClass}`}>
                      <div className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        Phone
                      </div>
                    </th>
                  )}
                  {isColumnEnabled('inviteSource') && (
                    <th className={`w-36 text-left px-4 py-3 text-xs text-gray-600 ${stickyHeaderClass}`}>Invite Source</th>
                  )}
                  {isColumnEnabled('status') && (
                    <th
                      className={`w-28 text-center px-4 py-3 text-xs text-gray-600 cursor-pointer hover:bg-brand-blue/5 ${stickyHeaderClass}`}
                      onClick={() => handleSort('status')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Result Status
                        <ArrowUpDown className={`w-3 h-3 ${sortField === 'status' ? 'text-brand-blue' : 'text-gray-400'}`} />
                      </div>
                    </th>
                  )}
                  {isColumnEnabled('techScore') && assessmentDetails?.technical_enabled && (
                    <th
                      className={`w-28 text-center px-4 py-3 text-xs text-gray-600 cursor-pointer hover:bg-brand-blue/5 ${stickyHeaderClass}`}
                      onClick={() => handleSort('score')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Tech Score
                        <ArrowUpDown className={`w-3 h-3 ${sortField === 'score' ? 'text-brand-blue' : 'text-gray-400'}`} />
                      </div>
                    </th>
                  )}
                  {isColumnEnabled('codingScore') && assessmentDetails?.coding_enabled && (
                    <th
                      className={`w-28 text-center px-4 py-3 text-xs text-gray-600 cursor-pointer hover:bg-brand-blue/5 ${stickyHeaderClass}`}
                      onClick={() => handleSort('score')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Coding Score
                        <ArrowUpDown className={`w-3 h-3 ${sortField === 'score' ? 'text-brand-blue' : 'text-gray-400'}`} />
                      </div>
                    </th>
                  )}
                  {isColumnEnabled('timeline') && (
                    <th className={`w-96 text-left px-4 py-3 text-xs text-gray-600 ${stickyHeaderClass}`}>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Timeline
                      </div>
                    </th>
                  )}
                  {isColumnEnabled('cid') && (
                    <th className={`w-24 text-left px-4 py-3 text-xs text-gray-600 ${stickyHeaderClass}`}>CID</th>
                  )}
                  {isColumnEnabled('jdId') && (
                    <th className={`w-28 text-left px-4 py-3 text-xs text-gray-600 ${stickyHeaderClass}`}>JD ID</th>
                  )}
                  {isColumnEnabled('jdTitle') && (
                    <th className={`w-56 text-left px-4 py-3 text-xs text-gray-600 ${stickyHeaderClass}`}>
                      <div className="flex items-center gap-1">
                        <Briefcase className="w-3 h-3" />
                        JD Title
                      </div>
                    </th>
                  )}
                  {isColumnEnabled('jobVersion') && (
                    <th className={`w-28 text-left px-4 py-3 text-xs text-gray-600 ${stickyHeaderClass}`}>Job Version</th>
                  )}
                  {isColumnEnabled('assessmentVersion') && (
                    /* `w-40` rather than the Job Version column's `w-28`: the
                       heading is half again as long, the table lays out on fixed
                       column widths, and every th here is `whitespace-nowrap` —
                       so a cell too narrow for its own heading spills over the
                       column instead of wrapping inside it. 160px holds
                       "Assessment Version" at text-xs with the px-4 gutters. */
                    <th className={`w-40 text-left px-4 py-3 text-xs text-gray-600 ${stickyHeaderClass}`}>Assessment Version</th>
                  )}
                  {isColumnEnabled('completed') && (
                    <th
                      className={`w-32 text-left px-4 py-3 text-xs text-gray-600 cursor-pointer hover:bg-brand-blue/5 ${stickyHeaderClass}`}
                      onClick={() => handleSort('date')}
                    >
                      <div className="flex items-center gap-1">
                        Completed
                        <ArrowUpDown className={`w-3 h-3 ${sortField === 'date' ? 'text-brand-blue' : 'text-gray-400'}`} />
                      </div>
                    </th>
                  )}
                  {isColumnEnabled('duration') && (
                    <th className={`w-28 text-center px-4 py-3 text-xs text-gray-600 ${stickyHeaderClass}`}>Duration</th>
                  )}
                  <th className={`w-32 text-center px-4 py-3 text-xs text-gray-600 tf-sticky-col ${stickyHeaderClass}`}>Actions</th>
                </tr>
              </thead>
              )}
              <tbody className="divide-y divide-gray-100">
                {paginatedCandidates.length === 0 ? (
                  <tr>
                    <td colSpan={enabledColumnsCount + 2} className="p-0">
                      {/* Illustration, then a bold heading, then a lighter
                          supporting line — the reference's three-part stack.
                          The two cases keep their own words: a list narrowed to
                          nothing needs "change what you searched", an assessment
                          nobody has sat needs "go invite someone". */}
                      <div className={TABLE_EMPTY_PANEL_CLASS}>
                        <EmptySearchIllustration className="mb-5 w-52 sm:w-60" />
                        {searchQuery || Object.keys(roundFilters).length > 0 || statusFilter !== 'all' || passFailFilter !== 'all' ? (
                          <>
                            <h3 className="text-lg sm:text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
                              No candidates match your search criteria
                            </h3>
                            <p className="mt-1.5 text-sm sm:text-base text-slate-500 dark:text-slate-400">
                              Try adjusting your filters or search query
                            </p>
                          </>
                        ) : (
                          <>
                            <h3 className="text-lg sm:text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
                              No candidates have completed this assessment yet
                            </h3>
                            <p className="mt-1.5 text-sm sm:text-base text-slate-500 dark:text-slate-400">
                              Share the assessment link to invite candidates
                            </p>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedCandidates.map((candidate) => (
                    <tr
                      key={candidate.id}
                      onClick={() => viewCandidateDetails(candidate)}
                      data-row-selected={selectedRows.includes(candidate.id)}
                      className={`hover:bg-brand-blue/5 transition-colors cursor-pointer ${selectedRows.includes(candidate.id) ? 'bg-brand-blue/5' : ''}`}
                    >
                      <td className="px-4 py-4 tf-sticky-col-left" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedRows.includes(candidate.id)}
                          onChange={(e) => handleSelectRow(candidate.id, e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40"
                        />
                      </td>
                      {isColumnEnabled('candidate') && (
                        <td className="px-4 py-4">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-brand-blue ring-1 ring-white/10 shadow-sm shadow-brand-blue/25 flex shrink-0 items-center justify-center text-white text-xs">
                              {(candidate.name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </div>
                            <div className="min-w-0 truncate text-sm text-gray-900 font-medium" title={candidate.name || 'Unknown'}>{candidate.name || 'Unknown'}</div>
                          </div>
                        </td>
                      )}
                      {isColumnEnabled('email') && (
                        <td className="px-4 py-4">
                          <div className="truncate text-sm text-gray-600" title={candidate.email || '-'}>{candidate.email || '-'}</div>
                        </td>
                      )}
                      {isColumnEnabled('phone') && (
                        <td className="px-4 py-4">
                          <div className="truncate text-sm text-gray-600" title={candidate.phone || '-'}>{candidate.phone || '-'}</div>
                        </td>
                      )}
                      {isColumnEnabled('inviteSource') && (
                        <td className="px-4 py-4 text-sm text-gray-700 whitespace-nowrap">
                          <InviteSourceValue inv={{ invite_source: candidate.inviteSource }} iconClassName="w-3.5 h-3.5" />
                        </td>
                      )}
                      {isColumnEnabled('status') && (
                        <td className="px-4 py-4 text-center">
                          <Badge variant={getStatusVariant(candidate.status)}>
                            {statusLabel(candidate.status)}
                          </Badge>
                        </td>
                      )}
                      {isColumnEnabled('techScore') && assessmentDetails?.technical_enabled && (
                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {/* Tech Score: green when ≥ threshold, red below.
                                The 4-band gradient (red/yellow/gray/green)
                                was confusing because 69% rendered gray even
                                though it failed the 70% threshold. Now color
                                matches the Pass/Fail outcome consistently. */}
                            <span className={`text-lg font-semibold ${candidate.tech_score !== undefined ? (candidate.tech_score >= passingThreshold ? 'text-success' : 'text-destructive') : 'text-gray-400'}`}>
                              {candidate.tech_score !== undefined ? `${candidate.tech_score}%` : '-'}
                            </span>
                            {candidate.tech_score !== undefined && (
                              <span className={`text-xs font-medium ${candidate.tech_score >= passingThreshold ? 'text-success' : 'text-destructive'}`}>
                                {candidate.tech_score >= passingThreshold ? 'Pass' : 'Fail'}
                              </span>
                            )}
                          </div>
                        </td>
                      )}
                      {isColumnEnabled('codingScore') && assessmentDetails?.coding_enabled && (
                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <span className={`text-lg font-semibold ${candidate.coding_score !== undefined ? (candidate.coding_score >= passingThreshold ? 'text-success' : 'text-destructive') : 'text-gray-400'}`}>
                              {candidate.coding_score !== undefined ? `${candidate.coding_score}%` : '-'}
                            </span>
                            {candidate.coding_score !== undefined && (
                              <span className={`text-xs font-medium ${candidate.coding_score >= passingThreshold ? 'text-success' : 'text-destructive'}`}>
                                {candidate.coding_score >= passingThreshold ? 'Pass' : 'Fail'}
                              </span>
                            )}
                          </div>
                        </td>
                      )}
                      {isColumnEnabled('timeline') && (
                        <td className="px-4 py-4 overflow-hidden text-xs text-gray-500">
                          {/* One event per line, in chronological order — the events
                              read as a timeline rather than a single run-on row. */}
                          <div className="flex min-w-0 flex-col gap-1 overflow-hidden" title={getTimelineSummary(candidate)}>
                            {candidate.sent_at && (
                              <div className="flex min-w-0 items-center gap-2">
                                <Mail className="w-3 h-3 shrink-0 text-brand-blue" />
                                <span className="truncate">Sent: {formatTimelineDate(candidate.sent_at)}</span>
                              </div>
                            )}
                            {candidate.started_at && (
                              <div className="flex min-w-0 items-center gap-2">
                                <Play className="w-3 h-3 shrink-0 text-brand-orange-deep" />
                                <span className="truncate">Started: {formatTimelineDate(candidate.started_at)}</span>
                              </div>
                            )}
                            {candidate.completed_at && (
                              <div className="flex min-w-0 items-center gap-2">
                                <CheckCircle className="w-3 h-3 shrink-0 text-success" />
                                <span className="truncate">Completed: {formatTimelineDate(candidate.completed_at)}</span>
                              </div>
                            )}
                            {!candidate.sent_at && !candidate.started_at && !candidate.completed_at && (
                              <div className="flex min-w-0 items-center gap-2">
                                <Clock className="w-3 h-3 shrink-0 text-gray-400" />
                                <span className="truncate">{candidate.created_at ? `Created: ${formatTimelineDate(candidate.created_at)}` : '-'}</span>
                              </div>
                            )}
                          </div>
                        </td>
                      )}
                      {isColumnEnabled('cid') && (
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center whitespace-nowrap text-xs font-mono font-medium bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 px-2 py-1 rounded">
                            {candidate.candidateDisplayId || '-'}
                          </span>
                        </td>
                      )}
                      {isColumnEnabled('jdId') && (
                        /* Every version of a job shares one Job ID, so the
                           page's own is every row's — under All Versions too. */
                        <td className="px-4 py-4">
                          {jdShortId ? (
                            <JobIdBadge className="inline-flex items-center">{jdShortId}</JobIdBadge>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                      )}
                      {isColumnEnabled('jdTitle') && (
                        <td className="px-4 py-4">
                          <div className="truncate text-sm text-gray-600" title={jdTitle || 'N/A'}>
                            {jdTitle || 'N/A'}
                          </div>
                        </td>
                      )}
                      {isColumnEnabled('jobVersion') && (
                        /* The version of the assessment this attempt came from —
                           stamped per row, so All Versions shows a mix. */
                        <td className="px-4 py-4">
                          {candidate.jobVersion != null ? (
                            <span className="inline-flex items-center whitespace-nowrap text-xs font-medium bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 px-2 py-1 rounded">
                              v{candidate.jobVersion}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                      )}
                      {isColumnEnabled('assessmentVersion') && (
                        /* The assessment's own revision, the one this candidate
                           sat. Same chip as the job version beside it, in the
                           assessment cyan the app already pairs with that blue
                           (see `VersionChip`), so the two read apart at a glance
                           without a second shape. A row whose assessment record
                           carries no version shows a dash — never an invented
                           v1. */
                        <td className="px-4 py-4">
                          {candidate.assessmentVersion != null ? (
                            <span className="inline-flex items-center whitespace-nowrap text-xs font-medium bg-brand-cyan/5 text-brand-cyan ring-1 ring-brand-cyan/20 px-2 py-1 rounded">
                              v{candidate.assessmentVersion}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                      )}
                      {isColumnEnabled('completed') && (
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Calendar className="w-4 h-4" />
                            {candidate.completedDate}
                          </div>
                        </td>
                      )}
                      {isColumnEnabled('duration') && (
                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                            <Clock className="w-4 h-4" />
                            {candidate.duration}
                          </div>
                        </td>
                      )}
                      <td className="px-2 sm:px-4 py-4 tf-sticky-col" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-nowrap">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => viewCandidateDetails(candidate)}
                            className="w-9 h-9 px-0"
                            title="View Details"
                            aria-label={`View details for ${candidate.name || 'candidate'}`}
                          >
                            <Eye className="w-3.5 h-3.5 shrink-0" />
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleDownloadPDF(candidate.id, candidate.candidateDisplayId)}
                            disabled={downloadingPDF === candidate.id}
                            className="w-9 h-9 px-0"
                            title="Download PDF Report"
                            aria-label={`Download PDF report for ${candidate.name || 'candidate'}`}
                          >
                            {downloadingPDF === candidate.id ? (
                              <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                            ) : (
                              <Download className="w-3 h-3 flex-shrink-0" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* AS-23: Pagination Controls */}
          {totalPages > 1 && (
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-100 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-center sm:text-left text-xs sm:text-sm text-gray-600">
                Showing {startIndex + 1} to {Math.min(endIndex, totalItems)} of {totalItems} results
              </div>
              <InlinePageNav
                page={safePage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </div>

        </>
        )}
      </div>

      {/* Export Format & Scope Selection Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6">
          <div className="bg-white rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] w-full max-w-[95vw] sm:max-w-md max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto">
            {/* Step 1: Format Selection */}
            {exportStep === 'format' && (
              <>
                <div className="flex items-center justify-between gap-3 p-4 sm:p-5 border-b border-gray-100 bg-gray-50">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="w-10 h-10 shrink-0 rounded-xl bg-brand-blue shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base sm:text-lg font-medium text-gray-900 tracking-tight">Export Assessment Results</h3>
                      <p className="text-xs sm:text-sm text-gray-500 mt-1">Step 1 of 2: Choose format</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowExportModal(false);
                      setExportStep('format');
                    }}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-gray-400 hover:text-brand-blue rounded-md hover:bg-brand-blue/5 transition-colors"
                   aria-label="Close">
                    <X className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                </div>

                <div className="p-4 sm:p-5">
                  <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4">Choose export format:</p>

                  <div className="space-y-2.5 sm:space-y-3">
                    <button
                      onClick={() => handleFormatSelect('csv')}
                      className="w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 border border-gray-200 rounded-xl hover:bg-brand-blue/5 hover:border-brand-blue/30 transition-all group"
                    >
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-green-100 to-green-50 ring-1 ring-success-line flex items-center justify-center transition-colors flex-shrink-0">
                        <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-success" />
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <div className="text-sm sm:text-base font-medium text-gray-900">CSV Format</div>
                        <div className="text-xs sm:text-sm text-gray-500">Compatible with Excel, Google Sheets</div>
                      </div>
                    </button>

                    <button
                      onClick={() => handleFormatSelect('excel')}
                      className="w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 border border-gray-200 rounded-xl hover:bg-brand-blue/5 hover:border-brand-blue/30 transition-all group"
                    >
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center transition-colors flex-shrink-0">
                        <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-brand-blue" />
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <div className="text-sm sm:text-base font-medium text-gray-900">Excel Format (XLSX)</div>
                        <div className="text-xs sm:text-sm text-gray-500">Native Excel format with better formatting</div>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 p-4 sm:p-5 border-t border-gray-100">
                  <button
                    onClick={() => {
                      setShowExportModal(false);
                      setExportStep('format');
                    }}
                    className="px-3 sm:px-4 py-2 text-xs sm:text-sm border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {/* Step 2: Scope Selection */}
            {exportStep === 'scope' && (
              <>
                <div className="flex items-center justify-between gap-3 p-4 sm:p-5 border-b border-gray-100 bg-gray-50">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="w-10 h-10 shrink-0 rounded-xl bg-brand-blue shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex items-center justify-center">
                      <Layers className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base sm:text-lg font-medium text-gray-900 tracking-tight">Export Scope</h3>
                      <p className="text-xs sm:text-sm text-gray-500 mt-1">
                        Step 2 of 2: Choose what to export ({selectedFormat === 'csv' ? 'CSV' : 'Excel'})
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowExportModal(false);
                      setExportStep('format');
                    }}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-gray-400 hover:text-brand-blue rounded-md hover:bg-brand-blue/5 transition-colors"
                   aria-label="Close">
                    <X className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                </div>

                <div className="p-4 sm:p-5">
                  <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4">
                    {areColumnsCustomized()
                      ? 'Export scope (with selected columns):'
                      : 'Select export scope:'}
                  </p>

                  <div className="space-y-2.5 sm:space-y-3">
                    {/* Show "Selected Candidates" option when rows are selected */}
                    {selectedRows.length > 0 && (
                      <button
                        onClick={handleExportSelected}
                        disabled={isExporting}
                        className="w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 border-2 border-success-line rounded-xl hover:bg-success-subtle transition-all group disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-green-100 to-green-50 ring-1 ring-success-line flex items-center justify-center transition-colors flex-shrink-0">
                          {isExporting ? (
                            <Loader2 className="w-4 h-4 text-success animate-spin" />
                          ) : (
                            <CheckSquare className="w-5 h-5 sm:w-6 sm:h-6 text-success" />
                          )}
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <div className="text-sm sm:text-base font-medium text-gray-900">{isExporting ? 'Generating…' : 'Selected Candidates'}</div>
                          <div className="text-xs sm:text-sm text-gray-500">
                            Export only the {selectedRows.length} selected candidate{selectedRows.length > 1 ? 's' : ''}
                          </div>
                        </div>
                      </button>
                    )}

                    {/* Show "All Filtered Results" if columns are customized */}
                    {areColumnsCustomized() ? (
                      <button
                        onClick={handleExportAllFiltered}
                        disabled={isExporting}
                        className="w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 border-2 border-brand-blue/40 rounded-xl hover:bg-brand-blue/5 transition-all group disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center transition-colors flex-shrink-0">
                          {isExporting ? (
                            <Loader2 className="w-4 h-4 text-brand-blue animate-spin" />
                          ) : (
                            <Users className="w-5 h-5 sm:w-6 sm:h-6 text-brand-blue" />
                          )}
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <div className="text-sm sm:text-base font-medium text-gray-900">{isExporting ? 'Generating…' : 'All Filtered Results'}</div>
                          <div className="text-xs sm:text-sm text-gray-500">
                            Export all {filteredCandidates.length} results with {enabledColumnsCount} selected columns
                            <div className="text-xs text-brand-blue mt-1">
                              (includes completed, in-progress, and not started)
                            </div>
                          </div>
                        </div>
                      </button>
                    ) : (
                      /* Show "Current Page" if columns are NOT customized */
                      <button
                        onClick={handleExportCurrentPage}
                        disabled={isExporting}
                        className="w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 border-2 border-brand-cyan/40 rounded-xl hover:bg-brand-cyan/5 transition-all group disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/20 flex items-center justify-center transition-colors flex-shrink-0">
                          {isExporting ? (
                            <Loader2 className="w-4 h-4 text-brand-cyan animate-spin" />
                          ) : (
                            <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-brand-cyan" />
                          )}
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <div className="text-sm sm:text-base font-medium text-gray-900">{isExporting ? 'Generating…' : 'Current Page'}</div>
                          <div className="text-xs sm:text-sm text-gray-500">
                            Export {paginatedCandidates.length} results visible on this page
                          </div>
                        </div>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 p-4 sm:p-5 border-t border-gray-100">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setExportStep('format')}
                    icon={<ArrowLeft className="w-4 h-4" />}
                  >
                    Back
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowExportModal(false);
                      setExportStep('format');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
