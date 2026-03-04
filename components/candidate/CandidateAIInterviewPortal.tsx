'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Video, CheckCircle, X, Play, Info, AlertTriangle, FileText, Loader2, Mic, Eye, Monitor, Camera, Wifi, Cpu, Circle, RefreshCw, Sun, Volume2, Globe } from 'lucide-react';
import { candidateAIInterviewService } from '@/lib/services/candidateAIInterviewService';
import type { CandidateInterviewInfo } from '@/lib/services/candidateAIInterviewService';
import { InterviewUI } from '@/components/ai-interview/InterviewUI';
import { useInterviewFaceVerification } from '@/components/ai-interview/proctoring/InterviewFaceVerification';
import { useInterviewVoiceVerification } from '@/components/ai-interview/proctoring/InterviewVoiceVerification';
import { InterviewEventBus } from '@/components/ai-interview/proctoring/InterviewEventBus';
import { getUserMedia, requestFullscreen } from '@/lib/utils/browserCompat';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

type Step = 'loading' | 'consent' | 'system_check' | 'language_select' | 'interview' | 'completed' | 'error';

interface Props {
  token: string;
}

export function CandidateAIInterviewPortal({ token }: Props) {
  const [step, setStep] = useState<Step>('loading');
  const stepRef = useRef<Step>('loading');
  useEffect(() => { stepRef.current = step; }, [step]);
  const [interview, setInterview] = useState<CandidateInterviewInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Consent state
  const [consentRecordingAI, setConsentRecordingAI] = useState(false);
  const [consentTerms, setConsentTerms] = useState(false);
  const [consentSubmitting, setConsentSubmitting] = useState(false);

  const allConsentsChecked = consentRecordingAI && consentTerms;

  // System check state
  const [cameraStatus, setCameraStatus] = useState<'checking' | 'granted' | 'denied'>('checking');
  const [micStatus, setMicStatus] = useState<'checking' | 'granted' | 'denied'>('checking');
  const [networkStatus, setNetworkStatus] = useState<'checking' | 'stable' | 'unstable'>('checking');
  const [aiEngineStatus, setAiEngineStatus] = useState<'checking' | 'ready' | 'error'>('checking');
  const [lightingStatus, setLightingStatus] = useState<'checking' | 'good' | 'poor'>('checking');
  const [noiseStatus, setNoiseStatus] = useState<'checking' | 'normal' | 'noisy'>('checking');
  const [micQuality, setMicQuality] = useState<'checking' | 'good' | 'low' | 'silent'>('checking');
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [networkLatency, setNetworkLatency] = useState<number | null>(null);
  const [aiEngineLatency, setAiEngineLatency] = useState<number | null>(null);
  const [networkVariance, setNetworkVariance] = useState<number | null>(null);
  const [videoBrightness, setVideoBrightness] = useState<number | null>(null);
  const [systemCheckSubmitting, setSystemCheckSubmitting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioLevelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micQualityAudioContextRef = useRef<AudioContext | null>(null);

  // Language selection state
  const [availableLanguages, setAvailableLanguages] = useState<string[]>(['English']);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('English');
  const [languageSubmitting, setLanguageSubmitting] = useState(false);

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
  const [faceEnrollStatus, setFaceEnrollStatus] = useState<'idle' | 'enrolling' | 'done' | 'failed'>('idle');
  const [voiceEnrollStatus, setVoiceEnrollStatus] = useState<'idle' | 'enrolling' | 'done' | 'failed'>('idle');

  const allChecksReady =
    cameraStatus === 'granted'
    && micStatus === 'granted'
    && micQuality === 'good'
    && networkStatus === 'stable'
    && aiEngineStatus === 'ready'
    && lightingStatus === 'good'
    && noiseStatus === 'normal';

  // Load interview info and determine initial step
  const loadInterview = useCallback(async () => {
    // Don't disrupt an already-active interview (e.g. browser back/forward cache restore)
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

  // ---- Microphone quality (AudioContext + AnalyserNode) ----
  // Continuously monitors audio level; passes ('good') once user speaks loudly enough.
  // Shows real-time level bar so the candidate can see their voice is detected.
  const checkMicrophoneQuality = useCallback((stream: MediaStream) => {
    try {
      const audioCtx = new AudioContext();
      micQualityAudioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const timeDomainData = new Uint8Array(analyser.fftSize);
      let goodFrames = 0;
      let settled = false;

      // Update audio level bar every 100ms, continuously
      audioLevelIntervalRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(timeDomainData);
        let peak = 0;
        for (let i = 0; i < timeDomainData.length; i++) {
          const val = Math.abs(timeDomainData[i] - 128);
          if (val > peak) peak = val;
        }
        setAudioLevel(peak);

        if (settled) return;

        // Count consecutive frames with good audio level
        if (peak > 15) {
          goodFrames++;
        } else {
          // Reset if silence returns
          if (goodFrames < 5) goodFrames = 0;
        }

        // Need ~0.5s of good audio (5 frames at 100ms) to pass
        if (goodFrames >= 5) {
          settled = true;
          setMicQuality('good');
          // Keep interval running for the level bar visualization
        }
      }, 100);
    } catch (err) {
      console.error('[SystemCheck] Microphone quality check failed:', err);
      setMicQuality('silent');
    }
  }, []);

  // ---- Network quality (5 sequential RTT pings) ----
  const checkNetworkQuality = useCallback(async () => {
    const healthUrl = `${API_BASE_URL.replace('/api/v1', '')}/health`;
    const latencies: number[] = [];
    let failCount = 0;

    for (let i = 0; i < 5; i++) {
      try {
        const t0 = performance.now();
        await fetch(healthUrl, { method: 'GET', cache: 'no-store' });
        const t1 = performance.now();
        latencies.push(t1 - t0);
      } catch {
        failCount++;
      }
    }

    if (failCount >= 3 || latencies.length === 0) {
      setNetworkStatus('unstable');
      setNetworkLatency(null);
      setNetworkVariance(null);
      return;
    }

    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const variance = latencies.reduce((sum, l) => sum + Math.pow(l - avg, 2), 0) / latencies.length;
    const stddev = Math.sqrt(variance);

    setNetworkLatency(Math.round(avg));
    setNetworkVariance(Math.round(stddev));

    if (avg < 500 && stddev < 200) {
      setNetworkStatus('stable');
    } else {
      setNetworkStatus('unstable');
    }
  }, []);

  // ---- AI engine health check ----
  const checkAIEngine = useCallback(async () => {
    try {
      const result = await candidateAIInterviewService.checkAIHealth(token);
      setAiEngineLatency(result.latency_ms);
      if (result.status === 'ready') {
        setAiEngineStatus('ready');
      } else {
        setAiEngineStatus('error');
      }
    } catch {
      setAiEngineStatus('error');
      setAiEngineLatency(null);
    }
  }, [token]);

  // ---- Lighting check (canvas brightness analysis) ----
  const checkLighting = useCallback(() => {
    try {
      const video = videoRef.current;
      if (video && video.videoWidth > 0) {
        if (!canvasRef.current) {
          canvasRef.current = document.createElement('canvas');
        }
        canvasRef.current.width = 160;
        canvasRef.current.height = 120;
        const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, 160, 120);
          const imageData = ctx.getImageData(0, 0, 160, 120);
          let totalBrightness = 0;
          for (let i = 0; i < imageData.data.length; i += 4) {
            totalBrightness += (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
          }
          const avgBrightness = totalBrightness / (160 * 120);
          setVideoBrightness(avgBrightness);
          setLightingStatus(avgBrightness >= 40 ? 'good' : 'poor');
        } else {
          setLightingStatus('good');
        }
      } else {
        setLightingStatus('good');
      }
    } catch {
      setLightingStatus('good');
    }
  }, []);

  // ---- Noise check (frequency bin analysis) ----
  const checkNoise = useCallback((stream: MediaStream) => {
    try {
      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      setTimeout(() => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avgLevel = sum / dataArray.length;
        setNoiseStatus(avgLevel < 80 ? 'normal' : 'noisy');
      }, 2500);
    } catch {
      setNoiseStatus('normal');
    }
  }, []);

  // ---- Cleanup helper ----
  const cleanupAllChecks = useCallback(() => {
    if (audioLevelIntervalRef.current) {
      clearInterval(audioLevelIntervalRef.current);
      audioLevelIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (micQualityAudioContextRef.current) {
      micQualityAudioContextRef.current.close().catch(() => {});
      micQualityAudioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // ---- Main system checks orchestrator ----
  const runSystemChecks = useCallback(async () => {
    setCameraStatus('checking');
    setMicStatus('checking');
    setNetworkStatus('checking');
    setAiEngineStatus('checking');
    setLightingStatus('checking');
    setNoiseStatus('checking');
    setMicQuality('checking');
    setAudioLevel(0);
    setNetworkLatency(null);
    setNetworkVariance(null);
    setAiEngineLatency(null);
    setVideoBrightness(null);

    // Run network + AI checks in parallel with media checks
    const networkPromise = checkNetworkQuality();
    const aiPromise = checkAIEngine();

    try {
      const stream = await getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        // Wait for actual video frames before running lighting check
        const video = videoRef.current;
        const onVideoReady = () => {
          video.removeEventListener('playing', onVideoReady);
          setTimeout(() => {
            checkLighting();
          }, 500);
        };
        if (!video.paused && video.videoWidth > 0) {
          setTimeout(() => {
            checkLighting();
          }, 500);
        } else {
          video.addEventListener('playing', onVideoReady);
        }
      }
      setCameraStatus('granted');
      setMicStatus('granted');

      // Start face enrollment after a short delay for video to stabilize
      // Wrapped in try/catch so any failure is graceful and doesn't freeze UI
      if (videoRef.current) {
        const videoEl = videoRef.current;
        setTimeout(() => {
          setFaceEnrollStatus('enrolling');
          faceVerification.registerFace(videoEl)
            .then(ok => setFaceEnrollStatus(ok ? 'done' : 'failed'))
            .catch(() => setFaceEnrollStatus('failed'));
        }, 3000); // 3s delay for video + camera to fully stabilize
      }

      // Start voice enrollment (records 10s of speech)
      setVoiceEnrollStatus('enrolling');
      voiceVerification.enrollVoice(stream, 10000)
        .then(ok => setVoiceEnrollStatus(ok ? 'done' : 'failed'))
        .catch(() => setVoiceEnrollStatus('failed'));

      // Start mic quality measurement
      checkMicrophoneQuality(stream);

      // Start noise check
      checkNoise(stream);
    } catch {
      setCameraStatus('denied');
      setMicStatus('denied');
      setLightingStatus('good');
      setNoiseStatus('normal');
      setMicQuality('silent');
    }

    await Promise.allSettled([networkPromise, aiPromise]);
  }, [checkNetworkQuality, checkAIEngine, checkMicrophoneQuality, checkNoise, checkLighting]);

  // ---- Re-run checks ----
  const handleRerunChecks = useCallback(() => {
    cleanupAllChecks();
    // Small delay to allow cleanup to complete
    setTimeout(() => runSystemChecks(), 100);
  }, [cleanupAllChecks, runSystemChecks]);

  const stopMediaStream = useCallback(() => {
    cleanupAllChecks();
  }, [cleanupAllChecks]);

  useEffect(() => {
    if (step === 'system_check') {
      runSystemChecks();
      // Preload avatar assets so interview starts instantly after system check
      // These fetch calls just warm the browser cache — no processing needed
      fetch('/talkinghead/talkinghead.mjs').catch(() => {});
      fetch('/models/rpm-recruiter.glb').catch(() => {});
    }
    return () => {
      cleanupAllChecks();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Handlers
  const handleConsentSubmit = async () => {
    if (!allConsentsChecked || consentSubmitting) return;
    setConsentSubmitting(true);
    try {
      const result = await candidateAIInterviewService.recordConsent(token, {
        consent_video: consentRecordingAI,
        consent_audio: consentRecordingAI,
        consent_biometric: consentRecordingAI,
        consent_ai_analysis: consentRecordingAI,
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

    // CRITICAL: Create AudioContext FIRST — must happen in the synchronous
    // user gesture (click) context BEFORE any awaits, otherwise browsers block it.
    // sampleRate: 24000 must match backend TTS output (OpenAI PCM 24kHz).
    try {
      const ctx = new AudioContext({ sampleRate: 24000 });
      (window as any).__interviewAudioContext = ctx;
      console.log("[Portal] AudioContext created at 24kHz from user gesture, state:", ctx.state);
    } catch (e) {
      console.warn("[Portal] Failed to pre-create AudioContext:", e);
    }

    // Fullscreen disabled — no popup

    try {
      // Record system check results (fire-and-forget is fine, don't block start)
      candidateAIInterviewService.recordSystemCheck(token, {
        camera: cameraStatus,
        microphone: micStatus,
        network: networkStatus,
        ai_engine: aiEngineStatus,
        lighting: lightingStatus,
        noise: noiseStatus,
        video_resolution: videoRef.current ? `${videoRef.current.videoWidth}x${videoRef.current.videoHeight}` : undefined,
        video_brightness: videoBrightness ?? undefined,
        audio_level_db: audioLevel > 0 ? audioLevel : undefined,
        network_latency_ms: networkLatency ?? undefined,
        network_latency_variance_ms: networkVariance ?? undefined,
        ai_engine_latency_ms: aiEngineLatency ?? undefined,
      }).catch(() => {}); // non-blocking — best effort

      stopMediaStream();

      // Save selected language (non-blocking if fails — defaults to English on server)
      try {
        await candidateAIInterviewService.selectLanguage(token, selectedLanguage);
      } catch {
        // Non-blocking — language defaults to English on server
      }

      const result = await candidateAIInterviewService.startInterview(token);
      setInterview(result);
      setStep('interview');
    } catch (err: any) {
      const detail = err?.response?.data?.detail || 'Failed to start interview';
      console.error('[BEGIN-INTERVIEW] Error:', detail);
      // If interview is already completed/cancelled, reload to show correct state
      if (detail.includes('completed') || detail.includes('cancelled') || detail.includes('expired')) {
        await loadInterview();
      } else {
        setErrorMessage(detail);
        setStep('error');
      }
    } finally {
      setSystemCheckSubmitting(false);
    }
  };

  // ========== LOADING ==========
  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full text-center">
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

  // ========== LANGUAGE SELECTION ==========
  if (step === 'language_select' && interview) {
    const handleLanguageSubmit = async () => {
      if (languageSubmitting) return;
      setLanguageSubmitting(true);
      try {
        await candidateAIInterviewService.selectLanguage(token, selectedLanguage);
        const result = await candidateAIInterviewService.startInterview(token);
        setInterview(result);
        setStep('interview');
      } catch (err: any) {
        const detail = err?.response?.data?.detail || 'Failed to start interview';
        if (detail.includes('completed') || detail.includes('cancelled') || detail.includes('expired')) {
          await loadInterview();
        } else {
          setErrorMessage(detail);
          setStep('error');
        }
      } finally {
        setLanguageSubmitting(false);
      }
    };

    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        {/* Header */}
        <div className="sticky top-0 z-50 bg-gray-900 px-4 sm:px-8 py-4 sm:py-5 shadow-lg">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 sm:gap-3 mb-1">
              <Globe className="w-5 h-5 text-gray-300" />
              <h1 className="text-white text-base sm:text-lg font-semibold">Select Interview Language</h1>
            </div>
            <p className="text-gray-400 text-xs sm:text-sm">
              {interview.candidate_name} &bull; {interview.position}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex items-center justify-center px-4 sm:px-8 py-8 sm:py-12">
          <div className="max-w-md w-full space-y-6">
            <div className="text-center">
              <Globe className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Choose Your Preferred Language</h2>
              <p className="text-sm text-gray-600">
                The AI interviewer will conduct the entire interview in your selected language.
              </p>
            </div>

            <div className="space-y-2">
              {availableLanguages.map(lang => (
                <button
                  key={lang}
                  onClick={() => setSelectedLanguage(lang)}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                    selectedLanguage === lang
                      ? 'border-gray-800 bg-gray-50 ring-1 ring-gray-800'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <span className={`text-sm font-medium ${selectedLanguage === lang ? 'text-gray-900' : 'text-gray-700'}`}>
                    {lang}
                  </span>
                </button>
              ))}
            </div>

            <button
              onClick={handleLanguageSubmit}
              disabled={languageSubmitting}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {languageSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {languageSubmitting ? 'Starting Interview...' : `Start Interview in ${selectedLanguage}`}
            </button>
          </div>
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
        faceVerification={faceVerification.hasBaseline() ? faceVerification : undefined}
        voiceVerification={voiceVerification.hasBaseline() ? voiceVerification : undefined}
      />
    );
  }

  // ========== COMPLETED ==========
  if (step === 'completed') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full text-center">
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
      if (status === 'granted' || status === 'stable' || status === 'ready' || status === 'good' || status === 'normal')
        return <CheckCircle className="w-5 h-5 text-gray-800" />;
      if (status === 'low') return <AlertTriangle className="w-5 h-5 text-gray-600" />;
      return <X className="w-5 h-5 text-gray-400" />;
    };

    const statusLabel = (status: string) => {
      if (status === 'checking') return 'Checking...';
      if (status === 'granted') return 'Granted';
      if (status === 'stable') return 'Stable';
      if (status === 'ready') return 'Ready';
      if (status === 'good') return 'Good';
      if (status === 'normal') return 'Normal';
      if (status === 'denied') return 'Denied';
      if (status === 'unstable') return 'Unstable';
      if (status === 'poor') return 'Too Dark';
      if (status === 'noisy') return 'Too Noisy';
      if (status === 'low') return 'Low Volume';
      if (status === 'silent') return 'No Audio Detected';
      return 'Error';
    };

    const checkBorder = (status: string) => {
      if (status === 'checking') return 'bg-gray-50';
      if (status === 'granted' || status === 'stable' || status === 'ready' || status === 'good' || status === 'normal') return 'bg-gray-50';
      if (status === 'low') return 'bg-amber-50';
      return 'bg-red-50';
    };

    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        {/* Sticky Header */}
        <div className="sticky top-0 z-50 bg-gray-900 px-4 sm:px-8 py-4 sm:py-5 shadow-lg">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 sm:gap-3 mb-1">
              <Video className="w-5 h-5 text-gray-300 hidden sm:block" />
              <h1 className="text-white text-base sm:text-lg font-semibold">Pre-Interview System Check</h1>
            </div>
            <p className="text-gray-400 text-xs sm:text-sm">
              {interview.candidate_name} &bull; {interview.position}
            </p>
          </div>
        </div>

        {/* Content — full-width sections */}
        <div className="flex-1 bg-white">

          {/* Section 1: Info Banner */}
          <div className="px-4 sm:px-8 py-4 sm:py-5 bg-gray-50 border-b border-gray-200">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-gray-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-gray-600">
                Please ensure your camera and microphone are working properly before starting the interview.
              </p>
            </div>
          </div>

          {/* Section 2: Video Preview + Identity Verification */}
          <div className="px-4 sm:px-8 py-5 sm:py-6 border-b border-gray-200">
            <div className="flex items-center gap-2 mb-3">
              <Video className="w-5 h-5 text-gray-500" />
              <h2 className="font-semibold text-gray-900 text-sm sm:text-base">Video Preview & Identity</h2>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
              {/* Video */}
              <div className="flex justify-center sm:justify-start shrink-0">
                <div className="relative bg-gray-900 rounded-lg overflow-hidden w-full max-w-[16rem] sm:w-64" style={{ aspectRatio: '4/3' }}>
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
                      <p className="text-gray-400 text-xs sm:text-sm px-2 text-center">Camera access denied. Please allow camera permissions.</p>
                    </div>
                  )}
                  {cameraStatus !== 'granted' && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                      <p className="text-gray-500 text-sm">Camera Preview</p>
                    </div>
                  )}
                </div>
              </div>
              {/* Identity Verification — next to video */}
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <Eye className="w-4 h-4 text-gray-500" />
                  <span className="font-medium text-gray-900 text-sm">Identity Verification</span>
                </div>
                <p className="text-xs text-gray-500 mb-2">
                  Look at the camera and speak naturally to register your identity.
                </p>
                {/* Face */}
                <div className={`flex items-center gap-3 p-2.5 rounded-lg ${
                  faceEnrollStatus === 'failed' ? 'bg-amber-50' : 'bg-gray-50'
                }`}>
                  {faceEnrollStatus === 'enrolling' ? (
                    <Loader2 className="w-4 h-4 text-gray-400 animate-spin shrink-0" />
                  ) : faceEnrollStatus === 'done' ? (
                    <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                  ) : faceEnrollStatus === 'failed' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  ) : (
                    <Camera className="w-4 h-4 text-gray-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 text-xs sm:text-sm">Face Registration</div>
                    <div className="text-[11px] text-gray-500">
                      {faceEnrollStatus === 'idle' ? 'Waiting for camera...' :
                       faceEnrollStatus === 'enrolling' ? 'Registering your face...' :
                       faceEnrollStatus === 'done' ? 'Face registered' :
                       'Could not detect face (optional)'}
                    </div>
                  </div>
                </div>
                {/* Voice */}
                <div className={`flex items-center gap-3 p-2.5 rounded-lg ${
                  voiceEnrollStatus === 'failed' ? 'bg-amber-50' : 'bg-gray-50'
                }`}>
                  {voiceEnrollStatus === 'enrolling' ? (
                    <Loader2 className="w-4 h-4 text-gray-400 animate-spin shrink-0" />
                  ) : voiceEnrollStatus === 'done' ? (
                    <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                  ) : voiceEnrollStatus === 'failed' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  ) : (
                    <Mic className="w-4 h-4 text-gray-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 text-xs sm:text-sm">Voice Registration</div>
                    <div className="text-[11px] text-gray-500">
                      {voiceEnrollStatus === 'idle' ? 'Waiting for microphone...' :
                       voiceEnrollStatus === 'enrolling' ? 'Recording voice sample (10s)...' :
                       voiceEnrollStatus === 'done' ? 'Voice registered' :
                       'Could not register voice (optional)'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: System Checks */}
          <div className="px-4 sm:px-8 py-5 sm:py-6 border-b border-gray-200">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle className="w-5 h-5 text-gray-500" />
              <h2 className="font-semibold text-gray-900 text-sm sm:text-base">System Checks</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
              {/* Camera Access */}
              <div className={`flex items-center gap-3 p-3 rounded-lg ${checkBorder(cameraStatus)}`}>
                <StatusIcon status={cameraStatus} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 text-sm">Camera Access</div>
                  <div className="text-xs text-gray-500">{statusLabel(cameraStatus)}</div>
                </div>
              </div>
              {/* Microphone + Audio Level */}
              <div className={`flex items-center gap-3 p-3 rounded-lg ${checkBorder(micStatus)}`}>
                <StatusIcon status={micQuality === 'good' ? 'granted' : micStatus} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 text-sm">Microphone</div>
                  <div className="text-xs text-gray-500">
                    {micStatus === 'checking' ? 'Checking...' :
                     micStatus === 'denied' ? 'Denied' :
                     micQuality === 'good' ? 'Good Quality' :
                     'Speak now to test...'}
                  </div>
                  {micStatus === 'granted' && (
                    <>
                      <div className="mt-1.5 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-100 ${micQuality === 'good' ? 'bg-green-500' : 'bg-gray-600'}`}
                          style={{ width: `${Math.min(100, (audioLevel / 128) * 100)}%` }}
                        />
                      </div>
                      {micQuality !== 'good' && (
                        <div className="mt-1 flex items-center gap-1">
                          <Mic className="w-3 h-3 text-gray-400 animate-pulse" />
                          <span className="text-[10px] text-gray-400">Say something to verify your mic</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
              {/* Network */}
              <div className={`flex items-center gap-3 p-3 rounded-lg ${checkBorder(networkStatus)}`}>
                <StatusIcon status={networkStatus} />
                <div>
                  <div className="font-medium text-gray-900 text-sm">Network Connection</div>
                  <div className="text-xs text-gray-500">
                    {networkStatus === 'checking' ? 'Pinging...' :
                     networkStatus === 'stable' && networkLatency !== null ? `Stable (${networkLatency}ms)` :
                     networkStatus === 'unstable' && networkLatency !== null ? `Unstable (${networkLatency}ms)` :
                     statusLabel(networkStatus)}
                  </div>
                </div>
              </div>
              {/* AI Engine */}
              <div className={`flex items-center gap-3 p-3 rounded-lg ${checkBorder(aiEngineStatus)}`}>
                <StatusIcon status={aiEngineStatus} />
                <div>
                  <div className="font-medium text-gray-900 text-sm">AI Engine</div>
                  <div className="text-xs text-gray-500">
                    {aiEngineStatus === 'checking' ? 'Checking...' :
                     aiEngineStatus === 'ready' && aiEngineLatency !== null ? `Ready (${aiEngineLatency}ms)` :
                     aiEngineStatus === 'error' ? 'AI engine unavailable' :
                     statusLabel(aiEngineStatus)}
                  </div>
                </div>
              </div>
              {/* Lighting */}
              <div className={`flex items-center gap-3 p-3 rounded-lg ${checkBorder(lightingStatus)}`}>
                <StatusIcon status={lightingStatus} />
                <div>
                  <div className="font-medium text-gray-900 text-sm">Lighting Quality</div>
                  <div className="text-xs text-gray-500">
                    {lightingStatus === 'checking' ? 'Analyzing...' : lightingStatus === 'good' ? 'Good' : 'Too Dark'}
                  </div>
                </div>
              </div>
              {/* Ambient Noise */}
              <div className={`flex items-center gap-3 p-3 rounded-lg ${checkBorder(noiseStatus)}`}>
                <StatusIcon status={noiseStatus} />
                <div>
                  <div className="font-medium text-gray-900 text-sm">Ambient Noise</div>
                  <div className="text-xs text-gray-500">
                    {noiseStatus === 'checking' ? 'Measuring...' : noiseStatus === 'normal' ? 'Normal' : 'Too Noisy'}
                  </div>
                </div>
              </div>
            </div>
          </div>


          {/* Section 4: Interview Details */}
          <div className="px-4 sm:px-8 py-5 sm:py-6 bg-gray-50">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-gray-500" />
              <h2 className="font-semibold text-gray-900 text-sm sm:text-base">Interview Details</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <div className="p-3 rounded-lg bg-white border border-gray-100">
                <div className="text-xs text-gray-500 mb-1">Interview Type</div>
                <div className="font-medium text-gray-900 capitalize">{interview.interview_type.replace('_', ' ')}</div>
              </div>
              <div className="p-3 rounded-lg bg-white border border-gray-100">
                <div className="text-xs text-gray-500 mb-1">Duration</div>
                <div className="font-medium text-gray-900">{interview.duration_minutes} min</div>
              </div>
              <div className="p-3 rounded-lg bg-white border border-gray-100">
                <div className="text-xs text-gray-500 mb-1">Total Questions</div>
                <div className="font-medium text-gray-900">{interview.total_questions}</div>
              </div>
              <div className="p-3 rounded-lg bg-white border border-gray-100">
                <div className="text-xs text-gray-500 mb-1">Recording</div>
                <div className="font-medium text-gray-900">Enabled</div>
              </div>
            </div>
          </div>

          {/* Section 5: Language Selection (only when multiple languages configured) */}
          {availableLanguages.length > 1 && (
            <div className="px-4 sm:px-8 py-5 sm:py-6 border-t border-gray-200">
              <div className="flex items-center gap-2 mb-3">
                <Globe className="w-5 h-5 text-gray-500" />
                <h2 className="font-semibold text-gray-900 text-sm sm:text-base">Interview Language</h2>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Select the language you&apos;d like the AI interviewer to use during the interview.
              </p>
              <div className="flex flex-wrap gap-2">
                {availableLanguages.map(lang => (
                  <button
                    key={lang}
                    onClick={() => setSelectedLanguage(lang)}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      selectedLanguage === lang
                        ? 'border-gray-800 bg-gray-900 text-white'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Sticky Footer */}
        <div className="sticky bottom-0 z-40 bg-white border-t border-gray-200 px-4 sm:px-8 py-3 sm:py-4 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-0">
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Circle className="w-3 h-3 fill-gray-400 text-gray-400" />
                <span className="hidden sm:inline">Pre-Check</span>
              </div>
              <button
                onClick={handleRerunChecks}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Re-run Checks
              </button>
            </div>
            <button
              onClick={handleBeginInterview}
              disabled={!allChecksReady || systemCheckSubmitting}
              className={`flex items-center justify-center gap-2 px-6 py-2.5 text-sm rounded-md transition-colors w-full sm:w-auto ${
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
              {systemCheckSubmitting ? 'Starting...' : availableLanguages.length > 1 ? `Begin Interview in ${selectedLanguage}` : 'Begin Interview'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ========== CONSENT ==========
  if (step === 'consent' && interview) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        {/* Sticky Header */}
        <div className="sticky top-0 z-50 bg-gray-900 px-4 sm:px-8 py-4 sm:py-5 shadow-lg">
          <div className="max-w-3xl mx-auto text-center">
            <div className="flex items-center justify-center gap-2 sm:gap-3 mb-1">
              <Video className="w-5 h-5 text-gray-300 hidden sm:block" />
              <h1 className="text-white text-sm sm:text-lg font-semibold">AI Video Interview - Consent Required</h1>
            </div>
            <p className="text-gray-400 text-xs sm:text-sm">
              Position: <span className="text-gray-200 font-medium">{interview.position}</span> &bull; Duration: {interview.duration_minutes} min
            </p>
          </div>
        </div>

        {/* Content — full-width sections */}
        <div className="flex-1 bg-white">

            {/* Section 1: Special Category Data Warning */}
            <div className="px-4 sm:px-8 py-5 sm:py-6 bg-gray-50 border-b border-gray-200">
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle className="w-5 h-5 text-gray-700 mt-0.5 flex-shrink-0" />
                <div>
                  <h2 className="font-semibold text-gray-900">Special Category Data (GDPR Article 9 + DPDP Act Section 6)</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    This interview uses <strong>AI facial analysis</strong>, which is considered <strong>biometric data</strong> under GDPR. Your <strong>explicit consent</strong> is required by law.
                  </p>
                </div>
              </div>
              <div className="bg-white rounded-lg p-4 border border-gray-100">
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

            {/* Section 2: Data Collection During Interview */}
            <div className="px-4 sm:px-8 py-5 sm:py-6 border-b border-gray-200">
              <div className="flex items-center gap-2 mb-4">
                <Info className="w-5 h-5 text-gray-500" />
                <h2 className="font-semibold text-gray-900 text-sm sm:text-base">Data Collection During Interview</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                  <Video className="w-5 h-5 text-gray-600 flex-shrink-0" />
                  <div>
                    <span className="font-medium text-gray-900 text-sm">Video Recording</span>
                    <p className="text-xs text-gray-500">Full interview video captured</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                  <Mic className="w-5 h-5 text-gray-600 flex-shrink-0" />
                  <div>
                    <span className="font-medium text-gray-900 text-sm">Audio Recording</span>
                    <p className="text-xs text-gray-500">Voice responses recorded</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                  <Eye className="w-5 h-5 text-gray-600 flex-shrink-0" />
                  <div>
                    <span className="font-medium text-gray-900 text-sm">Facial Analysis</span>
                    <p className="text-xs text-gray-500">Biometric data (GDPR Art. 9)</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Data Retention & Deletion */}
            <div className="px-4 sm:px-8 py-5 sm:py-6 border-b border-gray-200">
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

            {/* Section 4: Consent Checkboxes */}
            <div className="px-4 sm:px-8 py-5 sm:py-6 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900 mb-4">Please confirm your consent to proceed:</h2>
              <div className="space-y-3">
                <label className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors">
                  <input type="checkbox" checked={consentRecordingAI} onChange={(e) => setConsentRecordingAI(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-gray-800 focus:ring-gray-500 mt-0.5" />
                  <span className="text-sm text-gray-700">
                    I agree to the <strong>video and audio recording</strong> of this interview and to <strong>AI-based analysis</strong> of my responses, including facial and behavioral analysis, as described in the <a href="/privacy" className="underline font-medium text-gray-900 hover:text-black">Privacy Policy</a>.
                  </span>
                </label>
                <label className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors">
                  <input type="checkbox" checked={consentTerms} onChange={(e) => setConsentTerms(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-gray-800 focus:ring-gray-500 mt-0.5" />
                  <span className="text-sm text-gray-700">
                    I confirm that I have read and agree to the <a href="/privacy" className="underline font-medium text-gray-900 hover:text-black">Privacy Policy</a> and <a href="/terms" className="underline font-medium text-gray-900 hover:text-black">Terms & Conditions</a>.
                  </span>
                </label>
              </div>
            </div>

            {/* Section 5: Your Rights + Recording Indicator (combined footer section) */}
            <div className="px-4 sm:px-8 py-5 sm:py-6 bg-gray-50">
              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-gray-600" />
                    <h3 className="font-semibold text-gray-900 text-sm">Your Rights</h3>
                  </div>
                  <p className="text-sm text-gray-600">
                    You can withdraw your consent at any time by contacting us at <a href="mailto:privacy@talentflow.com" className="underline font-medium text-gray-900">privacy@talentflow.com</a>. Upon withdrawal, your interview recording will be <strong>deleted within 48 hours</strong>.
                  </p>
                </div>
                <div className="border-t border-gray-200 pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-3 h-3 rounded-full bg-gray-800 inline-block" />
                    <h3 className="font-semibold text-gray-900 text-sm">Recording Indicator</h3>
                  </div>
                  <p className="text-sm text-gray-600">
                    A <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-gray-800 inline-block" /> <strong>RECORDING</strong></span> indicator will be displayed throughout your interview to remind you that the session is being recorded and analyzed.
                  </p>
                </div>
              </div>
            </div>

        </div>

        {/* Sticky Footer */}
        <div className="sticky bottom-0 z-40 bg-white border-t border-gray-200 px-4 sm:px-8 py-3 sm:py-4 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-0">
            {!allConsentsChecked && (
              <span className="text-xs sm:text-sm text-gray-500 text-center sm:text-left">Please accept all required consents</span>
            )}
            {allConsentsChecked && <span />}
            <button
              onClick={handleConsentSubmit}
              disabled={!allConsentsChecked || consentSubmitting}
              className={`flex items-center justify-center gap-2 px-6 py-2.5 text-sm rounded-md transition-colors w-full sm:w-auto ${
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
