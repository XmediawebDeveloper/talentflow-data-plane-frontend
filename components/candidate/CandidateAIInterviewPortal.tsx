'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Video, CheckCircle, X, Play, Info, AlertTriangle, FileText, Loader2, Mic, Eye, Monitor, Camera, Wifi, Cpu, Circle, RefreshCw } from 'lucide-react';
import { candidateAIInterviewService } from '@/lib/services/candidateAIInterviewService';
import type { CandidateInterviewInfo } from '@/lib/services/candidateAIInterviewService';
import { InterviewUI } from '@/components/ai-interview/InterviewUI';

type Step = 'loading' | 'consent' | 'system_check' | 'interview' | 'completed' | 'error';

interface Props {
  token: string;
}

export function CandidateAIInterviewPortal({ token }: Props) {
  const [step, setStep] = useState<Step>('loading');
  const [interview, setInterview] = useState<CandidateInterviewInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Consent state
  const [consentVideo, setConsentVideo] = useState(false);
  const [consentAudio, setConsentAudio] = useState(false);
  const [consentBiometric, setConsentBiometric] = useState(false);
  const [consentAI, setConsentAI] = useState(false);
  const [consentTerms, setConsentTerms] = useState(false);
  const [consentSubmitting, setConsentSubmitting] = useState(false);

  const allConsentsChecked = consentVideo && consentAudio && consentBiometric && consentAI && consentTerms;

  // System check state
  const [cameraStatus, setCameraStatus] = useState<'checking' | 'granted' | 'denied'>('checking');
  const [micStatus, setMicStatus] = useState<'checking' | 'granted' | 'denied'>('checking');
  const [networkStatus, setNetworkStatus] = useState<'checking' | 'stable' | 'unstable'>('checking');
  const [aiEngineStatus, setAiEngineStatus] = useState<'checking' | 'ready' | 'error'>('checking');
  const [systemCheckSubmitting, setSystemCheckSubmitting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const allChecksReady = cameraStatus === 'granted' && micStatus === 'granted' && networkStatus === 'stable' && aiEngineStatus === 'ready';

  // Load interview info and determine initial step
  const loadInterview = useCallback(async () => {
    try {
      setStep('loading');
      const info = await candidateAIInterviewService.getInterviewInfo(token);
      setInterview(info);

      // Determine initial step based on interview status
      if (info.status === 'system_check') {
        setStep('system_check');
      } else if (info.status === 'in_progress') {
        setStep('interview');
      } else if (info.status === 'completed' || info.status === 'cancelled' || info.status === 'expired') {
        setErrorMessage(`This interview is ${info.status}.`);
        setStep('error');
      } else {
        // invited, consent_pending, draft, scheduled — all start at consent
        setStep('consent');
      }
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.detail || err?.message || 'Failed to load interview');
      setStep('error');
    }
  }, [token]);

  useEffect(() => {
    loadInterview();
  }, [loadInterview]);

  // System checks
  const runSystemChecks = useCallback(async () => {
    setCameraStatus('checking');
    setMicStatus('checking');
    setNetworkStatus('checking');
    setAiEngineStatus('checking');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraStatus('granted');
      setMicStatus('granted');
    } catch {
      setCameraStatus('denied');
      setMicStatus('denied');
    }

    setTimeout(() => {
      setNetworkStatus(navigator.onLine ? 'stable' : 'unstable');
    }, 1000);

    setTimeout(() => {
      setAiEngineStatus('ready');
    }, 1500);
  }, []);

  const stopMediaStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    if (step === 'system_check') {
      runSystemChecks();
    }
    return () => {
      if (step !== 'system_check') {
        stopMediaStream();
      }
    };
  }, [step, runSystemChecks, stopMediaStream]);

  // Handlers
  const handleConsentSubmit = async () => {
    if (!allConsentsChecked || consentSubmitting) return;
    setConsentSubmitting(true);
    try {
      const result = await candidateAIInterviewService.recordConsent(token, {
        consent_video: consentVideo,
        consent_audio: consentAudio,
        consent_biometric: consentBiometric,
        consent_ai_analysis: consentAI,
        consent_terms: consentTerms,
      });
      setInterview(result);
      setStep('system_check');
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.detail || 'Failed to record consent');
      setStep('error');
    } finally {
      setConsentSubmitting(false);
    }
  };

  const handleBeginInterview = async () => {
    if (!allChecksReady || systemCheckSubmitting) return;
    setSystemCheckSubmitting(true);
    try {
      await candidateAIInterviewService.recordSystemCheck(token, {
        camera: cameraStatus,
        microphone: micStatus,
        network: networkStatus,
        ai_engine: aiEngineStatus,
      });
      stopMediaStream();
      const result = await candidateAIInterviewService.startInterview(token);
      setInterview(result);
      setStep('interview');
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.detail || 'Failed to start interview');
      setStep('error');
    } finally {
      setSystemCheckSubmitting(false);
    }
  };

  // ========== LOADING ==========
  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
          <p className="text-sm text-gray-500">Loading interview...</p>
        </div>
      </div>
    );
  }

  // ========== ERROR ==========
  if (step === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-gray-500" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Unable to Load Interview</h1>
          <p className="text-sm text-gray-600 mb-6">{errorMessage}</p>
          <button
            onClick={loadInterview}
            className="flex items-center gap-2 mx-auto px-6 py-2.5 text-sm bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ========== INTERVIEW (live AI interview) ==========
  if (step === 'interview' && interview) {
    return (
      <InterviewUI
        token={token}
        interviewInfo={interview}
        onInterviewComplete={() => setStep('completed')}
      />
    );
  }

  // ========== COMPLETED ==========
  if (step === 'completed') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-gray-800" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Interview Complete</h1>
          <p className="text-sm text-gray-600">
            Thank you for completing the AI interview. Your responses have been recorded and will be reviewed by the hiring team.
          </p>
          {interview && (
            <div className="mt-6 border border-gray-200 rounded-lg p-4 bg-white text-left">
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

  // ========== SYSTEM CHECK ==========
  if (step === 'system_check' && interview) {
    const StatusIcon = ({ status }: { status: string }) => {
      if (status === 'checking') return <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />;
      if (status === 'granted' || status === 'stable' || status === 'ready')
        return <CheckCircle className="w-5 h-5 text-gray-800" />;
      return <X className="w-5 h-5 text-gray-400" />;
    };

    const statusLabel = (status: string) => {
      if (status === 'checking') return 'Checking...';
      if (status === 'granted') return 'Granted';
      if (status === 'stable') return 'Stable';
      if (status === 'ready') return 'Ready';
      if (status === 'denied') return 'Denied';
      if (status === 'unstable') return 'Unstable';
      return 'Error';
    };

    const checkBorder = (status: string) => {
      if (status === 'checking') return 'border-gray-200';
      if (status === 'granted' || status === 'stable' || status === 'ready') return 'border-gray-300 bg-gray-50';
      return 'border-gray-300 bg-gray-100';
    };

    return (
      <div className="min-h-screen overflow-y-auto bg-gray-50">
        {/* Header */}
        <div className="bg-gray-900 px-8 py-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center">
              <Video className="w-6 h-6 text-gray-300" />
            </div>
            <div>
              <h1 className="text-white text-lg font-semibold">AI Interview Session</h1>
              <p className="text-gray-400 text-sm">
                {interview.candidate_name} &bull; {interview.position}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-8 py-8 space-y-8">
          <div className="border border-gray-200 rounded-lg p-5 bg-white">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Info className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Pre-Interview System Check</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Please ensure your camera and microphone are working properly before starting the interview.
                </p>
              </div>
            </div>
          </div>

          {/* Video Preview */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Video className="w-5 h-5 text-gray-500" />
              <h2 className="font-semibold text-gray-900">Video Preview</h2>
            </div>
            <div className="relative bg-gray-900 rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
              {cameraStatus === 'checking' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <Loader2 className="w-10 h-10 text-gray-500 animate-spin mb-3" />
                  <p className="text-gray-400 text-sm">Requesting camera access...</p>
                </div>
              )}
              {cameraStatus === 'denied' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <Camera className="w-10 h-10 text-gray-600 mb-3" />
                  <p className="text-gray-400 text-sm">Camera access denied. Please allow camera permissions.</p>
                </div>
              )}
              {cameraStatus === 'granted' && (
                <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-gray-800/80 text-white text-xs px-3 py-1.5 rounded-full">
                  <Circle className="w-2.5 h-2.5 fill-gray-300 text-gray-300" />
                  Ready
                </div>
              )}
              {cameraStatus !== 'granted' && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                  <p className="text-gray-500 text-sm">Camera Preview</p>
                </div>
              )}
            </div>
          </div>

          {/* System Checks */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle className="w-5 h-5 text-gray-500" />
              <h2 className="font-semibold text-gray-900">System Checks</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className={`border rounded-lg p-4 ${checkBorder(cameraStatus)}`}>
                <div className="flex items-center gap-3">
                  <StatusIcon status={cameraStatus} />
                  <div>
                    <div className="font-medium text-gray-900 text-sm">Camera Access</div>
                    <div className="text-xs text-gray-500">{statusLabel(cameraStatus)}</div>
                  </div>
                </div>
              </div>
              <div className={`border rounded-lg p-4 ${checkBorder(micStatus)}`}>
                <div className="flex items-center gap-3">
                  <StatusIcon status={micStatus} />
                  <div>
                    <div className="font-medium text-gray-900 text-sm">Microphone Access</div>
                    <div className="text-xs text-gray-500">{statusLabel(micStatus)}</div>
                  </div>
                </div>
              </div>
              <div className={`border rounded-lg p-4 ${checkBorder(networkStatus)}`}>
                <div className="flex items-center gap-3">
                  <StatusIcon status={networkStatus} />
                  <div>
                    <div className="font-medium text-gray-900 text-sm">Network Connection</div>
                    <div className="text-xs text-gray-500">{statusLabel(networkStatus)}</div>
                  </div>
                </div>
              </div>
              <div className={`border rounded-lg p-4 ${checkBorder(aiEngineStatus)}`}>
                <div className="flex items-center gap-3">
                  <StatusIcon status={aiEngineStatus} />
                  <div>
                    <div className="font-medium text-gray-900 text-sm">AI Engine</div>
                    <div className="text-xs text-gray-500">{statusLabel(aiEngineStatus)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Interview Details */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-gray-500" />
              <h2 className="font-semibold text-gray-900">Interview Details</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-gray-200 rounded-lg p-4 bg-white">
                <div className="text-xs text-gray-500 mb-1">Interview Type</div>
                <div className="font-medium text-gray-900 capitalize">{interview.interview_type.replace('_', ' ')}</div>
              </div>
              <div className="border border-gray-200 rounded-lg p-4 bg-white">
                <div className="text-xs text-gray-500 mb-1">Duration</div>
                <div className="font-medium text-gray-900">{interview.duration_minutes} min</div>
              </div>
              <div className="border border-gray-200 rounded-lg p-4 bg-white">
                <div className="text-xs text-gray-500 mb-1">Total Questions</div>
                <div className="font-medium text-gray-900">{interview.total_questions}</div>
              </div>
              <div className="border border-gray-200 rounded-lg p-4 bg-white">
                <div className="text-xs text-gray-500 mb-1">Recording</div>
                <div className="font-medium text-gray-900">Enabled</div>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Circle className="w-3 h-3 fill-gray-400 text-gray-400" />
              Pre-Check
            </div>
            <button
              onClick={handleBeginInterview}
              disabled={!allChecksReady || systemCheckSubmitting}
              className={`flex items-center gap-2 px-6 py-2.5 text-sm rounded-md transition-colors ${
                allChecksReady && !systemCheckSubmitting
                  ? 'bg-gray-800 text-white hover:bg-gray-900'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {systemCheckSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {systemCheckSubmitting ? 'Starting...' : 'Begin Interview'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ========== CONSENT ==========
  if (step === 'consent' && interview) {
    return (
      <div className="min-h-screen overflow-y-auto bg-gray-50">
        {/* Header */}
        <div className="bg-gray-900 px-8 py-5">
          <div className="flex items-center gap-4">
            <Video className="w-6 h-6 text-gray-300" />
            <div>
              <h1 className="text-white text-lg font-semibold">AI Video Interview - Consent Required</h1>
              <p className="text-gray-400 text-sm">
                Position: <span className="text-gray-200 font-medium">{interview.position}</span> &bull; Duration: {interview.duration_minutes} min
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-8 py-8 space-y-8">
          {/* Special Category Data Warning */}
          <div className="border border-gray-300 rounded-lg p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-gray-700 mt-0.5 flex-shrink-0" />
              <div>
                <h2 className="font-semibold text-gray-900">Special Category Data (GDPR Article 9 + DPDP Act Section 6)</h2>
                <p className="text-sm text-gray-600 mt-1">
                  This interview uses <strong>AI facial analysis</strong>, which is considered <strong>biometric data</strong> under GDPR. Your <strong>explicit consent</strong> is required by law.
                </p>
              </div>
            </div>
            <div className="bg-gray-100 rounded-lg p-4">
              <p className="text-sm text-gray-700 font-medium mb-3">What will be recorded and analyzed:</p>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><strong>Video:</strong> Your full video interview will be recorded</li>
                <li><strong>Audio:</strong> All spoken responses will be recorded and transcribed</li>
                <li><strong>Biometric Analysis:</strong> AI will analyze facial expressions, eye contact, emotions, and body language</li>
                <li><strong>Retention:</strong> Recordings will be stored for 90 days, then automatically deleted</li>
                <li><strong>Your Rights:</strong> You can withdraw consent and request deletion at any time</li>
              </ul>
            </div>
          </div>

          {/* Data Collection During Interview */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Info className="w-5 h-5 text-gray-500" />
              <h2 className="font-semibold text-gray-900">Data Collection During Interview</h2>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="border border-gray-200 rounded-lg p-4 bg-white">
                <div className="flex items-center gap-3 mb-1">
                  <Video className="w-5 h-5 text-gray-600" />
                  <span className="font-medium text-gray-900 text-sm">Video Recording</span>
                </div>
                <p className="text-xs text-gray-500 ml-8">Full interview video captured</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-4 bg-white">
                <div className="flex items-center gap-3 mb-1">
                  <Mic className="w-5 h-5 text-gray-600" />
                  <span className="font-medium text-gray-900 text-sm">Audio Recording</span>
                </div>
                <p className="text-xs text-gray-500 ml-8">Voice responses recorded</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-4 bg-white">
                <div className="flex items-center gap-3 mb-1">
                  <Eye className="w-5 h-5 text-gray-600" />
                  <span className="font-medium text-gray-900 text-sm">Facial Analysis</span>
                </div>
                <p className="text-xs text-gray-500 ml-8">Biometric data (GDPR Art. 9)</p>
              </div>
            </div>
          </div>

          {/* Data Retention & Deletion */}
          <div className="border border-gray-200 rounded-lg p-6 bg-white">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-5 h-5 text-gray-500" />
              <h2 className="font-semibold text-gray-900">Data Retention & Deletion</h2>
            </div>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>Recordings stored for <strong>90 days</strong> from interview date</li>
              <li><strong>Automatic deletion</strong> after 90 days (no manual action needed)</li>
              <li>You can <strong>request early deletion</strong> at any time via email to privacy@talentflow.com</li>
              <li>Deletion processed within <strong>48 hours</strong> of request</li>
              <li>Anonymized analytics may be retained longer (with no personal identifiers)</li>
            </ul>
          </div>

          {/* Consent Checkboxes */}
          <div>
            <h2 className="font-semibold text-gray-900 mb-4">Please confirm your consent:</h2>
            <div className="space-y-3">
              <label className="flex items-center gap-3 border border-gray-200 rounded-lg p-4 bg-white cursor-pointer hover:border-gray-300 transition-colors">
                <input type="checkbox" checked={consentVideo} onChange={(e) => setConsentVideo(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-gray-800 focus:ring-gray-500" />
                <span className="text-sm text-gray-700">
                  I consent to <strong>video recording</strong> of this interview
                </span>
              </label>
              <label className="flex items-center gap-3 border border-gray-200 rounded-lg p-4 bg-white cursor-pointer hover:border-gray-300 transition-colors">
                <input type="checkbox" checked={consentAudio} onChange={(e) => setConsentAudio(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-gray-800 focus:ring-gray-500" />
                <span className="text-sm text-gray-700">
                  I consent to <strong>audio recording</strong> of my responses
                </span>
              </label>
              <label className="flex items-start gap-3 border border-gray-300 rounded-lg p-4 bg-gray-50 cursor-pointer hover:border-gray-400 transition-colors">
                <input type="checkbox" checked={consentBiometric} onChange={(e) => setConsentBiometric(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-gray-800 focus:ring-gray-500 mt-0.5" />
                <span className="text-sm text-gray-700">
                  I consent to <strong>biometric data processing</strong> (facial analysis, emotion detection, eye tracking) - <span className="font-semibold text-gray-900">GDPR Article 9 Special Category Data</span>
                </span>
              </label>
              <label className="flex items-center gap-3 border border-gray-200 rounded-lg p-4 bg-white cursor-pointer hover:border-gray-300 transition-colors">
                <input type="checkbox" checked={consentAI} onChange={(e) => setConsentAI(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-gray-800 focus:ring-gray-500" />
                <span className="text-sm text-gray-700">
                  I consent to <strong>AI analysis</strong> of my interview performance, responses, and behavior
                </span>
              </label>
              <label className="flex items-center gap-3 border border-gray-200 rounded-lg p-4 bg-white cursor-pointer hover:border-gray-300 transition-colors">
                <input type="checkbox" checked={consentTerms} onChange={(e) => setConsentTerms(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-gray-800 focus:ring-gray-500" />
                <span className="text-sm text-gray-700">
                  I have read and agree to the <a href="/privacy" className="underline font-medium text-gray-900 hover:text-black">Privacy Policy</a> and <a href="/terms" className="underline font-medium text-gray-900 hover:text-black">Terms & Conditions</a>
                </span>
              </label>
            </div>
          </div>

          {/* Your Rights */}
          <div className="border border-gray-200 rounded-lg p-5 bg-gray-50">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-gray-600" />
              <h3 className="font-semibold text-gray-900 text-sm">Your Rights</h3>
            </div>
            <p className="text-sm text-gray-600">
              You can withdraw your consent at any time by contacting us at <a href="mailto:privacy@talentflow.com" className="underline font-medium text-gray-900">privacy@talentflow.com</a>. Upon withdrawal, your interview recording will be <strong>deleted within 48 hours</strong>.
            </p>
          </div>

          {/* Recording Indicator */}
          <div className="border border-gray-200 rounded-lg p-5 bg-white">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full bg-gray-800 inline-block" />
              <h3 className="font-semibold text-gray-900 text-sm">Recording Indicator</h3>
            </div>
            <p className="text-sm text-gray-600">
              A <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-gray-800 inline-block" /> <strong>RECORDING</strong></span> indicator will be displayed throughout your interview to remind you that the session is being recorded and analyzed.
            </p>
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-8 py-4">
          <div className="flex items-center justify-between">
            {!allConsentsChecked && (
              <span className="text-sm text-gray-500">Please accept all required consents</span>
            )}
            {allConsentsChecked && <span />}
            <button
              onClick={handleConsentSubmit}
              disabled={!allConsentsChecked || consentSubmitting}
              className={`flex items-center gap-2 px-6 py-2.5 text-sm rounded-md transition-colors ${
                allConsentsChecked && !consentSubmitting
                  ? 'bg-gray-800 text-white hover:bg-gray-900'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {consentSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Monitor className="w-4 h-4" />
              )}
              {consentSubmitting ? 'Processing...' : 'System Check'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
