'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mic,
  MicOff,
  RefreshCw,
  MessageSquare,
  Volume2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Square,
  Play,
} from 'lucide-react';
import { candidateAIInterviewService } from '@/lib/services/candidateAIInterviewService';

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

const PRACTICE_QUESTION =
  'Please briefly introduce yourself — your name, background, and what excites you about this role.';

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
  const [voiceReady, setVoiceReady] = useState(false);
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

  // ── Refs ─────────────────────────────────────────────────────────────────

  const videoRef = useRef<HTMLVideoElement>(null);
  const replayVideoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const recognitionRef = useRef<any>(null);
  const webSpeechFinalRef = useRef('');
  const liveTranscriptRef = useRef('');
  const audioMimeTypeUsedRef = useRef('');
  const hasAutoSpokeRef = useRef(false);
  const startRecordingRef = useRef<() => void>(() => {});
  const periodicTranscriptionRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micReady]);

  // ── TTS: Speak the practice question ──────────────────────────────────────
  // Called only on explicit user click so the browser always has a user gesture.

  const speakQuestion = useCallback(() => {
    if (!window.speechSynthesis) {
      setTtsSupported(false);
      return;
    }

    // Cancel any ongoing speech first
    window.speechSynthesis.cancel();

    const doSpeak = (voice: SpeechSynthesisVoice | null) => {
      // Resume in case the synth engine was paused
      window.speechSynthesis.resume();

      const utterance = new SpeechSynthesisUtterance(PRACTICE_QUESTION);
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      if (voice) utterance.voice = voice;

      utterance.onstart = () => setAiSpeaking(true);
      utterance.onend = () => { setAiSpeaking(false); };
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

  // ── Auto-speak question once mic/camera are ready ─────────────────────────
  useEffect(() => {
    if (micReady && !hasAutoSpokeRef.current) {
      hasAutoSpokeRef.current = true;
      // Small delay so the component fully renders before TTS fires.
      // NOTE: Brave blocks TTS when called from setTimeout (no user gesture).
      // If speaking doesn't start within 2s we flag autoSpeakBlocked so the
      // Play Question button gets a visual hint prompting the user to click it.
      const t = setTimeout(() => {
        speakQuestion();
        // Watch for TTS being silently blocked (Brave) — if aiSpeaking never becomes
        // true after 2s, assume autoplay was blocked
        const watchdog = setTimeout(() => {
          if (!window.speechSynthesis?.speaking) {
            setAutoSpeakBlocked(true);
          }
        }, 2000);
        return () => clearTimeout(watchdog);
      }, 600);
      return () => clearTimeout(t);
    }
  }, [micReady, speakQuestion]);

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

  const startPeriodicTranscription = useCallback(() => {
    if (periodicTranscriptionRef.current) return; // already running
    periodicTranscriptionRef.current = setInterval(async () => {
      // Need at least ~2s of audio (4 chunks at 500ms timeslice) before sending
      const chunks = audioChunksRef.current;
      if (chunks.length < 4) return;
      // Only run while actively recording
      if (mediaRecorderRef.current?.state !== 'recording') return;

      const mimeType = audioMimeTypeUsedRef.current || 'audio/webm';
      // Create a snapshot of chunks so far (copy the array — don't slice the ref)
      const snapshot = chunks.slice();
      const blob = new Blob(snapshot, { type: mimeType });
      const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([blob], `live.${ext}`, { type: mimeType });

      try {
        const text = await candidateAIInterviewService.transcribePracticeAudio(token, file);
        // Only update if still recording (don't overwrite final transcript)
        if (text.trim() && mediaRecorderRef.current?.state === 'recording') {
          setLiveTranscript(text.trim());
          setHasLiveTranscript(true); // show the live transcript area on first result
        }
      } catch { /* ignore — best-effort, final transcription happens on stop */ }
    }, 5000); // every 5 seconds
  }, [token]);

  // ── Live transcription (Web Speech API) ──────────────────────────────────

  const startLiveTranscription = useCallback(() => {
    // Brave blocks Google's cloud Speech API — skip directly to periodic transcription
    const isBrave = typeof navigator !== 'undefined' && 'brave' in navigator;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition || isBrave) {
      // No Web Speech API (Firefox) or Brave — use periodic backend transcription
      setHasLiveTranscript(false);
      startPeriodicTranscription();
      return;
    }
    setHasLiveTranscript(true);

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
  }, [startPeriodicTranscription]);

  const stopLiveTranscription = useCallback(() => {
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
      if (text.trim()) {
        setTranscript(text);
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

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecordingAndTranscribe();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecordingAndTranscribe]);

  const resetPractice = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
      mediaRecorderRef.current = null;
    }
    if (videoRecorderRef.current && videoRecorderRef.current.state !== 'inactive') {
      try { videoRecorderRef.current.stop(); } catch { /* ignore */ }
      videoRecorderRef.current = null;
    }
    stopLiveTranscription();
    audioChunksRef.current = [];
    videoChunksRef.current = [];
    setIsRecording(false);
    setIsTranscribing(false);
    setTranscript('');
    setLiveTranscript('');
    setTypedAnswer('');
    setInputMode('none');
    setVoiceReady(false);
    setTranscribeError('');
    setAiSpeaking(false);
    setRecordedVideoUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    setShowReplay(false);
    setRecordedDurationSeconds(null);
    setRecordingElapsed(0);
    recordingStartTimeRef.current = null;
    if (elapsedIntervalRef.current) {
      clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
    window.speechSynthesis?.cancel();
  }, [stopLiveTranscription]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const MIN_RECORDING_SECONDS = 10;

  // Show live transcript while recording, final transcript when done
  const displayAnswer = isRecording
    ? liveTranscript
    : inputMode === 'voice'
    ? transcript
    : typedAnswer;
  const hasAnswer = (isRecording ? false : displayAnswer.trim().length > 0);

  // "Start Interview" is only enabled once the candidate has recorded ≥10 seconds of video
  const canStartInterview = recordedDurationSeconds !== null && recordedDurationSeconds >= MIN_RECORDING_SECONDS;
  const recordingTooShort = recordedDurationSeconds !== null && recordedDurationSeconds < MIN_RECORDING_SECONDS;


  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4" style={{ colorScheme: 'light' }}>
      {/* Header */}
      <div className="text-center space-y-1">
        <span className="inline-block px-4 py-1.5 rounded-full bg-gray-100 text-gray-700 text-sm font-medium">
          Practice &amp; Final Check
        </span>
        <h2 className="text-2xl font-bold text-gray-900">Let&apos;s Test Your Setup</h2>
        <p className="text-gray-500 text-sm">Answer the practice question to verify your mic and camera — this won&apos;t be scored.</p>
      </div>

      {/* ── Main interview-like panel ── */}
      <div className="rounded-2xl overflow-hidden border border-gray-800 shadow-2xl bg-[#0A1020]">

        {/* Top bar */}
        <div className="flex items-center px-4 py-2.5 border-b border-white/[0.07] bg-[#060D1A]">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse mr-2" />
          <span className="text-xs font-semibold text-gray-300 tracking-wide">PRACTICE SESSION</span>
        </div>

        {/* 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-white/[0.06]">
        {/* ── Left: AI Question Panel (dark) ── */}
        <div className="flex flex-col bg-[#0A1020] p-5 gap-5" style={{ minHeight: '360px' }}>
          {/* AI Avatar / waveform area */}
          <div className="flex items-center gap-3">
            <div className={`relative w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${aiSpeaking ? 'bg-[#7C3AED]' : 'bg-[#1E293B]'} transition-colors duration-300`}>
              <MessageSquare className="w-5 h-5 text-white" />
              {aiSpeaking && <span className="absolute inset-0 rounded-full bg-[#7C3AED]/40 animate-ping" />}
            </div>
            <div>
              <p className="text-xs text-[#64748B] font-medium uppercase tracking-wide">AI Interviewer</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {aiSpeaking ? (
                  <>
                    {[0, 0.1, 0.2, 0.15, 0.05].map((delay, i) => (
                      <span key={i} className="w-0.5 bg-[#7C3AED] rounded-full animate-pulse"
                        style={{ height: `${8 + i * 3}px`, animationDelay: `${delay}s` }} />
                    ))}
                    <span className="text-xs text-[#7C3AED] font-medium ml-1">Speaking…</span>
                  </>
                ) : (
                  <span className={`text-xs font-medium ${isRecording ? 'text-[#EF4444]' : 'text-[#3B82F6]'}`}>
                    {isRecording ? '● Recording your answer' : isTranscribing ? 'Processing…' : 'Listening'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Question bubble */}
          <div className="bg-[#1E293B]/80 border border-white/[0.08] rounded-xl p-4 flex-1 flex flex-col justify-between gap-4">
            <div>
              <p className="text-[11px] text-[#64748B] font-medium uppercase tracking-wide mb-2">Practice Question</p>
              <p className="text-[#E2E8F0] text-sm leading-relaxed font-medium">
                &ldquo;{PRACTICE_QUESTION}&rdquo;
              </p>
            </div>

            {/* Play button */}
            {ttsSupported && (
              <div className="flex flex-col gap-1.5">
                {autoSpeakBlocked && !aiSpeaking && (
                  <p className="text-xs text-amber-400 flex items-center gap-1">
                    <Volume2 className="w-3 h-3 shrink-0" />
                    Click to hear the question aloud
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => { setAutoSpeakBlocked(false); speakQuestion(); }}
                  disabled={aiSpeaking}
                  className={`self-start inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all disabled:cursor-not-allowed ${
                    aiSpeaking
                      ? 'bg-[#7C3AED]/20 text-[#A78BFA] border border-[#7C3AED]/30'
                      : autoSpeakBlocked
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 animate-pulse'
                        : 'bg-[#3B82F6]/20 text-[#60A5FA] border border-[#3B82F6]/30 hover:bg-[#3B82F6]/30'
                  }`}
                >
                  {aiSpeaking ? (
                    <><Volume2 className="w-3.5 h-3.5" /> Playing…</>
                  ) : (
                    <><Play className="w-3.5 h-3.5" /> {voiceReady ? 'Replay Question' : 'Play Question'}</>
                  )}
                </button>
              </div>
            )}
          </div>

        </div>

        {/* ── Right: Your Video + Answer ── */}
        <div className="flex flex-col bg-[#060D1A] p-5 gap-4" style={{ minHeight: '360px' }}>
          {/* Video preview / replay */}
          <div className="relative bg-black rounded-xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
            {/* Live camera — hidden during replay */}
            <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${showReplay ? 'hidden' : ''}`} />
            {/* Replay video */}
            {showReplay && recordedVideoUrl && (
              <video ref={replayVideoRef} src={recordedVideoUrl} controls playsInline controlsList="nodownload nopictureinpicture" disablePictureInPicture onContextMenu={(e) => e.preventDefault()} className="w-full h-full object-cover" />
            )}

            {/* Audio level bar — only when live */}
            {!showReplay && (
              <div className="absolute bottom-0 left-0 right-0 px-3 pb-2.5">
                <div className="h-1 bg-gray-800/60 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-75 ${audioLevel > 0.3 ? 'bg-green-400' : audioLevel > 0.05 ? 'bg-yellow-400' : 'bg-gray-600'}`}
                    style={{ width: `${Math.max(audioLevel * 100, 2)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Status badges */}
            {!showReplay && (isRecording || isTranscribing) && (
              <div className={`absolute top-2 left-2 flex items-center gap-1.5 text-white text-xs font-medium px-2.5 py-1 rounded-full backdrop-blur-sm ${isRecording ? 'bg-red-500/90' : 'bg-blue-600/90'}`}>
                {isRecording ? (
                  <>
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                    {recordingElapsed < MIN_RECORDING_SECONDS
                      ? `${recordingElapsed}s / ${MIN_RECORDING_SECONDS}s`
                      : `Recording · ${recordingElapsed}s`}
                  </>
                ) : (
                  <><Loader2 className="w-3 h-3 animate-spin" /> Transcribing…</>
                )}
              </div>
            )}

            {/* Replay badge */}
            {showReplay && (
              <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-blue-600/90 text-white text-xs font-medium px-2.5 py-1 rounded-full backdrop-blur-sm">
                <Play className="w-3 h-3" /> Playback
              </div>
            )}

            {/* Live / Replay toggle pill */}
            {recordedVideoUrl && !isRecording && !isTranscribing && (
              <div className="absolute top-2 right-2 flex items-center bg-black/70 backdrop-blur-sm rounded-full p-0.5 gap-0.5">
                <button
                  type="button"
                  onClick={() => setShowReplay(false)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors ${!showReplay ? 'bg-white text-gray-900' : 'text-gray-400 hover:text-white'}`}
                >
                  Live
                </button>
                <button
                  type="button"
                  onClick={() => setShowReplay(true)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors ${showReplay ? 'bg-white text-gray-900' : 'text-gray-400 hover:text-white'}`}
                >
                  Replay
                </button>
              </div>
            )}

            {!showReplay && <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full">You</div>}
          </div>

          {/* Your Answer + transcript */}
          <div className="flex-1 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-[#64748B] font-medium uppercase tracking-wide">Your Answer</p>
              <div className="flex items-center gap-2">
                {isRecording && (
                  <span className="flex items-center gap-1 text-xs text-[#EF4444] font-medium">
                    <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-ping" /> Live…
                  </span>
                )}
                {isTranscribing && (
                  <span className="flex items-center gap-1 text-xs text-[#60A5FA]">
                    <Loader2 className="w-3 h-3 animate-spin" /> Enhancing…
                  </span>
                )}
                {hasAnswer && !isRecording && !isTranscribing && (
                  <button type="button" onClick={resetPractice}
                    className="flex items-center gap-1 text-xs text-[#64748B] hover:text-white transition-colors">
                    <RefreshCw className="w-3 h-3" /> Retry
                  </button>
                )}
              </div>
            </div>

            {/* Live/final transcript display */}
            {(isRecording && liveTranscript) ? (
              // Live transcript — Chrome/Edge (Web Speech API) or Brave/Firefox (periodic backend)
              <div className="flex-1 bg-[#0F1A2E] border border-white/[0.06] rounded-lg p-3 overflow-y-auto min-h-[60px]">
                <p className="text-[#CBD5E1] text-sm leading-relaxed">{liveTranscript}<span className="animate-pulse text-[#3B82F6]">▌</span></p>
                {periodicTranscriptionRef.current !== null && (
                  <p className="text-[10px] text-[#475569] mt-1">Updates every few seconds</p>
                )}
              </div>
            ) : isRecording && !hasLiveTranscript ? (
              // Recording in progress — periodic transcription running but no result yet (first 5s)
              <div className="flex-1 bg-[#0F1A2E] border border-white/[0.06] rounded-lg p-3 flex flex-col items-center justify-center gap-2 min-h-[60px]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-red-400 rounded-full animate-ping flex-shrink-0" />
                  <span className="text-sm text-[#94A3B8] font-medium">Recording your voice…</span>
                </div>
                <p className="text-xs text-[#475569] text-center">
                  Transcript will appear shortly — keep speaking
                </p>
              </div>
            ) : displayAnswer && !isRecording ? (
              // Final answer after recording
              <div className="flex-1 bg-[#0F1A2E] border border-white/[0.06] rounded-lg p-3 overflow-y-auto min-h-[60px]">
                <p className="text-[#CBD5E1] text-sm leading-relaxed">{displayAnswer}</p>
              </div>
            ) : (
              // Idle / type mode
              <textarea
                value={typedAnswer}
                onChange={e => { if (!isRecording) { setTypedAnswer(e.target.value); setInputMode('typing'); } }}
                placeholder={isTranscribing ? 'Transcribing your answer…' : 'Start recording or type your answer here…'}
                readOnly={isRecording || isTranscribing}
                className="flex-1 min-h-[60px] bg-[#0F1A2E] border border-white/[0.06] rounded-lg p-3 text-sm text-[#CBD5E1] placeholder-[#475569] resize-none focus:outline-none focus:border-[#3B82F6]/50 transition-colors"
                rows={3}
              />
            )}

            {transcribeError && !isTranscribing && (
              <p className="text-xs text-red-400">{transcribeError}</p>
            )}
          </div>

          {/* Record button */}
          {micReady ? (
            <button
              type="button"
              onClick={toggleRecording}
              disabled={isTranscribing}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                isRecording
                  ? 'bg-[#EF4444] text-white hover:bg-red-600 shadow-lg shadow-red-500/20'
                  : 'bg-[#1E293B] text-[#E2E8F0] border border-white/[0.08] hover:bg-[#334155]'
              }`}
            >
              {isTranscribing ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
                : isRecording ? <><Square className="w-4 h-4" /> Stop Recording</>
                : <><Mic className="w-4 h-4" /> {hasAnswer ? 'Re-record' : 'Start Recording'}</>}
            </button>
          ) : (
            <div className="bg-amber-950/40 border border-amber-800/30 rounded-xl p-2.5 text-center">
              <p className="text-xs text-amber-400"><MicOff className="w-3.5 h-3.5 inline mr-1" />No microphone — type your answer above.</p>
            </div>
          )}
        </div>
      </div>
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
          {/* Requirement message — shown until condition is met */}
          {!canStartInterview && !isRecording && (
            <p className={`text-xs font-medium ${recordingTooShort ? 'text-red-500' : 'text-gray-500'}`}>
              {recordingTooShort
                ? `Recording too short (${recordedDurationSeconds}s) — minimum ${MIN_RECORDING_SECONDS}s required`
                : `Record at least ${MIN_RECORDING_SECONDS} seconds of video to continue`}
            </p>
          )}
          {isRecording && (
            <p className={`text-xs font-medium ${recordingElapsed >= MIN_RECORDING_SECONDS ? 'text-green-600' : 'text-amber-500'}`}>
              {recordingElapsed >= MIN_RECORDING_SECONDS
                ? `✓ ${recordingElapsed}s recorded — you may stop and continue`
                : `${recordingElapsed}s / ${MIN_RECORDING_SECONDS}s — keep recording…`}
            </p>
          )}
          <button
            type="button"
            onClick={onStartInterview}
            disabled={submitting || !canStartInterview}
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
  );
}
