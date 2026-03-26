"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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
import { Maximize2, Clock, Timer, LogOut, Bot, Send, Mic, MessageSquare, ShieldCheck, Video, VideoOff, MicOff, Monitor, Wifi, BrainCircuit, TrendingUp } from "lucide-react";
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
  // Pending: timer duration received but interval not started yet (waiting for Linda to stop)
  const questionTimerPendingRef = useRef<number | null>(null);
  // Question progress counter (sent with question_timer_started)
  const [questionNumber, setQuestionNumber] = useState<number | null>(null);
  const [totalQuestions, setTotalQuestions] = useState<number | null>(null);

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
  } | null>(null);

  // Figma UI state
  const [waveHeights, setWaveHeights] = useState<number[]>(Array(30).fill(4));
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  // WebSocket keepalive / reconnect refs
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isUnmountedRef = useRef(false);
  const connectRef = useRef<() => void>(() => {});

  // Timer modes:
  //   isFlexibleMode      = duration 0 (legacy unlimited) → count UP, pause while Linda speaks
  //   isNewFlexibleMode   = duration > 0, interview_mode='flexible' → count DOWN, runs NON-STOP
  //   timed / fixed       = duration > 0, interview_mode='fixed'  → count DOWN, pause while Linda speaks
  const isFlexibleMode = interviewInfo.duration_minutes === 0;
  const isNewFlexibleMode = !isFlexibleMode && interviewInfo.interview_mode === 'flexible';
  const [remainingSeconds, setRemainingSeconds] = useState(isFlexibleMode ? 0 : interviewInfo.duration_minutes * 60);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isConnected || isClosing) return;
    timerIntervalRef.current = setInterval(() => {
      // Flexible (new 30-min): timer runs non-stop — Linda's speaking time counts toward 30 min.
      // Fixed/timed and legacy flexible: pause while Linda is speaking or processing.
      if (!isNewFlexibleMode && (isAiSpeakingRef.current || isProcessingRef.current)) return;
      setRemainingSeconds(prev => {
        if (isFlexibleMode) return prev + 1; // legacy unlimited: count up
        if (prev <= 1) {
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isConnected, isClosing, isFlexibleMode, isNewFlexibleMode]);

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

  const { state: proctoringState, emitEvent, setReducedFrequency } = useInterviewProctoringMonitor({
    token,
    stream: webcamStream,
    enabled: isConnected,
    voiceDetectionSensitivity: 50,
    obstructionThreshold: 30,
    reportEvent: reportProctorEvent,
  });

  // Fullscreen — disabled (no popup/overlay)
  const isFullscreenActive = true;

  // Face detection & gaze tracking (Phase 2 & 3)
  const handleFaceMissing = useCallback(() => {
    emitEvent('face_missing', { timestamp: new Date().toISOString() });
  }, [emitEvent]);

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
      try {
        startRecorder({ ...RECORDER_OPTIONS, mimeType: "video/webm;codecs=vp9" });
      } catch {
        try {
          startRecorder({ ...RECORDER_OPTIONS, mimeType: "video/webm;codecs=vp8" });
        } catch {
          try {
            // Last resort: browser default codec, still apply bitrate cap
            startRecorder(RECORDER_OPTIONS);
          } catch (err) {
            console.error("[Recording] MediaRecorder not supported:", err);
          }
        }
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
  const processorRef = useRef<ScriptProcessorNode | null>(null);
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

  // Start pending per-question countdown the moment Linda stops speaking
  useEffect(() => {
    if (isAiSpeaking) return; // still speaking — nothing to do
    const pendingDur = questionTimerPendingRef.current;
    if (pendingDur === null) return; // no pending timer
    questionTimerPendingRef.current = null;
    if (questionTimerIntervalRef.current) {
      clearInterval(questionTimerIntervalRef.current);
    }
    questionTimerIntervalRef.current = setInterval(() => {
      setQuestionTimerSeconds(prev => {
        if (prev === null || prev <= 1) {
          if (questionTimerIntervalRef.current) {
            clearInterval(questionTimerIntervalRef.current);
            questionTimerIntervalRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [isAiSpeaking]);

  // VAD settings
  const silenceStartRef = useRef<number | null>(null);
  const speechDetectedRef = useRef(false);
  const speechStartSentRef = useRef(false); // fires speech_started once per recording session
  const silenceThresholdRef = useRef(0.008);
  const silenceDurationMsRef = useRef(5000);

  // VAD: adaptive noise floor calibration + rolling RMS window
  const noiseFloorRef = useRef(0);          // calibrated ambient noise floor
  const calibFramesRef = useRef(0);         // frames collected so far during calibration
  const calibSumRef = useRef(0);            // sum of RMS values during calibration
  const calibDoneRef = useRef(false);       // true once noise floor is established
  const rmsWindowRef = useRef<number[]>([]); // rolling window of recent RMS values (last N frames)

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
    if (!SpeechRecognition) return;
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
      setIsAiSpeaking(false);
      avatarState.onAiStopSpeaking();
      cb();
      return;
    }

    if (audioEndReceivedRef.current) {
      setIsAiSpeaking(false);
      avatarState.onAiStopSpeaking();
      saveAiMessage();
      if (shouldDisconnectAfterAudioRef.current) {
        setStatus("Interview completed. Thank you!");
        setTimeout(() => { disconnect(); }, 1500);
        return;
      }
      setStatus("Your turn - speak now...");
      setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          startRecordingInternal();
        }
      }, 400);
    }
  }, [saveAiMessage, avatarState, stopVisemeLoop]);

  const queueAudio = useCallback((pcmData: ArrayBuffer) => {
    // TalkingHead handles audio playback (gain:1) + lip sync.
    // Just track that we're playing and update UI state on first chunk.
    if (!isPlayingRef.current) {
      isPlayingRef.current = true;
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
      case "greeting":
        tokenBufferRef.current = data.text;
        revealedCharsRef.current = 0;
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
        setIsAiSpeaking(true);
        avatarState.onAiStartSpeaking();
        audioEndReceivedRef.current = false;
        pendingBuffersRef.current = 0;
        nextPlayTimeRef.current = 0;
        noResponseRetryRef.current = 0;
        setStatus("Linda is speaking...");
        startRevealingTokens();
        // Clear any stale expired timer from the previous question so it
        // doesn't show "0:00" while Linda is speaking the next question.
        // The timer will re-appear (fresh) when question_timer_started arrives
        // after Linda finishes speaking.
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
          setIsAiSpeaking(false);
          avatarState.onAiStopSpeaking();
          saveAiMessage();
          if (shouldDisconnectAfterAudioRef.current) {
            setStatus("Interview completed. Thank you!");
            setTimeout(() => { disconnect(); }, 1500);
            return;
          }
          setStatus("Your turn - speak now...");
          setTimeout(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              startRecordingInternal();
            }
          }, 150);
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
          if (!isRecordingRef.current && !shouldDisconnectAfterAudioRef.current
              && wsRef.current?.readyState === WebSocket.OPEN) {
            console.warn("[Safety-net] TalkingHead onAudioEnd never fired — starting mic manually");
            isPlayingRef.current = false;
            setIsAiSpeaking(false);
            avatarState.onAiStopSpeaking();
            saveAiMessage();
            setStatus("Your turn - speak now...");
            startRecordingInternal();
          }
        }, 3000);
        break;
      }
      case "processing":
        setIsProcessing(true);
        setShowSilenceBanner(false); // candidate responded — hide silence banner
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
        const dur = data.seconds ?? data.duration_seconds ?? 120;
        setQuestionTimerSeconds(dur);
        setQuestionTimerExpired(false);
        if (data.question_number != null) setQuestionNumber(data.question_number);
        if (data.total_questions != null) setTotalQuestions(data.total_questions);
        if (questionTimerIntervalRef.current) {
          clearInterval(questionTimerIntervalRef.current);
          questionTimerIntervalRef.current = null;
        }
        if (isAiSpeakingRef.current) {
          // Linda is still speaking — store duration and wait until she stops
          questionTimerPendingRef.current = dur;
        } else {
          // Linda already stopped — start countdown immediately
          questionTimerPendingRef.current = null;
          questionTimerIntervalRef.current = setInterval(() => {
            setQuestionTimerSeconds(prev => {
              if (prev === null || prev <= 1) {
                if (questionTimerIntervalRef.current) {
                  clearInterval(questionTimerIntervalRef.current);
                  questionTimerIntervalRef.current = null;
                }
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
        });
        break;
      case "silence_detected":
        // Backend sent "Are you there?" TTS at 25s of silence — also show UI banner
        setShowSilenceBanner(true);
        if (silenceBannerTimerRef.current) clearTimeout(silenceBannerTimerRef.current);
        silenceBannerTimerRef.current = setTimeout(() => setShowSilenceBanner(false), 8000);
        break;
      case "question_timer_nudge":
        // Candidate has been silent for 45s — show a gentle prompt in the status bar
        setShowSilenceBanner(false); // clear earlier banner if still showing
        setStatus("Take your time — share whatever comes to mind, or say 'skip' to move on.");
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
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

      // Reuse existing recording context or create with default hardware sample rate
      if (!recordingContextRef.current || recordingContextRef.current.state === 'closed') {
        try {
          recordingContextRef.current = new AudioContext();
        } catch (err) {
          console.error('[InterviewUI] Failed to create recording AudioContext:', err);
          setStatus("Audio device error - please refresh");
          return;
        }
      }
      const ctx = recordingContextRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);

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

      // Number of frames to use for noise floor calibration (~500ms at 4096/44.1kHz ≈ 93ms/frame)
      const CALIB_FRAMES = 5;
      // Rolling window size for smoothed RMS (reduces single-frame spikes)
      const RMS_WINDOW = 8;

      processor.onaudioprocess = (e) => {
        if (!isRecordingRef.current) return;
        const input = e.inputBuffer.getChannelData(0);

        // Collect raw audio at native sample rate for voice verification
        if (voiceVerification?.hasBaseline()) {
          voiceVerifBufferRef.current.push(new Float32Array(input));
        }

        // Compute RMS amplitude (more accurate than mean absolute value)
        let sumSq = 0;
        for (let i = 0; i < input.length; i++) { sumSq += input[i] * input[i]; }
        const rms = Math.sqrt(sumSq / input.length);

        // Adaptive noise floor: calibrate on first CALIB_FRAMES frames
        if (!calibDoneRef.current) {
          calibSumRef.current += rms;
          calibFramesRef.current++;
          if (calibFramesRef.current >= CALIB_FRAMES) {
            const measuredFloor = calibSumRef.current / calibFramesRef.current;
            // Use max of server threshold and 2× measured ambient noise
            noiseFloorRef.current = Math.max(
              silenceThresholdRef.current,
              measuredFloor * 2
            );
            calibDoneRef.current = true;
          }
          // Still send audio during calibration, just skip VAD decisions
        }

        // Smooth RMS using a rolling window
        const window = rmsWindowRef.current;
        window.push(rms);
        if (window.length > RMS_WINDOW) window.shift();
        const smoothedRms = window.reduce((a, b) => a + b, 0) / window.length;

        // Use calibrated floor once ready, otherwise fall back to server threshold
        const effectiveThreshold = calibDoneRef.current
          ? noiseFloorRef.current
          : silenceThresholdRef.current;

        if (smoothedRms > effectiveThreshold) {
          speechDetectedRef.current = true;
          silenceStartRef.current = null;
          // Notify backend on first actual speech — resets question timer to full duration
          if (!speechStartSentRef.current) {
            speechStartSentRef.current = true;
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: "speech_started" }));
            }
          }
          // Clear no-response timer — candidate is speaking
          clearNoResponseTimer();
          noResponseRetryRef.current = 0;
        } else if (speechDetectedRef.current) {
          if (silenceStartRef.current === null) {
            silenceStartRef.current = Date.now();
          } else if (Date.now() - silenceStartRef.current > silenceDurationMsRef.current) {
            stopRecording();
            return;
          }
        }

        // Downsample to 16kHz using linear interpolation for better quality
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

      source.connect(processor);
      processor.connect(ctx.destination);
      processorRef.current = processor;
      isRecordingRef.current = true;
      setIsRecording(true);
      avatarState.onUserStartSpeaking();
      setStatus(`Listening... (auto-stops after ${silenceDurationMsRef.current / 1000}s silence)`);
      startWebSpeechRecognition();

      // No-response detection — only fire after 20s of total silence
      // (3s was too aggressive; candidate may just be thinking)
      clearNoResponseTimer();
      noResponseTimerRef.current = setTimeout(() => {
        if (!speechDetectedRef.current && isRecordingRef.current) {
          handleNoResponseRef.current();
        }
      }, 20000);
    } catch (err: any) {
      const errName = err?.name ?? '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setStatus("Microphone access denied — please allow microphone in browser settings and refresh");
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setStatus("No microphone detected — please connect a microphone and refresh");
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        setStatus("Microphone is in use by another app — please close it and refresh");
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
      }, 3000);
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
        // Upload FIRST, then navigate — prevents the page change from killing the in-flight request
        uploadRecording().then(() => {
          onInterviewComplete?.();
        });
      } else if (event.code !== 3001 && !isUnmountedRef.current && !isClosingRef.current) {
        // Unexpected disconnection — attempt auto-reconnect (max 3 times)
        const attempt = ++reconnectAttemptsRef.current;
        if (attempt <= 3) {
          setStatus(`Connection lost. Reconnecting... (${attempt}/3)`);
          setTimeout(() => {
            if (!isUnmountedRef.current) connectRef.current();
          }, 2000 * attempt);
        } else {
          // All reconnect attempts exhausted — still upload whatever was recorded
          setStatus("Connection failed. Saving recording...");
          uploadRecording().then(() => {
            setStatus("Connection failed. Please refresh the page.");
          });
        }
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

  return (
    <>
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

      {/* Fullscreen overlay removed — no longer blocking the interview */}

      {/* ── Microphone issue popup ── */}
      {showMicPopup && (
        <div className="fixed inset-0 z-[101] bg-black/80 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-gray-900 border border-amber-500 rounded-2xl p-8 max-w-sm text-center shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="text-amber-500 text-5xl mb-4">🎤</div>
            <h2 className="text-xl font-bold text-white mb-2">Microphone Issue?</h2>
            <p className="text-gray-400 mb-6">We couldn&apos;t detect any audio. Is your microphone working?</p>
            <div className="flex gap-3 justify-center">
              <button onClick={handleMicPopupYes} className="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-xl font-bold text-white transition-colors">Yes, Resume</button>
              <button onClick={handleMicPopupNo} className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-xl font-bold text-white transition-colors">No, End Interview</button>
            </div>
            <p className="text-xs text-gray-500 mt-3">Auto-closing in 3 seconds...</p>
          </div>
        </div>
      )}

      {/* ── Silence detection banner (Req 14b) ── */}
      {showSilenceBanner && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[105] animate-in fade-in slide-in-from-bottom-3 duration-300">
          <div className="flex items-center gap-3 px-5 py-3 rounded-2xl border border-[#F59E0B]/30 bg-[#0A1020]/95 backdrop-blur-xl shadow-2xl">
            <div className="w-2 h-2 rounded-full bg-[#F59E0B] animate-pulse shrink-0" />
            <span className="text-[#F59E0B] font-medium" style={{ fontSize: 14 }}>
              Are you still there? Take your time — or say &quot;skip&quot; to move on.
            </span>
            <button
              onClick={() => setShowSilenceBanner(false)}
              className="text-[#475569] hover:text-white ml-1 shrink-0"
              style={{ fontSize: 16, lineHeight: 1 }}
            >×</button>
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

      {/* ── Main interview UI (Figma design) ── */}
      <div className="flex flex-col h-screen overflow-hidden transition-colors duration-500 bg-[#080D18]">

        {/* ── Top Nav ── */}
        <div className="relative backdrop-blur-xl border-b border-white/[0.08] bg-[#0A1020]/95 flex-shrink-0">
          <div className="flex items-center justify-between px-3 sm:px-5 py-2.5 sm:py-3">

            {/* Left: Logo */}
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#1D4ED8] flex items-center justify-center shadow-lg shadow-blue-900/40 shrink-0">
                <span className="text-white" style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5 }}>AI</span>
                <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#10B981] border-2 border-[#0B1120]" />
              </div>
              <div className="flex flex-col">
                <span className="text-white hidden sm:block" style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.3 }}>AI Interview Suite</span>
                <span className="text-white sm:hidden" style={{ fontSize: 14, fontWeight: 700 }}>AI Interview</span>
                <span className="text-[#475569] hidden md:block truncate max-w-[220px]" style={{ fontSize: 11 }}>{interviewInfo.position}</span>
              </div>
            </div>

            {/* Center: Timer + status */}
            <div className="hidden md:flex items-center gap-4 lg:gap-6">
              <div className={`flex items-center gap-2 px-3 lg:px-4 py-1.5 rounded-full border ${
                isFlexibleMode
                  ? 'bg-white/[0.04] border-white/[0.06]'
                  : isInBuffer
                  ? 'bg-amber-500/10 border-amber-500/20'
                  : remainingSeconds <= 60
                  ? 'bg-[#EF4444]/10 border-[#EF4444]/20'
                  : 'bg-white/[0.04] border-white/[0.06]'
              }`}>
                <Timer className={`w-3.5 h-3.5 ${isFlexibleMode ? 'text-[#94A3B8]' : isInBuffer ? 'text-amber-400' : 'text-[#94A3B8]'}`} />
                <div className={`w-2 h-2 rounded-full animate-pulse ${isFlexibleMode ? 'bg-[#10B981]' : isInBuffer ? 'bg-amber-400' : remainingSeconds <= 60 ? 'bg-[#EF4444]' : 'bg-[#10B981]'}`} />
                <span className={`tabular-nums ${isFlexibleMode ? 'text-white' : isInBuffer ? 'text-amber-400' : remainingSeconds <= 60 ? 'text-[#EF4444]' : 'text-white'}`} style={{ fontSize: 14, fontWeight: 600, letterSpacing: 0.5 }}>
                  {formatTime(remainingSeconds)}
                </span>
                {isFlexibleMode && (
                  <span className="text-[#94A3B8] ml-0.5" style={{ fontSize: 10, fontWeight: 600 }}>ELAPSED</span>
                )}
                {isInBuffer && !isFlexibleMode && (
                  <span className="text-amber-400 ml-0.5" style={{ fontSize: 10, fontWeight: 600 }}>BUFFER</span>
                )}
              </div>
              {isClosing && (
                <div className="px-3 py-1.5 bg-orange-500/20 text-orange-400 rounded-lg text-sm font-medium animate-pulse">Ending...</div>
              )}
              {!isClosing && (
                <div className={`text-xs px-2.5 py-1 rounded-full ${isConnected ? 'bg-[#10B981]/15 text-[#10B981]' : 'bg-gray-500/20 text-gray-500'}`}>
                  {isConnected ? '● Live' : '○ Connecting'}
                </div>
              )}
            </div>

            {/* Mobile: compact timer */}
            <div className="flex md:hidden items-center gap-2">
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${isInBuffer && !isFlexibleMode ? 'bg-amber-500/10 border-amber-500/20' : 'bg-white/[0.04] border-white/[0.06]'}`}>
                <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isFlexibleMode ? 'bg-[#10B981]' : isInBuffer ? 'bg-amber-400' : remainingSeconds <= 60 ? 'bg-[#EF4444]' : 'bg-[#10B981]'}`} />
                <span className={`tabular-nums ${isInBuffer && !isFlexibleMode ? 'text-amber-400' : 'text-white'}`} style={{ fontSize: 12, fontWeight: 600 }}>{formatTime(remainingSeconds)}</span>
              </div>
            </div>

            {/* Right: Identity badge + End interview */}
            <div className="flex items-center gap-1.5 lg:gap-2">
              {/* Identity Verification badge */}
              {(faceVerification || voiceVerification) && (
                <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#10B981]/10 border border-[#10B981]/15">
                  <ShieldCheck className="w-3 h-3 text-[#10B981]" />
                  <span className="text-[#10B981]" style={{ fontSize: 10, fontWeight: 600 }}>ID VERIFIED</span>
                </div>
              )}
              <button
                onClick={() => setShowEndConfirm(true)}
                disabled={!isConnected}
                className="flex items-center gap-1.5 lg:gap-2 px-3 lg:px-4 py-2 bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-all duration-300 shadow-lg shadow-red-500/20"
                style={{ fontSize: 13, fontWeight: 600 }}
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">End Interview</span>
                <span className="lg:hidden">End</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Main content: Avatar (left) | Candidate (right) ── */}
        <div className="flex-1 flex flex-col lg:flex-row gap-2 sm:gap-3 p-2 sm:p-3 min-h-0 overflow-auto lg:overflow-hidden">

          {/* ════ AI Avatar Panel ════ */}
          <div className="w-full lg:flex-[3] flex flex-col min-h-0">
            <div className="relative rounded-2xl overflow-hidden flex flex-col items-center justify-center bg-gradient-to-br from-[#0A1020] via-[#0D1626] to-[#0F1A2E] border border-white/[0.07] min-h-[280px] sm:min-h-[320px] lg:min-h-0 lg:flex-1">

              {/* Ambient glow */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 sm:w-64 lg:w-80 h-48 sm:h-64 lg:h-80 rounded-full blur-[80px] lg:blur-[100px] bg-[#2563EB] transition-opacity duration-500"
                  style={{ opacity: isAiSpeaking ? 0.10 : 0.05 }}
                />
                <div
                  className="absolute top-[30%] left-[25%] w-32 sm:w-44 lg:w-56 h-32 sm:h-44 lg:h-56 rounded-full blur-[60px] lg:blur-[80px] bg-[#1D4ED8]"
                  style={{ opacity: 0.04 }}
                />
              </div>

              {/* Dot grid */}
              <div
                className="absolute inset-0 pointer-events-none opacity-[0.03]"
                style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '32px 32px' }}
              />

              {/* TalkingHead avatar — fills the panel */}
              <div className="absolute inset-0 overflow-hidden">
                <TalkingHeadAvatar
                  ref={talkingHeadRef}
                  avatarUrl="/models/rpm-recruiter.glb"
                  onReady={() => setAvatarReady(true)}
                  className="w-full h-full rounded-none"
                />
              </div>

              {/* Speaking glow overlay */}
              {isAiSpeaking && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: 'radial-gradient(ellipse at center, rgba(37,99,235,0.10) 0%, transparent 65%)', animation: 'pulse 2s infinite' }}
                />
              )}

              {/* Status pill */}
              <div className="absolute bottom-20 sm:bottom-24 left-1/2 -translate-x-1/2 z-10">
                <div className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-full transition-colors duration-300 ${
                  isAiSpeaking
                    ? 'bg-[#10B981]/10 border border-[#10B981]/20'
                    : isRecording
                    ? 'bg-[#EF4444]/10 border border-[#EF4444]/20'
                    : 'bg-[#F59E0B]/10 border border-[#F59E0B]/20'
                }`}>
                  <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full animate-pulse ${
                    isAiSpeaking ? 'bg-[#10B981]' : isRecording ? 'bg-[#EF4444]' : 'bg-[#F59E0B]'
                  }`} />
                  <span
                    className={`${isAiSpeaking ? 'text-[#10B981]' : isRecording ? 'text-[#EF4444]' : 'text-[#F59E0B]'}`}
                    style={{ fontSize: 11, fontWeight: 600 }}
                  >
                    {isAiSpeaking ? 'Speaking...' : isRecording ? isMuted ? 'Muted' : 'Your turn' : isProcessing ? 'Processing...' : isConnected ? 'Ready' : 'Connecting...'}
                  </span>
                </div>
              </div>

              {/* Waveform visualizer */}
              <div className="absolute bottom-10 sm:bottom-12 left-1/2 -translate-x-1/2 z-10 flex items-center gap-[2px] h-8 sm:h-10 px-4">
                {waveHeights.slice(0, 30).map((h, i) => (
                  <div
                    key={i}
                    className="w-[2px] sm:w-[2.5px] rounded-full transition-all duration-[120ms] ease-out"
                    style={{
                      height: isAiSpeaking ? h * 0.85 : 3,
                      background: isAiSpeaking ? 'linear-gradient(to top, #1D4ED8, #3B82F6)' : '#1E293B',
                      opacity: isAiSpeaking ? 0.7 : 0.3,
                    }}
                  />
                ))}
              </div>

              {/* Linda name badge */}
              <div className="absolute bottom-2 sm:bottom-3 left-2 sm:left-3 z-10">
                <div className="px-2.5 py-1 bg-black/50 backdrop-blur-md rounded-full flex items-center gap-1.5 border border-white/10">
                  <Bot className="w-3.5 h-3.5 text-[#3B82F6]" />
                  <span className="text-white" style={{ fontSize: 12, fontWeight: 700 }}>Linda</span>
                  <span className="text-[#64748B] hidden sm:inline" style={{ fontSize: 10 }}>AI Interviewer</span>
                </div>
              </div>

              {/* Current AI text overlay at bottom — only when Linda is speaking */}
              {currentAiText && (
                <div className="absolute bottom-0 left-0 right-0 px-4 sm:px-6 lg:px-8 py-3 sm:py-4 lg:py-5 bg-gradient-to-t from-[#0C1426] via-[#0C1426]/95 to-transparent">
                  <p className="text-center text-[#94A3B8]" style={{ fontSize: 12, lineHeight: 1.6 }}>
                    <span className="text-[#334155]">"</span>
                    {currentAiText}
                    <span className="text-[#334155]">"</span>
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ════ Candidate Panel ════ */}
          <div className="w-full lg:flex-[2] flex flex-col gap-2 sm:gap-3 min-h-0">

            {/* Camera feed */}
            <div className="relative rounded-2xl overflow-hidden flex flex-col bg-[#0A1020] border border-white/[0.07] min-h-[200px] sm:min-h-[240px] lg:min-h-0 lg:flex-1">
              <div className="flex-1 relative overflow-hidden">
                <Webcam
                  ref={webcamRef}
                  className="w-full h-full object-cover"
                  onVideoReady={handleVideoReady}
                  onStream={handleStream}
                  showHandIndicator={false}
                  isHandRaised={handDetection.isHandRaised}
                />

                {/* Face detection ellipse */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[55%] w-20 h-28 sm:w-28 sm:h-36 border-2 border-dashed border-[#3B82F6]/30 rounded-[50%] animate-pulse pointer-events-none" />

                {/* Corner brackets */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[55%] w-24 h-32 sm:w-32 sm:h-40 pointer-events-none">
                  <div className="absolute top-0 left-0 w-3 h-3 sm:w-4 sm:h-4 border-t-2 border-l-2 border-[#3B82F6]/40 rounded-tl" />
                  <div className="absolute top-0 right-0 w-3 h-3 sm:w-4 sm:h-4 border-t-2 border-r-2 border-[#3B82F6]/40 rounded-tr" />
                  <div className="absolute bottom-0 left-0 w-3 h-3 sm:w-4 sm:h-4 border-b-2 border-l-2 border-[#3B82F6]/40 rounded-bl" />
                  <div className="absolute bottom-0 right-0 w-3 h-3 sm:w-4 sm:h-4 border-b-2 border-r-2 border-[#3B82F6]/40 rounded-br" />
                </div>

                {/* Top-left: candidate label + REC */}
                <div className="absolute top-2 sm:top-3 left-2 sm:left-3 flex items-center gap-1.5 sm:gap-2">
                  <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10">
                    <span className="text-white" style={{ fontSize: 11, fontWeight: 600 }}>
                      <span className="sm:hidden">You</span>
                      <span className="hidden sm:inline">{interviewInfo.candidate_name || 'You'}</span>
                    </span>
                  </div>
                  {isRecording && (
                    <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-full bg-[#EF4444]/20 backdrop-blur-md border border-[#EF4444]/20">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-[#EF4444] animate-pulse" />
                      <span className="text-[#EF4444]" style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1 }}>REC</span>
                    </div>
                  )}
                </div>

                {/* Top-right: hand raised / connection */}
                {handDetection.isHandRaised ? (
                  <div className="absolute top-2 sm:top-3 right-2 sm:right-3 px-2 py-1 bg-orange-500/30 backdrop-blur-md rounded-full">
                    <span className="text-orange-400 font-bold" style={{ fontSize: 9, letterSpacing: 1 }}>HAND RAISED</span>
                  </div>
                ) : (
                  <div className="absolute top-2 sm:top-3 right-2 sm:right-3 flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10">
                    <Wifi className={`w-3 h-3 ${isConnected ? 'text-[#10B981]' : 'text-[#EF4444]'}`} />
                    <span className={`hidden sm:inline ${isConnected ? 'text-[#10B981]' : 'text-[#EF4444]'}`} style={{ fontSize: 10, fontWeight: 600 }}>
                      {isConnected ? 'Connected' : 'Offline'}
                    </span>
                  </div>
                )}

                {/* Question timer overlay — compact corner badge */}
                {questionTimerSeconds !== null && (
                  <div
                    className="absolute bottom-2 sm:bottom-3 right-2 sm:right-3 flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-full backdrop-blur-md border"
                    style={{
                      backgroundColor: questionTimerExpired
                        ? 'rgba(239,68,68,0.30)'
                        : questionTimerSeconds <= 30
                        ? 'rgba(239,68,68,0.20)'
                        : questionTimerSeconds <= 60
                        ? 'rgba(245,158,11,0.20)'
                        : 'rgba(16,185,129,0.15)',
                      borderColor: questionTimerExpired
                        ? 'rgba(239,68,68,0.50)'
                        : questionTimerSeconds <= 30
                        ? 'rgba(239,68,68,0.35)'
                        : questionTimerSeconds <= 60
                        ? 'rgba(245,158,11,0.35)'
                        : 'rgba(16,185,129,0.30)',
                    }}
                  >
                    <Clock
                      className={`w-3 h-3 ${
                        questionTimerExpired || questionTimerSeconds <= 30
                          ? 'text-[#EF4444]'
                          : questionTimerSeconds <= 60
                          ? 'text-[#F59E0B]'
                          : 'text-[#10B981]'
                      }`}
                    />
                    <span
                      className={`tabular-nums ${
                        questionTimerExpired || questionTimerSeconds <= 30
                          ? 'text-[#EF4444]'
                          : questionTimerSeconds <= 60
                          ? 'text-[#F59E0B]'
                          : 'text-[#10B981]'
                      } ${questionTimerExpired ? 'animate-pulse' : ''}`}
                      style={{ fontSize: 11, fontWeight: 700 }}
                    >
                      {questionTimerExpired ? 'Time Up' : formatTime(questionTimerSeconds)}
                    </span>
                  </div>
                )}
              </div>

              {/* Controls toolbar */}
              <div className="flex items-center justify-center gap-1.5 sm:gap-2 py-2 sm:py-3 border-t border-white/[0.05] bg-[#0C1426]/80">
                {/* Mic mute toggle */}
                <button
                  onClick={toggleMute}
                  title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                  className={`p-2 sm:p-2.5 rounded-xl transition-all duration-300 ${
                    isMuted
                      ? 'bg-[#EF4444] hover:bg-[#DC2626] text-white shadow-lg shadow-red-500/20'
                      : 'bg-white/[0.06] hover:bg-white/[0.1] text-white'
                  }`}
                >
                  {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
                {/* Video toggle */}
                <button
                  onClick={toggleVideo}
                  title={isVideoOff ? 'Turn camera on' : 'Turn camera off'}
                  className={`p-2 sm:p-2.5 rounded-xl transition-all duration-300 ${
                    isVideoOff
                      ? 'bg-[#EF4444] hover:bg-[#DC2626] text-white shadow-lg shadow-red-500/20'
                      : 'bg-white/[0.06] hover:bg-white/[0.1] text-white'
                  }`}
                >
                  {isVideoOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                </button>
                <div className="w-px h-4 sm:h-5 bg-white/10" />
                <button className="p-2 sm:p-2.5 rounded-xl transition-all duration-300 bg-white/[0.06] hover:bg-white/[0.1] text-[#94A3B8]" title="Screen share">
                  <Monitor className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Stats cards */}
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 sm:gap-2.5 px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-gradient-to-br from-[#3B82F6] to-[#7C3AED] flex items-center justify-center shrink-0">
                  <BrainCircuit className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[#64748B]" style={{ fontSize: 10, fontWeight: 500 }}>Mic Status</span>
                  <span className={`${isRecording ? 'text-[#EF4444]' : isConnected ? 'text-[#10B981]' : 'text-[#64748B]'}`} style={{ fontSize: 13, fontWeight: 700 }}>
                    {isRecording ? 'Recording' : isConnected ? 'Ready' : '--'}
                  </span>
                </div>
              </div>
              <div className="flex-1 flex items-center gap-2 sm:gap-2.5 px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-gradient-to-br from-[#10B981] to-[#06B6D4] flex items-center justify-center shrink-0">
                  <TrendingUp className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[#64748B]" style={{ fontSize: 10, fontWeight: 500 }}>Status</span>
                  <span className={`${isAiSpeaking ? 'text-[#7C3AED]' : isProcessing ? 'text-[#F59E0B]' : 'text-[#3B82F6]'}`} style={{ fontSize: 13, fontWeight: 700 }}>
                    {isAiSpeaking ? 'AI Speaking' : isProcessing ? 'Processing' : 'Listening'}
                  </span>
                </div>
              </div>
            </div>

            {/* Skill coverage panel (timed + flexible modes) */}
            {skillCoverage && (() => {
              const coveredSet = new Set(skillCoverage.covered);
              const mediumSet = new Set(skillCoverage.medium_covered);
              const lowSet = new Set(skillCoverage.low_covered);
              const nthSet = new Set(skillCoverage.nice_to_have_skills);
              const total = skillCoverage.covered.length + skillCoverage.medium_covered.length + skillCoverage.low_covered.length + skillCoverage.uncovered.length;
              // Stable alphabetical order — skill stays in same DOM position as it transitions categories
              const allSkills = Array.from(new Set([
                ...skillCoverage.covered,
                ...skillCoverage.medium_covered,
                ...skillCoverage.low_covered,
                ...skillCoverage.uncovered,
              ])).sort((a, b) => a.localeCompare(b));
              return (
                <div className="px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] animate-fadeIn">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[#64748B] truncate mr-2" style={{ fontSize: 10, fontWeight: 500 }}>
                      Skills — {skillCoverage.round_name || skillCoverage.round}
                    </span>
                    <span className="text-[#94A3B8] shrink-0" style={{ fontSize: 10, fontWeight: 600 }}>
                      {skillCoverage.covered.length + skillCoverage.medium_covered.length + skillCoverage.low_covered.length}/{total} covered
                    </span>
                  </div>
                  {/* Progress bar — green (thorough), amber (adequate), orange (weak) */}
                  <div className="w-full h-1 bg-white/[0.06] rounded-full mb-1.5 overflow-hidden flex">
                    <div className="h-full bg-[#10B981] transition-[width] duration-700 ease-out" style={{ width: total > 0 ? `${(skillCoverage.covered.length / total) * 100}%` : '0%' }} />
                    <div className="h-full bg-[#F59E0B]/60 transition-[width] duration-700 ease-out" style={{ width: total > 0 ? `${(skillCoverage.medium_covered.length / total) * 100}%` : '0%' }} />
                    <div className="h-full bg-[#F97316]/50 transition-[width] duration-700 ease-out" style={{ width: total > 0 ? `${(skillCoverage.low_covered.length / total) * 100}%` : '0%' }} />
                  </div>
                  {/* Unified skill tags — stable keys so color/style transitions smoothly */}
                  <div className="flex flex-wrap gap-1">
                    {allSkills.map(skill => {
                      if (coveredSet.has(skill)) return (
                        <span key={skill} className="px-1.5 py-0.5 rounded-full bg-[#10B981]/15 border border-[#10B981]/25 text-[#10B981] transition-all duration-500" style={{ fontSize: 9, fontWeight: 600 }}>✓ {skill}</span>
                      );
                      if (mediumSet.has(skill)) return (
                        <span key={skill} className="px-1.5 py-0.5 rounded-full bg-[#F59E0B]/12 border border-[#F59E0B]/35 text-[#D97706] transition-all duration-500" style={{ fontSize: 9, fontWeight: 600 }} title="Adequately covered — moving on">~ {skill}</span>
                      );
                      if (lowSet.has(skill)) return (
                        <span key={skill} className="px-1.5 py-0.5 rounded-full bg-[#F97316]/10 border border-[#F97316]/30 text-[#C2410C] transition-all duration-500" style={{ fontSize: 9, fontWeight: 600 }} title="Briefly touched — needs more depth">≈ {skill}</span>
                      );
                      if (nthSet.has(skill)) return (
                        <span key={skill} className="px-1.5 py-0.5 rounded-full bg-[#F59E0B]/10 border border-dashed border-[#F59E0B]/30 text-[#92400E] transition-all duration-500" style={{ fontSize: 9, fontWeight: 600 }} title="Nice-to-have — skippable">{skill} ○</span>
                      );
                      return (
                        <span key={skill} className="px-1.5 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.12] text-[#64748B] transition-all duration-500" style={{ fontSize: 9, fontWeight: 600 }} title="Must-have skill">{skill}</span>
                      );
                    })}
                  </div>
                  {/* Legend */}
                  {(skillCoverage.medium_covered.length > 0 || skillCoverage.low_covered.length > 0 || skillCoverage.uncovered.some(s => nthSet.has(s))) && (
                    <div className="flex items-center gap-2 mt-1.5">
                      {skillCoverage.medium_covered.length > 0 && <span className="text-[#475569]" style={{ fontSize: 8 }}>~ partial</span>}
                      {skillCoverage.low_covered.length > 0 && <span className="text-[#475569]" style={{ fontSize: 8 }}>≈ weak</span>}
                      {skillCoverage.uncovered.some(s => nthSet.has(s)) && <span className="text-[#475569]" style={{ fontSize: 8 }}>○ optional</span>}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* ── Chat Panel (bottom) ── */}
        <div className="px-2 pb-2 sm:px-3 sm:pb-3 flex-shrink-0">
          <div
            className="flex flex-col rounded-2xl overflow-hidden bg-[#0A1020]/95 border border-white/[0.07] backdrop-blur-xl"
            style={{ height: 'clamp(180px, 26vh, 300px)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-2.5 sm:px-4 py-1.5 sm:py-2 border-b border-white/[0.06]">
              <div className="flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-[#3B82F6]" />
                <span className="text-[#94A3B8]" style={{ fontSize: 11, fontWeight: 600 }}>Live Transcript</span>
              </div>
              <div className="flex items-center gap-2">
                {/* Question progress counter */}
                {questionNumber !== null && totalQuestions !== null && (
                  <span className="text-[#64748B] tabular-nums" style={{ fontSize: 10, fontWeight: 600 }}>
                    Q {questionNumber}/{totalQuestions}
                  </span>
                )}
                {/* Prominent per-question timer — shown when it's user's turn */}
                {questionTimerSeconds !== null && (
                  <div
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all duration-300 ${
                      questionTimerExpired
                        ? 'bg-[#EF4444]/20 border-[#EF4444]/40 animate-pulse'
                        : questionTimerSeconds <= 30
                        ? 'bg-[#EF4444]/15 border-[#EF4444]/30'
                        : questionTimerSeconds <= 60
                        ? 'bg-[#F59E0B]/15 border-[#F59E0B]/30'
                        : 'bg-[#10B981]/10 border-[#10B981]/25'
                    }`}
                  >
                    <Clock
                      className={`w-3.5 h-3.5 ${
                        questionTimerExpired || questionTimerSeconds <= 30
                          ? 'text-[#EF4444]'
                          : questionTimerSeconds <= 60
                          ? 'text-[#F59E0B]'
                          : 'text-[#10B981]'
                      }`}
                    />
                    <span
                      className={`tabular-nums font-bold ${
                        questionTimerExpired || questionTimerSeconds <= 30
                          ? 'text-[#EF4444]'
                          : questionTimerSeconds <= 60
                          ? 'text-[#F59E0B]'
                          : 'text-[#10B981]'
                      }`}
                      style={{ fontSize: 13, letterSpacing: 0.5 }}
                    >
                      {questionTimerExpired ? 'TIME UP' : formatTime(questionTimerSeconds)}
                    </span>
                    <span
                      className={`hidden sm:inline ${
                        questionTimerExpired || questionTimerSeconds <= 30
                          ? 'text-[#EF4444]/70'
                          : questionTimerSeconds <= 60
                          ? 'text-[#F59E0B]/70'
                          : 'text-[#10B981]/70'
                      }`}
                      style={{ fontSize: 9, fontWeight: 600 }}
                    >
                      {questionTimerExpired ? '' : 'TO ANSWER'}
                    </span>
                  </div>
                )}
                {/* Next Question button — visible when timer is running and Linda isn't speaking */}
                {questionTimerSeconds !== null && !questionTimerExpired && !isAiSpeaking && !isClosing && (
                  <button
                    onClick={() => {
                      if (wsRef.current?.readyState === WebSocket.OPEN) {
                        wsRef.current.send(JSON.stringify({ type: 'skip_question', source: 'candidate' }));
                      }
                      if (questionTimerIntervalRef.current) {
                        clearInterval(questionTimerIntervalRef.current);
                        questionTimerIntervalRef.current = null;
                      }
                      setQuestionTimerSeconds(null);
                      setQuestionTimerExpired(false);
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#1D4ED8]/20 hover:bg-[#1D4ED8]/35 border border-[#1D4ED8]/30 transition-all duration-200"
                    style={{ fontSize: 10, fontWeight: 600 }}
                    title="Move to next question"
                  >
                    <span className="text-[#93C5FD]">Next</span>
                    <span className="text-[#93C5FD]">→</span>
                  </button>
                )}
                <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full bg-[#EF4444]/10 border border-[#EF4444]/15">
                  <ShieldCheck className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#EF4444]" />
                  <span className="text-[#EF4444] hidden sm:inline" style={{ fontSize: 10, fontWeight: 600 }}>Recording</span>
                  <span className="text-[#EF4444] sm:hidden" style={{ fontSize: 9, fontWeight: 600 }}>REC</span>
                </div>
              </div>
            </div>

            {/* Transcript content */}
            <div
              className="flex-1 overflow-y-auto px-2.5 sm:px-4 py-2 sm:py-3 space-y-2 sm:space-y-3"
              style={{ scrollbarWidth: 'thin', scrollbarColor: '#1E293B transparent' }}
            >
              <>

                  {messages.length === 0 && !currentAiText && !currentTranscript && !isProcessing && (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-[#475569] text-xs text-center">Conversation will appear here...</p>
                    </div>
                  )}

                  {messages.map((msg) => (
                    <div key={msg.id}>
                      {msg.role === 'system' ? (
                        <div className="flex justify-center">
                          <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/25 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            <p className="text-[#F59E0B]" style={{ fontSize: 11 }}>{msg.content}</p>
                          </div>
                        </div>
                      ) : msg.role === 'user' ? (
                        <div className="flex gap-1.5 sm:gap-2.5 flex-row-reverse">
                          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-white/[0.08] flex items-center justify-center shrink-0">
                            <span className="text-[#94A3B8]" style={{ fontSize: 8, fontWeight: 800 }}>You</span>
                          </div>
                          <div className="max-w-[85%] sm:max-w-[72%] px-3 sm:px-4 py-2 sm:py-2.5 bg-white/[0.06] text-[#CBD5E1] rounded-2xl rounded-tr-md border border-white/[0.06]">
                            <p style={{ fontSize: 12, lineHeight: 1.6 }}>{msg.content}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-1.5 sm:gap-2.5">
                          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-[#1D4ED8] flex items-center justify-center shrink-0 shadow-sm shadow-blue-900/30">
                            <span className="text-white" style={{ fontSize: 8, fontWeight: 800 }}>AI</span>
                          </div>
                          <div className="max-w-[85%] sm:max-w-[72%] px-3 sm:px-4 py-2 sm:py-2.5 bg-[#1E3A5F]/60 text-[#E2E8F0] rounded-2xl rounded-tl-md border border-blue-500/10">
                            <p style={{ fontSize: 12, lineHeight: 1.6 }}>{msg.content}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Live speech transcript */}
                  {currentTranscript && (
                    <div className="flex gap-1.5 sm:gap-2.5 flex-row-reverse">
                      <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-white/[0.08] flex items-center justify-center shrink-0">
                        <span className="text-[#94A3B8]" style={{ fontSize: 8, fontWeight: 800 }}>You</span>
                      </div>
                      <div className="max-w-[85%] sm:max-w-[72%] px-3 sm:px-4 py-2 sm:py-2.5 bg-[#EF4444]/10 text-[#CBD5E1] rounded-2xl rounded-tr-md border border-[#EF4444]/20">
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] animate-pulse" />
                          <span className="text-[#EF4444]" style={{ fontSize: 9 }}>speaking...</span>
                        </div>
                        <p className="italic" style={{ fontSize: 12, lineHeight: 1.6 }}>{currentTranscript}</p>
                      </div>
                    </div>
                  )}

                  {/* Live AI text (streaming) */}
                  {currentAiText && (
                    <div className="flex gap-1.5 sm:gap-2.5">
                      <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-gradient-to-br from-[#3B82F6] to-[#7C3AED] flex items-center justify-center shrink-0">
                        <span className="text-white" style={{ fontSize: 8, fontWeight: 800 }}>AI</span>
                      </div>
                      <div className="max-w-[85%] sm:max-w-[72%] px-3 sm:px-4 py-2 sm:py-2.5 bg-[#1E3A5F]/60 text-[#E2E8F0] rounded-2xl rounded-tl-md border border-blue-500/10">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="w-1 h-1 rounded-full bg-[#3B82F6] animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1 h-1 rounded-full bg-[#3B82F6] animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1 h-1 rounded-full bg-[#3B82F6] animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        <p style={{ fontSize: 12, lineHeight: 1.6 }}>{currentAiText}</p>
                      </div>
                    </div>
                  )}

                  {/* Thinking dots */}
                  {isProcessing && !currentAiText && (
                    <div className="flex gap-1.5 sm:gap-2.5">
                      <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-gradient-to-br from-[#3B82F6] to-[#7C3AED] flex items-center justify-center shrink-0">
                        <span className="text-white" style={{ fontSize: 8, fontWeight: 800 }}>AI</span>
                      </div>
                      <div className="px-3 sm:px-4 py-2 sm:py-3 bg-[#1E293B]/60 rounded-2xl rounded-tl-md border border-white/5">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[#475569] animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-2 h-2 rounded-full bg-[#475569] animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-2 h-2 rounded-full bg-[#475569] animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </>
            </div>

            {/* Input bar */}
            <div className="px-2.5 sm:px-4 py-2 sm:py-3 border-t border-white/[0.06]">
              <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] focus-within:border-[#3B82F6]/30 focus-within:bg-white/[0.06] transition-all duration-300">
                <input
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && textInput.trim()) {
                      sendTextInput(textInput);
                      setTextInput('');
                    }
                  }}
                  placeholder={
                    isAiSpeaking ? 'Wait for Linda to finish...' :
                    isProcessing ? 'Processing...' :
                    'Type your answer...'
                  }
                  disabled={isAiSpeaking || isProcessing || !isConnected}
                  className="flex-1 bg-transparent outline-none text-white placeholder-[#334155] disabled:opacity-40 disabled:cursor-not-allowed min-w-0"
                  style={{ fontSize: 13 }}
                />
                <button
                  className="p-1.5 sm:p-2 rounded-lg hover:bg-white/[0.06] transition-all duration-300 shrink-0"
                  title="Voice input"
                  type="button"
                >
                  <Mic className="w-4 h-4 text-[#3B82F6]" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (textInput.trim()) {
                      sendTextInput(textInput);
                      setTextInput('');
                    }
                  }}
                  disabled={!textInput.trim() || isAiSpeaking || isProcessing || !isConnected}
                  className="p-1.5 sm:p-2 rounded-lg bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300 shadow-sm shadow-blue-900/30 shrink-0"
                >
                  <Send className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
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
