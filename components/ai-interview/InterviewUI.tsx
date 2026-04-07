"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { TalkingHeadAvatar, type TalkingHeadHandle } from "./TalkingHeadAvatar";
import { Webcam, WebcamRef } from "./Webcam";
import { useAvatarState } from "@/hooks/useAvatarState";
import { useHandRaiseDetection } from "@/hooks/useHandRaiseDetection";
import {
  useInterviewFaceDetection,
  useInterviewProctoringMonitor,
  InterviewProctoringWarnings,
} from './proctoring';
import { CandidateInterviewInfo, candidateAIInterviewService } from "@/lib/services/candidateAIInterviewService";
import { requestFullscreen, isFullscreen, getFullscreenChangeEvent, exitFullscreen } from "@/lib/utils/browserCompat";
import { Clock, Timer, LogOut, Send, Mic, MessageSquare, ShieldCheck, Video, VideoOff, MicOff } from "lucide-react";
import { createAvatar3DSender } from "./avatar3d/avatar3d-channel";
import { DEFAULT_VISEME_WEIGHTS } from "./avatar3d/avatar3d-types";
import { VisemeTimeline } from "./avatar3d/text-to-viseme";

interface FaceVerificationHandle {
  startVerification: (videoElement: HTMLVideoElement) => void;
  stopVerification: () => void;
  hasBaseline: () => boolean;
}

interface VoiceVerificationHandle {
  verifyVoice: (audioData: Float32Array, sampleRate: number) => void;
  hasBaseline: () => boolean;
}

interface InterviewUIProps {
  token: string;
  interviewInfo: CandidateInterviewInfo;
  onInterviewComplete?: () => void;
  faceVerification?: FaceVerificationHandle;
  voiceVerification?: VoiceVerificationHandle;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

export function InterviewUI({ token, interviewInfo, onInterviewComplete, faceVerification, voiceVerification }: InterviewUIProps) {
  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [currentAiText, setCurrentAiText] = useState("");
  const [status, setStatus] = useState("Connecting...");
  const [textInput, setTextInput] = useState("");

  // Interview closing state
  const [isClosing, setIsClosing] = useState(false);
  const isClosingRef = useRef(false);
  const [closingReason, setClosingReason] = useState<string>("");

  // Silence detection — "Are you there?" banner (Req 14b)
  const [showSilenceBanner, setShowSilenceBanner] = useState(false);
  const silenceBannerTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Countdown shown inside banner before auto-skip (seconds remaining)
  const [silenceCountdown, setSilenceCountdown] = useState<number | null>(null);
  const silenceCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Interview completion modal (Req 16)
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completionMessage, setCompletionMessage] = useState("");
  const [questionCount, setQuestionCount] = useState(0);
  const [duration, setDuration] = useState(0);
  const shouldDisconnectAfterAudioRef = useRef(false);

  // 5-minute buffer state (MOM: buffer when allocated time expires)
  const [isInBuffer, setIsInBuffer] = useState(false);

  // Timed mode — per-question 2-min timer
  const [questionTimerSeconds, setQuestionTimerSeconds] = useState<number | null>(null);
  const [questionTimerExpired, setQuestionTimerExpired] = useState(false);
  const questionTimerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Ref that mirrors questionTimerSeconds state — readable synchronously in callbacks.
  // Required for stopRecording to deduct remaining seconds from the global timer.
  const questionTimerSecondsRef = useRef<number | null>(null);
  // Pending: timer duration received but interval not started yet (waiting for Linda to stop)
  const questionTimerPendingRef = useRef<number | null>(null);
  // Timestamp when question_timer_started was received — used to adjust for TTS playback lag
  const questionTimerReceivedAtRef = useRef<number | null>(null);
  // Question progress counter (sent with question_timer_started)
  const [questionNumber, setQuestionNumber] = useState<number | null>(null);
  const [totalQuestions, setTotalQuestions] = useState<number | null>(null);
  const questionNumberRef = useRef<number | null>(null); // sync ref for stale-closure reads
  // Clarification mode — true when backend signals is_clarification on a same-Q timer event
  const [isClarification, setIsClarification] = useState(false);

  // Skill coverage (real-time, timed mode only)
  const [skillCoverage, setSkillCoverage] = useState<{
    round: string;
    round_name?: string;
    covered: string[];
    medium_covered: string[];
    low_covered: string[];
    uncovered: string[];
    nice_to_have_skills: string[];
    total_questions: number;
    questions_asked: number;
    hr_topics?: Record<string, string>;
  } | null>(null);

  // Figma UI state
  const [waveHeights, setWaveHeights] = useState<number[]>(Array(30).fill(4));
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  // Face-not-in-frame blocking
  const [isFaceBlocked, setIsFaceBlocked] = useState(false);
  const isFaceBlockedRef = useRef(false);

  // WebSocket keepalive / reconnect refs
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isUnmountedRef = useRef(false);
  const connectRef = useRef<() => void>(() => {});

