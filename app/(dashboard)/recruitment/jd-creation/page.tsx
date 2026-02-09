'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense, useMemo } from 'react';
import { Loader2, AlertTriangle, XCircle, CreditCard, ShieldX, LogIn } from 'lucide-react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import JDCreation from '@/components/JDCreation';
import { jdService, JDResponse, JDAccessCheckResponse } from '@/lib/services/jdService';

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
        return <XCircle className="w-16 h-16 text-red-600" />;
      case 'SUBSCRIPTION_INACTIVE':
        return <CreditCard className="w-16 h-16 text-orange-500" />;
      case 'INSUFFICIENT_UNITS':
        return <CreditCard className="w-16 h-16 text-orange-500" />;
      case 'UNAUTHORIZED':
        return <ShieldX className="w-16 h-16 text-yellow-500" />;
      case 'UNAUTHENTICATED':
        return <LogIn className="w-16 h-16 text-blue-500" />;
      case 'JD_IN_USE':
        return <AlertTriangle className="w-16 h-16 text-orange-500" />;
      default:
        return <AlertTriangle className="w-16 h-16 text-red-500" />;
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
    switch (errorCode) {
      case 'ACCOUNT_SUSPENDED':
        return (
          <button
            onClick={() => window.location.href = 'mailto:support@talentflow.com'}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Contact Support
          </button>
        );
      case 'SUBSCRIPTION_INACTIVE':
        return (
          <button
            onClick={() => window.location.href = '/subscription/current-plan'}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            View Subscription
          </button>
        );
      case 'INSUFFICIENT_UNITS':
        return (
          <button
            onClick={() => window.location.href = '/subscription/usage-quotas'}
            className="px-6 py-3 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 transition-colors"
          >
            View Usage & Buy Units
          </button>
        );
      case 'UNAUTHORIZED':
        return (
          <button
            onClick={() => window.location.href = 'mailto:support@talentflow.com'}
            className="px-6 py-3 bg-yellow-600 text-white rounded-lg font-medium hover:bg-yellow-700 transition-colors"
          >
            Contact Admin
          </button>
        );
      case 'UNAUTHENTICATED':
        return (
          <button
            onClick={() => window.location.href = '/login'}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Sign In
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50 p-8">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="flex justify-center mb-6">
          {getErrorIcon()}
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-3">
          {getErrorTitle()}
        </h2>
        <p className="text-gray-600 mb-6">
          {errorMessage}
        </p>

        {/* Show unit details if insufficient units */}
        {errorCode === 'INSUFFICIENT_UNITS' && accessCheck?.units && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm font-medium text-gray-700 mb-2">Unit Availability:</p>
            <div className="space-y-1 text-sm text-gray-600">
              <p className={!accessCheck.units.RU?.sufficient ? 'text-red-600 font-medium' : ''}>
                Resume Upload: {accessCheck.units.RU?.available || 0} available {!accessCheck.units.RU?.sufficient && '❌'}
              </p>
              <p className={!accessCheck.units.RS?.sufficient ? 'text-red-600 font-medium' : ''}>
                Resume Scoring: {accessCheck.units.RS?.available || 0} available {!accessCheck.units.RS?.sufficient && '❌'}
              </p>
              <p className={!accessCheck.units.AS?.sufficient ? 'text-red-600 font-medium' : ''}>
                Assessment: {accessCheck.units.AS?.available || 0} available {!accessCheck.units.AS?.sufficient && '❌'}
              </p>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              All three unit types (Resume Upload, Resume Scoring, Assessment) are empty. Please purchase units to continue.
            </p>
          </div>
        )}

        {/* Show job quota details if exceeded */}
        {errorCode === 'JOB_QUOTA_EXCEEDED' && accessCheck?.job_quota && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm font-medium text-gray-700 mb-2">Job Quota:</p>
            <div className="text-sm text-gray-600">
              <p>Used: {accessCheck.job_quota.used} / {accessCheck.job_quota.is_unlimited ? '∞' : accessCheck.job_quota.limit}</p>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {getActionButton()}
          <button
            onClick={onBack}
            className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
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

  // Check multiple sources to determine if coming from assessments
  const fromUrlParam = searchParams.get('from') === 'assessment';
  const referrerIsAssessments = typeof document !== 'undefined' && document.referrer.includes('/recruitment/assessments');

  // Store/retrieve assessment redirect intent in sessionStorage
  const [fromAssessment, setFromAssessment] = useState(() => {
    if (typeof window === 'undefined') return false;

    // Check URL param first
    if (fromUrlParam) {
      sessionStorage.setItem('jd_return_to_assessments', 'true');
      return true;
    }

    // Check referrer
    if (referrerIsAssessments) {
      sessionStorage.setItem('jd_return_to_assessments', 'true');
      return true;
    }

    // Check sessionStorage for persisted intent
    return sessionStorage.getItem('jd_return_to_assessments') === 'true';
  });

  console.log('[JD-CREATION-PAGE] ========== INITIALIZATION ==========');
  console.log('[JD-CREATION-PAGE] URL:', typeof window !== 'undefined' ? window.location.href : 'N/A');
  console.log('[JD-CREATION-PAGE] from param:', searchParams.get('from'));
  console.log('[JD-CREATION-PAGE] fromUrlParam:', fromUrlParam);
  console.log('[JD-CREATION-PAGE] referrer:', typeof document !== 'undefined' ? document.referrer : 'N/A');
  console.log('[JD-CREATION-PAGE] referrerIsAssessments:', referrerIsAssessments);
  console.log('[JD-CREATION-PAGE] sessionStorage value:', typeof window !== 'undefined' ? sessionStorage.getItem('jd_return_to_assessments') : null);
  console.log('[JD-CREATION-PAGE] finalFromAssessment:', fromAssessment);
  console.log('[JD-CREATION-PAGE] jdId:', jdId);
  console.log('[JD-CREATION-PAGE] stage:', stageFromUrl);
  console.log('[JD-CREATION-PAGE] =======================================');

  const [editingJD, setEditingJD] = useState<JDResponse | null>(null);
  const [loading, setLoading] = useState(true); // Start with loading true for access check
  const [accessCheck, setAccessCheck] = useState<JDAccessCheckResponse | null>(null);
  const [accessError, setAccessError] = useState<{ code: string; message: string } | null>(null);
  const [isJDInUse, setIsJDInUse] = useState(false);
  const [jdUsageMessage, setJdUsageMessage] = useState<string | undefined>(undefined);

  // Monitor URL changes and update fromAssessment if needed
  useEffect(() => {
    const checkFromParam = searchParams.get('from');
    if (checkFromParam === 'assessment' && !fromAssessment) {
      console.log('[JD-CREATION-PAGE] 🔄 Detected from=assessment in URL, updating state');
      sessionStorage.setItem('jd_return_to_assessments', 'true');
      setFromAssessment(true);
    }
  }, [searchParams, fromAssessment]);

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
                  const usageDetails = [
                    usageStatus.usage?.resume_scores_count ? `Resume Scoring (${usageStatus.usage.resume_scores_count})` : '',
                    usageStatus.usage?.assessments_count ? `Assessments (${usageStatus.usage.assessments_count})` : '',
                    usageStatus.usage?.ai_matches_count ? `AI Talent Match (${usageStatus.usage.ai_matches_count})` : ''
                  ].filter(Boolean).join(', ');
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
        }
        setLoading(false);
      }
    };

    checkAccess();
  }, [jdId]);

  const handleViewAllJobs = () => {
    router.push('/recruitment/job-openings');
  };

  // Handle successful JD publish - redirect to assessments page if coming from assessments
  const handleJDPublish = (publishedJD: any) => {
    console.log('[JD-CREATION-PAGE] ==================== PUBLISH CALLBACK ====================');
    console.log('[JD-CREATION-PAGE] fromAssessment state:', fromAssessment);
    console.log('[JD-CREATION-PAGE] URL from param:', searchParams.get('from'));
    console.log('[JD-CREATION-PAGE] sessionStorage:', typeof window !== 'undefined' ? sessionStorage.getItem('jd_return_to_assessments') : null);
    console.log('[JD-CREATION-PAGE] publishedJD:', publishedJD);
    console.log('[JD-CREATION-PAGE] publishedJD.id:', publishedJD?.id);
    console.log('[JD-CREATION-PAGE] publishedJD.title:', publishedJD?.title);

    // FORCE CHECK: Re-check all sources before redirecting
    const shouldRedirect = fromAssessment ||
                          searchParams.get('from') === 'assessment' ||
                          (typeof window !== 'undefined' && sessionStorage.getItem('jd_return_to_assessments') === 'true');

    console.log('[JD-CREATION-PAGE] shouldRedirect:', shouldRedirect);

    if (shouldRedirect) {
      if (publishedJD?.id) {
        const redirectUrl = `/recruitment/assessments?create=true&jd_id=${publishedJD.id}&jd_title=${encodeURIComponent(publishedJD.title || 'New Job')}`;
        console.log('[JD-CREATION-PAGE] ✅ ✅ ✅ REDIRECTING to:', redirectUrl);
        console.log('[JD-CREATION-PAGE] Full URL will be:', window.location.origin + redirectUrl);

        // Clear sessionStorage intent
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('jd_return_to_assessments');
        }

        // Use setTimeout to ensure the redirect happens after React finishes rendering
        setTimeout(() => {
          console.log('[JD-CREATION-PAGE] 🚀 🚀 🚀 EXECUTING NAVIGATION NOW...');
          console.log('[JD-CREATION-PAGE] Calling router.push with:', redirectUrl);
          router.push(redirectUrl);
        }, 100);
      } else {
        console.error('[JD-CREATION-PAGE] ❌ ❌ ❌ Cannot redirect: publishedJD.id is missing!');
      }
    } else {
      console.log('[JD-CREATION-PAGE] ⚠️ ⚠️ ⚠️ Not redirecting - not from assessment page');
      console.log('[JD-CREATION-PAGE] All checks failed:');
      console.log('[JD-CREATION-PAGE]   - fromAssessment state:', fromAssessment);
      console.log('[JD-CREATION-PAGE]   - URL from param:', searchParams.get('from'));
      console.log('[JD-CREATION-PAGE]   - sessionStorage:', typeof window !== 'undefined' ? sessionStorage.getItem('jd_return_to_assessments') : null);
    }
    console.log('[JD-CREATION-PAGE] ==========================================================');
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
      industry_type: editingJD.industry_type,
      salary_min: editingJD.salary_min,
      salary_max: editingJD.salary_max,
      compensation_type: editingJD.compensation_type,
      employment_type: editingJD.employment_type,
      remote_type: editingJD.remote_type,
      assessment_guidance: editingJD.assessment_guidance,
      internal_comments: editingJD.internal_comments,
      must_have_comments: editingJD.must_have_comments,
      nice_to_have_comments: editingJD.nice_to_have_comments,
      allow_overqualified: editingJD.allow_overqualified,
      locations: editingJD.locations?.map(loc => ({
        city: loc.city || '',
        radius_km: loc.radius_km,
        is_required: loc.is_required,
      })),
    };
  }, [editingJD, stageFromUrl]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-800" />
        <span className="ml-3 text-gray-600">Checking access...</span>
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
      <div className="h-[calc(100vh-64px)] overflow-hidden">
        <JDCreation
          onBack={handleViewAllJobs}
          onPublish={handleJDPublish}
          editingJD={memoizedEditingJD}
          isJDInUse={isJDInUse}
          jdUsageMessage={jdUsageMessage}
        />
      </div>
    </DndProvider>
  );
}

export default function JDCreationPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-800" />
        <span className="ml-3 text-gray-600">Loading...</span>
      </div>
    }>
      <JDCreationContent />
    </Suspense>
  );
}
