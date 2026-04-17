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
import SectionTransitionOverlay from "./SectionTransitionOverlay";
import SkipQuestionButton from "./SkipQuestionButton";
import SkillCoveragePanel from "./SkillCoveragePanel";
import { toast } from 'sonner';
import { requestFullscreen, isFullscreen, getFullscreenChangeEvent, exitFullscreen } from "@/lib/utils/browserCompat";
import { Clock, Timer, LogOut, Send, Mic, MessageSquare, ShieldCheck, Video, VideoOff, MicOff, SkipForward, Maximize } from "lucide-react";
import { createAvatar3DSender } from "./avatar3d/avatar3d-channel";
import { DEFAULT_VISEME_WEIGHTS } from "./avatar3d/avatar3d-types";
import { VisemeTimeline } from "./avatar3d/text-to-viseme";
import { isFlexibleDuration, modeFromConfig } from "@/lib/constants/aiInterviewMode";
import { isTranscriptMeaningful } from "@/lib/utils/whisperFilter";

interface FaceVerificationHandle {
  startVerification: (videoElement: HTMLVideoElement) => void;
  stopVerification: () => void;
  hasBaseline: () => boolean;
}

interface VoiceVerificationHandle {
  verifyVoice: (audioData: Float32Array, sampleRate: number) => void;
  hasBaseline: () => boolean;
}

export interface InterviewTimerSnapshot {
  remainingSeconds: number;
  questionTimerSeconds: number | null;
  questionTimerExpired: boolean;
  questionNumber: number | null;
  totalQuestions: number | null;
}

interface InterviewUIProps {
  token: string;
  interviewInfo: CandidateInterviewInfo;
  onInterviewComplete?: () => void;
  faceVerification?: FaceVerificationHandle;
  voiceVerification?: VoiceVerificationHandle;
  copyPasteBlocking?: boolean;
  onTimerChange?: (state: InterviewTimerSnapshot) => void;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  /** Timer value (seconds remaining) when the candidate stopped speaking — shown as a frozen badge */
  responseTimeSeconds?: number;
  /** IST timestamp string (e.g. "2:34 PM") captured when the message was created */
  timestamp?: string;
}

