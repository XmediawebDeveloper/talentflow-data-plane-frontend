'use client';

import ChipsReveal from '@/components/ui/chips-reveal';
import { handoffContinueLabel, resolveInviteHandoffOrigin, useHandoffCandidateCrumb } from '@/lib/utils/resumeScoringInviteHandoff';
import { ArrowRight, Building2, Clock, Briefcase, Sliders, Plus, X, Share2, Sparkles, AlertCircle, CheckCircle2, Code, Users, Brain, BarChart, FileText, Shield, Star, Video, Info, Eye, Edit3, MoreVertical, Loader2, Lock, Search, ChevronDown, RefreshCw } from 'lucide-react';
import type { AssessmentResponse, HRTopic } from '@/lib/services/assessmentService';
import { Button } from '@/components/ui/button';
import { useState, useEffect, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { Job } from '@/lib/types/types';
import { formatISTDate } from '@/lib/utils/dateUtils';
import { stripVersionFromTitle } from '@/lib/utils/assessmentUtils';
import { assessmentService, jdService } from '@/lib/services';
import api from '@/lib/services/api';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { usePlanLock } from '@/lib/hooks/usePlanFeature';
import { useAuth } from '@/components/providers/AuthProvider';
import SuccessAnimation from '@/components/ui/success-animation';
import PageBreadcrumb, { type BreadcrumbCrumb } from '@/components/PageBreadcrumb';
import JDVersionHistoryModal from '@/components/JDVersionHistoryModal';
import UnsavedChangesModal from '@/components/UnsavedChangesModal';
import JDFullViewModal from '@/components/jobs/JDFullViewModal';
import CodingRoundLanguageModal from '@/components/assessments/CodingRoundLanguageModal';
import LanguageLogo, { logoLabelForId } from '@/components/assessments/LanguageLogo';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import DraftAssessmentExistsModal, { type ExistingDraftAssessment } from '@/components/assessments/DraftAssessmentExistsModal';
import { loadJobAssessmentHierarchy } from '@/lib/utils/jobAssessmentHierarchy';
import AssessmentJobBinding from '@/components/assessments/AssessmentJobBinding';
import JobOpeningSummary from '@/components/jobs/JobOpeningSummary';
import { useJobCandidateCounts } from '@/lib/hooks/useJobCandidateCounts';
import JobEligibilityNote from '@/components/jobs/JobEligibilityNote';
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
import { Skeleton, PageSkeleton } from '@/components/ui/skeleton';
import { isForcedNavigation } from '@/lib/utils/forcedNavigation';

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
      className="px-2 sm:px-2.5 py-1 bg-success-subtle text-success ring-1 ring-success-line rounded text-xs inline-flex items-center gap-1 whitespace-nowrap"
      title={createdAt ? `Assessment created ${formatISTDate(createdAt)}` : undefined}
    >
      <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
      Assessment Created
      {createdAt && (
        <span className="text-2xs font-normal text-success/80">· {formatISTDate(createdAt)}</span>
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
          ? 'bg-success-subtle text-success ring-success-line'
          : 'bg-slate-100 text-slate-500 ring-slate-200'
      }`}
    >
      {created && <CheckCircle2 className="w-3 h-3 flex-shrink-0" />}
      {created ? 'Created' : 'Not Created'}
    </span>
  );
}

/** The skills popover's width in px — matches `w-64` on the panel itself. */
const JD_SKILLS_PANEL_WIDTH = 256;

/**
 * A JD skill group's count, with the group's skills behind it.
 *
 * The chips used to be listed under the row outright, both groups at once. On
 * a JD carrying a dozen must-haves that pushed the rest of what this card
 * exists to report — the experience band, the duration it feeds — off the
 * bottom of the sidebar, and the count on the header line was answering a
 * question the chips beneath it had already answered. So the count is all that
 * shows: it is the figure a recruiter checking the extraction scans for, and
 * the skills themselves are one hover (or one tap) away for the times that
 * figure looks wrong.
 *
 * The panel is `fixed` and portalled to <body> rather than opened inside the
 * row: the sidebar is a narrow column with its own scrolling, and an in-row
 * panel would be clipped by it — clipping is not something z-index escapes.
 * It is placed from the trigger's own rect, right-aligned to it, held a margin
 * clear of every viewport edge, and flipped above the chip where the room
 * below runs out, so it stays whole on a phone as much as on a desktop. Its
 * list scrolls at whatever height the room allows, capped, so a long group
 * never grows the panel off-screen.
 *
 * Pointer and keyboard both reach it: hover opens it, a click pins it open
 * (the only route on touch, where there is no hover), Escape or a press
 * outside closes it. A pinned panel survives the pointer leaving; an unpinned
 * one closes on a short delay, which is what lets the pointer cross the gap
 * between chip and panel to scroll the list.
 */
function JDSkillsReveal({
  label,
  skills,
  chipClassName,
}: {
  label: string;
  skills: string[];
  /** The row's own count chip classes, so the trigger keeps the group colour. */
  chipClassName: string;
}) {
  /** The open panel's placement, measured off the trigger. Null = closed. */
  const [placement, setPlacement] = useState<{
    top: number;
    bottom: number;
    right: number;
    dropUp: boolean;
    listMaxHeight: number;
  } | null>(null);
  /** Set by a click: the panel then stays up until dismissed, not on hover. */
  const [pinned, setPinned] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOpen = placement !== null;

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const close = useCallback(() => {
    cancelClose();
    setPlacement(null);
    setPinned(false);
  }, [cancelClose]);

  /* Measured once, at open time: the panel closes on any scroll or resize (see
     the dismissal effect below), so these viewport coordinates cannot go stale
     while it is up. */
  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const gutter = 12;
    const spaceBelow = window.innerHeight - rect.bottom - gutter;
    const spaceAbove = rect.top - gutter;
    /* Below by default; above only where below cannot hold a useful panel and
       above holds more. 160px is about the panel at its smallest useful size —
       its header plus a couple of rows of chips. */
    const dropUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    /* What is left for the chips once the panel's header and padding are
       taken, capped so a thirty-skill group scrolls rather than filling the
       screen, and floored so a cramped viewport still shows a scrollable row
       or two instead of a sliver. */
    const room = (dropUp ? spaceAbove : spaceBelow) - 56;
    setPlacement({
      top: rect.top,
      bottom: rect.bottom,
      right: rect.right,
      dropUp,
      listMaxHeight: Math.max(88, Math.min(240, room)),
    });
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setPlacement(null), 140);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  /**
   * Dismissal, the same rule the ⋮ menus on the Assessments page follow: a
   * pointer down anywhere outside, Escape, or the page moving under a panel
   * that was placed from viewport coordinates.
   *
   * The scroll listener is in the capture phase so a scroll inside any
   * container closes it, not just the window's — with the panel's own list
   * excluded, because scrolling the skills is the one scroll that must not
   * dismiss what it is scrolling.
   */
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && panelRef.current?.contains(target)) return;
      // The trigger toggles itself; closing here would let its own click
      // reopen the panel, so it would never appear to shut.
      if (target && triggerRef.current?.contains(target)) return;
      close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const handleScroll = (event: Event) => {
      const target = event.target as Node | null;
      if (target && panelRef.current?.contains(target)) return;
      close();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, [isOpen, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-label={`${label}: ${skills.length}. Show skills`}
        title={`Show ${label.toLowerCase()}`}
        onPointerEnter={(e) => {
          if (e.pointerType !== 'mouse') return;
          cancelClose();
          place();
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== 'mouse' || pinned) return;
          scheduleClose();
        }}
        onClick={() => {
          if (pinned) {
            close();
            return;
          }
          place();
          setPinned(true);
        }}
        className={`${chipClassName} inline-flex items-center gap-1 cursor-pointer transition-shadow hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40`}
      >
        {skills.length}
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {placement && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          onPointerEnter={cancelClose}
          onPointerLeave={(e) => {
            if (e.pointerType !== 'mouse' || pinned) return;
            scheduleClose();
          }}
          className="fixed z-[9999] w-64 max-w-[calc(100vw-1rem)] bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-xl shadow-brand-blue/10 p-3"
          style={{
            top: placement.dropUp ? undefined : placement.bottom + 6,
            bottom: placement.dropUp
              ? Math.max(8, window.innerHeight - placement.top + 6)
              : undefined,
            /* Right-aligned to the chip, which sits at the sidebar's right
               edge, and clamped so neither side of the panel leaves the
               viewport on a narrow screen. */
            left: Math.max(
              8,
              Math.min(
                placement.right - JD_SKILLS_PANEL_WIDTH,
                window.innerWidth - JD_SKILLS_PANEL_WIDTH - 8
              )
            ),
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold text-gray-900">
              {label} ({skills.length})
            </p>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="text-gray-400 hover:text-gray-600 flex-shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-2 overflow-y-auto" style={{ maxHeight: placement.listMaxHeight }}>
            <div className="flex flex-wrap gap-1.5">
              {skills.map(skill => (
                <span
                  key={skill}
                  className="px-2 py-0.5 bg-slate-50 text-gray-600 ring-1 ring-gray-200 rounded-full text-2xs break-words"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
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

/**
 * The record to report after publishing: the publish response where it came
 * back, otherwise the create/update response it followed.
 *
 * Publishing is a SECOND write, and it is the one that settles the fields the
 * Published Assessment page reports. `POST /assessments/{id}/publish` returns
 * the assessment as it now stands — its status, and its `version`, which the
 * backend bumps on a republish that carries real content changes. That reply
 * used to be thrown away, so the page reported the record as it was BEFORE the
 * publish: a republished v3 announced itself as v2, and a create whose reply
 * omitted `version` fell through a `|| 1` and announced v1 whatever the
 * lineage actually held.
 *
 * The fallback is not a formality: it keeps the page reporting the record it
 * has if a publish ever replies with an empty body, rather than blanking the
 * panel over a field it only needed for a badge.
 */
const publishedRecordOr = (
  published: AssessmentResponse | null | undefined,
  fallback: AssessmentResponse,
): AssessmentResponse => (published?.id ? published : fallback);

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
  /**
   * Rendered inside a popup rather than as the /assessments/create PAGE —
   * `AssessmentConfigureModal`, which is how the assessment details page's
   * Edit action opens this flow without leaving the record it is showing.
   *
   * The step, the JD and the assessment being edited come from the props
   * below instead of from the URL, and nothing here rewrites the address bar:
   * the host page's route (and its Back button) has to survive the popup
   * being opened and closed. Everything else — the Configure form, its
   * validation, its Save as Draft / Publish and every dialog they raise — is
   * the same code the page runs.
   */
  embedded?: boolean;
  /**
   * The assessment to edit, for `embedded` mode: the popup's stand-in for the
   * page's `?edit=<id>`. Ignored on the page, which reads the URL.
   */
  editAssessmentId?: string;
  /**
   * VIEW-ONLY. The Configure step exactly as it is — same cards, same rows,
   * same labels, same spacing — with every control non-operable and the Save
   * as Draft / Publish card gone, so there is nothing on screen that could
   * change the record.
   *
   * Used by the New Versions tab's preview, which shows a sibling version's
   * configuration and must not offer to edit it. Off by default, so the
   * Configure popup and the create flow are untouched.
   */
  readOnly?: boolean;
}

/**
 * Imperative handle for `embedded` mode: lets `AssessmentConfigureModal`'s own
 * header close button run the same unsaved-changes check as the in-flow
 * breadcrumb, instead of closing the popup out from under an active edit.
 */
export interface AssessmentCreationHandle {
  requestClose: () => void;
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

const AssessmentCreation = forwardRef<AssessmentCreationHandle, AssessmentCreationProps>(function AssessmentCreation({ onBack, jobs, onCreateAssessment, onCreateNewJD, onJobsRefresh, topicSettings, preSelectedJobId, proctoringSettings: initialProctoringSettings, embedded = false, editAssessmentId: embeddedEditAssessmentId, readOnly = false }, ref) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isTenantAdmin, user, hasPermissionCode } = useAuth();
  const canCreateJd = isTenantAdmin || (user?.permissions?.canCreateJD ?? false);
  // HR Question Bank's "Add Quiz" control inside the HR round — the only
  // add/edit/delete-question affordance this builder actually has (the bank
  // has no per-question edit or delete UI here to gate).
  const canAddQuestion = isTenantAdmin || hasPermissionCode('assessments:add_question');
  // Locked only once plan features have loaded — `available` is false while
  // loading, which used to toast "not available" and blank the form on every load.
  const { isPlanLocked } = usePlanLock();
  const assessmentAvailable = !isPlanLocked('assessment');

  /* Read initial step from URL, default to 'select-jd'.
   *
   * In `embedded` mode the popup's props answer all three instead. The URL
   * belongs to the page the popup is open ON — the assessment details route —
   * and reading `step`/`jd_id`/`edit` off it there would either find nothing
   * or, worse, find another surface's params. */
  const urlStep = embedded
    ? ('configure' as const)
    : (searchParams.get('step') as 'select-jd' | 'configure' | 'publish' | 'preview' | null);
  const urlJdId = embedded ? (preSelectedJobId ?? null) : searchParams.get('jd_id');
  const editAssessmentId = embedded ? (embeddedEditAssessmentId ?? null) : searchParams.get('edit'); // Edit mode: assessment ID to edit

  // Entered from a JD's Job Details page (Quick Actions → Assessment → Create).
  // Mirrors the AI Interview config flow: the breadcrumb stays anchored to that
  // job instead of resetting to the Assessments trail, and `from`/`returnUrl`
  // survive every in-flow URL rewrite so the anchor holds across steps.
  const fromJobDetails = searchParams.get('from') === 'job-details';
  // Entered from Resume Scoring's / AI Talent Match's Actions › "Create AI
  // Assessment" (the job had none to invite to). The trail starts at that
  // page and the published screen leads straight back there to send the
  // invites.
  const returnUrl = searchParams.get('returnUrl');
  const inviteOrigin = embedded ? null : resolveInviteHandoffOrigin(searchParams.get('from'), returnUrl);
  const fromInviteOrigin = !!inviteOrigin;
  const inviteOriginSource = inviteOrigin?.source ?? '';
  const inviteOriginLabel = inviteOrigin?.label ?? '';
  const inviteOriginReturn = inviteOrigin?.returnUrl ?? '';
  // Started from one candidate's page: the trail names that candidate.
  const candidateCrumb = useHandoffCandidateCrumb();
  // JD title carried in the URL. The JD list is fetched async, so without this
  // the JD crumb would render a placeholder on first paint and visibly swap to
  // the real title a moment later.
  const urlJdTitle = searchParams.get('jd_title');
  // `op=create`: the `edit` id is a version Job Details' Create Assessment has
  // just made (a draft copy), so the job trail says Create, not Edit.
  const urlCreatesVersion = !embedded && searchParams.get('op') === 'create';

  /* The publish step only reports an assessment published in this session — it
     holds nothing of its own to rebuild. A reload lands back on
     `?step=publish` with nothing published, so that URL opens on Configure
     rather than on a page with nothing to confirm. */
  const [step, setStepState] = useState<'select-jd' | 'configure' | 'publish' | 'preview'>(
    urlStep === 'publish' ? 'configure' : urlStep || 'select-jd',
  );
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
  /**
   * Has the read of the assessment being edited FINISHED — either with the
   * record or with a failure?
   *
   * The Configure step is held on its loader until it has (see
   * `loadingEditedAssessment` further down). Until the record arrives the only
   * configuration in state is `getInitialSections()`, the defaults for a NEW
   * assessment — and showing those on an Edit, even for the moment before the
   * saved rounds land, is showing the recruiter a configuration nobody chose,
   * on a form whose Publish button would then save it.
   *
   * Settled on failure too, so a read that cannot be served falls through to
   * the form rather than spinning behind a toast.
   */
  const [editLoadSettled, setEditLoadSettled] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState<any>(null);
  // "Leave without saving?" prompt for the Configure step's exit links,
  // shown only while the form actually has unsaved changes (see `isDirty`) —
  // a click that leaves an unchanged form needs no confirmation at all.
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  /* The job's unpublished assessment version, found when "+" was pressed - it
     has to be published before another version is created. */
  const [draftAssessmentConflict, setDraftAssessmentConflict] = useState<{
    draft: ExistingDraftAssessment & { jd_id?: string };
    job: Job;
    jobVersion: number;
  } | null>(null);
  // What "leave" means for the click that opened the dialog — `onBack` (the
  // root "Assessments" crumb, the popup's own close button) by default, or a
  // different destination (e.g. the "Select Job Description" crumb going
  // back a step instead of exiting the flow). Read once by the dialog's
  // Discard button, then cleared.
  const pendingLeaveActionRef = useRef<(() => void) | null>(null);
  const [jdSearch, setJdSearch] = useState('');
  /* The "N assessed" / "N interviewed" chips the Job Descriptions cards and
     the Score Resume job list carry, so a job reads the same here. Fetched
     only while the job-selection step is on screen. */
  const candidateCounts = useJobCandidateCounts(step === 'select-jd');
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
  /* The JD whose full-text dialog is open, from the configure step's View JD.
     Held as id + title rather than as the Job, because the dialog fetches the
     JD record itself — the title is only what names its header while that
     request is in flight. */
  const [jdFullViewFor, setJdFullViewFor] = useState<{ id: string; title: string } | null>(null);
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

  /**
   * The JD version whose + is mid-action, or null when the picker is idle.
   *
   * Held twice on purpose — see `handleCreateForVersion`. The ref is the gate
   * (synchronous, so a double-click's second press cannot get through); the
   * state is what the buttons render from, which a ref cannot do because
   * writing one does not re-render.
   *
   * Released when the flow comes BACK to the picker rather than at the end of
   * the press: a press that succeeds leaves for Configure and takes the picker
   * with it, so there is nothing to re-enable. `setStep('select-jd')` below is
   * the one way back — the breadcrumb crumb and the in-page Back control both
   * go through it — so returning finds the buttons live again.
   */
  const [startingAssessmentFor, setStartingAssessmentFor] = useState<string | null>(null);
  const startingAssessmentRef = useRef<string | null>(null);

  // Helper function to update step and URL
  const setStep = (newStep: 'select-jd' | 'configure' | 'publish' | 'preview', jobId?: string) => {
    setStepState(newStep);
    /* Back on the picker, so the + buttons are live again — including after a
       press that went nowhere, which is the case that would otherwise leave
       the whole column inert with no way to un-stick it but a reload. */
    if (newStep === 'select-jd' && startingAssessmentRef.current !== null) {
      startingAssessmentRef.current = null;
      setStartingAssessmentFor(null);
    }
    /* A popup has no address of its own. The step lives in state either way;
       what the page adds is the URL that names it, and rewriting the details
       route's address from inside a dialog would break its Back button and
       leave a `?step=configure` on a page that is not this flow. */
    if (embedded) return;

    const params = new URLSearchParams();

    // Origin params ride along on every rewrite. Without this the breadcrumb
    // would fall back to the Assessments trail the moment the user advanced a
    // step, and Back would lose the job it came from.
    const withOrigin = (p: URLSearchParams) => {
      if (fromJobDetails) p.set('from', 'job-details');
      if (fromInviteOrigin) p.set('from', inviteOriginSource);
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
   * The assessment once it has actually been published — what turns the
   * Publish Assessment step from its review state into its published state.
   *
   * This replaced a modal that appeared over the Configure step and closed
   * itself after three seconds. Publishing is the end of the flow and deserves
   * a page: a timed popup gave the recruiter no time to read what they had
   * made, no address to return to, and nowhere to go next except away.
   *
   * Declared HERE, above the breadcrumb builders that read it, rather than
   * down with the rest of the Configure step's state: React Compiler stops
   * optimising a component whose values are used before their declaration, and
   * the trail's published leaf is named from this record.
   */
  const [publishedAssessment, setPublishedAssessment] = useState<any>(null);
  /**
   * What the published assessment is CALLED, for the two places that name it:
   * the Publish step's own panel and that step's breadcrumb leaf.
   *
   * One source, so the crumb and the heading under it cannot drift. The
   * version suffix is stripped the way the assessment details page and the
   * Assessments list strip it, so one assessment reads identically wherever it
   * is named; the JD's own "<job> - Assessment" shape stands in for a record
   * that came back without a title.
   */
  const publishedAssessmentName = (): string =>
    stripVersionFromTitle(publishedAssessment?.title || '')
    || `${selectedJob?.title || 'Assessment'} - Assessment`;

  /**
   * The crumb for each STEP of this flow, worded as the step's own page is.
   *
   * "Configure Assessment" is the heading of the configure step; "Select Job
   * Description" is what the first step asks for. A crumb that reads
   * differently from the page under it is a crumb the reader has to translate.
   */
  const STEP_CRUMB_LABEL: Record<'select-jd' | 'configure' | 'publish' | 'preview', string> = {
    'select-jd': 'Select Job Description',
    configure: 'Configure Assessment',
    publish: 'Publish Assessment',
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
   *   Dashboard › Assessments › <the published assessment>
   *
   * The earlier crumbs are `onClick`, not `href`: every step of this flow
   * lives at the same route (the URL only gains a `step` param, and inline on
   * the Assessments page it does not even do that), so a link would point at
   * the page the user is already on. `setStep` is what actually moves between
   * them, and it is the same call the in-page Back controls make.
   *
   * Two of the three states are ONE LEAF rather than a chain, for the same
   * reason in both cases: the steps behind them cannot usefully be gone back
   * to.
   *
   * EDIT MODE is deep-linked straight to Configure with the assessment already
   * chosen, so there is no picker step behind it — offering "Select Job
   * Description" would name a step the user never passed through. Read off the
   * URL's `edit` param rather than the `isEditMode` state it sets, because the
   * state lands an effect later and the crumbs would visibly swap under the
   * user.
   *
   * PUBLISHED is past the commit point. The two wizard crumbs used to stay in
   * the trail, and clickable, after the assessment existed — and neither led
   * back to the recruiter's work: this JD version now HAS an assessment, so
   * re-entering Configure hits the one-per-version rule and
   * `redirectForExistingAssessment` bounces them to the record they are
   * already looking at. A crumb that silently lands somewhere else is a broken
   * link, not a path back. The leaf is the assessment ITSELF rather than
   * "Publish Assessment": what is on screen at that point is a record, not a
   * step, and every other assessment screen — the details view, Results, All
   * Assessments — reads `Dashboard › Assessments › <the assessment>`.
   */
  const buildStepCrumbs = (): BreadcrumbCrumb[] => {
    if (editAssessmentId) return [{ label: 'Edit Assessment' }];
    if (step === 'select-jd') return [{ label: STEP_CRUMB_LABEL['select-jd'] }];
    if (step === 'publish' || step === 'preview') {
      /* The step's own label stands in only where there is no record to name —
         a `?step=publish` URL that survived a reload, which the publish step
         itself guards against by falling back to Configure. */
      return [{ label: publishedAssessment ? publishedAssessmentName() : STEP_CRUMB_LABEL[step] }];
    }
    /* Configure: the picker behind it is a real path back, since nothing is
       committed yet and changing the JD is a thing recruiters do.
         … › Select Job Description › Configure Assessment */
    return [
      { label: STEP_CRUMB_LABEL['select-jd'], onClick: () => attemptStepChange(() => setStep('select-jd')) },
      { label: STEP_CRUMB_LABEL[step] },
    ];
  };

  // Breadcrumb trail — Job Details anchored when the flow was entered from a
  // JD page, otherwise the standard Assessments trail. Both end in the step
  // chain above, so a step reads the same whichever way the flow was entered.
  const buildBreadcrumbItems = (): BreadcrumbCrumb[] => {
    const jdId = selectedJob?.id || preSelectedJobId || urlJdId;
    if (inviteOrigin) {
      // Dashboard › Resume Scoring (or AI Talent Match) › Create AI
      // Assessment › <step>. That crumb goes back with the view and ticks
      // kept; guarded like every other exit from an unsaved Configure step.
      const back = inviteOrigin.returnUrl;
      return [
        { label: 'Dashboard', onClick: () => attemptStepChange(() => router.push('/dashboard')) },
        { label: inviteOrigin.label, onClick: () => attemptStepChange(() => router.push(candidateCrumb ? inviteOrigin.path : back)) },
        ...(candidateCrumb
          ? [{ label: candidateCrumb.label, onClick: () => attemptStepChange(() => router.push(back)) }]
          : []),
        /* Edit on an existing assessment (the draft-exists popup's Open Draft
           keeps this origin), Create on a new one — as the Job Details trail
           below decides it. */
        ...(step === 'publish' || step === 'preview'
          ? buildStepCrumbs()
          : [{ label: editAssessmentId && !urlCreatesVersion ? 'Edit AI Assessment' : 'Create AI Assessment' }]),
      ];
    }
    if (fromJobDetails && jdId) {
      return [
        // onClick, not href: a plain Link navigates immediately and skips
        // PageBreadcrumb's onClick path entirely, so this crumb bypassed the
        // Unsaved Changes prompt every other exit from Configure goes through
        // (the "Assessments" crumb below, "Select Job Description" in
        // buildStepCrumbs). `attemptStepChange` runs the same isDirty check;
        // Discard performs this navigation, Save routes through
        // handleGenerateAssessment same as every other guarded exit.
        { label: 'Dashboard', onClick: () => attemptStepChange(() => router.push('/dashboard')) },
        { label: 'Job Descriptions', href: '/recruitment/job-openings' },
        // urlJdTitle before the fetched title: identical text, but available on
        // the very first paint, so the crumb never changes under the user.
        { label: urlJdTitle || selectedJob?.title || 'Job Details', href: returnUrl || `/recruitment/job-details?id=${encodeURIComponent(jdId)}` },
        /* The leaf is the operation — Edit on an existing assessment, Create
           on a new one (`op=create` marks a version just created as a draft
           copy) — and, once published, the assessment itself. */
        ...(step === 'publish' || step === 'preview'
          ? buildStepCrumbs()
          : [{ label: editAssessmentId && !urlCreatesVersion ? 'Edit' : 'Create' }]),
      ];
    }
    return [
      // onClick, not href — same reason as the fromJobDetails branch above:
      // a Link navigates straight away and never reaches the guard, so this
      // was the one crumb in the trail that could walk the recruiter off an
      // unsaved (or just-saved-as-draft; see `isDirty`) Configure step with
      // no prompt, while "Assessments" right below it always asked.
      { label: 'Dashboard', onClick: () => attemptStepChange(() => router.push('/dashboard')) },
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
      { label: 'Assessments', onClick: handleLeaveAttempt },
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
    if (fromInviteOrigin) assessmentParams.set('from', inviteOriginSource);
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

        setEditLoadSettled(true);
        console.log('[TalentFlow] Assessment loaded for editing:', assessment.title);
      } catch (error) {
        console.error('Failed to load assessment for edit:', error);
        setEditLoadSettled(true);
        toast.error('Failed to load assessment for editing. Please try again.');
        /* In a popup, "back" is closing it — the recruiter is already on the
           record they were editing and navigating away from it would be a
           worse answer than the toast. */
        if (embedded) {
          onBack();
          return;
        }
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
  /* WHICH of the Configure step's two buttons is working. Both run
     `handleGenerateAssessment`, so `isGenerating` on its own cannot say whether
     the recruiter pressed Save as Draft or Publish — and each button has to
     report its own progress rather than both claiming to be saving. */
  const [generatingAction, setGeneratingAction] = useState<'draft' | 'publish' | null>(null);
  const [generatedAssessment, setGeneratedAssessment] = useState<any>(null);
  const [proctoringEnabled, setProctoringEnabled] = useState(initialProctoringSettings?.proctoring_enabled ?? true);

  /* Sync proctoringEnabled when the tenant's settings load async (only before
     the user manually toggles).
     
     The tenant default is the default for a NEW assessment. An EDIT already
     has a decision on file — `loadAssessmentForEdit` reads `proctoring_enabled`
     off the record — and letting the settings response arrive afterwards and
     overwrite it is the same reset the round configuration used to suffer,
     one field along. */
  const [userToggledProctoring, setUserToggledProctoring] = useState(false);
  useEffect(() => {
    if (!editAssessmentId && !userToggledProctoring && initialProctoringSettings != null) {
      setProctoringEnabled(initialProctoringSettings.proctoring_enabled);
    }
  }, [editAssessmentId, initialProctoringSettings, userToggledProctoring]);

  const [localJobs, setLocalJobs] = useState<Job[]>(jobs);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);

  // 1:1 JD-Assessment: Track which JDs already have assessments
  const [jdsWithAssessments, setJdsWithAssessments] = useState<Set<string>>(new Set());
  const [hasLoadedAssessmentEligibility, setHasLoadedAssessmentEligibility] = useState(false);
  /* What the mount-time read could not load, shown above the job list with a
     Retry - the shared picker's own treatment. 'jobs': the job list itself;
     'eligibility': only the "which versions already have an assessment"
     index, so the jobs still show but every Add stays off until a retry
     lands, rather than offering versions that may already be spoken for. */
  const [jobsLoadError, setJobsLoadError] = useState<'jobs' | 'eligibility' | null>(null);
  const [jobsReloadToken, setJobsReloadToken] = useState(0);

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
  // Whether the recruiter has actually touched the Configure step — set from
  // the handlers those controls call (topic add/remove, percentage change, HR
  // question pick, coding language pick, coding enable/disable), never from
  // the JD-driven auto-detection effects that populate the same state before
  // the recruiter gets there.
  //
  // CREATE mode sends this to the backend as `content_edited`, which picks
  // which draft checkpoint a Save-as-Draft logs: untouched defaults are
  // "Assessment Saved as Draft", an edited configuration is "Assessment
  // Draft Updated". There is no saved baseline for a brand new assessment,
  // so the server can't work that out for itself the way the update endpoint
  // does (it diffs content snapshots).
  const [hasConfigureEdits, setHasConfigureEdits] = useState(false);

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

    setHasConfigureEdits(true);
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

  /* `selectAllHR` / `deselectAllHR` removed with the All | None shortcuts
     they were the handlers for - the HR section row now offers Add Quiz and
     the count only, and questions are picked with their own checkboxes. They
     had no other caller, so leaving them would have been dead code. */

  const openAddHRQuizModal = () => {
    if (!canAddQuestion) {
      toast.error('You do not have permission to add questions');
      return;
    }
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
    if (!canAddQuestion) {
      toast.error('You do not have permission to add questions');
      return;
    }
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
        // Yes / No questions are information-only: no right answer to grade.
        correct_answer: null,
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
          <div className="flex-shrink-0 flex items-center justify-between gap-3 border-b border-gray-100 px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
                <FileText className="w-4 h-4 text-brand-blue" />
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight min-w-0 truncate">Add New Question</h3>
            </div>
            <Button variant="secondary" size="sm" type="button" onClick={closeAddHRQuizModal} className="px-2 flex-shrink-0" aria-label="Close">
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 px-4 sm:px-6 py-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Question Text *</label>
              <input
                type="text"
                value={newHRQuestion.question_text}
                onChange={(e) => setNewHRQuestion(prev => ({ ...prev, question_text: e.target.value }))}
                placeholder="Enter the HR question..."
                className="w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
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
                  onClick={() => setNewHRQuestion(prev => ({ ...prev, answer_type: 'yes_no', correct_answer: undefined, time_minutes: 1 }))}
                  className={`flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-all ${
                    newHRQuestion.answer_type === 'yes_no'
                      ? 'border-brand-blue/40 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-brand-blue/30 hover:text-brand-blue'
                  }`}
                >
                  Yes / No / Need to Explain More
                </button>
              </div>
            </div>
          </div>

          <div className="flex-shrink-0 flex flex-wrap justify-end gap-2 sm:gap-3 border-t border-gray-100 bg-slate-50 px-4 sm:px-6 py-3">
            <Button
              variant="primary"
              type="button"
              onClick={handleSaveHRQuestion}
              disabled={isSavingHRQuestion}
              icon={<FileText className="w-4 h-4" />}
            >
              {isSavingHRQuestion ? 'Saving...' : 'Save Question'}
            </Button>
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

  /* The JD's OWN languages, narrowed to the ones the runner can execute.
     This is what decides which of the language picker's two states opens:
     non-empty means the job role requires a coding round, empty means it is
     Auto (Not Required) — the same split the Coding Round card's badge draws,
     read from the same value so the two cannot contradict each other.

     Memoised because the picker derives its browsable list from it; without
     this it would be a fresh array on every keystroke anywhere on the page. */
  const jdCodingLanguages = useMemo(
    () => filterCompilable(jdExtractedLanguages),
    [jdExtractedLanguages],
  );

  // Guards against a second toast/redirect: the auto-select effect can re-run
  // before the router navigates away (selectedJob stays null on this path).
  const existingAssessmentRedirectRef = useRef(false);


  const redirectForExistingAssessment = (jdIdOverride?: string) => {
    if (existingAssessmentRedirectRef.current) return;
    existingAssessmentRedirectRef.current = true;

    /* Unreachable from the popup, which only ever opens in edit mode (the
       one-per-version check that calls this is skipped when `editAssessmentId`
       is set) — and if it ever were reached, the assessment it would navigate
       to is the one the host page is already showing. Close instead. */
    if (embedded) {
      onBack();
      return;
    }

    if (fromInviteOrigin) {
      // Published → nothing to create, go back and invite. Only a draft →
      // open it here (same origin), since that is what has to be published.
      const jdForLookup = jdIdOverride || preSelectedJobId || urlJdId;
      (async () => {
        let draft: any = null;
        let live = false;
        try {
          const resp: any = jdForLookup ? await assessmentService.list({ jd_id: jdForLookup, page_size: 100 }) : null;
          const items: any[] = Array.isArray(resp) ? resp : (resp?.items ?? []);
          live = items.some((x) => ['published', 'active'].includes(String(x?.status || '').toLowerCase()));
          draft = items.find((x) => String(x?.status || '').toLowerCase() === 'draft') ?? null;
        } catch {
          /* fall through to going back */
        }
        if (!live && draft?.id && jdForLookup) {
          toast.info('This job has a draft assessment — finish and publish it to invite.');
          const params = new URLSearchParams({ step: 'configure', jd_id: draft.jd_id || jdForLookup, edit: draft.id, from: inviteOriginSource });
          if (returnUrl) params.set('returnUrl', returnUrl);
          if (urlJdTitle) params.set('jd_title', urlJdTitle);
          router.replace(`/recruitment/assessments/create?${params.toString()}`);
          return;
        }
        toast.info('This job already has an assessment — taking you back to invite.');
        router.replace(inviteOriginReturn);
      })();
      return;
    }

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
        /* `from=job-details` means exactly what it says on the details page —
           "you got here from this JD's page" — and it anchors that page's
           breadcrumb to `Dashboard › Job Descriptions › <JD>`. It is therefore
           sent only when the flow really was entered that way.

           Unconditionally, it mislabelled the commonest route to this
           redirect: the Assessments picker's own + on a JD version that
           already has an assessment. That recruiter never opened a JD page,
           and the trail told them they had. Without the param the details page
           falls back to its own `Dashboard › Assessments › <assessment>`,
           which is where they actually came from. */
        router.replace(
          `/recruitment/assessments/${target.id}${fromJobDetails ? '?from=job-details' : ''}`,
        );
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

    /* THE JD'S DEFAULTS ARE FOR A NEW ASSESSMENT ONLY.
     *
     * In EDIT mode the rounds have already been decided and published by a
     * recruiter, and `loadAssessmentForEdit` above is what puts that saved
     * configuration on screen. Applying the JD defaults here as well made the
     * two writes a RACE, and this one usually won: both start on mount, this
     * one waits on the JD list plus the eligibility index while the edit read
     * is a single GET, so the saved rounds landed first and were then
     * overwritten by "HR on, Technical on, Coding per the JD" — the bug where
     * a recruiter who published HR off / Technical off / Coding on reopened
     * Edit and found their configuration back at the defaults.
     *
     * So the JD half of this effect stops at the JOB: it still selects it, and
     * still records the languages the JD implies (`jdExtractedLanguages`,
     * which is only the list offered when the coding round is switched back
     * on — never the saved state itself). What the rounds ARE is read from the
     * record, and nothing here recalculates it.
     *
     * `editAssessmentId` — the URL/prop that put the flow in edit mode — is
     * read rather than the `isEditMode` state it sets, because the state
     * lands one render later and this effect can run inside that window. */
    if (!editAssessmentId) {
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
    } else {
      console.log('[TalentFlow] Edit mode - keeping the saved round configuration for JD:', job.title);
    }

    setSelectedJob(job);
    /* `publish` is deliberately NOT restored from the URL.
       Reloading drops the configure state - percentages, HR selection, coding
       languages - back to defaults, and re-opening the Publish Assessment
       review on those defaults would show a live Publish button over settings
       the recruiter never chose. Landing on Configure is the honest place to
       be: the job is still selected, and Publish is one click away once the
       configuration is theirs again. */
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
      setJobsLoadError(null);
      try {
        /* Both in parallel, but SETTLED: the assessments index failing used to
           reject the pair, which dropped the job list too and showed "No
           published jobs available" for what was a network error. */
        const [jdResult, eligibilityResult] = await Promise.allSettled([
          fetchAllJdVersions(),
          assessmentService.getJDsWithAssessments(),
        ]);
        if (jdResult.status === 'rejected') throw jdResult.reason;
        const jdItems = jdResult.value;

        // Set JDs that already have assessments (for 1:1 filtering)
        if (eligibilityResult.status === 'fulfilled') {
          setJdsWithAssessments(new Set(eligibilityResult.value));
        } else {
          console.error('[TalentFlow] Failed to load JDs with assessments:', eligibilityResult.reason);
          setJobsLoadError('eligibility');
        }

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
              /* Both groups as the JD states them, so a JD reached by id shows
                 the same skills as one that came through the list mapping. */
              must_have_skills: jd.must_have_skills || [],
              nice_to_have_skills: jd.nice_to_have_skills || [],
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
        setJobsLoadError('jobs');
      } finally {
        setHasLoadedAssessmentEligibility(true);
        setIsLoadingJobs(false);
      }
    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobsReloadToken]);

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
   *
   * ONE PRESS AT A TIME, across every + on the picker.
   *
   * The press is not the small synchronous thing it looks like: it configures
   * every section from the JD, then `setStep('configure', id)`, which rewrites
   * the URL through the router. A second press lands while that navigation is
   * still in flight, and it re-runs the lot — a second router.replace over the
   * first, which is what shows as the loader appearing twice.
   *
   * A press on a DIFFERENT row is the worse case: the two presses race, and
   * `selectedJob` and the URL's `jd_id` can settle on different versions —
   * Configure then shows one version while the URL names the other, so a
   * reload silently swaps the job under the recruiter.
   *
   * The ref is what actually holds the gate: it is set in the same tick as the
   * press, before React has re-rendered anything, so the second press of a
   * double-click sees it. The state beside it exists for the buttons to read
   * (`aria-busy` and a spinner on the pressed one, the rest inert), which a ref
   * cannot drive because writing one does not re-render.
   */
  const handleCreateForVersion = async (versionJob: Job) => {
    if (startingAssessmentRef.current) return;
    startingAssessmentRef.current = versionJob.id;
    setStartingAssessmentFor(versionJob.id);

    /* An unpublished assessment version anywhere in this JOB must be published
       before another one is created - the Assessments page's "Draft already
       exists" popup, read from the job's real assessments. A failed read lets
       the create through; the version's own one-per-version guard still runs. */
    try {
      const hierarchy = await loadJobAssessmentHierarchy(versionJob.id);
      const draft = hierarchy.assessments
        .filter(a => String(a?.status || '').toLowerCase() === 'draft')
        .sort((a, b) =>
          new Date(b?.updated_at || b?.created_at || 0).getTime() -
          new Date(a?.updated_at || a?.created_at || 0).getTime())[0];
      if (draft?.id) {
        startingAssessmentRef.current = null;
        setStartingAssessmentFor(null);
        setDraftAssessmentConflict({
          draft,
          job: versionJob,
          jobVersion: hierarchy.jobVersionByAssessmentId.get(draft.id) ?? versionJob.versionNumber ?? 1,
        });
        return;
      }
    } catch {
      /* fall through to the create */
    }

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
    setHasConfigureEdits(true);
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

    setHasConfigureEdits(true);
    setSections(sections.map(s =>
      s.name === sectionName
        ? { ...s, topics: [...s.topics, newTopic.value.trim()] }
        : s
    ));
    setNewTopic({ section: '' as any, value: '' });
  };

  const removeTopic = (sectionName: string, topicIndex: number) => {
    setHasConfigureEdits(true);
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
    setHasConfigureEdits(true);
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
    setHasConfigureEdits(true);
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
    setHasConfigureEdits(true);
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
    setHasConfigureEdits(true);
    setSelectedCodingLanguages(prev => {
      if (prev.includes(lang)) return prev.filter(l => l !== lang);
      if (prev.length >= MAX_CODING_LANGUAGES) {
        toast.warning(`You can select up to ${MAX_CODING_LANGUAGES} programming languages.`);
        return prev;
      }
      return [...prev, lang];
    });
  };

  /**
   * Whether leaving the Configure step should stop and ask (the
   * Unsaved-Changes / Save-as-Draft prompt) instead of just leaving.
   *
   * Always, for any configuration the recruiter could save: they get the
   * choice of leaving a draft checkpoint behind whether or not they changed
   * anything first — the same unconditional prompt the AI Interview wizard
   * shows on its way out.
   *
   * There is deliberately no content diff here any more. WHICH checkpoint
   * the save records is decided by the server from the content it receives
   * — "Assessment Saved as Draft" when nothing changed, "Assessment Draft
   * Updated" when something did (see update_assessment) — so a second,
   * client-side answer to the same question could only disagree with it.
   *
   * Two exceptions: a read-only preview has nothing to save, and an edit
   * whose record is still loading has nothing to save YET — the step is on
   * its loader and the only configuration in state is the defaults for a NEW
   * assessment, which is not something to offer to keep.
   *
   * Deliberately NOT gated on `editingAssessment` as well. A settled read that
   * produced no record still leaves a savable form on screen, and gating the
   * prompt on the record meant the one case the rule exists for — open a
   * configuration, change nothing, leave — could exit silently with no
   * checkpoint written and nothing on screen to say so.
   */
  const isDirty = useMemo(() => {
    /* Configure only. The prompt offers to save a CONFIGURATION, and the
       dialog is rendered by the Configure step alone - so on Select Job
       Description (or the published page) a crumb that routed through here
       opened a dialog that was never drawn: "Assessments" and "Dashboard" did
       nothing at all. Off Configure there is nothing to save, so they leave. */
    if (step !== 'configure') return false;
    if (readOnly) return false;
    if (isEditMode && !editLoadSettled) return false;
    return true;
  }, [step, readOnly, isEditMode, editLoadSettled]);

  // The root "Assessments" breadcrumb (and the popup chrome's own close
  // button, via the imperative handle below). Route it through here instead
  // of calling `onBack` directly so an actual edit prompts Save/Discard, and
  // a click with nothing changed just leaves. Takes no arguments — it is
  // passed straight to a few `onClick` props, and a bound param there would
  // silently receive the click event instead of a real destination.
  const handleLeaveAttempt = () => {
    if (isDirty) {
      pendingLeaveActionRef.current = null; // null = the Discard button falls back to onBack
      setShowUnsavedDialog(true);
    } else {
      onBack();
    }
  };

  // The same dirty-check for exits that DON'T leave the flow — e.g. the
  // "Select Job Description" crumb, which steps back to job selection
  // rather than closing the create/edit view. `target` is called directly
  // (build the closure at the call site, e.g. `() => setStep('select-jd')`)
  // once there is nothing unsaved, or stashed for the dialog's Discard
  // button to run if there is.
  const attemptStepChange = (target: () => void) => {
    if (isDirty) {
      pendingLeaveActionRef.current = target;
      setShowUnsavedDialog(true);
    } else {
      target();
    }
  };

  // Exposes the same dirty-check to the popup chrome's own close button
  // (`AssessmentConfigureModal`'s header X), which lives outside this
  // component and would otherwise call `onClose`/`onBack` directly.
  useImperativeHandle(ref, () => ({ requestClose: handleLeaveAttempt }), [handleLeaveAttempt]);

  /**
   * Leave the flow for the assessments list, handing the published record to
   * the host so it closes the creation view and reloads.
   *
   * The same call the old modal made when it closed — now on a button the
   * recruiter presses when they are ready, rather than on a three-second
   * timer that took the page away mid-sentence.
   */
  const goToAssessmentsList = useCallback(() => {
    if (publishedAssessment) onCreateAssessment(publishedAssessment);
    else onBack();
  }, [publishedAssessment, onCreateAssessment, onBack]);

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
    setGeneratingAction(saveAsDraft ? 'draft' : 'publish');

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
          resultAssessment = publishedRecordOr(
            await assessmentService.publish(editingAssessment.id),
            resultAssessment,
          );
        }
      } else {
        // Create new assessment. `save_and_exit` tells the backend this
        // create call is ALSO the recruiter's exit (Save as Draft rather
        // than Publish), so it can log the "Saved as Draft" checkpoint
        // immediately instead of only on whatever edit comes next, and
        // `content_edited` tells it which checkpoint that is — untouched
        // defaults "Saved as Draft", an edited configuration "Draft
        // Updated" (see `hasConfigureEdits`).
        resultAssessment = await assessmentService.create({
          ...assessmentData,
          save_and_exit: saveAsDraft,
          content_edited: hasConfigureEdits || userToggledProctoring,
        });

        // If not saving as draft, publish immediately
        if (!saveAsDraft) {
          resultAssessment = publishedRecordOr(
            await assessmentService.publish(resultAssessment.id),
            resultAssessment,
          );
        }
      }

      // Map API response to local format
      const assessmentDefinition = {
        id: resultAssessment.id,
        title: resultAssessment.title,
        /* Straight off the record the write returned — no `|| 1` behind it.
           A fabricated 1 is indistinguishable from a real first version, so
           the page cannot tell the reader "this is v1" from "the API did not
           say"; without a number the version badge simply does not render. */
        version: resultAssessment.version,
        /* The assessment's own id and the JD it is bound to, as the API
           reports them: the Published Assessment page names all three
           identities (assessment, job, and the job VERSION the assessment was
           built against), and every one of them has to come from the record
           rather than from anything this component assembled. */
        short_id: resultAssessment.short_id,
        jd_id: resultAssessment.jd_id,
        jd_short_id: resultAssessment.jd_short_id,
        jd_version: resultAssessment.jd_version,
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
      setGeneratingAction(null);

      // Show success message and redirect. Save-as-Draft used to drop the
      // recruiter on the preview step, but they wanted to go straight back to
      // the assessments list (same as Publish). Both paths now hand off to
      // the parent's onCreateAssessment which closes the creation view and
      // reloads the list — that's the expected "I'm done here" behaviour.
      if (!saveAsDraft) {
        /* The Publish Assessment step is a PAGE — the end of the create flow,
           with its own ways onward. A popup opened over a record that already
           exists has none of that to report: the recruiter is looking at the
           very assessment they just republished, so the popup hands the
           record back and closes, and the host refreshes what is behind it. */
        if (embedded) {
          toast.success(`Assessment ${isEditMode ? 'updated' : 'published'} successfully.`);
          onCreateAssessment({ ...assessmentDefinition, id: resultAssessment.id });
        } else {
          /* On to the Publish Assessment step, which exists only to report this.
             The record and the step are set together, so that page never renders
             with nothing to confirm. `resultAssessment.id` rides along so the
             page's own actions can open the assessment and its invites. */
          setPublishedAssessment({ ...assessmentDefinition, id: resultAssessment.id });
          setStep('publish');
        }
      } else {
        toast.success('Assessment saved as draft. You can publish it later.');
        // The id lets the Assessments list open on this draft (Total Jobs,
        // its job's versions expanded, scrolled to it).
        onCreateAssessment({ ...assessmentDefinition, id: resultAssessment.id });
      }
    } catch (error) {
      console.error('Failed to create/update assessment:', error);
      setIsGenerating(false);
      setGeneratingAction(null);
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
      // A forced sign-out redirect (session timeout / logout / 401) must not
      // be blocked by "Leave site?" — the session is already gone.
      if (isForcedNavigation()) return;
      /* The popup edits an assessment that already exists, and it is not the
         page being unloaded — a "leave site?" prompt raised from a dialog
         open over the details view would be asking about the wrong thing. */
      if (embedded) return;
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

  /* THE STEP'S OUTER SHELL — the page's, or the popup's.
   *
   * On the route this flow owns its screen: a scrolling `bg-slate-50` main, a
   * 1400px column, and the padded white card every other recruitment page
   * draws. In a popup all three are already there — the dialog panel IS the
   * card, and it owns the scrolling — so repeating them stacked two white
   * cards inside a rounded frame and nested a scroll container in a scroll
   * container. Same content either way; only the frame around it differs. */
  const stepShellClass = embedded
    ? 'relative'
    : 'flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 relative';
  const stepColumnClass = embedded ? 'w-full' : 'mx-auto w-full max-w-[1400px]';
  const stepCardClass = embedded
    ? 'p-4 sm:p-5 w-full'
    : 'p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl';

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

  /* EDIT: the saved configuration comes before any fallback default.
   *
   * `sections` starts life as `getInitialSections()` — the defaults a NEW
   * assessment opens on — and the record's own rounds replace it when the edit
   * read lands. Rendering the form in between put the defaults on screen for
   * an Edit, which is both wrong to read and, for a fast click, wrong to save.
   * The same loader the pre-selected-JD case uses covers the gap. */
  const loadingEditedAssessment = !!editAssessmentId && !editLoadSettled;

  // Not scoped to `step === 'select-jd'`: with ?step=configure the Configure
  // form would otherwise render against a null selectedJob until the effect lands.
  if (resolvingPreselectedJd || loadingEditedAssessment) {
    // Same skeleton the route page (assessments/create) shows, so only ONE
    // consistent skeleton appears instead of two different ones in sequence.
    return <PageSkeleton variant="form" showStats={false} />;
  }
  if (false) {
    return (
      <div className={stepShellClass}>
        <div className={stepColumnClass}>
          <div className={stepCardClass}>
            {/* No trail inside a popup: the breadcrumb states the path to the
                PAGE, and the page under the popup has its own. */}
            {!embedded && (
              <PageBreadcrumb
                className="mb-3"
                items={buildBreadcrumbItems()}
              />
            )}
            <div className="w-full">
              {/* Heading — matches the Configure step's title/subtitle */}
              {!embedded && (
                <div className="mb-4 sm:mb-6 space-y-2">
                  <Skeleton className="h-7 w-64" />
                  <Skeleton className="h-4 w-80 max-w-full" />
                </div>
              )}

              {/* Two Column Layout */}
              <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
                {/* Left Column - Main Content cards */}
                <div className="flex-1 min-w-0 space-y-4 sm:space-y-6">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 sm:p-6">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-5 w-5 rounded-md" />
                          <Skeleton className="h-5 w-40" />
                        </div>
                        <Skeleton className="h-6 w-24 rounded-lg" />
                      </div>
                      <Skeleton className="h-3.5 w-72 max-w-full mb-4" />
                      <div className="space-y-3">
                        {Array.from({ length: 3 }).map((_, r) => (
                          <div key={r} className="p-3 sm:p-4 border border-gray-100 rounded-xl bg-slate-50">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2 sm:gap-3 min-w-0">
                                <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
                                <div className="min-w-0 space-y-2">
                                  <Skeleton className="h-4 w-32" />
                                  <Skeleton className="h-3 w-56 max-w-full" />
                                </div>
                              </div>
                              <Skeleton className="h-6 w-11 rounded-full flex-shrink-0" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Right Column - Sidebar cards */}
                <div className="w-full lg:w-80 lg:flex-shrink-0 space-y-4">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4">
                      <div className="flex items-center gap-3 mb-4">
                        <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
                        <div className="min-w-0 space-y-2">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Skeleton className="h-3.5 w-full" />
                        <Skeleton className="h-3.5 w-5/6" />
                        <Skeleton className="h-3.5 w-2/3" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 1: Select JD
  if (step === 'select-jd') {
    return (
      <div className="flex-1 overflow-x-clip bg-slate-50">
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
                </div>
                <Button
                  variant="primary"
                  onClick={() => {
                    if (!canCreateJd) {
                      toast.error('You do not have permission to create job descriptions');
                      return;
                    }
                    handleCreateNewJD();
                  }}
                  aria-disabled={!canCreateJd}
                  title={!canCreateJd ? 'You do not have permission to create job descriptions' : undefined}
                  className={`flex-shrink-0 ${!canCreateJd ? 'opacity-50 cursor-not-allowed' : ''}`}
                  icon={<Plus className="w-4 h-4" />}
                >
                  <span className="hidden sm:inline">Create New Job</span>
                  <span className="sm:hidden">New Job</span>
                </Button>
              </div>
              {/* The list's rule, in the Job Eligibility note the Score Resume
                  lists use, worded for this list. Its own full-width row under
                  the heading and Create New Job - inside the heading column it
                  ran into the button. */}
              <JobEligibilityNote
                className="mt-3"
                description="Only Published (or Republished) job versions without an assessment are listed. Archived, Disabled, Draft and already-assessed jobs are hidden — use View Versions to see a job's full history."
              />
            </div>

            <div className="p-4 sm:p-6">
              {isLoadingJobs ? (
                <div className="space-y-3">
                  {/* Search Jobs field */}
                  <div className="mb-4 space-y-2">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-10 w-full rounded-lg" />
                  </div>
                  {/* Count row */}
                  <div className="mb-3 flex items-center justify-between">
                    <Skeleton className="h-4 w-40" />
                  </div>
                  {/* JD cards — radio + title/meta + action icons */}
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="rounded-lg border-2 border-gray-200 bg-white p-3 sm:p-4">
                      <div className="flex flex-wrap sm:flex-nowrap items-start gap-2 sm:gap-4">
                        <Skeleton className="w-4 h-4 rounded-full mt-1 flex-shrink-0" />
                        <div className="flex-1 min-w-0 space-y-2">
                          <Skeleton className="h-4 w-56 max-w-full" />
                          <Skeleton className="h-3 w-72 max-w-full" />
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                          <Skeleton className="h-7 w-7 rounded-md" />
                          <Skeleton className="h-7 w-7 rounded-md" />
                        </div>
                      </div>
                    </div>
                  ))}
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
                      className="w-full min-w-0 pl-10 pr-4 py-2 text-sm border border-gray-200 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                    />
                  </div>
                </div>

                {/* A failed read, with a way to retry - the shared picker's own
                    banner. Without it a network error read as "you have no
                    published jobs". */}
                {jobsLoadError && (
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <span>
                      {jobsLoadError === 'jobs'
                        ? `Could not load job openings.${availableJobs.length > 0 ? ' Showing the jobs already loaded.' : ''}`
                        : 'Could not check which job versions already have an assessment. Add is turned off until this loads.'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setJobsReloadToken(t => t + 1)}
                      className="inline-flex items-center gap-1 font-medium text-amber-900 hover:underline"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Retry
                    </button>
                  </div>
                )}
                {/* The count follows the search, so it always describes exactly
                    what is listed — no total beside it, nothing hardcoded. */}
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-medium text-gray-700">
                    Select a Job Opening
                    {filteredAvailableJobs.length > 0 && (
                      <span className="ml-2 font-normal text-gray-500 whitespace-nowrap">
                        &mdash; {filteredAvailableJobs.length} available
                      </span>
                    )}
                  </span>
                  {/* The only unconditional way back to "nothing selected".
                      Clicking the ticked radio also lets go of it, but that
                      radio can be a page or a search away — and while it is
                      held, every other job's versions are inert. */}
                  {jdPick && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* The picker's own "1 selected" chip, beside its Clear. */}
                      <span className="text-xs font-medium text-brand-blue bg-brand-blue/10 px-2 py-0.5 rounded-full whitespace-nowrap">
                        1 selected
                      </span>
                      <button
                        type="button"
                        onClick={() => setJdPick(null)}
                        className="text-xs text-brand-blue hover:text-brand-blue-2 font-medium whitespace-nowrap"
                      >
                        Clear Selection
                      </button>
                    </div>
                  )}
                </div>

                {/* Say what the pick is when it isn't on screen — otherwise a
                    list of cards greyed out by a job on another page reads as
                    the picker having broken. */}
                {jdPick && !jdPickOnThisPage && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-xs text-gray-700">
                    <CheckCircle2 className="w-4 h-4 text-brand-blue flex-shrink-0" />
                    <span className="min-w-0 [overflow-wrap:anywhere]">
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
                      <div className="flex flex-wrap sm:flex-nowrap items-start gap-2 sm:gap-4">
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
                            <JobOpeningSummary
                              job={candidateCounts
                                ? { ...job, assessed: candidateCounts[job.id]?.assessed ?? 0, interviewed: candidateCounts[job.id]?.interviewed ?? 0 }
                                : job}
                              metaSingleLine
                              /* The picker's tick: some version of this job is the pick. */
                              trailingBadges={lineageSelected ? (
                                <CheckCircle2 className="w-5 h-5 text-brand-blue flex-shrink-0" />
                              ) : null}
                            />
                          </div>

                          {/* The headline above describes the LATEST version,
                              so when the pick is an older one, name it —
                              otherwise a highlighted card would imply the
                              assessment is going to the version on display. */}
                          {pickedVersionOfThisJob && (
                            <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-brand-blue/10 px-2 py-1 text-xs font-medium text-brand-blue max-w-full">
                              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                              v{pickedVersionOfThisJob.versionNumber ?? 1} selected, chosen from Version History
                            </p>
                          )}
                        </div>

                        {/* Right side — the coding round this JD implies, the
                            assessment state of the version this card would
                            build against, its action, and the eye that reads
                            the full version history. */}
                        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3 w-full sm:w-auto sm:flex-shrink-0">
                          {(() => {
                            // Same detection `handleJobSelect` uses, so the
                            // badge matches what configuration will actually
                            // do — and the same helper the version rows below
                            // call, so a card and its own v3 row cannot
                            // disagree. See `codingRequiredFor`.
                            const codingDetected = codingRequiredFor(job);
                            return codingDetected ? (
                              <span className="px-2 sm:px-2.5 py-1 bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20 rounded text-xs flex items-center gap-1 whitespace-nowrap flex-shrink-0">
                                <Code className="w-3 h-3" />
                                Coding
                              </span>
                            ) : (
                              <span className="px-2 sm:px-2.5 py-1 bg-slate-100 text-slate-500 rounded text-xs flex items-center gap-1 whitespace-nowrap flex-shrink-0">
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
                          {/* Inert while any + on the picker is mid-action, and
                              the pressed one turns its plus into the spinner —
                              see `handleCreateForVersion`. The pressed button
                              keeps its live colours so the row the recruiter
                              acted on is the one that reads as working.

                              Inert too until the eligibility index has landed.
                              `isLoadingJobs` starts false and is raised by the
                              mount effect, so the standalone route paints these
                              rows from its `jobs` prop one frame before anyone
                              knows which versions already have an assessment —
                              and `versionHasAssessment` reads an empty set in
                              that frame, which reports every version as free. A
                              press landing there would carry a taken version
                              into Configure, where nothing checks again. */}
                          <button
                            type="button"
                            disabled={!latestAdd.enabled || !!startingAssessmentFor || !hasLoadedAssessmentEligibility || jobsLoadError === 'eligibility'}
                            aria-busy={startingAssessmentFor === job.id}
                            onClick={() => latestAdd.enabled && handleCreateForVersion(job)}
                            className={`h-7 w-7 flex items-center justify-center rounded-md ring-1 transition-all flex-shrink-0 ${
                              latestAdd.enabled && hasLoadedAssessmentEligibility && jobsLoadError !== 'eligibility' && (!startingAssessmentFor || startingAssessmentFor === job.id)
                                ? 'bg-brand-blue hover:bg-brand-blue-2 text-white shadow-md shadow-brand-blue/25 ring-white/10'
                                : ADD_BUTTON_DISABLED
                            }`}
                            aria-label={latestAdd.label}
                            title={latestAdd.label}
                          >
                            {startingAssessmentFor === job.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Plus className="w-3.5 h-3.5" />
                            )}
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
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs whitespace-nowrap ring-1 ${
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
                                {/* Same one-at-a-time gate as the card's +
                                    above, and the same gate value: a press on
                                    a version row and a press on a card race
                                    each other exactly as two presses on one
                                    button do. */}
                                <button
                                  type="button"
                                  disabled={!add.enabled || !!startingAssessmentFor || !hasLoadedAssessmentEligibility || jobsLoadError === 'eligibility'}
                                  aria-busy={startingAssessmentFor === versionJob.id}
                                  onClick={() => add.enabled && handleCreateForVersion(versionJob)}
                                  className={`h-7 w-7 flex items-center justify-center rounded-md ring-1 transition-all ${
                                    add.enabled && hasLoadedAssessmentEligibility && jobsLoadError !== 'eligibility' && (!startingAssessmentFor || startingAssessmentFor === versionJob.id)
                                      ? 'bg-brand-blue hover:bg-brand-blue-2 text-white shadow-sm shadow-brand-blue/25 ring-white/10'
                                      : ADD_BUTTON_DISABLED
                                  }`}
                                  aria-label={add.label}
                                  title={add.label}
                                >
                                  {startingAssessmentFor === versionJob.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Plus className="w-3.5 h-3.5" />
                                  )}
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
                    disagree about what "published" means.

                    Not after a failed read with nothing loaded: the banner
                    above says what happened, and "publish a Job first" would
                    be wrong advice for a network error. */}
                {filteredAvailableJobs.length === 0 && !(jobsLoadError === 'jobs' && availableJobs.length === 0) && (
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
                    {availableJobs.length === 0 && (
                      <Button
                        variant="primary"
                        onClick={() => {
                          if (!canCreateJd) {
                            toast.error('You do not have permission to create job descriptions');
                            return;
                          }
                          handleCreateNewJD();
                        }}
                        aria-disabled={!canCreateJd}
                        title={!canCreateJd ? 'You do not have permission to create job descriptions' : undefined}
                        className={`mt-4 mx-auto ${!canCreateJd ? 'opacity-50 cursor-not-allowed' : ''}`}
                        icon={<Plus className="w-4 h-4" />}
                      >
                        Create New Job
                      </Button>
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
        {draftAssessmentConflict && (
          <DraftAssessmentExistsModal
            draft={draftAssessmentConflict.draft}
            jdShortId={draftAssessmentConflict.job.job_id}
            jobTitle={draftAssessmentConflict.job.title}
            jobVersion={draftAssessmentConflict.jobVersion}
            message={"A draft version already exists for this assessment. Publish the existing draft before creating another version — open it to finish and publish, or cancel to stay here."}
            onClose={() => setDraftAssessmentConflict(null)}
            onOpenDraft={() => {
              const { draft, job } = draftAssessmentConflict;
              setDraftAssessmentConflict(null);
              const params = new URLSearchParams({
                step: 'configure',
                jd_id: draft.jd_id || job.id,
                edit: draft.id,
              });
              if (fromJobDetails) params.set('from', 'job-details');
              if (fromInviteOrigin) params.set('from', inviteOriginSource);
              if (returnUrl) params.set('returnUrl', returnUrl);
              router.push(`/recruitment/assessments/create?${params.toString()}`);
            }}
          />
        )}

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
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6">
            <div className="bg-white rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] w-full max-w-[95vw] h-[calc(100dvh-1.5rem)] sm:h-[calc(100dvh-3rem)] flex flex-col overflow-hidden">
              {/* Modal Header */}
              <div className="bg-brand-blue px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3 flex-shrink-0 rounded-t-xl sm:rounded-t-2xl">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
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
                  className="h-8 w-8 inline-flex items-center justify-center flex-shrink-0 hover:bg-white/10 rounded-lg transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>

              {/* JDCreation Component */}
              <div className="flex-1 min-h-0 overflow-auto">
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

    /* The JOB this assessment is configured against, and WHICH VERSION of it.
       Same mapping as the Publish step: the assessment record's own binding
       (`jd_short_id`, `jd_version`) is asked first when editing, and the
       selected JD — the exact version the assessment's `jd_id` points at —
       answers for a new assessment or whatever the record leaves out. Either
       value the data does not carry is left out rather than guessed at. */
    const configureJobId = editingAssessment?.jd_short_id || selectedJob?.job_id || '';
    const configureJobVersion = editingAssessment?.jd_version ?? selectedJob?.versionNumber;
    const configureJobRole = selectedJob?.title || editingAssessment?.jd_title || '';

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
        {/* Add Quiz on the LEFT, the selection controls on the right. The
            row's one action that ADDS to the bank leads it; the count and the
            All / None shortcuts act on what is already there, so they sit
            together at the other end. `justify-between` rather than an
            `ml-auto` on the right group, so the two ends stay put when the
            row wraps on a narrow card. */}
        <div className="flex items-center justify-between flex-wrap gap-2 text-xs mb-3">
          <Button
            variant="secondary"
            size="sm"
            type="button"
            onClick={openAddHRQuizModal}
            aria-disabled={!canAddQuestion}
            title={!canAddQuestion ? 'You do not have permission to add questions' : undefined}
            className={`flex-shrink-0 ${!canAddQuestion ? 'opacity-50 cursor-not-allowed' : ''}`}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            Add Quiz
          </Button>
          <span className={selectedHRQuestions.length >= HR_QUESTION_LIMIT ? 'text-brand-orange-deep font-medium' : 'text-gray-500'}>{selectedHRQuestions.length}/{HR_QUESTION_LIMIT} selected (max {HR_QUESTION_LIMIT})</span>
        </div>

        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {hrQuestionBank.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-slate-50 px-4 py-6 text-center text-sm text-gray-500">
              No HR questions found. Add one to start building this section.
            </div>
          ) : hrQuestionBank.map((q, idx) => {
            const isSelected = selectedHRQuestions.includes(q.id);
            return (
              /* The one control in this step that is a <div>, not a form
                 element — so the read-only fieldset cannot reach it and the
                 handler and its cursor are dropped here instead. Same row,
                 same colours; it just no longer responds. */
              <div
                key={q.id}
                onClick={readOnly ? undefined : () => toggleHRQuestion(q.id)}
                className={`flex items-center gap-2.5 p-2 rounded-lg transition-all text-xs ${
                  readOnly ? 'cursor-default' : 'cursor-pointer'
                } ${
                  isSelected
                    ? 'bg-brand-blue/5 border border-brand-blue/30 ring-1 ring-brand-blue/10'
                    : `bg-slate-50 border border-transparent${readOnly ? '' : ' hover:bg-brand-blue/5'}`
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
                <span className="w-5 h-5 flex items-center justify-center bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 rounded text-2xs font-medium flex-shrink-0">{idx + 1}</span>
                <span className={`flex-1 min-w-0 [overflow-wrap:anywhere] ${isSelected ? 'text-gray-900' : 'text-gray-500'}`}>{q.text}</span>
                <span className={`px-1.5 py-0.5 rounded text-2xs font-medium flex-shrink-0 ${
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
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <label className="text-xs text-gray-600 min-w-0">
                    Choose your programming language
                    <span className="ml-2 text-2xs text-gray-400 font-normal">
                      {chosen.length}/{MAX_CODING_LANGUAGES} selected
                      {atMax ? ' — maximum reached' : ''}
                    </span>
                  </label>
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    onClick={openCodingLanguageEditor}
                    className="flex-shrink-0"
                    icon={<Plus className="w-3.5 h-3.5" />}
                  >
                    {chosen.length > 0 ? 'Change' : 'Select'}
                  </Button>
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
                        className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 rounded-full text-xs max-w-full"
                      >
                        {/* The language's own mark, the same file the picker
                            shows on its cards — one size down so it sits in a
                            text-xs pill without stretching it. */}
                        <LanguageLogo language={lang} size="sm" />
                        {lang}
                        <button
                          type="button"
                          onClick={() => toggleLanguageSelection(lang)}
                          className="flex-shrink-0 text-brand-blue/60 hover:text-destructive transition-colors"
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
                <span className="ml-2 text-2xs text-gray-400 font-normal">
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
                className="flex-1 min-w-0 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-brand-blue"
              />
              <div className="flex items-center gap-1 flex-shrink-0">
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
              <Button
                variant="primary"
                onClick={() => addTopic(section.name)}
                className="flex-shrink-0"
                icon={<Plus className="w-4 h-4" />}
              >
                <span className="hidden sm:inline">Add Topic</span>
                <span className="sm:hidden">Add</span>
              </Button>
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
        className={`h-8 w-8 inline-flex items-center justify-center flex-shrink-0 rounded-md transition-colors ${
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
      <div className={stepShellClass}>
        {/* Auto-saving overlay */}
        {isAutoSaving && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6">
            <div className="bg-white rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] p-4 sm:p-5 flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-brand-blue flex-shrink-0" />
              <span className="text-sm sm:text-base text-gray-700 font-medium">Auto-saving draft...</span>
            </div>
          </div>
        )}

        <div className={stepColumnClass}>
          <div className={stepCardClass}>
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
            {/* Popup: no trail (the page behind it has one) and no heading —
                the dialog's own header carries this step's title and the job
                it is configuring, so printing them again inside the body
                labelled the same thing twice. */}
            {!embedded && (
              <PageBreadcrumb
                className="mb-3"
                items={buildBreadcrumbItems()}
              />
            )}
            <div className="w-full">
          {!embedded && (
            <div className="mb-4 sm:mb-6">
              <h1 className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900 mb-1 tracking-tight">Configure Assessment</h1>
              <p className="text-sm sm:text-base text-gray-600">
                Set duration, section distribution, and topics for{' '}
                <AssessmentJobBinding jobId={configureJobId} role={configureJobRole} version={configureJobVersion} />
              </p>
            </div>
          )}

          {/* Two Column Layout */}
          {/* READ-ONLY, in one place rather than a `disabled` on each control.
              A disabled <fieldset> disables every form control inside it —
              inputs, the percentage sliders, the round toggles, every button —
              which is what makes view-only mode COMPLETE: a control added to
              this step later is non-operable in preview without anyone having
              to remember it.

              It carries no styling of its own (`m-0 p-0 border-0`), so the
              step renders pixel-for-pixel as it does in Configure, and
              `min-w-0` overrides the UA stylesheet's `min-inline-size:
              min-content` on fieldsets, which would otherwise stop the flex
              row below from shrinking. `disabled={false}` is inert, so the
              editable popup and the create flow behave exactly as before. */}
          <fieldset disabled={readOnly} className="min-w-0 m-0 p-0 border-0">
          <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
            {/* Left Column - Main Content */}
            <div className="flex-1 min-w-0 space-y-4 sm:space-y-6">
              {/* Assessment Rounds - the rounds AND the section each one
                  configures, in a single card.

                  The sections used to sit in a separate "Section Distribution"
                  card below this one, so enabling a round here changed
                  something further down the page that the recruiter then had
                  to go and find. Each section is now nested under the round
                  that switches it on, and collapses with it. */}
              <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Sliders className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue flex-shrink-0" />
                    <h3 className="text-sm sm:text-base font-medium text-gray-900 tracking-tight">Assessment Rounds</h3>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium flex-shrink-0 ${
                    hasAtLeastOneEnabled
                      ? 'bg-success-subtle text-success ring-1 ring-success-line'
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
                  <div className="mb-4 p-3 bg-warning-subtle border border-warning-line rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-warning-strong">
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
                                  <span className="px-1.5 sm:px-2 py-0.5 bg-success-subtle text-success rounded text-xs whitespace-nowrap">Auto (IT Job)</span>
                                ) : (
                                  <span className="px-1.5 sm:px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-xs whitespace-nowrap">Auto (Not Required)</span>
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

                  {/* Total Assessment Distribution — the percentage total, stated
                      ONCE for the whole assessment.

                      Each percentage section used to print "Total: N%" in its own
                      header, so a recruiter with Technical and Coding both on read
                      the same number twice, on two cards, as though each section
                      had a total of its own. The total is a property of the
                      assessment, not of a section, so it is reported once, here,
                      with the split that produced it — below the two rounds it
                      sums, reading back what their sliders were just set to.

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
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <Clock className="w-4 h-4 text-brand-blue flex-shrink-0" />
                            <h4 className="text-sm sm:text-base font-medium text-gray-900 tracking-tight">Total Assessment Distribution</h4>
                          </div>
                          <span className="text-xs sm:text-sm text-gray-500 flex-shrink-0">
                            Total:{' '}
                            <span className={`font-bold ${isPercentageValid ? 'text-success' : 'text-destructive'}`}>
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
                              {/* "Technical round", not "Technical Section" —
                                  the round is what the recruiter switched on
                                  above, and what every other label on this
                                  step calls it. */}
                              {section.name} round
                              <span className="font-bold text-gray-900">{section.percentage}%</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

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
                            <span className="px-1.5 sm:px-2 py-0.5 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 rounded text-xs whitespace-nowrap">Question Bank</span>
                            <span className="px-1.5 sm:px-2 py-0.5 bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20 rounded text-xs whitespace-nowrap">No Timer</span>
                            {!hrEnabled && (
                              <span className="px-1.5 sm:px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-xs whitespace-nowrap">Disabled</span>
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
                            proctoringEnabled ? 'bg-success-subtle text-success' : 'bg-gray-200 text-gray-600'
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

            {/* Right Column - Sidebar.

                STICKY FROM `lg` UP, which is the same breakpoint the row turns
                two-column at — below it the layout stacks and the sidebar
                stays in normal flow, where a pinned panel would only eat the
                screen the form needs.

                `lg:self-start` is what makes it possible at all: a flex item
                stretches to the row's height by default, and an element that
                is already as tall as its container can never stick. Shrinking
                it to its own content height is the same `sticky … self-start`
                pairing the assessment and candidate detail pages use for their
                nav asides.

                It stops on its own at the foot of the row, because a sticky
                element never leaves its containing block — no listener, no
                measured height.

                THE HEIGHT CAP IS NOT DECORATION. This column ends in the
                Save as Draft / Publish card, and a sticky panel taller than
                the scrollport pins its top and pushes its own bottom
                permanently below the fold — the two buttons that end the step
                would have become unreachable on a 768px-tall laptop, which is
                exactly where this column's ~640px lands. Capped and scrolled
                internally instead. The figure is the scrollport minus the
                offsets: 4.5rem header (`h-[72px]` at lg) + 1.5rem top offset +
                1.5rem breathing room at the bottom. Nothing shows while the
                content fits, which is the common case. */}
            <div className="w-full lg:w-80 lg:flex-shrink-0 space-y-4 lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100dvh-7.5rem)] lg:overflow-y-auto">
              {/**
               * What the JD itself decided, on a card of its own ABOVE the
               * duration it feeds.
               *
               * This was a sub-panel at the foot of Assessment Duration, which
               * put the inputs after the figures they produce and buried them
               * in the card they explain. It reads as one row per detected
               * fact - what was detected on the left, the value on the right -
               * so a recruiter checking "did it read my JD correctly" scans one
               * column rather than a run of key/value pairs in small type.
               *
               * Every value is read off the selected JD. Nothing here is
               * entered or editable: this card reports, it does not configure.
               */}
              {selectedJob && (() => {
                const { min: expMin, max: expMax } = getExperienceRange(selectedJob);
                const avgExp = expMax > 0 ? (expMin + expMax) / 2 : expMin;
                /* Read straight off the selected JD, so the card re-derives
                   whenever the recruiter picks a different one - there is no
                   copy of these lists held anywhere in this component. */
                const mustHaveSkills = selectedJob.must_have_skills || [];
                const niceToHaveSkills = selectedJob.nice_to_have_skills || [];
                let level = 'Entry';
                if (avgExp > 10) level = 'Expert';
                else if (avgExp > 7) level = 'Senior';
                else if (avgExp > 4) level = 'Mid';
                else if (avgExp > 2) level = 'Junior';
                /* The JD's own page, the same target the breadcrumb's Job
                   Details crumb and the existing-assessment fallback use, so
                   "View JD" opens what every other route to this JD opens. */
                const jdId = selectedJob.id || preSelectedJobId || urlJdId;

                /* One row per detected fact. Built from a list so a row cannot
                   drift from its neighbours, and each carries the brand colour
                   its subject already uses elsewhere on this page. A fact the
                   JD does not carry is dropped rather than shown empty -
                   `industry_type` is optional on a JD. */
                const facts: Array<{
                  label: string;
                  value: string;
                  Icon: typeof Briefcase;
                  tile: string;
                  iconColor: string;
                  chip: string;
                  /** A skills row carries the skills themselves under its
                   *  header line; the single-value rows leave this unset. */
                  items?: string[];
                }> = [];
                if (selectedJob.industry_type) {
                  facts.push({
                    label: 'Industry',
                    value: selectedJob.industry_type,
                    Icon: Building2,
                    tile: 'bg-brand-cyan/10 ring-1 ring-brand-cyan/15',
                    iconColor: 'text-brand-cyan',
                    chip: 'bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20',
                  });
                }
                facts.push({
                  label: 'Experience',
                  value: `${expMin}-${expMax} yrs (${level})`,
                  Icon: Briefcase,
                  tile: 'bg-brand-blue/10 ring-1 ring-brand-blue/15',
                  iconColor: 'text-brand-blue',
                  chip: 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20',
                });
                /* The JD's two skill groups, each its own row and each naming
                   its own skills. They were one "Skills" row reporting a single
                   count, which could not say which group a skill belonged to -
                   and `Job.skills` it counted is must-have only, so the
                   nice-to-haves were not merely unlabelled but absent.
                   Both rows are always shown, including when a group is empty:
                   "the JD lists none" is the answer a recruiter checking the
                   extraction came for, and a row that vanishes cannot give it. */
                facts.push({
                  label: 'Must Have Skills',
                  value: String(mustHaveSkills.length),
                  items: mustHaveSkills,
                  Icon: Star,
                  tile: 'bg-brand-orange/10 ring-1 ring-brand-orange/15',
                  iconColor: 'text-brand-orange-deep',
                  chip: 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20',
                });
                facts.push({
                  label: 'Nice to Have Skills',
                  value: String(niceToHaveSkills.length),
                  items: niceToHaveSkills,
                  Icon: Star,
                  tile: 'bg-brand-teal/10 ring-1 ring-brand-teal/15',
                  iconColor: 'text-brand-teal',
                  chip: 'bg-brand-teal/10 text-brand-teal ring-1 ring-brand-teal/20',
                });

                return (
                  <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4">
                    {/* Title on the left with the mark that says these values
                        were derived rather than typed; the way to the JD they
                        came from on the right. */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Sparkles className="w-4 h-4 text-brand-blue flex-shrink-0" />
                        <h4 className="font-medium text-gray-900 text-sm tracking-tight truncate">Auto-calculated from JD</h4>
                      </div>
                      {/* Opens the JD in a dialog over this step rather than
                          routing to its page: reading the JD is a check made
                          WHILE configuring, and leaving the flow to make it
                          drops every choice on this screen. The JD's page is
                          still one click away from inside the dialog. */}
                      {jdId && (
                        <Button
                          variant="secondary"
                          size="sm"
                          type="button"
                          onClick={() => setJdFullViewFor({ id: jdId, title: selectedJob.title })}
                          className="flex-shrink-0"
                        >
                          View JD
                          <FileText className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                    <p className="mt-1.5 text-xs text-gray-500 leading-snug">
                      Based on the job description, the following details are detected:
                    </p>

                    <div className="mt-3 space-y-2">
                      {facts.map(fact => (
                        <div
                          key={fact.label}
                          className="p-2 border border-gray-100 rounded-xl bg-white ring-1 ring-black/[0.02]"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${fact.tile}`}>
                              <fact.Icon className={`w-4 h-4 ${fact.iconColor}`} />
                            </div>
                            <span className="min-w-0 flex-1 text-xs text-gray-600 truncate">{fact.label}</span>
                            {/* The value as a chip, so the detected figure is
                                the thing the eye lands on down the right
                                edge. On a skills row that chip is also the way
                                in to the skills themselves — see
                                `JDSkillsReveal` for why they are behind it
                                rather than listed under the row. */}
                            {fact.items && fact.items.length > 0 ? (
                              <ChipsReveal
                                label={fact.label}
                                items={fact.items}
                                chipClassName={`flex-shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold ${fact.chip}`}
                              />
                            ) : (
                              <span className={`flex-shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold ${fact.chip}`}>
                                {fact.value}
                              </span>
                            )}
                          </div>
                          {/* An empty skills group says so in the row itself.
                              A 0 chip with nothing behind it reads as a value
                              still loading, and "the JD lists none" is exactly
                              the answer a recruiter checking the extraction
                              came for. Populated groups say nothing here —
                              their skills are behind the count. */}
                          {fact.items && fact.items.length === 0 && (
                            <div className="mt-2 pl-11">
                              <p className="text-2xs text-gray-500">None listed on this JD.</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Assessment Duration - Fixed 30 min for Technical + Coding */}
              <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4">
                {/* Header. The icon leads, and the heading with its "Fixed at
                    30 minutes" stacks beside it, so the two lines read as one
                    title block instead of the note sitting under the full-width
                    row the icon and heading used to make. */}
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-5 h-5 text-brand-blue" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-medium text-gray-900 text-sm tracking-tight">Assessment Duration</h4>
                    <span className="text-xs text-gray-500 block">Fixed at 30 minutes</span>
                  </div>
                </div>

                {/* The two figures for the assessment as a whole, side by side
                    and split by a rule. They were a stat grid on the Summary
                    card below and the last row of this card's own breakdown -
                    the same "Total Duration" reported twice on one sidebar. It
                    is stated once, here, at the size a headline figure earns,
                    with the per-round breakdown under it. */}
                {/* Uneven columns on purpose: the total carries a unit and the
                    section count is a single digit, so the rule sits off-centre
                    where the wider figure needs the room. The rule is a border
                    on the second cell, so it spans the figures and stops inside
                    the panel's padding rather than cutting it edge to edge. */}
                <div className="mt-3 grid grid-cols-[1.3fr_1fr] bg-slate-50 rounded-xl p-3 sm:p-4">
                  <div className="min-w-0 pr-3">
                    <div className="text-xs text-gray-500 mb-1">Total Duration</div>
                    <div className="text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight">{duration} min</div>
                  </div>
                  <div className="min-w-0 pl-4 border-l border-gray-200">
                    <div className="text-xs text-gray-500 mb-1">Sections</div>
                    <div className="text-xl sm:text-2xl font-semibold text-gray-900 tracking-tight">{enabledSectionsCount}</div>
                  </div>
                </div>

                {(() => {
                  const techSection = sections.find(s => s.name === 'Technical');
                  const codeSection = sections.find(s => s.name === 'Coding');
                  if (!techSection?.enabled && !codeSection?.enabled) return null;
                  /**
                   * One row per timed round, a card each rather than two lines
                   * in a shared panel: the round's own icon and colour, its
                   * name, and its share of the assessment.
                   *
                   * The icon and tile colours are the round's own, the same
                   * ones its card in Assessment Rounds carries, so a row here
                   * is matched to the round it reports by colour alone. Both
                   * rows are the same shape, so one helper draws them.
                   *
                   * ONE LINE, ONE FIGURE. The row used to run two: the round's
                   * minutes and a "(65%)" beside its name on the first, a share
                   * bar and that same 65% under them on the second - the
                   * percentage printed twice, and the minutes restating what a
                   * share of a fixed 30 already says.
                   */
                  const renderDurationRow = (row: {
                    name: string;
                    percentage: number;
                    Icon: typeof Brain;
                    tile: string;
                    iconColor: string;
                  }) => (
                    <div
                      key={row.name}
                      className="flex items-center gap-3 p-2 border border-gray-100 rounded-xl bg-white ring-1 ring-black/[0.02]"
                    >
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${row.tile}`}>
                        <row.Icon className={`w-4 h-4 ${row.iconColor}`} />
                      </div>
                      {/* What the round IS on the left, what it COMES TO on the
                          right: "Technical … 65%". */}
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-gray-600 truncate">{row.name}</div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <div className="text-xs font-bold text-gray-500">{row.percentage}%</div>
                      </div>
                    </div>
                  );
                  return (
                    <div className="mt-3 space-y-2">
                      {techSection?.enabled && renderDurationRow({
                        name: 'Technical round',
                        percentage: techSection.percentage,
                        Icon: Brain,
                        tile: 'bg-brand-cyan/10 ring-1 ring-brand-cyan/15',
                        iconColor: 'text-brand-cyan',
                      })}
                      {codeSection?.enabled && renderDurationRow({
                        name: 'Coding round',
                        percentage: codeSection.percentage,
                        Icon: Code,
                        tile: 'bg-brand-orange/10 ring-1 ring-brand-orange/15',
                        iconColor: 'text-brand-orange-deep',
                      })}
                    </div>
                  );
                })()}
                {/* The card's closing note, on a panel with the icon that
                    marks it as an aside rather than as loose text hanging off
                    the bottom edge. Same words, same colours. */}
                <div className="mt-3 bg-slate-50 rounded-xl p-3 flex items-start gap-2">
                  <Info className="w-4 h-4 text-brand-blue flex-shrink-0 mt-0.5" />
                  <p className="text-2xs text-gray-500 leading-snug">
                    HR questions (from Question Bank) are separate and not timed.
                  </p>
                </div>
              </div>

              {/* Actions. The Total Duration / Sections pair that used to head
                  this card now sits in Assessment Duration above, where the
                  figures it reports are set — so this card is the two buttons
                  that end the step and nothing else.

                  Absent in read-only mode. The fieldset above already makes
                  both buttons non-operable; a preview should not SHOW an
                  action that would change the assessment, so the card goes
                  rather than sitting there greyed out. The sidebar's
                  `space-y-4` closes the gap on its own. */}
              {!readOnly && (
              <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4">
                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => handleGenerateAssessment(true)}
                    disabled={!isPercentageValid || isGenerating}
                    className="flex-1"
                  >
                    {generatingAction === 'draft' ? 'Saving...' : 'Save as Draft'}
                  </Button>
                  {/* Publish from here: the assessment is created and made
                      live by this button, and the Publish Assessment STEP that
                      follows reports it. Because the work happens here, the
                      button carries its own progress — otherwise a recruiter
                      would press it and watch nothing happen while the create
                      and publish calls run. The same two gates still apply. */}
                  <Button
                    variant="primary"
                    onClick={() => handleGenerateAssessment(false)}
                    disabled={!isPercentageValid || !hasValidHRSelection || isGenerating}
                    title={
                      !isPercentageValid
                        ? 'Section percentages must total 100%'
                        : !hasValidHRSelection
                          ? 'Select at least one HR question before publishing'
                          : ''
                    }
                    className="flex-1"
                  >
                    {generatingAction === 'publish' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Publishing...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Publish
                      </>
                    )}
                  </Button>
                </div>
              </div>
              )}
            </div>
          </div>
          </fieldset>
        </div>

        {/* The coding round's LANGUAGE PICKER — the 'enable' and 'edit'
            paths. Which of its two states opens is the JOB ROLE's answer, not
            this page's: `jdCodingLanguages` non-empty is a role that requires
            a coding round, empty is Auto (Not Required). See
            CodingRoundLanguageModal. */}
        {showCodingConfirm && codingPopupMode !== 'disable' && (
          <CodingRoundLanguageModal
            mode={codingPopupMode}
            languages={programmingLanguages}
            jdLanguages={jdCodingLanguages}
            selected={selectedCodingLanguages}
            maxLanguages={MAX_CODING_LANGUAGES}
            onToggle={toggleLanguageSelection}
            onClear={() => setSelectedCodingLanguages([])}
            onCancel={handleCancelCodingAction}
            onConfirm={handleConfirmCodingAction}
          />
        )}

        {/* Disable Coding Round confirmation — a dialog of its own. It asks
            one question and lists what the answer throws away, so it never
            needed the language picker the other two modes are built around. */}
        {showCodingConfirm && codingPopupMode === 'disable' && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6">
            <div className="bg-white rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] max-w-[95vw] sm:max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden">
              {/* Header — a lighter wash than the icon tile (originally
                  red-50 under a red-100 tile), so the tile and its Code mark
                  read as an icon rather than melting into the header. */}
              <div className="flex-shrink-0 bg-destructive-subtle/50 border-b border-destructive-line px-4 sm:px-6 py-3 sm:py-4 rounded-t-xl">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-destructive-subtle rounded-xl flex items-center justify-center flex-shrink-0">
                    <Code className="w-4 h-4 sm:w-5 sm:h-5 text-destructive" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-medium text-gray-900 tracking-tight">
                      Disable Coding Round?
                    </h3>
                    <p className="text-xs sm:text-sm text-destructive">
                      This will remove the coding assessment
                    </p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
                <p className="text-sm sm:text-base text-gray-600 mb-4">
                  Are you sure you want to disable the coding round? The following languages will be removed:
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedCodingLanguages.map(lang => (
                    <span key={lang} className="inline-flex items-center gap-1.5 pl-2 pr-3 py-1.5 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 rounded-full text-sm">
                      {/* Each language's own mark, as on the Coding round card's chips. */}
                      <LanguageLogo language={logoLabelForId(lang, lang)} size="sm" />
                      {lang}
                    </span>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex-shrink-0 bg-slate-50 px-4 sm:px-6 py-3 rounded-b-xl flex flex-col sm:flex-row gap-2 sm:gap-3">
                <Button
                  variant="secondary"
                  onClick={handleCancelCodingAction}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleConfirmCodingAction}
                  className="flex-1"
                >
                  Yes, Disable
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Minimum Round Required Popup */}
        {showMinRoundPopup && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6">
            <div className="bg-white rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] max-w-[95vw] sm:max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden">
              {/* Header */}
              <div className="flex-shrink-0 bg-warning-subtle border-b border-warning-line px-4 sm:px-6 py-3 sm:py-4 rounded-t-xl">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-warning-subtle rounded-xl flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-warning" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-medium text-gray-900 tracking-tight">Cannot Disable Round</h3>
                    <p className="text-xs sm:text-sm text-warning">Minimum requirement not met</p>
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
                <Button
                  variant="primary"
                  onClick={() => setShowMinRoundPopup(false)}
                  className="w-full"
                >
                  Got it
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* The publish confirmation is no longer a modal here — Publish runs
            from this step's own button and hands the flow to
            `step === 'publish'`, which reports the result on a page of its
            own. */}
        {renderAddHRQuizModal()}

        {/* The selected JD in full, opened by "View JD" on the
            Auto-calculated card. The route to the JD's own page it replaced is
            offered from inside the dialog. */}
        {jdFullViewFor && (
          <JDFullViewModal
            jdId={jdFullViewFor.id}
            jdTitle={jdFullViewFor.title}
            onClose={() => setJdFullViewFor(null)}
            /* `from=assessment` keeps the JD page's breadcrumb on this flow —
               Dashboard › Assessments › Select Job Description › Configure
               Assessment › <JD> — instead of resetting to the Job Descriptions
               trail, which would name a path the recruiter never took.

               Not sent when the flow was ENTERED from a JD page: the trail is
               already anchored to that JD (see `buildBreadcrumbItems`), and
               this link goes to the very page that anchor points at, so the
               JD page's own default trail is the correct one there. */
            onOpenFullPage={() =>
              router.push(
                `/recruitment/job-details?id=${encodeURIComponent(jdFullViewFor.id)}${
                  fromJobDetails ? '' : '&from=assessment'
                }`,
              )
            }
          />
        )}

        <UnsavedChangesModal
          isOpen={showUnsavedDialog}
          description="Save your configuration as a draft before leaving?"
          discardLabel="Discard"
          onClose={() => setShowUnsavedDialog(false)}
          onDiscard={() => {
            setShowUnsavedDialog(false);
            const leave = pendingLeaveActionRef.current;
            pendingLeaveActionRef.current = null;
            (leave || onBack)();
          }}
          onSave={() => handleGenerateAssessment(true)}
          isSaving={isGenerating}
        />
          </div>
        </div>
      </div>
    );
  }

  /**
   * Step 3: PUBLISH ASSESSMENT — a page, not a dialog.
   *
   * The confirmation used to be a modal over the Configure step that closed
   * itself after three seconds, taking the page away mid-sentence. It is the
   * end of the flow, so it gets a page of its own: what was published, named,
   * and the ways on from there, left up at the recruiter's pace.
   *
   * ONE state. The step is only ever reached by publishing (Configure's
   * Publish button, which sets `publishedAssessment` and this step together),
   * so it always has a record to report — and the guard below is what keeps
   * that true, since a `?step=publish` URL survives a reload while the record
   * does not. Anything else that once lived here, a pre-publish review of the
   * configuration included, now belongs to the Configure step it was read off.
   */
  if (step === 'publish' && publishedAssessment) {
    /* The same name this step's breadcrumb leaf carries — see
       `publishedAssessmentName`. It was built here from `title` unstripped,
       so a v3 assessment announced itself as "… - Version 3" on the panel
       while every list naming it had dropped the suffix. */
    const assessmentName = publishedAssessmentName();

    /* The JOB this assessment was published for, and WHICH VERSION of it.
       The published record is asked first — `jd_short_id` and `jd_version` are
       the backend's own record of the binding — and the selected JD answers
       for whatever the record leaves out. `selectedJob` is the exact JD
       version the recruiter picked, and its `versionNumber` is the lineage
       version that every JD badge on every other page shows, so the number
       here matches the v6 they were just looking at. */
    const jobIdForPublished = publishedAssessment.jd_short_id || selectedJob?.job_id || '';
    const jobVersionForPublished = publishedAssessment.jd_version ?? selectedJob?.versionNumber;

    return (
      <div className="flex-1 overflow-x-clip bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
            <PageBreadcrumb className="mb-3" items={buildBreadcrumbItems()} />

            {/* PUBLISHED. One centred column on the page's own white surface —
                no card of its own, because a bordered panel inside the page
                panel drew a second frame around the same content. Mark,
                headline, the thing that was published named on a panel of its
                own, then the ways on from here. */}
            <div className="py-4 sm:py-6 text-center">
              {/* The published tick: `SuccessAnimation`, the same component
                  the JD review screen shows when a JD is published — same
                  size, same stroke, same burst, because it is the same tick
                  and not a second drawing of one.

                  It replaces the whole mark rather than sitting inside it: the
                  animation brings its own circle and throws its particles past
                  that circle's edge, so the green disc, its halo ring and the
                  hand-placed confetti that used to be here would each have cut
                  a line through the burst. Its own fallback (the disc-and-tick
                  badge, and the reduced-motion path) comes with it.

                  The margin below is this page's own, untouched. */}
              <div className="flex justify-center mb-4 sm:mb-5">
                <SuccessAnimation />
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight mb-2 sm:mb-3">
                Assessment Published!
              </h2>
              <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-5">
                Your assessment has been successfully published and is now live.
                {fromInviteOrigin && ` Next, send it to the candidates you picked in ${inviteOriginLabel}.`}
              </p>

              {/* Narrower than the page it sits on: the name reads as one
                  line of a form rather than a band across a 1400px card, and
                  the buttons below line up under it. */}
              <div className={`mx-auto mb-5 sm:mb-6 w-full ${fromInviteOrigin ? 'max-w-xl' : 'max-w-3xl'} bg-slate-50 rounded-xl border border-gray-100 ring-1 ring-black/[0.02] px-4 sm:px-5 py-3 sm:py-3.5 flex items-start gap-3 sm:gap-4 text-left`}>
                <div className="w-10 h-10 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-brand-blue" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs sm:text-sm text-gray-500">Assessment</div>
                  <div className="text-sm sm:text-base font-semibold text-gray-900 break-words">
                    {assessmentName}
                  </div>
                  {/* WHAT WAS PUBLISHED, AND AGAINST WHAT.
                      Three separate identities, each named so it cannot be
                      read as another: the job, the job VERSION the assessment
                      was built against, and the assessment's own version. The
                      row carried one bare `v1` chip, which said none of that —
                      and a lone "v1" beside a job the recruiter knows as v6
                      reads as a wrong number rather than as the first
                      assessment of that job, which is what it is. Assessment
                      versions are their own sequence; they do not track the
                      JD's.
                      All three are read off the published record (the job
                      version falls back to the JD version actually selected,
                      which is the same version in the numbering every JD badge
                      shows), and any one of them that the record does not
                      carry is left out rather than guessed at.
                      One wrapped row under the name, not a chip floated to the
                      right edge: the badges then sit on the text's own left
                      margin and stay aligned with it however many of them
                      there are and however narrow the screen. */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {jobIdForPublished && <JobIdBadge>{jobIdForPublished}</JobIdBadge>}
                    {jobVersionForPublished != null && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-gray-700 ring-1 ring-gray-200">
                        Job v{jobVersionForPublished}
                      </span>
                    )}
                    {publishedAssessment.version != null && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">
                        Assessment v{publishedAssessment.version}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* The ways on from here, weighted as the design weights them:
                  two outlined routes in the brand ink and one filled primary,
                  all three the same height and stacked full-width on a phone.
                  Trimmed a step: `px-4 py-2.5` with a 4-unit icon and one text
                  size, rather than `px-5 sm:px-6 py-3` with a 5-unit icon and
                  a size that grew at `sm`. Three buttons of a size the page
                  does not need were the widest thing on it after the
                  headline; one set of paddings across all three also means
                  their heights cannot drift apart at a breakpoint. */}
              {/* Same width as the card above, buttons sharing it equally — so the
                  row lines up edge to edge with the card instead of floating
                  centred under a wider box. */}
              <div className={`mx-auto w-full ${fromInviteOrigin ? 'max-w-xl' : 'max-w-3xl'} flex flex-col sm:flex-row gap-2.5 sm:gap-3 justify-center [&>button]:sm:flex-1 [&>button]:justify-center`}>
                {/* Both of these leave the flow for a real page, so they are
                    gated on the id the publish call returned - without it
                    there is nothing to open. */}
                {publishedAssessment.id && (
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => router.push(`/recruitment/assessments/${publishedAssessment.id}`)}
                    icon={<Eye className="w-4 h-4" />}
                  >
                    View Assessment
                  </Button>
                )}
                {!fromInviteOrigin && publishedAssessment.id && (
                  /* `?share=1` opens the assessment's own Share dialog on
                     arrival, so inviting candidates is one step from here
                     rather than a hunt through the list. */
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => router.push(`/recruitment/assessments/${publishedAssessment.id}?share=1`)}
                    icon={<Share2 className="w-4 h-4" />}
                  >
                    Share Invites
                  </Button>
                )}
                {fromInviteOrigin ? (
                  /* Came from Resume Scoring / AI Talent Match to be able to invite: the one
                     next step is back there, where the invite opens with the
                     candidates already picked. */
                  <Button
                    variant="primary"
                    type="button"
                    onClick={() => router.replace(inviteOriginReturn)}
                    icon={<ArrowRight className="w-4 h-4" />}
                  >
                    {handoffContinueLabel()}
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    type="button"
                    onClick={goToAssessmentsList}
                    icon={<ArrowRight className="w-4 h-4" />}
                  >
                    Go to Assessments
                  </Button>
                )}
              </div>
            </div>
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
      <div className="flex-1 overflow-x-clip bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
            {/* Past the commit point, so the trail is one leaf and the wizard
                steps are not in it — see `buildStepCrumbs`. */}
            <PageBreadcrumb
              className="mb-3"
              items={buildBreadcrumbItems()}
            />
            <div className="w-full">
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center gap-2 sm:gap-3 mb-2">
              <CheckCircle2 className="w-6 h-6 sm:w-8 sm:h-8 text-success flex-shrink-0" />
              <h1 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-900 tracking-tight min-w-0">Assessment Definition Saved Successfully</h1>
            </div>
            <p className="text-sm sm:text-base text-gray-600">
              Your assessment configuration has been saved. Questions will be generated when candidates are assigned.
            </p>
          </div>

          {/* Unique Question Generation Highlight */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-success-line rounded-xl p-4 sm:p-6 mb-4 sm:mb-6">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="p-2 sm:p-3 bg-success rounded-xl flex-shrink-0">
                <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm sm:text-base text-success-strong mb-2 tracking-tight">Unique Question Generation Enabled</h3>
                <p className="text-xs sm:text-sm text-success-strong mb-3">
                  <strong>Each candidate will receive a completely unique set of questions</strong> when they take this assessment. 
                  This ensures fairness, prevents question sharing, and maintains assessment integrity.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-success-strong">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                    <span>Fresh questions generated per candidate</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                    <span>Same difficulty & topic coverage</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                    <span>Prevents answer memorization</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                    <span>Fair & standardized evaluation</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Assessment Summary */}
          <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 sm:p-6 mb-4 sm:mb-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mb-4">
              <h2 className="text-sm sm:text-base lg:text-lg font-semibold text-gray-900 truncate tracking-tight min-w-0 max-w-full">{generatedAssessment?.title}</h2>
              <span className="px-2 py-0.5 bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 rounded text-xs font-semibold flex-shrink-0">
                V{generatedAssessment?.version || 1}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4 sm:mb-6">
              <div className="min-w-0 p-3 sm:p-4 bg-gradient-to-br from-brand-blue/5 to-brand-cyan/5 ring-1 ring-brand-blue/15 rounded-xl">
                <div className="text-xs sm:text-sm text-brand-blue mb-1 font-medium">Duration</div>
                <div className="text-lg sm:text-2xl text-gray-900 font-semibold tracking-tight">{duration} min</div>
              </div>
              <div className="min-w-0 p-3 sm:p-4 bg-success-subtle ring-1 ring-success-line rounded-xl">
                <div className="text-xs sm:text-sm text-success mb-1 font-medium">Sections</div>
                <div className="text-lg sm:text-2xl text-gray-900 font-semibold tracking-tight">{generatedAssessment?.sections.length}</div>
              </div>
              <div className="min-w-0 p-3 sm:p-4 bg-brand-orange/10 ring-1 ring-brand-orange/15 rounded-xl">
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
              <div className="bg-white rounded-xl p-3 sm:p-4 border border-success-line ring-1 ring-success-line">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <Brain className="w-4 h-4 text-brand-cyan" />
                  <Code className="w-4 h-4 text-brand-orange-deep" />
                  <h4 className="text-xs sm:text-sm text-gray-900 font-medium">Technical + Coding</h4>
                  <span className="ml-auto px-2 py-0.5 bg-success-subtle text-success rounded text-xs">
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

            <div className="mt-4 bg-success-subtle border border-success-line rounded-xl p-3">
              <p className="text-sm text-success-strong text-center">
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
                          <span className="px-2 py-0.5 bg-success-subtle text-success rounded text-xs">
                            Scored (0-10 scale)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-start sm:items-end gap-1">
                    <div className="text-xl sm:text-2xl text-brand-blue font-semibold tracking-tight">{section.percentage}%</div>
                    {section.name !== 'HR' && (
                      <span className="text-xs text-success">Counts to PASS/FAIL</span>
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
                      <span key={tidx} className="px-2 sm:px-3 py-1 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 rounded-lg text-xs sm:text-sm max-w-full [overflow-wrap:anywhere]">
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
              Status: <span className={`font-medium ${generatedAssessment?.status === 'Active' ? 'text-success' : 'text-warning'}`}>
                {generatedAssessment?.status === 'Active' ? 'Published' : 'Draft'}
              </span>
            </div>
            <Button
              variant="primary"
              onClick={() => {
                // Let parent handle navigation to avoid double router.push()
                onCreateAssessment(generatedAssessment);
              }}
              className="w-full sm:w-auto"
              icon={<CheckCircle2 className="w-4 h-4" />}
            >
              <span className="hidden sm:inline">Done - Go to Assessments</span>
              <span className="sm:hidden">Done</span>
            </Button>
          </div>

          {renderAddHRQuizModal()}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
});

export default AssessmentCreation;
