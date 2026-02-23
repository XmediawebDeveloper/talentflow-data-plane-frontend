'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  candidateService,
  sessionTokenManager,
  AssessmentInfo,
  CurrentQuestion,
  StartAssessmentResponse,
  AssessmentResult,
  SubmitAnswerResponse
} from '@/lib/services/candidateService';
import { LandingScreen } from './LandingScreen';
import { ConsentModal } from './ConsentModal';
import { SystemCheck } from './SystemCheck';
import { AssessmentInterface } from './AssessmentInterface';
import { ResultsScreen } from './ResultsScreen';
import { LoadingScreen } from './LoadingScreen';
import { ErrorScreen } from './ErrorScreen';
import { CompletedScreen } from './CompletedScreen';
import { IdentityVerificationScreen } from './IdentityVerificationScreen';
import { useRefreshPrevention } from '@/hooks/useRefreshPrevention';
import { useProctoringMonitor, ProctoringWarning } from '@/hooks/useProctoringMonitor';
import { ProctoringWarningModal, useProctoringWarnings } from './ProctoringWarningModal';
import { Monitor, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getUserMedia, getErrorMessage, detectBrowser } from '@/lib/utils/browserCompat';

// ============================================
// FULLSCREEN PROMPT SCREEN COMPONENT - COMMENTED OUT (NOT NEEDED)
// ============================================

// DISABLED: Fullscreen requirement removed - assessments run in normal mode now
/*
interface FullscreenPromptScreenProps {
  onFullscreenReady: () => void;
}

function FullscreenPromptScreen({ onFullscreenReady }: FullscreenPromptScreenProps) {
  const [isEnteringFullscreen, setIsEnteringFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enterFullscreenAndStart = async () => {
    setIsEnteringFullscreen(true);
    setError(null);

    try {
      if (!document.fullscreenElement) {
        // Request fullscreen — navigationUI option omitted for broad browser compatibility
        try {
          await document.documentElement.requestFullscreen();
          await new Promise(resolve => setTimeout(resolve, 300));
          console.log('[FULLSCREEN] Entered fullscreen mode');
        } catch (fsErr) {
          // Permissions check failed (iframe, browser policy, etc.) — proceed without fullscreen
          console.warn('[FULLSCREEN] Could not enter fullscreen, proceeding anyway:', fsErr);
        }
      }
      // Start the assessment regardless of fullscreen outcome
      onFullscreenReady();
    } catch (err) {
      console.error('[FULLSCREEN] Unexpected error:', err);
      // Still start — fullscreen is best-effort
      onFullscreenReady();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8 md:p-12">
        <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Monitor className="w-12 h-12 text-blue-600" />
        </div>

        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4 text-center">
          Enter Fullscreen Mode
        </h1>

        <p className="text-lg text-gray-600 mb-8 text-center">
          This assessment requires fullscreen mode to prevent distractions and ensure a fair testing environment.
          Click the button below to enter fullscreen and begin your assessment.
        </p>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8">
          <p className="font-semibold text-blue-900 mb-3">Fullscreen Assessment Benefits:</p>
          <ul className="space-y-2 text-blue-800">
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-1">✓</span>
              <span>Hides browser tabs & navigation (like F11)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-1">✓</span>
              <span>Full-screen immersive experience</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-1">✓</span>
              <span>Eliminates external distractions</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-1">✓</span>
              <span>Provides fair testing environment</span>
            </li>
          </ul>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <Button
          onClick={enterFullscreenAndStart}
          disabled={isEnteringFullscreen}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-6 text-xl font-semibold rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
        >
          {isEnteringFullscreen ? (
            <>
              <Loader2 className="w-6 h-6 mr-3 animate-spin" />
              Entering Fullscreen...
            </>
          ) : (
            <>
              <Monitor className="w-6 h-6 mr-3" />
              Enter Fullscreen & Start Assessment
            </>
          )}
        </Button>

        <p className="text-sm text-gray-500 mt-6 text-center">
          Fullscreen mode will remain active during the assessment. Exiting fullscreen will be tracked as a violation.
          After 3 violations, your assessment will be auto-submitted.
        </p>
      </div>
    </div>
  );
}
*/

type AssessmentStep =
  | 'loading'
  | 'error'
  // | 'identity_verification'  // DISABLED: Identity verification removed - candidates can directly attend
  | 'landing'
  | 'consent'
  | 'system_check'
  // | 'fullscreen_prompt'  // DISABLED: Fullscreen requirement removed
  | 'generating_questions'
  | 'assessment'
  | 'completing'
  | 'completed'  // NEW: Shows completion message immediately
  | 'results';

