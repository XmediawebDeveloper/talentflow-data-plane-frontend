'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, AlertTriangle, RefreshCw, CheckCircle, Maximize2, Monitor, Clock, KeyRound, Mail } from 'lucide-react';
import { requestFullscreen, isFullscreen, getFullscreenChangeEvent, exitFullscreen } from '@/lib/utils/browserCompat';
import { toast } from 'sonner';
import { candidateAIInterviewService } from '@/lib/services/candidateAIInterviewService';
import type { CandidateInterviewInfo } from '@/lib/services/candidateAIInterviewService';
import { InterviewUI } from '@/components/ai-interview/InterviewUI';
import { useInterviewFaceVerification } from '@/components/ai-interview/proctoring/InterviewFaceVerification';
import { useInterviewVoiceVerification } from '@/components/ai-interview/proctoring/InterviewVoiceVerification';
import { InterviewEventBus } from '@/components/ai-interview/proctoring/InterviewEventBus';

// Pre-interview step components
import PreInterviewLayout from '@/components/candidate/PreInterviewLayout';
import StepConsent from '@/components/candidate/StepConsent';
import StepIdentity from '@/components/candidate/StepIdentity';
import StepSystemCheck from '@/components/candidate/StepSystemCheck';
import StepIntroVideo from '@/components/candidate/StepIntroVideo';
import StepLanguageSelect from '@/components/candidate/StepLanguageSelect';
import StepSamplePractice from '@/components/candidate/StepSamplePractice';

type Step =
  | 'loading'
  | 'consent'
  | 'identity'
  | 'reauth'          // OTP re-verification on fresh browser session
  | 'system_check'
  | 'intro_video'
  | 'language_select'
  | 'sample_practice'
  | 'fullscreen_prompt'
  | 'interview'
  | 'completed'
  | 'error';

// Static fallbacks (used before interview data loads)
const STEP_NUMBER_WITH_VIDEO: Record<string, number> = {
  consent: 1, identity: 2, system_check: 3,
  intro_video: 4, language_select: 5, sample_practice: 6,
};
const STEP_NUMBER_WITHOUT_VIDEO: Record<string, number> = {
  consent: 1, identity: 2, system_check: 3,
  language_select: 4, sample_practice: 5,
};

const STEP_LABELS_WITH_VIDEO = [
  'Job Details & Consent', 'Identity', 'System Check',
  'Intro Video', 'Language', 'Practice', 'Interview',
];
const STEP_LABELS_WITHOUT_VIDEO = [
  'Job Details & Consent', 'Identity', 'System Check',
  'Language', 'Practice', 'Interview',
];

const PRE_STEPS_WITH_VIDEO: Step[] = [
  'consent', 'identity', 'system_check', 'intro_video', 'language_select', 'sample_practice',
];
const PRE_STEPS_WITHOUT_VIDEO: Step[] = [
  'consent', 'identity', 'system_check', 'language_select', 'sample_practice',
];

interface Props {
  token: string;
}

