'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense, useMemo } from 'react';
import { Loader2, AlertTriangle, XCircle, CreditCard, ShieldX, LogIn } from 'lucide-react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import JDCreation from '@/components/JDCreation';
import { jdService, JDResponse, JDAccessCheckResponse } from '@/lib/services/jdService';
import { getJDUsageModules } from '@/lib/utils/jdUsageModules';

const AI_INTERVIEWS_LIST_VIEW_REDIRECT_KEY = 'ai_interviews_open_list_view';

/** Modules that can send a recruiter into JD creation mid-flow. */
type JDFlowOrigin = 'assessment' | 'ai-interview' | 'resume-scoring';
const JD_FLOW_ORIGINS: JDFlowOrigin[] = ['assessment', 'ai-interview', 'resume-scoring'];
/**
 * Retired key. The origin used to be latched here (and inferred from
 * document.referrer) and was only ever cleared on publish, so one assessment
 * detour re-labelled every later JD the recruiter created in that browser
 * session. Cleared on sight so a value left over from the old build cannot.
 */
const LEGACY_ASSESSMENT_RETURN_KEY = 'jd_return_to_assessments';

/** Read a query param, falling back to the live URL when the hook is still empty. */
function readFlowParam(fromHook: string | null, name: string): string | null {
  if (fromHook) return fromHook;
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name);
}

/**
 * Which module sent the recruiter into JD creation.
 *
 * The URL is the single authority — no `from` param means they came in through
 * Job Descriptions — and `ensureJDCreationUrl` keeps the param across every
 * in-page stage rewrite, so nothing has to be remembered between visits.
 */
function resolveJDFlowOrigin(fromParam: string | null): JDFlowOrigin | null {
  return JD_FLOW_ORIGINS.find((candidate) => candidate === fromParam) ?? null;
}

/**
 * The exact in-flow URL to resume, when the calling module passed one. Only
 * same-site relative paths are accepted so a hand-edited `returnUrl` cannot
 * turn a breadcrumb into an off-site link.
 */
function resolveJDFlowReturnUrl(raw: string | null): string | null {
  if (!raw) return null;
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : null;
}