/** Returns current time formatted as IST with AM/PM (e.g. "2:34 PM") */
function nowIST(): string {
  return new Date().toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// Whisper-hallucination filter (isTranscriptMeaningful) is imported at the
// top of this file from lib/utils/whisperFilter. It is shared with the
// practice session so both paths reject the same artifacts —
// "Please help! This is a big problem!", "Transcription by ESO — …",
// looping n-gram repetitions, etc.

export function InterviewUI({ token, interviewInfo, onInterviewComplete, faceVerification, voiceVerification, copyPasteBlocking = true, onTimerChange }: InterviewUIProps) {
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
  // Defer the completion modal until Linda's farewell audio actually ends.
  // Backend sends `interview_completion_message` right after `interview_ended`
  // without waiting for TTS playback to drain — if we show the modal
  // immediately it pops up while Linda is still speaking.
  const pendingCompletionModalRef = useRef(false);

  // 5-minute buffer state (MOM: buffer when allocated time expires)
  const [isInBuffer, setIsInBuffer] = useState(false);
  // Ref to block all mic recording after force_mic_off (hard 35-min stop)
  const isMicForceOffRef = useRef(false);

  // Timed mode — per-question 2-min timer
  const [questionTimerSeconds, setQuestionTimerSeconds] = useState<number | null>(null);
  const [questionTimerExpired, setQuestionTimerExpired] = useState(false);
  const questionTimerExpiredRef = useRef(false); // sync ref — avoids stale closure in setTimeout/setInterval callbacks
  // Tracks whether the BACKEND already sent question_timer_expired for the current
  // question. When true, the client must NOT send its own skip_question — the
  // backend's _auto_skip already called handle_skip_question. Cleared when the
  // next question_timer_started arrives.
  const backendExpiredRef = useRef(false);
  const questionTimerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Ref that mirrors questionTimerSeconds state — readable synchronously in callbacks.
  // Required for stopRecording to deduct remaining seconds from the global timer.
  const questionTimerSecondsRef = useRef<number | null>(null);
  // Initial duration of the current question timer — used as the progress bar reference.
  const questionTimerTotalRef = useRef<number>(120);
  // Fix 1 (Server-timestamp-driven timer): anchor the per-question countdown to
  // a monotonic `performance.now()` taken the instant the timer actually starts
  // ticking on the client (AFTER Linda finishes and during candidate's turn).
  // All subsequent ticks compute remaining = duration − elapsed, instead of
  // the legacy `prev - 1` decrement. This eliminates accumulated drift when
  // the tab is backgrounded / throttled, and makes the displayed timer match
  // the backend's monotonic question timer to the nearest second.
  const questionTimerStartedAtMsRef = useRef<number | null>(null);
  // Time spent paused (while Linda speaks) — subtracted from wall-clock elapsed.
  const questionTimerPausedMsRef = useRef<number>(0);
  const questionTimerPausedAtRef = useRef<number | null>(null);
  // Fix 2: track the seconds Linda used out of the 120s slot so we can render
  // "Linda spoke 23s — you have 97s" under the timer. The candidate is
  // otherwise surprised when the displayed time is less than the documented
  // 2 minutes; exposing this explicitly sets expectations.
  const [lindaSpokeSeconds, setLindaSpokeSeconds] = useState<number | null>(null);
  const [fullSlotSeconds, setFullSlotSeconds] = useState<number | null>(null);

  // Compute the remaining seconds for the per-question timer using the
  // monotonic anchor + paused-time accounting. Returns null if the timer
  // hasn't started yet.
  const computeQuestionRemaining = useCallback((): number | null => {
    const startedAt = questionTimerStartedAtMsRef.current;
    if (startedAt === null) return null;
    const total = questionTimerTotalRef.current;
    const now = performance.now();
    let pausedMs = questionTimerPausedMsRef.current;
    // If we're currently paused, add the in-progress pause duration.
    if (questionTimerPausedAtRef.current !== null) {
      pausedMs += now - questionTimerPausedAtRef.current;
    }
    const elapsedSec = Math.floor((now - startedAt - pausedMs) / 1000);
    return Math.max(0, total - elapsedSec);
  }, []);
  // Pending: timer duration received but interval not started yet (waiting for Linda to stop)
  const questionTimerPendingRef = useRef<number | null>(null);
  // Timestamp when question_timer_started was received — used to adjust for TTS playback lag
  const questionTimerReceivedAtRef = useRef<number | null>(null);
  // Point 4: pause per-question interval during clarification
  const isClarificationRef = useRef(false);
  // Question progress counter (sent with question_timer_started)
  const [questionNumber, setQuestionNumber] = useState<number | null>(null);
  const [totalQuestions, setTotalQuestions] = useState<number | null>(null);
  const questionNumberRef = useRef<number | null>(null); // sync ref for stale-closure reads
  // Clarification mode — true when backend signals is_clarification on a same-Q timer event
  const [isClarification, setIsClarification] = useState(false);
  // Follow-up mode — true when backend signals is_follow_up on question_timer_started
  const [isFollowUp, setIsFollowUp] = useState(false);
  // Sync ref for isFollowUp — readable synchronously in stale interval callbacks.
  // Used to let the 2-min timer keep running during Linda's follow-up speech.
  // Main questions: timer pauses while Linda speaks (candidate gets full window).
  // Follow-ups: timer runs continuously (remaining time already accounts for Linda's speech).
  const isFollowUpRef = useRef(false);

  // When true, the per-question countdown is frozen at its initial duration
  // until the candidate actually starts speaking (detected via VAD or Web
  // Speech API). Flipped false inside the speech_started paths. This makes
  // the displayed timer reflect RESPONSE time, not wall-clock since question
  // was asked — candidates no longer lose seconds while thinking.
  const questionTimerAwaitingSpeechRef = useRef<boolean>(false);

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
    clusters?: import('./SkillCoveragePanel').ClusterData[];
  } | null>(null);

  // AIU39: Question skip state
  const [skipCount, setSkipCount] = useState(0);
  const [maxSkips] = useState(3);
  const currentQuestionIdRef = useRef<string | null>(null);

  // AIU40: Section transition overlay
  const [sectionTransition, setSectionTransition] = useState<{ message: string; fromCluster: string; toCluster: string } | null>(null);

  // AIU52: Full coverage map (detailed, cluster-level)
  const [coverageMap, setCoverageMap] = useState<Record<string, any>>({});

  // AIU51/AIU72: Repeat-request overlay
  const [showRepeatRequest, setShowRepeatRequest] = useState(false);

  // Figma UI state
  const [waveHeights, setWaveHeights] = useState<number[]>(Array(30).fill(4));
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [isFullscreenExited, setIsFullscreenExited] = useState(false);
  // Seconds left in the 10s grace window before the session hard-pauses.
  // null = no grace period active (either before any exit, or after the
  // grace elapsed and the session is fully paused).
  const [gracePeriodRemaining, setGracePeriodRemaining] = useState<number | null>(null);
  // Ref mirror so timer setIntervals (which close over stale state) can
  // read the current value synchronously.
  const isFullscreenExitedRef = useRef(false);
  useEffect(() => { isFullscreenExitedRef.current = isFullscreenExited; }, [isFullscreenExited]);
  // Frozen timer values captured at the exact moment fullscreen was exited.
  // Timer restoration on fullscreen return reads from here instead of from
  // the server's wall-clock elapsed — that's what lets "Answer time" stay
  // at the same value across the fullscreen pause instead of jumping
  // forward by the real-world duration the candidate was away.
  const frozenGlobalSecondsRef = useRef<number | null>(null);
  const frozenQuestionSecondsRef = useRef<number | null>(null);

  // Face-not-in-frame blocking
  const [isFaceBlocked, setIsFaceBlocked] = useState(false);
  const isFaceBlockedRef = useRef(false);

  // Media permission terminal block.
  // Set to true when:
  //   1. navigator.permissions.query() reports camera/mic is "denied"
  //   2. MediaStreamTrack.ended / muted fires mid-interview (candidate
  //      revoked the OS-level permission from the browser site settings)
  //   3. A fresh getUserMedia probe rejects with NotAllowed/PermissionDenied
  // Once armed, the interview UI is frozen behind a blocking overlay — the
  // candidate cannot resume, regardless of whether they re-enter fullscreen.
  // This implements the user-requested "block the interview immediately
  // if any permission is blocked" rule.
  const [mediaBlocked, setMediaBlocked] = useState<null | {
    kind: 'camera' | 'microphone' | 'both';
    reason: string;
  }>(null);
  const mediaBlockedRef = useRef<typeof mediaBlocked>(null);
  useEffect(() => { mediaBlockedRef.current = mediaBlocked; }, [mediaBlocked]);

  // Session ID — populated from `connected` WS event, used for violation event logging
  const sessionIdRef = useRef<string | null>(null);

  // WebSocket keepalive / reconnect refs
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isUnmountedRef = useRef(false);
  const connectRef = useRef<() => void>(() => {});

  // Timer modes:
  //   isFlexibleMode      = duration 0 (legacy unlimited) → count UP, pause while Linda speaks
  //   isNewFlexibleMode   = duration > 0, interview_mode='flexible' → count DOWN, runs NON-STOP
  //   timed / fixed       = duration > 0, interview_mode='fixed'  → count DOWN
  //                         Both timers pause while Linda speaks; run during candidate
  //                         recording, processing, and idle phases.
  // Flexible mode is now determined by special_instructions.interview_mode
  // (authoritative). duration_minutes holds the real budget (30 / 35 / N),
  // not a sentinel. Legacy records with duration_minutes=0 still fall back
  // to "flexible" via the helper.
  const resolvedMode = modeFromConfig((interviewInfo as any).special_instructions, interviewInfo.duration_minutes);
  const isFlexibleMode = resolvedMode === 'flexible' && isFlexibleDuration(interviewInfo.duration_minutes);
  const isNewFlexibleMode = resolvedMode === 'flexible' && !isFlexibleMode;
  const [remainingSeconds, setRemainingSeconds] = useState(
    isFlexibleMode ? 30 * 60 : (interviewInfo.duration_minutes || 30) * 60
  );
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isConnected || isClosing) return;
    timerIntervalRef.current = setInterval(() => {
      // Global timer pauses — mirrors the per-question timer:
      //   - clarification: Linda re-explains → don't burn 30-min budget
      //   - Linda is speaking (non-silence-prompt): between-question TTS
      //     and the next main-question TTS should NOT eat the candidate's
      //     global budget either. The per-question timer isn't running
      //     during those windows (it was cleared at end_turn and only
      //     starts again after Linda finishes), so pausing global here
      //     keeps both clocks visually aligned.
      // Silence prompts ("Are you there?") are explicitly excluded — those
      // fire DURING the candidate's answer window and the global clock
      // must keep ticking so the 30-min budget is enforced.
      if (isClarificationRef.current) return;
      // Pause while fullscreen is exited — the interview is frozen behind
      // the "Fullscreen Required" overlay, backend continues to tick its
      // own clock but the candidate must not be charged for that lost
      // time on the visible global timer.
      if (isFullscreenExitedRef.current) return;
      // Both global AND per-question timer only tick during the candidate's
      // turn (when they can actually speak). Pause during Linda's regular
      // speech. EXCEPTION: keep ticking during the silence nudge ("Are you
      // there?") — candidate is still "on the clock" even while Linda prompts
      // them. Combined with the slot-deduct logic in stopRecording (which
      // jumps global to the next 2-min boundary on answer), this gives the
      // slot-based global semantics: 30:00 → 28:00 → 26:00 per Q.
      if (isAiSpeakingRef.current && !isSilencePromptRef.current) return;
      setRemainingSeconds(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isConnected, isClosing]);

  // Frozen timer snapshot — captured at the moment stopRecording fires, attached to the transcript message.
  const frozenResponseTimeRef = useRef<number | null>(null);

  // Keep questionTimerSecondsRef in sync with state so stopRecording can read it synchronously.
  useEffect(() => {
    questionTimerSecondsRef.current = questionTimerSeconds;
  }, [questionTimerSeconds]);

  // Notify parent of timer state changes (used by portal fullscreen overlay to show timers)
  useEffect(() => {
    onTimerChange?.({ remainingSeconds, questionTimerSeconds, questionTimerExpired, questionNumber, totalQuestions });
  }, [remainingSeconds, questionTimerSeconds, questionTimerExpired, questionNumber, totalQuestions]);
  useEffect(() => { questionNumberRef.current = questionNumber; }, [questionNumber]);
  // Keep isClarificationRef in sync with state — used as a gate in timer intervals
  useEffect(() => { isClarificationRef.current = isClarification; }, [isClarification]);

  // "Now Speak" banner — shown when mic opens for candidate after Linda stops
  const [showNowSpeakBanner, setShowNowSpeakBanner] = useState(false);
  const nowSpeakTimerRef = useRef<NodeJS.Timeout | null>(null);
  const nowSpeakShownForSessionRef = useRef(false); // prevents re-show within same recording session

  // Bug C fix: flips true ONLY inside TalkingHead's onAudioEnd callback — the
  // canonical "audio actually finished playing" signal. Stays false while
  // `audio_end` has been received from backend but the client-side buffer is
  // still playing (most common on Q1 when AudioContext is cold). Flips back
  // to false on `speaking_started` so the next turn starts clean. The "Your
  // turn" banner gates on this instead of just `!isAiSpeaking`, because
  // setIsAiSpeaking(false) in the audio_end path can race ahead of the
  // actual audible end of Linda's speech.
  const candidatePlaybackEndedRef = useRef(false);
  const [candidatePlaybackEnded, setCandidatePlaybackEnded] = useState(false);

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

  // "Now Speak" banner — visible for the ENTIRE candidate-turn window.
  //
  // Bug B fix: previously this banner auto-hid after 5 s, which left candidates
  // speaking into a silent UI with no indication that their turn was still
  // active. The banner now persists from the moment the mic opens until the
  // mic closes (candidate finishes speaking / timer expires / Linda takes
  // over). The render condition in the JSX (`!isAiSpeaking && !isProcessing
  // && !questionTimerExpired && !showSilenceBanner`) handles transient states
  // like clarifications, so no explicit auto-hide is needed here.
  useEffect(() => {
    if (isRecording && !isAiSpeaking && !isProcessing && !isClosing && isConnected) {
      if (!nowSpeakShownForSessionRef.current) {
        // Defer by 250ms and re-check refs before showing. Without this, a
        // follow-up or next-question `speaking_started` that arrives in the
        // same React batch as the isRecording=true transition would flash the
        // banner WHILE Linda is already speaking (state updates haven't
        // committed yet). Refs are synchronous so they reflect the truth.
        if (nowSpeakTimerRef.current) clearTimeout(nowSpeakTimerRef.current);
        nowSpeakTimerRef.current = setTimeout(() => {
          if (
            isRecordingRef.current &&
            !isAiSpeakingRef.current &&
            !isProcessingRef.current &&
            !isClosingRef.current
          ) {
            nowSpeakShownForSessionRef.current = true;
            setShowNowSpeakBanner(true);
          }
        }, 250);
      }
    }
    if (!isRecording) {
      // Reset for next recording session
      nowSpeakShownForSessionRef.current = false;
      setShowNowSpeakBanner(false);
      if (nowSpeakTimerRef.current) { clearTimeout(nowSpeakTimerRef.current); nowSpeakTimerRef.current = null; }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, isAiSpeaking, isProcessing, isClosing, isConnected]);

  // Bulletproof hide: whenever Linda starts speaking (any path — greeting,
  // follow-up, clarification, interstitial), tear down the banner AND the
  // pending show-timer. This is the last line of defence against the
  // "Your turn — speak now" popup appearing while Linda is mid-sentence.
  useEffect(() => {
    if (isAiSpeaking) {
      setShowNowSpeakBanner(false);
      if (nowSpeakTimerRef.current) {
        clearTimeout(nowSpeakTimerRef.current);
        nowSpeakTimerRef.current = null;
      }
    }
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
  // Hard cap: stop recording after a mode-specific limit regardless of VAD.
  // Conversational mode needs a much larger cap so long answers are not cut off.
  const maxRecordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const handleNoResponseRef = useRef<() => void>(() => {});
  const stopRecordingSilentRef = useRef<() => void>(() => {});

  // Clear no-response timer helper — declared early because it's referenced in
  // many setInterval / ws.onmessage callbacks that appear before the former
  // declaration site (line ~2556). Moving it here prevents a potential TDZ
  // violation in minified builds where const reordering can surface.
  const clearNoResponseTimer = useCallback(() => {
    if (noResponseTimerRef.current) {
      clearTimeout(noResponseTimerRef.current);
      noResponseTimerRef.current = null;
    }
  }, []);

  // Clear max recording timer helper
  const clearMaxRecordingTimer = useCallback(() => {
    if (maxRecordingTimerRef.current) {
      clearTimeout(maxRecordingTimerRef.current);
      maxRecordingTimerRef.current = null;
    }
  }, []);

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
    copyPasteBlocking,
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
    // emitEvent queues to backend via proctoring monitor (flushBackendQueue every 5s)
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
      // Restart recording if it was stopped by face blocking and Linda isn't speaking
      if (!isAiSpeakingRef.current && !isProcessingRef.current && !isRecordingRef.current) {
        setTimeout(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN && !isFaceBlockedRef.current) {
            startRecordingInternal();
          }
        }, 500);
      }
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
  // Tracks whether 'pcm-processor' has been registered in the current recordingContext.
  // AudioWorklet processors can only be registered once per AudioContext — re-registration
  // throws NotSupportedError. Since we reuse the context across recording sessions we skip
  // addModule() on subsequent calls and go straight to new AudioWorkletNode().
  const pcmWorkletRegisteredRef = useRef(false);
  const voiceVerifBufferRef = useRef<Float32Array[]>([]);
  const audioQueueRef = useRef<AudioBuffer[]>([]); // kept for proctoring load-shedding count only
  const isPlayingRef = useRef(false);
  // Scheduled playback — gapless audio via Web Audio API clock
  const nextPlayTimeRef = useRef(0);   // ctx.currentTime when next buffer should start
  const pendingBuffersRef = useRef(0); // buffers scheduled but not yet finished

  // ── Audio playback tracker ──
  // The REAL "Linda's audio has finished" signal. A dedicated, silent
  // AudioContext that mirrors every PCM chunk TalkingHead receives by
  // scheduling a gain=0 AudioBufferSourceNode of the same length. Tracked
  // fields:
  //   playbackTrackerCtxRef             — the dedicated AudioContext
  //   playbackScheduledEndAtRef         — ctx.currentTime seconds when the
  //                                        last-scheduled buffer ends
  //   playbackTrackerPendingRef         — count of buffers scheduled but
  //                                        not yet finished (from onended)
  // Because AudioContext.currentTime is driven by the hardware audio clock
  // it's the browser's authoritative playback clock — we can't be wrong
  // about whether audio has finished as long as we schedule a silent mirror
  // of every real chunk. No TalkingHead internals, no wall-clock guesses.
  const playbackTrackerCtxRef = useRef<AudioContext | null>(null);
  const playbackScheduledEndAtRef = useRef<number>(0); // in ctx seconds
  const playbackTrackerPendingRef = useRef<number>(0);
  // True once at least one chunk for the current turn was successfully
  // scheduled on the tracker context. Used by `whenTrackedPlaybackEnds` to
  // decide whether the tracker's state is trustworthy or we need to fall
  // back to the wall-clock heuristic (happens on first question when the
  // AudioContext is still suspended, pre-user-gesture).
  const trackedThisTurnRef = useRef(false);
  // Ref shim — populated below in a useEffect so the `ws.onmessage` closure
  // (created once when `connect()` runs) always sees the latest callback.
  const trackPlaybackChunkRef = useRef<(pcmData: ArrayBuffer) => void>(() => {});
  // Pending callbacks waiting for audio to truly finish. Each entry is
  // a function that will be called once `playbackScheduledEndAtRef <= ctx.currentTime`
  // AND audio_end was received. Used by finalizePlayback to defer its
  // work until the real end-of-playback, with no wall-clock guessing.
  const awaitingAudioEndCallbacksRef = useRef<Array<() => void>>([]);

  // Ensure we have a tracker context. Reuses a single instance for the
  // entire session; AudioContext creation is not free, so we avoid
  // spawning one per Linda turn. The tracker prefers to share the
  // pre-created, already-unlocked `__interviewAudioContext` (set by the
  // fullscreen-prompt user-gesture button in CandidateAIInterviewPortal)
  // so it starts in the 'running' state even on the very first question.
  const getPlaybackTracker = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    let ctx = playbackTrackerCtxRef.current;
    if (!ctx || ctx.state === 'closed') {
      try {
        // Prefer the pre-warmed context if TalkingHead hasn't claimed it yet.
        const preCreated = (window as any).__interviewAudioContext as AudioContext | undefined;
        if (preCreated && preCreated.state !== 'closed' && preCreated.sampleRate === 24000) {
          ctx = preCreated;
        } else {
          ctx = new AudioContext({ sampleRate: 24000 });
        }
        playbackTrackerCtxRef.current = ctx;
      } catch {
        return null;
      }
    }
    if (ctx.state === 'suspended') {
      // Fire-and-forget resume. Any gesture during the interview will
      // unlock it; until then the tracker will lag behind real audio,
      // in which case we fall back to wall-clock anchors.
      ctx.resume().catch(() => { /* ignore */ });
    }
    return ctx;
  }, []);

  // Schedule a silent mirror of an Int16 PCM @ 24 kHz chunk. The chunk's
  // duration is encoded in its byteLength; we convert to a same-length
  // AudioBuffer so its onended fires at exactly the wall-clock moment
  // the real chunk finishes playing through TalkingHead.
  const trackPlaybackChunk = useCallback((pcmData: ArrayBuffer) => {
    const ctx = getPlaybackTracker();
    if (!ctx) return;
    // If the context is suspended (first call before user gesture takes
    // effect), aggressively try to resume it. On subsequent chunks it
    // should be 'running'. If still suspended after the resume attempt,
    // skip this chunk — the wall-clock fallback in whenTrackedPlaybackEnds
    // will kick in.
    if (ctx.state !== 'running') {
      ctx.resume().catch(() => { /* ignore */ });
      if (ctx.state !== 'running') return;
    }
    try {
      const sampleCount = pcmData.byteLength / 2; // Int16 = 2 bytes/sample
      if (sampleCount <= 0) return;
      const buf = ctx.createBuffer(1, sampleCount, 24000);
      // leave channel silent — we only need the DURATION to be correct
      const src = ctx.createBufferSource();
      src.buffer = buf;
      // gain=0 node to prevent any accidental audible click even if hw mixer
      // ever routes this through speakers on a misconfigured browser
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain).connect(ctx.destination);
      const startAt = Math.max(ctx.currentTime, playbackScheduledEndAtRef.current);
      src.start(startAt);
      // First chunk of this turn: anchor the reveal's audible-start to the
      // actual scheduled start time (not ctx.currentTime in queueAudio). This
      // is the spec-correct anchor — the ctx second when this buffer begins
      // playing through TalkingHead after its ~700ms internal buffering.
      if (audibleStartCtxSecRef.current === null) {
        audibleStartCtxSecRef.current = startAt + TALKING_HEAD_BUFFER_MS / 1000;
      }
      playbackScheduledEndAtRef.current = startAt + buf.duration;
      playbackTrackerPendingRef.current += 1;
      trackedThisTurnRef.current = true;
      src.onended = () => {
        playbackTrackerPendingRef.current = Math.max(0, playbackTrackerPendingRef.current - 1);
        // If this was the last pending chunk AND audio_end was already
        // received, fire any deferred callbacks.
        if (
          playbackTrackerPendingRef.current === 0 &&
          audioEndReceivedRef.current &&
          awaitingAudioEndCallbacksRef.current.length > 0
        ) {
          const pending = awaitingAudioEndCallbacksRef.current.splice(0);
          pending.forEach(cb => { try { cb(); } catch { /* ignore */ } });
        }
      };
    } catch (err) {
      console.warn('[PlaybackTracker] schedule failed:', err);
    }
  }, [getPlaybackTracker]);

  // Wait until the tracker confirms every scheduled buffer has been played.
  // Returns immediately if audio is already drained. Otherwise schedules the
  // callback to fire from the last chunk's onended handler. Includes a
  // safety wall-clock timeout so we can't hang forever if the tracker
  // context is frozen.
  const whenTrackedPlaybackEnds = useCallback((cb: () => void, safetyTimeoutMs = 20000) => {
    const ctx = playbackTrackerCtxRef.current;
    const pendingCount = playbackTrackerPendingRef.current;
    const scheduledEnd = playbackScheduledEndAtRef.current;
    const nowSec = ctx?.currentTime ?? 0;
    // If the tracker context never accepted any chunks this turn (e.g. it
    // was suspended pre-user-gesture on the very first question), we
    // CANNOT trust its "pending=0" signal — it would fire immediately.
    // Fall back to the wall-clock heuristic instead.
    if (!trackedThisTurnRef.current) {
      const lastPcmAt = lastPcmAtMsRef.current ?? firstPcmAtMsRef.current ?? Date.now();
      const expectedEndMs = lastPcmAt + AUDIO_TAIL_MARGIN_MS;
      const remainingMs = Math.max(0, expectedEndMs - Date.now());
      if (remainingMs > 0) {
        setTimeout(() => { try { cb(); } catch { /* ignore */ } }, remainingMs);
      } else {
        try { cb(); } catch { /* ignore */ }
      }
      return;
    }
    // Already drained?
    if (
      pendingCount === 0 &&
      (!ctx || nowSec >= scheduledEnd - 0.01)
    ) {
      try { cb(); } catch { /* ignore */ }
      return;
    }
    // Defer until the tracker says we're done.
    let fired = false;
    const wrapped = () => {
      if (fired) return;
      fired = true;
      try { cb(); } catch { /* ignore */ }
    };
    awaitingAudioEndCallbacksRef.current.push(wrapped);
    // Wall-clock safety net — if the tracker context is suspended (browser
    // doesn't allow AudioContext before a user gesture on first question)
    // we still need to advance at some point.
    setTimeout(() => {
      const idx = awaitingAudioEndCallbacksRef.current.indexOf(wrapped);
      if (idx >= 0) {
        awaitingAudioEndCallbacksRef.current.splice(idx, 1);
        console.warn('[PlaybackTracker] safety timeout — firing deferred callback');
        wrapped();
      }
    }, safetyTimeoutMs);
  }, []);
  const isRecordingRef = useRef(false);
  const audioEndReceivedRef = useRef(false);
  const currentAiTextRef = useRef("");
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isAiSpeakingRef = useRef(false);
  // True while Linda is speaking the "Are you there?" silence prompt — timer must NOT pause during this.
  const isSilencePromptRef = useRef(false);
  const isProcessingRef = useRef(false);
  // Cancellable ref for the 800ms "start recording after Linda stops" setTimeout.
  // Cancelled by the Next Q handler to prevent stale recording after a skip.
  const startRecordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Callback to execute after speak_text TTS finishes (replaces browser speechSynthesis)
  const speakTextCallbackRef = useRef<(() => void) | null>(null);

  // Stable callback refs — prevent WebSocket reconnection on re-renders
  const queueAudioRef = useRef<(pcmData: ArrayBuffer) => void>(() => {});
  const handleMessageRef = useRef<(data: any) => void>(() => {});
  // Deferred streamStart: stored here by speaking_started, called on first audio chunk.
  // Prevents TalkingHead from receiving streamStart with an empty buffer (causes early
  // onAudioEnd on Q1 when AudioContext is cold or TalkingHead is still initialising).
  const pendingStreamStartRef = useRef<(() => void) | null>(null);

  // Total PCM audio received for the current Linda turn (ms).
  // Used to set the audio_end fallback timeout so it always fires AFTER
  // TalkingHead finishes playing — not after a fixed 3s regardless of length.
  const currentTurnAudioMsRef = useRef(0);
  // Wall-clock timestamp (Date.now()) of when the FIRST PCM chunk for the
  // current Linda turn was received. Used by the token-reveal system to
  // compute audio progress (once audio_end fires).
  const firstPcmAtMsRef = useRef<number | null>(null);
  // Wall-clock timestamp of the LAST PCM chunk received for the current
  // Linda turn. Updated on every queueAudio call. This is the right anchor
  // for "when does playback actually end on the speakers":
  //   trueEndMs = lastPcmAtMs + AUDIO_TAIL_MARGIN_MS
  // (the margin covers TalkingHead's internal buffer + the last chunk's
  // own playback duration). `firstPcmAt + audioMs` is NOT correct for
  // this because chunks stream in real-time — so at end-of-stream,
  // `firstPcm + audioMs ≈ now`, and finalizePlayback would fire right
  // when the backend stopped sending (not when the speakers went silent).
  const lastPcmAtMsRef = useRef<number | null>(null);
  // Wall-clock fallback margin — applied ONLY when the AudioBufferSourceNode
  // tracker is unavailable (e.g. first question with a suspended
  // AudioContext). Previously 1200 ms, bumped to 3000 ms after field reports
  // of "Your turn" still surfacing mid-speech on long TTS responses. With
  // the tracker path working, this margin is rarely reached — it's the
  // safety net, not the primary signal.
  const AUDIO_TAIL_MARGIN_MS = 3000;
  // TalkingHead buffers incoming PCM before its speaker goes audible.
  // Text reveal must wait this long after the first chunk arrives, else
  // the bubble paints while Linda is still silent. 1500ms gives generous
  // headroom for network jitter + TalkingHead's internal codec init.
  const TALKING_HEAD_BUFFER_MS = 1500;
  // Set to true to pipe reveal timing to the browser console — invaluable
  // for diagnosing text-before-voice reports from candidates.
  const REVEAL_DEBUG = true;
  // AudioContext clock (in seconds) at which Linda's audio is expected to
  // become audible. Stamped when the first PCM chunk is received:
  //   audibleStartCtxSec = ctx.currentTime + (TALKING_HEAD_BUFFER_MS / 1000)
  // The reveal loop uses this — NOT wall-clock, NOT chunk rates — as the
  // single source of truth for "how far into Linda's voice are we".
  const audibleStartCtxSecRef = useRef<number | null>(null);

  // Token reveal system
  const tokenBufferRef = useRef("");
  const revealedCharsRef = useRef(0);
  const revealTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Keep refs in sync with state — refs are always current inside stale closures
  useEffect(() => {
    isAiSpeakingRef.current = isAiSpeaking;
    // Clear silence prompt flag when Linda stops speaking
    if (!isAiSpeaking) isSilencePromptRef.current = false;
  }, [isAiSpeaking]);
  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);
  useEffect(() => { isFollowUpRef.current = isFollowUp; }, [isFollowUp]);

  // Start pending per-question countdown the moment Linda stops speaking.
  // Always starts from the full duration so the candidate sees the complete
  // time available to them from the moment they can actually answer.
  // The backend's TTS_PLAYBACK_BUFFER already accounts for playback lag on
  // its auto-skip timer, so no client-side subtraction is needed here.
  useEffect(() => {
    const timestamp = new Date().toISOString();
    console.log(`[Timer ${timestamp}] Pending timer useEffect: isAiSpeaking=${isAiSpeaking}, pendingDur=${questionTimerPendingRef.current}`);
    if (isAiSpeaking) return; // still speaking — nothing to do
    const pendingDur = questionTimerPendingRef.current;
    if (pendingDur === null) return; // no pending timer
    console.log(`[Timer ${timestamp}] Starting pending timer: ${pendingDur}s`);
    questionTimerPendingRef.current = null;
    questionTimerReceivedAtRef.current = null; // clear receipt timestamp (no longer used)
    questionTimerTotalRef.current = pendingDur;
    // Fix 1: anchor monotonic start time when Linda finishes and the
    // candidate's window actually opens — not when the WS message arrived.
    questionTimerStartedAtMsRef.current = performance.now();
    questionTimerPausedMsRef.current = 0;
    questionTimerPausedAtRef.current = null;

    setQuestionTimerSeconds(pendingDur);
    // Sync ref immediately — don't wait for the useEffect so the global timer's
    // null-check gate opens at the exact same tick as the per-question timer.
    questionTimerSecondsRef.current = pendingDur;

    if (questionTimerIntervalRef.current) {
      clearInterval(questionTimerIntervalRef.current);
    }
    questionTimerIntervalRef.current = setInterval(() => {
      // Per-question timer runs CONTINUOUSLY from the moment Linda finishes
      // speaking the question. The only allowed pause is during a
      // candidate-initiated clarification — Linda re-explaining the question
      // should not burn the candidate's answer window. Previously this also
      // paused during any ack / follow-up / next-question TTS, which drifted
      // the displayed value away from the backend's monotonic clock and
      // desynced from the global timer.
      if (isClarificationRef.current || isFullscreenExitedRef.current) {
        if (questionTimerPausedAtRef.current === null) {
          questionTimerPausedAtRef.current = performance.now();
        }
        return;
      }
      if (questionTimerPausedAtRef.current !== null) {
        questionTimerPausedMsRef.current += performance.now() - questionTimerPausedAtRef.current;
        questionTimerPausedAtRef.current = null;
      }
      const remaining = computeQuestionRemaining();
      if (remaining === null) return;
      setQuestionTimerSeconds(remaining);
      if (remaining <= 0) {
        if (questionTimerIntervalRef.current) {
          clearInterval(questionTimerIntervalRef.current);
          questionTimerIntervalRef.current = null;
        }
        setTimeout(() => {
          setQuestionTimerExpired(true);
          questionTimerExpiredRef.current = true;
          setIsClarification(false);
          isClarificationRef.current = false;
          setShowSilenceBanner(false);
          setSilenceCountdown(null);
          if (silenceCountdownRef.current) { clearInterval(silenceCountdownRef.current); silenceCountdownRef.current = null; }
          setStatus("Time's up — moving to the next question...");
          setIsProcessing(false);
          isProcessingRef.current = false;
          clearNoResponseTimer();
          stopRecordingSilentRef.current();
          // Tell the backend to skip immediately — don't wait for its phased
          // silence flow (8s + TTS + 5s) which may not have reached the skip
          // point yet. The backend's skip_question handler cancels _auto_skip
          // and calls handle_skip_question, which advances to the next question
          // and sends question_timer_started for the new timer.
          if (wsRef.current?.readyState === WebSocket.OPEN && !backendExpiredRef.current) {
            wsRef.current.send(JSON.stringify({ type: "skip_question", source: "timer_expired" }));
          }
        }, 0);
      }
    }, 1000);
  }, [isAiSpeaking, computeQuestionRemaining]);

  // When the per-question timer expires, the client sends skip_question to the
  // backend (see the timer-expiry block above). The backend's handle_skip_question
  // advances to the next question and sends question_timer_started, which resets
  // the client timer via the question_timer_started handler. No client-side
  // auto-restart is needed — the backend is the single source of truth for
  // question progression.

  // VAD settings
  const silenceStartRef = useRef<number | null>(null);
  const speechDetectedRef = useRef(false);
  const speechDetectedAtRef = useRef<number | null>(null);
  const speechStartSentRef = useRef(false); // fires speech_started once per recording session
  const silenceThresholdRef = useRef(0.005);
  const silenceDurationMsRef = useRef(9000); // conversational mode needs long pauses tolerated; backend may override
  const LIVE_BATCH_CHAR_THRESHOLD = 320;
  const liveBatchSentCharsRef = useRef(0);
  const liveBatchIndexRef = useRef(0);
  const liveBatchStopRequestedRef = useRef(false);

  // VAD warmup: suppress speech detection for the first N ms after the mic opens.
  // The browser echo canceller needs a few hundred ms of audio to build its model.
  // Without this, Linda's TTS echo can trigger VAD immediately after she stops speaking.
  const VAD_WARMUP_MS = 600;
  const vadWarmupUntilRef = useRef<number>(0); // timestamp after which VAD is live

  // Fix 3: ALSO suppress VAD for a short window after TalkingHead's audible
  // playback actually ends. 600ms of post-mic-open warmup isn't enough for
  // Bluetooth headsets or rooms with long reverb tails — Linda's TTS tail can
  // bleed through the echo canceller for 500–1500ms and trigger a false
  // speech_started, which in turn cancels the backend's silence nudge and
  // triggers bogus follow-up flows. `playbackEchoGuardUntilRef` is stamped
  // inside the onAudioEnd callback (pendingStreamStartRef) and also inside
  // the safety-net fallback so every end-of-playback path is covered.
  const PLAYBACK_ECHO_GUARD_MS = 800;
  const playbackEchoGuardUntilRef = useRef<number>(0);

  // Consecutive frames above threshold before confirming speech.
  // At ~93ms/frame, 3 frames ≈ 280ms — catches real speech, rejects single-frame noise.
  const speechFrameCountRef = useRef(0);
  const MIN_SPEECH_FRAMES = 3;

  // After speech is confirmed, require this many consecutive above-threshold frames
  // to reset the silence timer. Prevents noise spikes (1-2 frames of ambient sound
  // at ~0.005-0.006) from restarting the silence countdown after the user stops talking.
  const postSpeechNoiseCountRef = useRef(0);
  const MIN_RESPEECH_FRAMES = 2; // ~186ms of sustained audio resets silence timer (lower = more responsive)

  // Fix 4: playback_complete delivery is the single gate that unblocks the
  // backend's silence clock. Dropping this one message stalls the 8s silence
  // detection for up to 30 s (until the backend's safety timeout fires). To
  // harden against a single dropped frame, send it twice: immediately, then
  // ~150 ms later. Backend sets asyncio.Event() which is idempotent, so two
  // arrivals cause no duplicate processing.
  const sendPlaybackComplete = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (shouldDisconnectAfterAudioRef.current || isClosingRef.current) return;
    const msgId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
    const payload = JSON.stringify({ type: 'playback_complete', client_msg_id: msgId });
    try { ws.send(payload); } catch { /* first send may race with a just-closed socket */ }
    setTimeout(() => {
      const ws2 = wsRef.current;
      if (!ws2 || ws2.readyState !== WebSocket.OPEN) return;
      if (shouldDisconnectAfterAudioRef.current || isClosingRef.current) return;
      try { ws2.send(payload); } catch { /* ignore */ }
    }, 150);
  }, []);

  // Save AI message — called from finalizePlayback at the TRUE end-of-audio.
  // Stop any ongoing reveal loop and flush the live bubble into the chat
  // as one committed assistant message. Because finalizePlayback is gated
  // on firstPcmAt + audioMs, this can only fire AFTER the audio has
  // actually finished playing — guaranteeing the live bubble transitioning
  // into the chat message coincides with Linda's audio ending, which is
  // exactly when "Your turn" should surface.
  const saveAiMessage = useCallback(() => {
    if (revealTimerRef.current) {
      clearInterval(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    // Always use full tokenBuffer — currentAiTextRef may be partially revealed
    const text = tokenBufferRef.current.trim();
    if (text) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: text,
        timestamp: nowIST(),
      }]);
      currentAiTextRef.current = "";
      tokenBufferRef.current = "";
      revealedCharsRef.current = 0;
      setCurrentAiText("");
    }
  }, []);

  // Token reveal system — the live "Linda" bubble that reveals tokens as
  // they stream.
  //
  // There are TWO reveal phases, because the total audio duration is
  // unknown until the backend sends `audio_end`:
  //
  //   Phase A (streaming): audio_end not yet received. We don't know the
  //   total TTS duration, and `currentTurnAudioMsRef` only reflects audio
  //   RECEIVED so far (chunks stream at real-time rate, so it roughly
  //   equals wall-clock elapsed → useless as a denominator). Use a
  //   conservative CPS (~14 chars/sec) pacing; this matches typical TTS
  //   speaking rate so the text advances with the audio instead of
  //   out-racing or lagging it.
  //
  //   Phase B (post-audio_end): we know the TRUE total audio duration
  //   (currentTurnAudioMsRef is final) AND the wall-clock end point
  //   (`firstPcmAt + audioMs`). Compute progress from the anchor and
  //   drive the reveal to finish exactly at that wall-clock moment.
  //
  // The reveal loop KEEPS ticking while Linda is still audible, even once
  // all text is revealed, so the bubble cannot "finish" before audio does.
  // `saveAiMessage` (which commits the bubble into the chat) is triggered
  // exclusively by `finalizePlayback`, which itself fires at true end-of-
  // audio — so the chat-message transition is bound to audio end, not to
  // text-reveal completion.
  const CONSERVATIVE_REVEAL_CPS = 14;
  const startRevealingTokens = useCallback(() => {
    if (revealTimerRef.current) {
      clearInterval(revealTimerRef.current);
    }
    revealTimerRef.current = setInterval(() => {
      const fullText = tokenBufferRef.current;
      if (fullText.length === 0) return;
      const firstPcmAt = firstPcmAtMsRef.current;
      const audioMs = currentTurnAudioMsRef.current;
      let target = revealedCharsRef.current;

      // Reveal progress. Primary clock: AudioContext's scheduled timeline.
      // Fallback: wall-clock (used when the tracker context is suspended,
      // which happens post-fullscreen-exit / cold start — the exact failure
      // mode where "text appears only after Linda finishes speaking").
      const pbCtx = playbackTrackerCtxRef.current;
      const ctxStart = audibleStartCtxSecRef.current;
      const ctxEnd = playbackScheduledEndAtRef.current;
      const ctxAvailable =
        !!pbCtx &&
        pbCtx.state === "running" &&
        ctxStart !== null &&
        Number.isFinite(ctxEnd) &&
        ctxEnd > ctxStart;

      let progress: number | null = null;

      if (ctxAvailable) {
        const now = pbCtx!.currentTime;
        if (now < ctxStart!) {
          if (REVEAL_DEBUG) console.debug(`[Reveal] ctx-wait now=${now.toFixed(3)} start=${ctxStart!.toFixed(3)}`);
          return;  // inside buffer delay
        }
        progress = (now - ctxStart!) / (ctxEnd - ctxStart!);
        if (REVEAL_DEBUG) console.debug(`[Reveal] ctx now=${now.toFixed(3)} start=${ctxStart!.toFixed(3)} end=${ctxEnd.toFixed(3)} prog=${progress.toFixed(3)}`);
      } else if (firstPcmAt !== null) {
        // Fallback: wall-clock math so streaming reveal works even when the
        // tracker AudioContext is stalled. `audibleStartMs` waits out the
        // TalkingHead buffer; the denominator is the ACCUMULATED audio
        // duration received so far (a reliable estimate of total playback).
        const audibleStartMs = firstPcmAt + TALKING_HEAD_BUFFER_MS;
        const elapsedMs = Date.now() - audibleStartMs;
        if (elapsedMs < 0) {
          if (REVEAL_DEBUG) console.debug(`[Reveal] wc-wait elapsed=${elapsedMs}`);
          return;
        }
        const receivedMs = currentTurnAudioMsRef.current;
        if (receivedMs <= 0) return;
        progress = elapsedMs / receivedMs;
        if (REVEAL_DEBUG) console.debug(`[Reveal] wc elapsed=${elapsedMs} received=${receivedMs} prog=${progress.toFixed(3)} ctxState=${pbCtx?.state} ctxStart=${ctxStart}`);
      } else {
        if (REVEAL_DEBUG) console.debug(`[Reveal] no-anchor firstPcmAt=${firstPcmAt} ctxAvailable=${ctxAvailable}`);
        return;
      }

      if (progress === null) return;
      const cap = audioEndReceivedRef.current ? 1 : 0.85;
      progress = Math.max(0, Math.min(cap, progress));
      target = Math.floor(progress * fullText.length);
      if (target > revealedCharsRef.current) {
        revealedCharsRef.current = target;
        const revealedText = fullText.substring(0, target);
        currentAiTextRef.current = revealedText;
        setCurrentAiText(revealedText);
      }
      // NOTE: We intentionally do NOT clear the interval when the text is
      // fully revealed. The loop keeps running so we remain ready for
      // streamed additions, and `saveAiMessage` (called by finalizePlayback
      // at true end-of-audio) is the single owner of end-of-bubble cleanup.
    }, 80);
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

  const sendLiveTranscriptBatch = useCallback((text: string, trigger: string) => {
    const payload = (text || "").trim();
    if (!payload) return;
    if (!(isFlexibleMode || isNewFlexibleMode)) return;
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;

    liveBatchIndexRef.current += 1;
    wsRef.current.send(JSON.stringify({
      type: "live_transcript_batch",
      text: payload,
      trigger,
      batch_index: liveBatchIndexRef.current,
    }));
  }, [isFlexibleMode, isNewFlexibleMode]);

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
    // Clear previous turn's transcript now — the new recording session starts fresh.
    // This is the ONLY correct place to clear: after the previous message was added to
    // the chat (or kept visible during processing gap) and a new question turn begins.
    webSpeechFinalizedRef.current = "";
    liveBatchSentCharsRef.current = 0;
    liveBatchIndexRef.current = 0;
    liveBatchStopRequestedRef.current = false;
    setCurrentTranscript("");
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event: any) => {
      // HARD GUARD: if Linda is currently speaking (or the post-playback echo
      // guard is still armed), whatever the Web Speech API picked up is almost
      // certainly Linda's own TTS bleeding back in through the speakers — NOT
      // the candidate. Drop those results entirely so they can't contaminate
      // the finalized buffer OR the live "speaking…" bubble. This is what was
      // showing "what strategies do you use to" (verbatim echo of Linda's
      // question) under the candidate's live transcript.
      //
      // Also drop during the silence nudge ("Are you there?") — per spec,
      // candidate's answer must only be captured AFTER the nudge finishes.
      if (isAiSpeakingRef.current) return;
      if (Date.now() < playbackEchoGuardUntilRef.current) return;

      // Use event.resultIndex so we only process NEW results in this event.
      // Iterating from 0 would re-accumulate old finalized segments and overwrite
      // the ref after a session restart, losing all previously captured text.
      let newFinalizedText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          newFinalizedText += transcript;
        } else {
          interimText += transcript;
        }
      }
      if (newFinalizedText) {
        // Append (not replace) — preserves text from earlier recognition sessions.
        webSpeechFinalizedRef.current = (webSpeechFinalizedRef.current + ' ' + newFinalizedText).trim();
        const finalizedText = webSpeechFinalizedRef.current;
        const unsentText = finalizedText.slice(liveBatchSentCharsRef.current).trim();
        if ((isFlexibleMode || isNewFlexibleMode) && unsentText.length >= LIVE_BATCH_CHAR_THRESHOLD) {
          sendLiveTranscriptBatch(unsentText, "character_threshold");
          liveBatchSentCharsRef.current = finalizedText.length;
        }
      }
      // Show everything: all finalized segments + current interim.
      // Lowered threshold from 3 → 0 so short words ("yes", "ok", "hi") stream live
      // instead of sitting hidden until the buffer grows — makes the bubble feel real-time.
      const fullText = (webSpeechFinalizedRef.current + (interimText ? ' ' + interimText : '')).trim();
      if (fullText.length > 0) {
        setCurrentTranscript(fullText);
        // Bridge: Web Speech API detected real speech — also set the VAD's
        // speechDetectedRef and send speech_started to the backend. This
        // prevents the "Are you there?" prompt from firing when the candidate
        // IS speaking but their mic amplitude stays below the VAD threshold
        // (quiet voice, Bluetooth headset, browser gain normalization). The
        // VAD and Web Speech API are independent; without this bridge the
        // no-response timer only checks speechDetectedRef (VAD) and fires
        // even though the transcript bubble is visibly showing text.
        if (!speechDetectedRef.current) {
          speechDetectedRef.current = true;
          speechDetectedAtRef.current = Date.now();
          postSpeechNoiseCountRef.current = MIN_RESPEECH_FRAMES;
          // Unfreeze the per-question timer — candidate is talking now.
          questionTimerAwaitingSpeechRef.current = false;
          if (!speechStartSentRef.current) {
            speechStartSentRef.current = true;
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: "speech_started" }));
            }
          }
        }
        // Clear the no-response timer — candidate is actively speaking.
        if (noResponseTimerRef.current) {
          clearTimeout(noResponseTimerRef.current);
          noResponseTimerRef.current = null;
        }
        noResponseRetryRef.current = 0;
      }
    };
    recognition.onend = () => {
      // Only auto-restart if the candidate's mic is truly open AND Linda is
      // not speaking AND we're past the echo-guard window. Otherwise a
      // restart here resurrects the recognition mid-Linda-speech and picks
      // her TTS back up — which is how the live transcript ended up
      // showing Linda's own question text.
      if (
        isRecordingRef.current &&
        !isAiSpeakingRef.current &&
        Date.now() >= playbackEchoGuardUntilRef.current
      ) {
        try { recognition.start(); } catch {}
      }
    };
    recognitionRef.current = recognition;
    try { recognition.start(); } catch {}
  }, [sendLiveTranscriptBatch, isFlexibleMode, isNewFlexibleMode]);

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
      // Linda finished — re-enable mic audio tracks (disabled during her speech).
      // If the stream has been torn down between turns this is a safe no-op.
      if (mediaStreamRef.current && !isMutedRef.current) {
        mediaStreamRef.current.getAudioTracks().forEach(t => { t.enabled = true; });
      }
      saveAiMessage();

      // Notify backend that audio finished playing so _auto_skip starts the
      // silence clock from the right moment (not from when chunks were sent).
      // Sent twice via sendPlaybackComplete to survive a single dropped frame.
      sendPlaybackComplete();

      if (shouldDisconnectAfterAudioRef.current || isClosingRef.current) {
        setStatus("Interview completed. Thank you!");
        setTimeout(() => { disconnect(); }, 1500);
        return;
      }
      setIsClarification(false);
      setStatus("Your turn - speak now...");

      // Start the pending question timer NOW — this is the exact moment Linda stops.
      // Don't rely on useEffect (race condition: next speaking_started can arrive
      // before React processes the isAiSpeaking state change).
      const pendingDur = questionTimerPendingRef.current;
      if (pendingDur !== null) {
        questionTimerPendingRef.current = null;
        questionTimerReceivedAtRef.current = null;
        questionTimerTotalRef.current = pendingDur;
        setQuestionTimerSeconds(pendingDur);
        // Sync ref immediately so the global timer's null-check gate opens at the
        // exact same tick — both timers start together the moment Linda stops.
        questionTimerSecondsRef.current = pendingDur;
        if (questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current);
        questionTimerIntervalRef.current = setInterval(() => {
          // Per-question timer only pauses during clarification — see the
          // main question_timer_started path for the rationale.
          if (isClarificationRef.current || isFullscreenExitedRef.current) return;
          setQuestionTimerSeconds(prev => {
            if (prev === null || prev <= 1) {
              if (questionTimerIntervalRef.current) {
                clearInterval(questionTimerIntervalRef.current);
                questionTimerIntervalRef.current = null;
              }
              setTimeout(() => {
                setQuestionTimerExpired(true);
                questionTimerExpiredRef.current = true;
                setIsClarification(false);
                isClarificationRef.current = false;
                setShowSilenceBanner(false);
                setSilenceCountdown(null);
                if (silenceCountdownRef.current) { clearInterval(silenceCountdownRef.current); silenceCountdownRef.current = null; }
                setStatus("Time's up — moving to the next question...");
                setIsProcessing(false);
                isProcessingRef.current = false;
                clearNoResponseTimer();
                stopRecordingSilentRef.current();
                if (wsRef.current?.readyState === WebSocket.OPEN && !backendExpiredRef.current) {
                  wsRef.current.send(JSON.stringify({ type: "skip_question", source: "timer_expired" }));
                }
              }, 0);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }

      // 800ms delay before opening mic
      if (startRecordingTimerRef.current) clearTimeout(startRecordingTimerRef.current);
      startRecordingTimerRef.current = setTimeout(() => {
        startRecordingTimerRef.current = null;
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          startRecordingInternal();
        }
      }, 800);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveAiMessage, avatarState, stopVisemeLoop, isFlexibleMode, isNewFlexibleMode]);

  const queueAudio = useCallback((pcmData: ArrayBuffer) => {
    // TalkingHead handles audio playback (gain:1) + lip sync.
    // Accumulate turn audio duration so the audio_end fallback timeout is
    // proportional to how long Linda actually spoke (not a fixed 3 s).
    // Int16 PCM @ 24 kHz: byteLength / 2 samples × (1000 ms / 24000 samples)
    currentTurnAudioMsRef.current += (pcmData.byteLength / 2 / 24000) * 1000;
    // Stamp the wall-clock of the most recent chunk — the TRUE anchor for
    // end-of-playback (buffered audio ends at lastPcmAt + tail margin).
    lastPcmAtMsRef.current = Date.now();

    if (!isPlayingRef.current) {
      // First chunk of this turn — stamp the wall-clock anchor (still used
      // by a few legacy code paths for timeouts). The authoritative audio-
      // clock anchor (audibleStartCtxSecRef) is stamped inside
      // trackPlaybackChunk, which has the real scheduled start time.
      firstPcmAtMsRef.current = Date.now();
      isPlayingRef.current = true;
      isAiSpeakingRef.current = true;
      setIsAiSpeaking(true);
      avatarState.onAiStartSpeaking();
      if (!revealTimerRef.current && tokenBufferRef.current.length > 0) {
        startRevealingTokens();
      }
    }
  }, [avatarState, startRevealingTokens]);

  // AIU39: Handle skip request — sends WS message and waits for skip_accepted/rejected
  const handleSkipRequest = useCallback(() => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({
      type: 'skip_request',
      question_id: currentQuestionIdRef.current,
    }));
  }, []);

  // WebSocket handlers
  const handleMessage = useCallback((data: any) => {
    const timestamp = new Date().toISOString();
    console.log(`[WS ${timestamp}] Event: ${data.type}`, data);

    switch (data.type) {
      case "pong":
        console.log(`[WS ${timestamp}] Keepalive pong received`);
        break; // Keepalive response — no action needed
      case "viseme_timeline":
        // Deprecated — lip sync is now driven by real-time amplitude analysis.
        console.log(`[WS ${timestamp}] Viseme timeline received (deprecated)`);
        break;
      case "connected":
        console.log(`[WS ${timestamp}] Connected: session_id=${data.session_id}, total_questions=${data.total_questions}, duration_minutes=${data.duration_minutes}, remaining_seconds=${data.remaining_seconds}`);
        if (data.session_id) {
          sessionIdRef.current = data.session_id;
        }
        if (data.vad_config) {
          silenceThresholdRef.current = data.vad_config.silence_threshold;
          silenceDurationMsRef.current = data.vad_config.silence_duration_ms;
          console.log(`[WS ${timestamp}] VAD config: threshold=${data.vad_config.silence_threshold}, silence_ms=${data.vad_config.silence_duration_ms}`);
        }
        // Sync global timer from backend — accounts for resumed sessions with elapsed time.
        if (data.remaining_seconds != null && data.remaining_seconds >= 0) {
          console.log(`[WS ${timestamp}] Syncing global timer from backend: ${data.remaining_seconds}s remaining`);
          setRemainingSeconds(prev => {
            if (isFlexibleMode || isNewFlexibleMode) {
              return Math.min(prev, data.remaining_seconds);
            }
            return data.remaining_seconds;
          });
        }
        if (data.timer_state) {
          console.log(`[WS ${timestamp}] Timer state:`, data.timer_state);
        }
        break;
      case "session_resumed": {
        console.log(`[WS ${timestamp}] Session resumed: prior_question_count=${data.prior_question_count}, elapsed_seconds=${data.elapsed_seconds}`);
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
        // Restore global timer ONLY if we're not currently mid-fullscreen-exit.
        // When the candidate exits fullscreen the timer is frozen (we want it
        // maintained across the pause) — if a WS reconnect fires session_resumed
        // during that window, the server's wall-clock elapsed would clobber the
        // frozen value and make the timer appear to jump / reset. The
        // fullscreen-change return handler will restore from the frozen ref
        // when the candidate re-enters.
        if (data.elapsed_seconds && data.elapsed_seconds > 0 && !isFullscreenExitedRef.current) {
          const totalSeconds = (isFlexibleMode || isNewFlexibleMode) ? 30 * 60 : interviewInfo.duration_minutes * 60;
          const restored = Math.max(0, totalSeconds - data.elapsed_seconds);
          setRemainingSeconds(prev => {
            if (isFlexibleMode || isNewFlexibleMode) {
              return Math.min(prev, restored);
            }
            return restored;
          });
        }
        // Trust the backend's authoritative `prior_question_count` (the number
        // of questions Linda actually asked) instead of deriving it from
        // `elapsed_seconds / 120`. The elapsed-based formula over-counts by
        // assuming every question consumes the full 2-min slot, which is why
        // candidates saw "Q12/15" after only 7 real questions: elapsed was
        // 24 min but actual asked count was 7.
        if (!(isFlexibleMode || isNewFlexibleMode) && typeof data.prior_question_count === "number") {
          const maxQ = totalQuestions ?? interviewInfo.total_questions ?? 15;
          const nextQ = Math.min(maxQ, Math.max(1, data.prior_question_count + 1));
          if (nextQ > (questionNumber ?? 0)) {
            setQuestionNumber(nextQ);
            questionNumberRef.current = nextQ;
          }
        }
        const _priorDisplay = data.prior_question_count ?? 0;
        setStatus(`Session resumed — continuing from question ${_priorDisplay + 1}`);
        break;
      }
      case "greeting":
        console.log(`[WS ${timestamp}] Greeting received: text_length=${data.text?.length}`);
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
      case "interstitial_prompt":
        // Linda says a hardcoded line that bypasses the LLM (e.g. the silence
        // nudge "Are you there?"). Seed the token buffer so it:
        //   1) renders in the chat panel as an assistant message (saved on audio_end)
        //   2) is fed to TalkingHead for lip sync
        // Mirrors the greeting handler but without the one-time greeting semantics,
        // and sets isSilencePromptRef so the question timer keeps counting during
        // the nudge (candidate hears it, their 2-min slot does not pause).
        console.log(`[WS ${timestamp}] Interstitial prompt: kind=${data.kind}, text_length=${data.text?.length}`);
        tokenBufferRef.current = (data.text as string) ?? "";
        revealedCharsRef.current = 0;
        isAiSpeakingRef.current = true;
        setIsAiSpeaking(true);
        avatarState.onAiStartSpeaking();
        audioEndReceivedRef.current = false;
        if (data.kind === "silence_nudge") {
          isSilencePromptRef.current = true;
        }
        setStatus("Linda is speaking...");
        startRevealingTokens();
        talkingHeadRef.current?.setText((data.text as string) ?? "");
        break;
      case "transcript":
        console.log(`[WS ${timestamp}] Transcript: is_final=${data.is_final}, text_length=${data.text?.length}, is_enhanced=${data.is_enhanced}`);
        if (data.is_final) {
          const transcriptText = (data.text ?? "").trim();
          // Validate: reject empty text, noise artifacts, and Whisper hallucinations.
          if (transcriptText && isTranscriptMeaningful(transcriptText)) {
            // Clear live bubble only now — it atomically transitions to a chat message.
            // Never clear before this point: keeps transcript visible during processing gap.
            setCurrentTranscript("");
            if (data.is_enhanced) {
              // Enhanced transcript from LLM correction — update the last user message.
              // Preserve responseTimeSeconds that was stamped when the raw transcript arrived.
              setMessages(prev => {
                const updated = [...prev];
                for (let i = updated.length - 1; i >= 0; i--) {
                  if (updated[i].role === "user") {
                    updated[i] = { ...updated[i], content: transcriptText };
                    break;
                  }
                }
                return updated;
              });
            } else {
              // Raw Whisper transcript — add as new user message, stamping the
              // frozen timer value captured when the candidate stopped speaking.
              const frozenTime = frozenResponseTimeRef.current;
              frozenResponseTimeRef.current = null; // consume — don't reuse for next message
              setMessages(prev => [...prev, {
                id: crypto.randomUUID(),
                role: "user",
                content: transcriptText,
                responseTimeSeconds: frozenTime ?? undefined,
                timestamp: nowIST(),
              }]);
            }
            currentAiTextRef.current = "";
            setCurrentAiText("");
          }
          // If transcript is empty or fails validation: keep the live transcript visible.
          // The candidate can still see what they said; backend will advance to next Q.
        } else {
          // Partial transcript from backend (VAD-enhanced) — intentionally ignored.
          // The live transcript bubble is driven solely by the Web Speech API
          // (startWebSpeechRecognition) which shows the raw candidate speech.
          // Applying VAD corrections here caused words to jump/correct mid-sentence.
        }
        break;
      case "long_answer_batch_processed":
        if (data.action === "continue" || data.action === "conclude") {
          break;
        }
        if (liveBatchStopRequestedRef.current) {
          break;
        }
        liveBatchStopRequestedRef.current = true;
        if (data.action === "intervene") {
          setStatus("Intervening...");
        }
        setTimeout(() => {
          if (isRecordingRef.current && !isProcessingRef.current) {
            stopRecordingSilentRef.current();
          }
        }, 150);
        break;
      case "llm_token":
        console.log(`[WS ${timestamp}] LLM token: token_length=${data.token?.length}, buffer_length=${tokenBufferRef.current.length}`);
        tokenBufferRef.current += data.token;
        // Feed updated text for word-level phoneme lip sync
        talkingHeadRef.current?.setText(tokenBufferRef.current);
        // Mark Linda as speaking the moment she starts *generating* text.
        // Without this, there's a 1-3s gap between the last LLM token and
        // `speaking_started` (TTS synthesis latency) during which
        // isAiSpeaking flips false → the "Your turn — speak now" banner
        // flashes before Linda's voice actually begins. Holding this true
        // from first-token closes that window.
        if (!isAiSpeakingRef.current) {
          isAiSpeakingRef.current = true;
          setIsAiSpeaking(true);
          audioEndReceivedRef.current = false;
          candidatePlaybackEndedRef.current = false;
          setCandidatePlaybackEnded(false);
          // Reset turn-scoped audio anchors so Fix 2's reveal gate works for
          // THIS turn. Without this, `firstPcmAtMsRef` stays set from the
          // previous question's audio — Phase A sees it as non-null, runs
          // immediately with CPS pacing, and Q2+ text races ahead of Linda's
          // voice while Q1 correctly waits.
          firstPcmAtMsRef.current = null;
          lastPcmAtMsRef.current = null;
          currentTurnAudioMsRef.current = 0;
          audibleStartCtxSecRef.current = null;
        }
        if (!revealTimerRef.current) {
          startRevealingTokens();
        }
        if (!isPlayingRef.current) {
          setStatus("Linda is thinking...");
        }
        break;
      case "llm_correction":
        // Backend replaced the streamed response (flexible-mode validation retry/fallback).
        // Swap the token buffer so the displayed text matches what Linda actually says.
        console.log(`[WS ${timestamp}] LLM correction received: text_length=${data.text?.length}`);
        if (data.text) {
          tokenBufferRef.current = data.text;
          revealedCharsRef.current = 0;
          talkingHeadRef.current?.setText(data.text);
          stopRevealingTokens();
          startRevealingTokens();
        }
        break;
      case "speaking_started":
        console.log(`[WS ${timestamp}] Speaking started`);
        // Stop any stale recording or pending start-recording timer — Linda is speaking.
        stopRecordingSilentRef.current();
        if (startRecordingTimerRef.current) {
          clearTimeout(startRecordingTimerRef.current);
          startRecordingTimerRef.current = null;
        }
        // Belt-and-suspenders: hard-disable the mic audio track while Linda
        // speaks so even if the stream is still held somewhere, nothing can
        // be captured or streamed upstream. Re-enabled when her audio ends
        // (handleAllAudioFinished / audio_end path) or the next mic open.
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
        }
        // Issue 3 fix (belt-and-suspenders): explicitly reset VAD state here
        // even if stopRecordingSilent already ran. If the mic had already been
        // closed before speaking_started arrived, stopRecordingSilent no-ops
        // (see the isRecording guard) and leaves speechDetectedRef stale —
        // then the next mic open would start with speechDetectedRef=true and
        // immediately stream PCM (including Linda's echo) to the backend.
        speechDetectedRef.current = false;
        speechFrameCountRef.current = 0;
        postSpeechNoiseCountRef.current = 0;
        speechStartSentRef.current = false;
        silenceStartRef.current = null;
        // ALSO hard-stop the browser Web Speech API recognition AND clear any
        // stale live-transcript text. If we leave it running while Linda
        // speaks, it eagerly transcribes her TTS leaking back through the
        // speakers and renders it in the candidate's "speaking…" bubble
        // (the "what strategies do you use to" bug). Recognition will be
        // restarted by the recording-start path when the candidate's turn
        // actually opens.
        stopWebSpeechRecognition();
        webSpeechFinalizedRef.current = "";
        setCurrentTranscript("");
        isAiSpeakingRef.current = true;
        setIsAiSpeaking(true);
        avatarState.onAiStartSpeaking();
        audioEndReceivedRef.current = false;
        // Bug C fix: new Linda turn starting — retract the "candidate can
        // speak" signal immediately so the banner can't linger from Q(n-1).
        candidatePlaybackEndedRef.current = false;
        setCandidatePlaybackEnded(false);
        // CRITICAL: reset ALL playback-tracking state so the new Linda turn
        // starts from a clean slate. Previously `isPlayingRef` was NOT reset
        // here; if it was stale `true` from a previous turn (TalkingHead
        // onAudioEnd never fired correctly), `queueAudio` would skip setting
        // `firstPcmAtMsRef`, the `finalizePlayback` deferral math would use
        // the stale anchor, compute `remainingPlaybackMs = 0`, and fire
        // immediately — surfacing "Your turn" while Linda was still speaking
        // the "Are you there?" prompt.
        isPlayingRef.current = false;
        pendingBuffersRef.current = 0;
        nextPlayTimeRef.current = 0;
        // Only reset the no-response retry counter for genuine NEW turns
        // (Linda asking a new question, ack, follow-up). During silence-nudge
        // flows (isSilencePromptRef = true) the backend is driving the
        // "Are you there?" → auto-skip pipeline. Resetting the counter here
        // would let the CLIENT's handleNoResponse fire again with retry=0
        // after the nudge TTS finishes, producing a duplicate "Are you there?"
        // that stacks up and loops indefinitely.
        if (!isSilencePromptRef.current) {
          noResponseRetryRef.current = 0;
        }
        currentTurnAudioMsRef.current = 0; // reset audio duration counter for this turn
        firstPcmAtMsRef.current = null;    // reset first-chunk anchor for this turn
        lastPcmAtMsRef.current = null;     // reset last-chunk anchor for this turn
        audibleStartCtxSecRef.current = null; // reset audio-clock anchor for this turn
        // Reset the playback tracker's per-turn counters. We deliberately
        // DO NOT reset `playbackScheduledEndAtRef` — that's the AudioContext
        // clock position. Each new chunk is scheduled at
        // `max(ctx.currentTime, playbackScheduledEndAtRef)`, so starting
        // from 0 on a new turn just means the first chunk plays at
        // ctx.currentTime. The `pending` and `awaiting` queues DO reset.
        playbackTrackerPendingRef.current = 0;
        awaitingAudioEndCallbacksRef.current = [];
        trackedThisTurnRef.current = false;
        const _pbCtx = playbackTrackerCtxRef.current;
        if (_pbCtx && _pbCtx.state === 'running') {
          playbackScheduledEndAtRef.current = _pbCtx.currentTime;
        } else {
          playbackScheduledEndAtRef.current = 0;
        }
        // Clear silence banner + countdown when Linda starts speaking
        setShowSilenceBanner(false);
        setSilenceCountdown(null);
        if (silenceCountdownRef.current) { clearInterval(silenceCountdownRef.current); silenceCountdownRef.current = null; }
        // Clear the "Your turn — speak now" banner IMMEDIATELY so it never lingers
        // visibly while Linda speaks (follow-ups, next questions, clarifications).
        setShowNowSpeakBanner(false);
        nowSpeakShownForSessionRef.current = false; // allow a fresh banner after she finishes
        if (nowSpeakTimerRef.current) { clearTimeout(nowSpeakTimerRef.current); nowSpeakTimerRef.current = null; }
        setStatus("Linda is speaking...");
        startRevealingTokens();
        // Clear stale expired timer when Linda starts speaking the NEXT question
        // so "TIME UP" doesn't linger while she's asking Q2.
        // Guard: skip this during silence-nudge turns (isSilencePromptRef).
        // If the question timer expired while the candidate was silent and the
        // backend fires a nudge TTS ("Are you there?"), its speaking_started
        // would clear the timer to null — but no question_timer_started follows
        // because we're still on the same question. The timer then disappears
        // entirely. Only clear when a genuine new turn starts.
        if (questionTimerExpired && !isSilencePromptRef.current) {
          setQuestionTimerSeconds(null);
          setQuestionTimerExpired(false);
          questionTimerExpiredRef.current = false;
          if (questionTimerIntervalRef.current) {
            clearInterval(questionTimerIntervalRef.current);
            questionTimerIntervalRef.current = null;
          }
        }
        // Feed accumulated text for phoneme lip sync before starting audio
        talkingHeadRef.current?.setText(tokenBufferRef.current);
        // Defer streamStart until the first PCM chunk arrives (see pendingStreamStartRef).
        // Calling streamStart here (empty buffer) can cause TalkingHead to fire onAudioEnd
        // immediately on Q1 when AudioContext is cold, clearing isAiSpeaking mid-speech.
        pendingStreamStartRef.current = () => {
          console.log("[TalkingHead] playback-ended callback — audio_end received?", audioEndReceivedRef.current);
          // GUARD: TalkingHead's onAudioEnd callback can fire too early —
          // e.g. on a brief silence between PCM chunks, or when its internal
          // queue drains before the backend has actually finished streaming
          // TTS audio. For Q2+ this was surfacing the "Your turn" banner
          // and starting the per-question timer while Linda was still
          // audibly speaking. Q1 didn't hit this because the greeting flow
          // sends a dedicated `greeting` event that pre-arms state
          // differently; every subsequent question has to rely purely on
          // TalkingHead's end signal.
          //
          // Wait for the authoritative `audio_end` from the backend before
          // running the end-of-playback work. If TalkingHead fired too
          // early, ignore this invocation — the `audio_end` handler sets
          // an `audioEndFallbackRef` timeout for `max(4000, audioMs+2500)`
          // that will do the same work (open mic, saveAiMessage,
          // sendPlaybackComplete) at the right wall-clock moment. That
          // timeout is our safety net; premature TalkingHead signals must
          // not pre-empt it.
          if (!audioEndReceivedRef.current) {
            console.warn("[TalkingHead] onAudioEnd fired BEFORE backend audio_end — ignoring; waiting for audioEndFallback");
            return;
          }
          // Clear safety-net fallback — normal path fired, no fallback needed
          if (audioEndFallbackRef.current) {
            clearTimeout(audioEndFallbackRef.current);
            audioEndFallbackRef.current = null;
          }
          // The AUTHORITATIVE end-of-playback signal: `whenTrackedPlaybackEnds`
          // queues our callback on the playback-tracker AudioContext's
          // `onended` handler for the LAST scheduled silent mirror buffer.
          // That fires at the exact wall-clock moment the real audio has
          // finished playing through TalkingHead's worklet — no guessing,
          // no margins, no wall-clock heuristics.
          const finalizePlayback = () => {
            isPlayingRef.current = false;
            isAiSpeakingRef.current = false;
            setIsAiSpeaking(false);
            avatarState.onAiStopSpeaking();
            candidatePlaybackEndedRef.current = true;
            setCandidatePlaybackEnded(true);
            // Flush any deferred "Interview Completed" modal that arrived
            // from the backend before Linda's farewell finished playing.
            if (pendingCompletionModalRef.current) {
              pendingCompletionModalRef.current = false;
              setShowCompletionModal(true);
            }
            // Fix 3: arm echo guard — VAD ignores speech input for
            // PLAYBACK_ECHO_GUARD_MS after Linda's real end-of-playback so TTS
            // tail / reverb can't register as candidate speech.
            playbackEchoGuardUntilRef.current = Date.now() + PLAYBACK_ECHO_GUARD_MS;
            saveAiMessage();
            // Notify backend: audio finished playing — start silence clock from now.
            // Sent twice via sendPlaybackComplete to survive a single dropped frame.
            sendPlaybackComplete();
            // Disconnect if interview is closing (Q15 done) or server sent interview_ended
            if (shouldDisconnectAfterAudioRef.current || isClosingRef.current) {
              setStatus("Interview completed. Thank you!");
              setTimeout(() => { disconnect(); }, 1500);
              return;
            }
            // Point 4: clarification ends the moment Linda finishes speaking
            setIsClarification(false);
            isClarificationRef.current = false;
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
          };
          // Wait for the tracker's audio-clock-end-of-playback BEFORE running
          // the end-of-turn work. If audio has already drained (tracker
          // pending=0 and ctx.currentTime >= scheduledEnd), this fires
          // synchronously. Otherwise it queues on the last chunk's `onended`.
          whenTrackedPlaybackEnds(finalizePlayback);
        };
        break;
      case "silent_discard":
        // Backend silently discarded the transcript (noise, non-English, hallucination).
        // Clear processing and reopen mic — do NOT touch the timer or speaking state.
        setIsProcessing(false);
        isProcessingRef.current = false;
        if (!isAiSpeakingRef.current && !isRecordingRef.current && !isFaceBlockedRef.current && !isMutedRef.current) {
          setTimeout(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN && !isAiSpeakingRef.current) {
              startRecordingInternal();
            }
          }, 300);
        }
        break;
      case "speaking_ended":
        // Backend detected stuck speaking state (>30s without audio_end) and reset it.
        // Force-clear isAiSpeaking so the question timer and mic can resume.
        console.log(`[WS ${timestamp}] speaking_ended — force-clearing stuck speaking state`);
        if (audioEndFallbackRef.current) { clearTimeout(audioEndFallbackRef.current); audioEndFallbackRef.current = null; }
        talkingHeadRef.current?.streamStop();
        isPlayingRef.current = false;
        isAiSpeakingRef.current = false;
        setIsAiSpeaking(false);
        audioEndReceivedRef.current = true;
        // Bug C fix: forced unstick — playback is definitively over.
        candidatePlaybackEndedRef.current = true;
        setCandidatePlaybackEnded(true);
        avatarState.onAiStopSpeaking();
        saveAiMessage();
        if (!isRecordingRef.current && !isFaceBlockedRef.current && !isMutedRef.current) {
          setStatus("Your turn - speak now...");
          setTimeout(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN && !isAiSpeakingRef.current) {
              startRecordingInternal();
            }
          }, 800);
        }
        break;
      case "interrupted":
        // Backend cancelled current generation (e.g. skip_question during answer).
        // Stop any playing audio immediately and clear ALL state so the next
        // pipeline (skip question) starts from a clean slate.
        talkingHeadRef.current?.streamStop();
        isPlayingRef.current = false;
        isAiSpeakingRef.current = false;
        setIsAiSpeaking(false);
        setIsProcessing(false);
        isProcessingRef.current = false;
        avatarState.onAiStopSpeaking();
        pendingBuffersRef.current = 0;
        audioEndReceivedRef.current = false;
        if (audioEndFallbackRef.current) { clearTimeout(audioEndFallbackRef.current); audioEndFallbackRef.current = null; }
        if (startRecordingTimerRef.current) { clearTimeout(startRecordingTimerRef.current); startRecordingTimerRef.current = null; }
        stopRecordingSilentRef.current();
        // Clear question timer — skip will start a fresh one via on_speaking_done
        if (questionTimerIntervalRef.current) { clearInterval(questionTimerIntervalRef.current); questionTimerIntervalRef.current = null; }
        questionTimerPendingRef.current = null;
        setQuestionTimerSeconds(null);
        setQuestionTimerExpired(false);
        questionTimerExpiredRef.current = false;
        break;
      case "audio_end": {
        console.log(`[WS ${timestamp}] Audio end received, audio_duration_ms=${currentTurnAudioMsRef.current}`);
        // Backend finished SENDING audio — but TalkingHead may still be PLAYING it.
        // Do NOT call streamStop() here — that kills playback immediately.
        // Signal worklet that no more chunks are coming — it will fire playback-ended
        // after playing the remaining buffer (instead of waiting for 300ms silence timeout).
        // If no PCM chunks arrived (TTS error), clear the deferred streamStart so it
        // doesn't leak into the next turn.
        pendingStreamStartRef.current = null;
        setIsProcessing(false);
        audioEndReceivedRef.current = true;
        // Don't revealAllTokens() here — let text continue revealing gradually
        // at speaking pace. It will catch up naturally since all tokens are buffered.
        talkingHeadRef.current?.notifyEnd();
        // Safety-net: if TalkingHead's onAudioEnd callback doesn't fire, start the
        // mic manually so the interview doesn't hang.
        // Timeout = actual audio duration + 2500 ms buffer (minimum 4 s).
        // Using a fixed 3 s caused the fallback to fire MID-SPEECH for any Linda
        // response longer than ~2 s, opening the mic while she was still talking.
        const _fallbackDelayMs = Math.max(4000, currentTurnAudioMsRef.current + 2500);
        if (audioEndFallbackRef.current) clearTimeout(audioEndFallbackRef.current);
        audioEndFallbackRef.current = setTimeout(() => {
          audioEndFallbackRef.current = null;
          // Force-reset even if isAiSpeaking is still true — TalkingHead's onAudioEnd
          // may never fire (AudioContext suspended, GPU crash, etc.). Without this,
          // "Speaking..." stays stuck and all timers freeze.
          if (!isRecordingRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
            isPlayingRef.current = false;
            isAiSpeakingRef.current = false;
            setIsAiSpeaking(false);
            avatarState.onAiStopSpeaking();
            // Bug C fix: safety-net took over; treat as end-of-playback so
            // the "Your turn" banner can still surface.
            candidatePlaybackEndedRef.current = true;
            setCandidatePlaybackEnded(true);
            // Fix 3: echo guard on the safety-net path too.
            playbackEchoGuardUntilRef.current = Date.now() + PLAYBACK_ECHO_GUARD_MS;
            saveAiMessage();
            // Safety-net: also send playback_complete so backend isn't blocked
            // (twice, via sendPlaybackComplete, for drop resilience).
            sendPlaybackComplete();
            if (shouldDisconnectAfterAudioRef.current || isClosingRef.current) {
              setStatus("Interview completed. Thank you!");
              setTimeout(() => { disconnect(); }, 1500);
              return;
            }
            console.warn("[Safety-net] TalkingHead onAudioEnd never fired — starting mic manually");
            // Point 4: clarification ends when Linda stops speaking
            setIsClarification(false);
            isClarificationRef.current = false;
            setStatus("Your turn - speak now...");
            // Start pending timer in safety-net too
            const _sfPendingDur = questionTimerPendingRef.current;
            if (_sfPendingDur !== null) {
              questionTimerPendingRef.current = null;
              questionTimerReceivedAtRef.current = null;
              questionTimerTotalRef.current = _sfPendingDur;
              setQuestionTimerSeconds(_sfPendingDur);
              questionTimerSecondsRef.current = _sfPendingDur; // sync ref immediately
              if (questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current);
              questionTimerIntervalRef.current = setInterval(() => {
                // Per-question timer only pauses during clarification.
                if (isClarificationRef.current || isFullscreenExitedRef.current) return;
                setQuestionTimerSeconds(prev => {
                  if (prev === null || prev <= 1) {
                    if (questionTimerIntervalRef.current) { clearInterval(questionTimerIntervalRef.current); questionTimerIntervalRef.current = null; }
                    setTimeout(() => {
                      setQuestionTimerExpired(true); questionTimerExpiredRef.current = true;
                      setStatus("Time's up — moving to the next question...");
                      stopRecordingSilentRef.current();
                      if (wsRef.current?.readyState === WebSocket.OPEN && !backendExpiredRef.current) {
                        wsRef.current.send(JSON.stringify({ type: "skip_question", source: "timer_expired" }));
                      }
                    }, 0);
                    return 0;
                  }
                  return prev - 1;
                });
              }, 1000);
            }
            if (startRecordingTimerRef.current) clearTimeout(startRecordingTimerRef.current);
            startRecordingTimerRef.current = setTimeout(() => {
              startRecordingTimerRef.current = null;
              startRecordingInternal();
            }, 800);
          }
        }, _fallbackDelayMs);
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
      case "force_mic_off":
        // Hard 35-min stop — disable mic immediately, no further responses accepted
        isMicForceOffRef.current = true;
        stopRecordingSilentRef.current();
        if (startRecordingTimerRef.current) {
          clearTimeout(startRecordingTimerRef.current);
          startRecordingTimerRef.current = null;
        }
        setIsClosing(true);
        isClosingRef.current = true;
        setStatus("Interview time reached — ending now...");
        break;
      case "question_timer_started": {
        console.log(`[WS ${timestamp}] Question timer started:`, data);
        backendExpiredRef.current = false; // new question — reset backend-expired guard
        // Use data.seconds — the actual candidate answer window sent by the backend.
        // data.total_seconds is the full slot (e.g. 120s) but data.seconds is what
        // the backend's auto-skip is calibrated to, so they must match.
        const dur = data.seconds ?? data.total_seconds ?? data.duration_seconds ?? 120;
        // Fix 2: capture Linda's speech share so the UI can show the candidate
        // WHY they have less than the full 2-min slot.
        if (typeof data.linda_spoke_seconds === 'number') {
          setLindaSpokeSeconds(Math.round(data.linda_spoke_seconds));
        } else {
          setLindaSpokeSeconds(null);
        }
        if (typeof data.total_seconds === 'number') {
          setFullSlotSeconds(data.total_seconds);
        }
        console.log(`[WS ${timestamp}] Timer duration: ${dur}s, question_number=${data.question_number}, total_questions=${data.total_questions}, is_follow_up=${data.is_follow_up}, is_clarification=${data.is_clarification}`);
        // DON'T show the timer yet if Linda is still speaking — it will be shown
        // once Linda stops (via the pending timer useEffect below).
        setQuestionTimerExpired(false);
        questionTimerExpiredRef.current = false;
        // Classify this event:
        //  is_follow_up=true, is_clarification=true  → Linda clarifying; PAUSE per-Q timer
        //  is_follow_up=true, is_clarification=false → Linda ack/follow-up; keep timer running
        //  is_follow_up=false                        → new question; start fresh countdown
        const incomingQNum = data.question_number ?? null;
        const sameQuestion = incomingQNum !== null && incomingQNum === questionNumberRef.current;
        if (sameQuestion && data.is_follow_up === true) {
          // Follow-up / clarification: do NOT restart the timer. The main
          // question's 2-min slot is shared between Linda's follow-up and
          // the candidate's answer to it — the countdown must continue from
          // wherever it was, never jump back to the full duration. Only
          // sync DOWNWARD if the backend explicitly sends a value less than
          // what we're currently showing (genuine drift correction).
          if (data.total_questions != null) setTotalQuestions(data.total_questions);
          const _cur = questionTimerSecondsRef.current;
          if (dur > 0 && _cur != null && dur < _cur) {
            // Drift correction: backend is ahead of us, jump forward.
            setQuestionTimerSeconds(dur);
            questionTimerSecondsRef.current = dur;
          } else if (dur > 0 && _cur == null) {
            // Edge case: no running timer (e.g. reconnect). Start one.
            setQuestionTimerSeconds(dur);
            questionTimerSecondsRef.current = dur;
          }
          setIsFollowUp(true);
          if (data.is_clarification === true) {
            // Point 4: pause per-question timer during clarification
            setIsClarification(true);
            isClarificationRef.current = true;
            setStatus("Clarifying the question — timer paused");
          } else if (!questionTimerIntervalRef.current && dur > 0) {
            // Only (re)create an interval if none is running. Don't tear down
            // the main question's anchored interval — it's already counting
            // down correctly and jumping to a simple decrement would lose
            // the monotonic anchor.
            questionTimerIntervalRef.current = setInterval(() => {
              if (isClarificationRef.current || isFullscreenExitedRef.current) return;
              setQuestionTimerSeconds(prev => {
                if (prev === null || prev <= 1) {
                  if (questionTimerIntervalRef.current) {
                    clearInterval(questionTimerIntervalRef.current);
                    questionTimerIntervalRef.current = null;
                  }
                  setTimeout(() => {
                    setQuestionTimerExpired(true);
                    questionTimerExpiredRef.current = true;
                    setIsClarification(false);
                    isClarificationRef.current = false;
                    setShowSilenceBanner(false);
                    setSilenceCountdown(null);
                    if (silenceCountdownRef.current) { clearInterval(silenceCountdownRef.current); silenceCountdownRef.current = null; }
                    setStatus("Time's up — moving to the next question...");
                    setIsProcessing(false);
                    isProcessingRef.current = false;
                    clearNoResponseTimer();
                    stopRecordingSilentRef.current();
                    if (wsRef.current?.readyState === WebSocket.OPEN && !backendExpiredRef.current) {
                      wsRef.current.send(JSON.stringify({ type: "skip_question", source: "timer_expired" }));
                    }
                  }, 0);
                  return 0;
                }
                return prev - 1;
              });
            }, 1000);
          }
          // Keep active skill highlight — same skill, follow-up question
          // Update is_follow_up flag on the active skill if backend tells us which one
          if (data.current_cluster_id && data.current_skill) {
            setSkillCoverage(prev => {
              if (!prev?.clusters) return prev;
              return {
                ...prev,
                clusters: prev.clusters.map(c => ({
                  ...c,
                  skills: c.skills.map(s => ({
                    ...s,
                    is_follow_up:
                      c.cluster_id === data.current_cluster_id && s.skill === data.current_skill
                        ? true
                        : s.is_follow_up,
                  })),
                })),
              };
            });
          }
          break;
        }
        // New question — clear clarification + follow-up, start fresh countdown
        setIsClarification(false);
        isClarificationRef.current = false;
        setIsFollowUp(false);

        // Clamp question number — never exceed totalQuestions (safety net for Q15 follow-up edge cases)
        if (incomingQNum != null) setQuestionNumber(Math.min(incomingQNum, totalQuestions ?? incomingQNum));
        if (data.total_questions != null) setTotalQuestions(data.total_questions);

        // Mark which skill is now being asked — backend sends current_cluster_id + current_skill
        // This fires immediately when the question starts, before skill_coverage_update arrives.
        if (data.current_cluster_id && data.current_skill) {
          setSkillCoverage(prev => {
            if (!prev?.clusters) return prev;
            return {
              ...prev,
              clusters: prev.clusters.map(c => ({
                ...c,
                is_active: c.cluster_id === data.current_cluster_id,
                current_skill: c.cluster_id === data.current_cluster_id ? data.current_skill : undefined,
                skills: c.skills.map(s => ({
                  ...s,
                  is_active: c.cluster_id === data.current_cluster_id && s.skill === data.current_skill,
                  is_follow_up: false,
                  question_number:
                    c.cluster_id === data.current_cluster_id && s.skill === data.current_skill
                      ? (incomingQNum ?? s.question_number)
                      : s.question_number,
                })),
              })),
            };
          });
        }

        // Point 3: snap global timer to question-number-anchored value
        if (data.global_remaining_seconds != null && data.global_remaining_seconds > 0) {
          setRemainingSeconds(data.global_remaining_seconds);
        }

        if (questionTimerIntervalRef.current) {
          clearInterval(questionTimerIntervalRef.current);
          questionTimerIntervalRef.current = null;
        }
        if (isAiSpeakingRef.current) {
          // Linda is still speaking — store duration and wait until she stops.
          // Do NOT display the timer yet: candidate wants it to surface ONLY
          // after Linda finishes her question. handleAllAudioFinished reads
          // questionTimerPendingRef at the true end-of-audio and starts the
          // visible countdown from that exact moment.
          console.log(`[Timer ${timestamp}] Linda still speaking, storing pending timer: ${dur}s`);
          questionTimerPendingRef.current = dur;
          questionTimerTotalRef.current = dur;
          questionTimerReceivedAtRef.current = Date.now();
        } else {
          console.log(`[Timer ${timestamp}] Linda not speaking, starting timer immediately: ${dur}s`);
          questionTimerPendingRef.current = null;
          questionTimerReceivedAtRef.current = null;
          questionTimerTotalRef.current = dur;
          // Fix 1: anchor this countdown to a monotonic timestamp so it cannot
          // drift vs. the backend's time.monotonic() timer.
          questionTimerStartedAtMsRef.current = performance.now();
          questionTimerPausedMsRef.current = 0;
          questionTimerPausedAtRef.current = null;
          // User spec: per-question timer ticks throughout the candidate's
          // turn (including silence nudge), not just when they actually
          // speak. Awaiting-speech gate removed so the 2-min slot counts
          // down continuously from the moment Linda stops.
          questionTimerAwaitingSpeechRef.current = false;
          setQuestionTimerSeconds(dur);
          questionTimerIntervalRef.current = setInterval(() => {
            // Per-question timer runs CONTINUOUSLY once the question starts.
            // Allowed pauses:
            //   - clarification (Linda re-explaining a question)
            //   - fullscreen exit (interview frozen behind the blocker)
            // Acks, follow-ups, and next-question TTS all keep the clock
            // running so the displayed value stays in sync with the
            // backend's monotonic per-question timer AND the global timer.
            if (isClarificationRef.current || isFullscreenExitedRef.current || questionTimerAwaitingSpeechRef.current) {
              // Enter pause bookkeeping once so cumulative paused time is correct.
              if (questionTimerPausedAtRef.current === null) {
                questionTimerPausedAtRef.current = performance.now();
              }
              return;
            }
            // Exiting a pause: fold the pause duration into the accumulator.
            if (questionTimerPausedAtRef.current !== null) {
              questionTimerPausedMsRef.current += performance.now() - questionTimerPausedAtRef.current;
              questionTimerPausedAtRef.current = null;
            }
            const remaining = computeQuestionRemaining();
            if (remaining === null) return;
            setQuestionTimerSeconds(remaining);
            if (remaining <= 0) {
              if (questionTimerIntervalRef.current) {
                clearInterval(questionTimerIntervalRef.current);
                questionTimerIntervalRef.current = null;
              }
              setTimeout(() => {
                setQuestionTimerExpired(true);
                questionTimerExpiredRef.current = true;
                setIsClarification(false);
                isClarificationRef.current = false;
                setShowSilenceBanner(false);
                setSilenceCountdown(null);
                if (silenceCountdownRef.current) { clearInterval(silenceCountdownRef.current); silenceCountdownRef.current = null; }
                setStatus("Time's up — moving to the next question...");
                setIsProcessing(false);
                isProcessingRef.current = false;
                clearNoResponseTimer();
                stopRecordingSilentRef.current();
                if (wsRef.current?.readyState === WebSocket.OPEN && !backendExpiredRef.current) {
                  wsRef.current.send(JSON.stringify({ type: "skip_question", source: "timer_expired" }));
                }
              }, 0);
            }
          }, 1000);
        }
        break;
      }
      case "question_timer_stopped":
        // Candidate ended their turn — clear the per-question timer.
        // Backend fires this after end_turn before starting the next Q's timer.
        if (questionTimerIntervalRef.current) {
          clearInterval(questionTimerIntervalRef.current);
          questionTimerIntervalRef.current = null;
        }
        setQuestionTimerSeconds(null);
        questionTimerSecondsRef.current = null;
        questionTimerPendingRef.current = null;
        questionTimerReceivedAtRef.current = null;
        break;
      case "question_timer_expired":
        backendExpiredRef.current = true; // backend already handling skip — don't send client skip_question
        setQuestionTimerExpired(true);
        questionTimerExpiredRef.current = true;
        setQuestionTimerSeconds(0);
        if (questionTimerIntervalRef.current) {
          clearInterval(questionTimerIntervalRef.current);
          questionTimerIntervalRef.current = null;
        }
        // Clear clarification and silence countdown — question is advancing
        setIsClarification(false);
        isClarificationRef.current = false;
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
          clusters: data.clusters ?? [],  // NEW: all clusters for live panel
        });
        break;
      case "silence_detected": {
        // Backend detected 8 s of silence. Show a banner telling the candidate
        // Linda is about to prompt them. The BACKEND drives the actual auto-skip
        // via its Phase 2 flow (Linda says "Are you there?" → 5 s wait → send
        // question_timer_expired). We previously ran our OWN 5 s countdown here
        // and sent skip_question — that raced with Linda's TTS and caused
        // multiple "Are you there?" messages to stack up because the client
        // skipped before she finished speaking.
        //
        // Banner is dismissed by:
        //   - speaking_started  (candidate responded)
        //   - speaking_started from backend for Linda's silence nudge (covered
        //     below in the interstitial_prompt/speaking_started handlers)
        //   - question_timer_expired (backend auto-skip completed)
        //   - X button in the banner itself
        isSilencePromptRef.current = true; // Linda's "Are you there?" — timer must keep running
        setShowSilenceBanner(true);
        setSilenceCountdown(null); // no client-side countdown; backend drives it
        if (silenceBannerTimerRef.current) clearTimeout(silenceBannerTimerRef.current);
        if (silenceCountdownRef.current) {
          clearInterval(silenceCountdownRef.current);
          silenceCountdownRef.current = null;
        }
        // Kill the client-side no-response timer — the BACKEND is now driving
        // the silence flow. If we leave the 15 s client timer armed it races
        // with the backend's interstitial_prompt and produces a duplicate
        // "Are you there?" via handleNoResponse → speakViaTTS.
        clearNoResponseTimer();
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
        // Show the official completion message (Req 16) — but ONLY after
        // Linda's farewell has finished playing. Backend sends this event
        // immediately after `interview_ended` without waiting for TTS
        // playback to drain. If we flip the modal on now, it appears while
        // Linda is still audibly speaking. Defer via pendingCompletionModalRef
        // which finalizePlayback flushes at the true end-of-audio.
        setCompletionMessage(data.message || "Thank you for completing the interview. Your responses have been recorded successfully.");
        if (candidatePlaybackEndedRef.current) {
          setShowCompletionModal(true);
        } else {
          pendingCompletionModalRef.current = true;
        }
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
        setIsClosing(true); isClosingRef.current = true;
        // Disconnect ONLY if finalizePlayback has already confirmed the
        // true end of audio (candidatePlaybackEndedRef === true). The
        // flags isPlayingRef / isAiSpeakingRef can go false prematurely
        // during the TalkingHead-fires-early path, but
        // candidatePlaybackEndedRef only flips true inside
        // finalizePlayback — which itself runs AT the wall-clock end of
        // playback (firstPcmAt + audioMs). If it hasn't run yet, leave
        // the disconnect to finalizePlayback (it reads the flags we just
        // set) or to the safety-net fallback. This is what prevents the
        // session from closing mid-farewell.
        if (candidatePlaybackEndedRef.current) {
          setTimeout(() => { disconnect(); }, 500);
        }
        break;
      case "interview_complete":
        // Server-side forced completion (e.g., post-closing turn limit or
        // end of Q15). Same guard as interview_ended: only disconnect
        // immediately if finalizePlayback has already run — otherwise the
        // closing flags will be picked up by finalizePlayback when the
        // real end-of-audio fires. This is what keeps Linda's farewell
        // from being cut off mid-sentence.
        setIsClosing(true); isClosingRef.current = true;
        shouldDisconnectAfterAudioRef.current = true;
        setStatus("Interview completed. Thank you!");
        if (candidatePlaybackEndedRef.current) {
          setTimeout(() => { disconnect(); }, 500);
        }
        break;
      case "auto_disconnect":
        // Server signals that results are saved and the session should close.
        // Same candidatePlaybackEndedRef guard as interview_ended/
        // interview_complete: only disconnect here if finalizePlayback has
        // already confirmed the true end of audio. Otherwise the flags set
        // here will be picked up by finalizePlayback when audio really ends.
        setIsClosing(true); isClosingRef.current = true;
        shouldDisconnectAfterAudioRef.current = true;
        if (candidatePlaybackEndedRef.current) {
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
      // AIU39: Skip accepted/rejected responses
      case "skip_accepted":
        setSkipCount(prev => prev + 1);
        setIsFollowUp(false);
        // Optimistically clear active highlights on skill panel — same as Next Q handler
        setSkillCoverage(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            clusters: prev.clusters?.map(c => ({
              ...c,
              is_active: false,
              current_skill: undefined,
              skills: c.skills.map(s => ({ ...s, is_active: false })),
            })),
          };
        });
        toast.success('Question skipped');
        break;
      case "skip_rejected":
        toast.error(data.reason || 'Skip not allowed at this time');
        break;

      // AIU40: Section transition — show full-screen overlay for 3 seconds
      case "section_transition":
        setSectionTransition({
          message: data.message || '',
          fromCluster: data.from_cluster || '',
          toCluster: data.to_cluster || data.cluster || '',
        });
        break;

      // AIU52: Full coverage map update
      case "coverage_map_update":
        if (data.coverage_map) {
          setCoverageMap(data.coverage_map);
        }
        break;

      // AIU51: IDK/Unclear detected — brief info toast
      case "idk_detected":
        toast.info('Response recorded, moving on');
        break;

      // AIU72: Unclear speech — brief info toast
      case "unclear_speech":
        toast.info('Could not clearly hear your response — please try again');
        break;

      // AIU72: Repeat request — show overlay asking candidate to repeat
      case "repeat_request":
        setShowRepeatRequest(true);
        // Auto-dismiss after 4 seconds
        setTimeout(() => setShowRepeatRequest(false), 4000);
        break;

      case "error":
        setStatus(`Error: ${data.message}`);
        break;
    }
  }, [saveAiMessage, avatarState, startRevealingTokens, stopRevealingTokens, revealAllTokens]);

  // Keep callback refs in sync (avoids WebSocket reconnect on re-renders)
  useEffect(() => { queueAudioRef.current = queueAudio; }, [queueAudio]);
  useEffect(() => { trackPlaybackChunkRef.current = trackPlaybackChunk; }, [trackPlaybackChunk]);
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

  // Recording
  const stopRecording = useCallback(() => {
    const timestamp = new Date().toISOString();
    console.log(`[Recording ${timestamp}] stopRecording called: isRecording=${isRecordingRef.current}, speechDetected=${speechDetectedRef.current}`);
    if (!isRecordingRef.current) return;

    // Capture speech detection state BEFORE the ref is reset below.
    // VAD only calls stopRecording from the speech-detected branch, but this
    // guard also covers edge cases (disconnect during silence, timer expiry, etc.)
    // where the function is invoked without confirmed speech.
    const hadSpeech = speechDetectedRef.current;

    isRecordingRef.current = false;
    console.log(`[Recording ${timestamp}] Recording stopped, hadSpeech=${hadSpeech}`);
    setIsRecording(false);
    // Freeze the question-timer value at this exact moment so the response bubble
    // can display how much time was left when the candidate finished speaking.
    frozenResponseTimeRef.current = questionTimerSecondsRef.current;
    avatarState.onUserStopSpeaking();
    silenceStartRef.current = null;
    speechDetectedRef.current = false;
    speechDetectedAtRef.current = null;
    stopWebSpeechRecognition();
    clearNoResponseTimer();
    clearMaxRecordingTimer();
    // NOTE: don't clear currentTranscript here — keep the live transcript visible
    // until the backend's `transcript` event arrives and adds the final message.
    // This prevents the chat from appearing empty during the processing gap.

    // No real speech this turn — stop silently instead of sending end_turn.
    // Sending end_turn without speech makes Whisper process silence/noise and
    // return hallucinated text that would be incorrectly saved as the answer.
    if (!hadSpeech) {
      setCurrentTranscript(""); // clear immediately — no speech, nothing to keep showing
      voiceVerifBufferRef.current = [];
      setTimeout(() => {
        mediaStreamRef.current?.getTracks().forEach(t => t.stop());
        processorRef.current?.disconnect();
        processorRef.current = null;
      }, 100);
      return;
    }

    const remainingFinalized = webSpeechFinalizedRef.current.slice(liveBatchSentCharsRef.current).trim();
    if (remainingFinalized && (isFlexibleMode || isNewFlexibleMode)) {
      sendLiveTranscriptBatch(remainingFinalized, "candidate_stop");
      liveBatchSentCharsRef.current = webSpeechFinalizedRef.current.length;
    }

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
      isProcessingRef.current = true; // set ref synchronously so global timer pauses immediately
      setIsProcessing(true);
      avatarState.onProcessing();
      // Global timer pauses during processing (isProcessingRef.current = true above),
      // so no manual deduction needed here — the timer already stopped ticking.

      // Stop the per-question countdown interval — candidate answered.
      // Keep the state (questionTimerSeconds) showing the frozen last value so the
      // candidate can still see the timer while the backend processes their answer.
      // A fresh question_timer_started will reset it when Linda asks the next question.
      if (questionTimerIntervalRef.current) {
        clearInterval(questionTimerIntervalRef.current);
        questionTimerIntervalRef.current = null;
      }
      // In timed mode: always consume the full 2-min slot from the global timer,
      // even if the candidate answered early. Deduct whatever per-question time
      // is still remaining so the global budget is correct for the next question.
      // (e.g. answered in 30s → 90s still on the clock → deduct 90s now so
      //  global goes 29:30 → 28:00 and Q2 starts cleanly at 28:00)
      if (!isFlexibleMode && !isNewFlexibleMode && questionTimerSecondsRef.current !== null && questionTimerSecondsRef.current > 0) {
        setRemainingSeconds(prev => Math.max(0, prev - questionTimerSecondsRef.current!));
      }
      // Clear the ref immediately (logic gating) but NOT the state (display) —
      // keeping state non-null shows the frozen timer while processing.
      // If the backend sends question_timer_started for Q2 before React re-renders,
      // the null ref prevents a double deduction.
      questionTimerSecondsRef.current = null;
      setQuestionTimerExpired(false);
      questionTimerExpiredRef.current = false;
      questionTimerPendingRef.current = null;
      questionTimerReceivedAtRef.current = null;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "end_turn" }));
      }
    }, 100);
  }, [avatarState, stopWebSpeechRecognition, clearNoResponseTimer, clearMaxRecordingTimer, voiceVerification, isFlexibleMode, isNewFlexibleMode, sendLiveTranscriptBatch]);

  // Stop recording silently — used for timer expiry, face block, mute.
  // If candidate was mid-answer (speech detected), sends end_turn so their
  // partial answer is captured and processed by the backend (never dropped).
  const stopRecordingSilent = useCallback(() => {
    if (!isRecordingRef.current) return;
    // Capture BEFORE resetting — determines whether audio was being recorded
    const hadSpeech = speechDetectedRef.current;
    isRecordingRef.current = false;
    setIsRecording(false);
    avatarState.onUserStopSpeaking();
    silenceStartRef.current = null;
    speechDetectedRef.current = false;
    speechDetectedAtRef.current = null;
    postSpeechNoiseCountRef.current = 0;
    stopWebSpeechRecognition();
    clearNoResponseTimer();
    clearMaxRecordingTimer();

    if (hadSpeech) {
      const remainingFinalized = webSpeechFinalizedRef.current.slice(liveBatchSentCharsRef.current).trim();
      if (remainingFinalized && (isFlexibleMode || isNewFlexibleMode)) {
        sendLiveTranscriptBatch(remainingFinalized, "candidate_stop");
        liveBatchSentCharsRef.current = webSpeechFinalizedRef.current.length;
      }
      // Candidate was mid-answer: capture timer snapshot, keep transcript visible,
      // and send end_turn so Whisper processes their audio (never silently discard).
      frozenResponseTimeRef.current = questionTimerSecondsRef.current;
      voiceVerifBufferRef.current = [];
      setTimeout(() => {
        mediaStreamRef.current?.getTracks().forEach(t => t.stop());
        processorRef.current?.disconnect();
        processorRef.current = null;
        setStatus("Processing...");
        isProcessingRef.current = true;
        setIsProcessing(true);
        avatarState.onProcessing();
        // Stop per-question countdown (answer complete)
        if (questionTimerIntervalRef.current) {
          clearInterval(questionTimerIntervalRef.current);
          questionTimerIntervalRef.current = null;
        }
        // Deduct remaining slot from global timer (same as normal stopRecording)
        if (!isFlexibleMode && !isNewFlexibleMode && questionTimerSecondsRef.current !== null && questionTimerSecondsRef.current > 0) {
          setRemainingSeconds(prev => Math.max(0, prev - questionTimerSecondsRef.current!));
        }
        questionTimerSecondsRef.current = null;
        setQuestionTimerExpired(false);
        questionTimerExpiredRef.current = false;
        questionTimerPendingRef.current = null;
        questionTimerReceivedAtRef.current = null;
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "end_turn" }));
        }
      }, 100);
      return;
    }

    // No speech detected: silent discard — clear transcript and stop cleanly
    setCurrentTranscript("");
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    processorRef.current?.disconnect();
    processorRef.current = null;
  }, [avatarState, stopWebSpeechRecognition, clearNoResponseTimer, clearMaxRecordingTimer, isFlexibleMode, isNewFlexibleMode, sendLiveTranscriptBatch]);

  // Mute toggle — fully stops/restarts recording + Web Speech Recognition.
  // Disabling track.enabled alone doesn't mute the browser's SpeechRecognition API
  // which has independent mic access, so we must stop recording entirely on mute.
  const toggleMute = useCallback(() => {
    const next = !isMutedRef.current;
    isMutedRef.current = next;
    setIsMuted(next);
    if (next) {
      // MUTE: stop everything — no audio should be captured or sent
      stopRecordingSilentRef.current();
      stopWebSpeechRecognition();
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
      }
    } else {
      // UNMUTE: re-enable tracks and restart recording
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getAudioTracks().forEach(t => { t.enabled = true; });
      }
      if (!isAiSpeakingRef.current && !isProcessingRef.current && !isRecordingRef.current && !isFaceBlockedRef.current) {
        setTimeout(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN && !isMutedRef.current) {
            startRecordingInternal();
          }
        }, 300);
      }
    }
  }, [stopWebSpeechRecognition]);

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
    const timestamp = new Date().toISOString();
    console.log(`[Recording ${timestamp}] startRecordingInternal called: isAiSpeaking=${isAiSpeakingRef.current}, isProcessing=${isProcessingRef.current}, isRecording=${isRecordingRef.current}, isFaceBlocked=${isFaceBlockedRef.current}`);
    // Use refs — NOT state values — because this function is called from stale
    // closures (useCallback, setTimeout) where isAiSpeaking/isProcessing are stale.
    if (isAiSpeakingRef.current || isProcessingRef.current || isRecordingRef.current) {
      console.log(`[Recording ${timestamp}] startRecordingInternal blocked by state`);
      return;
    }
    if (isFaceBlockedRef.current) {
      console.log(`[Recording ${timestamp}] startRecordingInternal blocked by face detection`);
      return;
    }
    if (isMutedRef.current) {
      console.log(`[Recording ${timestamp}] startRecordingInternal blocked by mute`);
      return;
    }
    if (isMicForceOffRef.current) {
      console.log(`[Recording ${timestamp}] startRecordingInternal blocked by force_mic_off`);
      return;
    }
    // Mark recording as active immediately — before any async operations.
    // Prevents a second concurrent call from passing the guard above and
    // attempting to re-register 'pcm-processor' on the same AudioContext,
    // which throws NotSupportedError (processors can only be registered once).
    isRecordingRef.current = true;
    console.log(`[Recording ${timestamp}] Starting recording...`);
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

      // Use native sample rate — 16kHz AudioContext causes silent worklets on some browsers.
      // Downsampling to 16kHz is done manually before sending to backend.
      if (!recordingContextRef.current || recordingContextRef.current.state === 'closed') {
        try {
          recordingContextRef.current = new AudioContext();
        } catch (err) {
          console.error('[InterviewUI] Failed to create recording AudioContext:', err);
          setStatus("Audio device error - please refresh");
          return;
        }
        pcmWorkletRegisteredRef.current = false;
      }
      const ctx = recordingContextRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      console.log(`[InterviewUI] AudioContext: rate=${ctx.sampleRate}, state=${ctx.state}`);

      const source = ctx.createMediaStreamSource(stream);

      // Downsample to 16kHz for the backend (hardware rate is typically 44.1/48kHz)
      const targetSampleRate = 16000;
      const downsampleRatio = ctx.sampleRate / targetSampleRate;

      silenceStartRef.current = null;
      speechDetectedRef.current = false;
      speechDetectedAtRef.current = null;
      speechStartSentRef.current = false;
      speechFrameCountRef.current = 0;
      postSpeechNoiseCountRef.current = 0;
      // Suppress VAD for the first VAD_WARMUP_MS after mic opens.
      // Gives the echo canceller time to calibrate so Linda's TTS echo doesn't
      // immediately register as candidate speech.
      vadWarmupUntilRef.current = Date.now() + VAD_WARMUP_MS;

      // Signal to backend that the candidate's mic will be effectively listening
      // once VAD warmup ends. Backend's 8 s silence clock waits on this event so
      // the candidate gets a real 8 s of thinking time, not 8 s minus mic-open
      // (~800 ms) minus VAD warmup (~600 ms).
      const micListeningDelayMs = VAD_WARMUP_MS + 50; // +50 ms jitter margin
      setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN && isRecordingRef.current) {
          wsRef.current.send(JSON.stringify({ type: 'mic_listening' }));
        }
      }, micListeningDelayMs);

      // ── Shared audio processing (VAD + PCM encode + WS send) ──────────────
      // Defined once, called by both AudioWorklet and ScriptProcessor paths.
      const processAudioChunk = (input: Float32Array) => {
        if (!isRecordingRef.current) return;
        if (isMutedRef.current) return;

        // Collect raw audio at native sample rate for voice verification
        if (voiceVerification?.hasBaseline()) {
          voiceVerifBufferRef.current.push(new Float32Array(input));
        }

        // Compute average absolute amplitude
        let sum = 0;
        for (let i = 0; i < input.length; i++) { sum += Math.abs(input[i]); }
        const avgLevel = sum / input.length;

        // Skip empty frames — AudioWorklet can produce zero-filled frames
        if (avgLevel < 0.0001) return;

        // During warmup period, capture audio (echo canceller calibrates) but
        // do NOT run VAD — Linda's TTS echo may still be present in these frames.
        if (Date.now() < vadWarmupUntilRef.current) return;
        // Fix 3 (revised): the echo guard and "Linda still speaking" check
        // must NOT `return` — that drops the PCM send block at the bottom of
        // this function and silently kills candidate audio. Instead, fold
        // them into a flag that gates only NEW speech_started detection. Once
        // speech is in progress, frames keep flowing so the candidate's
        // answer reaches the backend.
        // Suppress new speech detection during ANY Linda speech, including
        // the silence nudge. Per spec: candidate's response must only be
        // captured AFTER "Are you there?" finishes speaking.
        const suppressNewSpeechDetection =
          Date.now() < playbackEchoGuardUntilRef.current ||
          isAiSpeakingRef.current;

        // Log every 20th frame to confirm audio is flowing
        speechFrameCountRef.current;
        if (Math.random() < 0.05) {
          console.log(`[VAD] level=${avgLevel.toFixed(4)} thresh=${silenceThresholdRef.current} speech=${speechDetectedRef.current}`);
        }

        // Speech detection: require MIN_SPEECH_FRAMES consecutive frames above threshold
        if (avgLevel > silenceThresholdRef.current) {
          speechFrameCountRef.current++;
          if (!speechDetectedRef.current) {
            // Pre-confirmation: reset silence start (not yet in silence tracking mode)
            silenceStartRef.current = null;
            // Fix 3 (revised): only block the speechDetected transition while
            // the echo guard is up or Linda is still speaking. Frame counting
            // continues so a real answer that starts during the guard window
            // is still picked up the moment the guard lifts.
            if (speechFrameCountRef.current >= MIN_SPEECH_FRAMES && !suppressNewSpeechDetection) {
              speechDetectedRef.current = true;
              speechDetectedAtRef.current = Date.now();
              postSpeechNoiseCountRef.current = MIN_RESPEECH_FRAMES; // start confirmed
              // Unfreeze the per-question timer on VAD-confirmed speech as well.
              questionTimerAwaitingSpeechRef.current = false;
              if (!speechStartSentRef.current) {
                speechStartSentRef.current = true;
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                  wsRef.current.send(JSON.stringify({ type: "speech_started" }));
                }
              }
              clearNoResponseTimer();
              noResponseRetryRef.current = 0;
            }
          } else {
            // Speech already confirmed — need MIN_RESPEECH_FRAMES consecutive frames
            // above threshold to reset silence timer (prevents noise spikes from
            // restarting the countdown after the user actually stops talking)
            postSpeechNoiseCountRef.current++;
            if (postSpeechNoiseCountRef.current >= MIN_RESPEECH_FRAMES) {
              silenceStartRef.current = null; // real speech resuming
            }
          }
        } else {
          postSpeechNoiseCountRef.current = 0; // below threshold → reset noise counter
          if (!speechDetectedRef.current) {
            // Not yet confirmed — reset counter
            speechFrameCountRef.current = 0;
          } else {
            // Speech confirmed — track silence for end-of-turn
            if (silenceStartRef.current === null) {
              silenceStartRef.current = Date.now();
            } else if (Date.now() - silenceStartRef.current > silenceDurationMsRef.current) {
              // Conversational mode: do not end the turn too early after the first
              // detected speech. This prevents a brief pause inside an answer from
              // immediately closing the turn and moving Linda to the next question.
              const speechAgeMs =
                speechDetectedAtRef.current == null ? 0 : Date.now() - speechDetectedAtRef.current;
              if ((isFlexibleMode || isNewFlexibleMode) && speechAgeMs < 2000) {
                return;
              }
              stopRecording();
              return;
            }
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

        // Only forward audio once speech is detected — sending silence/noise
        // causes Whisper to hallucinate prompt text as the transcript.
        // Uses simple fixed threshold (no adaptive calibration) so speech is
        // reliably detected even in noisy environments.
        //
        // Block PCM transmission while Linda is speaking at all — including
        // during the "Are you there?" silence nudge. Per spec: candidate's
        // response must only be captured AFTER the nudge finishes, so even
        // if the mic is open, no audio frames should reach the backend
        // while Linda is mid-prompt.
        const lindaHoldingTurn = isAiSpeakingRef.current;
        if (
          speechDetectedRef.current &&
          !lindaHoldingTurn &&
          wsRef.current?.readyState === WebSocket.OPEN
        ) {
          const pcm = new Int16Array(samples.length);
          for (let i = 0; i < samples.length; i++) {
            pcm[i] = Math.max(-32768, Math.min(32767, samples[i] * 32768));
          }
          wsRef.current.send(pcm.buffer);
        }
      };

      // ── AudioWorklet (primary) → ScriptProcessor (fallback) ───────────────
      // AudioWorklet runs off the main thread — no UI jank during recording.
      // ScriptProcessor is deprecated but kept as fallback for older browsers.
      let audioNodeConnected = false;

      if (ctx.audioWorklet) {
        try {
          // Register pcm-processor only once per AudioContext.
          // AudioWorklet processors can only be registered once — calling addModule
          // again on the same context throws NotSupportedError.
          if (!pcmWorkletRegisteredRef.current) {
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
            pcmWorkletRegisteredRef.current = true;
          }

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
      setIsRecording(true);
      avatarState.onUserStartSpeaking();
      setStatus(`Listening... (auto-stops after ${silenceDurationMsRef.current / 1000}s silence)`);
      startWebSpeechRecognition();

      // No-response detection — fire after 15s of total silence with no speech.
      // If candidate hasn't spoken, ask "Are you there?" then skip after another 15s.
      clearNoResponseTimer();
      noResponseTimerRef.current = setTimeout(() => {
        if (!speechDetectedRef.current && isRecordingRef.current) {
          handleNoResponseRef.current();
        }
      }, 15000);

      // Hard cap: fixed/timed mode stays short to avoid endless recording, but
      // conversational mode must allow long answers without cutting the candidate off.
      const maxRecordingMs = (isFlexibleMode || isNewFlexibleMode) ? 120000 : 30000;
      clearMaxRecordingTimer();
      maxRecordingTimerRef.current = setTimeout(() => {
        if (isRecordingRef.current) {
          console.log(`[VAD] Max recording duration (${maxRecordingMs}ms) reached — stopping`);
          stopRecording();
        }
      }, maxRecordingMs);
    } catch (err: any) {
      // Reset recording flag — we set it early to prevent races; undo on failure.
      isRecordingRef.current = false;
      setIsRecording(false);
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
    const wasCompleted = isClosingRef.current || shouldDisconnectAfterAudioRef.current;

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

    if (wasCompleted) {
      // Exit fullscreen if active (uses cross-browser utility)
      try { exitFullscreen(); } catch {}
      // Notify parent to redirect to completion screen
      onInterviewComplete?.();
    }
  }, [stopRecording, clearNoResponseTimer, stopVisemeLoop, onInterviewComplete]);

  /**
   * Send text to backend for TTS synthesis via WebSocket (uses Nova voice).
   * Falls back to a silent timeout if the WebSocket is not connected.
   */
  const speakViaTTS = useCallback((text: string, onDone: () => void) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      speakTextCallbackRef.current = onDone;
      // Sync ref synchronously — ref-based guards (startRecordingInternal, question-timer)
      // must see speaking=true immediately so they don't race before React commits state.
      isAiSpeakingRef.current = true;
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
    // If the backend is already driving the silence-nudge flow (silence_detected
    // was received and interstitial_prompt is playing), skip the client-side
    // "Are you there?" to avoid stacking duplicate prompts.
    if (isSilencePromptRef.current) return;

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

      // Mark this as a silence prompt so the question timer keeps ticking
      // while Linda asks "Are you there?" (her speaking time counts against
      // the candidate's answer window). Auto-reset at line 569 when speaking ends.
      isSilencePromptRef.current = true;

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
      const timestamp = new Date().toISOString();
      console.log(`[WS ${timestamp}] WebSocket connected successfully`);
      setIsConnected(true);
      // Immediate feedback so the candidate sees SOMETHING while the backend's
      // LLM greeting + TTS warms up (can take 2-4s). Without this the chat
      // sits blank and the candidate thinks the page is frozen — which is
      // exactly the "first message appears late" complaint.
      setStatus("Linda is joining your interview...");
      isAiSpeakingRef.current = true;
      setIsAiSpeaking(true);
      reconnectAttemptsRef.current = 0;
      // Keepalive ping every 5 s — prevents proxy/nginx from closing idle connections
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'ping' }));
        }
      }, 5000);
    };
    ws.onclose = (event) => {
      const timestamp = new Date().toISOString();
      console.log(`[WS ${timestamp}] WebSocket closed: code=${event.code}, reason=${event.reason}`);
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
        // Unexpected disconnection (tab switch, network glitch) — auto-reconnect
        flushProctoringEventsRef.current?.().catch(() => {});
        stopRecordingSilentRef.current();
        if (reconnectAttemptsRef.current < 5) {
          reconnectAttemptsRef.current++;
          // Exponential backoff: 2s, 3s, 5s, 8s, 13s
          const delays = [2000, 3000, 5000, 8000, 13000];
          const delay = delays[Math.min(reconnectAttemptsRef.current - 1, delays.length - 1)];
          setStatus(`Connection lost — reconnecting in ${Math.round(delay / 1000)}s... (attempt ${reconnectAttemptsRef.current}/5)`);
          setTimeout(() => {
            if (!isUnmountedRef.current && !isClosingRef.current) {
              connectRef.current();
            }
          }, delay);
        } else {
          setStatus("Connection lost. Please refresh the page to continue.");
          uploadRecording().catch(() => {});
        }
      }
      stopRecording();
    };
    ws.onerror = (error) => {
      const timestamp = new Date().toISOString();
      console.error(`[WS ${timestamp}] WebSocket error:`, error);
      setStatus("Connection error - please refresh");
    };
    // Use refs so handlers always call the latest version without reconnecting
    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        console.log(`[WS ${new Date().toISOString()}] Audio chunk received: size=${event.data.byteLength} bytes`);
        // CRITICAL: call our bookkeeping (queueAudio + trackPlaybackChunk)
        // BEFORE streamAudio. TalkingHead's streamAudio transfers/detaches the
        // ArrayBuffer internally (postMessage to an AudioWorklet), so any
        // consumer that runs AFTER it sees byteLength=0 and counts zero
        // duration. That's what made currentTurnAudioMs stall at ~500ms and
        // made the reveal loop paint to 85% cap instantly.
        // Take a copy first so streamAudio still gets a valid buffer.
        const pcmCopy = event.data.slice(0);
        queueAudioRef.current(pcmCopy);
        trackPlaybackChunkRef.current(pcmCopy);
        // On the first chunk of each turn: call streamStart now that the buffer is non-empty.
        // Deferred from speaking_started to avoid TalkingHead firing onAudioEnd immediately
        // on Q1 (cold AudioContext / empty buffer race condition).
        if (pendingStreamStartRef.current) {
          const cb = pendingStreamStartRef.current;
          pendingStreamStartRef.current = null;
          talkingHeadRef.current?.streamStart(24000, cb);
        }
        // TalkingHead handles audio playback (gain:1) AND lip sync natively.
        // Now safe to pass the original — we've already copied the data.
        talkingHeadRef.current?.streamAudio(event.data);
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

  // Fallback: if avatar hasn't signalled ready within 35 s, unblock the WebSocket anyway.
  // The showAvatar timeout in TalkingHeadAvatar is 20 s; we give extra buffer for slower
  // connections loading avatar assets before falling back to headless mode.
  useEffect(() => {
    const fallback = setTimeout(() => {
      if (!avatarReady) {
        console.warn('[InterviewUI] Avatar load timeout — connecting WebSocket without avatar');
        setAvatarReady(true);
      }
    }, 35000);
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

  // Auto-scroll.
  // Also triggers when a bottom-anchored banner toggles on/off so the chat
  // reflows cleanly — without this, toggling the "Your turn" banner from hidden
  // to visible changes the chat's bottom padding (pb-4 → pb-44) but the scroll
  // position stays pinned where it was, briefly parking the last message
  // behind the banner until the user scrolls manually.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentAiText, currentTranscript, showNowSpeakBanner, showSilenceBanner, questionTimerExpired]);

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

  // Fullscreen exit — track UI state + ENFORCE fullscreen by force-muting the
  // mic while the overlay is shown. The proctoring monitor logs the
  // `fullscreen_exit` violation separately; this effect's job is to make sure
  // the candidate cannot keep answering questions behind the overlay (e.g. by
  // consulting an external reference) while fullscreen is off.
  //
  // Design:
  //   - Exit fullscreen → snapshot the previous mute state, force mute = true.
  //   - Re-enter fullscreen → restore the previous mute state.
  //
  // The overlay UI already blocks "end interview" / skip controls; the mic
  // mute closes the remaining audio-submission loophole.
  // Probe live mic/camera permission state. Returns a `mediaBlocked` descriptor
  // ONLY when the browser's Permissions API reports the permission as
  // "denied" — this is the authoritative OS-level revocation signal.
  //
  // We deliberately DO NOT inspect `mediaStreamRef` tracks here:
  //   - `mediaStreamRef` is the audio-only stream from startRecordingInternal
  //     (getUserMedia({audio:true}), no video). Checking getVideoTracks()
  //     against that stream always reports `length === 0` → false positive
  //     "camera revoked" after every Linda turn ended.
  //   - Between turns, the audio stream is torn down, so getAudioTracks()
  //     returns `ended` tracks → false positive "microphone revoked".
  //
  // Track-based revocation detection is still done — but by the dedicated
  // `track.onended` / `track.onmute` callbacks inside
  // useInterviewProctoringMonitor, which only run against the LIVE
  // tracks while they're expected to be live. Those paths already emit
  // `camera_disabled` / `microphone_disabled` events and flow to this
  // component's block overlay via the same `armMediaBlock` reducer if we
  // ever want to wire them together — for now, the probe stays
  // Permissions-API-only and avoids the stream-inspection false positives.
  const probeMediaPermissions = useCallback(async (): Promise<typeof mediaBlocked> => {
    let camDenied = false;
    let micDenied = false;
    try {
      const perms = (navigator as any).permissions;
      if (perms?.query) {
        try {
          const camStatus = await perms.query({ name: 'camera' as PermissionName });
          if (camStatus?.state === 'denied') camDenied = true;
        } catch { /* unsupported */ }
        try {
          const micStatus = await perms.query({ name: 'microphone' as PermissionName });
          if (micStatus?.state === 'denied') micDenied = true;
        } catch { /* unsupported */ }
      }
    } catch { /* ignore */ }
    if (camDenied && micDenied) return { kind: 'both', reason: 'camera_and_microphone_revoked' };
    if (camDenied) return { kind: 'camera', reason: 'camera_revoked' };
    if (micDenied) return { kind: 'microphone', reason: 'microphone_revoked' };
    return null;
  }, []);

  // Arm the terminal media-permission block. Fires a severe proctor event
  // so the recruiter sees it under Proctoring Violations, then freezes the
  // UI behind a blocking overlay.
  const armMediaBlock = useCallback((result: NonNullable<typeof mediaBlocked>, extraDetails?: Record<string, any>) => {
    if (mediaBlockedRef.current) return; // already armed — idempotent
    mediaBlockedRef.current = result;
    setMediaBlocked(result);
    setStatus("Camera / microphone access is required to continue.");
    // Force-mute and stop recording so no further audio can reach the backend.
    isMutedRef.current = true;
    setIsMuted(true);
    stopRecordingSilentRef.current();
    // Report as a severe proctoring violation (backend persists to
    // proctoring_events and surfaces it in the recruiter's results view).
    try {
      const eventType =
        result.kind === 'camera' ? 'camera_disabled' :
        result.kind === 'microphone' ? 'microphone_disabled' :
        'camera_disabled'; // "both" → log camera_disabled; microphone_disabled follows below
      candidateAIInterviewService.reportProctorEvent(token, {
        event_type: eventType,
        severity: 'severe',
        details: { reason: result.reason, phase: 'in_interview', ...(extraDetails || {}) },
      }).catch(() => { /* best-effort */ });
      if (result.kind === 'both') {
        candidateAIInterviewService.reportProctorEvent(token, {
          event_type: 'microphone_disabled',
          severity: 'severe',
          details: { reason: result.reason, phase: 'in_interview', ...(extraDetails || {}) },
        }).catch(() => { /* best-effort */ });
      }
    } catch { /* ignore */ }
  }, [token]);

  // Watchdog: poll the Permissions API + track health every 2 s during the
  // interview. If permission is revoked (candidate opened site-settings and
  // blocked camera/mic while the tab was in the background), arm the block
  // immediately — don't wait for the next mic-open attempt.
  useEffect(() => {
    if (!isConnected || mediaBlocked) return;
    let cancelled = false;
    // Every 10 s is plenty — permission revocation is a rare, user-initiated
    // action. Polling at 2 s was excessive and added main-thread work every
    // tick for an event that might never happen. The existing track.onended /
    // track.onmute listeners in useInterviewProctoringMonitor handle
    // synchronous revocation; this poll is just a safety net for browsers
    // that don't fire those events reliably.
    const iv = setInterval(async () => {
      if (cancelled || mediaBlockedRef.current) return;
      const result = await probeMediaPermissions();
      if (result) armMediaBlock(result, { source: 'watchdog' });
    }, 10000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [isConnected, mediaBlocked, probeMediaPermissions, armMediaBlock]);

  // Also run the probe once on connect so any permission that was revoked
  // BEFORE the interview UI mounted is caught before Linda even speaks.
  useEffect(() => {
    if (!isConnected) return;
    (async () => {
      const result = await probeMediaPermissions();
      if (result) armMediaBlock(result, { source: 'interview_entry' });
    })();
  }, [isConnected, probeMediaPermissions, armMediaBlock]);

  useEffect(() => {
    if (!isConnected) return;

    // Mute state held by the candidate at the moment fullscreen was lost,
    // so we can restore it when they return. null means "not currently in
    // an enforced-mute window".
    let preExitMuteState: boolean | null = null;
    // Wall-clock timestamp of when the pause started, so the paired
    // session_resumed proctor event can include the total pause duration.
    let pausedAtMs: number | null = null;
    // Grace period: if candidate returns to fullscreen within 10s, DON'T
    // fully pause the session — just log a minor violation and continue.
    // This prevents accidental Esc presses from killing ongoing interviews.
    // Professional interview platforms (HackerRank, HireVue) use this pattern.
    const GRACE_PERIOD_MS = 10000;
    let graceTimerId: ReturnType<typeof setTimeout> | null = null;
    let graceCountdownId: ReturnType<typeof setInterval> | null = null;
    let graceExitAtMs: number | null = null;

    const clearGrace = () => {
      if (graceTimerId !== null) { clearTimeout(graceTimerId); graceTimerId = null; }
      if (graceCountdownId !== null) { clearInterval(graceCountdownId); graceCountdownId = null; }
      setGracePeriodRemaining(null);
    };

    const executeHardPause = () => {
      // This is the OLD immediate-pause behavior, now run ONLY after the
      // grace period expires. Triggers: full stop of Linda's TTS, mic
      // muted, backend notified to pause silence watchers / timers.
      pausedAtMs = Date.now();
      frozenGlobalSecondsRef.current = remainingSeconds;
      frozenQuestionSecondsRef.current = questionTimerSecondsRef.current;
      candidateAIInterviewService.reportProctorEvent(token, {
        event_type: 'session_paused',
        severity: 'low',
        details: { reason: 'fullscreen_exit', paused_at: new Date().toISOString() },
      }).catch(() => { /* best-effort */ });
      try { talkingHeadRef.current?.streamStop(); } catch { /* ignore */ }
      isPlayingRef.current = false;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        try { wsRef.current.send(JSON.stringify({ type: 'session_pause', reason: 'fullscreen_exit' })); } catch { /* best-effort */ }
      }
      if (preExitMuteState === null) {
        preExitMuteState = isMutedRef.current;
      }
      if (!isMutedRef.current) {
        isMutedRef.current = true;
        setIsMuted(true);
      }
    };

    const handleFullscreenChange = async () => {
      if (!document.fullscreenElement) {
        // FULLSCREEN EXIT detected. Show overlay immediately (existing
        // behavior) but DO NOT hard-pause yet — give the candidate a 10s
        // grace window to return. Log the exit itself as a minor event now
        // (recruiter sees every exit regardless of recovery).
        setIsFullscreenExited(true);
        isFullscreenExitedRef.current = true;
        graceExitAtMs = Date.now();
        candidateAIInterviewService.reportProctorEvent(token, {
          event_type: 'fullscreen_exit',
          severity: 'low',
          details: { phase: 'in_interview', grace_period_ms: GRACE_PERIOD_MS },
        }).catch(() => { /* best-effort */ });
        // Arm the grace timer — if the candidate doesn't return in time,
        // escalate to the full pause.
        clearGrace();
        setGracePeriodRemaining(Math.ceil(GRACE_PERIOD_MS / 1000));
        graceCountdownId = setInterval(() => {
          if (graceExitAtMs === null) return;
          const left = Math.max(0, Math.ceil((GRACE_PERIOD_MS - (Date.now() - graceExitAtMs)) / 1000));
          setGracePeriodRemaining(left);
        }, 200);
        graceTimerId = setTimeout(() => {
          if (graceCountdownId !== null) { clearInterval(graceCountdownId); graceCountdownId = null; }
          setGracePeriodRemaining(null);
          graceTimerId = null;
          if (!document.fullscreenElement) executeHardPause();
        }, GRACE_PERIOD_MS);
      } else {
        // RETURNING TO FULLSCREEN.
        //
        // FAST PATH: if the grace timer is still armed, the candidate came
        // back within 10s — tear down the overlay WITHOUT hard-pausing.
        // Log a minor "recovered" violation for the recruiter timeline but
        // don't send session_pause / session_resume (they never paused).
        if (graceTimerId !== null) {
          clearGrace();
          const recoveredMs = graceExitAtMs !== null ? Date.now() - graceExitAtMs : null;
          graceExitAtMs = null;
          candidateAIInterviewService.reportProctorEvent(token, {
            event_type: 'fullscreen_exit_recovered',
            severity: 'low',
            details: {
              recovered_within_ms: recoveredMs,
              grace_period_ms: GRACE_PERIOD_MS,
            },
          }).catch(() => { /* best-effort */ });
          setIsFullscreenExited(false);
          isFullscreenExitedRef.current = false;
          return;
        }
        graceExitAtMs = null;
        // Before doing anything else, re-check mic/camera permission — if the
        // candidate blocked it while the browser UI was visible, arm the
        // media block NOW and log an additional proctor violation that the
        // block was attempted on resume (i.e. they clicked the button after
        // tampering with permissions).
        const probe = await probeMediaPermissions();
        if (probe) {
          armMediaBlock(probe, {
            source: 'fullscreen_resume',
            note: 'candidate revoked permission during fullscreen exit and attempted to resume',
          });
          // Leave the fullscreen-exit overlay torn down — the block overlay
          // takes over from here.
          setIsFullscreenExited(false);
          isFullscreenExitedRef.current = false;
          preExitMuteState = null;
          pausedAtMs = null;
          return;
        }
        // Compute how long the session was paused. Missing pausedAtMs (e.g.
        // because this handler is firing without a matching exit — shouldn't
        // happen but be defensive) falls back to null so the recruiter sees
        // "duration: null" and knows it's a partial record.
        const pauseDurationMs = pausedAtMs !== null ? Math.max(0, Date.now() - pausedAtMs) : null;
        const pauseDurationSec = pauseDurationMs !== null ? Math.round(pauseDurationMs / 1000) : null;
        // Record the session_resumed event with the paired duration so the
        // recruiter's violation timeline has a clean "paused → resumed" entry.
        candidateAIInterviewService.reportProctorEvent(token, {
          event_type: 'session_resumed',
          severity: 'low',
          details: {
            reason: 'fullscreen_returned',
            pause_duration_ms: pauseDurationMs,
            pause_duration_seconds: pauseDurationSec,
            resumed_at: new Date().toISOString(),
          },
        }).catch(() => { /* best-effort */ });
        pausedAtMs = null;
        setIsFullscreenExited(false);
        isFullscreenExitedRef.current = false;
        // Restore the timers from their frozen pre-exit values. The server
        // may have sent fresh `global_remaining_seconds` while we were
        // paused (from reconnect or a queued question_timer_started);
        // those would otherwise clobber the frozen value. Writing back
        // explicitly here keeps the UX promise: "timer maintains the time
        // across fullscreen exit".
        if (frozenGlobalSecondsRef.current !== null) {
          setRemainingSeconds(frozenGlobalSecondsRef.current);
        }
        if (frozenQuestionSecondsRef.current !== null) {
          setQuestionTimerSeconds(frozenQuestionSecondsRef.current);
          questionTimerSecondsRef.current = frozenQuestionSecondsRef.current;
        }
        frozenGlobalSecondsRef.current = null;
        frozenQuestionSecondsRef.current = null;
        // Unfreeze the backend — it can resume whatever flow it was in.
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          try { wsRef.current.send(JSON.stringify({ type: 'session_resume' })); } catch { /* best-effort */ }
        }
        // Restore whatever the candidate had before they exited fullscreen.
        if (preExitMuteState !== null) {
          isMutedRef.current = preExitMuteState;
          setIsMuted(preExitMuteState);
          preExitMuteState = null;
        }
      }
    };

    document.addEventListener(getFullscreenChangeEvent(), handleFullscreenChange);
    return () => {
      document.removeEventListener(getFullscreenChangeEvent(), handleFullscreenChange);
      // If the component unmounts mid-enforcement, make sure we don't leave
      // the mic stuck muted in some other downstream consumer that holds a
      // ref. setIsMuted is a no-op here (component gone) so just null out
      // the local pointer.
      preExitMuteState = null;
      clearGrace();
    };
  }, [isConnected, probeMediaPermissions, armMediaBlock, token]);

  // Copy-paste blocking is handled by useInterviewProctoringMonitor (copyPasteBlocking prop).
  // No duplicate listener needed here.

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
            <div className="text-sm text-amber-400 font-medium animate-pulse mb-5">Interview paused — please return to frame</div>
            <button
              onClick={() => {
                // Manually re-check: if face detection thinks the face is there, unblock
                if (faceDetection.isFaceDetectedRef.current) {
                  handleFaceRestored();
                } else {
                  // Give it one more chance — dismiss and let detection re-trigger if still missing
                  isFaceBlockedRef.current = false;
                  setIsFaceBlocked(false);
                  // If face is truly gone, detection loop will re-trigger face_missing in ~3s
                  if (!isAiSpeakingRef.current && !isProcessingRef.current && !isRecordingRef.current) {
                    setTimeout(() => {
                      if (wsRef.current?.readyState === WebSocket.OPEN && !isFaceBlockedRef.current) {
                        startRecordingInternal();
                      }
                    }, 500);
                  }
                }
              }}
              className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-gray-900 font-semibold rounded-lg transition-colors text-sm"
            >
              Retry Detection
            </button>
            <p className="text-xs text-gray-500 mt-2">
              This will auto-dismiss when your face is detected
            </p>
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

      {/* ── Silence detection banner (Req 14b) ──
          Shown when the backend's 8 s silence clock expires. Banner stays up
          while Linda says "Are you there?" and during the 5 s grace window
          that follows. Auto-skip is driven by the backend's question_timer_expired
          message — we do NOT run a local countdown here anymore, because that
          used to race with Linda's TTS and skip while she was still speaking. */}
      {showSilenceBanner && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[105] animate-in fade-in slide-in-from-bottom-3 duration-300">
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-[#F59E0B]/40 bg-[#0A1020]/95 backdrop-blur-xl shadow-2xl max-w-sm">
            <div className="w-2 h-2 rounded-full bg-[#F59E0B] animate-pulse shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-[#F59E0B] font-medium block" style={{ fontSize: 13 }}>
                Are you still there? Take your time — or say &quot;skip&quot;.
              </span>
              <span className="text-[#94a3b8] text-[11px]">
                Linda will nudge you, then move on if there's no response.
              </span>
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

      {/* ── "Now Speak" banner — shown when mic opens after Linda finishes speaking ──
          Bug C fix: also require candidatePlaybackEnded so the banner cannot
          surface while Linda is still audibly playing on the client (the
          classic Q1 cold-AudioContext race). */}
      {showNowSpeakBanner && candidatePlaybackEnded && !isAiSpeaking && !isProcessing && !questionTimerExpired && !showSilenceBanner && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[104] animate-in fade-in slide-in-from-bottom-4 duration-400">
          <div className="flex items-center gap-3 px-5 py-3 rounded-2xl border border-emerald-500/60 bg-[#0A1020]/95 backdrop-blur-xl shadow-2xl">
            {/* Pulsing mic icon */}
            <div className="relative shrink-0">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" strokeLinecap="round" />
                  <line x1="8" y1="23" x2="16" y2="23" strokeLinecap="round" />
                </svg>
              </div>
              <div className="absolute inset-0 rounded-full border-2 border-emerald-400 animate-ping opacity-60" />
            </div>
            <div>
              <span className="text-emerald-300 font-bold block" style={{ fontSize: 14 }}>Your turn — speak now</span>
              <span className="text-[#94a3b8] text-[11px]">Microphone is active · Linda is listening</span>
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

      {/* AIU40: Section transition overlay */}
      {sectionTransition && (
        <SectionTransitionOverlay
          message={sectionTransition.message}
          fromCluster={sectionTransition.fromCluster}
          toCluster={sectionTransition.toCluster}
          pauseSeconds={3}
          onComplete={() => setSectionTransition(null)}
        />
      )}

      {/* AIU72: Repeat-request overlay */}
      {showRepeatRequest && (
        <div className="fixed inset-0 z-[106] flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-3 px-5 py-3.5 rounded-2xl border border-blue-400/50 bg-[#0A1020]/95 backdrop-blur-xl shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
              <Mic className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <span className="text-blue-300 font-semibold block" style={{ fontSize: 14 }}>Could you repeat that?</span>
              <span className="text-[#94a3b8] text-[11px]">We had trouble hearing you clearly</span>
            </div>
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
            {/* Label row — REC badge and HAND RAISED badge removed per UX request.
                Only the "You" label remains. */}
            <div className="absolute top-0 left-0 right-0 z-10 px-3 pt-2.5 pb-1 flex items-center">
              <span className="text-gray-400 text-[11px] font-medium uppercase tracking-wide">You</span>
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
              {/* Per-question timer removed from header — shown as banner above chat */}
              {/* Global timer */}
              <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/15 border border-white/25">
                <Timer className="w-3 h-3 text-white/80" />
                <span className={`font-mono font-bold text-xs tabular-nums ${
                  !isFlexibleMode && !isInBuffer && remainingSeconds <= 60 ? 'text-red-200' :
                  isInBuffer ? 'text-amber-200' : 'text-white'
                }`}>{formatTime(remainingSeconds)}</span>
                {isFlexibleMode && <span className="text-white/55 text-[9px] font-semibold ml-0.5">REM</span>}
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


          {/* ── Per-question timer banner — shown above chat when timer is active ── */}
          {questionTimerSeconds !== null && (
            <div className={`flex-shrink-0 px-4 py-2.5 flex items-center gap-3 border-b transition-colors duration-500 ${
              questionTimerExpired       ? 'bg-red-50 border-red-200' :
              questionTimerSeconds <= 30 ? 'bg-red-50 border-red-200' :
              questionTimerSeconds <= 60 ? 'bg-amber-50 border-amber-200' :
                                           'bg-violet-50 border-violet-200'
            }`}>
              {/* Icon */}
              <Clock className={`w-4 h-4 shrink-0 ${
                questionTimerExpired || questionTimerSeconds <= 30 ? 'text-red-500' :
                questionTimerSeconds <= 60 ? 'text-amber-500' : 'text-violet-500'
              } ${questionTimerExpired ? 'animate-pulse' : ''}`} />

              {/* Label + time */}
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className={`text-xs font-semibold shrink-0 ${
                  questionTimerExpired || questionTimerSeconds <= 30 ? 'text-red-600' :
                  questionTimerSeconds <= 60 ? 'text-amber-600' : 'text-violet-600'
                }`}>
                  {questionTimerExpired ? "Time's up!" : isAiSpeaking ? 'Question time:' : isProcessing ? 'Answered:' : 'Answer time:'}
                </span>

                {/* Progress bar */}
                <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-gray-200">
                  {(() => {
                    // Use the initial duration from the timer start (matches backend candidate_window)
                    const total = questionTimerTotalRef.current || 120;
                    const pct = questionTimerExpired ? 0 : Math.min(100, (questionTimerSeconds / total) * 100);
                    return (
                      <div
                        className={`h-full rounded-full transition-[width] duration-1000 ${
                          questionTimerExpired || questionTimerSeconds <= 30 ? 'bg-red-500' :
                          questionTimerSeconds <= 60 ? 'bg-amber-500' : 'bg-violet-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    );
                  })()}
                </div>

                {/* Countdown value */}
                <span className={`text-sm font-bold tabular-nums shrink-0 ${
                  questionTimerExpired || questionTimerSeconds <= 30 ? 'text-red-600' :
                  questionTimerSeconds <= 60 ? 'text-amber-600' : 'text-violet-700'
                } ${questionTimerExpired ? 'animate-pulse' : ''}`}>
                  {questionTimerExpired ? 'TIME UP' : formatTime(questionTimerSeconds)}
                </span>
              </div>
              {/* Fix 2: subtitle explaining the reduced window. Only shown
                  when Linda's speech ate a meaningful chunk of the 2-min slot
                  (≥5s), to avoid noise on clean cases where her question was
                  short and the candidate effectively has the full window. */}
              {lindaSpokeSeconds !== null && fullSlotSeconds !== null && lindaSpokeSeconds >= 5 && (
                <div className="w-full pl-6 -mt-0.5 text-[10px] text-gray-500 leading-snug">
                  Linda used {lindaSpokeSeconds}s of the {fullSlotSeconds}s question slot — you have {questionTimerTotalRef.current}s to answer.
                </div>
              )}
            </div>
          )}

          {/* ── Buffer mode active banner ── */}
          {isInBuffer && !isClosing && (
            <div className="flex-shrink-0 px-4 py-2.5 flex items-center gap-3 bg-amber-50 border-b border-amber-200">
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold text-amber-700">Buffer Time Active</span>
                <span className="text-xs text-amber-600 ml-2">— {formatTime(remainingSeconds)} remaining. Wrapping up the interview.</span>
              </div>
            </div>
          )}

          {/* Chat messages.
              Dynamic bottom padding reserves space under the last message so
              any of the fixed-position, bottom-anchored banners ("Your turn",
              silence nudge, Time's Up) sit BELOW the conversation instead of
              covering its tail. Without this, the last Linda question or
              candidate response was hidden behind the emerald banner. */}
          <div
            className={`flex-1 overflow-y-auto px-4 pt-4 space-y-3 bg-gray-50 ${
              showNowSpeakBanner || showSilenceBanner || questionTimerExpired
                ? 'pb-44'
                : 'pb-4'
            }`}
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
                  /* ── Candidate response — teal/emerald ── */
                  <div className="flex gap-2 flex-row-reverse">
                    <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                      <span className="text-white text-[8px] font-bold">You</span>
                    </div>
                    <div className="max-w-[80%]">
                      {/* Label row: "Your Response" + frozen timer badge */}
                      <div className="flex items-center justify-end gap-2 mb-0.5">
                        <span className="text-[10px] font-semibold text-emerald-600">Your Response</span>
                        {msg.responseTimeSeconds != null && (
                          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold tabular-nums ${
                            msg.responseTimeSeconds <= 30
                              ? 'bg-red-100 text-red-600 border border-red-200'
                              : msg.responseTimeSeconds <= 60
                              ? 'bg-amber-100 text-amber-700 border border-amber-200'
                              : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                          }`}>
                            <Clock className="w-2.5 h-2.5" />
                            {formatTime(msg.responseTimeSeconds)} left
                          </span>
                        )}
                      </div>
                      <div className="px-3.5 py-2.5 bg-emerald-50 text-emerald-900 rounded-2xl rounded-tr-sm border border-emerald-200 shadow-sm">
                        <p className="text-sm leading-relaxed">{msg.content}</p>
                      </div>
                      {msg.timestamp && (
                        <p className="text-[10px] text-gray-400 mt-0.5 text-right">{msg.timestamp}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  /* ── AI question — violet/purple ── */
                  <div className="flex gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 shadow-sm mt-0.5" style={{ background: 'linear-gradient(135deg, #7c3aed, #ec4899)' }}>
                      <span className="text-white text-[8px] font-bold">L</span>
                    </div>
                    <div className="max-w-[80%]">
                      <span className="text-[10px] font-semibold text-purple-600 mb-0.5 block">LINDA</span>
                      <div className="px-3.5 py-2.5 bg-violet-50 text-violet-900 rounded-2xl rounded-tl-sm border border-violet-200 shadow-sm">
                        <p className="text-sm leading-relaxed">{msg.content}</p>
                      </div>
                      {msg.timestamp && (
                        <p className="text-[10px] text-gray-400 mt-0.5">{msg.timestamp}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Live speech transcript — teal (matches candidate bubble) */}
            {currentTranscript && (
              <div className="flex gap-2 flex-row-reverse">
                <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  <span className="text-white text-[8px] font-bold">You</span>
                </div>
                <div className="max-w-[80%]">
                  <span className="text-[10px] font-semibold text-emerald-600 mb-0.5 block text-right">Your Response</span>
                  <div className="px-3.5 py-2.5 bg-emerald-50 text-emerald-900 rounded-2xl rounded-tr-sm border border-emerald-200 shadow-sm">
                    <div className="flex items-center gap-1 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-emerald-600 text-[10px] font-medium">speaking…</span>
                    </div>
                    <p className="text-sm leading-relaxed italic">{currentTranscript}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Live AI text (streaming) — violet (matches AI bubble) */}
            {currentAiText && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 shadow-sm mt-0.5" style={{ background: 'linear-gradient(135deg, #7c3aed, #ec4899)' }}>
                  <span className="text-white text-[8px] font-bold">L</span>
                </div>
                <div className="max-w-[80%]">
                  <span className="text-[10px] font-semibold text-purple-600 mb-0.5 block">LINDA</span>
                  <div className="px-3.5 py-2.5 bg-violet-50 text-violet-900 rounded-2xl rounded-tl-sm border border-violet-200 shadow-sm">
                    <div className="flex items-center gap-1 mb-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <p className="text-sm leading-relaxed">{currentAiText}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Thinking dots — violet (matches AI bubble) */}
            {isProcessing && !currentAiText && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 shadow-sm mt-0.5" style={{ background: 'linear-gradient(135deg, #7c3aed, #ec4899)' }}>
                  <span className="text-white text-[8px] font-bold">L</span>
                </div>
                <div className="px-3.5 py-2.5 bg-violet-50 rounded-2xl rounded-tl-sm border border-violet-200 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-violet-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-violet-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-violet-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="flex-shrink-0 border-t border-gray-100 bg-white px-4 pt-3 pb-3">
            <div className="flex items-center justify-end gap-3">

              {/* Right: Recording indicator + Skip + Next Question */}
              <div className="flex items-center gap-2">
                {/* Recording badge */}
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-red-50 border border-red-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                  <span className="text-red-500 text-[11px] font-semibold">REC</span>
                </div>

                {/* Next Question button */}
                {isConnected && !isClosing && (
                  <button
                    disabled={questionTimerExpired || (questionNumber !== null && totalQuestions !== null && questionNumber >= totalQuestions)}
                    onClick={() => {
                      if (questionTimerExpired) return;
                      // Disable on last question — candidate must answer Q15/15, not skip it
                      if (questionNumber !== null && totalQuestions !== null && questionNumber >= totalQuestions) return;

                      // 0. If Linda is speaking, stop her immediately
                      if (isAiSpeakingRef.current) {
                        talkingHeadRef.current?.streamStop();
                        isPlayingRef.current = false;
                        isAiSpeakingRef.current = false;
                        setIsAiSpeaking(false);
                        setIsProcessing(false);
                        isProcessingRef.current = false;
                        avatarState.onAiStopSpeaking();
                        pendingBuffersRef.current = 0;
                        audioEndReceivedRef.current = false;
                        if (audioEndFallbackRef.current) { clearTimeout(audioEndFallbackRef.current); audioEndFallbackRef.current = null; }
                      }

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

                      // 5d. Clear follow-up flag immediately — next question is always fresh
                      setIsFollowUp(false);

                      // 5e. Optimistically clear is_active on all clusters/skills so the
                      //     coverage panel doesn't stay frozen showing the old "Active"
                      //     highlight during the gap before the backend sends skill_coverage_update.
                      setSkillCoverage(prev => {
                        if (!prev) return prev;
                        return {
                          ...prev,
                          clusters: prev.clusters?.map(c => ({
                            ...c,
                            is_active: false,
                            current_skill: undefined,
                            skills: c.skills.map(s => ({ ...s, is_active: false })),
                          })),
                        };
                      });

                      // 6. Dismiss silence banner if active
                      if (showSilenceBanner) {
                        setShowSilenceBanner(false);
                        setSilenceCountdown(null);
                        if (silenceCountdownRef.current) { clearInterval(silenceCountdownRef.current); silenceCountdownRef.current = null; }
                      }

                      // 7. Send skip — backend generates next Q
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
                      questionTimerExpiredRef.current = false;
                    }}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-all duration-200 ${
                      questionTimerExpired || (questionNumber !== null && totalQuestions !== null && questionNumber >= totalQuestions)
                        ? 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-200 text-gray-400'
                        : 'bg-white hover:bg-violet-50 border-violet-200 text-violet-700 hover:border-violet-400'
                    }`}
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                    {questionTimerExpired ? 'Skipping…' : (questionNumber !== null && totalQuestions !== null && questionNumber >= totalQuestions) ? 'Last Q' : 'Next Q'}
                  </button>
                )}
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

      {/* ── Fullscreen exit overlay — shows when candidate leaves fullscreen mid-interview ── */}
      {isFullscreenExited && isConnected && !isClosing && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-sm mx-4 bg-[#0F1929] border border-white/10 rounded-2xl shadow-2xl shadow-black/60 p-7 flex flex-col items-center gap-5">
            {/* Warning icon */}
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-amber-500/15 border border-amber-400/30">
              <Maximize className="w-6 h-6 text-amber-400" />
            </div>
            {/* Heading */}
            <div className="text-center">
              <h3 className="text-white font-semibold text-base mb-1">Fullscreen Required</h3>
              <p className="text-[#94A3B8] text-sm leading-relaxed">
                Your interview is still running. Please return to fullscreen to continue.
              </p>
            </div>
            {/* Grace-period countdown. Visible only while we're still within
                the 10s return window. Once it expires, this collapses and the
                UI falls through to the full "Interview paused" state. */}
            {gracePeriodRemaining !== null && (
              <div className="w-full rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-center">
                <span className="block text-[11px] font-semibold text-amber-200 uppercase tracking-wider mb-1">
                  Auto-pause in
                </span>
                <span className={`font-mono font-bold text-3xl tabular-nums ${
                  gracePeriodRemaining <= 3 ? 'text-red-300' : 'text-amber-200'
                }`}>
                  {gracePeriodRemaining}s
                </span>
                <span className="block text-[10px] text-amber-300/80 mt-1">
                  Return now to continue without interruption
                </span>
              </div>
            )}
            {/* Timer display */}
            <div className="w-full grid grid-cols-2 gap-3">
              {/* Global timer */}
              <div className="flex flex-col items-center gap-1 rounded-xl bg-white/5 border border-white/10 px-4 py-3">
                <span className="text-[10px] font-semibold text-[#64748B] uppercase tracking-widest">Interview Time</span>
                <span className={`font-mono font-bold text-xl tabular-nums ${remainingSeconds <= 60 ? 'text-red-400' : 'text-white'}`}>
                  {formatTime(remainingSeconds)}
                </span>
                <span className="text-[9px] text-[#475569] font-medium">remaining</span>
              </div>
              {/* Question timer */}
              <div className="flex flex-col items-center gap-1 rounded-xl bg-white/5 border border-white/10 px-4 py-3">
                <span className="text-[10px] font-semibold text-[#64748B] uppercase tracking-widest">Question Time</span>
                {questionTimerSeconds !== null ? (
                  <>
                    <span className={`font-mono font-bold text-xl tabular-nums ${
                      questionTimerExpired || questionTimerSeconds <= 30 ? 'text-red-400' :
                      questionTimerSeconds <= 60 ? 'text-amber-400' : 'text-violet-400'
                    }`}>
                      {questionTimerExpired ? 'TIME UP' : formatTime(questionTimerSeconds)}
                    </span>
                    {questionNumber !== null && totalQuestions !== null && (
                      <span className="text-[9px] text-[#475569] font-medium">Q {questionNumber} / {totalQuestions}</span>
                    )}
                  </>
                ) : (
                  <span className="font-mono font-bold text-xl tabular-nums text-[#475569]">--:--</span>
                )}
              </div>
            </div>
            {/* Return button. Clickable even if permission was revoked so the
                candidate can attempt the gesture — the fullscreen-change handler
                then re-probes permissions and arms the terminal block if they
                blocked camera/mic in the meantime. */}
            <button
              onClick={() => requestFullscreen(document.documentElement)}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25"
            >
              <Maximize className="w-4 h-4" />
              Return to Fullscreen
            </button>
          </div>
        </div>
      )}

      {/* ── Media-permission terminal block ──
          Shown the moment camera / mic permission is revoked or denied.
          Supersedes every other overlay (z-[300] > fullscreen overlay's z-[200]).
          The interview cannot resume from this state — the candidate must
          restore permissions AND restart the session from scratch, which
          matches the product rule "do not allow to start the interview again". */}
      {mediaBlocked && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 backdrop-blur-md">
          <div className="relative w-full max-w-md mx-4 bg-[#0F1929] border border-red-500/40 rounded-2xl shadow-2xl shadow-red-900/40 p-7 flex flex-col items-center gap-5">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-500/20 border border-red-400/40">
              <MicOff className="w-7 h-7 text-red-400" />
            </div>
            <div className="text-center">
              <h3 className="text-white font-semibold text-lg mb-1.5">
                {mediaBlocked.kind === 'camera' && 'Camera access blocked'}
                {mediaBlocked.kind === 'microphone' && 'Microphone access blocked'}
                {mediaBlocked.kind === 'both' && 'Camera & microphone access blocked'}
              </h3>
              <p className="text-[#cbd5e1] text-sm leading-relaxed">
                Your interview has been suspended because the required
                {' '}
                {mediaBlocked.kind === 'both'
                  ? 'camera and microphone permissions were'
                  : `${mediaBlocked.kind} permission was`}
                {' '}revoked.
              </p>
              <p className="text-[#94a3b8] text-xs leading-relaxed mt-3">
                This action has been logged as a proctoring violation.
                You cannot resume this session. Please close this tab and
                contact your recruiter if this was accidental.
              </p>
            </div>
            <div className="w-full text-center text-[11px] text-red-300/80 border border-red-500/20 rounded-lg bg-red-500/5 px-3 py-2">
              Interview session ended
            </div>
          </div>
        </div>
      )}

      <InterviewProctoringWarnings />

      {/* TESTER MUTE DOT — small button in bottom-right, subtle for real
          candidates but findable for QA. Click to toggle mic mute for silence
          scenarios ("Are you there?" trigger, VAD testing). Red = muted,
          gray ring = live. Size bumped from 8px → 14px so testers can find
          it; still easy to miss at a glance unless you know to look. */}
      {isConnected && !isClosing && (
        <button
          onClick={toggleMute}
          title={isMuted ? "MUTED — click to unmute mic" : "MIC LIVE — click to mute"}
          aria-label="Tester mute toggle"
          className="fixed bottom-2 right-2 z-[400] rounded-full transition-all duration-200 flex items-center justify-center"
          style={{
            width: "14px",
            height: "14px",
            background: isMuted ? "#ef4444" : "rgba(148, 163, 184, 0.35)",
            border: isMuted ? "1px solid #fca5a5" : "1px solid rgba(148, 163, 184, 0.5)",
            boxShadow: isMuted ? "0 0 10px rgba(239, 68, 68, 0.8)" : "0 0 4px rgba(148, 163, 184, 0.3)",
            cursor: "pointer",
          }}
        >
          {isMuted && <span style={{ color: "white", fontSize: "8px", fontWeight: "bold", lineHeight: 1 }}>M</span>}
        </button>
      )}
    </>
  );
}
