'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense, useMemo } from 'react';
import { ArrowLeft, AlertTriangle, XCircle, CreditCard, ShieldX, LogIn } from 'lucide-react';
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
      case 'USER_NOT_AUTHORIZED':
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
      case 'USER_NOT_AUTHORIZED':
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
      case 'USER_NOT_AUTHORIZED':
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
            className="flex items-center justify-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg font-medium transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}

// Loading skeleton for JD Creation — mirrors the JDCreation shell: the white
// rounded card, breadcrumb, the bordered 4-step indicator box (Create → Extract
// → Review → Publish) and a content area (heading + section cards + footer
// actions). Kept inline (no separate file) so it can't drift from the layout.
function JDCreationSkeleton({ stage }: { stage?: string | null }) {
  // Resolve the current stage from the prop (the loading gate passes it) or,
  // for the Suspense fallback which sits outside useSearchParams, straight off
  // the URL. Each of the four stages (create/extract/review/publish) has a
  // DIFFERENT content layout, so the skeleton below the shared shell (breadcrumb
  // + 4-step indicator) is rendered to match that specific stage — not generic.
  const resolved =
    stage ??
    (typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('stage')
      : null) ??
    'create';

  let content;
  if (resolved === 'extract') {
    // Extract: Pro-tips banner → Must-Have / Nice-to-Have skill lists →
    // experience / industry field cards → footer nav.
    content = (
      <div className="space-y-4 sm:space-y-6">
        <div className="rounded-xl bg-brand-blue/5 ring-1 ring-brand-blue/15 p-3 sm:p-5">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="hidden sm:block h-10 w-10 shrink-0 rounded-lg bg-gray-200 animate-pulse" />
            <div className="grid flex-1 grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-4 w-full rounded bg-gray-100 animate-pulse" />
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="h-5 w-40 rounded bg-gray-200 animate-pulse" />
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 6 }).map((_, j) => (
                  <div key={j} className="h-7 w-20 rounded-full bg-gray-100 animate-pulse" />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-xl border border-gray-200 p-4 space-y-2">
              <div className="h-4 w-28 rounded bg-gray-200 animate-pulse" />
              <div className="h-10 w-full rounded-lg bg-gray-100 animate-pulse" />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between pt-2">
          <div className="h-10 w-28 rounded-lg bg-gray-100 animate-pulse" />
          <div className="h-10 w-36 rounded-lg bg-gray-200 animate-pulse" />
        </div>
      </div>
    );
  } else if (resolved === 'review') {
    // Review: gradient "Review & Publish" header → Final JD document card
    // (header bar + long body) → footer nav.
    content = (
      <div className="space-y-4 sm:space-y-6">
        <div className="rounded-xl bg-brand-blue/10 p-4 sm:p-6 space-y-2">
          <div className="h-7 w-56 max-w-full rounded bg-gray-200 animate-pulse" />
          <div className="h-4 w-96 max-w-full rounded bg-gray-100 animate-pulse" />
        </div>
        <div className="rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-gray-50 px-4 sm:px-6 py-3 sm:py-4">
            <div className="h-5 w-48 rounded bg-gray-200 animate-pulse" />
            <div className="flex gap-2">
              <div className="h-8 w-20 rounded-md bg-gray-100 animate-pulse" />
              <div className="h-8 w-20 rounded-md bg-gray-100 animate-pulse" />
            </div>
          </div>
          <div className="p-4 sm:p-6 space-y-2.5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className={`h-4 rounded bg-gray-100 animate-pulse ${
                  i % 3 === 0 ? 'w-1/3' : i % 4 === 0 ? 'w-2/3' : 'w-full'
                }`}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between pt-2">
          <div className="h-10 w-28 rounded-lg bg-gray-100 animate-pulse" />
          <div className="h-10 w-40 rounded-lg bg-gray-200 animate-pulse" />
        </div>
      </div>
    );
  } else if (resolved === 'publish') {
    // Publish: published-success banner → published document body.
    content = (
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-center gap-4 rounded-xl bg-brand-cyan/10 p-4 sm:p-6">
          <div className="h-12 w-12 shrink-0 rounded-full bg-gray-200 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-6 w-48 rounded bg-gray-200 animate-pulse" />
            <div className="h-4 w-80 max-w-full rounded bg-gray-100 animate-pulse" />
          </div>
          <div className="hidden sm:block h-10 w-32 rounded-lg bg-gray-200 animate-pulse" />
        </div>
        <div className="rounded-xl border border-gray-100 shadow-sm p-4 sm:p-6 space-y-2.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className={`h-4 rounded bg-gray-100 animate-pulse ${i % 3 === 0 ? 'w-1/3' : 'w-full'}`}
            />
          ))}
        </div>
      </div>
    );
  } else {
    // Create (default): two mode-selection cards (AI-Generated / Manual) →
    // input + generate area.
    content = (
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="flex-1 rounded-xl border-2 border-gray-200 p-4 sm:p-6 space-y-3">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="h-6 w-6 rounded bg-gray-200 animate-pulse" />
                <div className="h-5 w-40 rounded bg-gray-200 animate-pulse" />
              </div>
              <div className="h-3.5 w-full rounded bg-gray-100 animate-pulse" />
              <div className="h-3.5 w-4/5 rounded bg-gray-100 animate-pulse" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-gray-200 p-4 sm:p-6 space-y-3">
          <div className="h-4 w-32 rounded bg-gray-200 animate-pulse" />
          <div className="h-11 w-full rounded-lg bg-gray-100 animate-pulse" />
          <div className="h-4 w-40 rounded bg-gray-200 animate-pulse" />
          <div className="h-28 w-full rounded-lg bg-gray-100 animate-pulse" />
          <div className="flex justify-end">
            <div className="h-10 w-36 rounded-lg bg-gray-200 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-x-hidden overflow-y-auto bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px] space-y-4 md:space-y-5">
        <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
          {/* Breadcrumb */}
          <div className="mb-4 sm:mb-5 h-4 w-64 max-w-full rounded bg-gray-200 animate-pulse" />

          {/* 4-step indicator block (shared across all stages) */}
          <div className="mb-4 sm:mb-6 rounded-xl border border-gray-100 bg-gradient-to-br from-slate-50 to-white px-3 py-3 sm:px-5 sm:py-4">
            <div className="overflow-x-auto">
              <div className="flex w-fit min-w-max mx-auto items-center gap-3 sm:gap-4 px-1">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 sm:gap-4">
                    {i > 0 && <div className="w-6 sm:w-12 lg:w-24 h-0.5 rounded-full bg-gray-200" />}
                    <div className="flex items-center gap-2.5">
                      <div className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-full bg-gray-200 animate-pulse" />
                      <div className="hidden sm:block h-4 w-16 rounded bg-gray-200 animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Stage-specific content */}
          {content}
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

  // Which JD this mount is KEYED on (see the `key` prop below). It is not simply
  // `jdId`, because `jdId` appears mid-session: Step 1's extraction saves the new
  // draft and `ensureJDCreationUrl` then attaches `id=` to the URL. Next syncs that
  // `history.replaceState` into `useSearchParams`, so a key of `jdId ?? 'new'` flipped
  // `'new'` -> `<id>` right after `setStep('extract')` and REMOUNTED JDCreation: `step`
  // fell back to its blank `'create'` default and the recruiter saw Step 1 repaint
  // empty, then jump to Step 2 once the parent's re-fetch rehydrated it. The
  // `freshParam` branch only protects the entry points that pass the `?new=` nonce;
  // the sidebar and the `?from=assessment|ai-interview|resume-scoring` entries carry
  // none, and every one of those flickered.
  //
  // So an id that appears while this mount had none is IGNORED for keying - it is this
  // same draft, not a different target. Every OTHER change of `id` still rekeys,
  // because those are real changes of target: entering on one JD's `?id=` and moving to
  // another's, and "Create another JD" (which pushes this same route with no `id` at
  // all and must get a blank form).
  const [keyedJdId, setKeyedJdId] = useState<string>(jdId ?? 'new');
  const [lastSeenJdId, setLastSeenJdId] = useState<string | null>(jdId);
  if (jdId !== lastSeenJdId) {
    const isDraftWeJustCreated = lastSeenJdId === null && jdId !== null;
    setLastSeenJdId(jdId);
    if (!isDraftWeJustCreated) {
      // `blank-after-*` rather than a bare 'new': leaving a saved JD for a blank form
      // has to change the key even when the key was already 'new' (the draft this
      // session created never rekeyed), or the blank form inherits its state.
      setKeyedJdId(jdId ?? `blank-after-${lastSeenJdId}`);
    }
  }

  const [editingJD, setEditingJD] = useState<JDResponse | null>(null);
  const [loading, setLoading] = useState(true); // Start with loading true for access check
  const [accessCheck, setAccessCheck] = useState<JDAccessCheckResponse | null>(null);
  const [accessError, setAccessError] = useState<{ code: string; message: string } | null>(null);
  const [isJDInUse, setIsJDInUse] = useState(false);
  const [jdUsageMessage, setJdUsageMessage] = useState<string | undefined>(undefined);
  /* The job title is the job's identity across its versions. A new version has
     no activity of its own, so it is locked when any OTHER version of the job
     has been used (scored, matched, assessed, interviewed). This version's own
     use already locks the whole editor through isJDInUse. */
  const [isTitleLocked, setIsTitleLocked] = useState(false);
  const [titleLockedMessage, setTitleLockedMessage] = useState<string | undefined>(undefined);

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
        const result = await jdService.accessCheck(jdId || undefined);
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

            let jdInUse = false;
            // Check usage status for published JDs - prevent editing if in use
            if (jd.status === 'published') {
              try {
                const usageStatus = await jdService.getUsageStatus(jdId);
                console.log('[TalentFlow] Usage status for JD:', usageStatus);

                if (usageStatus && usageStatus.is_used) {
                  // JD is in use - set flag to show warning and disable editing
                  jdInUse = true;
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

            // A later version (v2+): lock the title once another version of
            // this job is in use. Checked per version through the same
            // usage-status endpoint the editor lock uses.
            let titleLocked = false;
            if (!jdInUse && (jd.version_number ?? 1) > 1) {
              try {
                const lineage = await jdService.getLineageVersions(jdId);
                const otherVersions = lineage.filter(version => version.id !== jdId);
                const usages = await Promise.all(
                  otherVersions.map(version => jdService.getUsageStatus(version.id).catch(() => null)),
                );
                const moduleTotals = new Map<string, number>();
                usages.forEach(usage => {
                  if (!usage?.is_used) return;
                  titleLocked = true;
                  getJDUsageModules(usage.usage).forEach(module => {
                    moduleTotals.set(module.name, (moduleTotals.get(module.name) ?? 0) + module.count);
                  });
                });
                if (titleLocked) {
                  const details = Array.from(moduleTotals, ([name, count]) => `${name} (${count})`).join(', ');
                  setTitleLockedMessage(
                    `The job title cannot be changed because earlier versions of this job are already in use${details ? `: ${details}` : ''}.`,
                  );
                }
              } catch (lineageError) {
                console.error('[TalentFlow] Failed to check version usage for title lock:', lineageError);
                // Leave the title editable if the check fails, as the editor lock does.
              }
            }
            setIsTitleLocked(titleLocked);
            if (!titleLocked) setTitleLockedMessage(undefined);

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
          setIsTitleLocked(false);
          setTitleLockedMessage(undefined);
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
          setIsTitleLocked(false);
          setTitleLockedMessage(undefined);
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
    // Otherwise this is the button literally labelled "Go to All Jobs", so ask the
    // list for exactly that (?view=list). Without it the JD list opens on its
    // stat-tile overview — or on the last persisted filter/page — so a recruiter
    // who had just published a JD landed on tiles and could not see it.
    router.push(fromAssessment ? ASSESSMENT_CREATE_HREF : '/recruitment/job-openings?view=list');
  };

  /* The breadcrumb leaf names the step the recruiter is actually on, rather than
     saying "Create Job Description" for the whole four-screen flow.

     Seeded from `?stage=` so a refresh mid-flow renders the right crumb on the
     very first paint instead of flashing "Create" — but only SEEDED. The URL is
     kept in sync by `history.replaceState` inside JDCreation, which bypasses the
     Next router on purpose, so `stageFromUrl` never updates as the user moves;
     `onStepChange` below is what keeps this live. The URL also cannot express
     step 4 at all (publishing does not change `?stage=`), which is the other
     reason it can only ever be a seed.

     Step 1 keeps the existing Create/Edit distinction — that is the one screen
     where which of the two you are doing is not otherwise obvious. */
  const [jdDisplayStep, setJdDisplayStep] = useState<1 | 2 | 3 | 4>(
    stageFromUrl === 'review' ? 3 : stageFromUrl === 'extract' ? 2 : 1,
  );

  /* One short word per step. The trail already says "Job Descriptions" one crumb
     up, so repeating it in the leaf ("Create Job Description") only pushed the
     part that actually changes off the end of a narrow bar. */
  /* Editing an EXISTING job: this page was opened on a JD's `?id=` (the Draft
     list's Edit, a resumed or refreshed draft) — what `keyedJdId` records. A
     job created in this session keeps 'new' even after its first save adds
     `id=` to the URL, and "Create another" is `blank-after-*`; both are
     creating. Step 1 then reads Edit, not Create. */
  const isEditingExistingJD = keyedJdId !== 'new' && !keyedJdId.startsWith('blank-after-');
  /* Which workflow this is — from the record and the route, so it survives
     saving a draft, a refresh and back/forward:
       • a version draft is a DRAFT whose lineage version is past v1 (what
         "New Job Version" creates — its own JD row);
       • "New Job Version" opens it with `new_version=1` (the URL syncing in
         JDCreation only rewrites `id` / `stage`, so the marker stays for the
         whole session and a refresh) → NEW VERSION;
       • the same draft reopened later (the Draft list's Edit, no marker) →
         EDIT NEW VERSION;
       • any other existing job (a v1 draft, a published version) → EDIT;
       • otherwise → CREATE. */
  const isVersionDraft = editingJD?.status === 'draft' && (editingJD.version_number ?? 1) > 1;
  const jdWorkflow: 'create' | 'edit' | 'new-version' | 'edit-new-version' = !isEditingExistingJD
    ? 'create'
    : isVersionDraft
      ? (searchParams.get('new_version') === '1' ? 'new-version' : 'edit-new-version')
      : 'edit';
  /* Step 2 is "Extract" — the step indicator's own name for it. It read
     "Edit" here, which put an Edit label on a brand-new job's Create flow. */
  const jdLeafLabel =
    jdDisplayStep === 2 ? 'Extract'
      : jdDisplayStep === 3 ? 'Review'
        : jdDisplayStep === 4 ? 'Publish'
          : jdWorkflow === 'edit' ? 'Edit' : 'Create';
  /* The trail's tail. A version draft names its workflow on every step — the
     leaf on Step 1, then the crumb before each later step's leaf. */
  const versionCrumb = jdWorkflow === 'new-version' ? 'New Version'
    : jdWorkflow === 'edit-new-version' ? 'Edit New Version'
      : null;
  const jdLeafCrumbs: { label: string }[] = versionCrumb
    ? (jdDisplayStep === 1 ? [{ label: versionCrumb }] : [{ label: versionCrumb }, { label: jdLeafLabel }])
    : [{ label: jdLeafLabel }];

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
          { label: 'Create AI Assessment', href: ASSESSMENT_CREATE_HREF },
          ...jdLeafCrumbs,
        ]
      : fromResumeScoring
        ? [
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Resume Scoring', href: '/recruitment/resume-scoring' },
            { label: 'Select Job Description', href: RESUME_SCORING_JD_SELECTION_HREF },
            ...jdLeafCrumbs,
          ]
        : [
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Job Descriptions', href: '/recruitment/job-openings' },
            ...jdLeafCrumbs,
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
      // The Required/Preferred ticks. Step 2 hydrates its four checkboxes from
      // these, and NEITHER mapping forwarded them: every reopen of a JD read
      // `undefined`, fell back to false, and un-ticked all four - silently demoting
      // Essential criteria to Preferred on the next save. The reader was fixed once
      // before (see the hydration block's comment, "read them"); the mappings that
      // feed it were not, so there was nothing to read.
      experience_mandatory: editingJD.experience_mandatory,
      education_mandatory: editingJD.education_mandatory,
      industry_mandatory: editingJD.industry_mandatory,
      location_mandatory: editingJD.location_mandatory,
      // Why the experience tick may be OFF on a JD that states a minimum: the text
      // also invites freshers. Computed server-side on every read; Step 2 uses it to
      // explain the box and to ask before it is ticked back on.
      experience_welcomes_freshers: editingJD.experience_welcomes_freshers,

      // job_level carries a custom experience value (e.g. "20.5 months") that has
      // no numeric min/max — omitting it here silently cleared the custom
      // experience on edit. Forward it so it round-trips.
      job_level: editingJD.job_level,
      industry_type: editingJD.industry_type,
      industry_suggested_name: editingJD.industry_suggested_name,
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
      additional_details: editingJD.additional_details,
      must_have_comments: editingJD.must_have_comments,
      nice_to_have_comments: editingJD.nice_to_have_comments,
      // The skill groups + notes Step 2 shows under each skill. Dropping it here did
      // MORE than hide them: Step 2 hydrates `mergeTrail` from this object, so it fell
      // back to [], and the next save sends `skill_merge_trail: []`, which CLEARS the
      // stored groups. One refresh of Step 2 therefore deleted the provenance for good.
      skill_merge_trail: editingJD.skill_merge_trail,
      // Also forwarded (previously dropped on edit → silent data loss):
      certifications: editingJD.certifications,
      domain_keywords: editingJD.domain_keywords,
      allow_overqualified: editingJD.allow_overqualified,
      job_id: editingJD.job_id,
      current_version: editingJD.current_version,
      // The LINEAGE version (v1, v2, ...) the Review header shows. current_version
      // above is the row's publish count - a new version's own row starts it at 1.
      version_number: editingJD.version_number,
      locations: editingJD.locations?.map(loc => ({
        city: loc.city || '',
        radius_km: loc.radius_km,
        is_required: loc.is_required,
      })),
    };
  }, [editingJD, stageFromUrl]);

  if (loading) {
    return <JDCreationSkeleton stage={stageFromUrl || 'create'} />;
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
          //
          // `freshParam` takes priority over `jdId` here: within one "Create JD"
          // session, `ensureJDCreationUrl` attaches `id=` to the URL for the
          // first time right after Step 1's AI extraction saves the new draft
          // (id was null when this component mounted). If `jdId` won that
          // priority, the key would flip the instant `id=` appeared and remount
          // JDCreation mid-transition — wiping the just-set `step='extract'`
          // state back to its blank, step-1 default for a frame or two before
          // the parent's re-fetch of the freshly-saved JD repopulated it. Since
          // `freshParam` (the per-click nonce from the "Create JD" entry point)
          // never changes for the lifetime of one session, pinning the key to
          // it keeps this same in-progress draft mounted as `id`/`stage` are
          // attached to the URL.
          //
          // The fallback is `keyedJdId`, NOT `jdId` - see its comment above.
          // Entry points without the nonce (the sidebar, `?from=...`) mount with
          // no id at all, and keying on the live `jdId` remounted them the moment
          // the draft was saved. `keyedJdId` ignores that one null -> id change and
          // still changes for every real change of target.
          key={freshParam ? `new-${freshParam}` : keyedJdId}
          onBack={handleViewAllJobs}
          onPublish={handleJDPublish}
          editingJD={memoizedEditingJD}
          jdWorkflow={jdWorkflow}
          isJDInUse={isJDInUse}
          jdUsageMessage={jdUsageMessage}
          isTitleLocked={isTitleLocked}
          titleLockedMessage={titleLockedMessage}
          breadcrumbItems={breadcrumbItems}
          /* `setJdDisplayStep` is a state setter, so its identity is stable —
             passing it directly cannot re-fire the reporting effect inside
             JDCreation on every render. */
          onStepChange={setJdDisplayStep}
        />
      </div>
    </DndProvider>
  );
}

export default function JDCreationPage() {
  return (
    <Suspense fallback={<JDCreationSkeleton />}>
      <JDCreationContent />
    </Suspense>
  );
}
