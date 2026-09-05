'use client';

import { ArrowLeft, Clock, Briefcase, Sliders, Plus, X, Sparkles, AlertCircle, CheckCircle2, Code, Users, Brain, BarChart, FileText, Shield, Video, Info, Eye, Edit3, MoreVertical, Loader2, Lock, Search, ChevronDown } from 'lucide-react';
import type { HRTopic } from '@/lib/services/assessmentService';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Job } from '@/lib/types/types';
import { formatISTDate } from '@/lib/utils/dateUtils';
import { assessmentService, jdService } from '@/lib/services';
import api from '@/lib/services/api';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { usePlanFeature } from '@/lib/hooks/usePlanFeature';
import { useAuth } from '@/components/providers/AuthProvider';
import PageBreadcrumb, { type BreadcrumbCrumb } from '@/components/PageBreadcrumb';
import JDVersionHistoryModal from '@/components/JDVersionHistoryModal';
import JobOpeningSummary from '@/components/jobs/JobOpeningSummary';
import JobVersionHistoryPanel from '@/components/jobs/JobVersionHistoryPanel';
import ListPagination from '@/components/ListPagination';
import { useJobVersionLineage } from '@/lib/hooks/useJobVersionLineage';
import {
  buildAssessmentJobList,
  isSelectableVersion,
  jobSearchMatcher,
  lineageKey,
  mapJDStatus,
  mapJDToJob,
  sortJobs,
} from '@/lib/utils/jobOpeningDisplay';

// Languages that have an executable runtime in the candidate's coding round.
// Mirrors LANGUAGE_VERSIONS in backend app/routers/candidate.py — anything not
// in this set (SQL, Scala, R, Bash, Dart, Perl, etc.) is filtered out before
// it reaches the assessment's coding_languages, because there is no compiler
// to run candidate submissions against. SQL questions can still appear in the
// Technical round as MCQ/text.
const COMPILABLE_LANGUAGES = [
  'Python', 'JavaScript', 'TypeScript', 'Java', 'C', 'C++', 'C#',
  'Go', 'Rust', 'Ruby', 'PHP', 'Kotlin', 'Swift',
] as const;
const COMPILABLE_LANGUAGES_LOWER = new Set(COMPILABLE_LANGUAGES.map(l => l.toLowerCase()));
/** How many languages one coding round may carry. Declared beside the list it
 *  caps so the two cannot drift; every gate reads this, never a literal. */
const MAX_CODING_LANGUAGES = 10;
const filterCompilable = (langs: string[] | undefined | null): string[] => {
  if (!Array.isArray(langs)) return [];
  return langs.filter(l => l && COMPILABLE_LANGUAGES_LOWER.has(String(l).trim().toLowerCase()));
};

/**
 * The JD picker's radio groups. Exactly one JD version is ever selected: the
 * "Latest Version" radio on a job card, or one of the v1 / v2 / v3 … rows in
 * that job's expanded Version History.
 *
 * The cards share this name outright, so the browser enforces one ticked card.
 * Each expanded history takes `${JD_RADIO_GROUP}-${lineage}` instead: its
 * latest row and the card above it are two radios for the SAME pick (the table
 * keeps the latest row for its Assessment column), and a single native group
 * would let only one of them stay checked. Selection state is the authority
 * across groups — every other lineage's radios are disabled while a pick is
 * held, so a second one can't be made in the first place.
 */
const JD_RADIO_GROUP = 'assessment-jd-version-selection';

/**
 * The green badge a JD VERSION carries once it has an assessment — on the job
 * card and on every version row, so "created" reads identically wherever it
 * appears. A version without one renders nothing.
 *
 * The date is shown where it is known (it arrives with the lineage fetch the
 * version history makes), because "created 12 Aug" answers the next question
 * a recruiter asks after "created".
 */
function AssessmentStatusBadge({
  created,
  createdAt,
}: {
  created: boolean;
  createdAt?: string;
}) {
  /* Nothing at all where the version is still free: the Create action beside
     it already says so, and a "Not Created" chip on every untouched version was
     noise on the rows that are the normal case. */
  if (!created) return null;
  return (
    <span
      className="px-2 sm:px-2.5 py-1 bg-green-100 text-green-700 ring-1 ring-green-200 rounded text-xs inline-flex items-center gap-1 whitespace-nowrap"
      title={createdAt ? `Assessment created ${formatISTDate(createdAt)}` : undefined}
    >
      <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
      Assessment Created
      {createdAt && (
        <span className="text-[11px] font-normal text-green-700/80">· {formatISTDate(createdAt)}</span>
      )}
    </span>
  );
}

/**
 * The Version History table's Assessment cell.
 *
 * Both states are stated outright — "Created" and "Not Created" — unlike the
 * card's badge above, which renders nothing on a free version. In a column
 * every row answers the same question, so a blank cell there reads as missing
 * data rather than as an answer, and "which versions can I still build
 * against" is exactly what this table is scanned for.
 *
 * No date: the row carries Posted On and Last Updated already, and the created
 * date belongs to the assessment rather than to the version this table lists.
 */
function AssessmentCreatedLabel({ created }: { created: boolean }) {
  return (
    <span
      className={`px-2 sm:px-2.5 py-1 rounded text-xs inline-flex items-center gap-1 whitespace-nowrap ring-1 ${
        created
          ? 'bg-green-100 text-green-700 ring-green-200'
          : 'bg-slate-100 text-slate-500 ring-slate-200'
      }`}
    >
      {created && <CheckCircle2 className="w-3 h-3 flex-shrink-0" />}
      {created ? 'Created' : 'Not Created'}
    </span>
  );
}

/* The two questions this picker asks about a JD version — "should it be shown?"
   (everything but Draft) and "can a NEW assessment be built against it?"
   (Published/Republished only) — now live together in
   lib/utils/jobOpeningDisplay, beside the list rule that calls them, so the
   list and the per-control gates below cannot drift into disagreeing.

   The local `isPublishedVersion` was the second question under a name that read
   like the first; the gates below call `isSelectableVersion` directly now, so
   which question a control is asking is legible at the call site. */

/** Same page size the Job Openings page reads the JD list in. */
const JD_BATCH_SIZE = 100;

/**
 * Every JD version this recruiter can see — unfiltered, and paged to the end.
 *
 * EVERY VERSION, deliberately. Asking the endpoint for `status: 'published'`
 * instead looks like the cheaper way to get a published list, and it is wrong
 * in exactly one way that shows: it strips a lineage's draft v2 before the
 * versions can be collapsed, so the published v1 stands in as the latest. The
 * card then reads "Published · v1" while its own Version History — which is
 * fed by the lineage endpoint and does see the v2 — badges "v2 LATEST · Draft"
 * two lines below it. Same bug, same fix, as the Apply to Job dialog's list.
 *
 * Any status test therefore belongs AFTER the lineage collapse, on the full
 * list (see `availableJobs`), never in this request.
 */
const fetchAllJdVersions = async () => {
  const firstPage = await jdService.list({ page: 1, page_size: JD_BATCH_SIZE, source: 'my-jds' });
  const items = [...firstPage.items];
  const totalPages = Math.max(
    firstPage.total_pages || Math.ceil(firstPage.total / JD_BATCH_SIZE),
    1,
  );
  for (let page = 2; page <= totalPages; page += 1) {
    const nextPage = await jdService.list({ page, page_size: JD_BATCH_SIZE, source: 'my-jds' });
    items.push(...nextPage.items);
  }
  return items;
};

/**
 * The Add button's two questions, in one place, so the card and every version
 * row answer them identically: is this version live, and is it still free.
 * Enabled only where both say yes; otherwise the button stays put and the
 * reason becomes its tooltip.
 */
const addButtonState = (versionNumber: number | undefined, published: boolean, created: boolean) => {
  if (!published) {
    return {
      enabled: false,
      label: `v${versionNumber ?? 1} is not published — an assessment can only be created against a published or republished version`,
    };
  }
  if (created) {
    return {
      enabled: false,
      label: `v${versionNumber ?? 1} already has an assessment`,
    };
  }
  return { enabled: true, label: `Create an assessment against v${versionNumber ?? 1}` };
};

/**
 * The Add button's inert skin: the same box, size and radius as the live one,
 * so the column keeps its shape whatever the row's status. Only the fill
 * changes, which is what makes "you cannot use this one" readable at a glance.
 */
const ADD_BUTTON_DISABLED = 'bg-slate-200 text-slate-400 ring-slate-300/60 shadow-none cursor-not-allowed';

// Dynamic import to break circular dependency chain that causes TDZ error
// when navigating to Assessment Results (AssessmentCreation → JDCreation creates
// a synchronous module init cycle in the assessments page bundle)
const JDCreation = dynamic(() => import('@/components/JDCreation'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-8 w-8 text-brand-blue animate-spin" />
    </div>
  ),
});

// 1:1 JD-Assessment relationship: JDs that already have assessments cannot be selected

interface TopicSettings {
  hr_enabled: boolean;
  hr_scoring_type: 'informational' | 'scored';
  technical_enabled: boolean;
  technical_scoring_type: 'informational' | 'scored';
  coding_enabled: boolean;
  coding_scoring_type: 'informational' | 'scored';
}

interface ProctoringSettings {
  proctoring_enabled: boolean;
  webcam_monitoring: boolean;
  screen_recording: boolean;
  screenshot_blocking: boolean;
  tab_switch_detection: boolean;
  copy_paste_blocking: boolean;
  browser_lockdown: boolean;
  ai_cheating_prevention: boolean;
}

interface AssessmentCreationProps {
  onBack: () => void;
  jobs: Job[];
  onCreateAssessment: (assessment: any) => void;
  onCreateNewJD?: () => void;
  onJobsRefresh?: () => void;
  topicSettings?: TopicSettings;
  preSelectedJobId?: string;
  proctoringSettings?: ProctoringSettings | null;
}

/** The three assessment rounds, by name — each round owns the section of the
 *  same name, which is what the Configure step nests under it. */
type RoundName = 'HR' | 'Technical' | 'Coding';

interface SectionConfig {
  name: RoundName;
  percentage: number;
  // The HR section carries full question objects here, Technical/Coding carry plain
  // topic labels - mirroring assessmentService.HRTopic and the backend's List[Any]
  // (app/schemas/assessment.py). Declared `string[]` before, which the HR branch broke.
  topics: HRTopic[];
  enabled: boolean;
}

interface HRBankQuestion {
  id: string;
  text: string;
  type: 'Text' | 'Yes/No';
  time: number;
  correct_answer?: string;
  is_active: boolean;
}

interface HRQuestionFormState {
  question_text: string;
  answer_type: 'text' | 'yes_no';
  correct_answer?: 'Yes' | 'No';
  time_minutes: number;
}

const EMPTY_HR_QUESTION_FORM: HRQuestionFormState = {
  question_text: '',
  answer_type: 'text',
  correct_answer: undefined,
  time_minutes: 3,
};

function getExperienceRange(job: Pick<Job, 'experience' | 'experience_min' | 'experience_max'>): { min: number; max: number } {
  if (job.experience_min != null || job.experience_max != null) {
    return {
      min: Number(job.experience_min ?? 0),
      max: Number(job.experience_max ?? 0),
    };
  }

  const raw = String(job.experience || '').trim().toLowerCase();
  if (!raw) return { min: 0, max: 0 };

  const rangeMatch = raw.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  if (rangeMatch) {
    return {
      min: Number(rangeMatch[1]),
      max: Number(rangeMatch[2]),
    };
  }

  const plusMatch = raw.match(/(\d+(?:\.\d+)?)\s*\+/);
  if (plusMatch) {
    const min = Number(plusMatch[1]);
    return { min, max: min };
  }

  const singleMatch = raw.match(/(\d+(?:\.\d+)?)/);
  if (singleMatch) {
    const value = Number(singleMatch[1]);
    return { min: value, max: value };
  }

  return { min: 0, max: 0 };
}