interface CandidateAssessmentPortalProps {
  token: string;
  candidateName?: string;
  role?: string;
}

export function CandidateAssessmentPortal({ token, candidateName, role }: CandidateAssessmentPortalProps) {
  // State
  const [step, setStep] = useState<AssessmentStep>('loading');
  const [error, setError] = useState<string | null>(null);
  const [assessmentInfo, setAssessmentInfo] = useState<AssessmentInfo | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<CurrentQuestion | null>(null);
  const [assessmentData, setAssessmentData] = useState<StartAssessmentResponse | null>(null);
  const [results, setResults] = useState<AssessmentResult | null>(null);
  const [progress, setProgress] = useState({ answered: 0, total: 0, percent: 0 });
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  // Proctoring warnings state
  const { warnings, addWarning, dismissWarning } = useProctoringWarnings();

  // Stable callback for proctoring warnings (prevents re-renders)
  const handleProctoringWarning = useCallback((warning: ProctoringWarning) => {
    console.log('[PROCTORING] Warning:', warning.type, warning.message);
    addWarning(warning);
  }, [addWarning]);

  // Refs for proctoring
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // ============================================
  // CRITICAL REFS FOR BUG PREVENTION
  // ============================================

  // Ref to track current step (avoids stale closure issues)
  const stepRef = useRef<AssessmentStep>('loading');

  // Ref to track if assessment flow is active (blocks loadAssessmentInfo)
  const isFlowActiveRef = useRef(false);

  // Ref to track if we're in the process of starting assessment
  const isStartingRef = useRef(false);

  // Ref to track if component is mounted (prevents state updates after unmount)
  const isMountedRef = useRef(true);

  // ============================================
  // SYNC STEP STATE WITH REF
  // ============================================

  // Custom setStep that updates both state and ref
  const setStepSafe = useCallback((newStep: AssessmentStep) => {
    if (!isMountedRef.current) {
      console.log('[DEBUG] Ignoring setStep - component unmounted');
      return;
    }

    // ✅ SAFARI FIX: Only update if step actually changed to prevent history.replaceState() spam
    if (stepRef.current === newStep) {
      console.log('[DEBUG] Ignoring setStep - step unchanged:', newStep);
      return;
    }

    console.log('[DEBUG] Setting step:', stepRef.current, '->', newStep);
    stepRef.current = newStep;
    setStep(newStep);
  }, []);

  // Enable refresh prevention during active assessment (includes completing but not completed)
  const isAssessmentActive = step === 'assessment' || step === 'completing';
  // Proctoring should stop when assessment is completed
  const isProctoringActive = step === 'assessment';

  // Fullscreen state for pre-assessment fullscreen prompt
  const [isReadyToStart, setIsReadyToStart] = useState(false);

  useRefreshPrevention({
    enabled: isAssessmentActive,
    message: 'You have an ongoing assessment. Leaving this page will end your session.',
    onAttempt: (type) => {
      console.log(`[PROCTORING] Blocked ${type} attempt during assessment`);
    },
  });

  // Advanced proctoring monitoring (voice detection, camera obstruction, etc.)
  // Only active during actual assessment, stops when completed
  const { state: proctoringState } = useProctoringMonitor({
    token,
    stream: cameraStream,
    enabled: isProctoringActive,
    onWarning: handleProctoringWarning,
    voiceDetectionSensitivity: 50,
    obstructionThreshold: 30,
  });

  // ============================================
  // LIFECYCLE EFFECTS
  // ============================================

  // Track step changes and manage refs
  useEffect(() => {
    console.log('[DEBUG] Step changed to:', step);
    stepRef.current = step;

    // Reset flags when reaching terminal states or assessment
    if (step === 'assessment') {
      console.log('[DEBUG] Step is assessment - resetting isStartingRef');
      isStartingRef.current = false;
    }

    // Mark flow as inactive when reaching terminal states
    if (step === 'completed' || step === 'results' || step === 'error') {
      console.log('[DEBUG] Reached terminal state - resetting isFlowActiveRef');
      isFlowActiveRef.current = false;
    }
  }, [step]);

  // Component mount/unmount tracking
  useEffect(() => {
    isMountedRef.current = true;
    console.log('[DEBUG] Component mounted');

    return () => {
      isMountedRef.current = false;
      console.log('[DEBUG] Component unmounting');
      // Cleanup heartbeat and media streams
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Load assessment info on mount
  useEffect(() => {
    console.log('[DEBUG] Mount effect triggered - calling loadAssessmentInfo');
    loadAssessmentInfo();
  }, [token]);

  // Setup proctoring when assessment starts, stop when completed
  useEffect(() => {
    if (step === 'assessment') {
      startProctoring();
    } else if (step === 'completing' || step === 'completed' || step === 'results') {
      // Explicitly stop proctoring when assessment ends
      stopProctoring();
      console.log('[PROCTORING] Stopped - assessment ended');
    }
    return () => {
      stopProctoring();
    };
  }, [step]);

  // ============================================
  // LOAD ASSESSMENT INFO - WITH MULTIPLE GUARDS
  // ============================================

  const loadAssessmentInfo = async () => {
    // GUARD 1: Check if flow is active (using ref for reliable check)
    if (isFlowActiveRef.current) {
      console.log('[DEBUG] BLOCKED loadAssessmentInfo - flow is active (isFlowActiveRef)');
      return;
    }

    // GUARD 2: Check if assessment is being started
    if (isStartingRef.current) {
      console.log('[DEBUG] BLOCKED loadAssessmentInfo - assessment is being started (isStartingRef)');
      return;
    }

    // GUARD 3: Check current step using REF (not state - avoids stale closure)
    const currentStep = stepRef.current;
    const activeFlowSteps: AssessmentStep[] = [
      // 'identity_verification',  // DISABLED: Identity verification removed
      'system_check',
      'generating_questions',
      'assessment',
      'completing',
      'completed'
    ];

    if (activeFlowSteps.includes(currentStep)) {
      console.log('[DEBUG] BLOCKED loadAssessmentInfo - currently in active step:', currentStep);
      return;
    }

    console.log('[DEBUG] loadAssessmentInfo ALLOWED - current step:', currentStep);

    // Ensure session token context is set BEFORE any API calls (critical for page refresh recovery)
    sessionTokenManager.setAssessmentToken(token);
    const existingSessionToken = sessionTokenManager.getToken(token);
    if (existingSessionToken) {
      console.log('[DEBUG] Session token found in storage - will be sent with API requests');
    }

    try {
      setStepSafe('loading');
      const info = await candidateService.getAssessmentInfo(token, candidateName, role);

      if (!isMountedRef.current) return;

      console.log('[DEBUG] Assessment info received:', {
        attempt_status: info.attempt_status,
        can_resume: info.can_resume,
        can_start: info.can_start,
        consent_accepted: info.consent_accepted,
        attempt_id: info.attempt_id
      });
      setAssessmentInfo(info);

      // DISABLED: Identity verification removed - candidates can directly attend
      // const isIdentityVerified = sessionStorage.getItem(`identity_verified_${token}`) === 'true';

      // Determine initial step based on status
      if (info.attempt_status === 'completed') {
        console.log('[DEBUG] Attempt status is COMPLETED');
        // Already completed - show completed screen or results
        try {
          const resultData = await candidateService.getResults(token);
          if (!isMountedRef.current) return;

          if (resultData && resultData.overall_score !== undefined && !isNaN(resultData.overall_score)) {
            setResults(resultData);
            setStepSafe('results');
          } else {
            // Results not ready - show completed screen
            setStepSafe('completed');
          }
        } catch {
          // Results not ready - show completed screen
          if (isMountedRef.current) {
            setStepSafe('completed');
          }
        }
      // DISABLED: Identity verification removed - candidates can directly attend
      // } else if (!isIdentityVerified) {
      //   // Identity not verified - require verification first
      //   console.log('[DEBUG] Identity not verified - showing verification screen');
      //   setStepSafe('identity_verification');
      } else if (info.can_resume) {
        // Can resume existing attempt
        console.log('[DEBUG] Can resume - fetching current question');
        try {
          const question = await candidateService.getCurrentQuestion(token);
          if (!isMountedRef.current) return;

          setCurrentQuestion(question);
          setProgress({
            answered: question.question_number - 1,
            total: question.total_questions,
            percent: Math.round(((question.question_number - 1) / question.total_questions) * 100)
          });
          setStepSafe('assessment');
        } catch (resumeError: any) {
          console.log('[DEBUG] Error resuming assessment:', resumeError);
          const errorMsg = resumeError?.response?.data?.detail || resumeError?.message || '';

          // Handle time expired - auto-complete the assessment
          if (errorMsg.toLowerCase().includes('time expired')) {
            console.log('[DEBUG] Assessment time expired - completing assessment');
            try {
              // Try to complete the assessment and get results
              const result = await candidateService.completeAssessment(token);
              if (!isMountedRef.current) return;
              setResults(result);
              setStepSafe('completed');
            } catch (completeError) {
              console.log('[DEBUG] Could not complete - trying to get results directly');
              try {
                const result = await candidateService.getResults(token);
                if (!isMountedRef.current) return;
                setResults(result);
                setStepSafe('completed');
              } catch {
                // Show time expired message
                setError('Your assessment time has expired. Your answers have been saved and are being evaluated.');
                setStepSafe('error');
              }
            }
            return;
          }

          // Re-throw other errors to be handled by outer catch
          throw resumeError;
        }
      } else if (!info.consent_accepted) {
        // Need to accept consent FIRST
        setStepSafe('consent');
      } else if (info.can_start) {
        // Consent accepted, show landing/preview
        setStepSafe('landing');
      } else {
        // Cannot start (expired, etc)
        setError(info.message || 'This assessment is not available');
        setStepSafe('error');
      }
    } catch (err) {
      if (isMountedRef.current) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load assessment';
        // Handle duplicate session error with user-friendly message
        if (errorMessage === 'DUPLICATE_SESSION') {
          setError('This assessment is already open in another tab or browser. Please use the original tab to continue your assessment. Only one active session is allowed.');
        } else {
          setError(errorMessage);
        }
        setStepSafe('error');
      }
    }
  };

  // ============================================
  // ASSESSMENT FLOW HANDLERS
  // ============================================

  const handleBeginClick = async () => {
    // Mark flow as active IMMEDIATELY
    isFlowActiveRef.current = true;
    console.log('[DEBUG] handleBeginClick - marking flow as active');

    try {
      // Trigger question generation in background BEFORE system check
      console.log('[PORTAL] Triggering background question generation...');
      const prepareResponse = await candidateService.prepareAssessment(token);
      console.log('[PORTAL] Prepare response:', prepareResponse);
      console.log('[PORTAL] Question generation started successfully, proceeding to system check');

      // Proceed to system check while questions generate in parallel
      setStepSafe('system_check');
    } catch (err) {
      console.error('[PORTAL] ERROR: Failed to prepare assessment:', err);
      console.error('[PORTAL] Error details:', err instanceof Error ? err.message : String(err));
      // Still proceed to system check - fallback will handle it
      console.log('[PORTAL] Proceeding to system check anyway - fallback will trigger prepare later');
      setStepSafe('system_check');
    }
  };

  // DISABLED: Identity verification removed - candidates can directly attend
  // const handleIdentityVerified = () => {
  //   // Identity verified successfully - proceed to consent or next step
  //   console.log('[DEBUG] Identity verified, proceeding to next step');
  //
  //   if (!assessmentInfo?.consent_accepted) {
  //     // Need to accept consent
  //     setStepSafe('consent');
  //   } else if (assessmentInfo?.can_start) {
  //     // Consent already accepted, show landing
  //     setStepSafe('landing');
  //   } else if (assessmentInfo?.can_resume) {
  //     // Can resume assessment directly
  //     loadAssessmentInfo();
  //   }
  // };

  const handleConsentAccept = async () => {
    try {
      await candidateService.acceptConsent(token);
      setAssessmentInfo(prev => prev ? { ...prev, consent_accepted: true } : null);
      // After consent accepted, show landing/preview page
      setStepSafe('landing');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to accept consent';
      // Handle session already active error with user-friendly message
      if (errorMessage === 'SESSION_ALREADY_ACTIVE') {
        setError('This assessment is already open in another browser or device. Only one active session is allowed. Please close the other session and try again.');
      } else {
        setError(errorMessage);
      }
      setStepSafe('error');
    }
  };

  const handleSystemCheckComplete = async (existingStream?: MediaStream) => {
    console.log('[DEBUG] handleSystemCheckComplete started');

    // If SystemCheck passed us a stream, validate it before use
    if (existingStream) {
      console.log('[PORTAL] Received camera stream from SystemCheck');

      const videoTrack = existingStream.getVideoTracks()[0];
      const audioTrack = existingStream.getAudioTracks()[0];

      const isVideoLive = videoTrack && videoTrack.readyState === 'live';
      const isAudioLive = audioTrack && audioTrack.readyState === 'live';

      console.log('[PORTAL] Stream health check:', {
        hasStream: !!existingStream,
        videoTrack: videoTrack ? videoTrack.readyState : 'none',
        audioTrack: audioTrack ? audioTrack.readyState : 'none',
        isVideoLive,
        isAudioLive
      });

      if (isVideoLive) {
        console.log('[PORTAL] Stream is healthy - keeping it alive');
        streamRef.current = existingStream;
        setCameraStream(existingStream);

        if (videoRef.current) {
          videoRef.current.srcObject = existingStream;
        }
      } else {
        console.warn('[PORTAL] Stream appears stale (video track not live) - assessment will re-request camera if needed');
        // Still store it but assessment component will likely need to re-request
        streamRef.current = existingStream;
        setCameraStream(existingStream);
      }
    }

    // DISABLED: Fullscreen requirement removed - start assessment directly
    console.log('[PORTAL] System check complete, starting assessment directly (no fullscreen)...');
    setIsReadyToStart(true);
    // Directly call the start handler instead of showing fullscreen prompt
    handleFullscreenReady();
  };

  // NEW: Handler for when user enters fullscreen and is ready to start
  const handleFullscreenReady = async () => {
    console.log('[DEBUG] handleFullscreenReady started - user is in fullscreen');

    // Set BOTH flags to prevent ANY interference
    isStartingRef.current = true;
    isFlowActiveRef.current = true;
    console.log('[DEBUG] Set isStartingRef=true, isFlowActiveRef=true');

    try {
      // Check if questions are already ready (from parallel generation)
      console.log('[PORTAL] System check complete, checking if questions are ready...');
      const status = await candidateService.getGenerationStatus(token);
      console.log('[PORTAL] Generation status:', status);

      if (status.status === 'ready' && status.questions_ready) {
        // Questions are ready! Start immediately
        console.log('[PORTAL] Questions ready, starting assessment immediately');
        setStepSafe('generating_questions'); // Brief loading state

        console.log('[DEBUG] Calling startAssessment API...');
        const response = await candidateService.startAssessment(token);

        if (!isMountedRef.current) return;

        console.log('[DEBUG] startAssessment response:', response);
        setAssessmentData(response);

        if (!response.first_question || response.total_questions === 0) {
          console.log('[DEBUG] No first question or 0 total questions - auto-refreshing page');
          // Auto-refresh page instead of showing error for better UX
          window.location.reload();
          return;
        }

        setCurrentQuestion(response.first_question);
        setProgress({
          answered: 0,
          total: response.total_questions,
          percent: 0
        });

        console.log('[DEBUG] Setting step to assessment');
        setStepSafe('assessment');
        // isStartingRef will be reset in useEffect when step becomes 'assessment'

      } else if (status.status === 'generating') {
        // Still generating - show loading and poll until ready
        console.log('[PORTAL] Questions still generating, waiting...');
        setStepSafe('generating_questions');

        // Poll for completion with auto-retry on failure
        const pollForReady = async () => {
          let hasRetriedGeneration = false;  // Track if we've already retried

          for (let i = 0; i < 45; i++) {  // Max 90 seconds (45 * 2s) - increased from 60s
            if (!isMountedRef.current) return;

            await new Promise(resolve => setTimeout(resolve, 2000));
            const checkStatus = await candidateService.getGenerationStatus(token);

            if (checkStatus.status === 'ready' && checkStatus.questions_ready) {
              console.log('[PORTAL] Questions now ready!');
              const response = await candidateService.startAssessment(token);

              if (!isMountedRef.current) return;

              setAssessmentData(response);

              if (!response.first_question || response.total_questions === 0) {
                console.log('[PORTAL] No questions found after polling - auto-refreshing page');
                // Auto-refresh page instead of showing error for better UX
                window.location.reload();
                return;
              }

              setCurrentQuestion(response.first_question);
              setProgress({
                answered: 0,
                total: response.total_questions,
                percent: 0
              });

              setStepSafe('assessment');
              return;
            } else if (checkStatus.status === 'failed') {
              // Auto-retry once on generation failure
              if (!hasRetriedGeneration) {
                console.log('[PORTAL] Generation failed, triggering auto-retry...');
                hasRetriedGeneration = true;
                try {
                  await candidateService.prepareAssessment(token);
                  console.log('[PORTAL] Auto-retry triggered, continuing to poll...');
                  // Continue polling - don't exit loop
                  continue;
                } catch (retryErr) {
                  console.error('[PORTAL] Auto-retry failed:', retryErr);
                }
              }
              // Auto-refresh page instead of showing error
              console.log('[PORTAL] Generation failed after retry - auto-refreshing page');
              window.location.reload();
              return;
            }
          }

          // Timeout - try starting anyway (fallback)
          console.log('[PORTAL] Generation timeout, trying to start anyway');
          try {
            const response = await candidateService.startAssessment(token);

            if (!isMountedRef.current) return;

            setAssessmentData(response);
            if (response.first_question) {
              setCurrentQuestion(response.first_question);
              setProgress({ answered: 0, total: response.total_questions, percent: 0 });
              setStepSafe('assessment');
            } else {
              // Auto-refresh page instead of showing error
              console.log('[PORTAL] Timeout with no questions - auto-refreshing page');
              window.location.reload();
            }
          } catch (err) {
            if (isMountedRef.current) {
              const errorMessage = err instanceof Error ? err.message : '';
              // Keep SESSION_ALREADY_ACTIVE error visible (security issue)
              if (errorMessage === 'SESSION_ALREADY_ACTIVE') {
                setError('This assessment is already open in another browser or device. Please close the other session and try again. Only one active session is allowed per assessment.');
                setStepSafe('error');
                isStartingRef.current = false;
                isFlowActiveRef.current = false;
              } else {
                // Auto-refresh for other errors
                console.log('[PORTAL] Timeout error - auto-refreshing page');
                window.location.reload();
              }
            }
          }
        };

        pollForReady();
      } else {
        // Not started or failed - trigger generation now (fallback flow)
        console.log('[PORTAL] Generation not started, triggering prepare now...');
        setStepSafe('generating_questions');

        try {
          // Call prepare to trigger background generation
          console.log('[PORTAL] Calling prepareAssessment as fallback...');
          await candidateService.prepareAssessment(token);
          console.log('[PORTAL] Prepare called, waiting for generation...');

          // Wait for generation to complete
          await new Promise(resolve => setTimeout(resolve, 2000)); // Give it 2 seconds to start

          // Now poll for ready
          for (let i = 0; i < 45; i++) {
            if (!isMountedRef.current) return;

            await new Promise(resolve => setTimeout(resolve, 2000));
            const checkStatus = await candidateService.getGenerationStatus(token);

            if (checkStatus.status === 'ready' && checkStatus.questions_ready) {
              console.log('[PORTAL] Questions ready after fallback prepare!');
              const response = await candidateService.startAssessment(token);

              if (!isMountedRef.current) return;

              setAssessmentData(response);

              if (!response.first_question || response.total_questions === 0) {
                console.log('[PORTAL] No questions after fallback - auto-refreshing page');
                window.location.reload();
                return;
              }

              setCurrentQuestion(response.first_question);
              setProgress({
                answered: 0,
                total: response.total_questions,
                percent: 0
              });

              setStepSafe('assessment');
              return;
            }
          }

          // Timeout after polling
          console.log('[PORTAL] Fallback generation timeout - auto-refreshing page');
          window.location.reload();

        } catch (prepareErr) {
          console.error('[PORTAL] Prepare fallback failed:', prepareErr);
          // Last resort - try to start anyway
          try {
            const response = await candidateService.startAssessment(token);
            if (!isMountedRef.current) return;
            setAssessmentData(response);

            if (response.first_question && response.total_questions > 0) {
              setCurrentQuestion(response.first_question);
              setProgress({ answered: 0, total: response.total_questions, percent: 0 });
              setStepSafe('assessment');
            } else {
              console.log('[PORTAL] Last resort failed - auto-refreshing page');
              window.location.reload();
            }
          } catch (startErr) {
            console.error('[PORTAL] Start fallback also failed:', startErr);
            window.location.reload();
          }
        }
      }
    } catch (err) {
      // Detect browser for error messaging
      const getBrowserInfo = () => {
        if (typeof navigator === 'undefined') return 'Unknown';
        const ua = navigator.userAgent.toLowerCase();
        return ua.includes('firefox') ? 'Firefox'
            : ua.includes('safari') && !ua.includes('chrome') ? 'Safari'
            : /iphone|ipad|ipod/.test(ua) ? 'iOS Safari'
            : ua.includes('arc') ? 'Arc'
            : ua.includes('brave') ? 'Brave'
            : ua.includes('edg') ? 'Edge'
            : ua.includes('chrome') ? 'Chrome'
            : 'Unknown';
      };

      const browser = getBrowserInfo();

      console.error('[PORTAL] Error in handleSystemCheckComplete:', {
        error: err,
        message: err instanceof Error ? err.message : 'unknown',
        stack: err instanceof Error ? err.stack : undefined,
        browser,
        streamState: streamRef.current ? {
          hasVideo: streamRef.current.getVideoTracks().length > 0,
          hasAudio: streamRef.current.getAudioTracks().length > 0,
          videoLive: streamRef.current.getVideoTracks()[0]?.readyState === 'live',
          audioLive: streamRef.current.getAudioTracks()[0]?.readyState === 'live'
        } : 'no stream'
      });

      if (isMountedRef.current) {
        // Handle session already active error with user-friendly message
        let errorMessage = err instanceof Error ? err.message : 'Failed to start assessment';

        if (errorMessage === 'SESSION_ALREADY_ACTIVE') {
          errorMessage = 'This assessment is already open in another browser or device. Please close the other session and try again. Only one active session is allowed per assessment.';
        } else if (errorMessage.includes('Network error') || errorMessage.includes('Connection error')) {
          // Add browser-specific hints for network errors
          if (browser === 'Firefox') {
            errorMessage += '\n\nFirefox Tip: Check if Enhanced Tracking Protection is blocking the connection (shield icon in address bar).';
          } else if (browser === 'Safari' || browser === 'iOS Safari') {
            errorMessage += '\n\nSafari Tip: Check if "Prevent Cross-Site Tracking" is enabled in Settings.';
          }
        }

        setError(errorMessage);
        setStepSafe('error');
        isStartingRef.current = false;
        isFlowActiveRef.current = false;
      }
    }
  };

  const handleAnswerSubmit = async (
    questionId: string,
    answer: {
      text_response?: string;
      video_response_url?: string;
      selected_options?: string[];
      code_submission?: string;
      language?: string;
      is_draft?: boolean;  // True = draft (auto-save, editable), False = submitted (locked)
    }
  ): Promise<SubmitAnswerResponse> => {
    const response = await candidateService.submitAnswer(token, questionId, answer);

    setProgress({
      answered: response.progress.answered,
      total: response.progress.total,
      percent: response.progress.percent
    });

    // Don't auto-navigate when saving draft - let the component handle navigation
    // Only update currentQuestion if backend returns next_question AND it's not a draft save
    if (response.next_question && answer.is_draft === false) {
      setCurrentQuestion(response.next_question);
    }

    return response;
  };

  // ============================================
  // COMPLETION HANDLER - NEW FLOW
  // ============================================

  const handleCompleteAssessment = async () => {
    try {
      console.log('[DEBUG] handleCompleteAssessment called');
      setStepSafe('completing');

      // Call complete endpoint to trigger scoring in background
      try {
        await candidateService.completeAssessment(token);
        console.log('[DEBUG] completeAssessment API called successfully');
      } catch (err) {
        // Ignore if already completed - scoring will still run
        console.log('[DEBUG] completeAssessment error (may be already completed):', err);
      }

      // IMMEDIATELY show completed screen - NO waiting for scoring
      // Scoring runs in background on the server
      console.log('[DEBUG] Showing completed screen immediately');
      setStepSafe('completed');

      // Reset flow active flag since we're done
      isFlowActiveRef.current = false;

    } catch (err) {
      console.error('[PORTAL] Error in handleCompleteAssessment:', err);
      setError(err instanceof Error ? err.message : 'Failed to complete assessment');
      setStepSafe('error');
      isFlowActiveRef.current = false;
    }
  };

  const handleNavigateToQuestion = async (questionNumber: number) => {
    try {
      const question = await candidateService.getCurrentQuestion(token, questionNumber);
      setCurrentQuestion(question);
    } catch (err) {
      console.error('Failed to navigate to question:', err);
    }
  };

  // ============================================
  // PROCTORING FUNCTIONS
  // ============================================

  const startProctoring = async () => {
    // Initialize camera stream for video monitoring
    // The useProctoringMonitor hook handles all event detection (copy, paste, tab switch, voice, etc.)

    // Check if we already have a stream from SystemCheck (prevents black screen gap)
    if (streamRef.current && streamRef.current.active) {
      console.log('[PROCTORING] Reusing existing camera stream from SystemCheck - no black screen!');
      setCameraStream(streamRef.current);

      if (videoRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
    } else {
      // No existing stream - request a new one (fallback)
      console.log('[PROCTORING] No existing stream - requesting new camera access');
      try {
        const stream = await getUserMedia({
          video: true,
          audio: true
        });
        streamRef.current = stream;
        setCameraStream(stream);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        console.log('[PROCTORING] Camera stream initialized successfully');
      } catch (err) {
        console.error('[PROCTORING] Failed to initialize camera:', err);
      }
    }

    // Start heartbeat for session keepalive
    heartbeatRef.current = setInterval(async () => {
      try {
        await candidateService.sendHeartbeat(token);
      } catch (err) {
        console.error('Heartbeat failed:', err);
      }
    }, 30000);

    console.log('[PROCTORING] Advanced monitoring active via useProctoringMonitor hook');
  };

  const stopProctoring = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraStream(null);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }

    console.log('[PROCTORING] Monitoring stopped');
  };

  // ============================================
  // RENDER
  // ============================================

  // Render the main content based on step
  const renderContent = () => {
    switch (step) {
      case 'loading':
        return <LoadingScreen message="Loading assessment..." />;

      case 'error':
        return (
          <ErrorScreen
            message={error || 'An error occurred'}
            onRetry={() => {
            // Reset all flags before retry
            isFlowActiveRef.current = false;
            isStartingRef.current = false;
            loadAssessmentInfo();
          }}
        />
      );

      // DISABLED: Identity verification removed - candidates can directly attend
      // case 'identity_verification':
      //   return (
      //     <IdentityVerificationScreen
      //       token={token}
      //       onVerified={handleIdentityVerified}
      //     />
      //   );

    case 'landing':
      return (
        <LandingScreen
          assessmentInfo={assessmentInfo!}
          onBegin={handleBeginClick}
        />
      );

    case 'consent':
      return (
        <ConsentModal
          assessmentInfo={assessmentInfo!}
          onAccept={handleConsentAccept}
          onDecline={() => {
            setError('You must accept the terms and conditions to proceed with the assessment.');
            setStepSafe('error');
          }}
        />
      );

    case 'system_check':
      return (
        <SystemCheck
          token={token}
          onComplete={handleSystemCheckComplete}
          onBack={() => {
            isFlowActiveRef.current = false;
            setStepSafe('landing');
          }}
        />
      );

    // DISABLED: Fullscreen prompt removed - assessments run in normal mode
    // case 'fullscreen_prompt':
    //   return <FullscreenPromptScreen onFullscreenReady={handleFullscreenReady} />;

    case 'generating_questions':
      return (
        <LoadingScreen
          message="Preparing your assessment..."
          subMessage="Please wait while we prepare your personalized assessment. This may take a moment."
        />
      );

    case 'assessment':
      if (!currentQuestion) {
        return (
          <LoadingScreen
            message="Loading question..."
            subMessage="Please wait while we fetch the next question."
          />
        );
      }
      return (
        <AssessmentInterface
          token={token}
          assessmentInfo={assessmentInfo!}
          currentQuestion={currentQuestion}
          progress={progress}
          rounds={assessmentData?.rounds || []}
          startedAt={assessmentData?.started_at || assessmentInfo?.attempt_started_at || new Date().toISOString()}
          durationMinutes={assessmentInfo?.duration_minutes || 30}
          onAnswerSubmit={handleAnswerSubmit}
          onComplete={handleCompleteAssessment}
          onNavigate={handleNavigateToQuestion}
          videoRef={videoRef}
          stream={cameraStream}
          isCameraActive={proctoringState.isCameraActive}
          isMicrophoneActive={proctoringState.isMicrophoneActive}
        />
      );

    case 'completing':
      return (
        <LoadingScreen
          message="Submitting your assessment..."
          subMessage="Please wait..."
        />
      );

    case 'completed':
      // NEW: Show completion message - scoring runs in background
      return (
        <CompletedScreen
          assessmentTitle={assessmentInfo?.assessment_title}
          candidateName={assessmentInfo?.candidate_name}
        />
      );

    case 'results':
      return (
        <ResultsScreen
          results={results!}
          assessmentInfo={assessmentInfo!}
        />
      );

      default:
        return <LoadingScreen message="Loading..." />;
    }
  };

  return (
    <>
      {renderContent()}
      {/* Proctoring Warning Modal - shows warnings for violations */}
      <ProctoringWarningModal
        warnings={warnings}
        onDismiss={dismissWarning}
        autoDismissDelay={5000}
      />
    </>
  );
}