export function CandidateAIInterviewPortal({ token }: Props) {
  const [step, setStep] = useState<Step>('loading');
  const stepRef = useRef<Step>('loading');
  useEffect(() => { stepRef.current = step; }, [step]);
  const [interview, setInterview] = useState<CandidateInterviewInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isExpiredError, setIsExpiredError] = useState(false);

  // Submitting states
  const [consentSubmitting, setConsentSubmitting] = useState(false);
  const [identitySubmitting, setIdentitySubmitting] = useState(false);
  const [languageSubmitting, setLanguageSubmitting] = useState(false);
  const [startSubmitting, setStartSubmitting] = useState(false);
  const [screenShareDeclined, setScreenShareDeclined] = useState(false);
  // true when candidate stopped screen sharing during the interview
  const [screenShareStopped, setScreenShareStopped] = useState(false);
  const [resharing, setResharing] = useState(false);

  // Language state
  const [availableLanguages, setAvailableLanguages] = useState<string[]>(['English']);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('English');

  // Fullscreen state — tracked during interview for exit-detection overlay
  const [isFullscreenActive, setIsFullscreenActive] = useState(false);

  // Screen recording
  const screenRecorderRef = useRef<MediaRecorder | null>(null);
  const screenChunksRef = useRef<Blob[]>([]);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // Face & voice verification — callbacks emit events via InterviewEventBus
  const faceVerification = useInterviewFaceVerification({
    onFaceMismatch: (distance) => {
      InterviewEventBus.emit('face_mismatch', { distance: distance.toFixed(3) });
    },
    onFaceIdentityChanged: (distance) => {
      InterviewEventBus.emit('face_identity_changed', { distance: distance.toFixed(3) });
    },
  });
  const voiceVerification = useInterviewVoiceVerification({
    onVoiceMismatch: (similarity) => {
      InterviewEventBus.emit('voice_mismatch', { similarity: similarity.toFixed(3) });
    },
    onVoiceIdentityChanged: (similarity) => {
      InterviewEventBus.emit('voice_identity_changed', { similarity: similarity.toFixed(3) });
    },
  });

  // sessionStorage key for this interview's current step
  const SESSION_KEY = `tf_ai_step_${token}`;
  // Steps that aren't tracked by the backend and must be persisted client-side
  const POST_CHECK_STEPS: Step[] = ['intro_video', 'language_select', 'sample_practice', 'fullscreen_prompt'];
  // Session-auth marker — set after OTP verified; cleared when browser is closed (sessionStorage)
  const SESSION_AUTH_KEY = `tf_ai_authed_${token}`;

  // State for the reauth (OTP re-verification) gate
  const [reauthTargetStep, setReauthTargetStep] = useState<Step>('system_check');
  const [reauthOtpSent, setReauthOtpSent] = useState(false);
  const [reauthOtpCode, setReauthOtpCode] = useState('');
  const [reauthOtpVerifying, setReauthOtpVerifying] = useState(false);
  const [reauthOtpSending, setReauthOtpSending] = useState(false);
  const [reauthOtpError, setReauthOtpError] = useState<string | null>(null);
  const [reauthCooldown, setReauthCooldown] = useState(0);
  const reauthCooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load interview info and determine initial step
  const loadInterview = useCallback(async () => {
    if (stepRef.current === 'interview') return;
    try {
      setStep('loading');
      const info = await candidateAIInterviewService.getInterviewInfo(token);
      setInterview(info);

      // Populate available languages from interview config
      if (info.available_languages?.length) {
        setAvailableLanguages(info.available_languages);
        setSelectedLanguage(info.selected_language || info.available_languages[0]);
      }

      // ── 1. Terminal / active states ──
      if (info.status === 'in_progress') {
        sessionStorage.removeItem(SESSION_KEY);
        setStep('interview');
        return;
      }
      if (info.status === 'completed' || info.status === 'cancelled') {
        sessionStorage.removeItem(SESSION_KEY);
        setStep('completed');
        return;
      }
      if (info.status === 'expired') {
        setIsExpiredError(true);
        setStep('error');
        return;
      }

      // ── 2. Progress-based restoration using backend fields ──
      if (!info.consent_accepted_at) {
        setStep('consent');
        return;
      }
      if (!info.identity_verified) {
        setStep('identity');
        return;
      }

      // ── 2b. Session auth gate ──────────────────────────────────────────────
      // identity_verified = true means OTP was done in a PREVIOUS session.
      // When the browser is closed sessionStorage is wiped, so SESSION_AUTH_KEY is gone.
      // Require a fresh OTP before letting the candidate resume at any step.
      const sessionAuthed = sessionStorage.getItem(SESSION_AUTH_KEY) === '1';
      if (!sessionAuthed) {
        // Determine where to send them AFTER they pass OTP
        let targetStep: Step = 'system_check';
        if (info.system_check_passed) {
          const savedStep = sessionStorage.getItem(SESSION_KEY) as Step | null;
          if (savedStep && POST_CHECK_STEPS.includes(savedStep)) {
            targetStep = savedStep;
          } else if (info.introduction_video_url) {
            targetStep = 'intro_video';
          } else if ((info.available_languages?.length ?? 0) > 1 && !info.selected_language) {
            targetStep = 'language_select';
          } else {
            targetStep = 'sample_practice';
          }
        }
        setReauthTargetStep(targetStep);
        setStep('reauth');
        return;
      }
      // ────────────────────────────────────────────────────────────────────────

      if (!info.system_check_passed) {
        setStep('system_check');
        return;
      }

      // ── 3. Post-system-check steps — restore from sessionStorage ──
      const savedStep = sessionStorage.getItem(SESSION_KEY) as Step | null;
      if (savedStep && POST_CHECK_STEPS.includes(savedStep)) {
        // Skip language_select if language already confirmed
        if (savedStep === 'language_select' && info.selected_language) {
          setStep(info.introduction_video_url ? 'intro_video' : 'sample_practice');
          return;
        }
        setStep(savedStep);
        return;
      }

      // ── 4. Default post-check entry point ──
      if (info.introduction_video_url) {
        setStep('intro_video');
      } else if ((info.available_languages?.length ?? 0) > 1 && !info.selected_language) {
        setStep('language_select');
      } else {
        setStep('sample_practice');
      }
    } catch (err: any) {
      // AIU19: HTTP 410 = auto-expired (past scheduled_at) — show specific message, no retry
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail || err?.message || 'Failed to load interview';
      if (status === 410) {
        setIsExpiredError(true);
        setErrorMessage('This interview link has expired and is no longer available.');
      } else {
        setIsExpiredError(false);
        setErrorMessage(detail);
      }
      setStep('error');
    }
  }, [token]);

  useEffect(() => {
    loadInterview();
  }, [loadInterview]);

  // Persist post-check steps to sessionStorage so refresh restores the correct position
  useEffect(() => {
    if (POST_CHECK_STEPS.includes(step as Step)) {
      sessionStorage.setItem(SESSION_KEY, step);
    } else if (step === 'interview' || step === 'completed' || step === 'error') {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }, [step]);

  // Scroll to top on every step transition
  useEffect(() => {
    if (step !== 'loading' && step !== 'interview' && step !== 'completed' && step !== 'error') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [step]);

  // Preload avatar assets when reaching system check
  useEffect(() => {
    if (step === 'system_check') {
      fetch('/talkinghead/talkinghead.mjs').catch(() => {});
      fetch('/models/rpm-recruiter.glb').catch(() => {});
    }
  }, [step]);

  // Stop screen recording and upload (fire-and-forget)
  // Must be declared here (before any early returns) to satisfy Rules of Hooks
  const stopAndUploadScreenRecording = useCallback(() => {
    const recorder = screenRecorderRef.current;
    if (!recorder) return;

    const doUpload = async () => {
      const chunks = screenChunksRef.current;
      if (chunks.length === 0) return;
      const mimeType = (recorder.mimeType || 'video/webm').split(';')[0];
      const blob = new Blob(chunks, { type: mimeType });
      try {
        await candidateAIInterviewService.uploadScreenRecording(token, blob);
      } catch (e) {
        console.warn('[ScreenRecording] Upload failed:', e);
      } finally {
        screenStreamRef.current?.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
        screenRecorderRef.current = null;
      }
    };

    if (recorder.state === 'inactive') {
      doUpload();
    } else {
      recorder.onstop = () => doUpload();
      try { recorder.stop(); } catch { doUpload(); }
    }
  }, [token]);

  // ========== HANDLERS ==========

  const handleConsentAccept = async (consents: {
    consent_video: boolean;
    consent_audio: boolean;
    consent_biometric: boolean;
    consent_ai_analysis: boolean;
    consent_terms: boolean;
  }) => {
    if (consentSubmitting) return;
    setConsentSubmitting(true);
    try {
      const result = await candidateAIInterviewService.recordConsent(token, consents);
      setInterview(result);
      setStep('identity');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to record consent. Please try again.');
    } finally {
      setConsentSubmitting(false);
    }
  };

  const handleIdentityVerify = async (data: {
    name: string;
    email: string;
    candidate_id?: string;
    photo?: Blob;
  }) => {
    if (identitySubmitting) return;
    setIdentitySubmitting(true);
    try {
      const result = await candidateAIInterviewService.verifyIdentity(token, data);
      setInterview(result);
      // Mark this browser session as OTP-authenticated so re-opens don't need re-auth
      sessionStorage.setItem(SESSION_AUTH_KEY, '1');
      // Register face baseline from identity photo — so system check & interview can compare against it.
      // Fire-and-forget: models load in background while user sees system check UI.
      if (data.photo) {
        faceVerification.registerFaceFromBlob(data.photo).catch(() => {});
      }
      setStep('system_check');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to verify identity. Please try again.');
    } finally {
      setIdentitySubmitting(false);
    }
  };

  const handleSystemCheckPassed = () => {
    // Record system check (fire-and-forget)
    candidateAIInterviewService.recordSystemCheck(token, {
      camera: 'granted',
      microphone: 'granted',
      network: 'stable',
      ai_engine: 'ready',
    }).catch(() => {});
    // Skip intro_video step entirely if no video is configured
    if (interview?.introduction_video_url) {
      setStep('intro_video');
    } else {
      setStep('language_select');
    }
  };

  const handleIntroVideoContinue = async () => {
    if (languageSubmitting) return;
    setLanguageSubmitting(true);
    try {
      await candidateAIInterviewService.selectLanguage(token, selectedLanguage);
      setStep('sample_practice');
    } catch {
      // Non-blocking — default to English
      setStep('sample_practice');
    } finally {
      setLanguageSubmitting(false);
    }
  };

  const handleIntroVideoSkip = () => {
    setStep('language_select');
  };

  const handleLanguageContinue = async () => {
    if (languageSubmitting) return;
    setLanguageSubmitting(true);
    try {
      await candidateAIInterviewService.selectLanguage(token, selectedLanguage);
      setStep('sample_practice');
    } catch {
      setStep('sample_practice');
    } finally {
      setLanguageSubmitting(false);
    }
  };

  // Called from StepSamplePractice "Start Interview" button — goes to fullscreen prompt first
  const handleStartInterview = () => {
    setStep('fullscreen_prompt');
  };

  // Called from fullscreen prompt button — handles screen share, fullscreen entry, then starts interview
  const handleFullscreenReady = useCallback(async () => {
    if (startSubmitting) return;
    setStartSubmitting(true);

    // CRITICAL: Create AudioContext in user gesture context
    try {
      const ctx = new AudioContext({ sampleRate: 24000 });
      (window as any).__interviewAudioContext = ctx;
    } catch (e) {
      console.warn('[Portal] Failed to pre-create AudioContext:', e);
    }

    // Step 1: Request screen recording BEFORE entering fullscreen.
    // Browsers (Chrome) exit fullscreen automatically to show the screen-share picker.
    // By requesting screen share first (while not in fullscreen) we avoid a second
    // "Fullscreen Required" popup when the interview step loads.
    try {
      const screenStream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { frameRate: 15, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      screenStreamRef.current = screenStream;
      const screenMime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
        .find(m => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } }) || '';
      const sr = new MediaRecorder(screenStream, {
        ...(screenMime ? { mimeType: screenMime } : {}),
        videoBitsPerSecond: 300_000, // 300 Kbps — sufficient for screen capture
      });
      screenChunksRef.current = [];
      sr.ondataavailable = (e) => { if (e.data.size > 0) screenChunksRef.current.push(e.data); };
      sr.start(5000);
      screenRecorderRef.current = sr;
      // If candidate stops sharing manually — record as severe malpractice and block the interview
      screenStream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (screenRecorderRef.current?.state !== 'inactive') {
          try { screenRecorderRef.current?.stop(); } catch { /* ignore */ }
        }
        screenRecorderRef.current = null;
        screenStreamRef.current = null;
        // Only show the blocking overlay when the interview is actually running
        if (stepRef.current === 'interview') {
          setScreenShareStopped(true);
          // Emit as severe proctoring event
          InterviewEventBus.emit('screen_share_stopped');
          // Report to backend
          candidateAIInterviewService.reportProctorEvent(token, {
            event_type: 'screen_share_stopped',
            severity: 'severe',
            details: { reason: 'candidate_stopped_sharing' },
          }).catch(() => {});
        }
      });
      setScreenShareDeclined(false);
    } catch (e: any) {
      // NotAllowedError / AbortError = user explicitly cancelled the picker — block the interview.
      // Any other error (browser doesn't support getDisplayMedia) = proceed without recording.
      const cancelled = e?.name === 'NotAllowedError' || e?.name === 'AbortError';
      if (cancelled) {
        setScreenShareDeclined(true);
        setStartSubmitting(false);
        return; // do NOT enter fullscreen or start interview
      }
      console.warn('[ScreenRecording] Screen capture not supported on this browser:', e);
    }

    // Step 2: Now enter fullscreen — screen-share picker is already done so no exit/re-entry cycle.
    try { await requestFullscreen(); } catch { /* proceed anyway */ }

    try {
      await candidateAIInterviewService.recordPracticeComplete(token);
      const result = await candidateAIInterviewService.startInterview(token);
      setInterview(result);
      setIsFullscreenActive(isFullscreen());
      setStep('interview');
    } catch (err: any) {
      const detail = err?.response?.data?.detail || 'Failed to start interview';
      if (detail.includes('completed') || detail.includes('cancelled') || detail.includes('expired')) {
        await loadInterview();
      } else {
        toast.error(detail + ' Please try again.');
      }
    } finally {
      setStartSubmitting(false);
    }
  }, [startSubmitting, token]);

  // Fullscreen enforcement during interview
  useEffect(() => {
    if (step !== 'interview') return;
    const eventName = getFullscreenChangeEvent();
    const handleFsChange = () => setIsFullscreenActive(isFullscreen());
    setIsFullscreenActive(isFullscreen());
    document.addEventListener(eventName, handleFsChange);
    return () => {
      document.removeEventListener(eventName, handleFsChange);
      if (isFullscreen()) exitFullscreen().catch(() => {});
    };
  }, [step]);

  // ========== LOADING ==========
  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-gray-600 animate-spin" />
          <p className="text-sm text-gray-500">Loading interview...</p>
        </div>
      </div>
    );
  }

  // ========== COMPLETED ==========
  if (step === 'completed') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4" style={{ colorScheme: 'light' }}>
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Interview Completed</h1>
          <p className="text-gray-600 mb-2">
            Thank you for completing your interview. Your responses have been recorded and are being reviewed.
          </p>
          <p className="text-sm text-gray-500">
            You will be contacted with next steps. You may close this window.
          </p>
        </div>
      </div>
    );
  }

  // ========== ERROR ==========
  if (step === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4" style={{ colorScheme: 'light' }}>
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${isExpiredError ? 'bg-amber-100' : 'bg-red-100'}`}>
            {isExpiredError
              ? <Clock className="w-8 h-8 text-amber-600" />
              : <AlertTriangle className="w-8 h-8 text-red-600" />
            }
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            {isExpiredError ? 'Interview Link Expired' : 'Unable to Load Interview'}
          </h1>
          <p className="text-gray-600 mb-6">{errorMessage || (isExpiredError ? 'This interview link has expired and is no longer available.' : 'An error occurred while loading your interview.')}</p>
          {!isExpiredError && (
            <button
              onClick={loadInterview}
              className="inline-flex items-center gap-2 mx-auto px-6 py-2.5 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-all shadow-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          )}
          {isExpiredError && (
            <p className="text-sm text-gray-500">Please contact the recruiter if you believe this is a mistake.</p>
          )}
        </div>
      </div>
    );
  }

  // ========== REAUTH (OTP re-verification on fresh browser session) ==========
  if (step === 'reauth') {
    const candidateEmail = interview?.candidate_email || '';
    const maskedEmail = candidateEmail.replace(/(.{2})[^@]+(@.+)/, '$1***$2');

    const startReauthCooldown = () => {
      setReauthCooldown(60);
      reauthCooldownRef.current = setInterval(() => {
        setReauthCooldown(prev => {
          if (prev <= 1) { clearInterval(reauthCooldownRef.current!); reauthCooldownRef.current = null; return 0; }
          return prev - 1;
        });
      }, 1000);
    };

    const handleReauthSendOtp = async () => {
      if (reauthOtpSending || reauthCooldown > 0) return;
      setReauthOtpSending(true);
      setReauthOtpError(null);
      try {
        await candidateAIInterviewService.sendOtp(token, candidateEmail);
        setReauthOtpSent(true);
        startReauthCooldown();
      } catch (err: any) {
        setReauthOtpError(err?.response?.data?.detail || 'Failed to send OTP. Please try again.');
      } finally {
        setReauthOtpSending(false);
      }
    };

    const handleReauthVerifyOtp = async () => {
      if (!reauthOtpCode.trim() || reauthOtpVerifying) return;
      setReauthOtpVerifying(true);
      setReauthOtpError(null);
      try {
        const result = await candidateAIInterviewService.verifyOtp(token, candidateEmail, reauthOtpCode.trim());
        if (result.verified) {
          sessionStorage.setItem(SESSION_AUTH_KEY, '1');
          setStep(reauthTargetStep);
        } else {
          setReauthOtpError('Invalid OTP code. Please check and try again.');
        }
      } catch (err: any) {
        setReauthOtpError(err?.response?.data?.detail || 'Verification failed. Please try again.');
      } finally {
        setReauthOtpVerifying(false);
      }
    };

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" style={{ colorScheme: 'light' }}>
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <KeyRound className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">Verify Your Identity</h1>
          <p className="text-sm text-gray-500 mb-6 text-center">
            For security, please verify your email to continue your interview.
          </p>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <Mail className="w-5 h-5 text-gray-400 shrink-0" />
            <div>
              <p className="text-xs text-gray-500">Sending OTP to</p>
              <p className="text-sm font-medium text-gray-800">{maskedEmail}</p>
            </div>
          </div>

          {!reauthOtpSent ? (
            <button
              onClick={handleReauthSendOtp}
              disabled={reauthOtpSending}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-all"
            >
              {reauthOtpSending ? <><Loader2 className="w-4 h-4 animate-spin" />Sending...</> : 'Send OTP'}
            </button>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Enter OTP</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={reauthOtpCode}
                  onChange={(e) => setReauthOtpCode(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleReauthVerifyOtp(); }}
                  placeholder="6-digit code"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-center text-xl font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              {reauthOtpError && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4 shrink-0" />{reauthOtpError}
                </p>
              )}
              <button
                onClick={handleReauthVerifyOtp}
                disabled={reauthOtpVerifying || reauthOtpCode.length < 4}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-all"
              >
                {reauthOtpVerifying ? <><Loader2 className="w-4 h-4 animate-spin" />Verifying...</> : 'Verify & Continue'}
              </button>
              <button
                onClick={handleReauthSendOtp}
                disabled={reauthOtpSending || reauthCooldown > 0}
                className="w-full text-sm text-indigo-600 hover:text-indigo-700 disabled:text-gray-400 py-1"
              >
                {reauthCooldown > 0 ? `Resend OTP in ${reauthCooldown}s` : 'Resend OTP'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ========== FULLSCREEN PROMPT ==========
  if (step === 'fullscreen_prompt') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8 md:p-10">

          {screenShareDeclined ? (
            /* ── Screen share declined — block the interview ── */
            <>
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle className="w-10 h-10 text-red-600" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3 text-center">
                Screen Sharing Required
              </h1>
              <p className="text-gray-600 mb-5 text-center text-sm">
                Screen sharing permission was denied. This is mandatory to ensure a fair and monitored interview.
              </p>
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
                <p className="font-semibold text-red-800 mb-2 text-sm">Why is this required?</p>
                <ul className="space-y-1.5 text-sm text-red-700">
                  <li className="flex items-start gap-2"><span className="mt-0.5">•</span><span>Screen recording prevents proxy interviews and malpractice</span></li>
                  <li className="flex items-start gap-2"><span className="mt-0.5">•</span><span>The recording is reviewed only if a violation is flagged</span></li>
                  <li className="flex items-start gap-2"><span className="mt-0.5">•</span><span>You cannot proceed without granting this permission</span></li>
                </ul>
              </div>
              <button
                onClick={() => { setScreenShareDeclined(false); handleFullscreenReady(); }}
                disabled={startSubmitting}
                className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold py-4 rounded-xl transition-all text-base disabled:opacity-70 disabled:cursor-not-allowed shadow-lg"
              >
                {startSubmitting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" />Requesting Permission...</>
                ) : (
                  <><Monitor className="w-5 h-5" />Allow Screen Sharing &amp; Continue</>
                )}
              </button>
            </>
          ) : (
            /* ── Normal fullscreen prompt ── */
            <>
              <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Monitor className="w-10 h-10 text-indigo-600" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3 text-center">
                Enter Fullscreen Mode
              </h1>
              <p className="text-gray-600 mb-6 text-center text-sm">
                The AI interview requires fullscreen mode and screen sharing to ensure a focused and fair environment.
              </p>
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 mb-6">
                <p className="font-semibold text-indigo-900 mb-3 text-sm">Interview Rules:</p>
                <ul className="space-y-2 text-sm text-indigo-800">
                  <li className="flex items-start gap-2"><span className="text-indigo-500 mt-0.5">✓</span><span>Screen sharing is required to prevent malpractice</span></li>
                  <li className="flex items-start gap-2"><span className="text-indigo-500 mt-0.5">✓</span><span>Browser navigation will be hidden (fullscreen mode)</span></li>
                  <li className="flex items-start gap-2"><span className="text-indigo-500 mt-0.5">✓</span><span>Exiting fullscreen will be flagged as a violation</span></li>
                </ul>
              </div>
              <button
                onClick={() => { handleFullscreenReady(); }}
                disabled={startSubmitting}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 rounded-xl transition-all text-base disabled:opacity-70 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
              >
                {startSubmitting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" />Starting Interview...</>
                ) : (
                  <><Maximize2 className="w-5 h-5" />Share Screen &amp; Start Interview</>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ========== INTERVIEW (live AI interview) ==========
  if (step === 'interview' && interview) {
    // Re-share screen handler — called from screen-share-stopped overlay
    const handleReshareScreen = async () => {
      if (resharing) return;
      setResharing(true);
      try {
        const screenStream = await (navigator.mediaDevices as any).getDisplayMedia({
          video: { frameRate: 15, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        screenStreamRef.current = screenStream;
        const screenMime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
          .find(m => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } }) || '';
        const sr = new MediaRecorder(screenStream, {
          ...(screenMime ? { mimeType: screenMime } : {}),
          videoBitsPerSecond: 300_000,
        });
        screenChunksRef.current = [];
        sr.ondataavailable = (e) => { if (e.data.size > 0) screenChunksRef.current.push(e.data); };
        sr.start(5000);
        screenRecorderRef.current = sr;
        // Re-attach ended listener
        screenStream.getVideoTracks()[0]?.addEventListener('ended', () => {
          if (screenRecorderRef.current?.state !== 'inactive') {
            try { screenRecorderRef.current?.stop(); } catch { /* ignore */ }
          }
          screenRecorderRef.current = null;
          screenStreamRef.current = null;
          if (stepRef.current === 'interview') {
            setScreenShareStopped(true);
            InterviewEventBus.emit('screen_share_stopped');
            candidateAIInterviewService.reportProctorEvent(token, {
              event_type: 'screen_share_stopped',
              severity: 'severe',
              details: { reason: 'candidate_stopped_sharing' },
            }).catch(() => {});
          }
        });
        setScreenShareStopped(false);
      } catch (e: any) {
        // User cancelled re-share — report as additional malpractice
        const cancelled = e?.name === 'NotAllowedError' || e?.name === 'AbortError';
        if (cancelled) {
          InterviewEventBus.emit('screen_share_stopped');
          candidateAIInterviewService.reportProctorEvent(token, {
            event_type: 'screen_share_stopped',
            severity: 'severe',
            details: { reason: 'reshare_declined' },
          }).catch(() => {});
        }
      } finally {
        setResharing(false);
      }
    };

    return (
      <>
        <InterviewUI
          token={token}
          interviewInfo={interview}
          onInterviewComplete={() => {
            stopAndUploadScreenRecording();
            if (isFullscreen()) exitFullscreen().catch(() => {});
            setStep('completed');
          }}
          faceVerification={faceVerification.hasBaseline() ? faceVerification : undefined}
          voiceVerification={voiceVerification.hasBaseline() ? voiceVerification : undefined}
          copyPasteBlocking={interview?.copy_paste_blocking ?? true}
        />
        {/* Screen share stopped — blocking overlay (higher z-index than fullscreen overlay) */}
        {screenShareStopped && (
          <div className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center backdrop-blur-sm">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 text-center shadow-2xl">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Screen Sharing Stopped</h2>
              <p className="text-gray-600 mb-2 text-sm">
                Screen sharing is mandatory throughout the interview. This incident has been recorded as a violation.
              </p>
              <p className="text-sm text-red-600 font-medium mb-6">
                You must re-enable screen sharing to continue.
              </p>
              <button
                onClick={handleReshareScreen}
                disabled={resharing}
                className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-all"
              >
                {resharing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Requesting Permission...</>
                ) : (
                  <><Monitor className="w-4 h-4" />Re-share Screen</>
                )}
              </button>
              <p className="text-xs text-gray-400 mt-4">
                If you continue to decline, the interview will be marked as suspicious.
              </p>
            </div>
          </div>
        )}
        {/* Fullscreen exit overlay — only shown when screen share is active */}
        {!screenShareStopped && !isFullscreenActive && (
          <div className="fixed inset-0 z-[999] bg-black/90 flex items-center justify-center backdrop-blur-sm">
            <div className="bg-white border-2 border-yellow-400 rounded-2xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl">
              <Maximize2 className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-900 mb-2">Fullscreen Required</h2>
              <p className="text-gray-600 mb-6 text-sm">
                Please return to fullscreen mode to continue your AI interview.
              </p>
              <button
                onClick={() => requestFullscreen().catch(() => {})}
                className="w-full px-6 py-3 bg-yellow-500 hover:bg-yellow-600 rounded-xl font-bold text-white transition-colors"
              >
                Return to Fullscreen
              </button>
              <p className="text-xs text-red-500 font-medium animate-pulse mt-4">
                This event has been recorded
              </p>
            </div>
          </div>
        )}
      </>
    );
  }

  // ========== COMPLETED ==========
  if (step === 'completed') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Interview Complete</h1>
          <p className="text-sm text-gray-600">
            Thank you for completing the AI interview. Your responses have been recorded and will be reviewed by the hiring team.
          </p>
          {interview && (
            <div className="mt-6 border border-gray-200 rounded-xl p-4 bg-white text-left shadow-sm">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-gray-500">Position</div>
                  <div className="font-medium text-gray-900">{interview.position}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Candidate</div>
                  <div className="font-medium text-gray-900">{interview.candidate_name}</div>
                </div>
              </div>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-6">You may close this window.</p>
        </div>
      </div>
    );
  }

  // ========== PRE-INTERVIEW STEPS (dynamic based on intro video) ==========
  const hasIntroVideo = !!interview?.introduction_video_url;
  const STEP_NUMBER   = hasIntroVideo ? STEP_NUMBER_WITH_VIDEO   : STEP_NUMBER_WITHOUT_VIDEO;
  const PRE_STEPS     = hasIntroVideo ? PRE_STEPS_WITH_VIDEO      : PRE_STEPS_WITHOUT_VIDEO;
  const stepLabels    = hasIntroVideo ? STEP_LABELS_WITH_VIDEO    : STEP_LABELS_WITHOUT_VIDEO;
  const totalSteps    = stepLabels.length;

  const currentStepNumber = STEP_NUMBER[step] || 1;

  // Navigation helpers
  const goBack = () => {
    const idx = PRE_STEPS.indexOf(step);
    if (idx > 0) setStep(PRE_STEPS[idx - 1]);
  };

  const goNext = () => {
    const idx = PRE_STEPS.indexOf(step);
    if (idx < PRE_STEPS.length - 1) setStep(PRE_STEPS[idx + 1]);
  };

  // Determine layout props based on current step
  const layoutProps = {
    currentStep: currentStepNumber,
    totalSteps,
    stepLabels,
    position: interview?.position || interview?.jd_title || '',
    duration: interview?.duration_minutes,
    showBack: currentStepNumber > 1,
    onBack: goBack,
  };

  // Step 1: Job Details & Consent (merged)
  if (step === 'consent' && interview) {
    return (
      <PreInterviewLayout {...layoutProps} showNext={false} showFooter={false}>
        <StepConsent
          onAccept={handleConsentAccept}
          submitting={consentSubmitting}
          position={interview.position}
          jdTitle={interview.jd_title}
          jdExperienceLevel={interview.jd_experience_level}
          jdDescription={interview.jd_description}
          jdDepartment={interview.jd_department}
          jdLocation={interview.jd_location}
          jdEmploymentType={interview.jd_employment_type}
          jdRemoteType={interview.jd_remote_type}
          jdMustHaveSkills={interview.jd_must_have_skills}
          jdNiceToHaveSkills={interview.jd_nice_to_have_skills}
          jdExperienceMin={interview.jd_experience_min}
          jdExperienceMax={interview.jd_experience_max}
          jdJobLevel={interview.jd_job_level}
          duration={interview.duration_minutes}
          interviewType={interview.interview_type}
          totalQuestions={interview.total_questions}
        />
      </PreInterviewLayout>
    );
  }

  // Step 2: Identity Verification
  if (step === 'identity' && interview) {
    return (
      <PreInterviewLayout {...layoutProps} showNext={false} showFooter={false}>
        <StepIdentity
          token={token}
          candidateName={interview.candidate_name}
          candidateEmail={interview.candidate_email}
          onVerify={handleIdentityVerify}
          submitting={identitySubmitting}
          position={interview.position}
        />
      </PreInterviewLayout>
    );
  }

  // Step 3: System Check
  if (step === 'system_check' && interview) {
    return (
      <PreInterviewLayout {...layoutProps} showNext={false} showFooter={false}>
        <StepSystemCheck
          token={token}
          position={interview.position}
          onAllPassed={handleSystemCheckPassed}
          onRegisterFace={async (video) => {
            // Only register from live video if no baseline was set from the identity photo.
            // This covers the reauth case (browser was closed — identity photo is gone).
            if (faceVerification.hasBaseline()) return true;
            return faceVerification.registerFace(video);
          }}
          onVerifyFace={faceVerification.hasBaseline() ? faceVerification.verifyCurrentFace : undefined}
        />
      </PreInterviewLayout>
    );
  }

  // Step 5: Introduction Video
  if (step === 'intro_video' && interview) {
    return (
      <PreInterviewLayout {...layoutProps} showNext={false} showFooter={false}>
        <StepIntroVideo
          candidateName={interview.candidate_name}
          position={interview.position}
          interviewType={interview.interview_type}
          duration={interview.duration_minutes}
          introductionVideoUrl={interview.introduction_video_url}
          token={token}
          availableLanguages={availableLanguages}
          selectedLanguage={selectedLanguage}
          onSelectLanguage={setSelectedLanguage}
          onContinue={handleIntroVideoContinue}
          onSkip={handleIntroVideoSkip}
          submitting={languageSubmitting}
        />
      </PreInterviewLayout>
    );
  }

  // Step 6: Language Selection
  if (step === 'language_select' && interview) {
    return (
      <PreInterviewLayout {...layoutProps} showNext={false} showFooter={false}>
        <StepLanguageSelect
          availableLanguages={availableLanguages}
          selectedLanguage={selectedLanguage}
          onSelectLanguage={setSelectedLanguage}
          onContinue={handleLanguageContinue}
          submitting={languageSubmitting}
        />
      </PreInterviewLayout>
    );
  }

  // Step 7: Sample Practice & Start
  if (step === 'sample_practice' && interview) {
    return (
      <PreInterviewLayout {...layoutProps} showNext={false} showFooter={false}>
        <StepSamplePractice
          token={token}
          onStartInterview={handleStartInterview}
          onGoBack={goBack}
          selectedLanguage={selectedLanguage}
          submitting={startSubmitting}
          faceVerification={faceVerification.hasBaseline() ? {
            hasBaseline: faceVerification.hasBaseline,
            startVerification: faceVerification.startVerification,
            stopVerification: faceVerification.stopVerification,
          } : undefined}
        />
      </PreInterviewLayout>
    );
  }

  return null;
}
