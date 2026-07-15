'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  MicOff,
  MessageSquare,
  Volume2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Play,
} from 'lucide-react';
import { candidateAIInterviewService } from '@/lib/services/candidateAIInterviewService';
import { isTranscriptMeaningful } from '@/lib/utils/whisperFilter';
import { recordPcm16 } from '@/lib/utils/pcmEnroll';
// Reuse the SAME realtime waveform the live interview uses (canvas equalizer
// reading the mic AnalyserNode), so practice looks identical.
import { MicWaveform } from '@/components/ai-interview/MicWaveform';

// ── Component props ──────────────────────────────────────────────────────────

interface StepSamplePracticeProps {
  token: string;
  onStartInterview: () => void;
  onGoBack?: () => void;
  selectedLanguage?: string;
  submitting?: boolean;
  /** Face verification — runs continuous identity check against system-check baseline */
  faceVerification?: {
    hasBaseline: () => boolean;
    startVerification: (video: HTMLVideoElement) => void;
    stopVerification: () => void;
  };
}

// ── Practice question ────────────────────────────────────────────────────────

// Spoken/shown greeting that plays BEFORE the practice question. It sets
// expectations clearly: this is only a practice/test run for the candidate to
// confirm their mic + video work, the recording can be replayed, and nothing
// here is stored in our database.
const PRACTICE_GREETING =
  "Hi, this is Linda. Welcome — this is just a practice session. Before the real interview begins, let's make sure everything is working correctly, especially your microphone and camera. Go ahead and record a short answer, then play it back to check that you can be seen and heard clearly. Don't worry — this practice recording is only for you to test yourself and is not stored in our database.";

// The actual practice question, asked AFTER the greeting.
const PRACTICE_QUESTION =
  'Whenever you are ready, please briefly introduce yourself — your name, background, and what excites you about this role.';

// Full script the AI voice reads aloud: greeting first, then the question.
const PRACTICE_SPOKEN_SCRIPT = `${PRACTICE_GREETING} ${PRACTICE_QUESTION}`;

// Linda's sign-off, spoken when the candidate finishes the practice (clicks Next).
const PRACTICE_CLOSING_MESSAGE =
  "Great — that's the idea! You're all set and ready to begin the real interview. Take a breath, relax, and do your best. All the best!";

// Per-question answer window in the REAL interview (timed mode) is 2 minutes.
// The practice mock mirrors it so the candidate sees the exact same countdown.
const PRACTICE_LIMIT_SECONDS = 120;

// Format seconds → "M:SS" for the interview-style countdown timer.
function fmtMMSS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

// Guided "app tour" coach-marks. Each step highlights one element (by its
// data-tour id inside the mock panel) and explains it, so the candidate learns
// the real interview screen before it counts. Purely informational.
interface TourStep { id: string; title: string; body: string; }
const PRACTICE_TOUR_STEPS: TourStep[] = [
  { id: 'header', title: 'Interview header', body: 'During the real interview this bar shows your verified identity, the current question, a live 2-minute timer, and the End button.' },
  { id: 'linda', title: 'Meet Linda', body: 'Linda is your AI interviewer. She speaks each question aloud — you can replay it any time.' },
  { id: 'timer', title: 'Your 2-minute timer', body: 'Each question gives you up to 2 minutes. It counts down while you answer; when it reaches 0 the interview moves on automatically.' },
  { id: 'camera', title: 'Your camera & mic', body: 'Stay centered and clearly visible. The bar shows your live mic level so you know you are being heard.' },
  { id: 'answer', title: 'Your answer appears here', body: 'As you speak, your words are transcribed and shown here — exactly like the real interview chat.' },
  { id: 'record', title: 'Just speak — no buttons', body: 'The mic opens automatically after Linda finishes the question — simply speak your introduction. This waveform shows you are being heard. Use Repeat to hear the question again. Nothing is saved.' },
  { id: 'next', title: 'Move on with Next', body: 'When you have finished, click Next. In the real interview this goes to the following question; here Linda gives you a quick "all the best" and you can start.' },
];

// ── Helper: pick a good SpeechSynthesis voice ────────────────────────────────

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  const preferred = [
    'Google UK English Female',
    'Google US English',
    'Microsoft Zira',
    'Samantha',
    'Karen',
    'Moira',
    'Fiona',
  ];
  for (const name of preferred) {
    const v = voices.find((voice) => voice.name.includes(name));
    if (v) return v;
  }
  const english = voices.find(
    (v) => v.lang.startsWith('en') && !v.name.toLowerCase().includes('male')
  );
  return english || voices.find((v) => v.lang.startsWith('en')) || voices[0];
}