// Error display component for pre-condition failures
function AccessBlockedError({
  errorCode,
  errorMessage,
  accessCheck,
  onBack
}: {
  errorCode: string;
  errorMessage: string;
  accessCheck?: JDAccessCheckResponse;
  onBack: () => void;
}) {
  const getErrorIcon = () => {
    switch (errorCode) {
      case 'ACCOUNT_SUSPENDED':
        return <XCircle className="w-12 h-12 sm:w-16 sm:h-16 text-red-600" />;
      case 'SUBSCRIPTION_INACTIVE':
        return <CreditCard className="w-12 h-12 sm:w-16 sm:h-16 text-brand-orange-deep" />;
      case 'INSUFFICIENT_UNITS':
        return <CreditCard className="w-12 h-12 sm:w-16 sm:h-16 text-brand-orange-deep" />;
      case 'UNAUTHORIZED':
        return <ShieldX className="w-12 h-12 sm:w-16 sm:h-16 text-brand-orange" />;
      case 'UNAUTHENTICATED':
        return <LogIn className="w-12 h-12 sm:w-16 sm:h-16 text-brand-blue" />;
      case 'JD_IN_USE':
        return <AlertTriangle className="w-12 h-12 sm:w-16 sm:h-16 text-brand-orange-deep" />;
      default:
        return <AlertTriangle className="w-12 h-12 sm:w-16 sm:h-16 text-red-500" />;
    }
  };

  const getErrorTitle = () => {
    switch (errorCode) {
      case 'ACCOUNT_SUSPENDED':
        return 'Account Suspended';
      case 'SUBSCRIPTION_INACTIVE':
        return 'Subscription Inactive';
      case 'INSUFFICIENT_UNITS':
        return 'Insufficient Units';
      case 'UNAUTHORIZED':
        return 'User Not Authorized';
      case 'UNAUTHENTICATED':
        return 'Authentication Required';
      case 'JOB_QUOTA_EXCEEDED':
        return 'Job Quota Exceeded';
      case 'JD_IN_USE':
        return 'Job Description In Use';
      default:
        return 'Access Denied';
    }
  };

  const getActionButton = () => {
    const primaryClass =
      'px-4 sm:px-5 py-2 sm:py-2.5 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors font-medium text-sm';
    const accentClass =
      'px-4 sm:px-5 py-2 sm:py-2.5 bg-brand-orange hover:bg-brand-orange-deep text-white rounded-lg shadow-md shadow-brand-orange/25 ring-1 ring-white/10 transition-colors font-medium text-sm';
    switch (errorCode) {
      case 'ACCOUNT_SUSPENDED':
        return (
          <button onClick={() => window.location.href = 'mailto:support@talentflow.com'} className={primaryClass}>
            Contact Support
          </button>
        );
      case 'SUBSCRIPTION_INACTIVE':
        return (
          <button onClick={() => window.location.href = '/subscription/current-plan'} className={primaryClass}>
            View Subscription
          </button>
        );
      case 'INSUFFICIENT_UNITS':
        return (
          <button onClick={() => window.location.href = '/subscription/usage-quotas'} className={accentClass}>
            View Usage & Buy Units
          </button>
        );
      case 'UNAUTHORIZED':
        return (
          <button onClick={() => window.location.href = 'mailto:support@talentflow.com'} className={accentClass}>
            Contact Admin
          </button>
        );
      case 'UNAUTHENTICATED':
        return (
          <button onClick={() => window.location.href = '/login'} className={primaryClass}>
            Sign In
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-slate-50 p-4 sm:p-8">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-2xl shadow-brand-blue/10 p-5 sm:p-8 text-center">
        <div className="flex justify-center mb-4 sm:mb-6">
          {getErrorIcon()}
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-50 mb-2 sm:mb-3 tracking-tight">
          {getErrorTitle()}
        </h2>
        <p className="text-sm sm:text-base text-gray-600 dark:text-slate-400 mb-4 sm:mb-6">
          {errorMessage}
        </p>

        {/* Show unit details if insufficient units */}
        {errorCode === 'INSUFFICIENT_UNITS' && accessCheck?.units && (
          <div className="bg-brand-blue/[0.04] dark:bg-brand-blue/10 ring-1 ring-brand-blue/15 dark:ring-brand-blue/30 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6 text-left">
            <p className="text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-200 mb-2">Unit Availability:</p>
            <div className="space-y-1 text-sm text-gray-600 dark:text-slate-300">
              <p className={!accessCheck.units.RU?.sufficient ? 'text-red-600 dark:text-red-400 font-medium' : ''}>
                Resume Storage: {accessCheck.units.RU?.available || 0} available {!accessCheck.units.RU?.sufficient && '❌'}
              </p>
              <p className={!accessCheck.units.RS?.sufficient ? 'text-red-600 dark:text-red-400 font-medium' : ''}>
                Resume Scoring: {accessCheck.units.RS?.available || 0} available {!accessCheck.units.RS?.sufficient && '❌'}
              </p>
              <p className={!accessCheck.units.AS?.sufficient ? 'text-red-600 dark:text-red-400 font-medium' : ''}>
                Assessment: {accessCheck.units.AS?.available || 0} available {!accessCheck.units.AS?.sufficient && '❌'}
              </p>
              <p className={!accessCheck.units.AIU?.sufficient ? 'text-red-600 dark:text-red-400 font-medium' : ''}>
                AI Interview: {accessCheck.units.AIU?.available || 0} available {!accessCheck.units.AIU?.sufficient && '❌'}
              </p>
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">
              Required unit types shown above, including AI Interview, are unavailable. Please purchase units to continue.
            </p>
          </div>
        )}

        {/* Show job quota details if exceeded */}
        {errorCode === 'JOB_QUOTA_EXCEEDED' && accessCheck?.job_quota && (
          <div className="bg-brand-blue/[0.04] dark:bg-brand-blue/10 ring-1 ring-brand-blue/15 dark:ring-brand-blue/30 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm font-medium text-gray-700 dark:text-slate-200 mb-2">Job Quota:</p>
            <div className="text-sm text-gray-600 dark:text-slate-300">
              <p>Used: {accessCheck.job_quota.used} / {accessCheck.job_quota.is_unlimited ? '∞' : accessCheck.job_quota.limit}</p>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {getActionButton()}
          <button
            onClick={onBack}
            className="px-4 sm:px-5 py-2 sm:py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg font-medium transition-colors text-sm"
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}

function JDCreationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jdId = searchParams.get('id');
  const stageFromUrl = searchParams.get('stage') as 'create' | 'extract' | 'review' | null;
  // Per-click nonce from "Create JD" (?new=<ts>). Used only to force a fresh
  // remount of the create form so a new JD never resumes the last draft.
  const freshParam = searchParams.get('new');

  // Which module sent the recruiter here — derived from the URL on every
  // render, never latched. The old version remembered "came from assessments"
  // in sessionStorage (and sniffed document.referrer) and only cleared it on
  // publish, so one assessment detour re-labelled every later JD creation in
  // that browser session. The live-URL fallback covers the first client render
  // of a prerendered page, where `useSearchParams()` is still empty and the
  // breadcrumb used to paint the plain Job Descriptions trail before flipping.
  const flowOrigin = useMemo(
    () => resolveJDFlowOrigin(readFlowParam(searchParams.get('from'), 'from')),
    [searchParams]
  );
  const flowReturnUrl = useMemo(
    () => resolveJDFlowReturnUrl(readFlowParam(searchParams.get('returnUrl'), 'returnUrl')),
    [searchParams]
  );
  const fromAiInterview = flowOrigin === 'ai-interview';
  const fromAssessment = flowOrigin === 'assessment';
  const fromResumeScoring = flowOrigin === 'resume-scoring';

  const [editingJD, setEditingJD] = useState<JDResponse | null>(null);
  const [loading, setLoading] = useState(true); // Start with loading true for access check
  const [accessCheck, setAccessCheck] = useState<JDAccessCheckResponse | null>(null);
  const [accessError, setAccessError] = useState<{ code: string; message: string } | null>(null);
  const [isJDInUse, setIsJDInUse] = useState(false);
  const [jdUsageMessage, setJdUsageMessage] = useState<string | undefined>(undefined);

  // Drop the retired latch so a value written by the previous build cannot
  // outlive it. Nothing reads the key any more.
  useEffect(() => {
    try { sessionStorage.removeItem(LEGACY_ASSESSMENT_RETURN_KEY); } catch { /* ignore */ }
  }, []);

  // JD01: Pre-condition validation on page load
  useEffect(() => {
    const checkAccess = async () => {
      try {
        console.log('[JD] Checking access pre-conditions...');
        const result = await jdService.accessCheck();
        console.log('[JD] Access check result:', result);
        setAccessCheck(result);

        if (!result.all_checks_passed) {
          // Set the blocking error
          setAccessError({
            code: result.blocking_error_code || 'ACCESS_DENIED',
            message: result.blocking_error || 'You do not have access to create job descriptions.'
          });
          setLoading(false);
          return;
        }

        // Access granted - now fetch JD if editing
        if (jdId) {
          try {
            const jd = await jdService.get(jdId);
            console.log('[TalentFlow] Loaded JD from database:', {
              id: jd.id,
              title: jd.title,
              creation_stage: jd.creation_stage,
              status: jd.status
            });

            // Check usage status for published JDs - prevent editing if in use
            if (jd.status === 'published') {
              try {
                const usageStatus = await jdService.getUsageStatus(jdId);
                console.log('[TalentFlow] Usage status for JD:', usageStatus);

                if (usageStatus && usageStatus.is_used) {
                  // JD is in use - set flag to show warning and disable editing
                  setIsJDInUse(true);
                  /* Derived from whatever the endpoint reports rather than a
                     hand-listed three — this used to omit AI Interview, so a JD
                     blocked solely by an interview named no module at all. */
                  const usageDetails = getJDUsageModules(usageStatus.usage)
                    .map(module => `${module.name} (${module.count})`)
                    .join(', ');
                  setJdUsageMessage(
                    usageStatus.edit_restriction_reason ||
                    `This job description has been used in: ${usageDetails}. It cannot be modified. Please create a new JD instead.`
                  );
                }
              } catch (usageError) {
                console.error('[TalentFlow] Failed to check usage status:', usageError);
                // Continue if usage check fails - backend will validate on save
              }
            }

            setEditingJD(jd);
          } catch (error) {
            console.error('Failed to fetch JD:', error);
          }
        } else {
          // Fresh "Create JD" (no id) — clear any stale edit state left in the
          // cached route segment so we never resume the previous draft/JD.
          setEditingJD(null);
          setIsJDInUse(false);
          setJdUsageMessage('');
        }
        setLoading(false);
      } catch (error) {
        console.error('[JD] Access check failed:', error);
        // If access check API fails, allow access (fail-open for API errors)
        // The individual JD operations will still be protected
        if (jdId) {
          try {
            const jd = await jdService.get(jdId);
            setEditingJD(jd);
          } catch (fetchError) {
            console.error('Failed to fetch JD:', fetchError);
          }
        } else {
          setEditingJD(null);
          setIsJDInUse(false);
          setJdUsageMessage('');
        }
        setLoading(false);
      }
    };

    checkAccess();
  }, [jdId, freshParam]);

  /**
   * Where the assessment flow resumes — the JD picker the recruiter left.
   * Create Assessment forwards its own URL so the Job Details anchor survives;
   * the bare route is the fallback for older links that carry no `returnUrl`.
   */
  const ASSESSMENT_CREATE_HREF =
    flowReturnUrl?.startsWith('/recruitment/assessments') ? flowReturnUrl : '/recruitment/assessments/create';
  /** Same idea for Resume Scoring: its JD picker, not the JD list. */
  const RESUME_SCORING_JD_SELECTION_HREF =
    flowReturnUrl?.startsWith('/recruitment/resume-scoring') ? flowReturnUrl : '/recruitment/resume-scoring/jd-selection';

  const handleViewAllJobs = () => {
    if (fromAiInterview) {
      router.push('/recruitment/ai-interviews/jd-selection');
      return;
    }
    if (fromResumeScoring) {
      router.push(RESUME_SCORING_JD_SELECTION_HREF);
      return;
    }
    // Entered from Create Assessment: back belongs to that flow, not to the JD
    // list the recruiter never visited.
    //
    // Otherwise this is the button literally labelled "View All Jobs", so ask the
    // list for exactly that (?view=list). Without it the JD list opens on its
    // stat-tile overview — or on the last persisted filter/page — so a recruiter
    // who had just published a JD landed on tiles and could not see it.
    router.push(fromAssessment ? ASSESSMENT_CREATE_HREF : '/recruitment/job-openings?view=list');
  };

  const jdLeafLabel = editingJD ? 'Edit Job Description' : 'Create Job Description';

  // The trail names where the recruiter actually came from. Entering from the
  // assessment flow used to reset it to Dashboard › Job Descriptions, which
  // dropped every crumb back to the half-built assessment.
  const breadcrumbItems = fromAiInterview
    ? [
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'AI Interviews', href: '/recruitment/ai-interviews' },
        { label: 'Select Job Description', href: '/recruitment/ai-interviews/jd-selection' },
      ]
    : fromAssessment
      ? [
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Assessments', href: '/recruitment/assessments' },
          { label: 'Create Assessment', href: ASSESSMENT_CREATE_HREF },
          { label: jdLeafLabel },
        ]
      : fromResumeScoring
        ? [
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Resume Scoring', href: '/recruitment/resume-scoring' },
            { label: 'Select Job Description', href: RESUME_SCORING_JD_SELECTION_HREF },
            { label: jdLeafLabel },
          ]
        : [
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Job Descriptions', href: '/recruitment/job-openings' },
            { label: jdLeafLabel },
          ];

  // Handle successful JD publish. Each entry point returns to the flow it
  // interrupted: AI Interview to its list, Create Assessment and Resume Scoring
  // to their JD pickers — where the JD just published is now selectable, which
  // is the whole reason those flows send people here. (This reverses an earlier
  // decision to leave assessment-initiated publishes on the JD success screen.)
  //
  // The remembered origin is dropped either way: the flow is over, so it must
  // not colour the next JD the recruiter creates.
  const handleJDPublish = () => {
    if (typeof window !== 'undefined') {
      if (fromAiInterview) {
        sessionStorage.setItem(AI_INTERVIEWS_LIST_VIEW_REDIRECT_KEY, 'pending');
      }
    }

    if (fromAiInterview) {
      router.push('/recruitment/ai-interviews');
      return;
    }
    if (fromAssessment) {
      router.push(ASSESSMENT_CREATE_HREF);
      return;
    }
    if (fromResumeScoring) {
      router.push(RESUME_SCORING_JD_SELECTION_HREF);
    }
  };

  // Memoize editingJD to prevent unnecessary re-renders and state resets in JDCreation
  const memoizedEditingJD = useMemo(() => {
    if (!editingJD) return null;
    return {
      id: editingJD.id,
      title: editingJD.title,
      description: editingJD.description,
      status: editingJD.status,
      creation_stage: stageFromUrl || editingJD.creation_stage || 'create',
      creation_method: editingJD.creation_method,
      ai_prompt: editingJD.ai_prompt,
      must_have_skills: editingJD.must_have_skills,
      nice_to_have_skills: editingJD.nice_to_have_skills,
      education_requirements: editingJD.education_requirements,
      experience_min: editingJD.experience_min,
      experience_max: editingJD.experience_max,
      // job_level carries a custom experience value (e.g. "20.5 months") that has
      // no numeric min/max — omitting it here silently cleared the custom
      // experience on edit. Forward it so it round-trips.
      job_level: editingJD.job_level,
      industry_type: editingJD.industry_type,
      // role_family is decided during EXTRACTION so publish can resolve
      // master_role_families by code instead of paying a classification LLM call.
      // If this mapping drops it, the edited JD reverts to role_family=null and
      // publish silently falls back to that call - the field-forwarding failure
      // that previously lost job_level, department and certifications.
      role_family: editingJD.role_family,
      role_family_confidence: editingJD.role_family_confidence,
      department: editingJD.department,
      salary_min: editingJD.salary_min,
      salary_max: editingJD.salary_max,
      salary_currency: editingJD.salary_currency,
      compensation_type: editingJD.compensation_type,
      employment_type: editingJD.employment_type,
      remote_type: editingJD.remote_type,
      assessment_guidance: editingJD.assessment_guidance,
      internal_comments: editingJD.internal_comments,
      must_have_comments: editingJD.must_have_comments,
      nice_to_have_comments: editingJD.nice_to_have_comments,
      // Also forwarded (previously dropped on edit → silent data loss):
      certifications: editingJD.certifications,
      domain_keywords: editingJD.domain_keywords,
      allow_overqualified: editingJD.allow_overqualified,
      job_id: editingJD.job_id,
      current_version: editingJD.current_version,
      locations: editingJD.locations?.map(loc => ({
        city: loc.city || '',
        radius_km: loc.radius_km,
        is_required: loc.is_required,
      })),
    };
  }, [editingJD, stageFromUrl]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
        <span className="ml-3 text-gray-600 dark:text-slate-400">Checking access...</span>
      </div>
    );
  }

  // Show error screen if access is blocked
  if (accessError) {
    return (
      <AccessBlockedError
        errorCode={accessError.code}
        errorMessage={accessError.message}
        accessCheck={accessCheck || undefined}
        onBack={handleViewAllJobs}
      />
    );
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="flex h-[calc(100dvh-64px)] flex-col overflow-hidden bg-slate-50">
        <JDCreation
          // Remount fresh per edit-target / per "Create JD" click so the cached
          // route segment never carries a prior draft's in-progress state.
          key={jdId ?? (freshParam ? `new-${freshParam}` : 'new')}
          onBack={handleViewAllJobs}
          onPublish={handleJDPublish}
          editingJD={memoizedEditingJD}
          isJDInUse={isJDInUse}
          jdUsageMessage={jdUsageMessage}
          breadcrumbItems={breadcrumbItems}
        />
      </div>
    </DndProvider>
  );
}

export default function JDCreationPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
        <span className="ml-3 text-gray-600 dark:text-slate-400">Loading...</span>
      </div>
    }>
      <JDCreationContent />
    </Suspense>
  );
}