export default function AssessmentCreation({ onBack, jobs, onCreateAssessment, onCreateNewJD, onJobsRefresh, topicSettings, preSelectedJobId, proctoringSettings: initialProctoringSettings }: AssessmentCreationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isTenantAdmin, user } = useAuth();
  const canCreateJd = isTenantAdmin || (user?.permissions?.canCreateJD ?? false);
  const { available: assessmentAvailable } = usePlanFeature('assessment');

  // Read initial step from URL, default to 'select-jd'
  const urlStep = searchParams.get('step') as 'select-jd' | 'configure' | 'preview' | null;
  const urlJdId = searchParams.get('jd_id');
  const editAssessmentId = searchParams.get('edit'); // Edit mode: assessment ID to edit

  // Entered from a JD's Job Details page (Quick Actions → Assessment → Create).
  // Mirrors the AI Interview config flow: the breadcrumb stays anchored to that
  // job instead of resetting to the Assessments trail, and `from`/`returnUrl`
  // survive every in-flow URL rewrite so the anchor holds across steps.
  const fromJobDetails = searchParams.get('from') === 'job-details';
  const returnUrl = searchParams.get('returnUrl');
  // JD title carried in the URL. The JD list is fetched async, so without this
  // the JD crumb would render a placeholder on first paint and visibly swap to
  // the real title a moment later.
  const urlJdTitle = searchParams.get('jd_title');

  const [step, setStepState] = useState<'select-jd' | 'configure' | 'preview'>(urlStep || 'select-jd');
  /**
   * Which rounds have their section card open on the Configure step.
   *
   * All three open by default: a recruiter who has just enabled a round wants
   * to see what they enabled, and collapsing is for getting a long HR question
   * list out of the way once it is settled. Purely presentational — nothing
   * saved reads it, and a collapsed section is still part of the assessment.
   */
  const [expandedRounds, setExpandedRounds] = useState<Set<RoundName>>(
    () => new Set<RoundName>(['HR', 'Technical', 'Coding']),
  );
  const toggleRoundExpanded = (round: RoundName) =>
    setExpandedRounds(prev => {
      const next = new Set(prev);
      if (next.has(round)) next.delete(round);
      else next.add(round);
      return next;
    });
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [duration, setDuration] = useState(30); // Assessment duration in minutes (15-180)
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState<any>(null);
  const [jdSearch, setJdSearch] = useState('');
  /* JD picker paging. The page is stored WITH the search it belongs to — the
     same trick the Apply to Job dialog uses — so a new query starts back at
     page one by comparison rather than by an effect that resets it a render
     later (which would flash one page of the wrong rows). */
  const [jdPageState, setJdPageState] = useState({ query: '', page: 1 });
  const [jdItemsPerPage, setJdItemsPerPage] = useState(10);
  const jdListRef = useRef<HTMLDivElement>(null);
  /* Version history for the picker's rows — the same hook and endpoints behind
     the Job Openings list's own "View Versions", so the history opened here is
     the history that page shows. */
  const jdLineage = useJobVersionLineage();
  /* The job whose full Version History popup is open — the Job Details page's
     own modal, opened by the eye on a row. */
  const [versionHistoryFor, setVersionHistoryFor] = useState<Job | null>(null);
  /**
   * Version number the history popup opens straight into, or null to open on
   * the list.
   *
   * The two Eyes on this screen ask different questions and the modal already
   * answers both: the card's Eye means "what happened to this job", so it opens
   * on the list; a version row's Eye means "show me THIS version", so it opens
   * on that version's detail via the modal's own `initialVersionNumber`. Held
   * beside `versionHistoryFor` rather than read off it, because the card's Job
   * carries a versionNumber too and reading that would silently change the
   * card Eye's behaviour.
   */
  const [versionHistoryVersion, setVersionHistoryVersion] = useState<number | null>(null);
  /* The JD VERSION the recruiter has ticked in the picker — the card's radio
     picks the latest, a Version History row picks an older one. Held with the
     LINEAGE it belongs to rather than as a bare record, because that is what
     makes "one version at a time, across every job" answerable: every other
     lineage's radios go inert while this is set. Nothing about the selection
     is sent anywhere, so it keeps the record rather than an id. */
  const [jdPick, setJdPick] = useState<{ lineage: string; job: Job } | null>(null);
  /* Tick a version, or let go of the one already ticked by clicking it again —
     which is what re-enables every other job's versions. */
  const pickJdVersion = (job: Job, lineage: string) =>
    setJdPick(prev => (prev?.job.id === job.id ? null : { job, lineage }));
  /* The assessments already created in a lineage, keyed by lineage and then by
     the JD VERSION id each was created against.
     
     This is the version-specific half of "one assessment per JD version": the
     mount-time index (jdsWithAssessments) answers whether a version has one,
     and this answers WHICH assessment and WHEN — the created date the version
     rows show. Fetched once per job, when its versions are first opened. */
  const [lineageAssessments, setLineageAssessments] = useState<Record<string, Record<string, { id: string; createdAt?: string; title?: string }>>>({});
  const [loadingLineageAssessments, setLoadingLineageAssessments] = useState<Record<string, boolean>>({});

  // Helper function to update step and URL
  const setStep = (newStep: 'select-jd' | 'configure' | 'preview', jobId?: string) => {
    setStepState(newStep);
    const params = new URLSearchParams();

    // Origin params ride along on every rewrite. Without this the breadcrumb
    // would fall back to the Assessments trail the moment the user advanced a
    // step, and Back would lose the job it came from.
    const withOrigin = (p: URLSearchParams) => {
      if (fromJobDetails) p.set('from', 'job-details');
      if (returnUrl) p.set('returnUrl', returnUrl);
      if (urlJdTitle) p.set('jd_title', urlJdTitle);
      return p;
    };

    // When going back to select-jd, clear step/jd params (but keep the origin)
    if (newStep === 'select-jd') {
      const q = withOrigin(new URLSearchParams()).toString();
      router.replace(`/recruitment/assessments/create${q ? `?${q}` : ''}`, { scroll: false });
      return;
    }

    params.set('step', newStep);
    if (jobId || selectedJob?.id) {
      params.set('jd_id', jobId || selectedJob?.id || '');
    }
    const queryString = withOrigin(params).toString();
    router.replace(`/recruitment/assessments/create${queryString ? `?${queryString}` : ''}`, { scroll: false });
  };

  /**
   * The crumb for each STEP of this flow, worded as the step's own page is.
   *
   * "Configure Assessment" is the heading of the configure step; "Select Job
   * Description" is what the first step asks for. A crumb that reads
   * differently from the page under it is a crumb the reader has to translate.
   */
  const STEP_CRUMB_LABEL: Record<'select-jd' | 'configure' | 'preview', string> = {
    'select-jd': 'Select Job Description',
    configure: 'Configure Assessment',
    preview: 'Assessment Saved',
  };

  /**
   * The steps, as the trail behind wherever the user is standing.
   *
   * This used to be ONE crumb — "Create Assessment" — on every step, so the
   * trail said the flow had been entered but never which part of it was on
   * screen, and advancing from the picker to Configure changed nothing in it.
   * Each step now names itself, and the steps before it are the path back:
   *
   *   Dashboard › Assessments › Select Job Description
   *   Dashboard › Assessments › Select Job Description › Configure Assessment
   *
   * The earlier crumbs are `onClick`, not `href`: every step of this flow
   * lives at the same route (the URL only gains a `step` param, and inline on
   * the Assessments page it does not even do that), so a link would point at
   * the page the user is already on. `setStep` is what actually moves between
   * them, and it is the same call the in-page Back controls make.
   *
   * EDIT MODE is one leaf, not a chain. It is deep-linked straight to
   * Configure with the assessment already chosen, so there is no picker step
   * behind it — offering "Select Job Description" would name a step the user
   * never passed through and could not usefully go back to. Read off the URL's
   * `edit` param rather than the `isEditMode` state it sets, because the state
   * lands an effect later and the crumbs would visibly swap under the user.
   */
  const buildStepCrumbs = (): BreadcrumbCrumb[] => {
    if (editAssessmentId) return [{ label: 'Edit Assessment' }];
    if (step === 'select-jd') return [{ label: STEP_CRUMB_LABEL['select-jd'] }];
    return [
      { label: STEP_CRUMB_LABEL['select-jd'], onClick: () => setStep('select-jd') },
      ...(step === 'preview'
        ? [{ label: STEP_CRUMB_LABEL.configure, onClick: () => setStep('configure') }]
        : []),
      { label: STEP_CRUMB_LABEL[step] },
    ];
  };

  // Breadcrumb trail — Job Details anchored when the flow was entered from a
  // JD page, otherwise the standard Assessments trail. Both end in the step
  // chain above, so a step reads the same whichever way the flow was entered.
  const buildBreadcrumbItems = (): BreadcrumbCrumb[] => {
    const jdId = selectedJob?.id || preSelectedJobId || urlJdId;
    if (fromJobDetails && jdId) {
      return [
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Job Descriptions', href: '/recruitment/job-openings' },
        // urlJdTitle before the fetched title: identical text, but available on
        // the very first paint, so the crumb never changes under the user.
        { label: urlJdTitle || selectedJob?.title || 'Job Details', href: returnUrl || `/recruitment/job-details?id=${encodeURIComponent(jdId)}` },
        ...buildStepCrumbs(),
      ];
    }
    return [
      { label: 'Dashboard', href: '/dashboard' },
      /* NO "Recruitment" crumb. It used to sit here as a grouping label for
         the section this flow lives under, and it was wrong twice over.

         A breadcrumb states the path the user actually took, and nobody takes
         that one: the route in is Dashboard → Assessments → Create Assessment,
         and there is no Recruitment page to have passed through (which is why
         the crumb had to be an unclickable label in the first place).

         It also stood alone. The Assessments list this flow opens FROM is
         `Dashboard › Assessments`, and every other assessment screen — the
         details view, Results, the result detail page, All Assessments, the
         HR Question Bank — is `Dashboard › Assessments › <leaf>`. So opening
         Create grew a crumb in the middle of the trail, and the JD creation
         page this flow links on to (`?from=assessment`, which builds
         `Dashboard › Assessments › Create Assessment › …`) dropped it again
         one click later. The crumb appeared and vanished mid-journey while the
         user went one level deeper. */
      // onClick, not href: the Assessments page renders this flow INLINE at
      // /recruitment/assessments, so linking to that URL asked Next.js to
      // navigate to the route it is already on — nothing happened, and the
      // crumb looked broken. `onBack` closes the inline view, and on the
      // standalone /assessments/create route it navigates back for real.
      { label: 'Assessments', onClick: onBack },
      ...buildStepCrumbs(),
    ];
  };

  // Calculate Technical vs Coding percentage based on skills and experience
  const calculateTimeSplit = (job: Job, hasCoding: boolean): { technical: number; coding: number } => {
    if (!hasCoding) return { technical: 100, coding: 0 };

    const skillCount = job.skills?.length || 0;
    const { min: expMin, max: expMax } = getExperienceRange(job);
    const avgExp = expMax > 0 ? (expMin + expMax) / 2 : expMin;

    // Determine experience level
    let expLevel: 'entry' | 'junior' | 'mid' | 'senior' | 'expert' = 'mid';
    if (avgExp <= 2) expLevel = 'entry';
    else if (avgExp <= 4) expLevel = 'junior';
    else if (avgExp <= 7) expLevel = 'mid';
    else if (avgExp <= 10) expLevel = 'senior';
    else expLevel = 'expert';

    // Base coding percentage by experience level
    // Entry/Junior: less coding, more MCQ/text in technical
    // Senior/Expert: more coding, deeper problems
    let codingPct = 20; // default
    switch (expLevel) {
      case 'entry':  codingPct = 15; break;  // 15% coding (4.5 min) — simple problems
      case 'junior': codingPct = 20; break;  // 20% coding (6 min) — moderate problems
      case 'mid':    codingPct = 25; break;  // 25% coding (7.5 min) — challenging
      case 'senior': codingPct = 30; break;  // 30% coding (9 min) — complex
      case 'expert': codingPct = 35; break;  // 35% coding (10.5 min) — architecture level
    }

    // Adjust by skill count — more skills = more technical breadth needed
    if (skillCount >= 8) {
      codingPct = Math.max(codingPct - 5, 10); // More skills → more technical time
    } else if (skillCount <= 3) {
      codingPct = Math.min(codingPct + 5, 40); // Fewer skills → deeper coding
    }

    const technicalPct = 100 - codingPct;

    console.log(`[TalentFlow] Time split calculated: exp=${avgExp}yrs (${expLevel}), skills=${skillCount}, technical=${technicalPct}%, coding=${codingPct}%`);

    return { technical: technicalPct, coding: codingPct };
  };

  // Navigate to JD creation page. The exact assessment URL rides along as
  // `returnUrl` so JD creation's breadcrumb and Back land on the picker the
  // recruiter left — including the Job Details anchor when the flow was entered
  // from a JD page, which a bare `/assessments/create` would have discarded.
  const handleCreateNewJD = () => {
    const assessmentParams = new URLSearchParams();
    if (fromJobDetails) assessmentParams.set('from', 'job-details');
    if (returnUrl) assessmentParams.set('returnUrl', returnUrl);
    if (urlJdTitle) assessmentParams.set('jd_title', urlJdTitle);
    const assessmentQuery = assessmentParams.toString();
    const assessmentReturnUrl = `/recruitment/assessments/create${assessmentQuery ? `?${assessmentQuery}` : ''}`;

    router.push(
      `/recruitment/jd-creation?from=assessment&returnUrl=${encodeURIComponent(assessmentReturnUrl)}`
    );
  };

  // Load assessment data when in edit mode
  useEffect(() => {
    const loadAssessmentForEdit = async () => {
      if (!editAssessmentId) return;

      try {
        setIsEditMode(true);
        console.log('[TalentFlow] Loading assessment for edit:', editAssessmentId);

        const assessment = await assessmentService.get(editAssessmentId);
        setEditingAssessment(assessment);

        // Pre-populate form fields with existing assessment data
        // Note: Duration is always fixed at 30 minutes (backend value ignored for now)
        setDuration(30);
        setProctoringEnabled(assessment.proctoring_enabled ?? true);

        // Update sections with existing data
        setSections([
          {
            name: 'HR',
            percentage: assessment.hr_percentage || 0,
            topics: assessment.hr_topics || [],
            enabled: assessment.hr_enabled ?? true
          },
          {
            name: 'Technical',
            percentage: assessment.technical_percentage || 0,
            topics: assessment.technical_topics || [],
            enabled: assessment.technical_enabled ?? true
          },
          {
            name: 'Coding',
            percentage: assessment.coding_percentage || 0,
            topics: assessment.coding_topics || [],
            enabled: assessment.coding_enabled ?? false
          }
        ]);

        // Set coding languages if present. Filter out any non-compilable
        // languages — older drafts may have stored SQL etc. before this
        // filter existed; we don't want them to keep appearing.
        if (assessment.coding_languages?.length > 0) {
          setSelectedCodingLanguages(filterCompilable(assessment.coding_languages));
        }

        // We can't recover whether the original creator enabled Coding
        // automatically or manually, so for an existing assessment treat
        // anything currently enabled as "auto" — closest to what was
        // displayed before, and the recruiter can flip it off & on again
        // to flip the label.
        setCodingEnabledSource(assessment.coding_enabled ? 'auto' : null);

        console.log('[TalentFlow] Assessment loaded for editing:', assessment.title);
      } catch (error) {
        console.error('Failed to load assessment for edit:', error);
        toast.error('Failed to load assessment for editing. Please try again.');
        // Back where the recruiter came from (the JD's page when the flow
        // started there), not the Assessments list they never chose.
        router.push(returnUrl || '/recruitment/assessments');
      }
    };

    loadAssessmentForEdit();
  }, [editAssessmentId]);

  // Initialize sections based on global topic settings
  // HR uses fixed Question Bank duration — only Technical + Coding use percentages (must total 100%)
  const getInitialSections = (): SectionConfig[] => {
    const technicalEnabled = topicSettings?.technical_enabled ?? true;
    const codingEnabled = topicSettings?.coding_enabled ?? true;

    let techPct = 0, codePct = 0;

    if (technicalEnabled && codingEnabled) {
      techPct = 80; codePct = 20;
    } else if (technicalEnabled) {
      techPct = 100;
    } else if (codingEnabled) {
      codePct = 100;
    }

    return [
      { name: 'HR', percentage: 0, topics: [], enabled: true },
      { name: 'Technical', percentage: techPct, topics: [], enabled: technicalEnabled },
      { name: 'Coding', percentage: codePct, topics: [], enabled: false }, // Coding starts disabled, enabled by JD
    ];
  };

  const [sections, setSections] = useState<SectionConfig[]>(getInitialSections());
  const [newTopic, setNewTopic] = useState({ section: '' as 'HR' | 'Technical' | 'Coding', value: '' });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAssessment, setGeneratedAssessment] = useState<any>(null);
  const [showPublishSuccessModal, setShowPublishSuccessModal] = useState(false);
  const [publishedAssessmentTitle, setPublishedAssessmentTitle] = useState('');
  const publishedAssessmentRef = useRef<any>(null);
  const publishSuccessHandledRef = useRef(false);
  const publishSuccessTimerRef = useRef<number | null>(null);
  const [proctoringEnabled, setProctoringEnabled] = useState(initialProctoringSettings?.proctoring_enabled ?? true);

  // Sync proctoringEnabled when settings load async (only before user manually toggles)
  const [userToggledProctoring, setUserToggledProctoring] = useState(false);
  useEffect(() => {
    if (!userToggledProctoring && initialProctoringSettings != null) {
      setProctoringEnabled(initialProctoringSettings.proctoring_enabled);
    }
  }, [initialProctoringSettings, userToggledProctoring]);

  const [localJobs, setLocalJobs] = useState<Job[]>(jobs);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);

  // 1:1 JD-Assessment: Track which JDs already have assessments
  const [jdsWithAssessments, setJdsWithAssessments] = useState<Set<string>>(new Set());
  const [hasLoadedAssessmentEligibility, setHasLoadedAssessmentEligibility] = useState(false);

  // Auto-save draft state
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [draftSavedId, setDraftSavedId] = useState<string | null>(null);

  // Full-screen JD Creation modal state
  const [showJDCreation, setShowJDCreation] = useState(false);

  // Coding confirmation popup state
  const [showCodingConfirm, setShowCodingConfirm] = useState(false);
  /* The selection as it stood when the picker was opened in 'edit' mode, so
     Cancel can put it back. The picker's buttons write straight to
     `selectedCodingLanguages`, which is right for the enable path (nothing is
     applied until Confirm turns the round on) but wrong for editing a round
     that is already on - there, a change is live the moment it is clicked, and
     a Cancel that left it in place would not be a cancel. Null outside edit
     mode, so the other two paths keep their existing behaviour exactly. */
  const codingLanguagesBeforeEditRef = useRef<string[] | null>(null);
  /* 'enable' turns the round on (and restores percentages), 'disable' turns it
     off, 'edit' only changes the languages of a round that is already on - it
     must NOT re-run the enable path, which would reset the percentage split. */
  const [codingPopupMode, setCodingPopupMode] = useState<'enable' | 'disable' | 'edit'>('enable');
  const [selectedCodingLanguages, setSelectedCodingLanguages] = useState<string[]>([]);
  // Tracks how the Coding section ended up enabled so the section header can
  // show a truthful label. "auto" = JD-driven (skills/title detection set it
  // on at JD-select time); "manual" = recruiter flipped the toggle. Stays
  // null when Coding is disabled.
  const [codingEnabledSource, setCodingEnabledSource] = useState<'auto' | 'manual' | null>(null);

  // HR Question Bank - loaded from the live question bank API for this tenant
  const [hrQuestionBank, setHrQuestionBank] = useState<HRBankQuestion[]>([]);
  const hrQuestionsInitializedRef = useRef(false);
  const HR_QUESTION_LIMIT = 5;
  const [selectedHRQuestions, setSelectedHRQuestions] = useState<string[]>([]);
  const [showAddHRQuizModal, setShowAddHRQuizModal] = useState(false);
  const [newHRQuestion, setNewHRQuestion] = useState<HRQuestionFormState>(EMPTY_HR_QUESTION_FORM);
  const [isSavingHRQuestion, setIsSavingHRQuestion] = useState(false);

  const loadHRQuestionBank = useCallback(async () => {
    try {
      const response = await api.get('/hr-question-bank');
      const data = Array.isArray(response.data) ? response.data : [];
      const mapped: HRBankQuestion[] = data
        .map((q: any) => ({
          id: q.id,
          text: q.question_text,
          type: (q.answer_type === 'yes_no' ? 'Yes/No' : 'Text') as 'Yes/No' | 'Text',
          time: q.answer_type === 'yes_no' ? 1 : 3,
          correct_answer: q.correct_answer || undefined,
          is_active: q.is_active ?? true,
        }))
        .filter((q: HRBankQuestion) => q.is_active);
      setHrQuestionBank(mapped);
      return mapped;
    } catch (error) {
      console.error('[AssessmentCreation] Failed to load HR question bank:', error);
      setHrQuestionBank([]);
      toast.error('Failed to load HR Question Bank');
      return [];
    }
  }, []);

  useEffect(() => {
    loadHRQuestionBank();
  }, [loadHRQuestionBank]);

  useEffect(() => {
    if (hrQuestionsInitializedRef.current || hrQuestionBank.length === 0) return;
    if (editAssessmentId && !editingAssessment) return;

    if (editAssessmentId && editingAssessment) {
      const savedTopics = Array.isArray(editingAssessment.hr_topics) ? editingAssessment.hr_topics : [];
      const selectedIds = savedTopics
        .map((topic: any) => {
          const topicText = (topic?.text || '').trim().toLowerCase();
          return hrQuestionBank.find(q => q.text.trim().toLowerCase() === topicText)?.id || null;
        })
        .filter(Boolean)
        .slice(0, HR_QUESTION_LIMIT) as string[];

      setSelectedHRQuestions(selectedIds);
    } else {
      setSelectedHRQuestions(hrQuestionBank.slice(0, HR_QUESTION_LIMIT).map(q => q.id));
    }

    hrQuestionsInitializedRef.current = true;
  }, [hrQuestionBank, editAssessmentId, editingAssessment]);

  const toggleHRQuestion = (id: string) => {
    const hrSection = sections.find(s => s.name === 'HR');
    if (!hrSection?.enabled) return;

    setSelectedHRQuestions(prev => {
      if (prev.includes(id)) {
        return prev.filter(q => q !== id);
      }
      if (prev.length >= HR_QUESTION_LIMIT) {
        toast.error(`Maximum ${HR_QUESTION_LIMIT} HR questions allowed`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const selectAllHR = () => {
    const hrSection = sections.find(s => s.name === 'HR');
    if (!hrSection?.enabled) return;

    if (hrQuestionBank.length > HR_QUESTION_LIMIT) {
      toast.error(`Maximum ${HR_QUESTION_LIMIT} HR questions allowed. Selecting first ${HR_QUESTION_LIMIT}.`);
      setSelectedHRQuestions(hrQuestionBank.slice(0, HR_QUESTION_LIMIT).map(q => q.id));
    } else {
      setSelectedHRQuestions(hrQuestionBank.map(q => q.id));
    }
  };
  const deselectAllHR = () => {
    const hrSection = sections.find(s => s.name === 'HR');
    if (!hrSection?.enabled) return;
    setSelectedHRQuestions([]);
  };

  const openAddHRQuizModal = () => {
    const hrSection = sections.find(s => s.name === 'HR');
    if (!hrSection?.enabled) return;

    setNewHRQuestion(EMPTY_HR_QUESTION_FORM);
    setShowAddHRQuizModal(true);
  };

  const closeAddHRQuizModal = () => {
    if (isSavingHRQuestion) return;
    setShowAddHRQuizModal(false);
    setNewHRQuestion(EMPTY_HR_QUESTION_FORM);
  };

  const handleSaveHRQuestion = async () => {
    const questionText = newHRQuestion.question_text.trim();
    if (!questionText) {
      toast.error('Question text is required');
      return;
    }

    setIsSavingHRQuestion(true);
    try {
      await api.post('/hr-question-bank', {
        question_text: questionText,
        answer_type: newHRQuestion.answer_type,
        correct_answer: newHRQuestion.answer_type === 'yes_no' ? (newHRQuestion.correct_answer || 'Yes') : null,
      });

      const refreshedQuestions = await loadHRQuestionBank();
      const createdQuestion = refreshedQuestions.find(q => q.text.trim().toLowerCase() === questionText.toLowerCase());
      if (createdQuestion && selectedHRQuestions.length < HR_QUESTION_LIMIT) {
        setSelectedHRQuestions(prev => (prev.includes(createdQuestion.id) ? prev : [...prev, createdQuestion.id]));
      }

      toast.success('Question added to HR Question Bank');
      closeAddHRQuizModal();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to add HR question');
    } finally {
      setIsSavingHRQuestion(false);
    }
  };

  const renderAddHRQuizModal = () => {
    if (!showAddHRQuizModal) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-6">
        <div className="w-full max-w-[95vw] sm:max-w-2xl rounded-xl border border-gray-100 bg-white ring-1 ring-black/[0.02] shadow-2xl shadow-brand-blue/10 max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden">
          <div className="flex-shrink-0 flex items-center justify-between border-b border-gray-100 px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
                <FileText className="w-4 h-4 text-brand-blue" />
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight">Add New Question</h3>
            </div>
            <button type="button" onClick={closeAddHRQuizModal} className="p-1.5 text-gray-500 hover:text-brand-blue hover:bg-brand-blue/5 rounded-md transition-colors" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 px-4 sm:px-6 py-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Question Text *</label>
              <input
                type="text"
                value={newHRQuestion.question_text}
                onChange={(e) => setNewHRQuestion(prev => ({ ...prev, question_text: e.target.value }))}
                placeholder="Enter the HR question..."
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Answer Type</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setNewHRQuestion(prev => ({ ...prev, answer_type: 'text', correct_answer: undefined, time_minutes: 3 }))}
                  className={`flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-all ${
                    newHRQuestion.answer_type === 'text'
                      ? 'border-brand-blue/40 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-brand-blue/30 hover:text-brand-blue'
                  }`}
                >
                  Text Answer
                </button>
                <button
                  type="button"
                  onClick={() => setNewHRQuestion(prev => ({ ...prev, answer_type: 'yes_no', correct_answer: prev.correct_answer || 'Yes', time_minutes: 1 }))}
                  className={`flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-all ${
                    newHRQuestion.answer_type === 'yes_no'
                      ? 'border-brand-blue/40 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-brand-blue/30 hover:text-brand-blue'
                  }`}
                >
                  Yes / No
                </button>
              </div>
            </div>

            {newHRQuestion.answer_type === 'yes_no' && (
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Correct Answer *</label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setNewHRQuestion(prev => ({ ...prev, correct_answer: 'Yes' }))}
                    className={`flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-all ${
                      newHRQuestion.correct_answer === 'Yes'
                        ? 'border-green-500 bg-green-50 text-green-700 ring-1 ring-green-200'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-brand-blue/30 hover:text-brand-blue'
                    }`}
                  >
                    Yes is correct
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewHRQuestion(prev => ({ ...prev, correct_answer: 'No' }))}
                    className={`flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-all ${
                      newHRQuestion.correct_answer === 'No'
                        ? 'border-green-500 bg-green-50 text-green-700 ring-1 ring-green-200'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-brand-blue/30 hover:text-brand-blue'
                    }`}
                  >
                    No is correct
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex-shrink-0 flex justify-end gap-2 sm:gap-3 border-t border-gray-100 bg-slate-50 px-4 sm:px-6 py-3">
            <button
              type="button"
              onClick={closeAddHRQuizModal}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveHRQuestion}
              disabled={isSavingHRQuestion}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-blue hover:bg-brand-blue-2 text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10 px-4 py-2 text-sm disabled:opacity-60 transition-colors"
            >
              <FileText className="w-4 h-4" />
              {isSavingHRQuestion ? 'Saving...' : 'Save Question'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Store previous percentages when coding is disabled (to restore when re-enabled)
  const [savedPercentagesBeforeCodingDisable, setSavedPercentagesBeforeCodingDisable] = useState<{
    hr: number;
    technical: number;
    coding: number;
  } | null>(null);

  // Minimum round validation popup state
  const [showMinRoundPopup, setShowMinRoundPopup] = useState(false);

  // Store JD-extracted languages separately so we can restore them when re-enabling coding
  const [jdExtractedLanguages, setJdExtractedLanguages] = useState<string[]>([]);

  // ✅ SMART CONFIG: Track if coding was enabled/disabled by smart config (locked state)
  const [isCodingLockedBySmartConfig, setIsCodingLockedBySmartConfig] = useState<boolean>(false);
  const [codingLockReason, setCodingLockReason] = useState<string>('');

  // Available programming languages for the coding round. Tied to the
  // module-level COMPILABLE_LANGUAGES so the recruiter can only pick
  // languages the candidate runner can actually execute. SQL, Scala, R,
  // etc. are intentionally excluded — the coding round runs candidate
  // code against stdin/stdout test cases via Piston and those languages
  // either don't fit that pattern or have no compiler. They can still
  // appear in the Technical round as MCQ / text-based questions.
  const programmingLanguages = [...COMPILABLE_LANGUAGES];

  // Guards against a second toast/redirect: the auto-select effect can re-run
  // before the router navigates away (selectedJob stays null on this path).
  const existingAssessmentRedirectRef = useRef(false);

  const redirectForExistingAssessment = (jdIdOverride?: string) => {
    if (existingAssessmentRedirectRef.current) return;
    existingAssessmentRedirectRef.current = true;

    if (!fromJobDetails) {
      router.replace('/recruitment/assessments');
      return;
    }

    // Entered from a JD (Job Details → Assessment → Create). Open the assessment
    // that already exists instead of dumping the recruiter on the Assessments
    // list — which both resets the breadcrumb to Dashboard › Assessments and
    // leaves them hunting for the record the toast just told them about. Mirrors
    // the AI Interview flow, which lands on the existing interview's details.
    const jdId = jdIdOverride || preSelectedJobId || urlJdId;
    const fallback = returnUrl
      || (jdId ? `/recruitment/job-details?id=${encodeURIComponent(jdId)}` : '/recruitment/assessments');

    if (!jdId) {
      toast.info('An assessment already exists for this job.');
      router.replace(fallback);
      return;
    }

    // Fire-and-forget: callers are sync (a render effect and a click handler).
    // The `resolvingPreselectedJd` loader stays on screen for the duration, so
    // this reads as one continuous navigation rather than a pause on a form.
    //
    // The toast is deliberately raised AFTER the lookup settles, not before it.
    // Announcing "an assessment already exists" up front and only then trying to
    // find it meant a failed or empty lookup left the recruiter back on the job
    // with a message about a page they never got — the toast promised something
    // the navigation didn't deliver. Now the message always matches where they
    // actually land.
    (async () => {
      let target: any = null;
      try {
        const resp: any = await assessmentService.list({ jd_id: jdId, page_size: 100 });
        const items: any[] = Array.isArray(resp) ? resp : (resp?.items ?? []);
        // Prefer a live assessment; otherwise the most recently updated one, so
        // a JD with several versions opens the one the recruiter cares about.
        const rank = (a: any) => {
          const s = String(a?.status || '').toLowerCase();
          return s === 'published' || s === 'active' ? 0 : 1;
        };
        const time = (a: any) => new Date(a?.updated_at || a?.created_at || 0).getTime();
        target = [...items].sort((a, b) => rank(a) - rank(b) || time(b) - time(a))[0] ?? null;
      } catch {
        target = null;
      }

      if (target?.id) {
        toast.info('An assessment already exists for this job.');
        router.replace(`/recruitment/assessments/${target.id}?from=job-details`);
        return;
      }

      // The eligibility index says this JD has an assessment but the lookup
      // couldn't produce one — a transient failure, or the index disagreeing
      // with /assessments (e.g. the record was since deleted). Say that, rather
      // than pointing at a page we can't open.
      toast.error('This job already has an assessment, but it could not be opened. Please try again.');
      router.replace(fallback);
    })();
  };

  // Auto-select job if preSelectedJobId or urlJdId is provided
  useEffect(() => {
    const jdIdToSelect = preSelectedJobId || urlJdId;
    const jobsForSelection = localJobs.length > 0 ? localJobs : jobs;

    if (!hasLoadedAssessmentEligibility || !jdIdToSelect || jobsForSelection.length === 0 || selectedJob) {
      return;
    }

    const job = jobsForSelection.find(j => j.id === jdIdToSelect);
    if (!job) {
      return;
    }

    if (!editAssessmentId && jdsWithAssessments.has(job.id)) {
      redirectForExistingAssessment(job.id);
      return;
    }

    // Configure sections properly based on JD coding requirements
    const jdRequiresCoding = job.coding_required === true;
    const hasLanguages = job.supported_languages && job.supported_languages.length > 0;
    let codingLanguages: string[] = hasLanguages ? job.supported_languages! : [];

    // Inline language detection for URL-based selection.
    // NOTE: C++, C#, .NET cannot use `\b...\b` because `+`, `#`, `.` are
    // non-word characters — the trailing `\b` never matches. Use explicit
    // non-letter boundaries instead.
    const detectLanguages = (skills: string[]): string[] => {
      const skillsText = skills.join(' ').toLowerCase();
      const detected = new Set<string>();
      if (/\b(java|spring|hibernate|maven)\b/i.test(skillsText)) detected.add('Java');
      if (/\b(python|django|flask|fastapi|pandas)\b/i.test(skillsText)) detected.add('Python');
      if (/\b(javascript|node|react|angular|vue|express)\b/i.test(skillsText)) detected.add('JavaScript');
      if (/\b(typescript)\b/i.test(skillsText)) detected.add('TypeScript');
      if (/(^|[^a-z0-9#])c#(?![a-z0-9#])/i.test(skillsText) ||
          /\b(csharp|dotnet)\b/i.test(skillsText) ||
          /(^|[^a-z0-9.])\.net(?![a-z0-9])/i.test(skillsText) ||
          /(^|[^a-z0-9.])asp\.net(?![a-z0-9])/i.test(skillsText)) detected.add('C#');
      if (/(^|[^a-z0-9+])c\+\+(?![a-z0-9+])/i.test(skillsText) ||
          /\bcpp\b/i.test(skillsText)) detected.add('C++');
      if (/\b(golang|go\s*lang)\b/i.test(skillsText)) detected.add('Go');
      if (/\b(ruby|rails)\b/i.test(skillsText)) detected.add('Ruby');
      if (/\b(php|laravel)\b/i.test(skillsText)) detected.add('PHP');
      if (/\b(kotlin|android)\b/i.test(skillsText)) detected.add('Kotlin');
      if (/\b(swift|ios)\b/i.test(skillsText)) detected.add('Swift');
      if (/\b(rust)\b/i.test(skillsText)) detected.add('Rust');
      if (/\b(scala)\b/i.test(skillsText)) detected.add('Scala');
      if (/\b(r\s*programming|r\s*language|rstudio|tidyverse|ggplot)\b/i.test(skillsText) ||
          (/\br\b/i.test(skillsText) && /\b(statistics|data\s*science|analytics)\b/i.test(skillsText))) detected.add('R');
      if (/\b(sql|pl\/?sql|t-sql|mysql|postgresql|oracle|database)\b/i.test(skillsText)) detected.add('SQL');
      return Array.from(detected);
    };

    const checkCodingRole = (j: Job): boolean => {
      const patterns = [/developer/i, /engineer/i, /programmer/i, /sdet/i, /software/i, /devops/i];
      const text = `${j.title} ${j.description || ''}`;
      return patterns.some(p => p.test(text));
    };

    // Include title + description so a JD like "Junior C++ Developer"
    // is detected even when its structured skills list omits the language.
    const detectionInput: string[] = [
      ...((job.skills as string[]) || []),
      job.title || '',
      job.description || '',
    ];

    // Detect languages from skills if JD requires coding but no languages specified
    if (jdRequiresCoding && !hasLanguages && detectionInput.length > 0) {
      const detectedLangs = detectLanguages(detectionInput);
      if (detectedLangs.length > 0) {
        codingLanguages = detectedLangs;
      }
    }

    // Check for dynamic detection from skills
    let shouldEnableCoding = jdRequiresCoding;
    if (!jdRequiresCoding && detectionInput.length > 0) {
      const detectedLangs = detectLanguages(detectionInput);
      if (detectedLangs.length > 0 && checkCodingRole(job)) {
        shouldEnableCoding = true;
        codingLanguages = detectedLangs;
      }
    }

    // Store JD-extracted languages — strip non-compilable ones (SQL, etc.)
    // so they never appear in the coding-round language list.
    codingLanguages = filterCompilable(codingLanguages);
    setJdExtractedLanguages(codingLanguages);

    // ✅ SIMPLIFIED LOGIC: Only enable coding if JD has supported languages
    // No smart config lock - users can toggle manually
    setIsCodingLockedBySmartConfig(false);
    setCodingLockReason('');

    // Only auto-enable if JD has languages we support
    const hasValidLanguages = codingLanguages.length > 0;

    if (hasValidLanguages) {
      const split = calculateTimeSplit(job, true);
      setSections([
        { name: 'HR', percentage: 0, topics: [], enabled: true },
        { name: 'Technical', percentage: split.technical, topics: [], enabled: true },
        { name: 'Coding', percentage: split.coding, topics: [], enabled: true },
      ]);
      setSelectedCodingLanguages(codingLanguages);
      console.log(`[TalentFlow] Coding auto-enabled: Technical ${split.technical}%, Coding ${split.coding}%`);
    } else {
      setSections([
        { name: 'HR', percentage: 0, topics: [], enabled: true },
        { name: 'Technical', percentage: 100, topics: [], enabled: true },
        { name: 'Coding', percentage: 0, topics: [], enabled: false },
      ]);
      setSelectedCodingLanguages([]);
      console.log('[TalentFlow] No supported languages detected - coding disabled');
    }

    setSelectedJob(job);
    if (urlStep === 'configure' || urlStep === 'preview') {
      setStepState(urlStep);
    } else {
      setStep('configure', job.id);
    }
    console.log('[TalentFlow] Auto-selected JD for assessment:', job.title, 'Coding required:', shouldEnableCoding);
  }, [
    preSelectedJobId,
    urlJdId,
    localJobs,
    jobs,
    selectedJob,
    urlStep,
    editAssessmentId,
    jdsWithAssessments,
    hasLoadedAssessmentEligibility,
  ]);

  // Handle when JD is published from the modal
  const handleJDPublished = async (publishedJob: Job) => {
    // Close the modal
    setShowJDCreation(false);

    // Refresh the jobs list to include the new JD
    try {
      /* The same read as on mount — every version, through the shared mapper.
         The hand-rolled mapping this replaced stamped `status: 'Published'` on
         every row it built, which was survivable only while the request itself
         was published-filtered; over the full list it would have marked every
         draft version published and put each one on a card of its own. */
      const items = await fetchAllJdVersions();
      if (items.length > 0) {
        const mappedJobs: Job[] = items.map((jd: any) => ({
          ...mapJDToJob(jd),
          coding_required: jd.coding_required || false,
          supported_languages: jd.supported_languages || [],
        }));
        setLocalJobs(mappedJobs);

        // Find and auto-select the newly created JD
        const newJob = mappedJobs.find(j => j.id === publishedJob.id);
        if (newJob) {
          handleJobSelect(newJob);
        }
      }
    } catch (error) {
      console.error('Failed to refresh JDs:', error);
    }

    // Notify parent to refresh if needed
    if (onJobsRefresh) {
      onJobsRefresh();
    }
  };

  // Fetch published JDs and JDs that already have assessments on mount
  useEffect(() => {
    const fetchData = async () => {
      setIsLoadingJobs(true);
      try {
        // Fetch both JDs and JDs with assessments in parallel
        const [jdItems, jdsWithAssessmentsResponse] = await Promise.all([
          fetchAllJdVersions(),
          assessmentService.getJDsWithAssessments(),
        ]);

        // Set JDs that already have assessments (for 1:1 filtering)
        setJdsWithAssessments(new Set(jdsWithAssessmentsResponse));
        console.log('[TalentFlow] JDs with existing assessments:', jdsWithAssessmentsResponse.length);

        if (jdItems.length > 0) {
          /* The shared mapper, the same one the Job Openings list and the
             Apply to Job dialog build their rows from — so this picker shows
             the same fields, formatted the same way, rather than a partial
             hand-rolled copy that was missing the lineage version, the work
             mode, the last-updated stamp and the formatted experience line.
             The two fields it does not carry are the coding-round inputs this
             flow needs, kept alongside it. */
          const mappedJobs: Job[] = jdItems.map((jd: any) => ({
            ...mapJDToJob(jd),
            coding_required: jd.coding_required || false,
            supported_languages: jd.supported_languages || [],
          }));
          setLocalJobs(mappedJobs);
        }

        /* The pre-selected JD may still not be in that list.
         *
         * Rarer now the read is unfiltered and paged to the end — a superseded
         * v2 is returned like any other row — but `source: 'my-jds'` still
         * scopes it to this recruiter's own JDs, and arriving from the
         * Assessments page's Job Version History with `?jd_id=<v2's id>` for
         * someone else's job would find nothing to select, dropping the
         * recruiter on the JD picker being asked to choose the job they had
         * just clicked.
         *
         * Fetched by id and merged in, so the auto-select effect below resolves
         * it like any other. Merged into `localJobs` only: it joins its
         * lineage's bucket in `availableJobs`, where the collapse decides
         * whether it is that job's latest version rather than this merge
         * asserting it.
         *
         * A failure here is not fatal — the flow falls through to the picker,
         * which is exactly where it used to land. */
        const wantedJdId = preSelectedJobId || urlJdId;
        const alreadyListed = jdItems.some((jd) => jd.id === wantedJdId);
        if (wantedJdId && !alreadyListed) {
          try {
            const jd = await jdService.get(wantedJdId);
            const versionJob: Job = {
              id: jd.id,
              job_id: jd.job_id || '',
              title: jd.title,
              currentVersion: jd.current_version,
              description: jd.description || '',
              department: jd.department || 'General',
              location: jd.location || '',
              experience: jd.job_level || 'Mid-Level',
              skills: jd.must_have_skills || [],
              /* Its real status, through the shared mapper — the card displays
                 this, and every control on the card is gated on it. The
                 two-way `published ? 'Published' : 'Closed'` this replaced was
                 written when the picker was published-filtered and the only
                 question was in-or-out; it would now show a Draft, Disabled or
                 Archived version as "Closed" on the card. */
              status: mapJDStatus(jd.status),
              postedDate: jd.published_at || jd.created_at,
              postedBy: jd.created_by_name || 'Unknown',
              applicants: 0,
              daysActive: 0,
              requiredMatch: 70,
              coding_required: jd.coding_required || false,
              supported_languages: jd.supported_languages || [],
              industry_type: jd.industry_type || 'Technology',
              employmentType: jd.employment_type || 'full_time',
              creation_method: jd.creation_method || 'manual',
              experience_min: jd.experience_min,
              experience_max: jd.experience_max,
            };
            setLocalJobs((prev) =>
              prev.some((j) => j.id === versionJob.id) ? prev : [versionJob, ...prev]
            );
          } catch (error) {
            console.error('[TalentFlow] Failed to resolve the pre-selected JD version:', error);
          }
        }
      } catch (error) {
        console.error('Failed to fetch JDs:', error);
        // Fall back to props if API fails
        setLocalJobs(jobs);
      } finally {
        setHasLoadedAssessmentEligibility(true);
        setIsLoadingJobs(false);
      }
    };

    fetchData();
  }, []);

  // NOTE: Auto-save on unmount is DISABLED to prevent issues with React Strict Mode
  // and unwanted saves when entering the configure page.
  // Auto-save ONLY happens when user explicitly clicks the back button (handleAutoSaveDraft).

  // Check if JD requires coding based on skills/technologies
  const requiresCoding = (job: Job) => {
    const codingKeywords = ['developer', 'engineer', 'programmer', 'software', 'coding', 'python', 'java', 'javascript', 'react', 'node'];
    const jobText = `${job.title} ${job.description} ${job.skills.join(' ')}`.toLowerCase();
    return codingKeywords.some(keyword => jobText.includes(keyword));
  };

  // Dynamic programming language detection from skills
  // This is used as a fallback when AI extraction didn't properly set coding_required/supported_languages
  const detectProgrammingLanguagesFromSkills = (skills: string[]): string[] => {
    const skillsText = skills.join(' ').toLowerCase();
    const detectedLanguages = new Set<string>();

    // ============ JAVA ============
    // Core Java, J2EE, Spring ecosystem, Hibernate, Maven, Gradle
    if (/\b(core\s*java|java\s*\d+|j2ee|jee|java\s*ee|spring\s*(boot|mvc|framework|cloud|security)?|hibernate|struts|maven|gradle|jpa|jdbc|jvm|servlet|jsp|tomcat|wildfly|jboss)\b/i.test(skillsText) ||
        /\bjava\b/i.test(skillsText)) {
      detectedLanguages.add('Java');
    }

    // ============ PYTHON ============
    // Django, Flask, FastAPI, Data Science libs, ML frameworks
    if (/\b(python|django|flask|fastapi|pandas|numpy|scipy|matplotlib|seaborn|scikit[\s-]?learn|pytorch|tensorflow|keras|jupyter|pip|conda|pyspark|celery|asyncio)\b/i.test(skillsText)) {
      detectedLanguages.add('Python');
    }

    // ============ JAVASCRIPT ============
    // Node.js, React, Angular, Vue, Express, Next.js, etc.
    if (/\b(javascript|node\.?js|react\.?js?|angular\.?js?|vue\.?js?|express\.?js?|next\.?js?|nuxt\.?js?|gatsby|svelte|jquery|webpack|babel|npm|yarn|es6|ecmascript|redux|mobx|graphql\s*js|nest\.?js?|deno)\b/i.test(skillsText) ||
        /\bjs\b/i.test(skillsText)) {
      detectedLanguages.add('JavaScript');
    }

    // ============ TYPESCRIPT ============
    if (/\b(typescript|ts)\b/i.test(skillsText)) {
      detectedLanguages.add('TypeScript');
    }

    // ============ C# / .NET ============
    // ASP.NET, .NET Core, Entity Framework, Blazor, LINQ
    // NOTE: `c#`, `.net`, `asp.net` cannot use `\b...\b` — `#` and `.` are
    // non-word chars, so the trailing `\b` never matches. Use explicit
    // non-letter boundaries for these tokens.
    if (
      /(^|[^a-z0-9#])c#(?![a-z0-9#])/i.test(skillsText) ||
      /\b(csharp|c\s*sharp|dotnet|entity\s*framework|blazor|linq|xamarin|maui|unity3d|wcf|wpf|winforms)\b/i.test(skillsText) ||
      /(^|[^a-z0-9.])\.net(?![a-z0-9])/i.test(skillsText) ||
      /(^|[^a-z0-9.])asp\.?net(?![a-z0-9])/i.test(skillsText)
    ) {
      detectedLanguages.add('C#');
    }

    // ============ C++ ============
    // STL, Qt, Boost, embedded systems
    // NOTE: `c++` cannot use `\b...\b` — `+` is a non-word char, so the
    // trailing `\b` never matches. Use explicit non-letter boundaries.
    if (
      /(^|[^a-z0-9+])c\+\+(?![a-z0-9+])/i.test(skillsText) ||
      /(^|[^a-z0-9+])embedded\s*c\+\+(?![a-z0-9+])/i.test(skillsText) ||
      /\b(cpp|stl|boost|qt\s*(framework)?|cmake|opencv)\b/i.test(skillsText)
    ) {
      detectedLanguages.add('C++');
    }

    // ============ C ============
    // Embedded C, Linux kernel, system programming (careful to avoid false positives)
    if (/\b(embedded\s*c|c\s*programming|ansi\s*c|c\s*language|linux\s*kernel|posix|glibc)\b/i.test(skillsText)) {
      detectedLanguages.add('C');
    }

    // ============ GO / GOLANG ============
    // Gin, Echo, Kubernetes (Go-based)
    if (/\b(golang|go\s*lang|go\s*programming|gin\s*(framework)?|echo\s*(framework)?|goroutine|gomod)\b/i.test(skillsText) ||
        /\bgo\b/i.test(skillsText) && /\b(backend|microservice|api|docker|kubernetes|cloud)\b/i.test(skillsText)) {
      detectedLanguages.add('Go');
    }

    // ============ RUBY ============
    // Rails, Sinatra, RSpec
    if (/\b(ruby|rails|ruby\s*on\s*rails|sinatra|rspec|capybara|sidekiq|rake)\b/i.test(skillsText)) {
      detectedLanguages.add('Ruby');
    }

    // ============ PHP ============
    // Laravel, Symfony, WordPress (dev), CodeIgniter
    if (/\b(php|laravel|symfony|codeigniter|wordpress\s*(dev|development|plugin)|drupal|magento|composer|yii)\b/i.test(skillsText)) {
      detectedLanguages.add('PHP');
    }

    // ============ KOTLIN ============
    // Android development, Ktor
    if (/\b(kotlin|android\s*(development|dev|kotlin)|ktor|jetpack\s*compose)\b/i.test(skillsText)) {
      detectedLanguages.add('Kotlin');
    }

    // ============ SWIFT ============
    // iOS development, SwiftUI
    if (/\b(swift|ios\s*(development|dev)|swiftui|uikit|cocoa|xcode)\b/i.test(skillsText)) {
      detectedLanguages.add('Swift');
    }

    // ============ RUST ============
    // Systems programming, cargo
    if (/\b(rust|rustlang|cargo|tokio|actix)\b/i.test(skillsText)) {
      detectedLanguages.add('Rust');
    }

    // ============ SCALA ============
    // Spark, Akka, Play Framework
    if (/\b(scala|akka|play\s*framework|spark\s*scala|sbt)\b/i.test(skillsText)) {
      detectedLanguages.add('Scala');
    }

    // ============ R ============
    // Data science, statistics (careful with single letter)
    if (/\b(r\s*programming|r\s*language|rstudio|tidyverse|ggplot|shiny\s*r|cran)\b/i.test(skillsText) ||
        (/\br\b/i.test(skillsText) && /\b(statistics|data\s*science|machine\s*learning|analytics)\b/i.test(skillsText))) {
      detectedLanguages.add('R');
    }

    // ============ SQL ============
    // Database programming - SQL Developer, PL/SQL, T-SQL, or any database-related skills
    if (/\b(sql|pl\/?sql|t-sql|stored\s*procedure|sql\s*server|sql\s*developer|oracle\s*(db|database|developer)?|mysql|postgresql|mariadb|database\s*(development|programming|developer|admin)?|nosql|mongodb|cassandra|redis)\b/i.test(skillsText)) {
      detectedLanguages.add('SQL');
    }

    // ============ DART ============
    // Flutter
    if (/\b(dart|flutter)\b/i.test(skillsText)) {
      detectedLanguages.add('Dart');
    }

    // ============ PERL ============
    if (/\b(perl|perl\s*scripting)\b/i.test(skillsText)) {
      detectedLanguages.add('Perl');
    }

    // ============ SHELL/BASH ============
    // Shell scripting (if significant)
    if (/\b(bash\s*scripting|shell\s*scripting|linux\s*scripting|powershell\s*(scripting|development))\b/i.test(skillsText)) {
      detectedLanguages.add('Bash');
    }

    // ============ AUTOMATION TESTING FRAMEWORKS ============
    // NOTE: Automation frameworks (Selenium, Cypress, Playwright, Appium) alone do NOT trigger coding rounds
    // They are assessed in the Technical round instead. Only actual programming languages trigger coding.
    // However, if automation is mentioned WITH a specific language (e.g., "Selenium with Java"),
    // the language itself will be detected by the patterns above.

    return Array.from(detectedLanguages);
  };

  // Check if job title/description indicates a coding role
  /**
   * The assessments already created against a job's JD versions.
   *
   * ONE REQUEST PER JOB, made when its version history is first opened: the
   * list endpoint answers for a whole lineage, so a job's three versions cost
   * one call however many of them are inspected. Keyed by the JD VERSION id
   * each assessment was created against — that is the association the whole
   * feature rests on (Job → JD version → assessment), and the reason the check
   * below can say v3 is taken while v2 and v1 are free.
   *
   * A failure leaves no entry, so reopening retries rather than caching the
   * failure as "this job has no assessments".
   */
  const loadLineageAssessments = async (lineage: string, jdId: string) => {
    if (lineageAssessments[lineage] || loadingLineageAssessments[lineage]) return;
    setLoadingLineageAssessments(prev => ({ ...prev, [lineage]: true }));
    try {
      const response = await assessmentService.list({ jd_id: jdId, page_size: 50 });
      const byVersion: Record<string, { id: string; createdAt?: string; title?: string }> = {};
      for (const row of response.items || []) {
        if (!row?.jd_id) continue;
        /* Several assessments can share a JD version (an assessment cloned to
           v2, v3). The FIRST created one dates the version — that is when this
           version stopped being available. */
        const existing = byVersion[row.jd_id];
        if (!existing || (row.created_at && existing.createdAt && row.created_at < existing.createdAt)) {
          byVersion[row.jd_id] = { id: row.id, createdAt: row.created_at, title: row.title };
        }
      }
      setLineageAssessments(prev => ({ ...prev, [lineage]: byVersion }));
    } catch (error) {
      console.log('[TalentFlow] Failed to load assessments for JD lineage:', error);
    } finally {
      setLoadingLineageAssessments(prev => ({ ...prev, [lineage]: false }));
    }
  };

  /** The assessment created against ONE JD version, if the lineage is loaded. */
  const assessmentForVersion = (lineage: string, versionId: string) =>
    lineageAssessments[lineage]?.[versionId];

  /**
   * Whether ONE JD VERSION already has an assessment — the business rule is
   * one per version, never one per job, so this is keyed on the version's own
   * JD id and never on the job.
   *
   * Two sources, and the answer is their UNION rather than the fetched one
   * winning. Both are evidence that an assessment exists: the mount-time index
   * (`jdsWithAssessments`) is the complete set of JD versions that have one,
   * fetched once for every job at once; `lineageAssessments` is the richer
   * per-job detail — WHICH assessment and WHEN — fetched lazily the first time
   * a job's versions are opened.
   *
   * "Fetched wins" could answer `false` for a version that does have an
   * assessment, in two ways: the lazy map is fetched with ONE version's `jd_id`
   * on the assumption the endpoint replies for the whole lineage, so any
   * narrowing there silently blanks the siblings; and a failed request leaves
   * no entry at all. Either would offer a second assessment on a version that
   * already has one — the opposite of the one-per-version rule, and a mapping
   * error at exactly the version level this feature has to get right.
   *
   * A union is the fail-closed direction: the worst a stale `true` does is
   * refuse a second assessment on a version, which is refused anyway.
   */
  const versionHasAssessment = (lineage: string, versionId: string) =>
    jdsWithAssessments.has(versionId) || !!lineageAssessments[lineage]?.[versionId];

  /** Open or close a job's version history, loading both halves on first open. */
  const toggleJdVersions = (job: Job) => {
    const lineage = lineageKey(job);
    jdLineage.toggle(lineage, job.id);
    void loadLineageAssessments(lineage, job.id);
  };

  /**
   * Create an assessment for ONE JD version.
   *
   * The version's own JD record supplies the coding inputs rather than the
   * card's: the card carries the LATEST version, and configuring v2's
   * assessment from v3's skills would be a different job's answer. The record
   * is already fetched by the version panel; before it lands the card's own
   * values stand in, which is what they were before this existed.
   */
  const handleCreateForVersion = (versionJob: Job) => {
    const detail = jdLineage.versionDetails[versionJob.id];
    handleJobSelect(
      detail
        ? {
            ...versionJob,
            description: detail.description ?? versionJob.description,
            skills: detail.must_have_skills ?? versionJob.skills,
            coding_required: detail.coding_required ?? versionJob.coding_required,
            supported_languages: detail.supported_languages ?? versionJob.supported_languages,
          }
        : versionJob,
    );
  };

  const isCodingRole = (job: Job): boolean => {
    const codingRolePatterns = [
      /developer/i,
      /engineer/i,
      /programmer/i,
      /sdet/i,
      /automation\s*(test|engineer|tester)/i,
      /full\s*stack/i,
      /front\s*end/i,
      /back\s*end/i,
      /software/i,
      /devops/i,
    ];
    const titleAndDesc = `${job.title} ${job.description || ''}`;
    return codingRolePatterns.some(pattern => pattern.test(titleAndDesc));
  };

  /**
   * Does this JD imply a coding round?
   *
   * The stored flag first, then the same skill-based fallback `handleJobSelect`
   * applies — a "Test Engineer" JD listing Java as a required skill comes back
   * from the AI extractor with coding_required=false on a title bias, while
   * selecting it would still auto-enable the coding round. Reading the flag
   * alone would print "No" on a row that is about to get a coding assessment.
   *
   * One helper for the card badge and the version column, so the two cannot
   * drift into contradicting each other about the same JD.
   */
  const codingRequiredFor = (source: Job): boolean => {
    if (source.coding_required === true) return true;
    const detectionInput: string[] = [
      ...((source.skills as string[]) || []),
      source.title || '',
      source.description || '',
    ];
    if (detectionInput.length === 0) return false;
    return (
      detectProgrammingLanguagesFromSkills(detectionInput).length > 0 && isCodingRole(source)
    );
  };

  /**
   * The Job-shaped view of ONE version, for questions whose answer differs
   * between versions.
   *
   * `versionJob` from the history panel spreads the CARD's job, so its skills,
   * description and coding_required still belong to the card's version. Where a
   * per-version detail has been fetched, those fields are taken from it — a v2
   * that never asked for coding must not read as coding just because v3 does.
   */
  const versionJobWithDetail = (versionJob: Job): Job => {
    const detail = jdLineage.versionDetails[versionJob.id];
    if (!detail) return versionJob;
    return {
      ...versionJob,
      title: detail.title || versionJob.title,
      description: detail.description || versionJob.description,
      skills: [...(detail.must_have_skills || []), ...(detail.nice_to_have_skills || [])],
      coding_required: detail.coding_required ?? versionJob.coding_required,
    };
  };

  const handleJobSelect = (job: Job) => {
    /* One assessment per JD VERSION: the check is the version's own JD id,
       resolved through the lineage's actual assessments where they have been
       fetched. A job whose v3 is taken still creates freely against v2. */
    if (versionHasAssessment(lineageKey(job), job.id)) {
      redirectForExistingAssessment(job.id);
      return;
    }

    setSelectedJob(job);

    // Check if JD explicitly requires coding (from JD configuration)
    const jdRequiresCoding = job.coding_required === true;
    const hasLanguages = job.supported_languages && job.supported_languages.length > 0;

    // Start with JD-specified languages
    let codingLanguages: string[] = hasLanguages ? job.supported_languages! : [];

    // Include title + description so JDs like "Junior C++ Developer" are
    // detected even when the structured skills array omits the language
    // (the AI extractor frequently doesn't promote languages into skills).
    const detectionInput: string[] = [
      ...((job.skills as string[]) || []),
      job.title || '',
      job.description || '',
    ];

    // If JD requires coding but no languages specified, try to detect from text
    if (jdRequiresCoding && !hasLanguages && detectionInput.length > 0) {
      const detectedLanguages = detectProgrammingLanguagesFromSkills(detectionInput);
      if (detectedLanguages.length > 0) {
        codingLanguages = detectedLanguages;
        console.log('[TalentFlow] JD requires coding - detected languages:', detectedLanguages);
      }
    }

    // DYNAMIC DETECTION: If JD doesn't have coding_required set but has programming skills
    let shouldEnableCoding = jdRequiresCoding;  // Enable if JD says coding is required

    // Fallback: dynamic detection from skills/title/description when coding_required isn't set
    if (!jdRequiresCoding && detectionInput.length > 0) {
      const detectedLanguages = detectProgrammingLanguagesFromSkills(detectionInput);

      // If we detected programming languages AND it's a coding-related role, enable coding
      if (detectedLanguages.length > 0 && isCodingRole(job)) {
        shouldEnableCoding = true;
        codingLanguages = detectedLanguages;
        console.log('[TalentFlow] Dynamic language detection enabled coding for JD:', job.title, 'Languages:', detectedLanguages);
      }
    }

    // Store JD-extracted languages — strip non-compilable ones (SQL, etc.) so
    // they never appear in the coding-round language list.
    codingLanguages = filterCompilable(codingLanguages);
    setJdExtractedLanguages(codingLanguages);

    // ✅ SIMPLIFIED LOGIC: Only enable coding if JD has supported languages
    const hasValidLanguages = codingLanguages.length > 0;

    if (hasValidLanguages) {
      const split = calculateTimeSplit(job, true);
      // Coding round time must land on one of the allowed steps so the
      // round always has ≥10 min (≥1 in-depth coding question).
      const snappedCoding = snapCodingPercentage(split.coding);
      setSections([
        { name: 'HR', percentage: 0, topics: [], enabled: true },
        { name: 'Technical', percentage: 100 - snappedCoding, topics: [], enabled: true },
        { name: 'Coding', percentage: snappedCoding, topics: [], enabled: true },
      ]);
      setSelectedCodingLanguages(codingLanguages);
      setCodingEnabledSource('auto');
      console.log(`[TalentFlow] Coding auto-enabled: Technical ${100 - snappedCoding}%, Coding ${snappedCoding}%`);
    } else {
      setSections([
        { name: 'HR', percentage: 0, topics: [], enabled: true },
        { name: 'Technical', percentage: 100, topics: [], enabled: true },
        { name: 'Coding', percentage: 0, topics: [], enabled: false },
      ]);
      setSelectedCodingLanguages([]);
      setCodingEnabledSource(null);
      console.log('[TalentFlow] No supported languages detected - coding disabled');
    }
    setStep('configure', job.id);
  };

  // Coding round must be one of these four allocations so the round always
  // has at least 10 minutes (≥1 in-depth coding question) of a 30-min
  // assessment. 35% → 10.5min (1 Q), 50% → 15min (1 deep or 2 short),
  // 75% → 22.5min, 100% → 30min. The recruiter can drag either slider; the
  // value is snapped to the nearest allowed step and Technical takes the
  // complement.
  const CODING_ALLOWED_PERCENTAGES = [35, 50, 75, 100] as const;

  const snapCodingPercentage = (raw: number): number => {
    const clamped = Math.max(0, Math.min(100, raw));
    return CODING_ALLOWED_PERCENTAGES.reduce((best, candidate) =>
      Math.abs(candidate - clamped) < Math.abs(best - clamped) ? candidate : best,
    CODING_ALLOWED_PERCENTAGES[0]);
  };

  // Normalize sections whenever Coding is enabled with an off-allowed value
  // OR Tech + Coding don't sum to 100. Catches state from before the snap
  // logic existed (e.g., assessments saved with Tech 61 / Coding 9 from the
  // old HR-redistribution bug) and corrects them on first render.
  useEffect(() => {
    const coding = sections.find(s => s.name === 'Coding');
    const tech = sections.find(s => s.name === 'Technical');
    if (!coding?.enabled) return;

    const codingValid = (CODING_ALLOWED_PERCENTAGES as readonly number[]).includes(coding.percentage);
    const techPct = tech?.percentage ?? 0;
    const sumIsHundred = techPct + coding.percentage === 100;
    if (codingValid && sumIsHundred) return;

    const snapped = snapCodingPercentage(coding.percentage > 0 ? coding.percentage : 35);
    setSections(prev => prev.map(s => {
      if (s.name === 'Coding') return { ...s, percentage: snapped };
      if (s.name === 'Technical') return { ...s, percentage: 100 - snapped };
      return s;
    }));
  }, [sections]);

  const updatePercentage = (sectionName: string, value: number) => {
    const clamped = Math.max(0, Math.min(100, value));
    setSections(prev => {
      // Technical + Coding must always sum to 100%. HR is excluded — it uses
      // fixed duration from the Question Bank, not a percentage. When the
      // user drags one slider, the other one auto-adjusts so the total stays
      // at 100. If only one of the two is enabled, no balancing partner
      // exists and that section just absorbs the value.
      const partner = prev.find(
        s => s.enabled && s.name !== 'HR' && s.name !== sectionName,
      );

      // When Coding is one of the two adjustable sections, snap its share
      // to the allowed steps {35, 50, 75, 100}. Whether the user is dragging
      // Coding or Technical, we always derive Coding first via the snap,
      // then Technical = 100 - Coding.
      // At Coding=100%, Technical disappears entirely (auto-disabled, not
      // shown as 0%). When Coding drops back below 100%, Technical
      // auto-re-enables with the complement so the round reappears.
      const codingEnabled = prev.some(s => s.name === 'Coding' && s.enabled);
      if (codingEnabled && (sectionName === 'Coding' || sectionName === 'Technical')) {
        const intendedCoding = sectionName === 'Coding' ? clamped : 100 - clamped;
        const snappedCoding = snapCodingPercentage(intendedCoding);
        const techShouldBeEnabled = snappedCoding < 100;
        return prev.map(s => {
          if (s.name === 'Coding') return { ...s, percentage: snappedCoding };
          if (s.name === 'Technical') {
            return {
              ...s,
              enabled: techShouldBeEnabled,
              percentage: techShouldBeEnabled ? 100 - snappedCoding : 0,
            };
          }
          return s;
        });
      }
      return prev.map(s => {
        if (s.name === sectionName) return { ...s, percentage: clamped };
        if (partner && s.name === partner.name) return { ...s, percentage: 100 - clamped };
        return s;
      });
    });
  };

  const handleDurationChange = (value: number) => {
    // Duration is locked at 30 minutes - this function is kept for compatibility
    setDuration(30);
  };

  const handleProctoringToggle = () => {
    setUserToggledProctoring(true);
    setProctoringEnabled(!proctoringEnabled);
  };

  const addTopic = (sectionName: 'HR' | 'Technical' | 'Coding') => {
    if (!newTopic.value.trim()) return;

    setSections(sections.map(s =>
      s.name === sectionName
        ? { ...s, topics: [...s.topics, newTopic.value.trim()] }
        : s
    ));
    setNewTopic({ section: '' as any, value: '' });
  };

  const removeTopic = (sectionName: string, topicIndex: number) => {
    setSections(sections.map(s =>
      s.name === sectionName
        ? { ...s, topics: s.topics.filter((_, i) => i !== topicIndex) }
        : s
    ));
  };

  const getTotalPercentage = () => {
    // Exclude HR — it uses fixed duration from Question Bank, not percentage
    return sections.filter(s => s.enabled && s.name !== 'HR').reduce((sum, s) => sum + s.percentage, 0);
  };

  // Handle coding section toggle with confirmation popups
  const handleCodingToggle = () => {
    const codingSection = sections.find(s => s.name === 'Coding');
    const isCurrentlyEnabled = codingSection?.enabled || false;

    if (!isCurrentlyEnabled) {
      // Enabling Coding — must pick at least one language. Open the
      // confirmation popup which contains the language picker. The actual
      // section toggle happens in handleConfirmCodingAction once the user
      // confirms with a non-empty selection.
      // Pre-seed from JD-extracted languages if available, but the popup is
      // still shown so the user can review/adjust.
      if (jdExtractedLanguages.length > 0 && selectedCodingLanguages.length === 0) {
        setSelectedCodingLanguages(jdExtractedLanguages);
      }
      setCodingPopupMode('enable');
      setShowCodingConfirm(true);
    } else {
      // Disabling Coding — Technical must be enabled
      const techSection = sections.find(s => s.name === 'Technical');
      if (!techSection?.enabled) {
        setShowMinRoundPopup(true);
        return;
      }
      // Show confirmation popup before disabling so the user knows the
      // already-selected languages will be cleared.
      setCodingPopupMode('disable');
      setShowCodingConfirm(true);
    }
  };

  // Confirm button handler - works for both enable and disable modes
  const handleConfirmCodingAction = () => {
    /* Editing an already-enabled round: the languages are already in state,
       so there is nothing to apply beyond the same non-empty rule. Returning
       here is what keeps the percentage restore below off this path. */
    if (codingPopupMode === 'edit') {
      if (selectedCodingLanguages.length === 0) {
        toast.warning('Please select at least one programming language');
        return;
      }
      codingLanguagesBeforeEditRef.current = null;
      setShowCodingConfirm(false);
      return;
    }

    if (codingPopupMode === 'enable') {
      // Enabling coding - require language selection
      if (selectedCodingLanguages.length === 0) {
        toast.warning('Please select at least one programming language');
        return;
      }

      // Restore previous percentages if available (snap to allowed Coding
      // step), otherwise default to the lowest allowed: 35% Coding / 65% Tech.
      if (savedPercentagesBeforeCodingDisable) {
        const restoredCoding = snapCodingPercentage(savedPercentagesBeforeCodingDisable.coding);
        setSections(sections.map(s => {
          if (s.name === 'HR') return { ...s, percentage: 0 };
          if (s.name === 'Technical') return { ...s, percentage: 100 - restoredCoding };
          if (s.name === 'Coding') return { ...s, enabled: true, percentage: restoredCoding };
          return s;
        }));
        setSavedPercentagesBeforeCodingDisable(null); // Clear saved state
      } else {
        setSections(sections.map(s => {
          if (s.name === 'HR') return { ...s, percentage: 0 };
          if (s.name === 'Technical') return { ...s, percentage: 65 };
          if (s.name === 'Coding') return { ...s, enabled: true, percentage: 35 };
          return s;
        }));
      }
      setCodingEnabledSource('manual');
    } else {
      // Disabling coding - save current percentages, redistribute, clear languages
      const hrSection = sections.find(s => s.name === 'HR');
      const technicalSection = sections.find(s => s.name === 'Technical');
      const codingSection = sections.find(s => s.name === 'Coding');

      // Save current percentages before disabling
      setSavedPercentagesBeforeCodingDisable({
        hr: hrSection?.percentage || 0,
        technical: technicalSection?.percentage || 0,
        coding: codingSection?.percentage || 0,
      });

      // Redistribute coding percentage to other enabled rounds
      const codingPct = codingSection?.percentage || 0;
      const hrEnabled = hrSection?.enabled || false;
      const techEnabled = technicalSection?.enabled || false;

      let newHrPct = hrSection?.percentage || 0;
      let newTechPct = technicalSection?.percentage || 0;

      if (hrEnabled && techEnabled && codingPct > 0) {
        // Both HR and Technical enabled - split coding % proportionally
        const totalOther = newHrPct + newTechPct;
        if (totalOther > 0) {
          const hrRatio = newHrPct / totalOther;
          const techRatio = newTechPct / totalOther;
          newHrPct = Math.round(newHrPct + codingPct * hrRatio);
          newTechPct = 100 - newHrPct; // Ensure total is exactly 100%
        } else {
          // Both are 0, split evenly
          newHrPct = 50;
          newTechPct = 50;
        }
      } else if (hrEnabled && codingPct > 0) {
        // Only HR enabled - give all coding % to HR
        newHrPct = 100;
      } else if (techEnabled && codingPct > 0) {
        // Only Technical enabled - give all coding % to Technical
        newTechPct = 100;
      }

      setSelectedCodingLanguages([]);
      setSections(sections.map(s => {
        if (s.name === 'HR') return { ...s, percentage: 0 };
        if (s.name === 'Technical') return { ...s, percentage: newTechPct };
        if (s.name === 'Coding') return { ...s, enabled: false, percentage: 0 };
        return s;
      }));
      setCodingEnabledSource(null);
    }
    setShowCodingConfirm(false);
  };

  // Cancel button handler - works for both enable and disable modes
  /**
   * Reopen the language picker for a round that is ALREADY on.
   *
   * A handler, not an inline arrow inside the section-card renderer: that
   * renderer is called during render, and taking the snapshot there reads a
   * ref at render time. Here it runs only on the click, which is when the
   * snapshot is actually wanted.
   */
  const openCodingLanguageEditor = () => {
    codingLanguagesBeforeEditRef.current = selectedCodingLanguages;
    setCodingPopupMode('edit');
    setShowCodingConfirm(true);
  };

  const handleCancelCodingAction = () => {
    // Editing a live round: put the selection back as it was on open.
    if (codingPopupMode === 'edit' && codingLanguagesBeforeEditRef.current) {
      setSelectedCodingLanguages(codingLanguagesBeforeEditRef.current);
    }
    codingLanguagesBeforeEditRef.current = null;
    setShowCodingConfirm(false);
  };

  // Handle HR round toggle with validation
  const handleHRToggle = () => {
    const hrSection = sections.find(s => s.name === 'HR');
    const isCurrentlyEnabled = hrSection?.enabled || false;

    if (isCurrentlyEnabled) {
      // Trying to disable HR - check if at least one other round is enabled
      const otherEnabledCount = sections.filter(s => s.name !== 'HR' && s.enabled).length;
      if (otherEnabledCount === 0) {
        setShowMinRoundPopup(true);
        return;
      }
    }

    // HR uses a fixed duration sourced from the HR Question Bank — it is
    // never part of the 30-min Technical + Coding budget. Toggling HR on
    // or off must leave Technical and Coding percentages untouched (they
    // always sum to 100% of the timed assessment). The previous logic
    // reserved 30% of the 30-min budget for HR, which made Tech+Coding
    // shrink to ~70% combined — visible as e.g. Tech 61% / Coding 9% when
    // HR was switched on.
    setSections(sections.map(s =>
      s.name === 'HR' ? { ...s, enabled: !isCurrentlyEnabled, percentage: 0 } : s,
    ));
  };

  // Handle Technical round toggle with validation
  const handleTechnicalToggle = () => {
    const techSection = sections.find(s => s.name === 'Technical');
    const isCurrentlyEnabled = techSection?.enabled || false;

    if (isCurrentlyEnabled) {
      // Trying to disable Technical - Coding must be enabled
      const codingSection = sections.find(s => s.name === 'Coding');
      if (!codingSection?.enabled) {
        setShowMinRoundPopup(true);
        return;
      }

      // Coding gets 100%
      setSections(sections.map(s => {
        if (s.name === 'HR') return { ...s, percentage: 0 };
        if (s.name === 'Technical') return { ...s, enabled: false, percentage: 0 };
        if (s.name === 'Coding') return { ...s, percentage: 100 };
        return s;
      }));
    } else {
      // Enabling Technical — split with Coding if enabled
      const codingSection = sections.find(s => s.name === 'Coding');
      const split = selectedJob ? calculateTimeSplit(selectedJob, codingSection?.enabled || false) : { technical: 80, coding: 20 };

      setSections(sections.map(s => {
        if (s.name === 'HR') return { ...s, percentage: 0 };
        if (s.name === 'Technical') return { ...s, enabled: true, percentage: codingSection?.enabled ? split.technical : 100 };
        if (s.name === 'Coding') return { ...s, percentage: codingSection?.enabled ? split.coding : 0 };
        return s;
      }));
    }
  };

  // Toggle a language in the selection
  /**
   * Add or remove ONE language, capped at MAX_CODING_LANGUAGES.
   *
   * Appends rather than replaces, so picking a second language keeps the
   * first; removing is always allowed, so a full selection is never stuck.
   * The cap is enforced here rather than only in the picker's markup, because
   * this is the single path every add goes through.
   */
  const toggleLanguageSelection = (lang: string) => {
    setSelectedCodingLanguages(prev => {
      if (prev.includes(lang)) return prev.filter(l => l !== lang);
      if (prev.length >= MAX_CODING_LANGUAGES) {
        toast.warning(`You can select up to ${MAX_CODING_LANGUAGES} programming languages.`);
        return prev;
      }
      return [...prev, lang];
    });
  };

  const closePublishSuccessModal = useCallback(() => {
    if (publishSuccessHandledRef.current) return;

    publishSuccessHandledRef.current = true;
    if (publishSuccessTimerRef.current !== null) {
      window.clearTimeout(publishSuccessTimerRef.current);
      publishSuccessTimerRef.current = null;
    }

    const publishedAssessment = publishedAssessmentRef.current;
    publishedAssessmentRef.current = null;
    setShowPublishSuccessModal(false);

    if (publishedAssessment) {
      onCreateAssessment(publishedAssessment);
    }
  }, [onCreateAssessment]);

  useEffect(() => {
    if (!showPublishSuccessModal) return;

    publishSuccessTimerRef.current = window.setTimeout(closePublishSuccessModal, 3000);

    return () => {
      if (publishSuccessTimerRef.current !== null) {
        window.clearTimeout(publishSuccessTimerRef.current);
        publishSuccessTimerRef.current = null;
      }
    };
  }, [showPublishSuccessModal, closePublishSuccessModal]);

  const handleGenerateAssessment = async (saveAsDraft: boolean = false) => {
    // Hard guard for Publish: HR section enabled but no questions picked.
    // The button is already disabled in that state, but the keyboard path
    // (Enter while focused) and any future programmatic invocation should
    // still bail out cleanly with a recruiter-visible reason.
    const hrSectionPre = sections.find(s => s.name === 'HR');
    if (!saveAsDraft && hrSectionPre?.enabled && selectedHRQuestions.length === 0) {
      toast.error('Select at least one HR question before publishing');
      return;
    }

    setIsGenerating(true);

    try {
      // Call the real API to create/update assessment
      const hrSection = sections.find(s => s.name === 'HR');
      const technicalSection = sections.find(s => s.name === 'Technical');
      const codingSection = sections.find(s => s.name === 'Coding');

      const assessmentData = {
        jd_id: selectedJob?.id || '',
        title: isEditMode && editingAssessment
          ? editingAssessment.title  // Keep existing title - backend will update version
          : `${selectedJob?.title} - Assessment - Version 1`,
        description: `Assessment for ${selectedJob?.title} position`,
        duration_minutes: duration,  // 30 min for Technical + Coding only (HR is separate)
        hr_enabled: hrSection?.enabled || false,
        hr_percentage: 0,
        hr_topics: (hrSection?.enabled ? selectedHRQuestions : []).map(id => {
          const q = hrQuestionBank.find(hq => hq.id === id);
          return q ? { text: q.text, type: q.type, time: q.time, correct_answer: (q as any).correct_answer } : null;
        }).filter(Boolean),
        technical_enabled: technicalSection?.enabled || false,
        technical_percentage: technicalSection?.enabled ? technicalSection.percentage : 0,
        // Technical/Coding sections hold plain topic labels (only HR holds question
        // objects) - see the SectionConfig.topics note above.
        technical_topics: (technicalSection?.topics || []) as string[],
        coding_enabled: codingSection?.enabled || false,
        coding_percentage: codingSection?.enabled ? codingSection.percentage : 0,
        // Technical/Coding sections hold plain topic labels (only HR holds question
        // objects) - see the SectionConfig.topics note above.
        coding_topics: (codingSection?.topics || []) as string[],
        coding_languages: selectedCodingLanguages,
        proctoring_enabled: proctoringEnabled,
      };

      // 🔍 DEBUG: Log topics being sent to backend
      console.log('[ASSESSMENT-CREATE] 🔍 Topics being sent to backend:');
      console.log('  HR topics:', assessmentData.hr_topics);
      console.log('  Technical topics:', assessmentData.technical_topics);
      console.log('  Coding topics:', assessmentData.coding_topics);
      console.log('  Sections state:', sections);

      let resultAssessment;

      if (isEditMode && editingAssessment) {
        // Update existing assessment. When the user picks "Save as Draft" on
        // an assessment that's currently published (allowed when 0 invites),
        // demote it to draft explicitly — without this the row stays
        // "published" in the DB and the recruiter's own UI shows the wrong
        // status. Backend now keeps the version stable through this status
        // flip; the bump only fires later if/when they republish with real
        // content changes.
        const updatePayload = saveAsDraft
          ? { ...assessmentData, status: 'draft' as const }
          : assessmentData;
        console.log('[TalentFlow] Updating assessment:', editingAssessment.id, 'saveAsDraft:', saveAsDraft);
        resultAssessment = await assessmentService.update(editingAssessment.id, updatePayload);

        // If not saving as draft, publish the updated assessment
        if (!saveAsDraft) {
          await assessmentService.publish(editingAssessment.id);
        }
      } else {
        // Create new assessment
        resultAssessment = await assessmentService.create(assessmentData);

        // If not saving as draft, publish immediately
        if (!saveAsDraft) {
          await assessmentService.publish(resultAssessment.id);
        }
      }

      // Map API response to local format
      const assessmentDefinition = {
        id: resultAssessment.id,
        title: resultAssessment.title,
        version: resultAssessment.version || 1,
        job: selectedJob,
        duration: resultAssessment.duration_minutes,
        sections: sections.filter(section => section.enabled).map(section => ({
          name: section.name,
          percentage: section.percentage,
          topics: section.topics,
          questions: Math.ceil((resultAssessment.duration_minutes * section.percentage) / 100 / 2),
          /* Read from the JD's own seniority field. It used to read
             `experience`, which the picker's list mapping happened to fill
             with the job level; that list now carries the shared mapping,
             where `experience` is the formatted years line ("3+ years") and
             the level lives on `experience_level`. The old field is still
             consulted, so a job coming from a host that maps it the old way
             keeps its difficulty. */
          difficulty: (() => {
            const level = String(selectedJob?.experience_level || selectedJob?.experience || '').toLowerCase();
            if (level.includes('senior') || level.includes('lead') || level.includes('architect') || level.includes('management')) return 'Advanced';
            if (level.includes('mid')) return 'Intermediate';
            return 'Basic';
          })(),
          estimatedTime: Math.ceil((resultAssessment.duration_minutes * section.percentage) / 100),
        })),
        status: saveAsDraft ? 'Draft' : 'Active',
        createdAt: resultAssessment.created_at,
      };

      setGeneratedAssessment(assessmentDefinition);
      setIsGenerating(false);

      // Show success message and redirect. Save-as-Draft used to drop the
      // recruiter on the preview step, but they wanted to go straight back to
      // the assessments list (same as Publish). Both paths now hand off to
      // the parent's onCreateAssessment which closes the creation view and
      // reloads the list — that's the expected "I'm done here" behaviour.
      if (!saveAsDraft) {
        publishSuccessHandledRef.current = false;
        publishedAssessmentRef.current = assessmentDefinition;
        setPublishedAssessmentTitle(assessmentDefinition.title || selectedJob?.title || 'Assessment');
        setShowPublishSuccessModal(true);
      } else {
        toast.success('Assessment saved as draft. You can publish it later.');
        onCreateAssessment(assessmentDefinition);
      }
    } catch (error) {
      console.error('Failed to create/update assessment:', error);
      setIsGenerating(false);
      toast.error(`Failed to ${isEditMode ? 'update' : 'create'} assessment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handlePublish = () => {
    onCreateAssessment({ ...generatedAssessment, status: 'Active' });
    onBack();
  };

  // Auto-save as draft when navigating away from configure step
  const handleAutoSaveDraft = async (navigateCallback: () => void) => {
    // Only auto-save if we're in configure step and have a selected job
    if (step !== 'configure' || !selectedJob) {
      navigateCallback();
      return;
    }

    // If already saved as draft, just navigate
    if (draftSavedId) {
      navigateCallback();
      return;
    }

    // Check if percentages are valid before auto-saving (exclude HR — uses Question Bank)
    const totalPercentage = sections.filter(s => s.enabled && s.name !== 'HR').reduce((sum, s) => sum + s.percentage, 0);
    if (totalPercentage !== 100) {
      console.log('[TalentFlow] Skipping auto-save: percentages do not sum to 100% (current:', totalPercentage, '%)');
      navigateCallback();
      return;
    }

    setIsAutoSaving(true);

    try {
      const hrSection = sections.find(s => s.name === 'HR');
      const technicalSection = sections.find(s => s.name === 'Technical');
      const codingSection = sections.find(s => s.name === 'Coding');

      const assessmentData = {
        jd_id: selectedJob?.id || '',
        title: `${selectedJob?.title} - Assessment - Version 1`,
        description: `Assessment for ${selectedJob?.title} position`,
        duration_minutes: duration,
        hr_enabled: hrSection?.enabled || false,
        hr_percentage: 0,
        hr_topics: (hrSection?.enabled ? selectedHRQuestions : []).map(id => {
          const q = hrQuestionBank.find(hq => hq.id === id);
          return q ? { text: q.text, type: q.type, time: q.time, correct_answer: (q as any).correct_answer } : null;
        }).filter(Boolean),

        technical_enabled: technicalSection?.enabled || false,
        technical_percentage: technicalSection?.enabled ? technicalSection.percentage : 0,
        // Technical/Coding sections hold plain topic labels (only HR holds question
        // objects) - see the SectionConfig.topics note above.
        technical_topics: (technicalSection?.topics || []) as string[],
        coding_enabled: codingSection?.enabled || false,
        coding_percentage: codingSection?.enabled ? codingSection.percentage : 0,
        // Technical/Coding sections hold plain topic labels (only HR holds question
        // objects) - see the SectionConfig.topics note above.
        coding_topics: (codingSection?.topics || []) as string[],
        coding_languages: selectedCodingLanguages,
        proctoring_enabled: proctoringEnabled,
      };

      // Check if an assessment already exists for this JD
      const existingAssessments = await assessmentService.list({ jd_id: selectedJob.id });

      if (existingAssessments?.items && existingAssessments.items.length > 0) {
        // Assessment already exists for this JD - update it instead of creating
        const existingAssessment = existingAssessments.items[0];
        console.log('[TalentFlow] Assessment already exists for JD, updating:', existingAssessment.id);

        await assessmentService.update(existingAssessment.id, assessmentData);
        setDraftSavedId(existingAssessment.id);
        console.log('[TalentFlow] Assessment updated as draft:', existingAssessment.id);
      } else {
        // No existing assessment - create new one
        const createdAssessment = await assessmentService.create(assessmentData);
        setDraftSavedId(createdAssessment.id);
        console.log('[TalentFlow] Assessment auto-saved as draft:', createdAssessment.id);
      }

      setIsAutoSaving(false);
      navigateCallback();
    } catch (error) {
      console.error('Failed to auto-save draft:', error);
      setIsAutoSaving(false);
      // Still navigate even if save fails
      navigateCallback();
    }
  };

  // Handle browser close/refresh - save draft
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (step === 'configure' && selectedJob && !draftSavedId) {
        // Check if percentages are valid before auto-saving
        const totalPct = sections.filter(s => s.enabled).reduce((sum, s) => sum + s.percentage, 0);
        if (totalPct !== 100) {
          console.log('[TalentFlow] Skipping beforeunload auto-save: percentages do not sum to 100%');
          return;
        }

        // Trigger auto-save synchronously (best effort)
        const hrSection = sections.find(s => s.name === 'HR');
        const technicalSection = sections.find(s => s.name === 'Technical');
        const codingSection = sections.find(s => s.name === 'Coding');

        const createData = {
          jd_id: selectedJob?.id || '',
          title: `${selectedJob?.title} - Assessment - Version 1`,
          description: `Assessment for ${selectedJob?.title} position`,
          duration_minutes: duration,
          hr_enabled: hrSection?.enabled || false,
          hr_percentage: 0,
          hr_topics: (hrSection?.enabled ? selectedHRQuestions : []).map(id => {
            const q = hrQuestionBank.find(hq => hq.id === id);
            return q ? { text: q.text, type: q.type, time: q.time, correct_answer: (q as any).correct_answer } : null;
          }).filter(Boolean),
  
          technical_enabled: technicalSection?.enabled || false,
          technical_percentage: technicalSection?.enabled ? technicalSection.percentage : 0,
          // Technical/Coding sections hold plain topic labels (only HR holds question
        // objects) - see the SectionConfig.topics note above.
        technical_topics: (technicalSection?.topics || []) as string[],
          coding_enabled: codingSection?.enabled || false,
          coding_percentage: codingSection?.enabled ? codingSection.percentage : 0,
          // Technical/Coding sections hold plain topic labels (only HR holds question
        // objects) - see the SectionConfig.topics note above.
        coding_topics: (codingSection?.topics || []) as string[],
          coding_languages: selectedCodingLanguages,
          proctoring_enabled: proctoringEnabled,
        };

        // Use sendBeacon for reliable save on page unload
        const blob = new Blob([JSON.stringify(createData)], { type: 'application/json' });
        navigator.sendBeacon?.('/api/assessments/draft', blob);

        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [step, selectedJob, draftSavedId, sections, duration, selectedCodingLanguages, proctoringEnabled]);

  const totalPercentage = getTotalPercentage();
  // Exclude HR from percentage validation — HR uses fixed Question Bank duration
  const enabledSections = sections.filter(s => s.enabled && s.name !== 'HR');
  const hasAtLeastOneEnabled = enabledSections.length > 0;
  const hasZeroPercentageEnabled = enabledSections.some(s => s.percentage === 0);
  const isPercentageValid = totalPercentage === 100 && hasAtLeastOneEnabled && !hasZeroPercentageEnabled;

  /* Read from `localJobs`, which is the fetched list plus any JD created or
     resolved by link during this visit. Every version of every job, unfiltered
     — the status test below runs per version INSIDE each lineage, so a status
     filter applied up here would remove the very versions the collapse needs
     in order to pick the right representative. */
  const allJdVersions = localJobs.length > 0 ? localJobs : jobs;

  /* ONE ROW PER JOB, not per job version — and the row is that lineage's
     NEWEST PUBLISHED VERSION THAT DOES NOT ALREADY HAVE AN ASSESSMENT.

     Two independent tests, applied to every candidate version as the bucket is
     walked from newest to oldest:

       status      — Published or Republished. A newer version in any other
                     status does not take the row. v3 archived over a published
                     v2 leaves the card reading "v2 · Published", because v2 is
                     where the job is still live and v2 is what an assessment
                     would be built against; the same skip covers a v4 draft
                     raised over a published v3. A "latest live" rule, not a
                     "highest number" one.
       assessment  — none built against it yet. One assessment per version is
                     the rule the controls below already enforce, so a
                     published version that is spoken for cannot be the row a
                     recruiter is asked to start from; the list moves DOWN to
                     the next published version instead. Create the assessment
                     for v3 and this list opens on v2 next time, then v1 —
                     no refresh beyond the picker's own mount-time fetch.

     Falling through a taken version never relaxes the status test: v3 taken
     with v4 archived above it goes to v2, never up to v4.

     A job with no version passing both — nothing but drafts, every version
     archived or disabled, or every published version already assessed — has no
     row (`buildAssessmentJobList` returns nothing for it), and a list left
     empty that way lands on the picker's existing empty state. The versions
     still exist and the job is still reachable from Job Openings; it simply
     has nothing a NEW assessment could be built against, which is the only
     question this list answers.

     The skipped versions are not lost, and this is what View Versions is for:
     it lists the entire lineage below, newest first — Published, Republished,
     Disabled, Archived and Draft alike, the already-assessed ones included,
     each showing its real status and its existing assessment — and refuses to
     select only the ones that cannot carry a new one. Nothing about that
     panel changes here.

     `versionHasAssessment` is the same union — mount-time index plus the lazily
     fetched per-lineage detail — that the card controls and every history row
     below are gated on, so the version this list opens on and the version its
     radio will accept can never disagree. */
  const availableJobs = buildAssessmentJobList(allJdVersions, version =>
    versionHasAssessment(lineageKey(version), version.id),
  );
  /* Does this recruiter have ANY published version at all? Only the empty
     state reads it, to tell "you have not published a job yet" apart from "you
     have, and every published version is already assessed" — two empty lists
     with opposite ways out. Asked with the SAME status test the list is built
     from, so the two cannot drift apart on what counts as published. */
  const hasAnyPublishedVersion = allJdVersions.some(isSelectableVersion);
  const jdSearchQuery = jdSearch.trim().toLowerCase();
  /* The shared matcher: JD number, role, department, location — the same
     fields, and the same separator-insensitive number matching, the Apply to
     Job dialog searches. */
  const filteredAvailableJobs = sortJobs(
    availableJobs.filter(jobSearchMatcher(jdSearch)),
    'date',
    'desc',
  );
  /* The number printed above the list counts JOB OPENINGS — distinct Job IDs —
     never job versions. `availableJobs` already holds one row per lineage, so
     this is that list's length; it is derived from the lineage keys rather than
     assumed, so a change that ever let two versions of one job into the list
     could not silently inflate the count into a version count. */
  const jdJobOpeningCount = new Set(filteredAvailableJobs.map(lineageKey)).size;
  const jdTotalPages = Math.max(1, Math.ceil(filteredAvailableJobs.length / jdItemsPerPage));
  const jdCurrentPage = jdPageState.query === jdSearchQuery ? jdPageState.page : 1;
  /* A shrinking result set can leave the current page past the end; clamp on
     read so the rows never come back empty while the page number still points
     somewhere. */
  const jdSafePage = Math.min(jdCurrentPage, jdTotalPages);
  const pagedAvailableJobs = filteredAvailableJobs.slice(
    (jdSafePage - 1) * jdItemsPerPage,
    jdSafePage * jdItemsPerPage,
  );
  /* The pick is held outside the list, so it survives paging and searching —
     and every card on screen can be inert because of a job that is not. Where
     that happens the picker says so, and offers the way out. */
  const jdPickOnThisPage = !!jdPick && pagedAvailableJobs.some(job => lineageKey(job) === jdPick.lineage);

  // Plan feature gate: assessment creation not available on current plan
  useEffect(() => {
    if (!assessmentAvailable) {
      toast.error('Assessment creation is not available on your current plan. Please upgrade to access this feature.');
    }
  }, [assessmentAvailable]);

  if (!assessmentAvailable) {
    return null;
  }

  // Deep-linked with a JD already chosen (Job Details → Assessment → Create,
  // which lands on ?step=configure&jd_id=…). The auto-select effect can only run
  // once the JD list AND the assessment-eligibility set have resolved, and it is
  // what sets `selectedJob` and/or redirects to an existing assessment. Rendering
  // normally through that window shows either the "Select Job Description" picker
  // or a Configure form with no JD behind it, then swaps — the route/breadcrumb
  // glitch. Hold on a loader instead, whichever step the URL asked for.
  //
  // The `preselectedJobResolvable` term matters: eligibility flips to true one
  // render BEFORE the effect runs, so without it the picker would still show for
  // a single frame. If the JD isn't in the list at all (unpublished, or not the
  // user's JD), this is false and we fall through to the picker as before rather
  // than spinning forever.
  const preselectedJdId = preSelectedJobId || urlJdId;
  const preselectedJobResolvable =
    !!preselectedJdId && (localJobs.length > 0 ? localJobs : jobs).some(j => j.id === preselectedJdId);
  const resolvingPreselectedJd =
    !!preselectedJdId &&
    !selectedJob &&
    !isEditMode &&
    (!hasLoadedAssessmentEligibility || isLoadingJobs || preselectedJobResolvable);

  // Not scoped to `step === 'select-jd'`: with ?step=configure the Configure
  // form would otherwise render against a null selectedJob until the effect lands.
  if (resolvingPreselectedJd) {
    return (
      <div className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
            <PageBreadcrumb
              className="mb-3"
              items={buildBreadcrumbItems()}
            />
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 text-brand-blue animate-spin" />
              <span className="ml-3 text-sm text-gray-600">Loading assessment configuration...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 1: Select JD
  if (step === 'select-jd') {
    return (
      <div className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
            <PageBreadcrumb
              className="mb-3"
              items={buildBreadcrumbItems()}
            />
            <div className="w-full">
          <div className="mb-6 sm:mb-8">
            <h1 className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900 mb-2 tracking-tight">{isEditMode ? 'Edit Assessment' : 'Create New Assessment'}</h1>
            <p className="text-sm sm:text-base text-gray-600">
              {isEditMode
                ? 'Update the assessment configuration. Changes will create a new version.'
                : 'Select a Job Description to create an AI-powered assessment'}
            </p>
          </div>

          <div className="bg-gray-50 border border-brand-blue/15 ring-1 ring-brand-blue/10 shadow-sm shadow-brand-blue/10 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6 flex items-start gap-2 sm:gap-3">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-xs sm:text-sm text-brand-blue font-medium mb-1">AI-Powered Assessment Generation</div>
              <div className="text-xs sm:text-sm text-gray-700">
                Automatically generate questions based on the JD, adjusting difficulty, topics, and time allocation based on your configuration. <strong>Each candidate receives a unique, freshly generated question set</strong> to ensure fairness and prevent question sharing.
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
            <div className="p-4 sm:p-6 border-b border-gray-100">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
                <div className="min-w-0">
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight">Select Job Description</h2>
                  <p className="text-xs sm:text-sm text-gray-600 mt-1">
                    Choose the JD that this assessment will be based on
                  </p>
                </div>
                {canCreateJd && (
                  <button
                    onClick={handleCreateNewJD}
                    className="px-3 sm:px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10 rounded-lg transition-all flex items-center gap-2 text-sm flex-shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">Create New Job</span>
                    <span className="sm:hidden">New Job</span>
                  </button>
                )}
              </div>
            </div>

            <div className="p-4 sm:p-6">
              {isLoadingJobs ? (
                <div className="text-center py-8 sm:py-12">
                  <Loader2 className="w-8 h-8 sm:w-10 sm:h-10 text-brand-blue animate-spin mx-auto mb-3" />
                  <p className="text-sm sm:text-base text-gray-500">Loading job descriptions...</p>
                </div>
              ) : (
              <div className="space-y-3" ref={jdListRef}>
                {/* Search Jobs — the Apply to Job dialog's own field, down to
                    the label, the icon and what it searches. */}
                <div className="mb-4">
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Search Jobs</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search by JD number, role, department or location..."
                      value={jdSearch}
                      onChange={e => setJdSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                    />
                  </div>
                </div>

                {/* The count follows the search, so it always describes exactly
                    what is listed — no total beside it, nothing hardcoded. */}
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-medium text-gray-700">
                    Select a Job Opening
                    {filteredAvailableJobs.length > 0 && (
                      <span className="ml-2 font-normal text-gray-500">
                        &mdash; {filteredAvailableJobs.length} available
                      </span>
                    )}
                  </span>
                  {/* The only unconditional way back to "nothing selected".
                      Clicking the ticked radio also lets go of it, but that
                      radio can be a page or a search away — and while it is
                      held, every other job's versions are inert. */}
                  {jdPick && (
                    <button
                      type="button"
                      onClick={() => setJdPick(null)}
                      className="text-xs text-brand-blue hover:text-brand-blue-2 font-medium"
                    >
                      Clear Selection
                    </button>
                  )}
                </div>

                {/* Say what the pick is when it isn't on screen — otherwise a
                    list of cards greyed out by a job on another page reads as
                    the picker having broken. */}
                {jdPick && !jdPickOnThisPage && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-xs text-gray-700">
                    <CheckCircle2 className="w-4 h-4 text-brand-blue flex-shrink-0" />
                    <span>
                      Selected: <span className="font-medium">
                        {jdPick.job.job_id ? `${jdPick.job.job_id} · ` : ''}{jdPick.job.title}
                        {' '}(v{jdPick.job.versionNumber ?? 1})
                      </span>
                      {' '}(on another page)
                    </span>
                  </div>
                )}
                {/* One row per published JOB — `availableJobs` is collapsed to
                    the latest version of each lineage, so a job republished to
                    v3 is one row showing v3, and v2 and v1 live behind View
                    Versions. The row itself is the Job Openings list's own, via
                    the shared JobOpeningSummary. */}
                {pagedAvailableJobs.map(job => {
                  const versionKey = lineageKey(job);
                  const versionsExpanded = jdLineage.isExpanded(versionKey);

                  /* Version-specific, always: an assessment on v3 says nothing
                     about v2. The card speaks for the version it shows — the
                     latest — and every other version answers for itself in the
                     history below. */
                  const latestHasAssessment = versionHasAssessment(versionKey, job.id);
                  const latestAssessment = assessmentForVersion(versionKey, job.id);
                  /* Two states, not one: `isPicked` is "this card's own latest
                     version is the pick" (the card radio), while
                     `lineageSelected` is "some version of this job is the pick"
                     — which is what keeps the card reading as chosen when the
                     pick came out of its Version History. */
                  const isPicked = jdPick?.job.id === job.id;
                  const lineageSelected = jdPick?.lineage === versionKey;
                  const pickedVersionOfThisJob = lineageSelected && !isPicked ? jdPick!.job : null;
                  /* One version at a time, across the whole list: while a
                     version of ANOTHER job is ticked, this job's versions —
                     the latest on the card and every row of its history — go
                     inert, so the picker can never hold two answers. Clearing
                     or moving that pick releases them again. */
                  const blockedByOtherPick = !!jdPick && !lineageSelected;
                  const otherPickReason = blockedByOtherPick
                    ? `v${jdPick!.job.versionNumber ?? 1} of "${jdPick!.job.title}" is selected — clear it to choose a version here`
                    : undefined;
                  /* The card's radio speaks for the latest version, so it is
                     off where that version already has an assessment, where
                     another job holds the pick, and where the version is not
                     published — an assessment can only be built against a
                     published or republished version, which is the rule its Add
                     button and every history row already state. Now that the
                     card can legitimately show a DRAFT latest (a re-drafted
                     job), leaving it out here would offer a pick the next step
                     refuses. The job's published version is one click away in
                     View Versions. */
                  const latestSelectableStatus = isSelectableVersion(job);
                  const latestSelectable = !latestHasAssessment && !blockedByOtherPick && latestSelectableStatus;
                  /* Names the version's ACTUAL status — Draft, Disabled,
                     Archived, Closed — rather than assuming a draft, since any
                     of them can be a lineage's latest and each is a different
                     thing to read on a card. Then names the way through, which
                     is the same one in every case: the published version this
                     job still has is a row in its own View Versions. */
                  const latestUnpublishedReason = `v${job.versionNumber ?? 1} is ${String(job.status || 'not published').toLowerCase()} — open View Versions to build against a published version`;
                  /* The card's Add acts on the version the card shows, so it
                     answers the same published-only rule its version rows do —
                     stated here rather than assumed from the list being
                     published-filtered, so a card whose representative is a
                     draft (a JD resolved by link, a newly created one merged
                     in) cannot offer an assessment it could not carry. */
                  const latestAdd = addButtonState(
                    job.versionNumber,
                    isSelectableVersion(job),
                    latestHasAssessment,
                  );

                  return (
                    <div
                      key={job.id}
                      /* Hovering the card says what it can do, in priority
                         order: the reason it is inert if it is, then — for a
                         latest version that cannot be built against — what View
                         Versions is FOR. That last case is the one worth
                         spelling out. The card shows a Draft, Disabled or
                         Archived version with its real status, so the controls
                         beside it are correctly off, and without a word about
                         it the card reads as a dead end rather than as a job
                         whose other versions are one click away.

                         `title` rather than a styled popover, matching the
                         Job Openings card and every other control in this
                         picker — the same idiom, so a hover behaves the same
                         wherever a recruiter tries it. */
                      title={
                        blockedByOtherPick
                          ? otherPickReason
                          : !latestSelectableStatus
                            ? `${latestUnpublishedReason}. View Versions opens this job's full version history.`
                            : 'View Versions opens this job’s version history — every version of this job, and the one to build the assessment against.'
                      }
                      aria-disabled={blockedByOtherPick}
                      className={`rounded-lg border-2 p-3 sm:p-4 transition-all ${
                        blockedByOtherPick
                          ? 'bg-gray-50 border-gray-200 opacity-60'
                          : lineageSelected
                            ? 'bg-brand-blue/5 border-brand-blue/40 shadow-sm shadow-brand-blue/10'
                            : 'bg-white border-gray-200 hover:border-brand-blue/30 hover:bg-brand-blue/[0.03]'
                      }`}
                    >
                      <div className="flex items-start gap-2 sm:gap-4">
                        {/* A radio, because exactly one JD version is built
                            against. Wrapped in its own label rather than the
                            whole card: the card carries a versions toggle and
                            buttons, and a label around those would swallow
                            their clicks.

                            Off where THIS version already has an assessment —
                            the version history beside it stays open to every
                            sibling version that does not — and off while
                            another job holds the pick. */}
                        <label
                          className={`flex items-center pt-1 ${latestSelectable ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                          title={
                            blockedByOtherPick
                              ? otherPickReason
                              : latestHasAssessment
                                ? `v${job.versionNumber ?? 1} already has an assessment — open View Versions to build against another version`
                                : !latestSelectableStatus
                                  ? latestUnpublishedReason
                                  : `Select the latest version (v${job.versionNumber ?? 1})`
                          }
                        >
                          <input
                            type="radio"
                            name={JD_RADIO_GROUP}
                            checked={isPicked}
                            disabled={!latestSelectable}
                            onChange={() => latestSelectable && pickJdVersion(job, versionKey)}
                            /* Clicking the ticked one lets go of it. */
                            onClick={() => isPicked && pickJdVersion(job, versionKey)}
                            className="w-4 h-4 text-brand-blue border-gray-300 focus:ring-brand-blue/40 flex-shrink-0 disabled:cursor-not-allowed"
                          />
                          <span className="sr-only">Select the latest version of {job.title}</span>
                        </label>

                        <div className="flex-1 min-w-0">
                          {/* Clicking the headline ticks the job, so the whole
                              block is a target without a <label> wrapping the
                              controls beside it. */}
                          <div
                            onClick={() => latestSelectable && pickJdVersion(job, versionKey)}
                            className={latestSelectable ? 'cursor-pointer' : 'cursor-default'}
                          >
                            <JobOpeningSummary job={job} metaSingleLine />
                          </div>

                          {/* The headline above describes the LATEST version,
                              so when the pick is an older one, name it —
                              otherwise a highlighted card would imply the
                              assessment is going to the version on display. */}
                          {pickedVersionOfThisJob && (
                            <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-brand-blue/10 px-2 py-1 text-xs font-medium text-brand-blue">
                              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                              v{pickedVersionOfThisJob.versionNumber ?? 1} selected, chosen from Version History
                            </p>
                          )}
                        </div>

                        {/* Right side — the coding round this JD implies, the
                            assessment state of the version this card would
                            build against, its action, and the eye that reads
                            the full version history. */}
                        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                          {(() => {
                            // Same detection `handleJobSelect` uses, so the
                            // badge matches what configuration will actually
                            // do — and the same helper the version rows below
                            // call, so a card and its own v3 row cannot
                            // disagree. See `codingRequiredFor`.
                            const codingDetected = codingRequiredFor(job);
                            return codingDetected ? (
                              <span className="px-2 sm:px-2.5 py-1 bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20 rounded text-xs flex items-center gap-1">
                                <Code className="w-3 h-3" />
                                Coding
                              </span>
                            ) : (
                              <span className="px-2 sm:px-2.5 py-1 bg-slate-100 text-slate-500 rounded text-xs flex items-center gap-1">
                                <Code className="w-3 h-3" />
                                <span className="hidden sm:inline">No Coding</span>
                                <span className="sm:hidden">N/A</span>
                              </span>
                            );
                          })()}

                          {/* Assessment status for the version this card acts
                              on. Green where one exists, neutral where the
                              version is still free — and it names the version
                              whenever that is not the latest, so the badge can
                              never be read as a statement about the job. */}
                          <AssessmentStatusBadge
                            created={latestHasAssessment}
                            createdAt={latestAssessment?.createdAt}
                          />

                          {/* Create Assessment — always on the card, live only
                              where the version it acts on is published (or
                              republished) AND still free. It goes inert rather
                              than disappearing on a version that already has
                              one: a button that vanishes reads as this job
                              having no action at all, where a greyed one beside
                              a "Created" badge says exactly why. The version
                              history stays open either way. */}
                          {/* The action is the plus — same size and shape as
                              the eye beside it, with the words in its label and
                              tooltip where a screen reader and a hover find
                              them. */}
                          <button
                            type="button"
                            disabled={!latestAdd.enabled}
                            onClick={() => latestAdd.enabled && handleCreateForVersion(job)}
                            className={`h-7 w-7 flex items-center justify-center rounded-md ring-1 transition-all flex-shrink-0 ${
                              latestAdd.enabled
                                ? 'bg-brand-blue hover:bg-brand-blue-2 text-white shadow-md shadow-brand-blue/25 ring-white/10'
                                : ADD_BUTTON_DISABLED
                            }`}
                            aria-label={latestAdd.label}
                            title={latestAdd.label}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>

                          {/* A button, not a link: the popup reads a version
                              without navigating away from a half-made
                              assessment. Opens on the LIST — this Eye is about
                              the job's history, not one version of it. */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setVersionHistoryVersion(null);
                              setVersionHistoryFor(job);
                            }}
                            className="h-7 w-7 flex items-center justify-center bg-white text-brand-blue border border-brand-blue/40 rounded-md hover:bg-brand-blue/10 hover:border-brand-blue transition-all flex-shrink-0"
                            aria-label="View version history"
                            title="View version history"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* View Versions — the card's bottom-right corner, on its
                          own single horizontal row so it clears the details
                          above it whatever they wrap to.

                          UNCONDITIONAL, and never disabled — not when the
                          latest version already has an assessment, and not when
                          that version is a Draft, Disabled or Archived one. An
                          assessment on the latest version says nothing about
                          the versions below it, and this is the only way to
                          reach them: disabling it in exactly those cases would
                          hide the versions still available to build against,
                          which are the reason the card is still listed. A job
                          with one version opens onto that version, which is an
                          answer rather than a dead end.

                          Note this differs from the Job Openings card, which
                          hides the button on a single-version job. Here the
                          list is collapsed to one row per lineage and the
                          button is the only route to the rest, so it is always
                          offered. */}
                      <div className="mt-3 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleJdVersions(job);
                          }}
                          aria-expanded={versionsExpanded}
                          className={`h-7 px-2 inline-flex items-center gap-1 whitespace-nowrap border rounded-md text-xs transition-colors duration-200 ${
                            versionsExpanded
                              ? 'bg-brand-sky text-brand-blue border-brand-blue/30 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10'
                              : 'bg-brand-blue text-white border-brand-blue shadow-sm shadow-brand-blue/30 hover:bg-brand-blue-2'
                          }`}
                          title={
                            versionsExpanded
                              ? 'Hide version history'
                              : 'View version history — every version of this job, and the one to build the assessment against'
                          }
                        >
                          {versionsExpanded ? 'Hide Versions' : 'View Versions'}
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${versionsExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      </div>

                      {/* Version history, expanded in place — the same panel
                          the Job Openings list opens, newest version first,
                          with the latest marked. Two things are added for this
                          surface: an Assessment column, and a radio per row so
                          an older version can be the one built against. */}
                      {versionsExpanded && (
                        <JobVersionHistoryPanel
                          job={job}
                          versions={jdLineage.lineages[versionKey]}
                          loading={jdLineage.isLoading(versionKey) || !!loadingLineageAssessments[versionKey]}
                          versionDetails={jdLineage.versionDetails}
                          versionApplicants={jdLineage.versionApplicants}
                          openInNewTab
                          staticRows
                          /* The role name is plain text here. This table is a
                             picker mid-task: navigating to Job Details would
                             abandon a half-made assessment, and the Eye in the
                             same row already reads the version without leaving
                             the page. */
                          plainTitle
                          /* A radio per version row, so an older version can be
                             the one built against — the card's own radio is the
                             latest, these are v1, v2, v3 … under it.
                             `keepLatestWhenSelectable` holds the latest row in
                             the table anyway, because the Assessment column and
                             the per-version Create action beside it have to
                             answer for v3 next to v2 and v1. That leaves the
                             latest represented by two radios (the card's and
                             its own row's), which is why this table gets its
                             OWN radio group: one native group can hold only one
                             checked input, so sharing the card's would strip the
                             tick off whichever rendered first. Exclusivity is
                             state's job here, not the browser's. */
                          onSelectVersion={(versionJob) => pickJdVersion(versionJob, versionKey)}
                          selectedVersionId={jdPick?.job.id ?? null}
                          keepLatestWhenSelectable
                          radioGroupName={`${JD_RADIO_GROUP}-${versionKey}`}
                          selectHint={(versionJob) =>
                            `Select v${versionJob.versionNumber ?? 1}`
                          }
                          /* Two reasons a version row cannot be picked, and the
                             radio states whichever applies — the same two the
                             Add button one column over already enforced.

                             Already has an assessment: one per version, so it
                             cannot take a second.

                             Not Published or Republished: a Draft is unfinished
                             and a Disabled or Archived version is out of
                             service, so no new assessment can be built against
                             any of them. All three stay VISIBLE here — this
                             table is where a recruiter reads what happened to a
                             job's versions, so a draft or an archived row
                             showing its real status is the point of it. Only
                             the radio goes.

                             This row used to be selectable whatever its status,
                             which let the radio hand a draft to the Configure
                             step that its own Add button, two columns across,
                             refused — the same row disagreeing with itself. The
                             specific reason comes first: a version that has an
                             assessment AND is archived is more usefully
                             explained by the assessment. */
                          versionSelectionState={(versionJob) => {
                            if (versionHasAssessment(versionKey, versionJob.id)) {
                              return `v${versionJob.versionNumber ?? 1} already has an assessment`;
                            }
                            if (!isSelectableVersion(versionJob)) {
                              return `v${versionJob.versionNumber ?? 1} is ${String(versionJob.status || 'not published').toLowerCase()} — an assessment can only be created against a published or republished version`;
                            }
                            return null;
                          }}
                          /* Expanding another job while a pick is held shows its
                             versions, inert — the card above it is inert for the
                             same reason, and an expandable back door around the
                             one-at-a-time rule would be worse than a greyed
                             table. */
                          selectionDisabled={blockedByOtherPick}
                          selectionDisabledReason={otherPickReason}
                          extraColumns={[
                            {
                              label: 'Coding Required',
                              minW: 'min-w-[130px]',
                              /* Whether THIS version implies a coding round,
                                 read from the version's own fetched detail
                                 rather than the card's — the same question the
                                 card badge answers, through the same helper.
                                 Yes/No rather than the card's Coding/No Coding
                                 chip: in a table of one-word cells a plain
                                 verdict scans faster than a repeated noun. */
                              render: (versionJob) => {
                                const needsCoding = codingRequiredFor(versionJobWithDetail(versionJob));
                                return (
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ring-1 ${
                                      needsCoding
                                        ? 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20'
                                        : 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700'
                                    }`}
                                    title={
                                      needsCoding
                                        ? `v${versionJob.versionNumber ?? 1} implies a coding round`
                                        : `v${versionJob.versionNumber ?? 1} does not imply a coding round`
                                    }
                                  >
                                    <Code className="w-3 h-3" />
                                    {needsCoding ? 'Yes' : 'No'}
                                  </span>
                                );
                              },
                            },
                            {
                              label: 'Assessment',
                              minW: 'min-w-[120px]',
                              /* One column, one fact: does THIS version have an
                                 assessment. Created or Not Created, never a
                                 date — the row already carries its dates, and
                                 the answer the recruiter is scanning for here
                                 is which versions are still free. */
                              render: (versionJob) => (
                                <AssessmentCreatedLabel
                                  created={versionHasAssessment(versionKey, versionJob.id)}
                                />
                              ),
                            },
                          ]}
                          /* The per-version action: build against THIS version.
                             On every row, whatever its status — and live only
                             where the Assessment column beside it reads "Not
                             Created" AND the version is published or
                             republished. A Draft, Archived or Disabled version
                             cannot carry an assessment, and one that has an
                             assessment
                             cannot take a second; in both cases the button
                             stays put and greys, so the column keeps its shape
                             and the row states the rule instead of quietly
                             dropping its only action. */
                          renderAction={(versionJob) => {
                            const add = addButtonState(
                              versionJob.versionNumber,
                              isSelectableVersion(versionJob),
                              versionHasAssessment(versionKey, versionJob.id),
                            );
                            return (
                              <>
                                <button
                                  type="button"
                                  disabled={!add.enabled}
                                  onClick={() => add.enabled && handleCreateForVersion(versionJob)}
                                  className={`h-7 w-7 flex items-center justify-center rounded-md ring-1 transition-all ${
                                    add.enabled
                                      ? 'bg-brand-blue hover:bg-brand-blue-2 text-white shadow-sm shadow-brand-blue/25 ring-white/10'
                                      : ADD_BUTTON_DISABLED
                                  }`}
                                  aria-label={add.label}
                                  title={add.label}
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>

                                {/* The card's own Eye, on every version row —
                                    same button, same classes, same popup. Never
                                    disabled: reading a version is unrelated to
                                    whether an assessment can be built against
                                    it, so an Archived, Disabled or Draft row
                                    opens exactly like a published one. Pointed
                                    at THIS version's id, so the popup opens on
                                    the row's own version rather than the
                                    card's. */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    /* Both together: the id fetches this
                                       version's lineage, the number selects
                                       this version inside it, so the popup
                                       opens showing v2 and nothing else. */
                                    setVersionHistoryVersion(versionJob.versionNumber ?? 1);
                                    setVersionHistoryFor(versionJob);
                                  }}
                                  className="h-7 w-7 flex items-center justify-center bg-white text-brand-blue border border-brand-blue/40 rounded-md hover:bg-brand-blue/10 hover:border-brand-blue transition-all flex-shrink-0"
                                  aria-label={`View v${versionJob.versionNumber ?? 1} details`}
                                  title={`View v${versionJob.versionNumber ?? 1} details`}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              </>
                            );
                          }}
                        />
                      )}
                    </div>
                  );
                })}

                {/* The empty state this list already had, now told apart into
                    the TWO ways the list can be empty of jobs, because after
                    this change they need different advice and the old single
                    line would be wrong for one of them:

                      no published version anywhere → the original case, and
                        the original words. Publishing a job is the way out.
                      published versions exist, all assessed → "publish a Job
                        first" would be nonsense to a recruiter who has
                        published several. A NEW VERSION is the way out.

                    `hasAnyPublishedVersion` reads the raw versions through the
                    same status test the list itself uses, so the two can never
                    disagree about what "published" means. */}
                {filteredAvailableJobs.length === 0 && (
                  <div className="text-center py-8 sm:py-12 text-gray-500">
                    <Briefcase className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm sm:text-base">
                      {availableJobs.length > 0
                        ? 'No matching job descriptions found'
                        : hasAnyPublishedVersion
                          ? 'No jobs available for a new assessment'
                          : 'No published jobs available'}
                    </p>
                    <p className="text-xs sm:text-sm mt-1">
                      {availableJobs.length > 0
                        ? 'Try searching with a JD ID like JD-450 or a title like senior python developer'
                        : hasAnyPublishedVersion
                          ? 'Every published job version already has an assessment. Publish a new version of a job to create another one.'
                          : 'Create and publish a Job first to create assessments'}
                    </p>
                    {canCreateJd && availableJobs.length === 0 && (
                      <button
                        onClick={handleCreateNewJD}
                        className="mt-4 px-3 sm:px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10 rounded-lg transition-all flex items-center gap-2 mx-auto text-sm"
                      >
                        <Plus className="w-4 h-4" />
                        Create New Job
                      </button>
                    )}
                  </div>
                )}

                {/* Pagination — the shared control, so the page sizes, the
                    page-number run and the "Showing X to Y of N" line behave as
                    they do on the Job Openings list and in the Apply to Job
                    dialog. Clicking a page scrolls the rows back to the top. */}
                {filteredAvailableJobs.length > 0 && (
                  <ListPagination
                    currentPage={jdSafePage}
                    itemsPerPage={jdItemsPerPage}
                    totalItems={filteredAvailableJobs.length}
                    onPageChange={(page) => setJdPageState({ query: jdSearchQuery, page })}
                    onItemsPerPageChange={(size) => {
                      setJdItemsPerPage(size);
                      setJdPageState({ query: jdSearchQuery, page: 1 });
                    }}
                    itemLabel="published jobs"
                    scrollContainerRef={jdListRef}
                  />
                )}
              </div>
              )}
            </div>
          </div>
            </div>
          </div>
        </div>

        {/* The Job Details page's Version History popup, unchanged and
            unwrapped — one implementation, so the version history read here is
            the one that page shows. */}
        {versionHistoryFor && (
          <JDVersionHistoryModal
            isOpen
            onClose={() => {
              setVersionHistoryFor(null);
              setVersionHistoryVersion(null);
            }}
            jdId={versionHistoryFor.id}
            jdTitle={versionHistoryFor.title}
            initialVersionNumber={versionHistoryVersion ?? undefined}
          />
        )}

        {/* Full-screen JD Creation Modal */}
        {showJDCreation && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-6">
            <div className="bg-white rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] w-[98vw] sm:w-[95vw] h-[calc(100dvh-1rem)] sm:h-[calc(100dvh-3rem)] flex flex-col overflow-hidden">
              {/* Modal Header */}
              <div className="bg-brand-blue px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between flex-shrink-0 rounded-t-xl sm:rounded-t-2xl">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 ring-1 ring-white/10 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Briefcase className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm sm:text-base text-white font-medium truncate tracking-tight">Create New Job</h2>
                    <p className="text-white/80 text-xs sm:text-sm hidden sm:block">Create a job description for your assessment</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowJDCreation(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  aria-label="Close" title="Close"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>

              {/* JDCreation Component */}
              <div className="flex-1 overflow-auto">
                <JDCreation
                  onBack={() => setShowJDCreation(false)}
                  onPublish={(job) => handleJDPublished(job)}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Step 2: Configure Assessment
  if (step === 'configure') {
    const hrSection = sections.find(section => section.name === 'HR');
    const hrEnabled = hrSection?.enabled || false;
    const enabledSectionsCount = sections.filter(section => section.enabled).length;
    // Block Publish when HR is enabled but the recruiter hasn't picked any
    // questions from the bank. Save as Draft is intentionally allowed in
    // that state — drafts are explicitly incomplete by design.
    const hasValidHRSelection = !hrEnabled || selectedHRQuestions.length > 0;

    /**
     * The HR round's SECTION card, rendered INSIDE the HR round block.
     *
     * Extracted from the markup so a round block reads as one thing - the
     * round, then the section it configures - instead of the round toggles
     * living in one card and the sections they switch on living in another,
     * which is what the separate Section Distribution card used to be.
     */
    const renderHRSectionCard = () => (
      <div className="p-3 sm:p-4 border border-gray-100 rounded-xl bg-white ring-1 ring-black/[0.02]">
        {/* No title row. This card is nested inside the HR Round block, whose
            own row names the round and carries its Question Bank / No Timer
            chips a few pixels above — an "HR Section" heading with an icon
            under an "HR Round" heading with an icon labelled the same thing
            twice. The controls are what this row is for, so they are all that
            is left in it. */}
        <div className="flex items-center justify-end flex-wrap gap-2 text-xs mb-3">
            <button
              type="button"
              onClick={openAddHRQuizModal}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 font-medium text-gray-700 transition-colors hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Quiz
            </button>
            <span className={selectedHRQuestions.length >= HR_QUESTION_LIMIT ? 'text-brand-orange-deep font-medium' : 'text-gray-500'}>{selectedHRQuestions.length}/{HR_QUESTION_LIMIT} selected (max {HR_QUESTION_LIMIT})</span>
            <button type="button" onClick={selectAllHR} className="text-brand-blue hover:text-brand-blue-2 font-medium">All</button>
            <span className="text-gray-300">|</span>
            <button type="button" onClick={deselectAllHR} className="text-gray-500 hover:text-gray-700 font-medium">None</button>
        </div>

        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {hrQuestionBank.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-slate-50 px-4 py-6 text-center text-sm text-gray-500">
              No HR questions found. Add one to start building this section.
            </div>
          ) : hrQuestionBank.map((q, idx) => {
            const isSelected = selectedHRQuestions.includes(q.id);
            return (
              <div
                key={q.id}
                onClick={() => toggleHRQuestion(q.id)}
                className={`flex cursor-pointer items-center gap-2.5 p-2 rounded-lg transition-all text-xs ${
                  isSelected
                    ? 'bg-brand-blue/5 border border-brand-blue/30 ring-1 ring-brand-blue/10'
                    : 'bg-slate-50 border border-transparent hover:bg-brand-blue/5'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  readOnly
                  className="w-4 h-4 rounded border-gray-200 text-brand-blue focus:ring-brand-blue/40 flex-shrink-0 pointer-events-none"
                />
                <span className="w-5 h-5 flex items-center justify-center bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 rounded text-[10px] font-medium flex-shrink-0">{idx + 1}</span>
                <span className={`flex-1 ${isSelected ? 'text-gray-900' : 'text-gray-500'}`}>{q.text}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${
                  q.type === 'Yes/No' ? 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20' : 'bg-brand-teal/10 text-brand-teal ring-1 ring-brand-teal/20'
                }`}>{q.type}</span>
                {/* HR is "No Timer" — per-question time is not surfaced because
                    the recruiter can't act on it. The bank still stores `time`
                    because the AI Interview flow reads it; the assessment
                    section just doesn't display it. */}
              </div>
            );
          })}
        </div>

        {/* The "synced with the HR Question Bank" note is not repeated here.
            It now sits immediately after the selected-questions count on the
            HR Round row above, where the count it qualifies is - and keeping
            a copy at the foot of this card would state it twice within one
            round. */}
      </div>
    );

    /**
     * A percentage round's SECTION card - Technical and Coding. One helper
     * for both, exactly as the map that used to render them was: they differ
     * only in their icon, their auto/manual note and Coding's step hint.
     */
    const renderPercentageSectionCard = (section: typeof sections[number]) => (
      <div className="p-3 sm:p-4 border border-gray-100 rounded-xl bg-white ring-1 ring-black/[0.02]">
          {/* No title row, for the same reason as the HR card: this card is
              nested inside its own round block, whose row already names the
              round and carries its icon. "Technical Section" under "Technical
              Round" was the label twice over.

              No per-section total either — the percentage total spans every
              section, so printing it on each one repeated one number once per
              enabled round, two cards both reading "Total: 100%" as though
              each had a total of its own. It is stated once, for all
              sections, in the distribution bar above.

              What survives is Coding's enablement note, which belongs to this
              section alone. Rendered only when there is one, so Technical does
              not carry an empty row. */}
          {section.name === 'Coding' && codingEnabledSource && (
            <div className="flex justify-end mb-3">
              <span className="text-xs text-gray-500">
                {codingEnabledSource === 'auto' ? 'Auto-enabled (coding required)' : 'Manually enabled'}
              </span>
            </div>
          )}

          {/* The language selection area, on the enabled Coding round.
              EVERY selected language, wrapped rather than truncated - the round
              row above can only fit a count, and a one-line summary silently
              dropped the tail of a long selection. Reopening the picker uses
              the 'edit' mode, so changing languages on a round that is already
              on cannot disturb its percentage split. */}
          {section.name === 'Coding' && (() => {
            const chosen = filterCompilable(selectedCodingLanguages);
            const atMax = chosen.length >= MAX_CODING_LANGUAGES;
            return (
              <div className="mb-3 sm:mb-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label className="text-xs text-gray-600">
                    Choose your programming language
                    <span className="ml-2 text-[11px] text-gray-400 font-normal">
                      {chosen.length}/{MAX_CODING_LANGUAGES} selected
                      {atMax ? ' — maximum reached' : ''}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={openCodingLanguageEditor}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue flex-shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {chosen.length > 0 ? 'Change' : 'Select'}
                  </button>
                </div>
                {chosen.length === 0 ? (
                  <p className="text-xs text-gray-500">
                    No language selected yet — pick at least one for the coding round.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {chosen.map(lang => (
                      <span
                        key={lang}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 rounded-full text-xs"
                      >
                        {lang}
                        <button
                          type="button"
                          onClick={() => toggleLanguageSelection(lang)}
                          className="text-brand-blue/60 hover:text-red-600 transition-colors"
                          aria-label={`Remove ${lang}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Percentage Allocation */}
          <div className="mb-3 sm:mb-4">
            <label className="text-xs text-gray-600 mb-2 block">
              Percentage Allocation
              {section.name === 'Coding' && (
                <span className="ml-2 text-[11px] text-gray-400 font-normal">
                  Allowed: 35% / 50% / 75% / 100%
                </span>
              )}
            </label>
            <div className="flex items-center gap-2 sm:gap-3">
              <input
                type="range"
                min="0"
                max="100"
                step={section.name === 'Coding' || sections.some(s => s.name === 'Coding' && s.enabled) ? 1 : 1}
                value={section.percentage}
                onChange={(e) => updatePercentage(section.name, Number(e.target.value))}
                className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-brand-blue"
              />
              <div className="flex items-center gap-1">
                <span className="w-14 px-2 py-1.5 border border-gray-200 bg-slate-50 rounded-lg text-center text-sm text-gray-700 select-none">
                  {section.percentage}
                </span>
                <span className="text-xs sm:text-sm text-gray-600">%</span>
              </div>
            </div>
          </div>

          {/* TOPICS UI — temporarily hidden per product decision.
              The recruiter no longer adds free-text topics; the LLM
              uses the JD content alone to generate questions. The
              backend column (`technical_topics` / `coding_topics`)
              and the create/update payload still carry topics so
              re-enabling this UI is a one-block change. Do NOT
              delete — uncomment when topic input returns. */}
          {/*
          <div>
            <label className="text-xs text-gray-600 mb-2 block">
              Topics (LLM will generate questions based on these)
            </label>
            <div className="flex flex-col sm:flex-row gap-2 mb-2">
              <input
                type="text"
                value={newTopic.section === section.name ? newTopic.value : ''}
                onChange={(e) => setNewTopic({ section: section.name, value: e.target.value })}
                onKeyPress={(e) => e.key === 'Enter' && addTopic(section.name)}
                placeholder={`e.g., ${
                  section.name === 'HR'
                    ? 'conflict handling, salary discussion, teamwork'
                    : section.name === 'Technical'
                    ? 'domain tools, regulations, workflows'
                    : 'algorithm type, framework, logic pattern'
                }`}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-sm text-gray-900"
              />
              <button
                onClick={() => addTopic(section.name)}
                className="px-3 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10 rounded-lg transition-all flex items-center justify-center gap-1 text-sm flex-shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Add Topic</span>
                <span className="sm:hidden">Add</span>
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {section.topics.map((topic, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 rounded text-xs flex items-center gap-1.5"
                >
                  {topic}
                  <button onClick={() => removeTopic(section.name, idx)} className="hover:text-brand-blue-2" aria-label="Close">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {section.topics.length === 0 && (
                <span className="text-xs text-gray-400 italic">
                  No topics added yet. Add topics for AI to generate relevant questions.
                </span>
              )}
            </div>
          </div>
          */}
        </div>
    );

    /**
     * The collapse control on a round row. Disabled while the round is off:
     * there is no section under it to show or hide.
     */
    const renderRoundChevron = (round: RoundName, enabled: boolean) => (
      <button
        type="button"
        onClick={() => toggleRoundExpanded(round)}
        disabled={!enabled}
        aria-expanded={enabled && expandedRounds.has(round)}
        aria-label={`${expandedRounds.has(round) ? 'Hide' : 'Show'} the ${round} section`}
        title={enabled ? `${expandedRounds.has(round) ? 'Hide' : 'Show'} the ${round} section` : undefined}
        className={`p-1 rounded-md transition-colors ${
          enabled ? 'text-gray-400 hover:text-gray-600 hover:bg-gray-100' : 'text-gray-300 cursor-not-allowed'
        }`}
      >
        <ChevronDown
          className={`w-4 h-4 transition-transform duration-200 ${
            enabled && expandedRounds.has(round) ? 'rotate-180' : ''
          }`}
        />
      </button>
    );

    return (
      <div className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 relative">
        {/* Auto-saving overlay */}
        {isAutoSaving && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] p-4 sm:p-5 flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-brand-blue" />
              <span className="text-sm sm:text-base text-gray-700 font-medium">Auto-saving draft...</span>
            </div>
          </div>
        )}

        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
            {/* Every step builds the same trail — see `buildStepCrumbs`. Here
                that is
                  Dashboard › Assessments › Select Job Description › Configure Assessment
                with the picker crumb clickable, so the step behind this one is
                the way back to it.

                The leaf names the STEP, never the chosen JD. Naming the JD made
                the crumb read "Assessments › Senior Java Developer" — a trail
                that says where the recruiter is standing but not what they are
                doing there, and the job is already named in the heading two
                lines below. */}
            <PageBreadcrumb
              className="mb-3"
              items={buildBreadcrumbItems()}
            />
            <div className="w-full">
          <div className="mb-4 sm:mb-6">
            <h1 className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900 mb-1 tracking-tight">Configure Assessment</h1>
            <p className="text-sm sm:text-base text-gray-600">
              Set duration, section distribution, and topics for <span className="text-brand-blue font-medium truncate">{selectedJob?.title}</span>
            </p>
          </div>

          {/* Two Column Layout */}
          <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
            {/* Left Column - Main Content */}
            <div className="flex-1 space-y-4 sm:space-y-6">
              {/* Assessment Rounds - the rounds AND the section each one
                  configures, in a single card.

                  The sections used to sit in a separate "Section Distribution"
                  card below this one, so enabling a round here changed
                  something further down the page that the recruiter then had
                  to go and find. Each section is now nested under the round
                  that switches it on, and collapses with it. */}
              <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 sm:p-6">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />
                    <h3 className="text-sm sm:text-base font-medium text-gray-900 tracking-tight">Assessment Rounds</h3>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium flex-shrink-0 ${
                    hasAtLeastOneEnabled
                      ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
                      : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
                  }`}>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {enabledSectionsCount} of 3 enabled
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4">
                  Choose which rounds to include in this assessment. Disabled rounds will not appear below.
                </p>

                {/* Moved here with the sections it describes: it reports the
                    percentage total, and the sliders that set it now live in
                    this card. */}
                {!isPercentageValid && (
                  <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-yellow-800">
                      {!hasAtLeastOneEnabled && (
                        <p>At least one assessment round must be enabled.</p>
                      )}
                      {hasAtLeastOneEnabled && hasZeroPercentageEnabled && (
                        <p>Enabled rounds cannot have 0% allocation. Disable the round or assign a percentage.</p>
                      )}
                      {hasAtLeastOneEnabled && !hasZeroPercentageEnabled && totalPercentage !== 100 && (
                        <p>Section percentages must total exactly 100% (currently {totalPercentage}%).</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {/* HR Round - its question selection is the section nested
                      directly below the toggle. */}
                  <div className={`p-3 sm:p-4 border rounded-xl transition-all ${hrEnabled ? 'border-brand-blue/30 bg-brand-blue/[0.02]' : 'border-gray-100 bg-slate-50'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 sm:gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                          <Users className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                            <span className="text-sm sm:text-base font-medium text-gray-900">HR Round</span>
                            <span className="px-1.5 sm:px-2 py-0.5 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 rounded text-xs">Question Bank</span>
                            <span className="px-1.5 sm:px-2 py-0.5 bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20 rounded text-xs">No Timer</span>
                            {!hrEnabled && (
                              <span className="px-1.5 sm:px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-xs">Disabled</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 leading-snug">
                            {hrEnabled
                              ? `${selectedHRQuestions.length} of ${HR_QUESTION_LIMIT} questions selected (max ${HR_QUESTION_LIMIT})`
                                + ' — Questions are synced with the HR Question Bank'
                              : 'Enable HR round to select or manage HR questions.'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          aria-label="Toggle HR round"
                          aria-pressed={hrEnabled}
                          onClick={handleHRToggle}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                            hrEnabled ? 'bg-brand-blue shadow-sm shadow-brand-blue/25' : 'bg-gray-300'
                          }`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            hrEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`} />
                        </button>
                        {renderRoundChevron('HR', hrEnabled)}
                      </div>
                    </div>
                    {hrEnabled && expandedRounds.has('HR') && (
                      <div className="mt-3">{renderHRSectionCard()}</div>
                    )}
                  </div>

                  {/* Total Assessment Distribution — the percentage total, stated
                      ONCE for the whole assessment.

                      Each percentage section used to print "Total: N%" in its own
                      header, so a recruiter with Technical and Coding both on read
                      the same number twice, on two cards, as though each section
                      had a total of its own. The total is a property of the
                      assessment, not of a section, so it is reported once, here,
                      with the split that produced it — above the two rounds it
                      sums, so the figure is read before the sliders that set it
                      rather than found after them.

                      HR is absent by design, not omission: HR questions are not
                      timed and carry no percentage, which is what
                      `getTotalPercentage` has always filtered on. */}
                  {(() => {
                    const distribution = sections.filter(s => s.enabled && s.name !== 'HR');
                    if (distribution.length === 0) return null;
                    /* The section's own colour, the same one its icon and its
                       round already carry, so a band in the bar is findable by
                       the card it came from. */
                    const barColor = (name: string) => (name === 'Coding' ? 'bg-brand-orange' : 'bg-brand-cyan');
                    return (
                      <div className="p-3 sm:p-4 border border-gray-100 rounded-xl bg-white ring-1 ring-black/[0.02]">
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-brand-blue" />
                            <h4 className="text-sm sm:text-base font-medium text-gray-900 tracking-tight">Total Assessment Distribution</h4>
                          </div>
                          <span className="text-xs sm:text-sm text-gray-500 flex-shrink-0">
                            Total:{' '}
                            <span className={`font-semibold ${isPercentageValid ? 'text-green-600' : 'text-red-500'}`}>
                              {totalPercentage}%
                            </span>
                          </span>
                        </div>
                        {/* One track, one band per section. A total under 100
                            leaves the remainder showing as track, which is the
                            shortfall the warning above names. */}
                        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                          {distribution.map(section => (
                            <div
                              key={section.name}
                              style={{ width: `${Math.min(section.percentage, 100)}%` }}
                              className={`h-full ${barColor(section.name)} transition-all`}
                            />
                          ))}
                        </div>
                        <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5">
                          {distribution.map(section => (
                            <span key={section.name} className="inline-flex items-center gap-2 text-xs sm:text-sm text-gray-600">
                              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${barColor(section.name)}`} />
                              {section.name} Section
                              <span className="font-semibold text-gray-900">{section.percentage}%</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Technical Round - its percentage slider is the section
                      nested directly below the toggle. */}
                  <div className={`p-3 sm:p-4 border rounded-xl transition-all ${sections.find(s => s.name === 'Technical')?.enabled ? 'border-brand-blue/30 bg-brand-blue/[0.02]' : 'border-gray-100 bg-slate-50'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 sm:gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center flex-shrink-0">
                          <Brain className="w-4 h-4 sm:w-5 sm:h-5 text-brand-cyan" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                            <span className="text-sm sm:text-base font-medium text-gray-900">Technical Round</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 leading-snug">Domain knowledge, technical concepts, and job-specific skills</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => handleTechnicalToggle()}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${sections.find(s => s.name === 'Technical')?.enabled ? 'bg-brand-blue shadow-sm shadow-brand-blue/25' : 'bg-gray-300'}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${sections.find(s => s.name === 'Technical')?.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                        {renderRoundChevron('Technical', !!sections.find(s => s.name === 'Technical')?.enabled)}
                      </div>
                    </div>
                    {(() => {
                      const technicalSection = sections.find(s => s.name === 'Technical');
                      if (!technicalSection?.enabled || !expandedRounds.has('Technical')) return null;
                      return <div className="mt-3">{renderPercentageSectionCard(technicalSection)}</div>;
                    })()}
                  </div>

                  {/* Coding Round - its percentage slider is the section
                      nested directly below the toggle. */}
                  {(() => {
                    const codingEnabled = sections.find(s => s.name === 'Coding')?.enabled;
                    const hasExtractedLanguages = jdExtractedLanguages.length > 0;
                    const isAutoEnabled = hasExtractedLanguages; // IT job = auto-enabled

                    return (
                      <div className={`p-3 sm:p-4 border rounded-xl transition-all ${codingEnabled ? 'border-brand-blue/30 bg-brand-blue/[0.02]' : 'border-gray-100 bg-slate-50'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 sm:gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-brand-orange/10 ring-1 ring-brand-orange/15 flex items-center justify-center flex-shrink-0">
                              <Code className="w-4 h-4 sm:w-5 sm:h-5 text-brand-orange-deep" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                <span className="text-sm sm:text-base font-medium text-gray-900">Coding Round</span>
                                {isAutoEnabled ? (
                                  <span className="px-1.5 sm:px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Auto (IT Job)</span>
                                ) : (
                                  <span className="px-1.5 sm:px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-xs">Auto (Not Required)</span>
                                )}
                              </div>
                              {/* The message follows the ROUND'S OWN STATE, not
                                  what the JD happened to detect.

                                  It used to branch on `isAutoEnabled` alone -
                                  "did the JD name any languages" - so a round
                                  the recruiter had switched on by hand, with
                                  languages they had picked themselves, still
                                  read "No programming languages detected -
                                  enable manually if needed". The instruction to
                                  do the thing they had just done, sitting under
                                  a round that was already on.

                                  Enabled, the languages themselves are the
                                  message and they are listed in full in the
                                  section below (`renderPercentageSectionCard`),
                                  where they wrap rather than truncate. */}
                              <p className="text-xs text-gray-500 mt-0.5 leading-snug">
                                {(() => {
                                  // Filtered at render so a non-compilable language that
                                  // snuck into state from older data (a draft saved before
                                  // this filter existed) is never displayed.
                                  if (codingEnabled) {
                                    const chosen = filterCompilable(selectedCodingLanguages);
                                    return chosen.length > 0
                                      ? `${chosen.length} ${chosen.length === 1 ? 'language' : 'languages'} selected`
                                      : 'Choose your programming language';
                                  }
                                  const detected = filterCompilable(jdExtractedLanguages);
                                  return detected.length > 0
                                    ? `Detected: ${detected.join(', ')}`
                                    : 'No programming language detected. Enable manually if needed';
                                })()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              onClick={() => handleCodingToggle()}
                              className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${codingEnabled ? 'bg-brand-blue shadow-sm shadow-brand-blue/25' : 'bg-gray-300'}`}
                            >
                              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${codingEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                            {renderRoundChevron('Coding', !!codingEnabled)}
                          </div>
                        </div>
                        {(() => {
                          const codingSection = sections.find(s => s.name === 'Coding');
                          if (!codingSection?.enabled || !expandedRounds.has('Coding')) return null;
                          return <div className="mt-3">{renderPercentageSectionCard(codingSection)}</div>;
                        })()}
                      </div>
                    );
                  })()}
                </div>

              </div>

              {/* Proctoring & Security - Hidden for now */}
              {/* <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="w-5 h-5 text-violet-600" />
                  <h3 className="font-medium text-gray-900">Proctoring & Security</h3>
                </div>

                <div className={`p-4 border rounded-lg transition-all ${proctoringEnabled ? 'border-violet-300 bg-violet-50' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${proctoringEnabled ? 'bg-violet-100' : 'bg-gray-200'}`}>
                        <Video className={`w-5 h-5 ${proctoringEnabled ? 'text-violet-600' : 'text-gray-500'}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900">Proctoring Mode</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            proctoringEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                          }`}>
                            {proctoringEnabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">
                          {proctoringEnabled
                            ? 'Advanced security monitoring will be active for this assessment including webcam, screen recording, and AI cheating prevention.'
                            : 'Standard mode without advanced monitoring. Suitable for low-stakes assessments.'
                          }
                        </p>

                        {/* Privacy Notice */}
                        {/* {proctoringEnabled && (
                          <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
                            <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-blue-700">
                              Candidates will be notified about proctoring before starting. All recordings are encrypted and GDPR/DPDP compliant.
                            </p>
                          </div>
                        )} */}
                      {/* </div>
                    </div> */}

                    {/* Toggle Switch */}
                    {/* <div className="flex flex-col items-center gap-1 ml-4">
                      <button
                        onClick={handleProctoringToggle}
                        className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${
                          proctoringEnabled ? 'bg-violet-600' : 'bg-gray-300'
                        }`}
                      >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                          proctoringEnabled ? 'translate-x-8' : 'translate-x-1'
                        }`} />
                      </button>
                      <span className="text-xs text-gray-500 font-medium">
                        {proctoringEnabled ? 'ON' : 'OFF'}
                      </span>
                    </div>
                  </div>
                </div>
              </div> */}

            </div>

            {/* Right Column - Sidebar */}
            <div className="w-full lg:w-80 lg:flex-shrink-0 space-y-4">
              {/* Assessment Duration - Fixed 30 min for Technical + Coding */}
              <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-5 h-5 text-brand-blue" />
                  <h4 className="font-medium text-gray-900 text-sm tracking-tight">Assessment Duration</h4>
                </div>
                <span className="text-xs text-gray-500 block mb-3">Fixed at 30 minutes</span>
                <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                  {(() => {
                    const techSection = sections.find(s => s.name === 'Technical');
                    const codeSection = sections.find(s => s.name === 'Coding');
                    const techMin = techSection?.enabled ? Math.round(30 * (techSection.percentage / 100)) : 0;
                    const codeMin = codeSection?.enabled ? 30 - techMin : 0;
                    return (
                      <>
                        {techSection?.enabled && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-600">Technical ({techSection.percentage}%)</span>
                            <span className="font-medium text-gray-900">{techMin} min</span>
                          </div>
                        )}
                        {codeSection?.enabled && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-600">Coding ({codeSection.percentage}%)</span>
                            <span className="font-medium text-gray-900">{codeMin} min</span>
                          </div>
                        )}
                        <div className="border-t border-gray-200 pt-2 flex items-center justify-between text-xs font-semibold">
                          <span className="text-gray-700">Total Duration</span>
                          <span className="text-gray-900">30 min</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
                {/* Skill & Experience based calculation info */}
                {selectedJob && (() => {
                  const { min: expMin, max: expMax } = getExperienceRange(selectedJob);
                  const avgExp = expMax > 0 ? (expMin + expMax) / 2 : expMin;
                  const skillCount = selectedJob.skills?.length || 0;
                  let level = 'Entry';
                  if (avgExp > 10) level = 'Expert';
                  else if (avgExp > 7) level = 'Senior';
                  else if (avgExp > 4) level = 'Mid';
                  else if (avgExp > 2) level = 'Junior';

                  const techSection = sections.find(s => s.name === 'Technical');
                  const codeSection = sections.find(s => s.name === 'Coding');

                  return (
                    <div className="mt-3 bg-gray-50 border border-brand-blue/15 ring-1 ring-brand-blue/10 shadow-sm shadow-brand-blue/10 rounded-xl p-3">
                      <p className="text-xs font-medium text-brand-blue mb-2">Auto-calculated from JD:</p>
                      <div className="space-y-1.5 text-[11px]">
                        <div className="flex items-center justify-between text-brand-blue/80">
                          <span>Experience</span>
                          <span className="font-semibold">{expMin}-{expMax} yrs ({level})</span>
                        </div>
                        <div className="flex items-center justify-between text-brand-blue/80">
                          <span>Skills</span>
                          <span className="font-semibold">{skillCount} {skillCount >= 8 ? '(broad)' : skillCount <= 3 ? '(deep)' : '(balanced)'}</span>
                        </div>
                        <div className="border-t border-brand-blue/15 pt-1.5 space-y-1">
                          <div className="flex items-center justify-between text-brand-blue">
                            <span>Technical</span>
                            <span className="font-semibold">{techSection?.percentage || 0}% → {Math.round(30 * ((techSection?.percentage || 0) / 100))}m</span>
                          </div>
                          {codeSection?.enabled && (
                            <div className="flex items-center justify-between text-brand-blue">
                              <span>Coding</span>
                              <span className="font-semibold">{codeSection.percentage}% → {30 - Math.round(30 * ((techSection?.percentage || 0) / 100))}m</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
                <p className="text-[11px] text-gray-500 mt-2 leading-snug">
                  HR questions (from Question Bank) are separate and not timed.
                </p>
              </div>

              {/* Summary */}
              <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4">
                <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-3 sm:mb-4">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Total Duration</div>
                    <div className="text-lg sm:text-xl font-semibold text-gray-900 tracking-tight">{duration} min</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Sections</div>
                    <div className="text-lg sm:text-xl font-semibold text-gray-900 tracking-tight">{enabledSectionsCount}</div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={() => handleGenerateAssessment(true)}
                    disabled={!isPercentageValid || isGenerating}
                    className="flex-1 px-3 sm:px-4 py-2 border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    {isGenerating ? 'Saving...' : 'Save as Draft'}
                  </button>
                  <button
                    onClick={() => handleGenerateAssessment(false)}
                    disabled={!isPercentageValid || !hasValidHRSelection || isGenerating}
                    title={
                      !isPercentageValid
                        ? 'Section percentages must total 100%'
                        : !hasValidHRSelection
                          ? 'Select at least one HR question before publishing'
                          : ''
                    }
                    className="flex-1 px-3 sm:px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10 rounded-lg transition-all disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 text-sm"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {isGenerating ? 'Publishing...' : 'Publish'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Coding Confirmation Popup */}
        {showCodingConfirm && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6">
            <div className="bg-white rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] max-w-[95vw] sm:max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden">
              {/* Header */}
              <div className={`${codingPopupMode === 'disable' ? 'bg-red-50 border-b border-red-200' : 'bg-gray-50 border-b border-brand-blue/15'} px-4 sm:px-6 py-3 sm:py-4 rounded-t-xl`}>
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 ${codingPopupMode === 'disable' ? 'bg-red-100' : 'bg-brand-blue/10 ring-1 ring-brand-blue/15'} rounded-xl flex items-center justify-center flex-shrink-0`}>
                    <Code className={`w-4 h-4 sm:w-5 sm:h-5 ${codingPopupMode === 'disable' ? 'text-red-600' : 'text-brand-blue'}`} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-medium text-gray-900 tracking-tight">
                      {codingPopupMode === 'disable'
                        ? 'Disable Coding Round?'
                        : codingPopupMode === 'edit'
                        ? 'Choose your programming language'
                        : 'Enable Coding Round'}
                    </h3>
                    <p className={`text-xs sm:text-sm ${codingPopupMode === 'disable' ? 'text-red-700' : 'text-brand-blue'}`}>
                      {codingPopupMode === 'disable'
                        ? 'This will remove the coding assessment'
                        : `Select up to ${MAX_CODING_LANGUAGES} programming languages for the assessment`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
                {codingPopupMode === 'disable' ? (
                  <>
                    <p className="text-sm sm:text-base text-gray-600 mb-4">
                      Are you sure you want to disable the coding round? The following languages will be removed:
                    </p>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {selectedCodingLanguages.map(lang => (
                        <span key={lang} className="px-3 py-1.5 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 rounded-full text-sm">
                          {lang}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm sm:text-base text-gray-600 mb-4">
                      Please select at least one programming language for the coding assessment
                      {' '}(maximum {MAX_CODING_LANGUAGES}).
                    </p>
                    {/* Language Selection */}
                    <div className="mb-4">
                      <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                        Programming Languages <span className="text-red-500">*</span>
                      </label>
                      <div className="border border-gray-200 rounded-xl p-3 max-h-40 overflow-y-auto">
                        <div className="flex flex-wrap gap-2">
                          {programmingLanguages.map(lang => {
                            const isSelected = selectedCodingLanguages.includes(lang);
                            /* At the cap, the unpicked languages go inert - the
                               picked ones never do, or a full selection could
                               not be changed, only abandoned. */
                            const blocked = !isSelected && selectedCodingLanguages.length >= MAX_CODING_LANGUAGES;
                            return (
                              <button
                                key={lang}
                                onClick={() => toggleLanguageSelection(lang)}
                                disabled={blocked}
                                title={blocked ? `Maximum ${MAX_CODING_LANGUAGES} languages selected` : undefined}
                                className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                                  isSelected
                                    ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10'
                                    : blocked
                                    ? 'bg-slate-50 text-gray-400 cursor-not-allowed'
                                    : 'bg-slate-100 text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue'
                                }`}
                              >
                                {lang}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {selectedCodingLanguages.length > 0 && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-medium text-gray-700">
                              Selected ({selectedCodingLanguages.length}/{MAX_CODING_LANGUAGES})
                              {selectedCodingLanguages.length >= MAX_CODING_LANGUAGES && (
                                <span className="ml-1.5 font-normal text-brand-orange-deep">maximum reached</span>
                              )}
                            </span>
                            <button
                              type="button"
                              onClick={() => setSelectedCodingLanguages([])}
                              className="text-xs text-gray-500 hover:text-red-600 transition-colors"
                            >
                              Clear all
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1.5 p-2 bg-brand-blue/5 ring-1 ring-brand-blue/15 rounded-lg">
                            {selectedCodingLanguages.map(lang => (
                              <span
                                key={`sel-${lang}`}
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-white text-brand-blue ring-1 ring-brand-blue/30 rounded-full text-xs"
                              >
                                {lang}
                                <button
                                  type="button"
                                  onClick={() => toggleLanguageSelection(lang)}
                                  className="text-brand-blue/60 hover:text-red-600 transition-colors"
                                  aria-label={`Remove ${lang}`}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Actions */}
              <div className="flex-shrink-0 bg-slate-50 px-4 sm:px-6 py-3 rounded-b-xl flex flex-col sm:flex-row gap-2 sm:gap-3">
                <button
                  onClick={handleCancelCodingAction}
                  className="flex-1 px-4 py-2 border border-gray-200 bg-white text-sm text-gray-700 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmCodingAction}
                  disabled={codingPopupMode !== 'disable' && selectedCodingLanguages.length === 0}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed ${
                    codingPopupMode === 'disable'
                      ? 'bg-red-600 text-white hover:bg-red-700 shadow-md shadow-red-500/25 ring-1 ring-white/10'
                      : 'bg-brand-blue hover:bg-brand-blue-2 text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10'
                  }`}
                >
                  {codingPopupMode === 'disable'
                    ? 'Yes, Disable'
                    : codingPopupMode === 'edit'
                    ? 'Save Languages'
                    : 'Enable Coding'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Minimum Round Required Popup */}
        {showMinRoundPopup && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6">
            <div className="bg-white rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] max-w-[95vw] sm:max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden">
              {/* Header */}
              <div className="flex-shrink-0 bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-3 sm:py-4 rounded-t-xl">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-medium text-gray-900 tracking-tight">Cannot Disable Round</h3>
                    <p className="text-xs sm:text-sm text-amber-700">Minimum requirement not met</p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
                <p className="text-sm sm:text-base text-gray-600">
                  At least one assessment round must be enabled. Please enable another round before disabling this one.
                </p>
              </div>

              {/* Actions */}
              <div className="flex-shrink-0 bg-slate-50 px-4 sm:px-6 py-3 rounded-b-xl">
                <button
                  onClick={() => setShowMinRoundPopup(false)}
                  className="w-full px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10 text-sm rounded-lg transition-colors"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        )}

        {showPublishSuccessModal && (
          <div className="fixed inset-0 z-[60] bg-gray-900/50 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="assessment-published-title">
            <div className="w-full max-w-[95vw] sm:max-w-md rounded-2xl bg-white shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] max-h-[calc(100dvh-2rem)] flex flex-col tf-round-edges">
              <div className="px-6 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between shrink-0">
                <h2 id="assessment-published-title" className="text-lg font-bold text-gray-900 tracking-tight">Assessment Published</h2>
                <button
                  type="button"
                  onClick={closePublishSuccessModal}
                  className="p-1.5 text-gray-500 hover:bg-slate-100 hover:text-gray-700 rounded-lg transition-colors flex-shrink-0"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-6 py-5 text-center flex-1 overflow-y-auto">
                <div className="relative inline-flex items-center justify-center mb-4">
                  <span className="absolute w-2 h-2 rounded-full bg-green-400 animate-ping" style={{ top: -4, left: 10 }} />
                  <span className="absolute w-1.5 h-1.5 rounded-full bg-brand-blue/60 animate-ping" style={{ top: 8, right: -2, animationDelay: '0.2s' }} />
                  <span className="absolute w-2 h-2 rounded-full bg-brand-cyan/60 animate-ping" style={{ bottom: 0, left: -2, animationDelay: '0.4s' }} />
                  <div className="w-16 h-16 bg-green-100 ring-1 ring-green-200 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  Assessment published successfully. You can now invite candidates.
                </p>
                <p className="text-xs text-gray-500 mb-4">
                  This message will close in 3 seconds.
                </p>
                <div className="bg-gradient-to-br from-brand-blue/5 via-white to-brand-cyan/5 rounded-xl border border-brand-blue/15 ring-1 ring-brand-blue/10 px-4 py-3 text-left">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-500">Assessment</span>
                    <span className="text-sm font-medium text-brand-blue text-right break-words">{publishedAssessmentTitle}</span>
                  </div>
                </div>
              </div>
              <div className="px-6 py-3 border-t border-gray-100 bg-slate-50/60 flex items-center justify-end shrink-0">
                <button
                  type="button"
                  onClick={closePublishSuccessModal}
                  className="px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10 rounded-lg transition-colors"
                >
                  Go to Assessments
                </button>
              </div>
            </div>
          </div>
        )}

        {renderAddHRQuizModal()}
          </div>
        </div>
      </div>
    );
  }

  // Step 3: Preview Generated Assessment
  if (step === 'preview') {
    if (isGenerating) {
      return (
        <div className="flex-1 flex items-center justify-center bg-slate-50 p-4">
          <div className="text-center">
            <Loader2 className="w-12 h-12 sm:w-16 sm:h-16 text-brand-blue animate-spin mx-auto mb-4" />
            <h3 className="text-sm sm:text-base text-gray-900 mb-2 tracking-tight">Saving Assessment Definition...</h3>
            <p className="text-xs sm:text-sm text-gray-600">Configuring your assessment parameters</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
            {/* The last step, so both steps before it are clickable crumbs —
                see `buildStepCrumbs`. */}
            <PageBreadcrumb
              className="mb-3"
              items={buildBreadcrumbItems()}
            />
            <div className="w-full">
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center gap-2 sm:gap-3 mb-2">
              <CheckCircle2 className="w-6 h-6 sm:w-8 sm:h-8 text-green-600 flex-shrink-0" />
              <h1 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-900 tracking-tight">Assessment Definition Saved Successfully</h1>
            </div>
            <p className="text-sm sm:text-base text-gray-600">
              Your assessment configuration has been saved. Questions will be generated when candidates are assigned.
            </p>
          </div>

          {/* Unique Question Generation Highlight */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-4 sm:p-6 mb-4 sm:mb-6">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="p-2 sm:p-3 bg-green-600 rounded-xl flex-shrink-0">
                <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm sm:text-base text-green-900 mb-2 tracking-tight">Unique Question Generation Enabled</h3>
                <p className="text-xs sm:text-sm text-green-800 mb-3">
                  <strong>Each candidate will receive a completely unique set of questions</strong> when they take this assessment. 
                  This ensures fairness, prevents question sharing, and maintains assessment integrity.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-green-800">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span>Fresh questions generated per candidate</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span>Same difficulty & topic coverage</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span>Prevents answer memorization</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span>Fair & standardized evaluation</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Assessment Summary */}
          <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 sm:p-6 mb-4 sm:mb-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mb-4">
              <h2 className="text-sm sm:text-base lg:text-lg font-semibold text-gray-900 truncate tracking-tight">{generatedAssessment?.title}</h2>
              <span className="px-2 py-0.5 bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 rounded text-xs font-semibold flex-shrink-0">
                V{generatedAssessment?.version || 1}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6">
              <div className="p-3 sm:p-4 bg-gradient-to-br from-brand-blue/5 to-brand-cyan/5 ring-1 ring-brand-blue/15 rounded-xl">
                <div className="text-xs sm:text-sm text-brand-blue mb-1 font-medium">Duration</div>
                <div className="text-lg sm:text-2xl text-gray-900 font-semibold tracking-tight">{duration} min</div>
              </div>
              <div className="p-3 sm:p-4 bg-green-50 ring-1 ring-green-200 rounded-xl">
                <div className="text-xs sm:text-sm text-green-700 mb-1 font-medium">Sections</div>
                <div className="text-lg sm:text-2xl text-gray-900 font-semibold tracking-tight">{generatedAssessment?.sections.length}</div>
              </div>
              <div className="p-3 sm:p-4 bg-brand-orange/10 ring-1 ring-brand-orange/15 rounded-xl">
                <div className="text-xs sm:text-sm text-brand-orange-deep mb-1 font-medium">Difficulty</div>
                <div className="text-lg sm:text-2xl text-gray-900 truncate font-semibold tracking-tight">{selectedJob?.experience}</div>
              </div>
            </div>
          </div>

          {/* Scoring Rules Summary */}
          <div className="bg-gray-50 border border-brand-blue/15 ring-1 ring-brand-blue/10 shadow-sm shadow-brand-blue/10 rounded-xl p-4 sm:p-6 mb-4 sm:mb-6">
            <div className="flex items-start gap-2 sm:gap-3 mb-3 sm:mb-4">
              <BarChart className="w-5 h-5 sm:w-6 sm:h-6 text-brand-blue flex-shrink-0" />
              <div>
                <h3 className="text-sm sm:text-base text-brand-blue mb-2 font-semibold tracking-tight">Evaluation & Scoring Logic</h3>
                <p className="text-xs sm:text-sm text-gray-700">
                  How candidates will be evaluated when taking this assessment
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              {/* Technical + Coding Info */}
              <div className="bg-white rounded-xl p-3 sm:p-4 border border-green-200 ring-1 ring-green-100">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <Brain className="w-4 h-4 text-brand-cyan" />
                  <Code className="w-4 h-4 text-brand-orange-deep" />
                  <h4 className="text-xs sm:text-sm text-gray-900 font-medium">Technical + Coding</h4>
                  <span className="ml-auto px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                    Scored
                  </span>
                </div>
                <p className="text-xs text-gray-600 mb-2">
                  Each question scored 0-10. <strong>Pass requires:</strong>
                </p>
                <div className="text-xs text-gray-700 space-y-1">
                  <p>• ≥70% of questions score ≥7, <strong>OR</strong></p>
                  <p>• Section average ≥7.0</p>
                </div>
              </div>
            </div>

            <div className="mt-4 bg-green-100 border border-green-300 rounded-xl p-3">
              <p className="text-sm text-green-900 text-center">
                <strong>Final Result:</strong> PASS/FAIL determined by Technical + Coding sections only
              </p>
            </div>
          </div>

          {/* Section Breakdown */}
          <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
            {generatedAssessment?.sections.map((section: any, idx: number) => (
              <div key={idx} className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-3 sm:mb-4 gap-2">
                  <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                    {section.name === 'HR' && <Users className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />}
                    {section.name === 'Technical' && <Brain className="w-4 h-4 sm:w-5 sm:h-5 text-brand-cyan" />}
                    {section.name === 'Coding' && <Code className="w-4 h-4 sm:w-5 sm:h-5 text-brand-orange-deep" />}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm sm:text-base font-medium text-gray-900 tracking-tight">{section.name} Section</h3>
                        {section.name === 'HR' ? (
                          <span className="px-2 py-0.5 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 rounded text-xs">
                            Informational Only
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                            Scored (0-10 scale)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-start sm:items-end gap-1">
                    <div className="text-xl sm:text-2xl text-brand-blue font-semibold tracking-tight">{section.percentage}%</div>
                    {section.name !== 'HR' && (
                      <span className="text-xs text-green-600">Counts to PASS/FAIL</span>
                    )}
                  </div>
                </div>

                <div className="mb-3 sm:mb-4">
                  <div className="text-xs sm:text-sm text-gray-700 mb-2">Topics Covered:</div>
                  <div className="flex flex-wrap gap-2">
                    {/* HR topics come back as `{text, type, time}` objects from the
                        backend (the HR Question Bank shape), while Technical/Coding
                        topics are plain strings. Rendering the object directly
                        triggers React error #31 ("Objects are not valid as a child").
                        Resolve to the visible text per item. */}
                    {section.topics.map((topic: any, tidx: number) => (
                      <span key={tidx} className="px-2 sm:px-3 py-1 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 rounded-lg text-xs sm:text-sm">
                        {typeof topic === 'string' ? topic : (topic?.text || topic?.name || '')}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Note: Questions NOT generated yet */}
                <div className="bg-gray-50 border border-brand-blue/15 ring-1 ring-brand-blue/10 rounded-xl p-3 sm:p-4">
                  <div className="text-xs sm:text-sm text-gray-700">
                    <strong>Questions will be generated dynamically</strong> when candidates are assigned to this assessment based on the configured topics and difficulty level.
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="text-xs sm:text-sm text-gray-600">
              Status: <span className={`font-medium ${generatedAssessment?.status === 'Active' ? 'text-green-600' : 'text-yellow-600'}`}>
                {generatedAssessment?.status === 'Active' ? 'Published' : 'Draft'}
              </span>
            </div>
            <button
              onClick={() => {
                // Let parent handle navigation to avoid double router.push()
                onCreateAssessment(generatedAssessment);
              }}
              className="w-full sm:w-auto px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10 text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span className="hidden sm:inline">Done - Go to Assessments</span>
              <span className="sm:hidden">Done</span>
            </button>
          </div>

          {renderAddHRQuizModal()}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