  // Timer modes:
  //   isFlexibleMode      = duration 0 (legacy unlimited) → count UP, pause while Linda speaks
  //   isNewFlexibleMode   = duration > 0, interview_mode='flexible' → count DOWN, runs NON-STOP
  //   timed / fixed       = duration > 0, interview_mode='fixed'  → count DOWN, runs NON-STOP
  //                         Each question = 2-min slot; every second (Linda's speech + candidate
  //                         answer) counts toward the global budget, so the timer never pauses.
  const isFlexibleMode = interviewInfo.duration_minutes === 0;
  const isNewFlexibleMode = !isFlexibleMode && interviewInfo.interview_mode === 'flexible';
  const [remainingSeconds, setRemainingSeconds] = useState(isFlexibleMode ? 0 : interviewInfo.duration_minutes * 60);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isConnected || isClosing) return;
    timerIntervalRef.current = setInterval(() => {
      if (!isFlexibleMode && !isNewFlexibleMode) return; // timed: synced inside question timer interval
      // Legacy unlimited flexible: count up, pause while Linda speaks or processing.
      if (isAiSpeakingRef.current || isProcessingRef.current) return;
      setRemainingSeconds(prev => isFlexibleMode ? prev + 1 : Math.max(0, prev - 1));
    }, 1000);
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isConnected, isClosing, isFlexibleMode, isNewFlexibleMode]);

  // Keep questionTimerSecondsRef in sync with state so stopRecording can read it synchronously.
  useEffect(() => {
    questionTimerSecondsRef.current = questionTimerSeconds;
  }, [questionTimerSeconds]);
  useEffect(() => { questionNumberRef.current = questionNumber; }, [questionNumber]);

  // Waveform animation — driven by isAiSpeaking
  useEffect(() => {
    if (!isAiSpeaking) {
      setWaveHeights(Array(30).fill(4));
      return;
    }
    const interval = setInterval(() => {
      setWaveHeights(Array.from({ length: 30 }, () => Math.random() * 32 + 3));
    }, 120);
    return () => clearInterval(interval);
  }, [isAiSpeaking]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // No-response detection state
  const [showMicPopup, setShowMicPopup] = useState(false);
  const noResponseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const noResponseRetryRef = useRef(0); // 0=first attempt, 1=asked "are you there?"
  const micPopupTimerRef = useRef<NodeJS.Timeout | null>(null);
  const handleNoResponseRef = useRef<() => void>(() => {});
  const stopRecordingSilentRef = useRef<() => void>(() => {});

  // Safety-net: if TalkingHead's onAudioEnd callback never fires (e.g., AudioContext
  // suspended after streamStart returns early), start the mic after a short delay.
  const audioEndFallbackRef = useRef<NodeJS.Timeout | null>(null);

  // Webcam ref for hand detection
  const webcamRef = useRef<WebcamRef>(null);
  const [webcamReady, setWebcamReady] = useState(false);

  // Avatar ready state — WebSocket connects only after avatar is loaded
  const [avatarReady, setAvatarReady] = useState(false);

  // Video recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const webcamStreamRef = useRef<MediaStream | null>(null);

  // Avatar state controller
  const avatarState = useAvatarState();
  const avatar3dSenderRef = useRef<ReturnType<typeof createAvatar3DSender> | null>(null);

  // BroadcastChannel sender for 3D avatar (created once, cleaned up on unmount)
  useEffect(() => {
    avatar3dSenderRef.current = createAvatar3DSender();
    return () => {
      avatar3dSenderRef.current?.destroy();
      avatar3dSenderRef.current = null;
    };
  }, []);

  // Push avatar state to 3D scene at ~30fps (uses refs, zero React re-renders)
  const avatarStateRef = useRef(avatarState.currentState);
  avatarStateRef.current = avatarState.currentState;
  const visemeTimelineRef = useRef<VisemeTimeline>(new VisemeTimeline());
  const playbackStartTimeRef = useRef(0);

  useEffect(() => {
    let lastSend = 0;
    const INTERVAL = 1000 / 30;
    let raf: number;

    const tick = () => {
      const now = performance.now();
      if (now - lastSend >= INTERVAL && avatar3dSenderRef.current) {
        const timeline = visemeTimelineRef.current;
        const elapsed = (now - playbackStartTimeRef.current) / 1000;
        const isSpeaking = isPlayingRef.current && timeline.length > 0;

        avatar3dSenderRef.current.send({
          avatarState: avatarStateRef.current,
          mouthOpenness: isSpeaking ? timeline.getMouthOpennessAtTime(elapsed) : 0,
          visemeWeights: isSpeaking ? timeline.getWeightsAtTime(elapsed) : DEFAULT_VISEME_WEIGHTS,
          timestamp: now,
        });
        lastSend = now;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Hand raise detection
  const handDetection = useHandRaiseDetection({
    enabled: webcamReady,
    onHandRaised: () => avatarState.raiseHand(),
    onHandLowered: () => avatarState.lowerHand(),
    onWaveDetected: () => avatarState.wave(),
  });

  // Proctoring (decoupled — no warning state here)
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  // Stable callback so Webcam's second effect doesn't re-fire on every render
  const handleStream = useCallback((stream: MediaStream) => {
    setWebcamStream(stream);
  }, []);
  const reportProctorEvent = useCallback(async (t: string, event: any) => {
    return candidateAIInterviewService.reportProctorEvent(t, event);
  }, []);

  const { state: proctoringState, emitEvent, setReducedFrequency, flushEvents } = useInterviewProctoringMonitor({
    token,
    stream: webcamStream,
    enabled: isConnected,
    voiceDetectionSensitivity: 50,
    obstructionThreshold: 30,
    reportEvent: reportProctorEvent,
  });
  // Stable ref so ws.onclose closure can always call the latest flush function
  const flushProctoringEventsRef = useRef(flushEvents);
  useEffect(() => { flushProctoringEventsRef.current = flushEvents; }, [flushEvents]);

  // Fullscreen — disabled (no popup/overlay)
  const isFullscreenActive = true;

  // Face detection & gaze tracking (Phase 2 & 3)
  const handleFaceMissing = useCallback(() => {
    emitEvent('face_missing', { timestamp: new Date().toISOString() });
    if (!isFaceBlockedRef.current) {
      isFaceBlockedRef.current = true;
      setIsFaceBlocked(true);
      // Stop mic recording silently so audio isn't sent while face is absent
      stopRecordingSilentRef.current();
    }
  }, [emitEvent]);

  const handleFaceRestored = useCallback(() => {
    if (isFaceBlockedRef.current) {
      isFaceBlockedRef.current = false;
      setIsFaceBlocked(false);
    }
  }, []);

  const handleMultipleFaces = useCallback((count: number) => {
    emitEvent('multiple_faces', { face_count: count });
  }, [emitEvent]);

  const handleGazeAway = useCallback((direction: string) => {
    emitEvent('gaze_away', { direction });
  }, [emitEvent]);

  // Face verification event handlers (identity check, not just presence)
  useEffect(() => {
    if (!faceVerification || !isConnected) return;
    // The faceVerification hook calls callbacks internally, but we need to wire
    // them to emitEvent. Since the callbacks are set at hook creation time in the
    // portal, we handle this via a subscription-like pattern in InterviewUI.
    // The callbacks are already set up in CandidateAIInterviewPortal if needed.
    // Here we just ensure cleanup on unmount.
    return () => {
      faceVerification.stopVerification();
    };
  }, [faceVerification, isConnected]);

  const faceDetection = useInterviewFaceDetection({
    enabled: isConnected && webcamReady,
    enableGazeTracking: true,
    onFaceMissing: handleFaceMissing,
    onFaceRestored: handleFaceRestored,
    onMultipleFaces: handleMultipleFaces,
    onGazeAway: handleGazeAway,
  });

  // Stable video-ready callback: use the stable setVideoElement methods from each hook
  // (both are useCallback([], []) — same ref across renders) so handleVideoReady
  // won't change on every render and won't cause Webcam's second effect to re-fire.
  const handleVideoReady = useCallback((video: HTMLVideoElement) => {
    handDetection.setVideoElement(video);
    faceDetection.setVideoElement(video);
    setWebcamReady(true);

    // Start video recording from webcam stream.
    // Low bitrate: 200 Kbps video + 32 Kbps audio = ~232 Kbps total.
    // 30-min interview ≈ 52 MB — well within upload limits.
    const stream = video.srcObject as MediaStream;
    if (stream) {
      webcamStreamRef.current = stream;
      const RECORDER_OPTIONS: MediaRecorderOptions = {
        videoBitsPerSecond: 200_000,  // 200 Kbps — clear face video at talking-head scale
        audioBitsPerSecond: 32_000,   // 32 Kbps — voice quality
      };
      const startRecorder = (opts: MediaRecorderOptions) => {
        const recorder = new MediaRecorder(stream, opts);
        recordedChunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) recordedChunksRef.current.push(e.data);
        };
        recorder.start(5000); // 5-second chunks — fewer objects, same result
        mediaRecorderRef.current = recorder;
        console.log(`[Recording] Started: mimeType=${recorder.mimeType}, videoBps=${opts.videoBitsPerSecond}, audioBps=${opts.audioBitsPerSecond}`);
      };
      // Use isTypeSupported() to select the best available codec across browsers:
      // - Chrome/Brave: vp9 > vp8 webm
      // - Firefox: vp8 webm (vp9 may not have HW encode; ogg is audio-only)
      // - Safari: no WebM support at all — needs mp4/avc1
      const codecCandidates = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/mp4;codecs=avc1",  // Safari 14.1+
        "video/mp4",              // Safari fallback
      ];
      const supportedMime = typeof MediaRecorder !== 'undefined'
        ? codecCandidates.find(m => MediaRecorder.isTypeSupported(m))
        : undefined;
      try {
        startRecorder(supportedMime ? { ...RECORDER_OPTIONS, mimeType: supportedMime } : RECORDER_OPTIONS);
      } catch (err) {
        console.error("[Recording] MediaRecorder not supported:", err);
      }
    }
    // Start face verification if baseline is registered
    if (faceVerification?.hasBaseline()) {
      faceVerification.startVerification(video);
    }
  }, [handDetection.setVideoElement, faceDetection.setVideoElement, faceVerification]);

  // TalkingHead avatar ref — visual lip-sync (audio played by Web Audio API separately)
  const talkingHeadRef   = useRef<TalkingHeadHandle>(null);
  // (thStreamActive removed — no longer sending audio to TalkingHead)

  // Real-time amplitude → viseme lip sync
  const analyserRef      = useRef<AnalyserNode | null>(null);
  const amplitudeDataRef = useRef<Uint8Array | null>(null);
  const visemeRafRef     = useRef<number | null>(null);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | AudioWorkletNode | null>(null);
  const recordingContextRef = useRef<AudioContext | null>(null);
  const voiceVerifBufferRef = useRef<Float32Array[]>([]);
  const audioQueueRef = useRef<AudioBuffer[]>([]); // kept for proctoring load-shedding count only
  const isPlayingRef = useRef(false);
  // Scheduled playback — gapless audio via Web Audio API clock
  const nextPlayTimeRef = useRef(0);   // ctx.currentTime when next buffer should start
  const pendingBuffersRef = useRef(0); // buffers scheduled but not yet finished
  const isRecordingRef = useRef(false);
  const audioEndReceivedRef = useRef(false);
  const currentAiTextRef = useRef("");
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isAiSpeakingRef = useRef(false);
  const isProcessingRef = useRef(false);
  // Cancellable ref for the 800ms "start recording after Linda stops" setTimeout.
  // Cancelled by the Next Q handler to prevent stale recording after a skip.
  const startRecordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Callback to execute after speak_text TTS finishes (replaces browser speechSynthesis)
  const speakTextCallbackRef = useRef<(() => void) | null>(null);

  // Stable callback refs — prevent WebSocket reconnection on re-renders
  const queueAudioRef = useRef<(pcmData: ArrayBuffer) => void>(() => {});
  const handleMessageRef = useRef<(data: any) => void>(() => {});

  // Token reveal system
  const tokenBufferRef = useRef("");
  const revealedCharsRef = useRef(0);
  const revealTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Keep refs in sync with state — refs are always current inside stale closures
  useEffect(() => { isAiSpeakingRef.current = isAiSpeaking; }, [isAiSpeaking]);
  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);

  // Start pending per-question countdown the moment Linda stops speaking.
  // Always starts from the full duration so the candidate sees the complete
  // time available to them from the moment they can actually answer.
  // The backend's TTS_PLAYBACK_BUFFER already accounts for playback lag on
  // its auto-skip timer, so no client-side subtraction is needed here.
  useEffect(() => {
    if (isAiSpeaking) return; // still speaking — nothing to do
    const pendingDur = questionTimerPendingRef.current;
    if (pendingDur === null) return; // no pending timer
    questionTimerPendingRef.current = null;
    questionTimerReceivedAtRef.current = null; // clear receipt timestamp (no longer used)

    // Always start from the full candidate window — never subtract elapsed time.
    setQuestionTimerSeconds(pendingDur);

    if (questionTimerIntervalRef.current) {
      clearInterval(questionTimerIntervalRef.current);
    }
    questionTimerIntervalRef.current = setInterval(() => {
      if (isAiSpeakingRef.current) return; // pause when Linda speaks — both timers pause
      // Global timer ticks in sync with question timer (timed mode only)
      if (!isFlexibleMode && !isNewFlexibleMode) {
        setRemainingSeconds(prev => Math.max(0, prev - 1));
      }
      setQuestionTimerSeconds(prev => {
        if (prev === null || prev <= 1) {
          if (questionTimerIntervalRef.current) {
            clearInterval(questionTimerIntervalRef.current);
            questionTimerIntervalRef.current = null;
          }
          // Safety-net: frontend timer hit 0. Backend should send question_timer_expired
          // momentarily; if it doesn't (network delay), send skip_question ourselves.
          setTimeout(() => {
            setQuestionTimerExpired(true);
            setIsClarification(false);
            setShowSilenceBanner(false);
            setSilenceCountdown(null);
            if (silenceCountdownRef.current) { clearInterval(silenceCountdownRef.current); silenceCountdownRef.current = null; }
            setStatus("Time's up — moving to the next question...");
            // Clear processing state so startRecordingInternal isn't blocked when next Q arrives.
            // (stopRecordingSilentRef early-returns if not recording, so clear explicitly.)
            setIsProcessing(false);
            isProcessingRef.current = false;
            clearNoResponseTimer();
            stopRecordingSilentRef.current();
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: 'skip_question', source: 'timer_expired' }));
            }
          }, 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [isAiSpeaking, isFlexibleMode, isNewFlexibleMode]);

  // VAD settings
  const silenceStartRef = useRef<number | null>(null);
  const speechDetectedRef = useRef(false);
  const speechStartSentRef = useRef(false); // fires speech_started once per recording session
  const silenceThresholdRef = useRef(0.008);
  const silenceDurationMsRef = useRef(2000); // default 2s; backend overrides via vad_config

  // VAD: adaptive noise floor calibration + rolling RMS window
  const noiseFloorRef = useRef(0);          // calibrated ambient noise floor
  const calibFramesRef = useRef(0);         // frames collected so far during calibration
  const calibSumRef = useRef(0);            // sum of RMS values during calibration
  const calibDoneRef = useRef(false);       // true once noise floor is established
  const rmsWindowRef = useRef<number[]>([]); // rolling window of recent RMS values (last N frames)
  // Minimum speech frames required before end_turn is sent.
  // At ~93ms/frame (4096 samples @ 44.1kHz), 5 frames ≈ 450ms.
  // Brief noise events (cough, tap, rustle) are typically < 5 frames above threshold
  // and must NOT trigger end_turn — otherwise Whisper hallucinates and the pipeline
  // treats noise as a candidate answer, advancing coverage/questions incorrectly.
  const speechFrameCountRef = useRef(0);
  const MIN_SPEECH_FRAMES = 5;

  // Silent-stream detector — catches Brave fingerprinting blocking mic audio.
  // After calibration, if every frame's RMS is essentially zero for SILENT_FRAMES_LIMIT
  // consecutive frames (~3s), the mic stream is dead and we warn the user immediately
  // rather than waiting the full 10s for the two no-response timers to fire.
  const silentFrameCountRef = useRef(0);       // consecutive near-zero frames after calib
  const silentStreamWarnedRef = useRef(false); // show warning only once per recording session
  const SILENT_FRAMES_LIMIT = 32;              // ~3 seconds at 93ms/frame
  const SILENT_RMS_MAX = 0.0001;               // below this = effectively zero / blocked

  // Save AI message
  const saveAiMessage = useCallback(() => {
    // Use currentAiTextRef first; fall back to full tokenBuffer if reveal timer
    // stopped early (e.g. LLM continued streaming after the timer caught up)
    const text = (currentAiTextRef.current || tokenBufferRef.current).trim();
    if (text) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: text
      }]);
      currentAiTextRef.current = "";
      tokenBufferRef.current = "";
      revealedCharsRef.current = 0;
      setCurrentAiText("");
    }
  }, []);

  // Token reveal system
  const startRevealingTokens = useCallback(() => {
    if (revealTimerRef.current) {
      clearInterval(revealTimerRef.current);
    }
    revealTimerRef.current = setInterval(() => {
      const fullText = tokenBufferRef.current;
      const currentRevealed = revealedCharsRef.current;
      if (currentRevealed < fullText.length) {
        const charsToReveal = Math.min(12, fullText.length - currentRevealed);
        revealedCharsRef.current += charsToReveal;
        const revealedText = fullText.substring(0, revealedCharsRef.current);
        currentAiTextRef.current = revealedText;
        setCurrentAiText(revealedText);
      } else {
        if (revealTimerRef.current) {
          clearInterval(revealTimerRef.current);
          revealTimerRef.current = null;
        }
      }
    }, 100);
  }, []);

  const stopRevealingTokens = useCallback(() => {
    if (revealTimerRef.current) {
      clearInterval(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }, []);

  const revealAllTokens = useCallback(() => {
    stopRevealingTokens();
    const fullText = tokenBufferRef.current;
    revealedCharsRef.current = fullText.length;
    currentAiTextRef.current = fullText;
    setCurrentAiText(fullText);
  }, [stopRevealingTokens]);

  useEffect(() => {
    return () => { stopRevealingTokens(); };
  }, [stopRevealingTokens]);

  // Web Speech API for real-time transcription
  // Accumulates ALL finalized segments + current interim so the user
  // sees their complete speech in the live transcript bubble.
  const webSpeechFinalizedRef = useRef("");

  const startWebSpeechRecognition = useCallback(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      // Firefox doesn't support Web Speech API — show a one-time note in the transcript area
      setCurrentTranscript("(live transcript unavailable in this browser — your audio is still being recorded)");
      setTimeout(() => setCurrentTranscript(""), 4000);
      return;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    webSpeechFinalizedRef.current = "";
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event: any) => {
      let finalizedText = '';
      let interimText = '';
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalizedText += transcript + ' ';
        } else {
          interimText += transcript;
        }
      }
      if (finalizedText) {
        webSpeechFinalizedRef.current = finalizedText.trimEnd();
      }
      // Show everything: all finalized segments + current interim
      const fullText = (webSpeechFinalizedRef.current + ' ' + interimText).trim();
      if (fullText) setCurrentTranscript(fullText);
    };
    recognition.onend = () => {
      if (isRecordingRef.current) {
        try { recognition.start(); } catch {}
      }
    };
    recognitionRef.current = recognition;
    try { recognition.start(); } catch {}
  }, []);

  const stopWebSpeechRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); recognitionRef.current = null; } catch {}
    }
    webSpeechFinalizedRef.current = "";
  }, []);

  // ── Real-time viseme loop ────────────────────────────────────────────────────
  // Driven by a Web Audio AnalyserNode tapped into the playback graph.
  // Runs every animation frame while AI audio is playing, reads RMS amplitude,
  // maps it to an Oculus viseme, and pushes it directly to head.animQueue at
  // the current head.animClock (no scheduling or timing calculations needed).

  const stopVisemeLoop = useCallback(() => {
    if (visemeRafRef.current !== null) {
      cancelAnimationFrame(visemeRafRef.current);
      visemeRafRef.current = null;
    }
  }, []);

  const startVisemeLoop = useCallback(() => {
    stopVisemeLoop(); // cancel any existing loop first

    const analyser = analyserRef.current;
    const data     = amplitudeDataRef.current;
    if (!analyser || !data) {
      console.warn("[Lipsync] AnalyserNode not ready — skipping viseme loop");
      return;
    }

    const loop = () => {
      if (!isPlayingRef.current) {
        visemeRafRef.current = null;
        return;
      }

      // Read time-domain waveform: 256 values, 0–255, centre = 128 (silence)
      analyser.getByteTimeDomainData(data);

      // Compute RMS amplitude normalised to 0.0–1.0
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms       = Math.sqrt(sum / data.length);
      const amplitude = Math.min(rms * 8, 1.0); // ×8 scale: typical speech RMS ~0.05–0.15

      if (amplitude >= 0.05) {
        // Map amplitude → Oculus viseme + influence value
        let viseme: string;
        let value: number;

        if (amplitude < 0.25) {
          // Low amplitude — barely open (bilabial / P-B-M sound region)
          viseme = "viseme_PP";
          value  = amplitude * 3.5;                       // 0.175 → 0.875
        } else if (amplitude < 0.55) {
          // Mid amplitude — open vowel (A sound region)
          viseme = "viseme_aa";
          value  = 0.4 + (amplitude - 0.25) * 1.5;       // 0.4 → 0.85
        } else {
          // High amplitude — wide open (O sound region)
          viseme = "viseme_O";
          value  = 0.7 + (amplitude - 0.55) * 0.55;      // 0.7 → 0.95
        }

        talkingHeadRef.current?.applyVisemeLive(viseme, Math.min(value, 0.95));
      }
      // Below threshold: don't push anything — TalkingHead naturally decays to idle

      visemeRafRef.current = requestAnimationFrame(loop);
    };

    visemeRafRef.current = requestAnimationFrame(loop);
    console.log("[Lipsync] Viseme loop started");
  }, [stopVisemeLoop]);

  // ── Gapless scheduled audio playback ────────────────────────────────────────
  // Instead of onended → playNextBuffer (which has JS-event-loop gaps = clicks),
  // each buffer is scheduled on the Web Audio clock so it starts exactly where
  // the previous one ends.  pendingBuffersRef tracks how many have been scheduled
  // but not yet finished — when it hits 0 AND audioEndReceivedRef is true we know
  // playback is complete and it's time to start recording.

  const handleAllAudioFinished = useCallback(() => {
    stopVisemeLoop(); // stop mouth animation when audio ends
    isPlayingRef.current = false;

    // If a speak_text callback is pending, fire it and skip normal flow
    if (speakTextCallbackRef.current) {
      const cb = speakTextCallbackRef.current;
      speakTextCallbackRef.current = null;
      isAiSpeakingRef.current = false;
      setIsAiSpeaking(false);
      avatarState.onAiStopSpeaking();
      cb();
      return;
    }

    if (audioEndReceivedRef.current) {
      isAiSpeakingRef.current = false;
      setIsAiSpeaking(false);
      avatarState.onAiStopSpeaking();
      saveAiMessage();
      if (shouldDisconnectAfterAudioRef.current || isClosingRef.current) {
        setStatus("Interview completed. Thank you!");
        setTimeout(() => { disconnect(); }, 1500);
        return;
      }
      setIsClarification(false);
      setStatus("Your turn - speak now...");
      setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          startRecordingInternal();
        }
      }, 800);
    }
  }, [saveAiMessage, avatarState, stopVisemeLoop]);

  const queueAudio = useCallback((pcmData: ArrayBuffer) => {
    // TalkingHead handles audio playback (gain:1) + lip sync.
    // Just track that we're playing and update UI state on first chunk.
    if (!isPlayingRef.current) {
      isPlayingRef.current = true;
      isAiSpeakingRef.current = true;
      setIsAiSpeaking(true);
      avatarState.onAiStartSpeaking();
      if (!revealTimerRef.current && tokenBufferRef.current.length > 0) {
        startRevealingTokens();
      }
    }
  }, [avatarState, startRevealingTokens]);

  // WebSocket handlers
  const handleMessage = useCallback((data: any) => {
    switch (data.type) {
      case "pong":
        break; // Keepalive response — no action needed
      case "viseme_timeline":
        // Deprecated — lip sync is now driven by real-time amplitude analysis.
        break;
      case "connected":
        if (data.vad_config) {
          silenceThresholdRef.current = data.vad_config.silence_threshold;
          silenceDurationMsRef.current = data.vad_config.silence_duration_ms;
        }
        break;
      case "session_resumed": {
        // Restore prior conversation messages so the candidate sees their history
        const priorMsgs: Array<{ role: string; content: string }> = data.prior_messages || [];
        if (priorMsgs.length > 0) {
          setMessages(
            priorMsgs.map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            }))
          );
        }
        setStatus(`Session resumed — continuing from question ${data.prior_question_count}`);
        break;
      }
      case "greeting":
        tokenBufferRef.current = data.text;
        revealedCharsRef.current = 0;
        isAiSpeakingRef.current = true;
        setIsAiSpeaking(true);
        avatarState.onAiStartSpeaking();
        audioEndReceivedRef.current = false;
        setStatus("Linda is speaking...");
        startRevealingTokens();
        // Feed text for word-level phoneme lip sync
        talkingHeadRef.current?.setText(data.text);
        break;
      case "transcript":
        if (data.is_final && data.text?.trim()) {
          setCurrentTranscript("");
          if (data.is_enhanced) {
            // Enhanced transcript from LLM correction — update the last user message
            setMessages(prev => {
              const updated = [...prev];
              for (let i = updated.length - 1; i >= 0; i--) {
                if (updated[i].role === "user") {
                  updated[i] = { ...updated[i], content: data.text };
                  break;
                }
              }
              return updated;
            });
          } else {
            // Raw Whisper transcript — add as new user message
            setMessages(prev => [...prev, {
              id: crypto.randomUUID(),
              role: "user",
              content: data.text
            }]);
          }
          currentAiTextRef.current = "";
          setCurrentAiText("");
        } else {
          setCurrentTranscript(data.text || "");
        }
        break;
      case "llm_token":
        tokenBufferRef.current += data.token;
        // Feed updated text for word-level phoneme lip sync
        talkingHeadRef.current?.setText(tokenBufferRef.current);
        // Restart reveal timer if it stopped (caught up) but more tokens arrived
        if (!revealTimerRef.current && isAiSpeakingRef.current) {
          startRevealingTokens();
        }
        if (!isPlayingRef.current && !isAiSpeakingRef.current) {
          setStatus("Linda is thinking...");
        }
        break;
      case "speaking_started":
        // Stop any stale recording that may have started due to a race condition
        // (e.g. Next Q clicked within the 800 ms "start recording" delay window).
        stopRecordingSilentRef.current();
        isAiSpeakingRef.current = true;
        setIsAiSpeaking(true);
        avatarState.onAiStartSpeaking();
        audioEndReceivedRef.current = false;
        pendingBuffersRef.current = 0;
        nextPlayTimeRef.current = 0;
        noResponseRetryRef.current = 0;
        // Clear silence banner + countdown when Linda starts speaking
        setShowSilenceBanner(false);
        setSilenceCountdown(null);
        if (silenceCountdownRef.current) { clearInterval(silenceCountdownRef.current); silenceCountdownRef.current = null; }
        setStatus("Linda is speaking...");
        startRevealingTokens();
        // Clear stale expired timer when Linda starts speaking the next question
        // so "TIME UP" doesn't linger while she's asking Q2.
        if (questionTimerExpired) {
          setQuestionTimerSeconds(null);
          setQuestionTimerExpired(false);
          if (questionTimerIntervalRef.current) {
            clearInterval(questionTimerIntervalRef.current);
            questionTimerIntervalRef.current = null;
          }
        }
        // Feed accumulated text for phoneme lip sync before starting audio
        talkingHeadRef.current?.setText(tokenBufferRef.current);
        // Start TalkingHead lip sync + audio stream.
        // The onAudioEnd callback fires when TalkingHead finishes playing ALL buffered audio.
        talkingHeadRef.current?.streamStart(24000, () => {
          console.log("[TalkingHead] playback-ended — all audio played");
          // Clear safety-net fallback — normal path fired, no fallback needed
          if (audioEndFallbackRef.current) {
            clearTimeout(audioEndFallbackRef.current);
            audioEndFallbackRef.current = null;
          }
          isPlayingRef.current = false;
          isAiSpeakingRef.current = false;
          setIsAiSpeaking(false);
          avatarState.onAiStopSpeaking();
          saveAiMessage();
          // Disconnect if interview is closing (Q15 done) or server sent interview_ended
          if (shouldDisconnectAfterAudioRef.current || isClosingRef.current) {
            setStatus("Interview completed. Thank you!");
            setTimeout(() => { disconnect(); }, 1500);
            return;
          }
          setIsClarification(false);
      setStatus("Your turn - speak now...");
          // 800ms delay before opening mic — lets room echo of Linda's TTS fully decay
          // so Whisper doesn't transcribe Linda's audio as the candidate's speech.
          if (startRecordingTimerRef.current) clearTimeout(startRecordingTimerRef.current);
          startRecordingTimerRef.current = setTimeout(() => {
            startRecordingTimerRef.current = null;
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              startRecordingInternal();
            }
          }, 800);
        });
        break;
      case "audio_end": {
        // Backend finished SENDING audio — but TalkingHead may still be PLAYING it.
        // Do NOT call streamStop() here — that kills playback immediately.
        // Signal worklet that no more chunks are coming — it will fire playback-ended
        // after playing the remaining buffer (instead of waiting for 300ms silence timeout).
        setIsProcessing(false);
        audioEndReceivedRef.current = true;
        revealAllTokens();
        talkingHeadRef.current?.notifyEnd();
        // Safety-net: if TalkingHead's onAudioEnd callback doesn't fire within 3 s
        // (e.g., AudioContext was suspended and worklet was never set up), start the
        // mic manually so the interview doesn't hang.
        if (audioEndFallbackRef.current) clearTimeout(audioEndFallbackRef.current);
        audioEndFallbackRef.current = setTimeout(() => {
          audioEndFallbackRef.current = null;
          if (!isRecordingRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
            isPlayingRef.current = false;
            isAiSpeakingRef.current = false;
            setIsAiSpeaking(false);
            avatarState.onAiStopSpeaking();
            saveAiMessage();
            if (shouldDisconnectAfterAudioRef.current || isClosingRef.current) {
              setStatus("Interview completed. Thank you!");
              setTimeout(() => { disconnect(); }, 1500);
              return;
            }
            console.warn("[Safety-net] TalkingHead onAudioEnd never fired — starting mic manually");
            setIsClarification(false);
      setStatus("Your turn - speak now...");
            if (startRecordingTimerRef.current) clearTimeout(startRecordingTimerRef.current);
            startRecordingTimerRef.current = setTimeout(() => {
              startRecordingTimerRef.current = null;
              startRecordingInternal();
            }, 800);
          }
        }, 3000);
        break;
      }
      case "processing":
        setIsProcessing(true);
        // Candidate responded — clear silence banner and its auto-skip countdown
        setShowSilenceBanner(false);
        setSilenceCountdown(null);
        if (silenceCountdownRef.current) { clearInterval(silenceCountdownRef.current); silenceCountdownRef.current = null; }
        setStatus("Processing your speech...");
        tokenBufferRef.current = "";
        revealedCharsRef.current = 0;
        stopRevealingTokens();
        break;
      case "buffer_started":
        // MOM: 5-minute buffer when allocated time expires
        setIsInBuffer(true);
        setRemainingSeconds((data.buffer_minutes ?? 5) * 60);
        setStatus(`Buffer time: ${data.buffer_minutes ?? 5} minutes remaining`);
        // Clear question timer when buffer kicks in
        if (questionTimerIntervalRef.current) {
          clearInterval(questionTimerIntervalRef.current);
          questionTimerIntervalRef.current = null;
        }
        setQuestionTimerSeconds(null);
        break;
      case "question_timer_started": {
        // Always use total_seconds (full 2-min window) — not data.seconds which is
        // pre-subtracted for Linda's speaking time. Timer only starts after Linda stops,
        // so the candidate always sees the full window.
        const dur = data.total_seconds ?? data.seconds ?? data.duration_seconds ?? 120;
        // DON'T show the timer yet if Linda is still speaking — it will be shown
        // once Linda stops (via the pending timer useEffect below).
        setQuestionTimerExpired(false);
        // Follow-up / clarification detection:
        // If question_number hasn't changed, this is a same-slot event — timer keeps running.
        // Backend may include is_clarification:true to distinguish clarification from follow-up.
        const incomingQNum = data.question_number ?? null;
        const isFollowUp = incomingQNum !== null && incomingQNum === questionNumberRef.current;
        if (isFollowUp) {
          if (data.total_questions != null) setTotalQuestions(data.total_questions);
          if (data.is_clarification === true) {
            setIsClarification(true);
            setStatus("Clarifying the question — timer continues");
          }
          break;
        }
        // New question — clear clarification state
        setIsClarification(false);

        // New question — deduct any remaining time from the previous question slot so
        // the global timer always steps by exactly the full question duration.
        if (!isFlexibleMode && !isNewFlexibleMode && questionNumberRef.current !== null) {
          const remaining = questionTimerSecondsRef.current ?? 0;
          if (remaining > 0) setRemainingSeconds(prev => Math.max(0, prev - remaining));
        }
        if (incomingQNum != null) setQuestionNumber(incomingQNum);
        if (data.total_questions != null) setTotalQuestions(data.total_questions);
        if (questionTimerIntervalRef.current) {
          clearInterval(questionTimerIntervalRef.current);
          questionTimerIntervalRef.current = null;
        }
        if (isAiSpeakingRef.current) {
          // Linda is still speaking — store duration and wait until she stops.
          // Countdown AND display start from the full dur once Linda finishes so the
          // candidate always sees the complete time available from the moment they can answer.
          questionTimerPendingRef.current = dur;
          questionTimerReceivedAtRef.current = Date.now();
          // Do NOT call setQuestionTimerSeconds here — keep timer hidden while Linda speaks
        } else {
          // Linda already stopped — show timer and start countdown immediately
          questionTimerPendingRef.current = null;
          questionTimerReceivedAtRef.current = null;
          setQuestionTimerSeconds(dur); // show timer now
          questionTimerIntervalRef.current = setInterval(() => {
            if (isAiSpeakingRef.current) return; // pause when Linda speaks
            // Global timer ticks in sync with question timer (timed mode only)
            if (!isFlexibleMode && !isNewFlexibleMode) {
              setRemainingSeconds(prev => Math.max(0, prev - 1));
            }
            setQuestionTimerSeconds(prev => {
              if (prev === null || prev <= 1) {
                if (questionTimerIntervalRef.current) {
                  clearInterval(questionTimerIntervalRef.current);
                  questionTimerIntervalRef.current = null;
                }
                // Safety-net: send skip_question if backend hasn't acted yet
                setTimeout(() => {
                  setQuestionTimerExpired(true);
                  setIsClarification(false);
                  setShowSilenceBanner(false);
                  setSilenceCountdown(null);
                  if (silenceCountdownRef.current) { clearInterval(silenceCountdownRef.current); silenceCountdownRef.current = null; }
                  setStatus("Time's up — moving to the next question...");
                  // Clear processing state so startRecordingInternal isn't blocked when next Q arrives.
                  setIsProcessing(false);
                  isProcessingRef.current = false;
                  clearNoResponseTimer();
                  stopRecordingSilentRef.current();
                  if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ type: 'skip_question', source: 'timer_expired' }));
                  }
                }, 0);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        }
        break;
      }
      case "question_timer_expired":
        setQuestionTimerExpired(true);
        setQuestionTimerSeconds(0);
        if (questionTimerIntervalRef.current) {
          clearInterval(questionTimerIntervalRef.current);
          questionTimerIntervalRef.current = null;
        }
        // Clear clarification badge and silence countdown — question is advancing
        setIsClarification(false);
        setShowSilenceBanner(false);
        setSilenceCountdown(null);
        if (silenceCountdownRef.current) { clearInterval(silenceCountdownRef.current); silenceCountdownRef.current = null; }
        // Clear processing state so startRecordingInternal isn't blocked when next Q arrives.
        setIsProcessing(false);
        isProcessingRef.current = false;
        clearNoResponseTimer();
        stopRecordingSilentRef.current();
        setStatus("Time's up — moving to the next question...");
        break;
      case "skill_coverage_update":
        setSkillCoverage({
          round: data.round ?? "",
          round_name: data.round_name ?? "",
          covered: data.covered ?? [],
          medium_covered: data.medium_covered ?? [],
          low_covered: data.low_covered ?? [],
          uncovered: data.uncovered ?? [],
          nice_to_have_skills: data.nice_to_have_skills ?? [],
          total_questions: data.total_questions ?? 0,
          questions_asked: data.questions_asked ?? 0,
          hr_topics: data.hr_topics && Object.keys(data.hr_topics).length > 0 ? data.hr_topics : undefined,
        });
        break;
      case "silence_detected": {
        // Backend detected silence — show banner with 30s auto-skip countdown.
        // Candidate can respond or dismiss; if they stay silent the question is skipped.
        setShowSilenceBanner(true);
        // Clear any previous countdown/timer
        if (silenceBannerTimerRef.current) clearTimeout(silenceBannerTimerRef.current);
        if (silenceCountdownRef.current) clearInterval(silenceCountdownRef.current);
        const SKIP_AFTER_S = 5;
        setSilenceCountdown(SKIP_AFTER_S);
        let remaining = SKIP_AFTER_S;
        silenceCountdownRef.current = setInterval(() => {
          remaining -= 1;
          setSilenceCountdown(remaining);
          if (remaining <= 0) {
            clearInterval(silenceCountdownRef.current!);
            silenceCountdownRef.current = null;
            setShowSilenceBanner(false);
            setSilenceCountdown(null);
            // Auto-skip: send skip_question so backend advances without ending interview
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: 'skip_question', source: 'silence_timeout' }));
            }
          }
        }, 1000);
        break;
      }
      case "question_timer_nudge":
        // Candidate has been silent for a long time — gentle prompt; don't override the
        // silence banner countdown if it's already running.
        if (!showSilenceBanner) {
          setStatus("Take your time — share whatever comes to mind, or say 'skip' to move on.");
        }
        break;
      case "interview_completion_message":
        // Show the official completion message before disconnect (Req 16)
        setCompletionMessage(data.message || "Thank you for completing the interview. Your responses have been recorded successfully.");
        setShowCompletionModal(true);
        break;
      case "interview_closing":
        setIsClosing(true); isClosingRef.current = true;
        setClosingReason(data.reason);
        setQuestionCount(data.question_count);
        setDuration(data.duration_minutes);
        setStatus("Interview ending - Linda is saying goodbye...");
        break;
      case "interview_ended":
        setStatus("Linda is saying goodbye...");
        shouldDisconnectAfterAudioRef.current = true;
        break;
      case "interview_complete":
        // Server-side forced completion (e.g., post-closing turn limit)
        setIsClosing(true); isClosingRef.current = true;
        shouldDisconnectAfterAudioRef.current = true;
        setStatus("Interview completed. Thank you!");
        disconnect();
        break;
      case "auto_disconnect":
        // Server signals that results are saved and the session should close.
        // Disconnect after any remaining audio finishes playing.
        setIsClosing(true); isClosingRef.current = true;
        shouldDisconnectAfterAudioRef.current = true;
        if (!isPlayingRef.current) {
          // No audio playing — disconnect immediately
          setStatus("Interview completed. Thank you!");
          setTimeout(() => { disconnect(); }, 500);
        }
        break;
      case "language_error":
        // Stop current recording first (otherwise startRecordingInternal
        // returns early because isRecordingRef.current is still true)
        stopRecordingSilentRef.current();
        setStatus("Let's stay focused");
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: "system",
          content: data.message,
        }]);
        setTimeout(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            setStatus("Ready to continue");
            startRecordingInternal();
          }
        }, 2000);
        break;
      case "error":
        setStatus(`Error: ${data.message}`);
        break;
    }
  }, [saveAiMessage, avatarState, startRevealingTokens, stopRevealingTokens, revealAllTokens]);

  // Keep callback refs in sync (avoids WebSocket reconnect on re-renders)
  useEffect(() => { queueAudioRef.current = queueAudio; }, [queueAudio]);
  useEffect(() => { handleMessageRef.current = handleMessage; }, [handleMessage]);

  // Upload recording
  // Waits for MediaRecorder.onstop (all ondataavailable chunks flushed) before
  // uploading — prevents the race-condition where the final chunk was still
  // in the encoder buffer when we read recordedChunksRef.
  const uploadRecording = useCallback((): Promise<void> => {
    const recorder = mediaRecorderRef.current;

    const doUpload = async () => {
      const chunks = recordedChunksRef.current;
      console.log(`[Recording] Upload: ${chunks.length} chunks, recorder=${recorder?.state ?? 'null'}`);
      if (chunks.length === 0) {
        console.warn('[Recording] No chunks to upload — recording may not have started');
        return;
      }
      // Use the recorder's negotiated mimeType; strip codec suffix for Blob constructor
      const mimeType = (recorder?.mimeType || 'video/webm').split(';')[0];
      const blob = new Blob(chunks, { type: mimeType });
      console.log(`[Recording] Uploading blob: ${(blob.size / 1024 / 1024).toFixed(1)} MB, type=${mimeType}`);
      try {
        await candidateAIInterviewService.uploadRecording(token, blob);
        console.log('[Recording] Upload succeeded');
      } catch (err: any) {
        // Log detailed error — most common cause is nginx client_max_body_size too small
        console.error(`[Recording] Upload failed — size: ${(blob.size / 1024 / 1024).toFixed(1)} MB, error: ${err?.message || err}`);
      }
    };

    // Recorder already stopped — upload whatever chunks we have now
    if (!recorder || recorder.state === 'inactive') {
      return doUpload();
    }

    // Recorder still running — stop it and wait for onstop before uploading
    return new Promise<void>((resolve) => {
      recorder.onstop = () => { doUpload().then(resolve); };
      recorder.stop();
    });
  }, [token]);

  // Clear no-response timer helper
  const clearNoResponseTimer = useCallback(() => {
    if (noResponseTimerRef.current) {
      clearTimeout(noResponseTimerRef.current);
      noResponseTimerRef.current = null;
    }
  }, []);

  // Recording
  const stopRecording = useCallback(() => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    setIsRecording(false);
    avatarState.onUserStopSpeaking();
    silenceStartRef.current = null;
    speechDetectedRef.current = false;
    stopWebSpeechRecognition();
    clearNoResponseTimer();

    // Voice verification: compare this turn's audio with enrolled baseline
    if (voiceVerification?.hasBaseline() && voiceVerifBufferRef.current.length > 0) {
      const chunks = voiceVerifBufferRef.current;
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const combined = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      const sampleRate = recordingContextRef.current?.sampleRate || 44100;
      voiceVerification.verifyVoice(combined, sampleRate);
    }
    voiceVerifBufferRef.current = [];

    setTimeout(() => {
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
      processorRef.current?.disconnect();
      processorRef.current = null;
      // Don't close recordingContext — reuse it for next recording cycle
      setStatus("Processing...");
      setIsProcessing(true);
      avatarState.onProcessing();
      // Timed mode: each question slot = exactly 2 minutes from the global budget.
      // If the candidate answered early, instantly deduct the remaining per-question
      // seconds from the global timer so the full 2-min slot is always consumed.
      const qRemaining = questionTimerSecondsRef.current;
      if (qRemaining !== null && qRemaining > 0) {
        setRemainingSeconds(prev => Math.max(0, prev - qRemaining));
      }

      // Stop the per-question countdown — candidate answered, timer no longer relevant.
      // A fresh question_timer_started will arrive after Linda asks the next question.
      if (questionTimerIntervalRef.current) {
        clearInterval(questionTimerIntervalRef.current);
        questionTimerIntervalRef.current = null;
      }
      setQuestionTimerSeconds(null);
      setQuestionTimerExpired(false);
      questionTimerPendingRef.current = null;
      questionTimerReceivedAtRef.current = null;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "end_turn" }));
      }
    }, 100);
  }, [avatarState, stopWebSpeechRecognition, clearNoResponseTimer, voiceVerification]);

  // Stop recording silently (no end_turn) — used for no-response flow
  const stopRecordingSilent = useCallback(() => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    setIsRecording(false);
    avatarState.onUserStopSpeaking();
    silenceStartRef.current = null;
    speechDetectedRef.current = false;
    stopWebSpeechRecognition();
    clearNoResponseTimer();
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    processorRef.current?.disconnect();
    processorRef.current = null;
  }, [avatarState, stopWebSpeechRecognition, clearNoResponseTimer]);

  // Mute toggle — affects current and future recording sessions
  const toggleMute = useCallback(() => {
    const next = !isMutedRef.current;
    isMutedRef.current = next;
    setIsMuted(next);
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !next; });
    }
  }, []);

  // Video toggle — affects webcam stream track
  const toggleVideo = useCallback(() => {
    setIsVideoOff(prev => {
      const next = !prev;
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getVideoTracks().forEach(t => { t.enabled = !next; });
      }
      return next;
    });
  }, []);

  const startRecordingInternal = async () => {
    // Use refs — NOT state values — because this function is called from stale
    // closures (useCallback, setTimeout) where isAiSpeaking/isProcessing are stale.
    if (isAiSpeakingRef.current || isProcessingRef.current || isRecordingRef.current) return;
    if (isFaceBlockedRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 1 }, // prefer mono but don't require it — Safari rejects hard constraint
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      // Apply mute state immediately if candidate had muted before recording started
      if (isMutedRef.current) {
        stream.getAudioTracks().forEach(t => { t.enabled = false; });
      }
      mediaStreamRef.current = stream;

      // Reuse existing recording context or create at 16 kHz so the browser
      // handles the hardware→16kHz resampling (higher quality than manual interpolation).
      if (!recordingContextRef.current || recordingContextRef.current.state === 'closed') {
        try {
          recordingContextRef.current = new AudioContext({ sampleRate: 16000 });
        } catch (err) {
          // Safari may reject non-hardware sample rates (NotSupportedError).
          // Fall back to the device's native rate — the downsampleRatio below
          // already handles any hardware sample rate dynamically.
          try {
            recordingContextRef.current = new AudioContext();
          } catch (err2) {
            console.error('[InterviewUI] Failed to create recording AudioContext:', err2);
            setStatus("Audio device error - please refresh");
            return;
          }
        }
      }
      const ctx = recordingContextRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const source = ctx.createMediaStreamSource(stream);

      // Downsample to 16kHz for the backend (hardware rate is typically 44.1/48kHz)
      const targetSampleRate = 16000;
      const downsampleRatio = ctx.sampleRate / targetSampleRate;

      silenceStartRef.current = null;
      speechDetectedRef.current = false;
      speechStartSentRef.current = false;
      // Reset adaptive VAD state for this recording session
      noiseFloorRef.current = 0;
      calibFramesRef.current = 0;
      calibSumRef.current = 0;
      calibDoneRef.current = false;
      rmsWindowRef.current = [];
      speechFrameCountRef.current = 0;
      // Reset silent-stream detector for this recording session
      silentFrameCountRef.current = 0;
      silentStreamWarnedRef.current = false;

      // Skip the first CALIB_SKIP frames before calibrating — avoids capturing
      // the candidate's opening words as "ambient noise".
      const CALIB_SKIP = 8;   // ~750ms skip at 93ms/frame
      const CALIB_FRAMES = 8; // collect 8 frames (~750ms) for the noise floor
      // Rolling window size for smoothed RMS (reduces single-frame spikes)
      const RMS_WINDOW = 8;

      // ── Shared audio processing (VAD + PCM encode + WS send) ──────────────
      // Defined once, called by both AudioWorklet and ScriptProcessor paths.
      const processAudioChunk = (input: Float32Array) => {
        if (!isRecordingRef.current) return;
        if (isMutedRef.current) return;

        // Collect raw audio at native sample rate for voice verification
        if (voiceVerification?.hasBaseline()) {
          voiceVerifBufferRef.current.push(new Float32Array(input));
        }

        // Compute RMS amplitude
        let sumSq = 0;
        for (let i = 0; i < input.length; i++) { sumSq += input[i] * input[i]; }
        const rms = Math.sqrt(sumSq / input.length);

        // Adaptive noise floor calibration
        if (!calibDoneRef.current) {
          calibFramesRef.current++;
          if (calibFramesRef.current > CALIB_SKIP) {
            calibSumRef.current += rms;
            const measured = calibFramesRef.current - CALIB_SKIP;
            if (measured >= CALIB_FRAMES) {
              const measuredFloor = calibSumRef.current / measured;
              noiseFloorRef.current = Math.min(
                Math.max(silenceThresholdRef.current, measuredFloor * 1.5),
                0.025
              );
              calibDoneRef.current = true;
            }
          }
        }

        // Smooth RMS using a rolling window
        const window = rmsWindowRef.current;
        window.push(rms);
        if (window.length > RMS_WINDOW) window.shift();
        const smoothedRms = window.reduce((a, b) => a + b, 0) / window.length;

        const effectiveThreshold = calibDoneRef.current
          ? noiseFloorRef.current
          : silenceThresholdRef.current;

        // ── Silent-stream detector ──────────────────────────────────────────
        // After calibration, if every frame's RMS stays essentially zero for
        // ~3 seconds, the microphone stream is dead (Brave fingerprinting
        // blocking, hardware muted, or OS-level permission revoked after grant).
        // Warn the user immediately instead of waiting 10 seconds.
        if (calibDoneRef.current && !silentStreamWarnedRef.current) {
          if (rms < SILENT_RMS_MAX) {
            silentFrameCountRef.current++;
            if (silentFrameCountRef.current >= SILENT_FRAMES_LIMIT) {
              silentStreamWarnedRef.current = true;
              const isBrave = !!(navigator as any).brave;
              if (isBrave) {
                setStatus(
                  "Microphone audio is being blocked — in Brave, go to brave://settings/shields, " +
                  "set Fingerprinting to Standard (not Aggressive), then refresh"
                );
              } else {
                setStatus(
                  "Microphone appears silent — check your system audio settings or try a different browser"
                );
              }
            }
          } else {
            // Got a non-zero frame — stream is alive, cancel the check
            silentFrameCountRef.current = 0;
            silentStreamWarnedRef.current = true; // no need to check again
          }
        }

        if (smoothedRms > effectiveThreshold) {
          speechFrameCountRef.current++;
          silenceStartRef.current = null;
          if (speechFrameCountRef.current >= MIN_SPEECH_FRAMES) {
            speechDetectedRef.current = true;
          }
          if (speechDetectedRef.current && !speechStartSentRef.current) {
            speechStartSentRef.current = true;
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: "speech_started" }));
            }
          }
          clearNoResponseTimer();
          noResponseRetryRef.current = 0;
        } else if (speechDetectedRef.current) {
          if (silenceStartRef.current === null) {
            silenceStartRef.current = Date.now();
          } else if (Date.now() - silenceStartRef.current > silenceDurationMsRef.current) {
            stopRecording();
            return;
          }
        } else if (speechFrameCountRef.current > 0 && speechFrameCountRef.current < MIN_SPEECH_FRAMES) {
          if (silenceStartRef.current === null) {
            silenceStartRef.current = Date.now();
          } else if (Date.now() - silenceStartRef.current > 500) {
            speechFrameCountRef.current = 0;
            silenceStartRef.current = null;
          }
        }

        // Downsample to 16kHz using linear interpolation
        let samples: Float32Array;
        if (downsampleRatio > 1) {
          const outputLen = Math.floor(input.length / downsampleRatio);
          samples = new Float32Array(outputLen);
          for (let i = 0; i < outputLen; i++) {
            const pos = i * downsampleRatio;
            const idx = Math.floor(pos);
            const frac = pos - idx;
            const a = input[idx] ?? 0;
            const b = input[Math.min(idx + 1, input.length - 1)] ?? 0;
            samples[i] = a + frac * (b - a);
          }
        } else {
          samples = input;
        }

        const pcm = new Int16Array(samples.length);
        for (let i = 0; i < samples.length; i++) {
          pcm[i] = Math.max(-32768, Math.min(32767, samples[i] * 32768));
        }
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(pcm.buffer);
        }
      };

      // ── AudioWorklet (primary) → ScriptProcessor (fallback) ───────────────
      // AudioWorklet runs off the main thread — no UI jank during recording.
      // ScriptProcessor is deprecated but kept as fallback for older browsers.
      let audioNodeConnected = false;

      if (ctx.audioWorklet) {
        try {
          // Inline worklet via blob URL — no separate file needed.
          // Accumulates 4096 samples (same as ScriptProcessor) before posting,
          // so VAD timing is identical between both paths.
          const workletCode = `
            class PCMProcessor extends AudioWorkletProcessor {
              constructor() {
                super();
                this._buf = [];
                this._size = 4096;
              }
              process(inputs) {
                const ch = inputs[0]?.[0];
                if (ch) {
                  for (let i = 0; i < ch.length; i++) this._buf.push(ch[i]);
                  while (this._buf.length >= this._size) {
                    const chunk = new Float32Array(this._buf.splice(0, this._size));
                    this.port.postMessage(chunk, [chunk.buffer]);
                  }
                }
                return true;
              }
            }
            registerProcessor('pcm-processor', PCMProcessor);
          `;
          const blob = new Blob([workletCode], { type: 'application/javascript' });
          const workletUrl = URL.createObjectURL(blob);
          await ctx.audioWorklet.addModule(workletUrl);
          URL.revokeObjectURL(workletUrl);

          const workletNode = new AudioWorkletNode(ctx, 'pcm-processor', {
            channelCount: 1,
            channelCountMode: 'explicit',
            channelInterpretation: 'discrete',
          });
          workletNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
            processAudioChunk(e.data);
          };
          source.connect(workletNode);
          workletNode.connect(ctx.destination);
          processorRef.current = workletNode;
          audioNodeConnected = true;
          console.log('[InterviewUI] AudioWorklet active');
        } catch (err) {
          console.warn('[InterviewUI] AudioWorklet unavailable, falling back to ScriptProcessor:', err);
        }
      }

      if (!audioNodeConnected) {
        // Fallback: ScriptProcessor (deprecated but universally supported)
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
          processAudioChunk(e.inputBuffer.getChannelData(0));
        };
        source.connect(processor);
        processor.connect(ctx.destination);
        processorRef.current = processor;
        console.log('[InterviewUI] ScriptProcessor active (AudioWorklet not available)');
      }
      isRecordingRef.current = true;
      setIsRecording(true);
      avatarState.onUserStartSpeaking();
      setStatus(`Listening... (auto-stops after ${silenceDurationMsRef.current / 1000}s silence)`);
      startWebSpeechRecognition();

      // No-response detection — fire after 5s of total silence with no speech.
      // If candidate hasn't spoken, ask "Are you there?" then skip after another 5s.
      clearNoResponseTimer();
      noResponseTimerRef.current = setTimeout(() => {
        if (!speechDetectedRef.current && isRecordingRef.current) {
          handleNoResponseRef.current();
        }
      }, 5000);
    } catch (err: any) {
      const errName = err?.name ?? '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        const isBrave = !!(navigator as any).brave;
        if (isBrave) {
          setStatus("Microphone blocked by Brave Shields — click the Brave icon in the address bar, disable Shields for this site, then refresh");
        } else {
          setStatus("Microphone access denied — please allow microphone in browser settings and refresh");
        }
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setStatus("No microphone detected — please connect a microphone and refresh");
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        setStatus("Microphone is in use by another app — please close it and refresh");
      } else if (errName === 'OverconstrainedError' || errName === 'ConstraintNotSatisfiedError') {
        // Some Firefox/Safari builds reject channelCount:1 on certain devices
        setStatus("Microphone constraint not supported — please try a different audio device");
      } else {
        setStatus("Microphone error — please check your audio device and refresh");
      }
      console.error('[InterviewUI] getUserMedia failed:', err);
    }
  };

  const sendTextInput = useCallback((text: string) => {
    if (!text.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (isAiSpeakingRef.current || isProcessingRef.current) return;
    // Stop voice recording if active
    if (isRecordingRef.current) stopRecordingSilentRef.current();
    clearNoResponseTimer();
    wsRef.current.send(JSON.stringify({ type: "text_input", text: text.trim() }));
    setIsProcessing(true);
    setStatus("Processing your message...");
  }, [clearNoResponseTimer]);

  const disconnect = useCallback(() => {
    stopVisemeLoop();
    stopRecording();
    clearNoResponseTimer();
    if (micPopupTimerRef.current) {
      clearTimeout(micPopupTimerRef.current);
      micPopupTimerRef.current = null;
    }
    setShowMicPopup(false);
    noResponseRetryRef.current = 0;
    wsRef.current?.close(1000, "Interview completed");
    setIsConnected(false);
    setIsRecording(false);
    setIsProcessing(false);
    setIsAiSpeaking(false);
    // thStreamActive no longer used
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    pendingBuffersRef.current = 0;
    nextPlayTimeRef.current = 0;
    audioEndReceivedRef.current = false;
    currentAiTextRef.current = "";
  }, [stopRecording, clearNoResponseTimer, stopVisemeLoop]);

  /**
   * Send text to backend for TTS synthesis via WebSocket (uses Nova voice).
   * Falls back to a silent timeout if the WebSocket is not connected.
   */
  const speakViaTTS = useCallback((text: string, onDone: () => void) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      speakTextCallbackRef.current = onDone;
      setIsAiSpeaking(true);
      avatarState.onAiStartSpeaking();
      wsRef.current.send(JSON.stringify({ type: "speak_text", text }));
    } else {
      // WebSocket not available — fall back to timeout
      setTimeout(onDone, 3000);
    }
  }, [avatarState]);

  // No-response handlers
  const handleMicPopupNo = useCallback(() => {
    setShowMicPopup(false);
    if (micPopupTimerRef.current) {
      clearTimeout(micPopupTimerRef.current);
      micPopupTimerRef.current = null;
    }
    // End interview with closing message — uses Nova TTS via WebSocket
    const closingMsg = "It seems we're having technical difficulties. Thank you for your time. The interview will now end.";
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: "assistant" as const,
      content: closingMsg,
    }]);
    setStatus("Interview ending...");
    setIsClosing(true); isClosingRef.current = true;

    speakViaTTS(closingMsg, () => {
      disconnect();
      // onInterviewComplete is called by ws.onclose after recording upload completes
    });
  }, [disconnect, speakViaTTS]);

  const handleMicPopupYes = useCallback(async () => {
    setShowMicPopup(false);
    if (micPopupTimerRef.current) {
      clearTimeout(micPopupTimerRef.current);
      micPopupTimerRef.current = null;
    }
    noResponseRetryRef.current = 0;
    setStatus("Resuming interview...");

    // Re-check microphone
    try {
      const testStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      testStream.getTracks().forEach(t => t.stop());
      setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          startRecordingInternal();
        }
      }, 500);
    } catch {
      setStatus("Microphone not available - please check your device");
    }
  }, []);

  const handleNoResponse = useCallback(() => {
    if (noResponseRetryRef.current === 0) {
      // First timeout: Linda asks "Are you there?"
      stopRecordingSilent();
      noResponseRetryRef.current = 1;

      const areYouThereMsg = "Are you there? I didn't hear a response.";
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant" as const,
        content: areYouThereMsg,
      }]);

      setStatus("Linda is speaking...");

      speakViaTTS(areYouThereMsg, () => {
        setIsClarification(false);
      setStatus("Your turn - speak now...");
        setTimeout(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            startRecordingInternal();
          }
        }, 400);
      });
    } else {
      // Second timeout: Show mic popup
      stopRecordingSilent();
      setShowMicPopup(true);
      setStatus("Checking microphone...");

      micPopupTimerRef.current = setTimeout(() => {
        handleMicPopupNo();
      }, 15000);
    }
  }, [stopRecordingSilent, avatarState, handleMicPopupNo]);

  // Keep refs in sync with latest callbacks
  useEffect(() => {
    handleNoResponseRef.current = handleNoResponse;
  }, [handleNoResponse]);
  useEffect(() => {
    stopRecordingSilentRef.current = stopRecordingSilent;
  }, [stopRecordingSilent]);

  // WebSocket connection
  const connect = useCallback(() => {
    // Audio playback is handled by TalkingHead (gain:1) — no AudioContext needed here.

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/^https?:\/\//, '').replace(/\/api\/v1$/, '') || 'localhost:8000';
    const wsUrl = `${protocol}//${apiUrl}/api/v1/ws/ai-interview/${token}`;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      setIsConnected(true);
      setStatus("Connected - Linda is greeting you...");
      reconnectAttemptsRef.current = 0;
      // Keepalive ping every 25 s — prevents proxy/nginx from closing idle connections
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25000);
    };
    ws.onclose = (event) => {
      setIsConnected(false);
      if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null; }
      if (event.code === 1000 || shouldDisconnectAfterAudioRef.current || isClosingRef.current) {
        setStatus("Interview completed. Thank you!");
        // Flush proctoring events + upload recording before navigating away.
        // Both run concurrently — proctoring flush MUST complete before onInterviewComplete
        // otherwise camera_disabled, mic_disabled etc. events are lost.
        const flushProctoring = flushProctoringEventsRef.current?.() ?? Promise.resolve();
        Promise.all([flushProctoring, uploadRecording()])
          .catch(() => {})
          .finally(() => { onInterviewComplete?.(); });
      } else if (event.code !== 3001 && !isUnmountedRef.current && !isClosingRef.current) {
        // Unexpected disconnection — flush proctoring events, then show reconnect message
        flushProctoringEventsRef.current?.().catch(() => {});
        setStatus("Connection lost. Please refresh the page to continue.");
        stopRecordingSilentRef.current();
        uploadRecording().catch(() => {});
      }
      stopRecording();
    };
    ws.onerror = () => {
      setStatus("Connection error - please refresh");
    };
    // Use refs so handlers always call the latest version without reconnecting
    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        // TalkingHead handles audio playback (gain:1) AND lip sync natively.
        // Also feed our AudioContext for pendingBuffers state tracking.
        talkingHeadRef.current?.streamAudio(event.data);
        queueAudioRef.current(event.data);
      } else {
        const data = JSON.parse(event.data);
        handleMessageRef.current(data);
      }
    };
    wsRef.current = ws;
  }, [token, onInterviewComplete, stopRecording, uploadRecording]);

  // Keep connectRef pointing at the latest connect function so auto-reconnect works
  useEffect(() => { connectRef.current = connect; }, [connect]);

  // Mic permission already granted during system check — no need to re-acquire here.
  // Re-requesting getUserMedia in fullscreen causes a browser popup overlay.

  // Connect WebSocket once avatar is ready (or after timeout fallback)
  const hasConnectedRef = useRef(false);

  // Fallback: if avatar hasn't signalled ready within 22 s, unblock the WebSocket anyway.
  // The showAvatar timeout in TalkingHeadAvatar is 20 s, so this fires shortly after
  // the error-path onReady() call, preventing the interview from hanging indefinitely.
  useEffect(() => {
    const fallback = setTimeout(() => {
      if (!avatarReady) {
        console.warn('[InterviewUI] Avatar load timeout — connecting WebSocket without avatar');
        setAvatarReady(true);
      }
    }, 22000);
    return () => clearTimeout(fallback);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!avatarReady || hasConnectedRef.current) return;
    hasConnectedRef.current = true;
    isUnmountedRef.current = false;
    const timer = setTimeout(() => { connect(); }, 300);
    return () => {
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarReady]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      isUnmountedRef.current = true;
      if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null; }
      if (questionTimerIntervalRef.current) { clearInterval(questionTimerIntervalRef.current); questionTimerIntervalRef.current = null; }
      if (audioEndFallbackRef.current) { clearTimeout(audioEndFallbackRef.current); audioEndFallbackRef.current = null; }
      wsRef.current?.close(3001, 'Component unmounted');
      try { audioContextRef.current?.close(); } catch {}
      audioContextRef.current = null;
      try { recordingContextRef.current?.close(); } catch {}
      recordingContextRef.current = null;
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
      processorRef.current?.disconnect();
      processorRef.current = null;
    };
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentAiText, currentTranscript]);

  // Flush proctoring events when the page is about to close (tab close, refresh, etc.)
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Fire-and-forget: sendBeacon is best effort but survives page close
      // candidateAIInterviewService uses unauthenticated token-based URLs, so no auth header needed
      flushProctoringEventsRef.current?.().catch(() => {});
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // DevTools / keyboard blocking during active interview
  useEffect(() => {
    if (!isConnected) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // F12 (DevTools)
      if (e.key === "F12") { e.preventDefault(); return; }
      // Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C (DevTools)
      if (e.ctrlKey && e.shiftKey && ["I","i","J","j","C","c"].includes(e.key)) { e.preventDefault(); return; }
      // Ctrl+U (View Source)
      if (e.ctrlKey && (e.key === "u" || e.key === "U")) { e.preventDefault(); return; }
      // Ctrl+S (Save Page)
      if (e.ctrlKey && (e.key === "s" || e.key === "S")) { e.preventDefault(); return; }
      // Ctrl+P (Print)
      if (e.ctrlKey && (e.key === "p" || e.key === "P")) { e.preventDefault(); return; }
    };
    const handleContextMenu = (e: MouseEvent) => { e.preventDefault(); };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("contextmenu", handleContextMenu, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("contextmenu", handleContextMenu, true);
    };
  }, [isConnected]);

  // Memoize skill coverage derived sets/arrays — recomputes only when skillCoverage changes
  const skillCoverageDerived = useMemo(() => {
    if (!skillCoverage) return null;
    const coveredSet = new Set(skillCoverage.covered);
    const mediumSet = new Set(skillCoverage.medium_covered);
    const lowSet = new Set(skillCoverage.low_covered);
    const nthSet = new Set(skillCoverage.nice_to_have_skills);
    const total = skillCoverage.covered.length + skillCoverage.medium_covered.length
      + skillCoverage.low_covered.length + skillCoverage.uncovered.length;
    const allSkills = Array.from(new Set([
      ...skillCoverage.covered,
      ...skillCoverage.medium_covered,
      ...skillCoverage.low_covered,
      ...skillCoverage.uncovered,
    ])).sort((a, b) => a.localeCompare(b));
    return { coveredSet, mediumSet, lowSet, nthSet, total, allSkills };
  }, [skillCoverage]);

  return (
    <>
      {/* ── Connection lost overlay ── */}
      {!isConnected && !isClosing && status.startsWith('Connection lost') && (
        <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-gray-900 border border-red-500 rounded-2xl p-8 max-w-sm text-center shadow-2xl">
            <div className="text-red-400 text-5xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold text-white mb-2">Connection Lost</h2>
            <p className="text-gray-400 mb-6 text-sm leading-relaxed">
              Your connection to the interview server was interrupted.<br />
              Please refresh the page to reconnect and continue from where you left off.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full px-6 py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl transition-colors"
            >
              Refresh &amp; Reconnect
            </button>
          </div>
        </div>
      )}

      {/* ── Proctoring: Camera/Mic disabled overlay ── */}
      {isConnected && (!proctoringState.isCameraActive || !proctoringState.isMicrophoneActive) && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-gray-900 border border-red-500 rounded-2xl p-8 max-w-md text-center shadow-2xl">
            <div className="text-red-500 text-5xl mb-4">
              {!proctoringState.isCameraActive ? "📷" : "🎤"}
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              {!proctoringState.isCameraActive && !proctoringState.isMicrophoneActive
                ? "Camera & Microphone Disabled"
                : !proctoringState.isCameraActive
                ? "Camera Disabled"
                : "Microphone Disabled"}
            </h2>
            <p className="text-gray-400 mb-4">
              {!proctoringState.isCameraActive
                ? "Your camera has been disabled. Please re-enable it to continue the interview."
                : "Your microphone has been disabled. Please re-enable it to continue the interview."}
            </p>
            <div className="text-sm text-red-400 font-medium animate-pulse">This event has been recorded</div>
          </div>
        </div>
      )}

      {/* ── Proctoring: Face not in frame overlay ── */}
      {isConnected && isFaceBlocked && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-gray-900 border border-amber-500 rounded-2xl p-8 max-w-md text-center shadow-2xl">
            <div className="text-amber-500 text-5xl mb-4">👤</div>
            <h2 className="text-xl font-bold text-white mb-2">Face Not Detected</h2>
            <p className="text-gray-400 mb-4">
              Your face is not visible in the camera. Please position yourself in front of the camera to continue the interview.
            </p>
            <div className="text-sm text-amber-400 font-medium animate-pulse">Interview paused — please return to frame</div>
          </div>
        </div>
      )}

      {/* Fullscreen overlay removed — no longer blocking the interview */}

      {/* ── Microphone issue popup ── */}
      {showMicPopup && (
        <div className="fixed inset-0 z-[101] bg-black/80 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-gray-900 border border-amber-500 rounded-2xl p-8 max-w-sm text-center shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="text-amber-500 text-5xl mb-4">🎤</div>
            <h2 className="text-xl font-bold text-white mb-2">Microphone Issue?</h2>
            <p className="text-gray-400 mb-3">We couldn&apos;t detect any audio. Is your microphone working?</p>
            {!!(navigator as any).brave && (
              <p className="text-amber-400 text-xs mb-4">
                Brave detected — if Fingerprinting is set to &quot;Aggressive&quot; in Shields, it can block microphone audio.
                Try setting it to &quot;Standard&quot; in brave://settings/shields, then refresh.
              </p>
            )}
            <div className="flex gap-3 justify-center">
              <button onClick={handleMicPopupYes} className="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-xl font-bold text-white transition-colors">Yes, Resume</button>
              <button onClick={handleMicPopupNo} className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-xl font-bold text-white transition-colors">No, End Interview</button>
            </div>
            <p className="text-xs text-gray-500 mt-3">Auto-closing in 15 seconds...</p>
          </div>
        </div>
      )}

      {/* ── Silence detection banner (Req 14b) ── */}
      {showSilenceBanner && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[105] animate-in fade-in slide-in-from-bottom-3 duration-300">
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-[#F59E0B]/40 bg-[#0A1020]/95 backdrop-blur-xl shadow-2xl max-w-sm">
            <div className="w-2 h-2 rounded-full bg-[#F59E0B] animate-pulse shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-[#F59E0B] font-medium block" style={{ fontSize: 13 }}>
                Are you still there? Take your time — or say &quot;skip&quot;.
              </span>
              {silenceCountdown !== null && (
                <span className="text-[#94a3b8] text-[11px]">
                  Auto-skipping in{' '}
                  <span className={`font-bold tabular-nums ${silenceCountdown <= 3 ? 'text-red-400' : 'text-[#F59E0B]'}`}>
                    {silenceCountdown}s
                  </span>
                </span>
              )}
            </div>
            <button
              onClick={() => {
                setShowSilenceBanner(false);
                setSilenceCountdown(null);
                if (silenceCountdownRef.current) { clearInterval(silenceCountdownRef.current); silenceCountdownRef.current = null; }
              }}
              className="text-[#475569] hover:text-white shrink-0 text-lg leading-none"
            >×</button>
          </div>
        </div>
      )}

      {/* ── Time's Up banner — shown when per-question timer expires ── */}
      {questionTimerExpired && !showSilenceBanner && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[105] animate-in fade-in slide-in-from-bottom-3 duration-300">
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-red-500/50 bg-[#0A1020]/95 backdrop-blur-xl shadow-2xl max-w-xs">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-red-400 font-semibold block" style={{ fontSize: 13 }}>
                Time&apos;s Up!
              </span>
              <span className="text-[#94a3b8] text-[11px]">
                Moving to the next question…
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Interview completion modal (Req 16) ── */}
      {showCompletionModal && (
        <div className="fixed inset-0 z-[110] bg-black/70 flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-[#0A1020] border border-[#10B981]/30 rounded-2xl p-8 max-w-md w-full mx-4 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-[#10B981]/15 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-[#10B981]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-white font-bold mb-3" style={{ fontSize: 20 }}>Interview Complete</h2>
            <p className="text-[#94A3B8] mb-6" style={{ fontSize: 15, lineHeight: 1.6 }}>
              {completionMessage}
            </p>
            <button
              onClick={() => setShowCompletionModal(false)}
              className="px-8 py-3 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white font-semibold transition-colors"
              style={{ fontSize: 15 }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* ── Main interview UI ── */}
      <div className="flex h-screen overflow-hidden bg-[#0F1117]">

        {/* ════ LEFT PANEL: Video feeds (dark) — 40% ════ */}
        <div className="w-[40%] flex-shrink-0 flex flex-col bg-[#0F1117] overflow-hidden" style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>

          {/* ── Top half: LINDA AI Avatar ── */}
          <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {/* Label */}
            <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse shrink-0" />
              <span className="text-gray-400 text-[11px] font-medium tracking-wide uppercase">Linda · AI Interviewer</span>
            </div>

            {/* TalkingHead fills this half */}
            <div className="absolute inset-0 overflow-hidden">
              <TalkingHeadAvatar
                ref={talkingHeadRef}
                avatarUrl="/models/rpm-recruiter.glb"
                onReady={() => setAvatarReady(true)}
                className="w-full h-full rounded-none"
              />
            </div>

            {/* Speaking glow */}
            {isAiSpeaking && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at center, rgba(147,51,234,0.10) 0%, transparent 70%)' }}
              />
            )}

            {/* Status pill — bottom centre */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-md border transition-colors duration-300 ${
                isAiSpeaking ? 'bg-purple-500/20 border-purple-500/30' :
                isRecording  ? 'bg-red-500/20 border-red-500/30' :
                               'bg-amber-500/20 border-amber-500/30'
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                  isAiSpeaking ? 'bg-purple-400' : isRecording ? 'bg-red-400' : 'bg-amber-400'
                }`} />
                <span className={`text-[11px] font-semibold ${
                  isAiSpeaking ? 'text-purple-300' : isRecording ? 'text-red-300' : 'text-amber-300'
                }`}>
                  {isAiSpeaking ? (isClarification ? 'Clarifying...' : 'Speaking...') : isRecording ? (isMuted ? 'Muted' : 'Your turn') : isProcessing ? 'Processing...' : isConnected ? 'Ready' : 'Connecting...'}
                </span>
              </div>
            </div>
          </div>

          {/* ── Bottom half: Candidate webcam ── */}
          <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Label row */}
            <div className="absolute top-0 left-0 right-0 z-10 px-3 pt-2.5 pb-1 flex items-center justify-between">
              <span className="text-gray-400 text-[11px] font-medium uppercase tracking-wide">You</span>
              <div className="flex items-center gap-2">
                {isRecording && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/25">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                    <span className="text-red-400 text-[9px] font-bold tracking-widest">REC</span>
                  </div>
                )}
                {handDetection.isHandRaised && (
                  <div className="px-2 py-0.5 bg-orange-500/25 rounded-full">
                    <span className="text-orange-400 text-[9px] font-bold">HAND RAISED</span>
                  </div>
                )}
              </div>
            </div>

            {/* Webcam feed fills this half */}
            <div className="absolute inset-0 mt-8 mx-3 mb-3 rounded-xl overflow-hidden bg-[#1a1f2e]">
              <Webcam
                ref={webcamRef}
                className="w-full h-full object-cover"
                onVideoReady={handleVideoReady}
                onStream={handleStream}
                showHandIndicator={false}
                isHandRaised={handDetection.isHandRaised}
              />

              {/* Face detection ellipse */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[55%] w-16 h-24 border border-dashed border-purple-500/25 rounded-[50%] animate-pulse pointer-events-none" />

              {/* Question timer overlay — top right (hidden while Linda speaks) */}
              {questionTimerSeconds !== null && !isAiSpeaking && (
                <div
                  className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full backdrop-blur-md border"
                  style={{
                    backgroundColor: questionTimerExpired ? 'rgba(239,68,68,0.30)' : questionTimerSeconds <= 30 ? 'rgba(239,68,68,0.20)' : questionTimerSeconds <= 60 ? 'rgba(245,158,11,0.20)' : 'rgba(147,51,234,0.20)',
                    borderColor:     questionTimerExpired ? 'rgba(239,68,68,0.50)' : questionTimerSeconds <= 30 ? 'rgba(239,68,68,0.35)' : questionTimerSeconds <= 60 ? 'rgba(245,158,11,0.35)' : 'rgba(147,51,234,0.40)',
                  }}
                >
                  <Clock className={`w-3 h-3 ${questionTimerExpired || questionTimerSeconds <= 30 ? 'text-red-400' : questionTimerSeconds <= 60 ? 'text-amber-400' : 'text-purple-400'}`} />
                  <span className={`text-[10px] font-bold tabular-nums ${
                    questionTimerExpired || questionTimerSeconds <= 30 ? 'text-red-400' : questionTimerSeconds <= 60 ? 'text-amber-400' : 'text-purple-400'
                  } ${questionTimerExpired ? 'animate-pulse' : ''}`}>
                    {questionTimerExpired ? 'Time Up' : formatTime(questionTimerSeconds)}
                  </span>
                </div>
              )}

              {/* Mic + Camera — locked during interview to prevent malpractice */}
              <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-3 py-2.5 bg-gradient-to-t from-black/70 to-transparent">
                <div
                  title="Microphone is locked — audio must stay on throughout the interview"
                  className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 text-white/40 cursor-not-allowed"
                >
                  <Mic className="w-4 h-4" />
                </div>
                <div
                  title="Camera is locked — video must stay on throughout the interview"
                  className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 text-white/40 cursor-not-allowed"
                >
                  <Video className="w-4 h-4" />
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* ════ RIGHT PANEL: Chat (fills remaining width) ════ */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">

          {/* Gradient header */}
          <div
            className="flex-shrink-0 flex items-center justify-between px-4 py-3"
            style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)' }}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <MessageSquare className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-white font-bold leading-tight" style={{ fontSize: 15 }}>Chat with LINDA</h2>
                <p className="text-white/65 text-[11px] leading-tight">Live AI-powered interview</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Identity verified */}
              {(faceVerification || voiceVerification) && (
                <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg bg-white/15 border border-white/25">
                  <ShieldCheck className="w-3 h-3 text-white" />
                  <span className="text-white text-[10px] font-semibold">ID VERIFIED</span>
                </div>
              )}
              {/* Q counter — animates on each change */}
              {questionNumber !== null && totalQuestions !== null && (
                <div
                  key={questionNumber}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/20 border border-white/30"
                  style={{ animation: 'qNumPop 0.35s cubic-bezier(0.34,1.56,0.64,1) both' }}
                >
                  <span className="text-white text-xs font-bold tabular-nums">Q {questionNumber}</span>
                  <span className="text-white/50 text-xs">/</span>
                  <span className="text-white/70 text-xs font-semibold tabular-nums">{totalQuestions}</span>
                </div>
              )}
              {/* Clarification badge — shown when backend signals is_clarification */}
              {isClarification && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/30 border border-amber-400/50 animate-pulse">
                  <span className="text-amber-200 text-[10px] font-bold tracking-wide">CLARIFYING</span>
                </div>
              )}
              <style>{`@keyframes qNumPop{0%{opacity:0;transform:scale(0.7) translateY(-4px)}60%{transform:scale(1.12) translateY(0)}100%{opacity:1;transform:scale(1) translateY(0)}}`}</style>
              {/* Per-question timer — hidden while Linda speaks */}
              {questionTimerSeconds !== null && !isAiSpeaking && (
                <div className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-bold tabular-nums transition-all duration-300 ${
                  questionTimerExpired        ? 'bg-red-500/30 border-red-400/50 text-white animate-pulse' :
                  questionTimerSeconds <= 30  ? 'bg-red-500/25 border-red-400/40 text-white' :
                  questionTimerSeconds <= 60  ? 'bg-amber-500/25 border-amber-400/40 text-white' :
                                               'bg-white/20 border-white/30 text-white'
                }`}>
                  <Clock className="w-3 h-3" />
                  <span>{questionTimerExpired ? 'TIME UP' : formatTime(questionTimerSeconds)}</span>
                </div>
              )}
              {/* Global timer */}
              <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/15 border border-white/25">
                <Timer className="w-3 h-3 text-white/80" />
                <span className={`font-mono font-bold text-xs tabular-nums ${
                  !isFlexibleMode && !isInBuffer && remainingSeconds <= 60 ? 'text-red-200' :
                  isInBuffer ? 'text-amber-200' : 'text-white'
                }`}>{formatTime(remainingSeconds)}</span>
                {isFlexibleMode && <span className="text-white/55 text-[9px] font-semibold ml-0.5">EL</span>}
                {isInBuffer && !isFlexibleMode && <span className="text-amber-200 text-[9px] font-semibold ml-0.5">BUF</span>}
              </div>
              {/* LIVE badge */}
              <div className="flex items-center gap-1 px-2 py-1 bg-white/20 rounded-full border border-white/30">
                <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                <span className="text-white text-[10px] font-bold">LIVE</span>
              </div>
              {/* Closing indicator */}
              {isClosing && (
                <div className="px-2 py-1 bg-orange-500/30 border border-orange-400/40 text-orange-100 rounded-lg text-[10px] font-medium animate-pulse">Ending...</div>
              )}
              {/* End Interview button */}
              <button
                onClick={() => setShowEndConfirm(true)}
                disabled={!isConnected}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-white/20 hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg border border-white/30 transition-all duration-200 font-semibold text-xs"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">End</span>
              </button>
            </div>
          </div>


          {/* Chat messages */}
          <div
            className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#d1d5db transparent' }}
          >
            {messages.length === 0 && !currentAiText && !currentTranscript && !isProcessing && (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-400 text-sm text-center">Conversation will appear here...</p>
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id}>
                {msg.role === 'system' ? (
                  <div className="flex justify-center">
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      <p className="text-amber-700 text-xs">{msg.content}</p>
                    </div>
                  </div>
                ) : msg.role === 'user' ? (
                  <div className="flex gap-2 flex-row-reverse">
                    <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-gray-600 text-[8px] font-bold">You</span>
                    </div>
                    <div className="max-w-[80%] px-3.5 py-2 bg-white text-gray-700 rounded-2xl rounded-tr-sm border border-gray-100 shadow-sm">
                      <p className="text-sm leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 shadow-sm mt-0.5" style={{ background: 'linear-gradient(135deg, #7c3aed, #ec4899)' }}>
                      <span className="text-white text-[8px] font-bold">L</span>
                    </div>
                    <div className="max-w-[80%]">
                      <span className="text-[10px] font-semibold text-purple-600 mb-0.5 block">LINDA</span>
                      <div className="px-3.5 py-2 bg-white text-gray-800 rounded-2xl rounded-tl-sm border border-gray-100 shadow-sm">
                        <p className="text-sm leading-relaxed">{msg.content}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Live speech transcript */}
            {currentTranscript && (
              <div className="flex gap-2 flex-row-reverse">
                <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-gray-600 text-[8px] font-bold">You</span>
                </div>
                <div className="max-w-[80%] px-3.5 py-2 bg-red-50 text-gray-700 rounded-2xl rounded-tr-sm border border-red-100 shadow-sm">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                    <span className="text-red-400 text-[10px] font-medium">speaking...</span>
                  </div>
                  <p className="text-sm leading-relaxed italic">{currentTranscript}</p>
                </div>
              </div>
            )}

            {/* Live AI text (streaming) */}
            {currentAiText && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 shadow-sm mt-0.5" style={{ background: 'linear-gradient(135deg, #7c3aed, #ec4899)' }}>
                  <span className="text-white text-[8px] font-bold">L</span>
                </div>
                <div className="max-w-[80%]">
                  <span className="text-[10px] font-semibold text-purple-600 mb-0.5 block">LINDA</span>
                  <div className="px-3.5 py-2 bg-white text-gray-800 rounded-2xl rounded-tl-sm border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-1 mb-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <p className="text-sm leading-relaxed">{currentAiText}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Thinking dots */}
            {isProcessing && !currentAiText && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 shadow-sm mt-0.5" style={{ background: 'linear-gradient(135deg, #7c3aed, #ec4899)' }}>
                  <span className="text-white text-[8px] font-bold">L</span>
                </div>
                <div className="px-3.5 py-2.5 bg-white rounded-2xl rounded-tl-sm border border-gray-100 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="flex-shrink-0 border-t border-gray-100 bg-white px-4 pt-3 pb-3">
            {/* Action row */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-xs font-medium">Type or speak your answer</span>
              <div className="flex items-center gap-2">
                {/* Next Question button — visible during answer time and when timer expires */}
                {questionTimerSeconds !== null && !isAiSpeaking && !isClosing && (
                  <button
                    disabled={questionTimerExpired}
                    onClick={() => {
                      if (questionTimerExpired) return; // skip_question already sent by timer

                      // 1. Stop mic silently — no end_turn, no processing state
                      stopRecordingSilentRef.current();

                      // 2. Clear no-response timer explicitly (stopRecordingSilent skips this
                      //    when isRecording=false, e.g. candidate never spoke)
                      clearNoResponseTimer();

                      // 3. Clear processing state in case it was set by a previous answer
                      setIsProcessing(false);
                      isProcessingRef.current = false;

                      // 4. Reset audioEndReceivedRef so the stale Q1 audio_end can't
                      //    trigger handleAllAudioFinished → startRecording before Q2 is asked.
                      audioEndReceivedRef.current = false;

                      // 5. Cancel any audio-end safety-net fallback from Q1
                      if (audioEndFallbackRef.current) {
                        clearTimeout(audioEndFallbackRef.current);
                        audioEndFallbackRef.current = null;
                      }

                      // 5b. Cancel any pending "start recording" timer so a stale
                      //     startRecordingInternal() call can't fire after the skip.
                      if (startRecordingTimerRef.current) {
                        clearTimeout(startRecordingTimerRef.current);
                        startRecordingTimerRef.current = null;
                      }

                      // 5c. Visual feedback while waiting for Linda to speak the next question
                      setStatus("Linda is preparing the next question...");

                      // 6. Dismiss silence banner if active
                      if (showSilenceBanner) {
                        setShowSilenceBanner(false);
                        setSilenceCountdown(null);
                        if (silenceCountdownRef.current) { clearInterval(silenceCountdownRef.current); silenceCountdownRef.current = null; }
                      }

                      // 7. Deduct remaining per-question time from global budget
                      const remaining = questionTimerSecondsRef.current ?? 0;
                      if (remaining > 0 && !isFlexibleMode && !isNewFlexibleMode) {
                        setRemainingSeconds(prev => Math.max(0, prev - remaining));
                      }

                      // 8. Send skip — backend generates next Q
                      if (wsRef.current?.readyState === WebSocket.OPEN) {
                        wsRef.current.send(JSON.stringify({ type: 'skip_question', source: 'candidate' }));
                      }

                      // 9. Clear question timer state
                      if (questionTimerIntervalRef.current) {
                        clearInterval(questionTimerIntervalRef.current);
                        questionTimerIntervalRef.current = null;
                      }
                      questionTimerPendingRef.current = null;
                      questionTimerReceivedAtRef.current = null;
                      questionTimerSecondsRef.current = null;
                      setQuestionTimerSeconds(null);
                      setQuestionTimerExpired(false);
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all duration-200 ${
                      questionTimerExpired
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:opacity-80'
                    }`}
                    style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.08), rgba(236,72,153,0.08))', borderColor: 'rgba(124,58,237,0.25)', color: '#7c3aed' }}
                  >
                    {questionTimerExpired ? 'Skipping…' : 'Next Q →'}
                  </button>
                )}
                {/* Recording badge */}
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-50 border border-red-100">
                  <ShieldCheck className="w-3 h-3 text-red-400" />
                  <span className="text-red-400 text-[10px] font-semibold">Recording</span>
                </div>
              </div>
            </div>

            {/* Input row */}
            <div className="flex gap-2">
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && textInput.trim()) {
                    e.preventDefault();
                    sendTextInput(textInput);
                    setTextInput('');
                  }
                }}
                placeholder={
                  isAiSpeaking ? 'Wait for LINDA to finish...' :
                  isProcessing  ? 'Processing...' :
                  'Type your answer or use speech...'
                }
                disabled={isAiSpeaking || isProcessing || !isConnected}
                rows={2}
                className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 text-sm"
              />
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={toggleMute}
                  disabled={!isConnected}
                  title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white font-semibold text-sm transition-all duration-200 disabled:opacity-40 shadow-sm"
                  style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)' }}
                >
                  <Mic className="w-4 h-4" />
                  {isMuted ? 'Muted' : 'Speak'}
                </button>
                <button
                  type="button"
                  onClick={() => { if (textInput.trim()) { sendTextInput(textInput); setTextInput(''); } }}
                  disabled={!textInput.trim() || isAiSpeaking || isProcessing || !isConnected}
                  className="p-2 rounded-xl text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-sm flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)' }}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>

            <p className="text-gray-400 text-[11px] mt-1.5">⊙ Press Enter to submit</p>
          </div>
        </div>


      </div>

      {/* End Interview Confirmation Modal */}
      {showEndConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowEndConfirm(false)}
          />
          {/* Modal */}
          <div className="relative w-full max-w-sm bg-[#0F1929] border border-white/[0.10] rounded-2xl shadow-2xl shadow-black/60 p-6 flex flex-col gap-5">
            {/* Icon */}
            <div className="flex items-center justify-center w-12 h-12 mx-auto rounded-full bg-[#DC2626]/15 border border-[#DC2626]/30">
              <LogOut className="w-5 h-5 text-[#EF4444]" />
            </div>
            {/* Text */}
            <div className="text-center">
              <h3 className="text-white font-semibold mb-1.5" style={{ fontSize: 16 }}>End the interview?</h3>
              <p className="text-[#64748B]" style={{ fontSize: 13, lineHeight: 1.6 }}>
                Are you sure you want to end this interview session? This action cannot be undone.
              </p>
            </div>
            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowEndConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-white/[0.10] text-[#94A3B8] hover:bg-white/[0.05] hover:text-white transition-all duration-200"
                style={{ fontSize: 13, fontWeight: 500 }}
              >
                Continue Interview
              </button>
              <button
                onClick={() => {
                  setShowEndConfirm(false);
                  if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ type: 'end_interview' }));
                  }
                  disconnect();
                  // onInterviewComplete is called by ws.onclose after recording upload completes
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white transition-all duration-200 shadow-lg shadow-red-500/20"
                style={{ fontSize: 13, fontWeight: 600 }}
              >
                End Interview
              </button>
            </div>
          </div>
        </div>
      )}

      <InterviewProctoringWarnings />
    </>
  );
}