// ── Coach-mark tour overlay ──────────────────────────────────────────────────
// Renders INSIDE the mock panel (scoped, not fullscreen): dims the panel, draws
// a spotlight ring around the current step's target ([data-tour="<id>"]), and
// shows a fixed tooltip card at the bottom with the explanation + Next/Skip.
function PracticeTour({
  steps,
  stepIndex,
  panelRef,
  onNext,
  onClose,
}: {
  steps: TourStep[];
  stepIndex: number;
  panelRef: { current: HTMLDivElement | null };
  onNext: () => void;
  onClose: () => void;
}) {
  const [ring, setRing] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const step = steps[stepIndex];

  useEffect(() => {
    if (!step) { setRing(null); return; }
    const compute = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const target = panel.querySelector<HTMLElement>(`[data-tour="${step.id}"]`);
      if (!target) { setRing(null); return; }
      const p = panel.getBoundingClientRect();
      const t = target.getBoundingClientRect();
      setRing({ top: t.top - p.top - 6, left: t.left - p.left - 6, width: t.width + 12, height: t.height + 12 });
    };
    compute();
    const iv = setInterval(compute, 350); // follow layout/state changes
    window.addEventListener('resize', compute);
    return () => { clearInterval(iv); window.removeEventListener('resize', compute); };
  }, [step, stepIndex, panelRef]);

  if (!step) return null;
  const isLast = stepIndex >= steps.length - 1;

  return (
    <div className="absolute inset-0 z-30">
      {/* Spotlight ring — its huge box-shadow dims everything except the target.
          pointer-events-none so the candidate can still click through. */}
      {ring ? (
        <div
          className="absolute rounded-lg ring-2 ring-white/90 pointer-events-none transition-all duration-200"
          style={{ top: ring.top, left: ring.left, width: ring.width, height: ring.height, boxShadow: '0 0 0 9999px rgba(2,6,20,0.72)' }}
        />
      ) : (
        <div className="absolute inset-0 bg-[#020614]/70 pointer-events-none" />
      )}

      {/* Tooltip card — fixed at the bottom of the panel (reliable placement). */}
      <div className="absolute left-1/2 bottom-4 -translate-x-1/2 w-[min(92%,420px)] bg-white rounded-xl shadow-2xl ring-1 ring-black/5 p-4 z-40">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-bold text-gray-900">{step.title}</p>
          <span className="text-[11px] font-medium text-gray-400">{stepIndex + 1} / {steps.length}</span>
        </div>
        <p className="text-sm text-gray-600 leading-relaxed">{step.body}</p>
        <div className="flex items-center justify-end gap-2 mt-3">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors">
            Skip tour
          </button>
          <button type="button" onClick={onNext} className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#3B82F6] hover:bg-[#2563EB] transition-colors">
            {isLast ? 'Got it' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function StepSamplePractice({
  token,
  onStartInterview,
  onGoBack,
  selectedLanguage = 'English',
  submitting = false,
  faceVerification,
}: StepSamplePracticeProps) {
  // ── State ────────────────────────────────────────────────────────────────

  const [micReady, setMicReady] = useState(false);
  // Value no longer read (the Play-question button was removed); keep the setter.
  const [, setVoiceReady] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [typedAnswer, setTypedAnswer] = useState('');
  const [inputMode, setInputMode] = useState<'none' | 'voice' | 'typing'>('none');
  const [audioLevel, setAudioLevel] = useState(0);
  const [ttsSupported, setTtsSupported] = useState(true);
  const [transcribeError, setTranscribeError] = useState('');
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [showReplay, setShowReplay] = useState(false);
  // false in Brave (blocks Google Speech API) and Firefox — backend transcription used instead
  const [hasLiveTranscript, setHasLiveTranscript] = useState(false);
  // true when auto-speak was attempted but TTS didn't start (Brave blocks without user gesture)
  const [autoSpeakBlocked, setAutoSpeakBlocked] = useState(false);
  // Face identity warning shown when verification detects a different person
  const [faceWarning, setFaceWarning] = useState<string | null>(null);
  // Recorded video duration in seconds — null = no recording yet
  const [recordedDurationSeconds, setRecordedDurationSeconds] = useState<number | null>(null);
  // Live elapsed seconds shown during recording
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  // Guided coach-mark tour: -1 = inactive, 0..n-1 = current step index.
  const [tourStep, setTourStep] = useState<number>(-1);
  // True after the candidate clicks Next and Linda plays the sign-off — stops
  // the auto-record-on-question-end from re-opening the mic.
  const [practiceDone, setPracticeDone] = useState(false);
  const practiceDoneRef = useRef(false);
  // Accumulated seconds the candidate has spent ANSWERING (excludes time while
  // Linda is speaking) — drives the 2-min countdown and survives Repeat.
  const [answerElapsed, setAnswerElapsed] = useState(0);
  // True when the 2-minute budget elapsed (as opposed to the candidate clicking
  // Next) — shows a "Time's up" message before Linda's sign-off.
  const [timedUp, setTimedUp] = useState(false);
  // Gate: Linda does NOT speak on entry. The candidate must click "Start
  // Practice" first (also gives TTS a user gesture, Brave-safe).
  const [started, setStarted] = useState(false);

  // ── Refs ─────────────────────────────────────────────────────────────────

  const videoRef = useRef<HTMLVideoElement>(null);
  const replayVideoRef = useRef<HTMLVideoElement>(null);
  // Scopes the coach-mark tour spotlight to the mock panel (not the browser).
  const panelRef = useRef<HTMLDivElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  // Ensures the voice-identity practice top-up capture runs at most once.
  const voiceTopUpDoneRef = useRef(false);
  const audioChunksRef = useRef<Blob[]>([]);
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const recognitionRef = useRef<any>(null);
  const webSpeechFinalRef = useRef('');
  // Proactively restarts Web Speech recognition every 50s (it degrades/stops
  // after ~60s of continuous use) — same policy as the live interview.
  const webSpeechRestartRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveTranscriptRef = useRef('');
  const audioMimeTypeUsedRef = useRef('');
  const hasAutoSpokeRef = useRef(false);
  const startRecordingRef = useRef<() => void>(() => {});
  const periodicTranscriptionRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const periodicTranscriptionInFlightRef = useRef(false);
  const recordingStartTimeRef = useRef<number | null>(null);
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Webcam + mic setup on mount ──────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    const initMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        mediaStreamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setMicReady(true);

        // Audio analyser for level meter
        const AudioContextImpl: typeof AudioContext =
          window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioContextImpl();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.fftSize);
        const tick = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteTimeDomainData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const v = (dataArray[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / dataArray.length);
          setAudioLevel(Math.min(rms * 5, 1));
          animationFrameRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch (err) {
        console.error('Failed to access camera/mic:', err);
      }
    };

    initMedia();

    if (!window.speechSynthesis) {
      setTtsSupported(false);
    }

    return () => {
      cancelled = true;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
        mediaRecorderRef.current = null;
      }
      if (videoRecorderRef.current && videoRecorderRef.current.state !== 'inactive') {
        try { videoRecorderRef.current.stop(); } catch { /* ignore */ }
        videoRecorderRef.current = null;
      }
      if (webSpeechRestartRef.current) {
        clearInterval(webSpeechRestartRef.current);
        webSpeechRestartRef.current = null;
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ignore */ }
        recognitionRef.current = null;
      }
      if (periodicTranscriptionRef.current) {
        clearInterval(periodicTranscriptionRef.current);
        periodicTranscriptionRef.current = null;
      }
      if (elapsedIntervalRef.current) {
        clearInterval(elapsedIntervalRef.current);
        elapsedIntervalRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      analyserRef.current = null;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      window.speechSynthesis?.cancel();
      // Stop face verification when leaving this step
      faceVerification?.stopVerification();
    };
  }, []);

  // ── Start face verification once camera is live ───────────────────────────
  useEffect(() => {
    if (!micReady || !faceVerification?.hasBaseline()) return;
    if (!videoRef.current) return;
    faceVerification.startVerification(videoRef.current);
    return () => {
      faceVerification.stopVerification();
    };
  }, [micReady, faceVerification]);

  // ── TTS: Speak the practice question ──────────────────────────────────────
  // Called only on explicit user click so the browser always has a user gesture.

  // scriptOverride lets Repeat speak ONLY the question (no greeting). The initial
  // auto-speak passes nothing → full greeting + question.
  const speakQuestion = useCallback((scriptOverride?: string) => {
    if (!window.speechSynthesis) {
      setTtsSupported(false);
      return;
    }

    // Cancel any ongoing speech first
    window.speechSynthesis.cancel();

    const scriptToSpeak = scriptOverride ?? PRACTICE_SPOKEN_SCRIPT;

    const doSpeak = (voice: SpeechSynthesisVoice | null) => {
      // Resume in case the synth engine was paused
      window.speechSynthesis.resume();

      const utterance = new SpeechSynthesisUtterance(scriptToSpeak);
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      if (voice) utterance.voice = voice;

      utterance.onstart = () => setAiSpeaking(true);
      // When Linda finishes the question, AUTO-OPEN the mic (no manual Start
      // button) — just like the real interview's "your turn, speak now". Guarded
      // so the practice-complete sign-off never re-opens the mic.
      utterance.onend = () => {
        setAiSpeaking(false);
        if (!practiceDoneRef.current) {
          setTimeout(() => { if (!practiceDoneRef.current) startRecordingRef.current?.(); }, 150);
        }
      };
      utterance.onerror = (e) => {
        const err = (e as SpeechSynthesisErrorEvent).error;
        // 'interrupted'/'canceled' are expected when cancel() is called — not real errors
        if (err === 'interrupted' || err === 'canceled') return;
        // 'not-allowed': browser blocked TTS (no user gesture — e.g. auto-speak in Brave)
        // Don't disable the button; user can still click Play Question manually
        setAiSpeaking(false);
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    };

    // IMPORTANT: speechSynthesis.speak() MUST be called in the same synchronous task as
    // the user gesture in Brave. Any setTimeout or async boundary breaks user-gesture context
    // and Brave rejects with 'not-allowed'.
    //
    // Brave fingerprint protection can return an empty getVoices() list — we must NOT wait
    // for voiceschanged in that case. Instead, call speak() synchronously with null voice
    // (system default), then upgrade to the preferred voice when voices load.
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      // Voices already available (Brave / most Chromium browsers): call synchronously
      doSpeak(pickVoice());
    } else {
      // Voices not yet available — speak immediately with system default to preserve user-gesture context.
      // This is critical for Brave where getVoices() may always return [] due to fingerprint protection.
      doSpeak(null);

      // Upgrade to preferred voice if voiceschanged fires while we're still speaking
      let upgraded = false;
      const onVoicesChanged = () => {
        if (upgraded) return;
        upgraded = true;
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
        const preferred = pickVoice();
        if (!preferred || !window.speechSynthesis.speaking) return;
        // Re-speak with better voice (user gesture context no longer needed — TTS is already running)
        window.speechSynthesis.cancel();
        doSpeak(preferred);
      };
      window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
      // Cleanup listener if voiceschanged never fires (no memory leak)
      setTimeout(() => {
        if (upgraded) return;
        upgraded = true;
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
      }, 3000);
    }
  }, []);

  // Keep ref in sync with liveTranscript state (avoids stale-closure issues in callbacks)
  useEffect(() => { liveTranscriptRef.current = liveTranscript; }, [liveTranscript]);

  // Linda does NOT auto-speak on entry — the candidate starts the practice via
  // the "Start Practice" button (handleStartPractice), which speaks in the
  // click's user-gesture context (Brave-safe). See handleStartPractice below.

  // Fallback: if TTS autoplay was blocked (Brave) the question's onend never
  // fires, so the mic would never auto-open. Open it anyway — the question is
  // still readable in the chat bubble, and the candidate can Repeat to hear it.
  // Only after the candidate has started.
  useEffect(() => {
    if (started && autoSpeakBlocked && micReady && !practiceDoneRef.current) {
      startRecordingRef.current?.();
    }
  }, [started, autoSpeakBlocked, micReady]);

  // ── Periodic backend transcription (Brave / Firefox fallback) ────────────
  // Brave blocks webkitSpeechRecognition (Google cloud API). Instead, we send the
  // accumulated audio blob to the Whisper backend every 5 seconds to give near-live
  // transcript feedback (~5s lag). Firefox uses this path too.

  const stopPeriodicTranscription = useCallback(() => {
    if (periodicTranscriptionRef.current) {
      clearInterval(periodicTranscriptionRef.current);
      periodicTranscriptionRef.current = null;
    }
  }, []);

  const requestPeriodicTranscript = useCallback(async () => {
    if (periodicTranscriptionInFlightRef.current) return;
    const chunks = audioChunksRef.current;
    // Send an earlier first sample so short practice answers still get live text.
    if (chunks.length < 2) return;
    if (mediaRecorderRef.current?.state !== 'recording') return;

    periodicTranscriptionInFlightRef.current = true;
    const mimeType = audioMimeTypeUsedRef.current || 'audio/webm';
    const snapshot = chunks.slice();
    const blob = new Blob(snapshot, { type: mimeType });
    const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm';
    const file = new File([blob], `live.${ext}`, { type: mimeType });

    try {
      const text = await candidateAIInterviewService.transcribePracticeAudio(token, file);
      const trimmed = text.trim();
      // Filter Whisper hallucinations BEFORE displaying. The practice mic is
      // typically open in a near-silent room while the candidate listens to
      // the question, which is exactly the input that triggers Whisper to
      // emit "Please help! This is a big problem!", "Transcription by ESO…",
      // and looping repetitions of the previous decoded n-gram.
      if (
        trimmed &&
        isTranscriptMeaningful(trimmed) &&
        mediaRecorderRef.current?.state === 'recording'
      ) {
        setLiveTranscript(trimmed);
        setHasLiveTranscript(true);
      }
    } catch {
      // Best-effort only — final transcription still runs on stop.
    } finally {
      periodicTranscriptionInFlightRef.current = false;
    }
  }, [token]);

  const startPeriodicTranscription = useCallback(() => {
    if (periodicTranscriptionRef.current) return;
    const kickOff = () => {
      void requestPeriodicTranscript();
    };
    // Fire an early first attempt so the candidate sees live text quickly.
    window.setTimeout(kickOff, 1500);
    periodicTranscriptionRef.current = setInterval(kickOff, 2500);
  }, [requestPeriodicTranscript]);

  // ── Live transcription (Web Speech API) ──────────────────────────────────

  const startLiveTranscription = useCallback(() => {
    // Brave blocks Google's cloud Speech API — skip directly to periodic transcription
    const isBrave = typeof navigator !== 'undefined' && 'brave' in navigator;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition || isBrave) {
      // No Web Speech API (Firefox/Brave) — use periodic backend transcription.
      setHasLiveTranscript(false);
      startPeriodicTranscription();
      return;
    }
    setHasLiveTranscript(true);
    // Some browsers expose SpeechRecognition but do not yield timely interim results.
    // Keep backend near-live transcription running as a safety net.
    startPeriodicTranscription();

    webSpeechFinalRef.current = '';
    setLiveTranscript('');

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      // Process only NEW results from event.resultIndex onwards — avoids
      // re-processing old results on each event and survives recognition restarts.
      let newFinals = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          newFinals += t + ' ';
        } else {
          interimText += t;
        }
      }
      // Accumulate finals — never overwrite — so restart-after-silence doesn't
      // lose what was already finalized.
      if (newFinals.trim()) {
        webSpeechFinalRef.current = (webSpeechFinalRef.current + ' ' + newFinals).trim();
      }
      const combined = webSpeechFinalRef.current + (interimText ? ' ' + interimText : '');
      setLiveTranscript(combined.trim());
    };

    recognition.onerror = (e: any) => {
      const code: string = e?.error ?? '';
      // 'service-not-allowed': browser policy blocks Google's cloud Speech API.
      // 'not-allowed': mic permission denied.
      // 'network': API endpoint unreachable.
      // In all these cases live Web Speech will never produce results —
      // fall back to periodic backend (Whisper) transcription.
      if (code === 'service-not-allowed' || code === 'not-allowed' || code === 'network') {
        setHasLiveTranscript(false);
        try { recognition.stop(); } catch { /* ignore */ }
        recognitionRef.current = null;
        startPeriodicTranscription(); // start backend-based near-live transcript
      }
      // All other errors (aborted, audio-capture, no-speech…) are transient — ignore.
    };

    recognition.onend = () => {
      // Restart if still recording (recognition can time out after silence)
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try { recognition.start(); } catch { /* ignore */ }
      }
    };

    recognitionRef.current = recognition;
    try { recognition.start(); } catch { /* ignore */ }

    // Restart the recognizer every 50s. The Web Speech API silently degrades /
    // ends after ~60s of continuous listening, so we stop it at 50s — onend
    // (above) immediately restarts it, and webSpeechFinalRef keeps the text
    // accumulated across restarts so nothing is lost. Same as the live interview.
    if (webSpeechRestartRef.current) clearInterval(webSpeechRestartRef.current);
    webSpeechRestartRef.current = setInterval(() => {
      if (mediaRecorderRef.current?.state === 'recording' && recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* onend restarts it */ }
      }
    }, 50000);
  }, [startPeriodicTranscription]);

  const stopLiveTranscription = useCallback(() => {
    if (webSpeechRestartRef.current) {
      clearInterval(webSpeechRestartRef.current);
      webSpeechRestartRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    stopPeriodicTranscription();
    setHasLiveTranscript(false);
  }, [stopPeriodicTranscription]);

  // ── Recording + transcription ─────────────────────────────────────────────

  const stopRecordingAndTranscribe = useCallback(async () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;

    setIsRecording(false);

    // Compute and store how long the recording lasted
    const durationMs = recordingStartTimeRef.current !== null
      ? Date.now() - recordingStartTimeRef.current
      : 0;
    const durationSec = Math.floor(durationMs / 1000);
    setRecordedDurationSeconds(durationSec);
    recordingStartTimeRef.current = null;
    if (elapsedIntervalRef.current) {
      clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
    setRecordingElapsed(0);

    stopLiveTranscription();

    // Capture browser live transcript before clearing state.
    // Use refs (not state) — both are always current at call time.
    const browserTranscript = webSpeechFinalRef.current.trim() || liveTranscriptRef.current.trim();
    setLiveTranscript('');

    // Stop audio recorder
    await new Promise<void>((resolve) => {
      const mr = mediaRecorderRef.current!;
      mr.onstop = () => resolve();
      try { mr.stop(); } catch { resolve(); }
    });
    const chunks = audioChunksRef.current;
    audioChunksRef.current = [];
    mediaRecorderRef.current = null;

    // Stop video recorder and create replay URL
    if (videoRecorderRef.current && videoRecorderRef.current.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        const vr = videoRecorderRef.current!;
        vr.onstop = () => resolve();
        try { vr.stop(); } catch { resolve(); }
      });
    }
    const videoChunks = videoChunksRef.current;
    videoChunksRef.current = [];
    videoRecorderRef.current = null;
    if (videoChunks.length > 0) {
      const vMime = videoChunks[0].type || 'video/webm';
      const videoBlob = new Blob(videoChunks, { type: vMime });
      setRecordedVideoUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(videoBlob); });
      setShowReplay(true); // auto-show playback after recording stops
    }

    // If we already have a browser transcript, show it immediately while
    // the backend call runs in the background for a more accurate result.
    if (browserTranscript) {
      setTranscript(browserTranscript);
      setInputMode('voice');
      setVoiceReady(true);
    }

    if (chunks.length === 0) {
      if (!browserTranscript) {
        setTranscribeError('No audio captured. Please speak for at least 1 second before stopping.');
      }
      return;
    }

    setIsTranscribing(true);
    setTranscribeError('');

    // chunks[0].type may be empty in Safari when no mimeType was specified at MediaRecorder creation.
    // Fall back to the mimeType we requested, then to audio/mp4 (Safari's native format).
    const recordedMime = chunks[0]?.type || '';
    const effectiveMime = recordedMime || audioMimeTypeUsedRef.current || 'audio/mp4';
    const audioBlob = new Blob(chunks, { type: effectiveMime });
    // Derive correct extension so backend (Whisper) processes it correctly
    const ext = effectiveMime.includes('ogg') ? 'ogg' : effectiveMime.includes('mp4') ? 'mp4' : 'webm';
    const namedBlob = new File([audioBlob], `practice.${ext}`, { type: effectiveMime });

    try {
      const text = await candidateAIInterviewService.transcribePracticeAudio(token, namedBlob);
      const trimmed = text.trim();
      // Apply the same Whisper-hallucination filter as the live periodic
      // transcription path. If the final transcript is just a hallucination
      // ("Please help! …", subtitle attribution, etc.), prefer the browser
      // transcript when available, otherwise treat as no-speech.
      if (trimmed && isTranscriptMeaningful(trimmed)) {
        setTranscript(trimmed);
        setInputMode('voice');
        setVoiceReady(true);
      } else if (!browserTranscript) {
        setTranscribeError('No speech detected. Please try speaking again.');
      }
    } catch {
      // Backend transcription unavailable — silently use browser transcript if present
      if (!browserTranscript) {
        setTranscribeError('Could not transcribe — please type your answer or try again.');
      }
      // If browserTranscript exists it was already shown above — no error needed
    } finally {
      setIsTranscribing(false);
    }
  }, [token, stopLiveTranscription]);

  const startRecording = useCallback(() => {
    // Guard: don't start if already recording or TTS is still speaking
    if (mediaRecorderRef.current?.state === 'recording') return;
    if (!mediaStreamRef.current?.active) return;

    // Audio-only stream for recording
    const audioTracks = mediaStreamRef.current.getAudioTracks();
    if (audioTracks.length === 0) return;

    const audioStream = new MediaStream(audioTracks);
    audioChunksRef.current = [];

    // Pick best supported MIME type (try/catch required — Safari may throw on isTypeSupported)
    const mimeType = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4',  // Safari / Firefox fallback
    ].find((m) => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } }) || '';
    audioMimeTypeUsedRef.current = mimeType;

    const mr = new MediaRecorder(audioStream, mimeType ? { mimeType } : undefined);
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };
    mediaRecorderRef.current = mr;
    mr.start(500);

    // Voice-identity top-up (best-effort, non-blocking): capture ~8 s of PCM
    // while the candidate answers this practice question and add it to their
    // enrolled voiceprint (stage=practice). Averaging the system-check "reading"
    // voice with the "answering" voice makes verification more robust to the
    // way people naturally speak differently when reading vs. conversing.
    if (!voiceTopUpDoneRef.current) {
      voiceTopUpDoneRef.current = true;
      // Use the audio-only stream (non-null local) rather than the ref.
      recordPcm16(audioStream, 8000)
        .then((cap) => {
          // Only send a top-up that actually contains speech — never poison the
          // averaged voiceprint with a silent/noise-only sample.
          if (cap && cap.speechDetected) return candidateAIInterviewService.enrollVoice(
            token, cap.blob, 'practice', cap.sampleRate, cap.noiseFloor,
          );
        })
        .catch(() => { /* best-effort */ });
    }

    // Video+audio recorder for replay
    if (recordedVideoUrl) { URL.revokeObjectURL(recordedVideoUrl); setRecordedVideoUrl(null); }
    setShowReplay(false);
    videoChunksRef.current = [];
    const videoMimeType = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',  // Safari H.264/AAC
      'video/mp4',
    ].find((m) => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } }) || '';
    const vr = new MediaRecorder(
      mediaStreamRef.current!,
      videoMimeType ? { mimeType: videoMimeType } : undefined,
    );
    vr.ondataavailable = (e) => { if (e.data.size > 0) videoChunksRef.current.push(e.data); };
    videoRecorderRef.current = vr;
    vr.start(500);

    setIsRecording(true);
    setTranscript('');
    setTypedAnswer('');
    setInputMode('none');
    setTranscribeError('');
    setLiveTranscript('');
    setRecordedDurationSeconds(null);

    // Track recording start time for duration calculation
    recordingStartTimeRef.current = Date.now();
    setRecordingElapsed(0);
    if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
    elapsedIntervalRef.current = setInterval(() => {
      if (recordingStartTimeRef.current !== null) {
        setRecordingElapsed(Math.floor((Date.now() - recordingStartTimeRef.current) / 1000));
      }
    }, 500);

    // Start live transcription via Web Speech API (Chromium only — silent fallback on Firefox/Brave)
    startLiveTranscription();
  }, [startLiveTranscription]);

  // Keep ref in sync so speakQuestion.onend can call the latest startRecording
  useEffect(() => { startRecordingRef.current = startRecording; }, [startRecording]);

  // Linda's spoken sign-off after the candidate finishes the practice. Runs from
  // the Next-button click (user gesture → Brave-safe). A plain utterance so it
  // doesn't trip the auto-record-on-end path (that only lives on speakQuestion).
  const speakClosing = useCallback(() => {
    if (!window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
      const u = new SpeechSynthesisUtterance(PRACTICE_CLOSING_MESSAGE);
      u.rate = 0.95; u.pitch = 1.0; u.volume = 1.0;
      const v = pickVoice(); if (v) u.voice = v;
      u.onstart = () => setAiSpeaking(true);
      u.onend = () => setAiSpeaking(false);
      u.onerror = () => setAiSpeaking(false);
      utteranceRef.current = u;
      window.speechSynthesis.speak(u);
    } catch { /* best-effort */ }
  }, []);

  // Next — like the real interview's "Next Question": wrap up the answer (stop
  // the auto-recording), then Linda plays the "you're ready — all the best"
  // sign-off. Marks the practice done so the mic doesn't auto-reopen.
  const handlePracticeNext = useCallback(() => {
    practiceDoneRef.current = true;
    setPracticeDone(true);
    if (isRecording) stopRecordingAndTranscribe();
    speakClosing();
  }, [isRecording, stopRecordingAndTranscribe, speakClosing]);

  // Start the practice — Linda speaks the greeting + question NOW (in the click's
  // user-gesture context so browsers don't block TTS). onend then auto-opens the
  // mic. Nothing plays before this.
  const handleStartPractice = useCallback(() => {
    if (started) return;
    setStarted(true);
    hasAutoSpokeRef.current = true;
    speakQuestion();
    // If TTS was silently blocked (Brave), flag it so the fallback opens the mic.
    setTimeout(() => { if (!window.speechSynthesis?.speaking) setAutoSpeakBlocked(true); }, 2000);
  }, [started, speakQuestion]);

  // ── Derived ───────────────────────────────────────────────────────────────

  // Show live transcript while recording, final transcript when done
  const displayAnswer = isRecording
    ? liveTranscript
    : inputMode === 'voice'
    ? transcript
    : typedAnswer;
  const hasAnswer = (isRecording ? false : displayAnswer.trim().length > 0);

  // Interview-style countdown from the ACCUMULATED answering time (which pauses
  // while Linda speaks) — full 2:00 until the candidate starts answering.
  const secondsLeft = Math.max(0, PRACTICE_LIMIT_SECONDS - answerElapsed);
  const timerLow = secondsLeft <= 30 && answerElapsed > 0;

  // Countdown ticks ONLY while the answer window is open AND Linda is NOT
  // speaking. So Repeat (Linda re-speaks → aiSpeaking) PAUSES the timer, and it
  // RESUMES from where it left when she finishes — it never resets.
  useEffect(() => {
    if (!isRecording || aiSpeaking || practiceDone) return;
    const iv = setInterval(() => {
      setAnswerElapsed((s) => Math.min(PRACTICE_LIMIT_SECONDS, s + 1));
    }, 1000);
    return () => clearInterval(iv);
  }, [isRecording, aiSpeaking, practiceDone]);

  // Auto-finish at the 2-minute budget — mirrors the real per-question timeout:
  // show "Time's up", stop the answer, and have Linda play the sign-off (exactly
  // what the Next button does). Guarded by practiceDone so it fires once.
  useEffect(() => {
    if (!practiceDone && answerElapsed >= PRACTICE_LIMIT_SECONDS) {
      setTimedUp(true);
      handlePracticeNext();
    }
  }, [answerElapsed, practiceDone, handlePracticeNext]);

  // Launch the guided coach-mark tour once, shortly after mount (so target
  // elements are laid out). Candidate can re-open it via the "Tips" button.
  useEffect(() => {
    const t = setTimeout(() => setTourStep((s) => (s === -1 ? 0 : s)), 900);
    return () => clearTimeout(t);
  }, []);

  // Practice recording is OPTIONAL — there is no minimum-duration gate. The
  // candidate can start the interview at any time, or skip the practice step.


  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4" style={{ colorScheme: 'light' }}>
      {/* Medium-speed blink used by the PRACTICE SESSION label and the
          Recording badge (1.4s cycle — steady, not fast). */}
      <style>{`
        @keyframes tf-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.25; }
        }
        .tf-blink { animation: tf-blink 1.4s ease-in-out infinite; }
      `}</style>
      {/* Header */}
      <div className="text-center space-y-1">
        <span className="inline-block px-4 py-1.5 rounded-full bg-gray-100 text-gray-700 text-sm font-medium">
          Practice &amp; Final Check
        </span>
        <h2 className="text-2xl font-bold text-gray-900">Let&apos;s Test Your Setup</h2>
        <p className="text-gray-500 text-sm">Answer the practice question to verify your mic and camera — this won&apos;t be scored.</p>
      </div>

      {/* ── Main interview-like panel (the embedded "screen") ──
          `relative` so the coach-mark tour overlay is scoped to THIS panel
          (not the whole browser) — practice stays inside its box, not fullscreen. */}
      <div ref={panelRef} className="relative rounded-2xl overflow-hidden border border-gray-800 shadow-2xl bg-[#0A1020]">

        {/* Interview-style header — mirrors the real interview top bar so the
            candidate sees exactly what to expect: identity chip, question
            counter, live 2-minute timer, a PRACTICE badge (where the real one
            shows LIVE), and a Tips button that re-opens the guided tour. */}
        <div data-tour="header" className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-white/[0.07] bg-gradient-to-r from-[#7C3AED] to-[#DB2777]">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare className="w-4 h-4 text-white/90 flex-shrink-0" />
            <div className="leading-tight min-w-0">
              <p className="text-sm font-semibold text-white truncate">Practice with Linda</p>
              <p className="text-[11px] text-white/70">Guided warm-up · nothing is saved</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/15 text-white text-[11px] font-medium ring-1 ring-white/20">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l7 4v6c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-4z" /></svg>
              ID Verified
            </span>
            <span className="inline-flex items-center px-2 py-1 rounded-md bg-white/15 text-white text-[11px] font-semibold ring-1 ring-white/20">
              Practice · Q 1/1
            </span>
            <span data-tour="timer" className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold tabular-nums ring-1 ${
              timerLow ? 'bg-red-500 text-white ring-red-300/50 tf-blink' : 'bg-white/15 text-white ring-white/20'
            }`}>
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M9 2h6" /></svg>
              {fmtMMSS(secondsLeft)}
            </span>
            <span className="tf-blink inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-400 text-gray-900 text-[11px] font-bold ring-1 ring-amber-300 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-900" /> PRACTICE
            </span>
            <button
              type="button"
              onClick={() => setTourStep(0)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white text-[11px] font-medium ring-1 ring-white/20 transition-colors"
              title="Show the guided tour"
            >
              ? Tips
            </button>
          </div>
        </div>

        {/* 2-Column Grid — LEFT: Linda avatar + your webcam · RIGHT: chat.
            Mirrors the real interview screen (kept inside this panel, not fullscreen). */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-white/[0.06]">
        {/* ── Left: Linda avatar (top) + your webcam (bottom) ── */}
        <div className="lg:col-span-1 flex flex-col bg-[#0A1020] divide-y divide-white/[0.06]">
          {/* Linda avatar */}
          <div data-tour="linda" className="relative flex-1 flex flex-col items-center justify-center p-5 gap-2.5" style={{ minHeight: '220px' }}>
            <div className="absolute top-3 left-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA] animate-pulse" />
              <span className="text-[10px] font-medium tracking-wide uppercase text-[#64748B]">Linda · AI Interviewer</span>
            </div>
            <div
              className={`relative w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden border-4 transition-colors duration-300 ${aiSpeaking ? 'border-[#7C3AED]/70' : 'border-white/15'}`}
              style={aiSpeaking ? { boxShadow: '0 0 34px 6px rgba(124,58,237,0.35)' } : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/linda-avatar.webp"
                alt="Linda — AI Interviewer"
                className="w-full h-full object-cover"
                onError={(e) => { const el = e.currentTarget; if (!el.dataset.fb) { el.dataset.fb = '1'; el.src = '/linda-3.png'; } }}
              />
              {aiSpeaking && <span className="absolute inset-0 rounded-full ring-2 ring-[#7C3AED]/40 animate-ping" />}
            </div>
            <p className="text-white font-semibold text-lg leading-none">Linda</p>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              aiSpeaking ? 'bg-[#7C3AED]/20 text-[#C4B5FD]' : isRecording ? 'bg-red-500/15 text-red-300' : 'bg-white/10 text-[#94A3B8]'
            }`}>
              {aiSpeaking ? (
                <>
                  <span className="flex items-end gap-0.5 h-3">
                    <span className="w-0.5 bg-[#A78BFA] animate-pulse" style={{ height: '40%' }} />
                    <span className="w-0.5 bg-[#A78BFA] animate-pulse" style={{ height: '90%', animationDelay: '0.15s' }} />
                    <span className="w-0.5 bg-[#A78BFA] animate-pulse" style={{ height: '60%', animationDelay: '0.3s' }} />
                  </span>
                  Speaking…
                </>
              ) : isRecording ? '● Listening' : isTranscribing ? 'Processing…' : 'Ready'}
            </span>
          </div>

          {/* Your webcam (stacked below the avatar, like the real interview) */}
          <div data-tour="camera" className="relative p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-[10px] font-medium tracking-wide uppercase text-[#64748B]">You</span>
            </div>
            <div className="relative bg-black rounded-xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
              <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${showReplay ? 'hidden' : ''}`} />
              {showReplay && recordedVideoUrl && (
                <video ref={replayVideoRef} src={recordedVideoUrl} controls playsInline controlsList="nodownload nopictureinpicture" disablePictureInPicture onContextMenu={(e) => e.preventDefault()} className="w-full h-full object-cover" />
              )}
              {!showReplay && (
                <div className="absolute bottom-0 left-0 right-0 px-3 pb-2.5">
                  <div className="h-1 bg-gray-800/60 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-75 ${audioLevel > 0.3 ? 'bg-green-400' : audioLevel > 0.05 ? 'bg-yellow-400' : 'bg-gray-600'}`} style={{ width: `${Math.max(audioLevel * 100, 2)}%` }} />
                  </div>
                </div>
              )}
              {!showReplay && (isRecording || isTranscribing) && (
                <div className={`absolute top-2 left-2 flex items-center rounded-full backdrop-blur-sm text-white ${isRecording ? 'tf-blink gap-1.5 text-xs font-bold px-2.5 py-1 bg-red-500 shadow-lg shadow-red-500/40 ring-2 ring-red-300/50' : 'gap-1.5 text-xs font-medium px-2.5 py-1 bg-blue-600/90'}`}>
                  {isRecording ? (<><span className="w-2 h-2 bg-white rounded-full animate-ping" />{`REC · ${recordingElapsed}s`}</>) : (<><Loader2 className="w-3 h-3 animate-spin" /> Transcribing…</>)}
                </div>
              )}
              {showReplay && (
                <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-blue-600/90 text-white text-xs font-medium px-2.5 py-1 rounded-full backdrop-blur-sm"><Play className="w-3 h-3" /> Playback</div>
              )}
              {recordedVideoUrl && !isRecording && !isTranscribing && (
                <div className="absolute top-2 right-2 flex items-center bg-black/70 backdrop-blur-sm rounded-full p-0.5 gap-0.5">
                  <button type="button" onClick={() => setShowReplay(false)} className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors ${!showReplay ? 'bg-white text-gray-900' : 'text-gray-400 hover:text-white'}`}>Live</button>
                  <button type="button" onClick={() => setShowReplay(true)} className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors ${showReplay ? 'bg-white text-gray-900' : 'text-gray-400 hover:text-white'}`}>Replay</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: chat thread + controls ── */}
        <div className="relative lg:col-span-2 flex flex-col bg-[#060D1A]" style={{ minHeight: '360px' }}>
          {/* Bottom-centered status banner (matches the real interview): red
              "Hold on — Linda is speaking" while she talks, green "Your turn"
              while the mic is open. Floats above the control bar. */}
          {(() => {
            const variant: 'hold' | 'turn' | null =
              aiSpeaking ? 'hold'
              : (started && isRecording) ? 'turn'
              : null;
            if (!variant) return null;
            const cfg = variant === 'turn'
              ? { grad: 'from-emerald-400 to-teal-500', ring: 'ring-emerald-200/60', glow: 'shadow-emerald-500/30', title: 'Your turn — speak now', subtitle: 'Microphone is active · Linda is listening' }
              : { grad: 'from-rose-500 to-red-600', ring: 'ring-rose-200/50', glow: 'shadow-red-600/30', title: 'Hold on — Linda is speaking', subtitle: 'Please wait until she finishes the question' };
            return (
              <div className="absolute inset-x-0 bottom-[74px] z-20 flex justify-center px-4 pointer-events-none">
                <div className={`relative flex items-center gap-3 pl-3 pr-4 py-2.5 rounded-2xl bg-gradient-to-br ${cfg.grad} ring-1 ${cfg.ring} shadow-2xl ${cfg.glow} backdrop-blur-md min-w-[240px] max-w-[94%]`}>
                  <div className="relative shrink-0">
                    <div className="w-9 h-9 rounded-full bg-white/25 ring-1 ring-white/40 flex items-center justify-center">
                      {variant === 'turn' ? (
                        <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" strokeLinecap="round" /><line x1="8" y1="23" x2="16" y2="23" strokeLinecap="round" /></svg>
                      ) : (
                        <svg className="w-4.5 h-4.5 text-white" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                      )}
                    </div>
                    <span className="absolute inset-0 rounded-full ring-2 ring-white/50 animate-ping opacity-40" />
                  </div>
                  <div className="relative min-w-0">
                    <span className="text-white font-bold block leading-tight" style={{ fontSize: 14 }}>{cfg.title}</span>
                    <span className="text-white/85 text-[11px] leading-snug block">{cfg.subtitle}</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Start-practice gate — Linda stays silent until the candidate clicks
              Start (also gives TTS a user gesture). Sits over the chat panel. */}
          {!started && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#060D1A]/85 backdrop-blur-sm p-6">
              <div className="text-center max-w-sm">
                <div className="w-14 h-14 rounded-full bg-[#7C3AED]/20 ring-1 ring-[#7C3AED]/40 flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="w-7 h-7 text-[#A78BFA]" />
                </div>
                <h3 className="text-white text-lg font-semibold mb-1.5">Ready for a quick practice?</h3>
                <p className="text-[#94A3B8] text-sm leading-relaxed mb-5">
                  When you click Start, Linda will greet you and ask you to introduce yourself. Answer just like the real interview — nothing here is saved.
                </p>
                <button
                  type="button"
                  onClick={handleStartPractice}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#3B82F6] hover:bg-[#2563EB] shadow-lg shadow-blue-500/20 transition-all"
                >
                  <Play className="w-4 h-4" /> Start Practice
                </button>
              </div>
            </div>
          )}
          {/* Chat thread — Linda bubbles (left) + your answer bubble (right) */}
          <div data-tour="answer" className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: '420px' }}>
            {/* Linda greeting */}
            <div className="flex items-start gap-2">
              <div className="w-6 h-6 rounded-full bg-[#7C3AED] flex items-center justify-center flex-shrink-0 mt-0.5"><MessageSquare className="w-3.5 h-3.5 text-white" /></div>
              <div className="max-w-[88%]">
                <p className="text-[10px] font-semibold text-[#A78BFA] mb-1">LINDA</p>
                <div className="bg-[#1E293B]/80 border border-white/[0.08] rounded-2xl rounded-tl-sm px-3.5 py-2.5">
                  <p className="text-[#E2E8F0] text-sm leading-relaxed">{PRACTICE_GREETING}</p>
                </div>
              </div>
            </div>
            {/* Linda practice question + play + reassurance chip */}
            <div className="flex items-start gap-2">
              <div className="w-6 h-6 rounded-full bg-[#7C3AED] flex items-center justify-center flex-shrink-0 mt-0.5"><MessageSquare className="w-3.5 h-3.5 text-white" /></div>
              <div className="max-w-[88%] space-y-2">
                <div className="bg-[#1E293B]/80 border border-white/[0.08] rounded-2xl rounded-tl-sm px-3.5 py-2.5">
                  <p className="text-[11px] text-[#64748B] font-medium uppercase tracking-wide mb-1">Practice question</p>
                  <p className="text-[#E2E8F0] text-sm leading-relaxed font-medium">&ldquo;{PRACTICE_QUESTION}&rdquo;</p>
                </div>
                {/* Play/Replay-question button removed — the Repeat button in the
                    control bar does the same thing (replays only the question). */}
              </div>
            </div>
            {/* Your answer bubble (right) — live while recording, final after */}
            {(isRecording || isTranscribing || (displayAnswer && displayAnswer.trim()) || (typedAnswer && typedAnswer.trim())) && (
              <div className="flex items-start gap-2 flex-row-reverse">
                <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 mt-0.5 text-white text-[9px] font-bold">You</div>
                <div className="max-w-[88%]">
                  <p className="text-[10px] font-semibold text-emerald-400 mb-1 text-right">YOUR RESPONSE {isTranscribing && <span className="text-[#60A5FA]">· enhancing…</span>}</p>
                  <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-2xl rounded-tr-sm px-3.5 py-2.5">
                    {isRecording && !liveTranscript && !hasLiveTranscript ? (
                      <span className="inline-flex items-center gap-2 text-sm text-[#94A3B8]"><span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-ping" /> Recording your voice…</span>
                    ) : (
                      <p className="text-[#E2E8F0] text-sm leading-relaxed">{isRecording ? liveTranscript : (displayAnswer || typedAnswer)}{isRecording && <span className="animate-pulse text-[#3B82F6]">▌</span>}</p>
                    )}
                  </div>
                  {transcribeError && !isTranscribing && <p className="text-xs text-red-400 mt-1 text-right">{transcribeError}</p>}
                </div>
              </div>
            )}
            {/* Time's-up notice when the 2 minutes elapsed (not a manual Next). */}
            {timedUp && (
              <div className="flex justify-center py-1">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-200 bg-amber-500/15 border border-amber-500/30 rounded-full px-3 py-1">
                  ⏱ Time&apos;s up — that&apos;s the 2 minutes. Moving on…
                </span>
              </div>
            )}
            {/* Linda's sign-off after Next / timeout — "you're ready, all the best". */}
            {practiceDone && (
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-[#7C3AED] flex items-center justify-center flex-shrink-0 mt-0.5"><MessageSquare className="w-3.5 h-3.5 text-white" /></div>
                <div className="max-w-[88%]">
                  <p className="text-[10px] font-semibold text-[#A78BFA] mb-1">LINDA</p>
                  <div className="bg-[#1E293B]/80 border border-emerald-500/25 rounded-2xl rounded-tl-sm px-3.5 py-2.5">
                    <p className="text-[#E2E8F0] text-sm leading-relaxed">{PRACTICE_CLOSING_MESSAGE}</p>
                  </div>
                  <p className="mt-2 text-[11px] text-emerald-300">You can now click <span className="font-semibold">Start Interview</span> below.</p>
                </div>
              </div>
            )}
          </div>

          {/* Control bar — like the real interview: the mic auto-listens (no
              Start/Stop button), a live waveform shows you're heard, and you
              Repeat the question or move on with Next. */}
          <div className="border-t border-white/[0.07] p-3">
            {micReady ? (
              <div className="flex items-center gap-3">
                {/* Mic status + live waveform (auto-recording) */}
                <div data-tour="record" className="flex-1 min-w-0 flex items-center gap-3 bg-[#0F1A2E] border border-white/[0.06] rounded-xl px-3 py-2">
                  <span className={`text-xs font-medium whitespace-nowrap ${
                    isRecording ? 'text-[#EF4444]' : isTranscribing ? 'text-[#60A5FA]' : practiceDone ? 'text-emerald-400' : aiSpeaking ? 'text-[#A78BFA]' : 'text-[#94A3B8]'
                  }`}>
                    {!started ? 'Press Start to begin'
                      : isRecording ? '● Listening…'
                      : isTranscribing ? 'Processing…'
                      : timedUp ? "Time's up ✓"
                      : practiceDone ? 'All set ✓'
                      : aiSpeaking ? 'Linda is speaking…'
                      : 'Getting ready…'}
                  </span>
                  <MicWaveform analyserRef={analyserRef} active={isRecording} color="#34d399" width={120} height={26} />
                </div>
                {/* Repeat the question (replays it and re-opens the mic) */}
                <button
                  type="button"
                  onClick={() => {
                    // Repeat MID-answer: just replay — the timer pauses while Linda
                    // speaks and resumes from where it left (no reset). Repeat AFTER
                    // finishing (done/timed-up): a fresh re-practice → reset the budget.
                    const wasFinished = practiceDoneRef.current;
                    practiceDoneRef.current = false;
                    setPracticeDone(false);
                    setTimedUp(false);
                    if (wasFinished) setAnswerElapsed(0);
                    setAutoSpeakBlocked(false);
                    // Repeat plays ONLY the question — not the full greeting.
                    speakQuestion(PRACTICE_QUESTION);
                  }}
                  disabled={aiSpeaking || practiceDone}
                  title={practiceDone ? 'Practice complete' : 'Replay the question'}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium text-[#E2E8F0] bg-[#1E293B] border border-white/[0.08] hover:bg-[#334155] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <Volume2 className="w-4 h-4" /> Repeat
                </button>
                {/* Next — finish the answer; Linda plays the sign-off. */}
                <button
                  data-tour="next"
                  type="button"
                  onClick={handlePracticeNext}
                  disabled={aiSpeaking || isTranscribing || practiceDone || (!isRecording && !hasAnswer)}
                  title={practiceDone ? 'Practice complete' : isRecording || hasAnswer ? 'Finish and hear Linda' : 'Answer first'}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div>
                <p className="text-xs text-amber-400 mb-2"><MicOff className="w-3.5 h-3.5 inline mr-1" />No microphone — type your answer instead.</p>
                <div className="flex items-end gap-2">
                  <textarea
                    value={typedAnswer}
                    onChange={e => { if (!isRecording) { setTypedAnswer(e.target.value); setInputMode('typing'); } }}
                    placeholder="Type your answer here…"
                    className="flex-1 min-h-[52px] bg-[#0F1A2E] border border-white/[0.06] rounded-lg p-2.5 text-sm text-[#CBD5E1] placeholder-[#475569] resize-none focus:outline-none focus:border-[#3B82F6]/50"
                    rows={2}
                  />
                  <button
                    data-tour="next"
                    type="button"
                    onClick={handlePracticeNext}
                    disabled={aiSpeaking || practiceDone || !typedAnswer.trim()}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

        {/* Guided coach-mark tour — scoped to this panel (not fullscreen). */}
        {tourStep >= 0 && (
          <PracticeTour
            steps={PRACTICE_TOUR_STEPS}
            stepIndex={tourStep}
            panelRef={panelRef}
            onNext={() => setTourStep((s) => (s >= PRACTICE_TOUR_STEPS.length - 1 ? -1 : s + 1))}
            onClose={() => setTourStep(-1)}
          />
        )}
      </div>{/* end outer dark panel */}

      {/* Footer Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onGoBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Go Back
        </button>
        <div className="flex flex-col items-end gap-1.5">
          {/* Optional — show how long the practice answer was (not a gate) */}
          {!isRecording && recordedDurationSeconds !== null && (
            <p className="text-xs font-medium text-green-600">
              ✓ Practice recorded ({recordedDurationSeconds}s)
            </p>
          )}
          {isRecording && (
            <p className="text-xs font-medium text-amber-500">
              Recording · {recordingElapsed}s
            </p>
          )}
          <div className="flex items-center gap-2">
            {/* Skip the optional practice and continue straight to the interview */}
            <button
              type="button"
              onClick={onStartInterview}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Skip
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onStartInterview}
              disabled={submitting}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  Start Interview
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
